/**
 * Mastery-capacity audit (Brief 05). Brief 04's rules need, for a concept to become mastered, eight distinct correct
 * question identities across at least two templates. This measures, per concept, how many distinct questions each bound
 * template can actually ask inside the concept's teaching boundary, so a shortage is found by a test and not by a learner.
 */
import { effectiveScope } from "@mtp/curriculum";
import { generateItem, generatorTemplateIds } from "@mtp/engine";
import type { NodeRunService } from "./node-run.ts";
import type { Course } from "./course.ts";
import { questionKey } from "./question-key.ts";

export interface ConceptCapacity {
  conceptId: string;
  grade: number;
  templates: Record<string, number>;
  distinct: number;
}

export const MIN_DISTINCT = 10; // eight for "mastered" plus headroom for questions the learner has already met
export const MIN_PER_TEMPLATE = 3; // a template only counts as a second "type" if it can really ask a few different things

export function auditCapacity(course: Course, nodes: NodeRunService, grade = 1, seeds = 400): ConceptCapacity[] {
  const generatable = new Set(generatorTemplateIds(course.ix));
  const last = course.nodes.filter((n) => n.grade === grade).at(-1)!;
  const keysByConcept = new Map<string, Map<string, Set<string>>>();
  for (const node of course.nodes.filter((n) => n.grade === grade)) {
    if (!["lesson", "practice", "review"].includes(node.type)) continue;
    for (const b of node.exercises) {
      if (!generatable.has(b.templateId)) continue;
      const scope = effectiveScope(course.ix, node, b);
      for (let seed = 0; seed < seeds; seed++) {
        let item;
        try {
          item = generateItem(course.ix, b.templateId, seed, { scope, evidence: "independent" }).item;
        } catch {
          continue;
        }
        const key = questionKey(item);
        for (const c of nodes.creditedConcepts(item, last, b.conceptIds)) {
          const byT = keysByConcept.get(c) ?? new Map<string, Set<string>>();
          const set = byT.get(b.templateId) ?? new Set<string>();
          set.add(key);
          byT.set(b.templateId, set);
          keysByConcept.set(c, byT);
        }
      }
    }
  }
  return [...course.ix.concepts.values()]
    .filter((c) => c.grade === grade)
    .map((c) => {
      const byT = keysByConcept.get(c.id) ?? new Map<string, Set<string>>();
      const all = new Set([...byT.values()].flatMap((s) => [...s]));
      return { conceptId: c.id, grade, templates: Object.fromEntries([...byT].map(([t, s]) => [t, s.size])), distinct: all.size };
    });
}

export function shortfalls(rows: ConceptCapacity[], allow: Record<string, string> = {}): Array<{ conceptId: string; problem: string }> {
  return rows.flatMap((r) => {
    if (allow[r.conceptId]) return [];
    const strong = Object.values(r.templates).filter((n) => n >= MIN_PER_TEMPLATE).length;
    const problems = [];
    if (r.distinct < MIN_DISTINCT) problems.push(`only ${r.distinct} distinct questions (need ${MIN_DISTINCT})`);
    if (strong < 2) problems.push(`only ${strong} template(s) with at least ${MIN_PER_TEMPLATE} questions (need 2)`);
    return problems.length ? [{ conceptId: r.conceptId, problem: problems.join("; ") }] : [];
  });
}

/**
 * Concepts that genuinely cannot meet the capacity rule, each with the reason. Never silently skipped; a test pins the list.
 * Brief 06: the optional melodic-minor preview has fixed questions only and is never assessed or counted towards mastery.
 */
export const CAPACITY_ALLOWLIST: Record<string, string> = {
  "c.scales.minor-melodic-preview": "optional enrichment with fixed questions only, never assessed or counted (deferred to Grade 3)",
  "c.chords.cadential-six-four": "optional enrichment (Ic-V, OPEN_QUESTIONS Q8): generated and playable, but never assessed or counted towards mastery",
  "c.voices.satb-scores": "optional enrichment (SATB in short and open score, OPEN_QUESTIONS Q8): generated and playable, but never assessed or counted towards mastery",
  "c.metre.anacrusis": "optional enrichment (upbeat starts, OPEN_QUESTIONS Q5) with fixed questions only, never assessed or counted",
};
