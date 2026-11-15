import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type AttemptResult, type PrepAttempt } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { stopAll } from "../lib/audio";
import { clockText, minutesText, spokenTime } from "../lib/prep";
import { ActionBar, Question, Step } from "./LessonSteps";

const asFailure = (e: unknown, msg: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", msg));
type Load = { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; attempt: PrepAttempt };

/** First question still to do: unanswered in an independent attempt, not yet answered at all in practice mode. */
export function resumeIndex(a: PrepAttempt): number {
  const i = a.items.findIndex((x) => !x.answered);
  return i === -1 ? a.items.length : i;
}

/**
 * The player for practice examinations and placement checks.
 *   Practice mode: hints, immediate feedback, retries, and a way to move on.
 *   Mock and placement: no hints, no verdicts, the first answer is final. Nothing about right or wrong is shown until the attempt is finished.
 * The clock (timed mock only) is the SERVER's: this screen only displays it, so reloading or switching device can neither reset nor extend it.
 */
export function PrepPlayer() {
  const { attemptId = "" } = useParams();
  const nav = useNavigate();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [finishing, setFinishing] = useState<null | "ask" | "saving" | "error">(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  // "Now" as the SERVER sees it, kept in state (never read during render): set when the attempt loads and refreshed by the one-second timer below.
  const [nowMs, setNowMs] = useState(0);
  const [announce, setAnnounce] = useState("");
  const offset = useRef(0);
  const spoken = useRef(new Set<number>());
  const finishLock = useRef(false);

  const reload = useCallback(async () => {
    const a = await api.prepAttempt(attemptId);
    offset.current = new Date(a.timing.serverNow).getTime() - Date.now();
    setNowMs(new Date(a.timing.serverNow).getTime());
    return a;
  }, [attemptId]);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    reload().then(
      (attempt) => {
        if (!live) return;
        if (attempt.status !== "open") return void nav(`/results/${attemptId}`, { replace: true });
        setIdx(resumeIndex(attempt));
        setResumed(attempt.items.some((i) => i.answered));
        setLoad({ status: "ready", attempt });
      },
      (e: unknown) => live && setLoad({ status: "error", error: asFailure(e, "Could not open this attempt.") }),
    );
    return () => {
      live = false;
      stopAll();
    };
  }, [attemptId, reload, nav]);

  const attempt = load.status === "ready" ? load.attempt : null;
  const timing = attempt?.timing;
  const deadline = timing?.deadlineAt ? new Date(timing.deadlineAt).getTime() : null;
  const remaining = deadline === null || nowMs === 0 ? null : Math.max(0, Math.ceil((deadline - nowMs) / 1000));

  // The visible clock moves every second; assistive technology is told only at a few milestones, never every tick.
  useEffect(() => {
    if (deadline === null || !started) return;
    const t = setInterval(() => setNowMs(Date.now() + offset.current), 1000);
    return () => clearInterval(t);
  }, [deadline, started]);
  useEffect(() => {
    if (remaining === null || !started) return;
    for (const m of [1800, 600, 300, 60]) {
      if (remaining <= m && remaining > m - 5 && !spoken.current.has(m)) {
        spoken.current.add(m);
        setAnnounce(`${spokenTime(m)} left.`);
      }
    }
  }, [remaining, started]);

  const finish = useCallback(
    async (allowUnanswered: boolean) => {
      if (finishLock.current) return;
      finishLock.current = true;
      setFinishing("saving");
      setError(null);
      try {
        await api.prepComplete(attemptId, allowUnanswered);
        nav(`/results/${attemptId}`, { replace: true });
      } catch (e) {
        const f = asFailure(e, "Could not save your result.");
        if (f.code === "incomplete") {
          // Another device (or a lost reply) left a question unanswered: go back to it rather than finishing with a gap.
          try {
            const fresh = await reload();
            setLoad({ status: "ready", attempt: fresh });
            setIdx(resumeIndex(fresh));
            setFinishing(null);
            return;
          } catch {
            /* show the generic error below */
          }
        }
        setError(f);
        setFinishing("error");
      } finally {
        finishLock.current = false;
      }
    },
    [attemptId, nav, reload],
  );

  // Time is up: finish automatically with what has been answered.
  useEffect(() => {
    if (started && remaining === 0 && finishing === null) {
      setAnnounce("Time is up. Saving your answers.");
      void finish(true);
    }
  }, [remaining, started, finishing, finish]);

  // An attempt whose questions were ALL answered before the learner left (or on another device) resumes at the end: there is no question to show, so it settles
  // straight away. A placement check may still grow, so it looks once more before finishing.
  const settle = useCallback(async () => {
    if (!attempt) return;
    if (attempt.kind === "placement") {
      try {
        const fresh = await reload();
        setLoad({ status: "ready", attempt: fresh });
        if (fresh.items.length > attempt.items.length) return setIdx(attempt.items.length);
      } catch {
        /* completion re-checks everything on the server */
      }
    }
    void finish(false);
  }, [attempt, reload, finish]);
  useEffect(() => {
    if (started && finishing === null && attempt && attempt.items.length > 0 && idx >= attempt.items.length) void settle();
  }, [started, finishing, attempt, idx, settle]);

  const total = attempt?.items.length ?? 0;
  const source = useMemo(
    () => ({
      attempt: async (id: string, itemId: string, r: Parameters<typeof api.prepAnswer>[3]): Promise<AttemptResult> => {
        const x = await api.prepAnswer(attemptId, id, itemId, r);
        // Independent attempts never say whether an answer was right, so there is nothing to show but "saved".
        if ("correct" in x && typeof x.correct === "boolean") return x as AttemptResult;
        return { correct: true, category: null, message: "Answer saved.", attemptNumber: x.attemptNumber, replayed: x.replayed };
      },
      hint: (itemId: string, level: number) => api.prepHint(attemptId, itemId, level),
    }),
    [attemptId],
  );

  if (load.status === "loading") return <Loading label="Getting your questions ready…" />;
  if (load.status === "error") {
    const e = load.error;
    if (e.status === 401) return <Navigate to="/welcome" replace />;
    if (e.status === 404) return <NotFoundView what="attempt" />;
    return <ErrorState error={e} onRetry={() => window.location.reload()} title="We couldn't open that" />;
  }
  const a = load.attempt;
  const blind = a.mode !== "practice";
  const placement = a.kind === "placement";
  const item = started && idx < total ? a.items[idx] : undefined;
  const answered = a.items.filter((i) => i.answered).length;
  const eyebrow = placement ? "Placement check" : a.mode === "mock" ? `Grade ${a.grade} mock examination` : `Grade ${a.grade} practice mode`;

  async function next() {
    // A placement check grows while the learner keeps showing secure understanding: look again before deciding it is over.
    if (placement && idx + 1 >= total) {
      try {
        const fresh = await reload();
        setLoad({ status: "ready", attempt: fresh });
        if (fresh.items.length > total) return setIdx(idx + 1);
      } catch {
        /* fall through to finishing: completion re-checks everything on the server */
      }
      return void finish(false);
    }
    if (idx + 1 >= total) return void finish(false);
    setIdx(idx + 1);
    window.scrollTo?.(0, 0);
  }

  return (
    <div className="player node-player prep-player" data-step={started ? idx + 1 : 0} data-kind={a.kind} data-mode={a.mode}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close. Your answers are saved and you can carry on later." onClick={() => nav(placement ? "/placement" : `/practice/exam/${a.grade}`)}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(started ? idx : answered, Math.max(1, total))}>
          <span style={{ width: `${(Math.min(started ? idx : answered, Math.max(1, total)) / Math.max(1, total)) * 100}%` }} />
        </div>
        {remaining !== null && started && (
          <span className={`exam-clock${remaining <= 60 ? " is-low" : ""}`} role="timer" aria-live="off" aria-label={`Time left: ${spokenTime(remaining)}`} data-testid="clock">
            <Icon name="clock" size={18} /> <span aria-hidden="true">{clockText(remaining)}</span>
          </span>
        )}
      </header>
      <div className="visually-hidden" role="status" aria-live="polite" data-testid="clock-announce">{announce}</div>

      <div className="player-body" key={started ? `${idx}-${finishing}` : "intro"}>
        {!started && (
          <>
            <Step title={a.kind === "placement" ? "Find your starting point" : `Grade ${a.grade} ${a.mode === "mock" ? "mock examination" : "practice examination"}`} eyebrow={resumed ? "Welcome back" : eyebrow}>
              <p className="lede-small">
                {placement
                  ? "A few questions from each grade, starting with Grade 1. We stop as soon as we know where you'd best begin, so it is between 6 and 24 questions. There are no hints, and your first answer to each question counts."
                  : a.mode === "mock"
                    ? "Answer on your own, as in an examination. There are no hints, your first answer to each question counts, and you will not be told what was right or wrong until you finish. Then you get a full breakdown."
                    : "Take your time. Hints are there if you need them, you get feedback after every question, and you can try again after a slip. Because you have help, this does not count as independent evidence."}
              </p>
              <p className="muted small"><Icon name="clock" size={16} /> {placement ? "Starting with 6 questions" : `${total} questions`} · Your answers save as you go{answered > 0 ? ` · ${answered} done` : ""}</p>
              {timing?.timed && remaining !== null && (
                <div className="notice" role="note" data-testid="timing-note">
                  <p><strong>Timed: {minutesText(timing.limitSeconds ?? 0)}.</strong> {timing.extraTimePercent ? `That includes ${timing.extraTimePercent}% extra time from your settings. ` : ""}The timer is our own default, not an ABRSM time allowance. It keeps running if you close this page, and your answers are saved if time runs out. Speed is never part of your score.</p>
                  {resumed && <p>You have {minutesText(remaining)} left.</p>}
                </div>
              )}
              <p className="muted small">{a.disclaimer}</p>
            </Step>
            <ActionBar><button className="btn btn-primary btn-large" autoFocus onClick={() => setStarted(true)}>{resumed ? "Continue" : timing?.timed ? "Start the timer" : "Let's go"}</button></ActionBar>
          </>
        )}

        {item && finishing === null && (
          <>
            <Question
              key={item.item.id}
              nodeId=""
              item={item.item}
              index={idx + 1}
              total={total}
              eyebrow={eyebrow}
              blind={blind}
              source={source}
              continueLabel={idx + 1 >= total && !placement ? "Finish" : "Continue"}
              onCorrect={() => void next()}
              wrongAction={a.mode === "practice" ? () => ({ label: "Move on", onClick: () => void next() }) : undefined}
            />
            {(a.mode === "mock" || placement) && (
              <div className="finish-early"><button type="button" className="btn btn-quiet btn-small" onClick={() => setFinishing("ask")}>Finish early…</button></div>
            )}
          </>
        )}

        {finishing === "ask" && (
          <>
            <Step title="Finish now?" eyebrow={eyebrow}>
              <p>{a.items.length - answered === 0 ? "You have answered every question." : `${a.items.length - answered} ${a.items.length - answered === 1 ? "question is" : "questions are"} not answered yet. They will be reported as "not yet assessed", not as wrong.`}</p>
              <p className="muted small">Finishing early costs nothing. You can take another one whenever you like.</p>
            </Step>
            <ActionBar>
              <button className="btn btn-primary btn-large" autoFocus onClick={() => void finish(true)}>Finish and see my result</button>
              <button className="btn btn-ghost" onClick={() => setFinishing(null)}>Keep going</button>
            </ActionBar>
          </>
        )}
        {finishing === "saving" && <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving your result…</p></div>}
        {finishing === "error" && (
          <>
            <Step title="We couldn't save your result"><p>{error?.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error?.message}</p></Step>
            <ActionBar><button className="btn btn-primary btn-large" onClick={() => void finish(false)}>Try again</button></ActionBar>
          </>
        )}
        {started && !item && finishing === null && (
          <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Checking your answers…</p></div>
        )}
      </div>
    </div>
  );
}
