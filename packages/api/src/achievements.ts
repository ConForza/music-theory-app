/**
 * Achievement badges (Brief 04): a short, restrained list defined in content/policy/achievements.json. Each has one
 * verifiable condition over server-held facts (concept mastery, or server-verified node completion). Awards are written
 * by the server only, once (primary key), and never revoked. A badge is in-app recognition, never an ABRSM result.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Course } from "./course.ts";
import type { Db } from "./db.ts";
import type { ConceptMastery, MasteryState } from "./mastery.ts";
import { STATE_ORDER } from "./mastery.ts";

const Condition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("concepts"), conceptIds: z.array(z.string()).min(1), minState: z.enum(["proficient", "mastered"]) }).strict(),
  z.object({ type: z.literal("nodes"), nodeIds: z.array(z.string()).min(1) }).strict(),
]);
const File = z
  .object({
    schemaVersion: z.literal(1),
    status: z.string(),
    rulesVersion: z.number().int().min(1),
    disclaimer: z.string().min(1),
    achievements: z.array(z.object({ id: z.string().regex(/^g[1-5]\.[a-z0-9-]+$/), grade: z.number().int().min(1).max(5), title: z.string().min(1), description: z.string().min(1), condition: Condition }).strict()).min(1),
  })
  .strict();
export type AchievementDef = z.infer<typeof File>["achievements"][number];

export function loadAchievements(course: Course): { defs: AchievementDef[]; disclaimer: string; rulesVersion: number } {
  const file = File.parse(JSON.parse(readFileSync(join(course.ix.c.root, "policy/achievements.json"), "utf8")));
  const ids = new Set<string>();
  for (const d of file.achievements) {
    if (ids.has(d.id)) throw new Error(`Duplicate achievement ${d.id}`);
    ids.add(d.id);
    // A definition that points at something that does not exist could never be earned; fail at start-up, not silently.
    if (d.condition.type === "concepts") for (const c of d.condition.conceptIds) if (!course.ix.concepts.has(c)) throw new Error(`Achievement ${d.id}: unknown concept ${c}`);
    if (d.condition.type === "nodes") for (const n of d.condition.nodeIds) if (!course.ix.nodeById.has(n)) throw new Error(`Achievement ${d.id}: unknown node ${n}`);
  }
  return { defs: file.achievements, disclaimer: file.disclaimer, rulesVersion: file.rulesVersion };
}

const atLeast = (s: MasteryState, min: "proficient" | "mastered", highest: MasteryState) => {
  // A concept that has since become due or slipped still counts if it ever reached the level (history is never erased).
  const idx = (x: MasteryState) => (x === "review_due" ? STATE_ORDER.indexOf("proficient") : STATE_ORDER.indexOf(x));
  return Math.max(idx(s), idx(highest)) >= STATE_ORDER.indexOf(min);
};

export class AchievementService {
  readonly defs: AchievementDef[];
  readonly disclaimer: string;
  readonly rulesVersion: number;
  constructor(
    private db: Db,
    private course: Course,
  ) {
    const l = loadAchievements(course);
    this.defs = l.defs;
    this.disclaimer = l.disclaimer;
    this.rulesVersion = l.rulesVersion;
  }

  private completedNodes(userId: string): Set<string> {
    return new Set((this.db.prepare("SELECT node_id FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as Array<{ node_id: string }>).map((r) => r.node_id));
  }

  /** Progress towards one badge, and whether it is met. A node that has no playable content can never be met. */
  progressOf(def: AchievementDef, mastery: Map<string, ConceptMastery>, done: Set<string>) {
    const c = def.condition;
    if (c.type === "concepts") {
      const have = c.conceptIds.filter((id) => {
        const m = mastery.get(id);
        return m ? atLeast(m.state, c.minState, m.highestState) : false;
      }).length;
      const reachable = c.conceptIds.every((id) => (this.course.ix.conceptTaughtBy.get(id) ?? []).some((n) => this.course.isPlayable(n.id)));
      return { have, need: c.conceptIds.length, met: have === c.conceptIds.length, reachable };
    }
    const have = c.nodeIds.filter((id) => done.has(id) && this.course.isPlayable(id)).length;
    const reachable = c.nodeIds.every((id) => this.course.isPlayable(id));
    return { have, need: c.nodeIds.length, met: have === c.nodeIds.length, reachable };
  }

  /** Award every newly met badge. Idempotent; call inside the event's transaction. Returns the new awards. */
  evaluate(userId: string, mastery: Map<string, ConceptMastery>, triggerKey: string, nowIso: string): AchievementDef[] {
    const done = this.completedNodes(userId);
    const have = new Set((this.db.prepare("SELECT achievement_id FROM achievements_awarded WHERE user_id = ?").all(userId) as Array<{ achievement_id: string }>).map((r) => r.achievement_id));
    const fresh: AchievementDef[] = [];
    for (const d of this.defs) {
      if (have.has(d.id)) continue;
      const p = this.progressOf(d, mastery, done);
      if (!p.met || !p.reachable) continue;
      const r = this.db
        .prepare("INSERT OR IGNORE INTO achievements_awarded (user_id,achievement_id,awarded_at,trigger_key,evidence,rules_version) VALUES (?,?,?,?,?,?)")
        .run(userId, d.id, nowIso, triggerKey, JSON.stringify({ condition: d.condition, have: p.have, need: p.need }), this.rulesVersion);
      if (Number(r.changes) > 0) fresh.push(d);
    }
    return fresh;
  }

  awardedFor(userId: string, triggerKey: string): AchievementDef[] {
    const ids = (this.db.prepare("SELECT achievement_id FROM achievements_awarded WHERE user_id = ? AND trigger_key = ?").all(userId, triggerKey) as Array<{ achievement_id: string }>).map((r) => r.achievement_id);
    return this.defs.filter((d) => ids.includes(d.id));
  }

  list(userId: string, mastery: Map<string, ConceptMastery>) {
    const done = this.completedNodes(userId);
    const awarded = new Map((this.db.prepare("SELECT achievement_id, awarded_at FROM achievements_awarded WHERE user_id = ?").all(userId) as Array<{ achievement_id: string; awarded_at: string }>).map((r) => [r.achievement_id, r.awarded_at]));
    return this.defs.map((d) => {
      const p = this.progressOf(d, mastery, done);
      const at = awarded.get(d.id) ?? null;
      return { id: d.id, grade: d.grade, title: d.title, description: d.description, earned: at !== null, earnedAt: at, have: p.have, need: p.need, available: p.reachable };
    });
  }
}
