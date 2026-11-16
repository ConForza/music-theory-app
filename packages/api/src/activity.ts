/**
 * Daily goal and streak (Brief 04). Both are derived from `daily_activity`, whose rows are written only when the server
 * has verified a meaningful session (a path node completed, or a review session finished). Dates are learner-local
 * calendar dates fixed at write time, so changing timezone later never rewrites history, and "yesterday" is always one
 * calendar day, never 24 hours.
 */
import { daysBetween } from "./clock.ts";
import type { Db } from "./db.ts";
import type { LearnerTime } from "./mastery-service.ts";

export interface StreakInfo {
  current: number;
  longest: number;
  activeToday: boolean;
  lastActivityDate: string | null;
  /** Calendar days with no session between the last one and today (0 when active today or yesterday). */
  missedDays: number;
  status: "none" | "active_today" | "continuing" | "returning";
  message: string;
}

/** Pure: streak from a set of local dates and today's date in the learner's current timezone. */
export function computeStreak(dates: string[], today: string): StreakInfo {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) {
    return { current: 0, longest: 0, activeToday: false, lastActivityDate: null, missedDays: 0, status: "none", message: "Finish a lesson or a review to start a streak. It's optional and never takes anything away." };
  }
  // Travelling west can leave the newest activity "in the future" in the new zone: treat it as today.
  const norm = [...new Set(days.map((d) => (d > today ? today : d)))].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < norm.length; i++) {
    run = daysBetween(norm[i - 1]!, norm[i]!) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = days[days.length - 1]!;
  const end = norm[norm.length - 1]!;
  const gap = daysBetween(end, today);
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = norm.length - 2; i >= 0 && daysBetween(norm[i]!, norm[i + 1]!) === 1; i--) current++;
  }
  const activeToday = last >= today;
  const missed = gap <= 1 ? 0 : gap - 1;
  const status = activeToday ? "active_today" : gap === 1 ? "continuing" : "returning";
  const message =
    status === "active_today"
      ? current > 1
        ? `${current} days in a row. Lovely.`
        : "You've learned today. Nice work."
      : status === "continuing"
        ? `You have a ${current}-day streak going. A short lesson or review today keeps it growing.`
        : `Welcome back! It's been ${missed === 1 ? "a day" : `${missed} days`}, and everything you learned is still here. A quick review is a gentle way to restart${longest > 1 ? ` (your best was ${longest} days)` : ""}.`;
  return { current, longest, activeToday, lastActivityDate: last, missedDays: missed, status, message };
}

export class ActivityService {
  constructor(private db: Db) {}

  /** Record a meaningful session. Idempotent on (user, source key); must run inside the event's transaction. */
  record(userId: string, a: { sourceKey: string; kind: "node_complete" | "review_session"; nodeId: string }, lt: LearnerTime): boolean {
    const r = this.db
      .prepare("INSERT OR IGNORE INTO daily_activity (user_id,source_key,kind,node_id,local_date,timezone,occurred_at) VALUES (?,?,?,?,?,?,?)")
      .run(userId, a.sourceKey, a.kind, a.nodeId, lt.date, lt.tz, lt.iso);
    return Number(r.changes) > 0;
  }

  datesOf(userId: string): string[] {
    return (this.db.prepare("SELECT DISTINCT local_date FROM daily_activity WHERE user_id = ?").all(userId) as Array<{ local_date: string }>).map((r) => r.local_date);
  }

  /** Sessions the learner finished on `date`. */
  sessionsOn(userId: string, date: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM daily_activity WHERE user_id = ? AND local_date = ?").get(userId, date) as { c: number }).c;
  }

  status(userId: string, lt: LearnerTime, goalSessions: number) {
    const done = this.sessionsOn(userId, lt.date);
    const enabled = goalSessions > 0;
    const streak = computeStreak(this.datesOf(userId), lt.date);
    return {
      goal: { enabled, target: goalSessions, doneToday: done, met: enabled && done >= goalSessions },
      // The streak is optional: with the goal turned off nothing about it is shown.
      streak: enabled ? streak : null,
      today: lt.date,
      timezone: lt.tz,
    };
  }
}
