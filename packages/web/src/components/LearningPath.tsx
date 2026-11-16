import { useState } from "react";
import { Link } from "react-router";
import type { CourseData } from "../state/app";
import type { CourseNode, World } from "../api/client";
import { PathNodeButton } from "./PathNodeButton";
import { NodeSheet } from "./NodeSheet";
import { describeNode } from "../lib/pathView";

// Rows flow naturally (a row is as tall as its label), so enlarged text can never make labels collide.
// Horizontal positions are fractions of the column width.
const WIDTH = 320;
const SWAY = [0, 46, 66, 46, 0, -46, -66, -46];

const cx = (i: number) => WIDTH / 2 + (SWAY[i % SWAY.length] ?? 0);

/** Smooth connector from this node's centre to the next one; solid where the learner has passed. Drawn inside each row, so it
 *  stretches with the row however tall the label (and the learner's text size) makes it. */
function Connector({ from, to, done }: { from: number; to: number; done: boolean }) {
  const [x0, x1] = [cx(from), cx(to)];
  return (
    <svg className="connector" viewBox={`0 0 ${WIDTH} 1`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`M ${x0} 0 C ${x0} 0.5, ${x1} 0.5, ${x1} 1`} className={done ? "link is-done" : "link"} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function NodeColumn({ data, nodes, currentId, onInfo }: { data: CourseData; nodes: CourseNode[]; currentId: string | null; onInfo: (id: string) => void }) {
  return (
    <ol className="nodes">
      {nodes.map((n, i) => {
        const v = describeNode(n, data.progress.nodes[n.id]);
        const current = n.id === currentId;
        return (
          <li key={n.id} className="node-row">
            {i < nodes.length - 1 && <Connector from={i} to={i + 1} done={data.progress.nodes[n.id]?.state === "completed"} />}
            <div className="node-slot" style={{ ["--x" as string]: (cx(i) / WIDTH) * 100 }}>
              {current && <span className="bubble" aria-hidden="true">{v.status === "in_progress" ? "Continue" : "Start"}</span>}
              <PathNodeButton node={n} progress={data.progress.nodes[n.id]} current={current} onInfo={onInfo} />
              <span className="node-label">{n.title}</span>
            </div>
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
