// `chorus skeptic` (EPISTEME VI.4): doubt is a claim with an author. The skeptic doubts what
// rests on one voice, stays quiet while its doubt stands, and withdraws the moment the world
// answers — doubt that cannot be satisfied is not skepticism; it is a grudge.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { decide } from "../src/decisions.js";
import { deriveSeed } from "../src/identity.js";
import { callTool, createSession } from "../src/mcp-server.js";
import { skepticPass } from "../src/skeptic.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-skeptic-"));
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

const MASTER = "0f".repeat(32);

describe("the resident skeptic: doubt with an author", () => {
  it("doubts a decision-cited single-voice slot once, then withdraws on corroboration", () => {
    let t = 1000;
    const clock = () => (t += 10);
    const s = createSession({ masterSeedHex: MASTER, sessionId: "lone", clock });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    callTool(s, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
    decide(s.agent, { about: "svc:api", intent: "page team-a at 3am", attribute: "owner" });

    // One voice, one standing decision: doubt filed, visible to recall like any claim.
    const r1 = skepticPass(s.agent, MASTER, "mind", { clock });
    expect(r1.doubts).toHaveLength(1);
    expect(r1.doubts[0]!.decisionCited).toBe(true);
    expect(r1.doubts[0]!.appended).toBe(true);
    const doubtView = s.agent.recall("doubt:svc:api");
    expect(JSON.stringify(doubtView)).toMatch(/one voice's word/);

    // While the doubt stands, the skeptic stays quiet.
    const r2 = skepticPass(s.agent, MASTER, "mind", { clock });
    expect(r2.doubts[0]!.alreadyDoubted).toBe(true);
    expect(r2.doubts[0]!.appended).toBe(false);

    // A second voice corroborates; the skeptic withdraws, naming the reason.
    const witness = deriveSeed(MASTER, "author/witness");
    s.agent.assertAs(witness, {
      about: "svc:api",
      attribute: "owner",
      value: "team-a",
      timestamp: clock(),
    });
    const r3 = skepticPass(s.agent, MASTER, "mind", { clock });
    expect(r3.withdrawals).toHaveLength(1);
    expect(r3.withdrawals[0]!.reason).toMatch(/corroborated/);
    expect(r3.doubts).toHaveLength(0);
    expect(s.agent.recall("doubt:svc:api")).toEqual({}); // the doubt is gone from the live view
  });

  it("stays narrow by default; --all widens the beat; the gauge is never doubted", () => {
    let t = 1000;
    const clock = () => (t += 10);
    const s = createSession({ masterSeedHex: MASTER, sessionId: "narrow", clock });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    // Single-voice but NOT decision-cited — and a measurement, which is never doubted.
    callTool(s, "remember", { about: "svc:web", attribute: "lang", value: "ts" });
    callTool(s, "remember", {
      about: "vitals:mind",
      attribute: "live-beliefs",
      value: 1,
      kind: "measurement",
    });

    expect(skepticPass(s.agent, MASTER, "mind", { clock }).doubts).toHaveLength(0);
    const wide = skepticPass(s.agent, MASTER, "mind", { all: true, clock });
    expect(wide.doubts).toHaveLength(1); // svc:web lang — never the measurement
    expect(wide.doubts[0]!.entity).toBe("svc:web");
  });

  it("through the CLI: quiet store exits clean; doubts flip the exit code", () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");

    const calm = runCli("skeptic", "--store", "mind");
    expect(calm.code).toBe(0);
    expect(calm.out).toMatch(/--all widens/);

    const wide = runCli("skeptic", "--store", "mind", "--all");
    expect(wide.code).toBe(1);
    expect(wide.out).toMatch(/doubt filed/);
  });
});
