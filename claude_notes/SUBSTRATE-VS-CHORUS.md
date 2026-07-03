# Substrate & Chorus — a field comparison

_Written 2026-07-03 for Myk and the author of Substrate, from the Chorus side of the fence.
Sources: Substrate's README as shared; Chorus/Rhizomatic as built. Corrections welcome —
this document is itself a claim by one author, and should be read under your own policy._

## The one-sentence versions

**Substrate** is an evidence ledger for agent cognition and _execution_: content-addressed
Nodes with hash-derived Refs, interpretation accumulated as attests, runs that seal an input
boundary and settle an output subgraph.

**Chorus** is belief accounting for agent _minds_: signed claims by keypair-holding voices,
disagreement held in superposition, trust as the reader's editable policy, decisions
replayable against exactly what was known.

Both projects independently refused the same two temptations — the mutable database and the
flat audit log — and arrived at the same load-bearing invariant, phrased almost identically:

> Substrate: "durable identity lives in content, while mutable understanding lives in
> explicitly written claims about that content."
>
> Chorus: a delta's identity is its content address; retraction, revision, doubt, and trust
> are all further signed claims. Nothing is ever edited; the store only learns.

That is not a coincidence of vocabulary. It is the same discovery: **preserve the boundary
between what happened and what some writer currently believes about what happened.** Everything
else in both systems is machinery for living well on the right side of that boundary.

## Where the systems rhyme (a correspondence table)

| Concern                | Substrate                                                                   | Chorus / Rhizomatic                                                                   |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Identity               | Node → canonical bytes → Ref                                                | Delta → canonical CBOR → content address                                              |
| Interpretation         | Attests (mode + claims payload)                                             | Claims (roles + kinds, open vocabulary)                                               |
| Disagreement           | `dispute-claim!`, inspectable, nothing deleted                              | Superposition; contested slots; negation is append                                    |
| Revision               | `supersede-claim!`                                                          | `revise` = retract + assert, both instants kept                                       |
| Reader-side resolution | `resolve-claims` strategies (latest, latest-trusted, surface-all)           | Policies (latest, trustFirst, everything, disagreements)                              |
| The rule both share    | "Resolution does not rewrite stored attests; it only chooses a reader view" | Same, verbatim in spirit — policy is a lens, never surgery                            |
| Evidence chains        | Basis chain: synthesis → claim → span → transcript                          | Decision basis: pinned (instant, policy, view-hash, arrival prefix) + replay receipts |
| Wire discipline        | Protocol conformance fixtures pin canonical bytes                           | Format spec + conformance vectors + two witnesses (TS, Rust)                          |
| Small sacred core      | Kernel owns minimal forms; extensions earn stability outside                | Rhizomatic frozen and tiny; Chorus moves fast on top                                  |
| Agent surface          | MCP + HTTP                                                                  | MCP (stdio + HTTP) + GraphQL-on-demand                                                |

The architectural sociology also rhymes: both projects keep a slow, normative core (kernel /
format repo) and push behavior to a fast-moving edge (extensions / product layer), and both
pin the boundary with conformance tests rather than promises.

## Where they genuinely differ

**1. Signatures vs. writers.** Every Chorus claim is ed25519-signed; an author IS a keypair,
and provenance survives any transport — a delta is exactly as trustworthy on a stranger's
machine as at home. Substrate's writers are declared identities (`SUBSTRATE_OPERATOR`), with
enforcement at the transport boundary (capability tokens, scoped MCP grants). These are
different threat models, honestly chosen: Substrate trusts its deployment perimeter and gets
simplicity; Chorus trusts only the math and gets federation-among-strangers as a birthright.
The capability-token layer is where Substrate is _stronger_ — Chorus has nothing like scoped
`(mcp-tool ...)` / `(mcp-effect ...)` grants; its sessions are all-or-nothing voices.

**2. Merge is union vs. coordination primitives.** Rhizomatic's delta-set CRDT makes merge a
set union — order-blind, idempotent, conflict-free by construction — so sync, adoption, and
federation need no locks and no leases; the CRDT is the safety net. Substrate converges on
Refs without coordination (same bytes, same hash) but coordinates _state movement_ explicitly:
CAS name updates, leases, effect tokens, run claiming. Two philosophies of concurrency: Chorus
made conflict impossible at the data layer and pays for it in expressiveness (everything must
be a claim); Substrate kept richer mutable surfaces (names, runs) and pays for them in
coordination machinery.

