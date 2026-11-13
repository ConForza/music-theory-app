/**
 * Server-built path nodes (Brief 05): unit practice, unit review, unit challenges and the Grade assessment.
 *
 * Lessons are fixed authored items. These four node kinds have no authored items: the server plans each run from the
 * node's exercise bindings (practice, review) or its assessment blueprint (challenge, assessment), generating every
 * question with the Brief 03 engine inside what the learner has actually been taught. Seeds, template versions and
 * generation fingerprints are stored with the run, so a question can always be reproduced and a question whose
 * generator has since changed is replaced instead of regraded. The server grades every answer; the browser only sends
 * a response and never a verdict, a score or a question.
 *
 *   practice    retries and hints allowed; a run completes when every question has been answered correctly.
 *   review      the same, without hints; first answers are review evidence for the concepts the questions exercise.
 *   challenge   first answer is final, no hints, no retries; the run completes only on reaching the pass mark.
 *   assessment  as a challenge, over the Grade blueprint; passing it is the only way to complete the grade.
 *
 * Completion always goes through `lesson_progress`, so the path, XP, streaks and badges keep one source of truth.
 * A challenge or assessment below the pass mark is stored as an honest result (`assessment_results`), earns nothing,
 * completes nothing, and can be retried with fresh questions.
 */
import { checkItem, effectiveScope, mergeScope, type AssessmentTemplate, type ExerciseBinding, type ExerciseItem, type MusicScope, type OrderedNode } from "@mtp/curriculum";
import { EngineError, generateItem, generatorTemplateIds, hashString, parseGeneratedItemId } from "@mtp/engine";
import type { Clock } from "./clock.ts";
import type { Course, LearnerItem, SessionKind } from "./course.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import type { Engagement } from "./engagement.ts";
import { ApiError } from "./errors.ts";
import { gradeResponse, revealSolution, type Response } from "./grade.ts";
import { STATE_ORDER, type ConceptMastery, type EvidenceSource } from "./mastery.ts";
import { learnerTime, recordExposure } from "./mastery-service.ts";
import { loadConstraints, questionKey, satisfies, visibleKey, type ReviewConstraint } from "./question-key.ts";
import { computeNodeStates, type PathPolicy } from "./path-state.ts";

/** Words shown with every result: this is practice material, never an examination outcome. */
export const ASSESSMENT_DISCLAIMER = "This is Music Theory Path's own practice check. It is not an ABRSM examination, and passing it is not an ABRSM result or certificate.";

interface PlannedItem {
  itemId: string;
  templateId: string;
  templateVersion: number;
  seed: number;
  fingerprint: string;
  /** Where the scope comes from: one node's binding (practice, review) or everything taught so far (challenge, assessment). */
  scope: { mode: "binding"; nodeId: string } | { mode: "taught" };
  /** Concepts this question counts for: only those whose teaching boundary the question really sits inside. */
  conceptIds: string[];
  sectionId?: string;
  outcomeId?: string;
}

interface SessionRow {
  id: string;
  node_id: string;
  run: number;
  kind: SessionKind;
  status: "open" | "complete" | "not_passed";
  started_at: string;
  completed_at: string | null;
  content_version: number;
  items: string;
  summary: string | null;
}

export interface NodeItemView {
  item: LearnerItem;
  sectionId: string | null;
  answered: boolean;
  correct: boolean;
  attempts: number;
  hintsUsed: number;
  firstTry: boolean;
}

export interface NodeSummary {
  kind: SessionKind;
  questions: number;
  firstTryCorrect: number;
  hintsUsed: number;
  /** Challenge and assessment only. */
  score?: number;
  percent?: number;
  passPercent?: number;
  passed?: boolean;
  sections?: Array<{ id: string; title: string; correct: number; total: number }>;
  outcomes?: Array<{ outcomeId: string; statement: string; correct: number; total: number; revisit: string[] }>;
  mistakes?: Array<{ category: string; count: number }>;
  disclaimer?: string;
  completedAt: string;
}

const seedOf = (...parts: Array<string | number>) => (hashString(parts.join("|")) >>> 0) % 2 ** 31;
const stateRank = (m: ConceptMastery | undefined) => (m ? (m.state === "review_due" ? 3 : STATE_ORDER.indexOf(m.state)) : 0);

export class NodeRunService {
  private generatable: Set<string>;
  private constraints: Map<string, ReviewConstraint>;
  private unionCache = new Map<string, MusicScope | null>();

