import type { Course } from "./course.ts";
import type { Db } from "./db.ts";
import type { Clock } from "./clock.ts";
import { addDays, localDate } from "./clock.ts";
import { foldConcept, type ConceptMastery, type EvidenceRow, type EvidenceSource, type MasteryRules } from "./mastery.ts";

/** The learner's clock: the instant, their timezone and their local calendar date. */
export interface LearnerTime {
  at: Date;
  iso: string;
  tz: string;
  date: string;
}

export function learnerTime(db: Db, clock: Clock, userId: string): LearnerTime {
  const row = db.prepare("SELECT timezone FROM profiles WHERE user_id = ?").get(userId) as { timezone: string } | undefined;
  const tz = row?.timezone ?? "UTC";
  const at = clock.now();
  return { at, iso: at.toISOString(), tz, date: localDate(at, tz) };
}

/** Record that a learner was shown a question outside counted evidence. Idempotent; keeps the earliest time. */
export function recordExposure(db: Db, userId: string, questionKey: string, source: "practice-attempt" | "practice-hint", iso: string) {
  db.prepare("INSERT OR IGNORE INTO question_exposure (user_id, question_key, source, occurred_at) VALUES (?,?,?,?)").run(userId, questionKey, source, iso);
}

export interface NewEvidence {
  /** Source event id, unique per learner and concept: lesson:<attemptId> | review:<attemptId>. */
  id: string;
  conceptIds: string[];
  source: EvidenceSource;
  correct: boolean;
  itemId: string;
  /** Seed-independent identity of what was asked (see question-key.ts). */
  questionKey: string;
  templateId: string;
  templateVersion: number;
  seed?: number | null;
  nodeId?: string | null;
  sessionId?: string | null;
  mistakeCategory?: string | null;
  contentVersion?: number | null;
}

interface DbRow {
  id: string;
  concept_id: string;
  source: EvidenceSource;
  counts: number;
  correct: number;
  item_id: string;
  question_key: string;
  template_id: string;
  template_version: number;
  seed: number | null;
  node_id: string | null;
  session_id: string | null;
  mistake_category: string | null;
  local_date: string;
  occurred_at: string;
  rules_version: number;
}

const toRow = (r: DbRow): EvidenceRow => ({
  id: r.id,
  conceptId: r.concept_id,
  source: r.source,
  counts: r.counts === 1,
  correct: r.correct === 1,
  itemId: r.item_id,
  questionKey: r.question_key,
  templateId: r.template_id,
  templateVersion: r.template_version,
  seed: r.seed,
  nodeId: r.node_id,
  sessionId: r.session_id,
  mistakeCategory: r.mistake_category,
  localDate: r.local_date,
  occurredAt: r.occurred_at,
  rulesVersion: r.rules_version,
});

/**
 * Owns mastery evidence and its projection. None of these methods opens a transaction: callers (attempt, review) invoke
 * them inside the transaction that records the attempt, so evidence and attempt commit or fail together.
 */
export class MasteryService {
  constructor(
    private db: Db,
    private course: Course,
    private clock: Clock,
    readonly rules: MasteryRules,
  ) {}

  /** Record evidence rows (idempotent per source event + concept) and refresh the affected concepts. */
  record(userId: string, ev: NewEvidence): string[] {
    const lt = learnerTime(this.db, this.clock, userId);
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO mastery_evidence
        (user_id,id,concept_id,source,counts,correct,item_id,question_key,template_id,template_version,seed,node_id,session_id,mistake_category,content_version,curriculum_version,rules_version,timezone,local_date,occurred_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const counts = ev.source === "independent-step" || ev.source === "review-item";
    for (const conceptId of ev.conceptIds) {
      insert.run(userId, ev.id, conceptId, ev.source, counts ? 1 : 0, ev.correct ? 1 : 0, ev.itemId, ev.questionKey, ev.templateId, ev.templateVersion, ev.seed ?? null, ev.nodeId ?? null, ev.sessionId ?? null, ev.mistakeCategory ?? null, ev.contentVersion ?? null, this.course.version, this.rules.rulesVersion, lt.tz, lt.date, lt.iso);
      this.refresh(userId, conceptId, lt.date);
    }
    return ev.conceptIds;
  }

  /** Earliest time each question identity was shown to this learner outside counted evidence. */
  private exposures(userId: string): Map<string, string> {
    const rows = this.db.prepare("SELECT question_key, MIN(occurred_at) AS at FROM question_exposure WHERE user_id = ? GROUP BY question_key").all(userId) as Array<{ question_key: string; at: string }>;
    return new Map(rows.map((r) => [r.question_key, r.at]));
  }

  private rowsFor(userId: string, conceptId?: string): DbRow[] {
    return (conceptId
      ? this.db.prepare("SELECT * FROM mastery_evidence WHERE user_id = ? AND concept_id = ? ORDER BY occurred_at, rowid").all(userId, conceptId)
      : this.db.prepare("SELECT * FROM mastery_evidence WHERE user_id = ? ORDER BY occurred_at, rowid").all(userId)) as unknown as DbRow[];
  }

