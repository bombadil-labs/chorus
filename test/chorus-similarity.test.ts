// The similarity seam (task 13): the brute witness runs everywhere; the sqlite-vec provider is
// exercised opportunistically wherever CHORUS_SQLITE_VEC points at a real extension binary.

import { describe, expect, it } from "vitest";
import { MockEmbeddingModel } from "../src/librarian.js";
import {
  BruteVectorIndex,
  SqliteVecIndex,
  openVectorIndex,
  similarTerms,
} from "../src/similarity.js";
import { nodeSqliteAvailable } from "../src/node-sqlite-store.js";
import { callTool, createSession } from "../src/mcp-server.js";

const vecConfigured =
  process.env["CHORUS_SQLITE_VEC"] !== undefined &&
  process.env["CHORUS_SQLITE_VEC"] !== "" &&
  nodeSqliteAvailable();

describe("the similarity seam: proximity proposes, judgment disposes", () => {
  it("brute index ranks by cosine, honors k, never throws on empty", () => {
    const index = new BruteVectorIndex();
    expect(index.similar([1, 0], 5)).toEqual([]);
    index.add("attr:vibe", [1, 0, 0]);
    index.add("attr:mood", [0.9, 0.1, 0]);
    index.add("attr:year", [0, 0, 1]);
    const hits = index.similar([1, 0, 0], 2);
    expect(hits.map((h) => h.id)).toEqual(["attr:vibe", "attr:mood"]);
    expect(hits[0]!.score).toBeCloseTo(1);
    expect(hits[1]!.score).toBeGreaterThan(0.9);
  });

  it("openVectorIndex degrades to brute with a reason, never an error", () => {
    expect(openVectorIndex({}).index.kind).toBe("brute");
    const broken = openVectorIndex({ CHORUS_SQLITE_VEC: "/no/such/extension" });
    expect(broken.index.kind).toBe("brute");
    expect(broken.note).toMatch(/using the brute index/);
  });

  it("similarTerms proposes what the store talks about, nearest first", () => {
    const model = new MockEmbeddingModel("mock-1", {
      vibe: [1, 0, 0],
      "attr:vibe": [0.95, 0.05, 0],
      "attr:mood": [0.9, 0.1, 0],
      "movie:dune": [0, 1, 0],
      mood: [0.92, 0.08, 0],
    });
    const s = createSession({
      masterSeedHex: "0f".repeat(32),
      sessionId: "sim",
      clock: (() => {
        let t = 1000;
        return () => (t += 10);
      })(),
    });
    callTool(s, "remember", { about: "movie:dune", attribute: "attr:vibe", value: "epic" });
    callTool(s, "remember", { about: "movie:dune", attribute: "attr:mood", value: "somber" });

    const hits = similarTerms(s.agent, model, "vibe", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe("attr:vibe"); // my dialect's nearest term to your word
    // Judgment stays with the caller: nothing was written by proposing.
    expect(hits.every((h) => typeof h.score === "number")).toBe(true);
  });

  it.skipIf(!vecConfigured)(
    "sqlite-vec provider agrees with brute on ranking (opportunistic — needs the binary)",
    () => {
      const vec = new SqliteVecIndex(process.env["CHORUS_SQLITE_VEC"]!);
      try {
        const brute = new BruteVectorIndex();
        for (const [id, v] of [
          ["a", [1, 0, 0]],
          ["b", [0.9, 0.1, 0]],
          ["c", [0, 0, 1]],
        ] as const) {
          vec.add(id, v);
          brute.add(id, v);
        }
        expect(vec.similar([1, 0, 0], 2).map((h) => h.id)).toEqual(
          brute.similar([1, 0, 0], 2).map((h) => h.id),
        );
      } finally {
        vec.close();
      }
    },
  );
});
