import type { Curriculum } from "./load.ts";
import type {
  AssessmentTemplate,
  Concept,
  ExerciseFamily,
  ExerciseTemplate,
  GradeScope,
  MusicScope,
  PathNode,
  SyllabusOutcome,
  Unit,
} from "./schema.ts";

export type OrderedNode = PathNode & { grade: number; order: number; resolvedUnlockAfter: string[] };

const LEARNING_TYPES = new Set(["lesson", "practice", "review"]);

/** Indexed, derived view of the curriculum used by validation, coverage and documentation. */
export interface CurriculumIndex {
  c: Curriculum;
  outcomes: Map<string, SyllabusOutcome>;
  concepts: Map<string, Concept>;
  units: Map<string, Unit>;
  nodes: OrderedNode[];
  nodeById: Map<string, OrderedNode>;
  templates: Map<string, ExerciseTemplate>;
  families: Map<string, ExerciseFamily>;
  assessments: Map<string, AssessmentTemplate>;
  /** Nodes guaranteed complete before a node unlocks (transitive closure of unlockAfter). */
  ancestors: Map<string, Set<string>>;
  /** Concept id → nodes (lesson/enrichment) that teach it. */
  conceptTaughtBy: Map<string, OrderedNode[]>;
  /** Outcome id → lesson nodes that teach it. */
  outcomeTaughtBy: Map<string, OrderedNode[]>;
  cumulativeScope: Map<number, MusicScope>;
}

/** Default unlock: previous required lesson/practice/review node in global order. */
function resolveUnlocks(nodes: Array<PathNode & { grade: number; order: number }>): OrderedNode[] {
  let lastLearning: string | null = null;
  return nodes.map((n) => {
    const resolved = n.unlockAfter ?? (lastLearning ? [lastLearning] : []);
    if (LEARNING_TYPES.has(n.type) && !n.optional) lastLearning = n.id;
    return { ...n, resolvedUnlockAfter: resolved };
  });
}

const RANK = {
  intervalQuality: ["number-only", "number-and-quality"],
  intervalLowerNote: ["tonic", "any-diatonic", "any"],
  degreeNaming: ["number", "technical"],
} as const;

export function mergeScope(base: MusicScope, add: MusicScope): MusicScope {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(add)) {
    const prev = out[k];
    if (Array.isArray(v)) {
      out[k] = Array.from(new Set([...((prev as unknown[]) ?? []), ...v]));
    } else if (typeof v === "number") {
      out[k] = Math.max((prev as number) ?? 0, v);
    } else if (typeof v === "boolean") {
      out[k] = Boolean(prev) || v;
    } else if (typeof v === "string" && k in RANK) {
      const ranks = RANK[k as keyof typeof RANK] as readonly string[];
      out[k] = prev && ranks.indexOf(prev as string) > ranks.indexOf(v) ? prev : v;
    } else {
      out[k] = v;
    }
  }
  return out as MusicScope;
}

export function cumulativeScopes(grades: GradeScope[]): Map<number, MusicScope> {
  const result = new Map<number, MusicScope>();
  let acc: MusicScope = {};
  for (const g of [...grades].sort((a, b) => a.grade - b.grade)) {
    acc = mergeScope(acc, g.adds);
    result.set(g.grade, acc);
  }
  return result;
}

/** Returns human-readable violations where `scope` exceeds `limit`. */
export function scopeViolations(scope: MusicScope, limit: MusicScope): string[] {
  const v: string[] = [];
  for (const [k, value] of Object.entries(scope)) {
    const lim = (limit as Record<string, unknown>)[k];
    if (Array.isArray(value)) {
      const allowed = new Set((lim as unknown[]) ?? []);
      const extra = value.filter((x) => !allowed.has(x));
      if (extra.length) v.push(`${k}: ${extra.join(", ")} not yet in scope`);
    } else if (typeof value === "number") {
      if (lim === undefined || value > (lim as number)) v.push(`${k}: ${value} exceeds ${String(lim ?? 0)}`);
    } else if (typeof value === "boolean") {
      if (value && !lim) v.push(`${k}: not yet in scope`);
    } else if (typeof value === "string" && k in RANK) {
      const ranks = RANK[k as keyof typeof RANK] as readonly string[];
      if (lim === undefined || ranks.indexOf(value) > ranks.indexOf(lim as string)) {
        v.push(`${k}: "${value}" exceeds "${String(lim)}"`);
      }
    }
  }
  return v;
}

