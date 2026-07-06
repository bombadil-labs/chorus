// The cutover dress rehearsal (task 11): every step of claude_notes/CUTOVER.md, executed end to end against
// a SYNTHETIC stand-in for the live pre-registry store. The real ~/.chorus/memory.sqlite is
// never touched by anything in this repo — this test is how we know the runbook works before
// Myk runs it against the real thing.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DeltaSet } from "@bombadil/rhizomatic";
import { availableDriver, createBackend } from "../src/store-tier.js";
import { callTool, createSession } from "../src/mcp-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-cutover-"));
const home = join(root, "home");
// The "live" seed — in the real cutover this is the node's existing CHORUS_MASTER_SEED, so the
// user's identity (and every session's attribution) carries over unchanged.
const LIVE_SEED = "5e".repeat(32);
const env = {
  ...process.env,
  CHORUS_HOME: home,
  CHORUS_MASTER_SEED: "",
  CHORUS_SEED_HEX: "",
  CHORUS_STORE_BACKEND: "",
};

const procs: ChildProcess[] = [];
afterAll(async () => {
  await Promise.all(
    procs.map(
      (p) =>
        new Promise<void>((resolvePromise) => {
          if (p.exitCode !== null) return resolvePromise();
          const timer = setTimeout(resolvePromise, 5_000);
          p.once("exit", () => {
            clearTimeout(timer);
            resolvePromise();
          });
          p.kill();
        }),
    ),
  );
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    /* leave it to the OS temp cleaner */
  }
});

const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const clockFrom = (start: number) => {
  let t = start;
  return () => (t += 10);
};

// The synthetic live store: a pre-registry sqlite file at an arbitrary path, written by real
// sessions under the live seed — the same shape the monorepo node maintains today.
const livePath = join(root, "legacy", "memory.sqlite");
function seedLiveStore(): { digest: string; deltas: number } {
  const backend = createBackend(livePath, availableDriver("sqlite"));
  try {
    const s = createSession({
      masterSeedHex: LIVE_SEED,
      sessionId: "live-session-1",
      clock: clockFrom(1000),
    });
    callTool(s, "begin-session", { model: "claude-fable-5" });
    callTool(s, "remember", { about: "user:myk", attribute: "editor", value: "emacs" });
    callTool(s, "remember", {
      about: "work:dune-part-two",
      attribute: "rating",
      value: "5",
      speaker: "user",
    });
    callTool(s, "decide", { about: "work:dune-part-two", intent: "rewatch it" });
    backend.persist(s.agent);
    const all = backend.deltasSince(new Set());
    return { digest: DeltaSet.from(all).digest(), deltas: all.length };
  } finally {
    backend.close?.();
  }
}

const liveDigest = (): string => {
  const b = createBackend(livePath, availableDriver("sqlite"));
  try {
    return DeltaSet.from(b.deltasSince(new Set())).digest();
  } finally {
    b.close?.();
  }
};

