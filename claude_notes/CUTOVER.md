# CUTOVER.md — migrating the live node to the chorus CLI

**Who runs this: Myk, by hand.** Nothing in this repo touches `~/.chorus/memory.sqlite` or the
monorepo node — that is a standing hard limit. This runbook is the manual procedure, and every
step below is exercised end-to-end (against a synthetic live store) by
[test/chorus-cutover-rehearsal.test.ts](../test/chorus-cutover-rehearsal.test.ts), so the mechanics
are proven before you start.

**The safety model, in one paragraph:** `adopt` only ever READS the source and proves it
(canonical digest, printed and verified). Re-adoption is an **idempotent union** — so you can
trial the new node for as long as you like while the old node keeps serving, then re-adopt once
at final cutover to sweep up everything the old node wrote in the meantime. Nothing is lost in
either direction, and rollback at any point is simply "keep using the old node," which was never
modified.

## Preconditions

- Node ≥ 22.13 (24 LTS recommended) — or any Node ≥ 22 with better-sqlite3 built (the drivers
  substitute for each other over the same file).
- This repo checked out and green (`npm install && npm run check`), or the published CLI once
  Phase 4 lands.
- The live node's `CHORUS_MASTER_SEED` at hand (from `start-chorus-node.cmd` / its env). The new
  node must derive the SAME identities — this is what keeps every old receipt attributable and
  the user author continuous.

## The steps

```bash
# 0. Nothing stops. The old node keeps serving throughout the trial.

# 1. Identity continuity: init the CLI home with the LIVE seed (never a fresh one).
chorus init --seed <the live CHORUS_MASTER_SEED>
#    → prints "you are ed25519:…" — this must be the same user author the console shows today.

# 2. Adopt the live store (READ-ONLY on the source; digest printed + verified):
chorus store adopt personal ~/.chorus/memory.sqlite --tier private

# 3. Verify the adopted world before serving it:
chorus store show personal --json          # deltas + digest — digest matches step 2's output
chorus recall <a-well-known-entity> --store personal
chorus explain <a-well-known-entity> --store personal   # receipts resolve old sessions/models

# 4. Trial-serve the replacement node (a NEW token is fine; or reuse the old one):
chorus serve --store personal --http --port 4821 --token <token>
#    Same tailscale wiring as before:
#      tailscale serve --bg --set-path /mcp https://+:443 http://127.0.0.1:4821/mcp
#      tailscale funnel --bg 4821          # only if claude.ai web needs it
#    Point ONE Claude surface at it; run a real session: begin-session → briefing →
#    remember → recall. Check the write in `chorus console --store personal`.

# 5. Trial period: as long as you like. The old node keeps writing to its own store; the
#    adopted copy diverges — that is fine and expected.

# 6. FINAL cutover, when satisfied:
#    a. Stop the old node (stop serving; do not delete anything).
#    b. Re-adopt to sweep up everything it wrote during the trial (idempotent union):
chorus store adopt personal ~/.chorus/memory.sqlite
#    c. Point every surface at the new node. Done.

# Rollback (any time before 6c): just keep using the old node. It was never modified.
```

## What NOT to do

- Do not `chorus init` with a fresh seed — a new seed is a new identity; every old receipt
  would resolve as a stranger.
- Do not point the JSONL backend at the live sqlite file (the CLI refuses; don't force it).
- Do not delete or move `~/.chorus/memory.sqlite` at any point in this procedure. After the
  cutover is proven for a while, its retirement is a separate, deliberate decision (along with
  deleting `apps/chorus` from the rhizomatic repo — ROADMAP Phase 2's last step).

## After the cutover

- The old `start-chorus-node.cmd` and `../rhizomatic/apps/chorus` can be retired (ROADMAP
  Phase 2, final item) — that deletion happens in the rhizomatic repo, as its own decision.
- `chorus store ls` / the console are now the operational view of the memory.
