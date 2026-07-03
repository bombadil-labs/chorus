// The ONE SQLite store implementation, parameterized over a minimal driver seam. Two drivers
// wrap it — better-sqlite3 (sqlite-store.ts) and node:sqlite (node-sqlite-store.ts) — and both
// MUST produce byte-identical files: the schema, pragmas, SQL, and write discipline live HERE,
// in exactly one place, because a change applied to one driver but not the other would silently
// fork the on-disk format. (This core exists because the two stores began as a ~170-line
// copy-pair; the interop tests guard the property, this file removes the way to break it.)
//
// The store logic is the proven design from the original better-sqlite3 tier: one deltas table
// keyed by content-addressed id (UNIQUE = the CRDT dedup), a pointer index for the reverse-
// adjacency reads, WAL + busy-timeout for multi-process convergence, and an IMMEDIATE
// transaction per append batch. onDisk is marked only AFTER commit — a rollback undoes rows,
// never a Set, and ids marked durable-but-rolled-back would make persist() skip them forever.

import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
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

// What a driver must provide — deliberately the intersection of better-sqlite3 and node:sqlite,
// positional parameters only.
export interface SqliteDriverStatement {
  run(...params: (string | number | null)[]): { changes: number | bigint };
  all(...params: (string | number)[]): unknown[];
}
export interface SqliteDriver {
  exec(sql: string): void;
  prepare(sql: string): SqliteDriverStatement;
  close(): void;
}

interface DeltaRow {
  readonly seq: number;
  readonly id: string;
  readonly claims: string;
  readonly sig: string | null;
}

export abstract class SqliteCoreStore implements StoreBackend {
  private readonly db: SqliteDriver;
  // refresh's cursor: every row with seq <= lastSeq has been read into this instance's agent.
  // SQLite serializes writers, so AUTOINCREMENT seq commits in order — no out-of-order gap can
  // sneak in below the cursor.
  private lastSeq = 0;
  // Ids known durable (read or written by us): the cheap fast-path; UNIQUE(id) is the real guard.
  private readonly onDisk = new Set<string>();

  private readonly insertDelta: SqliteDriverStatement;
  private readonly insertPointer: SqliteDriverStatement;
  private readonly selectSince: SqliteDriverStatement;
  private readonly selectAll: SqliteDriverStatement;
  private readonly selectByTarget: SqliteDriverStatement;
  private readonly selectByValue: SqliteDriverStatement;

  protected constructor(
    readonly filePath: string,
    openDriver: (path: string) => SqliteDriver,
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = openDriver(filePath);
    // WAL + busy timeout + NORMAL syncs: concurrent processes wait their turn; a crash loses at
    // most the last uncommitted txn, which the CRDT tolerates (the peer re-sends).
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

  // One IMMEDIATE transaction per batch: the write lock up front, inserts + pointer-index rows
  // committing atomically, concurrent writers waiting. Explicit BEGIN/COMMIT/ROLLBACK — the
  // lowest common denominator both drivers speak identically.
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
    // Mark durable only AFTER the commit (see the header).
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
      // delta-targets (negation/revises/…) are not indexed — the reverse-adjacency reads this
      // tier accelerates are over entity targets and primitive values.
    }
  }

  private rehydrate(row: DeltaRow): Delta {
    return makeDelta(parseClaims(JSON.parse(row.claims)), row.sig ?? undefined);
  }

  // The one audited bridge from driver-untyped rows to DeltaRow — every SELECT here names
  // exactly (seq, id, claims, sig).
  private rows(stmt: SqliteDriverStatement, ...args: (string | number)[]): DeltaRow[] {
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
