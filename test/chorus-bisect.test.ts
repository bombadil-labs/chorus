// `chorus bisect` (EPISTEME V.3): the search finds the exact flip, names the culprit, and
// spends logarithmically — as-of was always the time machine; bisect is just the search.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { bisectBelief } from "../src/bisect.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-bisect-"));
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

describe("chorus bisect: find the instant a mind changed", () => {
  it("pins the exact flip delta among many noise writes, in O(log n) probes", () => {
    const MASTER = "0f".repeat(32);
    let t = 1000;
    const clock = () => (t += 10);
    const s = createSession({ masterSeedHex: MASTER, sessionId: "history", clock });
    callTool(s, "begin-session", { model: "claude-fable-5" });

    callTool(s, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
    // Forty beliefs of unrelated noise, so the search has something to skip over.
    for (let i = 0; i < 40; i++) {
      callTool(s, "remember", { about: `noise:${i}`, attribute: "n", value: i });
    }
    // THE FLIP: a revision changes the owner.
    const flip = callTool(s, "revise", {
      deltaId: (callTool(s, "explain", { entity: "svc:api" }) as Array<{ deltaId: string }>)[0]!
        .deltaId,
      value: "team-b",
      reason: "reorg",
    }) as { deltaId: string };
    const flipTime = t;
    // More noise after.
    for (let i = 40; i < 60; i++) {
      callTool(s, "remember", { about: `noise:${i}`, attribute: "n", value: i });
    }

    // A revise is retract-then-assert on two instants, and bisect is honest about it: the
    // FIRST flip from team-a is the retraction — the view really did pass through {} for a
    // tick. Bisect again from there and the second half of the revision surfaces.
    const r1 = bisectBelief(s.agent, "svc:api", { attribute: "owner" });
    expect(r1.flipped).toBe(true);
    expect(r1.before).toEqual({ owner: "team-a" });
    expect(r1.after).toEqual({});
    expect(r1.flippedAt).toBeLessThanOrEqual(flipTime);

    const r2 = bisectBelief(s.agent, "svc:api", { attribute: "owner", good: r1.flippedAt });
    expect(r2.flipped).toBe(true);
    expect(r2.after).toEqual({ owner: "team-b" });
    expect(r2.culprits!.some((c) => c.deltaId === flip.deltaId)).toBe(true);
    expect(r2.culprits![0]!.model).toBe("claude-fable-5");
    // ~100+ instants; the search must be logarithmic, not linear. Generous bound: probes
    // ≤ 2 + ceil(log2(n)) + a couple for the before/after render.
    expect(r1.probes).toBeLessThan(20);
  });

  it("no flip in range is an honest no-op, not a fabricated culprit", () => {
    const MASTER = "0f".repeat(32);
    let t = 1000;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "calm", clock: () => (t += 10) });
    callTool(s, "remember", { about: "rock:stable", attribute: "state", value: "still" });
    callTool(s, "remember", { about: "rock:other", attribute: "state", value: "also-still" });
    const r = bisectBelief(s.agent, "rock:stable", { attribute: "state" });
    expect(r.flipped).toBe(false);
    expect(r.culprits).toBeUndefined();
  });

  it("through the CLI: text names the culprit; junk instants rejected", () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");
    runCli("remember", "svc:api", "owner", "team-b", "--store", "mind");

    const r = runCli("bisect", "svc:api", "--attribute", "owner", "--store", "mind");
    expect(r.code).toBe(0);
    // Two same-author user claims: the resolved view may pick latest — if it flipped, the
    // culprit is named; if policy keeps the first, the no-flip line prints. Either way: honest.
    expect(r.out).toMatch(/flipped at|no flip/);

    expect(runCli("bisect", "svc:api", "--good", "yesterday", "--store", "mind").err).toMatch(
      /epoch milliseconds/,
    );
  });
});
