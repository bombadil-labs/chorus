// `chorus init` (task 3): non-destructive home setup. The unit surface (initChorusHome) and the
// spawned CLI both run against a temp CHORUS_HOME — the REAL ~/.chorus on a dev machine holds a
// live store and must never be touched by tests.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  configPath,
  initChorusHome,
  loadConfig,
  resolveMasterSeed,
  storesRoot,
} from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-init-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshHome = (): string => join(root, `home-${(n += 1)}`);

const SEED = "ab".repeat(32);

const runCli = (home: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, CHORUS_HOME: home },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe("chorus init: non-destructive home setup", () => {
  it("mints a fresh identity: config + stores root, seed valid, author derived", () => {
    const home = freshHome();
    const result = initChorusHome({ home, clock: () => 1234 });
    expect(result.created).toBe(true);
    expect(result.userAuthor.startsWith("ed25519:")).toBe(true);
    expect(existsSync(storesRoot(home))).toBe(true);
    const cfg = loadConfig(home)!;
    expect(cfg.version).toBe(1);
    expect(cfg.masterSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(cfg.createdAt).toBe(1234);
  });

  it("re-running is a no-op: same identity, config byte-identical", () => {
    const home = freshHome();
    const first = initChorusHome({ home });
    const bytes = readFileSync(configPath(home), "utf8");
    const again = initChorusHome({ home });
    expect(again.created).toBe(false);
    expect(again.userAuthor).toBe(first.userAuthor);
    expect(readFileSync(configPath(home), "utf8")).toBe(bytes);
  });

  it("imports a seed, lowercased; a conflicting later import refuses and changes nothing", () => {
    const home = freshHome();
    const result = initChorusHome({ home, seedHex: SEED.toUpperCase() });
    expect(loadConfig(home)!.masterSeed).toBe(SEED);
    expect(initChorusHome({ home, seedHex: SEED }).userAuthor).toBe(result.userAuthor); // no-op
    const bytes = readFileSync(configPath(home), "utf8");
    expect(() => initChorusHome({ home, seedHex: "cd".repeat(32) })).toThrow(/refusing to replace/);
    expect(readFileSync(configPath(home), "utf8")).toBe(bytes);
  });

  it("rejects malformed seeds; refuses to treat a corrupt config as absent", () => {
    expect(() => initChorusHome({ home: freshHome(), seedHex: "xyz" })).toThrow(/64 hex/);
    const home = freshHome();
    mkdirSync(home, { recursive: true });
    writeFileSync(configPath(home), "not json at all");
    expect(() => initChorusHome({ home })).toThrow(/not valid JSON/);
    expect(readFileSync(configPath(home), "utf8")).toBe("not json at all"); // untouched
  });

  it("resolveMasterSeed: explicit env wins, then the config, else undefined", () => {
    const home = freshHome();
    initChorusHome({ home, seedHex: SEED });
    expect(resolveMasterSeed({}, home)).toBe(SEED);
    expect(resolveMasterSeed({ CHORUS_MASTER_SEED: "ef".repeat(32) }, home)).toBe("ef".repeat(32));
    expect(resolveMasterSeed({}, freshHome())).toBeUndefined();
    // A SET-BUT-EMPTY env var counts as absent — a lingering `export CHORUS_SEED_HEX=` in a
    // shell profile must not beat a real config.
    expect(resolveMasterSeed({ CHORUS_SEED_HEX: "" }, home)).toBe(SEED);
    expect(resolveMasterSeed({ CHORUS_MASTER_SEED: "", CHORUS_SEED_HEX: "" }, home)).toBe(SEED);
  });

  it("the GNU-style --seed=<hex> form imports too", () => {
    const home = freshHome();
    expect(runCli(home, "init", `--seed=${SEED}`).code).toBe(0);
    expect(loadConfig(home)!.masterSeed).toBe(SEED);
  });

  it("the natural typo `chorus init <seed>` fails WITHOUT echoing the value", () => {
    const home = freshHome();
    const r = runCli(home, "init", SEED);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain(SEED);
    expect(r.err).not.toContain(SEED);
    expect(r.err).toMatch(/--seed/); // the message teaches the correct form instead
    expect(loadConfig(home)).toBeUndefined(); // and nothing was created
  });

  it("a seed-shaped value can never reach an output stream, even as a bogus command", () => {
    const home = freshHome();
    const r = runCli(home, SEED); // `chorus <seed>` — unknown-command path
    expect(r.code).toBe(1);
    expect(r.out).not.toContain(SEED);
    expect(r.err).not.toContain(SEED);
  });

  it("the CLI prints the home and the PUBLIC author — and never the seed", () => {
    const home = freshHome();
    const r = runCli(home, "init");
    expect(r.code).toBe(0);
    expect(r.out).toContain("initialized");
    expect(r.out).toContain("ed25519:");
    const seed = loadConfig(home)!.masterSeed;
    expect(r.out).not.toContain(seed);
    expect(r.err).not.toContain(seed);
    // Re-run through the CLI: idempotent, still silent about the seed.
    const again = runCli(home, "init");
    expect(again.code).toBe(0);
    expect(again.out).toContain("already initialized");
    expect(again.out).not.toContain(seed);
  });

  it("the CLI refuses a conflicting --seed with exit 1", () => {
    const home = freshHome();
    expect(runCli(home, "init", "--seed", SEED).code).toBe(0);
    const r = runCli(home, "init", "--seed", "cd".repeat(32));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/refusing to replace/);
    expect(loadConfig(home)!.masterSeed).toBe(SEED);
  });
});
