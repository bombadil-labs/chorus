// Chorus over the network: the MCP server's streamable-HTTP transport. The protocol brain
// (handleRequest, chorus/mcp-server.ts) is transport-agnostic — stdio wraps it for local
// clients; this wraps it for remote ones (Claude Code/Desktop on other machines via
// `claude mcp add --transport http`, claude.ai web via a custom connector).
//
// The session mapping is the point: one Mcp-Session-Id = one SessionContext = one chorus
// session = ONE AUTHOR. A remote surface connecting twice is two sessions with two keypairs,
// exactly like two local processes.
//
// Auth, v0: a secret URL path segment (CHORUS_HTTP_TOKEN — required, the server refuses to
// start without it), because claude.ai's connector UI offers OAuth-or-nothing and cannot
// send custom headers. Clients that CAN send headers may use Authorization: Bearer instead.
// Bind 127.0.0.1 and put TLS in front (tailscale serve for tailnet reach, tailscale funnel
// for claude.ai's public reachability requirement). Real OAuth is a later slice.
//
//   npm run chorus:http   (CHORUS_HTTP_TOKEN, CHORUS_HTTP_PORT=4821, CHORUS_HTTP_HOST,
//                          CHORUS_MASTER_SEED, CHORUS_STORE)

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  backendForPath,
  createBackend,
  resolveEnvStore,
  type BackendKind,
  type StoreBackend,
} from "./store-tier.js";
import { createSession, handleRequest, type SessionContext } from "./mcp-server.js";
import { resolveMasterSeed } from "./config.js";

interface HttpSession {
  readonly ctx: SessionContext;
  // One StoreBackend per session, not per server: the backend's watermark assumes one agent per
  // instance (the stdio server is one process = one agent = one backend). Sharing an instance
  // across agents makes refresh skip deltas persisted for a sibling.
  readonly store: StoreBackend;
  readonly mountName: string; // the mount this session initialized against — it never migrates
  lastSeen: number;
}

// A store served by this node. One node can host several concurrently (the aggregator SHAPE —
// each store still resolves alone; union reads are constellation Phase C): the first mount is
// the default at /mcp/<token>, every mount is also addressable at /mcp/<token>/<name>.
export interface HttpStoreMount {
  readonly name: string;
  readonly storePath: string;
  readonly storeBackend?: BackendKind; // default: resolved from the path
}

export interface HttpServerOptions {
  readonly masterSeedHex: string;
  readonly storePath?: string; // single-store form…
  readonly storeBackend?: BackendKind; // …with its kind (default: resolved from env / path)
  readonly stores?: readonly HttpStoreMount[]; // multi-store form (wins over storePath)
  readonly token: string; // the secret path segment / bearer token
  readonly port?: number; // 0 = ephemeral
  readonly host?: string; // default 127.0.0.1 — TLS terminates in front of us
  readonly idleMs?: number; // prune sessions idle longer than this (default 2h)
  readonly clock?: () => number;
}

