// The node:sqlite backend: the third witness to the `StoreBackend` interface (store-tier.ts), and
// the default where it can be — SQLite compiled into Node itself (v22.5+, unflagged v22.13+, RC
// stability on 24 LTS), so the default install of a global CLI carries no native dependency and
// nothing that can fail at `npm i -g`. Same on-disk format, schema, and WAL semantics as the
// better-sqlite3 tier (sqlite-store.ts): the two drivers open each other's files interchangeably;
// better-sqlite3 remains the opt-in throughput tier.
//
// The port differs from sqlite-store.ts only where the driver APIs differ: `node:sqlite` has no
// transaction helper (BEGIN IMMEDIATE/COMMIT by hand), no `.pragma()` sugar (PRAGMA via exec), and
// is loaded lazily via createRequire — this module must import cleanly on Nodes that predate it,
// so availability is a runtime question (`nodeSqliteAvailable`), never an import-time crash.

import { createRequire } from "node:module";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import {
  DeltaSet,
  claimsToJson,
  makeDelta,
  parseClaims,
  viewCanonicalHex,
  type Delta,
  type Primitive,
} from "@rhizomes/rhizomatic";
import type { ChorusAgent } from "./agent.js";
import type { StoreBackend } from "./store-tier.js";

// Resolve the builtin lazily, memoized: `null` = probed and absent (pre-22.5 Node). Lazy matters
// beyond startup cost — on 22.5–23.x the require emits an ExperimentalWarning to stderr, and a
// process pinned to jsonl or better-sqlite3 should never pay that just for importing the barrel.
let probed: typeof import("node:sqlite") | null | undefined;
function nodeSqliteModule(): typeof import("node:sqlite") | undefined {
  if (probed === undefined) {
    try {
      probed = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    } catch {
      probed = null;
    }
  }
  return probed ?? undefined;
}

export function nodeSqliteAvailable(): boolean {
  return nodeSqliteModule() !== undefined;
}

interface DeltaRow {
  readonly seq: number;
  readonly id: string;
  readonly claims: string;
  readonly sig: string | null;
}

export class NodeSqliteStore implements StoreBackend {
  private readonly db: DatabaseSync;
  // refresh's cursor: every row with seq <= lastSeq has been read into this instance's agent.
  // SQLite serializes writers, so AUTOINCREMENT seq commits in order — no out-of-order gap can
  // sneak in below the cursor. (Same reasoning as sqlite-store.ts.)
  private lastSeq = 0;
  // Ids known durable (read or written by us): the cheap fast-path; UNIQUE(id) is the real guard.
  private readonly onDisk = new Set<string>();

  private readonly insertDelta: StatementSync;
  private readonly insertPointer: StatementSync;
  private readonly selectSince: StatementSync;
  private readonly selectAll: StatementSync;
  private readonly selectByTarget: StatementSync;
  private readonly selectByValue: StatementSync;

