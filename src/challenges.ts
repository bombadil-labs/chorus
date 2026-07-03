// STALENESS CHALLENGES (EPISTEME VI.2): the store asks to be checked instead of silently
// rotting. Every live belief slot past its half-life draws one letter from the examiner to
// the voice that last spoke it — and the ask exploits the substrate's kindest property: in a
// grow-only store, RE-ASSERTION IS RE-VERIFICATION. Saying it again is a fresh signed claim
// at a fresh instant; retracting it is equally one gesture. Either answer beats silence.
//
// The half-life is yours to set (--half-life <days>); left unset, the store calibrates
// against itself — its own staleness p90 — so a fast-moving store challenges in days and an
// archive in months. Same anti-nag contract as review: one fingerprint per asked question;
// the slot moves (or the threshold does), the fingerprint moves, one new letter.

import { createHash } from "node:crypto";
import { authorForSeed, type Delta, type Pointer } from "@rhizomes/rhizomatic";
import { surviving, type ChorusAgent } from "./agent.js";
import { examinerSeed, introduceExaminer } from "./examiner.js";
import { messagePointers } from "./messages.js";
import { decisionBasisIds } from "./decisions.js";
import { verdictsOnFile } from "./review.js";
import { computeVitals } from "./vitals.js";
import { CHORUS_PREFIX, ROLE_ABOUT, ROLE_KIND, ROLE_VALUE } from "./vocab.js";

export const ROLE_CHALLENGE_OF = `${CHORUS_PREFIX}.challenge.of`;
export const ROLE_CHALLENGE_VERDICT = `${CHORUS_PREFIX}.challenge.verdict`;

const DAY_MS = 86_400_000;

export interface Challenge {
  readonly entity: string;
  readonly attribute: string;
  readonly newestDeltaId: string; // the freshest live claim in the slot — what the letter cites
  readonly author: string; // who last spoke it — where the letter goes
  readonly ageDays: number;
  readonly loadBearing: boolean; // a standing decision saw this claim when it acted
  readonly mailed: boolean;
  readonly alreadyOnFile: boolean;
  readonly messageId?: string;
}

export interface ChallengeReport {
  readonly examiner: string;
  readonly thresholdDays: number;
  readonly calibration: "half-life flag" | "store p90"; // where the threshold came from
  readonly slots: number; // live slots considered
  readonly challenges: readonly Challenge[];
  readonly mailed: number;
}

interface Slot {
  entity: string;
  attribute: string;
  newestTimestamp: number;
  newestDeltaId: string;
  newestAuthor: string;
  deltaIds: Set<string>; // every live claim in the slot, for the load-bearing check
}

// Live belief slots and their freshest testimony. Measurements are excluded — the gauge
// describes the world, and the examiner does not challenge its own needles.
function liveSlots(alive: readonly Delta[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const d of alive) {
    let entity: string | undefined;
    let attribute: string | undefined;
    let hasValue = false;
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
        hasValue = true;
      } else if (p.role === ROLE_KIND && p.target.kind === "primitive") {
        kind = String(p.target.value);
      }
    }
    if (entity === undefined || attribute === undefined || !hasValue) continue;
    if (kind === "measurement") continue;
    const key = `${entity}\u0000${attribute}`;
    const slot = slots.get(key) ?? {
      entity,
      attribute,
      newestTimestamp: -1,
      newestDeltaId: d.id,
      newestAuthor: d.claims.author,
      deltaIds: new Set<string>(),
    };
    slot.deltaIds.add(d.id);
    if (
      d.claims.timestamp > slot.newestTimestamp ||
      (d.claims.timestamp === slot.newestTimestamp && d.id < slot.newestDeltaId)
    ) {
      slot.newestTimestamp = d.claims.timestamp;
      slot.newestDeltaId = d.id;
      slot.newestAuthor = d.claims.author;
    }
    slots.set(key, slot);
  }
  return slots;
}

