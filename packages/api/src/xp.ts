/**
 * XP ledger (Brief 04). XP is an engagement reward for activity the server verified. It never unlocks anything, never
 * counts as mastery and never appears in readiness. Totals are always the SUM of the append-only ledger.
 */
import type { ProgressionPolicy } from "@mtp/curriculum";
import type { Db } from "./db.ts";
import type { LearnerTime } from "./mastery-service.ts";

export interface XpAward {
  sourceKey: string;
  kind: "node_complete" | "review_session";
  nodeId: string;
  nodeType: string;
  contentVersion?: number | null;
  curriculumVersion: string;
}

export interface XpResult {
  awarded: number;
  /** Base value of this kind of activity (what an uncapped award would have been). */
  baseXp: number;
  capped: boolean;
  /** True when this exact event had already been rewarded (a retry or a second device). */
  duplicate: boolean;
  reason: string;
  total: number;
}

export const REVIEW_NODE = "review";
const DEFAULT_MILESTONES = [20, 50, 100, 200, 350, 550, 800, 1100, 1500, 2000];

export class XpService {
  readonly milestones: number[];
  readonly rulesVersion: number;
  constructor(
    private db: Db,
    private policy: ProgressionPolicy,
  ) {
    this.milestones = policy.xp.milestones ?? DEFAULT_MILESTONES;
    this.rulesVersion = policy.mastery.rulesVersion ?? 1;
  }

  baseFor(nodeType: string): number {
    return (this.policy.xp.perNodeType as Record<string, number>)[nodeType] ?? 0;
  }

  total(userId: string): number {
    return (this.db.prepare("SELECT COALESCE(SUM(xp),0) AS t FROM xp_ledger WHERE user_id = ?").get(userId) as { t: number }).t;
  }

  private explain(nodeType: string, xp: number, capped: boolean): string {
    const what = nodeType === "review_session" ? "Review finished" : nodeType === "lesson" ? "Lesson finished" : nodeType === "practice" ? "Practice finished" : nodeType === "unit_challenge" ? "Unit challenge finished" : nodeType === "grade_assessment" ? "Assessment finished" : nodeType === "enrichment" ? "Extra finished" : "Activity finished";
    if (capped) return `${what}. You've already earned XP for this twice today, so there's none more right now. It's still good practice, and tomorrow earns XP again.`;
    return `${what}: +${xp} XP. XP rewards showing up and finishing. It isn't a score for how well you know the music.`;
  }

  /**
   * Award XP for a verified event. Idempotent on (user, source key). Must be called inside the transaction that records
   * the event, so the event and its reward commit together or not at all.
   */
  award(userId: string, a: XpAward, lt: LearnerTime): XpResult {
    const existing = this.db.prepare("SELECT xp, base_xp, capped FROM xp_ledger WHERE user_id = ? AND source_key = ?").get(userId, a.sourceKey) as
      | { xp: number; base_xp: number; capped: number }
      | undefined;
    const typeKey = a.kind === "review_session" ? "review" : a.nodeType;
    if (existing) {
      return { awarded: existing.xp, baseXp: existing.base_xp, capped: existing.capped === 1, duplicate: true, reason: this.explain(a.kind === "review_session" ? "review_session" : typeKey, existing.xp, existing.capped === 1), total: this.total(userId) };
    }
    const base = this.baseFor(typeKey);
    const cap = this.policy.xp.dailyCapPerNode;
    const earnedToday = (this.db
      .prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ? AND node_id = ? AND local_date = ? AND capped = 0 AND xp > 0")
      .get(userId, a.nodeId, lt.date) as { c: number }).c;
    const capped = base > 0 && earnedToday >= cap;
    const xp = capped ? 0 : base;
    this.db
      .prepare(
        `INSERT INTO xp_ledger (user_id,source_key,kind,node_id,node_type,xp,base_xp,capped,local_date,timezone,occurred_at,curriculum_version,content_version,rules_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(userId, a.sourceKey, a.kind, a.nodeId, a.nodeType, xp, base, capped ? 1 : 0, lt.date, lt.tz, lt.iso, a.curriculumVersion, a.contentVersion ?? null, this.rulesVersion);
    return { awarded: xp, baseXp: base, capped, duplicate: false, reason: this.explain(a.kind === "review_session" ? "review_session" : typeKey, xp, capped), total: this.total(userId) };
  }

  /** The stored award for an event, if any (used to repeat the reply when a completion is retried). */
  find(userId: string, sourceKey: string): XpResult | null {
    const r = this.db.prepare("SELECT xp, base_xp, capped, node_type, kind FROM xp_ledger WHERE user_id = ? AND source_key = ?").get(userId, sourceKey) as
      | { xp: number; base_xp: number; capped: number; node_type: string; kind: string }
      | undefined;
    if (!r) return null;
    return { awarded: r.xp, baseXp: r.base_xp, capped: r.capped === 1, duplicate: true, reason: this.explain(r.kind === "review_session" ? "review_session" : r.node_type, r.xp, r.capped === 1), total: this.total(userId) };
  }

  /** Progress to the next milestone for a total. */
  milestone(total: number) {
    const next = this.milestones.find((m) => m > total) ?? null;
    const prevIdx = this.milestones.filter((m) => m <= total).length;
    const prev = prevIdx ? this.milestones[prevIdx - 1]! : 0;
    return {
      level: prevIdx + 1,
      previous: prev,
      next,
      toNext: next === null ? 0 : next - total,
      percent: next === null ? 100 : Math.round(((total - prev) / (next - prev)) * 100),
    };
  }

  recent(userId: string, limit = 10) {
    return (this.db
      .prepare("SELECT source_key, kind, node_id, node_type, xp, capped, local_date, occurred_at FROM xp_ledger WHERE user_id = ? ORDER BY rowid DESC LIMIT ?")
      .all(userId, limit) as Array<{ source_key: string; kind: string; node_id: string; node_type: string; xp: number; capped: number; local_date: string; occurred_at: string }>).map((r) => ({
      sourceKey: r.source_key,
      kind: r.kind,
      nodeId: r.node_id,
      nodeType: r.node_type,
      xp: r.xp,
      capped: r.capped === 1,
      localDate: r.local_date,
      at: r.occurred_at,
    }));
  }
}
