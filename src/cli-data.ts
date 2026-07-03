// `chorus recall|remember|search|explain|decide|replay|gql` (task 7): direct data ops, so the
// CLI is useful without an MCP client. Every op routes through the SAME protocol brain the MCP
// servers use (createSession + callTool) — the CLI is another client of the one tool surface,
// never a second implementation of it.
//
// One deliberate difference from the MCP default: `remember` here defaults to speaker "user".
// A human typing at their own terminal IS the user speaking; a model session relaying them is
// the case the MCP default serves. --speaker model opts back.

import { randomBytes } from "node:crypto";
import { flagValue } from "./cli-args.js";
import { openRegistry, type StoreIo } from "./cli-store.js";
import { callTool, createSession } from "./mcp-server.js";

// Open the named store, run tool calls against one short-lived CLI session, persist, close.
function withStore<T>(
  storeName: string,
  io: StoreIo,
  fn: (call: (tool: string, args: Record<string, unknown>) => unknown) => T,
): T {
  const { registry, seed } = openRegistry(io);
  if (!registry.list().some((m) => m.name === storeName)) {
    throw new Error(`no store named "${storeName}" — see \`chorus store ls\``);
  }
  const store = registry.open(storeName);
  try {
    const ctx = createSession({
      masterSeedHex: seed,
      sessionId: `cli-${Date.now()}-${randomBytes(3).toString("hex")}`,
    });
    store.backend.refresh(ctx.agent);
    const result = fn((tool, args) =>
      callTool(ctx, tool, args, () => store.backend.persist(ctx.agent)),
    );
    return result;
  } finally {
    store.close();
  }
}

// A CLI value: JSON where it parses (numbers, booleans, quoted strings, objects), the raw string
// otherwise — so `chorus remember svc:api replicas 3` stores the number 3, and `--ref` makes the
// value a typed entity reference (reference, don't transcribe).
function parseValue(raw: string, asRef: boolean): unknown {
  if (asRef) return { entity: raw };
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

const storeOf = (flags: ReadonlyMap<string, string>): string => {
  const name = flagValue(flags, "store");
  if (name === undefined) {
    throw new Error("this command needs a --store <name> (see `chorus store ls`)");
  }
  return name;
};

export function dataCommand(
  op: string,
  positionals: readonly string[],
  flags: ReadonlyMap<string, string>,
  io: StoreIo,
): number {
  const emit = (v: unknown): number => {
    io.out(JSON.stringify(v, null, 2));
    return 0;
  };

  switch (op) {
    case "recall": {
      const [entity] = positionals;
      if (entity === undefined) throw new Error("usage: chorus recall <entity> --store <name>");
      const attribute = flagValue(flags, "attribute");
      return withStore(storeOf(flags), io, (call) =>
        emit(
          call("recall", {
            entity,
            ...(attribute === undefined ? {} : { attribute }),
            ...(flags.has("all") ? { all: true } : {}),
            ...(flags.has("unified") ? { unified: true } : {}),
          }),
        ),
      );
    }

    case "remember": {
      const [about, attribute, rawValue] = positionals;
      if (about === undefined || attribute === undefined || rawValue === undefined) {
        throw new Error("usage: chorus remember <about> <attribute> <value> --store <name>");
      }
      const kind = flagValue(flags, "kind");
      const source = flagValue(flags, "source");
      const confidence = flagValue(flags, "confidence");
      const speaker = flagValue(flags, "speaker") ?? "user";
      if (speaker !== "user" && speaker !== "model") {
        throw new Error("--speaker must be user or model");
      }
      return withStore(storeOf(flags), io, (call) =>
        emit(
          call("remember", {
            about,
            attribute,
            value: parseValue(rawValue, flags.has("ref")),
            speaker,
            ...(kind === undefined ? {} : { kind }),
            ...(source === undefined ? {} : { source }),
            ...(confidence === undefined ? {} : { confidence: Number(confidence) }),
          }),
        ),
      );
    }

    case "search": {
      const [query] = positionals;
      if (query === undefined) throw new Error("usage: chorus search <query> --store <name>");
      const limit = flagValue(flags, "limit");
      return withStore(storeOf(flags), io, (call) =>
        emit(call("search", { query, ...(limit === undefined ? {} : { limit: Number(limit) }) })),
      );
    }

    case "explain": {
      const [entity] = positionals;
      if (entity === undefined) throw new Error("usage: chorus explain <entity> --store <name>");
      const attribute = flagValue(flags, "attribute");
      return withStore(storeOf(flags), io, (call) =>
        emit(call("explain", { entity, ...(attribute === undefined ? {} : { attribute }) })),
      );
    }

    case "decide": {
      const [about] = positionals;
      const intent = flagValue(flags, "intent");
      if (about === undefined || intent === undefined) {
        throw new Error('usage: chorus decide <about> --intent "<what you are about to do>"');
      }
      const attribute = flagValue(flags, "attribute");
      return withStore(storeOf(flags), io, (call) =>
        emit(call("decide", { about, intent, ...(attribute === undefined ? {} : { attribute }) })),
      );
    }

    case "replay": {
      const [decisionId] = positionals;
      if (decisionId === undefined) {
        throw new Error("usage: chorus replay <decisionId> --store <name>");
      }
      return withStore(storeOf(flags), io, (call) => emit(call("replay", { decisionId })));
    }

    case "gql": {
      const [query] = positionals;
      if (query === undefined) throw new Error('usage: chorus gql "<query>" --store <name>');
      // One-shot: pin a snapshot, query it, release it — the CLI shape of the ephemeral schema.
      return withStore(storeOf(flags), io, (call) => {
        const prep = call("gql-prepare", {}) as { prepId: string };
        try {
          return emit(call("gql-query", { prepId: prep.prepId, query }));
        } finally {
          call("gql-release", { prepId: prep.prepId });
        }
      });
    }

    default:
      throw new Error(`unknown data op "${op}"`);
  }
}
