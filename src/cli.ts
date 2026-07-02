#!/usr/bin/env node
// The `chorus` command. This file is the packaging skeleton (BACKLOG task 2): argument routing,
// help, version — each subcommand lands as its own slice (tasks 3–9) and replaces its stub here.
// Deliberately a tiny hand-rolled parser: the surface is a handful of subcommands with a few
// flags each, and a framework would be the heaviest dependency in the package.

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { flagValue, parseFlags, redactSecrets, rejectUnknownFlags } from "./cli-args.js";
import { chorusHome, configPath, initChorusHome } from "./config.js";
import { storeCommand } from "./cli-store.js";
import { serveCommand } from "./cli-serve.js";

interface CommandSpec {
  readonly summary: string; // one line for `chorus help`
  readonly slice?: string; // which backlog slice ships it (stub until then)
  run?(args: readonly string[]): Promise<number> | number;
}

const COMMANDS: Record<string, CommandSpec> = {
  init: {
    summary: "create ~/.chorus, mint or import the master seed, write config",
    run(args): number {
      const { flags, rest } = parseFlags(args);
      if (rest.length > 0) {
        // Deliberately does NOT echo the value: `chorus init <seed>` is the natural typo for
        // `--seed <seed>`, and a seed must never reach an output stream.
        throw new Error(
          `init takes no positional arguments (importing a seed is \`chorus init --seed <hex>\`)`,
        );
      }
      rejectUnknownFlags(flags, new Set(["seed", "home"]), "init");
      const home = flagValue(flags, "home") ?? chorusHome();
      const seedHex = flagValue(flags, "seed");
      const result = initChorusHome({
        home,
        ...(seedHex === undefined ? {} : { seedHex }),
      });
      // The seed is NEVER printed — the public user author is the identity you can show around.
      if (result.created) {
        console.log(`initialized ${result.home}`);
        console.log(`you are ${result.userAuthor}`);
        console.log(`the master seed is in ${configPath(result.home)} — keep it private.`);
      } else {
        console.log(`already initialized at ${result.home} (you are ${result.userAuthor})`);
      }
      if (flagValue(flags, "home") !== undefined && flagValue(flags, "home") !== chorusHome()) {
        console.log(
          `note: other commands find this home only via CHORUS_HOME=${result.home} — set it.`,
        );
      }
      return 0;
    },
  },
  store: {
    summary: "create | ls | show | adopt — manage named stores in the registry",
    run(args): number {
      // `json` is boolean: it must never swallow a following positional (`show --json media`).
      const { flags, rest } = parseFlags(args, new Set(["json"]));
      const [sub, ...positionals] = rest;
      const home = flagValue(flags, "home");
      return storeCommand(sub, positionals, flags, {
        out: console.log,
        ...(home === undefined ? {} : { home }),
      });
    },
  },
  serve: {
    summary: "serve one or more stores over MCP (--stdio | --http), the always-on node",
    async run(args): Promise<number> {
      const { flags, lists, rest } = parseFlags(
        args,
        new Set(["stdio", "http"]),
        new Set(["store"]),
      );
      rejectUnknownFlags(
        flags,
        new Set(["stdio", "http", "port", "host", "token", "home", "store"]),
        "serve",
        lists,
      );
      if (rest.length > 0)
        throw new Error(`serve takes no positional arguments (got "${rest[0]}")`);
      const port = flagValue(flags, "port");
      const home = flagValue(flags, "home");
      const token = flagValue(flags, "token");
      const host = flagValue(flags, "host");
      if (port !== undefined && !/^\d+$/.test(port)) throw new Error("--port must be a number");
      return serveCommand(
        {
          stores: lists.get("store") ?? [],
          stdio: flags.has("stdio"),
          http: flags.has("http"),
          ...(port === undefined ? {} : { port: Number(port) }),
          ...(host === undefined ? {} : { host }),
          ...(token === undefined ? {} : { token }),
        },
        { out: console.log, ...(home === undefined ? {} : { home }) },
      );
    },
  },
  console: {
    summary: "the web console over the store(s)",
    slice: "task 6",
  },
  recall: { summary: "resolve an entity under the current trust policy", slice: "task 7" },
  remember: { summary: "assert a belief from the command line", slice: "task 7" },
  search: { summary: "substring search over surviving beliefs", slice: "task 7" },
  explain: { summary: "every candidate with receipts (author, session, model)", slice: "task 7" },
  decide: { summary: "record a decision pinned to exactly what was known", slice: "task 7" },
  replay: { summary: "replay a decision against the world it was made in", slice: "task 7" },
  gql: { summary: "pin a snapshot and query it as GraphQL", slice: "task 7" },
  migrate: { summary: "re-container a store between backends, digest-verified", slice: "task 9" },
};

function version(): string {
  // Read at runtime relative to this file: dist/cli.js and src/cli.ts sit one level below the
  // package root, so ../package.json resolves for both the built and the tsx-run form.
  const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
  return pkg.version;
}

function help(): string {
  const lines = Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(10)} ${c.summary}`);
  return [
    `chorus ${version()} — memory for agents; every belief is a signed claim.`,
    "",
    "Usage: chorus <command> [options]",
    "",
    ...lines,
    "",
    "  help       this text · --version the version",
    "",
    "Stores live under ~/.chorus. Environment: CHORUS_MASTER_SEED, CHORUS_STORE,",
    "CHORUS_STORE_BACKEND (jsonl | sqlite | node-sqlite; default: best available).",
  ].join("\n");
}

export async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(help());
    return 0;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log(version());
    return 0;
  }
  const spec = COMMANDS[cmd];
  if (spec === undefined) {
    console.error(redactSecrets(`chorus: unknown command "${cmd}" — try \`chorus help\``));
    return 1;
  }
  if (spec.run === undefined) {
    console.error(
      `chorus ${cmd}: not implemented yet — it ships as ${spec.slice} of the alpha burndown ` +
        `(see ROADMAP.md). The library surface already does this; the CLI wrapper is coming.`,
    );
    return 1;
  }
  return spec.run(rest);
}

// Direct run: `node dist/cli.js`, `tsx src/cli.ts`, AND the npm bin shim — which on POSIX is a
// SYMLINK named `chorus`, so argv[1] carries no cli.* suffix until realpath-resolved. Check the
// suffix on both the raw argv and its realpath; exit via exitCode (never process.exit) so async
// stdout pipes on Windows/macOS drain before the process ends.
const isDirectRun = (): boolean => {
  const arg = process.argv[1];
  if (arg === undefined) return false;
  const matches = (p: string): boolean => {
    const norm = p.replace(/\\/g, "/");
    return norm.endsWith("/cli.js") || norm.endsWith("/cli.ts");
  };
  if (matches(arg)) return true;
  try {
    return matches(realpathSync(arg));
  } catch {
    return false;
  }
};
if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(redactSecrets(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    },
  );
}
