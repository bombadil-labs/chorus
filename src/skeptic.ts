// THE RESIDENT SKEPTIC (EPISTEME VI.4): the loop's review culture, productized as a store
// inhabitant. Where corroboration is thin — a slot the whole world knows on ONE voice's word,
// and a standing decision resting on it — the skeptic appends a DOUBT-CLAIM. Doubt here is
// not a flag or a score column: it is a signed belief by a derived author, filed at
// `doubt:<entity>`, visible to recall and search, rankable and retractable like any claim.
// Tune the skeptic, distrust it, or fire it (retract its introduction); it argues back only
// with more claims.
//
// Two structural kindnesses:
//   - The store is its own ledger: a live doubt IS the idempotence key. No fingerprints —
//     while a doubt stands the skeptic stays quiet, and when a second voice corroborates the
//     slot, the skeptic WITHDRAWS its doubt (a negation with the corroborator named). Doubt
//     that cannot be satisfied is not skepticism; it is a grudge.
//   - Opt-in and narrow by default: only decision-cited single-voice slots draw doubt unless
//     --all widens it. Alert fatigue is the failure mode; the skeptic earns its voice.

import { authorForSeed, evalTerm, parseTerm, type Delta, type Pointer } from "@rhizomes/rhizomatic";
import { beliefPointers, type ChorusAgent } from "./agent.js";
import { deriveSeed } from "./identity.js";
import { introduceVoice } from "./examiner.js";
import { replayDecision } from "./decisions.js";
import { CHORUS_PREFIX, ROLE_ABOUT, ROLE_DECISION_ABOUT, ROLE_KIND, ROLE_VALUE } from "./vocab.js";

export const ROLE_DOUBT_OF = `${CHORUS_PREFIX}.doubt.of`;
export const DOUBT_PREFIX = "doubt:";

// One skeptic per master seed — a DIFFERENT voice from the examiner, with its own track
// record. You can trust the measurements and still fire the doubter.
export const skepticSeed = (masterSeedHex: string): string =>
  deriveSeed(masterSeedHex, "author/skeptic");

export interface Doubt {
  readonly entity: string;
  readonly attribute: string;
  readonly voice: string; // the lone author whose word the slot rests on
  readonly doubtedDeltaId: string; // the freshest claim in the slot
  readonly decisionCited: boolean;
  readonly appended: boolean; // a new doubt-claim was written this pass
  readonly alreadyDoubted: boolean; // a live doubt already stands — the skeptic stays quiet
  readonly doubtDeltaId?: string;
}

export interface Withdrawal {
  readonly entity: string;
  readonly attribute: string;
  readonly doubtDeltaId: string; // the doubt being withdrawn
  readonly reason: string;
}

export interface SkepticReport {
  readonly skeptic: string; // the skeptic's public author id
  readonly considered: number; // live slots examined
  readonly doubts: readonly Doubt[]; // thin slots, doubted or already under doubt
  readonly withdrawals: readonly Withdrawal[]; // doubts satisfied by corroboration (or mooted)
}

const surviving = (agent: ChorusAgent): Delta[] => {
  const result = evalTerm(parseTerm({ op: "mask", policy: "drop", in: "input" }), agent.snapshot());
  if (result.sort !== "dset") throw new Error("mask must yield a DSet");
  return [...result.set];
};

interface Slot {
  entity: string;
  attribute: string;
  authors: Set<string>;
  newestDeltaId: string;
  newestTimestamp: number;
  deltaIds: Set<string>;
}

// Live belief slots, with the voices behind them. Measurements and doubts are excluded: the
// gauge describes the world, and doubting doubt is philosophy, not hygiene.
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
    if (kind === "measurement" || kind === "doubt") continue;
    if (entity.startsWith(DOUBT_PREFIX)) continue;
    const key = `${entity}\u0000${attribute}`;
    const slot = slots.get(key) ?? {
      entity,
      attribute,
      authors: new Set<string>(),
      newestDeltaId: d.id,
      newestTimestamp: -1,
      deltaIds: new Set<string>(),
    };
    slot.authors.add(d.claims.author);
    slot.deltaIds.add(d.id);
    if (
      d.claims.timestamp > slot.newestTimestamp ||
      (d.claims.timestamp === slot.newestTimestamp && d.id < slot.newestDeltaId)
    ) {
      slot.newestTimestamp = d.claims.timestamp;
      slot.newestDeltaId = d.id;
    }
    slots.set(key, slot);
  }
  return slots;
}

