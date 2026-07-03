// The node:sqlite driver for the ONE SQLite store (sqlite-core.ts) — the default wherever
// Node ships the builtin (v22.5+, unflagged v22.13+, RC on 24 LTS): zero install surface, so a
// global install can never fail on it. Resolved lazily and memoized — lazy matters beyond
// startup cost: on 22.5–23.x the require emits an ExperimentalWarning to stderr, and a process
// pinned to jsonl or better-sqlite3 should never pay that for importing the barrel. All store
// logic, schema, and write discipline live in the core — this file is only the driver seam.

import { createRequire } from "node:module";
import { SqliteCoreStore, type SqliteDriver } from "./sqlite-core.js";

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

// The raw driver, for backends that compose differently (the encrypted store).
export function openNodeSqliteDriver(path: string): SqliteDriver {
  const mod = nodeSqliteModule();
  if (!mod) {
    throw new Error(
      `the "node-sqlite" backend needs Node's built-in node:sqlite module (Node >= 22.13; ` +
        `this is ${process.version}). Upgrade Node, or install the optional better-sqlite3 ` +
        `dependency (identical file format). Use "jsonl" only for a NEW store — never ` +
        `point the JSONL backend at an existing SQLite file.`,
    );
  }
  return new mod.DatabaseSync(path);
}

export class NodeSqliteStore extends SqliteCoreStore {
  constructor(filePath: string) {
    super(filePath, openNodeSqliteDriver);
  }
}
