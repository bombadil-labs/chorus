// The encrypted private store (task 16, constellation Phase B): a sqlite-family backend whose
// file is CIPHERTEXT at rest. Decrypt-in-memory only; the key is a labeled child of the master
// seed (the identity.ts scheme — the master holder can always re-derive it, nobody else can).
//
// The leak model, stated honestly (and proven by test, not promised):
//   - Encrypted per row: the canonical claims JSON (beliefs, attributes, values, timestamps,
//     authors' payloads) — AES-256-GCM, fresh nonce per row, id bound as AAD so rows can't be
//     swapped between deltas.
//   - Plaintext at rest: delta ids (content hashes), signatures (over ciphertext-irrelevant
//     canonical bytes), row order (arrival), and the row COUNT. A leaked file says how much you
//     know and when it arrived — never what.
//   - NO pointer index, deliberately: indexing targets/values would write structure in the
//     clear. A private store trades indexed reads for opacity; reads are full-scan + decrypt,
//     which is the honest price at private-store scale.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { DeltaSet, claimsToJson, makeDelta, parseClaims, type Delta } from "@bombadil/rhizomatic";
import type { ChorusAgent } from "./agent.js";
import type { StoreBackend } from "./store-tier.js";
import type { SqliteDriver, SqliteDriverStatement } from "./sqlite-core.js";
import { deriveSeed } from "./identity.js";

// The store's at-rest key: a labeled child of the master seed, distinct per store name.
export const storeKeyHex = (masterSeedHex: string, name: string): string =>
  deriveSeed(masterSeedHex, `store-key/${name}`);

interface Row {
  readonly seq: number;
  readonly id: string;
  readonly nonce: string; // hex, 12 bytes
  readonly box: string; // hex, ciphertext || gcm tag
  readonly sig: string | null;
}

export class EncryptedSqliteStore implements StoreBackend {
  private readonly db: SqliteDriver;
  private readonly key: Buffer;
  private lastSeq = 0;
  private readonly onDisk = new Set<string>();
  private readonly insert: SqliteDriverStatement;
  private readonly selectSince: SqliteDriverStatement;
  private readonly selectAll: SqliteDriverStatement;

  constructor(
    readonly filePath: string,
    keyHex: string,
    openDriver: (path: string) => SqliteDriver,
  ) {
    if (!/^[0-9a-f]{64}$/.test(keyHex)) {
      throw new Error("encrypted store: the key must be 64 hex chars (32 bytes)");
    }
    this.key = Buffer.from(keyHex, "hex");
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = openDriver(filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA synchronous = NORMAL");
    // deltas only — NO pointer table (see the leak model above).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enc_deltas (
        seq   INTEGER PRIMARY KEY AUTOINCREMENT,
        id    TEXT NOT NULL UNIQUE,
        nonce TEXT NOT NULL,
        box   TEXT NOT NULL,
        sig   TEXT
      );
    `);
    this.insert = this.db.prepare(
      "INSERT OR IGNORE INTO enc_deltas (id, nonce, box, sig) VALUES (?, ?, ?, ?)",
    );
    this.selectSince = this.db.prepare(
      "SELECT seq, id, nonce, box, sig FROM enc_deltas WHERE seq > ? ORDER BY seq",
    );
    this.selectAll = this.db.prepare(
      "SELECT seq, id, nonce, box, sig FROM enc_deltas ORDER BY seq",
    );
  }

  private seal(d: Delta): { nonce: string; box: string } {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(d.id, "utf8")); // bind ciphertext to its delta id
    const body = Buffer.concat([
      cipher.update(JSON.stringify(claimsToJson(d.claims)), "utf8"),
      cipher.final(),
    ]);
    return {
      nonce: nonce.toString("hex"),
      box: Buffer.concat([body, cipher.getAuthTag()]).toString("hex"),
    };
  }

  private open(row: Row): Delta {
    const raw = Buffer.from(row.box, "hex");
    const body = raw.subarray(0, raw.length - 16);
    const tag = raw.subarray(raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.nonce, "hex"));
    decipher.setAAD(Buffer.from(row.id, "utf8"));
    decipher.setAuthTag(tag);
    let json: string;
    try {
      json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      throw new Error(
        `encrypted store ${this.filePath}: decryption failed — wrong master seed, or a ` +
          `tampered file. Nothing was modified.`,
      );
    }
    return makeDelta(parseClaims(JSON.parse(json)), row.sig ?? undefined);
  }

  private rows(stmt: SqliteDriverStatement, ...args: (string | number)[]): Row[] {
    return stmt.all(...args) as unknown as Row[];
  }

  appendDeltas(deltas: Iterable<Delta>): number {
    const fresh: Delta[] = [];
    const seen = new Set<string>();
    for (const d of deltas) {
      if (this.onDisk.has(d.id) || seen.has(d.id)) continue;
      seen.add(d.id);
      fresh.push(d);
    }
    if (fresh.length === 0) return 0;
    const stored: string[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const d of fresh) {
        const { nonce, box } = this.seal(d);
        const info = this.insert.run(d.id, nonce, box, d.sig ?? null);
        if (Number(info.changes) > 0) stored.push(d.id);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      throw err;
    }
    for (const id of stored) this.onDisk.add(id);
    return stored.length;
  }

  deltasSince(knownIds: ReadonlySet<string>): Delta[] {
    const out: Delta[] = [];
    for (const row of this.rows(this.selectAll)) {
      if (knownIds.has(row.id)) continue;
      out.push(this.open(row));
    }
    return out;
  }

  refresh(agent: ChorusAgent): number {
    const rows = this.rows(this.selectSince, this.lastSeq);
    if (rows.length === 0) return 0;
    const arrived: Delta[] = [];
    for (const row of rows) {
      if (row.seq > this.lastSeq) this.lastSeq = row.seq;
      this.onDisk.add(row.id);
      arrived.push(this.open(row));
    }
    return agent.importSet(DeltaSet.from(arrived)).accepted;
  }

  persist(agent: ChorusAgent): number {
    this.refresh(agent);
    const mine = agent.peer.reactor.arrivalLog().filter((d) => !this.onDisk.has(d.id));
    return this.appendDeltas(mine);
  }

  close(): void {
    this.db.close();
  }
}
