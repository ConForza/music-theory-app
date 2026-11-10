/**
 * Concept mastery (Brief 04). Mastery is *independent* of XP, streaks and lesson completion: it is a pure fold over the
 * evidence ledger (`mastery_evidence`) under a configurable rules version. Nothing here reads XP.
 *
 * Valid mastery evidence is a correct answer that is the learner's first-ever attempt at that exact item, with no hint and
 * no revealed solution, graded by the server inside the taught scope, and that comes from either
 *   - an `independent` lesson step (authored by the curriculum as such), or
 *   - a server-generated review-session item (the only designated independent review activity).
 * Guided steps, hinted steps, remedial steps, retries and the practice lab never count.
 */
import type { ProgressionPolicy } from "@mtp/curriculum";
import { addDays, daysBetween } from "./clock.ts";

export type MasteryState = "new" | "learning" | "practising" | "proficient" | "mastered" | "review_due";
export const STATE_ORDER: MasteryState[] = ["new", "learning", "practising", "proficient", "mastered"];
const rank = (s: MasteryState) => (s === "review_due" ? 3 : STATE_ORDER.indexOf(s));

export type EvidenceSource =
  | "independent-step"
  | "review-item"
  | "guided-step"
  | "hinted-step"
  | "retry-after-reveal"
  | "remedial-step"
  | "not-first-attempt";
export const COUNTING_SOURCES: EvidenceSource[] = ["independent-step", "review-item"];

export interface EvidenceRow {
  id: string;
  conceptId: string;
  source: EvidenceSource;
  counts: boolean;
  correct: boolean;
  itemId: string;
  templateId: string;
  templateVersion: number;
  seed: number | null;
  nodeId: string | null;
  sessionId: string | null;
  mistakeCategory: string | null;
  localDate: string;
  occurredAt: string;
  rulesVersion: number;
}

export interface MasteryRules {
  rulesVersion: number;
  proficient: { minIndependentCorrect: number; minDistinctTemplates: number };
  mastered: { minIndependentCorrect: number; minDistinctTemplates: number; minDaysSinceFirstEvidence: number; requiresDelayedReview: boolean };
  intervalsDays: number[];
  lapseResetsTo: number;
}

export function rulesFrom(p: ProgressionPolicy): MasteryRules {
  return {
    rulesVersion: p.mastery.rulesVersion ?? 1,
    proficient: p.mastery.thresholds.proficient,
    mastered: p.mastery.thresholds.mastered,
    intervalsDays: p.review.intervalsDays,
    lapseResetsTo: Math.min(p.review.lapseResetsTo, p.review.intervalsDays.length - 1),
  };
}

export interface ConceptMastery {
  conceptId: string;
  state: MasteryState;
  /** The best state ever reached; a lapse or a due date never lowers it. */
  highestState: MasteryState;
  rulesVersion: number;
  independentCorrect: number;
  distinctTemplates: number;
  templateIds: string[];
  firstCorrectDate: string | null;
  lastCorrectDate: string | null;
  spanDays: number;
  /** Successful scheduled reviews since the last lapse. */
  delayedReviews: number;
  lapses: number;
  needsRecovery: boolean;
  intervalIndex: number | null;
  nextDueDate: string | null;
  lastReviewDate: string | null;
  /** First-attempt failures by mistake category (valid evidence only). */
  mistakes: Record<string, number>;
  /** Recent valid answers, newest last: true = correct. */
  recent: boolean[];
  /** Ids of the evidence rows that counted, for the audit trail. */
  countedEvidence: string[];
  reachedProficientOn: string | null;
  reachedMasteredOn: string | null;
}

const baseState = (c: { correct: number; templates: number; span: number; recovered: boolean }, r: MasteryRules, exposed: boolean): MasteryState => {
  if (c.correct === 0) return exposed ? "learning" : "new";
  const m = r.mastered;
  if (c.correct >= m.minIndependentCorrect && c.templates >= m.minDistinctTemplates && c.span >= m.minDaysSinceFirstEvidence && (!m.requiresDelayedReview || c.recovered)) return "mastered";
  if (c.correct >= r.proficient.minIndependentCorrect && c.templates >= r.proficient.minDistinctTemplates) return "proficient";
  return "practising";
};

