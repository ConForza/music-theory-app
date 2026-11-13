import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiFailure, type NodeResult, type NodeSession } from "../api/client";
import { RewardPanel } from "../components/Engagement";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { cue, stopAll } from "../lib/audio";
import { lockReason } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";
import { ActionBar, Question, Step } from "./LessonSteps";

const COPY = {
  practice: { eyebrow: "Practice", intro: "Mixed questions on everything in this unit. Hints are there if you need them, and you can try again after a slip.", done: "Practice complete" },
  review: { eyebrow: "Review", intro: "A fresh mix of questions from this unit and earlier ones. There are no hints here: it is your chance to see what has stuck. You can try again after a slip.", done: "Review complete" },
  challenge: { eyebrow: "Unit challenge", intro: "Show what you can do on your own. There are no hints, and your first answer to each question is the one that counts. Whatever happens, nothing is lost and you can try again with fresh questions.", done: "Challenge finished" },
  assessment: { eyebrow: "Grade 1 assessment", intro: "A practice check across the whole of Grade 1. There are no hints, and your first answer to each question counts. You can take it again with fresh questions.", done: "Assessment finished" },
} as const;

type Load = { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; session: NodeSession };
const asFailure = (e: unknown, msg: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", msg));

/** First question still to do: unanswered in a challenge/assessment, not yet correct in practice/review. */
export function resumeAt(s: NodeSession): number {
  const strict = s.firstAttemptOnly;
  const i = s.items.findIndex((x) => (strict ? !x.answered : !x.correct));
  return i === -1 ? s.items.length : i;
}

export function NodeRun({ nodeId }: { nodeId: string }) {
  const nav = useNavigate();
  const { me, refreshProgress, reloadAll } = useApp();
  const userId = me?.user.id;
  const data = useCourseData();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [idx, setIdx] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<NodeResult | null>(null);
  const [doneError, setDoneError] = useState<ApiFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [finishTry, setFinishTry] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    setResult(null);
    setDoneError(null);
    setStarted(false);
    api.nodeStart(nodeId).then(
      (session) => {
        if (!live) return;
        const at = resumeAt(session);
        setIdx(at);
        setResumed(session.items.some((i) => i.answered));
        setLoad({ status: "ready", session });
      },
      (e: unknown) => live && setLoad({ status: "error", error: asFailure(e, "Could not open this activity.") }),
    );
    return () => {
      live = false;
      stopAll();
    };
  }, [nodeId, attempt, userId]);

  const session = load.status === "ready" ? load.session : null;
  const total = session?.items.length ?? 0;
  const finishing = Boolean(session) && started && idx >= total;
  useEffect(() => {
    if (!finishing) return;
    let live = true;
    setDoneError(null);
    api.nodeComplete(nodeId).then(
      async (r) => {
        if (!live) return;
        setResult(r);
        cue(r.completedNode ? "done" : "wrong");
        await refreshProgress();
      },
      (e: unknown) => live && setDoneError(asFailure(e, "Could not save your result.")),
    );
    return () => {
      live = false;
    };
  }, [finishing, nodeId, refreshProgress, finishTry, userId]);

  const lockedTitles = useMemo(() => {
    if (load.status !== "error" || load.error.code !== "locked" || data.status !== "ready") return null;
    return lockReason({ lockedBy: (load.error.details.lockedBy as string[]) ?? [] } as never, data.titleOf);
  }, [load, data]);

  if (load.status === "loading") return <Loading label="Getting your questions ready…" />;
  if (load.status === "error") {
    const e = load.error;
    if (e.status === 401) return <Navigate to="/welcome" replace />;
    if (e.status === 404) return <NotFoundView what="activity" />;
    if (e.code === "locked")
      return <div className="state" role="alert"><Icon name="lock" size={36} /><h1>This is locked for now</h1><p>{lockedTitles}</p><Link className="btn btn-primary" to="/learn">Back to the path</Link></div>;
    if (e.code === "coming_soon")
      return <div className="state" role="alert"><Icon name="info" size={36} /><h1>Coming soon</h1><p>This activity is still being written.</p><Link className="btn btn-primary" to="/learn">Back to the path</Link></div>;
    return <ErrorState error={e} onRetry={() => (e.isNetwork ? setAttempt((a) => a + 1) : reloadAll())} title="We couldn't open that" />;
  }

  const s = load.session;
  const copy = COPY[s.kind];
  const strict = s.firstAttemptOnly;
  const item = started && idx < total ? s.items[idx] : undefined;
  const barMax = Math.max(1, total);

  return (
    <div className="player node-player" data-step={started ? idx + 1 : 0} data-kind={s.kind}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close. Your progress is saved." onClick={() => nav("/learn")}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={barMax} aria-valuenow={Math.min(idx, barMax)}>
          <span style={{ width: `${(Math.min(started ? idx : 0, barMax) / barMax) * 100}%` }} />
        </div>
      </header>
      <div className="player-body" key={started ? idx : "intro"}>
        {!started && (
          <>
            <Step title={s.title} eyebrow={resumed ? "Welcome back" : copy.eyebrow}>
              <p className="lede-small">{copy.intro}</p>
              <p className="muted small"><Icon name="clock" size={16} /> {total} questions · Your progress saves as you go</p>
              {strict && s.passPercent !== null && <p className="small">To pass, get {s.passPercent}% right first time. This is our own practice mark, not an ABRSM pass mark.</p>}
              {s.disclaimer && <p className="muted small">{s.disclaimer}</p>}
            </Step>
            <ActionBar><button className="btn btn-primary btn-large" autoFocus onClick={() => setStarted(true)}>{resumed ? "Continue" : "Let's go"}</button></ActionBar>
          </>
        )}
        {item && (
          <Question
            key={item.item.id}
            nodeId={nodeId}
            item={item.item}
            index={idx + 1}
            total={total}
            eyebrow={copy.eyebrow}
            final={strict}
            source={{ attempt: (id, itemId, r) => api.nodeAttempt(nodeId, id, itemId, r), hint: (itemId, level) => api.nodeHint(nodeId, itemId, level) }}
            continueLabel={idx + 1 >= total ? "Finish" : "Continue"}
            onCorrect={() => { setIdx(idx + 1); window.scrollTo?.(0, 0); }}
          />
        )}
        {finishing && <NodeDone kind={s.kind} result={result} error={doneError} onRetry={() => setFinishTry((n) => n + 1)} onAgain={() => setAttempt((n) => n + 1)} nodeId={nodeId} />}
      </div>
    </div>
  );
}

