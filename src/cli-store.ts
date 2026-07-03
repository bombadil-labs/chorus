// `chorus store …` (task 4): the registry subcommands, over the existing StoreRegistry. No
// destructive verb exists here on purpose — the ethos is grow-only (a later `forget` may
// DEREGISTER a store; data never deletes). `adopt` is the non-destructive, digest-verified
// import that will eventually carry the live pre-registry store into the registry — the source
// is only ever READ.

import { existsSync, statSync } from "node:fs";
import { DeltaSet } from "@rhizomes/rhizomatic";
import { flagValue, rejectUnknownFlags } from "./cli-args.js";
import { chorusHome, resolveMasterSeed, storesRoot } from "./config.js";
import { backendForPath, createBackend, type BackendKind } from "./store-tier.js";
import { StoreRegistry, type StoreTier } from "./stores.js";

const TIERS: readonly StoreTier[] = ["private", "federated"];
const KINDS: readonly BackendKind[] = ["jsonl", "sqlite", "node-sqlite"];

export interface StoreIo {
  readonly out: (line: string) => void;
  readonly home?: string;
}

// The CLI registry requires a real identity: silently signing a registry under the shared dev
// default would mint stores anyone could forge. The legacy npm-script surface keeps its default;
// the `chorus` command is honest instead. (Shared by every registry-backed subcommand — serve
// imports it too.)
export function openRegistry(io: StoreIo): {
  registry: StoreRegistry;
  home: string;
  seed: string;
} {
  const home = io.home ?? chorusHome();
  const seed = resolveMasterSeed(process.env, home);
  if (seed === undefined) {
    throw new Error(
      `no master seed found — run \`chorus init\` first (or set CHORUS_MASTER_SEED).`,
    );
  }
  return { registry: new StoreRegistry(storesRoot(home), seed), home, seed };
}

const tierOf = (raw: string | undefined): StoreTier | undefined => {
  if (raw === undefined) return undefined;
  if ((TIERS as readonly string[]).includes(raw)) return raw as StoreTier;
  throw new Error(`--tier must be one of: ${TIERS.join(" | ")}`);
};

const kindOf = (raw: string | undefined): BackendKind | undefined => {
  if (raw === undefined) return undefined;
  if ((KINDS as readonly string[]).includes(raw)) return raw as BackendKind;
  throw new Error(`--backend must be one of: ${KINDS.join(" | ")}`);
};

