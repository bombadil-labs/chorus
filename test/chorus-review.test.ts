// `chorus review` (EPISTEME VI.1): retrospective replay. The examiner replays standing
// decisions against the present and mails the deciders whose ground has moved — and it earns
// its interruptions: an unchanged verdict is never re-mailed. Mail and claims, never mutation.

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

const root = mkdtempSync(join(tmpdir(), "chorus-review-"));
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

interface ReviewJson {
  examiner: string;
  examined: number;
  standing: number;
  mailed: number;
  findings: Array<{
    decision: string;
    about: string;
    superseded: boolean;
    reasons: string[];
    mailed: boolean;
    alreadyOnFile: boolean;
    messageId?: string;
  }>;
}

describe("chorus review: the examiner acts", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");
  });

  it("an empty docket reviews clean", () => {
    const r = runCli("review", "--store", "mind");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/reviewed 0 decision/);
  });

  it("a decision whose ground holds: stands, exit 0", () => {
    const d = JSON.parse(
      runCli(
        "decide",
        "svc:api",
        "--intent",
        "route traffic to team-a's cluster",
        "--attribute",
        "owner",
        "--store",
        "mind",
      ).out,
    ) as { decisionId: string };
    expect(d.decisionId).toBeTruthy();

    const r = runCli("review", "--store", "mind");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 stand, 0 need revisiting/);
    expect(r.out).toMatch(/still rests on the ground/);
  });

  it("the ground moves: the examiner mails the decider, exit 1", () => {
    runCli("remember", "svc:api", "owner", "team-b", "--store", "mind");

    const r = runCli("review", "--store", "mind", "--json");
    expect(r.code).toBe(1);
    const report = JSON.parse(r.out) as ReviewJson;
    expect(report.examined).toBe(1);
    expect(report.findings).toHaveLength(1);
    const f = report.findings[0]!;
    expect(f.superseded).toBe(true);
    expect(f.reasons.join(" ")).toMatch(/resolves differently today/);
    expect(f.mailed).toBe(true);
    expect(f.messageId).toBeTruthy();
    expect(report.mailed).toBe(1);
  });

  it("an unchanged verdict is never re-mailed — the examiner does not nag", () => {
    const r = runCli("review", "--store", "mind", "--json");
    expect(r.code).toBe(1); // the finding still stands…
    const report = JSON.parse(r.out) as ReviewJson;
    expect(report.findings[0]!.alreadyOnFile).toBe(true);
    expect(report.findings[0]!.mailed).toBe(false);
    expect(report.mailed).toBe(0); // …but no second letter

    const text = runCli("review", "--store", "mind");
    expect(text.out).toMatch(/does not nag/);
  });

  it("new movement is a new verdict: a further change mails once more", () => {
    runCli("remember", "svc:api", "owner", "team-c", "--store", "mind");
    const r = JSON.parse(runCli("review", "--store", "mind", "--json").out) as ReviewJson;
    expect(r.mailed).toBe(1); // the fingerprint moved with the world
  });

  it("the letters are correspondence, not knowledge: recall stays beliefs-only", () => {
    const view = JSON.parse(runCli("recall", "svc:api", "--store", "mind").out) as Record<
      string,
      unknown
    >;
    expect(view["owner"]).toBe("team-c");
    // No message body leaks into the belief surface.
    expect(JSON.stringify(view)).not.toMatch(/revisiting/);
  });
});