/**
 * Pure and deterministic: the same rows, rules and `today` always give the same answer. Rows must be ordered by time.
 * `today` (learner-local date) only decides whether a review is due now.
 */
export function foldConcept(conceptId: string, rows: EvidenceRow[], rules: MasteryRules, today: string): ConceptMastery {
  const correctItems = new Set<string>();
  const templates = new Set<string>();
  const counted: string[] = [];
  const mistakes: Record<string, number> = {};
  const recent: boolean[] = [];
  let firstCorrect: string | null = null;
  let lastCorrect: string | null = null;
  let highest: MasteryState = "new";
  let reachedProficientOn: string | null = null;
  let reachedMasteredOn: string | null = null;
  // schedule
  const sch: { idx: number | null; due: string | null } = { idx: null, due: null };
  let lastReview: string | null = null;
  let lapses = 0;
  let successesSinceLapse = 0;
  let needsRecovery = false;
  let lapseDay: string | null = null;
  const last = rules.intervalsDays.length - 1;
  const schedule = (from: string, i: number) => {
    sch.idx = i;
    sch.due = addDays(from, rules.intervalsDays[i]!);
  };
  let exposed = false;

  for (const r of rows) {
    exposed = true;
    if (!r.counts) continue;
    counted.push(r.id);
    recent.push(r.correct);
    if (!r.correct) {
      mistakes[r.mistakeCategory ?? "unclassified"] = (mistakes[r.mistakeCategory ?? "unclassified"] ?? 0) + 1;
    } else if (!correctItems.has(r.itemId)) {
      // Variety: the same item answered again (e.g. a replayed lesson) is not new evidence.
      correctItems.add(r.itemId);
      templates.add(r.templateId);
      firstCorrect ??= r.localDate;
      if (lastCorrect === null || r.localDate > lastCorrect) lastCorrect = r.localDate;
      if (sch.idx === null) schedule(r.localDate, 0);
    }
    if (r.source === "review-item" && sch.idx !== null) {
      if (!r.correct) {
        // One lapse per day: a second wrong answer the same day is the same lapse.
        if (lapseDay !== r.localDate) {
          lapses++;
          lapseDay = r.localDate;
        }
        needsRecovery = true;
        successesSinceLapse = 0;
        schedule(r.localDate, Math.min(rules.lapseResetsTo, last));
      } else if (sch.due !== null && r.localDate >= sch.due && lapseDay !== r.localDate) {
        // A correct answer when the review was due moves the schedule one step; an early or same-day repeat does not.
        successesSinceLapse++;
        needsRecovery = false;
        lastReview = r.localDate;
        schedule(r.localDate, Math.min(sch.idx + 1, last));
      }
    }
    const span = firstCorrect && lastCorrect ? daysBetween(firstCorrect, lastCorrect) : 0;
    const s = baseState({ correct: correctItems.size, templates: templates.size, span, recovered: successesSinceLapse > 0 }, rules, exposed);
    if (rank(s) > rank(highest)) highest = s;
    if (s === "proficient" && reachedProficientOn === null) reachedProficientOn = r.localDate;
    if (s === "mastered") {
      reachedProficientOn ??= r.localDate;
      reachedMasteredOn ??= r.localDate;
    }
  }

  const span = firstCorrect && lastCorrect ? daysBetween(firstCorrect, lastCorrect) : 0;
  let state = baseState({ correct: correctItems.size, templates: templates.size, span, recovered: successesSinceLapse > 0 }, rules, exposed);
  if (rank(state) > rank(highest)) highest = state;
  // After a wrong review answer the concept is honestly shaky until a later review succeeds; the history is kept.
  if (needsRecovery && rank(state) > rank("practising")) state = "practising";
  else if (sch.due !== null && today >= sch.due && (state === "proficient" || state === "mastered")) state = "review_due";
  if (state === "new" && exposed) state = "learning";

  return {
    conceptId,
    state,
    highestState: highest === "new" && exposed ? "learning" : highest,
    rulesVersion: rules.rulesVersion,
    independentCorrect: correctItems.size,
    distinctTemplates: templates.size,
    templateIds: [...templates].sort(),
    firstCorrectDate: firstCorrect,
    lastCorrectDate: lastCorrect,
    spanDays: span,
    delayedReviews: successesSinceLapse,
    lapses,
    needsRecovery,
    intervalIndex: sch.idx,
    nextDueDate: sch.due,
    lastReviewDate: lastReview,
    mistakes,
    recent: recent.slice(-10),
    countedEvidence: counted,
    reachedProficientOn,
    reachedMasteredOn,
  };
}

