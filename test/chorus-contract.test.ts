// The compatibility contract (task 10). Two halves:
//
// 1. GOLDEN PINS: the MCP tool schemas and CLI command surface must match the checked-in
//    goldens byte-for-byte. Drift fails CI until `npx tsx tools/gen-goldens.ts` regenerates
//    them — so a breaking surface change is a decision someone made, never a side effect.
// 2. THE FORMAT-VERSION LADDER: older manifests upgrade on open (lossless, digest-neutral);
//    manifests from a NEWER chorus refuse loudly. Any version of Chorus must read any store it
//    ever wrote.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { TOOLS, callTool, createSession } from "../src/mcp-server.js";
import { commandNames } from "../src/cli.js";
import { MANIFEST_FORMAT_VERSION, StoreRegistry, type StoreManifest } from "../src/stores.js";

const here = dirname(fileURLToPath(import.meta.url));
const golden = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(here, "golden", name), "utf8"));

const dir = mkdtempSync(join(tmpdir(), "chorus-contract-"));
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const MASTER = "0f".repeat(32);
const clockFrom = (start: number) => {
  let t = start;
  return () => (t += 10);
};

describe("the compatibility contract", () => {
  it("MCP tool schemas match the golden — a surface change must be deliberate", () => {
    expect(JSON.parse(JSON.stringify(TOOLS))).toEqual(golden("mcp-tools.json"));
  });

  it("kind is an OPEN vocabulary: a minted kind round-trips with receipts", () => {
    // Myk's dogfooding request (inbox, 2026-06): the closed enum had no slot for an
    // interpretation/claim. The vocabulary is open now — the same posture as every id.
    const reg2 = new StoreRegistry(join(dir, "r-kind"), MASTER, clockFrom(1000));
    const store = reg2.open("kinds");
    try {
      const s = createSession({ masterSeedHex: MASTER, sessionId: "k", clock: clockFrom(2000) });
      callTool(s, "remember", {
        about: "film:last-jedi",
        attribute: "reading",
        value: "a thesis about failure and legacy",
        kind: "claim",
      });
      callTool(s, "remember", {
        about: "film:last-jedi",
        attribute: "vibe",
        value: "elegiac",
        kind: "hot-take", // minted on the fly — open vocabulary means OPEN
      });
      store.backend.persist(s.agent);
      const receipts = callTool(s, "explain", { entity: "film:last-jedi" }) as Array<{
        kind?: string;
      }>;
      const kinds = new Set(receipts.map((r) => r.kind));
      expect(kinds.has("claim")).toBe(true);
      expect(kinds.has("hot-take")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("the CLI command surface matches the golden", () => {
    expect([...commandNames()].sort()).toEqual(golden("cli-commands.json"));
  });

  it("new manifests carry the current format version", () => {
    const reg = new StoreRegistry(join(dir, "r-new"), MASTER, clockFrom(1000));
    reg.open("fresh").close();
    const manifest = JSON.parse(
      readFileSync(join(dir, "r-new", "fresh", "store.json"), "utf8"),
    ) as StoreManifest;
    expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
  });

  it("a pre-versioning manifest upgrades on open — lossless and digest-neutral", () => {
    const reg = new StoreRegistry(join(dir, "r-legacy"), MASTER, clockFrom(1000));
    // Write real data, then strip the version marker to fake the pre-versioning era.
    const store = reg.open("old");
    const s = createSession({ masterSeedHex: MASTER, sessionId: "w", clock: clockFrom(2000) });
    callTool(s, "remember", { about: "user:myk", attribute: "editor", value: "emacs" }, () =>
      store.backend.persist(s.agent),
    );
    const digestBefore = s.agent.digest();
    store.close();
    const manifestPath = join(dir, "r-legacy", "old", "store.json");
    const stamped = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    delete stamped["formatVersion"];
    writeFileSync(manifestPath, `${JSON.stringify(stamped, null, 2)}\n`);

    // Open again: the ladder stamps the version; the data reads back identically.
    const reopened = reg.open("old");
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as StoreManifest;
      expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
      const reader = createSession({
        masterSeedHex: MASTER,
        sessionId: "r",
        clock: clockFrom(9000),
      });
      reopened.backend.refresh(reader.agent);
      expect(reader.agent.digest()).toBe(digestBefore);
    } finally {
      reopened.close();
    }
  });

  it("a manifest from a NEWER chorus refuses loudly, naming the way out", () => {
    const reg = new StoreRegistry(join(dir, "r-future"), MASTER, clockFrom(1000));
    reg.open("tomorrow").close();
    const manifestPath = join(dir, "r-future", "tomorrow", "store.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest["formatVersion"] = MANIFEST_FORMAT_VERSION + 1;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(() => reg.open("tomorrow")).toThrow(/newer chorus|upgrade chorus/);
  });
});
