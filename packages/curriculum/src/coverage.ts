import { templateIdsOf, type CurriculumIndex } from "./model.ts";

export interface OutcomeCoverage {
  outcomeId: string;
  grade: number;
  statement: string;
  conceptIds: string[];
  lessons: string[];
  practiceTemplates: string[];
  practiceNodes: string[];
  reviewNodes: string[];
  assessments: string[];
  gradeAssessment: string | null;
  bookSections: string[];
  /** Planned = every channel present in the plan; never "verified" without teacher sign-off. */
  status: "planned" | "incomplete" | "teacher-approved";
  missing: Array<"lesson" | "practice" | "review" | "assessment" | "grade-assessment">;
}

/**
 * Compute, for every official outcome, where it is taught, practised, reviewed and assessed.
 * Coverage is reported as PLANNED until both the outcome and the release have teacher approval.
 */
export function computeCoverage(ix: CurriculumIndex): OutcomeCoverage[] {
  const { c } = ix;
  const releaseApproved = c.release.teacherReview.status === "approved";
  return c.syllabus.outcomes.map((o) => {
    const lessons = (ix.outcomeTaughtBy.get(o.id) ?? []).map((n) => n.id);
    const conceptIds = [...ix.concepts.values()].filter((x) => x.outcomeIds.includes(o.id)).map((x) => x.id);
    const targeting = [...ix.templates.values()].filter((t) => t.outcomeIds.includes(o.id)).map((t) => t.id);
    const practiceNodes = ix.nodes
      .filter((n) => (n.type === "lesson" || n.type === "practice") && n.grade >= o.grade)
      .filter((n) => templateIdsOf(n).some((t) => targeting.includes(t)))
      .filter((n) => n.type === "lesson" ? n.outcomeIds.includes(o.id) : n.reviewOutcomeIds.includes(o.id))
      .map((n) => n.id);
    const practiceTemplates = targeting.filter((t) =>
      ix.nodes.some((n) => practiceNodes.includes(n.id) && templateIdsOf(n).includes(t)),
    );
    const reviewNodes = ix.nodes
      .filter((n) => n.type === "review" && n.reviewOutcomeIds.includes(o.id))
      .filter((n) => templateIdsOf(n).some((t) => targeting.includes(t)))
      .map((n) => n.id);
    const assessments = [...ix.assessments.values()]
      .filter((a) => a.sections.some((s) => s.outcomeIds.includes(o.id) && s.templateIds.some((t) => targeting.includes(t))))
      .map((a) => a.id);
    const gradeAssessment =
      [...ix.assessments.values()].find(
        (a) => a.kind === "grade_assessment" && a.grade === o.grade && assessments.includes(a.id),
      )?.id ?? null;
    const bookSections = c.book.sections.filter((s) => s.outcomeIds.includes(o.id)).map((s) => s.id);
    const missing: OutcomeCoverage["missing"] = [];
    if (!lessons.length) missing.push("lesson");
    if (!practiceNodes.length) missing.push("practice");
    if (!reviewNodes.length) missing.push("review");
    if (!assessments.length) missing.push("assessment");
    if (!gradeAssessment) missing.push("grade-assessment");
    const status = missing.length
      ? "incomplete"
      : releaseApproved && o.teacherReview === "approved"
        ? "teacher-approved"
        : "planned";
    return {
      outcomeId: o.id,
      grade: o.grade,
      statement: o.statement,
      conceptIds,
      lessons,
      practiceTemplates,
      practiceNodes,
      reviewNodes,
      assessments,
      gradeAssessment,
      bookSections,
      status,
      missing,
    };
  });
}
