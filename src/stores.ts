// The product-level unit spec/12 §1 calls a "store": a NAMED, KEYED, federating instance — distinct
// from the persistence `StoreBackend` (store-tier.ts) it wraps. The single flat file never had the
// two things this gives a store: an IDENTITY keypair and a place in a REGISTRY. Later phases hang
// the private tier (encrypted backend), aggregation (subscribed peers), and federation (published
// queries) on this first-class thing; slice 2 (Phase A) establishes only identity + registry.
//
// A store's identity is a labeled child of the master seed (the identity.ts scheme): the master
// holder can re-derive and audit any store's key, and nobody else can forge one. A store is an
// AUTHOR too — its origin annotations and, later, its offered-lens signature are signed by this
// key — so StoreId is the same `ed25519:<pubkey>` author string a session or the user carries
// (spec/12 §2: author = who signs; a store signs as itself).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeltaSet, authorForSeed } from "@rhizomes/rhizomatic";
import { deriveSeed } from "./identity.js";
import {
  availableDriver,
  backendFromEnv,
  createBackend,
  type BackendKind,
  type StoreBackend,
} from "./store-tier.js";

// Two exposure postures (spec/12 §4). A `private` store publishes no lens — default-deny means it
// never federates — and (Phase B) is encrypted at rest. A `federated` store MAY publish queries.
export type StoreTier = "private" | "federated";

// A store's identity seed: deriveSeed(master, "store/<name>"). Deterministic, so opening the same
// name twice — or a fresh clone carrying the same master seed — yields the identical StoreId.
export const storeSeed = (masterSeedHex: string, name: string): string =>
  deriveSeed(masterSeedHex, `store/${name}`);

export interface StoreManifest {
  readonly name: string;
  readonly id: string; // StoreId = authorForSeed(storeSeed) — "ed25519:<pubkey>"
  readonly tier: StoreTier;
  readonly backend: BackendKind;
  readonly createdAt: number;
}

export interface AdoptResult {
  readonly store: Store;
  readonly deltas: number; // distinct deltas newly copied into the store
  readonly digest: string; // canonical digest, identical in source and adopted store
}

const MANIFEST = "store.json";
const BACKEND_FILE: Record<BackendKind, string> = {
  jsonl: "memory.jsonl",
  sqlite: "memory.sqlite",
  // Same file as `sqlite` on purpose: the two drivers share one format, so flipping a manifest
  // between them is a driver choice, never a data migration.
  "node-sqlite": "memory.sqlite",
};

// A named, keyed store: its identity plus the persistence backend it wraps. Constructed through a
// StoreRegistry, which owns the on-disk layout; construct directly only in tests.
export class Store {
  readonly name: string;
  readonly id: string;
  readonly seedHex: string;
  readonly tier: StoreTier;
  readonly backend: StoreBackend;
  // Where the backend file lives — the thing a serving process needs to open per-session
  // backends of its own (one backend per agent; see mcp-http.ts).
  readonly backendPath: string;
  // The manifest-recorded kind (the driver actually used may substitute within the family).
  readonly backendKind: BackendKind;

  constructor(opts: {
    manifest: StoreManifest;
    seedHex: string;
    backend: StoreBackend;
    backendPath: string;
  }) {
    this.name = opts.manifest.name;
    this.id = opts.manifest.id;
    this.tier = opts.manifest.tier;
    this.seedHex = opts.seedHex;
    this.backend = opts.backend;
    this.backendPath = opts.backendPath;
    this.backendKind = opts.manifest.backend;
  }

  close(): void {
    this.backend.close?.();
  }
}

// The registry: discovers and opens named stores under a root (default ~/.chorus/stores). Each
// store is a subdirectory holding a manifest (identity + tier + backend kind) and a backend file.
export class StoreRegistry {
  private readonly root: string;
  private readonly masterSeedHex: string;
  private readonly clock: () => number;

  constructor(root: string, masterSeedHex: string, clock: () => number = () => Date.now()) {
    this.root = root;
    this.masterSeedHex = masterSeedHex;
    this.clock = clock;
  }

