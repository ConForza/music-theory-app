import { Link, useParams } from "react-router";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { Icon } from "../components/Icon";
import { describeNode, lockReason } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";

export function Unit() {
  const { unitId = "" } = useParams();
  const { reloadAll } = useApp();
  const data = useCourseData();
  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;
  const unit = data.units.get(unitId);
  if (!unit) return <NotFoundView what="unit" />;
  const gp = data.progress.grades[unit.grade - 1]!.units.find((u) => u.unitId === unit.id)!;
  const nodes = unit.nodeIds.map((id) => data.nodes.get(id)!);
  return (
    <div className="page unit-page" data-grade={unit.grade}>
      <Link to="/learn" className="back-link"><Icon name="back" size={18} /> Learning path</Link>
      <p className="eyebrow">Grade {unit.grade} · Unit {unit.sequence}</p>
      <h1>{unit.learnerTitle}</h1>
      <p className="lede-small">{unit.summary}</p>
      <div className="progress" role="progressbar" aria-label="Unit progress" aria-valuemin={0} aria-valuemax={gp.requiredNodes} aria-valuenow={gp.completedNodes}>
        <span style={{ width: `${(gp.completedNodes / Math.max(1, gp.requiredNodes)) * 100}%` }} />
      </div>
      <p className="muted small">{gp.completedNodes} of {gp.requiredNodes} steps complete{gp.writtenNodes < gp.requiredNodes ? ` · ${gp.writtenNodes} ready to play` : ""}</p>
      <ol className="unit-list">
        {nodes.map((n) => {
          const p = data.progress.nodes[n.id];
          const v = describeNode(n, p);
          return (
            <li key={n.id} className={`unit-row status-${v.status}`} data-node={n.id} data-status={v.status}>
              <div className="unit-row-main">
                <p className="muted small">{v.kindLabel}{n.optional ? " · optional" : ""} · about {n.estimatedMinutes} min</p>
                <h2>{n.title}</h2>
                <p>{n.objective}</p>
                {v.status === "locked" && <p className="small"><Icon name="lock" size={16} /> {lockReason(p, data.titleOf)}</p>}
                {n.practiceOnly && <p className="muted small">Practice only, not an official exam.</p>}
              </div>
              <div className="unit-row-side">
                <span className={`pill status-${v.status}`}>{v.statusLabel}</span>
                {v.openable && v.action && <Link className={v.status === "available" || v.status === "in_progress" ? "btn btn-primary btn-small" : "btn btn-ghost btn-small"} to={`/lesson/${n.id}`} aria-label={`${v.action}: ${n.title}`}>{v.action}</Link>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
