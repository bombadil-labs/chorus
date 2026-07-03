// RETROSPECTIVE REPLAY (EPISTEME VI.1): the examiner acts. Phase V measured; this closes the
// loop — every standing decision is replayed against the present, and where its basis has
// moved (retracted, superseded, contested, or no longer verifying), the examiner files MAIL
// to the decision's author: "You acted on X on Tuesday. X is now known otherwise. The action
// may need revisiting." Consequence-tracking for agent decisions, at the personal scale.
//
// Two rules keep this honest:
//   - Mail and claims, never mutation. The review writes testimony; it never touches beliefs.
//   - Earn the interruption. Each verdict carries a fingerprint of exactly what moved; an
//     unchanged verdict is never re-mailed. New movement = new fingerprint = one new letter.

import { createHash } from "node:crypto";
import { authorForSeed, type Delta, type Pointer } from "@rhizomes/rhizomatic";
import { surviving, type ChorusAgent } from "./agent.js";
import { replayDecision, viewBasis } from "./decisions.js";
import { examinerSeed, introduceExaminer } from "./examiner.js";
import { messagePointers } from "./messages.js";
import { CHORUS_PREFIX, ROLE_DECISION_ABOUT, ROLE_DECISION_BASIS } from "./vocab.js";

// The review's own vocabulary: which decision a letter is about, and the fingerprint of the
// verdict it delivered (the idempotence key — same movement, same fingerprint, no second letter).
export const ROLE_REVIEW_OF = `${CHORUS_PREFIX}.review.of`;
export const ROLE_REVIEW_VERDICT = `${CHORUS_PREFIX}.review.verdict`;

export interface ReviewFinding {
  readonly decision: string; // the decision delta id
  readonly about: string;
  readonly intent: string;
  readonly asOf: number;
  readonly author: string; // who decided — where the mail goes
  readonly retractedSince: readonly string[]; // basis deltas negated after the act
  readonly superseded: boolean; // the same question resolves differently today
  readonly contested: boolean; // the slot now holds rival live values
  readonly verified: boolean; // the pinned basis still reproduces (false = investigate)
  readonly reasons: readonly string[]; // the human sentence fragments, ready to print
  readonly mailed: boolean; // a letter went out this run
  readonly alreadyOnFile: boolean; // same verdict previously delivered — no re-mail
  readonly messageId?: string;
}

export interface ReviewReport {
  readonly examiner: string;
  readonly examined: number;
  readonly standing: number; // decisions whose basis has not moved
  readonly findings: readonly ReviewFinding[];
  readonly mailed: number;
}

// A decision delta names its subject with the decision-about role; a retracted decision is no
// longer standing and draws no review.
const isDecision = (d: Delta): boolean =>
  d.claims.pointers.some((p) => p.role === ROLE_DECISION_ABOUT && p.target.kind === "entity");

const decisionField = (d: Delta, role: string): string | undefined => {
  for (const p of d.claims.pointers) {
    if (p.role === role && p.target.kind === "primitive") return String(p.target.value);
  }
  return undefined;
};

// Contested NOW, per attribute: rival live values from more than one author in any slot of the
// entity (or the one pinned attribute). Same bar as the vitals gauge — including its plurality
// exclusion: a set-valued slot (declared `attr:<name> plurality=set`) holds many values by
// design, so many authors contributing differently is a union, not a contest.
function contestedNow(agent: ChorusAgent, about: string, attribute?: string): boolean {
  const receipts = agent.explain(about, attribute);
  const slots = new Map<string, { values: Set<string>; authors: Set<string> }>();
  for (const r of receipts) {
    if (r.negated || r.value === undefined) continue;
    const key = r.attribute ?? "";
    const slot = slots.get(key) ?? { values: new Set<string>(), authors: new Set<string>() };
    slot.values.add(String(r.value));
    slot.authors.add(r.author);
    slots.set(key, slot);
  }
  const plural = (attr: string): boolean =>
    agent.explain(`attr:${attr}`, "plurality").some((r) => !r.negated && String(r.value) === "set");
  return [...slots.entries()].some(
    ([attr, s]) => s.values.size >= 2 && s.authors.size >= 2 && !plural(attr),
  );
}

const fingerprint = (parts: {
  decision: string;
  retracted: readonly string[];
  basisNow: string;
  contested: boolean;
  verified: boolean;
}): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        decision: parts.decision,
        retracted: [...parts.retracted].sort(),
        basisNow: parts.basisNow,
        contested: parts.contested,
        verified: parts.verified,
      }),
    )
    .digest("hex");

