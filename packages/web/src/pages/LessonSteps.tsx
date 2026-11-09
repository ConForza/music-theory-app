import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, ApiFailure, type AnswerResponse, type AttemptResult, type CompletionSummary, type LearnerItem, type LearnerLesson } from "../api/client";
import { Icon } from "../components/Icon";
import { Keyboard } from "../components/Keyboard";
import { StaffPicker, StaffView, pitchesOf } from "../components/Staff";
import { cue, playPitch, playSequence } from "../lib/audio";
import { diatonic, parsePitch, pitchAt } from "../lib/music";

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
                <StaffView fragment={b.music} onPlay={(p) => playPitch(p)} />
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

export function Demo({ lesson, onNext }: { lesson: LearnerLesson; onNext: () => void }) {
  const d = lesson.demonstration;
  const [lit, setLit] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const notes = pitchesOf(d.music);
  const ds = notes.map((p) => diatonic(parsePitch(p)));
  const showKeys = d.widget === "keyboard" || d.widget === "staff-and-keyboard";
  const from = pitchAt(Math.floor(Math.min(...ds) / 7) * 7);
  const to = pitchAt((Math.floor(Math.max(...ds) / 7) + 1) * 7);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = (p: string) => {
    playPitch(p);
    setLit([p]);
    timers.current.push(window.setTimeout(() => setLit([]), 700));
  };
  const playAll = () => {
    playSequence(notes);
    notes.forEach((p, i) => {
      timers.current.push(window.setTimeout(() => setLit([p]), i * 550));
    });
    timers.current.push(window.setTimeout(() => setLit([]), notes.length * 550 + 200));
  };

  return (
    <>
      <Step title="See it, hear it" eyebrow="Try it">
        <p className="lede-small">Tap the notes or the keys. Sound is optional: everything is described in words too.</p>
        {d.widget !== "keyboard" && <StaffView fragment={d.music} highlight={lit} onPlay={play} />}
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

export function Question({
  nodeId,
  item,
  index,
  total,
  onCorrect,
}: {
  nodeId: string;
  item: LearnerItem;
  index: number;
  total: number;
  onCorrect: () => void;
}) {
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
      const r = await api.attempt(nodeId, pending.current.id, item.id, response);
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
    pending.current = null;
    setResult(null);
    setResponse(null);
  }

  // One hint request at a time, stored by level, so a double tap can neither show a hint twice nor skip a level.
  const hintBusy = useRef(false);
  async function hint() {
    if (hintBusy.current || hints.length >= item.hintCount) return;
    hintBusy.current = true;
    try {
      const r = await api.hint(nodeId, item.id, hints.length + 1);
      setHints((h) => {
        const next = [...h];
        next[r.level - 1] = r.hint;
        return next;
      });
    } catch (e) {
      setError(e instanceof ApiFailure ? (e.isNetwork ? "That hint didn't load. Check your connection and try again." : e.message) : "No hint available.");
    } finally {
      hintBusy.current = false;
    }
  }

  const locked = busy || result !== null;
  return (
    <>
      <section className="lesson-step question" aria-labelledby="q-title">
        <p className="eyebrow">{item.section === "guided" ? "Guided practice" : "Your turn"} · Question {index} of {total}</p>
        <h1 id="q-title" className="q-prompt" tabIndex={-1}>{item.prompt}</h1>
        {item.music && item.input.kind !== "staff-position" && <StaffView fragment={item.music} />}
        <form onSubmit={(e) => { e.preventDefault(); void check(); }} id="answer-form">
          <Input item={item} response={response} onChange={setResponse} disabled={locked} />
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
              <p className="feedback-title"><Icon name={result.correct ? "check" : "info"} size={24} strokeWidth={3} /> {result.correct ? "Correct!" : "Not quite"}</p>
              <p>{result.message}</p>
            </>
          )}
        </div>
        {result ? (
          result.correct ? (
            <button key="continue" ref={feedbackBtn} className="btn btn-primary btn-large" onClick={onCorrect}>Continue</button>
          ) : (
            <button key="again" ref={feedbackBtn} className="btn btn-primary btn-large" onClick={again}>Try again</button>
          )
        ) : (
          <button key="check" type="submit" form="answer-form" className="btn btn-primary btn-large" disabled={!response || busy}>{busy ? "Checking…" : "Check"}</button>
        )}
      </ActionBar>
    </>
  );
}

function Input({ item, response, onChange, disabled }: { item: LearnerItem; response: AnswerResponse | null; onChange: (r: AnswerResponse) => void; disabled: boolean }) {
  const input = item.input;
  if (input.kind === "staff-position") {
    return (
      <StaffPicker
        clef={input.clef}
        maxLedgerLines={input.maxLedgerLines}
        disabled={disabled}
        value={response?.kind === "staff-position" ? response.pitch : null}
        onChange={(pitch) => onChange({ kind: "staff-position", pitch })}
      />
    );
  }
  const options =
    input.kind === "pitch-letter"
      ? ["A", "B", "C", "D", "E", "F", "G"].map((l) => ({ id: l, label: l }))
      : input.options;
  const value = response?.kind === "pitch-letter" ? response.letter : response?.kind === "choice" ? response.optionId : null;
  return (
    <fieldset className={`options${input.kind === "pitch-letter" ? " letters" : ""}`} disabled={disabled}>
      <legend className="visually-hidden">{input.kind === "pitch-letter" ? "Choose the note name" : "Choose an answer"}</legend>
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? "option is-selected" : "option"}>
          <input
            type="radio"
            name={`answer-${item.id}`}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(input.kind === "pitch-letter" ? { kind: "pitch-letter", letter: o.id } : { kind: "choice", optionId: o.id })}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
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
