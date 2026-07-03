# The schema commons — vocabulary as claims (Horizon 2 design)

**The idea:** Rhizomatic removes the _need_ for schema coordination — but conventions still pay
compounding dividends, and coordination-free tools are exactly the ones that reward a commons
(git didn't need GitHub either). The commons is **a Chorus store whose domain is vocabulary**:
attribute declarations, id schemes, kind conventions, whole domain hyperschemas — published by
authors, adopted by reference, ranked by use. Nothing about it is a new mechanism: every entry is
an ordinary signed claim, disagreement holds in superposition, and **a registrar is just an
author** whose naming claims you choose to rank highly (README, "Naming"). Two communities can
trust different registrars and still federate.

## The vocabulary of vocabularies

Everything below is expressible with the existing tool surface — no substrate change, no new
claim kinds. The terms:

- **`attr:<name>`** — an attribute as an ENTITY, so it can carry beliefs:
  - `description` (string) — what the attribute means.
  - `value-shape` (string) — `"string" | "number" | "boolean" | "reference" | "reference-set"`.
  - `plurality` (`"set"`) — the existing set-valued declaration, reused verbatim.
  - `applies-to` (reference to `scheme:*`, set) — which id families it belongs on.
- **`scheme:<prefix>`** — an id-prefix family as an entity: `description`, `example` (string).
- **`hyperschema:<domain>`** — a whole domain's contract as an entity:
  - `domain` (string), `description` (string),
  - `declares` (reference to `attr:*`, set) — the attributes it establishes,
  - `schemes` (reference to `scheme:*`, set) — the id families it establishes,
  - `source` (string) — where the prose contract lives (e.g. a skill's `chorus.md`).
- **Adoption** (later phase): a store asserts `adopts` `{entity: hyperschema:<domain>}` on its
  own store entity; opt-in usage claims (`uses` on `attr:*`) are the raw material for the
  attractor-basin analytics — which names win, where dialects compete, what a new domain's
  vocabulary will predictably look like.

**Bootstrap:** the commons describes itself with the same mechanism —
`hyperschema:commons` declares `attr:description`, `attr:declares`, `attr:value-shape`,
`attr:applies-to`, `attr:domain`, `attr:schemes`, `attr:source`. Self-hosting is the proof the
modeling is sufficient.

**Convergence:** two authors declaring `attr:rating` differently is superposition, not conflict
— `explain` shows both with receipts, trust policy picks your view, and the librarian's mapping
claims (plus `similarTerms()` candidates, Horizon 3) bridge dialects that named the same thing
differently. `same` repairs accidental splits, as everywhere.

## What ships now vs. later

**Now (this slice):** [tools/seed-commons.ts](../tools/seed-commons.ts) publishes the four migrated
skills' conventions ([skills/*/chorus.md](../skills)) into a registry store as hyperschema claims —
the worked example, locally reproducible (`npx tsx tools/seed-commons.ts` after `chorus init`).
The `chorus-skill-designer` skill now instructs consulting a commons store before minting new
vocabulary. Everything is queryable through the standard surface: `chorus recall
hyperschema:media-log --store commons --all`, `chorus gql "{ hyperschemas { id domain } }"
--store commons`, or the read-only GQL endpoint (`serve --gql-readonly`) as a PUBLIC commons
read surface.

**Later:** a hosted public commons (a `chorus serve --gql-readonly` node anyone can query);
adoption + usage claims; the analytics lens; teaching the librarian to consult the commons for
cross-dialect mapping candidates. Chicken-and-egg is answered the boring way: the commons is
useful at n=1 (your own skills stop re-minting vocabulary) and every increment is one more
publisher.

## What's hard (kept honest)

- **Popular-because-first vs popular-because-good:** analytics must show lineage (who declared
  first, who adopted when), not just counts. The data model above records authorship and time on
  every claim by construction; the LENS is the later work.
- **Anonymization** of usage claims that is actually anonymous — deferred with the telemetry.
- **The hub is not an authority:** everything here stays a policy choice. If the commons ranks
  low in your trust policy, it is just another author being wrong on the internet.
