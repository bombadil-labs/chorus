// CONTRADICTION MINING (EPISTEME VI.3): the contested scan sees rival values in ONE slot —
// but a store speaking two dialects can contradict itself across slots the scan will never
// compare: `deploy-env = "prod"` and `deployment_environment = "staging"` are the same
// question wearing different words. Proximity proposes those pairs; this module mails the
// judge; NOTHING auto-merges. A proposal is not a verdict, and vocabulary is testimony too.
//
// Similarity is a seam, not a dependency: the default is a lexical comparator (token overlap
// with abbreviation-aware prefixes — deterministic, zero deps, catches the dialect cases),
// and `embeddingSimilarity(model)` upgrades the same call to semantic neighbors the moment a
// real embedding model is wired (that choice is Myk's; the seam is ready).

import { createHash } from "node:crypto";
import { authorForSeed, type Delta, type Pointer } from "@bombadil/rhizomatic";
import { surviving, type ChorusAgent } from "./agent.js";
import { examinerSeed, introduceExaminer } from "./examiner.js";
import { cosine, type EmbeddingModel } from "./librarian.js";
import { messagePointers } from "./messages.js";
import { verdictsOnFile } from "./review.js";
import { CHORUS_PREFIX, ROLE_ABOUT, ROLE_KIND, ROLE_VALUE } from "./vocab.js";

export const ROLE_CONTRADICTION_VERDICT = `${CHORUS_PREFIX}.contradiction.verdict`;

export type Similarity = (a: string, b: string) => number; // [0, 1]; higher is closer

// Split an attribute name into comparable tokens: camelCase, kebab-case, snake_case, dots —
// all dialects of the same habit.
const tokens = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);

// Two tokens agree when equal or when one abbreviates the other (env/environment, repo/
// repository) — a prefix of length ≥ 3 is a deliberate shortening, not a coincidence.
const tokenMatch = (a: string, b: string): boolean =>
  a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));

// Token-level Jaccard with abbreviation-aware matching. "deploy-env" vs
// "deployment_environment" → both tokens match → 1.0; "owner" vs "region" → 0.
export const lexicalSimilarity: Similarity = (a, b) => {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const matchedA = ta.filter((x) => tb.some((y) => tokenMatch(x, y))).length;
  const matchedB = tb.filter((y) => ta.some((x) => tokenMatch(x, y))).length;
  return (matchedA + matchedB) / (ta.length + tb.length);
};

// The same comparator through a real model's eyes, the moment one is wired. Out-of-vocabulary
// terms fall back to the lexical view rather than pretending to know.
export const embeddingSimilarity = (model: EmbeddingModel): Similarity => {
  return (a, b) => {
    const va = model.embed(a);
    const vb = model.embed(b);
    if (va === undefined || vb === undefined) return lexicalSimilarity(a, b);
    return (cosine(va, vb) + 1) / 2; // cosine [-1,1] → [0,1]
  };
};

export interface ContradictionPair {
  readonly entity: string;
  readonly attributeA: string;
  readonly attributeB: string;
  readonly valuesA: readonly unknown[];
  readonly valuesB: readonly unknown[];
  readonly score: number;
  readonly mailed: boolean;
  readonly alreadyOnFile: boolean;
  readonly messageId?: string;
}

export interface ContradictionReport {
  readonly examiner: string;
  readonly comparator: string; // "lexical" or the embedding model's id
  readonly threshold: number;
  readonly pairs: readonly ContradictionPair[];
  readonly mailed: number;
}

interface SlotValues {
  readonly values: Set<string>; // canonical value keys, for comparison
  readonly display: unknown[]; // printable values, for the letter
}

