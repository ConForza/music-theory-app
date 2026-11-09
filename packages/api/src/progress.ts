import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";
import type { ExerciseItem } from "@mtp/curriculum";
import type { Course, LearnerLesson } from "./course.ts";
import { gradeResponse, revealSolution, type GradeResult, type Response } from "./grade.ts";
import { computeNodeStates, nextNodeForGrade, type NodeProgress, type PathPolicy, type ProgressRow } from "./path-state.ts";

const now = () => new Date().toISOString();
export const PHASES = ["intro", "teach", "demo", "questions"] as const;
export type Phase = (typeof PHASES)[number];

export interface ItemRunState {
  correct: boolean;
  attempts: number;
  firstTry: boolean;
  hintsUsed: number;
}

export interface RunState {
  nodeId: string;
  run: number;
  phase: Phase | string;
  contentVersion: number;
  items: Record<string, ItemRunState>;
}

export interface CompletionSummary {
  questions: number;
  firstTryCorrect: number;
  hintsUsed: number;
  completedAt: string;
  nextNodeId: string | null;
}

export class ProgressService {
  constructor(
    private db: Db,
    private course: Course,
    private policy: PathPolicy,
  ) {}

  rows(userId: string): ProgressRow[] {
    return this.db
      .prepare(
        "SELECT node_id, run, run_open, phase, content_version, completed_at, completed_content_version FROM lesson_progress WHERE user_id = ?",
      )
      .all(userId) as unknown as ProgressRow[];
  }

  states(userId: string) {
    return computeNodeStates(this.course, this.rows(userId), this.policy);
  }

  /** Everything the map and dashboard need, computed from the curriculum graph and this learner's rows. */
  overview(userId: string) {
    const states = this.states(userId);
    const nodes: Record<string, NodeProgress> = Object.fromEntries(states);
        const grades = this.course.view.worlds.map((w) => {
      const required = this.course.nodes.filter((n) => n.grade === w.grade && !n.optional);
      const written = required.filter((n) => this.course.isPlayable(n.id));
      const done = required.filter((n) => states.get(n.id)?.state === "completed");
      return {
        grade: w.grade,
        requiredNodes: required.length,
        writtenNodes: written.length,
        completedNodes: done.length,
        nextNodeId: nextNodeForGrade(this.course, states, w.grade),
        units: w.units.map((u) => {
          const req = required.filter((n) => n.unitId === u.id);
          return {
            unitId: u.id,
            requiredNodes: req.length,
            writtenNodes: req.filter((n) => this.course.isPlayable(n.id)).length,
            completedNodes: req.filter((n) => states.get(n.id)?.state === "completed").length,
          };
        }),
      };
    });
    const stats = this.db
      .prepare(
        `SELECT COUNT(*) AS answered, COALESCE(SUM(correct),0) AS correct, COALESCE(SUM(attempt_number = 1 AND correct = 1),0) AS first_try
         FROM attempts WHERE user_id = ?`,
      )
      .get(userId) as { answered: number; correct: number; first_try: number };
    const recent = this.db
      .prepare(
        "SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 5",
      )
      .all(userId) as Array<{ node_id: string; completed_at: string }>;
    return {
      curriculumVersion: this.course.version,
      nodes,
      grades,
      totals: {
        lessonsCompleted: [...states.values()].filter((s) => s.state === "completed").length,
        questionsAnswered: stats.answered,
        firstTryCorrect: stats.first_try,
      },
      recent: recent.map((r) => ({ nodeId: r.node_id, completedAt: r.completed_at })),
    };
  }

  /** The lesson, if it exists and this learner may open it. Throws a specific error otherwise. */
  openableLesson(userId: string, nodeId: string): LearnerLesson {
    const node = this.course.ix.nodeById.get(nodeId);
    if (!node) throw new ApiError(404, "not_found", "That lesson does not exist.");
    const state = this.states(userId).get(nodeId)!;
    if (state.state === "coming_soon") throw new ApiError(409, "coming_soon", "This lesson is still being written.");
    if (state.state === "locked") throw new ApiError(403, "locked", "Finish the earlier lessons first.", { lockedBy: state.lockedBy });
    return this.course.lesson(nodeId)!;
  }

  private row(userId: string, nodeId: string) {
    return this.db.prepare("SELECT * FROM lesson_progress WHERE user_id = ? AND node_id = ?").get(userId, nodeId) as
      | (ProgressRow & { curriculum_version: string })
      | undefined;
  }

