/**
 * Brief 10: placement checks and full-grade practice examinations.
 *
 * These reuse, and do not replace, the Brief 03-05 machinery: the same seeded generators inside the same taught-scope rules
 * (`NodeRunService.pick` / `taughtUnion`), the same graders (`gradeResponse`), the same idempotent client-command-id pattern, the same
 * question identity (`questionKey`) and the same exposure record. What is new is the PURPOSE, so the storage and rules are separate:
 *
 *   - Nothing here touches `lesson_progress`, XP, streaks, badges, `assessment_results` or `concept_mastery`. A practice exam or a
 *     placement can never complete a node, award a grade badge or move a mastery state. (docs/architecture/REVISION_PLACEMENT_EXAMS.md)
 *   - Modes. `mock` and `placement` are independent: no hints, the first answer is final, nothing is revealed until the attempt is
 *     closed. `practice` is for learning: hints, immediate feedback, retries. Only a mock answer to a question the learner had not
 *     already been shown with help can be independent evidence; the flag is decided by the SERVER from its own records.
 *   - Everything needed to reproduce and re-read a result is stored: seeds, template versions, generation fingerprints, raw responses,
 *     the rubric in force and its version, and the result summary (which is never recomputed, so old results keep their meaning).
 */
import { type ExerciseItem, type MusicScope } from "@mtp/curriculum";
import { generatorTemplateIds, hashString, parseGeneratedItemId, solutionFor } from "@mtp/engine";
import { localDate, type Clock } from "./clock.ts";
import type { Course, LearnerItem } from "./course.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";
import { gradeResponse, revealSolution, type Response } from "./grade.ts";
import { exposeItem, learnerTime } from "./mastery-service.ts";
import type { NodeRunService } from "./node-run.ts";
import { identityPrompt, questionKey, visibleKey } from "./question-key.ts";
import {
  LEVEL_LABEL,
  examBlueprint,
  gradeOutcomes,
  outcomeLevel,
  probeOutcomes,
  readiness,
  recommendPlacement,
  stageLevel,
  type ExamBlueprint,
  type OutcomeLevel,
  type ReadinessAttempt,
  type StageResult,
} from "./prep-blueprint.ts";
import { DEFAULT_GATES, DEFAULT_PREP, PREP_DISCLAIMER, READINESS_GATED_NOTE, READINESS_NOTE, SCORE_READING_SKILLS, type PrepConfig, type ReleaseGates } from "./prep-config.ts";

export type PrepMode = "practice" | "mock" | "placement";
export type PrepKind = "exam" | "placement";

export interface PlannedPrepItem {
  itemId: string;
  templateId: string;
  templateVersion: number;
  seed: number;
  fingerprint: string;
  sectionId: string;
  /** The outcome this question is counted under (the section's outcome; null in the score-reading section). */
  outcomeId: string | null;
  /** Every outcome of the grade the question touches (score-reading questions touch several). */
  outcomeIds: string[];
  conceptIds: string[];
  combined: boolean;
  /** The grade whose assessment node supplies the teaching scope this question is generated in. */
  scopeGrade: number;
  /** Placement: which probe (grade) the question belongs to. */
  stage?: number;
  questionKey: string;
  /**
   * What the learner sees, whatever the option order (`visibleKey`). Planned since the review of PR #26 (P1); papers planned earlier lack it
   * and it is then derived from the question when needed. Help recorded under either identity makes the question coached.
   */
  visibleKey?: string;
  /** True when the learner had already been shown this question (under either identity) with help or with its answer: it can never be independent evidence. */
  coached: boolean;
}

interface AttemptRow {
  id: string;
  kind: PrepKind;
  mode: PrepMode;
  grade: number | null;
  status: "open" | "complete" | "abandoned";
  seed: number;
  timed: number;
  extra_time_percent: number;
  time_limit_seconds: number | null;
  deadline_at: string | null;
  started_at: string;
  completed_at: string | null;
  curriculum_version: string;
  blueprint_version: number;
  rubric_version: number;
  items: string;
  rubric: string;
  summary: string | null;
}

export interface ReviewEntry {
  index: number;
  itemId: string;
  outcomeId: string | null;
  /** Concepts the question exercised: where a missed question sends the learner (lessons, revision, the weak-topic flag). */
  conceptIds: string[];
  section: string;
  prompt: string;
  answered: boolean;
  correct: boolean;
  independent: boolean;
  /** "Why" in the student's terms: the family's own explanation of the mistake, then the rule that was broken. */
  explanation: { label: string; tip: string } | null;
  message: string | null;
  reason: string | null;
  solution: string | null;
}

export interface OutcomeResult {
  outcomeId: string;
  statement: string;
  domain: string;
  asked: number;
  answered: number;
  correct: number;
  independentAsked: number;
  independentCorrect: number;
  level: OutcomeLevel;
  levelLabel: string;
  /** What the learner showed WITHOUT counting independence: the practice-mode view of the same questions. */
  practiceLevel: OutcomeLevel;
  revisit: string[];
}

export interface ExamSummary {
  kind: "exam";
  label: "Practice assessment";
  mode: "practice" | "mock";
  grade: number;
  timed: boolean;
  timeLimitSeconds: number | null;
  timeTakenSeconds: number;
  timedOut: boolean;
  rubricVersion: number;
  blueprintVersion: number;
  curriculumVersion: string;
  questions: number;
  answered: number;
  score: number;
  percent: number;
  independentQuestions: number;
  independentCorrect: number;
  independentPercent: number | null;
  /** Questions in this attempt the learner had already seen with help, so they are scored but not counted as independent. */
  coachedQuestions: number;
  hintsUsed: number;
  outcomes: OutcomeResult[];
  outcomesTotal: number;
  outcomesAssessed: number;
  notAssessed: string[];
  /** `skills`: what these questions really cover where that is narrower than the syllabus (Grades 2 and 3); absent in results stored before it existed. */
  scoreReading: { questions: number; correct: number; outcomes: string[]; skills?: string | null };
  mistakes: Array<{ category: string; label: string; tip: string; count: number }>;
  review: ReviewEntry[];
  recommendations: Array<{ kind: "lesson" | "revision"; title: string; nodeId?: string; conceptId?: string; why: string }>;
  disclaimer: string;
  completedAt: string;
}

export interface PlacementSummary {
  kind: "placement";
  label: "Placement check";
  rubricVersion: number;
  blueprintVersion: number;
  curriculumVersion: string;
  questions: number;
  answered: number;
  recommendedGrade: number;
  decidedBy: number | null;
  allSecure: boolean;
  stages: Array<{ grade: number; asked: number; correct: number; level: "secure" | "partial" | "weak" }>;
  notAssessed: number[];
  /** Outcomes of the grades the check covered that it did not ask about. */
  notChecked: Array<{ grade: number; statements: string[] }>;
  gaps: Array<{ outcomeId: string; statement: string; grade: number; kind: "start-here" | "catch-up"; lessons: Array<{ nodeId: string; title: string }> }>;
  explanation: string;
  disclaimer: string;
  completedAt: string;
}

/**
 * What a question ASKS, ignoring how its options happen to be shuffled: the prompt, the music and the correct answer's wording. Two questions with the
 * same content key are the same question to a learner ("Which rest lasts as long as a quaver?" twice), however different their option order.
 */
export function contentKey(item: ExerciseItem): string {
  const a = item.answer as { kind: string; options?: Array<{ id: string; label: string }>; correctOptionIds?: string[] };
  const correct = a.options && a.correctOptionIds ? a.options.filter((o) => a.correctOptionIds!.includes(o.id)).map((o) => o.label).sort() : a;
  return `c:${JSON.stringify([identityPrompt(item), item.music ?? null, (item as { score?: unknown }).score ?? null, correct])}`;
}

const seedOf = (...parts: Array<string | number>) => (hashString(parts.join("|")) >>> 0) % 2 ** 31;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 2 ** 31;

export class PrepService {
  private generatable: Set<string>;
  private categories = new Map<string, { label: string; tip: string }>();

