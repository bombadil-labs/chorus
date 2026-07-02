// The `chorus` CLI skeleton (packaging slice): version, help, routing, and honest stubs. Runs
// the real entry file through tsx exactly the way `bin` runs the built dist/cli.js — argv-level
// contract tests, so later slices can't silently change the surface.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../src/cli.ts");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

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
});