// The skeptic's own standing doubts: live claims at doubt:<entity> with kind "doubt".
function standingDoubts(alive: readonly Delta[], skeptic: string): Map<string, Delta> {
  const doubts = new Map<string, Delta>(); // "entity\u0000attribute" → doubt delta
  for (const d of alive) {
    if (d.claims.author !== skeptic) continue;
    let entity: string | undefined;
    let attribute: string | undefined;
    let kind: string | undefined;
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
      }
    }
    if (kind !== "doubt" || entity === undefined || attribute === undefined) continue;
    if (!entity.startsWith(DOUBT_PREFIX)) continue;
    doubts.set(`${entity.slice(DOUBT_PREFIX.length)}\u0000${attribute}`, d);
  }
  return doubts;
}

// Every claim a standing decision saw when it acted — where thin testimony matters most.
function decisionBasisIds(agent: ChorusAgent, alive: readonly Delta[]): Set<string> {
  const cited = new Set<string>();
  for (const d of alive) {
    if (
      !d.claims.pointers.some((p) => p.role === ROLE_DECISION_ABOUT && p.target.kind === "entity")
    )
      continue;
    try {
      for (const r of replayDecision(agent, d.id).receipts) cited.add(r.deltaId);
    } catch {
      continue;
    }
  }
  return cited;
}

// One pass of the resident skeptic: doubt the thin, withdraw where the world answered.
export function skepticPass(
  agent: ChorusAgent,
  masterSeedHex: string,
  storeName: string,
  opts: { all?: boolean; clock?: () => number } = {},
): SkepticReport {
  const clock = opts.clock ?? (() => Date.now());
  const seed = skepticSeed(masterSeedHex);
  const skeptic = authorForSeed(seed);
  const alive = surviving(agent);
  const slots = liveSlots(alive);
  const doubtsOnRecord = standingDoubts(alive, skeptic);
  const cited = decisionBasisIds(agent, alive);

  const doubts: Doubt[] = [];
  const withdrawals: Withdrawal[] = [];

  // WITHDRAW first: a doubt whose slot now has a second voice (or no slot at all) is done.
  for (const [key, doubtDelta] of doubtsOnRecord) {
    const slot = slots.get(key);
    const [entity, attribute] = key.split("\u0000") as [string, string];
    if (slot !== undefined && slot.authors.size >= 2 && !slot.authors.has(skeptic)) {
      const others = [...slot.authors];
      const reason = `corroborated: ${others.length} voices now hold ${entity} ${attribute}`;
      agent.retractAs(seed, doubtDelta.id, reason, clock());
      withdrawals.push({ entity, attribute, doubtDeltaId: doubtDelta.id, reason });
      doubtsOnRecord.delete(key);
    } else if (slot === undefined) {
      const reason = `moot: nothing live remains at ${entity} ${attribute}`;
      agent.retractAs(seed, doubtDelta.id, reason, clock());
      withdrawals.push({ entity, attribute, doubtDeltaId: doubtDelta.id, reason });
      doubtsOnRecord.delete(key);
    }
  }

  // DOUBT second: single-voice slots, decision-cited first (and only, unless --all).
  for (const slot of [...slots.values()].sort(
    (a, b) => a.entity.localeCompare(b.entity) || a.attribute.localeCompare(b.attribute),
  )) {
    if (slot.authors.size !== 1) continue;
    const decisionCited = [...slot.deltaIds].some((id) => cited.has(id));
    if (!decisionCited && opts.all !== true) continue;
    const key = `${slot.entity}\u0000${slot.attribute}`;
    const voice = [...slot.authors][0]!;

    const alreadyDoubted = doubtsOnRecord.has(key);
    let doubtDeltaId: string | undefined;
    if (!alreadyDoubted) {
      introduceVoice(
        agent,
        seed,
        {
          model: "chorus-skeptic",
          sessionId: `skeptic-${storeName}`,
          purpose: "doubt what rests on one voice, and withdraw when the world answers",
        },
        clock,
      );
      const rests = decisionCited ? " A standing decision rests on it." : "";
      const pointers: Pointer[] = [
        ...beliefPointers({
          about: `${DOUBT_PREFIX}${slot.entity}`,
          attribute: slot.attribute,
          value:
            `uncorroborated: the whole store knows ${slot.entity} ${slot.attribute} on one ` +
            `voice's word.${rests} A second voice asserting it clears this doubt.`,
          kind: "doubt",
          source: "chorus skeptic",
        }),
        {
          role: ROLE_DOUBT_OF,
          target: { kind: "delta", deltaRef: { delta: slot.newestDeltaId } },
        },
      ];
      doubtDeltaId = agent.recordAs(seed, { timestamp: clock(), pointers }).id;
    }

    doubts.push({
      entity: slot.entity,
      attribute: slot.attribute,
      voice,
      doubtedDeltaId: slot.newestDeltaId,
      decisionCited,
      appended: doubtDeltaId !== undefined,
      alreadyDoubted,
      ...(doubtDeltaId === undefined ? {} : { doubtDeltaId }),
    });
  }

  return { skeptic, considered: slots.size, doubts, withdrawals };
}
