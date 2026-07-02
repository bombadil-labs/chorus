// The persistence seam. Chorus persists a grow-only set of content-addressed, signed deltas;
// correctness rides the CRDT (merge is union, any interleaving converges), so a backend is
// correct by construction as long as it preserves "a set of deltas, deduped by id." That makes
// persistence PLUGGABLE: the interface is the asset, the backends are interchangeable witnesses
// to it — the same posture the repo takes toward the format itself.
//
// The shape is deliberately the FEDERATION-SYNC shape (spec/11-federation-as-query.NOTE.md): a
// grow-only signed log makes durable persistence and remote sync the same primitive — append
// (idempotent by id) and "give me the deltas since a watermark." The one forward concession to
// closure-scoped federation reads is that `deltasSince` is shaped to grow a closure argument
// additively later, never a rewrite.
//
// Naming (spec/12 §3): this interface is the persistence BACKEND. The product-level unit a user
// calls a "store" — a named, keyed, federating instance — is `Store` (stores.ts), which wraps a
// `StoreBackend`. Interface renamed from `Store` → `StoreBackend` so the domain word is free.

import { closeSync, existsSync, openSync, readSync } from "node:fs";
import type { Delta } from "@rhizomes/rhizomatic";
import type { ChorusAgent } from "./agent.js";
import { JsonlStore } from "./shared-store.js";
import { SqliteStore } from "./sqlite-store.js";
import { NodeSqliteStore, nodeSqliteAvailable } from "./node-sqlite-store.js";

export interface StoreBackend {
  // --- the delta-level primitive: durable append + read-since-watermark ---------------------
  // Both halves are idempotent / order-free, exactly like the CRDT they persist. This pair is
  // the LOCAL persistence primitive and the REMOTE sync primitive at once; `refresh`/`persist`
  // are thin agent-aware layers over it.

  // Durably store every supplied delta the store does not already hold. Idempotent by id.
  // Returns the count newly stored.
  appendDeltas(deltas: Iterable<Delta>): number;

  // Every durably-stored delta whose id is NOT in `knownIds` — the watermark read. The watermark
  // is a set of ids (order-free), so a derived emission seen mid-sync is never skipped.
  deltasSince(knownIds: ReadonlySet<string>): Delta[];

  // --- agent-sync ergonomics -----------------------------------------------------------------

  // Pull everything durably stored that the agent's reactor does not yet hold, ingesting it
  // host-aware (so derived authors react). Returns the count accepted.
  refresh(agent: ChorusAgent): number;

  // Durably append every delta the agent holds that the store does not. Concurrency-safe:
  // converge with any concurrent writers first (union), then add the difference. Returns count.
  persist(agent: ChorusAgent): number;

  // --- indexed reads (optional; the SQLite tier's reason to exist) ---------------------------
  // Mirror the reactor's targetIndex / valueIndex without scanning the whole surviving set.
  // The same indexes a later closure-scoped federation read will lean on (spec/11 §4).

  // Stored deltas with a pointer targeting this entity id.
  deltasByTarget?(entityId: string): Delta[];
  // Stored deltas with a primitive pointer under `role` whose canonical key equals `valueKey`.
  deltasByValue?(role: string, valueKey: string): Delta[];

  // --- maintenance (a JSONL artifact; SQLite no-ops or VACUUMs) ------------------------------
  wasteful?(agent: ChorusAgent): boolean;
  compact?(agent: ChorusAgent): number;

  // Release any held resources (an open DB handle). JSONL holds none; SQLite closes its file.
  close?(): void;
}

// --- backend selection ------------------------------------------------------------------------

// Three witnesses to one contract. `node-sqlite` (Node's built-in SQLite, v22.13+) is the default
// wherever it exists: zero install surface, same file format + WAL semantics as `sqlite`
// (better-sqlite3), which stays as the opt-in throughput tier. `jsonl` is the legible,
// git-diffable dev tier — and the fallback default on Nodes that predate node:sqlite, so nothing
// here ever fails at import or install time. `node-sqlite` and `sqlite` open each other's files
// interchangeably; the choice is a driver, not a format.
export type BackendKind = "jsonl" | "sqlite" | "node-sqlite";

const BACKENDS: readonly BackendKind[] = ["jsonl", "sqlite", "node-sqlite"];

// The default when nothing is pinned: the built-in driver if this Node has it, else JSONL.
// Deliberately NOT better-sqlite3 — the default must never depend on a native module's presence.
export function defaultBackendKind(): BackendKind {
  return nodeSqliteAvailable() ? "node-sqlite" : "jsonl";
}

