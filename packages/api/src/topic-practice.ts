/**
 * Flexible learning: targeted topic practice ("Practise a topic").
 *
 * A learner picks a grade, then the whole grade (mixed), a practice area, a unit or a single topic, and 5, 10 or 20 questions, and
 * starts at once. No lesson has to be completed first. It is deliberately a separate activity from personalised revision
 * (revision.ts), which stays restricted to what the learner has been taught; taught-scope enforcement elsewhere is unchanged.
 *
 * Nothing new is invented to make questions. What can be asked about a topic comes from `ReviewService.candidates`: the generator
 * templates bound to the lesson(s) of that grade that teach the topic, each in that lesson's own teaching scope, so a Grade 5 topic is
 * asked exactly as the Grade 5 lesson frames it, the topic's concept-level boundary (`satisfies`) is enforced by `generateFor`, the
 * engine grades every answer, and a question whose generator has since changed is dropped, never regraded (`resolve`).
 *
 * Formative only (the practice-lab rule from Brief 03):
 *   - no lesson completion, unlocking, XP, daily activity, streak, badge, concept-mastery evidence or examination readiness;
 *   - every answered question and every hint is recorded as question EXPOSURE, so a question met here can never later be fresh
 *     independent evidence in Review, revision or a mock examination (`PrepService.coachedItems` / `helpedKeys` read the same table).
 * If a narrow topic cannot produce as many DIFFERENT questions as were asked for, the session is shorter and says so (`shortfall`);
 * it is never padded with another topic.
 */
import { parseGeneratedItemId, solutionFor } from "@mtp/engine";
import type { ExerciseItem, MusicScope } from "@mtp/curriculum";
import type { Clock } from "./clock.ts";
import type { Course, LearnerItem } from "./course.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import type { Engagement } from "./engagement.ts";
import { ApiError } from "./errors.ts";
import { gradeResponse, revealSolution, type Response } from "./grade.ts";
import { exposeItem } from "./mastery-service.ts";
import type { Candidate, SessionItem } from "./review.ts";

export const TOPIC_PRACTICE_COUNTS = [5, 10, 20] as const;
export type TopicCount = (typeof TOPIC_PRACTICE_COUNTS)[number];
const MAX_COUNT = Math.max(...TOPIC_PRACTICE_COUNTS);
const CAPACITY = new WeakMap<Course, Map<string, number>>();
export type ScopeKind = "grade" | "area" | "unit" | "topic";

/**
 * Learner-facing practice areas. These group the curriculum's own `domain` values (a fixed schema enum) into the headings a learner
 * recognises. Which areas and topics a grade offers is NOT listed here: it is derived from the concepts that grade's lessons teach, so an
 * area with nothing at a grade simply does not appear for it.
 */
export const PRACTICE_AREAS: ReadonlyArray<{ id: string; title: string; domains: readonly string[] }> = [
  { id: "notation", title: "Notes, clefs and notation", domains: ["pitch", "clefs", "accidentals"] },
  { id: "rhythm", title: "Rhythm, rests and time signatures", domains: ["rhythm", "metre"] },
  { id: "keys", title: "Keys, scales and key signatures", domains: ["scales", "keys"] },
  { id: "intervals", title: "Intervals", domains: ["intervals"] },
  { id: "chords", title: "Chords and harmony", domains: ["chords"] },
  { id: "cadences", title: "Cadences", domains: ["cadences"] },
  { id: "transposition", title: "Transposition", domains: ["transposition"] },
  { id: "terms", title: "Musical terms and signs", domains: ["terms", "ornaments"] },
  { id: "score", title: "Score reading", domains: ["context"] },
  { id: "instruments", title: "Instruments and voices", domains: ["instruments", "voices"] },
];
const AREA_OF = new Map(PRACTICE_AREAS.flatMap((a) => a.domains.map((d) => [d, a.id] as const)));

export const TOPIC_PRACTICE_NOTE = "Practice on any topic. It does not change your path, earn XP or count towards mastery, so try anything, with hints.";

interface TopicItem extends SessionItem {
  /** The lesson that teaches this question's topic (for "learn this" links). */
  lessonId: string | null;
}

interface Row {
  id: string;
  status: "open" | "complete" | "abandoned";
  grade: number;
  scope_kind: ScopeKind;
  scope_id: string;
  requested: number;
  started_at: string;
  completed_at: string | null;
  items: string;
  summary: string | null;
}

