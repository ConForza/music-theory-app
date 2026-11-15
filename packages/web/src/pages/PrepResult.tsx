import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type ExamSummary, type PlacementSummary, type PrepReadiness, type PrepResult as Result } from "../api/client";
import { Icon } from "../components/Icon";
import { ScoreView } from "../components/notation/Notation";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { LEVEL_WORDS, MODE_WORDS, READINESS_WORDS, levelClass, minutesText } from "../lib/prep";
import { useApp, useCourseData } from "../state/app";
import { MusicView } from "./LessonSteps";

const asFailure = (e: unknown) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not load this result."));

export function PrepResultPage() {
  const { attemptId = "" } = useParams();
  const { me } = useApp();
  const [result, setResult] = useState<Result | null>(null);
  const [readiness, setReadiness] = useState<PrepReadiness | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const load = () => {
    setError(null);
    api.prepResult(attemptId).then((r) => {
      setResult(r);
      if (r.kind === "exam") api.prepResults().then((x) => setReadiness(x.grades.find((g) => g.grade === r.grade)?.readiness ?? null), () => undefined);
    }, (e: unknown) => setError(asFailure(e)));
  };
  useEffect(load, [attemptId, me?.user.id]);
  if (error) return error.status === 404 ? <NotFoundView what="result" /> : <ErrorState error={error} onRetry={load} />;
  if (!result) return <Loading label="Loading your result…" />;
  return result.summary.kind === "placement" ? <PlacementResult id={attemptId} result={result} summary={result.summary} /> : <ExamResult result={result} summary={result.summary} readiness={readiness} />;
}

function Level({ level, label }: { level: string; label?: string }) {
  return <span className={`pill level ${levelClass(level)}`}>{label ?? LEVEL_WORDS[level]}</span>;
}

