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
import { computeVitals } from "./vitals.js";

// Open the named store, run tool calls against one short-lived CLI session, persist, close.
// The session context rides along for READ-ONLY consumers (vitals) that measure the agent
// directly instead of calling tools.
function withStore<T>(
  storeName: string,
  io: StoreIo,
  fn: (
    call: (tool: string, args: Record<string, unknown>) => unknown,
    ctx: ReturnType<typeof createSession>,
  ) => T,
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
    // If a write forces an auto-introduction, the identity claim should say what this IS — a
    // CLI invocation — not "unknown" (which reads as a misconfigured MCP client in receipts
    // and would be swept up by `trust --distrustModel unknown`).
    ctx.model = "cli";
    store.backend.refresh(ctx.agent);
    const result = fn(
      (tool, args) => callTool(ctx, tool, args, () => store.backend.persist(ctx.agent)),
      ctx,
    );
    return result;
  } finally {
    store.close();
  }
}

// A CLI value: JSON where it parses (numbers, booleans, quoted strings, objects), the raw string
// otherwise — so `chorus remember svc:api replicas 3` stores the number 3. Escape hatches for
// the inherent ambiguity: --string takes the value verbatim (the string "3", "1.10", "true"
// without shell-quoting gymnastics), --json requires valid JSON and fails loudly, --ref makes
// the value a typed entity reference (reference, don't transcribe).
function parseValue(raw: string, flags: ReadonlyMap<string, string>): unknown {
  if (flags.has("ref")) return { entity: raw };
  if (flags.has("string")) return raw;
  if (flags.has("json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`--json: value is not valid JSON`);
    }
  }
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
      const confidenceRaw = flagValue(flags, "confidence");
      const speaker = flagValue(flags, "speaker") ?? "user";
      if (speaker !== "user" && speaker !== "model") {
        throw new Error("--speaker must be user or model");
      }
      let confidence: number | undefined;
      if (confidenceRaw !== undefined) {
        confidence = Number(confidenceRaw);
        // NaN passes typeof checks and dies deep in the CBOR encoder; out-of-range encodes
        // fine but lies. Validate where the flag is, like every other flag.
        if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
          throw new Error("--confidence must be a number in [0, 1]");
        }
      }
      return withStore(storeOf(flags), io, (call) =>
        emit(
          call("remember", {
            about,
            attribute,
            value: parseValue(rawValue, flags),
            speaker,
            ...(kind === undefined ? {} : { kind }),
            ...(source === undefined ? {} : { source }),
            ...(confidence === undefined ? {} : { confidence }),
          }),
        ),
      );
    }

    case "search": {
      const [query] = positionals;
      if (query === undefined) throw new Error("usage: chorus search <query> --store <name>");
      const limitRaw = flagValue(flags, "limit");
      if (limitRaw !== undefined && !/^\d+$/.test(limitRaw)) {
        // NaN would silently DISABLE the limit (n >= NaN is always false) — the opposite of
        // rejecting a typo.
        throw new Error("--limit must be a whole number");
      }
      return withStore(storeOf(flags), io, (call) =>
        emit(
          call("search", {
            query,
            ...(limitRaw === undefined ? {} : { limit: Number(limitRaw) }),
          }),
        ),
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
        throw new Error(
          'usage: chorus decide <about> --intent "<what you are about to do>" --store <name>',
        );
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

    case "vitals": {
      // Pure measurement (EPISTEME Phase V.1): an ephemeral reader, zero tool calls, nothing
      // persisted. The examiner-as-author — measurements emitted as claims — is the next slice.
      return withStore(storeOf(flags), io, (_call, ctx) => {
        const v = computeVitals(ctx.agent);
        if (flags.has("json")) return emit(v);
        io.out(
          `deltas       ${v.deltas} (${v.retractions} retraction(s), rate ${v.retractionRate.toFixed(3)})`,
        );
        io.out(
          `live beliefs ${v.liveBeliefs} across ${v.entities} entities, ${v.authors} author(s)`,
        );
        io.out(`contested    ${v.contested} slot(s) held differently by different authors`);
        io.out(
          `source HHI   ${v.sourceConcentration.toFixed(3)} (1/n = n equal voices; 1.0 = a monologue)`,
        );
        if (v.staleness !== undefined) {
          io.out(`staleness    median ${v.staleness.medianDays}d, p90 ${v.staleness.p90Days}d`);
        }
        io.out(
          `confidence   carried on ${v.confidence.carried} belief(s)` +
            (v.confidence.mean === undefined ? "" : `, mean ${v.confidence.mean.toFixed(2)}`),
        );
        io.out(
          `kinds        ${
            Object.entries(v.kinds)
              .map(([k, n]) => `${k}:${n}`)
              .join("  ") || "none"
          }`,
        );
        return 0;
      });
    }

    case "gql": {
      const [query] = positionals;
      if (query === undefined) throw new Error('usage: chorus gql "<query>" --store <name>');
      // One-shot: pin a snapshot, query it, release it — the CLI shape of the ephemeral schema.
      return withStore(storeOf(flags), io, (call) => {
        const prep = call("gql-prepare", {}) as { prepId: string };
        try {
          const body = call("gql-query", { prepId: prep.prepId, query }) as {
            errors?: unknown[];
          };
          emit(body);
          // GraphQL reports syntax/validation failures in the body, not by throwing — a script
          // chaining on exit code must see them.
          return Array.isArray(body.errors) && body.errors.length > 0 ? 1 : 0;
        } finally {
          call("gql-release", { prepId: prep.prepId });
        }
      });
    }

    default:
      throw new Error(`unknown data op "${op}"`);
  }
}