export const isDue = (m: Pick<ConceptMastery, "nextDueDate">, today: string) => m.nextDueDate !== null && today >= m.nextDueDate;

/** Why the concept is where it is, and exactly what is missing for the next step (shown to learners and teachers). */
export function explainMastery(m: ConceptMastery | null, rules: MasteryRules): { headline: string; missing: string[]; met: string[] } {
  if (!m || (m.state === "learning" && m.independentCorrect === 0)) {
    return {
      headline: m ? "You've started this topic. Answers with hints or in guided steps help you learn but don't count towards mastery." : "Not started yet.",
      missing: [`Answer ${rules.proficient.minIndependentCorrect} different questions correctly on the first try, without hints.`],
      met: [],
    };
  }
  const p = rules.proficient;
  const ms = rules.mastered;
  const met: string[] = [];
  const missing: string[] = [];
  const need = (have: number, want: number, label: (n: number) => string) => (have >= want ? undefined : label(want - have));
  const proficientGaps = [
    need(m.independentCorrect, p.minIndependentCorrect, (n) => `${n} more correct first-try answer${n === 1 ? "" : "s"} without hints`),
    need(m.distinctTemplates, p.minDistinctTemplates, () => `a correct answer to a different kind of question`),
  ].filter((x): x is string => Boolean(x));
  const reachedP = rank(m.highestState) >= rank("proficient");
  if (!reachedP) {
    missing.push(...proficientGaps);
    met.push(`${m.independentCorrect} correct first-try answer${m.independentCorrect === 1 ? "" : "s"} so far, across ${m.distinctTemplates} kind${m.distinctTemplates === 1 ? "" : "s"} of question`);
    return { headline: "Keep going: this counts towards proficient.", missing, met };
  }
  const masteredGaps = [
    need(m.independentCorrect, ms.minIndependentCorrect, (n) => `${n} more correct first-try answer${n === 1 ? "" : "s"} without hints`),
    need(m.distinctTemplates, ms.minDistinctTemplates, () => "a correct answer to a different kind of question"),
    need(m.spanDays, ms.minDaysSinceFirstEvidence, (n) => `evidence from ${n} more day${n === 1 ? "" : "s"} later (spaced practice)`),
    ms.requiresDelayedReview && m.delayedReviews === 0 ? "a correct answer in a scheduled review" : undefined,
  ].filter((x): x is string => Boolean(x));
  if (m.state === "mastered") return { headline: "Mastered: independent evidence over time, including a successful review.", missing: [], met: [`${m.independentCorrect} correct first-try answers`, `${m.spanDays} days of evidence`, "successful review"] };
  if (m.state === "review_due") return { headline: "Time for a quick review to keep this fresh. Your earlier progress is kept.", missing: [], met: [`Reached ${m.highestState}`] };
  met.push("Proficient: enough varied first-try answers");
  missing.push(...masteredGaps);
  return { headline: m.needsRecovery ? "A recent review slipped. One successful review gets this back on track." : "Next: mastered.", missing: m.needsRecovery ? ["a correct answer in your next review"] : missing, met };
}
