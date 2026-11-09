import type { CourseData } from "../state/app";
import type { CourseView, Overview } from "../api/client";

/** Five grade worlds. Used during onboarding (no progress yet) and on the grade picker. */
export function GradeCards({
  course,
  progress,
  selected,
  onPick,
}: {
  course: CourseView;
  progress?: CourseData["progress"] | Overview;
  selected: number | null;
  onPick: (grade: number) => void;
}) {
  return (
    <ul className="grade-cards">
      {course.worlds.map((w) => {
        const g = progress?.grades[w.grade - 1];
        const lessons = w.nodes.filter((n) => n.type === "lesson" && !n.optional).length;
        return (
          <li key={w.grade}>
            <button type="button" className={`grade-card${selected === w.grade ? " is-selected" : ""}`} data-grade={w.grade} aria-pressed={selected === w.grade} onClick={() => onPick(w.grade)}>
              <span className="grade-num" aria-hidden="true">{w.grade}</span>
              <span className="grade-text">
                <strong>Grade {w.grade}: {w.learnerTitle}</strong>
                <span>{w.summary}</span>
                <span className="muted small">
                  {w.units.length} units · {lessons} lessons
                  {g ? ` · ${g.completedNodes} of ${g.requiredNodes} steps complete` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
