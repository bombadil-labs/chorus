// `chorus serve` (task 5): the node. Registry-backed stores served over MCP — stdio for local
// clients (`claude mcp add … -- chorus serve --store personal --stdio`) or streamable HTTP for
// remote surfaces. Repeat --store to host several concurrently over one HTTP server (each store
// mounts at /mcp/<token>/<name>; the first is also the default at /mcp/<token>). This is the
// command that replaces the hand-rolled start-chorus-node script.

import { randomBytes } from "node:crypto";
import { availableDriver } from "./store-tier.js";
import { createSession, serve } from "./mcp-server.js";
import { openRegistry, type StoreIo } from "./cli-store.js";
import { startHttpServer, type HttpStoreMount } from "./mcp-http.js";
import { startConsole } from "./console.js";

export interface ServeArgs {
  readonly stores: readonly string[]; // registry store names; at least one
  readonly stdio: boolean;
  readonly http: boolean;
  readonly port?: number;
  readonly host?: string;
  readonly token?: string;
}

export async function serveCommand(args: ServeArgs, io: StoreIo): Promise<number> {
  if (args.stores.length === 0) {
    throw new Error("serve needs at least one --store <name> (see `chorus store ls`)");
  }
  if (args.stdio === args.http) {
    throw new Error("serve needs exactly one transport: --stdio or --http");
  }
  const { registry, seed } = openRegistry(io);
  const known = new Set(registry.list().map((m) => m.name));
  const seen = new Set<string>();
  for (const name of args.stores) {
    if (!known.has(name)) {
      throw new Error(
        `no store named "${name}" — create it first: \`chorus store create ${name}\``,
      );
    }
    if (seen.has(name)) throw new Error(`--store ${name} given twice`);
    seen.add(name);
  }

  if (args.stdio) {
    if (args.stores.length > 1) {
      throw new Error(
        "stdio serves exactly one store (one process = one session = one author); " +
          "use --http to host several",
      );
    }
    const store = registry.open(args.stores[0]!);
    const ctx = createSession({
      masterSeedHex: seed,
      sessionId:
        process.env["CHORUS_SESSION_ID"] ?? `${Date.now()}-${randomBytes(4).toString("hex")}`,
    });
    store.backend.refresh(ctx.agent);
    if (store.backend.wasteful?.(ctx.agent)) store.backend.compact?.(ctx.agent);
    // stdout is the MCP wire — never log to it. The process lives until stdin closes.
    serve(ctx, process.stdin, process.stdout, {
      persist: () => store.backend.persist(ctx.agent),
      refresh: () => store.backend.refresh(ctx.agent),
    });
    return 0;
  }

  // HTTP: the registry hands us each store's file + kind; the server opens one backend per
  // session itself, so close these discovery handles right away.
  const mounts: HttpStoreMount[] = args.stores.map((name) => {
    const store = registry.open(name);
    try {
      return {
        name,
        storePath: store.backendPath,
        storeBackend: availableDriver(store.backendKind),
      };
    } finally {
      store.close();
    }
  });
  // A minted token is a credential for the OPERATOR's terminal — printable, unlike the seed.
  const token = args.token ?? randomBytes(24).toString("hex");
  const handle = await startHttpServer({
    masterSeedHex: seed,
    stores: mounts,
    token,
    port: args.port ?? 4821,
    ...(args.host === undefined ? {} : { host: args.host }),
  });
  io.out(`chorus node up — ${mounts.length} store(s)`);
  for (const m of handle.mounts) io.out(`  ${m.name || args.stores[0]!}  ${m.url}`);
  if (args.token === undefined) {
    io.out(`(token minted for this run — treat the URLs as credentials)`);
  }
  return 0;
}

// `chorus console` (task 6): the human's web console over one registry store. Reuses the same
// registry discovery as serve; the console holds its own backend for its lifetime.
export interface ConsoleArgs {
  readonly store: string;
  readonly port?: number;
}

export async function consoleCommand(args: ConsoleArgs, io: StoreIo): Promise<number> {
  const { registry, seed } = openRegistry(io);
  if (!registry.list().some((m) => m.name === args.store)) {
    throw new Error(
      `no store named "${args.store}" — create it first: \`chorus store create ${args.store}\``,
    );
  }
  const store = registry.open(args.store);
  const storePath = store.backendPath;
  const storeBackend = availableDriver(store.backendKind);
  store.close(); // the console opens its own backend below
  const handle = await startConsole({
    storePath,
    storeBackend,
    masterSeedHex: seed,
    port: args.port ?? 4820,
  });
  io.out(`chorus console over "${args.store}" → ${handle.url}`);
  return 0;
}