  constructor(
    private db: Db,
    private course: Course,
    private policy: PathPolicy,
    private clock: Clock,
    private engagement: Engagement,
  ) {
    this.generatable = new Set(generatorTemplateIds(course.ix));
    this.constraints = loadConstraints(course.ix.c.root, course.ix.concepts);
  }

  // ---- scope and crediting -------------------------------------------------------------------------------------

  private teachingNodesBefore(node: OrderedNode): OrderedNode[] {
    return this.course.nodes.filter((n) => n.order <= node.order && n.grade <= node.grade && (n.type === "lesson" || n.type === "enrichment"));
  }

  /** Everything a template may use at `node`: the union of its lesson bindings' effective scopes up to that point. */
  private taughtUnion(templateId: string, node: OrderedNode): MusicScope | null {
    const key = `${templateId}|${node.id}`;
    if (this.unionCache.has(key)) return this.unionCache.get(key)!;
    let scope: MusicScope | null = null;
    for (const n of this.teachingNodesBefore(node)) {
      const b = n.exercises.find((x) => x.templateId === templateId);
      if (b) scope = scope ? mergeScope(scope, effectiveScope(this.course.ix, n, b)) : effectiveScope(this.course.ix, n, b);
    }
    this.unionCache.set(key, scope);
    return scope;
  }

  private scopeOf(si: PlannedItem, node: OrderedNode): MusicScope | null {
    if (si.scope.mode === "taught") return this.taughtUnion(si.templateId, node);
    const bn = this.course.ix.nodeById.get(si.scope.nodeId);
    const b = bn?.exercises.find((x) => x.templateId === si.templateId);
    return bn && b ? effectiveScope(this.course.ix, bn, b) : null;
  }

  private fits(item: ExerciseItem, scope: MusicScope): boolean {
    let ok = true;
    checkItem(item, scope, item.id, (_c, _w, _m, severity = "error") => {
      if (severity === "error") ok = false;
    });
    return ok;
  }

  /**
   * The concepts a question counts for: those of a lesson binding (up to this node) whose scope the question fits, and whose
   * concept-level boundary (for example "treble line notes only") it satisfies. A bass-clef note never counts for a treble concept.
   */
  creditedConcepts(item: ExerciseItem, node: OrderedNode, restrictTo?: string[]): string[] {
    const out = new Set<string>();
    for (const n of this.teachingNodesBefore(node)) {
      const b = n.exercises.find((x) => x.templateId === item.templateId);
      if (!b || !this.fits(item, effectiveScope(this.course.ix, n, b))) continue;
      for (const c of b.conceptIds) {
        const k = this.constraints.get(c);
        if ((!k || satisfies(item, k)) && (!restrictTo || restrictTo.includes(c))) out.add(c);
      }
    }
    return [...out];
  }

  // ---- planning ------------------------------------------------------------------------------------------------

  private gen(templateId: string, seed: number, scope: MusicScope, pin?: { version: number; fingerprint: string }): ExerciseItem | null {
    try {
      return generateItem(this.course.ix, templateId, seed, { scope, evidence: "independent", ...(pin ?? {}) }).item;
    } catch (e) {
      if (e instanceof EngineError) return null;
      throw e;
    }
  }

  /** Walk seeds upward from `base` for a question that is new to this run and, where possible, new to the learner. */
  private pick(templateId: string, scope: MusicScope, base: number, avoid: Set<string>, usedInRun: Set<string>, accept: (i: ExerciseItem) => boolean): { item: ExerciseItem; seed: number } | null {
    let fallback: { item: ExerciseItem; seed: number } | null = null;
    for (let k = 0; k < 400; k++) {
      const seed = (base + k) % 2 ** 31;
      const item = this.gen(templateId, seed, scope);
      if (!item || !accept(item)) continue;
      const key = questionKey(item);
      if (usedInRun.has(visibleKey(item))) continue;
      if (avoid.has(key)) {
        fallback ??= { item, seed };
        continue;
      }
      return { item, seed };
    }
    return fallback;
  }

  private seenByLearner(userId: string, conceptIds: string[]): Set<string> {
    const seen = new Set<string>();
    for (const c of conceptIds) for (const k of this.engagement.mastery.seenKeys(userId, c)) seen.add(k);
    return seen;
  }