  constructor(
    private db: Db,
    private course: Course,
    private clock: Clock,
    private nodes: NodeRunService,
    readonly cfg: PrepConfig = DEFAULT_PREP,
    /** Called just before a NEW paper or check is planned (never when an open one is resumed): planning runs on the server's one thread, so it is rationed. */
    private admit: (userId: string) => void = () => undefined,
    /** What learners may be shown (see `ReleaseGates`). Default: no readiness classification. */
    readonly gates: ReleaseGates = DEFAULT_GATES,
  ) {
    // No audio is ever required (every family is answerable without sound), but a template that listened would be excluded here regardless:
    // a learner with sound off or hearing loss must never lose marks. (A test asserts this set equals the full generatable set today.)
    this.generatable = new Set(generatorTemplateIds(course.ix).filter((t) => course.ix.templates.get(t)?.mode !== "listen-identify"));
    for (const f of course.ix.families.values()) for (const m of f.mistakeCategories) if (!this.categories.has(m.id)) this.categories.set(m.id, { label: m.description, tip: m.feedback });
  }

  // ---- blueprints and planning ---------------------------------------------------------------------------------------

  blueprint(grade: number): ExamBlueprint {
    return examBlueprint(this.course, grade, this.cfg, this.generatable);
  }

  private gradeNode(grade: number) {
    const n = this.course.ix.nodeById.get(`G${grade}-A`);
    if (!n) throw new ApiError(404, "not_found", "That grade has no practice examination.");
    return n;
  }

  /** Question identities the learner has been shown WITH help or with the answer: hints, guided steps, reveals, other practice exams' feedback. */
  private helpedKeys(userId: string): Set<string> {
    const keys = new Set<string>();
    const add = (sql: string) => {
      for (const r of this.db.prepare(sql).all(userId) as Array<{ k: string }>) keys.add(r.k);
    };
    add("SELECT question_key AS k FROM question_exposure WHERE user_id = ?");
    add("SELECT visible_key AS k FROM question_exposure WHERE user_id = ? AND visible_key IS NOT NULL");
    add("SELECT DISTINCT question_key AS k FROM mastery_evidence WHERE user_id = ? AND source IN ('guided-step','hinted-step','retry-after-reveal','remedial-step')");
    add("SELECT DISTINCT visible_key AS k FROM mastery_evidence WHERE user_id = ? AND visible_key IS NOT NULL AND source IN ('guided-step','hinted-step','retry-after-reveal','remedial-step')");
    for (const r of this.db.prepare("SELECT items FROM prep_attempts WHERE user_id = ? AND status = 'complete'").all(userId) as Array<{ items: string }>) {
      for (const it of JSON.parse(r.items) as PlannedPrepItem[]) {
        keys.add(it.questionKey);
        if (it.visibleKey) keys.add(it.visibleKey);
      }
    }
    return keys;
  }
  /** Every identity the learner has met in independent work, so a new attempt prefers questions that are new to them. */
  private metKeys(userId: string): Set<string> {
    const keys = new Set<string>();
    for (const r of this.db.prepare("SELECT DISTINCT question_key AS k, visible_key AS v FROM mastery_evidence WHERE user_id = ?").all(userId) as Array<{ k: string; v: string | null }>) {
      keys.add(r.k);
      if (r.v) keys.add(r.v);
    }
    for (const r of this.db.prepare("SELECT items FROM prep_attempts WHERE user_id = ?").all(userId) as Array<{ items: string }>) {
      for (const it of JSON.parse(r.items) as PlannedPrepItem[]) {
        keys.add(it.questionKey);
        if (it.visibleKey) keys.add(it.visibleKey);
      }
    }
    return keys;
  }

  /**
   * One question for a section: rotate through the section's templates (rotation depends on the attempt seed, so two attempts differ in
   * which templates come up as well as in the music), walk seeds for one that is new to this attempt and, where possible, to the learner.
   */
  private planOne(userId: string, section: { id: string; outcomeId: string | null; templateIds: string[]; combined: boolean }, index: number, scopeGrade: number, attemptSeed: number, used: Set<string>, avoid: Set<string>, helped: Set<string>, stage?: number): PlannedPrepItem | null {
    const node = this.gradeNode(scopeGrade);
    const outcome = section.outcomeId;
    const wanted = new Set(outcome ? [...this.course.ix.concepts.values()].filter((c) => c.outcomeIds.includes(outcome)).map((c) => c.id) : []);
    const shift = (seedOf(attemptSeed, section.id) + index) % Math.max(1, section.templateIds.length);
    const order = [...section.templateIds.slice(shift), ...section.templateIds.slice(0, shift)];
    for (const t of order) {
      const scope = this.nodes.taughtUnion(t, node);
      if (!scope) continue;
      const accept = (it: ExerciseItem) => {
        // The picker already refuses a question that LOOKS like one on this paper (`visibleKey`); a question with the same identity (same music and
        // answer) under different surface details is refused here too, so no paper can ask the same thing twice.
        if (used.has(`q:${questionKey(it)}`) || used.has(contentKey(it))) return false;
        const credited = this.nodes.creditedConcepts(it, node);
        return outcome ? credited.some((c) => wanted.has(c)) : credited.length > 0;
      };
      const got = this.nodes.pick(t, scope, seedOf(attemptSeed, section.id, index, t), avoid, used, accept);
      if (!got) continue;
      const g = parseGeneratedItemId(got.item.id);
      if (!g) continue;
      const credited = this.nodes.creditedConcepts(got.item, node);
      // Cumulative: a Grade 3 melody question may rest on Grade 1 and 2 ideas, and the report says which outcomes it touched.
      const gradeOutcomeIds = new Set([...this.course.ix.outcomes.values()].filter((o) => o.grade <= scopeGrade).map((o) => o.id));
      const outcomeIds = [...new Set(credited.flatMap((c) => this.course.ix.concepts.get(c)?.outcomeIds ?? []).filter((o) => gradeOutcomeIds.has(o)))];
      const key = questionKey(got.item);
      const visible = visibleKey(got.item);
      used.add(visible);
      used.add(`q:${key}`);
      used.add(contentKey(got.item));
      return {
        itemId: got.item.id,
        templateId: got.item.templateId,
        templateVersion: got.item.templateVersion,
        seed: got.seed,
        fingerprint: g.fingerprint,
        sectionId: section.id,
        outcomeId: outcome,
        outcomeIds: outcome ? [outcome] : outcomeIds,
        conceptIds: credited,
        combined: section.combined,
        scopeGrade,
        ...(stage !== undefined ? { stage } : {}),
        questionKey: key,
        visibleKey: visible,
        coached: helped.has(key) || helped.has(visible),
      };
    }
    return null;
  }

  planExam(userId: string, grade: number, attemptSeed: number): PlannedPrepItem[] {
    const bp = this.blueprint(grade);
    if (bp.uncovered.length) throw new ApiError(503, "generation_failed", "This practice examination is not ready yet.");
    const used = new Set<string>();
    const avoid = new Set([...this.metKeys(userId), ...this.helpedKeys(userId)]);
    const helped = this.helpedKeys(userId);
    const items: PlannedPrepItem[] = [];
    for (const s of bp.sections) {
      for (let i = 0; i < s.itemCount; i++) {
        const it = this.planOne(userId, s, i, grade, attemptSeed, used, avoid, helped);
        if (!it) throw new ApiError(503, "generation_failed", "We couldn't make a complete set of questions just now. Please try again.");
        items.push(it);
      }
    }
    return items;
  }

  /** The questions for one placement probe (one grade). */
  planProbe(userId: string, grade: number, attemptSeed: number, alreadyUsed: Set<string>, cfg: PrepConfig = this.cfg): PlannedPrepItem[] {
    const picks = probeOutcomes(this.course, grade, cfg.placement.probeItems, this.generatable);
    const avoid = new Set([...this.metKeys(userId), ...this.helpedKeys(userId)]);
    const helped = this.helpedKeys(userId);
    const bp = this.blueprint(grade);
    const out: PlannedPrepItem[] = [];
    for (const o of picks) {
      const section = bp.sections.find((s) => s.outcomeId === o.id)!;
      const it = this.planOne(userId, { ...section, id: `p${grade}:${o.id}` }, 0, grade, attemptSeed, alreadyUsed, avoid, helped, grade);
      if (it) out.push(it);
    }
    if (!out.length) throw new ApiError(503, "generation_failed", "We couldn't make a set of questions just now. Please try again.");
    return out;
  }