export function storeCommand(
  sub: string | undefined,
  positionals: readonly string[],
  flags: ReadonlyMap<string, string>,
  io: StoreIo,
): number {
  switch (sub) {
    case "create": {
      rejectUnknownFlags(flags, new Set(["tier", "backend", "home"]), "store create");
      const name = positionals[0];
      if (name === undefined)
        throw new Error("usage: chorus store create <name> [--tier …] [--backend …]");
      const { registry } = openRegistry(io);
      const existed = registry.list().some((m) => m.name === name);
      const store = registry.open(name, {
        ...(tierOf(flagValue(flags, "tier")) === undefined
          ? {}
          : { tier: tierOf(flagValue(flags, "tier"))! }),
        ...(kindOf(flagValue(flags, "backend")) === undefined
          ? {}
          : { backend: kindOf(flagValue(flags, "backend"))! }),
      });
      try {
        io.out(
          existed
            ? `store "${name}" already exists (${store.id})`
            : `created store "${name}" (${store.tier}) — ${store.id}`,
        );
      } finally {
        store.close();
      }
      return 0;
    }

    case "ls": {
      rejectUnknownFlags(flags, new Set(["json", "home"]), "store ls");
      const { registry } = openRegistry(io);
      const manifests = registry.list();
      if (flags.has("json")) {
        io.out(JSON.stringify(manifests, null, 2));
        return 0;
      }
      if (manifests.length === 0) {
        io.out("no stores yet — `chorus store create <name>`");
        return 0;
      }
      for (const m of manifests) {
        io.out(`${m.name.padEnd(16)} ${m.tier.padEnd(10)} ${m.backend.padEnd(12)} ${m.id}`);
      }
      return 0;
    }

    case "show": {
      rejectUnknownFlags(flags, new Set(["json", "home"]), "store show");
      const name = positionals[0];
      if (name === undefined) throw new Error("usage: chorus store show <name> [--json]");
      const { registry } = openRegistry(io);
      if (!registry.list().some((m) => m.name === name)) {
        throw new Error(`no store named "${name}" — see \`chorus store ls\``);
      }
      const store = registry.open(name);
      try {
        const all = store.backend.deltasSince(new Set());
        const info = {
          name: store.name,
          id: store.id,
          tier: store.tier,
          deltas: all.length,
          digest: DeltaSet.from(all).digest(),
        };
        if (flags.has("json")) {
          io.out(JSON.stringify(info, null, 2));
        } else {
          io.out(`${info.name} (${info.tier})`);
          io.out(`  id      ${info.id}`);
          io.out(`  deltas  ${info.deltas}`);
          io.out(`  digest  ${info.digest}`);
        }
      } finally {
        store.close();
      }
      return 0;
    }

    case "adopt": {
      rejectUnknownFlags(flags, new Set(["tier", "backend", "home"]), "store adopt");
      const [name, sourcePath] = positionals;
      if (name === undefined || sourcePath === undefined) {
        throw new Error("usage: chorus store adopt <name> <source-path> [--tier …] [--backend …]");
      }
      const { registry } = openRegistry(io);
      // A missing or empty source is an ERROR, never a silent no-op success — and constructing a
      // backend over a missing path would CREATE a file at the typo. An empty file is refused
      // too: content detection can't classify it, and a sqlite driver would write schema into
      // it, breaking the read-only promise below.
      if (!existsSync(sourcePath)) {
        throw new Error(`source ${sourcePath} does not exist — nothing to adopt.`);
      }
      if (statSync(sourcePath).size === 0) {
        throw new Error(`source ${sourcePath} is empty — nothing to adopt.`);
      }
      // The source's kind is detected by CONTENT (the same sniff every path-based surface uses),
      // and it is only ever read — adoption is non-destructive by construction, and the digest
      // check proves losslessness rather than promising it.
      const source = createBackend(sourcePath, backendForPath(sourcePath, {}));
      try {
        const result = registry.adopt(name, source, {
          ...(tierOf(flagValue(flags, "tier")) === undefined
            ? {}
            : { tier: tierOf(flagValue(flags, "tier"))! }),
          ...(kindOf(flagValue(flags, "backend")) === undefined
            ? {}
            : { backend: kindOf(flagValue(flags, "backend"))! }),
        });
        try {
          io.out(`adopted ${sourcePath} into "${name}": ${result.deltas} new delta(s)`);
          io.out(`digest verified lossless: ${result.digest}`);
          io.out(`the source file was only read — it is unchanged.`);
        } finally {
          result.store.close();
        }
      } finally {
        source.close?.();
      }
      return 0;
    }

    default:
      throw new Error(
        `chorus store: unknown subcommand "${sub ?? ""}" — expected create | ls | show | adopt`,
      );
  }
}

// `chorus migrate` (task 9): re-container a registry store between backends — lossless,
// digest-verified, old file left untouched (data never deletes). Within the sqlite family the
// two drivers share one file, so that flip is manifest-only.
export function migrateCommand(
  positionals: readonly string[],
  flags: ReadonlyMap<string, string>,
  io: StoreIo,
): number {
  const [name] = positionals;
  const backend = kindOf(flagValue(flags, "backend"));
  if (name === undefined || backend === undefined) {
    throw new Error("usage: chorus migrate <store> --backend <jsonl|sqlite|node-sqlite>");
  }
  const { registry } = openRegistry(io);
  if (!registry.list().some((m) => m.name === name)) {
    throw new Error(`no store named "${name}" — see \`chorus store ls\``);
  }
  const result = registry.migrate(name, backend);
  if (!result.migrated) {
    io.out(`"${name}" is already on ${backend} — nothing to do (${result.deltas} delta(s)).`);
  } else if (result.driverOnly) {
    io.out(`"${name}" → ${backend}: same file format, driver choice recorded. Zero bytes copied.`);
  } else {
    io.out(`"${name}" → ${backend}: ${result.deltas} delta(s) re-containered.`);
    io.out(`digest verified identical: ${result.digest}`);
    io.out(`the previous backend file was left in place — data never deletes.`);
  }
  return 0;
}
