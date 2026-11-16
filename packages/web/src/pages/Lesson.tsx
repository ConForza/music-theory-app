import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type CompletionSummary, type LearnerLesson, type RunState } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { lockReason } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";
import { Demo, Done, Intro, Question, Teach } from "./LessonSteps";

type Load =
  | { status: "loading" }
  | { status: "error"; error: ApiFailure }
  | { status: "ready"; lesson: LearnerLesson; run: RunState };

const PHASE_INDEX: Record<string, number> = { intro: 0, teach: 1, demo: 2, questions: 3 };

/** Where to resume: the first unanswered question once questions have begun, otherwise the saved teaching step. */
export function resumeIndex(lesson: LearnerLesson, run: RunState): number {
  const firstOpen = lesson.items.findIndex((i) => !run.items[i.id]?.correct);
  const answered = lesson.items.some((i) => run.items[i.id]?.attempts);
  if (firstOpen === -1) return 3 + lesson.items.length; // everything answered: finish
  if (run.phase === "questions" || answered) return 3 + firstOpen;
  return PHASE_INDEX[run.phase] ?? 0;
}

export function Lesson() {
  const { nodeId = "" } = useParams();
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
        const lesson = await api.lesson(nodeId);
        if (!live) return; // the learner (or lesson) changed while loading: never start a run on their behalf
        const run = await api.start(nodeId);
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
  }, [nodeId, attempt, userId]);

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
    return lockReason({ lockedBy: (load.error.details.lockedBy as string[]) ?? [] } as never, data.titleOf);
  }, [load, data]);

  if (load.status === "loading") return <Loading label="Opening your lesson…" />;
  if (load.status === "error") {
    const e = load.error;
    if (e.status === 401) return <Navigate to="/welcome" replace />;
    if (e.status === 404) return <NotFoundView what="lesson" />;
    if (e.code === "locked")
      return (
        <div className="state" role="alert"><Icon name="lock" size={36} /><h1>This lesson is locked</h1><p>{lockedTitles}</p><Link className="btn btn-primary" to="/learn">Back to the path</Link></div>
      );
    if (e.code === "coming_soon")
      return (
        <div className="state" role="alert"><Icon name="info" size={36} /><h1>Coming soon</h1><p>{node ? `“${node.title}” is still being written.` : e.message} Pick one of the ready lessons instead.</p><Link className="btn btn-primary" to="/learn">Back to the path</Link></div>
      );
    return <ErrorState error={e} onRetry={() => (e.isNetwork ? setAttempt((a) => a + 1) : reloadAll())} title="We couldn't open that lesson" />;
  }

  const { lesson } = load;
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
        <button type="button" className="icon-btn" aria-label="Close lesson. Your progress is saved." onClick={() => nav("/learn")}>
          <Icon name="close" />
        </button>
        <div className="progress" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={total - 1} aria-valuenow={Math.min(idx, total - 1)}>
          <span style={{ width: `${(Math.min(idx, total - 1) / (total - 1)) * 100}%` }} />
        </div>
      </header>
      <div className="player-body" key={idx}>
        {idx === 0 && <Intro lesson={lesson} title={node?.title ?? "Lesson"} minutes={node?.estimatedMinutes ?? 5} resumed={resumed} onNext={next} />}
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