  // ---- reading rows ---------------------------------------------------------------------------------------------------

  private row(userId: string, id: string): AttemptRow {
    const r = this.db.prepare("SELECT * FROM prep_attempts WHERE user_id = ? AND id = ?").get(userId, id) as AttemptRow | undefined;
    // The learner id is part of every lookup, so another account's attempt is indistinguishable from one that does not exist.
    if (!r) throw new ApiError(404, "not_found", "That attempt does not exist.");
    return r;
  }

  private resolve(si: PlannedPrepItem): { item: ExerciseItem; scope: MusicScope } | null {
    const node = this.course.ix.nodeById.get(`G${si.scopeGrade}-A`);
    const scope = node && this.nodes.taughtUnion(si.templateId, node);
    if (!scope) return null;
    const item = this.nodes.gen(si.templateId, si.seed, scope, { version: si.templateVersion, fingerprint: si.fingerprint });
    return item ? { item, scope } : null;
  }

  private responses(userId: string, attemptId: string) {
    const rows = this.db.prepare("SELECT item_id, correct, attempt_number, hints_used, mistake_category, response FROM prep_responses WHERE user_id = ? AND attempt_id = ? ORDER BY attempt_number").all(userId, attemptId) as Array<{ item_id: string; correct: number; attempt_number: number; hints_used: number; mistake_category: string | null; response: string }>;
    const by = new Map<string, { attempts: number; correct: boolean; firstCorrect: boolean; hints: number; firstCategory: string | null }>();
    for (const r of rows) {
      const s = by.get(r.item_id) ?? { attempts: 0, correct: false, firstCorrect: false, hints: 0, firstCategory: null };
      s.attempts = Math.max(s.attempts, r.attempt_number);
      s.hints = Math.max(s.hints, r.hints_used);
      if (r.correct) s.correct = true;
      if (r.attempt_number === 1) {
        s.firstCorrect = r.correct === 1 && r.hints_used === 0;
        s.firstCategory = r.mistake_category;
      }
      by.set(r.item_id, s);
    }
    return by;
  }

  private hintCount(userId: string, attemptId: string, itemId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM prep_hint_uses WHERE user_id = ? AND attempt_id = ? AND item_id = ?").get(userId, attemptId, itemId) as { c: number }).c;
  }

  private rubricOf(row: AttemptRow) {
    return JSON.parse(row.rubric) as PrepConfig;
  }

