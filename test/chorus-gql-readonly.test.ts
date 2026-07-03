// The read-only GraphQL endpoint (task 12, Horizon 1's first primitive): a blog feed is an
// unauthenticated-someday, token-gated-today GET against a pinned-policy snapshot.

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

const root = mkdtempSync(join(tmpdir(), "chorus-gqlro-"));
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

describe("the read-only GraphQL endpoint", () => {
  let mcpUrl: string;
  let gqlUrl: string;

  beforeAll(async () => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "blog").code).toBe(0);
    expect(runCli("remember", "post:hello", "title", "Hello world", "--store", "blog").code).toBe(
      0,
    );
    expect(runCli("remember", "post:hello", "draft", "false", "--store", "blog").code).toBe(0);

    const server = spawn(
      process.execPath,
      [tsxCli, cliPath, "serve", "--store", "blog", "--http", "--port", "0", "--gql-readonly"],
      { env, stdio: ["ignore", "pipe", "inherit"] },
    );
    procs.push(server);
    const urls = await new Promise<Map<string, string>>((resolvePromise, reject) => {
      let out = "";
      const t = setTimeout(() => reject(new Error(`node never came up:\n${out}`)), 30_000);
      server.stdout!.on("data", (c: Buffer) => {
        out += c.toString();
        if (/gql\(ro\)/.test(out)) {
          const m = new Map<string, string>();
          for (const line of out.split("\n")) {
            const mcp = /^ {2}(\S+) {2}(http\S+)/.exec(line);
            if (mcp) m.set(mcp[1]!, mcp[2]!);
            const gql = /^ {2}gql\(ro\) (\S+) {2}(http\S+)/.exec(line);
            if (gql) m.set(`gql:${gql[1]!}`, gql[2]!);
          }
          if (m.has("gql:blog")) {
            clearTimeout(t);
            resolvePromise(m);
          }
        }
      });
      server.on("exit", (code) => reject(new Error(`node exited ${code}:\n${out}`)));
    });
    mcpUrl = urls.get("blog")!;
    gqlUrl = urls.get("gql:blog")!;
  }, 60_000);

  it("answers a GET query over the pinned-policy snapshot", async () => {
    const res = await fetch(`${gqlUrl}?query=${encodeURIComponent("{ posts { id title } }")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { posts?: Array<{ title: string }> } };
    expect(body.data?.posts?.[0]?.title).toBe("Hello world");
  });

  it("answers POST {query} too, and reports GraphQL errors in-band", async () => {
    const ok = await fetch(gqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ posts { id } }" }),
    });
    expect(ok.status).toBe(200);

    const bad = await fetch(gqlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ definitely_not_a_field }" }),
    });
    const badBody = (await bad.json()) as { errors?: unknown[] };
    expect(badBody.errors?.length).toBeGreaterThan(0);
  });

  it("is READ-ONLY and token-gated: nothing persists, junk tokens 404", async () => {
    // The endpoint answered queries above; the store's delta count must be unchanged.
    const show = JSON.parse(runCli("store", "show", "blog", "--json").out) as { deltas: number };
    const before = show.deltas;
    await fetch(`${gqlUrl}?query=${encodeURIComponent("{ posts { id } }")}`);
    const after = JSON.parse(runCli("store", "show", "blog", "--json").out) as { deltas: number };
    expect(after.deltas).toBe(before);

    const forged = await fetch(
      `${gqlUrl.replace(/\/gql\/[0-9a-f]+/, "/gql/deadbeef")}?query=${encodeURIComponent("{ posts { id } }")}`,
    );
    expect(forged.status).toBe(404);

    // And the MCP mount still works beside it.
    const mcp = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(mcp.status).toBe(200);
  });

  it("missing query is a 400, wrong method a 405", async () => {
    expect((await fetch(gqlUrl)).status).toBe(400);
    expect((await fetch(gqlUrl, { method: "PUT" })).status).toBe(405);
  });

  it("@union reads across every mount; individual mounts stay isolated", async () => {
    // A second store with its own world, served by a fresh union-capable node.
    expect(runCli("store", "create", "notes").code).toBe(0);
    expect(runCli("remember", "note:one", "title", "First note", "--store", "notes").code).toBe(0);

    const server = spawn(
      process.execPath,
      [
        tsxCli,
        cliPath,
        "serve",
        "--store",
        "blog",
        "--store",
        "notes",
        "--http",
        "--port",
        "0",
        "--gql-readonly",
      ],
      { env, stdio: ["ignore", "pipe", "inherit"] },
    );
    procs.push(server);
    const blogGql = await new Promise<string>((resolvePromise, reject) => {
      let out = "";
      const t = setTimeout(() => reject(new Error(`union node never came up:\n${out}`)), 30_000);
      server.stdout!.on("data", (c: Buffer) => {
        out += c.toString();
        const m = /gql\(ro\) blog {2}(http\S+)\s/.exec(out);
        if (m) {
          clearTimeout(t);
          resolvePromise(m[1]!);
        }
      });
      server.on("exit", (code) => reject(new Error(`union node exited ${code}:\n${out}`)));
    });
    const unionUrl = blogGql.replace(/\/blog$/, "/@union");

    // The union sees BOTH worlds in one schema…
    const both = (await (
      await fetch(`${unionUrl}?query=${encodeURIComponent("{ posts { title } notes { title } }")}`)
    ).json()) as { data?: { posts?: Array<{ title: string }>; notes?: Array<{ title: string }> } };
    expect(both.data?.posts?.[0]?.title).toBe("Hello world");
    expect(both.data?.notes?.[0]?.title).toBe("First note");

    // …while the single-store mount still has no idea notes exist.
    const only = (await (
      await fetch(`${blogGql}?query=${encodeURIComponent("{ notes { title } }")}`)
    ).json()) as { errors?: unknown[] };
    expect(only.errors?.length).toBeGreaterThan(0);
  }, 60_000);
});