  /** Begin or resume. Idempotent: calling it twice returns the same run. */
  start(userId: string, nodeId: string): RunState {
    const lesson = this.openableLesson(userId, nodeId);
    const t = now();
    tx(this.db, () => {
      const row = this.row(userId, nodeId);
      if (!row) {
        this.db
          .prepare(
            "INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at) VALUES (?,?,1,1,'intro',?,?,?,?)",
          )
          .run(userId, nodeId, lesson.contentVersion, this.course.version, t, t);
      } else if (!row.run_open || row.content_version !== lesson.contentVersion) {
        // A closed run is replayed, or the lesson changed under an unfinished run: start a clean run.
        // Old attempts remain in the log under their own run and content version.
        this.db
          .prepare(
            "UPDATE lesson_progress SET run = run + 1, run_open = 1, phase = 'intro', content_version = ?, curriculum_version = ?, started_at = ?, updated_at = ? WHERE user_id = ? AND node_id = ?",
          )
          .run(lesson.contentVersion, this.course.version, t, t, userId, nodeId);
      }
    });
    return this.runState(userId, nodeId);
  }

  runState(userId: string, nodeId: string): RunState {
    const row = this.row(userId, nodeId);
    if (!row) throw new ApiError(409, "not_started", "Start the lesson first.");
    const items: Record<string, ItemRunState> = {};
    const attempts = this.db
      .prepare("SELECT item_id, correct, attempt_number, hints_used FROM attempts WHERE user_id = ? AND node_id = ? AND run = ? ORDER BY attempt_number")
      .all(userId, nodeId, row.run) as Array<{ item_id: string; correct: number; attempt_number: number; hints_used: number }>;
    for (const a of attempts) {
      const s = (items[a.item_id] ??= { correct: false, attempts: 0, firstTry: false, hintsUsed: 0 });
      s.attempts = Math.max(s.attempts, a.attempt_number);
      s.hintsUsed = Math.max(s.hintsUsed, a.hints_used);
      if (a.correct) s.correct = true;
      if (a.attempt_number === 1 && a.correct && a.hints_used === 0) s.firstTry = true;
    }
    return { nodeId, run: row.run, phase: row.phase, contentVersion: row.content_version, items };
  }

  private openRun(userId: string, nodeId: string) {
    const row = this.row(userId, nodeId);
    if (!row || !row.run_open) throw new ApiError(409, "not_started", "Start the lesson first.");
    return row;
  }

  setPhase(userId: string, nodeId: string, phase: Phase) {
    this.openableLesson(userId, nodeId);
    const row = this.openRun(userId, nodeId);
    // Phase only records where to resume the teaching steps; it never affects completion.
    this.db.prepare("UPDATE lesson_progress SET phase = ?, updated_at = ? WHERE user_id = ? AND node_id = ?").run(phase, now(), userId, nodeId);
    return { phase, run: row.run };
  }

  hint(userId: string, nodeId: string, itemId: string, level: number): { hint: string; level: number } {
    this.openableLesson(userId, nodeId);
    const row = this.openRun(userId, nodeId);
    const item = this.course.authoredItems(nodeId).find((i) => i.id === itemId);
    if (!item) throw new ApiError(404, "not_found", "Unknown question.");
    if (item.evidence === "independent" || item.hints.length === 0) throw new ApiError(409, "no_hints", "Hints are not available for this question.");
    if (level < 1 || level > item.hints.length) throw new ApiError(400, "bad_request", "No such hint.");
    this.db
      .prepare("INSERT OR IGNORE INTO hint_uses (user_id,node_id,run,item_id,level,created_at) VALUES (?,?,?,?,?,?)")
      .run(userId, nodeId, row.run, itemId, level, now());
    return { hint: item.hints[level - 1]!, level };
  }