  private plan(userId: string, node: OrderedNode, run: number, kind: SessionKind, salt = 0): PlannedItem[] {
    const items: PlannedItem[] = [];
    const used = new Set<string>();
    const push = (item: ExerciseItem, seed: number, scope: PlannedItem["scope"], concepts: string[], extra: Partial<PlannedItem> = {}) => {
      const g = parseGeneratedItemId(item.id);
      if (!g || !concepts.length) return false;
      used.add(visibleKey(item));
      items.push({ itemId: item.id, templateId: item.templateId, templateVersion: item.templateVersion, seed, fingerprint: g.fingerprint, scope, conceptIds: concepts, ...extra });
      return true;
    };

    if (kind === "practice" || kind === "review") {
      const bindings = node.exercises.filter((b) => this.generatable.has(b.templateId));
      let order = bindings;
      let total = Math.min(10, Math.max(6, bindings.length * 2));
      if (kind === "review") {
        const lt = learnerTime(this.db, this.clock, userId);
        const mastery = this.engagement.mastery.all(userId, lt.date);
        // Weakest first: concepts that lapsed, then those that are due, then the least-practised.
        const weight = (b: ExerciseBinding) => Math.min(...b.conceptIds.map((c) => (mastery.get(c)?.needsRecovery ? -2 : mastery.get(c)?.state === "review_due" ? -1 : stateRank(mastery.get(c)))));
        order = [...bindings].sort((a, b) => weight(a) - weight(b) || hashString(`${userId}|${node.id}|${a.templateId}`) - hashString(`${userId}|${node.id}|${b.templateId}`));
        total = Math.min(10, Math.max(6, Math.ceil(bindings.length * 0.8)));
      }
      let rounds = 0;
      while (items.length < total && rounds < 4) {
        for (const b of order) {
          if (items.length >= total) break;
          const scope = effectiveScope(this.course.ix, node, b);
          const avoid = this.seenByLearner(userId, b.conceptIds);
          const base = seedOf(userId, node.id, run, salt, b.templateId, rounds);
          const got = this.pick(b.templateId, scope, base, avoid, used, (i) => this.creditedConcepts(i, node, b.conceptIds).length > 0);
          if (got) push(got.item, got.seed, { mode: "binding", nodeId: node.id }, this.creditedConcepts(got.item, node, b.conceptIds));
        }
        rounds++;
      }
      return items;
    }

    // Challenge and assessment: the node's blueprint, sampled from everything taught up to here. Each question must test the
    // outcome its section is labelled with: it must credit at least one concept that belongs to that outcome (so a rests section
    // never serves a question with no rest in it), and a section that cannot be filled makes the whole plan fail loudly rather than
    // quietly shrinking the blueprint.
    const blueprint = this.course.ix.assessments.get(node.assessmentId!) as AssessmentTemplate;
    for (const s of blueprint.sections) {
      const wanted = new Set([...this.course.ix.concepts.values()].filter((c) => c.outcomeIds.some((o) => s.outcomeIds.includes(o))).map((c) => c.id));
      const templates = s.templateIds.filter((t) => this.generatable.has(t) && this.taughtUnion(t, node));
      let made = 0;
      for (let i = 0; i < s.itemCount && templates.length; i++) {
        const shift = (seedOf(userId, node.id, run, s.id) + i) % templates.length;
        const order = [...templates.slice(shift), ...templates.slice(0, shift)];
        for (const t of order) {
          const scope = this.taughtUnion(t, node)!;
          const probe = (it: ExerciseItem) => this.creditedConcepts(it, node).some((c) => wanted.has(c));
          const got = this.pick(t, scope, seedOf(userId, node.id, run, salt, s.id, i, t), this.seenByLearner(userId, this.conceptsOf(t, node)), used, probe);
          if (got && push(got.item, got.seed, { mode: "taught" }, this.creditedConcepts(got.item, node), { sectionId: s.id, outcomeId: s.outcomeIds[0] })) {
            made++;
            break;
          }
        }
      }
      if (made < s.itemCount) throw new ApiError(503, "generation_failed", "We couldn't make a complete set of questions just now. Please try again.");
    }
    return items;
  }

  private conceptsOf(templateId: string, node: OrderedNode): string[] {
    return [...new Set(this.teachingNodesBefore(node).flatMap((n) => n.exercises.filter((b) => b.templateId === templateId).flatMap((b) => b.conceptIds)))];
  }

  private resolve(si: PlannedItem, node: OrderedNode): { item: ExerciseItem; scope: MusicScope } | null {
    const scope = this.scopeOf(si, node);
    if (!scope) return null;
    const item = this.gen(si.templateId, si.seed, scope, { version: si.templateVersion, fingerprint: si.fingerprint });
    return item ? { item, scope } : null;
  }

  // ---- access ---------------------------------------------------------------------------------------------------