  private dirOf(name: string): string {
    // A store name is a directory name, a URL path segment (mcp-http mounts), and a CLI token —
    // one conservative alphabet serves all three, and rejects path traversal ("../../evil")
    // and names list()/serve could never see again ("a/b").
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      throw new Error(
        `store name "${name}" is invalid — use letters/digits, then letters, digits, ".", "_", "-".`,
      );
    }
    return join(this.root, name);
  }

  // Every store the registry can see, by manifest, sorted by name.
  list(): StoreManifest[] {
    if (!existsSync(this.root)) return [];
    const out: StoreManifest[] = [];
    for (const name of readdirSync(this.root)) {
      const manifestPath = join(this.dirOf(name), MANIFEST);
      if (existsSync(manifestPath)) {
        out.push(JSON.parse(readFileSync(manifestPath, "utf8")) as StoreManifest);
      }
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // Open a store by name, creating its directory + manifest on first use. Identity is a pure
  // function of (master seed, name), so a re-open never re-mints; on an existing manifest we VERIFY
  // the stored id matches the derived one, so a wrong master seed or a tampered manifest fails
  // loudly rather than silently mis-signing.
  open(name: string, opts: { tier?: StoreTier; backend?: BackendKind } = {}): Store {
    const dir = this.dirOf(name);
    mkdirSync(dir, { recursive: true });
    const manifestPath = join(dir, MANIFEST);
    const seedHex = storeSeed(this.masterSeedHex, name);
    const id = authorForSeed(seedHex);

    let manifest: StoreManifest;
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as StoreManifest;
      if (manifest.id !== id) {
        throw new Error(
          `store "${name}": manifest id ${manifest.id} does not match the id derived from the ` +
            `master seed (${id}) — wrong CHORUS_MASTER_SEED, or a tampered manifest.`,
        );
      }
    } else {
      manifest = {
        name,
        id,
        tier: opts.tier ?? "federated",
        backend: opts.backend ?? backendFromEnv(),
        createdAt: this.clock(),
      };
      // Exclusive create: a concurrent open() of the same new name must not silently clobber a
      // manifest whose tier/backend differ — the loser re-reads and adopts the winner's record
      // (same wx-then-converge pattern as the config seed).
      try {
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        return this.open(name, opts);
      }
    }

    // The manifest records the kind chosen at creation; the DRIVER is a runtime substitution
    // within the shared-format family (availableDriver): a "node-sqlite" store opens via
    // better-sqlite3 on a Node that predates the builtin, and vice versa where the native addon
    // is missing. A store created anywhere opens everywhere — the manifest never strands data
    // behind a missing driver.
    const backendPath = join(dir, BACKEND_FILE[manifest.backend]);
    const backend = createBackend(backendPath, availableDriver(manifest.backend));
    return new Store({ manifest, seedHex, backend, backendPath });
  }

  // Re-container a store onto a different backend, LOSSLESSLY and NON-DESTRUCTIVELY: the new
  // backend file is written beside the old one (data never deletes — the old file stays as it
  // was), the digest is verified identical, and only then does the manifest record the new
  // kind. Within the sqlite family the two drivers share one file, so a "migration" between
  // them is a manifest-only driver choice — zero bytes copied.
  migrate(
    name: string,
    backend: BackendKind,
  ): { migrated: boolean; deltas: number; digest: string; driverOnly: boolean } {
    const store = this.open(name);
    try {
      const fromKind = store.backendKind;
      const manifestPath = join(this.dirOf(name), MANIFEST);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as StoreManifest;
      if (fromKind === backend) {
        const all = store.backend.deltasSince(new Set());
        return {
          migrated: false,
          deltas: all.length,
          digest: DeltaSet.from(all).digest(),
          driverOnly: false,
        };
      }
      const all = store.backend.deltasSince(new Set());
      const before = DeltaSet.from(all).digest();
      const driverOnly = BACKEND_FILE[fromKind] === BACKEND_FILE[backend];
      if (!driverOnly) {
        const destPath = join(this.dirOf(name), BACKEND_FILE[backend]);
        const dest = createBackend(destPath, availableDriver(backend));
        try {
          dest.appendDeltas(all);
          const after = DeltaSet.from(dest.deltasSince(new Set())).digest();
          if (after !== before) {
            throw new Error(`migrating "${name}" changed the delta set: ${before} -> ${after}`);
          }
        } finally {
          dest.close?.();
        }
      }
      writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, backend }, null, 2)}\n`);
      return { migrated: true, deltas: all.length, digest: before, driverOnly };
    } finally {
      store.close();
    }
  }

  // Adopt an existing store's deltas into a named registry store, NON-DESTRUCTIVELY and LOSSLESSLY.
  // The source backend is only READ; nothing about it changes. Because every delta is
  // content-addressed, "lossless" is an exact claim, not a hope: the adopted store's canonical
  // digest MUST equal the source's, or adoption refuses (it will not claim a success it can't
  // prove). Idempotent by delta id, so re-adopting the same source is a no-op union. This is how
  // the pre-registry ~/.chorus/memory.sqlite becomes the store named "personal" — not one delta
  // rewritten, no id changed (spec/12 §2 + CONSTELLATION.md §7).
  adopt(
    name: string,
    source: StoreBackend,
    opts: { tier?: StoreTier; backend?: BackendKind } = {},
  ): AdoptResult {
    const store = this.open(name, opts);
    try {
      // Read BOTH full sets first (deltasSince(∅) is cursor-independent, so already-used handles
      // are fine). "Lossless" is the exact claim that nothing on either side is lost: the result
      // must fingerprint as precisely the UNION of what the store held and what the source
      // holds. For the canonical case — adopting into a fresh store — that is exactly
      // "identical to the source"; adopting beside existing data verifies the union instead of
      // writing first and then throwing over a mismatch it caused itself.
      const existing = store.backend.deltasSince(new Set());
      const all = source.deltasSince(new Set());
      const expected = DeltaSet.from([...existing, ...all]).digest();
      const added = store.backend.appendDeltas(all);

      // DeltaSet.digest is a pure function of the (content-addressed) ids, so this is the exact
      // "no delta lost, none altered" claim — not an approximation.
      const after = DeltaSet.from(store.backend.deltasSince(new Set())).digest();
      if (after !== expected) {
        throw new Error(
          `adopting "${name}" changed the delta set: expected ${expected}, got ${after}`,
        );
      }
      return { store, deltas: added, digest: after };
    } catch (err) {
      store.close(); // the handle must not outlive a failed adoption
      throw err;
    }
  }
}