function ExamResult({ result, summary: s, readiness }: { result: Result; summary: ExamSummary; readiness: PrepReadiness | null }) {
  const data = useCourseData();
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  const mock = s.mode === "mock";
  const title = (id: string) => (data.status === "ready" ? data.titleOf(id) : id);
  const strong = s.outcomes.filter((o) => (mock ? o.level : o.practiceLevel) === "mastered");
  const weak = s.outcomes.filter((o) => ["needs_review", "developing"].includes(mock ? o.level : o.practiceLevel));
  const untested = s.outcomes.filter((o) => (mock ? o.level : o.practiceLevel) === "not_assessed");
  const wrong = s.review.filter((r) => r.answered && !r.correct);
  const qOf = (id: string) => result.questions.find((q) => q.itemId === id)?.item ?? null;
  return (
    <div className="page prep-result" data-grade={s.grade}>
      <header className="page-head">
        <p className="eyebrow">Practice assessment · Grade {s.grade} · {MODE_WORDS[s.mode]}</p>
        <h1 tabIndex={-1} ref={h}>Your result</h1>
        <p className="muted small">{new Date(s.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </header>
      {result.superseded && <p className="notice" role="note">This was scored under earlier rules or an earlier version of the course. The result stands as it was and is not mixed into your current estimate.</p>}

      <section className="card" aria-labelledby="score-h">
        <h2 id="score-h" className="h3">Score</h2>
        <p className="big-number" data-testid="score"><strong>{s.score}</strong> of {s.questions} right first time <span className="muted">({s.percent}%)</span></p>
        {s.answered < s.questions && <p className="muted small">{s.questions - s.answered} {s.questions - s.answered === 1 ? "question was" : "questions were"} not answered and are reported as not yet assessed.</p>}
        {s.timed && <p className="small"><Icon name="clock" size={16} /> {s.timedOut ? "Time ran out, and your answers so far were saved." : `Finished in ${minutesText(s.timeTakenSeconds)} of ${minutesText(s.timeLimitSeconds ?? 0)}.`} Speed is not part of your score.</p>}
        {!mock && <p className="small"><strong>Practice mode.</strong> You had hints and feedback, so this is a good picture of your learning but is not counted as independent evidence{s.hintsUsed ? ` (${s.hintsUsed} ${s.hintsUsed === 1 ? "hint" : "hints"} used)` : ""}.</p>}
        {mock && s.coachedQuestions > 0 && <p className="small">{s.coachedQuestions} {s.coachedQuestions === 1 ? "question was one" : "questions were ones"} you had already seen with help. They are in your score but not in your independent evidence.</p>}
        <p className="muted small">{s.disclaimer}</p>
      </section>

      {mock && (
        <section className="card" aria-labelledby="ready-h">
          <h2 id="ready-h" className="h3">{readiness?.visible ? "Estimated readiness" : "On your own"}</h2>
          <p className="big-number" data-testid="independent">{s.independentPercent === null ? "No independent evidence" : <><strong>{s.independentPercent}%</strong> right on your own</>}</p>
          {readiness?.visible && (
            <>
              <p><span className={`pill readiness readiness-${readiness.label}`} data-testid="readiness">{READINESS_WORDS[readiness.label]}</span></p>
              <p>{readiness.detail}</p>
              <p className="muted small">{readiness.note}</p>
            </>
          )}
          {readiness && !readiness.visible && (
            <p className="muted small" data-testid="readiness-gated">{readiness.note}</p>
          )}
        </section>
      )}

      <section aria-labelledby="out-h">
        <h2 id="out-h">By syllabus outcome</h2>
        <p className="muted small">{mock ? "Each outcome had two questions. Right both times means both were right on your own. With only two questions an outcome can look better or worse than it is, so treat each as a pointer, not a verdict." : "Practice-mode levels: your first try, with any hints you used."}</p>
        <ul className="plain concept-list" data-testid="outcomes">
          {s.outcomes.map((o) => {
            const level = mock ? o.level : o.practiceLevel;
            return (
              <li key={o.outcomeId} className="concept-row" data-outcome={o.outcomeId} data-level={level}>
                <div className="concept-head"><strong>{o.statement}</strong><Level level={level} /></div>
                <p className="muted small">{mock ? `${o.independentCorrect} of ${o.independentAsked} right on your own` : `${o.correct} of ${o.asked} right first try`}</p>
                {["needs_review", "developing"].includes(level) && o.revisit[0] && <p className="small"><Link to={`/lesson/${o.revisit[0]}`}>Revisit: {title(o.revisit[0])}</Link></p>}
              </li>
            );
          })}
        </ul>
      </section>

      {s.scoreReading.questions > 0 && (
        <section className="card" aria-labelledby="read-h">
          <h2 id="read-h" className="h3">Reading music in context</h2>
          <p>{s.scoreReading.correct} of {s.scoreReading.questions} right. These questions combine several ideas in one piece of notation.</p>
          {s.scoreReading.skills && <p className="muted small" data-testid="score-reading-skills">{s.scoreReading.skills}</p>}
        </section>
      )}

      <section className="card" aria-labelledby="sw-h">
        <h2 id="sw-h" className="h3">Strengths, weaknesses and what is not yet assessed</h2>
        <h3 className="h4">Strengths</h3>
        {strong.length ? <ul className="plain">{strong.map((o) => <li key={o.outcomeId}>{o.statement}</li>)}</ul> : <p className="muted small">None yet: that is where practice comes in.</p>}
        <h3 className="h4">To work on</h3>
        {weak.length ? <ul className="plain">{weak.map((o) => <li key={o.outcomeId}>{o.statement}</li>)}</ul> : <p className="muted small">Nothing stood out.</p>}
        <h3 className="h4">Not yet assessed</h3>
        {untested.length ? <ul className="plain">{untested.map((o) => <li key={o.outcomeId}>{o.statement}</li>)}</ul> : <p className="muted small">Every outcome was assessed.</p>}
      </section>

      {s.mistakes.length > 0 && (
        <section className="card" aria-labelledby="mis-h">
          <h2 id="mis-h" className="h3">What went wrong, in plain words</h2>
          <ul className="plain">{s.mistakes.map((m) => <li key={m.category}><strong>{m.label}</strong> ({m.count}) <br />{m.tip}</li>)}</ul>
        </section>
      )}

      {s.recommendations.length > 0 && (
        <section className="card callout" aria-labelledby="rec-h">
          <h2 id="rec-h" className="h3">What to do next</h2>
          <ul className="plain">
            {s.recommendations.map((r, i) => (
              <li key={i}>
                {r.kind === "lesson" ? <Link to={`/lesson/${r.nodeId}`}>Lesson: {r.title}</Link> : <RevisionLink conceptId={r.conceptId!} title={r.title} />}
                <span className="muted small"> · {r.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="rev-h">
        <h2 id="rev-h">Your answers</h2>
        <p className="muted small">The right answer is shown here now that you have finished.</p>
        {wrong.length === 0 && <p>Every question you answered was right first time.</p>}
        <ul className="plain review-list">
          {wrong.map((r) => {
            const q = qOf(r.itemId);
            return (
              <li key={r.itemId} className="card" data-testid="review-wrong">
                <p className="eyebrow">Question {r.index}</p>
                <p><strong>{r.prompt}</strong></p>
                {q?.music && <MusicView fragment={q.music} size="compact" labels="neutral" />}
                {q?.score && <ScoreView score={q.score} size="compact" />}
                {r.explanation && <p><strong>{r.explanation.label}.</strong> {r.explanation.tip}</p>}
                {r.reason && <p className="muted">{r.reason}</p>}
                <p><strong>The answer: </strong>{r.solution}</p>
              </li>
            );
          })}
        </ul>
        <details className="card"><summary>The questions you got right</summary><ul className="plain">{s.review.filter((r) => r.correct).map((r) => <li key={r.itemId}>{r.index}. {r.prompt}</li>)}</ul></details>
      </section>

      <div className="row action-row">
        <Link className="btn btn-primary" to={`/practice/exam/${s.grade}`}>Take another</Link>
        <Link className="btn btn-ghost" to="/progress/results">All my results</Link>
        <Link className="btn btn-quiet" to="/practice">Practice exams</Link>
      </div>
    </div>
  );
}

function RevisionLink({ conceptId, title }: { conceptId: string; title: string }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.startRevision({ mode: "explore", conceptId, minutes: 3 });
      if (r.session) nav(`/revision/session/${r.session.id}`);
      else setNote("That topic needs its lesson first.");
    } catch (e) {
      setNote(asFailure(e).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="link-button" onClick={go} disabled={busy}>{title}</button>
      {note && <span role="status" className="muted small"> {note}</span>}
    </>
  );
}

function PlacementResult({ id, result, summary: s }: { id: string; result: Result; summary: PlacementSummary }) {
  const nav = useNavigate();
  const { reloadAll, refreshProgress } = useApp();
  const data = useCourseData();
  const [choice, setChoice] = useState(s.recommendedGrade);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  const grades = Array.from({ length: s.recommendedGrade }, (_, i) => i + 1);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api.prepAccept(id, choice);
      await refreshProgress();
      reloadAll();
      nav("/learn");
    } catch (e) {
      setError(asFailure(e).message);
    } finally {
      setBusy(false);
    }
  }
  const gradeTitle = (g: number) => (data.status === "ready" ? data.course.worlds[g - 1]?.learnerTitle : "");
  const title = (nodeId: string) => (data.status === "ready" ? data.titleOf(nodeId) : nodeId);
  void result;
  return (
    <div className="page prep-result" data-grade={s.recommendedGrade}>
      <header className="page-head">
        <p className="eyebrow">Placement check</p>
        <h1 tabIndex={-1} ref={h}>We suggest starting at Grade {s.recommendedGrade}</h1>
        <p className="lede-small">{s.explanation}</p>
      </header>

      <section className="card" aria-labelledby="pl-h">
        <h2 id="pl-h" className="h3">How each grade went</h2>
        <ul className="plain stage-list" data-testid="stages">
          {s.stages.map((st) => (
            <li key={st.grade} className="concept-head"><span>Grade {st.grade} ideas: {st.correct} of {st.asked} right</span><span className={`pill level-stage-${st.level}`}>{st.level === "secure" ? "Secure" : st.level === "partial" ? "Mostly there" : "Needs work"}</span></li>
          ))}
          {s.notAssessed.length > 0 && <li className="muted small">Not assessed: Grade {s.notAssessed.join(", ")}. We stopped as soon as we knew where to begin.</li>}
        </ul>
      </section>

      {s.gaps.length > 0 && (
        <section aria-labelledby="gap-h">
          <h2 id="gap-h">Topics to look at</h2>
          <ul className="plain concept-list" data-testid="gaps">
            {s.gaps.map((g) => (
              <li key={g.outcomeId} className="concept-row">
                <div className="concept-head"><strong>{g.statement}</strong><span className="pill">Grade {g.grade} · {g.kind === "catch-up" ? "catch-up" : "start here"}</span></div>
                {g.lessons.map((l) => <p key={l.nodeId} className="small"><Link to={`/lesson/${l.nodeId}`}>{title(l.nodeId) || l.title}</Link></p>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.notChecked.length > 0 && (
        <details className="card" data-testid="not-checked">
          <summary>Not checked: what this short check did not ask about</summary>
          <p className="muted small">The check asks a handful of questions a grade, so a "secure" grade means those questions went well, not that every topic was tested. These were not asked:</p>
          {s.notChecked.map((n) => (
            <div key={n.grade}>
              <h3 className="h4">Grade {n.grade}</h3>
              <ul className="plain">{n.statements.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </details>
      )}

      <section className="card callout" aria-labelledby="start-h">
        <h2 id="start-h" className="h3">Where would you like to start?</h2>
        <p className="muted small">Starting lower is always fine and costs nothing. Starting here does not complete any grade or give you a grade badge: you still earn those by passing each grade's own assessment.</p>
        <fieldset className="segmented">
          <legend>Starting grade</legend>
          <div>
            {grades.map((g) => (
              <label key={g} className={choice === g ? "is-selected" : ""}>
                <input type="radio" name="start" value={g} checked={choice === g} onChange={() => setChoice(g)} />
                <span>Grade {g}{g === s.recommendedGrade ? " (suggested)" : ""}<small className="muted">{gradeTitle(g)}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-large" onClick={accept} disabled={busy}>{busy ? "Saving…" : `Start at Grade ${choice}`}</button>
      </section>
      <p className="muted small">{s.disclaimer}</p>
      <div className="row action-row"><Link className="btn btn-ghost" to="/placement">Retake the check</Link><Link className="btn btn-quiet" to="/learn">Not now</Link></div>
    </div>
  );
}