  private states(userId: string) {
    const rows = this.db.prepare("SELECT node_id, run, run_open, phase, content_version, completed_at, completed_content_version FROM lesson_progress WHERE user_id = ?").all(userId) as never[];
    return computeNodeStates(this.course, rows, this.policy);
  }

  private nodeOf(userId: string, nodeId: string): { node: OrderedNode; kind: SessionKind } {
    const node = this.course.ix.nodeById.get(nodeId);
    if (!node) throw new ApiError(404, "not_found", "That activity does not exist.");
    const state = this.states(userId).get(nodeId)!;
    if (state.state === "coming_soon") throw new ApiError(409, "coming_soon", "This activity is still being written.");
    const kind = this.course.sessionKind(nodeId);
    if (!kind) throw new ApiError(409, "not_a_session", "That is a lesson, not a practice activity.");
    if (state.state === "locked") throw new ApiError(403, "locked", "Finish the earlier lessons first.", { lockedBy: state.lockedBy });
    return { node, kind };
  }

  private sessionRow(userId: string, nodeId: string, run?: number): SessionRow | undefined {
    return (run === undefined
      ? this.db.prepare("SELECT * FROM node_sessions WHERE user_id = ? AND node_id = ? ORDER BY run DESC LIMIT 1").get(userId, nodeId)
      : this.db.prepare("SELECT * FROM node_sessions WHERE user_id = ? AND node_id = ? AND run = ?").get(userId, nodeId, run)) as SessionRow | undefined;
  }

  private progressRow(userId: string, nodeId: string) {
    return this.db.prepare("SELECT * FROM lesson_progress WHERE user_id = ? AND node_id = ?").get(userId, nodeId) as { run: number; run_open: number; content_version: number; completed_at: string | null; completed_content_version: number | null } | undefined;
  }