  private timing(row: AttemptRow) {
    const now = this.clock.now();
    const deadline = row.deadline_at ? new Date(row.deadline_at) : null;
    return {
      timed: row.timed === 1,
      limitSeconds: row.time_limit_seconds,
      extraTimePercent: row.extra_time_percent,
      deadlineAt: row.deadline_at,
      serverNow: now.toISOString(),
      remainingSeconds: deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000)) : null,
      expired: Boolean(deadline) && row.status === "open" && now.getTime() > deadline!.getTime(),
    };
  }

  // ---- starting --------------------------------------------------------------------------------------------------------

  /** Start (or resume) a practice examination. Idempotent: an open attempt for the same grade and mode is returned, on any device. */
  startExam(userId: string, grade: number, opts: { mode: "practice" | "mock"; timed?: boolean; extraTimePercent?: number; seed?: number }) {
    if (!Number.isInteger(grade) || grade < 1 || grade > 5) throw new ApiError(404, "not_found", "That grade has no practice examination.");
    if (opts.timed && opts.mode !== "mock") throw new ApiError(400, "bad_request", "Only a mock examination can be timed. Practice mode is untimed, so you can read the explanations.");
    const extra = opts.extraTimePercent ?? 0;
    if (!this.cfg.exam.extraTimeChoices.includes(extra)) throw new ApiError(400, "bad_request", "Choose one of the offered extra-time options.");
    const t = this.clock.now().toISOString();
    const id = tx(this.db, () => {
      const open = this.db.prepare("SELECT id FROM prep_attempts WHERE user_id = ? AND kind = 'exam' AND grade = ? AND mode = ? AND status = 'open'").get(userId, grade, opts.mode) as { id: string } | undefined;
      if (open) return open.id;
      this.admit(userId);
      const seed = opts.seed ?? newSeed();
      const items = this.planExam(userId, grade, seed);
      const limit = opts.timed ? Math.ceil(items.length * this.cfg.exam.secondsPerQuestion * (1 + extra / 100)) : null;
      const deadline = limit ? new Date(this.clock.now().getTime() + limit * 1000).toISOString() : null;
      const newId = crypto.randomUUID();
      this.db
        .prepare("INSERT INTO prep_attempts (user_id,id,kind,mode,grade,status,seed,timed,extra_time_percent,time_limit_seconds,deadline_at,started_at,curriculum_version,blueprint_version,rubric_version,items,rubric) VALUES (?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?,?,?)")
        .run(userId, newId, "exam", opts.mode, grade, seed, opts.timed ? 1 : 0, extra, limit, deadline, t, this.course.version, this.cfg.blueprintVersion, this.cfg.rubricVersion, JSON.stringify(items), JSON.stringify(this.cfg));
      return newId;
    });
    return this.view(userId, id);
  }

  startPlacement(userId: string, seed?: number) {
    const t = this.clock.now().toISOString();
    const id = tx(this.db, () => {
      const open = this.db.prepare("SELECT id FROM prep_attempts WHERE user_id = ? AND kind = 'placement' AND status = 'open'").get(userId) as { id: string } | undefined;
      if (open) return open.id;
      this.admit(userId);
      const s = seed ?? newSeed();
      const first = this.cfg.placement.probeGrades[0]!;
      const items = this.planProbe(userId, first, s, new Set());
      const newId = crypto.randomUUID();
      this.db
        .prepare("INSERT INTO prep_attempts (user_id,id,kind,mode,grade,status,seed,timed,extra_time_percent,started_at,curriculum_version,blueprint_version,rubric_version,items,rubric) VALUES (?,?,'placement','placement',NULL,'open',?,0,0,?,?,?,?,?,?)")
        .run(userId, newId, s, t, this.course.version, this.cfg.blueprintVersion, this.cfg.rubricVersion, JSON.stringify(items), JSON.stringify(this.cfg));
      return newId;
    });
    return this.view(userId, id);
  }

  // ---- the learner's view ---------------------------------------------------------------------------------------------

  /** The attempt as the learner sees it: questions without answers, what has been answered, the clock. A closed attempt carries its stored summary. */
  view(userId: string, attemptId: string) {
    const row = this.row(userId, attemptId);
    const planned = JSON.parse(row.items) as PlannedPrepItem[];
    const by = this.responses(userId, attemptId);
    const showSections = row.mode === "practice";
    const bp = row.kind === "exam" ? this.blueprint(row.grade!) : null;
    const titleOf = new Map((bp?.sections ?? []).map((s) => [s.id, s.statement]));
    let stale = false;
    const items = row.status === "open"
      ? planned.flatMap((si) => {
          const r = this.resolve(si);
          if (!r) {
            stale = true;
            return [];
          }
          const a = by.get(si.itemId);
          const learner: LearnerItem = { ...this.course.learnerItem(r.item, "practice", r.scope), evidence: "independent", hintCount: row.mode === "practice" ? r.item.hints.length : 0 };
          return [{ item: learner, section: showSections ? (titleOf.get(si.sectionId) ?? null) : null, answered: Boolean(a?.attempts), correct: row.mode === "practice" ? Boolean(a?.correct) : false, attempts: a?.attempts ?? 0, hintsUsed: a?.hints ?? 0 }];
        })
      : [];
    if (stale && row.status === "open") {
      // A generator or template changed under an open attempt. Nothing is regraded against different music: the attempt is closed as
      // abandoned (its answers stay on record) and the learner is told to start again.
      this.db.prepare("UPDATE prep_attempts SET status = 'abandoned', completed_at = ? WHERE user_id = ? AND id = ? AND status = 'open'").run(this.clock.now().toISOString(), userId, attemptId);
      throw new ApiError(409, "stale_items", "These questions were updated while you were away, so this attempt was closed. Start a new one.");
    }
    return {
      id: row.id,
      kind: row.kind,
      mode: row.mode,
      grade: row.grade,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      firstAttemptOnly: row.mode !== "practice",
      timing: this.timing(row),
      blueprintVersion: row.blueprint_version,
      rubricVersion: row.rubric_version,
      items,
      /** Placement only: whether the check may still grow (more probes follow while the learner keeps showing secure understanding). */
      mayGrow: row.kind === "placement" && row.status === "open",
      summary: row.summary ? (JSON.parse(row.summary) as ExamSummary | PlacementSummary) : null,
      disclaimer: PREP_DISCLAIMER,
    };
  }

  // ---- answering ----------------------------------------------------------------------------------------------------------

  hint(userId: string, attemptId: string, itemId: string, level: number) {
    const row = this.row(userId, attemptId);
    if (row.status !== "open") throw new ApiError(409, "session_closed", "This attempt has finished.");
    if (row.mode !== "practice") throw new ApiError(409, "no_hints", "Hints are not available here: this is where you show what you know on your own.");
    const si = (JSON.parse(row.items) as PlannedPrepItem[]).find((i) => i.itemId === itemId);
    const r = si && this.resolve(si);
    if (!si || !r) throw new ApiError(404, "not_found", "Unknown question.");
    if (level < 1 || level > r.item.hints.length) throw new ApiError(400, "bad_request", "No such hint.");
    const at = this.clock.now().toISOString();
    tx(this.db, () => {
      this.db.prepare("INSERT OR IGNORE INTO prep_hint_uses (user_id,attempt_id,item_id,level,created_at) VALUES (?,?,?,?,?)").run(userId, attemptId, itemId, level, at);
      exposeItem(this.db, userId, r.item, "practice-hint", at);
    });
    return { hint: r.item.hints[level - 1]!, level };
  }

  /** Grade server-side and record. Replaying the same command id returns what was stored and records nothing new. */
  answer(userId: string, attemptId: string, commandId: string, itemId: string, response: Response) {
    const row = this.row(userId, attemptId);
    const blind = row.mode !== "practice";
    const prior = this.db.prepare("SELECT attempt_id, item_id, response, correct, mistake_category, attempt_number FROM prep_responses WHERE user_id = ? AND id = ?").get(userId, commandId) as
      | { attempt_id: string; item_id: string; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    if (prior) {
      if (prior.attempt_id !== attemptId || prior.item_id !== itemId || prior.response !== JSON.stringify(response)) throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      return this.answerReply(userId, row, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, null);
    }
    if (row.status !== "open") throw new ApiError(409, "session_closed", "This attempt has finished.");
    if (row.deadline_at && this.clock.now().getTime() > new Date(row.deadline_at).getTime() + this.cfg.exam.graceSeconds * 1000) {
      throw new ApiError(409, "time_up", "Time is up. Your earlier answers are saved: finish to see your result.");
    }
    const si = (JSON.parse(row.items) as PlannedPrepItem[]).find((i) => i.itemId === itemId);
    const r = si && this.resolve(si);
    if (!si || !r) throw new ApiError(404, "not_found", "Unknown question.");
    const graded = gradeResponse(this.course.ix, r.item, response, r.scope);
    const lt = learnerTime(this.db, this.clock, userId);
    const out = tx(this.db, () => {
      const cur = this.row(userId, attemptId);
      if (cur.status !== "open") throw new ApiError(409, "session_closed", "This attempt has finished.");
      const n = (this.db.prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM prep_responses WHERE user_id = ? AND attempt_id = ? AND item_id = ?").get(userId, attemptId, itemId) as { n: number }).n + 1;
      if (n > 1 && blind) throw new ApiError(409, "already_answered", "You've already answered this question. Your first answer counts.");
      const hints = this.hintCount(userId, attemptId, itemId);
      this.db
        .prepare("INSERT INTO prep_responses (user_id,id,attempt_id,item_id,template_id,template_version,seed,response,correct,mistake_category,hints_used,attempt_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(userId, commandId, attemptId, itemId, si.templateId, si.templateVersion, si.seed, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, hints, n, lt.iso);
      // Practice mode shows feedback, so the question is now one the learner has seen with help: it can never again be fresh independent evidence.
      if (!blind) exposeItem(this.db, userId, r.item, "practice-attempt", lt.iso);
      const more = row.kind === "placement" ? this.advancePlacement(userId, cur) : false;
      return { n, more };
    });
    return this.answerReply(userId, row, graded.correct, graded.category, out.n, false, { graded, item: r.item, scope: r.scope, more: out.more });
  }

  private answerReply(userId: string, row: AttemptRow, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, live: { graded: ReturnType<typeof gradeResponse>; item: ExerciseItem; scope: MusicScope; more: boolean } | null) {
    // Independent attempts never say whether an answer was right: only that it was saved (and how many questions there are now,
    // because a placement check can grow).
    if (row.mode !== "practice") return { recorded: true as const, replayed, attemptNumber, itemsPlanned: (JSON.parse(this.row(userId, row.id).items) as unknown[]).length };
    // Practice: the verdict, why, and (after repeated misses) the worked answer.
    const graded = live?.graded;
    const solution = live ? revealSolution(this.course.ix, live.item, live.scope, correct, attemptNumber) : undefined;
    return {
      recorded: true as const,
      correct,
      category,
      message: graded?.message ?? "",
      reason: correct ? null : (graded?.reason ?? null),
      ...(graded?.marks ? { marks: graded.marks } : {}),
      ...(graded?.parts ? { parts: graded.parts.map((p) => ({ id: p.id, correct: p.correct, reason: p.reason })) } : {}),
      ...(solution ? { solution } : {}),
      attemptNumber,
      replayed,
    };
  }

  /** Placement only: when the newest probe has been fully answered and was secure, plan the next grade's probe. Returns whether questions were added. */
  private advancePlacement(userId: string, row: AttemptRow): boolean {
    const items = JSON.parse(row.items) as PlannedPrepItem[];
    const stages = [...new Set(items.map((i) => i.stage!))].sort((a, b) => a - b);
    const last = stages[stages.length - 1]!;
    const by = this.responses(userId, row.id);
    const mine = items.filter((i) => i.stage === last);
    if (!mine.every((i) => by.get(i.itemId)?.attempts)) return false;
    const correct = mine.filter((i) => by.get(i.itemId)?.firstCorrect).length;
    // The attempt's OWN rubric, as stored when it began: the lines and the grades in force at the start decide every step of it, so a change to the defaults
    // while a check is open can neither stop it early nor change what it recommends.
    const cfg = this.rubricOf(row);
    if (stageLevel({ asked: mine.length, correct }, cfg) !== "secure") return false;
    const next = cfg.placement.probeGrades.find((g) => g > last);
    if (!next) return false;
    const more = this.planProbe(userId, next, row.seed, new Set(items.map((i) => i.questionKey)), cfg);
    this.db.prepare("UPDATE prep_attempts SET items = ? WHERE user_id = ? AND id = ?").run(JSON.stringify([...items, ...more]), userId, row.id);
    return true;
  }

  // ---- finishing ----------------------------------------------------------------------------------------------------------

  /**
   * Close the attempt and store its summary. ONE transaction; repeating the call returns what was committed. An untimed attempt finishes only
   * when every question has an answer, unless the learner explicitly chooses to finish early (`allowUnanswered`): unanswered questions then
   * count as not answered and are reported as "not yet assessed". A timed attempt past its deadline always finishes.
   */
  complete(userId: string, attemptId: string, opts: { allowUnanswered?: boolean } = {}) {
    return tx(this.db, () => {
      const row = this.row(userId, attemptId);
      if (row.status === "complete") return { ...(JSON.parse(row.summary!) as ExamSummary | PlacementSummary), alreadyComplete: true };
      if (row.status !== "open") throw new ApiError(409, "session_closed", "This attempt was closed. Start a new one.");
      const planned = JSON.parse(row.items) as PlannedPrepItem[];
      if (planned.some((si) => !this.resolve(si))) throw new ApiError(409, "stale_items", "These questions were updated before you finished. Start a new attempt.");
      const by = this.responses(userId, attemptId);
      const timing = this.timing(row);
      const missing = planned.filter((si) => !by.get(si.itemId)?.attempts).map((si) => si.itemId);
      if (missing.length && !timing.expired && !opts.allowUnanswered) throw new ApiError(409, "incomplete", "Some questions still need an answer.", { missing });
      const at = this.clock.now().toISOString();
      const summary = row.kind === "exam" ? this.summariseExam(userId, row, planned, by, at, timing.expired) : this.summarisePlacement(userId, row, planned, by, at);
      this.db.prepare("UPDATE prep_attempts SET status = 'complete', completed_at = ?, summary = ? WHERE user_id = ? AND id = ?").run(at, JSON.stringify(summary), userId, attemptId);
      return { ...summary, alreadyComplete: false };
    });
  }

  /** Leave an attempt without a result. Its answers stay on record and are never counted as evidence. Idempotent. */
  abandon(userId: string, attemptId: string) {
    const row = this.row(userId, attemptId);
    if (row.status === "open") this.db.prepare("UPDATE prep_attempts SET status = 'abandoned', completed_at = ? WHERE user_id = ? AND id = ?").run(this.clock.now().toISOString(), userId, attemptId);
    return { ok: true as const, status: this.row(userId, attemptId).status };
  }

  /** The lesson that teaches each of these concepts (the first playable one), de-duplicated: where to send a learner who missed THAT question, not the outcome's first lesson. */
  private lessonsForConcepts(conceptIds: string[], limit = 2): Array<{ nodeId: string; title: string }> {
    const out: Array<{ nodeId: string; title: string }> = [];
    for (const c of conceptIds) {
      const n = (this.course.ix.conceptTaughtBy.get(c) ?? []).find((x) => x.type === "lesson" && this.course.isPlayable(x.id));
      if (n && !out.some((o) => o.nodeId === n.id)) out.push({ nodeId: n.id, title: n.title });
      if (out.length >= limit) break;
    }
    return out;
  }
  /** The concepts of the questions the learner did not get right in an outcome, most specific first: those that belong to the outcome itself, then any other credited. */
  private missedConcepts(items: PlannedPrepItem[], outcomeId: string | null): string[] {
    const own = new Set(outcomeId ? [...this.course.ix.concepts.values()].filter((c) => c.outcomeIds.includes(outcomeId)).map((c) => c.id) : []);
    const mine = items.flatMap((i) => i.conceptIds);
    return [...new Set([...mine.filter((c) => own.has(c)), ...mine])];
  }

  private lessonsFor(outcomeId: string, limit = 2): Array<{ nodeId: string; title: string }> {
    const nodes = (this.course.ix.outcomeTaughtBy.get(outcomeId) ?? []).filter((n) => this.course.isPlayable(n.id) && n.type === "lesson").slice(0, limit);
    return nodes.map((n) => ({ nodeId: n.id, title: n.title }));
  }

  /** The paper's questions the learner had been shown with help (or with the answer) by the time they answered them: the planning-time flag plus everything recorded since. */
  private coachedItems(userId: string, attemptId: string, planned: PlannedPrepItem[], mock: boolean): Set<string> {
    const out = new Set(planned.filter((i) => i.coached).map((i) => i.itemId));
    if (!mock) return out;
    const answeredAt = new Map((this.db.prepare("SELECT item_id, created_at FROM prep_responses WHERE user_id = ? AND attempt_id = ? AND attempt_number = 1").all(userId, attemptId) as Array<{ item_id: string; created_at: string }>).map((r) => [r.item_id, r.created_at]));
    // The earliest moment each question identity was shown with help, from every record of help the learner has.
    const helpedAt = new Map<string, string>();
    const note = (k: string, at: string) => {
      if (!helpedAt.has(k) || helpedAt.get(k)! > at) helpedAt.set(k, at);
    };
    // Every identity of every record of help (review of PR #26, P1): practice can show a question with its options reordered, which the historical
    // identity of an older template distinguishes but the learner does not.
    for (const r of this.db.prepare("SELECT question_key AS k, visible_key AS v, occurred_at AS at FROM question_exposure WHERE user_id = ?").all(userId) as Array<{ k: string; v: string | null; at: string }>) {
      note(r.k, r.at);
      if (r.v) note(r.v, r.at);
    }
    for (const r of this.db.prepare("SELECT question_key AS k, visible_key AS v, occurred_at AS at FROM mastery_evidence WHERE user_id = ? AND source IN ('guided-step','hinted-step','retry-after-reveal','remedial-step')").all(userId) as Array<{ k: string; v: string | null; at: string }>) {
      note(r.k, r.at);
      if (r.v) note(r.v, r.at);
    }
    for (const r of this.db.prepare("SELECT items, completed_at AS at FROM prep_attempts WHERE user_id = ? AND status = 'complete' AND id <> ?").all(userId, attemptId) as Array<{ items: string; at: string }>) {
      for (const it of JSON.parse(r.items) as PlannedPrepItem[]) {
        note(it.questionKey, r.at);
        if (it.visibleKey) note(it.visibleKey, r.at);
      }
    }
    const earliest = (a?: string, b?: string) => (a === undefined ? b : b === undefined ? a : a < b ? a : b);
    for (const si of planned) {
      // A paper planned before visible identities existed: derive it from the question (still reproducible from its stored seed).
      const visible = si.visibleKey ?? (() => {
        const r = this.resolve(si);
        return r ? visibleKey(r.item) : undefined;
      })();
      const h = earliest(helpedAt.get(si.questionKey), visible ? helpedAt.get(visible) : undefined);
      const a = answeredAt.get(si.itemId);
      if (h !== undefined && (a === undefined || h <= a)) out.add(si.itemId);
    }
    return out;
  }

  private summariseExam(userId: string, row: AttemptRow, planned: PlannedPrepItem[], by: ReturnType<PrepService["responses"]>, at: string, timedOut: boolean): ExamSummary {
    const cfg = this.rubricOf(row);
    const grade = row.grade!;
    const mock = row.mode === "mock";
    const bp = this.blueprint(grade);
    // Help can arrive AFTER the paper was planned (hints and feedback in the practice lab, a practice exam, a lesson). A question the learner was shown with help
    // at or before the moment they answered it is coached whatever the planning-time flag said; help that came after the answer does not change it.
    const coachedIds = this.coachedItems(userId, row.id, planned, mock);
    const independentOf = (si: PlannedPrepItem) => mock && !coachedIds.has(si.itemId) && Boolean(by.get(si.itemId)?.attempts) && (by.get(si.itemId)?.hints ?? 0) === 0;
    const firstOk = (si: PlannedPrepItem) => Boolean(by.get(si.itemId)?.firstCorrect);
    const outcomes: OutcomeResult[] = [];
    for (const s of bp.sections.filter((x) => x.outcomeId)) {
      const mine = planned.filter((i) => i.outcomeId === s.outcomeId);
      const independentAsked = mine.filter(independentOf).length;
      const independentCorrect = mine.filter((i) => independentOf(i) && firstOk(i)).length;
      const answered = mine.filter((i) => by.get(i.itemId)?.attempts).length;
      const correct = mine.filter(firstOk).length;
      const level = outcomeLevel(independentAsked, independentCorrect, cfg);
      outcomes.push({
        outcomeId: s.outcomeId!,
        statement: s.statement,
        domain: s.domain,
        asked: mine.length,
        answered,
        correct,
        independentAsked,
        independentCorrect,
        level,
        levelLabel: LEVEL_LABEL[level],
        practiceLevel: outcomeLevel(answered, correct, cfg),
        // Send the learner to the lesson for what they actually missed; only when nothing specific is known, to the outcome's own first lessons.
        revisit: (this.lessonsForConcepts(this.missedConcepts(mine.filter((i) => !firstOk(i)), s.outcomeId), 2).length ? this.lessonsForConcepts(this.missedConcepts(mine.filter((i) => !firstOk(i)), s.outcomeId), 2) : this.lessonsFor(s.outcomeId!)).map((l) => l.nodeId),
      });
    }
    const reading = planned.filter((i) => i.combined);
    const score = planned.filter(firstOk).length;
    const answered = planned.filter((i) => by.get(i.itemId)?.attempts).length;
    // For readiness every question that could have been independent evidence counts, answered or not: an unanswered question scores nothing.
    const indep = planned.filter((si) => mock && !coachedIds.has(si.itemId));
    const independentCorrect = indep.filter((si) => independentOf(si) && firstOk(si)).length;
    const assessed = outcomes.filter((o) => o.level !== "not_assessed").length;
    // Plain explanations of the mistakes made, grouped by what went wrong, in the family's own words.
    const counts = new Map<string, number>();
    const review: ReviewEntry[] = planned.map((si, index) => {
      const a = by.get(si.itemId);
      const r = this.resolve(si)!;
      let explanation: ReviewEntry["explanation"] = null;
      let message: string | null = null;
      let reason: string | null = null;
      if (a?.attempts && !a.firstCorrect) {
        if (a.firstCategory) {
          counts.set(a.firstCategory, (counts.get(a.firstCategory) ?? 0) + 1);
          explanation = this.categories.get(a.firstCategory) ?? null;
        }
        const stored = this.db.prepare("SELECT response FROM prep_responses WHERE user_id = ? AND attempt_id = ? AND item_id = ? AND attempt_number = 1").get(userId, row.id, si.itemId) as { response: string } | undefined;
        if (stored) {
          const g = gradeResponse(this.course.ix, r.item, JSON.parse(stored.response), r.scope);
          message = g.message;
          reason = g.reason ?? null;
        }
      }
      return {
        index: index + 1,
        itemId: si.itemId,
        outcomeId: si.outcomeId,
        conceptIds: si.conceptIds,
        section: bp.sections.find((s) => s.id === si.sectionId)?.statement ?? "",
        prompt: r.item.prompt,
        answered: Boolean(a?.attempts),
        correct: Boolean(a?.firstCorrect),
        independent: independentOf(si),
        explanation,
        message,
        reason,
        // The worked answer is only ever shown after the attempt has closed.
        solution: a?.firstCorrect ? null : solutionFor(this.course.ix, r.item, r.scope),
      };
    });
    const weak = outcomes.filter((o) => (mock ? o.level === "needs_review" || o.level === "developing" : o.practiceLevel === "needs_review" || o.practiceLevel === "developing"));
    const recommendations: ExamSummary["recommendations"] = [];
    for (const o of weak.sort((a, b) => Number((b.level === "needs_review" || b.practiceLevel === "needs_review")) - Number((a.level === "needs_review" || a.practiceLevel === "needs_review"))).slice(0, 5)) {
      // The lesson and the revision topic are those of the questions this learner missed in the outcome, not the outcome's first concept.
      const missed = this.missedConcepts(planned.filter((i) => i.outcomeId === o.outcomeId && !firstOk(i)), o.outcomeId);
      const lesson = (missed.length ? this.lessonsForConcepts(missed, 1) : this.lessonsFor(o.outcomeId, 1))[0];
      if (lesson) recommendations.push({ kind: "lesson", title: lesson.title, nodeId: lesson.nodeId, why: o.statement });
      const concept = this.course.ix.concepts.get(missed[0] ?? "") ?? [...this.course.ix.concepts.values()].find((c) => c.outcomeIds.includes(o.outcomeId));
      if (concept) recommendations.push({ kind: "revision", title: `Practise: ${concept.title}`, conceptId: concept.id, why: o.statement });
    }
    // Reading-in-context questions belong to no single outcome, so an error there used to produce no advice at all: point at what they exercised.
    const readingMissed = reading.filter((i) => by.get(i.itemId)?.attempts && !firstOk(i));
    if (readingMissed.length) {
      const concepts = this.missedConcepts(readingMissed, null);
      const lesson = this.lessonsForConcepts(concepts, 1)[0];
      if (lesson) recommendations.push({ kind: "lesson", title: lesson.title, nodeId: lesson.nodeId, why: "Reading music in context: " + (this.course.ix.concepts.get(concepts[0] ?? "")?.title ?? "ideas from the passage you missed") });
      const concept = this.course.ix.concepts.get(concepts[0] ?? "");
      if (concept) recommendations.push({ kind: "revision", title: `Practise: ${concept.title}`, conceptId: concept.id, why: "Reading music in context" });
    }
    const started = new Date(row.started_at).getTime();
    return {
      kind: "exam",
      label: "Practice assessment",
      mode: row.mode as "practice" | "mock",
      grade,
      timed: row.timed === 1,
      timeLimitSeconds: row.time_limit_seconds,
      timeTakenSeconds: Math.max(0, Math.round((new Date(at).getTime() - started) / 1000)),
      timedOut,
      rubricVersion: row.rubric_version,
      blueprintVersion: row.blueprint_version,
      curriculumVersion: row.curriculum_version,
      questions: planned.length,
      answered,
      score,
      percent: planned.length ? Math.round((100 * score) / planned.length) : 0,
      independentQuestions: indep.length,
      independentCorrect,
      independentPercent: indep.length ? Math.round((100 * independentCorrect) / indep.length) : null,
      coachedQuestions: mock ? planned.filter((i) => coachedIds.has(i.itemId)).length : planned.filter((i) => i.coached).length,
      hintsUsed: [...by.values()].reduce((n, s) => n + s.hints, 0),
      outcomes,
      outcomesTotal: outcomes.length,
      outcomesAssessed: assessed,
      notAssessed: outcomes.filter((o) => o.level === "not_assessed").map((o) => o.outcomeId),
      scoreReading: { questions: reading.length, correct: reading.filter(firstOk).length, outcomes: [...new Set(reading.flatMap((i) => i.outcomeIds))], skills: SCORE_READING_SKILLS[row.grade ?? 0] ?? null },
      mistakes: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, count]) => ({ category, count, label: this.categories.get(category)?.label ?? category, tip: this.categories.get(category)?.tip ?? "" })),
      review,
      recommendations,
      disclaimer: PREP_DISCLAIMER,
      completedAt: at,
    };
  }

  private summarisePlacement(userId: string, row: AttemptRow, planned: PlannedPrepItem[], by: ReturnType<PrepService["responses"]>, at: string): PlacementSummary {
    const cfg = this.rubricOf(row);
    // A probe only counts once every one of its questions was answered: an unanswered question is "not assessed", never "wrong".
    const all = [...new Set(planned.map((i) => i.stage!))].sort((a, b) => a - b).map((grade) => {
      const mine = planned.filter((i) => i.stage === grade);
      const answered = mine.filter((i) => by.get(i.itemId)?.attempts);
      return { grade, asked: mine.length, answered: answered.length, correct: mine.filter((i) => by.get(i.itemId)?.firstCorrect).length, missed: answered.filter((i) => !by.get(i.itemId)?.firstCorrect).map((i) => i.outcomeId!) };
    });
    const stages: StageResult[] = all.filter((s) => s.answered === s.asked);
    const unfinished = all.find((s) => s.answered < s.asked);
    const rec = recommendPlacement(stages, cfg);
    // Stopping part-way through a probe: the learner has demonstrated nothing at that grade or above, so the suggestion cannot be higher than it.
    const stoppedAt = unfinished && unfinished.grade <= rec.recommendedGrade ? unfinished.grade : null;
    if (stoppedAt !== null) {
      rec.recommendedGrade = stoppedAt;
      rec.allSecure = false;
    }
    if (unfinished) rec.notAssessed = [...new Set([...rec.notAssessed, unfinished.grade])].sort((a, b) => a - b);
    if (unfinished) stages.push({ grade: unfinished.grade, asked: unfinished.asked, correct: unfinished.correct, missed: unfinished.missed });
    const gaps: PlacementSummary["gaps"] = [];
    for (const s of stages) {
      for (const outcomeId of s.missed) {
        const o = this.course.ix.outcomes.get(outcomeId);
        if (!o) continue;
        gaps.push({ outcomeId, statement: o.statement, grade: s.grade, kind: s.grade >= rec.recommendedGrade ? "start-here" : "catch-up", lessons: this.lessonsFor(outcomeId, 2) });
      }
    }
    const g = rec.recommendedGrade;
    const explanation = stoppedAt !== null
      ? `You finished early, so we can only suggest what you have shown so far: Grade ${g} is the first grade you did not complete a set of questions for. Take the check again whenever you like, or start at Grade ${g} or any grade below it.`
      : rec.allSecure
      ? `You answered the questions we asked from Grades 1 to 4 well, so Grade 5 is a sensible place to begin. This is a short check (a handful of questions a grade, not every topic: see "Not checked" below), so it is advice about where to start, not proof you know everything before it. It does not complete any grade or award any grade badge.`
      : rec.decidedBy === 1
        ? `Some Grade 1 ideas were not secure yet, so we recommend starting at Grade 1. The lessons below are the places to look at first (a short check cannot find every gap).`
        : `You were secure on the questions up to Grade ${g - 1}, but not yet on every Grade ${g} idea, so we recommend starting at Grade ${g}. Any earlier topics you missed are listed as catch-up lessons. You can start lower at any time, with no penalty.`;
    // What the short check did NOT ask: the other outcomes of every grade it covered. Said plainly on the result, so "secure" is never read as "everything was tested".
    const asked = new Set(planned.filter((i) => by.get(i.itemId)?.attempts).map((i) => i.outcomeId));
    const notChecked = [...new Set(planned.map((i) => i.stage!))].sort((a, b) => a - b).map((grade) => ({ grade, statements: gradeOutcomes(this.course, grade).filter((o) => !asked.has(o.id)).map((o) => o.statement) })).filter((x) => x.statements.length);
    return {
      kind: "placement",
      label: "Placement check",
      notChecked,
      rubricVersion: row.rubric_version,
      blueprintVersion: row.blueprint_version,
      curriculumVersion: row.curriculum_version,
      questions: planned.length,
      answered: planned.filter((i) => by.get(i.itemId)?.attempts).length,
      recommendedGrade: rec.recommendedGrade,
      decidedBy: rec.decidedBy,
      allSecure: rec.allSecure,
      stages: rec.stages.map((s) => ({ grade: s.grade, asked: s.asked, correct: s.correct, level: s.level })),
      notAssessed: rec.notAssessed,
      gaps,
      explanation,
      disclaimer: PREP_DISCLAIMER,
      completedAt: at,
    };
  }

  // ---- choosing a starting grade -----------------------------------------------------------------------------------------

  /**
   * Record where the learner chose to start. Allowed from Grade 1 up to the recommended grade (never above what was demonstrated).
   * It completes nothing and awards nothing: it only lets the path open that grade's first lesson (path-state), and moves the
   * learner's selected grade. A later placement supersedes this row; no row and no progress is ever deleted.
   */
  accept(userId: string, attemptId: string, startGrade: number) {
    const row = this.row(userId, attemptId);
    if (row.kind !== "placement" || row.status !== "complete") throw new ApiError(409, "not_finished", "Finish the placement check first.");
    const summary = JSON.parse(row.summary!) as PlacementSummary;
    if (!Number.isInteger(startGrade) || startGrade < 1 || startGrade > summary.recommendedGrade) throw new ApiError(400, "bad_request", `Choose a starting grade from 1 to ${summary.recommendedGrade}.`);
    const at = this.clock.now().toISOString();
    tx(this.db, () => {
      const same = this.db.prepare("SELECT start_grade FROM placement_starts WHERE user_id = ? AND attempt_id = ?").get(userId, attemptId) as { start_grade: number } | undefined;
      this.db.prepare("UPDATE placement_starts SET superseded_at = ? WHERE user_id = ? AND superseded_at IS NULL AND attempt_id <> ?").run(at, userId, attemptId);
      if (same) this.db.prepare("UPDATE placement_starts SET start_grade = ?, superseded_at = NULL WHERE user_id = ? AND attempt_id = ?").run(startGrade, userId, attemptId);
      else this.db.prepare("INSERT INTO placement_starts (user_id,attempt_id,start_grade,recommended_grade,accepted_at) VALUES (?,?,?,?,?)").run(userId, attemptId, startGrade, summary.recommendedGrade, at);
      this.db.prepare("UPDATE profiles SET selected_grade = ?, updated_at = ? WHERE user_id = ?").run(startGrade, at, userId);
    });
    return { startGrade, recommendedGrade: summary.recommendedGrade };
  }

  // ---- overview and history ------------------------------------------------------------------------------------------------

  private completedExamAttempts(userId: string, grade: number): ReadinessAttempt[] {
    const rows = this.db.prepare("SELECT id, mode, completed_at, rubric_version, blueprint_version, curriculum_version, summary FROM prep_attempts WHERE user_id = ? AND kind = 'exam' AND grade = ? AND status = 'complete' ORDER BY completed_at DESC").all(userId, grade) as Array<{ id: string; mode: "practice" | "mock"; completed_at: string; rubric_version: number; blueprint_version: number; curriculum_version: string; summary: string }>;
    const tz = learnerTime(this.db, this.clock, userId).tz;
    return rows.map((r) => {
      const s = JSON.parse(r.summary) as ExamSummary;
      return { questions: s.questions, answered: s.answered, day: localDate(new Date(r.completed_at), tz), id: r.id, completedAt: r.completed_at, mode: r.mode, rubricVersion: r.rubric_version, blueprintVersion: r.blueprint_version, curriculumVersion: r.curriculum_version, independentQuestions: s.independentQuestions, independentCorrect: s.independentCorrect, outcomesTotal: s.outcomesTotal, outcomesAssessed: s.outcomesAssessed };
    });
  }

  /** The full estimate, whether or not it may be shown. Internal: evidence is always collected and this is what a teacher review would read. */
  readinessEvidence(userId: string, grade: number) {
    const r = readiness(this.completedExamAttempts(userId, grade), { rubricVersion: this.cfg.rubricVersion, blueprintVersion: this.cfg.blueprintVersion }, this.cfg);
    return { ...r, note: READINESS_NOTE };
  }

  /**
   * What a client receives. With the release gate off (the default) there is NO classification, percentage or explanation: only that it is not
   * shown, how many mock attempts the evidence already holds, and which attempts the rules would set aside. Individual attempt scores are
   * not part of this object and are unaffected.
   */
  readinessFor(userId: string, grade: number):
    | ({ visible: true } & ReturnType<PrepService["readinessEvidence"]>)
    | { visible: false; attemptsUsed: number; ignored: Array<{ id: string; reason: string }>; note: string } {
    const full = this.readinessEvidence(userId, grade);
    if (this.gates.readiness) return { visible: true, ...full };
    return { visible: false, attemptsUsed: full.attemptsUsed, ignored: full.ignored, note: READINESS_GATED_NOTE };
  }

  /** The grade whose first lesson the path opens for this learner (the latest accepted placement), or null. */
  placedGrade(userId: string): number | null {
    const r = this.db.prepare("SELECT start_grade FROM placement_starts WHERE user_id = ? AND superseded_at IS NULL ORDER BY accepted_at DESC LIMIT 1").get(userId) as { start_grade: number } | undefined;
    return r?.start_grade ?? null;
  }

  /** Everything the Practice hub shows: one card per grade, the placement state, and the current estimates. */
  overview(userId: string) {
    const gradeDone = new Set((this.db.prepare("SELECT node_id FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL AND node_id LIKE 'G_-A'").all(userId) as Array<{ node_id: string }>).map((r) => r.node_id));
    const open = this.db.prepare("SELECT id, kind, mode, grade, items FROM prep_attempts WHERE user_id = ? AND status = 'open'").all(userId) as Array<{ id: string; kind: PrepKind; mode: PrepMode; grade: number | null; items: string }>;
    const grades = [1, 2, 3, 4, 5].map((grade) => {
      const bp = this.blueprint(grade);
      const attempts = this.completedExamAttempts(userId, grade);
      const mine = open.filter((o) => o.kind === "exam" && o.grade === grade);
      return {
        grade,
        title: `Grade ${grade} practice examination`,
        questions: bp.totalItems,
        outcomes: bp.sections.filter((s) => s.outcomeId).length,
        ready: bp.uncovered.length === 0,
        timedMinutes: Math.ceil((bp.totalItems * this.cfg.exam.secondsPerQuestion) / 60),
        gradeAssessmentPassed: gradeDone.has(`G${grade}-A`),
        attempts: attempts.length,
        mockAttempts: attempts.filter((a) => a.mode === "mock").length,
        open: mine.map((o) => ({ id: o.id, mode: o.mode, questions: (JSON.parse(o.items) as unknown[]).length })),
        readiness: this.readinessFor(userId, grade),
      };
    });
    const latest = this.db.prepare("SELECT id, completed_at, summary FROM prep_attempts WHERE user_id = ? AND kind = 'placement' AND status = 'complete' ORDER BY completed_at DESC LIMIT 1").get(userId) as { id: string; completed_at: string; summary: string } | undefined;
    const ps = latest ? (JSON.parse(latest.summary) as PlacementSummary) : null;
    return {
      disclaimer: PREP_DISCLAIMER,
      timing: { secondsPerQuestion: this.cfg.exam.secondsPerQuestion, extraTimeChoices: this.cfg.exam.extraTimeChoices, note: "The timer is our own default, not an ABRSM time allowance. Speed is never part of your score." },
      extraTimePercent: this.profileExtraTime(userId),
      placement: {
        openAttemptId: open.find((o) => o.kind === "placement")?.id ?? null,
        latest: latest && ps ? { id: latest.id, completedAt: latest.completed_at, recommendedGrade: ps.recommendedGrade } : null,
        startGrade: this.placedGrade(userId),
      },
      grades,
    };
  }

  private profileExtraTime(userId: string): number {
    const p = this.db.prepare("SELECT settings FROM profiles WHERE user_id = ?").get(userId) as { settings: string } | undefined;
    const v = p ? (JSON.parse(p.settings) as { examExtraTime?: number }).examExtraTime : 0;
    return this.cfg.exam.extraTimeChoices.includes(v ?? 0) ? (v ?? 0) : 0;
  }

  /** All finished attempts, newest first, with how each was scored and whether the rules have since moved on (results are never rewritten). */
  history(userId: string) {
    const rows = this.db.prepare("SELECT id, kind, mode, grade, completed_at, rubric_version, blueprint_version, curriculum_version, summary FROM prep_attempts WHERE user_id = ? AND status = 'complete' ORDER BY completed_at DESC").all(userId) as Array<{ id: string; kind: PrepKind; mode: PrepMode; grade: number | null; completed_at: string; rubric_version: number; blueprint_version: number; curriculum_version: string; summary: string }>;
    return rows.map((r) => {
      const s = JSON.parse(r.summary) as ExamSummary | PlacementSummary;
      const olderRules = r.rubric_version !== this.cfg.rubricVersion || r.blueprint_version !== this.cfg.blueprintVersion;
      const olderCurriculum = r.curriculum_version !== this.course.version;
      return {
        id: r.id,
        kind: r.kind,
        mode: r.mode,
        grade: r.grade,
        completedAt: r.completed_at,
        rubricVersion: r.rubric_version,
        blueprintVersion: r.blueprint_version,
        curriculumVersion: r.curriculum_version,
        superseded: olderRules || olderCurriculum,
        supersededNote: olderRules ? "Scored under earlier rules. It keeps its own result and is not mixed into your current estimate." : olderCurriculum ? "Taken on an earlier version of the course. The result stands as it was." : null,
        ...(s.kind === "exam"
          ? { percent: s.percent, score: s.score, questions: s.questions, independentPercent: s.independentPercent, timed: s.timed, timedOut: s.timedOut }
          : { recommendedGrade: s.recommendedGrade, questions: s.questions }),
      };
    });
  }

  /** The stored result of a finished attempt, with the notation of each question re-drawn from its stored seed where the generator still matches. */
  result(userId: string, attemptId: string) {
    const row = this.row(userId, attemptId);
    if (row.status !== "complete") throw new ApiError(409, "not_finished", "This attempt has not finished yet.");
    const summary = JSON.parse(row.summary!) as ExamSummary | PlacementSummary;
    const planned = JSON.parse(row.items) as PlannedPrepItem[];
    const questions = planned.map((si) => {
      const r = this.resolve(si);
      return r ? { itemId: si.itemId, item: this.course.learnerItem(r.item, "practice", r.scope) } : { itemId: si.itemId, item: null };
    });
    return { id: row.id, kind: row.kind, mode: row.mode, grade: row.grade, startedAt: row.started_at, completedAt: row.completed_at, summary, questions, superseded: row.rubric_version !== this.cfg.rubricVersion || row.blueprint_version !== this.cfg.blueprintVersion || row.curriculum_version !== this.course.version };
  }

  /** Server-side only (never routed): an attempt's questions WITH their answers, for tests and the coverage audit. Nothing in the HTTP API returns these. */
  internalItems(userId: string, attemptId: string): Array<{ planned: PlannedPrepItem; item: ExerciseItem; scope: MusicScope }> {
    const row = this.row(userId, attemptId);
    return (JSON.parse(row.items) as PlannedPrepItem[]).flatMap((planned) => {
      const r = this.resolve(planned);
      return r ? [{ planned, item: r.item, scope: r.scope }] : [];
    });
  }

  /**
   * The concepts the learner got wrong on their NEWEST independent mock of each grade (current rubric), with when that mock finished. Only the concepts of
   * the questions actually missed, not every concept of the outcome (an outcome such as "all keys to six sharps or flats" covers many).
   */
  latestMockMissed(userId: string): Map<string, string> {
    const out = new Map<string, string>();
    for (let g = 1; g <= 5; g++) {
      const r = this.db.prepare("SELECT completed_at, summary FROM prep_attempts WHERE user_id = ? AND kind = 'exam' AND grade = ? AND mode = 'mock' AND status = 'complete' AND rubric_version = ? ORDER BY completed_at DESC LIMIT 1").get(userId, g, this.cfg.rubricVersion) as { completed_at: string; summary: string } | undefined;
      if (!r) continue;
      for (const e of (JSON.parse(r.summary) as ExamSummary).review) {
        if (!e.answered || e.correct || !e.independent) continue;
        for (const c of e.conceptIds ?? []) if (!out.has(c) || out.get(c)! < r.completed_at) out.set(c, r.completed_at);
      }
    }
    return out;
  }

  /** Progress across attempts for one grade: each outcome's level in the latest mock and the change since the one before. */
  progressFor(userId: string, grade: number) {
    const rows = this.db.prepare("SELECT id, completed_at, summary FROM prep_attempts WHERE user_id = ? AND kind = 'exam' AND grade = ? AND mode = 'mock' AND status = 'complete' AND rubric_version = ? AND blueprint_version = ? ORDER BY completed_at DESC LIMIT 6").all(userId, grade, this.cfg.rubricVersion, this.cfg.blueprintVersion) as Array<{ id: string; completed_at: string; summary: string }>;
    const sums = rows.map((r) => ({ id: r.id, completedAt: r.completed_at, s: JSON.parse(r.summary) as ExamSummary }));
    const rank: Record<OutcomeLevel, number> = { not_assessed: -1, needs_review: 0, developing: 1, mastered: 2 };
    return {
      grade,
      attempts: sums.map((x) => ({ id: x.id, completedAt: x.completedAt, percent: x.s.percent, independentPercent: x.s.independentPercent })).reverse(),
      outcomes: this.blueprint(grade).sections.filter((s) => s.outcomeId).map((s) => {
        // The newest attempt that actually assessed the outcome, and the one assessed before it.
        const levels = sums.map((x) => x.s.outcomes.find((o) => o.outcomeId === s.outcomeId)).filter((o): o is OutcomeResult => Boolean(o) && o!.level !== "not_assessed");
        const now = levels[0]?.level ?? "not_assessed";
        const before = levels[1]?.level;
        return { outcomeId: s.outcomeId!, statement: s.statement, domain: s.domain, level: now, levelLabel: LEVEL_LABEL[now], trend: before ? (rank[now] > rank[before] ? "improving" : rank[now] < rank[before] ? "slipping" : "steady") : "new", lessons: this.lessonsFor(s.outcomeId!, 1) };
      }),
    };
  }
}


