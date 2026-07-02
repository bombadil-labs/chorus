# Chorus — Roadmap to Alpha

**Alpha candidate = a working `@rhizomes/chorus` CLI that replaces the manual tailscale node.**
Concretely, the day this is true:

```
npm i -g @rhizomes/chorus
chorus init
chorus store adopt personal ~/.chorus/memory.sqlite     # lossless, digest-verified
chorus serve --http                                      # an MCP node Claude connects to
```

…and Myk's Claude sessions run against the CLI-served node instead of `../rhizomatic/apps/chorus`,
with his accumulated memory intact. That is alpha.

This repo already contains the full Chorus implementation (agent, stores + registry, MCP stdio/HTTP,
gql-on-demand, identity, messages, decide/replay, trust, librarian, console) extracted from the
monorepo. The work below is **standalone-ization + the CLI + cutover**, not a rewrite.

---

## Phase 0 — Stand it up (do this first)

- [x] **`git init`** + first commit; bind to a new GitHub repo. _(Myk does the `git init`; you take it from there.)_
- [x] `npm install` and confirm **`npm run check` is green** consuming the **published**
      `@rhizomes/rhizomatic@^0.1.0` (not a file: link). This is the proof the extraction worked.
- [x] Add a **LICENSE** (dual MIT/Apache-2.0, matching the format) — copy both `LICENSE-*` files.
- [x] Add **CI** (`.github/workflows/ci.yml`) running the green gate on push. (Native `better-sqlite3`
      builds on the runner.)
- [x] **Fix cross-repo doc links**: `README.md`, `CONSTELLATION.md`, `PERSISTENCE.md` still have
      `../../spec/...` links from the monorepo — repoint them at the `rhizomatic` repo / the format's
      npm page, or drop them.
- [x] Trim/rewrite `README.md` for a standalone-repo front page (it's currently the monorepo's chorus
      doc — good content, some stale paths).

## Phase 1 — The CLI (the alpha centerpiece)

Build `src/cli.ts` (a small arg parser — no need for a heavy framework) and wire a `bin`. Ship it in
slices, each green:

- [ ] **Packaging:** add `"bin": { "chorus": "./dist/cli.js" }`, a `build` (tsc → `dist`) + `prepare`,
      `files`/`.npmignore` (mirror how `@rhizomes/rhizomatic` was set up). Native `better-sqlite3`
      means default the CLI to the **jsonl** backend so `npm i -g` is painless; sqlite opt-in.
- [ ] **`chorus init`** — create `~/.chorus`, mint (or import) the master seed, write config. Never
      print the seed. (Seed handling: `~/.chorus/config` for v0; keychain is a hardening note.)
- [ ] **`chorus store create|ls|show|adopt`** — over the `StoreRegistry` (stores.ts). `adopt` reuses
      the non-destructive, digest-verified import already built. **No destructive `delete`** (grow-only
      ethos — `forget`/deregister only; data stays).
- [ ] **`chorus serve --store <name> [--store <name>…] [--stdio | --http --port N --token …]`** — the
      node. `--stdio` for `claude mcp add`; `--http` = the streamable-HTTP node; **repeat `--store` to
      host several concurrently** (the aggregator shape). This is what replaces `start-chorus-node.cmd`.
- [ ] **`chorus console [--port N]`** — the web console over the store(s).
- [ ] **`chorus recall|remember|search|explain|decide|replay|gql --store <name> …`** — direct data ops,
      so the CLI is useful without an MCP client.
- [ ] **`chorus migrate`** (jsonl→sqlite) and **`chorus upgrade`** (self-update) + an update-notifier.
- [ ] **Compatibility guarantees (bake in from the start):** a **format-version marker** in each store
      manifest + **auto-migrate-on-open** (lossless, digest-checked); **contract/golden tests** pinning
      command behavior + MCP tool schemas so a breaking change fails CI. Data safe forever; surface is
      semver.

## Phase 2 — Cut over the live node (retire the monorepo copy)

- [ ] `chorus store adopt personal ~/.chorus/memory.sqlite` — bring Myk's live memory into the registry
      (assert byte-identical digest; **read-only on the source**).
- [ ] Stand up `chorus serve --http` as the replacement node (tailscale funnel, token) and point
      Claude Code/Desktop/Web at it. Verify a real session round-trips.
- [ ] Once proven, **retire `../rhizomatic/apps/chorus`** (it can be deleted from the rhizomatic repo,
      shrinking the format repo to just substrate — the point of this whole split).

## Phase 3 — The constellation (see [CONSTELLATION.md](CONSTELLATION.md))

- [ ] **Phase B — private, leak-safe store** (`EncryptedSqliteStore`, decrypt-in-memory, key from the
      master seed). A `private` store publishes nothing; a leaked file is ciphertext.
- [ ] **Phase C — local multi-store + aggregator + gql/MCP over the union**; delta origin as
      relay-provenance; rewire the node to boot from the registry (opt-in, legacy path intact).
- [ ] **Phase D — the constellation admin console** (store list, per-store inspector, the
      **closure-audit view** = what a published query exposes).
- [ ] **Phase E — federation v1 across machines** (publish/subscribe queries over the HTTP transport;
      two trust lenses; boundary `sameAs`; irrevocability stated).
- [ ] **Phase F — namespacing hardening + Tier-2 payload encryption** (later).

## Phase 4 — Publish

- [ ] Un-`private`, add release scripts (`release:patch|minor|major`, like the format package), an
      **npm granular automation token** for hands-off publishing (2FA-free), and publish
      `@rhizomes/chorus` so `npm i -g @rhizomes/chorus` works for anyone.

---

## Notes for whoever picks this up

- The **live demo is still the monorepo copy** — do not assume this repo is serving Myk yet, and do
  not touch `~/.chorus/memory.sqlite`. See [CLAUDE.md](CLAUDE.md).
- Substrate changes belong in the **`rhizomatic` repo** (`@rhizomes/rhizomatic`), not here.
- The strategic north star (why any of this matters — agent accountability / behavioral provenance) is
  captured in the rhizomatic repo's private strategy notes; Myk has them.
- When in doubt, keep Chorus growing and Rhizomatic small.
