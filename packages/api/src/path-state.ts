import type { Course } from "./course.ts";

export type NodeState = "locked" | "available" | "in_progress" | "completed" | "coming_soon";

export interface ProgressRow {
  node_id: string;
  run: number;
  run_open: number;
  phase: string;
  content_version: number;
  completed_at: string | null;
  completed_content_version: number | null;
}

export interface NodeProgress {
  state: NodeState;
  /** Incomplete, written prerequisites that keep this node locked. */
  lockedBy: string[];
  completedAt: string | null;
  /** Completed against an older version of the lesson: a review is on offer. */
  reviewAvailable: boolean;
  /** A replay or refresher run is open on an already-completed node. */
  replayOpen: boolean;
}

export interface PathPolicy {
  /**
   * Preview policy. A prerequisite whose lesson content does not exist yet cannot be completed by anyone,
   * so it is waived until the content is written. It never waives a prerequisite that is playable, and it is
   * the only way a node unlocks other than completing its prerequisites. Set false once Briefs 05–09 land.
   */
  waiveUnwrittenPrerequisites: boolean;
}

/** Pure: which nodes are locked/available/in progress/completed for one learner. Never uses XP. */
export function computeNodeStates(course: Course, rows: ProgressRow[], policy: PathPolicy): Map<string, NodeProgress> {
  const byNode = new Map(rows.map((r) => [r.node_id, r]));
  const out = new Map<string, NodeProgress>();
  const complete = (id: string) => Boolean(byNode.get(id)?.completed_at);

  for (const n of course.nodes) {
    const row = byNode.get(n.id);
    const playable = course.isPlayable(n.id);
    const lockedBy = n.resolvedUnlockAfter.filter((p) => {
      if (complete(p)) return false;
      if (policy.waiveUnwrittenPrerequisites && !course.isPlayable(p)) return false;
      return true;
    });
    const completedAt = row?.completed_at ?? null;
    let state: NodeState;
    if (completedAt) state = "completed";
    else if (!playable) state = "coming_soon";
    else if (lockedBy.length) state = "locked";
    else if (row?.run_open) state = "in_progress";
    else state = "available";
    out.set(n.id, {
      state,
      lockedBy: state === "locked" ? lockedBy : [],
      completedAt,
      reviewAvailable: Boolean(completedAt) && (row!.completed_content_version ?? 0) < n.contentVersion,
      replayOpen: Boolean(completedAt) && row!.run_open === 1,
    });
  }
  return out;
}

/** The node the learner should do next within a grade: the open lesson, else the first available required one. */
export function nextNodeForGrade(course: Course, states: Map<string, NodeProgress>, grade: number): string | null {
  const nodes = course.nodes.filter((n) => n.grade === grade && !n.optional);
  return (
    nodes.find((n) => states.get(n.id)?.state === "in_progress")?.id ??
    nodes.find((n) => states.get(n.id)?.state === "available")?.id ??
    null
  );
}
