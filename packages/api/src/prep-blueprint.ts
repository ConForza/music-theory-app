/**
 * Brief 10: how practice examinations and placement checks are COMPOSED, and how their results are interpreted.
 *
 * Everything in this file is deterministic and has no database access, so it is documented and unit-tested as rules:
 *
 *   examBlueprint        which questions a grade's practice examination asks (every syllabus outcome of the grade, `itemsPerOutcome` times,
 *                        plus a score-reading section), and which exercise templates may supply each.
 *   probeOutcomes        which outcomes a placement probe for a grade tests: the ones the most later learning depends on.
 *   recommendPlacement   the starting grade and gaps from the probes' results.
 *   outcomeLevel, readiness   how results become "Mastered / Developing / Needs review / Not yet assessed" and the cautious estimate.
 *
 * None of the numbers are ABRSM's (see prep-config.ts).
 */
import type { Concept, SyllabusOutcome } from "@mtp/curriculum";
import type { Course } from "./course.ts";
import type { PrepConfig } from "./prep-config.ts";

/**
 * Templates that put SEVERAL ideas into one piece of notation: melodies, passages and scores, each asked as a multi-part question (key, metre,
 * rhythm, intervals, chords... read from the same music). Single-question reads of a passage (`melody-detail`, `chord-passage-pick`) are
 * deliberately not here: they test one idea, so they belong to that idea's own outcome.
 */
export const SCORE_READING_TEMPLATE = /^t\.g[1-5]\.(melody|passage|passage-directions|chord-in-passage|score|score-melody)$/;

export interface BlueprintSection {
  id: string;
  /** The syllabus outcome this section tests (null for the score-reading section, which spans several). */
  outcomeId: string | null;
  statement: string;
  domain: string;
  templateIds: string[];
  itemCount: number;
  combined: boolean;
}
export interface ExamBlueprint {
  grade: number;
  version: number;
  sections: BlueprintSection[];
  totalItems: number;
  /** Outcomes of the grade that have no usable template: a non-empty list is a content defect the coverage audit fails on. */
  uncovered: string[];
}

const byItem = (a: SyllabusOutcome, b: SyllabusOutcome) => a.syllabusItem - b.syllabusItem || a.id.localeCompare(b.id);

/** The syllabus outcomes introduced at `grade`, in syllabus order. */
export function gradeOutcomes(course: Course, grade: number): SyllabusOutcome[] {
  return [...course.ix.outcomes.values()].filter((o) => o.grade === grade).sort(byItem);
}

/**
 * Templates that can ask about an outcome: first those the existing grade-assessment blueprint already uses for it (they are the
 * reviewed, bounded pool), then any other generatable template bound to the outcome. Order is stable.
 */
export function outcomeTemplates(course: Course, grade: number, outcomeId: string, generatable: Set<string>): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (generatable.has(t) && !out.includes(t)) out.push(t);
  };
  const a = course.ix.assessments.get(`a.g${grade}`);
  for (const s of a?.sections ?? []) if (s.outcomeIds.includes(outcomeId)) s.templateIds.forEach(add);
  // A template only counts for this outcome if it is one of the grade's own (never a later grade's, which the learner cannot yet face).
  for (const t of course.ix.templates.values()) if (t.grade <= grade && t.outcomeIds.includes(outcomeId)) add(t.id);
  return out;
}

/** The practice-exam blueprint for a grade, derived from the curriculum so it can never drift from the syllabus map. */
export function examBlueprint(course: Course, grade: number, cfg: PrepConfig, generatable: Set<string>): ExamBlueprint {
  const sections: BlueprintSection[] = [];
  const uncovered: string[] = [];
  for (const o of gradeOutcomes(course, grade)) {
    const templateIds = outcomeTemplates(course, grade, o.id, generatable);
    if (!templateIds.length) uncovered.push(o.id);
    sections.push({ id: `o:${o.id}`, outcomeId: o.id, statement: o.statement, domain: o.domain, templateIds, itemCount: cfg.exam.itemsPerOutcome, combined: false });
  }
  const reading = [...course.ix.templates.values()].filter((t) => t.grade <= grade && SCORE_READING_TEMPLATE.test(t.id) && generatable.has(t.id)).map((t) => t.id);
  // Favour the grade's own score-reading templates: the exam is about this grade's music.
  const own = reading.filter((t) => t.startsWith(`t.g${grade}.`));
  const pool = own.length ? own : reading;
  if (cfg.exam.scoreReadingItems > 0) {
    sections.push({ id: "score-reading", outcomeId: null, statement: "Reading music in context: questions that combine several ideas in one piece of notation.", domain: "context", templateIds: pool, itemCount: cfg.exam.scoreReadingItems, combined: true });
    if (!pool.length) uncovered.push("score-reading");
  }
  return { grade, version: cfg.blueprintVersion, sections, totalItems: sections.reduce((n, s) => n + s.itemCount, 0), uncovered };
}