interface Topic {
  conceptId: string;
  title: string;
  areaId: string;
  domain: string;
  lessons: Array<{ nodeId: string; title: string }>;
}
interface GradeCatalogue {
  grade: number;
  title: string;
  topics: Topic[];
  areas: Array<{ areaId: string; title: string; topics: string[] }>;
  units: Array<{ unitId: string; title: string; sequence: number; topics: string[] }>;
}

export interface TopicPracticeSummary {
  grade: number;
  scope: { kind: ScopeKind; id: string; label: string };
  requested: number;
  questions: number;
  answered: number;
  firstTryCorrect: number;
  hintsUsed: number;
  finishedEarly: boolean;
  concepts: Array<{ conceptId: string; title: string; answered: number; firstTryCorrect: number; lessons: Array<{ nodeId: string; title: string }> }>;
  mistakes: Array<{ itemId: string; conceptTitle: string; prompt: string; slip: string | null; solution: string | null; lesson: { nodeId: string; title: string } | null }>;
  /** Always true: this practice is formative, never mastery, XP or readiness evidence. */
  formative: true;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class TopicPracticeService {
  private catalogues = new Map<number, GradeCatalogue>();
  private slips?: Map<string, string>;

  constructor(
    private db: Db,
    private course: Course,
    private clock: Clock,
    private engagement: Engagement,
    /** Called before a NEW session is planned (rationing); resuming or viewing is free. */
    private ration: (userId: string) => void = () => undefined,
  ) {}

  // ---- what can be practised -----------------------------------------------------------------------------------------

  /** The playable lessons of one grade: the teaching scopes topic practice draws from. */
  private gradeLessons(grade: number): Set<string> {
    return new Set(this.course.nodes.filter((n) => n.grade === grade && (n.type === "lesson" || n.type === "enrichment") && this.course.isPlayable(n.id)).map((n) => n.id));
  }

  private candidates(conceptId: string, grade: number): Candidate[] {
    return this.engagement.review.candidates(conceptId, this.gradeLessons(grade));
  }

  /**
   * How many different questions a topic can supply at this grade, up to the largest count on offer (20). Learner-independent and cached
   * (see `ReviewService.distinctUpTo`). Used to tell the learner BEFORE they start when a topic is small, and to stop planning a topic once
   * it has given everything it has.
   */
  capacity(conceptId: string, grade: number): number {
    // Content-determined, so shared by every service built on the same loaded curriculum (one per process in production, where the
    // review pools are also warmed at start-up and this costs about 30 ms for every topic of every grade).
    let byCourse = CAPACITY.get(this.course);
    if (!byCourse) CAPACITY.set(this.course, (byCourse = new Map()));
    const key = `${grade}|${conceptId}`;
    let n = byCourse.get(key);
    if (n === undefined) byCourse.set(key, (n = this.engagement.review.distinctUpTo(conceptId, this.gradeLessons(grade), MAX_COUNT)));
    return n;
  }

  /** Learner-independent, derived from the curriculum once per grade. */
  catalogue(grade: number): GradeCatalogue {
    const hit = this.catalogues.get(grade);
    if (hit) return hit;
    const world = this.course.view.worlds.find((w) => w.grade === grade);
    if (!world) throw new ApiError(404, "not_found", "That grade does not exist.");
    const topics: Topic[] = [];
    const seen = new Set<string>();
    for (const n of this.course.nodes) {
      if (n.grade !== grade || (n.type !== "lesson" && n.type !== "enrichment") || !this.course.isPlayable(n.id)) continue;
      for (const cid of n.conceptIds) {
        if (seen.has(cid)) continue;
        const c = this.course.ix.concepts.get(cid);
        if (!c || !this.candidates(cid, grade).length) continue;
        seen.add(cid);
        const lessons = (this.course.ix.conceptTaughtBy.get(cid) ?? []).filter((l) => l.grade === grade && this.course.lesson(l.id)).slice(0, 2).map((l) => ({ nodeId: l.id, title: l.title }));
        topics.push({ conceptId: cid, title: c.title, domain: c.domain, areaId: AREA_OF.get(c.domain) ?? "notation", lessons });
      }
    }
    const areas = PRACTICE_AREAS.map((a) => ({ areaId: a.id, title: a.title, topics: topics.filter((t) => t.areaId === a.id).map((t) => t.conceptId) })).filter((a) => a.topics.length);
    const units = world.units
      .map((u) => ({ unitId: u.id, title: u.learnerTitle, sequence: u.sequence, topics: [...new Set(u.nodeIds.flatMap((id) => this.course.ix.nodeById.get(id)?.conceptIds ?? []))].filter((cid) => seen.has(cid)) }))
      .filter((u) => u.topics.length);
    const out = { grade, title: world.learnerTitle, topics, areas, units };
    this.catalogues.set(grade, out);
    return out;
  }

  /** The Practice tab: every grade's areas, units and topics, the counts on offer, and any session to resume. */
  overview(userId: string) {
    const open = this.openRow(userId);
    return {
      counts: [...TOPIC_PRACTICE_COUNTS],
      defaultCount: 10 as TopicCount,
      note: TOPIC_PRACTICE_NOTE,
      /** Every `available` below is the number of different questions a choice can supply, or null when it can fill the largest count. */
      grades: this.course.view.worlds.map((w) => {
        const c = this.catalogue(w.grade);
        const title = new Map(c.topics.map((t) => [t.conceptId, t.title]));
        const cap = (ids: string[]) => {
          let n = 0;
          for (const id of ids) if ((n += this.capacity(id, c.grade)) >= MAX_COUNT) return null;
          return n;
        };
        return {
          grade: c.grade,
          title: c.title,
          topicCount: c.topics.length,
          available: cap(c.topics.map((t) => t.conceptId)),
          areas: c.areas.map((a) => ({ areaId: a.areaId, title: a.title, available: cap(a.topics), topics: a.topics.map((id) => ({ conceptId: id, title: title.get(id)!, available: cap([id]) })) })),
          units: c.units.map((u) => ({ unitId: u.unitId, title: u.title, sequence: u.sequence, topics: u.topics.length, available: cap(u.topics) })),
        };
      }),
      open: open ? { id: open.id, grade: open.grade, label: this.label(open.grade, open.scope_kind, open.scope_id), startedAt: open.started_at } : null,
    };
  }

  private label(grade: number, kind: ScopeKind, id: string): string {
    const c = this.catalogue(grade);
    if (kind === "grade") return `Mixed Grade ${grade}`;
    if (kind === "area") return PRACTICE_AREAS.find((a) => a.id === id)?.title ?? id;
    if (kind === "unit") return c.units.find((u) => u.unitId === id)?.title ?? id;
    return c.topics.find((t) => t.conceptId === id)?.title ?? id;
  }

  /** The topics a choice covers, or a 400 when the choice does not belong to that grade (no silent substitution). */
  private topicsFor(grade: number, kind: ScopeKind, id: string): Topic[] {
    const c = this.catalogue(grade);
    const pick = (ids: string[]) => c.topics.filter((t) => ids.includes(t.conceptId));
    const out: Topic[] =
      kind === "grade" ? (id === String(grade) ? c.topics : [])
      : kind === "area" ? pick(c.areas.find((a) => a.areaId === id)?.topics ?? [])
      : kind === "unit" ? pick(c.units.find((u) => u.unitId === id)?.topics ?? [])
      : pick([id]);
    if (!out.length) throw new ApiError(400, "bad_scope", `That is not a Grade ${grade} topic, area or unit.`);
    return out;
  }

  // ---- building a session -------------------------------------------------------------------------------------------------

  /**
   * Interleave across areas (so neighbouring questions ask for different kinds of thinking), shuffled by the session id, then fill round-robin:
   * each topic in turn, rotating through its question types. Questions come from the topic's sampled pools (`ReviewService.candidateQuestions`,
   * warmed at start-up), so a start generates only the questions it keeps, with no seed search on the request thread (review of PR #26, P2).
   * Identity is what the learner SEES (`visibleKey`): no two questions in a session look alike, and questions the learner has met (in either
   * identity) come only after every new one. A topic that runs out of different questions simply stops; nothing is borrowed from another.
   */
  private build(userId: string, sessionId: string, grade: number, topics: Topic[], total: number): TopicItem[] {
    const byArea = new Map<string, Topic[]>();
    for (const t of topics) byArea.set(t.areaId, [...(byArea.get(t.areaId) ?? []), t]);
    const queues = [...byArea.values()].map((q) => [...q].sort((a, b) => hash(`${sessionId}|${a.conceptId}`) - hash(`${sessionId}|${b.conceptId}`)));
    const ordered: Topic[] = [];
    while (queues.some((q) => q.length)) for (const q of queues) if (q.length) ordered.push(q.shift()!);
    const shuffle = <T extends { visible: string }>(xs: T[]) => [...xs].sort((a, b) => hash(`${sessionId}|${a.visible}`) - hash(`${sessionId}|${b.visible}`));
    const plans = ordered.slice(0, Math.max(1, total)).map((t) => {
      const seen = this.engagement.mastery.seenKeys(userId, t.conceptId);
      const types = [...this.candidates(t.conceptId, grade)]
        .sort((a, b) => hash(`${sessionId}|${a.templateId}`) - hash(`${sessionId}|${b.templateId}`))
        .map((cand) => {
          const qs = this.engagement.review.candidateQuestions(t.conceptId, cand);
          const met = (q: { key: string; visible: string }) => seen.has(q.key) || seen.has(q.visible);
          return { cand, fresh: shuffle(qs.filter((q) => !met(q))), again: shuffle(qs.filter(met)) };
        });
      return { t, types, turn: 0 };
    });
    const used = new Set<string>();
    /** The topic's next question: the next question type in turn that still has a new one, before any it has already met; null when it has none. */
    const next = (p: (typeof plans)[number]) => {
      for (const pool of ["fresh", "again"] as const) {
        for (let k = 0; k < p.types.length; k++) {
          const ty = p.types[(p.turn + k) % p.types.length]!;
          const list = ty[pool];
          while (list.length && used.has(list[0]!.visible)) list.shift();
          const q = list.shift();
          if (q) {
            p.turn = (p.turn + k + 1) % p.types.length;
            return { cand: ty.cand, q };
          }
        }
      }
      return null;
    };
    const items: TopicItem[] = [];
    let progress = true;
    while (items.length < total && progress) {
      progress = false;
      for (const p of plans) {
        if (items.length >= total) break;
        const pick = next(p);
        if (!pick) continue;
        progress = true;
        used.add(pick.q.visible);
        // Reproduce the sampled question exactly (its seed already satisfies the topic's boundary); a generator that changed since the pool was
        // sampled is skipped, never substituted.
        const gen = this.engagement.review.generateFor(pick.cand, p.t.conceptId, pick.q.seed, new Set());
        const g = gen && parseGeneratedItemId(gen.item.id);
        if (!gen || !g || gen.seed !== pick.q.seed) continue;
        items.push({ itemId: gen.item.id, kind: "review", conceptId: p.t.conceptId, nodeId: pick.cand.nodeId, templateId: pick.cand.templateId, templateVersion: gen.item.templateVersion, seed: gen.seed, fingerprint: g.fingerprint, lessonId: p.t.lessons[0]?.nodeId ?? null });
      }
    }
    return items;
  }

  private openRow(userId: string): Row | undefined {
    return this.db.prepare("SELECT * FROM topic_practice_sessions WHERE user_id = ? AND status = 'open' ORDER BY started_at DESC LIMIT 1").get(userId) as Row | undefined;
  }
  private rowOf(userId: string, id: string): Row {
    const r = this.db.prepare("SELECT * FROM topic_practice_sessions WHERE user_id = ? AND id = ?").get(userId, id) as Row | undefined;
    if (!r) throw new ApiError(404, "not_found", "That practice session does not exist.");
    return r;
  }

  /**
   * Start a new session for this choice. Any other open topic-practice session is closed first (its answers stay on record), so "Practise
   * again" and a new choice both simply start fresh. A choice that cannot make even one question returns `{ session: null, reason }`.
   */
  start(userId: string, params: { grade: number; kind: ScopeKind; id: string; count: number }) {
    if (!TOPIC_PRACTICE_COUNTS.includes(params.count as TopicCount)) throw new ApiError(400, "bad_request", "Choose 5, 10 or 20 questions.");
    const topics = this.topicsFor(params.grade, params.kind, params.id);
    this.ration(userId);
    const id = crypto.randomUUID();
    const items = this.build(userId, id, params.grade, topics, params.count);
    if (!items.length) return { session: null, reason: "no_questions" as const };
    const at = this.clock.now().toISOString();
    tx(this.db, () => {
      this.db.prepare("UPDATE topic_practice_sessions SET status = 'abandoned', completed_at = ? WHERE user_id = ? AND status = 'open'").run(at, userId);
      this.db
        .prepare("INSERT INTO topic_practice_sessions (user_id,id,status,grade,scope_kind,scope_id,requested,started_at,curriculum_version,items) VALUES (?,?,'open',?,?,?,?,?,?,?)")
        .run(userId, id, params.grade, params.kind, params.id, params.count, at, this.course.version, JSON.stringify(items));
    });
    return { session: this.view(userId, id), reason: null };
  }

  // ---- playing -------------------------------------------------------------------------------------------------------------

  private attemptsFor(userId: string, sessionId: string) {
    const rows = this.db.prepare("SELECT item_id, correct, attempt_number, hints_used FROM topic_practice_attempts WHERE user_id = ? AND session_id = ? ORDER BY attempt_number").all(userId, sessionId) as Array<{ item_id: string; correct: number; attempt_number: number; hints_used: number }>;
    const by = new Map<string, { attempts: number; correct: boolean; firstTry: boolean; hints: number }>();
    for (const r of rows) {
      const s = by.get(r.item_id) ?? { attempts: 0, correct: false, firstTry: false, hints: 0 };
      s.attempts = Math.max(s.attempts, r.attempt_number);
      s.hints = Math.max(s.hints, r.hints_used);
      if (r.correct) s.correct = true;
      if (r.attempt_number === 1 && r.correct && r.hints_used === 0) s.firstTry = true;
      by.set(r.item_id, s);
    }
    return by;
  }

  private items(row: Row): TopicItem[] {
    return JSON.parse(row.items) as TopicItem[];
  }

  private lessonRef(nodeId: string | null) {
    const n = nodeId ? this.course.ix.nodeById.get(nodeId) : undefined;
    return n ? { nodeId: n.id, title: n.title } : null;
  }

  view(userId: string, id: string) {
    const row = this.rowOf(userId, id);
    let items = this.items(row);
    if (row.status === "open") {
      // A question whose generator changed since it was planned is dropped, never regraded against different music.
      let changed = false;
      items = items.map((si) => (si.stale || this.engagement.review.resolve(si) ? si : ((changed = true), { ...si, stale: true })));
      if (changed) this.db.prepare("UPDATE topic_practice_sessions SET items = ? WHERE user_id = ? AND id = ?").run(JSON.stringify(items), userId, id);
    }
    const live = items.filter((i) => !i.stale);
    // Every planned question went stale (its generator changed): the session cannot continue, so it is closed, answers kept, and says so
    // (review of PR #26, finding 6) instead of offering an empty session forever.
    const allStale = items.length > 0 && live.length === 0;
    if (allStale && row.status === "open") {
      this.db.prepare("UPDATE topic_practice_sessions SET status = 'abandoned', completed_at = ? WHERE user_id = ? AND id = ? AND status = 'open'").run(this.clock.now().toISOString(), userId, id);
      row.status = "abandoned";
    }
    const by = this.attemptsFor(userId, id);
    return {
      id: row.id,
      status: row.status,
      /** The questions were updated since this session was planned, so it was closed. Start a new one for the same choice. */
      allStale,
      grade: row.grade,
      scope: { kind: row.scope_kind, id: row.scope_id, label: this.label(row.grade, row.scope_kind, row.scope_id) },
      requested: row.requested,
      /** Set when the choice could not supply as many different questions as were asked for. Never filled from another topic. */
      shortfall: live.length < row.requested ? { requested: row.requested, available: live.length } : null,
      startedAt: row.started_at,
      note: TOPIC_PRACTICE_NOTE,
      items: row.status !== "open" ? [] : live.map((si) => {
        const r = this.engagement.review.resolve(si)!;
        const learner: LearnerItem = { ...this.course.learnerItem(r.item, "practice", r.scope), hintCount: r.item.hints.length, evidence: "learning" };
        const a = by.get(si.itemId);
        return { item: learner, conceptId: si.conceptId, conceptTitle: this.course.ix.concepts.get(si.conceptId)?.title ?? si.conceptId, lesson: this.lessonRef(si.lessonId), answered: Boolean(a?.attempts), correct: Boolean(a?.correct), attempts: a?.attempts ?? 0, firstTry: Boolean(a?.firstTry) };
      }),
      summary: row.summary ? (JSON.parse(row.summary) as TopicPracticeSummary) : null,
    };
  }

  private live(userId: string, sessionId: string, itemId: string) {
    const row = this.rowOf(userId, sessionId);
    if (row.status !== "open") throw new ApiError(409, "session_closed", "This practice session has finished. Start a new one.");
    const si = this.items(row).find((i) => i.itemId === itemId && !i.stale);
    if (!si) throw new ApiError(404, "not_found", "Unknown question.");
    const r = this.engagement.review.resolve(si);
    if (!r) throw new ApiError(409, "stale_item", "This question has been updated. Reopen the session.");
    return { row, si, r };
  }

  /** A hint, logged by the server. The question is recorded as met with help, so it can never later count as independent evidence. */
  hint(userId: string, sessionId: string, itemId: string, level: number) {
    const { r } = this.live(userId, sessionId, itemId);
    if (level < 1 || level > r.item.hints.length) throw new ApiError(400, "bad_request", "No such hint.");
    const at = this.clock.now().toISOString();
    tx(this.db, () => {
      this.db.prepare("INSERT OR IGNORE INTO topic_practice_hint_uses (user_id,session_id,item_id,level,created_at) VALUES (?,?,?,?,?)").run(userId, sessionId, itemId, level, at);
      exposeItem(this.db, userId, r.item, "practice-hint", at);
    });
    return { hint: r.item.hints[level - 1]!, level };
  }

  /** Grade server-side and record. Replaying the same attemptId returns the stored result and records nothing new. */
  attempt(userId: string, sessionId: string, attemptId: string, itemId: string, response: Response) {
    const prior = this.db.prepare("SELECT session_id, item_id, response, correct, mistake_category, attempt_number FROM topic_practice_attempts WHERE user_id = ? AND id = ?").get(userId, attemptId) as
      | { session_id: string; item_id: string; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    if (prior) {
      if (prior.session_id !== sessionId || prior.item_id !== itemId || prior.response !== JSON.stringify(response)) throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      const row = this.rowOf(userId, sessionId);
      const si = this.items(row).find((i) => i.itemId === itemId);
      const r = si && this.engagement.review.resolve(si);
      if (!r) throw new ApiError(409, "stale_item", "This question has been updated. Reopen the session.");
      return this.reply(r, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, gradeResponse(this.course.ix, r.item, response, r.scope));
    }
    const { si, r } = this.live(userId, sessionId, itemId);
    const graded = gradeResponse(this.course.ix, r.item, response, r.scope);
    const at = this.clock.now().toISOString();
    const n = tx(this.db, () => {
      const cur = this.rowOf(userId, sessionId);
      if (cur.status !== "open") throw new ApiError(409, "session_closed", "This practice session has finished. Start a new one.");
      const k = (this.db.prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM topic_practice_attempts WHERE user_id = ? AND session_id = ? AND item_id = ?").get(userId, sessionId, itemId) as { n: number }).n + 1;
      const hints = (this.db.prepare("SELECT COUNT(*) AS c FROM topic_practice_hint_uses WHERE user_id = ? AND session_id = ? AND item_id = ?").get(userId, sessionId, itemId) as { c: number }).c;
      this.db
        .prepare("INSERT INTO topic_practice_attempts (user_id,id,session_id,item_id,concept_id,template_id,template_version,seed,response,correct,mistake_category,hints_used,attempt_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(userId, attemptId, sessionId, itemId, si.conceptId, si.templateId, si.templateVersion, si.seed, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, hints, k, at);
      // Formative: the learner sees the verdict, the explanation and (after repeated tries) the worked answer, so the question is exposed.
      // No mastery evidence, XP or activity is recorded.
      exposeItem(this.db, userId, r.item, "practice-attempt", at);
      return k;
    });
    return this.reply(r, graded.correct, graded.category, n, false, graded);
  }

  private reply(r: { item: ExerciseItem; scope: MusicScope }, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, graded: ReturnType<typeof gradeResponse>) {
    const solution = revealSolution(this.course.ix, r.item, r.scope, correct, attemptNumber);
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

  private slipOf(category: string | null): string | null {
    if (!category) return null;
    if (!this.slips) {
      this.slips = new Map();
      for (const f of this.course.ix.families.values()) for (const m of f.mistakeCategories) if (!this.slips.has(m.id)) this.slips.set(m.id, m.description);
    }
    return this.slips.get(category) ?? null;
  }

  /**
   * Finish, early or not. Whatever was answered stays on record; nothing is marked wrong for what was not reached. The summary is stored,
   * so a retried finish returns the same reply. It shows first-attempt accuracy, the questions missed first time with the worked answer
   * (only for questions the learner actually answered, which are already recorded as exposed), and the lessons that explain them.
   */
  complete(userId: string, sessionId: string) {
    return tx(this.db, () => {
      const row = this.rowOf(userId, sessionId);
      if (row.status === "complete") return { ...(JSON.parse(row.summary!) as TopicPracticeSummary), alreadyComplete: true };
      if (row.status !== "open") throw new ApiError(409, "session_closed", "This practice session was closed. Start a new one.");
      const items = this.items(row).filter((i) => !i.stale);
      const by = this.attemptsFor(userId, sessionId);
      const answered = items.filter((i) => by.get(i.itemId)?.attempts);
      const title = (cid: string) => this.course.ix.concepts.get(cid)?.title ?? cid;
      const firstWrong = new Map((this.db.prepare("SELECT item_id, mistake_category FROM topic_practice_attempts WHERE user_id = ? AND session_id = ? AND attempt_number = 1 AND correct = 0").all(userId, sessionId) as Array<{ item_id: string; mistake_category: string | null }>).map((r) => [r.item_id, r.mistake_category]));
      const catalogue = this.catalogue(row.grade);
      const lessonsOf = (cid: string) => catalogue.topics.find((t) => t.conceptId === cid)?.lessons ?? [];
      const concepts = [...new Set(answered.map((i) => i.conceptId))].map((cid) => {
        const mine = answered.filter((i) => i.conceptId === cid);
        const ok = mine.filter((i) => by.get(i.itemId)?.firstTry).length;
        return { conceptId: cid, title: title(cid), answered: mine.length, firstTryCorrect: ok, lessons: ok === mine.length ? [] : lessonsOf(cid) };
      });
      const mistakes = answered
        .filter((i) => !by.get(i.itemId)?.firstTry)
        .slice(0, 10)
        .map((i) => {
          const r = this.engagement.review.resolve(i);
          return {
            itemId: i.itemId,
            conceptTitle: title(i.conceptId),
            prompt: r?.item.prompt ?? "",
            slip: this.slipOf(firstWrong.get(i.itemId) ?? null),
            solution: r ? solutionFor(this.course.ix, r.item, r.scope) : null,
            lesson: this.lessonRef(i.lessonId),
          };
        });
      const summary: TopicPracticeSummary = {
        grade: row.grade,
        scope: { kind: row.scope_kind, id: row.scope_id, label: this.label(row.grade, row.scope_kind, row.scope_id) },
        requested: row.requested,
        questions: items.length,
        answered: answered.length,
        firstTryCorrect: answered.filter((i) => by.get(i.itemId)?.firstTry).length,
        // Every hint shown, including on a question left unanswered (review of PR #26, finding 9).
        hintsUsed: (this.db.prepare("SELECT COUNT(*) AS c FROM topic_practice_hint_uses WHERE user_id = ? AND session_id = ?").get(userId, sessionId) as { c: number }).c,
        finishedEarly: answered.length < items.length,
        concepts,
        mistakes,
        formative: true,
      };
      this.db.prepare("UPDATE topic_practice_sessions SET status = 'complete', completed_at = ?, summary = ? WHERE user_id = ? AND id = ?").run(this.clock.now().toISOString(), JSON.stringify(summary), userId, sessionId);
      return { ...summary, alreadyComplete: false };
    });
  }

  /** Server-side only (never routed): the session's questions WITH their answers, for tests. Nothing in the HTTP API returns these. */
  internalItems(userId: string, sessionId: string): Array<{ itemId: string; conceptId: string; item: ExerciseItem; scope: MusicScope }> {
    return this.items(this.rowOf(userId, sessionId)).flatMap((si) => {
      const r = this.engagement.review.resolve(si);
      return r ? [{ itemId: si.itemId, conceptId: si.conceptId, item: r.item, scope: r.scope }] : [];
    });
  }

  /** Leave without finishing. Answers stay on record; nothing is awarded or penalised. Idempotent. */
  abandon(userId: string, sessionId: string) {
    const row = this.rowOf(userId, sessionId);
    if (row.status === "open") this.db.prepare("UPDATE topic_practice_sessions SET status = 'abandoned', completed_at = ? WHERE user_id = ? AND id = ?").run(this.clock.now().toISOString(), userId, sessionId);
    return { ok: true as const, status: this.rowOf(userId, sessionId).status };
  }
}
