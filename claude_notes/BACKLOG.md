# Backlog — the autonomous loop's working queue

**What this is:** the ordered task queue for the autonomous loop, and the protocol that governs it.
[ROADMAP.md](ROADMAP.md) stays the authoritative phase map; this is the loop's operational view of
it — finer-grained, reorderable, and annotated with what's been learned. [VISION.md](VISION.md) is
where new tasks come from when this runs dry. [JOURNAL.md](JOURNAL.md) is the record.

## The protocol

Standing instruction from Myk (2026-07-02), formalized:

1. **Take the top open task.** Before starting, re-read it against everything learned since it was
   written. If work or insight since then compels a change — rescope, reorder, split, or kill it —
   make that change _and document why_ (a line in the task, a journal entry if substantial).
2. **Work it to done.** Feature branch; green gate (`npm run check`) before every commit;
   adversarial self-review before merge (run `/code-review` or an independent review agent on the
   diff — findings get fixed or explicitly dispositioned, and breaking changes to store formats or
   tool surfaces are show-stoppers); merge without waiting for approval; delete the branch.
3. **Record it.** Journal entry (what/why/learned). Tick the task. If the work changed how future
   work should happen, update [CLAUDE.md](../CLAUDE.md); if it changed where things are going, update
   [VISION.md](VISION.md).
4. **Repeat.** When the backlog runs dry: take stock of everything achieved, re-read VISION.md,
   revise it against actual progress, and mine it for the next tranche of tasks. This is a
   never-ending process of becoming, not a checklist with an end.
