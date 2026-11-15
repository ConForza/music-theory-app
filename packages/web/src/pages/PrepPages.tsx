import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type PrepOverview, type PrepResults } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { MODE_WORDS, READINESS_WORDS, levelClass, LEVEL_WORDS, minutesText } from "../lib/prep";
import { useApp } from "../state/app";

const asFailure = (e: unknown, msg: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", msg));

/** Placement and the five practice examinations: the top of the Practice tab. */
export function ExamHub() {
  const { me } = useApp();
  const [data, setData] = useState<PrepOverview | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.prep().then(setData, (e: unknown) => setError(asFailure(e, "Could not load practice examinations.")));
  }, []);
  useEffect(load, [load, me?.user.id]);
  if (error) return <ErrorState error={error} onRetry={load} title="We couldn't load practice examinations" />;
  if (!data) return <Loading label="Loading practice examinations…" />;
  const p = data.placement;
  return (
    <>
      <section aria-labelledby="exams-h" className="exam-hub">
        <p className="eyebrow">Practice examinations</p>
        <h1 id="exams-h">Test yourself, grade by grade</h1>
        <p className="lede-small">A full paper for each grade, made fresh every time from the whole syllabus. Use practice mode to learn from every question, or a mock examination to see what you can do on your own. These are our own practice assessments: not ABRSM papers, marks or results.</p>
        <ul className="exam-grid">
          {data.grades.map((g) => (
            <li key={g.grade} className="card exam-card" data-grade={g.grade} data-testid={`exam-${g.grade}`}>
              <h2 className="h3">Grade {g.grade}</h2>
              <p className="muted small">{g.questions} questions across {g.outcomes} syllabus outcomes</p>
              {g.readiness.visible && <p className="small"><span className={`pill readiness readiness-${g.readiness.label}`}>{READINESS_WORDS[g.readiness.label]}</span>{g.readiness.percent !== null && <span className="muted"> · about {g.readiness.percent}% on your own</span>}</p>}
              {!g.readiness.visible && g.mockAttempts > 0 && <p className="muted small">{g.mockAttempts} mock {g.mockAttempts === 1 ? "examination" : "examinations"} taken</p>}
              {g.open.length > 0 && <p className="small" role="status">In progress: {g.open.map((o) => MODE_WORDS[o.mode]).join(", ")}</p>}
              <Link className="btn btn-primary btn-small" to={`/practice/exam/${g.grade}`} aria-label={`Grade ${g.grade} practice examination`}>{g.open.length ? "Continue" : "Open"}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="card" aria-labelledby="place-h">
        <h2 id="place-h" className="h3">Not sure where to start?</h2>
        <p>A short placement check suggests a starting grade and points to anything worth catching up on. It is advice only: it never completes a grade{p.startGrade ? ` (you chose to start at Grade ${p.startGrade})` : ""}.</p>
        {p.latest && <p className="muted small">Last check suggested Grade {p.latest.recommendedGrade}.</p>}
        <Link className="btn btn-ghost" to="/placement">{p.openAttemptId ? "Continue placement check" : p.latest ? "Take it again" : "Find my level"}</Link>
      </section>
    </>
  );
}

const EXTRA = [0, 25, 50, 100];

/** Choosing how to take a practice examination: practice mode or mock, untimed or timed, and any extra time. */
export function ExamSetup() {
  const { grade: g = "" } = useParams();
  const grade = Number(g);
  const nav = useNavigate();
  const { me } = useApp();
  const [data, setData] = useState<PrepOverview | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [mode, setMode] = useState<"practice" | "mock">("practice");
  const [timed, setTimed] = useState(false);
  const [extra, setExtra] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.prep().then(setData, (e: unknown) => setError(asFailure(e, "Could not load this examination.")));
  }, []);
  useEffect(load, [load, me?.user.id]);
  if (![1, 2, 3, 4, 5].includes(grade)) return <NotFoundView what="examination" />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const card = data.grades[grade - 1]!;
  const extraPct = extra ?? data.extraTimePercent;
  const open = card.open.find((o) => o.mode === mode);
  const minutes = minutesText(Math.ceil(card.questions * data.timing.secondsPerQuestion * (1 + extraPct / 100)));

  async function start() {
    setBusy(true);
    setStartError(null);
    try {
      const a = await api.startExam(grade, { mode, ...(mode === "mock" && timed ? { timed: true, extraTimePercent: extraPct } : {}) });
      nav(`/exam/run/${a.id}`);
    } catch (e) {
      setStartError(asFailure(e, "Could not start.").message);
      setBusy(false);
    }
  }
  /** Leave the open attempt (its answers stay on record, counted as nothing) and begin another with the choices now on screen. */
  async function startFresh() {
    if (!open) return;
    setBusy(true);
    setStartError(null);
    try {
      await api.prepAbandon(open.id);
      const a = await api.startExam(grade, { mode, ...(mode === "mock" && timed ? { timed: true, extraTimePercent: extraPct } : {}) });
      nav(`/exam/run/${a.id}`);
    } catch (e) {
      setStartError(asFailure(e, "Could not start.").message);
      setBusy(false);
    }
  }
  return (
    <div className="page exam-setup" data-grade={grade}>
      <header className="page-head">
        <p className="eyebrow">Practice examination</p>
        <h1>Grade {grade}</h1>
        <p className="lede-small">{card.questions} questions covering all {card.outcomes} syllabus outcomes of this grade, plus questions that read several ideas from one piece of music. Every paper is different. {card.gradeAssessmentPassed ? "" : "You do not have to finish the grade first."}</p>
      </header>
      <fieldset className="segmented">
        <legend>How would you like to take it?</legend>
        <div>
          <label className={mode === "practice" ? "is-selected" : ""}><input type="radio" name="mode" checked={mode === "practice"} onChange={() => setMode("practice")} /><span>Practice mode<small className="muted">Hints, feedback after every question, no clock</small></span></label>
          <label className={mode === "mock" ? "is-selected" : ""}><input type="radio" name="mode" checked={mode === "mock"} onChange={() => setMode("mock")} /><span>Mock examination<small className="muted">On your own, no hints, results at the end</small></span></label>
        </div>
      </fieldset>
      {mode === "practice" ? (
        <p className="notice">Practice mode is for learning. Because you have help, it is <strong>not counted</strong> as independent evidence.</p>
      ) : (
        <>
          <p className="notice">A mock examination records what you can do <strong>on your own</strong>. You will not be told what was right or wrong until you finish. Your first answer to each question is final.</p>
          <div className="switch-row">
            <label className="switch"><input type="checkbox" role="switch" checked={timed} onChange={(e) => setTimed(e.target.checked)} /><span>Use a timer (optional)</span><small>{`${minutes} for this paper. Our own default, not an ABRSM time allowance. Speed is never part of your score.`}</small></label>
          </div>
          {timed && (
            <fieldset className="segmented" data-testid="extra-time">
              <legend>Extra time</legend>
              <div>
                {EXTRA.map((p) => (
                  <label key={p} className={extraPct === p ? "is-selected" : ""}><input type="radio" name="extra" checked={extraPct === p} onChange={() => setExtra(p)} /><span>{p === 0 ? "None" : `+${p}%`}</span></label>
                ))}
              </div>
              <p className="muted small">An accommodation for anyone who wants it: no reason needed and no effect on your score. You can set a default in Settings. The timer is kept by our server, so it does not stop if you close the page, and your answers are saved if time runs out.</p>
            </fieldset>
          )}
        </>
      )}
      {open && (
        <div role="status" className="notice small" data-testid="resume-note">
          <p>You already have a {MODE_WORDS[mode].toLowerCase()} in progress, with the timing it was started with. Continue it, or leave it and start a fresh one with the choices above.</p>
          <button type="button" className="btn btn-quiet btn-small" onClick={startFresh} disabled={busy}>Start a new one instead</button>
        </div>
      )}
      {startError && <p className="form-error" role="alert">{startError}</p>}
      <div className="row action-row">
        <button className="btn btn-primary btn-large" onClick={start} disabled={busy}>{busy ? "Getting your questions ready…" : open ? "Continue where I left off" : mode === "mock" && timed ? "Start timed mock" : mode === "mock" ? "Start mock examination" : "Start practice"}</button>
      </div>
      <details className="card how-it-works">
        <summary>How this is built and scored</summary>
        <ul>
          <li>Every outcome of the grade is asked {2} times, with new music each time, so one slip does not hide what you know. Four more questions read several ideas from one piece of notation.</li>
          <li>Each question is worth one mark, and a question with several parts needs every part right. These are our own product settings, not ABRSM marking.</li>
          <li>Only mock-examination questions you answered on your own, without hints, count as independent evidence. Any question you leave unanswered counts as not right. An estimate of readiness is not shown yet: it will appear once a teacher has reviewed how it is worked out and the questions.</li>
          <li>It never gives XP or grade badges, and it never changes your path.</li>
        </ul>
      </details>
      <p className="fine-print">{data.disclaimer}</p>
    </div>
  );
}

