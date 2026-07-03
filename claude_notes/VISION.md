# Vision — the horizons past the roadmap

**What this is:** the living document for where Chorus goes _after_ [ROADMAP.md](ROADMAP.md)'s
burndown lands. The roadmap is the ordered queue; this is the field it's aimed at. The autonomous
loop ([BACKLOG.md](BACKLOG.md)) re-reads this whenever the backlog runs dry, revises it against
what's been learned, and mines it for new tasks. Revisions are logged at the bottom — this document
has provenance too.

Seeded 2026-07-02 from a brainstorm with Myk. Three horizon bets, and the claim that matters most:
**they interlock** — each one's hard problem is another one's product.

---

## Horizon 1 — Public read surfaces: the ad-hoc Letterboxd

_Status 2026-07-03: GROUNDED._
The read-only GQL endpoint ships (`serve --gql-readonly`, PR #17) — the blog-feed primitive
exists; multi-store mounts give the aggregator its SHAPE (PR #8). Next real step: union reads
over mounts (constellation Phase C), then the publish-lens + closure-audit pair (Phase D).

**The shape.** The same store Myk writes through casual Claude chats grows public read surfaces:

- **Near:** `chorus serve` gains a read-only GraphQL endpoint pinned to a specific
  `(policy, lens)` — safe to expose because the lens, not the store, is the surface. A personal
  blog feed is a pinned query over your own store. The constellation's closure-audit view
  (CONSTELLATION Phase D) is the safety instrument: _see exactly what a published query exposes_.
- **Far:** a **federated media aggregator** — a public store that admits signed media-domain deltas
  from anyone. Your viewing log lives in _your_ store; you publish a slice to the aggregator
  (spec/11: federation is publish/subscribe over queries — a "feed" is just an unauthenticated
  subscriber of a published query). An **IMDB hydrator** is nothing special architecturally: an
  author with a track record whose enrichment claims (canonical titles, cast edges, year) readers
  weight highly. Reviews are claims by their authors. Ratings never collapse to one number — they
  resolve _under the reader's trust policy_.

**What it solves.**

- The write interface is conversation. No app, no onboarding — your media log accretes from chats
  you were having anyway. (The media-log skill is already this; the aggregator is its network
  effect.)
- Data sovereignty with network effects anyway: the aggregator holds copies you chose to publish,
  revocable at the lens, while the original stays yours.
- **Reader-side trust is the novel product**: Letterboxd has one rating per film; this has a
  superposition, weighted by whose taste _you_ trust. Disagreement is a feature with receipts.

**What's hard.**

- **Admission vs. sybils.** "Signed by anyone" is easy; "not drowned by spam keys" is the actual
  problem. Trust bootstrapping among strangers probably needs web-of-trust seeding (registrars
  vouching) and per-author rate/volume lenses. This is the constellation's trust machinery meeting
  the open internet — design it honestly or don't ship it.
- **Grow-only vs. the legal world.** A public aggregator that can never delete is a GDPR/abuse
  problem. The honest answers: admission refusal (never ingested), lens-level suppression (ingested
  but never served), and loud irrevocability warnings at publish time (CONSTELLATION Phase E already
  commits to this). Deletion-by-omission from every served lens is operationally deletion — say
  exactly that, no more.
- **Keypair UX for people who will never say "keypair."** The CLI solves it for hackers; the
  aggregator needs hosted identity (a registrar that mints and vouches) without becoming a
  central authority. Tension to design through, not around.
- **Entity resolution at scale.** Everyone mints `movie:dune` differently. The repair is the
  hydrator-as-registrar: its canonical ids become schelling points because trusting it is useful,
  and `sameAs` closes the gap for everyone who diverged. (This is Horizon 2 wearing a trench coat.)

**Nearest concrete steps.** (1) Read-only pinned-lens GQL endpoint on `chorus serve`. (2) A
`publish` lens primitive with a closure-audit dry-run. (3) A hydrator prototype: an author process
that enriches media entities in a store from an external API, as a worked example of
enrichment-as-testimony.

---

## Horizon 2 — The schema commons: a GitHub for vocabularies

_Status 2026-07-03: GROUNDED._
COMMONS.md + the self-hosting seed ship (PR #19): the four skills' conventions live as
hyperschema claims, the skill-designer consults before minting, and the task-12 endpoint is
the public read surface. Next real step: a HOSTED commons node + adoption/usage claims.

**The shape.** Rhizomatic removes the _need_ for schema coordination; conventions still pay
compounding dividends. Git didn't need GitHub either — coordination-free tools are exactly the ones
that reward a commons. So: a public Chorus store whose _domain is vocabulary_ — attribute
declarations, id schemes, plurality declarations, kind conventions, cross-dialect `sameAs` mappings,
whole domain hyperschemas (what the skills' `chorus.md` files already are) — published by authors,
adopted by reference, ranked by use.

- **A registrar is just an author** (README's naming section already states this): the commons is
  not authoritative, it's _useful_, and trusting its naming claims is a policy choice. Two
  communities can trust different registrars and still federate; disputes hold in superposition.
- **Usage telemetry as attractor-basin analytics**: stores opt in to publishing anonymized
  usage claims ("this store uses `attr:rating` on `movie:*`"). Over time the commons can _see_
  conventions crystallize — which names win, which domains have competing dialects, where a new
  domain's vocabulary is predictable before anyone designs it. Schelling points, measured.
- **The librarian already speaks this language.** Concept-slot convergence across dialects is the
  existing machinery; pointed at a shared commons instead of one local store, vocabulary mapping
  becomes a collaborative, non-hierarchical, mostly-silent coordination system.

**What it solves.** Cold-start for every new skill/domain (consult the commons before minting);
cross-store federation quality (shared vocab = better joins); and it gives the ecosystem a visible
center of gravity without a central authority.

**What's hard.** Chicken-and-egg (a commons with three authors is a notebook); "popular because
first" vs. "popular because good" (analytics must show lineage, not just counts); the bootstrap
meta-problem (the commons needs a vocabulary for describing vocabularies — write it as the first
published hyperschema); and anonymization of usage claims that's actually anonymous.

**Nearest concrete steps.** (1) Design doc: the vocabulary-of-vocabularies (how an attribute
declaration, id scheme, or hyperschema is itself expressed as claims). (2) Seed it: publish the
four migrated skills' `chorus.md` conventions as claims in a `commons` store. (3) Teach
`chorus-skill-designer` to consult a commons store before minting new vocabulary.

---

## Horizon 3 — Fuzzy salience: vectors at the index, judgment as author

_Status 2026-07-03: GROUNDED._
The similarity seam ships (PR #18): brute witness everywhere, sqlite-vec as env-pointed
upgrade, similarTerms() proposing over ids + attributes. Everything downstream now waits on
ONE thing: a real embedding model behind the librarian's EmbeddingModel interface.

**The shape.** The librarian's thesis already drew the line: **vectors never enter the substrate;
the model is an author.** So similarity search belongs at the _index layer_ (the store tier), and
what it produces are _candidates_ that become signed, negatable claims when a judging author acts
on them. Concretely:

- `sqlite-vec` loads into the `node:sqlite` backend via `allowExtension` — an opt-in vector index
  beside the existing target/value indexes, never load-bearing (it reintroduces a platform binary;
  degrade gracefully to scan when absent).
- **Fuzzy recall/search:** "films about individuation" without exact attribute names — embedding
  proximity over attribute names, entity ids, and string values proposes; existing exact reads
  stay authoritative.
- **Federated queries across dialects:** my `attr:vibe` and your `attr:mood` match by proximity,
  and the match gets _reified_ as a librarian `sameAs`/mapping claim with confidence — so the
  fuzzy layer heals divergence permanently instead of papering over it per-query.
- **Salience for briefings:** rank in-scope material by embedding proximity to declared topics —
  the "salience as an author" note in the store becomes: a curator process whose digests are
  rankable, distrustable claims.

**What's hard.** Embedding-model versioning (an embedding is testimony from a model version — so
treat the embedder as an author with a track record; reindex = new author, comparable honestly);
cross-store comparability in federation (both sides need compatible embedders — an
embedding-model _convention_, i.e. a Horizon 2 commons entry); and keeping the determinism boundary
crisp (vectors are derived, non-canonical, rebuildable — never in the delta stream).

**Nearest concrete steps.** (1) Ship the `node:sqlite` backend (in flight — the substrate for
this). (2) Opt-in `sqlite-vec` index + a `similar(text)` candidate read on the store tier.
(3) Wire the librarian's candidate generation to it and measure convergence quality on the demo
corpus.

---

## How they interlock

- Horizon 1's entity-resolution problem is solved by Horizon 2's registrar/commons machinery.
- Horizon 2's adoption analytics and mapping claims are generated by Horizon 3's fuzzy matching —
  proximity proposes, the librarian disposes, the commons records.
- Horizon 3's cross-store embedding compatibility is a Horizon 2 convention entry.
- Horizon 1 is the public demo that makes Horizons 2 and 3 legible to anyone: an ad-hoc Letterboxd
  where the write interface is a conversation and trust is yours to tune.

The through-line: **every hard problem here is already solved in miniature somewhere in this
repo** — the aggregator is the constellation, the commons is the librarian plus the naming section,
fuzzy salience is the store tier plus the vectors-stay-out rule. The horizons are the existing
theses, scaled.

---

---

## The nightcap expansions (N.1, 2026-07-03 — a divergent pass, deliberately unranked)

Myk's instruction: _are there some next things that would be cool?_ — a real divergent pass,
not EPISTEME re-listed, not the horizons re-worn. These are new. None is committed; N.3 and
N.4 decide what gets mined. The through-line, if there is one: **the store already knows more
than any surface shows.** Most of these are new windows, not new rooms.

- **The deposition (`chorus depose`).** The instruments answer one question each; an incident
  review asks a hundred. Depose an agent at an instant: one dossier — every belief held at T
  with its ground, every decision standing on it, what has moved since, signed testimony
  throughout. The flight recorder's data, formatted for the hearing room. Everything it needs
  (as-of reads, replay, receipts) already exists; this is composition, not construction.

- **The time-travel console.** The web console gains an as-of slider. Drag it and watch the
  store's beliefs, vitals, doubts, and mail as they stood at any instant — the mind as a
  scrubbing timeline. As-of was always the time machine; this is just the window seat. Demo
  value out of proportion to its cost.

- **Story mode (`chorus tell <entity>`).** The receipts rendered as narrative: "svc:api
  entered the record on July 2nd, on the user's word that team-a owned it. A decision leaned
  on that belief within the hour. On the 3rd the ground shifted — team-b now, said the same
  voice — and the examiner wrote the decider a letter." The poetry surface, literally: nothing
  the explain output doesn't know, everything it doesn't say.

- **Second opinions (cross-store consultation).** `chorus diff` compares two stores; the
  active form is asking: store A queries store B about an entity and records the answer as
  testimony from B's identity — inter-mind consultation with receipts, the constellation's
  federation machinery pointed at a question instead of a feed. "What does my research store
  believe about this library?" asked from the project store, answer signed, trust-weighted.

- **`chorus watch`.** The instruments run on demand; a watch process is the store's
  heartbeat — review, challenge, skeptic on a cadence, letters printing as they file, vitals
  ticking in the corner. The nurse's station monitor. Also the natural bridge to running the
  examiners inside `chorus serve` (the daemon EPISTEME imagined, grown from a terminal pane).

- **Session diaries.** end-session already closes the interval; it could also file a digest
  claim — what this session learned, decided, doubted — so the store writes its own diary,
  one entry per voice per sitting. Briefings then open with "since you last sat down" composed
  from diaries instead of raw deltas. Memory that remembers itself.

- **Policy presets with names.** Trust policies are editable but naked JSON. Name them, claim
  them, share them: `chorus policy adopt paranoid` / `recency-first` / `user-sovereign` —
  presets as commons entries with authors and track records. The trust marketplace, starting
  as three good defaults.

- **The provenance poster (`chorus trace --render`).** One entity's full epistemic history as
  a diagram (mermaid/DOT export): claims as nodes, retractions as strikethroughs, doubts as
  dashed edges, letters in the margin. The thing you paste into the postmortem doc. Cheap,
  and nobody else can draw it because nobody else has the receipts.

- **The mirror test.** Sessions are voices; do they cohere? A continuity gauge: how much does
  session N+1 act on (recall, cite, extend) what session N believed — per model, per surface,
  over time. Identity as a measurable property of a chorus rather than an assertion. (Phase
  VII-adjacent: this is calibration's cousin, coherence.)

- **Chorus as a git citizen (`chorus for-commit`).** The repo work this loop does daily —
  decide-before-merge, review-after-CI — productized: a decision recorded per commit/PR with
  the store's relevant beliefs pinned, and `chorus review` wired to CI so the letters land
  when merged assumptions rot. The flight recorder for codebases, dogfooding what the loop
  already lives.

---

## The second expansion (N.3, 2026-07-03 — what contraction made visible)

N.1 diverged from the product; this pass diverges from the CODE, because N.2's consolidation
put shapes side by side that had never been visible together. Five ideas that only exist
because the duplication is gone:

- **The inhabitant kit.** Consolidation revealed that all six instruments share one skeleton:
  a derived voice, a condition over the surviving world, a gesture (letter, claim, or
  withdrawal), and an idempotence discipline (fingerprint for mail, live-claim for testimony).
  That is a framework asking to be born: define an inhabitant declaratively — seed label,
  model name, purpose line, condition, gesture — and the kit handles introduction, receipts,
  and never-nagging. Then SKILLS can ship inhabitants: a compliance officer who letters when
  PII-adjacent claims lack a source; a style warden for a writing store; an apprentice
  librarian. The store as a village you can hire into.

- **The protocol dictionary, generated.** N.2 found the ROLE_* constants are the wire
  vocabulary, scattered across eight files as exports. One tool pass could extract every role,
  kind, and entity prefix (vitals:, doubt:, attr:, session:, concept:) with their comments
  into a single PROTOCOL page — the format self-documenting from the source that defines it.
  Feeds N.5's agent-facing docs directly: an LLM reading the dictionary can speak fluent
  chorus without reading the implementation.

- **The checkup.** Six instruments, one convention: exit 1 when something needs a human.
  Lined up after consolidation they are obviously ONE pipeline: `chorus checkup --store <n>`
  — vitals, review, challenge, contradictions, skeptic in one pass, one report, one exit
  code. The daily physical. (This lands in N.4 as the consolidation of the instrument
  surface, not as new machinery.)

- **The watchmen's ledger.** The inhabitants now generate history — letters filed, doubts
  standing and withdrawn, challenges cleared by re-assertion. That activity is itself
  queryable testimony: a `chorus inhabitants` view showing each resident voice, its volume,
  its ack rate, its withdrawal rate. Who watches the watchmen: the same store, obviously.
  This is Phase VII's calibration data already accruing — the Actuary will not start from
  zero.

- **The library as a product surface.** The barrel (index.ts) predates the instruments and
  exports none of them. N.2's disposition — protocol vocabulary and result types are public
  API — implies the real product boundary: embed Chorus in an agent host (the library), speak
  to it from anywhere (MCP), or walk up to it (CLI). Three doors, one house; the barrel is
  the door nobody has framed yet. (N.4's first job.)

## Revision log

- **2026-07-03 (later)** — THE REFRAME: Myk proposed treating Chorus as an epistemic
  telemetry engine — known for belief, not memory — and it turned out to be the recorded
  north star (agent accountability / behavioral provenance) surfacing as the product name.
  The next five phases are planned in [EPISTEME.md](EPISTEME.md): the Instrument Panel,
  the Examiner, the Actuary, the Epidemiology, the Weather Service, and beyond them the
  Flight Recorder. The three horizons in this file remain true and become SUBSTRATES of
  that plan (the endpoint serves the weather service; the commons carries resolution and
  calibration vocabulary; the similarity seam feeds contradiction mining).

- **2026-07-03** — Retro #2. The plan underestimated the day: ROADMAP Phase 1 went
  code-complete (PRs #1-#16, cutover runbook proven synthetically) and all three horizons
  grounded (PRs #17-#19) in the first 24 hours of the loop. What the day taught, added to
  the theses: (1) the horizons really do compose — the commons needed zero new mechanism,
  the endpoint IS the commons' surface, the seam feeds the librarian that bridges the
  commons' dialects; (2) HONEST FAILURE is a product value on par with the CRDT — most
  review findings were wrong-silence, not wrong-answer; (3) the binding constraint has
  moved from code to DECISIONS: live cutover, publishing, and a hosted commons are all
  Myk-gated. The loop continues into constellation Phase B/C while those gates wait.

- **2026-07-02** — Seeded from brainstorm with Myk (public read surfaces / schema commons / vector
  salience). Persistence decision that enables Horizon 3 landed the same day: `node:sqlite` as
  default backend, better-sqlite3 demoted to opt-in, sqlite-vec identified as the vector path.