describe("the cutover rehearsal: claude_notes/CUTOVER.md end to end, synthetically", () => {
  it("adopt → verify → trial-serve → interim writes → re-adopt union — the whole runbook", async () => {
    const live = seedLiveStore();

    // Step 1: init with the LIVE seed — identity continuity is the whole point.
    expect(runCli("init", "--seed", LIVE_SEED).code).toBe(0);

    // Step 2: adopt. The source is only read; the digest is verified and printed.
    const adopt = runCli("store", "adopt", "personal", livePath, "--tier", "private");
    expect(adopt.code).toBe(0);
    expect(adopt.out).toContain(live.digest);
    expect(liveDigest()).toBe(live.digest); // source content untouched

    // Step 3: verify through the CLI — the adopted world answers.
    const show = JSON.parse(runCli("store", "show", "personal", "--json").out) as {
      deltas: number;
      digest: string;
    };
    expect(show.digest).toBe(live.digest);
    expect(JSON.parse(runCli("recall", "user:myk", "--store", "personal").out)).toEqual({
      editor: "emacs",
    });
    // Receipts resolve the OLD session's introduction — attribution carried over.
    const receipts = JSON.parse(runCli("explain", "user:myk", "--store", "personal").out) as Array<{
      model?: string;
      sessionId?: string;
    }>;
    expect(receipts.some((r) => r.sessionId === "live-session-1")).toBe(true);

    // Step 4 (the trial period): the OLD node keeps running and takes more writes.
    const interim = createBackend(livePath, availableDriver("sqlite"));
    try {
      const s2 = createSession({
        masterSeedHex: LIVE_SEED,
        sessionId: "live-session-2",
        clock: clockFrom(50_000),
      });
      interim.refresh(s2.agent);
      callTool(s2, "remember", { about: "svc:api", attribute: "owner", value: "team-a" });
      interim.persist(s2.agent);
    } finally {
      interim.close?.();
    }

    // Step 5 (final cutover): re-adopt — an idempotent UNION picks up exactly the interim
    // writes. Trialing the new node never risks losing what the old one wrote meanwhile.
    const readopt = runCli("store", "adopt", "personal", livePath);
    expect(readopt.code).toBe(0);
    expect(readopt.out).toMatch(/adopted .*: [1-9]\d* new delta\(s\)/);
    expect(JSON.parse(runCli("recall", "svc:api", "--store", "personal").out)).toEqual({
      owner: "team-a",
    });

    // Step 6: the replacement node serves the adopted store over HTTP; a real MCP session
    // round-trips old and new beliefs.
    const server = spawn(
      process.execPath,
      [tsxCli, cliPath, "serve", "--store", "personal", "--http", "--port", "0"],
      { env, stdio: ["ignore", "pipe", "inherit"] },
    );
    procs.push(server);
    const url = await new Promise<string>((resolvePromise, reject) => {
      let out = "";
      const t = setTimeout(() => reject(new Error(`node never came up:\n${out}`)), 30_000);
      server.stdout!.on("data", (c: Buffer) => {
        out += c.toString();
        const m = /(http:\/\/\S+)\s/.exec(out);
        if (m) {
          clearTimeout(t);
          resolvePromise(m[1]!);
        }
      });
      server.on("exit", (code) => reject(new Error(`node exited ${code}:\n${out}`)));
    });

    let sessionId: string | undefined;
    const post = async (body: unknown) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
        },
        body: JSON.stringify(body),
      });
      sessionId = res.headers.get("mcp-session-id") ?? sessionId;
      return (await res.json()) as { result?: { content?: Array<{ text: string }> } };
    };
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await post({
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 1e9),
        method: "tools/call",
        params: { name, arguments: args },
      });
      return JSON.parse(r.result!.content![0]!.text) as unknown;
    };
    await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(await call("recall", { entity: "user:myk" })).toEqual({ editor: "emacs" });
    await call("begin-session", { model: "claude-fable-5" });
    await call("remember", { about: "proj:chorus", attribute: "status", value: "cutover-ready" });
    expect(await call("recall", { entity: "proj:chorus" })).toEqual({
      status: "cutover-ready",
    });

    // Rollback posture, verified: through ALL of the above, the live source only ever gained
    // what its own node wrote — the rehearsal never mutated it.
    expect(liveDigest()).not.toBe(live.digest); // it grew by ITS OWN interim writes…
    const finalLive = createBackend(livePath, availableDriver("sqlite"));
    try {
      const ids = new Set(finalLive.deltasSince(new Set()).map((d) => d.id));
      // …and by exactly those: the interim session's auto-introduction + its belief. Nothing
      // the rehearsal did — adopt, re-adopt, serve, MCP writes — ever reached the source.
      expect(ids.size).toBe(live.deltas + 2);
    } finally {
      finalLive.close?.();
    }
  }, 90_000);
});