  /** Grade server-side and record. Replaying the same attemptId returns the stored result and records nothing new. */
  attempt(userId: string, nodeId: string, attemptId: string, itemId: string, response: Response) {
    const lesson = this.openableLesson(userId, nodeId);
    const row = this.openRun(userId, nodeId);
    if (row.content_version !== lesson.contentVersion) throw new ApiError(409, "stale_lesson", "This lesson was updated. Reload to continue.");
    const item = this.course.authoredItems(nodeId).find((i) => i.id === itemId);
    if (!item) throw new ApiError(404, "not_found", "Unknown question.");

    const prior = this.db.prepare("SELECT * FROM attempts WHERE user_id = ? AND id = ?").get(userId, attemptId) as
      | { node_id: string; item_id: string; run: number; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    if (prior) {
      // An id is an immutable command: same question, same run, same answer. Anything else is a client bug or a replay attack.
      if (prior.node_id !== nodeId || prior.item_id !== itemId || prior.run !== row.run || prior.response !== JSON.stringify(response)) {
        throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      }
      // Grading is deterministic, so the explanation can be recomputed; the stored verdict stays authoritative.
      const again = gradeResponse(this.course.ix, item, response, this.course.scopeFor(nodeId, item));
      return this.result(item, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, again, nodeId);
    }

    const graded: GradeResult = gradeResponse(this.course.ix, item, response, this.course.scopeFor(nodeId, item));
    const number = tx(this.db, () => {
      const n =
        (this.db
          .prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM attempts WHERE user_id = ? AND node_id = ? AND run = ? AND item_id = ?")
          .get(userId, nodeId, row.run, itemId) as { n: number }).n + 1;
      const hints = (this.db
        .prepare("SELECT COUNT(*) AS c FROM hint_uses WHERE user_id = ? AND node_id = ? AND run = ? AND item_id = ?")
        .get(userId, nodeId, row.run, itemId) as { c: number }).c;
      this.db
        .prepare(
          `INSERT INTO attempts (user_id,id,node_id,run,item_id,template_id,template_version,content_version,curriculum_version,evidence,response,correct,mistake_category,hints_used,attempt_number,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(userId, attemptId, nodeId, row.run, itemId, item.templateId, item.templateVersion, row.content_version, row.curriculum_version, item.evidence, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, hints, n, now());
      this.db.prepare("UPDATE lesson_progress SET updated_at = ? WHERE user_id = ? AND node_id = ?").run(now(), userId, nodeId);
      return n;
    });
    return this.result(item, graded.correct, graded.category, number, false, graded, nodeId);
  }

  private result(item: ExerciseItem, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, graded: GradeResult, nodeId: string) {
    const message = correct ? item.feedback.correct : category && category === graded.category ? graded.message : category && item.feedback.mistakes[category] ? item.feedback.mistakes[category]! : item.feedback.fallback;
    const solution = revealSolution(this.course.ix, item, this.course.scopeFor(nodeId, item), correct, attemptNumber);
    return {
      correct,
      category,
      message,
      /** Why THIS answer is wrong (engine explanation); never gives the answer away. */
      reason: correct ? null : graded.reason,
      ...(graded.marks ? { marks: graded.marks } : {}),
      ...(graded.parts ? { parts: graded.parts.map((p) => ({ id: p.id, correct: p.correct, reason: p.reason })) } : {}),
      ...(solution ? { solution } : {}),
      attemptNumber,
      replayed,
    };
  }

  /**
   * The server decides completion: every playable question must have a correct attempt in the current run.
   * Idempotent: completing a closed run returns the stored summary.
   */
  complete(userId: string, nodeId: string): CompletionSummary & { alreadyComplete: boolean } {
    const lesson = this.openableLesson(userId, nodeId);
    const closed = tx(this.db, () => {
      const row = this.row(userId, nodeId);
      if (!row) throw new ApiError(409, "not_started", "Start the lesson first.");
      if (!row.run_open) {
        const stored = this.db.prepare("SELECT last_stats FROM lesson_progress WHERE user_id = ? AND node_id = ?").get(userId, nodeId) as { last_stats: string };
        return { ...(JSON.parse(stored.last_stats) as Omit<CompletionSummary, "nextNodeId">), alreadyComplete: true };
      }
      // The open run must belong to the lesson as it is served now; old answers never complete newer material.
      if (row.content_version !== lesson.contentVersion) {
        throw new ApiError(409, "stale_lesson", "This lesson was updated since you started it. Reload to begin the new version.");
      }
      const run = this.runState(userId, nodeId);
      const missing = lesson.items.filter((i) => !run.items[i.id]?.correct).map((i) => i.id);
      if (missing.length) throw new ApiError(409, "incomplete", "Some questions still need an answer.", { missing });
      const t = now();
      const summary = {
        questions: lesson.items.length,
        firstTryCorrect: lesson.items.filter((i) => run.items[i.id]?.firstTry).length,
        hintsUsed: Object.values(run.items).reduce((acc, s) => acc + s.hintsUsed, 0),
        completedAt: t,
      };
      const stale = (row.completed_content_version ?? 0) < lesson.contentVersion;
      // An unchanged resumed run keeps the curriculum version it started under (row.curriculum_version).
      this.db
        .prepare(
          `UPDATE lesson_progress SET run_open = 0, updated_at = ?, last_stats = ?,
             completed_at = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_at END,
             completed_content_version = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_content_version END,
             completed_curriculum_version = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_curriculum_version END
           WHERE user_id = ? AND node_id = ?`,
        )
        .run(t, JSON.stringify(summary), stale ? 1 : 0, t, stale ? 1 : 0, row.content_version, stale ? 1 : 0, row.curriculum_version, userId, nodeId);
      return { ...summary, alreadyComplete: false };
    });
    return { ...closed, nextNodeId: this.nextAfter(userId, nodeId) };
  }

  private nextAfter(userId: string, nodeId: string): string | null {
    const grade = this.course.ix.nodeById.get(nodeId)!.grade;
    return nextNodeForGrade(this.course, this.states(userId), grade);
  }
}
