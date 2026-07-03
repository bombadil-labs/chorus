// `chorus diff` (EPISTEME V.2): agreement isn't one thing, and the diff refuses to flatten it.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-diff-"));
const home = join(root, "home");
const env = {
  ...process.env,
  CHORUS_HOME: home,
  CHORUS_MASTER_SEED: "",
  CHORUS_SEED_HEX: "",
  CHORUS_STORE_BACKEND: "",
};
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

interface DiffJson {
  agree: number;
  agreeIndependently: Array<{ entity: string }>;
  disagree: Array<{ entity: string; attribute: string }>;
  onlyLeft: Array<{ entity: string }>;
  onlyRight: Array<{ entity: string }>;
}

describe("chorus diff: drift, made visible", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "alpha").code).toBe(0);
    expect(runCli("store", "create", "beta").code).toBe(0);
    // Both stores are written by THE SAME user author (one seed, speaker user), so identical
    // values land as plain agreement. alpha and beta disagree about the owner; alpha alone
    // knows the tier; beta alone knows the region.
    runCli("remember", "svc:api", "owner", "team-a", "--store", "alpha");
    runCli("remember", "svc:api", "owner", "team-b", "--store", "beta");
    runCli("remember", "svc:api", "lang", "typescript", "--store", "alpha");
    runCli("remember", "svc:api", "lang", "typescript", "--store", "beta");
    runCli("remember", "svc:api", "tier", "gold", "--store", "alpha");
    runCli("remember", "svc:api", "region", "us-east", "--store", "beta");
  });

  it("two stores: disagree/agree/only-* land in the right columns; drift exits non-zero", () => {
    const r = runCli("diff", "--store", "alpha", "--store", "beta", "--json");
    expect(r.code).toBe(1); // disagreement is the signal scripts chain on
    const d = JSON.parse(r.out) as DiffJson;
    expect(d.disagree.some((e) => e.attribute === "owner")).toBe(true);
    expect(d.agree).toBeGreaterThanOrEqual(1); // lang: same value, same user author
    expect(d.onlyLeft.length).toBeGreaterThanOrEqual(1); // tier
    expect(d.onlyRight.length).toBeGreaterThanOrEqual(1); // region

    const text = runCli("diff", "--store", "alpha", "--store", "beta");
    expect(text.out).toMatch(/disagree/);
    expect(text.out).toMatch(/owner/);
  });

  it("one store against its own past: what changed its mind since t0", () => {
    // Everything above happened "now"; diff from the epoch to now shows only-right growth.
    const r = runCli("diff", "--store", "alpha", "--from", "1000", "--json");
    expect(r.code).toBe(0); // no DISAGREEMENT with an empty past — only new knowledge
    const d = JSON.parse(r.out) as DiffJson;
    expect(d.onlyRight.length).toBeGreaterThanOrEqual(3);
    expect(d.disagree.length).toBe(0);
  });

  it("identical stores agree everywhere, exit 0", () => {
    const r = runCli("diff", "--store", "alpha", "--store", "alpha", "--json");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out) as DiffJson;
    expect(d.disagree.length).toBe(0);
    expect(d.onlyLeft.length).toBe(0);
    expect(d.onlyRight.length).toBe(0);
  });

  it("validates loudly: wrong arity, junk instants", () => {
    expect(runCli("diff", "--store", "alpha").err).toMatch(/usage: chorus diff/);
    expect(runCli("diff", "--store", "alpha", "--from", "yesterday").err).toMatch(
      /epoch milliseconds/,
    );
    expect(runCli("diff", "--store", "alpha", "--store", "ghost").err).toMatch(/no store named/);
  });
});
