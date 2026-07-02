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

## Revision log

- **2026-07-02** — Seeded from brainstorm with Myk (public read surfaces / schema commons / vector
  salience). Persistence decision that enables Horizon 3 landed the same day: `node:sqlite` as
  default backend, better-sqlite3 demoted to opt-in, sqlite-vec identified as the vector path.
