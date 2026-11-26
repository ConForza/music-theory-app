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
  /**
   * 1 when the learner opened this lesson through Explore while the guided path still had it locked (migration 010). Absent or 0 for
   * every row written before flexible learning existed, so those rows behave exactly as they always did.
   */
  explored?: number;
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
  /**
   * Opened through Explore ahead of the guided path, and its guided prerequisites are still not satisfied. Its completion (if any) is a
   * genuine lesson completion, but it does not yet count towards unlocking the guided steps after it.
   */
  outOfSequence: boolean;
  /** For an `outOfSequence` node: the guided prerequisites it is still waiting for (empty otherwise), so the screen can name the real next step. */
  waitingFor: string[];
}

export interface PathPolicy {
  /**
   * Preview policy. A prerequisite whose lesson content does not exist yet cannot be completed by anyone,
   * so it is waived until the content is written. It never waives a prerequisite that is playable, and it is
   * the only way a node unlocks other than completing its prerequisites. Set false once Briefs 05–09 land.
   */
  waiveUnwrittenPrerequisites: boolean;
}

/**
 * The one query every caller of `computeNodeStates` uses to read a learner's rows. Shared so that no service (lessons, server-built
 * practice/review/challenge/assessment runs) can compute path states from a narrower view of the facts than another.
 */
export const PROGRESS_ROWS_SQL =
  "SELECT node_id, run, run_open, phase, content_version, completed_at, completed_content_version, explored FROM lesson_progress WHERE user_id = ?";

/** Pure: which nodes are locked/available/in progress/completed for one learner. Never uses XP. */
export function computeNodeStates(course: Course, rows: ProgressRow[], policy: PathPolicy, placedGrade: number | null = null): Map<string, NodeProgress> {
  const byNode = new Map(rows.map((r) => [r.node_id, r]));
  const out = new Map<string, NodeProgress>();
  const complete = (id: string) => Boolean(byNode.get(id)?.completed_at);
  // Brief 10 (placement): a learner who chose to start at Grade N after a placement check finds that grade's first lesson open without having
  // finished the grades before it. Those earlier nodes are NOT marked complete (so no badge, XP or streak is ever earned by placing in): they
  // simply stop blocking nodes of Grade N and above. Without an accepted placement (`placedGrade` null) nothing here changes.
  const placedPast = (id: string) => placedGrade !== null && (course.ix.nodeById.get(id)?.grade ?? Infinity) < placedGrade;

  // Flexible learning: whether a completed node counts as a satisfied prerequisite for the guided steps after it. A node completed through
  // the guided path always does (this is every row written before migration 010, so nothing changes for them). A lesson completed through
  // Explore while it was still locked counts only once its OWN guided prerequisites are satisfied: finishing the last lesson of a unit out of
  // order therefore never opens that unit's practice, review or challenge, nor (by the same chain) the grade assessment and its badge. The
  // moment the learner completes the earlier lessons, the explored completion starts counting with no replay needed. Nodes are visited in
  // path order and prerequisites always come earlier (validated), so `satisfied` is filled before it is read; the fallback is defensive.
  const satisfied = new Map<string, boolean>();
  const counts = (id: string) => satisfied.get(id) ?? complete(id);

  for (const n of course.nodes) {
    const row = byNode.get(n.id);
    const playable = course.isPlayable(n.id);
    const lockedBy = n.resolvedUnlockAfter.filter((p) => {
      // The waiver is for nodes of the grade the learner chose and above. A node of an EARLIER grade keeps its own prerequisites: otherwise starting
      // at Grade 4 would open (and let a learner pass) the Grade 1 assessment with no lesson done, and so earn its badge.
      if (counts(p) || (n.grade >= (placedGrade ?? Infinity) && placedPast(p))) return false;
      if (policy.waiveUnwrittenPrerequisites && !course.isPlayable(p)) return false;
      return true;
    });
    const completedAt = row?.completed_at ?? null;
    const explored = row?.explored === 1;
    satisfied.set(n.id, Boolean(completedAt) && (!explored || lockedBy.length === 0));
    let state: NodeState;
    if (completedAt) state = "completed";
    else if (!playable) state = "coming_soon";
    // A run that was already open keeps its node openable even if a prerequisite has since been written (the preview waiver
    // ended for Grade 1): nobody loses a lesson they were in the middle of.
    else if (lockedBy.length && !row?.run_open) state = "locked";
    else if (row?.run_open) state = "in_progress";
    else state = "available";
    out.set(n.id, {
      state,
      lockedBy: state === "locked" ? lockedBy : [],
      completedAt,
      reviewAvailable: Boolean(completedAt) && (row!.completed_content_version ?? 0) < n.contentVersion,
      replayOpen: Boolean(completedAt) && row!.run_open === 1,
      outOfSequence: explored && lockedBy.length > 0,
      waitingFor: explored ? lockedBy : [],
    });
  }
  return out;
}

/**
 * The node the learner should do next within a grade: the open lesson, else the first available required one. A lesson the learner is
 * exploring ahead of the path is never the guided "next" step, so exploring cannot move the learner's guided destination.
 */
export function nextNodeForGrade(course: Course, states: Map<string, NodeProgress>, grade: number): string | null {
  const nodes = course.nodes.filter((n) => n.grade === grade && !n.optional && !states.get(n.id)?.outOfSequence);
  return (
    nodes.find((n) => states.get(n.id)?.state === "in_progress")?.id ??
    nodes.find((n) => states.get(n.id)?.state === "available")?.id ??
    null
  );
}

/** The grade a learner chose to start at after a placement check (the latest, not superseded), or null when they never placed. */
export function placedGradeOf(db: { prepare(sql: string): { get(...a: unknown[]): unknown } }, userId: string): number | null {
  const r = db.prepare("SELECT start_grade FROM placement_starts WHERE user_id = ? AND superseded_at IS NULL ORDER BY accepted_at DESC LIMIT 1").get(userId) as { start_grade: number } | undefined;
  return r?.start_grade ?? null;
}
