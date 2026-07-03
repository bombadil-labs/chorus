// The encrypted private store (task 16, Phase B): leak-safety is proven against the raw file
// bytes, never promised. The conformance suite runs it as a full StoreBackend witness.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { EncryptedSqliteStore, storeKeyHex } from "../src/encrypted-store.js";
import { openSqliteDriver } from "../src/store-tier.js";
import { betterSqliteAvailable } from "../src/sqlite-store.js";
import { nodeSqliteAvailable } from "../src/node-sqlite-store.js";
import { callTool, createSession } from "../src/mcp-server.js";
import { runStoreConformance } from "./chorus-store-conformance.test.js";

const canSqlite = betterSqliteAvailable() || nodeSqliteAvailable();
const KEY = "7a".repeat(32);

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-enc-"));
const home = join(root, "home");
const env = {
  ...process.env,
  CHORUS_HOME: home,
  CHORUS_MASTER_SEED: "",
  CHORUS_SEED_HEX: "",
  CHORUS_STORE_BACKEND: "",
};
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

// The encrypted backend is a FULL witness to the store contract.
if (canSqlite) {
  runStoreConformance({
    label: "encrypted",
    make: (path) => new EncryptedSqliteStore(path, KEY, openSqliteDriver),
  });
}

describe.skipIf(!canSqlite)("the encrypted private store: ciphertext at rest, proven", () => {
  it("the raw file leaks no plaintext; the wrong key fails loudly and modifies nothing", () => {
    const path = join(root, "vault.enc.sqlite");
    const store = new EncryptedSqliteStore(path, KEY, openSqliteDriver);
    const s = createSession({
      masterSeedHex: "0f".repeat(32),
      sessionId: "enc-writer",
      clock: (() => {
        let t = 1000;
        return () => (t += 10);
      })(),
    });
    callTool(s, "remember", {
      about: "person:therapist",
      attribute: "next-appointment",
      value: "tuesday-3pm-CONFIDENTIAL",
    });
    store.persist(s.agent);
    store.close();

    // THE claim: none of the belief's words survive in the file bytes.
    const raw = readFileSync(path).toString("latin1");
    for (const secret of ["CONFIDENTIAL", "therapist", "next-appointment", "tuesday"]) {
      expect(raw.includes(secret)).toBe(false);
    }

    // The right key reads everything back.
    const reader = new EncryptedSqliteStore(path, KEY, openSqliteDriver);
    try {
      const s2 = createSession({
        masterSeedHex: "0f".repeat(32),
        sessionId: "enc-reader",
        clock: (() => {
          let t = 90000;
          return () => (t += 10);
        })(),
      });
      reader.refresh(s2.agent);
      expect(callTool(s2, "recall", { entity: "person:therapist" })).toEqual({
        "next-appointment": "tuesday-3pm-CONFIDENTIAL",
      });
    } finally {
      reader.close();
    }

    // The wrong key: loud, named, nothing changed.
    const wrong = new EncryptedSqliteStore(path, "9b".repeat(32), openSqliteDriver);
    try {
      expect(() => wrong.deltasSince(new Set())).toThrow(/wrong master seed|tampered/);
    } finally {
      wrong.close();
    }
    expect(readFileSync(path).toString("latin1")).toBe(raw); // untouched by the failure
  });

  it("through the CLI: create --encrypted --tier private, write, recall, raw file opaque", () => {
    expect(runCli("init").code).toBe(0);
    const created = runCli("store", "create", "vault", "--tier", "private", "--encrypted");
    expect(created.code).toBe(0);
    expect(
      runCli("remember", "note:secret", "body", "the-passphrase-is-swordfish", "--store", "vault")
        .code,
    ).toBe(0);
    expect(JSON.parse(runCli("recall", "note:secret", "--store", "vault").out)).toEqual({
      body: "the-passphrase-is-swordfish",
    });
    const raw = readFileSync(join(home, "stores", "vault", "memory.enc.sqlite")).toString("latin1");
    expect(raw.includes("swordfish")).toBe(false);
    expect(raw.includes("note:secret")).toBe(false);
    // Migration of encrypted stores is refused loudly for now.
    expect(runCli("migrate", "vault", "--backend", "jsonl").err).toMatch(/encrypted/);
  });

  it("keys are per-store labeled children: sibling stores cannot read each other", () => {
    const master = "0f".repeat(32);
    expect(storeKeyHex(master, "vault")).not.toBe(storeKeyHex(master, "diary"));
    expect(storeKeyHex(master, "vault")).toMatch(/^[0-9a-f]{64}$/);
  });
});
