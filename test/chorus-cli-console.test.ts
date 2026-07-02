// `chorus console` (task 6): the human's surface, driven through the real CLI against a temp
// home. A serve session writes; the console reads the same registry store.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-cli-console-"));
const home = join(root, "home");
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
  // Best-effort: a just-terminated child may hold its handles a beat longer than any retry
  // budget on a loaded Windows runner. The OS owns tmpdir cleanup; a leftover dir is not a
  // product signal and must not fail the suite.
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

describe("chorus console: the human's seat, end to end", () => {
  // Setup in beforeAll, not inside a test — every it() must survive isolation (-t / .only).
  beforeAll(() => {
    runCli("init");
    runCli("store", "create", "personal");
  });

  it("validates loudly: missing/unknown store", () => {
    expect(runCli("console").err).toMatch(/--store/);
    expect(runCli("console", "--store", "nope").err).toMatch(/no store named "nope"/);
  });

  it("serves the page and the live state over the registry store", async () => {
    // Write a belief through a real stdio serve session first.
    const server = spawn(
      process.execPath,
      [tsxCli, cliPath, "serve", "--store", "personal", "--stdio"],
      { env, stdio: ["pipe", "pipe", "inherit"] },
    );
    procs.push(server);
    const send = (obj: unknown) => server.stdin!.write(`${JSON.stringify(obj)}\n`);
    const replies: string[] = [];
    let buffered = "";
    server.stdout!.on("data", (c: Buffer) => {
      buffered += c.toString();
      for (;;) {
        const nl = buffered.indexOf("\n");
        if (nl === -1) break;
        replies.push(buffered.slice(0, nl));
        buffered = buffered.slice(nl + 1);
      }
    });
    const waitFor = (id: number) =>
      new Promise<void>((resolvePromise, reject) => {
        const t = setTimeout(() => reject(new Error(`no reply ${id}`)), 20_000);
        const tick = () => {
          if (replies.some((r) => r.includes(`"id":${id}`))) {
            clearTimeout(t);
            resolvePromise();
          } else setTimeout(tick, 50);
        };
        tick();
      });
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    await waitFor(1);
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "remember",
        arguments: { about: "user:myk", attribute: "editor", value: "emacs" },
      },
    });
    await waitFor(2);
    server.stdin!.end();

    // Now the console over the same store.
    const consoleProc = spawn(
      process.execPath,
      [tsxCli, cliPath, "console", "--store", "personal", "--port", "0"],
      { env, stdio: ["ignore", "pipe", "inherit"] },
    );
    procs.push(consoleProc);
    const url = await new Promise<string>((resolvePromise, reject) => {
      let out = "";
      const t = setTimeout(() => reject(new Error(`console never came up:\n${out}`)), 30_000);
      consoleProc.stdout!.on("data", (c: Buffer) => {
        out += c.toString();
        // Require a terminator after the URL — a pipe chunk can split mid-URL, and matching the
        // fragment would fetch a truncated port.
        const m = /(http:\/\/\S+)\s/.exec(out);
        if (m) {
          clearTimeout(t);
          resolvePromise(m[1]!);
        }
      });
      consoleProc.on("exit", (code) => reject(new Error(`console exited ${code}:\n${out}`)));
    });

    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Chorus console");

    const state = (await (await fetch(`${url}api/state`)).json()) as {
      deltas: number;
      userAuthor: string;
    };
    expect(state.deltas).toBeGreaterThan(0);
    expect(state.userAuthor.startsWith("ed25519:")).toBe(true);
  }, 60_000);
});
