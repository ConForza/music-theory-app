/** Chooses the answer control for an item's input descriptor and turns what the learner did into a response. */
import { useId, useState } from "react";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { music, pretty } from "../../lib/music";
import { BarlineEditor, GroupingEditor, RhythmBuilder } from "./RhythmEditors";
import { resolveWritten, StaveEditor, type Written } from "./StaveEditor";
import {
  ChoiceInput,
  ChordNameInput,
  IntervalNameInput,
  KeyboardInput,
  KeyNameInput,
  LetterInput,
  MultiChoiceInput,
  NoteNameInput,
  OrnamentInput,
  ProgressionInput,
  Radios,
  TimeSignatureInput,
} from "./SimpleInputs";

type Simple = Exclude<ItemInput, { kind: "composite" }>;
type SimpleResponse = Exclude<LearnerResponse, { kind: "composite" }>;
export interface AnswerInputProps {
  input: ItemInput;
  value: LearnerResponse | null;
  onChange: (r: LearnerResponse | null) => void;
  disabled: boolean;
  marks?: Array<{ index: number; ok: boolean }>;
  parts?: Array<{ id: string; correct: boolean; reason: string | null }>;
}

/** True when the response is complete enough to check (e.g. a time signature needs both numbers). */
export function isComplete(input: ItemInput, r: LearnerResponse | null): boolean {
  if (!r) return false;
  if (input.kind === "composite") return r.kind === "composite" && input.parts.every((p) => isComplete(p.input, r.parts[p.id] ?? null));
  if (r.kind === "time-signature") return r.top > 0 && r.bottom > 0;
  if (r.kind === "progression" && input.kind === "progression") return input.labels.every((l) => r.chords[l]);
  if (r.kind === "pitch-sequence" && input.kind === "pitch-sequence") return r.pitches.length > 0 && (!input.keyOptions || Boolean(r.key));
  if (r.kind === "keyboard" && input.kind === "keyboard" && input.spelling) return Boolean(r.spelling);
  return true;
}

