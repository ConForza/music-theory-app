import { Link } from "react-router";
import { ErrorState, Loading } from "../components/Shell";
import { Icon } from "../components/Icon";
import { describeNode } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";

const ago = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function Progress() {
  const { reloadAll } = useApp();
  const data = useCourseData();
  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;
  const { progress, course } = data;

  const open = [...data.nodes.values()].filter((n) => progress.nodes[n.id]?.state === "in_progress");
  const refresh = [...data.nodes.values()].filter((n) => describeNode(n, progress.nodes[n.id]).status === "review_available");

  return (
    <div className="page">
      <h1>Your progress</h1>
      <dl className="stats stats-row">
        <div><dt>Lessons completed</dt><dd>{progress.totals.lessonsCompleted}</dd></div>
        <div><dt>Questions answered</dt><dd>{progress.totals.questionsAnswered}</dd></div>
        <div><dt>Right first time</dt><dd>{progress.totals.firstTryCorrect}</dd></div>
      </dl>

      {open.length > 0 && (
        <section className="card" aria-labelledby="open-h">
          <h2 id="open-h">Unfinished</h2>
          <ul className="plain">{open.map((n) => <li key={n.id}><Link to={`/lesson/${n.id}`}>{n.title}</Link> <span className="muted small">· pick up where you left off</span></li>)}</ul>
        </section>
      )}
      {refresh.length > 0 && (
        <section className="card" aria-labelledby="refresh-h">
          <h2 id="refresh-h">Refreshers on offer</h2>
          <ul className="plain">{refresh.map((n) => <li key={n.id}><Link to={`/lesson/${n.id}`}>{n.title}</Link> <span className="muted small">· improved since you finished it</span></li>)}</ul>
        </section>
      )}

      <h2>By grade</h2>
      <ul className="plain grade-progress">
        {course.worlds.map((w) => {
          const g = progress.grades[w.grade - 1]!;
          return (
            <li key={w.grade} className="card" data-grade={w.grade}>
              <div className="grade-progress-head">
                <span className="grade-num" aria-hidden="true">{w.grade}</span>
                <h3>Grade {w.grade}: {w.learnerTitle}</h3>
              </div>
              <div className="progress" role="progressbar" aria-label={`Grade ${w.grade} progress`} aria-valuemin={0} aria-valuemax={g.requiredNodes} aria-valuenow={g.completedNodes}>
                <span style={{ width: `${(g.completedNodes / Math.max(1, g.requiredNodes)) * 100}%` }} />
              </div>
              <p className="muted small">{g.completedNodes} of {g.requiredNodes} steps complete · {g.writtenNodes} ready to play</p>
              <details>
                <summary>Units</summary>
                <ul className="plain unit-mini">
                  {w.units.map((u) => {
                    const up = g.units.find((x) => x.unitId === u.id)!;
                    return (
                      <li key={u.id}>
                        <Link to={`/unit/${u.id}`}>Unit {u.sequence}: {u.learnerTitle}</Link>
                        <span className="muted small"> · {up.completedNodes}/{up.requiredNodes}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      {progress.recent.length > 0 && (
        <section className="card" aria-labelledby="recent-h">
          <h2 id="recent-h">Recently completed</h2>
          <ul className="plain">
            {progress.recent.map((r) => (
              <li key={r.nodeId}><Icon name="check" size={18} strokeWidth={3} /> {data.titleOf(r.nodeId)} <span className="muted small">· {ago(r.completedAt)}</span></li>
            ))}
          </ul>
        </section>
      )}
      <p className="fine-print">Progress counts completed steps, not points. Spaced review, streaks and mastery are planned for a later release.</p>
    </div>
  );
}