5. **Sometimes the right task is retrospective** — "what chaos has accumulated, and what
   integration does it want that wasn't obvious in advance?" Schedule one deliberately every
   several tasks (they're seeded below as ♻ tasks).

**Hard limits (never crossed without Myk, regardless of loop momentum):**

- The live store `~/.chorus/memory.sqlite` and the serving node `../rhizomatic/apps/chorus`:
  **do not touch**. Cutover (ROADMAP Phase 2) is Myk-gated end to end.
- No `npm publish`, no repo-visibility changes, no force-push/history rewrite.
- Substrate changes belong in the `rhizomatic` repo — a PR there is a conversation with Myk, not a
  loop task.
- Anything irreversible or outward-facing beyond this repo's GitHub: stop and ask.

## The queue

### Now — persistence + CLI (ROADMAP Phases 1)

_(task 1 moved to Done)_

_(task 2 moved to Done)_

_(task 3 moved to Done)_

_(tasks 4-6 moved to Done)_

_(task 7 moved to Done)_

_(task 8 moved to Done)_

_(tranches 1–3 — tasks 1–20, V.1–V.6 — moved to Done)_

### Now — EPISTEME Phase VI: the Examiner acts (tranche 4, mined 2026-07-03 by the V.6 retro)

Phase V measures; Phase VI acts. The organizing lesson, promoted from the journal to a design
rule: **most defects are wrong-silence, not wrong-answers** — so the store learns to speak up.
Everything the examiner does is **mail and claims, never mutation**; alert fatigue is the named
failure mode, so every examiner surface must earn its interruptions (its mail carries enough
context to be dismissed in one read, and ack-rates are its future report card, per Phase VII).

- [x] **VI.1 Retrospective replay** — _Done 2026-07-03 (journal: The examiner starts knocking):_
      `chorus review` + `reviewDecisions()` replay every standing decision; retracted /
      superseded / contested / basis-unverified grounds draw examiner author-mail with the
      exact reasons and a replay pointer; verdict fingerprints make re-review idempotent (the
      examiner does not nag); exit 1 on findings so scripts chain. Also fixed in passing: the
      bisect CLI's `--good/--bad` validator regex (`/^d+$/`) rejected every valid instant —
      plus the accept-side test the junk-only assertion could never provide.
- [x] **VI.2 Staleness challenges** — _Done 2026-07-03 (journal: The store asks to be
      checked):_ `chorus challenge [--half-life <days>]` + `challengeStale()`: every live slot
      past the half-life draws one examiner letter to the voice that last spoke it;
      decision-cited claims are flagged load-bearing; unset half-life self-calibrates to the
      store's own staleness p90. The cure is the substrate's kindest property — re-assertion
      IS re-verification — and the test proves a fresh assertion clears the challenge. Same
      anti-nag fingerprints as review; measurements never challenged (the gauge again)._
- [x] **VI.3 Contradiction mining** — _Done 2026-07-03 (journal: One question, two dialects):_
      `chorus contradictions [--threshold]` + `mineContradictions()`: near-synonym attributes
      on one entity holding rival values are proposed by letter to the human judge; same
      values in two dialects is agreement, not flagged; nothing auto-merges. Similarity is a
      seam — lexical comparator by default (token overlap + abbreviation-aware prefixes, zero
      deps), `embeddingSimilarity(model)` ready for the Myk-gated real model. Same anti-nag
      fingerprints. Also: the literal-NUL slot-separator idiom (vitals, librarian, belief-diff,
      challenges) escaped to `\u0000` everywhere — sources read as text again._
- [x] **VI.4 The resident skeptic** — _Done 2026-07-03 (journal: Doubt with an author):_
      `chorus skeptic [--all]` + `skepticPass()`: a SECOND derived voice (author/skeptic,
      distinct from the examiner — fire the doubter, keep the measurer) files doubt-claims at
      `doubt:<entity>` where a slot rests on one voice; decision-cited only by default, --all
      widens. No fingerprints: the live doubt IS the idempotence key, and the skeptic WITHDRAWS
      its doubt (a named-reason negation) the moment a second voice corroborates — doubt that
      cannot be satisfied is a grudge, not skepticism. Measurements and doubts never doubted._
- [~] **VI.5 (stretch) The hypnagogic pass** — _Deferred 2026-07-03 (the VI.6 rescope):_
  consolidation requires judgment (which recast is better? which sameAs is true?), and
  without the Myk-gated embedding model or an in-loop judge it degrades to mechanical
  guesswork — auto-merge by another name, against "proximity proposes, judgment disposes."
  Revisit when the embedding-model gate moves. (Also: no stretch features immediately
  before a contraction phase.)
- [x] ♻ **VI.6 Retro** — _Done 2026-07-03 (journal: What Phase VI taught)._ Gates checked:
      all four still Myk-gated, unmoved. Phase VII (the Actuary) deliberately NOT mined yet —
      Myk's nightcap protocol (below) is integration work that should precede another feature
      phase; N.1/N.3 expansion may reshape what Phase VII wants to be.

### The nightcap protocol (Myk, 2026-07-03, verbatim order — run when the V-ladder thins)

- [x] **N.1 Expansion** — _Done 2026-07-03 (journal: Ten new windows):_ a genuinely divergent
      pass recorded in VISION.md ("The nightcap expansions"): the deposition, the time-travel
      console, story mode, second opinions (cross-store consultation), chorus watch, session
      diaries, named policy presets, the provenance poster, the mirror test, chorus as a git
      citizen. Deliberately unranked; N.3/N.4 decide what gets mined. The through-line: the
      store already knows more than any surface shows — most of these are windows, not rooms.
- [x] **N.2 Contraction** — _Done 2026-07-03 (journal: Deletion as craft):_ the CLI's stub-era
      scaffolding cut (slice/optional-run/not-implemented branch — every command ships);
      tools/check-console-page.ts folded into the console test as a standing gate; nine
      private copies of surviving() consolidated to one agent.ts export; decisionBasisIds
      two copies → decisions.ts; unused imports pruned across ten files. Dead-export audit:
      43 candidates examined, all dispositioned as protocol vocabulary or public result types
      — kept deliberately, flagged for N.4 barrel coherence. Deps already lean (2 + 1
      optional). Root clean. The suite-runtime question noted and deferred: the CLI tests
      spawn tsx per invocation, honest but slow; batching is rework, not pruning.
- [x] **N.3 Expansion again** — _Done 2026-07-03 (journal: What the deletions uncovered):_
      five ideas that only exist because N.2 removed the duplication — the inhabitant kit
      (the six instruments' shared skeleton as a declarative framework; skills ship
      residents), the generated protocol dictionary, the checkup (one pipeline, one exit
      code — lands in N.4), the watchmen's ledger (inhabitant track records = the Actuary's
      data, already accruing), and the library-as-product-surface (the unframed barrel door —
      N.4's first job). Recorded in VISION.md beside the N.1 pass.
- [x] **N.4 Consolidation** — _Done 2026-07-03 (journal: Three doors, one house):_ (1) the
      barrel framed — all Phase VI instruments, the mail/identity/sameAs vocabulary, and the
      shared helpers (surviving, decisionBasisIds, introduceVoice) now export from index.ts;
      the library is a first-class door. (2) `chorus checkup` — every instrument in one pass,
      one report, one exit code; the instrument surface consolidated, not expanded. (3) The
      MCP surface judged coherent as-is (25 tools; no merges or deprecations warranted) with
      one principled boundary made explicit: instruments derive from the MASTER seed, so they
      are operator tools (CLI/library) — an MCP session is a one-author surface and never
      holds master. Golden pins updated deliberately (+1 CLI command)._
- [x] **N.5 The marketing pass** — _Done 2026-07-03 (journal: The front door, staged):_
      docs/index.html — a self-contained, dependency-free page (dark, quiet, serif; the
      flight-recorder pitch, the four properties, the physician's kit, a terminal vignette
      where the store speaks up, the substrate's guarantee) — and docs/llms.txt, the
      agent-facing summary (tools, vocabulary conventions, meta-entity prefixes, the
      invariants an agent can lean on: "write like it's on the record, because it is").
      Deliberately STAGED, not deployed: the repo is private and enabling Pages is
      outward-facing — that switch is Myk's, noted in README._
- [x] **N.6 The edge** — _Done 2026-07-03 (journal: The edge — read it in full; the summary
      does it no justice)._ Three more past the nightcap: the store noticing its negative
      space (an inhabitant that files questions it cannot answer), societies of stores
      (superposition one level up), and the instruments turned inward. Then the honest limit:
      one voice imagining alone at 3am is exactly the thin testimony the product warns about
      — the edge is not a wall, it is the thesis saying "get another voice." Not the absolute
      end; the end of soliloquy.

### Next — EPISTEME Phase VII: the Actuary (tranche 5, mined 2026-07-03 post-nightcap)

Trust becomes earned. The nightcap found the data already accruing: the inhabitants have
track records (letters filed, acked, ignored; doubts filed, withdrawn, vindicated), and every
author's confidence-carrying claims meet their eventual fates. Mine EPISTEME Phase VII against
these tranche-shape notes when the loop next runs dry — with Myk awake to corroborate the
tranche before it burns tokens:

- [ ] **VII.0 Re-read EPISTEME Phase VII + the watchmen's-ledger note (N.3)** and cut the
      tranche: likely shape — (a) the fate-tracker (a claim's outcome: confirmed, retracted,
      superseded, contested — derived from history, no new writes); (b) calibration scoring
      per author (Brier-lite over confidence-carrying claims with known fates); (c) the
      inhabitants' report card (ack rates on examiner mail, withdrawal rates on doubts);
      (d) `chorus actuary` — the earned-trust report, proposing policy adjustments the HUMAN
      signs (proposals, never mutations — trust edits stay judgments).

### Waiting on Myk (not loop-executable — decision gates)

- **The live cutover** (CUTOVER.md — rehearsed, runbook ready).
- **Publishing @bombadil/chorus** (un-private + npm token + the button).
- **A hosted public commons** (which node, which visibility).
- **A real embedding model** for the librarian (which model, local vs API — cost/privacy
  trade-offs are his call; the EmbeddingModel seam is ready).

### Done

- [x] **V.6 Retro** (2026-07-03, docs-only — journal: What Phase V taught). Gates checked
      (all four still Myk-gated, unmoved); Phase VI mined into tranche 4 (VI.1–VI.6 above).
      The arc's organizing lesson promoted to a design rule: most defects are wrong-silence.
- [x] **Tidy root** (2026-07-03, Myk's direct request — journal: The papers find their drawer).
      Root is README.md + CLAUDE.md only; the nine notes moved to claude_notes/ via git mv with
      an index (living set / plans / records); every cross-link repaired; standing rule added to
      CLAUDE.md: never accrete top-level markdown, and README+CLAUDE are part of every PR's
      definition of done. CLAUDE.md de-staled in the same pass (file count, instrument ops,
      pointers now lead with BACKLOG).
- [x] **V.5 Repositioning** (2026-07-03, PR #31 - journal: The pitch is the product). README
      opens on "Chorus doesn't store what happened. It stores what was believed" — the
      flight-recorder pitch, the instruments as a physician's kit, EPISTEME linked. The pitch
      had to wait until the instruments existed: now a description, not a promise.
- [x] **V.4 The examiner testifies** (2026-07-03, PR #30 - journal: The instrument goes on
      the record). chorus examine: vitals emitted as signed claims by a derived examiner
      author (model chorus-examiner in receipts, introduced once, distrustable like anyone);
      re-examination accrues a grow-only health history (explain vitals:<store> is the
      chart). Console /api/state carries live vitals. Design finding: the panel must exclude
      its own needles - measurement claims describe the world, so vitals skips
      kind:measurement or every examine inflates the next reading.
- [x] **V.3 Belief bisect** (2026-07-03, PR #29 - journal: The search). Binary search over
      as-of instants for the moment a resolved view flipped; culprit named with model/session
      receipts; O(log n) probes asserted by test. Default baseline is the entity BIRTH (first
      mention), so appearance is not noise - and the search proved more honest than its own
      test: a revise is retract-then-assert, and bisect surfaces BOTH instants.
- [x] **V.2 Belief diff** (2026-07-03, PR #28 - journal: Drift, made visible). Two stores
      side by side or one store against its own past (--from/--to instants rebuild the world
      as it stood). Agreement refuses to flatten: agree / agree-INDEPENDENTLY (same
      conclusion, disjoint testimony - stronger than agreement, and named) / disagree /
      only-*. Drift exits non-zero: scripts chain on it.
- [x] **V.1 Vitals** (2026-07-03, PR #27 - journal: The first gauge). Epistemic
      vitals over one store: contested slots, source concentration (HHI over live-belief
      authorship), retraction rate, staleness percentiles, confidence coverage, kind
      distribution. Read-only by construction (test pins the delta count across measurements);
      every gauge traces to a decision someone would make differently. Golden regenerated for
      the new command.
- [x] **20. Open kind vocabulary** (2026-07-03, PR #25 - journal: The mail answered).
      Adopted from the inbox: Myk's dogfooding request (speaker: user, 2026-06) - the
      closed kind enum had no slot for an interpretation/claim. kind is now an open
      vocabulary with a documented core five (+ claim), same posture as every id; briefing
      surfaces still lean on preference/task by exact match. Golden pins caught the surface
      change; regeneration recorded the decision. Cardinality-as-policy stays a design flag
      (his note says the declaration approach works; moving it read-time is a real redesign - parked with the gates).
- [x] **18. Publish readiness** (2026-07-03, PR #23 - journal: Minus the button). Release
      scripts mirroring the format package; CI packs the tarball and installs it globally
      into a temp prefix on every push, driving the installed bin through init -> store ->
      write -> read on both OSes - the published artifact proven without publishing. README
      status updated to alpha-unpublished. npm publish + un-private stay Myk-gated.
- [x] **17. Aggregator union read** (2026-07-03, PR #22 - journal: The union). The @union
      pseudo-mount on --gql-readonly reads across EVERY store the node serves - one ephemeral
      reader folds all mounts (the CRDT makes union a fold), one synthesized schema over the
      combined world; single-store mounts stay isolated. @ sits outside the store-name
      alphabet, so no real store can be shadowed. Relay-provenance annotations defer to full
      Phase C with the reactor origin machinery.
- [x] **16. Encrypted private store** (2026-07-03, PR #21 - journal: Ciphertext at rest).
      EncryptedSqliteStore over the raw driver seam: AES-256-GCM per row, id bound as AAD,
      key a labeled child of the master seed, NO pointer index (structure would leak - a
      private store trades indexed reads for opacity). Full conformance witness + the leak
      test greps the raw file bytes. chorus store create <n> --tier private --encrypted.
      Encrypted migration refused loudly for now (adopt into a new store instead).
- [x] ♻ **15. Retro #2 + VISION revision** (2026-07-03, PR #20 - journal: Stock-take). All
      three horizons grounded; VISION revised with per-horizon status + what the day taught;
      tranche 2 mined (Phase B/C constellation + publish readiness); Myk's decision gates
      listed explicitly.
- [x] **14. Schema commons: design + seed** (2026-07-03, PR #19 - journal: The commons).
      COMMONS.md is the vocabulary-of-vocabularies design (attr:/scheme:/hyperschema: as
      entities carrying beliefs; registrar-as-author; adoption/analytics deferred with their
      hard parts named). tools/seed-commons.ts publishes the four skills conventions as
      hyperschema claims - SELF-HOSTING included (hyperschema:commons declares its own
      vocabulary); chorus-skill-designer now consults a commons before minting. The read-only
      GQL endpoint from task 12 is the public commons surface, already built.
- [x] **13. The similarity seam** (2026-07-03, PR #18 - journal: Proximity proposes).
      **Rescoped:** sqlite-vec binaries exist neither locally nor on CI, so a vec-only
      implementation would have had NO witness anywhere. Shipped instead: a VectorIndex seam
      with a pure-TS brute witness (tested everywhere, honestly right at personal-store
      scale), sqlite-vec as an env-pointed provider (CHORUS_SQLITE_VEC, opportunistic test,
      graceful degradation with the reason), and similarTerms() - fuzzy candidates over what
      a store talks about (entity ids + attributes), proposals only, judgment stays with the
      caller. Deeper librarian rewiring deferred until a real embedding model lands.
- [x] **12. Read-only GQL endpoint** (2026-07-03, PR #17 - journal: The blog-feed primitive).
      serve --gql-readonly mounts /gql/<token>[/store]: GET/POST GraphQL over a per-request
      pinned snapshot, read-only by construction (ephemeral reader, nothing persisted, the
      synthesized schema has no mutations), token-gated like the MCP mounts. **Rescoped:** the
      closure-audit dry-run stays deferred to constellation Phase D - an approximate audit
      would claim safety it cannot prove; the serving half ships, the audit half waits for
      reactor-level provenance.
- [x] **11. Cutover rehearsal (synthetic)** (2026-07-03, PR #16 - journal: The rehearsal).
      CUTOVER.md is the runbook; test/chorus-cutover-rehearsal.test.ts executes every step of
      it against a synthetic live store: seed-continuous init, read-only digest-verified
      adoption, old receipts resolving, trial serving while the old node keeps writing,
      re-adoption as the idempotent union sweeping interim writes, a real MCP round-trip over
      HTTP, and proof the source only ever gained its own node's writes. The live cutover is
      Myk's, by hand, per the runbook.
- [x] **10. Compatibility guarantees** (2026-07-03, PR #15 - journal: The contract). Manifest
      formatVersion + the upgrade ladder (legacy manifests stamp on open, lossless and digest-
      neutral; future manifests refuse loudly naming the way out) + golden pins for the MCP
      tool schemas and CLI command surface (drift fails CI until tools/gen-goldens.ts is run
      deliberately). Data safe forever; the surface breaks only on purpose.
- [x] **9. + upgrade stub** (2026-07-03, PR #14 - journal: The contract).
      Registry-first rescope: lossless re-containering with the old file left in place; sqlite-
      family flips are manifest-only. upgrade stubs honestly until Phase 4 publishes.
- [x] ♻ **8. Retro/integration pass #1** (2026-07-03, PR #13 - journal: The core is one).
      The sqlite SHARED-CORE refactor: schema/SQL/write-discipline live once in
      sqlite-core.ts, both drivers are ~40-line adapters over a 3-method seam - the way to
      fork the file format is gone, not just guarded. Other retro items resolved along the
      way: migrate.ts driver choice (task-2 fixes), CLAUDE.md Commands rewrite (PR #12),
      error-message voice (enforced review-by-review: fail loudly, name the way out, echo
      nothing secret).
- [x] **7. Direct data ops** (2026-07-03, PR #11 - journal: The MCP-less client). recall,
      remember, search, explain, decide, replay, gql - all through the SAME protocol brain the
      MCP servers use (createSession + callTool), so the CLI can never drift from the tool
      surface. remember speaks as the USER by default (a human at their own terminal). Review
      fix-forward: CLI sessions introduce as model 'cli' (was 'unknown' - identity pollution),
      NaN confidence/limit validation at the flag, --string/--json value escape hatches, gql
      exits non-zero on GraphQL errors.
- [x] **6. `chorus console`** (2026-07-02, PR #9 - journal: Serve and the seat). The web
      console over a registry store, same discovery as serve. Post-merge review fixes: listen
      error handler (EADDRINUSE was an uncaught crash), ack/distrust POST handlers no longer
      kill the process on non-JSON bodies, shared port-range validation.
- [x] **5. `chorus serve`** (2026-07-02, PR #8 - journal: Serve and the seat). stdio + HTTP
      with repeatable --store (multi-store mounts at /mcp/<token>/<name>; aggregator SHAPE,
      union reads stay Phase C). Review hardened the network surface: sessions pinned to
      their mount, token charset + constant-time comparison, store-name alphabet (closed a
      path traversal via registry names), EADDRINUSE as a clean error, duplicate --store
      rejected.
- [x] **4. `chorus store create|ls|show|adopt`** (2026-07-02, PR #7 - journal: The registry
      commands). Review forced honest failures everywhere: bare value flags error instead of
      silently retargeting (bare --home was minting a seed in CWD), typo'd flags never become
      silent defaults, adopt refuses missing/empty sources (was fabricating success over a
      typo), and library adopt now verifies the UNION digest before writing (was write-then-
      throw with a leaked handle).

- [x] **3. `chorus init`** (2026-07-02, PR #6 — journal: "The identity slice"). Non-destructive home setup (CHORUS_HOME override; the real ~/.chorus holds the LIVE store), exclusive-create config with 0600 where honored, conflicting imports refused, corrupt/unreadable configs are errors never "absent". Review closed two SEED-LEAK paths (positional typo + --seed= form — every CLI stderr path now redacts 64-hex tokens), a TOCTOU clobber, and wired resolveMasterSeed into all three entry points so the printed identity is the one sessions actually sign with.

- [x] **2. CLI packaging** (2026-07-02, PR #5 — journal: "The packaging slice"). `chorus` bin +
      `build`/`prepare` + `files`/`exports` mirroring the format package; **better-sqlite3 demoted
      to optionalDependencies** with a lazy probe (zero native deps in the default install);
      `availableDriver` substitution made bidirectional; `defaultBackendKind` prefers any sqlite
      driver, jsonl last (Myk: jsonl is dev, not production). Review caught the POSIX bin-symlink
      silent no-op, async-pipe exit truncation, migrate.ts's hard native dep, a silent-amnesia
      default-path gap, and misleading error advice — all fixed; every sqlite-needing suite now
      skips loudly on degraded installs. **Rescoped:** engines is `>=22` (honest floor — jsonl
      fallback works there), not the earlier `^22.13`; `private: true` stays until Phase 4.
- [x] **1. `node-sqlite` backend** (2026-07-02, PR #4 — journal: "The third witness"). As
      specified, plus what the adversarial review forced: content-sniffing `backendForPath`
      (existing stores detected by their first 16 bytes, never by filename — the compatibility
      law), `resolveEnvStore` pinned+legacy coherence, registry driver-substitution (a
      node-sqlite manifest opens via better-sqlite3 on old Nodes), post-commit `onDisk` marking
      (a rollback-retry data-loss bug — latent in the better-sqlite3 tier too, fixed in both),
      lazy module probe (no ExperimentalWarning for non-users), console routed through the same
      resolution as the servers. **Rescoped:** engines bump deferred to task 2 (the library must
      keep working on the dev machine's Node 22.0.0, which predates node:sqlite; CI at Node
      22-latest + 24 is the witness).
