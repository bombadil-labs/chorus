// `chorus challenge` (EPISTEME VI.2): the store asks to be checked instead of silently
// rotting — and the cure is the substrate's kindest property: re-assertion IS re-verification.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { challengeStale } from "../src/challenges.js";
import { decide } from "../src/decisions.js";
import { inbox } from "../src/messages.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-challenge-"));
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

const DAY = 86_400_000;
const MASTER = "0f".repeat(32);

describe("staleness challenges: the store refuses to rot", () => {
  it("a belief past its half-life draws one letter; re-assertion clears it", () => {
    let t = DAY; // day one
    const clock = () => t;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "keeper", clock });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    callTool(s, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
    decide(s.agent, { about: "svc:api", intent: "route traffic", attribute: "owner" });

    // Forty days pass in silence.
    t = 41 * DAY;
    const r1 = challengeStale(s.agent, MASTER, "mind", { halfLifeDays: 30, clock });
    expect(r1.calibration).toBe("half-life flag");
    expect(r1.challenges).toHaveLength(1);
    const c = r1.challenges[0]!;
    expect(c.entity).toBe("svc:api");
    expect(c.ageDays).toBe(40);
    expect(c.loadBearing).toBe(true); // the decision saw this claim
    expect(c.mailed).toBe(true);

    // The letter reaches the voice that last spoke, and says how to answer.
    const mail = inbox(s.agent, { author: s.agent.author });
    expect(mail.some((m) => m.body.includes("a fresh assertion IS re-verification"))).toBe(true);
    expect(mail.some((m) => m.body.includes("A standing decision rests on it"))).toBe(true);

    // Asking twice is nagging; the examiner does not.
    const r2 = challengeStale(s.agent, MASTER, "mind", { halfLifeDays: 30, clock });
    expect(r2.challenges[0]!.alreadyOnFile).toBe(true);
    expect(r2.mailed).toBe(0);

    // The cure: say it again. A fresh signed claim at a fresh instant IS the re-verification.
    callTool(s, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
    const r3 = challengeStale(s.agent, MASTER, "mind", { halfLifeDays: 30, clock });
    expect(r3.challenges).toHaveLength(0);
  });

  it("the examiner's own measurements are never challenged", () => {
    let t = DAY;
    const clock = () => t;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "gauge", clock });
    callTool(s, "remember", {
      about: "vitals:mind",
      attribute: "live-beliefs",
      value: 3,
      kind: "measurement",
    });
    t = 100 * DAY;
    const r = challengeStale(s.agent, MASTER, "mind", { halfLifeDays: 1, clock });
    expect(r.challenges).toHaveLength(0); // the gauge describes the world, never the describing
  });

  it("unset half-life calibrates against the store's own p90", () => {
    let t = DAY;
    const clock = () => t;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "selfcal", clock });
    for (let i = 0; i < 9; i++) {
      t = (i + 1) * DAY;
      callTool(s, "remember", { about: `svc:${i}`, attribute: "state", value: "fresh" });
    }
    t = 400 * DAY;
    const r = challengeStale(s.agent, MASTER, "mind", { clock });
    expect(r.calibration).toBe("store p90");
    expect(Number.isFinite(r.thresholdDays)).toBe(true);
  });

  it("through the CLI: a young store reviews clean; junk half-life rejected", () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");

    const r = runCli("challenge", "--store", "mind", "--half-life", "30");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/keeping itself current/);

    expect(runCli("challenge", "--store", "mind", "--half-life", "soon").err).toMatch(
      /whole number of days/,
    );
  });
});