function StaveAnswer({ input, value, onChange, disabled, marks }: { input: Extract<Simple, { kind: "staff-position" | "pitch-sequence" | "chord-builder" | "key-signature-writer" }>; value: SimpleResponse | null; onChange: (r: SimpleResponse | null) => void; disabled: boolean; marks?: AnswerInputProps["marks"] }) {
  const uid = useId();
  const [written, setWritten] = useState<Written[]>([]);
  // The key signature drawn on the answer stave is the one unsigned notes are read in.
  const [key, setKey] = useState<string | undefined>(input.kind === "pitch-sequence" ? input.key : input.kind === "staff-position" && !input.shown ? input.key : undefined);
  void value;
  const clef = input.clef as music.Clef;
  const emit = (w: Written[], k = key) => {
    setWritten(w);
    if (!w.length) return onChange(null);
    if (input.kind === "key-signature-writer") return onChange({ kind: "key-signature", accidentals: w.map((x) => ({ pitch: music.formatPitch({ ...music.naturalAt(clef, x.pos), alter: x.sign === "b" ? -1 : 1 }) })) });
    const given = input.kind === "pitch-sequence" ? input.given : input.kind === "staff-position" ? (input.shown ?? []) : [];
    // The chord stave shows no key signature (the task says "using accidentals"), so notes are read without one:
    // what is drawn, typed, heard and submitted always agree (review R3).
    if (input.kind === "chord-builder") return onChange({ kind: "chord-notes", pitches: resolveWritten(clef, undefined, w, true).map(music.formatPitch) });
    const all = resolveWritten(clef, k, [...toWrittenGiven(clef, k, given), ...w]).map(music.formatPitch);
    if (input.kind === "staff-position") return onChange({ kind: "staff-position", pitch: all[all.length - 1]! });
    onChange({ kind: "pitch-sequence", pitches: all, ...(input.keyOptions && k ? { key: k } : {}) });
  };
  const common = { clef, value: written, onChange: emit, disabled, marks, maxLedgerLines: input.kind === "key-signature-writer" ? 1 : input.maxLedgerLines };
  if (input.kind === "key-signature-writer") return <StaveEditor {...common} mode="signature" accidentals doubleAccidentals={false} label={`Key signature on a ${input.clef} stave`} />;
  if (input.kind === "chord-builder") return <StaveEditor {...common} mode="chord" keyName={undefined} accidentals doubleAccidentals={false} maxNotes={input.maxNotes} label={`Chord on a ${input.clef} stave`} />;
  if (input.kind === "staff-position") {
    return (
      <StaveEditor
        {...common}
        mode="single"
        keyName={key}
        given={input.shown}
        accidentals={input.accidentals}
        doubleAccidentals={input.doubleAccidentals}
        label={input.shown ? `Write the upper note on a ${input.clef} stave` : `Note position on a ${input.clef} stave`}
        announceNames={Boolean(input.shown)}
      />
    );
  }
  return (
    <div className="sequence-answer">
      {input.keyOptions && (
        <Radios legend="Key signature for your answer" options={input.keyOptions.map((k) => ({ id: k, label: pretty(k) }))} value={key ?? null} onSelect={(k) => { setKey(k); emit(written, k); }} disabled={disabled} name={`${uid}-key`} columns="grid" />
      )}
      <p className="hint-line">{input.purpose === "scale" ? `Write ${input.length} notes in all, from the given first note.` : input.purpose === "chromatic" ? "Write 13 notes: every semitone, from the given note to its octave." : `Write ${input.length} notes${input.keyOptions ? " after choosing the key signature" : ""}.`}</p>
      <StaveEditor {...common} mode="sequence" keyName={key} given={input.given} maxNotes={input.length} accidentals={input.accidentals} doubleAccidentals={input.doubleAccidentals} label={`${input.purpose === "transposition" ? "Your transposed melody" : "Your scale"} on a ${input.clef} stave`} />
    </div>
  );
}
function toWrittenGiven(clef: music.Clef, key: string | undefined, given: string[]): Written[] {
  return given.map((p) => {
    const pp = music.parsePitch(p);
    const sig = key ? music.signatureAlter(music.parseKey(key), pp.step) : 0;
    const sign = pp.alter === sig ? "none" : ({ [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "x" } as Record<number, Written["sign"]>)[pp.alter]!;
    return { pos: music.staffPosition(clef, pp), sign };
  });
}

function SimpleAnswer({ input, value, onChange, disabled, marks, name }: { input: Simple; value: SimpleResponse | null; onChange: (r: SimpleResponse | null) => void; disabled: boolean; marks?: AnswerInputProps["marks"]; name: string }) {
  const p = { value: value as never, onChange: onChange as never, disabled, name };
  switch (input.kind) {
    case "choice":
      return <ChoiceInput input={input} {...p} />;
    case "multi-choice":
      return <MultiChoiceInput input={input} {...p} />;
    case "pitch-letter":
      return <LetterInput input={input} {...p} />;
    case "note-name":
      return <NoteNameInput input={input} {...p} />;
    case "keyboard":
      return <KeyboardInput input={input} {...p} />;
    case "time-signature":
      return <TimeSignatureInput input={input} {...p} />;
    case "key-name":
      return <KeyNameInput input={input} {...p} />;
    case "interval-name":
      return <IntervalNameInput input={input} {...p} />;
    case "chord-name":
      return <ChordNameInput input={input} {...p} />;
    case "ornament":
      return <OrnamentInput input={input} {...p} />;
    case "progression":
      return <ProgressionInput input={input} {...p} />;
    case "rhythm-builder":
      return <RhythmBuilder input={input} value={value as never} onChange={onChange as never} disabled={disabled} />;
    case "rhythm-grouping":
      return <GroupingEditor input={input} value={value as never} onChange={onChange as never} disabled={disabled} />;
    case "barlines":
      return <BarlineEditor input={input} value={value as never} onChange={onChange as never} disabled={disabled} />;
    case "staff-position":
    case "pitch-sequence":
    case "chord-builder":
    case "key-signature-writer":
      return <StaveAnswer input={input} value={value} onChange={onChange} disabled={disabled} marks={marks} />;
  }
}

export function AnswerInput({ input, value, onChange, disabled, marks, parts }: AnswerInputProps) {
  const name = useId();
  if (input.kind !== "composite") return <SimpleAnswer input={input} value={value as SimpleResponse | null} onChange={onChange} disabled={disabled} marks={marks} name={name} />;
  const current = value?.kind === "composite" ? value.parts : {};
  return (
    <ol className="composite">
      {input.parts.map((part, i) => {
        const res = parts?.find((x) => x.id === part.id);
        return (
          <li key={part.id} className={`composite-part${res ? (res.correct ? " is-right" : " is-wrong") : ""}`}>
            <h2 className="h3"><span className="part-num">{i + 1}</span> {part.prompt} {res && <span className="part-mark" aria-label={res.correct ? "correct" : "not correct"}>{res.correct ? "✓" : "✗"}</span>}</h2>
            <SimpleAnswer input={part.input} value={(current[part.id] as SimpleResponse | undefined) ?? null} onChange={(r) => {
              const next = { ...current } as Record<string, SimpleResponse>;
              if (r) next[part.id] = r;
              else delete next[part.id];
              onChange(Object.keys(next).length ? { kind: "composite", parts: next } : null);
            }} disabled={disabled} name={`${name}-${part.id}`} />
            {res && !res.correct && res.reason && <p className="part-reason">{res.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
