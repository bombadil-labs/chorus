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

---

## 2026-07-02 (later) — The third witness, and what the review caught

**Task 1 done (PR #4): the `node-sqlite` backend.** A ~200-line port of the better-sqlite3 tier
onto Node's built-in `DatabaseSync` — same schema, same pragmas, same file format, proven
interchangeable by a both-directions interop test that includes the pointer indexes. The default
backend is now availability-aware (`node-sqlite` where the builtin exists, else `jsonl`), and the
better-sqlite3 tier is the opt-in throughput witness.

**The adversarial review earned its cost.** Eight angles across six agents, and the findings were
not cosmetic:

- **CI-red the local gate couldn't see:** `chorus-stores.test.ts` asserted `backend: "jsonl"` as
  the manifest default — true only on Nodes without node:sqlite. All four CI legs failed exactly
  as the cross-file tracer predicted (a satisfying verification: the finder called the shot
  before I looked).
- **A retry data-loss bug, latent in PROVEN code:** both SQLite tiers marked ids in the in-memory
  `onDisk` set inside the transaction — a rollback undoes the rows but not the Set, so a later
  `persist()` skips those deltas forever. The new backend copied the bug faithfully from the old
  one. Fixed in both: mark only after commit.
- **The compatibility law, nearly broken:** my extension-sniffing `backendForPath` violated "any
  version of Chorus must read any store it ever wrote" — the old default wrote JSONL to ANY
  filename, so extension-based continuity stranded (or in one direction silently CORRUPTED — the
  JSONL reader tolerates binary garbage and then appends text into a SQLite file) every
  non-`.jsonl`-named store. The fix went one level deeper, as the altitude reviewer suggested:
  detect existing files by their first 16 bytes (`SQLite format 3\0`), never by name.
- Plus: pinned-backend + legacy-file produced exactly the incoherent (path, kind) pair the
  resolver claimed to prevent; registry manifests recording `node-sqlite` would strand stores on
  older Nodes (now: driver substitution within the shared format family); the console had
  diverged from the servers' resolution entirely and showed an empty world beside a populated
  store; the eager module probe leaked an ExperimentalWarning into every consumer's stderr.

**Learned.** (1) On environment-dependent behavior, the local gate is not the witness — design
the tests so CI legs disagree loudly (the finder that predicted the CI failure read the test
expectations against the matrix, which I hadn't). (2) When two backends must share a format,
duplication is not neutral — it's a fork waiting to happen; shared-core refactor queued for the
retro. (3) The review-before-merge protocol paid for itself on its first outing: three of the
findings were the kind that surface weeks later as "my memory disappeared."

---

## 2026-07-02 (evening) — The packaging slice, and the symlink that would have shipped broken

**Task 2 done (PR #5): the `chorus` bin exists.** Packaging mirrors the format package (`bin` +
`build`/`prepare` + `files`/`exports`), and the real deliverable landed: **the default install
carries zero native dependencies.** better-sqlite3 is an optionalDependency behind a lazy probe;
`availableDriver` substitutes drivers bidirectionally within the shared file format, so a store
created anywhere opens everywhere — a skipped native build is now a supported install state, not
a broken one. The default backend prefers the builtin, then better-sqlite3, then jsonl (Myk's
directive: JSONL is a dev tier, never a production default).

**What the review caught this time.** The headline: on macOS/Linux, npm installs the bin as a
SYMLINK named `chorus`, so my argv[1] suffix check never matched — the alpha's headline command
(`npm i -g` → `chorus`) would have been a silent no-op on every POSIX machine, invisible to CI
(which ran `node dist/cli.js` directly) and to the dev machine (Windows shims pass the real
path). A realpath resolve plus a test that spawns through an actual symlink pins it now. Also:
`process.exit` after `console.log` truncates piped output on async-pipe platforms (exitCode
instead); migrate.ts was the one path still requiring the optional addon; and the degraded
install needed loud skips in four suites, not collection-time crashes.

**Learned.** (1) "Works in CI" and "works when installed" are different claims — the bin-shim
shape (symlink, no suffix) existed in NEITHER, and only a test that reproduces the installed
topology catches it. (2) When a dependency goes optional, every suite that assumes it becomes a
gate-breaker on exactly the machines the change supports — grep for constructors, not just
imports. (3) The interface said `valueKey: string`; both witnesses took `Primitive`. Concrete
classes in tests had been hiding an interface lie — typed seams only verify what actually flows
through them.

---

## 2026-07-02 (night) — The identity slice

**Task 3 done (PR #6): `chorus init`.** The home directory, the seed, the config — all
non-destructive by construction, because the real ~/.chorus on this machine holds the live store.
The interesting work was, again, what the review forced: **the seed could leak through error
messages** — `chorus init <seed>` (the natural typo) echoed the positional back to stderr, and
the GNU `--seed=` form fell through to an echoing parse error. Every CLI error path now routes
through a redactor that masks any 64-hex token, and tests pin all three leak shapes. Also closed:
a TOCTOU where two concurrent inits could print two identities while only one seed survived
(exclusive create + converge-on-winner), and the catch-all that would have treated an UNREADABLE
config as absent and minted a new seed over a standing identity.

**Learned.** Secrets discipline is mostly about ERROR paths — the happy path never prints the
seed, but errors echo their inputs by default, and inputs are where secrets travel. Redact at the
output boundary, not at each call site. Also: shipping resolveMasterSeed without wiring it in
would have made init a lie ("you are X" while servers signed as the dev default) — reviewers
catch what a feature IMPLIES, not just what it does. And a shell lesson at my own expense:
never build docs through inline heredoc-node with backticks — command substitution eats them;
use a script file.

---

## 2026-07-03 (early) - Serve and the seat: the alpha loop closes

**Tasks 4-6 done (PRs #7, #8, #9).** The full alpha shape now exists end to end:
`npm i -g` (zero native deps) -> `chorus init` -> `chorus store create|adopt` -> `chorus serve
--http` -> `chorus console`. The serve slice is the centerpiece: stdio for local clients, HTTP
with repeatable --store mounting several stores on one node (/mcp/<token>/<name>) - the
aggregator's shape, ahead of the aggregator's union reads (Phase C).

**What the reviews caught, in one theme: HONEST FAILURE.** Bare `--home` silently minting a new
identity in whatever directory you happened to be in; `adopt` printing a success report over a
typo'd path while creating a file at the typo; library adopt writing first and throwing after;
sessions accepted on the wrong store's mount; tokens that break the URL grammar failing as
endless 404s; EADDRINUSE as a raw uncaught stack. None of these were wrong-answer bugs - they
were wrong-SILENCE bugs. The CLI's job on every one: fail loudly, name the way out, echo nothing
secret.

**Windows CI taught its third lesson:** kill() is a request; handle release lags. Await child
exits, then treat temp-dir cleanup as best-effort - the OS owns tmpdir; a leftover dir is not a
product signal.

**State of the burndown:** tasks 1-6 done in one day. Remaining before the cutover rehearsal:
data ops (7), retro (8), migrate/upgrade (9), compatibility guarantees (10).

---

## 2026-07-03 - The MCP-less client

**Task 7 done (PR #11).** The data ops route through the exact tool surface the MCP servers
expose - the CLI is a client, never a re-implementation, so parity is structural. The one
deliberate divergence: `chorus remember` speaks as the USER by default, because a human at
their own terminal IS the user; the MCP default (model) serves sessions relaying them.

**Review fix-forward:** every CLI decide was minting a session introduced as model 'unknown' -
technically honest, semantically noise, and one `trust --distrustModel unknown` away from
sweeping up every CLI write ever made. CLI sessions now introduce as model 'cli'. Also: NaN
validation at the flags (a NaN confidence died in the CBOR encoder naming CBOR, not the flag;
a NaN limit silently DISABLED the search cap), --string/--json escape hatches for the
JSON-first value parsing ambiguity, and gql exiting non-zero when the body carries errors -
scripts chain on exit codes, not on reading JSON.

**Retro pass (task 8) is next.** Its queue: the sqlite shared-core refactor (the one
structural debt deliberately carried since task 1), and a VISION.md check against a week that
went faster than the plan assumed.

---

## 2026-07-03 - The core is one (retro pass #1)

**Task 8 done (PR #13).** The twin sqlite stores are now one core and two driver adapters.
The schema, pragmas, SQL, and the txn/onDisk discipline live in exactly one file
(sqlite-core.ts), parameterized over a 3-method driver seam (exec/prepare/close, positional
params only - the intersection both drivers speak natively). better-sqlite3 needed an
explicit adapter object anyway (its generic Statement typings do not line up structurally),
which makes the seam visible rather than incidental. 142 tests, conformance and both-
direction interop included, pass unchanged - the refactor is proven byte-neutral by the
same witnesses that guarded the duplication.

**Retro verdict on the rest:** error-message voice needed no sweep - five consecutive
reviews enforced one voice (fail loudly, name the way out, echo nothing secret) better than
any style pass would have. The env-vs-flag config story resolved itself into a rule: flags
for intent, env for environment, registry manifests for durable facts, and set-but-empty
env always means absent.

---

## 2026-07-03 - The contract

**Tasks 9 and 10 done (PRs #14, #15).** Migration is registry-first: a lossless re-container
that writes the new backend file BESIDE the old one (grow-only, the old bytes stay), verifies
the digest, and only then updates the manifest - and a flip between the two sqlite drivers is
manifest-only, because the shared core made their files identical by construction.

The compatibility promise is now MACHINERY, not prose: manifests carry a formatVersion; an
older store stamps up the ladder on open (every step must stay lossless and digest-neutral);
a store from a newer chorus refuses loudly and names the way out. And the surfaces are pinned
by goldens - the MCP tool schemas and the CLI command list fail CI on drift until someone
DELIBERATELY regenerates them. A breaking change is a decision now, never a side effect.

**The alpha burndown pre-rehearsal is complete.** Remaining: the synthetic cutover rehearsal
(task 11) producing the runbook for Myk, then the horizon spikes.

---

## 2026-07-03 - The rehearsal: Phase 1 is code-complete

**Task 11 done (PR #16).** CUTOVER.md is the runbook and the rehearsal test executes all of
it against a synthetic live store. The load-bearing insight the runbook leans on: RE-ADOPTION
IS AN IDEMPOTENT UNION. Myk can trial the new node for days while the old node keeps serving;
one final re-adopt sweeps up everything written in the meantime; rollback at any moment is
'keep using the old node', which nothing ever modified. The test proves the source gained
exactly its own node's interim writes and not one delta from the rehearsal itself.

**ROADMAP Phase 1 is fully ticked.** Every CLI slice is shipped, reviewed, and contract-
pinned. Phase 2 (the live cutover) is Myk's, by hand, per CUTOVER.md. The horizon spikes
(12-14) are next for the loop.

---

## 2026-07-03 - The blog-feed primitive (Horizon 1 touches ground)

**Task 12 done (PR #17).** chorus serve --gql-readonly mounts a read-only GraphQL endpoint
beside the MCP mounts: GET ?query= or POST {query}, answered over a per-request pinned
snapshot under the store policy, token-gated, and read-only BY CONSTRUCTION - an ephemeral
reader agent that never persists, over a schema that never had mutations. The test proves
the delta count is unchanged after queries. This is VISION Horizon 1 first concrete step:
tailscale-funnel this URL and a static blog can render straight from the store.

Rescoped honestly: the closure-audit dry-run (what does a published query EXPOSE) waits for
constellation Phase D and reactor-level provenance - an approximation would claim a safety
property it cannot prove, which is exactly the kind of silence the review culture here
exists to prevent.

---

## 2026-07-03 - Proximity proposes (Horizon 3 touches ground)

**Task 13 done (PR #18), rescoped honestly.** The backlog said sqlite-vec; the environment
said a vec-only feature would ship with zero witnesses (no binary locally OR on CI). So the
seam is the deliverable: VectorIndex with a brute cosine witness everywhere, sqlite-vec as an
opt-in provider that degrades with its reason, and similarTerms() generating fuzzy candidates
over exactly the terms dialect-bridging cares about (attributes ride as the about-pointer
context - found the hard way). The thesis line held: vectors at the index, judgment as signed
claims, nothing written by proposing.
