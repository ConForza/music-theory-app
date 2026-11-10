import { useEffect } from "react";
import { Link } from "react-router";
import { ErrorState, Loading } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Legend } from "../components/Legend";
import { RecentBadges, ReviewNudge, StatusStrip, WelcomeBack } from "../components/Engagement";
import { LearningPath } from "../components/LearningPath";
import { describeNode } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";

export const prefersReducedMotion = () =>
  document.documentElement.dataset.motion === "reduce" ||
  (document.documentElement.dataset.motion !== "full" && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export function Learn() {
  const { me, reloadAll, engagement } = useApp();
  const data = useCourseData();
  const grade = me!.profile.selectedGrade;

  const currentId = data.status === "ready" ? data.progress.grades[grade - 1]?.nextNodeId ?? null : null;
  useEffect(() => {
    if (!currentId) return;
    const el = document.querySelector<HTMLElement>(`[data-node="${currentId}"]`);
    el?.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [currentId, data.status]);

  if (data.status === "loading") return <Loading label="Loading your path…" />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;

  const world = data.course.worlds[grade - 1]!;
  const next = currentId ? data.nodes.get(currentId)! : null;
  const v = next ? describeNode(next, data.progress.nodes[next.id]) : null;
  const finished = data.progress.grades[grade - 1]!.completedNodes > 0;
  const elsewhere = data.course.worlds.find((w) => w.grade !== grade && data.progress.grades[w.grade - 1]!.nextNodeId);

  return (
    <div className="page learn" data-grade={grade}>
      <header className="learn-head">
        <Link to="/grades" className="grade-chip">
          <span className="grade-num" aria-hidden="true">{grade}</span>
          <span><small>Grade {grade}</small> <strong>{world.learnerTitle}</strong><span className="visually-hidden">. Change grade</span></span>
          <Icon name="down" size={20} />
        </Link>
      </header>

      {engagement.status === "ready" && (
        <>
          <StatusStrip e={engagement.data} />
          <WelcomeBack e={engagement.data} />
          <ReviewNudge e={engagement.data} />
        </>
      )}

      {next && v ? (
        <section className="next-card" aria-labelledby="next-h">
          <p className="eyebrow">{v.status === "in_progress" ? "Pick up where you left off" : "Next up"}</p>
          <h2 id="next-h">{next.title}</h2>
          <p>{next.objective}</p>
          <p className="muted small"><Icon name="clock" size={16} /> About {next.estimatedMinutes} minutes</p>
          <Link className="btn btn-primary btn-large" to={`/lesson/${next.id}`}>{v.action}</Link>
        </section>
      ) : (
        <section className="next-card is-empty" aria-labelledby="next-h">
          <h2 id="next-h">{finished ? `You've done every ready lesson in Grade ${grade}` : `Nothing to start in Grade ${grade} just yet`}</h2>
          <p>{finished ? "More are on the way. Tap any completed lesson on the path to practise it again." : "This grade's lessons are still being written. The path below shows what's coming."}</p>
          {elsewhere && <Link className="btn btn-primary" to="/grades">See grades with lessons ready</Link>}
        </section>
      )}

      {engagement.status === "ready" && engagement.data.achievements.recent.length > 0 && <RecentBadges e={engagement.data} />}
      <p className="preview-note"><Icon name="info" size={16} /> <span>Early preview: lessons marked “Coming soon” are still being written, so you can open the ready ones in any order.</span></p>
      <Legend />
      <LearningPath data={data} world={world} currentId={currentId} />
    </div>
  );
}
