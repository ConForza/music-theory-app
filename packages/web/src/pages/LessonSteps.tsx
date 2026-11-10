import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, ApiFailure, type AnswerResponse, type AttemptResult, type CompletionSummary, type LearnerItem, type LearnerLesson } from "../api/client";
import { Icon } from "../components/Icon";
import { RewardPanel } from "../components/Engagement";
import { Keyboard } from "../components/Keyboard";
import { pitchesOf } from "../components/Staff";
import { Notation, ScoreView } from "../components/notation/Notation";
import { playbackEvents } from "../components/notation/layout";
import { AnswerInput, isComplete } from "../components/exercise/AnswerInput";
import { cue, playPitch, playTimed, stopAll } from "../lib/audio";
import { diatonic, parsePitch, pitchAt } from "../lib/music";
import type { NotationFragment } from "@mtp/curriculum";

export function Step({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => h.current?.focus(), []);
  return (
    <section className="lesson-step" aria-labelledby="step-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id="step-title" tabIndex={-1} ref={h}>{title}</h1>
      {children}
    </section>
  );
}

export function Intro({ lesson, title, minutes, onNext, resumed }: { lesson: LearnerLesson; title: string; minutes: number; onNext: () => void; resumed: boolean }) {
  return (
    <>
      <Step title={title} eyebrow={resumed ? "Welcome back" : "Today's goal"}>
        <p className="lede-small">{lesson.objective.statement}</p>
        <h2 className="h3">By the end you'll be able to:</h2>
        <ul className="checklist">
          {lesson.objective.successCriteria.map((c) => (
            <li key={c}><Icon name="check" size={20} strokeWidth={3} /><span>{c}</span></li>
          ))}
        </ul>
        <p className="muted small"><Icon name="clock" size={16} /> About {minutes} minutes · {lesson.items.length} questions · Your progress saves as you go</p>
      </Step>
      <ActionBar><button className="btn btn-primary btn-large" onClick={onNext} autoFocus>{resumed ? "Continue" : "Let's go"}</button></ActionBar>
    </>
  );
}

export function Teach({ lesson, onNext }: { lesson: LearnerLesson; onNext: () => void }) {
  return (
    <>
      <Step title="Here's the idea" eyebrow="Learn">
        <div className="teach">
          {lesson.explanation.map((b, i) =>
            b.kind === "notation" ? (
              <figure key={i} className="teach-notation">
                <MusicView fragment={b.music} />
                <figcaption>{b.caption}</figcaption>
              </figure>
            ) : (
              <p key={i} className={b.kind === "tip" ? "tip" : "teach-text"}>
                {b.kind === "tip" && <><Icon name="bulb" size={20} /> <strong>Tip. </strong></>}
                {b.text}
              </p>
            ),
          )}
        </div>
      </Step>
      <ActionBar><button className="btn btn-primary btn-large" onClick={onNext}>Next</button></ActionBar>
    </>
  );
}

/** Notation (or a keyboard picture) with optional sound: tap a note to hear it, or play the whole example in time. */
export function MusicView({ fragment, marks, size, labels = "names" }: { fragment: NotationFragment; marks?: Array<{ index: number; ok: boolean }>; size?: "normal" | "compact" | "large"; labels?: "names" | "positions" }) {
  const [lit, setLit] = useState<string[]>([]);
  useEffect(() => () => stopAll(), []);
  if (fragment.presentation === "keyboard") {
    const notes = pitchesOf(fragment);
    const ds = notes.map((p) => diatonic(parsePitch(p)));
    const from = pitchAt(Math.floor(Math.min(...ds) / 7) * 7);
    const to = pitchAt((Math.floor(Math.max(...ds) / 7) + 1) * 7);
    return (
      <figure className="notation">
        <Keyboard from={from} to={to} highlight={notes} anonymous={labels === "positions"} label="Keyboard picture: the highlighted keys are the ones in the question" />
        {labels !== "positions" && <figcaption className="visually-hidden">{fragment.textAlternative}</figcaption>}
      </figure>
    );
  }
  const play = () => playTimed(playbackEvents(fragment), (id) => setLit(id ? [id] : []));
  return (
    <div className="music-view">
      <Notation fragment={fragment} highlight={lit} marks={marks} size={size} labels={labels} onActivate={(ev) => { stopAll(); ev.pitches.forEach((p) => playPitch(p, 0.9)); setLit([ev.id]); window.setTimeout(() => setLit([]), 600); }} />
      <button type="button" className="btn btn-ghost btn-small listen" onClick={play}><Icon name="speaker" size={18} /> Listen</button>
    </div>
  );
}

