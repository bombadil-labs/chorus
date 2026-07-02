// The pluggable tier from the caller's side: env-driven backend selection, the factory, the
// JSONL → SQLite migration (lossless by digest), and an MCP-boot smoke through each backend.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonlStore } from "../src/shared-store.js";
import { SqliteStore, betterSqliteAvailable } from "../src/sqlite-store.js";
import { NodeSqliteStore, nodeSqliteAvailable } from "../src/node-sqlite-store.js";
import {
  availableDriver,
  backendForPath,
  backendFromEnv,
  createBackend,
  defaultBackendKind,
  resolveEnvStore,
  type StoreBackend,
  type BackendKind,
} from "../src/store-tier.js";
import { migrateJsonlToSqlite } from "../src/migrate.js";
import { callTool, createSession } from "../src/mcp-server.js";

const MASTER = "0f".repeat(32);
const clockFrom = (start: number) => {
  let t = start;
  return () => (t += 10);
};
// Whether ANY sqlite-family driver exists here (better-sqlite3 is optional; node:sqlite needs
// Node >= 22.13). Suites that need one skip loudly rather than fail on a degraded install.
const canSqlite = betterSqliteAvailable() || nodeSqliteAvailable();

const dir = mkdtempSync(join(tmpdir(), "chorus-tier-"));
const opened: StoreBackend[] = [];
const track = <S extends StoreBackend>(s: S): S => (opened.push(s), s);
afterAll(() => {
  for (const s of opened) s.close?.();
  rmSync(dir, { recursive: true, force: true });
});

