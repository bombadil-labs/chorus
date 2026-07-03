// The instrument panel's first gauge cluster (EPISTEME Phase V.1): epistemic vitals over one
// store. Read-only measurement — a pure function of the delta log and the surviving view; the
// examiner-as-author (measurements emitted as claims) is the NEXT slice, deliberately: measure
// first, testify later.
//
// Every metric here must trace to a decision someone would make differently — that is the bar
// (EPISTEME: "metrics chosen badly become vanity numbers"):
//   - sourceConcentration → "should I corroborate before trusting this store?"
//   - contested → "what does this store disagree with itself about?"
//   - retractionRate / churn → "how settled is this knowledge?"
//   - staleness → "what load-bearing beliefs haven't been looked at in months?"
//   - confidence.carried → "can calibration (Phase VII) even be computed here yet?"

import { surviving, type ChorusAgent } from "./agent.js";
import { ROLE_ABOUT, ROLE_CONFIDENCE, ROLE_KIND, ROLE_VALUE } from "./vocab.js";

export interface Vitals {
  readonly deltas: number; // everything ever appended (grow-only total)
  readonly liveBeliefs: number; // surviving belief claims (negated ones excluded)
  readonly entities: number; // distinct entities carrying live beliefs
  readonly authors: number; // distinct authors across the whole log
  readonly retractions: number; // negation deltas appended (history kept, of course)
  readonly retractionRate: number; // retractions / deltas
  readonly contested: number; // live single-valued slots where ≥2 authors hold ≥2 values
  // Herfindahl index over authors of LIVE beliefs, 0..1: 1/n for n equal voices, 1.0 for a
  // monologue. "How much of what this store believes rests on one voice?"
  readonly sourceConcentration: number;
  readonly staleness?: {
    readonly medianDays: number;
    readonly p90Days: number;
  };
  readonly confidence: { readonly carried: number; readonly mean?: number };
  readonly kinds: Readonly<Record<string, number>>;
}

const percentile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;

export function computeVitals(agent: ChorusAgent, now: number = Date.now()): Vitals {
  const all = agent.peer.reactor.arrivalLog();
  const live = surviving(agent);

  let retractions = 0;
  const authors = new Set<string>();
  for (const d of all) {
    authors.add(d.claims.author);
    if (d.claims.pointers.some((p) => p.role === "negates" && p.target.kind === "delta")) {
      retractions += 1;
    }
  }

  // Live BELIEFS: surviving deltas carrying the belief shape (an about-pointer with a context).
  const entities = new Set<string>();
  const kinds: Record<string, number> = {};
  const beliefAuthors = new Map<string, number>(); // author -> live belief count
  const slotValues = new Map<
    string,
    { values: Set<string>; authors: Set<string>; plural: boolean }
  >();
  const plural = new Set<string>();
  const ages: number[] = [];
  const confidences: number[] = [];
  let liveBeliefs = 0;

  for (const d of live) {
    let entity: string | undefined;
    let attribute: string | undefined;
    let valueKey: string | undefined;
    let kind = "observation";
    let confidence: number | undefined;
    for (const p of d.claims.pointers) {
      if (
        p.role === ROLE_ABOUT &&
        p.target.kind === "entity" &&
        p.target.entity.context !== undefined
      ) {
        entity = p.target.entity.id;
        attribute = p.target.entity.context;
      } else if (p.role === ROLE_KIND && p.target.kind === "primitive") {
        kind = String(p.target.value);
      } else if (p.role === ROLE_CONFIDENCE && p.target.kind === "primitive") {
        confidence = Number(p.target.value);
      } else if (p.role === ROLE_VALUE) {
        valueKey =
          p.target.kind === "primitive"
            ? `p:${String(p.target.value)}`
            : p.target.kind === "entity"
              ? `e:${p.target.entity.id}`
              : undefined;
      }
    }
    if (entity === undefined || attribute === undefined) continue;
    // The panel excludes its own needles: measurement claims (the examiner testimony)
    // describe the world and must not become part of the world they describe — else every
    // examine run inflates live-beliefs and the examiner devours the authorship index.
    if (kind === "measurement") continue;
    // Plurality declarations mark set-valued attributes: divergence there is union, not contest.
    if (entity.startsWith("attr:") && attribute === "plurality" && valueKey === "p:set") {
      plural.add(entity.slice("attr:".length));
    }
    liveBeliefs += 1;
    entities.add(entity);
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    beliefAuthors.set(d.claims.author, (beliefAuthors.get(d.claims.author) ?? 0) + 1);
    ages.push(Math.max(0, now - d.claims.timestamp));
    if (confidence !== undefined && Number.isFinite(confidence)) confidences.push(confidence);
    if (valueKey !== undefined) {
      const slotKey = `${entity}\u0000${attribute}`;
      const slot = slotValues.get(slotKey) ?? {
        values: new Set<string>(),
        authors: new Set<string>(),
        plural: false,
      };
      slot.values.add(valueKey);
      slot.authors.add(d.claims.author);
      slotValues.set(slotKey, slot);
    }
  }

  let contested = 0;
  for (const [slotKey, slot] of slotValues) {
    const attribute = slotKey.split("\u0000")[1]!;
    if (plural.has(attribute)) continue;
    if (slot.values.size >= 2 && slot.authors.size >= 2) contested += 1;
  }

  // Herfindahl over live-belief authorship shares.
  let hhi = 0;
  for (const count of beliefAuthors.values()) {
    const share = count / Math.max(1, liveBeliefs);
    hhi += share * share;
  }

  ages.sort((a, b) => a - b);
  const day = 24 * 60 * 60 * 1000;

  return {
    deltas: all.length,
    liveBeliefs,
    entities: entities.size,
    authors: authors.size,
    retractions,
    retractionRate: all.length === 0 ? 0 : retractions / all.length,
    contested,
    sourceConcentration: liveBeliefs === 0 ? 0 : hhi,
    ...(ages.length === 0
      ? {}
      : {
          staleness: {
            medianDays: Math.round(percentile(ages, 0.5) / day),
            p90Days: Math.round(percentile(ages, 0.9) / day),
          },
        }),
    confidence: {
      carried: confidences.length,
      ...(confidences.length === 0
        ? {}
        : { mean: confidences.reduce((a, b) => a + b, 0) / confidences.length }),
    },
    kinds,
  };
}
