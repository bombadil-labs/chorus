// `chorus serve` (task 5): the node, driven end-to-end through the real CLI — stdio like a
// local `claude mcp add` client, HTTP like a remote surface, multi-store mounts like the
// eventual constellation node. All against a temp CHORUS_HOME.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-cli-serve-"));
const home = join(root, "home");
const env = {
  ...process.env,
  CHORUS_HOME: home,
  CHORUS_MASTER_SEED: "",
  CHORUS_SEED_HEX: "",
  CHORUS_STORE_BACKEND: "",
};

const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) p.kill();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

// A minimal line-oriented JSON-RPC client over a spawned stdio server.
function stdioClient(...serveArgs: string[]) {
  const proc = spawn(process.execPath, [tsxCli, cliPath, ...serveArgs], {
    env,
    stdio: ["pipe", "pipe", "inherit"],
  });
  procs.push(proc);
  let buffer = "";
  const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>();
  let nextId = 1;
  proc.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line === "") continue;
      const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
      if (msg.id !== undefined) pending.get(msg.id)?.(msg);
    }
  });
  const request = (method: string, params?: unknown): Promise<{ result?: unknown }> =>
    new Promise((resolvePromise) => {
      const id = nextId++;
      pending.set(id, resolvePromise);
      proc.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const r = await request("tools/call", { name, arguments: args });
    const content = (r.result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0]!.text) as unknown;
  };
  return { request, call, close: () => proc.stdin!.end() };
}

// Spawn an HTTP node and wait for its printed mount URLs.
async function httpNode(...serveArgs: string[]): Promise<Map<string, string>> {
  const proc = spawn(process.execPath, [tsxCli, cliPath, ...serveArgs], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  procs.push(proc);
  const urls = new Map<string, string>();
  let out = "";
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve never came up:\n${out}`)), 30_000);
    proc.stdout!.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      for (const line of out.split("\n")) {
        const m = /^ {2}(\S+) {2}(http\S+)/.exec(line);
        if (m) urls.set(m[1]!, m[2]!);
      }
      if (out.includes("chorus node up")) {
        // All mount lines follow the banner; resolve once the count matches the --store count.
        const wanted = serveArgs.filter((a) => a === "--store").length;
        if (urls.size >= wanted) {
          clearTimeout(timer);
          resolvePromise();
        }
      }
    });
    proc.on("exit", (code) => reject(new Error(`serve exited ${code}:\n${out}`)));
  });
  return urls;
}

function httpClient(base: string) {
  let sessionId: string | undefined;
  const post = async (body: unknown) => {
    const res = await fetch(base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
      },
      body: JSON.stringify(body),
    });
    sessionId = res.headers.get("mcp-session-id") ?? sessionId;
    return { status: res.status, rpc: (await res.json()) as { result?: unknown } };
  };
  const init = () => post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const { status, rpc } = await post({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e9),
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (status !== 200) throw new Error(`tools/call ${name}: HTTP ${status}`);
    const content = (rpc.result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0]!.text) as unknown;
  };
  return { init, call, sessionId: () => sessionId };
}

describe("chorus serve: the node, end to end", () => {
  it("validates its arguments loudly", () => {
    runCli("init");
    runCli("store", "create", "personal");
    runCli("store", "create", "media");

    expect(runCli("serve", "--stdio").err).toMatch(/--store/);
    expect(runCli("serve", "--store", "personal").err).toMatch(/--stdio or --http/);
    expect(runCli("serve", "--store", "nope", "--stdio").err).toMatch(/no store named "nope"/);
    expect(runCli("serve", "--store", "personal", "--store", "media", "--stdio").err).toMatch(
      /stdio serves exactly one store/,
    );
  });

  it("stdio: a real MCP session writes, a second process resumes the world", async () => {
    const a = stdioClient("serve", "--store", "personal", "--stdio");
    await a.request("initialize", {});
    await a.call("begin-session", { model: "claude-fable-5" });
    await a.call("remember", { about: "user:myk", attribute: "editor", value: "emacs" });
    a.close();

    const b = stdioClient("serve", "--store", "personal", "--stdio");
    await b.request("initialize", {});
    expect(await b.call("recall", { entity: "user:myk" })).toEqual({ editor: "emacs" });
    b.close();
  }, 30_000);

  it("http multi-store: each mount is its own world; the token gates everything", async () => {
    const urls = await httpNode(
      "serve",
      "--store",
      "personal",
      "--store",
      "media",
      "--http",
      "--port",
      "0",
    );
    const personalUrl = urls.get("personal")!;
    const mediaUrl = urls.get("media")!;
    expect(personalUrl).toBeDefined();
    expect(mediaUrl).toMatch(/\/media$/);

    const p = httpClient(personalUrl);
    await p.init();
    await p.call("remember", { about: "work:dune", attribute: "rating", value: "5" });
    expect(await p.call("recall", { entity: "work:dune" })).toEqual({ rating: "5" });

    // The sibling mount is a SEPARATE store: same node, different world.
    const m = httpClient(mediaUrl);
    await m.init();
    expect(await m.call("recall", { entity: "work:dune" })).toEqual({});

    // Junk token: 404, no information.
    const bad = await fetch(personalUrl.replace(/\/mcp\/[0-9a-f]+/, "/mcp/deadbeef"), {
      method: "POST",
      body: "{}",
    });
    expect(bad.status).toBe(404);

    // A session speaks ONLY through the mount it initialized against: personal's session id on
    // media's path is a 404, not a silent write to the wrong store.
    const cross = await fetch(mediaUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-session-id": p.sessionId()! },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "tools/call",
        params: { name: "recall", arguments: { entity: "work:dune" } },
      }),
    });
    expect(cross.status).toBe(404);
  }, 40_000);

  it("rejects tokens that break the URL path grammar, loudly and early", () => {
    const r = runCli("serve", "--store", "personal", "--http", "--token", "abc/def");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/URL path segment/);
  });
});
