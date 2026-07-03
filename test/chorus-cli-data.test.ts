// Direct data ops (task 7): the CLI as an MCP-less client of the same tool surface. One temp
// home; every op through the spawned CLI.

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

const root = mkdtempSync(join(tmpdir(), "chorus-cli-data-"));
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
const json = (r: { out: string }): unknown => JSON.parse(r.out);

describe("chorus data ops: the CLI as a client of the one tool surface", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "personal").code).toBe(0);
  });

  it("remember → recall round-trips; values parse as JSON where they are JSON", () => {
    const r = runCli("remember", "svc:api", "replicas", "3", "--store", "personal");
    expect(r.code).toBe(0);
    expect(json(r)).toHaveProperty("deltaId");

    runCli("remember", "svc:api", "owner", "team-a", "--store", "personal");
    const recall = runCli("recall", "svc:api", "--store", "personal");
    expect(recall.code).toBe(0);
    expect(json(recall)).toEqual({ replicas: 3, owner: "team-a" });
  });

  it("--ref stores a typed reference, not a string; explain shows receipts + user speaker", () => {
    runCli(
      "remember",
      "syncro:mirror",
      "composed-of",
      "event:eclipse",
      "--ref",
      "--store",
      "personal",
    );
    const explain = runCli("explain", "syncro:mirror", "--store", "personal");
    const receipts = json(explain) as Array<{ reference?: boolean; author: string }>;
    expect(receipts.some((r) => r.reference === true)).toBe(true);

    // The CLI default speaker is the USER: the human at the terminal speaks as themselves.
    const who = runCli("explain", "svc:api", "--store", "personal");
    const receiptsFor = json(who) as Array<{ speaker: string }>;
    expect(receiptsFor.length).toBeGreaterThan(0); // [].every() is vacuously true
    expect(receiptsFor.every((r) => r.speaker === "user")).toBe(true);
  });

  it("search finds substrings; decide → replay round-trips", () => {
    const hits = json(runCli("search", "team-a", "--store", "personal")) as unknown[];
    expect(hits.length).toBeGreaterThan(0);

    const decided = json(
      runCli("decide", "svc:api", "--intent", "scale it", "--store", "personal"),
    ) as { decisionId: string };
    expect(decided.decisionId).toBeTruthy();
    const replayed = json(runCli("replay", decided.decisionId, "--store", "personal")) as {
      verified?: unknown;
    };
    expect(replayed).toHaveProperty("verified");
  });

  it("gql one-shot: pin, query, release", () => {
    const r = runCli("gql", "{ svcs { id } }", "--store", "personal");
    expect(r.code).toBe(0);
    const body = json(r) as { data?: { svcs?: Array<{ id: string }> } };
    expect(body.data?.svcs?.some((s) => s.id === "svc:api")).toBe(true);
  });

  it("fails loudly: missing store flag, unknown store, junk speaker", () => {
    expect(runCli("recall", "svc:api").err).toMatch(/--store/);
    expect(runCli("recall", "svc:api", "--store", "nope").err).toMatch(/no store named/);
    expect(
      runCli("remember", "a", "b", "c", "--speaker", "ghost", "--store", "personal").err,
    ).toMatch(/--speaker must be/);
  });
});
