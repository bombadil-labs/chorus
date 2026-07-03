// The better-sqlite3 driver for the ONE SQLite store (sqlite-core.ts) — the opt-in native
// throughput tier. better-sqlite3 is an OPTIONAL dependency (a native addon must never be able
// to fail a default `npm i -g`), so it resolves lazily and memoized: `null` = probed and
// absent. Importing this module never throws; constructing without the addon fails loudly with
// the way out. All store logic, schema, and write discipline live in the core — this file is
// only the driver seam.

import type Database from "better-sqlite3";
import { createRequire } from "node:module";
import { SqliteCoreStore, type SqliteDriver } from "./sqlite-core.js";

let probed: typeof Database | null | undefined;
function betterSqliteModule(): typeof Database | undefined {
  if (probed === undefined) {
    try {
      probed = createRequire(import.meta.url)("better-sqlite3") as typeof Database;
    } catch {
      probed = null;
    }
  }
  return probed ?? undefined;
}

export function betterSqliteAvailable(): boolean {
  return betterSqliteModule() !== undefined;
}

// The raw driver, for backends that compose differently (the encrypted store). Explicit
// adapter: better-sqlite3's generic Statement typings don't line up structurally, and the seam
// deserves to be visible anyway.
export function openBetterSqliteDriver(path: string): SqliteDriver {
  const Db = betterSqliteModule();
  if (!Db) {
    throw new Error(
      `the "sqlite" backend needs the optional native dependency better-sqlite3, which is ` +
        `not installed (its build may have been skipped). Use the "node-sqlite" backend ` +
        `(built into Node >= 22.13), or install better-sqlite3. Use "jsonl" only for a NEW ` +
        `store — never point the JSONL backend at an existing SQLite file.`,
    );
  }
  const db = new Db(path);
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params) => stmt.run(...params),
        all: (...params) => stmt.all(...params),
      };
    },
    close: () => {
      db.close();
    },
  };
}

export class SqliteStore extends SqliteCoreStore {
  constructor(filePath: string) {
    super(filePath, openBetterSqliteDriver);
  }
}