export function Demo({ lesson, onNext }: { lesson: LearnerLesson; onNext: () => void }) {
  const d = lesson.demonstration;
  const [lit, setLit] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const notes = pitchesOf(d.music);
  const ds = notes.map((p) => diatonic(parsePitch(p)));
  const showKeys = d.widget === "keyboard" || d.widget === "staff-and-keyboard";
  const from = pitchAt(Math.floor(Math.min(...ds) / 7) * 7);
  const to = pitchAt((Math.floor(Math.max(...ds) / 7) + 1) * 7);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    stopAll();
  }, []);

  const play = (p: string) => {
    playPitch(p);
    setLit([p]);
    timers.current.push(window.setTimeout(() => setLit([]), 700));
  };
  const playAll = () => {
    const evs = playbackEvents(d.music);
    playTimed(evs, (id) => {
      const ev = evs.find((e) => e.id === id);
      setLit(ev ? ev.pitches : []);
    });
  };

  return (
    <>
      <Step title="See it, hear it" eyebrow="Try it">
        <p className="lede-small">Tap the notes or the keys. Sound is optional: everything is described in words too.</p>
        {d.widget !== "keyboard" && <Notation fragment={d.music} highlight={lit} onActivate={(ev) => ev.pitches.forEach(play)} />}
        {showKeys && <Keyboard from={from} to={to} highlight={lit.length ? lit : notes.slice(0, 1)} onPlay={play} />}
        <button type="button" className="btn btn-ghost" onClick={playAll}><Icon name="speaker" size={20} /> Play all the notes</button>
        <ol className="demo-steps">{d.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <details className="muted"><summary>Describe this in words</summary><p>{d.textAlternative}</p></details>
      </Step>
      <ActionBar><button className="btn btn-primary btn-large" onClick={onNext}>Try some questions</button></ActionBar>
    </>
  );
}

