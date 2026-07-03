// `chorus diff` (EPISTEME V.2): a superposition-aware belief diff — between two stores, or one
// store at two instants. The drift-detection primitive: "my agents should agree about X and
// don't," caught before it costs something.
//
// Agreement isn't one thing, so the diff refuses to flatten it:
//   - agree:            same slot, same values, overlapping testimony.
//   - agreeIndependently: same slot, same values — but DISJOINT authors. Two minds reached one
//                       conclusion on separate testimony. Stronger than agreement; the diff
//                       says so instead of filing it under "same".
//   - disagree:         same slot, different values. The superposition, made visible.
//   - onlyLeft/onlyRight: one side has never considered the question.
// Set-valued slots (plurality declarations) compare as sets — divergence there is a real
// difference of the union, not a contest artifact.

import { DeltaSet, type Delta } from "@rhizomes/rhizomatic";
import { surviving, ChorusAgent } from "./agent.js";
import { ROLE_ABOUT, ROLE_VALUE } from "./vocab.js";

interface Slot {
  readonly values: Set<string>;
  readonly display: Map<string, unknown>; // valueKey -> a printable value
  readonly authors: Set<string>;
}

export interface DiffEntry {
  readonly entity: string;
  readonly attribute: string;
  readonly left?: unknown[];
  readonly right?: unknown[];
}

export interface BeliefDiff {
  readonly agree: number;
  readonly agreeIndependently: DiffEntry[]; // same conclusion, disjoint testimony — named, not counted
  readonly disagree: DiffEntry[];
  readonly onlyLeft: DiffEntry[];
  readonly onlyRight: DiffEntry[];
}

function slotMap(agent: ChorusAgent): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const d of surviving(agent)) {
    let entity: string | undefined;
    let attribute: string | undefined;
    let valueKey: string | undefined;
    let display: unknown;
    for (const p of d.claims.pointers) {
      if (
        p.role === ROLE_ABOUT &&
        p.target.kind === "entity" &&
        p.target.entity.context !== undefined
      ) {
        entity = p.target.entity.id;
        attribute = p.target.entity.context;
      } else if (p.role === ROLE_VALUE) {
        if (p.target.kind === "primitive") {
          valueKey = `p:${String(p.target.value)}`;
          display = p.target.value;
        } else if (p.target.kind === "entity") {
          valueKey = `e:${p.target.entity.id}`;
          display = { entity: p.target.entity.id };
        }
      }
    }
    if (entity === undefined || attribute === undefined || valueKey === undefined) continue;
    const key = `${entity}\u0000${attribute}`;
    const slot = slots.get(key) ?? {
      values: new Set<string>(),
      display: new Map<string, unknown>(),
      authors: new Set<string>(),
    };
    slot.values.add(valueKey);
    slot.display.set(valueKey, display);
    slot.authors.add(d.claims.author);
    slots.set(key, slot);
  }
  return slots;
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((v) => b.has(v));

const disjoint = (a: Set<string>, b: Set<string>): boolean => ![...a].some((v) => b.has(v));

const shown = (slot: Slot): unknown[] => [...slot.values].sort().map((k) => slot.display.get(k));

export function diffBeliefs(left: ChorusAgent, right: ChorusAgent): BeliefDiff {
  const l = slotMap(left);
  const r = slotMap(right);
  let agree = 0;
  const agreeIndependently: DiffEntry[] = [];
  const disagree: DiffEntry[] = [];
  const onlyLeft: DiffEntry[] = [];
  const onlyRight: DiffEntry[] = [];

  const keys = new Set([...l.keys(), ...r.keys()]);
  for (const key of [...keys].sort()) {
    const [entity, attribute] = key.split("\u0000") as [string, string];
    const a = l.get(key);
    const b = r.get(key);
    if (a !== undefined && b === undefined) {
      onlyLeft.push({ entity, attribute, left: shown(a) });
    } else if (a === undefined && b !== undefined) {
      onlyRight.push({ entity, attribute, right: shown(b) });
    } else if (a !== undefined && b !== undefined) {
      if (sameSet(a.values, b.values)) {
        if (disjoint(a.authors, b.authors)) {
          agreeIndependently.push({ entity, attribute, left: shown(a), right: shown(b) });
        } else {
          agree += 1;
        }
      } else {
        disagree.push({ entity, attribute, left: shown(a), right: shown(b) });
      }
    }
  }
  return { agree, agreeIndependently, disagree, onlyLeft, onlyRight };
}

// The world as it stood at an instant: every delta — claims AND negations — at or before it.
// Rebuilding an ephemeral agent from that prefix IS the as-of read, over the whole store at
// once; diffing two instants of one store answers "what changed its mind since Tuesday?"
export function agentAsOf(deltas: readonly Delta[], asOf: number, seedHex: string): ChorusAgent {
  const agent = new ChorusAgent({ name: `asof-${asOf}`, seedHex });
  agent.importSet(DeltaSet.from(deltas.filter((d) => d.claims.timestamp <= asOf)));
  return agent;
}
