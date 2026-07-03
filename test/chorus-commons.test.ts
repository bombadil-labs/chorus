// The schema commons seed (task 14): the four skills' conventions land as queryable
// hyperschema claims, self-hosting included.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { initChorusHome, storesRoot } from "../src/config.js";
import { StoreRegistry } from "../src/stores.js";
import { callTool, createSession } from "../src/mcp-server.js";
import { seedCommons } from "../tools/seed-commons.js";

const root = mkdtempSync(join(tmpdir(), "chorus-commons-"));
const home = join(root, "home");
const SEED = "0f".repeat(32);
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const clockFrom = (start: number) => {
  let t = start;
  return () => (t += 10);
};

describe("the schema commons: vocabulary as claims", () => {
  it("seeds, self-hosts, and answers through the standard surfaces", () => {
    initChorusHome({ home, seedHex: SEED });
    process.env["CHORUS_MASTER_SEED"] = ""; // config is the source of truth here
    const result = seedCommons({ home, storeName: "commons", clock: clockFrom(1000) });
    expect(result.deltas).toBeGreaterThan(40);

    const registry = new StoreRegistry(storesRoot(home), SEED);
    const store = registry.open("commons");
    try {
      const reader = createSession({
        masterSeedHex: SEED,
        sessionId: "commons-reader",
        clock: clockFrom(99000),
      });
      store.backend.refresh(reader.agent);

      // A skill's hyperschema answers: domain, source, and its declared attributes as a SET.
      expect(callTool(reader, "recall", { entity: "hyperschema:media-log" })).toMatchObject({
        domain: "media-log",
        source: "skills/media-log/chorus.md",
      });
      const declared = callTool(reader, "recall", {
        entity: "hyperschema:media-log",
        attribute: "declares",
        all: true,
      });
      expect(JSON.stringify(declared)).toContain("attr:rating");

      // Terms are entities with meaning: the fuzzy layer and humans read the same description.
      expect(callTool(reader, "recall", { entity: "attr:rating" })).toMatchObject({
        "value-shape": "number",
      });

      // SELF-HOSTING: the commons' own vocabulary is declared by the same mechanism.
      const commonsDecl = callTool(reader, "recall", {
        entity: "hyperschema:commons",
        attribute: "declares",
        all: true,
      });
      expect(JSON.stringify(commonsDecl)).toContain("attr:declares");

      // Receipts attribute every declaration to the seeder author — a registrar is an author.
      const receipts = callTool(reader, "explain", { entity: "attr:rating" }) as Array<{
        model?: string;
      }>;
      expect(receipts.some((r) => r.model === "commons-seeder")).toBe(true);

      // Re-seeding is a union no-op: content-addressed dedup absorbs it.
      const again = seedCommons({ home, storeName: "commons", clock: clockFrom(1000) });
      expect(again.deltas).toBe(result.deltas);
    } finally {
      store.close();
    }
  });
});
