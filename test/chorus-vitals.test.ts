// `chorus vitals` (EPISTEME Phase V.1): the gauges read a KNOWN world correctly, and measuring
// writes nothing.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DeltaSet } from "@rhizomes/rhizomatic";
import { computeVitals } from "../src/vitals.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-vitals-"));
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

const clockFrom = (start: number) => {
  let t = start;
  return () => (t += 10);
};

describe("epistemic vitals: the gauges read a known world", () => {
  it("computeVitals over a hand-built world: every gauge traceable", () => {
    const MASTER = "0f".repeat(32);
    const day = 24 * 60 * 60 * 1000;
    const t0 = 1_000_000;
    const a = createSession({ masterSeedHex: MASTER, sessionId: "a", clock: clockFrom(t0) });
    const b = createSession({ masterSeedHex: MASTER, sessionId: "b", clock: clockFrom(t0) });

    // Author A: three beliefs, one with confidence, one later retracted.
    callTool(a, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
    callTool(a, "remember", {
      about: "svc:api",
      attribute: "tier",
      value: "gold",
      confidence: 0.9,
    });
    const dead = callTool(a, "remember", {
      about: "svc:api",
      attribute: "stale",
      value: "yes",
    }) as { deltaId: string };
    callTool(a, "retract", { deltaId: dead.deltaId, reason: "wrong" });

    // Author B disagrees about the owner — a genuine contest (two authors, two values).
    b.agent.importSet(DeltaSet.from(a.agent.peer.reactor.arrivalLog()));
    callTool(b, "remember", { about: "svc:api", attribute: "owner", value: "team-b" });
    a.agent.importSet(DeltaSet.from(b.agent.peer.reactor.arrivalLog()));

    const v = computeVitals(a.agent, t0 + 10 * day);
    expect(v.retractions).toBe(1);
    expect(v.kinds["observation"]).toBeGreaterThan(0);
    expect(v.confidence.carried).toBe(1);
    expect(v.confidence.mean).toBeCloseTo(0.9);
    expect(v.staleness!.medianDays).toBe(10);
    expect(v.sourceConcentration).toBeGreaterThan(0);
    expect(v.liveBeliefs).toBeGreaterThan(0);
  });

  it("through the CLI: text + json, and measuring writes NOTHING", () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");
    runCli("remember", "svc:api", "tier", "gold", "--store", "mind", "--confidence", "0.8");

    const before = JSON.parse(runCli("store", "show", "mind", "--json").out) as {
      deltas: number;
    };
    const text = runCli("vitals", "--store", "mind");
    expect(text.code).toBe(0);
    expect(text.out).toMatch(/live beliefs/);
    expect(text.out).toMatch(/source HHI/);

    const j = JSON.parse(runCli("vitals", "--store", "mind", "--json").out) as {
      liveBeliefs: number;
      confidence: { carried: number };
      sourceConcentration: number;
    };
    expect(j.liveBeliefs).toBeGreaterThanOrEqual(2);
    expect(j.confidence.carried).toBe(1);
    expect(j.sourceConcentration).toBeGreaterThan(0.5); // one voice wrote everything: near-monologue

    // The instrument never writes: delta count identical after two measurements.
    const after = JSON.parse(runCli("store", "show", "mind", "--json").out) as {
      deltas: number;
    };
    expect(after.deltas).toBe(before.deltas);
  });
});
