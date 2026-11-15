/**
 * Brief 10 product defaults. Every number here is an explicit, configurable PRODUCT choice made for this app:
 *
 *   - none of them is an ABRSM mark scheme, pass mark, paper length or time allowance (those cannot be confirmed from the syllabus
 *     documents this project holds, so none is claimed);
 *   - they are read once when an attempt starts and copied into that attempt (`prep_attempts.rubric`), so changing them later never
 *     rewrites the meaning of a result that has already been recorded;
 *   - `RUBRIC_VERSION` must be raised whenever a number here changes how an answer is scored or how a label is chosen.
 *
 * Rubric 2 (educational review of PR #18): unanswered mock questions count as not right for readiness; an attempt needs 90% of its questions answered;
 * "Consistently secure" needs EACH of the two newest attempts to reach the line, on different days.
 *
 * Teacher sign-off on all of these is still outstanding (docs/architecture/REVISION_PLACEMENT_EXAMS.md, "Decisions awaiting a teacher").
 */
export const RUBRIC_VERSION = 2;
/** Version of how a practice exam / placement check is composed from the curriculum (which outcomes, how many questions, how templates rotate). */
export const BLUEPRINT_VERSION = 1;

export interface PrepConfig {
  rubricVersion: number;
  blueprintVersion: number;
  exam: {
    /** Questions drawn for every syllabus outcome introduced at the grade. Two lets the report separate "slip" from "gap". */
    itemsPerOutcome: number;
    /** Extra questions that combine several ideas in one piece of notation (melodies, passages, scores). */
    scoreReadingItems: number;
    /** Product default for the optional timer. NOT an ABRSM duration. Total time = questions x this, plus any accommodation. */
    secondsPerQuestion: number;
    /** Extra time the learner may choose (a profile accommodation). Scoring never uses speed, so extra time costs nothing. */
    extraTimeChoices: number[];
    /** An answer arriving this long after the deadline is still accepted (network delay); later ones are refused. */
    graceSeconds: number;
  };
  placement: {
    /** Questions in each grade's probe. */
    probeItems: number;
    /** Highest grade probed: Grade 5 is the destination, so Grades 1-4 are its prerequisites. */
    probeGrades: number[];
    /** Fraction of a probe answered correctly to be "secure": the learner can start above this grade. */
    secureRatio: number;
    /** Fraction for "partial": worth a catch-up lesson, but not by itself a reason to start lower. */
    partialRatio: number;
  };
  readiness: {
    /** Share of the grade's outcomes that need independent evidence before any estimate is given. */
    minCoverage: number;
    /** Share of the paper's QUESTIONS that must have been answered for an attempt to count at all: an unanswered question scores nothing, so a mostly-blank paper is no evidence. */
    minAnsweredShare: number;
    /** Independent percentage for the "Consistently secure" label (`on_track`) (needs two qualifying mock attempts) and for "Developing". */
    onTrackPercent: number;
    developingPercent: number;
    /** Mock attempts, newest first, that the estimate looks at. */
    window: number;
    /** Qualifying attempts needed before "Consistently secure" can be shown. */
    minAttemptsForOnTrack: number;
    /** An outcome with this share of its independent questions right is "Right both times" (needs at least two). */
    outcomeMasteredRatio: number;
  };
  revision: {
    /** Pace used to turn "5 minutes" into a number of questions. */
    secondsPerQuestion: number;
    minMinutes: number;
    maxMinutes: number;
    defaultMinutes: number;
    /** Answered questions needed before finishing early still counts as a review session for the daily goal. */
    minAnsweredForCredit: number;
    /** Weak: this many wrong answers among the last `weakWindow` independent answers, or any lapse. */
    weakWrongInWindow: number;
    weakWindow: number;
  };
}