// ---- placement probes -----------------------------------------------------------------------------------------------------

/**
 * How much later learning depends on an outcome: the number of concepts in LATER grades that (transitively) have one of the
 * outcome's concepts among their prerequisites. An outcome nothing later builds on is a poor placement question; a foundation
 * that Grade 3 to 5 all rest on is a good one.
 */
export function outcomeImportance(course: Course): Map<string, number> {
  const concepts = [...course.ix.concepts.values()];
  const dependents = new Map<string, Concept[]>();
  for (const c of concepts) for (const p of c.prerequisiteIds) dependents.set(p, [...(dependents.get(p) ?? []), c]);
  const downstream = (id: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      for (const d of dependents.get(stack.pop()!) ?? []) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        stack.push(d.id);
      }
    }
    return seen;
  };
  const out = new Map<string, number>();
  for (const o of course.ix.outcomes.values()) {
    const later = new Set<string>();
    for (const c of concepts.filter((x) => x.outcomeIds.includes(o.id))) for (const d of downstream(c.id)) if ((course.ix.concepts.get(d)?.grade ?? 0) > o.grade) later.add(d);
    out.set(o.id, later.size);
  }
  return out;
}

/**
 * The outcomes a grade's placement probe tests. Greedy by importance, with each further outcome from an already-chosen domain
 * discounted, so the probe is varied (rhythm, pitch, keys, terms...) as well as foundational. Outcomes with no usable template are
 * skipped. Ties break on syllabus order, so the choice is deterministic.
 */
export function probeOutcomes(course: Course, grade: number, count: number, generatable: Set<string>, importance = outcomeImportance(course)): SyllabusOutcome[] {
  const pool = gradeOutcomes(course, grade).filter((o) => outcomeTemplates(course, grade, o.id, generatable).length > 0);
  const chosen: SyllabusOutcome[] = [];
  const perDomain = new Map<string, number>();
  while (chosen.length < count && chosen.length < pool.length) {
    let best: SyllabusOutcome | null = null;
    let bestScore = -Infinity;
    for (const o of pool) {
      if (chosen.includes(o)) continue;
      const score = (importance.get(o.id) ?? 0) / (1 + (perDomain.get(o.domain) ?? 0)) ** 2;
      if (score > bestScore) {
        best = o;
        bestScore = score;
      }
    }
    if (!best) break;
    chosen.push(best);
    perDomain.set(best.domain, (perDomain.get(best.domain) ?? 0) + 1);
  }
  return chosen.sort(byItem);
}

export type StageLevel = "secure" | "partial" | "weak";
export interface StageResult {
  grade: number;
  asked: number;
  correct: number;
  /** Outcomes of questions answered wrongly or not at all. */
  missed: string[];
}
export interface PlacementRecommendation {
  recommendedGrade: number;
  stages: Array<StageResult & { level: StageLevel }>;
  /** True when every probe was passed, so the learner is placed at the top of the course. */
  allSecure: boolean;
  /** The grade whose probe was not secure and which therefore decided the placement (null when all were secure). */
  decidedBy: number | null;
  /** Grades that were not probed because an earlier probe already settled the placement. */
  notAssessed: number[];
}

export function stageLevel(s: Pick<StageResult, "asked" | "correct">, cfg: PrepConfig): StageLevel {
  if (s.asked === 0) return "weak";
  const r = s.correct / s.asked;
  return r >= cfg.placement.secureRatio ? "secure" : r >= cfg.placement.partialRatio ? "partial" : "weak";
}

