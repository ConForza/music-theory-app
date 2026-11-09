import { useState } from "react";
import { Link } from "react-router";
import type { CourseData } from "../state/app";
import type { CourseNode, World } from "../api/client";
import { PathNodeButton } from "./PathNodeButton";
import { NodeSheet } from "./NodeSheet";
import { describeNode } from "../lib/pathView";

const ROW = 150;
const WIDTH = 320;
const SWAY = [0, 46, 66, 46, 0, -46, -66, -46];

const cx = (i: number) => WIDTH / 2 + (SWAY[i % SWAY.length] ?? 0);
const cy = (i: number) => 52 + i * ROW;

/** Smooth connector through node centres; solid where the learner has passed. */
function Connectors({ nodes, done }: { nodes: CourseNode[]; done: boolean[] }) {
  const height = cy(nodes.length - 1) + 70;
  return (
    <svg className="connectors" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ height }}>
      {nodes.slice(0, -1).map((n, i) => {
        const [x0, y0, x1, y1] = [cx(i), cy(i), cx(i + 1), cy(i + 1)];
        const mid = (y0 + y1) / 2;
        return <path key={n.id} d={`M ${x0} ${y0} C ${x0} ${mid}, ${x1} ${mid}, ${x1} ${y1}`} className={done[i] ? "link is-done" : "link"} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

function NodeColumn({ data, nodes, currentId, onInfo }: { data: CourseData; nodes: CourseNode[]; currentId: string | null; onInfo: (id: string) => void }) {
  const done = nodes.map((n) => data.progress.nodes[n.id]?.state === "completed");
  return (
    <ol className="nodes" style={{ height: cy(nodes.length - 1) + 70 }}>
      <Connectors nodes={nodes} done={done} />
      {nodes.map((n, i) => {
        const v = describeNode(n, data.progress.nodes[n.id]);
        const current = n.id === currentId;
        return (
          <li key={n.id} className="node-slot" style={{ left: `${(cx(i) / WIDTH) * 100}%`, top: cy(i) }}>
            {current && <span className="bubble" aria-hidden="true">{v.status === "in_progress" ? "Continue" : "Start"}</span>}
            <PathNodeButton node={n} progress={data.progress.nodes[n.id]} current={current} onInfo={onInfo} />
            <span className="node-label">{n.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function LearningPath({ data, world, currentId }: { data: CourseData; world: World; currentId: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const finale = world.nodes.filter((n) => !n.unitId);
  return (
    <div className="path" data-grade={world.grade}>
      {world.units.map((u) => {
        const nodes = u.nodeIds.map((id) => data.nodes.get(id)!).filter(Boolean);
        const unitProgress = data.progress.grades[world.grade - 1]!.units.find((x) => x.unitId === u.id)!;
        return (
          <section key={u.id} className="unit" aria-labelledby={`h-${u.id}`}>
            <header className="unit-banner">
              <div>
                <p className="eyebrow">Unit {u.sequence}</p>
                <h2 id={`h-${u.id}`}>{u.learnerTitle}</h2>
              </div>
              <Link to={`/unit/${u.id}`} className="btn btn-ghost btn-small" aria-label={`Unit ${u.sequence} overview: ${u.learnerTitle}`}>Overview</Link>
              <p className="unit-count">{unitProgress.completedNodes} of {unitProgress.requiredNodes} done{unitProgress.writtenNodes < unitProgress.requiredNodes ? ` · ${unitProgress.writtenNodes} ready` : ""}</p>
            </header>
            <NodeColumn data={data} nodes={nodes} currentId={currentId} onInfo={setOpen} />
          </section>
        );
      })}
      {finale.length > 0 && (
        <section className="unit" aria-labelledby="h-finale">
          <header className="unit-banner">
            <div>
              <p className="eyebrow">Finish line</p>
              <h2 id="h-finale">Grade {world.grade} assessment</h2>
            </div>
            <p className="unit-count">Practice for the whole grade. It is not an official exam.</p>
          </header>
          <NodeColumn data={data} nodes={finale} currentId={currentId} onInfo={setOpen} />
        </section>
      )}
      {open && <NodeSheet data={data} nodeId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
