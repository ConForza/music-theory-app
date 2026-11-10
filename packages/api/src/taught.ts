import type { Course } from "./course.ts";
import type { Db } from "./db.ts";

/**
 * The path nodes whose teaching this learner has completed *at the version being served now*. A completion made against an
 * older version of a lesson (the path shows "refresher available") does not authorise anything the newer version introduced,
 * so review, scheduling and the hub all use this one definition. Concepts such a lesson taught wait, quietly, until the
 * learner finishes the updated lesson.
 */
export function taughtNodes(db: Db, course: Course, userId: string): Set<string> {
  const rows = db.prepare("SELECT node_id, completed_content_version FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as Array<{ node_id: string; completed_content_version: number | null }>;
  const out = new Set<string>();
  for (const r of rows) {
    const node = course.ix.nodeById.get(r.node_id);
    if (node && (r.completed_content_version ?? 0) >= node.contentVersion) out.add(r.node_id);
  }
  return out;
}
