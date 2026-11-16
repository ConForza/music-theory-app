import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { CourseData } from "../state/app";
import { describeNode, lockReason } from "../lib/pathView";
import { Icon } from "./Icon";

/** Bottom sheet / dialog explaining a node: why it is locked, that it is coming soon, or how to replay it. */
export function NodeSheet({ data, nodeId, onClose }: { data: CourseData; nodeId: string; onClose: () => void }) {
  const node = data.nodes.get(nodeId)!;
  const p = data.progress.nodes[nodeId];
  const v = describeNode(node, p);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  const message =
    v.status === "locked" ? lockReason(p, data.titleOf)
    : v.status === "coming_soon" ? "This one is still being written, so there is nothing to open yet. Everything marked ready is fully playable."
    : v.status === "completed" ? "You've completed this. Practising again won't change your progress."
    : v.status === "review_available" ? "This lesson has been improved since you finished it. A quick refresher keeps it fresh."
    : "";

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className={`pill status-${v.status}`}>{v.statusLabel}</span>
          <span className="muted">{v.kindLabel} · about {node.estimatedMinutes} min</span>
        </div>
        <h2 id="sheet-title">{node.title}</h2>
        <p>{node.objective}</p>
        {message && <p className="sheet-note"><Icon name={v.status === "locked" ? "lock" : "info"} size={18} /> <span>{message}</span></p>}
        {node.practiceOnly && <p className="muted small">Practice only. This is not an official examination.</p>}
        <div className="sheet-actions">
          {v.openable && v.action && (
            <Link className="btn btn-primary" to={`/lesson/${node.id}`}>{v.action}</Link>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>{v.openable ? "Not now" : "Got it"}</button>
        </div>
      </div>
    </div>
  );
}
