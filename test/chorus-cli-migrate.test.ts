// `chorus migrate` (task 9): lossless re-containering between backends, through the real CLI.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

const root = mkdtempSync(join(tmpdir(), "chorus-cli-migrate-"));
const home = join(root, "home");
const env = {
  ...process.env,
  CHORUS_HOME: home,
  CHORUS_MASTER_SEED: "",
  CHORUS_SEED_HEX: "",
  CHORUS_STORE_BACKEND: "",
};

afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const runCli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const storeDir = (name: string) => join(home, "stores", name);

describe("chorus migrate: lossless re-containering", () => {
  beforeAll(() => {
    expect(runCli("init").code).toBe(0);
    expect(runCli("store", "create", "notes", "--backend", "jsonl").code).toBe(0);
    expect(runCli("remember", "user:myk", "editor", "emacs", "--store", "notes").code).toBe(0);
    expect(runCli("remember", "svc:api", "owner", "team-a", "--store", "notes").code).toBe(0);
  });

  it("jsonl → sqlite family: re-containers, verifies digest, leaves the old file untouched", () => {
    const jsonlPath = join(storeDir("notes"), "memory.jsonl");
    const jsonlBytes = readFileSync(jsonlPath, "utf8");
    const before = JSON.parse(runCli("store", "show", "notes", "--json").out) as {
      deltas: number;
      digest: string;
    };

    const r = runCli("migrate", "notes", "--backend", "node-sqlite");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/re-containered|driver choice/);
    // The old JSONL is byte-identical, still in place — data never deletes.
    expect(readFileSync(jsonlPath, "utf8")).toBe(jsonlBytes);
    expect(existsSync(join(storeDir("notes"), "memory.sqlite"))).toBe(true);

    // The store reads back identically through the new backend.
    const after = JSON.parse(runCli("store", "show", "notes", "--json").out) as {
      deltas: number;
      digest: string;
    };
    expect(after.deltas).toBe(before.deltas);
    expect(after.digest).toBe(before.digest);
    expect(JSON.parse(runCli("recall", "user:myk", "--store", "notes").out)).toEqual({
      editor: "emacs",
    });
  });

  it("within the sqlite family a migration is manifest-only; same-kind is a no-op", () => {
    const r = runCli("migrate", "notes", "--backend", "sqlite");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/driver choice recorded|re-containered/);
    const again = runCli("migrate", "notes", "--backend", "sqlite");
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/already on sqlite/);
  });

  it("fails loudly on junk", () => {
    expect(runCli("migrate", "notes", "--backend", "postgres").err).toMatch(/--backend must be/);
    expect(runCli("migrate", "ghost", "--backend", "jsonl").err).toMatch(/no store named/);
    expect(runCli("migrate", "notes").err).toMatch(/usage: chorus migrate/);
    expect(runCli("upgrade").code).toBe(1);
    expect(runCli("upgrade").err).toMatch(/not published/);
  });
});
