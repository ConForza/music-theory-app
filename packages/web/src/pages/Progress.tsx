import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Loading } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Badge, MilestoneBar } from "../components/Engagement";
import { describeNode } from "../lib/pathView";
import { plural } from "../lib/progression";
import type { AchievementEntry, ReviewOverview } from "../api/client";
import { api } from "../api/client";
import { useApp, useCourseData } from "../state/app";

const ago = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function Progress() {
  const { me, reloadAll, engagement } = useApp();
  const userId = me?.user.id;
  const data = useCourseData();
  const [review, setReview] = useState<ReviewOverview | null>(null);
  const [badges, setBadges] = useState<{ disclaimer: string; achievements: AchievementEntry[] } | null>(null);
  // Detail loads quietly after the simple summary; a failure here never hides the progress the learner already has.
  useEffect(() => {
    let live = true;
    api.reviewOverview().then((r) => live && setReview(r), () => undefined);
    api.achievements().then((a) => live && setBadges(a), () => undefined);
    return () => {
      live = false;
    };
  }, [userId]);
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

      {engagement.status === "ready" && (
        <section className="card" aria-labelledby="xp-h">
          <h2 id="xp-h">Rewards</h2>
          <p className="big-number"><strong>{engagement.data.xp.total}</strong> XP</p>
          <MilestoneBar total={engagement.data.xp.total} milestone={engagement.data.xp.milestone} />
          {engagement.data.goal.enabled ? (
            <p className="small">Daily goal: {engagement.data.goal.doneToday} of {plural(engagement.data.goal.target, "session")} today.{engagement.data.streak && engagement.data.streak.current > 0 ? ` ${engagement.data.streak.current}-day streak.` : ""}</p>
          ) : (
            <p className="small muted">Daily goal and streak are off. <Link to="/settings">Change in Settings</Link></p>
          )}
          <p className="muted small">XP rewards showing up. It never unlocks lessons and isn't a measure of understanding. That's tracked below.</p>
        </section>
      )}

      {review && (
        <section className="card" aria-labelledby="mastery-h">
          <h2 id="mastery-h">Understanding</h2>
          <dl className="stats stats-row">
            <div><dt>Mastered</dt><dd>{review.groups.mastered.length}</dd></div>
            <div><dt>Nearly there</dt><dd>{review.groups.approaching.length}</dd></div>
            <div><dt>Learning</dt><dd>{review.groups.learning.length + review.groups.ready.length}</dd></div>
          </dl>
          <p className="muted small">Topics, not lessons. A topic is mastered after varied first-try answers without hints, spread over days, with a successful review.</p>
          <div className="row">
            <Link className="btn btn-ghost btn-small" to="/review">{review.dueCount > 0 ? `Review ${plural(review.dueCount, "topic")}` : "See topics and reviews"}</Link>
          </div>
        </section>
      )}

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
      {badges && (
        <section id="badges" className="card" aria-labelledby="badges-h">
          <h2 id="badges-h">Badges</h2>
          <ul className="plain badge-list">{badges.achievements.map((a) => <Badge key={a.id} a={a} />)}</ul>
          <p className="fine-print">{badges.disclaimer}</p>
        </section>
      )}
      <p className="fine-print">Completed steps show where you are on the path. Understanding is tracked per topic, separately, and a whole-grade practice assessment is a separate check again.</p>
    </div>
  );
}
