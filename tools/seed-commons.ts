// Seed the schema commons (COMMONS.md): publish the four skills' conventions as hyperschema
// claims into a registry store. Reproducible and idempotent-ish (content-addressed dedup does
// the real work) — run after `chorus init`:
//
//   npx tsx tools/seed-commons.ts [--store commons]
//
// The seed is REPRESENTATIVE, not exhaustive: the prose contract stays in each skill's
// chorus.md (referenced via `source`); the commons carries the queryable core.

import { chorusHome, resolveMasterSeed, storesRoot } from "../src/config.js";
import { StoreRegistry } from "../src/stores.js";
import { callTool, createSession } from "../src/mcp-server.js";

interface AttrSeed {
  readonly name: string;
  readonly description: string;
  readonly shape: "string" | "number" | "boolean" | "reference" | "reference-set";
  readonly set?: boolean;
}
interface SchemaSeed {
  readonly domain: string;
  readonly description: string;
  readonly source: string;
  readonly schemes: readonly { prefix: string; description: string }[];
  readonly attrs: readonly AttrSeed[];
}

const SCHEMAS: readonly SchemaSeed[] = [
  {
    domain: "commons",
    description: "The vocabulary of vocabularies — the commons describing itself.",
    source: "COMMONS.md",
    schemes: [
      { prefix: "attr:", description: "an attribute as an entity that can carry beliefs" },
      { prefix: "scheme:", description: "an id-prefix family as an entity" },
      { prefix: "hyperschema:", description: "a whole domain's contract as an entity" },
    ],
    attrs: [
      { name: "description", description: "what a term means, in prose", shape: "string" },
      { name: "value-shape", description: "the value form an attribute takes", shape: "string" },
      {
        name: "applies-to",
        description: "which id families an attribute belongs on",
        shape: "reference-set",
        set: true,
      },
      {
        name: "declares",
        description: "the attributes a hyperschema establishes",
        shape: "reference-set",
        set: true,
      },
      {
        name: "schemes",
        description: "the id families a hyperschema establishes",
        shape: "reference-set",
        set: true,
      },
      { name: "domain", description: "the domain a hyperschema covers", shape: "string" },
      { name: "source", description: "where the prose contract lives", shape: "string" },
    ],
  },
  {
    domain: "media-log",
    description: "Films, shows, books; ratings, cast and crew traversal, watch-next.",
    source: "skills/media-log/chorus.md",
    schemes: [
      { prefix: "film:", description: "a movie (concrete release)" },
      { prefix: "book:", description: "a novel" },
      { prefix: "person:", description: "cast & crew" },
      { prefix: "character:", description: "a character" },
      { prefix: "concept:", description: "a theme" },
    ],
    attrs: [
      { name: "title", description: "headline title", shape: "string" },
      { name: "year", description: "release/publication year", shape: "string" },
      { name: "director", description: "director — reference, not string", shape: "reference" },
      {
        name: "cast",
        description: "cast members — set-valued references",
        shape: "reference-set",
        set: true,
      },
      {
        name: "themes",
        description: "themes — set-valued concept references",
        shape: "reference-set",
        set: true,
      },
      {
        name: "rating",
        description: "the user's read, 1-10; speaker user; changes revise",
        shape: "number",
      },
      { name: "status", description: "want | watching | watched", shape: "string" },
    ],
  },
  {
    domain: "decision-journal",
    description: "Decisions pinned to exactly what was known; honest later review.",
    source: "skills/decision-journal/chorus.md",
    schemes: [{ prefix: "decision:", description: "a recorded decision (via decide)" }],
    attrs: [
      { name: "intent", description: "what the decider was about to do", shape: "string" },
      { name: "review", description: "the retrospective read on a decision", shape: "string" },
    ],
  },
  {
    domain: "synchronicity-journal",
    description: "Meaningful coincidences, register-graded, reception by default.",
    source: "skills/synchronicity-journal/chorus.md",
    schemes: [
      { prefix: "synchronicity:", description: "one noticed coincidence" },
      { prefix: "event:", description: "a thing that happened, referenced by coincidences" },
    ],
    attrs: [
      { name: "register", description: "the kind of meaning — never probability", shape: "string" },
      {
        name: "composed-of",
        description: "the events a synchronicity rhymes between",
        shape: "reference-set",
        set: true,
      },
      {
        name: "resonance",
        description: "cross-links to entries that rhyme with this one",
        shape: "reference-set",
        set: true,
      },
    ],
  },
];

export function seedCommons(opts: { home: string; storeName: string; clock?: () => number }): {
  deltas: number;
} {
  const seed = resolveMasterSeed(process.env, opts.home);
  if (seed === undefined) throw new Error("no master seed — run `chorus init` first");
  const registry = new StoreRegistry(storesRoot(opts.home), seed);
  const store = registry.open(opts.storeName, { tier: "federated" });
  try {
    const ctx = createSession({
      masterSeedHex: seed,
      sessionId: "commons-seeder-v1",
      ...(opts.clock === undefined ? {} : { clock: opts.clock }),
    });
    store.backend.refresh(ctx.agent);
    callTool(ctx, "begin-session", {
      model: "commons-seeder",
      purpose: "publish the migrated skills' conventions as hyperschema claims",
      topics: ["hyperschema:"],
    });
    const persist = (): number => store.backend.persist(ctx.agent);
    const remember = (about: string, attribute: string, value: unknown, kind = "fact"): void => {
      callTool(ctx, "remember", { about, attribute, value, kind }, persist);
    };

    // Set-valued attributes declare their plurality once (the standing convention).
    for (const plural of [
      "declares",
      "schemes",
      "applies-to",
      "cast",
      "themes",
      "composed-of",
      "resonance",
    ]) {
      remember(`attr:${plural}`, "plurality", "set");
    }

    for (const schema of SCHEMAS) {
      const hyper = `hyperschema:${schema.domain}`;
      remember(hyper, "domain", schema.domain);
      remember(hyper, "description", schema.description);
      remember(hyper, "source", schema.source);
      for (const scheme of schema.schemes) {
        const id = `scheme:${scheme.prefix.replace(/:$/, "")}`;
        remember(id, "description", scheme.description);
        remember(hyper, "schemes", { entity: id });
      }
      for (const attr of schema.attrs) {
        const id = `attr:${attr.name}`;
        remember(id, "description", attr.description);
        remember(id, "value-shape", attr.shape);
        remember(hyper, "declares", { entity: id });
      }
    }
    callTool(
      ctx,
      "end-session",
      { summary: `seeded ${SCHEMAS.length} hyperschemas into "${opts.storeName}"` },
      persist,
    );
    return { deltas: store.backend.deltasSince(new Set()).length };
  } finally {
    store.close();
  }
}

// Direct run.
if (
  process.argv[1] !== undefined &&
  process.argv[1].replace(/\\/g, "/").endsWith("tools/seed-commons.ts")
) {
  const storeName = process.argv.includes("--store")
    ? process.argv[process.argv.indexOf("--store") + 1]!
    : "commons";
  const result = seedCommons({ home: chorusHome(), storeName });
  console.log(`commons seeded: store "${storeName}" now holds ${result.deltas} delta(s)`);
}