  /** Begin or resume. Idempotent: calling it twice returns the same run. A closed run starts a new one with fresh questions. */
  start(userId: string, nodeId: string) {
    const { node, kind } = this.nodeOf(userId, nodeId);
    const t = this.clock.now().toISOString();
    tx(this.db, () => {
      const row = this.progressRow(userId, nodeId);
      let run: number;
      if (!row) {
        run = 1;
        this.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at) VALUES (?,?,1,1,'questions',?,?,?,?)").run(userId, nodeId, node.contentVersion, this.course.version, t, t);
      } else if (!row.run_open || row.content_version !== node.contentVersion) {
        run = row.run + 1;
        this.db.prepare("UPDATE lesson_progress SET run = ?, run_open = 1, phase = 'questions', content_version = ?, curriculum_version = ?, started_at = ?, updated_at = ? WHERE user_id = ? AND node_id = ?").run(run, node.contentVersion, this.course.version, t, t, userId, nodeId);
      } else {
        run = row.run;
      }
      const existing = this.sessionRow(userId, nodeId, run);
      if (!existing) {
        const items = this.plan(userId, node, run, kind);
        if (!items.length) throw new ApiError(503, "generation_failed", "We couldn't make questions for this activity just now. Please try again.");
        this.db.prepare("INSERT INTO node_sessions (user_id,node_id,run,id,kind,status,started_at,curriculum_version,content_version,items) VALUES (?,?,?,?,?,'open',?,?,?,?)").run(userId, nodeId, run, crypto.randomUUID(), kind, t, this.course.version, node.contentVersion, JSON.stringify(items));
      } else if (existing.status === "open") {
        this.refreshStale(userId, node, kind, run);
      }
    });
    return this.view(userId, nodeId);
  }

  /**
   * If any planned question of the open run can no longer be reproduced (its generator or template changed), the run's questions
   * are replaced as a whole and `true` is returned. Nothing is ever dropped silently: a replaced run has a full set of unanswered
   * questions, so a content update cannot shrink a blueprint or turn a failed attempt into a pass.
   */
  private refreshStale(userId: string, node: OrderedNode, kind: SessionKind, run: number): boolean {
    const row = this.sessionRow(userId, node.id, run);
    if (!row || row.status !== "open") return false;
    const list = JSON.parse(row.items) as PlannedItem[];
    if (!list.some((si) => !this.resolve(si, node))) return false;
    const fresh = this.plan(userId, node, run, kind, 1 + (seedOf(row.id, String(list.length)) % 1000));
    this.db.prepare("UPDATE node_sessions SET items = ? WHERE user_id = ? AND node_id = ? AND run = ?").run(JSON.stringify(fresh), userId, node.id, run);
    return true;
  }

  private attemptsFor(userId: string, nodeId: string, run: number) {
    const rows = this.db.prepare("SELECT item_id, correct, attempt_number, hints_used FROM node_attempts WHERE user_id = ? AND node_id = ? AND run = ? ORDER BY attempt_number").all(userId, nodeId, run) as Array<{ item_id: string; correct: number; attempt_number: number; hints_used: number }>;
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

  private hintCount(userId: string, nodeId: string, run: number, itemId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM hint_uses WHERE user_id = ? AND node_id = ? AND run = ? AND item_id = ?").get(userId, nodeId, run, itemId) as { c: number }).c;
  }

  /** The current run as the learner sees it: questions without answers, and what has been answered so far. */
  view(userId: string, nodeId: string) {
    const { node, kind } = this.nodeOf(userId, nodeId);
    const cur = this.sessionRow(userId, nodeId);
    if (cur?.status === "open") tx(this.db, () => this.refreshStale(userId, node, kind, cur.run));
    const row = this.sessionRow(userId, nodeId);
    if (!row) throw new ApiError(409, "not_started", "Start the activity first.");
    const planned = JSON.parse(row.items) as PlannedItem[];
    const attempts = this.attemptsFor(userId, nodeId, row.run);
    const blueprint = node.assessmentId ? this.course.ix.assessments.get(node.assessmentId) : undefined;
    const sectionTitle = new Map((blueprint?.sections ?? []).map((s) => [s.id, this.sectionLabel(s)]));
    const items: NodeItemView[] = [];
    for (const si of planned) {
      const r = this.resolve(si, node);
      if (!r) continue;
      const a = attempts.get(si.itemId);
      const learner = this.course.learnerItem(r.item, "practice", r.scope);
      items.push({
        item: { ...learner, evidence: "independent", hintCount: kind === "practice" ? r.item.hints.length : 0 },
        sectionId: si.sectionId ?? null,
        answered: Boolean(a?.attempts),
        correct: Boolean(a?.correct),
        attempts: a?.attempts ?? 0,
        hintsUsed: a?.hints ?? 0,
        firstTry: Boolean(a?.firstTry),
      });
    }
    return {
      nodeId,
      kind,
      run: row.run,
      status: row.status,
      title: node.title,
      passPercent: kind === "challenge" ? this.passMark("challenge") : kind === "assessment" ? this.passMark("assessment") : null,
      firstAttemptOnly: kind === "challenge" || kind === "assessment",
      sections: [...sectionTitle].map(([id, title]) => ({ id, title })),
      disclaimer: kind === "challenge" || kind === "assessment" ? ASSESSMENT_DISCLAIMER : null,
      items,
      summary: row.summary ? (JSON.parse(row.summary) as NodeSummary) : null,
    };
  }

  /**
   * Server-side only (never routed): the run's questions WITH their answers, for tests and the teacher export. Nothing in the
   * HTTP API returns these.
   */
  internalItems(userId: string, nodeId: string): Array<{ itemId: string; item: ExerciseItem; scope: MusicScope; conceptIds: string[]; sectionId?: string }> {
    const node = this.course.ix.nodeById.get(nodeId)!;
    const row = this.sessionRow(userId, nodeId);
    if (!row) return [];
    return (JSON.parse(row.items) as PlannedItem[]).flatMap((si) => {
      const r = this.resolve(si, node);
      return r ? [{ itemId: si.itemId, item: r.item, scope: r.scope, conceptIds: si.conceptIds, ...(si.sectionId ? { sectionId: si.sectionId } : {}) }] : [];
    });
  }

  private passMark(kind: "challenge" | "assessment"): number {
    const p = this.engagement.policy.assessments;
    return kind === "challenge" ? (p?.unitChallengePassPercent ?? 70) : (p?.gradePassPercent ?? this.engagement.policy.readiness.passThresholdPercent);
  }

  private openRun(userId: string, nodeId: string) {
    const lp = this.progressRow(userId, nodeId);
    const row = lp ? this.sessionRow(userId, nodeId, lp.run) : undefined;
    if (!lp || !row || !lp.run_open || row.status !== "open") throw new ApiError(409, "not_started", "Start the activity first.");
    return row;
  }

  hint(userId: string, nodeId: string, itemId: string, level: number): { hint: string; level: number } {
    const { node, kind } = this.nodeOf(userId, nodeId);
    const row = this.openRun(userId, nodeId);
    if (kind !== "practice") throw new ApiError(409, "no_hints", "Hints are not available here: this is where you show what you know.");
    const si = (JSON.parse(row.items) as PlannedItem[]).find((i) => i.itemId === itemId);
    const r = si && this.resolve(si, node);
    if (!si || !r) throw new ApiError(404, "not_found", "Unknown question.");
    if (level < 1 || level > r.item.hints.length) throw new ApiError(400, "bad_request", "No such hint.");
    const at = this.clock.now().toISOString();
    // The hint log and the question's exposure are written together: once a hint has been shown, this question (under any seed,
    // in any node) can never again be fresh independent evidence, even if it is left unanswered.
    tx(this.db, () => {
      this.db.prepare("INSERT OR IGNORE INTO hint_uses (user_id,node_id,run,item_id,level,created_at) VALUES (?,?,?,?,?,?)").run(userId, nodeId, row.run, itemId, level, at);
      recordExposure(this.db, userId, questionKey(r.item), "practice-hint", at);
    });
    return { hint: r.item.hints[level - 1]!, level };
  }

  /** Grade server-side and record. Replaying the same attemptId returns the stored result and records nothing new. */
  attempt(userId: string, nodeId: string, attemptId: string, itemId: string, response: Response) {
    const { node, kind } = this.nodeOf(userId, nodeId);
    const open = this.openRun(userId, nodeId);
    if (tx(this.db, () => this.refreshStale(userId, node, kind, open.run))) throw new ApiError(409, "stale_items", "These questions were updated while you were working. Reload to continue with the new set.");
    const row = this.openRun(userId, nodeId);
    const si = (JSON.parse(row.items) as PlannedItem[]).find((i) => i.itemId === itemId);
    const r = si && this.resolve(si, node);
    if (!si || !r) throw new ApiError(404, "not_found", "Unknown question.");
    const graded = gradeResponse(this.course.ix, r.item, response, r.scope);

    const prior = this.db.prepare("SELECT node_id, run, item_id, response, correct, mistake_category, attempt_number FROM node_attempts WHERE user_id = ? AND id = ?").get(userId, attemptId) as
      | { node_id: string; run: number; item_id: string; response: string; correct: number; mistake_category: string | null; attempt_number: number }
      | undefined;
    if (prior) {
      if (prior.node_id !== nodeId || prior.run !== row.run || prior.item_id !== itemId || prior.response !== JSON.stringify(response)) {
        throw new ApiError(409, "attempt_conflict", "That attempt id was already used for a different answer. Check again to send a new one.");
      }
      return this.result(r.item, r.scope, kind, prior.correct === 1, prior.mistake_category, prior.attempt_number, true, graded);
    }

    const lt = learnerTime(this.db, this.clock, userId);
    const number = tx(this.db, () => {
      const cur = this.sessionRow(userId, nodeId, row.run)!;
      if (cur.status !== "open") throw new ApiError(409, "session_closed", "This run has finished. Start again from the path.");
      const n = (this.db.prepare("SELECT COALESCE(MAX(attempt_number),0) AS n FROM node_attempts WHERE user_id = ? AND node_id = ? AND run = ? AND item_id = ?").get(userId, nodeId, row.run, itemId) as { n: number }).n + 1;
      // In a challenge or assessment the first answer is final: no second go at the same question.
      if (n > 1 && (kind === "challenge" || kind === "assessment")) throw new ApiError(409, "already_answered", "You've already answered this question. In a challenge your first answer counts.");
      const hints = this.hintCount(userId, nodeId, row.run, itemId);
      this.db.prepare("INSERT INTO node_attempts (user_id,id,node_id,run,item_id,template_id,template_version,seed,response,correct,mistake_category,hints_used,attempt_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(userId, attemptId, nodeId, row.run, itemId, si.templateId, si.templateVersion, si.seed, JSON.stringify(response), graded.correct ? 1 : 0, graded.category, hints, n, lt.iso);
      this.db.prepare("UPDATE lesson_progress SET updated_at = ? WHERE user_id = ? AND node_id = ?").run(lt.iso, userId, nodeId);
      // Evidence is classified from facts the server holds: its own hint log and attempt history. Only a hint-free first
      // answer counts, and a question the learner has met before adds no new distinct credit (the fold decides that).
      const priorAnywhere = (this.db.prepare("SELECT COUNT(*) AS c FROM node_attempts WHERE user_id = ? AND item_id = ? AND id <> ?").get(userId, itemId, attemptId) as { c: number }).c;
      let source: EvidenceSource = kind === "review" ? "review-item" : "independent-step";
      if (hints > 0) source = "hinted-step";
      else if (n > 1 || priorAnywhere > 0) source = "not-first-attempt";
      this.engagement.mastery.record(userId, {
        id: `node:${attemptId}`,
        conceptIds: si.conceptIds,
        source,
        correct: graded.correct,
        itemId,
        questionKey: questionKey(r.item),
        templateId: si.templateId,
        templateVersion: si.templateVersion,
        seed: si.seed,
        nodeId,
        sessionId: cur.id,
        mistakeCategory: graded.category,
        contentVersion: cur.content_version,
      });
      return n;
    });
    return this.result(r.item, r.scope, kind, graded.correct, graded.category, number, false, graded);
  }

  private result(item: ExerciseItem, scope: MusicScope, kind: SessionKind, correct: boolean, category: string | null, attemptNumber: number, replayed: boolean, graded: ReturnType<typeof gradeResponse>) {
    // The worked answer is a learning aid for practice and review only; a challenge or assessment never reveals it.
    const solution = kind === "practice" || kind === "review" ? revealSolution(this.course.ix, item, scope, correct, attemptNumber) : undefined;
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

  /**
   * Close the run. Practice and review complete when every question has a correct answer; a challenge or assessment closes
   * when every question has been answered and completes the node only on reaching the pass mark. The status change, result,
   * lesson_progress, XP, activity and badge check are ONE transaction; repeating the call reads what was committed.
   */
  complete(userId: string, nodeId: string) {
    const { node, kind } = this.nodeOf(userId, nodeId);
    const current = this.progressRow(userId, nodeId);
    const live = current ? this.sessionRow(userId, nodeId, current.run) : undefined;
    // A content update between the last answer and completion replaces the run's questions and asks for a fresh start: the stored
    // answers are never scored against a shrunken set (that could turn a failed attempt into a pass).
    if (live?.status === "open" && tx(this.db, () => this.refreshStale(userId, node, kind, live.run))) throw new ApiError(409, "stale_items", "These questions were updated before you finished. Reload to answer the new set.");
    const done = tx(this.db, () => {
      const lp = this.progressRow(userId, nodeId);
      const row = lp ? this.sessionRow(userId, nodeId, lp.run) : undefined;
      if (!lp || !row) throw new ApiError(409, "not_started", "Start the activity first.");
      if (row.status !== "open") return { summary: JSON.parse(row.summary!) as NodeSummary, run: row.run, already: true, completedNode: row.status === "complete" };
      if (lp.content_version !== node.contentVersion) throw new ApiError(409, "stale_lesson", "This activity was updated since you started it. Reload to begin the new version.");
      const planned = JSON.parse(row.items) as PlannedItem[];
      if (planned.some((si) => !this.resolve(si, node))) throw new ApiError(409, "stale_items", "These questions were updated before you finished. Reload to answer the new set.");
      const attempts = this.attemptsFor(userId, nodeId, row.run);
      const strict = kind === "challenge" || kind === "assessment";
      const missing = planned.filter((si) => (strict ? !attempts.get(si.itemId)?.attempts : !attempts.get(si.itemId)?.correct)).map((si) => si.itemId);
      if (!planned.length || missing.length) throw new ApiError(409, "incomplete", "Some questions still need an answer.", { missing });
      const t = this.clock.now().toISOString();
      const summary: NodeSummary = { kind, questions: planned.length, firstTryCorrect: planned.filter((si) => attempts.get(si.itemId)?.firstTry).length, hintsUsed: [...attempts.values()].reduce((a, s) => a + s.hints, 0), completedAt: t };
      let passed = true;
      if (strict) {
        const correct = planned.filter((si) => attempts.get(si.itemId)?.firstTry).length;
        const percent = Math.round((100 * correct) / planned.length);
        const passPercent = this.passMark(kind as "challenge" | "assessment");
        passed = percent >= passPercent;
        Object.assign(summary, { score: correct, percent, passPercent, passed, disclaimer: ASSESSMENT_DISCLAIMER });
        this.fillAssessmentDetail(userId, node, row, planned, attempts, summary);
        const bp = this.course.ix.assessments.get(node.assessmentId!)!;
        this.db.prepare("INSERT INTO assessment_results (user_id,node_id,run,kind,assessment_id,assessment_version,score,max_score,percent,pass_percent,passed,detail,curriculum_version,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(userId, nodeId, row.run, kind, bp.id, bp.version, correct, planned.length, percent, passPercent, passed ? 1 : 0, JSON.stringify({ sections: summary.sections, outcomes: summary.outcomes, mistakes: summary.mistakes }), this.course.version, t);
      }
      this.db.prepare("UPDATE node_sessions SET status = ?, completed_at = ?, summary = ? WHERE user_id = ? AND node_id = ? AND run = ?").run(passed ? "complete" : "not_passed", t, JSON.stringify(summary), userId, nodeId, row.run);
      const stale = (lp.completed_content_version ?? 0) < node.contentVersion;
      if (passed) {
        this.db
          .prepare(
            `UPDATE lesson_progress SET run_open = 0, updated_at = ?, last_stats = ?,
               completed_at = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_at END,
               completed_content_version = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_content_version END,
               completed_curriculum_version = CASE WHEN completed_at IS NULL OR ? THEN ? ELSE completed_curriculum_version END
             WHERE user_id = ? AND node_id = ?`,
          )
          .run(t, JSON.stringify(summary), stale ? 1 : 0, t, stale ? 1 : 0, lp.content_version, stale ? 1 : 0, this.course.version, userId, nodeId);
        this.engagement.onNodeComplete(userId, nodeId, row.run, lp.content_version);
      } else {
        // Below the pass mark: an honest result, no completion, no XP. The run closes so the next start brings fresh questions.
        this.db.prepare("UPDATE lesson_progress SET run_open = 0, updated_at = ?, last_stats = ? WHERE user_id = ? AND node_id = ?").run(t, JSON.stringify(summary), userId, nodeId);
      }
      return { summary, run: row.run, already: false, completedNode: passed };
    });
    return {
      ...done.summary,
      alreadyComplete: done.already,
      completedNode: done.completedNode,
      ...(done.completedNode ? { rewards: this.engagement.rewardsFor(userId, nodeId, done.run) } : {}),
    };
  }

  /** A section's heading for the learner: the syllabus outcome in plain words, never an internal identifier. */
  private sectionLabel(s: { title: string; outcomeIds: string[] }): string {
    const statement = s.outcomeIds.length === 1 ? this.course.ix.outcomes.get(s.outcomeIds[0]!)?.statement : undefined;
    return /^[a-z]+\d{4}\.|^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i.test(s.title) && statement ? statement.replace(/\.$/, "") : s.title;
  }

  private fillAssessmentDetail(userId: string, node: OrderedNode, row: SessionRow, planned: PlannedItem[], attempts: Map<string, { firstTry: boolean }>, summary: NodeSummary) {
    const bp = this.course.ix.assessments.get(node.assessmentId!)!;
    const sections = bp.sections.map((s) => {
      const mine = planned.filter((p) => p.sectionId === s.id);
      return { id: s.id, title: this.sectionLabel(s), correct: mine.filter((p) => attempts.get(p.itemId)?.firstTry).length, total: mine.length };
    });
    summary.sections = sections.filter((s) => s.total > 0);
    const outcomeIds = [...new Set(bp.sections.flatMap((s) => s.outcomeIds))];
    summary.outcomes = outcomeIds.map((oid) => {
      const mine = planned.filter((p) => bp.sections.find((s) => s.id === p.sectionId)?.outcomeIds.includes(oid));
      const nodes = (this.course.ix.outcomeTaughtBy.get(oid) ?? []).map((n) => n.id);
      return { outcomeId: oid, statement: this.course.ix.outcomes.get(oid)?.statement ?? oid, correct: mine.filter((p) => attempts.get(p.itemId)?.firstTry).length, total: mine.length, revisit: nodes };
    }).filter((o) => o.total > 0);
    const counts = new Map<string, number>();
    for (const r of this.db.prepare("SELECT mistake_category AS c FROM node_attempts WHERE user_id = ? AND node_id = ? AND run = ? AND correct = 0 AND mistake_category IS NOT NULL").all(userId, node.id, row.run) as Array<{ c: string }>) counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
    summary.mistakes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category, count]) => ({ category, count }));
  }

  /** Every finished challenge and assessment attempt for this learner, newest first (the progress screen and teacher review). */
  results(userId: string) {
    return (this.db.prepare("SELECT node_id, run, kind, score, max_score, percent, pass_percent, passed, completed_at FROM assessment_results WHERE user_id = ? ORDER BY completed_at DESC").all(userId) as Array<{ node_id: string; run: number; kind: string; score: number; max_score: number; percent: number; pass_percent: number; passed: number; completed_at: string }>).map((r) => ({
      nodeId: r.node_id,
      title: this.course.ix.nodeById.get(r.node_id)?.title ?? r.node_id,
      run: r.run,
      kind: r.kind,
      score: r.score,
      maxScore: r.max_score,
      percent: r.percent,
      passPercent: r.pass_percent,
      passed: r.passed === 1,
      completedAt: r.completed_at,
    }));
  }
}