// entity → attribute → live values. Measurements excluded, as everywhere: the panel's own
// needles are not a dialect.
function slotsByEntity(alive: readonly Delta[]): Map<string, Map<string, SlotValues>> {
  const entities = new Map<string, Map<string, SlotValues>>();
  for (const d of alive) {
    let entity: string | undefined;
    let attribute: string | undefined;
    let valueKey: string | undefined;
    let display: unknown;
    let kind: string | undefined;
    for (const p of d.claims.pointers) {
      if (
        p.role === ROLE_ABOUT &&
        p.target.kind === "entity" &&
        p.target.entity.context !== undefined
      ) {
        entity = p.target.entity.id;
        attribute = p.target.entity.context;
      } else if (p.role === ROLE_VALUE) {
        if (p.target.kind === "primitive") {
          valueKey = `p:${String(p.target.value)}`;
          display = p.target.value;
        } else if (p.target.kind === "entity") {
          valueKey = `e:${p.target.entity.id}`;
          display = { entity: p.target.entity.id };
        }
      } else if (p.role === ROLE_KIND && p.target.kind === "primitive") {
        kind = String(p.target.value);
      }
    }
    if (entity === undefined || attribute === undefined || valueKey === undefined) continue;
    if (kind === "measurement") continue;
    const attrs = entities.get(entity) ?? new Map<string, SlotValues>();
    const slot = attrs.get(attribute) ?? { values: new Set<string>(), display: [] };
    if (!slot.values.has(valueKey)) {
      slot.values.add(valueKey);
      slot.display.push(display);
    }
    attrs.set(attribute, slot);
    entities.set(entity, attrs);
  }
  return entities;
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((v) => b.has(v));

const fingerprint = (parts: {
  entity: string;
  attributes: readonly string[]; // sorted pair
  valuesA: readonly string[];
  valuesB: readonly string[];
}): string => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function letterBody(p: {
  entity: string;
  attributeA: string;
  attributeB: string;
  valuesA: readonly unknown[];
  valuesB: readonly unknown[];
  score: number;
}): string {
  return (
    `${p.entity} may be answering one question in two dialects: ` +
    `${p.attributeA} = ${JSON.stringify(p.valuesA)} but ${p.attributeB} = ` +
    `${JSON.stringify(p.valuesB)} (similarity ${p.score.toFixed(2)}). If these are the same ` +
    `question, the store contradicts itself and the contested scan cannot see it — recast the ` +
    `stray claims onto one attribute, or retract the wrong ones. If they are genuinely ` +
    `different questions, no action: this is a proposal, not a verdict, and proximity is not ` +
    `identity.`
  );
}

// Mine near-synonym attribute pairs with conflicting values; mail the judge (the human's
// console inbox). One letter per proposed pair, fingerprinted — the examiner does not nag.
export function mineContradictions(
  agent: ChorusAgent,
  masterSeedHex: string,
  storeName: string,
  opts: {
    similarity?: Similarity;
    comparator?: string; // label for the report; defaults to "lexical"
    threshold?: number;
    clock?: () => number;
  } = {},
): ContradictionReport {
  const clock = opts.clock ?? (() => Date.now());
  const similarity = opts.similarity ?? lexicalSimilarity;
  const comparator = opts.comparator ?? "lexical";
  const threshold = opts.threshold ?? 0.6;
  const seed = examinerSeed(masterSeedHex);
  const examiner = authorForSeed(seed);
  const alive = surviving(agent);
  const onFile = verdictsOnFile(alive, examiner, ROLE_CONTRADICTION_VERDICT);

  const pairs: ContradictionPair[] = [];
  let mailed = 0;

  for (const [entity, attrs] of [...slotsByEntity(alive).entries()].sort()) {
    const names = [...attrs.keys()].sort();
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i]!;
        const b = names[j]!;
        const score = similarity(a, b);
        if (score < threshold) continue;
        const slotA = attrs.get(a)!;
        const slotB = attrs.get(b)!;
        if (sameSet(slotA.values, slotB.values)) continue; // same answer twice is not a contradiction

        const print = fingerprint({
          entity,
          attributes: [a, b],
          valuesA: [...slotA.values].sort(),
          valuesB: [...slotB.values].sort(),
        });
        const alreadyOnFile = onFile.has(print);

        let messageId: string | undefined;
        if (!alreadyOnFile) {
          introduceExaminer(agent, seed, storeName, clock);
          const pointers: Pointer[] = [
            ...messagePointers({
              body: letterBody({
                entity,
                attributeA: a,
                attributeB: b,
                valuesA: slotA.display,
                valuesB: slotB.display,
                score,
              }),
              to: { user: true },
              about: [entity],
            }),
            { role: ROLE_CONTRADICTION_VERDICT, target: { kind: "primitive", value: print } },
          ];
          messageId = agent.recordAs(seed, { timestamp: clock(), pointers }).id;
          mailed += 1;
        }

        pairs.push({
          entity,
          attributeA: a,
          attributeB: b,
          valuesA: slotA.display,
          valuesB: slotB.display,
          score,
          mailed: messageId !== undefined,
          alreadyOnFile,
          ...(messageId === undefined ? {} : { messageId }),
        });
      }
    }
  }

  return { examiner, comparator, threshold, pairs, mailed };
}
