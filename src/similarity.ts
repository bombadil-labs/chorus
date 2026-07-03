// The similarity seam (task 13, Horizon 3): vectors live at the INDEX layer, never in the
// substrate — proximity PROPOSES candidates; signed judgments (the librarian's mapping claims)
// dispose. This module is the index seam with two providers:
//
//   - BruteVectorIndex: pure-TS cosine scan. Always available, zero deps, and honestly the
//     right tool at personal-store scale — the witness every environment can run.
//   - SqliteVecIndex: the sqlite-vec extension loaded into node:sqlite (allowExtension), for
//     when a store outgrows the scan. OPT-IN and never load-bearing: it needs an extension
//     binary this package does not ship (point CHORUS_SQLITE_VEC at it), and everything
//     degrades to brute when it's absent.
//
// openVectorIndex() picks: sqlite-vec if configured AND loadable, else brute — and says which.

import { createRequire } from "node:module";
import { cosine, type EmbeddingModel } from "./librarian.js";
import { nodeSqliteAvailable } from "./node-sqlite-store.js";
import type { ChorusAgent } from "./agent.js";

export interface VectorHit {
  readonly id: string;
  readonly score: number; // cosine similarity in [-1, 1]; higher is closer
}

export interface VectorIndex {
  readonly kind: "brute" | "sqlite-vec";
  add(id: string, vector: readonly number[]): void;
  similar(vector: readonly number[], k: number): VectorHit[];
  close?(): void;
}

// The always-available witness: a Map and a scan. At n vectors of dimension d, similar() is
// O(n·d) — exactly right until it measurably isn't.
export class BruteVectorIndex implements VectorIndex {
  readonly kind = "brute";
  private readonly vectors = new Map<string, readonly number[]>();

  add(id: string, vector: readonly number[]): void {
    this.vectors.set(id, vector);
  }

  similar(vector: readonly number[], k: number): VectorHit[] {
    const hits: VectorHit[] = [];
    for (const [id, v] of this.vectors) hits.push({ id, score: cosine(vector, v) });
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(0, k));
  }
}

// The scale provider: sqlite-vec's vec0 virtual table over an in-memory node:sqlite database.
// The vector store is DERIVED state — rebuildable at will — so :memory: is the honest default.
export class SqliteVecIndex implements VectorIndex {
  readonly kind = "sqlite-vec";
  private readonly db: import("node:sqlite").DatabaseSync;
  private dim: number | undefined;
  private next = 1;
  private readonly rowToId = new Map<number, string>();

  constructor(extensionPath: string) {
    const mod = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    this.db = new mod.DatabaseSync(":memory:", { allowExtension: true });
    this.db.enableLoadExtension(true);
    this.db.loadExtension(extensionPath);
    this.db.enableLoadExtension(false);
  }

  add(id: string, vector: readonly number[]): void {
    if (this.dim === undefined) {
      this.dim = vector.length;
      this.db.exec(
        `CREATE VIRTUAL TABLE vecs USING vec0(embedding float[${this.dim}] distance_metric=cosine)`,
      );
    }
    if (vector.length !== this.dim) {
      throw new Error(`vector dimension ${vector.length} != index dimension ${this.dim}`);
    }
    const rowid = this.next++;
    this.rowToId.set(rowid, id);
    this.db
      .prepare("INSERT INTO vecs (rowid, embedding) VALUES (?, ?)")
      .run(rowid, JSON.stringify(vector));
  }

  similar(vector: readonly number[], k: number): VectorHit[] {
    if (this.dim === undefined || k <= 0) return [];
    const rows = this.db
      .prepare(
        "SELECT rowid, distance FROM vecs WHERE embedding MATCH ? AND k = ? ORDER BY distance",
      )
      .all(JSON.stringify(vector), k) as unknown as Array<{ rowid: number; distance: number }>;
    return rows.map((r) => ({ id: this.rowToId.get(r.rowid)!, score: 1 - r.distance }));
  }

  close(): void {
    this.db.close();
  }
}

// Pick a provider and say which: sqlite-vec only when explicitly configured AND actually
// loadable — a missing binary degrades to brute with the reason, never an error.
export function openVectorIndex(env: NodeJS.ProcessEnv = process.env): {
  index: VectorIndex;
  note?: string;
} {
  const extension = env["CHORUS_SQLITE_VEC"];
  if (extension === undefined || extension === "") return { index: new BruteVectorIndex() };
  if (!nodeSqliteAvailable()) {
    return {
      index: new BruteVectorIndex(),
      note: `CHORUS_SQLITE_VEC set but node:sqlite is unavailable on ${process.version} — using the brute index`,
    };
  }
  try {
    return { index: new SqliteVecIndex(extension) };
  } catch (e) {
    return {
      index: new BruteVectorIndex(),
      note: `CHORUS_SQLITE_VEC failed to load (${e instanceof Error ? e.message : String(e)}) — using the brute index`,
    };
  }
}

// Fuzzy candidates over a live agent: embed what the store TALKS ABOUT (entity ids + attribute
// names), rank against the query text, return proposals. This is candidate GENERATION — what a
// caller (the librarian, a fuzzy search, a federated query bridge) does with a candidate is a
// judgment that becomes a signed claim; nothing here writes anything.
export function similarTerms(
  agent: ChorusAgent,
  model: EmbeddingModel,
  text: string,
  k = 10,
  index: VectorIndex = new BruteVectorIndex(),
): VectorHit[] {
  const queryVec = model.embed(text);
  if (queryVec === undefined) return [];
  const seen = new Set<string>();
  for (const d of agent.peer.reactor.arrivalLog()) {
    for (const ptr of d.claims.pointers) {
      if (ptr.target.kind === "entity") {
        seen.add(ptr.target.entity.id);
        // A belief's ATTRIBUTE rides as the about-pointer's context (beliefPointers) — and
        // attributes are exactly the terms dialect-bridging wants to match fuzzily.
        if (ptr.target.entity.context !== undefined) seen.add(ptr.target.entity.context);
      } else if (ptr.target.kind === "primitive" && typeof ptr.target.value === "string") {
        seen.add(ptr.target.value);
      }
    }
  }
  for (const term of seen) {
    const v = model.embed(term);
    if (v !== undefined) index.add(term, v);
  }
  return index.similar(queryVec, k).filter((h) => h.id !== text);
}
