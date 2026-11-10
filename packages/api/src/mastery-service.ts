import type { Course } from "./course.ts";
import type { Db } from "./db.ts";
import type { Clock } from "./clock.ts";
import { localDate } from "./clock.ts";
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

export interface NewEvidence {
  /** Source event id, unique per learner and concept: lesson:<attemptId> | review:<attemptId>. */
  id: string;
  conceptIds: string[];
  source: EvidenceSource;
  correct: boolean;
  itemId: string;
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
        (user_id,id,concept_id,source,counts,correct,item_id,template_id,template_version,seed,node_id,session_id,mistake_category,content_version,curriculum_version,rules_version,timezone,local_date,occurred_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const counts = ev.source === "independent-step" || ev.source === "review-item";
    for (const conceptId of ev.conceptIds) {
      insert.run(userId, ev.id, conceptId, ev.source, counts ? 1 : 0, ev.correct ? 1 : 0, ev.itemId, ev.templateId, ev.templateVersion, ev.seed ?? null, ev.nodeId ?? null, ev.sessionId ?? null, ev.mistakeCategory ?? null, ev.contentVersion ?? null, this.course.version, this.rules.rulesVersion, lt.tz, lt.date, lt.iso);
      this.refresh(userId, conceptId, lt.date);
    }
    return ev.conceptIds;
  }

  private rowsFor(userId: string, conceptId?: string): DbRow[] {
    return (conceptId
      ? this.db.prepare("SELECT * FROM mastery_evidence WHERE user_id = ? AND concept_id = ? ORDER BY occurred_at, rowid").all(userId, conceptId)
      : this.db.prepare("SELECT * FROM mastery_evidence WHERE user_id = ? ORDER BY occurred_at, rowid").all(userId)) as unknown as DbRow[];
  }

  /** Recompute one concept from its evidence and store the projection. */
  refresh(userId: string, conceptId: string, today: string): ConceptMastery {
    const m = foldConcept(conceptId, this.rowsFor(userId, conceptId).map(toRow), this.rules, today);
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

  /** Authoritative read: folded from the evidence for today's date, so "review due" is never stale. */
  all(userId: string, today: string): Map<string, ConceptMastery> {
    const byConcept = new Map<string, EvidenceRow[]>();
    for (const r of this.rowsFor(userId)) {
      const list = byConcept.get(r.concept_id) ?? [];
      list.push(toRow(r));
      byConcept.set(r.concept_id, list);
    }
    return new Map([...byConcept].map(([id, rows]) => [id, foldConcept(id, rows, this.rules, today)]));
  }

  get(userId: string, conceptId: string, today: string): ConceptMastery | null {
    const rows = this.rowsFor(userId, conceptId).map(toRow);
    return rows.length ? foldConcept(conceptId, rows, this.rules, today) : null;
  }

  /** The audit trail: every row that touched the concept, counted or not, newest first. */
  trail(userId: string, conceptId: string, limit = 50) {
    return this.rowsFor(userId, conceptId)
      .slice(-limit)
      .reverse()
      .map((r) => ({ id: r.id, source: r.source, counted: r.counts === 1, correct: r.correct === 1, itemId: r.item_id, templateId: r.template_id, templateVersion: r.template_version, seed: r.seed, mistakeCategory: r.mistake_category, localDate: r.local_date, rulesVersion: r.rules_version }));
  }
}