export function backendFromEnv(env: NodeJS.ProcessEnv = process.env): BackendKind {
  const raw = (env["CHORUS_STORE_BACKEND"] ?? defaultBackendKind()).toLowerCase();
  if ((BACKENDS as readonly string[]).includes(raw)) return raw as BackendKind;
  throw new Error(
    `CHORUS_STORE_BACKEND="${raw}" is not a known backend (expected: ${BACKENDS.join(" | ")})`,
  );
}

// Every SQLite database file begins with these 16 bytes; everything Chorus ever wrote that
// doesn't is the JSONL log. Reading the header is the ONLY honest continuity signal on the
// path-based surface — filenames lie (the old unconditional-jsonl default wrote JSONL to any
// name), and "any version of Chorus must read any store it ever wrote" (CLAUDE.md).
const SQLITE_HEADER = "SQLite format 3\u0000";
function sniffExistingKind(path: string): BackendKind | undefined {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return undefined; // absent or unreadable → fresh-path rules apply
  }
  try {
    const head = Buffer.alloc(16);
    const n = readSync(fd, head, 0, 16, 0);
    if (n === 0) return undefined; // empty file → fresh-path rules apply
    return head.toString("latin1", 0, n) === SQLITE_HEADER
      ? nodeSqliteAvailable()
        ? "node-sqlite"
        : "sqlite"
      : "jsonl";
  } finally {
    closeSync(fd);
  }
}

// The kind for a bare path on the PATH-BASED surface (env vars, HTTP/console options — anywhere
// without a registry manifest to pin the kind). In order: an explicit CHORUS_STORE_BACKEND always
// wins; an EXISTING file is detected by content (SQLite header vs JSONL text — never by name);
// a fresh path goes by extension, then the availability-aware default. Registry stores never come
// through here — their manifest records the kind at creation.
export function backendForPath(path: string, env: NodeJS.ProcessEnv = process.env): BackendKind {
  if (env["CHORUS_STORE_BACKEND"] !== undefined) return backendFromEnv(env);
  const sniffed = sniffExistingKind(path);
  if (sniffed !== undefined) return sniffed;
  const lower = path.toLowerCase();
  if (lower.endsWith(".jsonl")) return "jsonl";
  if (lower.endsWith(".sqlite") || lower.endsWith(".db")) {
    return nodeSqliteAvailable() ? "node-sqlite" : "sqlite";
  }
  return defaultBackendKind();
}

// Resolve the pre-registry env surface (mcp-server / mcp-http: CHORUS_STORE +
// CHORUS_STORE_BACKEND) to a concrete (path, kind) pair — TOGETHER, because path continuity
// without kind continuity would hand a JSONL file to the SQLite driver. For the default path, an
// existing chorus-memory.jsonl from the era when JSONL was the unconditional default keeps
// winning, so a Node upgrade (which flips the default to node-sqlite) never silently starts a
// fresh store beside your history.
export function resolveEnvStore(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (p: string) => boolean = existsSync,
): { path: string; kind: BackendKind } {
  const pinned = env["CHORUS_STORE_BACKEND"] !== undefined ? backendFromEnv(env) : undefined;
  const legacy = "chorus-memory.jsonl";
  // The legacy-file continuity check applies ONLY when no backend is pinned: an explicit pin to
  // a sqlite kind must get the sqlite default path, never the legacy JSONL file under the pinned
  // sqlite driver (the exact incoherent pair this function exists to prevent).
  const path =
    env["CHORUS_STORE"] ??
    ((pinned ?? defaultBackendKind()) === "jsonl" || (pinned === undefined && fileExists(legacy))
      ? legacy
      : "chorus-memory.sqlite");
  return { path, kind: pinned ?? backendForPath(path, env) };
}

// Construct the durable persistence backend for a path. Callers depend on the `StoreBackend`
// interface, never on a concrete backend — the seam the whole tier exists to provide. The
// default kind resolves through `backendForPath` (env pin → content sniff → extension →
// availability default), so a bare `createBackend(path)` can never hand an existing store to
// the wrong driver.
export function createBackend(
  path: string,
  kind: BackendKind = backendForPath(path),
): StoreBackend {
  switch (kind) {
    case "jsonl":
      return new JsonlStore(path);
    case "sqlite":
      return new SqliteStore(path);
    case "node-sqlite":
      return new NodeSqliteStore(path);
  }
}
