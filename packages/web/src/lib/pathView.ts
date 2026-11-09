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
  return { shape, status, statusLabel: STATUS_LABEL[status], kindLabel: KIND[shape], openable, action };
}

export function nodeAriaLabel(node: CourseNode, v: NodeView): string {
  return `${v.kindLabel}: ${node.title}. ${v.statusLabel}. About ${node.estimatedMinutes} minutes.`;
}

/** Why a locked node is locked, in words the learner can act on. */
export function lockReason(p: NodeProgress | undefined, titleOf: (id: string) => string): string {
  const need = (p?.lockedBy ?? []).map(titleOf);
  if (!need.length) return "Finish the earlier lessons first.";
  return `Finish ${need.map((t) => `“${t}”`).join(" and ")} first.`;
}
