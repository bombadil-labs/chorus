// `chorus store …` (task 4): registry subcommands driven through the real CLI, against temp
// CHORUS_HOMEs. Adoption is proven non-destructive by bytes, not by promise.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { JsonlStore } from "../src/shared-store.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-cli-store-"));
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const home = join(root, "home");
const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], {
    encoding: "utf8",
    // Set-but-empty = absent for all chorus env vars — neutralizes ambient dev-machine exports
    // without deleting keys.
    env: {
      ...process.env,
      CHORUS_HOME: home,
      CHORUS_MASTER_SEED: "",
      CHORUS_SEED_HEX: "",
      CHORUS_STORE_BACKEND: "",
    },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe("chorus store: registry subcommands through the real CLI", () => {
  it("refuses to run without an identity, naming the way in", () => {
    const r = runCli("store", "ls");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/chorus init/);
  });

  it("create → ls → show round-trip, idempotent create, honest empty digest", () => {
    expect(runCli("init").code).toBe(0);

    const created = runCli("store", "create", "media", "--tier", "private");
    expect(created.code).toBe(0);
    expect(created.out).toMatch(/created store "media" \(private\) — ed25519:/);

    const again = runCli("store", "create", "media");
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/already exists/);

    const ls = runCli("store", "ls");
    expect(ls.code).toBe(0);
    expect(ls.out).toContain("media");
    expect(ls.out).toContain("private");

    const show = runCli("store", "show", "media", "--json");
    expect(show.code).toBe(0);
    const info = JSON.parse(show.out) as { name: string; deltas: number; digest: string };
    expect(info.name).toBe("media");
    expect(info.deltas).toBe(0);
    expect(typeof info.digest).toBe("string");

    expect(runCli("store", "show", "nope").code).toBe(1);
  });

  it("adopts a pre-registry JSONL world losslessly and reads the source only", () => {
    // A synthetic stand-in for the live pre-registry store: real sessions, real beliefs.
    const sourcePath = join(root, "legacy-memory.jsonl");
    const source = new JsonlStore(sourcePath);
    const s = createSession({
      masterSeedHex: "0f".repeat(32),
      sessionId: "legacy",
      clock: (() => {
        let t = 1000;
        return () => (t += 10);
      })(),
    });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    callTool(s, "remember", { about: "work:dune-part-two", attribute: "rating", value: "5" });
    callTool(s, "remember", { about: "person:myk", attribute: "editor", value: "emacs" });
    source.persist(s.agent);
    const sourceBytes = readFileSync(sourcePath, "utf8");

    const adopt = runCli("store", "adopt", "personal", sourcePath, "--tier", "private");
    expect(adopt.code).toBe(0);
    expect(adopt.out).toMatch(/adopted .* into "personal": \d+ new delta\(s\)/);
    expect(adopt.out).toMatch(/digest verified lossless/);
    // Non-destructive is a byte-level claim, not a sentiment.
    expect(readFileSync(sourcePath, "utf8")).toBe(sourceBytes);

    // The adopted store shows the same world; re-adoption is a no-op union.
    const show = runCli("store", "show", "personal", "--json");
    const info = JSON.parse(show.out) as { deltas: number };
    expect(info.deltas).toBeGreaterThan(0);
    const re = runCli("store", "adopt", "personal", sourcePath);
    expect(re.code).toBe(0);
    expect(re.out).toMatch(/0 new delta\(s\)/);
    expect(readFileSync(sourcePath, "utf8")).toBe(sourceBytes);
  });

  it("rejects junk tiers, backends, and subcommands loudly", () => {
    expect(runCli("store", "create", "x", "--tier", "public").err).toMatch(/--tier must be/);
    expect(runCli("store", "create", "y", "--backend", "postgres").err).toMatch(
      /--backend must be/,
    );
    const r = runCli("store", "frobnicate");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/create \| ls \| show \| adopt/);
  });

  it("a typo'd flag is an error, never a silently-applied default", () => {
    const r = runCli("store", "create", "typo-test", "--teir", "private");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/unknown flag --teir/);
    // The store was NOT created with the wrong tier behind the user's back.
    expect(runCli("store", "show", "typo-test").code).toBe(1);
  });

  it("a bare value-taking flag errors instead of silently retargeting", () => {
    const r = runCli("init", "--home");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--home needs a value/);
  });

  it("boolean --json never swallows a following positional", () => {
    const r = runCli("store", "show", "--json", "media");
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out) as { name: string }).name).toBe("media");
  });

  it("adopting a missing or empty source is an error, never a false success", () => {
    const missing = runCli("store", "adopt", "oops", join(root, "no-such-file.jsonl"));
    expect(missing.code).toBe(1);
    expect(missing.err).toMatch(/does not exist/);
    // No file was created at the typo'd path.
    expect(existsSync(join(root, "no-such-file.jsonl"))).toBe(false);

    const emptyPath = join(root, "empty.store");
    writeFileSync(emptyPath, "");
    const empty = runCli("store", "adopt", "oops", emptyPath);
    expect(empty.code).toBe(1);
    expect(empty.err).toMatch(/is empty/);
    expect(readFileSync(emptyPath, "utf8")).toBe(""); // still untouched
  });
});