describe("chorus persistence tier: selection + migration", () => {
  it("backendFromEnv defaults by availability, honors every kind, is case-insensitive, rejects junk", () => {
    // The unset-env default prefers a SQLite driver — the builtin first, better-sqlite3 (an
    // optional dep) next — and falls to the legible JSONL tier only when neither exists. JSONL
    // is the dev tier, not a production default; it is also the one backend that can't be
    // missing, so a default install can never break.
    expect(defaultBackendKind()).toBe(
      nodeSqliteAvailable() ? "node-sqlite" : betterSqliteAvailable() ? "sqlite" : "jsonl",
    );
    expect(backendFromEnv({})).toBe(defaultBackendKind());
    // Driver substitution stays inside the shared-format family and is identity when the
    // requested driver exists.
    expect(availableDriver("jsonl")).toBe("jsonl");
    expect(availableDriver("sqlite")).toBe(
      betterSqliteAvailable() ? "sqlite" : nodeSqliteAvailable() ? "node-sqlite" : "sqlite",
    );
    expect(availableDriver("node-sqlite")).toBe(
      nodeSqliteAvailable() ? "node-sqlite" : betterSqliteAvailable() ? "sqlite" : "node-sqlite",
    );
    expect(backendFromEnv({ CHORUS_STORE_BACKEND: "jsonl" })).toBe("jsonl");
    expect(backendFromEnv({ CHORUS_STORE_BACKEND: "sqlite" })).toBe("sqlite");
    expect(backendFromEnv({ CHORUS_STORE_BACKEND: "SQLite" })).toBe("sqlite");
    expect(backendFromEnv({ CHORUS_STORE_BACKEND: "node-sqlite" })).toBe("node-sqlite");
    expect(() => backendFromEnv({ CHORUS_STORE_BACKEND: "postgres" })).toThrow(
      /not a known backend/,
    );
  });

  it("the factory builds the backend the selection names", () => {
    expect(track(createBackend(join(dir, "f.jsonl"), "jsonl"))).toBeInstanceOf(JsonlStore);
    if (betterSqliteAvailable()) {
      expect(track(createBackend(join(dir, "f.sqlite"), "sqlite"))).toBeInstanceOf(SqliteStore);
    } else {
      expect(() => createBackend(join(dir, "f.sqlite"), "sqlite")).toThrow(/better-sqlite3/);
    }
    if (nodeSqliteAvailable()) {
      expect(track(createBackend(join(dir, "f.node.sqlite"), "node-sqlite"))).toBeInstanceOf(
        NodeSqliteStore,
      );
    } else {
      // On a pre-22.13 Node the kind exists but construction fails loudly, naming the way out.
      expect(() => createBackend(join(dir, "f.node.sqlite"), "node-sqlite")).toThrow(/node:sqlite/);
    }
  });

  it("resolveEnvStore binds path and kind together, with legacy-jsonl continuity", () => {
    const never = () => false;
    const always = () => true;
    // Explicit env pins both halves, regardless of what exists on disk.
    expect(
      resolveEnvStore({ CHORUS_STORE: "x.sqlite", CHORUS_STORE_BACKEND: "sqlite" }, never),
    ).toEqual({ path: "x.sqlite", kind: "sqlite" });
    // A .jsonl path pins the jsonl driver — path-based continuity for the pre-registry surface.
    expect(resolveEnvStore({ CHORUS_STORE: "mine.jsonl" }, never)).toEqual({
      path: "mine.jsonl",
      kind: "jsonl",
    });
    // No env at all: the default pair is coherent (extension matches driver)…
    const bare = resolveEnvStore({}, never);
    expect(bare.kind).toBe(defaultBackendKind());
    expect(bare.path).toBe(bare.kind === "jsonl" ? "chorus-memory.jsonl" : "chorus-memory.sqlite");
    // …and an existing legacy chorus-memory.jsonl keeps winning even where node-sqlite is the
    // default, so a Node upgrade never strands history behind a fresh store.
    expect(resolveEnvStore({}, always)).toEqual({ path: "chorus-memory.jsonl", kind: "jsonl" });
    // A pinned SQLite kind + an existing legacy file must NOT pair the legacy JSONL path with
    // the sqlite driver — the pin gets the sqlite default path instead (the incoherent pair
    // this function exists to prevent).
    expect(resolveEnvStore({ CHORUS_STORE_BACKEND: "node-sqlite" }, always)).toEqual({
      path: "chorus-memory.sqlite",
      kind: "node-sqlite",
    });
    expect(resolveEnvStore({ CHORUS_STORE_BACKEND: "jsonl" }, never)).toEqual({
      path: "chorus-memory.jsonl",
      kind: "jsonl",
    });
  });

  it("backendForPath detects existing stores by content, never by name", () => {
    // JSONL content at a sqlite-looking name: the old unconditional-jsonl default wrote JSONL
    // to ANY path — “any version of Chorus must read any store it ever wrote.”
    const jsonlAtOddName = join(dir, "history.db");
    writeFileSync(jsonlAtOddName, '{"v":1}\n');
    expect(backendForPath(jsonlAtOddName, {})).toBe("jsonl");
    // A real SQLite file at a jsonl-looking name goes to a sqlite driver — the JSONL reader
    // would silently treat the binary as garbage lines and then append text into the database.
    if (canSqlite) {
      const sqliteAtOddName = join(dir, "memory.log");
      track(createBackend(sqliteAtOddName, availableDriver("sqlite")));
      expect(backendForPath(sqliteAtOddName, {})).toBe(availableDriver("node-sqlite"));
    }
    // Fresh paths go by extension (case-insensitive), then the availability default.
    expect(backendForPath(join(dir, "fresh.jsonl"), {})).toBe("jsonl");
    expect(backendForPath(join(dir, "FRESH.JSONL"), {})).toBe("jsonl");
    expect(backendForPath(join(dir, "fresh.sqlite"), {})).toBe(
      nodeSqliteAvailable() ? "node-sqlite" : "sqlite",
    );
    expect(backendForPath(join(dir, "fresh.anything"), {})).toBe(defaultBackendKind());
    // An explicit env pin beats even the content sniff — explicit intent wins, loudly.
    expect(backendForPath(jsonlAtOddName, { CHORUS_STORE_BACKEND: "sqlite" })).toBe("sqlite");
    // And bare createBackend(path) routes through this resolution: an existing JSONL store can
    // never be handed to the wrong driver by the default parameter.
    expect(track(createBackend(jsonlAtOddName))).toBeInstanceOf(JsonlStore);
  });

  it.skipIf(!canSqlite)(
    "migrates a JSONL log into SQLite losslessly: identical digest, beliefs intact",
    () => {
      const jsonlPath = join(dir, "memory.jsonl");
      const sqlitePath = join(dir, "memory.sqlite");

      // Build a real world in JSONL: a belief, a revise, a retract — exercise negation chains.
      const writer = createSession({
        masterSeedHex: MASTER,
        sessionId: "w",
        clock: clockFrom(1000),
      });
      const src = track(new JsonlStore(jsonlPath));
      callTool(writer, "begin-session", { model: "claude-fable-5" });
      callTool(writer, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
      const r = callTool(writer, "remember", {
        about: "svc:api",
        attribute: "tier",
        value: "bronze",
      }) as { deltaId: string };
      callTool(writer, "revise", { deltaId: r.deltaId, value: "gold", reason: "upgraded" });
      src.persist(writer.agent);
      const before = writer.agent.digest();

      const result = migrateJsonlToSqlite(jsonlPath, sqlitePath);
      expect(result.digest).toBe(before); // the migration's own internal verification agrees…

      // …and an independent reader over the SQLite store sees the identical world + live beliefs.
      const reader = createSession({
        masterSeedHex: MASTER,
        sessionId: "r",
        clock: clockFrom(5000),
      });
      track(createBackend(sqlitePath, availableDriver("sqlite"))).refresh(reader.agent);
      expect(reader.agent.digest()).toBe(before);
      expect(callTool(reader, "recall", { entity: "svc:api" })).toEqual({
        owner: "team-a",
        tier: "gold",
      });
    },
  );

  it.skipIf(!canSqlite)(
    "an empty JSONL log migrates to an empty SQLite store (no spurious deltas)",
    () => {
      const result = migrateJsonlToSqlite(join(dir, "absent.jsonl"), join(dir, "empty.sqlite"));
      expect(result.deltas).toBe(0);
    },
  );

  // DoD #5: the server path boots on either backend; remember in one process, recall in a fresh
  // one over the same durable store — the resume every real client depends on.
  const bootable: BackendKind[] = [
    "jsonl",
    ...(betterSqliteAvailable() ? (["sqlite"] as const) : []),
    ...(nodeSqliteAvailable() ? (["node-sqlite"] as const) : []),
  ];
  for (const backend of bootable) {
    it(`MCP boot smoke — remember → (fresh boot) → recall on ${backend}`, () => {
      const path = join(dir, `boot.${backend}`);
      const s1 = createSession({ masterSeedHex: MASTER, sessionId: "p1", clock: clockFrom(1000) });
      const store1 = track(createBackend(path, backend));
      callTool(s1, "begin-session", { model: "claude-fable-5" });
      callTool(s1, "remember", { about: "user:mike", attribute: "editor", value: "vim" }, () =>
        store1.persist(s1.agent),
      );

      // A second process boots cold from the same store and recalls.
      const s2 = createSession({ masterSeedHex: MASTER, sessionId: "p2", clock: clockFrom(9000) });
      track(createBackend(path, backend)).refresh(s2.agent);
      expect(callTool(s2, "recall", { entity: "user:mike" })).toEqual({ editor: "vim" });
    });
  }
});
