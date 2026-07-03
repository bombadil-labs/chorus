// The examiner testifies (EPISTEME V.4): vitals emitted as ordinary signed claims by a derived
// EXAMINER AUTHOR — telemetry in the medium. This is the plan's load-bearing rule made real:
// the instruments live inside the epistemology they measure. The examiner has a keypair (a
// labeled child of the master seed), a track record, receipts on every measurement — and you
// can distrust it, rank it, or contest it exactly like any other voice in the store.
//
// Re-examination is a TIME SERIES for free: each run re-asserts the metrics; the policy's
// latest-wins read gives you current health, while the grow-only log keeps every prior reading
// — `chorus explain vitals:<store>` is the health history, `as-of` is the chart.

import { authorForSeed } from "@rhizomes/rhizomatic";
import { ChorusAgent, beliefPointers } from "./agent.js";
import { deriveSeed, identityIntroductions, identityPointers } from "./identity.js";
import { computeVitals, type Vitals } from "./vitals.js";

// The examiner's identity: one derived author per master seed — auditable by the master
// holder, forgeable by nobody, shared across stores (its track record is ITS OWN).
export const examinerSeed = (masterSeedHex: string): string =>
  deriveSeed(masterSeedHex, "author/examiner");

export interface Testimony {
  readonly examiner: string; // the examiner's public author id
  readonly subject: string; // vitals:<store> — where the measurements filed
  readonly recorded: number; // measurement claims written this run
  readonly vitals: Vitals;
}

// Introduce the examiner once — receipts should say WHO measures, not "unknown". The
// introduction is interval-bound like every identity claim; re-introducing every run would be
// noise, so it happens only when the store has never heard this voice. Returns 1 if a claim
// was written, 0 if the examiner was already on record. Shared by every examiner surface
// (testimony, review) so they stay one identity.
export function introduceExaminer(
  agent: ChorusAgent,
  seed: string,
  storeName: string,
  clock: () => number,
): number {
  const examiner = authorForSeed(seed);
  const alreadyIntroduced = [...identityIntroductions(agent.snapshot(), "").values()].some(
    (intros) => intros.some((i) => i.author === examiner),
  );
  if (alreadyIntroduced) return 0;
  agent.recordAs(seed, {
    timestamp: clock(),
    pointers: identityPointers({
      model: "chorus-examiner",
      sessionId: `examiner-${storeName}`,
      startedAt: clock(),
      purpose: "measure the store's epistemic vitals and put them on the record",
    }),
  });
  return 1;
}

// Measure the agent's world and put the numbers ON THE RECORD, signed by the examiner.
export function testifyVitals(
  agent: ChorusAgent,
  masterSeedHex: string,
  storeName: string,
  opts: { now?: number; clock?: () => number } = {},
): Testimony {
  const now = opts.now ?? Date.now();
  const clock = opts.clock ?? (() => Date.now());
  const seed = examinerSeed(masterSeedHex);
  const examiner = authorForSeed(seed);
  const subject = `vitals:${storeName}`;
  const vitals = computeVitals(agent, now);

  let recorded = introduceExaminer(agent, seed, storeName, clock);

  const measurements: Record<string, string | number | boolean> = {
    "live-beliefs": vitals.liveBeliefs,
    entities: vitals.entities,
    authors: vitals.authors,
    contested: vitals.contested,
    "source-concentration": Number(vitals.sourceConcentration.toFixed(4)),
    "retraction-rate": Number(vitals.retractionRate.toFixed(4)),
    ...(vitals.staleness === undefined
      ? {}
      : {
          "staleness-median-days": vitals.staleness.medianDays,
          "staleness-p90-days": vitals.staleness.p90Days,
        }),
    "confidence-carried": vitals.confidence.carried,
  };
  for (const [attribute, value] of Object.entries(measurements)) {
    agent.recordAs(seed, {
      timestamp: clock(),
      pointers: beliefPointers({
        about: subject,
        attribute,
        value,
        kind: "measurement",
        source: "chorus examine",
      }),
    });
    recorded += 1;
  }
  return { examiner, subject, recorded, vitals };
}
