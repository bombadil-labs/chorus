// `chorus examine` (EPISTEME V.4): the examiner is an AUTHOR — measurements are signed claims
// with receipts, re-examination accrues a health history, and the instrument itself can be
// distrusted like any other voice. Telemetry in the medium.

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

const root = mkdtempSync(join(tmpdir(), "chorus-examine-"));
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

describe("the examiner testifies: measurements with receipts", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");
    runCli("remember", "svc:api", "tier", "gold", "--store", "mind");
  });

  it("examine puts signed measurements on the record; the numbers recall like any belief", () => {
    const r = runCli("examine", "--store", "mind");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/the examiner .* put \d+ measurement/);
    expect(r.out).toMatch(/can be distrusted like anyone/);

    const view = JSON.parse(runCli("recall", "vitals:mind", "--store", "mind").out) as Record<
      string,
      unknown
    >;
    expect(view["live-beliefs"]).toBe(2);
    expect(typeof view["source-concentration"]).toBe("number");

    // Receipts name the instrument: model "chorus-examiner", never "unknown".
    const receipts = JSON.parse(runCli("explain", "vitals:mind", "--store", "mind").out) as Array<{
      model?: string;
    }>;
    expect(receipts.some((x) => x.model === "chorus-examiner")).toBe(true);
  });

  it("re-examination accrues a history: latest wins the read, nothing is lost", () => {
    runCli("remember", "svc:api", "lang", "typescript", "--store", "mind");
    const before = JSON.parse(runCli("explain", "vitals:mind", "--store", "mind").out) as unknown[];
    expect(runCli("examine", "--store", "mind").code).toBe(0);

    const view = JSON.parse(runCli("recall", "vitals:mind", "--store", "mind").out) as Record<
      string,
      unknown
    >;
    expect(view["live-beliefs"]).toBe(3); // the read is current…
    const after = JSON.parse(runCli("explain", "vitals:mind", "--store", "mind").out) as unknown[];
    expect(after.length).toBeGreaterThan(before.length); // …and the history grew. Grow-only.
  });
});