export const DEFAULT_PREP: PrepConfig = {
  rubricVersion: RUBRIC_VERSION,
  blueprintVersion: BLUEPRINT_VERSION,
  exam: { itemsPerOutcome: 2, scoreReadingItems: 4, secondsPerQuestion: 90, extraTimeChoices: [0, 25, 50, 100], graceSeconds: 5 },
  placement: { probeItems: 6, probeGrades: [1, 2, 3, 4], secureRatio: 0.8, partialRatio: 0.5 },
  readiness: { minCoverage: 0.8, minAnsweredShare: 0.9, onTrackPercent: 75, developingPercent: 55, window: 2, minAttemptsForOnTrack: 2, outcomeMasteredRatio: 1 },
  revision: { secondsPerQuestion: 40, minMinutes: 3, maxMinutes: 10, defaultMinutes: 5, minAnsweredForCredit: 5, weakWrongInWindow: 2, weakWindow: 5 },
};

/** Words that must accompany every practice exam, placement and readiness display. Never an ABRSM result. */
export const PREP_DISCLAIMER =
  "This is Music Theory Path's own practice assessment. It is not an ABRSM examination, it does not follow ABRSM's paper layout, marks or timings, and nothing here is an ABRSM result, a certificate or a prediction that you will pass.";
/**
 * Release gates: switches that decide what learners are SHOWN, kept apart from `PrepConfig` on purpose. The rubric is copied into every attempt and
 * versions what a result MEANS; a gate only controls display, so flipping it never changes, re-scores or discards any recorded evidence.
 *
 * `readiness` is OFF unless the deployment sets `MTP_SHOW_READINESS=teacher-approved`. It stays off until a teacher has approved the thresholds
 * and the question-quality corrections (docs/architecture/REVISION_PLACEMENT_EXAMS.md, "Readiness release gate"). While it is off the server
 * still records everything and still computes the estimate internally (`PrepService.readinessEvidence`), but never sends the label, the
 * percentage or the explanation to a client.
 */
export interface ReleaseGates {
  readiness: boolean;
}
export const DEFAULT_GATES: ReleaseGates = { readiness: false };
export function gatesFromEnv(env: Record<string, string | undefined> = process.env): ReleaseGates {
  return { readiness: env.MTP_SHOW_READINESS === "teacher-approved" };
}
/**
 * What the score-reading questions of Grades 2 and 3 actually ask. Their melody generator (`fam.score-observation`, shared with Grade 1) makes a
 * two-bar crotchet melody in 2/4, 3/4 or 4/4 and in a MAJOR key and asks three things; it never uses 2/2, 3/2, 4/2, 3/8, compound time, minor keys,
 * intervals or terms, although the Grade 2 and 3 syllabus (and the templates' scope) allow them. Until a teacher decides whether to broaden those
 * generators (docs/architecture/REVISION_PLACEMENT_EXAMS.md, "Grade 2 and 3 score reading"), the result says plainly what the section covered.
 * `prep-score-reading.test.ts` fails if the generators stop matching this text, so the label cannot drift from the questions.
 */
export const SCORE_READING_SKILLS: Record<number, string> = {
  2: "In Grade 2 these questions check three earlier skills on a short melody: counting crotchet beats in 2/4, 3/4 or 4/4, naming a note, and naming a major key from its key signature. They do not yet ask about 2/2, 3/2, 3/8, minor keys, intervals or terms, so they say little about those.",
  3: "In Grade 3 these questions check three earlier skills on a short melody: counting crotchet beats in 2/4, 3/4 or 4/4, naming a note, and naming a major key from its key signature. They do not yet ask about compound time, minor keys, intervals or terms, so they say little about those.",
};
export const READINESS_GATED_NOTE =
  "An estimate of readiness is not shown yet. It will appear once a teacher has reviewed how it is worked out and the practice questions. Your score, the topics to revise and your mock results below are unaffected, and every answer you give is kept.";
export const READINESS_NOTE =
  "An estimate from the independent questions you answered in mock examinations, without hints. It is our own guide to where to practise next, not an ABRSM result or a promise of a pass.";
