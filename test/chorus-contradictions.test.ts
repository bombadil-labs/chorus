// `chorus contradictions` (EPISTEME VI.3): one question, two dialects, two answers — the
// contradiction the contested scan can't see because the words differ. Proximity proposes;
// the judge disposes; nothing auto-merges.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  embeddingSimilarity,
  lexicalSimilarity,
  mineContradictions,
} from "../src/contradictions.js";
import { MockEmbeddingModel } from "../src/librarian.js";
import { inbox } from "../src/messages.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-contradictions-"));
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

describe("contradiction mining: one question, two dialects", () => {
  it("near-synonym attributes with rival values are proposed to the judge, once", () => {
    let t = 1000;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "miner", clock: () => (t += 10) });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    callTool(s, "remember", { about: "svc:api", attribute: "deploy-env", value: "prod" });
    callTool(s, "remember", {
      about: "svc:api",
      attribute: "deployment_environment",
      value: "staging",
    });
    // Same value in two dialects is agreement wearing two coats — not a contradiction.
    callTool(s, "remember", { about: "svc:api", attribute: "repo", value: "chorus" });
    callTool(s, "remember", { about: "svc:api", attribute: "repository", value: "chorus" });

    const r1 = mineContradictions(s.agent, MASTER, "mind", { clock: () => (t += 10) });
    expect(r1.comparator).toBe("lexical");
    expect(r1.pairs).toHaveLength(1);
    const p = r1.pairs[0]!;
    expect([p.attributeA, p.attributeB].sort()).toEqual(["deploy-env", "deployment_environment"]);
    expect(p.mailed).toBe(true);

    // The letter goes to the human judge and says what it is: a proposal, not a verdict.
    const mail = inbox(s.agent, { author: "someone-else", user: true });
    expect(mail.some((m) => m.body.includes("a proposal, not a verdict"))).toBe(true);

    // Asking twice is nagging; the examiner does not.
    const r2 = mineContradictions(s.agent, MASTER, "mind", { clock: () => (t += 10) });
    expect(r2.pairs[0]!.alreadyOnFile).toBe(true);
    expect(r2.mailed).toBe(0);
  });

  it("an embedding model widens the net to true synonyms the lexical eye cannot see", () => {
    let t = 1000;
    const s = createSession({ masterSeedHex: MASTER, sessionId: "wide", clock: () => (t += 10) });
    callTool(s, "remember", { about: "svc:db", attribute: "owner", value: "team-a" });
    callTool(s, "remember", { about: "svc:db", attribute: "maintainer", value: "team-b" });

    expect(lexicalSimilarity("owner", "maintainer")).toBeLessThan(0.6); // lexically strangers
    const model = new MockEmbeddingModel("mock-embed-v1", {
      owner: [1, 0.9],
      maintainer: [0.9, 1],
    });
    const r = mineContradictions(s.agent, MASTER, "mind", {
      similarity: embeddingSimilarity(model),
      comparator: model.id,
      threshold: 0.9,
      clock: () => (t += 10),
    });
    expect(r.comparator).toBe("mock-embed-v1");
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.entity).toBe("svc:db");
  });

  it("through the CLI: a one-vocabulary store exits clean; junk threshold rejected", () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "mind").code).toBe(0);
    runCli("remember", "svc:api", "owner", "team-a", "--store", "mind");

    const r = runCli("contradictions", "--store", "mind");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/one vocabulary/);

    expect(runCli("contradictions", "--store", "mind", "--threshold", "high").err).toMatch(
      /similarity in \(0, 1\]/,
    );
  });
});
