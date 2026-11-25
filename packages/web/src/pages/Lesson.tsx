import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { api, ApiFailure, type CompletionSummary, type LessonAccess, type OpenedLesson, type RunState } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { lockReason } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";
import { Demo, Done, Intro, Question, Teach } from "./LessonSteps";

type Load =
  | { status: "loading" }
  | { status: "error"; error: ApiFailure }
  | { status: "ready"; lesson: OpenedLesson; run: RunState };

const PHASE_INDEX: Record<string, number> = { intro: 0, teach: 1, demo: 2, questions: 3 };

/** Where to resume: the first unanswered question once questions have begun, otherwise the saved teaching step. */
export function resumeIndex(lesson: Pick<OpenedLesson, "items">, run: RunState): number {
  const firstOpen = lesson.items.findIndex((i) => !run.items[i.id]?.correct);
  const answered = lesson.items.some((i) => run.items[i.id]?.attempts);
  if (firstOpen === -1) return 3 + lesson.items.length; // everything answered: finish
  if (run.phase === "questions" || answered) return 3 + firstOpen;
  return PHASE_INDEX[run.phase] ?? 0;
}

export function Lesson() {
  const { nodeId = "" } = useParams();
  // Flexible learning: opened from Explore (or a "learn it" link), so a lesson ahead of the guided path may be opened. The server decides the rest.
  const [search] = useSearchParams();
  const explore = search.get("explore") === "1";
  const nav = useNavigate();
  const { me, refreshProgress, reloadAll } = useApp();
  const userId = me?.user.id; // a different learner means a different lesson run: everything below restarts for them
  const data = useCourseData();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [idx, setIdx] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [summary, setSummary] = useState<(CompletionSummary & { alreadyComplete: boolean }) | null>(null);
  const [doneError, setDoneError] = useState<ApiFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [finishTry, setFinishTry] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    setSummary(null);
    setDoneError(null);
    (async () => {
      try {
        const lesson = await api.lesson(nodeId, explore);
        if (!live) return; // the learner (or lesson) changed while loading: never start a run on their behalf
        const run = await api.start(nodeId, explore);
        if (!live) return;
        const start = resumeIndex(lesson, run);
        setIdx(start);
        setResumed(start > 0);
        setLoad({ status: "ready", lesson, run });
      } catch (e) {
        if (live) setLoad({ status: "error", error: e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not open the lesson.") });
      }
    })();
    return () => {
      live = false;
    };
  }, [nodeId, attempt, userId, explore]);

  const node = data.status === "ready" ? data.nodes.get(nodeId) : undefined;
  const total = load.status === "ready" ? 3 + load.lesson.items.length + 1 : 1;

  const go = useCallback(
    (i: number, phase?: string) => {
      setIdx(i);
      window.scrollTo?.(0, 0);
      if (phase) void api.setPhase(nodeId, phase).catch(() => undefined);
    },
    [nodeId],
  );

  // On reaching the last step, ask the server to complete the lesson. It decides; we only display.
  const finishing = load.status === "ready" && idx === total - 1;
  useEffect(() => {
    if (!finishing) return;
    let live = true;
    setDoneError(null);
    api.complete(nodeId).then(
      async (s) => {
        if (!live) return;
        setSummary(s);
        await refreshProgress();
      },
      (e: unknown) => live && setDoneError(e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not save.")),
    );
    return () => {
      live = false;
    };
  }, [finishing, nodeId, refreshProgress, finishTry, userId]);

  const lockedTitles = useMemo(() => {
    if (load.status !== "error" || load.error.code !== "locked" || data.status !== "ready") return null;
    return lockReason({ lockedBy: (load.error.details.lockedBy as string[]) ?? [] } as never, data.titleOf, data.progress.nodes);
  }, [load, data]);

  if (load.status === "loading") return <Loading label="Opening your lesson…" />;
  if (load.status === "error") {
    const e = load.error;
    if (e.status === 401) return <Navigate to="/welcome" replace />;
    if (e.status === 404) return <NotFoundView what="lesson" />;
    if (e.code === "locked")
      return (
        <div className="state" role="alert">
          <Icon name="lock" size={36} />
          <h1>This lesson is locked</h1>
          <p>{lockedTitles}</p>
          <div className="row">
            <Link className="btn btn-primary" to="/learn">Back to the path</Link>
            {e.details.explorable === true && <Link className="btn btn-ghost" to={`/lesson/${nodeId}?explore=1`}>Explore it anyway</Link>}
          </div>
        </div>
      );
    if (e.code === "coming_soon")
      return (
        <div className="state" role="alert"><Icon name="info" size={36} /><h1>Coming soon</h1><p>{node ? `“${node.title}” is still being written.` : e.message} Pick one of the ready lessons instead.</p><Link className="btn btn-primary" to="/learn">Back to the path</Link></div>
      );
    return <ErrorState error={e} onRetry={() => (e.isNetwork ? setAttempt((a) => a + 1) : reloadAll())} title="We couldn't open that lesson" />;
  }

  const { lesson } = load;
  const back = lesson.access.mode === "explore" || explore ? "/learn/explore" : "/learn";
  const qIndex = idx - 3;
  const item = qIndex >= 0 && qIndex < lesson.items.length ? lesson.items[qIndex] : undefined;

  const next = () => {
    const to = idx + 1;
    if (to === 1) return go(to, "teach");
    if (to === 2) return go(to, "demo");
    if (to === 3) return go(to, "questions");
    return go(to);
  };

  return (
    <div className="player" data-step={idx}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close lesson. Your progress is saved." onClick={() => nav(back === "/learn/explore" ? `/learn/explore?grade=${node?.id.charAt(1) ?? ""}` : back)}>
          <Icon name="close" />
        </button>
        <div className="progress" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={total - 1} aria-valuenow={Math.min(idx, total - 1)}>
          <span style={{ width: `${(Math.min(idx, total - 1) / (total - 1)) * 100}%` }} />
        </div>
      </header>
      <div className="player-body" key={idx}>
        {idx === 0 && <Intro notice={lesson.access.outOfSequence ? <ExploreNote access={lesson.access} /> : undefined} lesson={lesson} title={node?.title ?? "Lesson"} minutes={node?.estimatedMinutes ?? 5} resumed={resumed} onNext={next} />}
        {idx === 1 && <Teach lesson={lesson} onNext={next} />}
        {idx === 2 && <Demo lesson={lesson} onNext={next} />}
        {item && (
          <Question
            key={item.id}
            nodeId={nodeId}
            item={item}
            index={qIndex + 1}
            total={lesson.items.length}
            onCorrect={() => go(idx + 1)}
          />
        )}
        {finishing && <Done lesson={lesson} summary={summary} nextId={summary?.nextNodeId ?? null} nextTitle={summary?.nextNodeId && data.status === "ready" ? data.titleOf(summary.nextNodeId) : null} error={doneError} onRetry={() => setFinishTry((a) => a + 1)} />}
      </div>
    </div>
  );
}

/** Shown before a lesson the learner is exploring ahead of their guided path: advice, never a block. */
function ExploreNote({ access }: { access: LessonAccess }) {
  return (
    <aside className="card callout explore-note" aria-label="Exploring ahead" data-testid="explore-note">
      <p><Icon name="info" size={18} /> <strong>You're exploring ahead of your guided path.</strong> Finishing this lesson counts as done. Lessons before it stay as they are, and your path does not move.</p>
      {access.foundations.length > 0 && (
        <>
          <p className="small">It may help to know these first:</p>
          <ul className="plain">{access.foundations.map((f) => <li key={f.nodeId}><Link to={`/lesson/${f.nodeId}?explore=1`}>{f.title}</Link> <span className="muted small">· Grade {f.grade}</span></li>)}</ul>
        </>
      )}
    </aside>
  );
}