// Verdicts already delivered, keyed by fingerprint — only the examiner's own letters count.
// Shared by every examiner surface that promises not to nag (review, challenge).
export function verdictsOnFile(
  alive: readonly Delta[],
  examiner: string,
  role: string = ROLE_REVIEW_VERDICT,
): Set<string> {
  const seen = new Set<string>();
  for (const d of alive) {
    if (d.claims.author !== examiner) continue;
    for (const p of d.claims.pointers) {
      if (p.role === role && p.target.kind === "primitive") {
        seen.add(String(p.target.value));
      }
    }
  }
  return seen;
}

function letterBody(f: {
  intent: string;
  about: string;
  asOf: number;
  reasons: readonly string[];
  decision: string;
}): string {
  const when = new Date(f.asOf).toISOString();
  return (
    `On ${when} you decided "${f.intent}" about ${f.about}. Since then, ` +
    `${f.reasons.join("; ")}. The action may need revisiting — ` +
    `\`chorus replay ${f.decision}\` shows exactly what you saw.`
  );
}

// Replay every standing decision; mail the deciders whose ground has moved. Grow-only: the
// review's entire output is introductions, letters, and verdict fingerprints.
export function reviewDecisions(
  agent: ChorusAgent,
  masterSeedHex: string,
  storeName: string,
  opts: { clock?: () => number } = {},
): ReviewReport {
  const clock = opts.clock ?? (() => Date.now());
  const seed = examinerSeed(masterSeedHex);
  const examiner = authorForSeed(seed);
  const alive = surviving(agent);
  const decisions = alive
    .filter(isDecision)
    .sort((a, b) => a.claims.timestamp - b.claims.timestamp || (a.id < b.id ? -1 : 1));
  const onFile = verdictsOnFile(alive, examiner);

  const findings: ReviewFinding[] = [];
  let mailed = 0;
  let standing = 0;

  for (const d of decisions) {
    let replay;
    try {
      replay = replayDecision(agent, d.id);
    } catch {
      continue; // not a well-formed decision after all — not this tool's argument to win
    }
    const attribute = decisionField(d, `${ROLE_DECISION_ABOUT}.attribute`);
    const pinnedBasis = decisionField(d, ROLE_DECISION_BASIS) ?? "";
    const basisNow = viewBasis(
      agent.recall(replay.about, attribute === undefined ? {} : { attribute }),
    );
    const superseded = basisNow !== pinnedBasis;
    const contested = contestedNow(agent, replay.about, attribute);
    const moved = replay.retractedSince.length > 0 || superseded || contested || !replay.verified;
    if (!moved) {
      standing += 1;
      continue;
    }

    const reasons: string[] = [];
    if (replay.retractedSince.length > 0) {
      const n = replay.retractedSince.length;
      reasons.push(`${n} of the beliefs you relied on ${n === 1 ? "has" : "have"} been retracted`);
    }
    if (superseded) reasons.push("the question resolves differently today");
    if (contested) reasons.push("the slot is now contested");
    if (!replay.verified) reasons.push("the recorded basis no longer verifies (investigate)");

    const print = fingerprint({
      decision: d.id,
      retracted: replay.retractedSince,
      basisNow,
      contested,
      verified: replay.verified,
    });
    const alreadyOnFile = onFile.has(print);

    let messageId: string | undefined;
    if (!alreadyOnFile) {
      introduceExaminer(agent, seed, storeName, clock);
      const pointers: Pointer[] = [
        ...messagePointers({
          body: letterBody({
            intent: replay.intent,
            about: replay.about,
            asOf: replay.asOf,
            reasons,
            decision: d.id,
          }),
          to: { author: d.claims.author },
          about: [replay.about],
        }),
        { role: ROLE_REVIEW_OF, target: { kind: "delta", deltaRef: { delta: d.id } } },
        { role: ROLE_REVIEW_VERDICT, target: { kind: "primitive", value: print } },
      ];
      messageId = agent.recordAs(seed, { timestamp: clock(), pointers }).id;
      mailed += 1;
    }

    findings.push({
      decision: d.id,
      about: replay.about,
      intent: replay.intent,
      asOf: replay.asOf,
      author: d.claims.author,
      retractedSince: replay.retractedSince,
      superseded,
      contested,
      verified: replay.verified,
      reasons,
      mailed: messageId !== undefined,
      alreadyOnFile,
      ...(messageId === undefined ? {} : { messageId }),
    });
  }

  return {
    examiner,
    examined: decisions.length,
    standing,
    findings,
    mailed,
  };
}