  /** Recompute one concept from its evidence and store the projection. */
  refresh(userId: string, conceptId: string, today: string): ConceptMastery {
    const m = foldConcept(conceptId, this.rowsFor(userId, conceptId).map(toRow), this.rules, today, this.exposures(userId));
    this.db
      .prepare(
        `INSERT INTO concept_mastery (user_id,concept_id,state,highest_state,rules_version,next_due_date,interval_index,lapses,detail,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id,concept_id) DO UPDATE SET state=excluded.state, highest_state=excluded.highest_state, rules_version=excluded.rules_version,
           next_due_date=excluded.next_due_date, interval_index=excluded.interval_index, lapses=excluded.lapses, detail=excluded.detail, updated_at=excluded.updated_at`,
      )
      .run(userId, conceptId, m.state, m.highestState, m.rulesVersion, m.nextDueDate, m.intervalIndex, m.lapses, JSON.stringify(m), this.clock.now().toISOString());
    return m;
  }

  /** Rebuild every projection from the evidence ledger (after a rules change, or to verify the stored copy). */
  rebuildAll(userId: string): ConceptMastery[] {
    const today = learnerTime(this.db, this.clock, userId).date;
    const ids = new Set(this.rowsFor(userId).map((r) => r.concept_id));
    this.db.prepare("DELETE FROM concept_mastery WHERE user_id = ?").run(userId);
    return [...ids].sort().map((id) => this.refresh(userId, id, today));
  }

  /** Would a correct first answer to this question earn distinct credit? Not if the learner has met it before, anywhere. */
  isFresh(userId: string, questionKey: string): boolean {
    return !this.seenAnywhere(userId, questionKey);
  }

  private seenAnywhere(userId: string, questionKey: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM mastery_evidence WHERE user_id = ? AND question_key = ? LIMIT 1").get(userId, questionKey)) || Boolean(this.db.prepare("SELECT 1 FROM question_exposure WHERE user_id = ? AND question_key = ? LIMIT 1").get(userId, questionKey));
  }

  /** Was this evidence row the first time the learner met the question (ledger and practice exposure both considered)? */
  creditedFresh(userId: string, questionKey: string, evidenceId: string): boolean {
    const first = this.db.prepare("SELECT id, occurred_at FROM mastery_evidence WHERE user_id = ? AND question_key = ? ORDER BY rowid LIMIT 1").get(userId, questionKey) as { id: string; occurred_at: string } | undefined;
    if (!first || first.id !== evidenceId) return false;
    const exposed = this.exposures(userId).get(questionKey);
    return exposed === undefined || !(exposed < first.occurred_at);
  }

  /** The question identities a learner has met (for a concept's evidence, plus anything seen in practice) so review can prefer new ones. */
  seenKeys(userId: string, conceptId: string): Set<string> {
    const keys = new Set((this.db.prepare("SELECT DISTINCT question_key FROM mastery_evidence WHERE user_id = ? AND concept_id = ?").all(userId, conceptId) as Array<{ question_key: string }>).map((r) => r.question_key));
    for (const k of this.exposures(userId).keys()) keys.add(k);
    return keys;
  }

  /** Authoritative read: folded from the evidence for today's date, so "review due" is never stale. */
  all(userId: string, today: string): Map<string, ConceptMastery> {
    const byConcept = new Map<string, EvidenceRow[]>();
    for (const r of this.rowsFor(userId)) {
      const list = byConcept.get(r.concept_id) ?? [];
      list.push(toRow(r));
      byConcept.set(r.concept_id, list);
    }
    const ex = this.exposures(userId);
    const out = new Map([...byConcept].map(([id, rows]) => [id, foldConcept(id, rows, this.rules, today, ex)]));
    this.addTaughtButUnrecorded(userId, today, out);
    return out;
  }

  /**
   * A concept taught by a lesson the learner completed is reviewable even when nothing was recorded for it (learners who
   * finished lessons before the ledger existed, or whose answers were all recorded as supported). It starts as "learning"
   * and is first due one interval after the completion day. No evidence is invented: it counts for nothing.
   */
  private addTaughtButUnrecorded(userId: string, today: string, out: Map<string, ConceptMastery>) {
    const done = this.db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as Array<{ node_id: string; completed_at: string }>;
    const tz = (this.db.prepare("SELECT timezone FROM profiles WHERE user_id = ?").get(userId) as { timezone: string } | undefined)?.timezone ?? "UTC";
    for (const d of done) {
      const node = this.course.ix.nodeById.get(d.node_id);
      if (!node || (node.type !== "lesson" && node.type !== "enrichment") || !this.course.isPlayable(node.id)) continue;
      for (const conceptId of node.conceptIds) {
        if (out.has(conceptId)) continue;
        const base = foldConcept(conceptId, [], this.rules, today);
        const first = localDate(new Date(d.completed_at), tz);
        out.set(conceptId, { ...base, state: "learning", highestState: "learning", intervalIndex: 0, nextDueDate: addDays(first, this.rules.intervalsDays[0]!) });
      }
    }
  }

  get(userId: string, conceptId: string, today: string): ConceptMastery | null {
    return this.all(userId, today).get(conceptId) ?? null;
  }

  /** The audit trail: every row that touched the concept, counted or not, newest first. */
  trail(userId: string, conceptId: string, limit = 50) {
    return this.rowsFor(userId, conceptId)
      .slice(-limit)
      .reverse()
      .map((r) => ({ id: r.id, source: r.source, counted: r.counts === 1, correct: r.correct === 1, itemId: r.item_id, templateId: r.template_id, templateVersion: r.template_version, seed: r.seed, mistakeCategory: r.mistake_category, localDate: r.local_date, rulesVersion: r.rules_version }));
  }
}
