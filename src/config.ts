// The CLI's home: ~/.chorus (override: CHORUS_HOME) — the config file holding the master seed,
// and the store registry root. Everything here is NON-DESTRUCTIVE by construction: an existing
// config is never rewritten, a mismatched import refuses loudly, and nothing else in the home
// directory is ever touched (on this machine ~/.chorus also holds the LIVE pre-registry store;
// init must be a safe operation beside it).
//
// Seed handling, v0: the seed lives in ~/.chorus/config.json with owner-only permissions where
// the platform honors them. OS keychain integration is a hardening note for later. NO surface
// ever prints the seed; the printable identity is the derived PUBLIC user author.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { authorForSeed } from "@rhizomes/rhizomatic";
import { userSeed } from "./identity.js";

export interface ChorusConfig {
  readonly version: 1;
  readonly masterSeed: string; // 64 hex chars. NEVER print it.
  readonly createdAt: number;
}

export function chorusHome(env: NodeJS.ProcessEnv = process.env): string {
  return env["CHORUS_HOME"] ?? join(homedir(), ".chorus");
}

export const configPath = (home: string): string => join(home, "config.json");
export const storesRoot = (home: string): string => join(home, "stores");

const SEED_SHAPE = /^[0-9a-f]{64}$/;

// Read + validate the config, or undefined when the file doesn't exist. A file that exists but
// doesn't parse/validate is an ERROR, never "no config" — silently treating a corrupt config as
// absent would invite re-init to mint a NEW seed over an identity that has history.
export function loadConfig(home: string): ChorusConfig | undefined {
  let raw: string;
  try {
    raw = readFileSync(configPath(home), "utf8");
  } catch (err) {
    // ONLY absence means "no config". A config that exists but can't be read (EACCES, EIO,
    // EMFILE…) must never be treated as absent — the fresh-init path would mint a new seed
    // over an identity that has history.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${configPath(home)} exists but is not valid JSON — refusing to touch it.`);
  }
  const cfg = parsed as Partial<ChorusConfig>;
  if (cfg.version !== 1 || typeof cfg.masterSeed !== "string" || !SEED_SHAPE.test(cfg.masterSeed)) {
    throw new Error(
      `${configPath(home)} exists but does not look like a chorus config (version 1 + a 64-hex ` +
        `masterSeed) — refusing to touch it.`,
    );
  }
  return cfg as ChorusConfig;
}

// The printable identity for a seed: the PUBLIC author id the user signs as. Safe to show.
export const userAuthorOf = (masterSeedHex: string): string =>
  authorForSeed(userSeed(masterSeedHex));

export interface InitResult {
  readonly created: boolean; // false = already initialized (a no-op re-run)
  readonly home: string;
  readonly userAuthor: string; // public — the thing init PRINTS instead of the seed
}

export function initChorusHome(opts: {
  home: string;
  seedHex?: string; // import an existing seed; omitted = mint fresh entropy
  clock?: () => number;
}): InitResult {
  const seedHex = opts.seedHex?.toLowerCase();
  if (seedHex !== undefined && !SEED_SHAPE.test(seedHex)) {
    throw new Error("--seed must be exactly 64 hex characters (32 bytes).");
  }

  const existing = loadConfig(opts.home);
  if (existing !== undefined) {
    // Idempotent re-run — but an IMPORT that disagrees with the standing identity is refused,
    // never merged: two seeds are two sovereign identities.
    if (seedHex !== undefined && seedHex !== existing.masterSeed) {
      throw new Error(
        `${configPath(opts.home)} already holds a different master seed — refusing to replace ` +
          `an identity that may have history. (Use a different CHORUS_HOME for a second one.)`,
      );
    }
    return { created: false, home: opts.home, userAuthor: userAuthorOf(existing.masterSeed) };
  }

  const config: ChorusConfig = {
    version: 1,
    masterSeed: seedHex ?? randomBytes(32).toString("hex"),
    createdAt: (opts.clock ?? Date.now)(),
  };
  mkdirSync(storesRoot(opts.home), { recursive: true }); // creates the home too
  // Exclusive create ("wx"): a concurrent init cannot silently clobber a seed written between
  // our check and our write — the loser re-reads and takes the idempotent path instead of
  // printing an identity whose seed no longer exists. Owner-only mode where the platform
  // honors it (POSIX); Windows falls back to default ACLs.
  try {
    writeFileSync(configPath(opts.home), `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return initChorusHome(opts); // someone else won the race — converge on their identity
  }
  return { created: true, home: opts.home, userAuthor: userAuthorOf(config.masterSeed) };
}

// The master seed every other command resolves: explicit env wins (the pre-CLI wiring keeps
// working, and legacy env seeds of any non-empty shape stay valid), else the config written by
// `chorus init`. A SET-BUT-EMPTY env var counts as absent — a lingering `export CHORUS_SEED_HEX=`
// must not beat a real config.
export function resolveMasterSeed(
  env: NodeJS.ProcessEnv = process.env,
  home: string = chorusHome(env),
): string | undefined {
  const fromEnv = env["CHORUS_MASTER_SEED"] || env["CHORUS_SEED_HEX"];
  return fromEnv || loadConfig(home)?.masterSeed;
}
