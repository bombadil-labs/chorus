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

---

## 2026-07-03 - The commons (Horizon 2 touches ground)

**Task 14 done (PR #19).** The schema commons needed no new mechanism - that was the point
to prove. attr:/scheme:/hyperschema: are ordinary entities carrying ordinary claims; the
seeder is an ordinary author (a registrar is just an author whose naming you rank);
convergence is sameAs and librarian mappings, exactly as everywhere. The seed self-hosts:
hyperschema:commons declares the very attributes the commons is made of, which is the proof
the modeling suffices. And the public read surface for a hosted commons is the task-12
endpoint, already shipped. All three horizons have now touched ground in code, each
composing with the others exactly as VISION.md claimed they would.

---

## 2026-07-03 - Stock-take (retro #2): the day the plan ran out

**Task 15 done (PR #20) - and with it, the seeded backlog.** Nineteen PRs in roughly one
day of loop time: Phase 0 standup, the skills home, three interchangeable sqlite witnesses
over one shared core, the whole CLI, contract pins, a proven cutover runbook, and all three
VISION horizons grounded in composing code. The green gate grew from 104 to 158 tests.

**What the retro sees.** (1) The horizons composed exactly as claimed - the commons needed
no mechanism, the endpoint serves it, the seam bridges it. That was the thesis and it held.
(2) The review culture found wrong-SILENCE far more often than wrong answers; honest failure
is now listed in VISION as a product value beside the CRDT. (3) The binding constraint moved:
it is no longer code, it is decisions - cutover, publish, hosting, embedding model - all
Myk's, all listed in BACKLOG under their own heading now.

**Tranche 2 queued:** encrypted private stores (Phase B), the aggregator union read (Phase
C's first slice), publish readiness minus the button. The loop continues.

---

## 2026-07-03 - Ciphertext at rest (Phase B)

**Task 16 done (PR #21).** The encrypted private store: AES-256-GCM per row with the delta
id bound as AAD, the key a labeled child of the master seed (re-derivable by the master
holder, forgeable by nobody), and - the deliberate trade - NO pointer index, because indexed
targets and values would write the store structure in the clear. The leak model is stated in
the file header and PROVEN by the test that greps the raw bytes: what leaks is how much you
know and when it arrived, never what. The conformance suite runs the encrypted backend as a
full witness, so private stores converge, dedup, and resume exactly like every other tier.

---

## 2026-07-03 - The union (Phase C first slice)

**Task 17 done (PR #22).** /gql/<token>/@union answers over the union of every store the
node serves - and the implementation is nine lines of difference, because the substrate did
the work: merge is union, so aggregation is a fold of refreshes into one ephemeral reader.
The aggregator the constellation promised now exists in its read-only form: mount personal +
media + commons on one node and one GraphQL query walks all three worlds, while each
single-store mount stays exactly as isolated as before.

---

## 2026-07-03 - Minus the button

**Task 18 done (PR #23).** Everything about publishing except the act: release scripts,
and a CI step that packs the real tarball and installs it globally into a temp prefix on
both OSes, then drives the INSTALLED bin through a full init -> store -> write -> read loop.
When Myk presses the button (un-private + npm publish), the artifact that ships is the one
CI has been smoke-installing on every push since today. Tranche 2 build items are done;
retro #3 remains, parked until the decision gates move.

---

## 2026-07-03 - The loop rests: 23 PRs, everything buildable built

**The first autonomous run ends here, by the protocol own logic:** every loop-executable
task is done, and what remains is either Myk-gated (cutover, publish, hosted commons,
embedding model) or wants those gates lessons first (retro #3, parked). The tally: PRs
#1-#23 in one day. Phase 0 + the skills home; three interchangeable sqlite witnesses over
one shared core plus an encrypted private tier, all conformance-proven; the complete CLI
with contract-pinned surfaces and a formatVersion ladder; the cutover rehearsed end to end
and scripted in CUTOVER.md; all three VISION horizons grounded (read-only GQL + @union,
the self-hosting commons, the similarity seam); publish readiness with the shipping
artifact smoke-installed by CI on every push. The gate grew 104 -> 176 tests.

**For whoever wakes next** (a fresh session, or me after the gates move): BACKLOG.md has
the queue and the gates; VISION.md the horizons; this file the narrative. The protocol in
BACKLOG.md is the contract - re-evaluate, build, review adversarially, merge on green,
record. The live store remains untouchable until Myk runs CUTOVER.md by hand.

---

## 2026-07-03 - The mail answered (watch mode catches a real signal)

**Task 20, adopted from the inbox.** Watch mode checked the chorus inbox and found unacked
mail from the monorepo-era dogfooding: an opus-4-8 design review whose build order is
mostly SHIPPED in this repo already (backlinks, pinned-snapshot gql - convergent evolution
across sessions that never met), and a direct request from Myk: the kind enum had no slot
for an interpretation being ADVANCED. Ruled and shipped: kind is an open vocabulary now,
core five documented (observation/fact/preference/task/claim), minted kinds round-trip with
receipts. The golden pin fired on the schema change and was deliberately regenerated - the
contract machinery working exactly as built. The messages are acked through the product,
with notes pointing here.

---

## 2026-07-03 - The first gauge (EPISTEME Phase V begins)

**V.1 done (PR #27).** chorus vitals reads a store the way a physician reads a chart:
contested slots, source concentration (a Herfindahl index answering: how much of what this
store believes rests on one voice?), retraction rate, staleness percentiles, confidence
coverage (the gauge Phase VII calibration will need), kind distribution. Read-only by
construction - the instrument never writes; the test pins the delta count across two
measurements. The bar from EPISTEME held during design: every metric must trace to a
decision someone would make differently, or it is a vanity number and gets cut.

Context for the record: Myk reframed the product tonight (belief, not memory - EPISTEME.md),
then sent a Cummings poem as the north star and asked the Mozart question. The answer is in
the transcript; the relevant part for this file is that feeling-is-first now has an
engineering meaning here: the instruments exist so the feeling can be TRUSTED, never so it
can be replaced. Measure first, testify later, and never let the ledger mistake itself for
the kiss.

---

## 2026-07-03 - Drift, made visible (V.2)

**chorus diff ships (PR #28).** Two stores side by side, or one store against its own past -
the as-of variant rebuilds the world as it stood at an instant and asks: what changed its
mind since Tuesday? The design decision worth recording: agreement is not one thing. Same
values with overlapping testimony is agreement; same values with DISJOINT authors is
independent corroboration - epistemically stronger - and the diff names it instead of filing
it under same. Disagreement exits non-zero, because drift between agents that should agree
is a signal scripts want to chain on, caught before it costs something.

Myk greenlit full ambition tonight - reach for the stars, poetry as important as engineering.
The directive is in memory and in the working agreement; the gauge cluster grows next: bisect.

---

## 2026-07-03 - The search (V.3)

**chorus bisect ships (PR #29).** git-bisect for a mind: binary search over the as-of
instants, culprit named with receipts, logarithmic probes asserted. Two findings worth the
record. First: the sound instant set is ALL delta timestamps, because a negation targets a
DELTA, never the entity it silences - filter by entity and you miss the retraction that
flipped the view. Second: the tool came out more honest than its own test - a revise is
retract-then-assert across two instants, and bisect correctly surfaces the intermediate {}
the view passed through. The test was wrong; the mind really did blink.

---

## 2026-07-03 - The instrument goes on the record (V.4)

**chorus examine ships (PR #30).** The examiner is an author now, in the fullest sense: a
labeled child of the master seed, introduced once as model chorus-examiner, signing every
measurement it takes. recall vitals:<store> reads current health; explain reads the health
HISTORY, because re-examination re-asserts and the grow-only log keeps the series - the
time-series chart was free, as EPISTEME predicted. And the night second philosophical bug:
the first re-examination counted the examiner own testimony as live beliefs - the
instrument measured its own needles, twelve where three lived. Vitals now excludes
kind:measurement wholesale: the panel describes the world, never the describing. Godel
would have smiled; the test caught it in nine seconds.

## 2026-07-03 — The pitch is the product (V.5)

**What landed.** The README no longer leads with "memory." It opens: _"Chorus doesn't store what
happened. It stores what was believed — by whom, since when, on what grounds, and what became of
that belief next."_ Then the stranger-facing argument (your agents already act on beliefs; they
just can't show them to you; the belief that drove the act evaporates when the context window
closes), the four load-bearing properties in one breath, and the line that names the product:
**memory is the feature; belief accounting — the flight recorder for minds — is the product.**
A second paragraph gives the instruments their public debut as a physician's kit: vitals reads
the chart, diff catches drift, bisect finds the flip and the finger, examine signs its own
measurements. Closing on the phrase that has carried EPISTEME since Phase V began: _no view from
nowhere, all the way up._ EPISTEME.md is now linked from the status paragraph.

**Why this counts as engineering.** EPISTEME's premise was that positioning is a product surface
— the words a stranger reads first decide what they think the instruments are FOR. "Memory for
agents" invites comparison to a vector store; "flight recorder for minds" invites the question
"what did my agent believe when it did that?" — which is the question the toolchain actually
answers. The pitch had to wait until V.1–V.4 existed, because before the instruments shipped it
would have been a promise; now it is a description.

**Housekeeping.** The backlog's V.2/V.3 entries had gone stale-open with mangled titles from an
earlier edit; moved to Done properly (Belief diff, Belief bisect) and the open ladder now reads
clean: V.6 retro, then the nightcap.

## 2026-07-03 — The papers find their drawer (tidy root, Myk's request)

**What landed.** Myk, mid-loop: "there are SO many claude notes in the root dir... let's keep our
footprint small and respectful." He is right — eleven markdown files at the front door is a desk
covered in papers. Now the root holds exactly two: README.md (the product) and CLAUDE.md (the
working agreement). The other nine moved — via git mv, history intact — into claude_notes/, which
carries an index sorting them honestly: the living set (BACKLOG, JOURNAL, VISION — the loop writes
here), the plans (ROADMAP, EPISTEME, CONSTELLATION, COMMONS), the records (PERSISTENCE settled,
CUTOVER waiting on Myk's hand).

**The standing rule, now in CLAUDE.md.** Never accrete new top-level markdown. And README.md +
CLAUDE.md are part of every PR's definition of done — if a change alters what either describes,
the same PR updates them. Practicing it immediately: CLAUDE.md's stale file count (24 → ~38), the
missing instrument ops in Commands, and a Pointers section that still said "start at ROADMAP"
(largely landed) instead of BACKLOG (the active plan) were all corrected in this pass.

**Mechanics worth remembering.** Moving markdown is a linking problem, not a moving problem:
sibling links survive untouched, links up and out gain ../, root links gain the directory prefix
— and the sweep must include prose mentions in code (cli.ts help text, stores.ts comments, the
cutover test header) plus a check that no golden pin froze the old paths (none had).

## 2026-07-03 — What Phase V taught (the V.6 retro)

**The arc.** Six tasks, six PRs, one reframe. Phase V set out to build an instrument panel and
ended up discovering what the instruments are for. Vitals (V.1) gave the store a pulse; diff
(V.2) refused to flatten agreement — same conclusion from disjoint testimony is STRONGER than
agreement, and the tool says so; bisect (V.3) turned "when did I start believing this?" into a
binary search with a culprit and receipts; examine (V.4) put the measurements themselves on the
record, signed, distrustable; repositioning (V.5) rewrote the front door once the claims behind
it were true. The ladder held because each rung only used what the substrate already guaranteed
— as-of reads, signed authorship, grow-only history. Zero substrate changes, as EPISTEME
promised.

**The organizing lesson, promoted to a design rule.** Every real defect this phase was a
WRONG-SILENCE, not a wrong answer: the panel silently counting its own needles (V.4's
self-measurement bug); the bisect baseline silently treating an entity's birth as noise; a
green-looking grep silently hiding a typecheck failure; a merge chain silently watching the
wrong branch; a --watch that silently returned before checks registered. None of these lied —
they all just said nothing when they should have spoken. Phase VI exists to make the STORE
speak up: retrospective replay, staleness challenges, contradiction mining, the resident
skeptic. All of it is mail and claims, never mutation; all of it must earn its interruptions.

**Three design principles Phase V leaves behind:**

1. _The gauge describes the world, never the describing_ — instruments exclude their own
   testimony from what they measure, or every reading inflates the next.
2. _No view from nowhere, all the way up_ — measurements are claims with authors; the examiner
   is calibrated by the same machinery as everyone else. There is no privileged observer, and
   that is a feature you can build on, not a limitation to apologize for.
3. _Honest tools embarrass their own tests_ — bisect surfaced the retract-instant inside a
   revise that the test assumed was atomic. When a tool disagrees with its test, check the test
   first; the tool may be seeing something true.

**Gates check (unmoved, all four).** The live cutover, publishing, the hosted commons, and the
embedding model remain Myk-gated — none loop-executable. Phase VI mined into tranche 4
(VI.1–VI.6): the examiner stops describing and starts knocking.

**Process notes for the record.** Merge by PR number, never by current branch. Sleep before
gh pr checks --watch — checks register late and the watch exits clean on "no checks." Verify
the gate by reading the counts, never by grepping for absence. Prose edits go through .mjs
script files, not shell heredocs. And Myk's tidy-root request mid-loop was a reminder worth
keeping: the working agreement is a living document, and the footprint is part of the product.

## 2026-07-03 — The examiner starts knocking (VI.1)

**What landed.** `chorus review --store <n>` (and the library seam `reviewDecisions`): every
standing decision is replayed against the present, and where its ground has moved — beliefs it
relied on retracted, the same question resolving differently today, the slot newly contested,
or the pinned basis no longer verifying — the examiner writes the decider a letter: _"On
<date> you decided '<intent>' about <entity>. Since then, 2 of the beliefs you relied on have
been retracted; the question resolves differently today. The action may need revisiting —
`chorus replay <id>` shows exactly what you saw."_ Author-mail, addressed to the exact keypair
that decided; `about` the entity; carrying a pointer to the decision itself. Phase V built the
gauges; this is the first instrument that acts on what it reads.

**Earning the interruption.** EPISTEME named alert fatigue as Phase VI's failure mode, so
idempotence is structural, not polite: each letter carries a verdict fingerprint — a hash of
exactly what moved (retracted ids, current basis, contested flag) — and a verdict already on
file is never re-mailed. The world moves again, the fingerprint moves, one new letter. The
test asserts all three beats: mail, silence, mail. Exit code 1 on findings, same contract as
diff: drift is the signal scripts chain on.

**Mail and claims, never mutation.** The review's entire output is an introduction (once),
letters, and fingerprints. Messages carry no belief pointer, so recall/search/vitals never see
them — the test closes with the letters staying out of the belief surface. And the examiner in
the review is the SAME derived author as the examiner in the testimony: one voice, one track
record, distrustable as a unit.

**Caught in passing.** The bisect CLI's --good/--bad validator read /^d+$/ — missing
backslash, so every VALID instant threw "is an instant in epoch milliseconds." The existing
test only asserted that junk was rejected; a validator that rejects everything passes that
test. Wrong-silence's mirror: loud on the right input. Fixed, with an accept-side regression
test. The lesson from the retro holds shape: test the door opens, not just that it locks.

## 2026-07-03 — The store asks to be checked (VI.2)

**What landed.** `chorus challenge --store <n> [--half-life <days>]` and `challengeStale()`:
every live belief slot past its half-life draws exactly one letter from the examiner to the
voice that last spoke it. _"Your last word on svc:api owner is 40 day(s) old — past this
store's half-life, and nothing has confirmed or contradicted it since. A standing decision
rests on it. If it still holds, say it again — a fresh assertion IS re-verification here. If
it doesn't, retract it. Either answer beats silence; silence is how stores rot."_ Claims a
standing decision saw when it acted are flagged load-bearing (the replay receipts are the
citation index, already built). Exit 1 when anything is past its half-life — rot is chainable,
same as drift.

**The kindest property, put to work.** In a grow-only CRDT there is no "touch" operation, no
mark-as-reviewed flag — and it turns out none is needed: re-assertion is a fresh signed claim
at a fresh instant, which resets the slot's age, which clears the challenge. The cure for
staleness is just saying the thing again, if you still mean it. The test walks the full arc:
challenged → not nagged → re-asserted → clear. Retraction is the other one-gesture answer.
The letter teaches the mechanism instead of hiding it.

**Self-calibration.** `--half-life` unset means the threshold is the store's own staleness
p90 — a fast-moving store challenges in days, an archive in months, and an empty store
challenges nothing (infinity is honest when there is nothing to calibrate against). The
examiner keeps measuring the world by the world's own clock.

**Continuity of voice.** Same examiner keypair as testimony and review — one derived author,
one track record, one entity you can distrust. Same anti-nag contract too: fingerprints, now
shared machinery (verdictsOnFile grew a role parameter instead of a copy). Measurements are
never challenged; the gauge describes the world, never the describing — the rule from V.4
holds without exception three instruments later.

## 2026-07-03 — One question, two dialects (VI.3)

**What landed.** `chorus contradictions --store <n> [--threshold]` and
`mineContradictions()`: the contested scan sees rival values in ONE slot, but a store that
speaks two vocabularies can contradict itself across slots the scan will never compare —
`deploy-env = "prod"` and `deployment_environment = "staging"` are the same question wearing
different words. The miner proposes those pairs by letter to the human judge (the console
inbox): _"svc:api may be answering one question in two dialects... If these are the same
question, the store contradicts itself and the contested scan cannot see it. If they are
genuinely different questions, no action: this is a proposal, not a verdict, and proximity is
not identity."_ Nothing auto-merges. Same value in two dialects is agreement wearing two coats
— deliberately not flagged.

**Similarity is a seam, not a dependency.** The real embedding model is Myk-gated, so the
default comparator is lexical — token overlap with abbreviation-aware prefixes (env ~
environment, repo ~ repository), deterministic, zero deps — which catches the dialect cases
that actually arise from tooling habits. `embeddingSimilarity(model)` upgrades the same call
to semantic neighbors (owner ~ maintainer) the moment a model is wired, with out-of-vocabulary
terms falling back to the lexical view rather than pretending to know. The test proves both
eyes work and that they see different things.

**The invisible ink, found and fixed.** `file` calling librarian.ts "data" unraveled a small
mystery: the slot-key separator idiom used LITERAL NUL BYTES in source — invisible in every
editor and tool render, which is exactly how one crossed into challenges.ts when I matched
what I thought was a space-separator idiom by eye. Four files (vitals, librarian, belief-diff,
challenges) now spell it \u0000 — same bytes at runtime, visible to every reader. The lesson
files under the retro's rule: the difference between a space and a NUL is a wrong-silence, and
honest source shows its separators.

## 2026-07-03 — Doubt with an author (VI.4)

**What landed.** `chorus skeptic --store <n> [--all]` and `skepticPass()`: a resident
doubter that files a signed claim wherever the whole store knows something on one voice's word
— decision-cited slots by default (where thin testimony matters most), every single-voice slot
with `--all`. The doubt lives at `doubt:<entity>`, kind "doubt", visible to recall and
search like any belief: _"uncorroborated: the whole store knows svc:api owner on one voice's
word. A standing decision rests on it. A second voice asserting it clears this doubt."_ The
skeptic is a SECOND derived author — `author/skeptic`, model `chorus-skeptic`, its own
keypair and track record, deliberately not the examiner. You can trust the measurements and
still fire the doubter. That is the whole point of voices.

**No fingerprints this time — the store is its own ledger.** Review and challenge needed
verdict fingerprints because letters leave no live trace once acked. Doubt is a live claim, so
its own standing IS the idempotence key: while a doubt stands, the skeptic stays quiet; when a
second voice corroborates the slot, the skeptic WITHDRAWS — a negation with the reason named
("corroborated: 2 voices now hold svc:api owner"), or "moot" when nothing live remains. The
test walks the full arc: doubt → quiet → corroborate → withdrawn → the live view is clean, and
the whole history of the doubt survives in the audit trail forever. Doubt that cannot be
satisfied is not skepticism; it is a grudge. This skeptic can be satisfied.

**The exclusions hold shape.** Measurements are never doubted (the gauge describes the world),
doubts are never doubted (that way lies philosophy, not hygiene), and the doubt entities
themselves stay out of the slot scan. Three instruments in, the V.4 rule — the panel excludes
its own needles — has become load-bearing architecture rather than a bug fix.

**A pratfall worth recording.** Trying to sed the \u0000 escape into skeptic.ts inserted
LITERAL NULs — sed's replacement grammar ate the backslash — recreating the exact invisible-ink
bug VI.3 had just cleaned up, in the file being written to avoid it. The fixer script un-mangled
it in one pass. The lesson compounds: source edits carrying escapes go through script files,
never shell substitution — bash and sed both have opinions about backslashes.

## 2026-07-03 — What Phase VI taught (the VI.6 retro)

**The arc.** Phase V built gauges; Phase VI gave the store a voice. Four instruments in four
PRs: review (your decision's ground moved), challenge (your belief is going stale — say it
again if you still mean it), contradictions (you are answering one question in two
vocabularies), skeptic (the whole store knows this on one voice's word). Every one of them
speaks in mail and claims, never mutation; every one earns its interruptions — fingerprints
where letters leave no trace, the live doubt itself where a claim does. The store stopped
being a place you look things up and became something closer to a colleague who reads over
your shoulder and only taps it when the tapping is worth it.

**The deepest structural find: two voices are better than one.** The examiner and the skeptic
are DIFFERENT derived authors, deliberately. Trust in Chorus is per-author policy, so
splitting the inhabitants by function means you can keep the measurements and fire the
doubter, or rank doubt below testimony without muting the vitals. The substrate made this
free; noticing it was the work. Phase VII (the Actuary — calibration, earned trust) now has
its subjects already standing in the store: voices with track records, waiting to be scored.

**Idempotence has two honest shapes.** Letters need fingerprints (mail leaves no live trace
once acked). Claims need nothing — their own standing is the ledger, and WITHDRAWAL becomes a
first-class gesture with a named reason. Knowing which shape a surface wants is now a design
reflex: if re-running the tool twice changes the store, the tool is wrong.

**VI.5 deferred, honestly.** The hypnagogic pass (idle-time consolidation) requires judgment —
which recast is better, which sameAs is true — and without the Myk-gated embedding model or an
in-loop judge it degrades to auto-merge wearing a nightcap. It waits for its gate. Also: no
stretch features immediately before a contraction phase.

**Gates check: unmoved.** Cutover, publish, commons, embedding model — all four still Myk's.
Phase VII deliberately not mined yet: Myk's nightcap protocol is next, and its contraction /
consolidation / marketing passes are integration work that should precede another feature
phase. What the expansion movements surface may reshape what the Actuary wants to be.

**Process lessons that compounded this phase.** Test the door opens, not just that it locks
(the bisect regex). Invisible bytes cross files by imitation (the NUL saga — now spelled
visibly everywhere). Escape-bearing edits go through script files; bash and sed both have
opinions about backslashes. And the panel-excludes-its-own-needles rule graduated from bug fix
to architecture: three instruments now rely on it without a second thought.

## 2026-07-03 — Ten new windows (N.1, the nightcap begins)

Myk left six movements for the night and the first is pure divergence: _are there some next
things that would be cool?_ Not EPISTEME re-listed, not the horizons re-worn — new. Ten ideas
went into VISION.md under "The nightcap expansions," deliberately unranked, because ranking is
N.3/N.4's job after contraction changes what is visible.

The pass found its own through-line halfway in: **the store already knows more than any
surface shows.** The deposition, the time-travel slider, story mode, the provenance poster —
these are not new capabilities, they are new WINDOWS onto receipts the store has been keeping
all along. As-of was always the time machine; explain was always the narrative; the receipts
were always the diagram. The cheap-looking ideas are cheap precisely because the substrate
already paid for them, which is the whole thesis wearing party clothes.

The two that reach furthest: **second opinions** (a store queries another store and records
the answer as signed testimony — consultation, not sync; the constellation pointed at a
question) and **chorus as a git citizen** (decide-per-merge + review-wired-to-CI — the flight
recorder for codebases, which is just this loop's own daily practice, productized). Both are
rooms, not windows. Both wait their turn.

Next: N.2, contraction. Given the ~35-PR sprint: dead exports, scaffolding, doc drift,
dependency audit, suite runtime. Deletion as craft.