const fingerprint = (parts: {
  entity: string;
  attribute: string;
  newestDeltaId: string;
  thresholdDays: number;
}): string => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function letterBody(c: {
  entity: string;
  attribute: string;
  ageDays: number;
  thresholdDays: number;
  loadBearing: boolean;
  newestDeltaId: string;
}): string {
  const rests = c.loadBearing ? " A standing decision rests on it." : "";
  return (
    `Your last word on ${c.entity} ${c.attribute} is ${c.ageDays} day(s) old — past this ` +
    `store's half-life of ${c.thresholdDays} day(s), and nothing has confirmed or contradicted ` +
    `it since.${rests} If it still holds, say it again — a fresh assertion IS re-verification ` +
    `here. If it doesn't, retract it. Either answer beats silence; silence is how stores rot. ` +
    `(The claim in question: ${c.newestDeltaId})`
  );
}

// Challenge every live slot past the half-life: one letter per stale question, addressed to
// the voice that last answered it. Grow-only: letters and fingerprints, never mutation.
export function challengeStale(
  agent: ChorusAgent,
  masterSeedHex: string,
  storeName: string,
  opts: { halfLifeDays?: number; clock?: () => number } = {},
): ChallengeReport {
  const clock = opts.clock ?? (() => Date.now());
  const seed = examinerSeed(masterSeedHex);
  const examiner = authorForSeed(seed);
  const alive = surviving(agent);
  const slots = liveSlots(alive);

  const calibration = opts.halfLifeDays !== undefined ? "half-life flag" : "store p90";
  const thresholdDays =
    opts.halfLifeDays ??
    computeVitals(agent, clock()).staleness?.p90Days ??
    Number.POSITIVE_INFINITY;

  const onFile = verdictsOnFile(alive, examiner, ROLE_CHALLENGE_VERDICT);
  const cited = decisionBasisIds(agent, alive);

  const challenges: Challenge[] = [];
  let mailed = 0;
  const now = clock();

  for (const slot of [...slots.values()].sort(
    (a, b) => a.entity.localeCompare(b.entity) || a.attribute.localeCompare(b.attribute),
  )) {
    const ageDays = Math.floor((now - slot.newestTimestamp) / DAY_MS);
    if (ageDays <= thresholdDays) continue;
    const loadBearing = [...slot.deltaIds].some((id) => cited.has(id));

    const print = fingerprint({
      entity: slot.entity,
      attribute: slot.attribute,
      newestDeltaId: slot.newestDeltaId,
      thresholdDays,
    });
    const alreadyOnFile = onFile.has(print);

    let messageId: string | undefined;
    if (!alreadyOnFile) {
      introduceExaminer(agent, seed, storeName, clock);
      const pointers: Pointer[] = [
        ...messagePointers({
          body: letterBody({
            entity: slot.entity,
            attribute: slot.attribute,
            ageDays,
            thresholdDays,
            loadBearing,
            newestDeltaId: slot.newestDeltaId,
          }),
          to: { author: slot.newestAuthor },
          about: [slot.entity],
        }),
        {
          role: ROLE_CHALLENGE_OF,
          target: { kind: "delta", deltaRef: { delta: slot.newestDeltaId } },
        },
        { role: ROLE_CHALLENGE_VERDICT, target: { kind: "primitive", value: print } },
      ];
      messageId = agent.recordAs(seed, { timestamp: clock(), pointers }).id;
      mailed += 1;
    }

    challenges.push({
      entity: slot.entity,
      attribute: slot.attribute,
      newestDeltaId: slot.newestDeltaId,
      author: slot.newestAuthor,
      ageDays,
      loadBearing,
      mailed: messageId !== undefined,
      alreadyOnFile,
      ...(messageId === undefined ? {} : { messageId }),
    });
  }

  return { examiner, thresholdDays, calibration, slots: slots.size, challenges, mailed };
}
