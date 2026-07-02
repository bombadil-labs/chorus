// The `chorus` CLI skeleton (packaging slice): version, help, routing, and honest stubs. Runs
// the real entry file through tsx exactly the way `bin` runs the built dist/cli.js — argv-level
// contract tests, so later slices can't silently change the surface.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const distCli = resolve(here, "../dist/cli.js");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

// The POSIX bin-shim shape: npm installs `chorus` as a SYMLINK to dist/cli.js, so argv[1] has
// no cli.* suffix until realpath-resolved. Reproduce it with a real symlink where the
// environment allows (needs dist built — `npm install` ran prepare — and symlink rights, which
// plain Windows users may lack; skip loudly otherwise, ubuntu CI always runs it).
const shimDir = mkdtempSync(join(tmpdir(), "chorus-cli-shim-"));
const shimPath = join(shimDir, "chorus");
const shimReady = ((): boolean => {
  if (!existsSync(distCli)) return false;
  try {
    symlinkSync(distCli, shimPath);
    return true;
  } catch {
    return false;
  }
})();
afterAll(() => rmSync(shimDir, { recursive: true, force: true }));

const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe("chorus CLI: the packaging skeleton", () => {
  it("--version prints the package version, exit 0", () => {
    const r = run("--version");
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(pkg.version);
  });

  it("help lists every planned subcommand, exit 0", () => {
    const r = run("help");
    expect(r.code).toBe(0);
    for (const cmd of ["init", "store", "serve", "console", "recall", "migrate"]) {
      expect(r.out).toContain(cmd);
    }
    // Bare `chorus` is help too.
    expect(run().out).toContain("Usage: chorus");
  });

  it("an unknown command fails loudly, naming itself", () => {
    const r = run("frobnicate");
    expect(r.code).toBe(1);
    expect(r.err).toContain('"frobnicate"');
  });

  it("a planned-but-unshipped command says which slice ships it, exit 1", () => {
    const r = run("serve");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not implemented yet/);
    expect(r.err).toMatch(/task \d/);
  });

  it.skipIf(!shimReady)("the npm bin shim shape (a symlink named `chorus`) runs main", () => {
    const r = spawnSync(process.execPath, [shimPath, "--version"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });
});
