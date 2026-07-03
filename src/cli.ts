#!/usr/bin/env node
// The `chorus` command: argument routing, help, version — every subcommand fully shipped.
// Deliberately a tiny hand-rolled parser: the surface is a handful of subcommands with a few
// flags each, and a framework would be the heaviest dependency in the package.

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { flagValue, parseFlags, portValue, redactSecrets, rejectUnknownFlags } from "./cli-args.js";
import { chorusHome, configPath, initChorusHome } from "./config.js";
import { migrateCommand, storeCommand } from "./cli-store.js";
import { consoleCommand, serveCommand } from "./cli-serve.js";
import { dataCommand, diffCommand } from "./cli-data.js";

interface CommandSpec {
  readonly summary: string; // one line for `chorus help`
  run(args: readonly string[]): Promise<number> | number;
}

// The direct data ops share one shape: positionals + flags → dataCommand, which routes through
// the same protocol brain the MCP servers use.
function dataOp(
  name: string,
  summary: string,
  opts: { booleans?: readonly string[]; allowed: readonly string[] },
): CommandSpec {
  return {
    summary,
    run(args): number {
      const { flags, rest } = parseFlags(args, new Set(opts.booleans ?? []));
      rejectUnknownFlags(flags, new Set(opts.allowed), name);
      const home = flagValue(flags, "home");
      return dataCommand(name, rest, flags, {
        out: console.log,
        ...(home === undefined ? {} : { home }),
      });
    },
  };
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
      const { flags, rest } = parseFlags(args, new Set(["json", "encrypted"]));
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
        new Set(["stdio", "http", "port", "host", "token", "home", "store", "gql-readonly"]),
        "serve",
        lists,
      );
      if (rest.length > 0)
        throw new Error(`serve takes no positional arguments (got "${rest[0]}")`);
      const port = portValue(flags);
      const home = flagValue(flags, "home");
      const token = flagValue(flags, "token");
      const host = flagValue(flags, "host");
      return serveCommand(
        {
          stores: lists.get("store") ?? [],
          stdio: flags.has("stdio"),
          http: flags.has("http"),
          ...(port === undefined ? {} : { port }),
          ...(host === undefined ? {} : { host }),
          ...(token === undefined ? {} : { token }),
          ...(flags.has("gql-readonly") ? { gqlReadonly: true } : {}),
        },
        { out: console.log, ...(home === undefined ? {} : { home }) },
      );
    },
  },
  console: {
    summary: "the web console over a store — the human's seat at the table",
    async run(args): Promise<number> {
      const { flags, rest } = parseFlags(args);
      rejectUnknownFlags(flags, new Set(["store", "port", "home"]), "console");
      if (rest.length > 0)
        throw new Error(`console takes no positional arguments (got "${rest[0]}")`);
      const storeName = flagValue(flags, "store");
      if (storeName === undefined) {
        throw new Error("console needs a --store <name> (see `chorus store ls`)");
      }
      const port = portValue(flags);
      const home = flagValue(flags, "home");
      return consoleCommand(
        { store: storeName, ...(port === undefined ? {} : { port }) },
        { out: console.log, ...(home === undefined ? {} : { home }) },
      );
    },
  },
  recall: dataOp("recall", "resolve an entity under the current trust policy", {
    booleans: ["all", "unified"],
    allowed: ["store", "home", "attribute", "all", "unified"],
  }),
  remember: dataOp("remember", "assert a belief from the command line (speaker: user)", {
    booleans: ["ref", "string", "json"],
    allowed: ["store", "home", "kind", "source", "confidence", "speaker", "ref", "string", "json"],
  }),
  search: dataOp("search", "substring search over surviving beliefs", {
    allowed: ["store", "home", "limit"],
  }),
  explain: dataOp("explain", "every candidate with receipts (author, session, model)", {
    allowed: ["store", "home", "attribute"],
  }),
  decide: dataOp("decide", "record a decision pinned to exactly what was known", {
    allowed: ["store", "home", "intent", "attribute"],
  }),
  replay: dataOp("replay", "replay a decision against the world it was made in", {
    allowed: ["store", "home"],
  }),
  diff: {
    summary: "two stores side by side — or one store against its own past",
    run(args): number {
      const { flags, lists, rest } = parseFlags(args, new Set(["json"]), new Set(["store"]));
      rejectUnknownFlags(flags, new Set(["json", "home", "from", "to", "store"]), "diff", lists);
      if (rest.length > 0) throw new Error(`diff takes no positional arguments (got "${rest[0]}")`);
      const home = flagValue(flags, "home");
      return diffCommand(lists.get("store") ?? [], flags, {
        out: console.log,
        ...(home === undefined ? {} : { home }),
      });
    },
  },
  bisect: dataOp("bisect", "find the instant a belief flipped, and who flipped it", {
    booleans: ["json"],
    allowed: ["store", "home", "attribute", "good", "bad", "json"],
  }),
  examine: dataOp("examine", "measure the store AND put the numbers on the record, signed", {
    booleans: ["json"],
    allowed: ["store", "home", "json"],
  }),
  review: dataOp("review", "replay standing decisions; mail the deciders whose ground moved", {
    booleans: ["json"],
    allowed: ["store", "home", "json"],
  }),
  challenge: dataOp("challenge", "ask stale beliefs to re-verify — the store refuses to rot", {
    booleans: ["json"],
    allowed: ["store", "home", "half-life", "json"],
  }),
  contradictions: dataOp(
    "contradictions",
    "propose near-synonym slots holding rival values — one question, two dialects",
    { booleans: ["json"], allowed: ["store", "home", "threshold", "json"] },
  ),
  skeptic: dataOp("skeptic", "doubt what rests on one voice; withdraw when the world answers", {
    booleans: ["all", "json"],
    allowed: ["store", "home", "all", "json"],
  }),
  checkup: dataOp("checkup", "every instrument in one pass — the store's daily physical", {
    booleans: ["all", "json"],
    allowed: ["store", "home", "all", "half-life", "json"],
  }),
  vitals: dataOp("vitals", "epistemic vitals: contested, concentration, staleness, churn", {
    booleans: ["json"],
    allowed: ["store", "home", "json"],
  }),
  gql: dataOp("gql", "pin a snapshot, run one GraphQL query, release it", {
    allowed: ["store", "home"],
  }),
  migrate: {
    summary: "re-container a store between backends, digest-verified",
    run(args): number {
      const { flags, rest } = parseFlags(args);
      rejectUnknownFlags(flags, new Set(["backend", "home"]), "migrate");
      const home = flagValue(flags, "home");
      return migrateCommand(rest, flags, {
        out: console.log,
        ...(home === undefined ? {} : { home }),
      });
    },
  },
  upgrade: {
    summary: "self-update the chorus CLI (available once published - ROADMAP Phase 4)",
    run(): number {
      // Honest stub until @rhizomes/chorus is on npm: a self-update against an unpublished
      // package can only lie.
      console.error(
        "chorus upgrade: not available yet - @rhizomes/chorus is not published (ROADMAP Phase " +
          "4). Once it is: npm i -g @rhizomes/chorus@latest.",
      );
      return 1;
    },
  },
};

export const commandNames = (): string[] => Object.keys(COMMANDS);

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
