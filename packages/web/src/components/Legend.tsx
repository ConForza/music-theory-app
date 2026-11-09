import { Icon } from "./Icon";

const ITEMS = [
  { cls: "node-lesson status-available", label: "Ready", note: "Start it now" },
  { cls: "node-lesson status-in_progress", label: "In progress", note: "Carry on from where you stopped" },
  { cls: "node-lesson status-completed", label: "Completed", note: "Replay any time" },
  { cls: "node-lesson status-locked", label: "Locked", note: "Finish the earlier step" },
  { cls: "node-review status-review_available", label: "Review", note: "A refresher is on offer" },
  { cls: "node-unit_checkpoint status-available", label: "Unit checkpoint", note: "Show what you know" },
  { cls: "node-grade_assessment status-available", label: "Grade assessment", note: "Practice for the whole grade" },
  { cls: "node-lesson status-coming_soon", label: "Coming soon", note: "Still being written" },
];

export function Legend() {
  return (
    <details className="legend">
      <summary>What do the icons mean?</summary>
      <ul>
        {ITEMS.map((i) => (
          <li key={i.label}>
            <span className={`node node-mini ${i.cls}`} aria-hidden="true">
              <span className="node-face">
                <Icon name={i.label === "Completed" ? "check" : i.label === "Locked" ? "lock" : i.label === "Review" ? "repeat" : i.label.startsWith("Unit") ? "flag" : i.label.startsWith("Grade") ? "trophy" : "play"} size={16} strokeWidth={3} />
              </span>
            </span>
            <span><strong>{i.label}</strong> · {i.note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
