#!/usr/bin/env node
// The `chorus` command. This file is the packaging skeleton (BACKLOG task 2): argument routing,
// help, version — each subcommand lands as its own slice (tasks 3–9) and replaces its stub here.
// Deliberately a tiny hand-rolled parser: the surface is a handful of subcommands with a few
// flags each, and a framework would be the heaviest dependency in the package.

import { createRequire } from "node:module";

interface CommandSpec {
  readonly summary: string; // one line for `chorus help`
  readonly slice?: string; // which backlog slice ships it (stub until then)
  run?(args: readonly string[]): Promise<number> | number;
}

const COMMANDS: Record<string, CommandSpec> = {
  init: {
    summary: "create ~/.chorus, mint or import the master seed, write config",
    slice: "task 3",
  },
  store: {
    summary: "create | ls | show | adopt — manage named stores in the registry",
    slice: "task 4",
  },
  serve: {
    summary: "serve one or more stores over MCP (--stdio | --http), the always-on node",
    slice: "task 5",
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
    console.error(`chorus: unknown command "${cmd}" — try \`chorus help\``);
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

// Direct run (both `node dist/cli.js` and `tsx src/cli.ts`).
const invoked = process.argv[1]?.replace(/\\/g, "/");
if (invoked !== undefined && (invoked.endsWith("/cli.js") || invoked.endsWith("/cli.ts"))) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    },
  );
}