export function buildIndex(c: Curriculum): CurriculumIndex {
  const outcomes = new Map(c.syllabus.outcomes.map((o) => [o.id, o]));
  const concepts = new Map(c.concepts.flatMap((f) => f.concepts).map((x) => [x.id, x]));
  const worlds = [...c.worlds].sort((a, b) => a.grade - b.grade);
  const units = new Map(worlds.flatMap((w) => w.units).map((u) => [u.id, u]));
  let order = 0;
  const raw = worlds.flatMap((w) => w.nodes.map((n) => ({ ...n, grade: w.grade, order: order++ })));
  const nodes = resolveUnlocks(raw);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const templates = new Map(c.templates.flatMap((f) => f.templates).map((t) => [t.id, t]));
  const families = new Map(c.families.families.map((f) => [f.id, f]));
  const assessments = new Map(c.assessments.flatMap((f) => f.assessments).map((a) => [a.id, a]));

  const ancestors = new Map<string, Set<string>>();
  for (const n of nodes) {
    const set = new Set<string>();
    for (const p of n.resolvedUnlockAfter) {
      const pn = nodeById.get(p);
      if (!pn || pn.order >= n.order) continue; // reported by the validator
      set.add(p);
      for (const a of ancestors.get(p) ?? []) set.add(a);
    }
    ancestors.set(n.id, set);
  }

  const conceptTaughtBy = new Map<string, OrderedNode[]>();
  const outcomeTaughtBy = new Map<string, OrderedNode[]>();
  for (const n of nodes) {
    if (n.type !== "lesson" && n.type !== "enrichment") continue;
    for (const cid of n.conceptIds) conceptTaughtBy.set(cid, [...(conceptTaughtBy.get(cid) ?? []), n]);
    if (n.type === "lesson") {
      for (const oid of n.outcomeIds) outcomeTaughtBy.set(oid, [...(outcomeTaughtBy.get(oid) ?? []), n]);
    }
  }

  return {
    c,
    outcomes,
    concepts,
    units,
    nodes,
    nodeById,
    templates,
    families,
    assessments,
    ancestors,
    conceptTaughtBy,
    outcomeTaughtBy,
    cumulativeScope: cumulativeScopes(c.scope.grades),
  };
}

/** Concepts taught at a node or any of its required ancestors. */
export function conceptsAvailableAt(ix: CurriculumIndex, node: OrderedNode, includeSelf = true): Set<string> {
  const out = new Set<string>();
  const add = (n: OrderedNode) => n.conceptIds.forEach((x) => out.add(x));
  if (includeSelf) add(node);
  for (const a of ix.ancestors.get(node.id) ?? []) {
    const an = ix.nodeById.get(a);
    if (an && (an.type === "lesson" || (an.type === "enrichment" && node.optional))) add(an);
  }
  return out;
}

/** Outcomes taught by a node's ancestor lessons (and itself if it is a lesson). */
export function outcomesTaughtBefore(ix: CurriculumIndex, node: OrderedNode, includeSelf = true): Set<string> {
  const out = new Set<string>();
  const add = (n: OrderedNode) => {
    if (n.type === "lesson") n.outcomeIds.forEach((x) => out.add(x));
  };
  if (includeSelf) add(node);
  for (const a of ix.ancestors.get(node.id) ?? []) {
    const an = ix.nodeById.get(a);
    if (an) add(an);
  }
  return out;
}
