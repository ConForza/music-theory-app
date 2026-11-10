import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type ReviewOverview, type ReviewSession, type ReviewSummary } from "../api/client";
import { ConceptRow, GoalLine, MilestoneBar, NewBadges, XpAward } from "../components/Engagement";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { stopAll, cue } from "../lib/audio";
import { friendlyDate, plural } from "../lib/progression";
import { useApp } from "../state/app";
import { ActionBar, Question } from "./LessonSteps";

const asFailure = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", fallback));

/** Review: what is ready, what is being learned, what is nearly mastered, weaker areas and what to do next. */
export function ReviewHub() {
  const nav = useNavigate();
  const { me } = useApp();
  const userId = me?.user.id;
  const [data, setData] = useState<ReviewOverview | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.reviewOverview().then(setData, (e: unknown) => setError(asFailure(e, "Could not load Review.")));
  }, []);
  useEffect(load, [load, userId]);

  async function start() {
    setStarting(true);
    setNote(null);
    try {
      const r = await api.startReview();
      if (r.session) nav(`/review/session/${r.session.id}`);
      else {
        setNote(r.reason === "no_questions_yet" ? "Your next topics need their lesson finished before we can ask about them." : "Nothing is due right now.");
        load();
      }
    } catch (e) {
      setNote(asFailure(e, "Could not start the review.").message);
    } finally {
      setStarting(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading label="Loading Review…" />;
  const { groups, today } = data;
  const empty = groups.ready.length + groups.learning.length + groups.approaching.length + groups.mastered.length === 0;
  const list = (items: ReviewOverview["groups"]["ready"]) => <ul className="plain concept-list">{items.map((c) => <ConceptRow key={c.conceptId} c={c} today={today} />)}</ul>;

  return (
    <div className="page review-page">
      <header className="page-head">
        <p className="eyebrow">Review</p>
        <h1>Keep what you've learned</h1>
        <p className="lede-small">A few questions on topics that are due, spaced out so they stick. Answers here (without hints) are how a topic becomes mastered.</p>
      </header>

      <section className="card callout" aria-labelledby="next-act-h">
        <h2 id="next-act-h" className="h3">Your next step</h2>
        <p>{data.recommendation.text}</p>
        {data.recommendation.kind === "review" ? (
          <button className="btn btn-primary btn-large" onClick={start} disabled={starting}>{starting ? "Getting questions…" : data.openSessionId ? "Continue review" : "Start review"}</button>
        ) : (
          <div className="row">
            {data.recommendation.kind === "lesson" && <Link className="btn btn-primary" to={`/lesson/${data.recommendation.nodeId}`}>Continue learning</Link>}
            <Link className={`btn ${data.recommendation.kind === "lesson" ? "btn-ghost" : "btn-primary"}`} to="/practice">Optional practice</Link>
          </div>
        )}
        {data.dueCount === 0 && data.upcoming[0] && <p className="muted small">Next review: {data.upcoming[0].title}, {friendlyDate(data.upcoming[0].dueDate, today)}.</p>}
        {data.waiting > 0 && <p className="muted small">{plural(data.waiting, "topic")} will be ready for review once {data.waiting === 1 ? "its" : "their"} lesson is finished.</p>}
        {note && <p role="status" className="muted">{note}</p>}
      </section>

      {empty && (
        <section className="card" aria-labelledby="empty-h">
          <h2 id="empty-h" className="h3">Nothing to review yet</h2>
          <p>Finish a lesson and the topics it taught will appear here, with the day to revisit them.</p>
          <Link className="btn btn-ghost" to="/learn">Go to my path</Link>
        </section>
      )}

      {groups.ready.length > 0 && <section aria-labelledby="ready-h"><h2 id="ready-h">Ready for review</h2>{list(groups.ready)}</section>}
      {data.weak.length > 0 && (
        <section aria-labelledby="weak-h">
          <h2 id="weak-h">Areas to strengthen</h2>
          <p className="muted small">Topics where recent answers slipped. They come back in review automatically.</p>
          {list(data.weak)}
        </section>
      )}
      {groups.learning.length > 0 && <section aria-labelledby="learning-h"><h2 id="learning-h">Still learning</h2>{list(groups.learning)}</section>}
      {groups.approaching.length > 0 && <section aria-labelledby="near-h"><h2 id="near-h">Nearly mastered</h2><p className="muted small">Proficient: varied first-try answers. Mastery also needs time and a successful review.</p>{list(groups.approaching)}</section>}
      {groups.mastered.length > 0 && <section aria-labelledby="mastered-h"><h2 id="mastered-h">Mastered</h2>{list(groups.mastered)}</section>}

      {data.upcoming.length > 0 && (
        <section className="card" aria-labelledby="up-h">
          <h2 id="up-h" className="h3">Coming up</h2>
          <ul className="plain">{data.upcoming.map((u) => <li key={u.conceptId}>{u.title} <span className="muted small">· {friendlyDate(u.dueDate, today)}</span></li>)}</ul>
        </section>
      )}
      {data.history.length > 0 && (
        <details className="card">
          <summary>Recent reviews</summary>
          <ul className="plain">{data.history.map((h) => <li key={h.id}>{friendlyDate(h.localDate, today) === "today" ? "Today" : h.localDate}: {h.firstTryCorrect} of {h.questions} right first time <span className="muted small">· {h.concepts.join(", ")}</span></li>)}</ul>
        </details>
      )}
      <details className="card how-it-works">
        <summary>How lessons, mastery and practice assessments differ</summary>
        <ul>
          <li><strong>Lesson complete:</strong> you finished the teaching and every question in it. This is what opens the next lesson.</li>
          <li><strong>Mastered:</strong> {data.rules.proficient.minIndependentCorrect}+ varied first-try answers without hints becomes proficient. Mastered needs {data.rules.mastered.minIndependentCorrect}+, on {data.rules.mastered.minDaysSinceFirstEvidence}+ days, plus a successful review. These numbers are starting settings that a teacher will check.</li>
          <li><strong>Practice assessment passed:</strong> a separate check of a whole grade. Lessons, XP and streaks never count towards it.</li>
          <li><strong>XP:</strong> a reward for showing up. It never unlocks lessons and isn't a measure of how well you know the music.</li>
        </ul>
      </details>
    </div>
  );
}

/** One review session: questions without hints, honest feedback, a similar question after a slip, then a summary. */
export function ReviewPlayer() {
  const { sessionId = "" } = useParams();
  const nav = useNavigate();
  const { me, refreshProgress } = useApp();
  const userId = me?.user.id;
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [doneError, setDoneError] = useState<ApiFailure | null>(null);
  const [tryAgain, setTryAgain] = useState(0);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    const s = await api.reviewSession(sessionId);
    setSession(s);
    return s;
  }, [sessionId]);

  useEffect(() => {
    let live = true;
    firstLoad.current = true;
    setSession(null);
    setSummary(null);
    setIdx(null);
    setError(null);
    load().then(
      (s) => {
        if (!live) return;
        const first = s.items.findIndex((i) => !i.answered);
        setIdx(first === -1 ? s.items.length : first);
      },
      (e: unknown) => live && setError(asFailure(e, "Could not open the review.")),
    );
    return () => {
      live = false;
      stopAll();
    };
  }, [load, userId]);

  const finishing = session !== null && idx !== null && idx >= session.items.length;
  useEffect(() => {
    if (!finishing) return;
    let live = true;
    setDoneError(null);
    api.completeReview(sessionId).then(
      async (s) => {
        if (!live) return;
        setSummary(s);
        cue("done");
        await refreshProgress();
      },
      (e: unknown) => live && setDoneError(asFailure(e, "Could not save your review.")),
    );
    return () => {
      live = false;
    };
  }, [finishing, sessionId, refreshProgress, tryAgain, userId]);

  if (error?.status === 404) return <NotFoundView what="review" />;
  if (error?.status === 401) return <Navigate to="/welcome" replace />;
  if (error) return <ErrorState error={error} onRetry={() => nav(0)} title="We couldn't open that review" />;
  if (!session || idx === null) return <Loading label="Opening your review…" />;
  if (session.status !== "open" && !summary && !finishing) {
    return (
      <div className="state"><Icon name="info" size={36} /><h1>This review has finished</h1><p>Start a new one from Review whenever topics are due.</p><Link className="btn btn-primary" to="/review">Back to Review</Link></div>
    );
  }

  const reviewItems = session.items.filter((i) => i.kind === "review");
  const total = session.items.length;
  const current = session.items[idx];

  return (
    <div className="player review-player" data-step={idx}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close review. Your progress is saved." onClick={() => nav("/review")}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(idx, total)}>
          <span style={{ width: `${(Math.min(idx, total) / Math.max(1, total)) * 100}%` }} />
        </div>
      </header>
      <div className="player-body" key={idx}>
        {current && (
          <Question
            key={current.item.id}
            nodeId=""
            item={current.item}
            index={session.items.slice(0, idx + 1).filter((i) => i.kind === current.kind).length}
            total={current.kind === "review" ? reviewItems.length : session.items.filter((i) => i.kind === "remedial").length || 1}
            eyebrow={current.kind === "remedial" ? `A similar question · ${current.conceptTitle}` : `Review · ${current.conceptTitle}`}
            source={{
              attempt: async (attemptId, itemId, response) => {
                const r = await api.reviewAttempt(sessionId, attemptId, itemId, response);
                // A slip adds a similar question to the session; fetch it so it can be offered at once.
                if (!r.correct && r.remedialItemId) await load().catch(() => undefined);
                return r;
              },
              hint: () => Promise.reject(new ApiFailure(409, "no_hints", "Review has no hints.")),
            }}
            continueLabel={idx + 1 >= total ? "Finish review" : "Continue"}
            onCorrect={() => setIdx(idx + 1)}
            wrongAction={(r) => {
              const go = (target: number) => ({ label: current.kind === "review" ? "Try a similar question" : "Move on", onClick: () => setIdx(target) });
              if (current.kind === "review" && r.attemptNumber >= 1) {
                const rem = r.remedialItemId ? session.items.findIndex((i) => i.item.id === r.remedialItemId) : -1;
                return rem >= 0 ? go(rem) : null;
              }
              return current.kind === "remedial" ? go(idx + 1) : null;
            }}
          />
        )}
        {finishing && <ReviewDone summary={summary} error={doneError} onRetry={() => setTryAgain((n) => n + 1)} />}
      </div>
    </div>
  );
}

