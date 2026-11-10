/**
 * Adaptive spaced review (Brief 04).
 *
 * A review session revisits concepts whose review date has arrived, using the Brief 03 deterministic generators inside the
 * scope the learner was taught. Review items are the designated *independent* activity: no hints, the server grades, and a
 * learner's first answer to each item is mastery evidence. A wrong first answer is a lapse (the concept is rescheduled), the
 * learner sees the engine's explanation, and a short remedial question on the same idea follows; remedial answers are
 * learning, never mastery evidence. Seeds, template versions and generation fingerprints are stored so every item can be
 * reproduced and audited, and an item whose generator has since changed is dropped as stale instead of regraded.
 */
import { effectiveScope, type ExerciseItem, type MusicScope, type OrderedNode } from "@mtp/curriculum";
import { EngineError, generateItem, generatorTemplateIds, hashString, parseGeneratedItemId } from "@mtp/engine";
import type { AchievementService } from "./achievements.ts";
import type { ActivityService } from "./activity.ts";
import { daysBetween } from "./clock.ts";
import type { Clock } from "./clock.ts";
import type { Course, LearnerItem } from "./course.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";
import { gradeResponse, revealSolution, type Response } from "./grade.ts";
import { isDue, type ConceptMastery } from "./mastery.ts";
import { learnerTime, type LearnerTime, type MasteryService } from "./mastery-service.ts";
import { questionKey, satisfies, type ReviewConstraint } from "./question-key.ts";
import { REVIEW_NODE, type XpService } from "./xp.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SessionItem {
  itemId: string;
  kind: "review" | "remedial";
  conceptId: string;
  nodeId: string;
  templateId: string;
  templateVersion: number;
  seed: number;
  fingerprint: string;
  /** For a remedial item, the review item whose mistake it follows. */
  forItemId?: string;
  /** Set when the generator changed since the item was made; the item is skipped, not regraded. */
  stale?: boolean;
}

interface SessionRow {
  id: string;
  status: "open" | "complete" | "abandoned";
  started_at: string;
  completed_at: string | null;
  local_date: string;
  curriculum_version: string;
  rules_version: number;
  items: string;
  summary: string | null;
}

interface Candidate {
  nodeId: string;
  templateId: string;
  scope: MusicScope;
}

const seedFor = (sessionId: string, conceptId: string, templateId: string, salt = ""): number => (hashString(`${sessionId}|${conceptId}|${templateId}|${salt}`) >>> 0) % 2 ** 31;