function NodeDone({ kind, result, error, onRetry, onAgain, nodeId }: { kind: NodeSession["kind"]; result: NodeResult | null; error: ApiFailure | null; onRetry: () => void; onAgain: () => void; nodeId: string }) {
  const data = useCourseData();
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (result) h.current?.focus();
  }, [result]);
  const retake = useCallback(() => onAgain(), [onAgain]);
  if (error) {
    return (
      <>
        <Step title="We couldn't save your result"><p>{error.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error.message}</p></Step>
        <ActionBar><button className="btn btn-primary btn-large" onClick={onRetry}>Try again</button></ActionBar>
      </>
    );
  }
  if (!result) return <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving your result…</p></div>;
  const strict = kind === "challenge" || kind === "assessment";
  const passed = result.completedNode;
  const title = !strict ? COPY[kind].done : passed ? (kind === "assessment" ? "Grade 1 assessment passed" : "Challenge passed") : "Not passed yet";
  return (
    <>
      <section className="lesson-step" aria-labelledby="nd-title">
        <p className="eyebrow">{COPY[kind].eyebrow}</p>
        <h1 id="nd-title" tabIndex={-1} ref={h}>{title}</h1>
        {strict ? (
          <>
            <p className="lede-small" data-testid="score">{result.score} of {result.questions} right first time ({result.percent}%). The pass mark is {result.passPercent}%.</p>
            {!passed && <p>That's a useful result, not a failure: it shows exactly what to look at next. Nothing is lost, and you can try again with fresh questions whenever you like.</p>}
            {result.sections && result.sections.length > 0 && (
              <>
                <h2 className="h3">How each part went</h2>
                <ul className="plain concept-list">{result.sections.map((x) => <li key={x.id} className="concept-row"><div className="concept-head"><strong>{x.title}</strong><span className="pill">{x.correct} of {x.total}</span></div></li>)}</ul>
              </>
            )}
            {result.outcomes && result.outcomes.some((o) => o.correct < o.total) && (
              <>
                <h2 className="h3">Worth another look</h2>
                <ul className="plain">{result.outcomes.filter((o) => o.correct < o.total).map((o) => (
                  <li key={o.outcomeId}>{o.statement}{o.revisit[0] && data.status === "ready" ? <> · <Link to={`/lesson/${o.revisit[0]}`}>{data.titleOf(o.revisit[0])}</Link></> : null}</li>
                ))}</ul>
              </>
            )}
            {result.disclaimer && <p className="muted small">{result.disclaimer}</p>}
          </>
        ) : (
          <p className="lede-small">{result.firstTryCorrect === result.questions ? "Every question right first time." : `${result.firstTryCorrect} of ${result.questions} right first time. Keep practising and the rest will follow.`}</p>
        )}
        {result.rewards && <RewardPanel rewards={result.rewards} />}
        <p className="muted small">Progress saved.</p>
      </section>
      <ActionBar>
        <Link className="btn btn-primary btn-large" to="/learn" autoFocus>Back to the path</Link>
        {strict && !passed && <button className="btn btn-ghost" onClick={retake}>Try again with fresh questions</button>}
        {!strict && <button className="btn btn-ghost" onClick={retake} data-node={nodeId}>Practise again</button>}
      </ActionBar>
    </>
  );
}
