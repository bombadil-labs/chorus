// `chorus store …` (task 4): the registry subcommands, over the existing StoreRegistry. No
// destructive verb exists here on purpose — the ethos is grow-only (a later `forget` may
// DEREGISTER a store; data never deletes). `adopt` is the non-destructive, digest-verified
// import that will eventually carry the live pre-registry store into the registry — the source
// is only ever READ.

import { DeltaSet } from "@rhizomes/rhizomatic";
import { chorusHome, resolveMasterSeed, storesRoot } from "./config.js";
import { backendForPath, createBackend, type BackendKind } from "./store-tier.js";
import { StoreRegistry, type StoreTier } from "./stores.js";

const TIERS: readonly StoreTier[] = ["private", "federated"];
const KINDS: readonly BackendKind[] = ["jsonl", "sqlite", "node-sqlite"];

interface StoreIo {
  readonly out: (line: string) => void;
  readonly home?: string;
}

// The CLI registry requires a real identity: silently signing a registry under the shared dev
// default would mint stores anyone could forge. The legacy npm-script surface keeps its default;
// the `chorus` command is honest instead.
function openRegistry(io: StoreIo): { registry: StoreRegistry; home: string } {
  const home = io.home ?? chorusHome();
  const seed = resolveMasterSeed(process.env, home);
  if (seed === undefined) {
    throw new Error(
      `no master seed found — run \`chorus init\` first (or set CHORUS_MASTER_SEED).`,
    );
  }
  return { registry: new StoreRegistry(storesRoot(home), seed), home };
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
      const name = positionals[0];
      if (name === undefined)
        throw new Error("usage: chorus store create <name> [--tier …] [--backend …]");
      const { registry } = openRegistry(io);
      const existed = registry.list().some((m) => m.name === name);
      const store = registry.open(name, {
        ...(tierOf(flags.get("tier")) === undefined ? {} : { tier: tierOf(flags.get("tier"))! }),
        ...(kindOf(flags.get("backend")) === undefined
          ? {}
          : { backend: kindOf(flags.get("backend"))! }),
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
      const [name, sourcePath] = positionals;
      if (name === undefined || sourcePath === undefined) {
        throw new Error("usage: chorus store adopt <name> <source-path> [--tier …] [--backend …]");
      }
      const { registry } = openRegistry(io);
      // The source's kind is detected by CONTENT (the same sniff every path-based surface uses),
      // and it is only ever read — adoption is non-destructive by construction, and the digest
      // check proves losslessness rather than promising it.
      const source = createBackend(sourcePath, backendForPath(sourcePath, {}));
      try {
        const result = registry.adopt(name, source, {
          ...(tierOf(flags.get("tier")) === undefined ? {} : { tier: tierOf(flags.get("tier"))! }),
          ...(kindOf(flags.get("backend")) === undefined
            ? {}
            : { backend: kindOf(flags.get("backend"))! }),
        });
        try {
          io.out(`adopted ${sourcePath} into "${name}": ${result.deltas} new delta(s)`);
          io.out(`digest verified identical: ${result.digest}`);
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