export class ReviewService {
  private generatable: Set<string>;
  private constraints = new Map<string, ReviewConstraint>();
  constructor(
    private db: Db,
    private course: Course,
    private clock: Clock,
    private mastery: MasteryService,
    private xp: XpService,
    private activity: ActivityService,
    private achievements: AchievementService,
    private opts: { maxConcepts: number; itemsPerConcept: number },
  ) {
    this.generatable = new Set(generatorTemplateIds(course.ix));
    try {
      const file = JSON.parse(readFileSync(join(course.ix.c.root, "policy/review-constraints.json"), "utf8")) as { constraints: ReviewConstraint[] };
      for (const c of file.constraints) {
        if (!course.ix.concepts.has(c.conceptId)) throw new Error(`review-constraints: unknown concept ${c.conceptId}`);
        this.constraints.set(c.conceptId, c);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // no file: no extra constraints
    }
  }

  // ---- what can be reviewed --------------------------------------------------------------------------------------

  private completedNodes(userId: string): Set<string> {
    return new Set((this.db.prepare("SELECT node_id FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as Array<{ node_id: string }>).map((r) => r.node_id));
  }

  /**
   * The ways a concept can be reviewed: generator templates bound to a *completed* lesson that taught the concept, in that
   * binding's effective scope. Nothing the learner has not been taught can appear, and a concept with no usable template is
   * simply not reviewable yet.
   */
  candidates(conceptId: string, completed: Set<string>): Candidate[] {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const node of (this.course.ix.conceptTaughtBy.get(conceptId) ?? []) as OrderedNode[]) {
      if (!completed.has(node.id) || !this.course.isPlayable(node.id)) continue;
      for (const b of node.exercises) {
        if (!b.conceptIds.includes(conceptId) || !this.generatable.has(b.templateId) || seen.has(b.templateId)) continue;
        seen.add(b.templateId);
        out.push({ nodeId: node.id, templateId: b.templateId, scope: effectiveScope(this.course.ix, node, b) });
      }
    }
    return out;
  }

  private generate(c: Candidate, seed: number, pin?: { version: number; fingerprint: string }): ExerciseItem | null {
    try {
      return generateItem(this.course.ix, c.templateId, seed, { scope: c.scope, evidence: "independent", ...(pin ? pin : {}) }).item;
    } catch (e) {
      if (e instanceof EngineError) return null; // stale, unsupported or unlucky: the caller decides what that means
      throw e;
    }
  }

  /**
   * Generate a question for a concept inside its teaching boundary. The effective scope of a lesson binding is coarser than
   * one concept (treble line notes versus every treble stave note), so a concept-level constraint is enforced here, and a
   * question the learner has already met (same music and answer under any seed) is skipped while a fresh one exists.
   * Deterministic: it walks seeds upwards from `base`, so the stored seed regenerates the same question.
   */
  private generateFor(c: Candidate, conceptId: string, base: number, avoid: Set<string>): { item: ExerciseItem; seed: number } | null {
    const constraint = this.constraints.get(conceptId);
    let fallback: { item: ExerciseItem; seed: number } | null = null;
    for (let k = 0; k < 300; k++) {
      const seed = (base + k) % 2 ** 31;
      const item = this.generate(c, seed);
      if (!item) continue;
      if (constraint && !satisfies(item, constraint)) continue;
      if (avoid.has(questionKey(item))) {
        fallback ??= { item, seed };
        continue;
      }
      return { item, seed };
    }
    return fallback; // every candidate was already met: still a valid question, it simply earns no new distinct credit
  }

  private poolCache = new Map<string, Set<string>>();
  /**
   * Every distinct question (by identity) a concept can be asked inside its teaching boundary today, found by sampling
   * seeds. Used to tell a learner honestly when the remaining pool cannot reach the next level, instead of promising progress
   * the content cannot yet provide. Cached per concept and template set for the life of the process.
   */
  poolKeys(conceptId: string, completed: Set<string>): Set<string> {
    const cands = this.candidates(conceptId, completed);
    const id = `${this.course.version}|${conceptId}|${cands.map((c) => c.templateId).join(",")}`;
    const hit = this.poolCache.get(id);
    if (hit) return hit;
    const constraint = this.constraints.get(conceptId);
    const keys = new Set<string>();
    for (const c of cands) {
      for (let seed = 0; seed < 300; seed++) {
        const item = this.generate(c, seed);
        if (item && (!constraint || satisfies(item, constraint))) keys.add(questionKey(item));
      }
    }
    this.poolCache.set(id, keys);
    return keys;
  }

  private resolve(si: SessionItem): { item: ExerciseItem; scope: MusicScope } | null {
    const node = this.course.ix.nodeById.get(si.nodeId);
    const binding = node?.exercises.find((b) => b.templateId === si.templateId);
    if (!node || !binding) return null;
    const scope = effectiveScope(this.course.ix, node, binding);
    const item = this.generate({ nodeId: si.nodeId, templateId: si.templateId, scope }, si.seed, { version: si.templateVersion, fingerprint: si.fingerprint });
    if (!item) return null;
    const constraint = this.constraints.get(si.conceptId);
    if (constraint && !satisfies(item, constraint)) return null; // the boundary moved: stale, never regraded
    return { item, scope };
  }

  private lastUsed(userId: string, conceptId: string): Map<string, string> {
    const rows = this.db
      .prepare("SELECT template_id, MAX(local_date) AS d FROM mastery_evidence WHERE user_id = ? AND concept_id = ? AND source IN ('review-item','independent-step') GROUP BY template_id")
      .all(userId, conceptId) as Array<{ template_id: string; d: string }>;
    return new Map(rows.map((r) => [r.template_id, r.d]));
  }

  /** The concepts due today, in priority order, split into those that can be reviewed now and those that cannot yet. */
  due(userId: string, lt: LearnerTime) {
    const completed = this.completedNodes(userId);
    const all = this.mastery.all(userId, lt.date);
    const dueList = [...all.values()]
      .filter((m) => isDue(m, lt.date))
      .sort((a, b) => Number(b.needsRecovery) - Number(a.needsRecovery) || daysBetween(b.nextDueDate!, lt.date) - daysBetween(a.nextDueDate!, lt.date) || a.conceptId.localeCompare(b.conceptId));
    const ready: Array<{ m: ConceptMastery; cands: Candidate[] }> = [];
    const unavailable: ConceptMastery[] = [];
    for (const m of dueList) {
      const cands = this.candidates(m.conceptId, completed);
      if (cands.length) ready.push({ m, cands });
      else unavailable.push(m);
    }
    return { ready, unavailable };
  }

  // ---- sessions --------------------------------------------------------------------------------------------------

  private row(userId: string, id: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM review_sessions WHERE user_id = ? AND id = ?").get(userId, id) as SessionRow | undefined;
  }
  /** The learner's open session for `date`, if any: what the hub offers to resume, whether or not its topics are still due. */
  openSessionId(userId: string, date: string): string | null {
    const r = this.db.prepare("SELECT id FROM review_sessions WHERE user_id = ? AND status = 'open' AND local_date = ?").get(userId, date) as { id: string } | undefined;
    return r?.id ?? null;
  }

  private openRow(userId: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM review_sessions WHERE user_id = ? AND status = 'open'").get(userId) as SessionRow | undefined;
  }

  /**
   * Open Review. Returns the learner's open session (shared by all their devices), or builds one from what is due today.
   * Nothing due means no session and no invented work.
   */
  start(userId: string) {
    const lt = learnerTime(this.db, this.clock, userId);
    const result = tx(this.db, () => {
      let open = this.openRow(userId);
      if (open && open.local_date !== lt.date) {
        // An old session from an earlier day is closed (its answers stay on record) and a fresh one built from what is due now.
        this.db.prepare("UPDATE review_sessions SET status = 'abandoned' WHERE user_id = ? AND id = ?").run(userId, open.id);
        open = undefined;
      }
      // A session whose every question has gone stale (the generators changed) is closed and rebuilt rather than left unplayable.
      if (open && this.view(userId, open.id).items.length === 0) {
        this.db.prepare("UPDATE review_sessions SET status = 'abandoned' WHERE user_id = ? AND id = ?").run(userId, open.id);
        open = undefined;
      }
      if (open) return { id: open.id };
      const { ready } = this.due(userId, lt);
      if (!ready.length) return null;
      const id = crypto.randomUUID();
      const items: SessionItem[] = [];
      for (const { m, cands } of ready.slice(0, this.opts.maxConcepts)) {
        const used = this.lastUsed(userId, m.conceptId);
        // Vary the question type: templates the learner met least recently come first.
        const ordered = [...cands].sort((a, b) => (used.get(a.templateId) ?? "").localeCompare(used.get(b.templateId) ?? "") || a.templateId.localeCompare(b.templateId));
        let made = 0;
        const avoid = this.mastery.seenKeys(userId, m.conceptId);
        for (const c of ordered) {
          if (made >= this.opts.itemsPerConcept) break;
          const gen = this.generateFor(c, m.conceptId, seedFor(id, m.conceptId, c.templateId), avoid);
          const g = gen && parseGeneratedItemId(gen.item.id);
          if (!gen || !g) continue; // a template that cannot make a question today is skipped, not an error
          avoid.add(questionKey(gen.item));
          items.push({ itemId: gen.item.id, kind: "review", conceptId: m.conceptId, nodeId: c.nodeId, templateId: c.templateId, templateVersion: gen.item.templateVersion, seed: gen.seed, fingerprint: g.fingerprint });
          made++;
        }
      }
      if (!items.length) return null;
      this.db
        .prepare("INSERT INTO review_sessions (user_id,id,status,started_at,local_date,timezone,curriculum_version,rules_version,items) VALUES (?,?,'open',?,?,?,?,?,?)")
        .run(userId, id, lt.iso, lt.date, lt.tz, this.course.version, this.mastery.rules.rulesVersion, JSON.stringify(items));
      return { id };
    });
    if (!result) {
      const { unavailable } = this.due(userId, lt);
      return { session: null, reason: unavailable.length ? ("no_questions_yet" as const) : ("nothing_due" as const), waiting: unavailable.length };
    }
    return { session: this.view(userId, result.id), reason: null, waiting: 0 };
  }

  private attemptsFor(userId: string, sessionId: string) {
    const rows = this.db
      .prepare("SELECT item_id, kind, correct, attempt_number FROM review_attempts WHERE user_id = ? AND session_id = ? ORDER BY attempt_number")
      .all(userId, sessionId) as Array<{ item_id: string; kind: string; correct: number; attempt_number: number }>;
    const by = new Map<string, { attempts: number; correct: boolean; firstTry: boolean }>();
    for (const r of rows) {
      const s = by.get(r.item_id) ?? { attempts: 0, correct: false, firstTry: false };
      s.attempts = Math.max(s.attempts, r.attempt_number);
      if (r.correct) s.correct = true;
      if (r.attempt_number === 1 && r.correct) s.firstTry = true;
      by.set(r.item_id, s);
    }
    return by;
  }

  /** The session as the learner sees it: questions without answers, and what has been answered so far. */
  view(userId: string, id: string) {
    const row = this.row(userId, id);
    if (!row) throw new ApiError(404, "not_found", "That review session does not exist.");
    let items = JSON.parse(row.items) as SessionItem[];
    if (row.status === "open") {
      // A question whose generator has changed since it was made is dropped, never regraded against different music.
      let changed = false;
      items = items.map((si) => {
        if (si.stale) return si;
        if (this.resolve(si)) return si;
        changed = true;
        return { ...si, stale: true };
      });
      if (changed) this.db.prepare("UPDATE review_sessions SET items = ? WHERE user_id = ? AND id = ?").run(JSON.stringify(items), userId, id);
    }
    const attempts = this.attemptsFor(userId, id);
    const lt = learnerTime(this.db, this.clock, userId);
    const mastery = this.mastery.all(userId, lt.date);
    const live = items.filter((i) => !i.stale);
    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      // A finished review is read from its stored summary: its questions are not regenerated (a content update may have
      // made them stale) and nothing is regraded.
      items: (row.status !== "open" ? [] : live).map((si) => {
        const r = this.resolve(si)!;
        const learner: LearnerItem = { ...this.course.learnerItem(r.item, "practice", r.scope), hintCount: 0, evidence: si.kind === "review" ? "independent" : "learning" };
        const a = attempts.get(si.itemId);
        const concept = this.course.ix.concepts.get(si.conceptId);
        return {
          item: learner,
          kind: si.kind,
          conceptId: si.conceptId,
          conceptTitle: concept?.title ?? si.conceptId,
          forItemId: si.forItemId ?? null,
          answered: Boolean(a?.attempts),
          correct: Boolean(a?.correct),
          attempts: a?.attempts ?? 0,
          firstTry: Boolean(a?.firstTry),
        };
      }),
      summary: row.summary ? this.withLive(JSON.parse(row.summary) as Summary, mastery, lt.date) : null,
    };
  }

  private withLive(s: Summary, mastery: Map<string, ConceptMastery>, today: string): Summary {
    return { ...s, concepts: s.concepts.map((c) => ({ ...c, state: mastery.get(c.conceptId)?.state ?? c.state, nextDueDate: mastery.get(c.conceptId)?.nextDueDate ?? c.nextDueDate })), today };
  }

  attempt(userId: string, sessionId: string, attemptId: string, itemId: string, response: Response) {
    const row = this.row(userId, sessionId);
    if (!row) throw new ApiError(404, "not_found", "That review session does not exist.");
    if (row.status !== "open") throw new ApiError(409, "session_closed", "This review session has finished. Start a new one from Review.");
    const items = JSON.parse(row.items) as SessionItem[];
    const si = items.find((i) => i.itemId === itemId && !i.stale);
    if (!si) throw new ApiError(404, "not_found", "Unknown question.");
    const r = this.resolve(si);
    if (!r) throw new ApiError(409, "stale_item", "This question has been updated. Reopen Review.");
    const graded = gradeResponse(this.course.ix, r.item, response, r.scope);

    const prior = this.db.prepare("SELECT session_id, item_id, response, correct, mistake_category, attempt_number FROM review_attempts WHERE user_id = ? AND id = ?").get(userId, attemptId) as
      | { session_id: string; item_id: string; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    if (prior) {
      if (prior.session_id !== sessionId || prior.item_id !== itemId || prior.response !== JSON.stringify(response)) {
        throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      }
      return this.result(userId, attemptId, si, r, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, graded);
    }

    const lt = learnerTime(this.db, this.clock, userId);
    const number = tx(this.db, () => {
      // Re-read inside the transaction: a second device may have answered since we looked.
      const cur = this.row(userId, sessionId)!;
      if (cur.status !== "open") throw new ApiError(409, "session_closed", "This review session has finished. Start a new one from Review.");
      const n = (this.db.prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM review_attempts WHERE user_id = ? AND session_id = ? AND item_id = ?").get(userId, sessionId, itemId) as { n: number }).n + 1;
      this.db
        .prepare("INSERT INTO review_attempts (user_id,id,session_id,item_id,concept_id,kind,template_id,template_version,seed,response,correct,mistake_category,attempt_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(userId, attemptId, sessionId, itemId, si.conceptId, si.kind, si.templateId, si.templateVersion, si.seed, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, n, lt.iso);
      if (n === 1) {
        // Only the first answer to a review item is independent evidence; a remedial answer is learning and is logged as such.
        this.mastery.record(userId, {
          id: `review:${attemptId}`,
          conceptIds: [si.conceptId],
          source: si.kind === "review" ? "review-item" : "remedial-step",
          correct: graded.correct,
          itemId,
          questionKey: questionKey(r.item),
          templateId: si.templateId,
          templateVersion: si.templateVersion,
          seed: si.seed,
          nodeId: si.nodeId,
          sessionId,
          mistakeCategory: graded.category,
        });
        if (si.kind === "review" && !graded.correct) {
          const list = JSON.parse(cur.items) as SessionItem[];
          if (!list.some((x) => x.forItemId === itemId)) {
            const cand: Candidate = { nodeId: si.nodeId, templateId: si.templateId, scope: r.scope };
            // The question just failed is now on record, so the similar question is a different one, inside the same boundary.
            const gen = this.generateFor(cand, si.conceptId, seedFor(sessionId, si.conceptId, si.templateId, `remedial:${itemId}`), this.mastery.seenKeys(userId, si.conceptId));
            const rem = gen?.item;
            const g = rem && parseGeneratedItemId(rem.id);
            if (gen && rem && g) {
              const at = list.findIndex((x) => x.itemId === itemId);
              list.splice(at + 1, 0, { itemId: rem.id, kind: "remedial", conceptId: si.conceptId, nodeId: si.nodeId, templateId: si.templateId, templateVersion: rem.templateVersion, seed: gen.seed, fingerprint: g.fingerprint, forItemId: itemId });
              this.db.prepare("UPDATE review_sessions SET items = ? WHERE user_id = ? AND id = ?").run(JSON.stringify(list), userId, sessionId);
            }
          }
        }
      }
      return n;
    });
    return this.result(userId, attemptId, si, r, graded.correct, graded.category, number, false, graded);
  }

  private result(userId: string, attemptId: string, si: SessionItem, r: { item: ExerciseItem; scope: MusicScope }, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, graded: ReturnType<typeof gradeResponse>) {
    const solution = revealSolution(this.course.ix, r.item, r.scope, correct, attemptNumber);
    const row = this.openRow(userId);
    const list = row ? (JSON.parse(row.items) as SessionItem[]) : [];
    const remedial = list.find((x) => x.forItemId === si.itemId && !x.stale);
    const lt = learnerTime(this.db, this.clock, userId);
    const m = this.mastery.get(userId, si.conceptId, lt.date);
    return {
      correct,
      category,
      message: graded.message,
      /** Why this answer is wrong, from the music rules; never gives the answer away. */
      reason: correct ? null : graded.reason,
      ...(graded.marks ? { marks: graded.marks } : {}),
      ...(graded.parts ? { parts: graded.parts.map((p) => ({ id: p.id, correct: p.correct, reason: p.reason })) } : {}),
      ...(solution ? { solution } : {}),
      attemptNumber,
      replayed,
      kind: si.kind,
      /** True only for the first answer to a review question the learner had never met: the one that earns distinct evidence. */
      counted: si.kind === "review" && attemptNumber === 1 && this.mastery.firstEvidenceId(userId, questionKey(r.item)) === `review:${attemptId}`,
      remedialItemId: !correct && si.kind === "review" ? remedial?.itemId ?? null : null,
      nextDueDate: m?.nextDueDate ?? null,
    };
  }

  /**
   * Finish a session. The status change, the summary, the XP award, the daily-activity row and the badge check are ONE
   * transaction: either all of them commit or none do, so a failure can never leave a completed review without its rewards.
   * Repeating the call reads what was committed.
   */
  complete(userId: string, sessionId: string) {
    const lt = learnerTime(this.db, this.clock, userId);
    const key = `review:${sessionId}`;
    return tx(this.db, () => {
      const row = this.row(userId, sessionId);
      if (!row) throw new ApiError(404, "not_found", "That review session does not exist.");
      if (row.status === "complete") {
        const summary = JSON.parse(row.summary!) as Summary;
        const xp = this.xp.find(userId, key);
        return { ...summary, alreadyComplete: true, xp: xp ?? { awarded: 0, baseXp: 0, capped: false, duplicate: true, reason: "", total: this.xp.total(userId) }, newAchievements: this.achievements.awardedFor(userId, key).map((a) => ({ id: a.id, title: a.title })) };
      }
      if (row.status !== "open") throw new ApiError(409, "session_closed", "This review session was closed. Start a new one from Review.");
      const items = (JSON.parse(row.items) as SessionItem[]).filter((i) => !i.stale);
      const attempts = this.attemptsFor(userId, sessionId);
      const missing = items.filter((i) => !attempts.get(i.itemId)?.attempts).map((i) => i.itemId);
      if (!items.some((i) => i.kind === "review") || missing.length) throw new ApiError(409, "incomplete", "Some questions still need an answer.", { missing });
      const mastery = this.mastery.all(userId, lt.date);
      const concepts = [...new Set(items.map((i) => i.conceptId))].map((conceptId) => {
        const mine = items.filter((i) => i.conceptId === conceptId && i.kind === "review");
        const m = mastery.get(conceptId);
        const firstTry = mine.filter((i) => attempts.get(i.itemId)?.firstTry).length;
        return {
          conceptId,
          title: this.course.ix.concepts.get(conceptId)?.title ?? conceptId,
          questions: mine.length,
          firstTryCorrect: firstTry,
          result: firstTry === mine.length ? ("solid" as const) : ("needs-practice" as const),
          state: m?.state ?? "learning",
          nextDueDate: m?.nextDueDate ?? null,
          mistakeCategories: Object.keys(m?.mistakes ?? {}),
        };
      });
      const reviewItems = items.filter((i) => i.kind === "review");
      const summary: Summary = {
        questions: reviewItems.length,
        firstTryCorrect: reviewItems.filter((i) => attempts.get(i.itemId)?.firstTry).length,
        remedialDone: items.filter((i) => i.kind === "remedial").length,
        concepts,
        today: lt.date,
      };
      this.db.prepare("UPDATE review_sessions SET status = 'complete', completed_at = ?, summary = ? WHERE user_id = ? AND id = ?").run(lt.iso, JSON.stringify(summary), userId, sessionId);
      const xp = this.xp.award(userId, { sourceKey: key, kind: "review_session", nodeId: REVIEW_NODE, nodeType: "review", curriculumVersion: this.course.version }, lt);
      this.activity.record(userId, { sourceKey: key, kind: "review_session", nodeId: REVIEW_NODE }, lt);
      this.achievements.evaluate(userId, mastery, key, lt.iso);
      return { ...summary, alreadyComplete: false, xp, newAchievements: this.achievements.awardedFor(userId, key).map((a) => ({ id: a.id, title: a.title })) };
    });
  }

  history(userId: string, limit = 5) {
    return (this.db.prepare("SELECT id, completed_at, local_date, summary FROM review_sessions WHERE user_id = ? AND status = 'complete' ORDER BY completed_at DESC LIMIT ?").all(userId, limit) as Array<{ id: string; completed_at: string; local_date: string; summary: string }>).map((r) => {
      const s = JSON.parse(r.summary) as Summary;
      return { id: r.id, completedAt: r.completed_at, localDate: r.local_date, questions: s.questions, firstTryCorrect: s.firstTryCorrect, concepts: s.concepts.map((c) => c.title) };
    });
  }
}

export interface Summary {
  questions: number;
  firstTryCorrect: number;
  remedialDone: number;
  concepts: Array<{ conceptId: string; title: string; questions: number; firstTryCorrect: number; result: "solid" | "needs-practice"; state: string; nextDueDate: string | null; mistakeCategories: string[] }>;
  today: string;
}
