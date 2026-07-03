# EPISTEME.md — the next five phases: from memory to belief

**The reframe (Myk, 2026-07-03):** treat Chorus not as a memory store but as an **epistemic
telemetry engine** — a thing known not for _memory_ but for _belief_.

**The finding:** this is not a pivot. It is the recorded north star (ROADMAP: "agent
accountability / behavioral provenance") surfacing as the product's actual name. Memory is what
every agent framework will ship as a feature. What nobody ships — what Chorus already is,
underneath the memory framing — is **belief accounting**: every belief signed, timestamped,
attributable, confidence-carrying, negatable-but-never-erasable, and replayable against exactly
what was known. Memory answers "what do I know?" Chorus answers the questions that matter when
minds act in the world: _what do you believe, since when, on whose word, with what confidence,
against what disagreement — and what became of that belief next?_

**The tagline this earns:** _Chorus doesn't store what happened. It stores what was believed —
by whom, since when, on what grounds, and what happened to that belief afterward._

**The structural surprise** (the reason this plan is credible): every phase below ships with
**zero substrate changes**. Derived authors, as-of reads, decide/replay, recast lineage, mail,
policies — the primitives already exist. The substrate always contained this future; these
phases just stop apologizing for it. That is also the proof the substrate was right.

---

## Phase V — The Instrument Panel _(belief observability)_

You cannot manage a mind you cannot measure. Phase V makes the store's implicit epistemics
into first-class, provenance-carrying measurements.

- **`chorus vitals --store <n>`** — the blood panel: contested-belief density, staleness
  half-life (age distribution of load-bearing beliefs), **source concentration** (a Herfindahl
  index over authors — "how much of what I believe rests on one voice?"), belief churn and
  retraction rates, confidence histogram, orphaned references, dialect entropy (how many ways
  is this store spelling the same idea?).
- **The examiner is an author.** Every metric is emitted as ordinary signed claims by a derived
  examiner author — telemetry IN the medium, so measurements have receipts, history, and can be
  distrusted like anything else. No side-channel dashboards; the instrument panel reads the
  store the way everything reads the store.
- **`chorus diff --store a --store b`** — superposition-aware belief diff between two stores
  (or one store at two as-of instants): agree / disagree / only-in-one / same-value-different-
  provenance. The primitive under drift detection: "my agents should agree about X and don't."
- **`chorus bisect --store <n> <entity> [<attribute>] --good <t1> [--bad <t2>]`** — `git bisect`
  for a mind: binary-search the as-of history to find the exact instant a resolved view flipped,
  and hand back the delta, author, session, and model that flipped it. Time-travel debugging for
  belief. (As-of already makes every historical instant readable; bisect is just the search.)
- Console: the instrument panel view — not "what do I believe" but "how healthy is what I
  believe."

_Hard parts, named:_ metrics chosen badly become vanity numbers; every vital must trace to a
decision someone would make differently. Half-life needs kind-awareness (a stale preference is
fine; a stale deploy-credential belief is not).

## Phase VI — The Examiner _(active epistemic hygiene)_

Phase V measures; Phase VI acts. The overnight build's deepest lesson — **most defects are
wrong-silence, not wrong-answers** — becomes a resident of every store.

- **Retrospective replay as a daemon.** `decide`/`replay` already pins what a decision knew.
  The examiner periodically replays standing decisions and files MAIL when a decision's basis
  has since been retracted, contested, or superseded: _"You acted on X on Tuesday. X is now
  known false. The action may need revisiting."_ Nobody ships consequence-tracking for agent
  decisions. This is the accountability loop closed at the personal scale.
- **Staleness challenges.** Load-bearing beliefs past their half-life generate re-verification
  mail — the store asks to be checked, instead of silently rotting.
- **Contradiction mining.** The similarity seam (Phase-3 horizon work, shipped) proposes
  near-synonym attributes carrying conflicting values across dialects — latent contradictions
  the contested scan can't see because the words differ. Proximity proposes; the mail asks a
  judge (you, or the librarian) to dispose.
- **Resident skeptics.** Opt-in adversarial derived authors that append doubt-claims where
  corroboration is thin — the loop's review culture productized as a store inhabitant. Doubt
  is a claim with an author; you can tune it, rank it, or fire it. (An eventual "hypnagogic
  pass" — idle-time consolidation: recasts, sameAs filing, digest curation — is this phase's
  stretch goal. Stores that sleep.)
- Everything the examiner does is **mail and claims, never mutation**. The store stays
  grow-only; hygiene is testimony, not surgery.

_Hard parts:_ alert fatigue is the failure mode — the examiner must earn its interruptions
(measured by ack rates on its own mail: the examiner is calibrated by the same machinery as
everyone else, see Phase VII).

## Phase VII — The Actuary _(calibration; trust becomes earned)_

The substrate's quiet radicalism: **authors have track records**. Phase VII makes track records
quantitative, and trust a fitted function instead of a declared list.

- **Resolution claims.** A belief can be linked — by ordinary claims, vocabulary in the commons
  — to its outcome: `confirmed | refuted | superseded`, with evidence references. decide/replay
  pins what was believed; resolutions record what the world said back.
- **Calibration scores per author** (and per author × domain): Brier/log scores computed over
  resolved, confidence-carrying beliefs, emitted by the actuary (a derived author) as claims.
  _"claude-fable-5 sessions are well-calibrated about code, overconfident about timelines"_
  becomes a queryable, signed, contestable statement with receipts.
- **Trust-by-calibration policies.** Today trust policy is declared (distrust this author).
  Now it can be _fitted_: "weight authors by their domain calibration" — still a policy, still
  yours to adopt or refuse, but generated from evidence. The fleet-operations question — _which
  model version should I trust about deployment risk?_ — gets answered from data.
- **The market smell, without money.** Confidence-staked beliefs + calibration scoring =
  prediction-market mechanics inside an agent fleet. Agents that are wrong loudly and often
  become cheap to ignore, mechanically.

_Hard parts:_ Goodhart — a scored author will learn to game the score (vague beliefs resolve
kindly); resolution ground-truth is itself claims by authors (turtles all the way down — which
is not a bug: the actuary is an author too, auditable like everyone; the system is honest about
having no view from nowhere, all the way up).

## Phase VIII — The Epidemiology _(belief flow in populations)_

Federation v1 (CONSTELLATION Phase E) lands here — reframed. Syncing stores is plumbing;
**tracing belief through a population** is the product.

- **Transmission graphs.** Relay provenance (origin annotations, the deferred half of Phase C)
  makes propagation first-class: who believed it first, through whom it spread, where it mutated
  (recast lineage across stores), where it was resisted (negations), where it died.
- **Patient-zero queries and contagion maps** in the console: for any belief, the full
  epidemiological picture. When an agent fleet goes wrong together, you can find the index case.
- **Echo-chamber detection as arithmetic.** Corroboration semantics distinguish _independent_
  confirmation from _one source through five relays_ — same root author is ONE source no matter
  how many hops it took. The most-requested epistemic feature of the century, and here it falls
  out of signatures.
- **Quarantine as policy.** Distrust an upstream author and everything downstream re-weights
  automatically — provenance makes the blast radius computable, and the response is a policy
  edit, not a purge. (Grow-only holds: quarantine suppresses in every lens; it never deletes.)

_Hard parts:_ the CONSTELLATION Phase E honesty list still binds — irrevocability of shared
data, sybil resistance, boundary sameAs; plus graph privacy (a transmission graph is itself
sensitive telemetry — it is store-content, encrypted where the store is).

## Phase IX — The Weather Service _(public epistemic infrastructure)_

Everything so far instruments one mind or one fleet. Phase IX instruments a **commons**.

- **A hosted public commons** (the schema commons shipped in seed form; this is its node), plus
  **opt-in, anonymized aggregate telemetry** across consenting stores: which conventions are
  crystallizing (the attractor-basin analytics COMMONS.md deferred), which domains are contested
  across the ecosystem, where dialects are converging. Belief weather: _"contest density around
  ai-agent vocabulary is rising; the `attr:rating` convention has effectively won."_
- **The ad-hoc Letterboxd ships as the flagship** — the demo that makes all of this legible to
  someone who has never said "delta": your viewing log accretes from conversations you were
  having anyway; the aggregator holds what you chose to publish; and the rating you see is
  resolved under **your** trust policy, superposition and all. The first social product whose
  feed algorithm is _your own auditable policy_.
- **Keys for normies:** hosted registrars that vouch without custody of seeds — the hard part,
  named since the first VISION draft, now on the critical path.

_Hard parts:_ everything CONSTELLATION Phase E lists, plus real anonymization (aggregate
telemetry that can't be de-aggregated) and the legal reality of public grow-only surfaces
(admission-refusal + lens suppression, stated honestly at publish time).

## Beyond — The Flight Recorder _(belief as civilizational infrastructure)_

The long arc, stated without hedging:

- **Agent accountability becomes a discipline**, then an expectation, eventually an obligation.
  When agents act in the world — spend money, file documents, administer systems — _"what did
  it believe when it acted, and on whose word"_ becomes a forensic, insurance, and regulatory
  question. A replayed decision with pinned basis and signed provenance is **evidence-grade**.
  Rhizomatic is positioned as the flight-recorder format; Chorus as the reference recorder.
  Black boxes for minds — built before the crashes that make them mandatory.
- **The epistemic estate.** A life's beliefs — held, revised, contested, resolved — as an
  auditable, inheritable record. Not what your grandmother concluded: what she knew when she
  concluded it, what she changed her mind about, and how. Memory dies with context; belief
  accounting is the context.
- **Instrumented institutions.** Research programs whose claims, evidence links, and
  replications are resolution-claims on a public record; organizations whose institutional
  knowledge carries receipts. The replication crisis is, at bottom, a missing-telemetry
  problem.

---

## Sequencing, honestly

- Phases V–VII are **single-store and buildable now** — they ride on decide/replay, as-of,
  derived authors, mail, and the similarity seam, all shipped. V is weeks, not months.
- Phase VIII consumes the existing gates: cutover first (a live store to instrument is the
  point), then federation v1. Phase IX consumes publishing + hosting decisions.
- Nothing here amends the substrate. Where a phase wants substrate help (origin annotations,
  derivation vocabulary for aggregates), that is a rhizomatic-repo conversation with Myk —
  flagged per item, never smuggled.
- The repositioning is itself work: README/pitch rewrite around belief-not-memory is a Phase V
  deliverable, because positioning is a product surface too.

## What stays sacred

Grow-only. Signed. Superposition over silent resolution. No view from nowhere — including for
the instruments: every examiner, actuary, and epidemiologist in this plan is an **author**,
with a track record, subject to the same trust machinery it feeds. The telemetry engine is not
outside the epistemology. That is the whole trick, and no one else can copy it without
rebuilding the substrate that makes it honest.
