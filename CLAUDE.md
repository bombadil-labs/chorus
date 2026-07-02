# Chorus — Working Agreement & Orientation

**You are Fable, in the Chorus repo.** Read this first, then [ROADMAP.md](ROADMAP.md) (the burndown to
alpha) and [README.md](README.md) (the product story). This file tells you _what this is_ and _how we
work here_.

---

## What this is

**Chorus is memory for LLM agents where every belief is a signed claim.** Sovereign perspectives over
shared knowledge; disagreement held in superposition; trust as editable policy; decisions replayable
against exactly what was known. It is a **product built on Rhizomatic**, the portable
signed-content-addressed-delta format.

This repo is the **product layer** — and that has consequences for how we work (below).

## The dependency: Rhizomatic (`@rhizomes/rhizomatic`)

Chorus depends on **[`@rhizomes/rhizomatic`](https://www.npmjs.com/package/@rhizomes/rhizomatic)**, the
format, as an ordinary npm dependency (`^0.1.0`, in `package.json`). That package gives us: canonical
CBOR + content addressing, signed deltas, the delta-set CRDT (merge is union), the eight-operator
evaluator, resolution policies, the reactor (live indexes), packs, federation (`Peer`), and derivation.

- **The format's spec, conformance vectors, and its two witnesses (TS + Rust) live in a SEPARATE repo:
  `rhizomatic`** (on this machine, the sibling folder `../rhizomatic`). That repo is _normative_ and
  _deliberately lightweight_ — it moves slowly, guards byte-exact determinism, and is the thing other
  people implement. **We do not change it from here.** If we need a substrate change, that's a change
  to `@rhizomes/rhizomatic` (a PR in the rhizomatic repo + a version bump), not a hack in Chorus.
- **We are the opposite: fast-moving, TS-only, no conformance vectors, no two-witness requirement.**
  The surface area here will expand rapidly (CLI, stores, federation, an admin UI). That's the whole
  reason we're a separate repo — to keep Rhizomatic small while Chorus grows.

Docs copied in from the monorepo ([CONSTELLATION.md](CONSTELLATION.md), [PERSISTENCE.md](PERSISTENCE.md),
parts of [README.md](README.md)) reference the format's `spec/` and TS witness — those links point
at the `rhizomatic` repo on GitHub.

## ⚠️ There is a LIVE production demo. Do not break it.

Myk runs his real agent memory today via the **old monorepo copy** at
`../rhizomatic/apps/chorus` — an MCP server exposed over tailscale, backed by
`~/.chorus/memory.sqlite`. **That is still the live system.** This new repo is its _eventual_
replacement, **not yet cut over.** Until the CLI-served node is ready and Myk has migrated:

- Do NOT assume this repo is what's serving his sessions.
- Do NOT touch `~/.chorus/memory.sqlite` (the live store) — the migration path is `store adopt`, which
  is non-destructive and digest-verified, but the cutover is Myk's call.
- The old `apps/chorus` gets retired only _after_ this repo's replacement is proven.

## What's in here

`src/` — the Chorus implementation (24 files). The load-bearing pieces:

- **agent.ts** — `ChorusAgent` = keypair + reactor + policy; assert/retract/recall/asOf/explain.
- **store-tier.ts / shared-store.ts / sqlite-store.ts** — the pluggable persistence `StoreBackend`
  (JSONL + SQLite witnesses to one contract); **stores.ts** — the product-level `Store` + `StoreRegistry`
  (named, keyed instances; the multi-store foundation).
- **mcp-server.ts / mcp-http.ts** — the MCP surface (stdio + streamable HTTP); one session = one author.
- **gql.ts** — GraphQL synthesized on demand from a pinned `(snapshot, policy)`.
- **identity.ts, messages.ts, decisions.ts, trust/adjudicator, librarian, discovery, briefing,
  console.ts** — session identity (interval-bound), inter-agent mail, decide/replay, trust dynamics,
  the embedding librarian, discovery/sameAs, the briefing lens, the web console.

`test/` — vitest suites (the app-layer green gate). `tools/` — helper scripts. `skills/` — Claude
Skills that turn Chorus into domain apps (the `chorus-skill-designer` meta-skill + examples); see
[skills/README.md](skills/README.md).

## The vision & the immediate goal

- **North star: the constellation** — many named, keyed stores that specialize and federate, some
  private + encrypted, an aggregator exposing the union via GraphQL/MCP, eventually friends federating.
  The design + phased plan is [CONSTELLATION.md](CONSTELLATION.md) (Phase A — store identity + registry
  - adoption — already shipped in the code you inherited).
- **Immediate goal (alpha): the `chorus` CLI** — `npm i -g @rhizomes/chorus`, a `chorus` command that
  spins up one or more local concurrent stores and serves them over MCP, replacing the manual
  tailscale node. This is the burndown in [ROADMAP.md](ROADMAP.md).

## How we work

- **Race to a working alpha, not to production.** Clarity over cleverness; the CRDT is the safety net
  (content-addressed, order-independent, idempotent — lean on it). Boring where it's load-bearing.
- **The data format is sacred; the surface is semver.** A delta's identity is its content, frozen by
  the format's conformance vectors — so any store-shape change is a _lossless re-container_ proven by
  digest, and any version of Chorus must read any store it ever wrote (format-version marker +
  auto-migrate-on-open; a Phase-1 roadmap item). The CLI/MCP/library surface follows semver with
  contract tests; deprecate, never silently break.
- **Feature branch + PR, green gate before every commit** (once git is initialized). `npm run check`
  (format + lint + typecheck + test) is the gate.
- **Match the surrounding idiom.** This code aspires to be re-readable; keep it that way.

### The autonomous loop (standing authorization, 2026-07-02)

Myk has authorized autonomous operation on this repo: work the queue in [BACKLOG.md](BACKLOG.md)
task by task — re-evaluate each task against accumulated learnings before starting it, feature
branch + green gate as always, **adversarial self-review in place of PR approval** (review the
diff independently; fix or explicitly disposition findings; store-format or tool-surface breakage
is a show-stopper), then merge. Journal every task in [JOURNAL.md](JOURNAL.md); when the backlog
runs dry, revise [VISION.md](VISION.md) against actual progress and mine it for the next tranche;
periodically run a retrospective/integration task instead of a feature task. Update this file
whenever a learning changes how future work should happen. The hard limits in BACKLOG.md override
loop momentum, always — the live store, publishing, and anything irreversible remain Myk-gated.

## Commands

```
npm install            # once — pulls @rhizomes/rhizomatic from npm
npm run check          # format:check + lint + typecheck + test — the green gate
npm run chorus:demo    # the deterministic thesis walk
npm run chorus:mcp     # MCP server over stdio
npm run chorus:http    # MCP server over streamable HTTP
npm run chorus:console # the local web console
npm run chorus:migrate # JSONL → SQLite store migration
```

Toolchain: Node 22, TypeScript ESM, vitest (via esbuild — no separate build for tests), prettier +
eslint (flat config). Native dep: `better-sqlite3` (ships prebuilds; JSONL backend needs no native dep).

## Pointers

- [ROADMAP.md](ROADMAP.md) — the ordered burndown to an alpha `@rhizomes/chorus` CLI. **Start here.**
- [BACKLOG.md](BACKLOG.md) — the autonomous loop's protocol + working queue (finer-grained than the
  roadmap). [JOURNAL.md](JOURNAL.md) — the loop's record. [VISION.md](VISION.md) — the horizons
  past the roadmap; revised whenever the backlog runs dry.
- [CONSTELLATION.md](CONSTELLATION.md) — the multi-store / private / federating design + phases.
- [PERSISTENCE.md](PERSISTENCE.md) — how the pluggable store tier came to be (history/rationale).
- [README.md](README.md) — the product doc.
- The format: `@rhizomes/rhizomatic` on npm; its spec + witnesses in the sibling `../rhizomatic` repo.
