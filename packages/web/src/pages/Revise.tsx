import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api, ApiFailure, type RevisionExplore, type RevisionInsight, type RevisionOverview, type RevisionSession, type RevisionSummary } from "../api/client";
import { XpAward } from "../components/Engagement";
import { Icon } from "../components/Icon";
import { ErrorState, Loading, NotFoundView } from "../components/Shell";
import { stopAll } from "../lib/audio";
import { useApp } from "../state/app";
import { ActionBar, Question, Step } from "./LessonSteps";

const asFailure = (e: unknown, msg: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", msg));
const REASONS: Record<string, string> = {
  nothing_taught: "Finish a lesson first: revision is about what you have been taught.",
  no_weak_topics: "No topic is weak right now. That is good news.",
  not_weak: "That topic is not weak at the moment.",
  nothing_available: "Nothing you have been taught matches that choice yet.",
  no_questions_yet: "We could not make questions for that just now. Please try again.",
};

/** Starts a revision session and goes to it; shows why when there is nothing to offer. */
function useStarter() {
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const start = async (key: string, body: Parameters<typeof api.startRevision>[0]) => {
    if (busy) return;
    setBusy(key);
    setNote(null);
    try {
      const r = await api.startRevision(body);
      if (r.session) nav(`/revision/session/${r.session.id}`);
      else setNote(REASONS[r.reason ?? ""] ?? "Nothing to practise right now.");
    } catch (e) {
      setNote(asFailure(e, "Could not start.").message);
    } finally {
      setBusy(null);
    }
  };
  return { busy, note, start };
}

const Topic = ({ c }: { c: RevisionInsight }) => (
  <li className="concept-row" data-concept={c.conceptId}>
    <div className="concept-head"><strong>{c.title}</strong><span className="pill">Grade {c.grade}</span></div>
    {c.reasons.slice(0, 2).map((r) => <p key={r} className="muted small">{r}</p>)}
    {c.trend === "improving" && <p className="small"><span className="pill level-mastered">Improving</span></p>}
  </li>
);

/** On the home screen: a five-minute review in one tap, for anyone who has finished at least one lesson. */
export function QuickReviewCard() {
  const { busy, note, start } = useStarter();
  return (
    <section className="card quick-card" aria-labelledby="qr-h" data-testid="home-quick-review">
      <div>
        <h2 id="qr-h" className="h3">5-minute review</h2>
        <p className="muted small">Weak and due topics first, then anything you haven't tested yet. Stop whenever you like.</p>
      </div>
      <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void start("quick", { mode: "quick", minutes: 5 })}>{busy ? "Getting questions…" : "Start"}</button>
      {note && <p role="status" className="muted small">{note}</p>}
    </section>
  );
}

