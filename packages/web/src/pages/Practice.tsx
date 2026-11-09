import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, ApiFailure, type GeneratedItem, type PracticeCatalogue, type PracticeSet } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { stopAll } from "../lib/audio";
import { Question, type QuestionApi } from "./LessonSteps";

const practiceApi: QuestionApi = { attempt: api.practiceAttempt, hint: api.practiceHint };

/** The practice lab: every exercise type, working, with "more like this" variations. Practice never changes lesson progress. */
export function Practice() {
  const [data, setData] = useState<PracticeCatalogue | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.practice().then(setData, (e: unknown) => setError(e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not load practice.")));
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading label="Loading practice…" />;
  return (
    <div className="page practice-page">
      <header className="page-head">
        <p className="eyebrow">Practice lab</p>
        <h1>Try every kind of question</h1>
        <p className="lede-small">Short sets that use the real music tools: the stave, the keyboard, rhythms, scales, intervals and chords. Practice here does not change your path.</p>
      </header>
      <ul className="practice-grid">
        {data.sets.map((s) => (
          <li key={s.id} className="practice-card" data-grade={s.grade}>
            <h2 className="h3">{s.title}</h2>
            <p className="muted">{s.summary}</p>
            <p className="small muted">{s.questions} questions · from Grade {s.grade}</p>
            <div className="row">
              <Link className="btn btn-primary btn-small" to={`/practice/${encodeURIComponent(s.id)}`} aria-label={`Start ${s.title}`}>Start</Link>
              {s.practice[0] && <Link className="btn btn-ghost btn-small" to={`/practice/more/${encodeURIComponent(s.practice[0].templateId)}`} aria-label={`${s.practice[0].label}: new questions`}>{s.practice[0].label}</Link>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerFrame({ title, index, total, children }: { title: string; index: number; total: number; children: React.ReactNode }) {
  const nav = useNavigate();
  useEffect(() => () => stopAll(), []);
  return (
    <div className="player practice-player">
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label={`Close ${title}`} onClick={() => nav("/practice")}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
          <span style={{ width: `${(index / Math.max(1, total)) * 100}%` }} />
        </div>
      </header>
      <div className="player-body" key={index}>{children}</div>
    </div>
  );
}

export function PracticeSetPlayer() {
  const { setId = "" } = useParams();
  const [params] = useSearchParams();
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  // ?q=N opens the set at question N (links from elsewhere, and resuming).
  const [idx, setIdx] = useState(() => Math.max(0, (Number(params.get("q")) || 1) - 1));
  const [firstTry, setFirstTry] = useState(0);
  useEffect(() => {
    api.practiceSet(setId).then(setSet, (e: unknown) => setError(e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not load the set.")));
  }, [setId]);
  if (error?.status === 404) return <NotFoundView what="practice set" />;
  if (error) return <ErrorState error={error} />;
  if (!set) return <Loading label="Opening practice…" />;
  const item = set.items[idx];
  return (
    <PlayerFrame title={set.title} index={idx} total={set.items.length}>
      {item ? (
        <Question
          key={item.id}
          nodeId=""
          item={item}
          index={idx + 1}
          total={set.items.length}
          eyebrow={set.title}
          source={{ ...practiceApi, attempt: async (a, i, r) => { const res = await practiceApi.attempt(a, i, r); if (res.correct && res.attemptNumber === 1) setFirstTry((n) => n + 1); return res; } }}
          onCorrect={() => setIdx((i) => i + 1)}
        />
      ) : (
        <section className="lesson-step" aria-labelledby="done-title">
          <p className="eyebrow">Set complete</p>
          <h1 id="done-title" tabIndex={-1}>Nice work!</h1>
          <p className="lede-small">{firstTry} of {set.items.length} right first time.</p>
          <div className="row">
            <Link className="btn btn-primary" to="/practice" autoFocus>More practice sets</Link>
            {set.practice.map((p) => <Link key={p.templateId} className="btn btn-ghost" to={`/practice/more/${encodeURIComponent(p.templateId)}`}>{p.label}</Link>)}
          </div>
        </section>
      )}
    </PlayerFrame>
  );
}

/** Endless seeded variations of one exercise template. */
export function PracticeMore() {
  const { templateId = "" } = useParams();
  const [item, setItem] = useState<GeneratedItem | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [count, setCount] = useState(0);
  const next = useCallback(() => {
    setItem(null);
    api.generate(templateId).then(setItem, (e: unknown) => setError(e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not create a question.")));
  }, [templateId]);
  useEffect(next, [next]);
  if (error?.status === 404) return <NotFoundView what="exercise" />;
  if (error) return <ErrorState error={error} onRetry={next} />;
  if (!item) return <Loading label="Making a new question…" />;
  return (
    <PlayerFrame title="Practice" index={count % 10} total={10}>
      <Question key={item.id} nodeId="" item={item} index={count + 1} total={count + 1} eyebrow="More practice" source={practiceApi} continueLabel="Next question" onCorrect={() => { setCount((n) => n + 1); next(); }} />
    </PlayerFrame>
  );
}
