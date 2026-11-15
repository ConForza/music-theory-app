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
 *   3. The recommended start is the lowest grade whose probe was not secure; if all of Grades 1-4 were secure, it is Grade 5.
 *   4. A partial result recommends starting THERE (not lower) and lists the missed outcomes as catch-up lessons; a weak result
 *      recommends starting there too, since nothing below it was weak. The learner may always choose a lower grade.
 * The result is advice about where to begin. It is never a grade completion, and never an ABRSM result.
 */
export function recommendPlacement(results: StageResult[], cfg: PrepConfig): PlacementRecommendation {
  const stages = [...results].sort((a, b) => a.grade - b.grade).map((s) => ({ ...s, level: stageLevel(s, cfg) }));
  const failed = stages.find((s) => s.level !== "secure");
  const top = Math.max(...cfg.placement.probeGrades) + 1;
  const probed = new Set(stages.map((s) => s.grade));
  return {
    recommendedGrade: failed ? failed.grade : top,
    stages,
    allSecure: !failed && stages.length === cfg.placement.probeGrades.length,
    decidedBy: failed?.grade ?? null,
    notAssessed: cfg.placement.probeGrades.filter((g) => !probed.has(g)),
  };
}

// ---- results and readiness ----------------------------------------------------------------------------------------------

export type OutcomeLevel = "mastered" | "developing" | "needs_review" | "not_assessed";
export const LEVEL_LABEL: Record<OutcomeLevel, string> = { mastered: "Mastered", developing: "Developing", needs_review: "Needs review", not_assessed: "Not yet assessed" };

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
  independentQuestions: number;
  independentCorrect: number;
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
  ignored: Array<{ id: string; reason: "practice_mode" | "older_rules" | "low_coverage" }>;
}

/**
 * The estimated readiness for ONE grade, from its attempts. Cautious by construction:
 *   - only mock attempts (independent, no hints) are used; practice-mode attempts are listed as ignored;
 *   - only attempts scored under the CURRENT rubric and blueprint are mixed together (older ones keep their own meaning);
 *   - an attempt must have independent evidence for at least `minCoverage` of the grade's outcomes;
 *   - the estimate is the pooled independent percentage of the newest `window` qualifying attempts;
 *   - "On track" additionally needs `minAttemptsForOnTrack` qualifying attempts, so a single good day cannot produce it.
 */
export function readiness(attempts: ReadinessAttempt[], current: { rubricVersion: number; blueprintVersion: number }, cfg: PrepConfig): Readiness {
  const sorted = [...attempts].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const ignored: Readiness["ignored"] = [];
  const usable: ReadinessAttempt[] = [];
  for (const a of sorted) {
    if (a.mode !== "mock") ignored.push({ id: a.id, reason: "practice_mode" });
    else if (a.rubricVersion !== current.rubricVersion || a.blueprintVersion !== current.blueprintVersion) ignored.push({ id: a.id, reason: "older_rules" });
    else if (a.outcomesTotal === 0 || a.outcomesAssessed / a.outcomesTotal < cfg.readiness.minCoverage) ignored.push({ id: a.id, reason: "low_coverage" });
    else usable.push(a);
  }
  const used = usable.slice(0, cfg.readiness.window);
  const basedOn = used.map((a) => a.id);
  if (!used.length) {
    return { label: "not_enough_evidence", title: "Not enough independent evidence yet", detail: "Take a mock examination (no hints, answers on your own) to get an estimate. Practice-mode attempts help you learn but are not counted here.", basedOn, percent: null, attemptsUsed: 0, ignored };
  }
  const q = used.reduce((n, a) => n + a.independentQuestions, 0);
  const c = used.reduce((n, a) => n + a.independentCorrect, 0);
  const percent = q ? Math.round((100 * c) / q) : 0;
  const onTrackOk = used.length >= cfg.readiness.minAttemptsForOnTrack && percent >= cfg.readiness.onTrackPercent;
  if (onTrackOk) {
    return { label: "on_track", title: "On track", detail: `About ${percent}% right on your own across your last ${used.length} mock examinations. This is our own estimate, not an ABRSM result: keep revising the topics marked Developing.`, basedOn, percent, attemptsUsed: used.length, ignored };
  }
  if (percent >= cfg.readiness.developingPercent) {
    const more = percent >= cfg.readiness.onTrackPercent && used.length < cfg.readiness.minAttemptsForOnTrack;
    return { label: "developing", title: "Developing", detail: more ? `About ${percent}% right on your own in one mock examination. One more would give a steadier estimate.` : `About ${percent}% right on your own. You are getting there: revise the topics marked Needs review or Developing, then try another mock.`, basedOn, percent, attemptsUsed: used.length, ignored };
  }
  return { label: "needs_review", title: "Needs review", detail: `About ${percent}% right on your own. That is a useful starting point: the topics below show where to focus, and the lessons explain each one.`, basedOn, percent, attemptsUsed: used.length, ignored };
}