/** The top of the Review tab: quick review, weak topics, topics not yet tested, and explore / mixed practice. */
export function RevisePanel() {
  const { me } = useApp();
  const [data, setData] = useState<RevisionOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const { busy, note, start } = useStarter();
  useEffect(() => {
    api.revision().then((d) => { setData(d); setMinutes(d.quick.defaultMinutes); }, () => setFailed(true));
  }, [me?.user.id]);
  if (failed) return null; // the existing Review below still works on its own
  if (!data) return null;
  if (data.taughtConcepts === 0) return null;
  return (
    <section className="revise-panel" aria-labelledby="revise-h">
      <h2 id="revise-h">Revise your way</h2>
      {data.open && (
        <p className="card callout" role="status">You have a {data.open.mode === "quick" ? "quick review" : data.open.mode === "weak" ? "weak-topic practice" : "practice"} session in progress. <Link to={`/revision/session/${data.open.id}`}>Pick up where you left off</Link></p>
      )}
      <div className="card" data-testid="quick-review">
        <h3 className="h3">Quick review</h3>
        <p className="muted small">Starts with what is weak or due, then topics you have not tested. Stop whenever you like: nothing is lost.</p>
        <fieldset className="segmented">
          <legend>How long have you got?</legend>
          <div>
            {data.quick.minutes.map((m) => (
              <label key={m} className={minutes === m ? "is-selected" : ""}><input type="radio" name="minutes" checked={minutes === m} onChange={() => setMinutes(m)} /><span>{m} min<small className="muted">about {data.quick.questionsFor[m]} questions</small></span></label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary btn-large" disabled={busy !== null} onClick={() => void start("quick", { mode: "quick", minutes })}>{busy === "quick" ? "Getting questions…" : `Start ${minutes}-minute review`}</button>
      </div>

      <div className="card" data-testid="weak-topics">
        <h3 className="h3">Weak topics</h3>
        {data.weak.length === 0 ? <p className="muted small">No topic is weak right now. Weak means answers you gave on your own were repeatedly wrong, so being new to a topic is not weak.</p> : (
          <>
            <p className="muted small">Repeated wrong answers on your own. We explain each one first, then practise it.</p>
            <ul className="plain concept-list">{data.weak.map((c) => <Topic key={c.conceptId} c={c} />)}</ul>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => void start("weak", { mode: "weak" })}>{busy === "weak" ? "Getting questions…" : "Practise my weak topics"}</button>
          </>
        )}
        {data.improving.length > 0 && <p className="small"><Icon name="check" size={16} strokeWidth={3} /> Improving: {data.improving.map((c) => c.title).join(", ")}</p>}
      </div>

      {data.untested.length > 0 && (
        <details className="card" data-testid="untested-topics">
          <summary>Not yet tested ({data.untested.length})</summary>
          <p className="muted small">You have been taught these but have not answered questions on them on your own, so we do not know yet how secure they are. That is different from weak.</p>
          <ul className="plain">{data.untested.slice(0, 12).map((c) => <li key={c.conceptId}>{c.title} <span className="muted small">· Grade {c.grade}</span></li>)}</ul>
        </details>
      )}

      <div className="card">
        <h3 className="h3">Explore and mixed practice</h3>
        <p className="muted small">Choose a grade, unit, topic or kind of question, or mix everything you have learned so it sticks.</p>
        <div className="row">
          <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void start("mixed", { mode: "mixed", minutes: 5 })}>{busy === "mixed" ? "Getting questions…" : "Mixed practice"}</button>
          <Link className="btn btn-ghost" to="/review/explore">Choose a topic…</Link>
        </div>
      </div>
      {note && <p role="status" className="muted">{note}</p>}
    </section>
  );
}

/** Choose a grade, unit, topic or exercise type. Only what the learner may use is listed. */
export function ExplorePage() {
  const { me } = useApp();
  const [data, setData] = useState<RevisionExplore | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [minutes, setMinutes] = useState(5);
  const { busy, note, start } = useStarter();
  const load = useCallback(() => {
    setError(null);
    api.revisionExplore().then(setData, (e: unknown) => setError(asFailure(e, "Could not load topics.")));
  }, []);
  useEffect(load, [load, me?.user.id]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const none = data.grades.every((g) => !g.available);
  return (
    <div className="page explore-page">
      <header className="page-head">
        <Link to="/review" className="small">← Review</Link>
        <h1>Explore and mix</h1>
        <p className="lede-small">Pick what to practise. Questions use only what you have been taught{data.placedGrade ? `, plus everything below Grade ${data.placedGrade}, which is always open to you` : ""}.</p>
      </header>
      <fieldset className="segmented">
        <legend>Length</legend>
        <div>{[3, 5, 10].map((m) => <label key={m} className={minutes === m ? "is-selected" : ""}><input type="radio" name="len" checked={minutes === m} onChange={() => setMinutes(m)} /><span>{m} min</span></label>)}</div>
      </fieldset>
      {none && <p className="card">Nothing to explore yet: finish a lesson and its topics appear here.</p>}
      {data.grades.filter((g) => g.available).map((g) => (
        <section key={g.grade} className="card" aria-labelledby={`eg${g.grade}`} data-grade={g.grade}>
          <h2 id={`eg${g.grade}`} className="h3">Grade {g.grade}: {g.title}</h2>
          <div className="row"><button className="btn btn-ghost btn-small" disabled={busy !== null} onClick={() => void start(`g${g.grade}`, { mode: "mixed", grade: g.grade, minutes })}>Mix all of Grade {g.grade}</button></div>
          {g.units.map((u) => (
            <details key={u.unitId}>
              <summary>{u.title}</summary>
              <div className="row"><button className="btn btn-ghost btn-small" disabled={busy !== null} onClick={() => void start(u.unitId, { mode: "explore", unitId: u.unitId, minutes })}>Practise this whole unit</button></div>
              <ul className="plain">
                {u.concepts.map((c) => (
                  <li key={c.conceptId} className="topic-line"><span>{c.title} <span className="muted small">· {c.status === "untested" ? "not yet tested" : c.status}</span></span> <button className="btn btn-quiet btn-small" disabled={busy !== null} onClick={() => void start(c.conceptId, { mode: "explore", conceptId: c.conceptId, minutes })} aria-label={`Practise ${c.title}`}>Practise</button></li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      ))}
      {data.families.length > 0 && (
        <section className="card" aria-labelledby="fam-h">
          <h2 id="fam-h" className="h3">By kind of question</h2>
          <ul className="plain chip-list">{data.families.map((f) => <li key={f.familyId}><button className="btn btn-ghost btn-small" disabled={busy !== null} onClick={() => void start(f.familyId, { mode: "explore", familyId: f.familyId, minutes })}>{f.title} <span className="muted">({f.topics})</span></button></li>)}</ul>
        </section>
      )}
      {note && <p role="status" className="muted">{note}</p>}
    </div>
  );
}

type Load = { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; session: RevisionSession };

/** Plays a revision session. Finishing early is always one tap away and always free. */
export function RevisionPlayer() {
  const { sessionId = "" } = useParams();
  const nav = useNavigate();
  const { me } = useApp();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    api.revisionSession(sessionId).then(
      (s) => {
        if (!live) return;
        if (s.status !== "open") setSummary(s.summary as RevisionSummary | null);
        const at = s.items.findIndex((i) => !i.answered);
        setIdx(at === -1 ? s.items.length : at);
        setStarted(s.mode !== "weak" || s.items.some((i) => i.answered));
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
      setSummary(await api.completeRevision(sessionId));
    } catch (e) {
      setError(asFailure(e, "Could not save."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }, [sessionId]);
  const total = load.status === "ready" ? load.session.items.length : 0;
  useEffect(() => {
    if (load.status === "ready" && started && idx >= total && total > 0 && !summary) void finish();
  }, [idx, total, started, load.status, summary, finish]);

  if (load.status === "loading") return <Loading label="Getting your questions ready…" />;
  if (load.status === "error") return load.error.status === 401 ? <Navigate to="/welcome" replace /> : load.error.status === 404 ? <NotFoundView what="session" /> : <ErrorState error={load.error} onRetry={() => window.location.reload()} />;
  const s = load.session;
  const item = started && idx < total && !summary ? s.items[idx] : undefined;
  const eyebrow = s.mode === "quick" ? "Quick review" : s.mode === "weak" ? "Weak-topic practice" : s.mode === "mixed" ? "Mixed practice" : "Explore";
  return (
    <div className="player node-player revision-player" data-mode={s.mode}>
      <header className="player-bar">
        <button type="button" className="icon-btn" aria-label="Close. Your answers are saved and you can carry on later." onClick={() => nav("/review")}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(idx, Math.max(1, total))}><span style={{ width: `${(Math.min(idx, total) / Math.max(1, total)) * 100}%` }} /></div>
      </header>
      <div className="player-body" key={summary ? "done" : started ? idx : "intro"}>
        {!started && !summary && (
          <>
            <Step title="Let's look at these first" eyebrow={eyebrow}>
              <p className="lede-small">Here is a quick reminder of each topic and the usual slip. Then you will practise them.</p>
              <ul className="plain concept-list">
                {s.preface.map((p) => (
                  <li key={p.conceptId} className="concept-row" data-concept={p.conceptId}>
                    <strong>{p.title}</strong>
                    <p>{p.summary}</p>
                    {p.topMistake && <p className="small"><strong>Usual slip: </strong>{p.topMistake.label}. {p.topMistake.tip}</p>}
                    {p.lessons.map((l) => <p key={l.nodeId} className="small"><Link to={`/lesson/${l.nodeId}`}>Revisit the lesson: {l.title}</Link></p>)}
                  </li>
                ))}
              </ul>
              <p className="muted small">Your answers here are practice after an explanation, so they help you learn but do not count as mastery evidence.</p>
            </Step>
            <ActionBar><button className="btn btn-primary btn-large" autoFocus onClick={() => setStarted(true)}>Practise now</button></ActionBar>
          </>
        )}
        {item && (
          <>
            <Question
              key={item.item.id}
              nodeId=""
              item={item.item}
              index={idx + 1}
              total={total}
              eyebrow={`${eyebrow} · ${item.conceptTitle}`}
              source={{ attempt: (id, itemId, r) => api.revisionAttempt(sessionId, id, itemId, r), hint: () => Promise.reject(new Error("No hints in revision.")) }}
              continueLabel={idx + 1 >= total ? "Finish" : "Continue"}
              onCorrect={() => { setIdx(idx + 1); window.scrollTo?.(0, 0); }}
              wrongAction={() => ({ label: "Move on", onClick: () => { setIdx(idx + 1); window.scrollTo?.(0, 0); } })}
            />
            <div className="finish-early"><button type="button" className="btn btn-quiet btn-small" onClick={() => void finish()} disabled={saving}>Finish early: no penalty</button></div>
          </>
        )}
        {error && !summary && <><Step title="We couldn't save that"><p>{error.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error.message}</p></Step><ActionBar><button className="btn btn-primary btn-large" onClick={() => void finish()}>Try again</button></ActionBar></>}
        {summary && <RevisionDone summary={summary} />}
        {!summary && !item && started && !error && <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving…</p></div>}
      </div>
    </div>
  );
}

function RevisionDone({ summary: s }: { summary: RevisionSummary }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  return (
    <>
      <section className="lesson-step" aria-labelledby="rd-h">
        <p className="eyebrow">{s.mode === "quick" ? "Quick review" : s.mode === "weak" ? "Weak-topic practice" : s.mode === "mixed" ? "Mixed practice" : "Explore"}</p>
        <h1 id="rd-h" tabIndex={-1} ref={h}>{s.finishedEarly ? "Stopped early, and that's fine" : "Session complete"}</h1>
        <p className="lede-small" data-testid="rev-score">{s.answered === 0 ? "You didn't answer any questions this time." : `${s.firstTryCorrect} of ${s.answered} right first time.`}{s.finishedEarly && s.answered > 0 ? " Everything you answered is saved. Nothing is marked wrong for what you didn't reach." : ""}</p>
        {s.concepts.length > 0 && (
          <ul className="plain concept-list">
            {s.concepts.map((c) => (
              <li key={c.conceptId} className="concept-row">
                <div className="concept-head"><strong>{c.title}</strong><span className={`pill ${c.verdict === "solid" ? "level-mastered" : "level-developing"}`}>{c.verdict === "solid" ? "Solid" : "Keep practising"}</span></div>
                <p className="muted small">{c.firstTryCorrect} of {c.answered} right first time{c.before === "improving" ? " · you have been improving" : c.before === "declining" ? " · worth a little more time" : ""}</p>
                {c.lessons.map((l) => <p key={l.nodeId} className="small"><Link to={`/lesson/${l.nodeId}`}>Revisit: {l.title}</Link></p>)}
              </li>
            ))}
          </ul>
        )}
        {s.xp && s.xp.awarded > 0 && <XpAward awarded={s.xp.awarded} reason={s.xp.reason} />}
        {!s.credited && s.answered > 0 && <p className="muted small">A short session doesn't count towards your daily goal, but nothing is lost.</p>}
      </section>
      <ActionBar><Link className="btn btn-primary btn-large" to="/review" autoFocus>Back to Review</Link><Link className="btn btn-ghost" to="/learn">My path</Link></ActionBar>
    </>
  );
}