export interface HttpServerHandle {
  readonly server: Server;
  readonly port: number;
  readonly url: string; // the default mount: http://host:port/mcp/<token>
  readonly mounts: ReadonlyArray<{ name: string; url: string }>; // every named mount
  close(): void;
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

interface ResolvedMount {
  readonly name: string;
  readonly storePath: string;
  readonly kind: BackendKind;
}

// Tokens live inside the URL path, so their alphabet must never collide with the path grammar
// ('/', '?', '#', spaces…) — a token that breaks the grammar fails silently as endless 404s.
const TOKEN_SHAPE = /^[A-Za-z0-9._~-]+$/;

export function startHttpServer(opts: HttpServerOptions): Promise<HttpServerHandle> {
  if (!TOKEN_SHAPE.test(opts.token)) {
    throw new Error(
      "chorus http: the token must be non-empty and use only [A-Za-z0-9._~-] " +
        "(it is a URL path segment).",
    );
  }
  // Resolve every mount's backend ONCE for the server's lifetime — per-session resolution could
  // hand two sessions of one server different drivers for the same file if env mutates.
  const source: readonly HttpStoreMount[] =
    opts.stores !== undefined && opts.stores.length > 0
      ? opts.stores
      : opts.storePath !== undefined
        ? [
            {
              name: "",
              storePath: opts.storePath,
              ...(opts.storeBackend === undefined ? {} : { storeBackend: opts.storeBackend }),
            },
          ]
        : [];
  if (source.length === 0) throw new Error("chorus http: no store to serve (storePath or stores)");
  const mounts: readonly ResolvedMount[] = source.map((m) => ({
    name: m.name,
    storePath: m.storePath,
    kind: m.storeBackend ?? backendForPath(m.storePath),
  }));
  // Only NAMED mounts route by path segment; the legacy single-store mount ('') is reachable
  // solely through the exact default-path branches — otherwise /mcp/<token>/ would alias it.
  const byName = new Map(mounts.filter((m) => m.name !== "").map((m) => [m.name, m]));
  const defaultMount = mounts[0]!;
  const sessions = new Map<string, HttpSession>();
  const now = opts.clock ?? (() => Date.now());
  const idleMs = opts.idleMs ?? 2 * 60 * 60 * 1000;

  const prune = (): void => {
    const cutoff = now() - idleMs;
    for (const [id, s] of sessions) if (s.lastSeen < cutoff) sessions.delete(id);
  };

  // Constant-time credential check: compare digests, not strings — string === bails at the
  // first differing byte, and --host 0.0.0.0 is one flag away from network-visible timing.
  const tokenDigest = createHash("sha256").update(opts.token).digest();
  const tokenMatches = (candidate: string): boolean =>
    timingSafeEqual(createHash("sha256").update(candidate).digest(), tokenDigest);

  // Which mount (if any) a request addresses. Token-in-path: /mcp/<token> = the default mount,
  // /mcp/<token>/<name> = a named one. Bearer-header clients use /mcp and /mcp/<name>.
  const mountFor = (req: IncomingMessage, url: URL): ResolvedMount | undefined => {
    const path = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    if (path.startsWith("/mcp/")) {
      const segments = path.slice("/mcp/".length).split("/");
      if (segments.length <= 2 && tokenMatches(segments[0]!)) {
        return segments.length === 1 ? defaultMount : byName.get(segments[1]!);
      }
    }
    const auth = req.headers["authorization"];
    const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!tokenMatches(bearer)) return undefined;
    if (path === "/mcp") return defaultMount;
    if (path.startsWith("/mcp/")) return byName.get(path.slice("/mcp/".length));
    return undefined;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const mount = mountFor(req, url);
    if (mount === undefined) {
      res.writeHead(404).end(); // not 401: don't advertise that an endpoint (or a store) exists
      return;
    }
    if (req.method === "HEAD") {
      res.writeHead(200).end(); // protocol discovery
      return;
    }
    if (req.method === "GET") {
      res.writeHead(405, { allow: "POST, DELETE, HEAD" }).end(); // no server-push stream
      return;
    }
    const sessionHeader = req.headers["mcp-session-id"];
    const mcpSessionId = typeof sessionHeader === "string" ? sessionHeader : undefined;

    if (req.method === "DELETE") {
      if (mcpSessionId !== undefined) sessions.delete(mcpSessionId);
      res.writeHead(204).end(); // client terminated its session
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST, DELETE, HEAD" }).end();
      return;
    }

    let rpc: { id?: number | string | null; method?: string };
    let raw: string;
    try {
      raw = await readBody(req);
      rpc = JSON.parse(raw) as typeof rpc;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "parse error" },
        }),
      );
      return;
    }

    prune();
    // initialize mints the session; everything else must present its Mcp-Session-Id.
    let session: HttpSession;
    let mintedId: string | undefined;
    if (rpc.method === "initialize") {
      mintedId = randomBytes(16).toString("hex");
      const ctx = createSession({
        masterSeedHex: opts.masterSeedHex,
        sessionId: `${now()}-http-${mintedId.slice(0, 8)}`,
      });
      // The session binds to the mount it initialized against; later requests find the session
      // by id, so the binding — one session = one author = one store — never migrates.
      const store = createBackend(mount.storePath, mount.kind);
      store.refresh(ctx.agent);
      session = { ctx, store, mountName: mount.name, lastSeen: now() };
      sessions.set(mintedId, session);
    } else {
      const found = mcpSessionId === undefined ? undefined : sessions.get(mcpSessionId);
      if (found === undefined) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id ?? null,
            error: { code: -32001, message: "unknown or expired session — re-initialize" },
          }),
        );
        return;
      }
      if (found.mountName !== mount.name) {
        // A session may only speak through the mount it initialized against — accepting it on a
        // sibling path would silently operate on the WRONG store (and becomes a real cross-store
        // leak the day mounts get per-mount auth). Same 404 as any unknown session.
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id ?? null,
            error: {
              code: -32001,
              message: "session belongs to a different store — re-initialize",
            },
          }),
        );
        return;
      }
      session = found;
      session.lastSeen = now();
    }

    const response = handleRequest(
      session.ctx,
      JSON.parse(raw) as Parameters<typeof handleRequest>[1],
      {
        persist: () => session.store.persist(session.ctx.agent),
        refresh: () => session.store.refresh(session.ctx.agent),
      },
    );
    if (response === undefined) {
      res.writeHead(202).end(); // notification: accepted, no body
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      ...(mintedId === undefined ? {} : { "mcp-session-id": mintedId }),
    });
    res.end(JSON.stringify(response));
  };

  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      handle(req, res).catch((e: unknown) => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
          }),
        );
      });
    });
    // Without this, a routine port collision (EADDRINUSE — two nodes on the default port) is an
    // uncaught exception and this promise never settles.
    server.on("error", rejectPromise);
    server.listen(opts.port ?? 4821, opts.host ?? "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const base = `http://${opts.host ?? "127.0.0.1"}:${port}/mcp/${opts.token}`;
      resolvePromise({
        server,
        port,
        url: base,
        mounts: mounts.map((m) => ({
          name: m.name,
          url: m.name === "" ? base : `${base}/${m.name}`,
        })),
        close: () => server.close(),
      });
    });
  });
}

// Direct run: the remote chorus node.
if (
  process.argv[1] !== undefined &&
  process.argv[1].replace(/\\/g, "/").endsWith("src/mcp-http.ts")
) {
  const token = process.env["CHORUS_HTTP_TOKEN"];
  if (token === undefined || token === "") {
    console.error(
      "CHORUS_HTTP_TOKEN is required (the secret path segment). Generate one:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"",
    );
    process.exit(1);
  }
  // Env wins, then the config `chorus init` wrote, then the shared dev default.
  const masterSeedHex = resolveMasterSeed() ?? "0f".repeat(32);
  const envStore = resolveEnvStore();
  void startHttpServer({
    masterSeedHex,
    storePath: envStore.path,
    storeBackend: envStore.kind,
    token,
    port: Number(process.env["CHORUS_HTTP_PORT"] ?? 4821),
    ...(process.env["CHORUS_HTTP_HOST"] === undefined
      ? {}
      : { host: process.env["CHORUS_HTTP_HOST"] }),
  }).then((h) => {
    console.error(`chorus http: serving ${h.url} (one MCP session = one author)`);
  });
}
