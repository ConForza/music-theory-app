/**
 * Practice lab (Brief 03): the demonstration sets and seeded "more like this" variations, graded by the same
 * engine as lessons. Practice attempts are stored separately and never affect lesson completion or unlocking.
 *
 * Generated items are never stored or trusted from the client: an item id encodes template, template version
 * and seed (i.gen.<template>.v<version>.s<seed>), and the server regenerates the item to grade it. A stale
 * version (content moved on) is refused rather than graded against different music.
 */
import { randomInt } from "node:crypto";
import type { ExerciseItem, MusicScope } from "@mtp/curriculum";
import { EngineError, generateItem, generatorTemplateIds, parseGeneratedItemId, templateScope } from "@mtp/engine";
import type { Course, LearnerItem } from "./course.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";
import { gradeResponse, revealSolution, type Response } from "./grade.ts";

const now = () => new Date().toISOString();

export class PracticeService {
  private byId = new Map<string, { item: ExerciseItem; setId: string }>();
  private generatable: Set<string>;
  constructor(
    private db: Db,
    private course: Course,
  ) {
    for (const s of course.showcase) for (const it of s.items) this.byId.set(it.id, { item: it, setId: s.id });
    this.generatable = new Set(generatorTemplateIds(course.ix));
  }

  catalogue() {
    return {
      sets: this.course.showcase.map((s) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        grade: s.grade,
        familyIds: s.familyIds,
        questions: s.items.length,
        practice: s.practice.filter((p) => this.generatable.has(p.templateId)),
      })),
    };
  }

  set(setId: string): { id: string; title: string; summary: string; items: LearnerItem[]; practice: Array<{ templateId: string; label: string }> } {
    const s = this.course.showcase.find((x) => x.id === setId);
    if (!s) throw new ApiError(404, "not_found", "That practice set does not exist.");
    return { id: s.id, title: s.title, summary: s.summary, items: s.items.map((it) => this.course.learnerItem(it, "practice")), practice: s.practice.filter((p) => this.generatable.has(p.templateId)) };
  }

  /** A fresh variation of a template. The seed is chosen by the server unless the client asks to replay one. */
  generate(templateId: string, seed?: number): LearnerItem & { seed: number; templateVersion: number } {
    if (!this.generatable.has(templateId)) throw new ApiError(404, "not_found", "There is no practice generator for that exercise.");
    const s = seed ?? randomInt(0, 2 ** 31 - 1);
    const { item } = this.generated(templateId, s);
    return { ...this.course.learnerItem(item, "practice"), seed: s, templateVersion: item.templateVersion };
  }

  private generated(templateId: string, seed: number, version?: number, fingerprint?: string) {
    try {
      return generateItem(this.course.ix, templateId, seed, { evidence: "learning", ...(version !== undefined ? { version } : {}), ...(fingerprint !== undefined ? { fingerprint } : {}) });
    } catch (e) {
      if (e instanceof EngineError && (e.code === "stale_item" || e.code === "unknown_template")) throw new ApiError(409, "stale_item", "This exercise has been updated. Start a new one.");
      if (e instanceof EngineError && e.code === "generation_failed") throw new ApiError(503, "generation_failed", "We couldn't make that question just now. Try another one.");
      if (e instanceof EngineError) throw new ApiError(404, "not_found", "That exercise could not be created.");
      throw e;
    }
  }

  /** Resolve an item id to the exact item the learner saw (fixed demonstration item or regenerated variation). */
  resolve(itemId: string): { item: ExerciseItem; scope: MusicScope; seed: number | null } {
    const fixed = this.byId.get(itemId);
    if (fixed) {
      const tpl = this.course.ix.templates.get(fixed.item.templateId)!;
      return { item: fixed.item, scope: templateScope(this.course.ix, tpl), seed: null };
    }
    const g = parseGeneratedItemId(itemId);
    if (!g || !this.generatable.has(g.templateId)) throw new ApiError(404, "not_found", "Unknown question.");
    const { item } = this.generated(g.templateId, g.seed, g.version, g.fingerprint);
    return { item, scope: templateScope(this.course.ix, this.course.ix.templates.get(g.templateId)!), seed: g.seed };
  }

  hint(userId: string, itemId: string, level: number) {
    const { item } = this.resolve(itemId);
    if (level < 1 || level > item.hints.length) throw new ApiError(400, "bad_request", "No such hint.");
    this.db.prepare("INSERT OR IGNORE INTO practice_hint_uses (user_id,item_id,level,created_at) VALUES (?,?,?,?)").run(userId, itemId, level, now());
    return { hint: item.hints[level - 1]!, level };
  }

  attempt(userId: string, attemptId: string, itemId: string, response: Response) {
    const { item, scope, seed } = this.resolve(itemId);
    const prior = this.db.prepare("SELECT item_id, response, correct, mistake_category, attempt_number FROM practice_attempts WHERE user_id = ? AND id = ?").get(userId, attemptId) as
      | { item_id: string; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    const graded = gradeResponse(this.course.ix, item, response, scope);
    if (prior) {
      if (prior.item_id !== itemId || prior.response !== JSON.stringify(response)) {
        throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      }
      return this.result(item, scope, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, graded);
    }
    const n = tx(this.db, () => {
      const next = (this.db.prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM practice_attempts WHERE user_id = ? AND item_id = ?").get(userId, itemId) as { n: number }).n + 1;
      const hints = (this.db.prepare("SELECT COUNT(*) AS c FROM practice_hint_uses WHERE user_id = ? AND item_id = ?").get(userId, itemId) as { c: number }).c;
      this.db
        .prepare(
          `INSERT INTO practice_attempts (user_id,id,item_id,template_id,template_version,seed,curriculum_version,response,correct,mistake_category,hints_used,attempt_number,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(userId, attemptId, itemId, item.templateId, item.templateVersion, seed, this.course.version, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, hints, next, now());
      return next;
    });
    return this.result(item, scope, graded.correct, graded.category, n, false, graded);
  }

  private result(item: ExerciseItem, scope: MusicScope, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, graded: ReturnType<typeof gradeResponse>) {
    const solution = revealSolution(this.course.ix, item, scope, correct, attemptNumber);
    return {
      correct,
      category,
      message: graded.message,
      reason: correct ? null : graded.reason,
      ...(graded.marks ? { marks: graded.marks } : {}),
      ...(graded.parts ? { parts: graded.parts.map((p) => ({ id: p.id, correct: p.correct, reason: p.reason })) } : {}),
      ...(solution ? { solution } : {}),
      attemptNumber,
      replayed,
    };
  }

  stats(userId: string) {
    return this.db
      .prepare("SELECT COUNT(*) AS answered, COALESCE(SUM(correct),0) AS correct FROM practice_attempts WHERE user_id = ?")
      .get(userId) as { answered: number; correct: number };
  }
}