  constructor(readonly filePath: string) {
    const nodeSqlite = nodeSqliteModule();
    if (!nodeSqlite) {
      throw new Error(
        `the "node-sqlite" backend needs Node's built-in node:sqlite module (Node >= 22.13; ` +
          `this is ${process.version}). Upgrade Node, or install the optional better-sqlite3 ` +
          `dependency (identical file format). Use "jsonl" only for a NEW store — never point ` +
          `the JSONL backend at an existing SQLite file.`,
      );
    }
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new nodeSqlite.DatabaseSync(filePath);
    // WAL + busy timeout + NORMAL syncs: identical posture (and identical resulting file) to the
    // better-sqlite3 tier — concurrent processes wait their turn; a crash loses at most the last
    // uncommitted txn, which the CRDT tolerates.
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deltas (
        seq    INTEGER PRIMARY KEY AUTOINCREMENT,
        id     TEXT NOT NULL UNIQUE,
        claims TEXT NOT NULL,
        sig    TEXT
      );
      CREATE TABLE IF NOT EXISTS pointers (
        delta_id  TEXT NOT NULL,
        role      TEXT NOT NULL,
        target_id TEXT,
        value_key TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pointers_target ON pointers(target_id);
      CREATE INDEX IF NOT EXISTS idx_pointers_role_value ON pointers(role, value_key);
    `);

    this.insertDelta = this.db.prepare(
      "INSERT OR IGNORE INTO deltas (id, claims, sig) VALUES (?, ?, ?)",
    );
    this.insertPointer = this.db.prepare(
      "INSERT INTO pointers (delta_id, role, target_id, value_key) VALUES (?, ?, ?, ?)",
    );
    this.selectSince = this.db.prepare(
      "SELECT seq, id, claims, sig FROM deltas WHERE seq > ? ORDER BY seq",
    );
    this.selectAll = this.db.prepare("SELECT seq, id, claims, sig FROM deltas ORDER BY seq");
    this.selectByTarget = this.db.prepare(
      "SELECT DISTINCT d.seq, d.id, d.claims, d.sig FROM deltas d " +
        "JOIN pointers p ON p.delta_id = d.id WHERE p.target_id = ? ORDER BY d.seq",
    );
    this.selectByValue = this.db.prepare(
      "SELECT DISTINCT d.seq, d.id, d.claims, d.sig FROM deltas d " +
        "JOIN pointers p ON p.delta_id = d.id WHERE p.role = ? AND p.value_key = ? ORDER BY d.seq",
    );
  }

  // The write path as one IMMEDIATE transaction: the write lock up front, inserts + pointer-index
  // rows committing atomically, concurrent writers waiting. node:sqlite has no transaction
  // helper, so the BEGIN/COMMIT/ROLLBACK discipline is explicit.
  private appendTxn(deltas: readonly Delta[]): number {
    const stored: string[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const d of deltas) {
        const info = this.insertDelta.run(
          d.id,
          JSON.stringify(claimsToJson(d.claims)),
          d.sig ?? null,
        );
        if (Number(info.changes) > 0) {
          this.indexPointers(d);
          stored.push(d.id);
        }
      }
      this.db.exec("COMMIT");
    } catch (err) {
      // Some failures (SQLITE_FULL/IOERR/NOMEM) auto-roll-back, making this ROLLBACK itself
      // throw "no transaction is active" — swallow that so the ORIGINAL error propagates.
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      throw err;
    }
    // Mark durable only AFTER the commit: ids marked inside a rolled-back transaction would make
    // every future persist() skip those deltas as already-stored — silent data loss on retry.
    for (const id of stored) this.onDisk.add(id);
    return stored.length;
  }

  private indexPointers(d: Delta): void {
    for (const ptr of d.claims.pointers) {
      if (ptr.target.kind === "entity") {
        this.insertPointer.run(d.id, ptr.role, ptr.target.entity.id, null);
      } else if (ptr.target.kind === "primitive") {
        this.insertPointer.run(d.id, ptr.role, null, viewCanonicalHex(ptr.target.value));
      }
      // delta-targets (negation/revises/…) are not indexed — same choice as sqlite-store.ts.
    }
  }

  private rehydrate(row: DeltaRow): Delta {
    return makeDelta(parseClaims(JSON.parse(row.claims)), row.sig ?? undefined);
  }

  // The one audited bridge from node:sqlite's untyped rows to DeltaRow — every SELECT here names
  // exactly (seq, id, claims, sig).
  private rows(stmt: StatementSync, ...args: (string | number)[]): DeltaRow[] {
    return stmt.all(...args) as unknown as DeltaRow[];
  }

  // --- the delta-level primitive (store-tier.ts) -------------------------------------------------

  appendDeltas(deltas: Iterable<Delta>): number {
    const fresh: Delta[] = [];
    const seen = new Set<string>();
    for (const d of deltas) {
      if (this.onDisk.has(d.id) || seen.has(d.id)) continue;
      seen.add(d.id);
      fresh.push(d);
    }
    if (fresh.length === 0) return 0;
    return this.appendTxn(fresh);
  }

  deltasSince(knownIds: ReadonlySet<string>): Delta[] {
    const out: Delta[] = [];
    for (const row of this.rows(this.selectAll)) {
      if (knownIds.has(row.id)) continue;
      out.push(this.rehydrate(row));
    }
    return out;
  }

  // --- indexed reads (mirror the reactor's targetIndex / valueIndex) -----------------------------

  deltasByTarget(entityId: string): Delta[] {
    return this.rows(this.selectByTarget, entityId).map((r) => this.rehydrate(r));
  }

  deltasByValue(role: string, value: Primitive): Delta[] {
    return this.rows(this.selectByValue, role, viewCanonicalHex(value)).map((r) =>
      this.rehydrate(r),
    );
  }

  // --- agent-sync ergonomics ---------------------------------------------------------------------

  refresh(agent: ChorusAgent): number {
    const rows = this.rows(this.selectSince, this.lastSeq);
    if (rows.length === 0) return 0;
    const arrived: Delta[] = [];
    for (const row of rows) {
      if (row.seq > this.lastSeq) this.lastSeq = row.seq;
      const d = this.rehydrate(row);
      this.onDisk.add(d.id);
      arrived.push(d);
    }
    return agent.importSet(DeltaSet.from(arrived)).accepted;
  }

  persist(agent: ChorusAgent): number {
    // Converge concurrent writers into the agent first (union), then store the difference.
    this.refresh(agent);
    const mine = agent.peer.reactor.arrivalLog().filter((d) => !this.onDisk.has(d.id));
    return this.appendDeltas(mine);
  }

  close(): void {
    this.db.close();
  }
}