/**
 * The placement rule, in one place:
 *   1. Probes are taken from the lowest grade upward, and stop at the first one that is not secure.
 *   2. A probe is secure when at least `secureRatio` of its questions were right first time, without hints.
 *   3. The recommended start is the lowest grade whose probe was not secure; if all of Grades 1-4 were secure, it is Grade 5; if some grade was never probed, it is
 *      the first of those (a recommendation never rests on a grade that was not asked about).
 *   4. A partial result recommends starting THERE (not lower) and lists the missed outcomes as catch-up lessons; a weak result
 *      recommends starting there too, since nothing below it was weak. The learner may always choose a lower grade.
 * The result is advice about where to begin. It is never a grade completion, and never an ABRSM result.
 */
export function recommendPlacement(results: StageResult[], cfg: PrepConfig): PlacementRecommendation {
  const stages = [...results].sort((a, b) => a.grade - b.grade).map((s) => ({ ...s, level: stageLevel(s, cfg) }));
  const failed = stages.find((s) => s.level !== "secure");
  const top = Math.max(...cfg.placement.probeGrades) + 1;
  const probed = new Set(stages.map((s) => s.grade));
  // A grade is only recommended if everything below it was probed and secure: never above the first grade nobody asked about.
  const unprobed = cfg.placement.probeGrades.find((g) => !probed.has(g));
  return {
    recommendedGrade: failed ? failed.grade : (unprobed ?? top),
    stages,
    allSecure: !failed && stages.length === cfg.placement.probeGrades.length,
    decidedBy: failed?.grade ?? null,
    notAssessed: cfg.placement.probeGrades.filter((g) => !probed.has(g)),
  };
}

// ---- results and readiness ----------------------------------------------------------------------------------------------

export type OutcomeLevel = "mastered" | "developing" | "needs_review" | "not_assessed";
export const LEVEL_LABEL: Record<OutcomeLevel, string> = { mastered: "Right both times", developing: "Developing", needs_review: "Needs review", not_assessed: "Not yet assessed" };

/**
 * One outcome in one attempt. Only INDEPENDENT answers (mock mode, no hints, a question not previously seen with help) count: a
 * practice-mode or coached answer is real learning but is never evidence of what the learner can do alone.
 */
export function outcomeLevel(independentAsked: number, independentCorrect: number, cfg: PrepConfig): OutcomeLevel {
  if (independentAsked === 0) return "not_assessed";
  if (independentCorrect === 0) return "needs_review";
  return independentAsked >= 2 && independentCorrect / independentAsked >= cfg.readiness.outcomeMasteredRatio ? "mastered" : "developing";
}

export interface ReadinessAttempt {
  id: string;
  completedAt: string;
  mode: "practice" | "mock";
  rubricVersion: number;
  blueprintVersion: number;
  curriculumVersion: string;
  /** Questions on the paper that were not coached, answered or not: an unanswered one counts as not right. */
  independentQuestions: number;
  independentCorrect: number;
  /** The paper's size and how many questions were answered. */
  questions: number;
  answered: number;
  /** The learner-local calendar day it was finished (the two attempts behind "On track" must be on different days). */
  day: string;
  /** Outcomes of the grade, and how many got any independent evidence. */
  outcomesTotal: number;
  outcomesAssessed: number;
}
export type ReadinessLabel = "on_track" | "developing" | "needs_review" | "not_enough_evidence";
export interface Readiness {
  label: ReadinessLabel;
  title: string;
  detail: string;
  /** The mock attempts the estimate is based on (newest first). */
  basedOn: string[];
  percent: number | null;
  attemptsUsed: number;
  /** Attempts ignored: practice-mode, or scored under an earlier rubric or blueprint (their results stay, but are not mixed in). */
  ignored: Array<{ id: string; reason: "practice_mode" | "older_rules" | "low_coverage" | "too_few_answered" }>;
}

