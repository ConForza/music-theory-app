// Helpers for the Brief 06 Grade 2 browser journey. Grade 1 is marked complete straight in the database (as it would be for a
// learner who finished Brief 05's course); everything in Grade 2 is then played through the real controls or the real API.
import { effectiveScope } from "@mtp/curriculum";
export * from "./g1lib.mjs";

/** Mark every Grade 1 node completed for the learner, as the finished Brief 05 course would have left them. */
export function completeGrade1(S, userId) {
  const now = S.clock.now().toISOString();
  for (const n of S.course.nodes.filter((x) => x.grade === 1)) {
    S.db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, n.id);
    S.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, n.id, n.contentVersion, S.course.version, now, now, now, n.contentVersion);
  }
}
export const selectGrade = (page, grade) => page.evaluate(async (g) => { await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectedGrade: g }) }); }, grade);
export { effectiveScope };