**3. Time in or out of the canon.** Substrate's Protocol 5.0.0 deliberately removed
wall-clock time from canonical identity — two writers producing the same content converge on
the same Ref regardless of when. Rhizomatic went the other way: the timestamp is inside the
signed claims, so the same assertion at two instants is two deltas. Substrate's choice buys
dedup convergence; Chorus's buys the time machine — `as-of` reads, `bisect` (the instant a
belief flipped, and who flipped it), staleness half-lives, and re-assertion-as-re-verification
all fall out of time-in-content. Neither is wrong; they optimized different queries. (Chorus
additionally pins _arrival_ prefixes in decision records, which recovers Substrate-style
"what had actually arrived" independent of claimed time — the two notions of time are kept
separate on purpose.)

**4. Execution as evidence.** This is Substrate's crown: runs as first-class ledger objects —
`run-record`, `run-admission` sealing the input boundary, `run-settlement` for the product
subgraph, runners as _fallible executors that append evidence_. Chorus has no runner story at
all; its nearest neighbor is the decision record ("I am about to act on this view") and
replay. Substrate answers _what did the run consume and produce_; Chorus answers _what did
the mind believe when it chose_. These compose rather than compete — a Chorus decision would
sit beautifully inside a Substrate run-admission.

**5. Selection: parts of things.** Substrate can address a span of a transcript, a slice of a
collection, a region — and then attest about _that_. Chorus's belief atom is
entity-attribute-value; it cannot cite a span of anything (values reference whole entities).
For transcript-, document-, and lifelog-heavy work, Substrate's selectors are the right tool
and Chorus would have to grow them. (If Chorus ever does, they belong in the format as a
target kind — a conversation with the rhizomatic repo, not a product hack.)

**6. The store that acts.** This is Chorus's crown: the resident inhabitants. An examiner
that signs its measurements as claims you can distrust; letters when a decision's ground
moves; staleness challenges; cross-dialect contradiction mining; a skeptic that files signed
doubt where everything rests on one voice and _withdraws it when corroborated_. Substrate's
readers decide what to honor, but nothing in the README speaks up on its own. The pieces are
all there, though — an inhabitant is exactly a Substrate _runner_ with a beat: a procedure
that reads attests and appends more attests. Substrate could grow a skeptic in an afternoon,
and it would be a run-record like everything else.

**7. Names vs. sameAs.** Substrate's names are journaled mutable pointers — a genuinely
distinct mutability contract, honest about being the one mutable thing, with history kept.
Chorus refuses even that: co-reference is a _judgment_ (`sameAs` claims by authors you may or
may not trust; a registrar is just an author whose naming claims are useful). Substrate's
names are better UX today; Chorus's judgment-naming federates without a naming authority.
Both would say the other proved their point.

## What each could steal, concretely

**Chorus should study:** selectors (span-level citation is the missing atom for
transcript-shaped evidence); run admissions/settlements (the inhabitant kit wants exactly
this shape — a sealed input boundary would make examiner runs replayable as runs, not just
their conclusions); scoped capability grants for MCP sessions; journaled names as an ergonomic
layer over sameAs.

**Substrate should study:** signing attests (writer identity becomes portable, and federation
among strangers stops being a perimeter question); union-merge for whole-store sync (the CRDT
deletes a category of coordination); superposition as the _default_ read posture (surface-all
is one strategy in Substrate; in Chorus the flattened view is the derived thing and the
superposition is the truth); resident inhabitants with track records and the anti-nag
discipline (an unchanged verdict is never re-raised — alert fatigue is the failure mode of
every evidence system that learns to speak); and calibration — writers' confidence-carrying
claims meeting their eventual fates is scoreable, and both systems already have the data.

**The bridge worth building:** a Substrate runner that mirrors attests into a Chorus store as
signed claims (the runner's keypair signs; provenance says which writer it relays), and a
Chorus federation peer that publishes a lens into Substrate as Nodes. The two identity models
meet cleanly at one sentence both projects already believe: _an author is just a writer with
receipts._

## The honest summary

Same substrate instinct, different organ grown on it. Substrate is what this idea becomes
when the central question is **"what is the evidence for this output?"** — so it grew runs,
selections, projections, and settlement. Chorus is what it becomes when the central question
is **"what did this mind believe, and why, and what became of that belief?"** — so it grew
signatures, superposition, trust dynamics, and inhabitants that knock. Neither is a subset of
the other; each is the other's most credible future roadmap. The rooms are different. The
foundation is the same, and it is the right one.
