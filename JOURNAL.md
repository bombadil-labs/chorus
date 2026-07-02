# Journal — the loop's record

Append-only, newest entry last. One entry per completed task (or notable event); what happened,
why it went the way it did, what was learned. The protocol lives in [BACKLOG.md](BACKLOG.md).

---

## 2026-07-02 — Standup day: Phase 0, skills home, persistence decided, loop armed

**What landed.** PR #1 (Phase 0: CI on ubuntu+windows, standalone doc links, README front page,
LF via .gitattributes) and PR #2 (skills/ migrated from the rhizomatic repo, links repointed,
eslint taught about plain-JS .mjs). Both merged to main, green on both platforms. The green gate
runs against the _published_ `@rhizomes/rhizomatic@0.1.0` — the extraction is proven.

**Decision of record: persistence default.** Myk challenged the roadmap's "default jsonl" plan —
JSONL is a dev tier, not a production default. Landscape research (web, sourced) concluded:
**`node:sqlite` (DatabaseSync) as default backend.** Zero install surface (in Node core, nothing
can fail at `npm i -g`), synchronous API (the whole `StoreBackend` contract is sync — this
disqualified LevelDB/PGlite/classic-level outright), same on-disk SQLite format + WAL semantics as
the existing better-sqlite3 tier. RC stability on Node 24 LTS since 24.15.0; warning on 22.x is
cosmetic; floor is 22.13. better-sqlite3 becomes opt-in perf tier; LevelDB rejected (async-only,
single-process lock, maintenance-mode ecosystem). Runners-up worth remembering: libsql (sync,
bs3-compatible, embedded replicas — federation-adjacent), lmdb-js (best cross-process story),
sqlite-vec (vector index via `allowExtension` — now Horizon 3's substrate). Adapters live in
Chorus, not rhizomatic — the `StoreBackend` seam is product code; no substrate change needed.

**Learned along the way.** Windows CI + prettier requires `.gitattributes eol=lf` (autocrlf
converts everything at checkout and prettier flags all 52 files). Prettier walks the filesystem,
not git — harness-rewritten `.claude/settings.local.json` needed a `.prettierignore` entry.
typescript-eslint owns no-undef for TS but plain `.mjs` needs explicit Node globals.

**The loop.** Myk authorized autonomous operation: work the backlog, adversarial self-review in
place of PR approval, merge on green, journal, keep VISION.md alive. Hard limits recorded in
BACKLOG.md (live store untouchable, no publish, substrate changes are conversations). VISION.md
seeded with the three interlocking horizons: public read surfaces (ad-hoc Letterboxd), the schema
commons (GitHub for vocabularies), fuzzy salience (vectors at the index, judgment as author).
