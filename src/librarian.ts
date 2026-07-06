// The librarian (SPEC-9 §6): an EFFECTFUL derived author wrapping an embedding model. It
// watches the substrate, recognizes vocabulary fragments that name a declared concept slot,
// and emits ordinary signed mapping claims (SPEC-9 §3) — judgment with provenance.
//
// The honest boundary, enforced here: embedding vectors NEVER enter the substrate. They are
// the librarian's private working memory, rebuildable at will; only judgments persist. The
// model is an AUTHOR — one model version, one keypair, one rankable track record.

import {
  VOCAB_PREFIX,
  parseTerm,
  type DerivedFn,
  type HView,
  type Pointer,
} from "@bombadil/rhizomatic";
import type { ChorusAgent } from "./agent.js";
import { CHORUS_PREFIX } from "./vocab.js";

const ROLE_FRAGMENT = `${VOCAB_PREFIX}.alias.fragment`;
const ROLE_SLOT = `${VOCAB_PREFIX}.alias.slot`;
const ROLE_CONCEPT = `${VOCAB_PREFIX}.alias.concept`;
const ROLE_CONFIDENCE = `${VOCAB_PREFIX}.alias.confidence`;
const CTX_MAPPINGS = `${VOCAB_PREFIX}.alias.mappings`;

// The model the librarian wraps. `id` is the model's identity; a new version is a new model,
// a new librarian author, a new track record.
export interface EmbeddingModel {
  readonly id: string;
  embed(text: string): readonly number[] | undefined; // undefined: out of vocabulary
}

// A deterministic dictionary model for CI: hand-pinned vectors, zero I/O. A real model plugs
// in through the same interface at runtime.
export class MockEmbeddingModel implements EmbeddingModel {
  constructor(
    readonly id: string,
    private readonly vectors: Readonly<Record<string, readonly number[]>>,
  ) {}
  embed(text: string): readonly number[] | undefined {
    return this.vectors[text];
  }
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface LibrarianOptions {
  readonly name: string; // binding entity id
  readonly seedHex: string; // the librarian's own keypair (per model version)
  readonly model: EmbeddingModel;
  readonly threshold?: number; // minimum cosine similarity to assert a mapping; default 0.85
  readonly budget?: number; // lifetime trigger cap (SPEC-7 §6); default 512
}

// The vocabulary materialization: EVERYTHING, bagged under one property, with negation tags
// kept (group(const, mask(annotate, …)) — the E14-legal audit idiom). Non-root-anchored, so
// the reactor dispatches it broadly: every ingest is a librarian cycle.
const vocabularyBody = parseTerm({
  op: "group",
  key: { const: "all" },
  in: { op: "mask", policy: "annotate", in: "input" },
});

export const VOCABULARY_ROOT = `${CHORUS_PREFIX}:vocabulary`;

export class Librarian {
  readonly author: string;
  readonly model: EmbeddingModel;

  constructor(agent: ChorusAgent, opts: LibrarianOptions) {
    this.model = opts.model;
    const materialization = `${CHORUS_PREFIX}.librarian.${opts.name}`;
    agent.peer.reactor.register(materialization, vocabularyBody, [VOCABULARY_ROOT]);
    this.author = agent.ensureHost().install(
      {
        name: opts.name,
        fnId: `model:${opts.model.id}`,
        materialization,
        pure: false, // effectful: consults the model (SPEC-7 §7)
        budget: opts.budget ?? 512,
        emit: "append", // mappings accumulate; wrong ones die by negation, never by edit
      },
      makeLibrarianFn(opts.model, opts.threshold ?? 0.85),
      opts.seedHex,
    );
  }
}

// One librarian cycle: read declared slots and already-judged pairs out of the world view
// (negated mappings count as judged — a human veto is never re-litigated), surface new
// vocabulary fragments, judge each against each slot, emit mappings above threshold.
function makeLibrarianFn(model: EmbeddingModel, threshold: number): DerivedFn {
  return (view: HView): Pointer[][] => {
    const entries = view.props.get("all") ?? [];
    const slots = new Set<string>(); // declared slot entity ids (surviving declarations)
    const judged = new Set<string>(); // "fragment\u0000slot" pairs already mapped (live OR negated)
    const fragments = new Set<string>(); // vocabulary observed in the wild
    for (const e of entries) {
      const roles = new Set(e.delta.claims.pointers.map((p) => p.role));
      const isDeclaration = roles.has(ROLE_SLOT) && roles.has(ROLE_CONCEPT);
      const isMapping = roles.has(ROLE_FRAGMENT) && roles.has(ROLE_SLOT);
      if (isDeclaration && e.negated !== true) {
        for (const p of e.delta.claims.pointers) {
          if (p.role === ROLE_SLOT && p.target.kind === "entity") slots.add(p.target.entity.id);
        }
      }
      if (isMapping) {
        const fs: string[] = [];
        const ss: string[] = [];
        for (const p of e.delta.claims.pointers) {
          if (p.role === ROLE_FRAGMENT && p.target.kind === "primitive") {
            if (typeof p.target.value === "string") fs.push(p.target.value);
          } else if (p.role === ROLE_SLOT && p.target.kind === "entity") {
            ss.push(p.target.entity.id);
          }
        }
        for (const f of fs) for (const s of ss) judged.add(`${f}\u0000${s}`);
      }
      if (isDeclaration || isMapping) continue;
      // Vocabulary in the wild: the contexts of entity pointers — the names dialects actually
      // file under. Internal namespaces are not vocabulary drift.
      for (const p of e.delta.claims.pointers) {
        if (p.target.kind !== "entity") continue;
        const ctx = p.target.entity.context;
        if (ctx === undefined) continue;
        if (ctx.startsWith(`${VOCAB_PREFIX}.`) || ctx.startsWith(`${CHORUS_PREFIX}.`)) continue;
        fragments.add(ctx);
      }
    }
    const out: Pointer[][] = [];
    for (const fragment of [...fragments].sort()) {
      const fv = model.embed(fragment);
      if (fv === undefined) continue;
      for (const slot of [...slots].sort()) {
        if (judged.has(`${fragment}\u0000${slot}`)) continue;
        const local = slot.includes("#") ? slot.slice(slot.indexOf("#") + 1) : slot;
        const sv = model.embed(local);
        if (sv === undefined) continue;
        const sim = cosine(fv, sv);
        if (sim < threshold) continue;
        // The judgment persists; the vectors that produced it do not.
        out.push([
          { role: ROLE_FRAGMENT, target: { kind: "primitive", value: fragment } },
          {
            role: ROLE_SLOT,
            target: { kind: "entity", entity: { id: slot, context: CTX_MAPPINGS } },
          },
          { role: ROLE_CONFIDENCE, target: { kind: "primitive", value: round2(sim) } },
        ]);
      }
    }
    return out;
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