/** Introduction to the placement check. */
export function PlacementIntro() {
  const nav = useNavigate();
  const { me } = useApp();
  const [data, setData] = useState<PrepOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.prep().then(setData, () => undefined);
  }, [me?.user.id]);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      nav(`/placement/run/${(await api.startPlacement()).id}`);
    } catch (e) {
      setError(asFailure(e, "Could not start the check.").message);
      setBusy(false);
    }
  }
  const open = data?.placement.openAttemptId;
  return (
    <div className="page placement-intro">
      <header className="page-head">
        <p className="eyebrow">Placement check</p>
        <h1>Find your starting point</h1>
        <p className="lede-small">If you already know some theory, answer a few questions from each grade, beginning with Grade 1, and we will suggest where to start and what to catch up on.</p>
      </header>
      <ul className="checklist">
        <li><Icon name="check" size={20} strokeWidth={3} /><span>Between 6 and 24 questions. It stops as soon as we know where you would best begin.</span></li>
        <li><Icon name="check" size={20} strokeWidth={3} /><span>No hints, and your first answer counts. There is no clock.</span></li>
        <li><Icon name="check" size={20} strokeWidth={3} /><span>You choose: start at the suggestion or any grade below it, with no penalty.</span></li>
        <li><Icon name="check" size={20} strokeWidth={3} /><span>It never completes a grade, never gives a grade badge, and never touches your earlier progress. You can take it again whenever you like.</span></li>
      </ul>
      {data?.placement.latest && <p className="muted small">Your last check suggested Grade {data.placement.latest.recommendedGrade}.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row action-row">
        <button className="btn btn-primary btn-large" onClick={start} disabled={busy}>{busy ? "Getting your questions ready…" : open ? "Continue the check" : "Start the check"}</button>
        <Link className="btn btn-quiet" to="/learn">Not now</Link>
      </div>
      {data && <p className="fine-print">{data.disclaimer}</p>}
    </div>
  );
}

