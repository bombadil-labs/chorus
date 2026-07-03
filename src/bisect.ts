// `chorus bisect` (EPISTEME V.3): git-bisect for a mind. Binary-search the as-of history for
// the instant a resolved view flipped, and hand back the delta — with its author, session, and
// model — that flipped it. Time-travel debugging for belief.
//
// The search space is honest: a resolved view can only change AT the timestamp of some delta
// that touches the entity, so we binary-search the sorted list of those instants — O(log n)
// as-of reads, not a scan. `as-of` was always the time machine; bisect is just the search
// pattern that makes it a debugger.

import type { Delta } from "@rhizomes/rhizomatic";
import type { ChorusAgent } from "./agent.js";
import { identityAt, identityIntroductions, type AuthorIdentity } from "./identity.js";

export interface BisectCulprit {
  readonly deltaId: string;
  readonly author: string;
  readonly timestamp: number;
  readonly model?: string;
  readonly sessionId?: string;
  readonly speaker: "user" | "session" | "unknown";
}

export interface BisectResult {
  readonly flipped: boolean;
  readonly entity: string;
  readonly attribute?: string;
  readonly before?: unknown; // the view the instant before the flip
  readonly after?: unknown; // the view at the flip
  readonly flippedAt?: number;
  readonly culprits?: readonly BisectCulprit[]; // every delta landing at the flip instant
  readonly probes: number; // how many as-of reads the search spent
}

export function bisectBelief(
  agent: ChorusAgent,
  entity: string,
  opts: { attribute?: string; good?: number; bad?: number; userAuthor?: string } = {},
): BisectResult {
  const attribute = opts.attribute;

  // The default baseline is the entity's BIRTH — its first mention — not the dawn of the
  // store: a debugger hunts changes to a belief that existed, and first-appearance-as-flip is
  // noise for that hunt (pass good: 0 to hunt the appearance itself). No mention anywhere =
  // nothing to bisect, honestly.
  const firstMention = agent.peer.reactor
    .arrivalLog()
    .filter((d: Delta) =>
      d.claims.pointers.some((p) => p.target.kind === "entity" && p.target.entity.id === entity),
    )
    .reduce<number | undefined>(
      (min, d) => (min === undefined || d.claims.timestamp < min ? d.claims.timestamp : min),
      undefined,
    );
  if (firstMention === undefined && opts.good === undefined) {
    return { flipped: false, entity, ...(attribute === undefined ? {} : { attribute }), probes: 0 };
  }
  const good = opts.good ?? firstMention;

  // Every instant at which the view COULD have changed. A flip can arrive through a delta that
  // never names the entity (a negation targets a DELTA, not the entity it retracts from), so
  // the only sound instant set is ALL delta timestamps — completeness first; binary search
  // makes the over-approximation cost log-factor probes, never correctness.
  const instants = [
    ...new Set(agent.peer.reactor.arrivalLog().map((d: Delta) => d.claims.timestamp)),
  ]
    .filter((t) => (good === undefined || t > good) && (opts.bad === undefined || t <= opts.bad))
    .sort((a, b) => a - b);

  let probes = 0;
  const viewAt = (t: number): string => {
    probes += 1;
    const view = agent.recall(entity, { asOf: t });
    const v =
      attribute === undefined
        ? view
        : { [attribute]: (view as Record<string, unknown>)[attribute] };
    return JSON.stringify(v ?? null);
  };

  if (instants.length === 0) {
    return { flipped: false, entity, ...(attribute === undefined ? {} : { attribute }), probes };
  }

  const goodT = good ?? instants[0]!;
  const badT = opts.bad ?? instants[instants.length - 1]!;
  const goodView = viewAt(goodT);
  const badView = viewAt(badT);
  if (goodView === badView) {
    // Nothing to hunt: the view at both ends is the same. Honest no-op.
    return { flipped: false, entity, ...(attribute === undefined ? {} : { attribute }), probes };
  }

  // Binary search: the first instant in `instants` whose view differs from goodView.
  let lo = 0;
  let hi = instants.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (viewAt(instants[mid]!) === goodView) lo = mid + 1;
    else hi = mid;
  }
  const flippedAt = instants[lo]!;

  // Every delta landing at the flip instant is a culprit candidate; resolve who they were.
  const intros = identityIntroductions(agent.snapshot(), opts.userAuthor ?? "");
  const speakerOf = (id: AuthorIdentity | undefined): "user" | "session" | "unknown" =>
    id === undefined ? "unknown" : id.kind === "user" ? "user" : "session";
  const culprits: BisectCulprit[] = agent.peer.reactor
    .arrivalLog()
    .filter((d) => d.claims.timestamp === flippedAt)
    .map((d) => {
      const who = identityAt(intros, d.claims.author, d.claims.timestamp);
      return {
        deltaId: d.id,
        author: d.claims.author,
        timestamp: d.claims.timestamp,
        speaker: speakerOf(who),
        ...(who !== undefined && who.kind === "session" && who.model !== undefined
          ? { model: who.model }
          : {}),
        ...(who !== undefined && who.kind === "session" && who.sessionId !== undefined
          ? { sessionId: who.sessionId }
          : {}),
      };
    });

  const beforeIdx = lo - 1;
  return {
    flipped: true,
    entity,
    ...(attribute === undefined ? {} : { attribute }),
    before: JSON.parse(beforeIdx >= 0 ? viewAt(instants[beforeIdx]!) : goodView) as unknown,
    after: JSON.parse(viewAt(flippedAt)) as unknown,
    flippedAt,
    culprits,
    probes,
  };
}
