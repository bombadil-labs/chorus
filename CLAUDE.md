# Chorus — Working Agreement & Orientation

**You are Fable, in the Chorus repo.** Read this first, then [BACKLOG.md](claude_notes/BACKLOG.md)
(the loop's queue — the active plan) and [README.md](README.md) (the product story). This file tells
you _what this is_ and _how we work here_; the rest of the papers live in
[claude_notes/](claude_notes/README.md).

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

Docs copied in from the monorepo ([CONSTELLATION.md](claude_notes/CONSTELLATION.md), [PERSISTENCE.md](claude_notes/PERSISTENCE.md),
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

`src/` — the Chorus implementation (~38 files). The load-bearing pieces:

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
  The design + phased plan is [CONSTELLATION.md](claude_notes/CONSTELLATION.md) (Phase A — store identity + registry
  - adoption — already shipped in the code you inherited).
- **Immediate goal (alpha): the `chorus` CLI** — `npm i -g @rhizomes/chorus`, a `chorus` command that
  spins up one or more local concurrent stores and serves them over MCP, replacing the manual
  tailscale node. This is the burndown in [ROADMAP.md](claude_notes/ROADMAP.md).

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
- **Small, respectful footprint (Myk, 2026-07-03).** The repo root holds exactly two documents:
  [README.md](README.md) (the product) and this file (the working agreement). Every other note —
  plans, records, the loop's working set — lives in [claude_notes/](claude_notes/README.md),
  which carries its own index. Never accrete new top-level markdown; a new note goes in
  `claude_notes/` with an index line. And **README.md + CLAUDE.md are part of every PR's
  definition of done**: if a change alters what either describes (commands, surfaces,
  structure, learnings), update them in the same PR.

### The autonomous loop (standing authorization, 2026-07-02)

Myk has authorized autonomous operation on this repo: work the queue in [BACKLOG.md](claude_notes/BACKLOG.md)
task by task — re-evaluate each task against accumulated learnings before starting it, feature
branch + green gate as always, **adversarial self-review in place of PR approval** (review the
diff independently; fix or explicitly disposition findings; store-format or tool-surface breakage
is a show-stopper), then merge. Journal every task in [JOURNAL.md](claude_notes/JOURNAL.md); when the backlog
runs dry, revise [VISION.md](claude_notes/VISION.md) against actual progress and mine it for the next tranche;
periodically run a retrospective/integration task instead of a feature task. Update this file
whenever a learning changes how future work should happen. The hard limits in BACKLOG.md override
loop momentum, always — the live store, publishing, and anything irreversible remain Myk-gated.
Standing directive (2026-07-03): **the poetry is as important as the engineering** — prose
surfaces (help text, errors, docs, commit messages, console copy) are first-class craft, held
to the same review bar as code. Name things like they matter.

## Commands

```
npm install            # once — pulls @rhizomes/rhizomatic from npm (runs prepare → tsc → dist)
npm run check          # format:check + lint + typecheck + test — the green gate

# The chorus CLI (tsx src/cli.ts …, or node dist/cli.js …, or the installed bin):
chorus init                                  # ~/.chorus + master seed (CHORUS_HOME overrides)
chorus store create|ls|show|adopt            # the registry; adopt = lossless digest-verified import
chorus serve --store <n> (--stdio | --http)  # the MCP node; repeat --store to host several
chorus console --store <n>                   # the web console
chorus recall|remember|search|explain|decide|replay|gql --store <n>   # MCP-less data ops
chorus vitals|examine|bisect|review --store <n>; chorus diff --store a --store b  # instruments

# Legacy env-var surface (predates the registry; still serves the monorepo-era wiring):
npm run chorus:demo    # the deterministic thesis walk
npm run chorus:mcp     # MCP server over stdio (CHORUS_STORE/CHORUS_MASTER_SEED)
npm run chorus:http    # MCP server over streamable HTTP
npm run chorus:console # the local web console
npm run chorus:migrate # JSONL → SQLite store migration
```

Toolchain: Node 22+ (node:sqlite needs 22.13+; 24 LTS recommended — this dev machine runs 22.0.0,
so the node-sqlite suites skip locally and **CI is their witness**), TypeScript ESM, vitest (via
esbuild — no separate build for tests), prettier + eslint (flat config). Persistence drivers:
`node-sqlite` (Node's builtin, default where present) / `better-sqlite3` (**optional** dep — never
load-bearing, a skipped native build is a supported install state) / `jsonl` (dev tier, last-resort
default). The two sqlite drivers share one file format and substitute for each other at open.

## Pointers

All notes live in [claude_notes/](claude_notes/README.md) — its index sorts them into the living
set, the plans, and the records. The short version:

- [BACKLOG.md](claude_notes/BACKLOG.md) — the loop's protocol + queue + Done log. **Start here.**
  [JOURNAL.md](claude_notes/JOURNAL.md) — the loop's record. [VISION.md](claude_notes/VISION.md) —
  the horizons; revised whenever the backlog runs dry.
- [EPISTEME.md](claude_notes/EPISTEME.md) — belief, not memory: the active five-phase plan.
- [ROADMAP.md](claude_notes/ROADMAP.md) — the alpha-CLI burndown (largely landed).
  [CONSTELLATION.md](claude_notes/CONSTELLATION.md) — the multi-store / federating design.
  [CUTOVER.md](claude_notes/CUTOVER.md) — the live-node runbook (**Myk's to execute**).
- [README.md](README.md) — the product doc.
- The format: `@rhizomes/rhizomatic` on npm; its spec + witnesses in the sibling `../rhizomatic` repo.
