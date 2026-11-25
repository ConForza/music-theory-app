/**
 * Flexible learning: Explore lessons (any written lesson, any grade, any order) and Practise a topic (any grade, area, unit or topic,
 * no lesson first). The server owns every rule: what a lesson completion unlocks, and that topic practice is formative only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { api, ApiFailure, type TopicOverview, type TopicScopeKind, type TopicSession, type TopicSummary } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { stopAll } from "../lib/audio";
import { describeNode } from "../lib/pathView";
import { useApp, useCourseData } from "../state/app";
import { ActionBar, Question, Step } from "./LessonSteps";

const asFailure = (e: unknown, msg: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", msg));
const GRADES = [1, 2, 3, 4, 5];

/** Per-device convenience only (never progress): the last grade and question count chosen. Storage can be unavailable. */
const remember = {
  get(): { grade?: number; count?: number } {
    try {
      return JSON.parse(localStorage.getItem("mtp.topicPractice") ?? "{}") as { grade?: number; count?: number };
    } catch {
      return {};
    }
  },
  set(v: { grade: number; count: number }) {
    try {
      localStorage.setItem("mtp.topicPractice", JSON.stringify(v));
    } catch {
      /* private mode: nothing to remember */
    }
  },
};

function GradePicker({ value, onChange, legend = "Grade" }: { value: number; onChange: (g: number) => void; legend?: string }) {
  return (
    <fieldset className="segmented grade-picker">
      <legend>{legend}</legend>
      <div>
        {GRADES.map((g) => (
          <label key={g} className={value === g ? "is-selected" : ""}>
            <input type="radio" name={`grade-${legend}`} aria-label={`Grade ${g}`} checked={value === g} onChange={() => onChange(g)} />
            <span aria-hidden="true">{g}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- Explore lessons ---------------------------------------------------------------------------------------------------------

/** Grade → unit → lesson. Switching grade here never changes the learner's guided grade. */
export function ExploreLessons() {
  const { me, reloadAll } = useApp();
  const data = useCourseData();
  const [params, setParams] = useSearchParams();
  const guided = me!.profile.selectedGrade;
  const grade = Math.min(5, Math.max(1, Number(params.get("grade")) || guided));
  if (data.status === "loading") return <Loading label="Loading lessons…" />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;
  const world = data.course.worlds[grade - 1]!;
  return (
    <div className="page explore-lessons" data-grade={grade}>
      <Link to="/learn" className="back-link"><Icon name="back" size={18} /> My guided path (Grade {guided})</Link>
      <header className="page-head">
        <p className="eyebrow">Learn</p>
        <h1>Explore lessons</h1>
        <p className="lede-small">Open any lesson, in any grade, in any order. Your guided path stays exactly where it is. A lesson you finish here counts as done; lessons you skip are not marked complete.</p>
        <p className="muted small">Later grades build on earlier ones, so a lesson can use skills from earlier grades.</p>
      </header>
      <GradePicker value={grade} onChange={(g) => setParams({ grade: String(g) }, { replace: true })} legend="Choose a grade to explore" />
      <h2 className="h3">Grade {grade}: {world.learnerTitle}</h2>
      {world.units.map((u) => {
        const lessons = u.nodeIds.map((id) => data.nodes.get(id)!).filter((n) => n.type === "lesson" || n.type === "enrichment");
        return (
          <section key={u.id} className="card explore-unit" aria-labelledby={`xu-${u.id}`} data-unit={u.id}>
            <h3 id={`xu-${u.id}`} className="h3">Unit {u.sequence}: {u.learnerTitle}</h3>
            <p className="muted small">{u.summary}</p>
            <ol className="plain explore-list">
              {lessons.map((n) => {
                const p = data.progress.nodes[n.id];
                const v = describeNode(n, p);
                const ready = n.playKind === "lesson" && v.status !== "coming_soon";
                const label = v.status === "completed" || v.status === "review_available" ? "Practise again" : v.status === "in_progress" ? "Continue" : "Open";
                return (
                  <li key={n.id} className="explore-row" data-node={n.id} data-status={v.status}>
                    <span className="explore-title">
                      <strong>{n.title}</strong>
                      <span className="muted small">{n.optional ? "Extra · " : ""}about {n.estimatedMinutes} min{v.status === "completed" ? (v.explored ? " · done (explored)" : " · done") : v.status === "in_progress" ? " · in progress" : v.status === "locked" ? " · ahead of your path" : ""}</span>
                    </span>
                    {ready ? (
                      <Link className={v.status === "completed" ? "btn btn-ghost btn-small" : "btn btn-primary btn-small"} to={`/lesson/${n.id}?explore=1`} aria-label={`${label}: ${n.title}`}>{label}</Link>
                    ) : (
                      <span className="pill status-coming_soon">Coming soon</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <p className="muted small"><Icon name="info" size={16} /> Unit practice, unit checkpoints and the grade assessment stay on the guided path, so they always follow the lessons before them.</p>
    </div>
  );
}

// ---- Practise a topic: choosing -------------------------------------------------------------------------------------------------

interface Choice {
  kind: TopicScopeKind;
  id: string;
  label: string;
  /** Different questions this choice can supply, or null when it can fill the largest count. */
  available: number | null;
}

const REASON: Record<string, string> = { no_questions: "We couldn't make questions for that just now. Please try another topic or try again." };

/** Start a topic-practice session and go to it. Used by the picker and by "Practise again". */
export function useTopicStarter() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const start = async (b: { grade: number; kind: TopicScopeKind; id: string; count: number }, replace = false) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.startTopicPractice(b);
      if (r.session) nav(`/practice/topic/${r.session.id}`, { replace });
      else setNote(REASON[r.reason ?? ""] ?? "Nothing to practise right now.");
    } catch (e) {
      setNote(asFailure(e, "Could not start.").message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, start };
}

function ChoiceToggle({ c, className = "", chosen, onPick }: { c: Choice; className?: string; chosen: Choice | null; onPick: (c: Choice) => void }) {
  const on = chosen?.kind === c.kind && chosen.id === c.id;
  return (
    <button type="button" className={`topic-choice${on ? " is-selected" : ""} ${className}`} aria-pressed={on} onClick={() => onPick(c)}>
      {c.label}
      {c.available !== null && <span className="topic-small"> · only {c.available} different {c.available === 1 ? "question" : "questions"}</span>}
    </button>
  );
}

/** The top of the Practice tab: grade, then the whole grade, an area, a topic or a unit, then 5, 10 or 20 questions. */
export function TopicPicker() {
  const { me } = useApp();
  const saved = remember.get();
  const [data, setData] = useState<TopicOverview | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [grade, setGrade] = useState(() => saved.grade ?? me!.profile.selectedGrade);
  const [count, setCount] = useState(() => saved.count ?? 10);
  const [choice, setChoice] = useState<Choice | null>(null);
  const { busy, note, start } = useTopicStarter();
  const load = useCallback(() => {
    setError(null);
    api.topicPractice().then(setData, (e: unknown) => setError(asFailure(e, "Could not load topics.")));
  }, []);
  useEffect(load, [load, me?.user.id]);
  useEffect(() => setChoice(null), [grade]);
  if (error) return <ErrorState error={error} onRetry={load} title="We couldn't load topics" />;
  if (!data) return <Loading label="Loading topics…" />;
  const g = data.grades.find((x) => x.grade === grade) ?? data.grades[0]!;
  const pick = (c: Choice) => setChoice((cur) => (cur && cur.kind === c.kind && cur.id === c.id ? null : c));
  // A count the chosen topic cannot fill is not offered (the smallest always is). The saved preference is kept for the next topic.
  const avail = choice?.available ?? null;
  const allowed = (n: number) => avail === null || n <= avail || n === Math.min(...data.counts);
  const useCount = allowed(count) ? count : Math.max(...data.counts.filter(allowed));
  const go = () => {
    if (!choice) return;
    remember.set({ grade, count });
    void start({ grade, kind: choice.kind, id: choice.id, count: useCount });
  };
  return (
    <section className="topic-practice" aria-labelledby="tp-h" data-testid="topic-practice">
      <p className="eyebrow">Practise a topic</p>
      <h1 id="tp-h">Choose what you want to work on</h1>
      <p className="lede-small">Practice: choose what you want to work on. Any grade, any topic, and you don't need to have done the lessons first. Fresh questions every time, with hints. It doesn't change your path, earn XP or count towards mastery.</p>
      <p className="muted small">Later grades build on earlier ones, so questions can use skills from earlier grades.</p>
      {data.open && (
        <p className="card callout" role="status">You have a practice session open: {data.open.label} (Grade {data.open.grade}). <Link to={`/practice/topic/${data.open.id}`}>Carry on</Link></p>
      )}
      <GradePicker value={grade} onChange={setGrade} />
      <ul className="plain topic-choices" aria-label={`Grade ${grade} topics`}>
        <li><ChoiceToggle chosen={choice} onPick={pick} c={{ kind: "grade", id: String(grade), label: `Mixed: all of Grade ${grade}`, available: g.available }} className="is-mixed" /></li>
        {g.areas.map((a) => (
          <li key={a.areaId}>
            <details className="topic-area" data-area={a.areaId}>
              <summary><span>{a.title}</span> <span className="muted small">{a.topics.length} {a.topics.length === 1 ? "topic" : "topics"}</span></summary>
              <ul className="plain">
                {a.topics.length > 1 && <li><ChoiceToggle chosen={choice} onPick={pick} c={{ kind: "area", id: a.areaId, label: `All of ${a.title.toLowerCase()}`, available: a.available }} /></li>}
                {a.topics.map((t) => <li key={t.conceptId}><ChoiceToggle chosen={choice} onPick={pick} c={{ kind: "topic", id: t.conceptId, label: t.title, available: t.available }} /></li>)}
              </ul>
            </details>
          </li>
        ))}
        <li>
          <details className="topic-area" data-area="units">
            <summary><span>By unit</span> <span className="muted small">{g.units.length} units</span></summary>
            <ul className="plain">{g.units.map((u) => <li key={u.unitId}><ChoiceToggle chosen={choice} onPick={pick} c={{ kind: "unit", id: u.unitId, label: `Unit ${u.sequence}: ${u.title}`, available: u.available }} /></li>)}</ul>
          </details>
        </li>
      </ul>
      <fieldset className="segmented">
        <legend>How many questions?</legend>
        <div>
          {data.counts.map((n) => (
            <label key={n} className={`${useCount === n ? "is-selected" : ""}${allowed(n) ? "" : " is-disabled"}`}><input type="radio" name="topic-count" aria-label={`${n} questions`} checked={useCount === n} disabled={!allowed(n)} onChange={() => setCount(n)} /><span aria-hidden="true">{n}</span></label>
          ))}
        </div>
      </fieldset>
      <div className="topic-start">
        <button type="button" className="btn btn-primary btn-large" disabled={!choice || busy} onClick={go} data-testid="topic-start">
          {busy ? "Getting questions…" : choice ? `Start: ${choice.label}` : "Choose a topic above"}
        </button>
        {choice && (
          <p className="muted small" data-testid="topic-start-note">
            Grade {grade} · {avail !== null && avail < useCount ? `${avail} questions: this topic has only ${avail} different ones at the moment` : `${useCount} questions`}
          </p>
        )}
        {note && <p role="status" className="form-error">{note}</p>}
      </div>
    </section>
  );
}

// ---- Practise a topic: playing ---------------------------------------------------------------------------------------------------

type Load = { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; session: TopicSession };

export function TopicPlayer() {
  const { sessionId = "" } = useParams();
  return <TopicRun key={sessionId} sessionId={sessionId} />;
}

function TopicRun({ sessionId }: { sessionId: string }) {
  const nav = useNavigate();
  const { me } = useApp();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [idx, setIdx] = useState(0);
  const [summary, setSummary] = useState<TopicSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    api.topicSession(sessionId).then(
      (s) => {
        if (!live) return;
        if (s.status !== "open" && s.summary) setSummary({ ...s.summary, alreadyComplete: true });
        const at = s.items.findIndex((i) => !i.answered);
        setIdx(at === -1 ? s.items.length : at);
        setLoad({ status: "ready", session: s });
      },
      (e: unknown) => live && setLoad({ status: "error", error: asFailure(e, "Could not open this session.") }),
    );
    return () => {
      live = false;
      stopAll();
    };
  }, [sessionId, me?.user.id]);
  const finish = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    try {
      setSummary(await api.completeTopicPractice(sessionId));
    } catch (e) {
      setError(asFailure(e, "Could not save."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }, [sessionId]);
  const total = load.status === "ready" ? load.session.items.length : 0;
  useEffect(() => {
    if (load.status === "ready" && load.session.status === "open" && idx >= total && total > 0 && !summary) void finish();
  }, [idx, total, load, summary, finish]);

  if (load.status === "loading") return <Loading label="Getting your questions ready…" />;
  if (load.status === "error") return load.error.status === 401 ? <Navigate to="/welcome" replace /> : load.error.status === 404 ? <NotFoundView what="practice session" /> : <ErrorState error={load.error} onRetry={() => window.location.reload()} />;
  const s = load.session;
  if (s.status === "abandoned" && !summary) {
    return (
      <div className="state" role="alert"><Icon name="info" size={36} /><h1>This practice session was closed</h1><p>You started another one. Your answers are saved.</p><Link className="btn btn-primary" to="/practice">Choose a topic</Link></div>
    );
  }
  const item = !summary && idx < total ? s.items[idx] : undefined;
  const next = () => { setIdx(idx + 1); window.scrollTo?.(0, 0); };
  return (
    <div className="player node-player topic-player" data-scope={s.scope.kind}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close. Your answers are saved and you can carry on later." onClick={() => nav("/practice")}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(idx, Math.max(1, total))}><span style={{ width: `${(Math.min(idx, total) / Math.max(1, total)) * 100}%` }} /></div>
      </header>
      <div className="player-body" key={summary ? "done" : idx}>
        {item && (
          <>
            {idx === 0 && s.shortfall && (
              <p className="card callout" role="note" data-testid="topic-shortfall">“{s.scope.label}” has {s.shortfall.available} different {s.shortfall.available === 1 ? "question" : "questions"} at the moment, so this session has {s.shortfall.available}, not {s.shortfall.requested}. Nothing from other topics has been added.</p>
            )}
            <Question
              key={item.item.id}
              nodeId=""
              item={item.item}
              index={idx + 1}
              total={total}
              eyebrow={`Grade ${s.grade} · ${item.conceptTitle}`}
              source={{ attempt: (id, itemId, r) => api.topicAttempt(sessionId, id, itemId, r), hint: (itemId, level) => api.topicHint(sessionId, itemId, level) }}
              continueLabel={idx + 1 >= total ? "Finish" : "Next question"}
              onCorrect={next}
              wrongAction={() => ({ label: "Move on", onClick: next })}
            />
            <div className="finish-early">
              {item.lesson && <Link className="btn btn-quiet btn-small" to={`/lesson/${item.lesson.nodeId}?explore=1`}>Not sure? Learn it: {item.lesson.title}</Link>}
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void finish()} disabled={saving}>Finish now</button>
            </div>
          </>
        )}
        {error && !summary && <><Step title="We couldn't save that"><p>{error.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error.message}</p></Step><ActionBar><button className="btn btn-primary btn-large" onClick={() => void finish()}>Try again</button></ActionBar></>}
        {summary && <TopicDone summary={summary} />}
        {!summary && !item && !error && <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving…</p></div>}
      </div>
    </div>
  );
}

function TopicDone({ summary: s }: { summary: TopicSummary }) {
  const h = useRef<HTMLHeadingElement>(null);
  const { busy, note, start } = useTopicStarter();
  useEffect(() => h.current?.focus(), []);
  const again = () => void start({ grade: s.grade, kind: s.scope.kind, id: s.scope.id, count: s.requested }, true);
  return (
    <>
      <section className="lesson-step" aria-labelledby="td-h" data-testid="topic-summary">
        <p className="eyebrow">Grade {s.grade} · {s.scope.label}</p>
        <h1 id="td-h" tabIndex={-1} ref={h}>{s.finishedEarly ? "Stopped early, and that's fine" : "Practice complete"}</h1>
        <p className="lede-small" data-testid="topic-score">{s.answered === 0 ? "You didn't answer any questions this time." : `${s.firstTryCorrect} of ${s.answered} right first time${s.hintsUsed ? ` (${s.hintsUsed} ${s.hintsUsed === 1 ? "hint" : "hints"} used)` : ""}.`}</p>
        {s.concepts.length > 1 && (
          <ul className="plain concept-list">
            {s.concepts.map((c) => (
              <li key={c.conceptId} className="concept-row">
                <div className="concept-head"><strong>{c.title}</strong><span className={`pill ${c.firstTryCorrect === c.answered ? "level-mastered" : "level-developing"}`}>{c.firstTryCorrect} of {c.answered}</span></div>
              </li>
            ))}
          </ul>
        )}
        {s.mistakes.length > 0 && (
          <>
            <h2 className="h3">Worth another look</h2>
            <ul className="plain concept-list" data-testid="topic-mistakes">
              {s.mistakes.map((m) => (
                <li key={m.itemId} className="concept-row">
                  <p className="muted small">{m.conceptTitle}</p>
                  <p><strong>{m.prompt}</strong></p>
                  {m.slip && <p className="small">What went wrong: {m.slip}.</p>}
                  {m.solution && <p className="small"><strong>The answer: </strong>{m.solution}</p>}
                  {m.lesson && <p className="small"><Link to={`/lesson/${m.lesson.nodeId}?explore=1`}>Learn it: {m.lesson.title}</Link></p>}
                </li>
              ))}
            </ul>
          </>
        )}
        <h2 className="h3">Next steps</h2>
        <p className="small">{s.mistakes.length ? "Practise this again with fresh questions, or open the lesson that explains it." : s.answered ? "Nicely done. Try a harder topic, or mix the whole grade." : "Pick a topic whenever you're ready."} When you've done the lessons, <Link to="/review">Review</Link> is where topics become mastered.</p>
        <p className="muted small">This was practice: it doesn't change your path, earn XP or count towards mastery.</p>
        {note && <p role="status" className="form-error">{note}</p>}
      </section>
      <ActionBar>
        <button className="btn btn-primary btn-large" autoFocus onClick={again} disabled={busy} data-testid="topic-again">{busy ? "Getting questions…" : "Practise again"}</button>
        <Link className="btn btn-ghost" to="/practice">Choose another topic</Link>
      </ActionBar>
    </>
  );
}
