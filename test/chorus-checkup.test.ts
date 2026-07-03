// `chorus checkup` (nightcap N.4): every instrument in one pass, one report, one exit code —
// the consolidation of the instrument surface, not new machinery.

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

const root = mkdtempSync(join(tmpdir(), "chorus-checkup-"));
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

describe("chorus checkup: the daily physical", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");
  });

  it("a healthy store gets a clean bill, exit 0", () => {
    const r = runCli("checkup", "--store", "mind");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/pulse/);
    expect(r.out).toMatch(/clean bill of health/);
  });

  it("any instrument's finding flips the exit code; the report reads every dial", () => {
    const d = JSON.parse(
      runCli("decide", "svc:api", "--intent", "ship", "--attribute", "owner", "--store", "mind")
        .out,
    ) as { decisionId: string };
    expect(d.decisionId).toBeTruthy();
    runCli("remember", "svc:api", "owner", "team-b", "--store", "mind"); // the ground moves

    const r = runCli("checkup", "--store", "mind", "--json");
    expect(r.code).toBe(1);
    const report = JSON.parse(r.out) as { findings: number; review: { findings: unknown[] } };
    expect(report.findings).toBeGreaterThan(0);
    expect(report.review.findings.length).toBeGreaterThan(0);

    const text = runCli("checkup", "--store", "mind");
    expect(text.out).toMatch(/decisions/);
    expect(text.out).toMatch(/freshness/);
    expect(text.out).toMatch(/dialects/);
    expect(text.out).toMatch(/testimony/);
    expect(text.out).toMatch(/want a human/);
  });
});
