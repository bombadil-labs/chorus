# claude_notes/ — the working papers

The root of this repo belongs to the reader: [README.md](../README.md) is the product,
[CLAUDE.md](../CLAUDE.md) is the working agreement. Everything else — the plans, the records,
the design memos — lives here, so the footprint stays small and the papers stay findable.

## The living set (routinely updated; the autonomous loop writes here)

- [BACKLOG.md](BACKLOG.md) — the loop's protocol, hard limits, working queue, and Done log.
- [JOURNAL.md](JOURNAL.md) — append-only record: one entry per completed task, newest last.
- [VISION.md](VISION.md) — the horizons past the roadmap; revised whenever the backlog runs dry.

## The plans

- [ROADMAP.md](ROADMAP.md) — the ordered burndown to the alpha `chorus` CLI (largely landed).
- [EPISTEME.md](EPISTEME.md) — belief, not memory: the five phases of the instrument ladder.
- [CONSTELLATION.md](CONSTELLATION.md) — many named keyed stores, private + federating; the design.
- [COMMONS.md](COMMONS.md) — the schema/hyperschema commons ("GitHub for shapes"); gated on Myk.

## The field notes

- [SUBSTRATE-VS-CHORUS.md](SUBSTRATE-VS-CHORUS.md) — a comparison with a friend's convergent
  project: same substrate instinct, different organ grown on it. Written to be shared.

## The records

- [PERSISTENCE.md](PERSISTENCE.md) — how the pluggable store tier came to be (settled; history).
- [CUTOVER.md](CUTOVER.md) — Myk's manual runbook for migrating the live node. **The cutover is
  Myk's call, executed by hand.** Rehearsed end-to-end by
  [chorus-cutover-rehearsal.test.ts](../test/chorus-cutover-rehearsal.test.ts).
