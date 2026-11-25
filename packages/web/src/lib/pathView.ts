import type { CourseNode, NodeProgress } from "../api/client";

export type Shape = "lesson" | "practice" | "review" | "unit_checkpoint" | "grade_assessment" | "enrichment";
export type Status = "locked" | "available" | "in_progress" | "completed" | "review_available" | "coming_soon";

export interface NodeView {
  shape: Shape;
  status: Status;
  /** Short status words for badges and sheets. */
  statusLabel: string;
  kindLabel: string;
  /** Can the learner open the lesson player right now? */
  openable: boolean;
  /** Label for the primary action, if any. */
  action: string | null;
  /** Opened through Explore ahead of the guided path (and its earlier lessons are not all done yet). */
  explored: boolean;
}

const SHAPE: Record<CourseNode["type"], Shape> = {
  lesson: "lesson",
  practice: "practice",
  review: "review",
  unit_challenge: "unit_checkpoint",
  grade_assessment: "grade_assessment",
  enrichment: "enrichment",
};

const KIND: Record<Shape, string> = {
  lesson: "Lesson",
  practice: "Practice",
  review: "Review",
  unit_checkpoint: "Unit checkpoint",
  grade_assessment: "Grade assessment",
  enrichment: "Extra",
};

const STATUS_LABEL: Record<Status, string> = {
  locked: "Locked",
  available: "Ready",
  in_progress: "In progress",
  completed: "Completed",
  review_available: "Review available",
  coming_soon: "Coming soon",
};

/** One place that turns the server's node state into what the learner sees. Used by the path, unit overview and dashboard. */
export function describeNode(node: CourseNode, p: NodeProgress | undefined): NodeView {
  const shape = SHAPE[node.type];
  let status: Status = p?.state ?? "coming_soon";
  if (status === "completed" && p?.reviewAvailable) status = "review_available";
  // A review node that is open is, by definition, a review on offer.
  if (status === "available" && node.type === "review") status = "available";
  const openable = node.playable && (status === "available" || status === "in_progress" || status === "completed" || status === "review_available");
  const action =
    status === "in_progress" ? "Continue"
    : status === "available" ? "Start"
    : status === "completed" ? "Practise again"
    : status === "review_available" ? "Review"
    : null;
  return { shape, status, statusLabel: STATUS_LABEL[status], kindLabel: KIND[shape], openable, action, explored: Boolean(p?.outOfSequence) };
}

export function nodeAriaLabel(node: CourseNode, v: NodeView): string {
  return `${v.kindLabel}: ${node.title}. ${v.statusLabel}${v.explored ? ", explored ahead of your path" : ""}. About ${node.estimatedMinutes} minutes.`;
}

const quote = (titles: string[]) => titles.map((t) => `“${t}”`).join(" and ");

/**
 * Why a locked node is locked, in words the learner can act on. With the learner's progress (`nodes`), a prerequisite already completed
 * through Explore is not named as something to finish: the message names the guided lesson(s) it is still waiting for, and says the
 * explored lesson will count then.
 */
export function lockReason(p: NodeProgress | undefined, titleOf: (id: string) => string, nodes?: Record<string, NodeProgress | undefined>): string {
  const need: string[] = [];
  const explored: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const q = nodes?.[id];
    if (q?.state === "completed" && q.outOfSequence) {
      explored.push(id);
      for (const w of q.waitingFor ?? []) visit(w);
    } else need.push(id);
  };
  for (const id of p?.lockedBy ?? []) visit(id);
  if (!need.length) return "Finish the earlier lessons first.";
  const base = `Finish ${quote(need.map(titleOf))} first.`;
  return explored.length ? `${base} ${quote(explored.map(titleOf))}, which you've already explored, will count then.` : base;
}