/**
 * The estimated readiness for ONE grade, from its attempts. Cautious by construction:
 *   - only mock attempts (independent, no hints) are used; practice-mode attempts are listed as ignored;
 *   - only attempts scored under the CURRENT rubric and blueprint are mixed together (older ones keep their own meaning);
 *   - an attempt needs at least `minAnsweredShare` of its QUESTIONS answered (an unanswered question scores nothing) and independent evidence
 *     for at least `minCoverage` of the grade's outcomes;
 *   - the estimate is the pooled independent percentage of the newest `window` qualifying attempts, counting every unanswered question as not right;
 *   - "Consistently secure" (`on_track`) needs `minAttemptsForOnTrack` qualifying attempts on different days, EACH at or above the line: a strong
 *     paper followed by a weak one pools to a respectable number, and must not read as "on track".
 */
export function readiness(attempts: ReadinessAttempt[], current: { rubricVersion: number; blueprintVersion: number }, cfg: PrepConfig): Readiness {
  const sorted = [...attempts].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const ignored: Readiness["ignored"] = [];
  const usable: ReadinessAttempt[] = [];
  for (const a of sorted) {
    if (a.mode !== "mock") ignored.push({ id: a.id, reason: "practice_mode" });
    else if (a.rubricVersion !== current.rubricVersion || a.blueprintVersion !== current.blueprintVersion) ignored.push({ id: a.id, reason: "older_rules" });
    else if (a.questions === 0 || a.answered / a.questions < cfg.readiness.minAnsweredShare) ignored.push({ id: a.id, reason: "too_few_answered" });
    else if (a.outcomesTotal === 0 || a.outcomesAssessed / a.outcomesTotal < cfg.readiness.minCoverage) ignored.push({ id: a.id, reason: "low_coverage" });
    else usable.push(a);
  }
  const used = usable.slice(0, cfg.readiness.window);
  const basedOn = used.map((a) => a.id);
  if (!used.length) {
    return { label: "not_enough_evidence", title: "Not enough independent evidence yet", detail: `Take a full mock examination (no hints, answering at least ${Math.round(100 * cfg.readiness.minAnsweredShare)}% of the questions on your own) to get an estimate. Practice-mode attempts help you learn but are not counted here.`, basedOn, percent: null, attemptsUsed: 0, ignored };
  }
  const q = used.reduce((n, a) => n + a.independentQuestions, 0);
  const c = used.reduce((n, a) => n + a.independentCorrect, 0);
  // Thresholds are compared on the exact ratio (41 of 55 is 74.5%, below a line of 75); only what is DISPLAYED is rounded.
  const exact = q ? (100 * c) / q : 0;
  const percent = Math.round(exact);
  const each = used.map((a) => (a.independentQuestions ? (100 * a.independentCorrect) / a.independentQuestions : 0));
  const days = new Set(used.map((a) => a.day)).size;
  const spread = `Even so, with about ${q} questions the true figure could easily be 10 points either way.`;
  const enough = used.length >= cfg.readiness.minAttemptsForOnTrack;
  if (enough && days >= 2 && each.every((p) => p >= cfg.readiness.onTrackPercent)) {
    return { label: "on_track", title: "Consistently secure", detail: `Right on your own in each of your last ${used.length} mock examinations (about ${percent}% of ${q} questions, on different days). This is our own estimate, not an ABRSM result. ${spread}`, basedOn, percent, attemptsUsed: used.length, ignored };
  }
  if (exact >= cfg.readiness.developingPercent) {
    const nearly = exact >= cfg.readiness.onTrackPercent || each.some((p) => p >= cfg.readiness.onTrackPercent);
    const why = !enough ? "One more mock examination would give a steadier estimate." : days < 2 ? "Taking the next one on a different day shows whether it lasts." : each.some((p) => p < cfg.readiness.onTrackPercent) ? "Your most recent papers did not all reach the line, so it is not yet consistent." : "";
    return { label: "developing", title: "Developing", detail: nearly ? `About ${percent}% right on your own (${q} questions). ${why}` : `About ${percent}% right on your own (${q} questions). You are getting there: revise the topics marked Needs review or Developing, then try another mock.`, basedOn, percent, attemptsUsed: used.length, ignored };
  }
  return { label: "needs_review", title: "Needs review", detail: `About ${percent}% right on your own (${q} questions, counting any you left unanswered). That is a useful starting point: the topics below show where to focus, and the lessons explain each one.`, basedOn, percent, attemptsUsed: used.length, ignored };
}
