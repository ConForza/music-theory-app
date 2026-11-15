import { canonicalResponse, wrongResponse } from "@mtp/engine";
import { createApp, type App } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import type { PrepConfig } from "../src/prep-config.ts";
import { Client, realCourse } from "./helpers.ts";

/** An app on the SHIPPED content (all five grades), with a controllable clock, as the Brief 05+ suites use. */
export function boot(opts: { prep?: PrepConfig; db?: ReturnType<typeof openDb> } = {}) {
  const db = opts.db ?? openDb(":memory:");
  const app = createApp({ db, course: realCourse(), waiveUnwrittenPrerequisites: false, testClock: true, ...(opts.prep ? { prep: opts.prep } : {}) });
  return { db, app, course: realCourse() };
}

export async function learner(app: App, name = "guest") {
  const c = new Client(app);
  const me = await c.post("/api/auth/guest");
  await c.call("PATCH", "/api/me/profile", { onboarded: true, experience: "some", displayName: name.slice(0, 20) });
  return { c, userId: me.body.user.id as string };
}

/** Mark every lesson, practice, review and assessment of grades <= `upTo` complete, as a learner who finished those courses would have it. */
export function completeGrades(app: App, db: ReturnType<typeof openDb>, userId: string, upTo: number) {
  const now = app.clock.now().toISOString();
  for (const n of realCourse().nodes.filter((x) => x.grade <= upTo)) {
    db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, n.id);
    db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, n.id, n.contentVersion, realCourse().version, now, now, now, n.contentVersion);
  }
}

let n = 0;
export const cmd = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

/** Answer every question of an attempt (correctly, or wrongly for the indexes in `wrong`) through the real HTTP routes. Returns the replies. */
export async function answerAll(app: App, c: Client, userId: string, attemptId: string, wrong: (i: number, outcome: string | null) => boolean = () => false, only?: (i: number) => boolean) {
  const course = realCourse();
  const replies: Array<{ status: number; body: Record<string, unknown> }> = [];
  const items = app.prep.internalItems(userId, attemptId);
  for (const [i, it] of items.entries()) {
    if (only && !only(i)) continue;
    const bad = wrong(i, it.planned.outcomeId);
    const response = bad ? wrongResponse(course.ix, it.item, it.scope) : canonicalResponse(course.ix, it.item, it.scope);
    if (!response) throw new Error(`no ${bad ? "wrong" : "correct"} response for ${it.item.id}`);
    replies.push(await c.post(`/api/prep/attempts/${attemptId}/answers`, { attemptId: cmd(), itemId: it.item.id, response }));
  }
  return replies;
}

/** Row counts of every table a practice exam or placement must NEVER change. */
export function protectedCounts(db: ReturnType<typeof openDb>, userId: string) {
  const out: Record<string, number> = {};
  for (const t of ["xp_ledger", "daily_activity", "achievements_awarded", "lesson_progress", "assessment_results", "concept_mastery", "mastery_evidence", "node_sessions", "node_attempts"]) {
    out[t] = (db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(userId) as { c: number }).c;
  }
  return out;
}