/** Every finished attempt, the estimate for each grade, and how each outcome is changing. */
export function ResultsPage() {
  const { me } = useApp();
  const [data, setData] = useState<PrepResults | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.prepResults().then(setData, (e: unknown) => setError(asFailure(e, "Could not load your results.")));
  }, []);
  useEffect(load, [load, me?.user.id]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading label="Loading your results…" />;
  const none = data.results.length === 0;
  return (
    <div className="page results-page">
      <header className="page-head">
        <p className="eyebrow">Practice results</p>
        <h1>Your practice results</h1>
        <p className="lede-small">Everything from practice examinations and placement checks. These are our own practice assessments, not ABRSM results.</p>
      </header>
      {none && (
        <section className="card" aria-labelledby="none-h"><h2 id="none-h" className="h3">Nothing here yet</h2><p>Take a practice examination and your results, strengths and next steps will appear here.</p><Link className="btn btn-primary" to="/practice">Practice examinations</Link></section>
      )}
      {data.grades.filter((g) => g.progress.attempts.length || g.readiness.ignored.length).map((g) => (
        <section key={g.grade} className="card" aria-labelledby={`g${g.grade}-h`} data-grade={g.grade} data-testid={`results-grade-${g.grade}`}>
          <h2 id={`g${g.grade}-h`} className="h3">Grade {g.grade}</h2>
          {g.readiness.visible ? (
            <>
              <p><span className={`pill readiness readiness-${g.readiness.label}`}>{READINESS_WORDS[g.readiness.label]}</span> <span className="muted small">Estimated readiness</span></p>
              <p>{g.readiness.detail}</p>
              <p className="muted small">{g.readiness.note}</p>
            </>
          ) : (
            <p className="muted small" data-testid="readiness-gated">{g.readiness.note}</p>
          )}
          {g.progress.attempts.length > 0 && (
            <>
              <h3 className="h4">Mock examinations</h3>
              <ol className="plain attempt-trend">{g.progress.attempts.map((a) => <li key={a.id}><Link to={`/results/${a.id}`}>{new Date(a.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Link>: {a.independentPercent ?? "-"}% on your own</li>)}</ol>
              <details>
                <summary>Outcome by outcome</summary>
                <ul className="plain concept-list">
                  {g.progress.outcomes.map((o) => (
                    <li key={o.outcomeId} className="concept-row"><div className="concept-head"><span>{o.statement}</span><span className={`pill level ${levelClass(o.level)}`}>{LEVEL_WORDS[o.level]}</span></div>{o.trend !== "new" && <p className="muted small">{o.trend === "improving" ? "Improving since last time" : o.trend === "slipping" ? "Slipped since last time" : "Steady"}</p>}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </section>
      ))}
      {!none && (
        <section aria-labelledby="hist-h">
          <h2 id="hist-h">All attempts</h2>
          <ul className="plain concept-list" data-testid="history">
            {data.results.map((r) => (
              <li key={r.id} className="concept-row">
                <div className="concept-head">
                  <Link to={`/results/${r.id}`}>{r.kind === "placement" ? "Placement check" : `Grade ${r.grade} ${MODE_WORDS[r.mode].toLowerCase()}`} · {new Date(r.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Link>
                  <span className="pill">{"percent" in r ? `${r.percent}%` : `Suggested Grade ${r.recommendedGrade}`}</span>
                </div>
                {r.supersededNote && <p className="muted small">{r.supersededNote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
