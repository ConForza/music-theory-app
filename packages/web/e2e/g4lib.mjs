// Helpers for the Brief 08 Grade 4 browser journey. Grades 1-3 are marked complete straight in the database (as they would be for a
// learner who finished Briefs 05-07); everything in Grade 4 is then played through the real controls or the real API.
export * from "./g2lib.mjs";

/** Mark every Grade 1-3 node completed for the learner, as the finished earlier courses would have left them. */
export function completeEarlier(S, userId) {
  const now = S.clock.now().toISOString();
  for (const n of S.course.nodes.filter((x) => x.grade <= 3)) {
    S.db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, n.id);
    S.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, n.id, n.contentVersion, S.course.version, now, now, now, n.contentVersion);
  }
}