function ReviewDone({ summary, error, onRetry }: { summary: ReviewSummary | null; error: ApiFailure | null; onRetry: () => void }) {
  const { engagement } = useApp();
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (summary) h.current?.focus();
  }, [summary]);
  if (error) {
    return (
      <>
        <section className="lesson-step"><h1>We couldn't save your review</h1><p>{error.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error.message}</p></section>
        <ActionBar><button className="btn btn-primary btn-large" onClick={onRetry}>Try again</button></ActionBar>
      </>
    );
  }
  if (!summary) return <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving your review…</p></div>;
  return (
    <>
      <section className="lesson-step" aria-labelledby="rev-done">
        <p className="eyebrow">Review finished</p>
        <h1 id="rev-done" tabIndex={-1} ref={h}>{summary.firstTryCorrect === summary.questions ? "Every answer right first time" : "Nice work reviewing"}</h1>
        <p className="lede-small">{summary.firstTryCorrect} of {summary.questions} right first time.{summary.remedialDone > 0 ? ` You also worked through ${plural(summary.remedialDone, "similar question")}.` : ""}</p>
        <ul className="plain concept-list">
          {summary.concepts.map((c) => (
            <li key={c.conceptId} className="concept-row">
              <div className="concept-head"><strong>{c.title}</strong><span className={`pill ${c.result === "solid" ? "status-completed" : "status-review_available"}`}>{c.result === "solid" ? "Solid" : "Needs a little more practice"}</span></div>
              <p className="muted small">{c.result === "solid" ? "Nicely done." : "It's normal to slip while learning. We'll bring it back soon, with a fresh question."} Next review {friendlyDate(c.nextDueDate, summary.today)}.</p>
            </li>
          ))}
        </ul>
        <section className="reward" aria-labelledby="reward-h">
          <h2 id="reward-h" className="h3">What you earned</h2>
          <XpAward awarded={summary.xp.awarded} reason={summary.xp.reason} />
          {engagement.status === "ready" && (
            <>
              <MilestoneBar total={engagement.data.xp.total} milestone={engagement.data.xp.milestone} />
              <GoalLine goal={engagement.data.goal} />
            </>
          )}
          <NewBadges badges={summary.newAchievements.map((a) => ({ ...a, description: "" }))} />
        </section>
      </section>
      <ActionBar>
        <Link className="btn btn-primary btn-large" to="/review">Back to Review</Link>
        <Link className="btn btn-ghost" to="/learn">Continue learning</Link>
      </ActionBar>
    </>
  );
}
