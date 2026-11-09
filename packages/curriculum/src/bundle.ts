import type { Curriculum } from "./load.ts";
import { buildIndex } from "./model.ts";
import { computeCoverage } from "./coverage.ts";

/**
 * A single machine-readable snapshot of the curriculum for consumers that prefer one file
 * (e.g. the Brief 02 app shell). Generated on demand; the per-file JSON under /content is the source of truth.
 */
export function bundleCurriculum(c: Curriculum) {
  const ix = buildIndex(c);
  return {
    format: "music-theory-path/curriculum-bundle@1",
    release: c.release,
    outcomes: c.syllabus.outcomes,
    gradeScope: c.scope.grades,
    cumulativeScope: Object.fromEntries(ix.cumulativeScope),
    engine: c.engine,
    families: c.families.families,
    templates: [...ix.templates.values()],
    concepts: [...ix.concepts.values()],
    worlds: [...c.worlds].sort((a, b) => a.grade - b.grade).map((w) => ({
      ...w,
      nodes: w.nodes.map((n) => ({ ...n, unlockAfter: ix.nodeById.get(n.id)!.resolvedUnlockAfter })),
    })),
    assessments: [...ix.assessments.values()],
    sourceBookSections: c.book.sections,
    policy: c.policy,
    lessons: c.lessons.map((l) => l.content),
    items: c.items.map((i) => i.content),
    coverage: computeCoverage(ix),
  };
}