export function ActionBar({ children, tone }: { children: ReactNode; tone?: "good" | "try" }) {
  return <div className={`action-bar${tone ? ` tone-${tone}` : ""}`}>{children}</div>;
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

export interface QuestionApi {
  attempt: (attemptId: string, itemId: string, response: AnswerResponse) => Promise<AttemptResult>;
  hint: (itemId: string, level: number) => Promise<{ hint: string; level: number }>;
}

export function Question({
  nodeId,
  item,
  index,
  total,
  onCorrect,
  source,
  eyebrow,
  continueLabel = "Continue",
  wrongAction,
  final = false,
}: {
  nodeId: string;
  item: LearnerItem;
  index: number;
  total: number;
  onCorrect: () => void;
  /** Where answers go (defaults to the lesson attempts API). */
  source?: QuestionApi;
  eyebrow?: string;
  continueLabel?: string;
  /** An extra way forward after a wrong answer (review: go to the similar question). Retrying is always still offered. */
  wrongAction?: (result: AttemptResult & { remedialItemId?: string | null }) => { label: string; onClick: () => void } | null;
  /** Challenge and assessment: the first answer is final, so a wrong answer moves on (no retry, no hints). */
  final?: boolean;
}) {
  const send: QuestionApi = source ?? { attempt: (id, itemId, r) => api.attempt(nodeId, id, itemId, r), hint: (itemId, level) => api.hint(nodeId, itemId, level) };
  const [response, setResponse] = useState<AnswerResponse | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The submitted command (id + exact answer) is frozen until the server answers. A genuine retry resends the same
  // id and answer, so it can never double-count; a changed answer gets a fresh id, so it can never borrow an earlier result.
  const pending = useRef<{ id: string; answer: string } | null>(null);
  const feedbackBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (result) feedbackBtn.current?.focus();
  }, [result]);

  async function check() {
    if (!response || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = JSON.stringify(response);
      if (pending.current?.answer !== answer) pending.current = { id: newId(), answer };
      const r = await send.attempt(pending.current.id, item.id, response);
      pending.current = null;
      setResult(r);
      cue(r.correct ? "correct" : "wrong");
    } catch (e) {
      setError(e instanceof ApiFailure ? (e.isNetwork ? "Your answer didn't send. Check your connection and press Check again." : e.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function again() {
    // Keep the learner's work so they can fix it rather than start again.
    pending.current = null;
    setResult(null);
    if (item.input.kind === "choice" || item.input.kind === "pitch-letter") setResponse(null);
  }

  // One hint request at a time, stored by level, so a double tap can neither show a hint twice nor skip a level.
  const hintBusy = useRef(false);
  async function hint() {
    if (hintBusy.current || hints.length >= item.hintCount) return;
    hintBusy.current = true;
    setError(null); // a retry replaces the earlier "hint didn't load" message
    try {
      const r = await send.hint(item.id, hints.length + 1);
      setHints((h) => {
        const next = [...h];
        next[r.level - 1] = r.hint; // keyed by level, so a late or repeated response can never duplicate or reorder hints
        return next;
      });
    } catch (e) {
      setError(e instanceof ApiFailure ? (e.isNetwork ? "That hint didn't load. Check your connection and try again." : e.message) : "No hint available.");
    } finally {
      hintBusy.current = false;
    }
  }

  return (
    <>
      <section className="lesson-step question" aria-labelledby="q-title">
        <p className="eyebrow">{eyebrow ?? (item.section === "guided" ? "Guided practice" : "Your turn")} · Question {index} of {total}</p>
        <h1 id="q-title" className="q-prompt" tabIndex={-1}>{item.prompt}</h1>
        {/* In questions the playable notes are labelled by stave position, never by name (review R6). */}
        {item.music && !(item.input.kind === "staff-position" && !item.input.shown && item.music.measures.length === 0) && <MusicView fragment={item.music} labels="positions" />}
        {item.score && <ScoreView score={item.score} />}
        <form onSubmit={(e) => { e.preventDefault(); void check(); }} id="answer-form">
          <AnswerInput input={item.input} value={response} onChange={(r) => { setResponse(r); if (result && !result.correct && !final) { setResult(null); pending.current = null; } }} disabled={busy || Boolean(result?.correct) || (final && Boolean(result))} marks={result?.marks} parts={result?.parts} />
        </form>
        {item.hintCount > 0 && !result && (
          <div className="hints">
            {/* Always mounted so assistive technology is already watching it when a hint arrives; only the new paragraph is read out. */}
            <div className="hint-list" role="status" aria-live="polite" aria-atomic="false">
              {hints.map((h, i) => <p key={i} className="tip"><Icon name="bulb" size={20} /><span className="visually-hidden">Hint {i + 1}: </span> {h}</p>)}
            </div>
            {/* Stays in place (disabled, not removed) after the last hint so keyboard focus is not dropped. */}
            <button type="button" className="btn btn-ghost btn-small" onClick={hint} aria-disabled={hints.length >= item.hintCount || undefined}>
              {hints.length >= item.hintCount ? "No more hints" : hints.length ? "Another hint" : "Need a hint?"}
            </button>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <ActionBar tone={result ? (result.correct ? "good" : "try") : undefined}>
        {/* One live region that is always mounted, so the verdict is spoken when it fills in (focus also moves to the next button). */}
        <div className="feedback" role="status" aria-live="polite">
          {result && (
            <>
              <p className="feedback-title"><Icon name={result.correct ? "check" : "info"} size={24} strokeWidth={3} /> {result.correct ? "Correct!" : final ? "Not this time" : "Not quite"}</p>
              <p>{result.message}</p>
              {!result.correct && result.reason && result.reason !== result.message && <p className="feedback-reason">{result.reason}</p>}
              {!result.correct && result.solution && <p className="feedback-solution"><strong>The answer: </strong>{result.solution}</p>}
            </>
          )}
        </div>
        {result ? (
          result.correct || final ? (
            <button key="continue" ref={feedbackBtn} className="btn btn-primary btn-large" onClick={onCorrect}>{continueLabel}</button>
          ) : (
            <>
              <button key="again" ref={feedbackBtn} className="btn btn-primary btn-large" onClick={again}>Try again</button>
              {(() => {
                const extra = wrongAction?.(result);
                return extra ? <button key="extra" type="button" className="btn btn-ghost" onClick={extra.onClick}>{extra.label}</button> : null;
              })()}
            </>
          )
        ) : (
          <button key="check" type="submit" form="answer-form" className="btn btn-primary btn-large" disabled={!isComplete(item.input, response) || busy}>{busy ? "Checking…" : "Check"}</button>
        )}
      </ActionBar>
    </>
  );
}

export function Done({
  lesson,
  summary,
  nextTitle,
  nextId,
  error,
  onRetry,
}: {
  lesson: LearnerLesson;
  summary: (CompletionSummary & { alreadyComplete: boolean }) | null;
  nextTitle: string | null;
  nextId: string | null;
  error: ApiFailure | null;
  onRetry: () => void;
}) {
  useEffect(() => {
    if (summary) cue("done");
  }, [summary]);
  if (error) {
    return (
      <Step title="We couldn't save your result">
        <p>{error.isNetwork ? "You seem to be offline. Your answers are safe; reconnect and try again." : error.message}</p>
        <ActionBar><button className="btn btn-primary btn-large" onClick={onRetry}>Try again</button></ActionBar>
      </Step>
    );
  }
  if (!summary) {
    return (
      <div className="state" role="status"><span className="spinner" aria-hidden="true" /><p>Saving your progress…</p></div>
    );
  }
  return (
    <>
      <Step title="Lesson complete!" eyebrow="Well done">
        <div className="celebrate" aria-hidden="true"><span className="burst" /><span className="badge-big"><Icon name="check" size={56} strokeWidth={3.4} /></span></div>
        <p className="lede-small">
          {summary.firstTryCorrect === summary.questions ? "Every question right first time." : `${summary.firstTryCorrect} of ${summary.questions} questions right first time. Keep practising and the rest will follow.`}
        </p>
        {summary.rewards && <RewardPanel rewards={summary.rewards} />}
        <h2 className="h3">What to remember</h2>
        <ul className="checklist">{lesson.recap.map((r) => <li key={r}><Icon name="check" size={20} strokeWidth={3} /><span>{r}</span></li>)}</ul>
        <p className="muted small">Progress saved.</p>
      </Step>
      <ActionBar>
        <Link className="btn btn-primary btn-large" to="/learn" autoFocus>Back to the path</Link>
        {nextId && nextId !== lesson.nodeId && <Link className="btn btn-ghost" to={`/lesson/${nextId}`}>Next: {nextTitle}</Link>}
      </ActionBar>
    </>
  );
}
