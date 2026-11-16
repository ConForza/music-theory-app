import { Link } from "react-router";
import type { CourseNode, NodeProgress } from "../api/client";
import { describeNode, nodeAriaLabel, type Shape, type Status } from "../lib/pathView";
import { Icon, type IconName } from "./Icon";

const SHAPE_ICON: Record<Shape, IconName> = {
  lesson: "play",
  practice: "sparkle",
  review: "repeat",
  unit_checkpoint: "flag",
  grade_assessment: "trophy",
  enrichment: "star",
};

function glyph(shape: Shape, status: Status): IconName {
  if (status === "completed") return "check";
  if (status === "locked") return "lock";
  return SHAPE_ICON[shape];
}

/**
 * One node on the learning path. The shape says what it is (lesson, practice, review, unit checkpoint, grade assessment),
 * the colour, glyph and badge say where the learner stands. Never relies on colour alone.
 */
export function PathNodeButton({
  node,
  progress,
  current,
  onInfo,
}: {
  node: CourseNode;
  progress: NodeProgress | undefined;
  current?: boolean;
  onInfo: (nodeId: string) => void;
}) {
  const v = describeNode(node, progress);
  const className = `node node-${v.shape} status-${v.status}${current ? " is-current" : ""}`;
  const face = (
    <>
      <span className="node-face">
        <Icon name={glyph(v.shape, v.status)} size={v.shape === "grade_assessment" ? 34 : 28} strokeWidth={v.status === "completed" ? 3.2 : 2.4} />
      </span>
      {v.status === "in_progress" && <span className="node-ring" aria-hidden="true" />}
      {v.status === "review_available" && <span className="node-badge" aria-hidden="true"><Icon name="repeat" size={14} strokeWidth={3} /></span>}
    </>
  );
  const label = nodeAriaLabel(node, v);
  // Only unfinished lessons go straight in; everything else opens a short explanation sheet.
  if (v.openable && (v.status === "available" || v.status === "in_progress")) {
    return (
      <Link to={`/lesson/${node.id}`} className={className} aria-label={label} aria-current={current ? "step" : undefined} data-node={node.id} data-status={v.status}>
        {face}
      </Link>
    );
  }
  return (
    <button type="button" className={className} aria-label={label} onClick={() => onInfo(node.id)} data-node={node.id} data-status={v.status} aria-haspopup="dialog">
      {face}
    </button>
  );
}
