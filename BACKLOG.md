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
   work should happen, update [CLAUDE.md](CLAUDE.md); if it changed where things are going, update
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

_(tasks 9-10 moved to Done)_

_(task 11 moved to Done)_

### Next — horizon spikes (from VISION.md, interleaved after the CLI exists)

_(task 12 moved to Done)_

_(task 13 moved to Done)_

- [ ] **14. Schema-commons design doc + seed** (Horizon 2) — vocabulary-of-vocabularies as
      claims; publish the four skills' `chorus.md` conventions into a `commons` store as the
      worked example; teach `chorus-skill-designer` to consult it.
- [ ] ♻ **15. Retro/integration pass #2 + VISION.md revision** — full stock-take; revise the
      horizons against what the spikes taught; mine the next tranche.

### Done

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
