/**
 * Selection-style answer inputs. Every control is a native radio/checkbox/button, so touch, mouse, keyboard
 * and screen readers all work the same way; selected state is shown by outline and weight, not colour alone.
 */
import { useId, useState, type ReactNode } from "react";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { Keyboard } from "../Keyboard";
import { Notation } from "../notation/Notation";
import { G } from "../notation/glyphs";
import { music, pretty } from "../../lib/music";

type Of<K extends ItemInput["kind"]> = Extract<ItemInput, { kind: K }>;
type R<K extends LearnerResponse["kind"]> = Extract<LearnerResponse, { kind: K }>;
export interface InputProps<K extends ItemInput["kind"], RK extends LearnerResponse["kind"]> {
  input: Of<K>;
  value: R<RK> | null;
  onChange: (r: R<RK> | null) => void;
  disabled: boolean;
  name: string;
}

export function Radios({ legend, options, value, onSelect, disabled, name, columns, render, showLegend }: { legend: string; options: Array<{ id: string; label: string }>; value: string | null; onSelect: (id: string) => void; disabled: boolean; name: string; columns?: "letters" | "wide" | "grid"; render?: (o: { id: string; label: string }) => ReactNode; showLegend?: boolean }) {
  return (
    <fieldset className={`options${columns ? ` ${columns}` : ""}`} disabled={disabled}>
      <legend className={showLegend ? "hint-line" : "visually-hidden"}>{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? "option is-selected" : "option"}>
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onSelect(o.id)} />
          <span>{render ? render(o) : o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ChoiceInput({ input, value, onChange, disabled, name }: InputProps<"choice", "choice">) {
  return <Radios legend="Choose an answer" options={input.options} value={value?.optionId ?? null} onSelect={(id) => onChange({ kind: "choice", optionId: id })} disabled={disabled} name={name} />;
}

export function MultiChoiceInput({ input, value, onChange, disabled, name }: InputProps<"multi-choice", "multi-choice">) {
  const chosen = new Set(value?.optionIds ?? []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size ? { kind: "multi-choice", optionIds: input.options.map((o) => o.id).filter((x) => next.has(x)) } : null);
  };
  return (
    <fieldset className="options" disabled={disabled}>
      <legend className="hint-line">Choose every answer that is right.</legend>
      {input.options.map((o) => (
        <label key={o.id} className={chosen.has(o.id) ? "option is-selected" : "option"}>
          <input type="checkbox" name={name} value={o.id} checked={chosen.has(o.id)} onChange={() => toggle(o.id)} />
          <span><span className="check-box" aria-hidden="true">{chosen.has(o.id) ? "✓" : ""}</span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
export function LetterInput({ value, onChange, disabled, name }: InputProps<"pitch-letter", "pitch-letter">) {
  return <Radios legend="Choose the note name" options={LETTERS.map((l) => ({ id: l, label: l }))} value={value?.letter ?? null} onSelect={(l) => onChange({ kind: "pitch-letter", letter: l as "A" })} disabled={disabled} name={name} columns="letters" />;
}

export const SIGNS: Array<{ id: string; label: string; text: string; glyph: string; sr: string }> = [
  { id: "bb", label: "double flat", text: "bb", glyph: G.doubleFlat, sr: "double flat" },
  { id: "b", label: "flat", text: "b", glyph: G.flat, sr: "flat" },
  { id: "", label: "natural", text: "", glyph: G.natural, sr: "natural (no sharp or flat)" },
  { id: "#", label: "sharp", text: "#", glyph: G.sharp, sr: "sharp" },
  { id: "x", label: "double sharp", text: "x", glyph: G.doubleSharp, sr: "double sharp" },
];

export function SignPicker({ value, onChange, double, disabled, name, legend = "Accidental", allowNone = false }: { value: string | null; onChange: (s: string) => void; double: boolean; disabled: boolean; name: string; legend?: string; allowNone?: boolean }) {
  const opts = [...(allowNone ? [{ id: "none", label: "none", text: "", glyph: "", sr: "no accidental sign written" }] : []), ...SIGNS.filter((s) => double || (s.id !== "bb" && s.id !== "x"))];
  return (
    <fieldset className="options signs" disabled={disabled}>
      <legend className="hint-line">{legend}</legend>
      {opts.map((s) => (
        <label key={s.id} className={value === s.id ? "option is-selected" : "option"}>
          <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} aria-label={s.sr} />
          <span>{s.glyph ? <span className="smufl-inline" aria-hidden="true">{s.glyph}</span> : <span aria-hidden="true">none</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Letter + accidental (+ octave when the task is octave-sensitive). */
export function NoteNameInput({ input, value, onChange, disabled, name }: InputProps<"note-name", "pitch">) {
  const m = value ? /^([A-G])(bb|b|#|x)?(-?\d)?$/.exec(value.pitch) : null;
  const letter = m?.[1] ?? null;
  const sign = m ? (m[2] ?? "") : "";
  const octave = m?.[3] !== undefined ? Number(m[3]) : (input.octave ? 4 : null);
  const emit = (l: string | null, s: string, o: number | null) => onChange(l ? { kind: "pitch", pitch: `${l}${s}${input.octave && o !== null ? o : ""}` } : null);
  return (
    <div className="note-name">
      <Radios legend="Letter name" options={LETTERS.map((l) => ({ id: l, label: l }))} value={letter} onSelect={(l) => emit(l, sign, octave)} disabled={disabled} name={`${name}-letter`} columns="letters" />
      {input.accidentals && <SignPicker value={sign} onChange={(s) => emit(letter, s, octave)} double={input.doubleAccidentals} disabled={disabled || !letter} name={`${name}-sign`} legend="Sharp, flat or natural" />}
      {input.octave && (
        <div className="stepper" role="group" aria-label="Octave">
          <span className="hint-line">Octave (middle C is C4)</span>
          <button type="button" className="icon-btn" disabled={disabled || !letter || octave! <= input.octave.min} onClick={() => emit(letter, sign, octave! - 1)} aria-label="Octave down">−</button>
          <output aria-live="polite">{letter ? pretty(`${letter}${sign}${octave}`) : `Octave ${octave}`}</output>
          <button type="button" className="icon-btn" disabled={disabled || !letter || octave! >= input.octave.max} onClick={() => emit(letter, sign, octave! + 1)} aria-label="Octave up">+</button>
        </div>
      )}
      {letter && <p className="answer-echo" aria-live="polite">Your answer: <strong>{pretty(`${letter}${sign}`)}{input.octave ? octave : ""}</strong></p>}
    </div>
  );
}

export function KeyboardInput({ input, value, onChange, disabled }: InputProps<"keyboard", "keyboard">) {
  const key = value?.key ?? null;
  const black = key !== null && [1, 3, 6, 8, 10].includes(((key % 12) + 12) % 12);
  const names = (k: number) => {
    const pc = ((k % 12) + 12) % 12;
    const o = Math.floor(k / 12);
    const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pc]!;
    const flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][pc]!;
    return [`${sharp}${o}`, `${flat}${o}`];
  };
  return (
    <div className="keyboard-answer">
      <Keyboard from={input.from} to={input.to} selected={key !== null ? [key] : []} disabled={disabled} label="Choose a key" onPress={(k) => onChange({ kind: "keyboard", key: k, ...(input.spelling ? { spelling: names(k)[0] } : {}) })} />
      {input.spelling && black && key !== null && (
        <Radios legend="Which name?" options={names(key).map((n) => ({ id: n, label: pretty(n.replace(/\d$/, "")) }))} value={value?.spelling ?? null} onSelect={(sp) => onChange({ kind: "keyboard", key, spelling: sp })} disabled={disabled} name="kbd-spelling" columns="letters" />
      )}
      <p className="answer-echo" aria-live="polite">{key === null ? "Tap a key, or use the arrow keys and Enter." : `Selected: ${pretty(value?.spelling?.replace(/\d$/, "") ?? names(key)[0]!.replace(/\d$/, ""))}${black && !input.spelling ? ` (also called ${pretty(names(key)[1]!.replace(/\d$/, ""))})` : ""}`}</p>
    </div>
  );
}

export function TimeSignatureInput({ input, value, onChange, disabled, name }: InputProps<"time-signature", "time-signature">) {
  const top = value?.top ?? null;
  const bottom = value?.bottom ?? null;
  const emit = (t: number | null, b: number | null) => onChange(t && b ? { kind: "time-signature", top: t, bottom: b } : t || b ? ({ kind: "time-signature", top: t ?? 0, bottom: b ?? 0 } as R<"time-signature">) : null);
  return (
    <div className="ts-input">
      <Radios legend="Top number: how many beats (or beat-units) in a bar" options={input.tops.map((n) => ({ id: String(n), label: String(n) }))} value={top ? String(top) : null} onSelect={(t) => emit(Number(t), bottom)} disabled={disabled} name={`${name}-top`} columns="letters" />
      <div className="ts-divider" aria-hidden="true" />
      <Radios legend="Bottom number: which note value" options={input.bottoms.map((n) => ({ id: String(n), label: String(n) }))} value={bottom ? String(bottom) : null} onSelect={(b) => emit(top, Number(b))} disabled={disabled} name={`${name}-bottom`} columns="letters" />
      <p className="answer-echo" aria-live="polite">{top && bottom ? `Your answer: ${top}/${bottom}` : "Choose a top and a bottom number."}</p>
    </div>
  );
}

export function KeyNameInput({ input, value, onChange, disabled, name }: InputProps<"key-name", "key-name">) {
  const desc = useId();
  return (
    <div className="keyname-input">
      {input.signature && (
        <Notation
          size="large"
          minWidth={10}
          fragment={{ presentation: "stave", clef: input.signature.clef, showKeySignature: false, measures: [{ events: [] as never }], textAlternative: input.signature.pitches.length ? `A ${input.signature.clef}-clef key signature: ${input.signature.pitches.map((p) => pretty(p.replace(/\d$/, ""))).join(", ")}.` : "A key signature with no sharps or flats." }}
          overlay={(l) => <KeySigOverlay pitches={input.signature!.pitches} clef={input.signature!.clef} x={l.barX[0]! - 0.2} />}
        />
      )}
      <Radios legend="Choose the key" options={input.options.map((k) => ({ id: k, label: pretty(k) }))} value={value?.key ?? null} onSelect={(k) => onChange({ kind: "key-name", key: k })} disabled={disabled} name={name} columns="grid" />
      <span id={desc} className="visually-hidden">Keys listed from the key-signature options at this grade.</span>
    </div>
  );
}

/** Draws key-signature accidentals over an empty stave (the rest glyph is hidden behind them). */
function KeySigOverlay({ pitches, clef, x }: { pitches: string[]; clef: music.Clef; x: number }) {
  return (
    <g>
      {pitches.map((p, i) => {
        const pp = music.parsePitch(p);
        return <text key={p} x={x + i * 1.05} y={-music.staffPosition(clef, pp) / 2} className="n-smufl n-glyph" fontSize={4}>{pp.alter > 0 ? G.sharp : G.flat}</text>;
      })}
    </g>
  );
}

const ORD = (n: number) => (n === 1 ? "unison" : n === 8 ? "octave" : n === 15 ? "double octave" : `${n}${n === 2 || n === 9 ? "nd" : n === 3 || n === 10 ? "rd" : "th"}`);
const QUAL: Record<string, string> = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };

export function IntervalNameInput({ input, value, onChange, disabled, name }: InputProps<"interval-name", "interval-name">) {
  // Partial choices (a quality before a number) are kept locally until the answer is complete.
  const [partial, setPartial] = useState<{ n: number | null; q: string | null }>({ n: value?.number ?? null, q: value?.quality ?? null });
  const n = partial.n;
  const q = partial.q;
  const emit = (num: number | null, qual: string | null) => {
    setPartial({ n: num, q: qual });
    onChange(num && (!input.qualities || qual) ? ({ kind: "interval-name", number: num, ...(input.qualities && qual ? { quality: qual } : {}) } as R<"interval-name">) : null);
  };
  const numbers = Array.from({ length: input.maxNumber - (input.compound ? 0 : 0) }, (_, i) => i + 1).filter((x) => x >= 1);
  return (
    <div className="interval-name">
      {input.qualities && <Radios legend="Quality" options={input.qualities.map((x) => ({ id: x, label: QUAL[x] ?? x }))} value={q} onSelect={(x) => emit(n, x)} disabled={disabled} name={`${name}-q`} columns="wide" />}
      <Radios legend="Number" options={numbers.map((x) => ({ id: String(x), label: ORD(x) }))} value={n ? String(n) : null} onSelect={(x) => emit(Number(x), q)} disabled={disabled} name={`${name}-n`} columns="grid" />
      <p className="answer-echo" aria-live="polite">{n ? `Your answer: ${input.qualities ? (q ? QUAL[q] : "(choose a quality)") : ""} ${ORD(n)}` : "Choose the interval."}</p>
    </div>
  );
}

const INV_TEXT: Record<string, string> = { a: "a — root position (root in the bass)", b: "b — first inversion (3rd in the bass)", c: "c — second inversion (5th in the bass)" };
export function ChordNameInput({ input, value, onChange, disabled, name }: InputProps<"chord-name", "chord-name">) {
  const [partial, setPartial] = useState<{ r: string | null; i: string | null }>({ r: value?.roman ?? null, i: value?.inversion ?? (input.inversions.length === 1 ? input.inversions[0]! : null) });
  const roman = partial.r;
  const inv = partial.i;
  const emit = (r: string | null, i: string | null) => {
    setPartial({ r, i });
    onChange(r && i ? ({ kind: "chord-name", roman: r, inversion: i } as R<"chord-name">) : null);
  };
  return (
    <div className="chord-name">
      <Radios legend="Chord (Roman numeral)" options={input.romans.map((r) => ({ id: r, label: r }))} value={roman} onSelect={(r) => emit(r, inv)} disabled={disabled} name={`${name}-r`} columns="letters" />
      {input.inversions.length > 1 && <Radios legend="Position" options={input.inversions.map((i) => ({ id: i, label: INV_TEXT[i] ?? i }))} value={inv} onSelect={(i) => emit(roman, i)} disabled={disabled} name={`${name}-i`} />}
    </div>
  );
}

const ORN: Record<string, { glyph: string; label: string }> = {
  trill: { glyph: G.trill, label: "trill" },
  turn: { glyph: G.turn, label: "turn" },
  "upper-mordent": { glyph: G.upperMordent, label: "upper mordent" },
  "lower-mordent": { glyph: G.lowerMordent, label: "lower mordent" },
  acciaccatura: { glyph: G.acciaccatura, label: "acciaccatura" },
  appoggiatura: { glyph: G.appoggiatura, label: "appoggiatura" },
};
export function OrnamentInput({ input, value, onChange, disabled, name }: InputProps<"ornament", "ornament">) {
  return (
    <Radios
      legend="Choose the ornament"
      options={input.options.map((o) => ({ id: o, label: ORN[o]?.label ?? o }))}
      value={value?.sign ?? null}
      onSelect={(s) => onChange({ kind: "ornament", sign: s as R<"ornament">["sign"] })}
      disabled={disabled}
      name={name}
      columns="wide"
      render={(o) => (
        <span className="orn-option"><span className="smufl-inline" aria-hidden="true">{ORN[o.id]?.glyph}</span><span>{o.label}</span></span>
      )}
    />
  );
}

export function ProgressionInput({ input, value, onChange, disabled, name }: InputProps<"progression", "progression">) {
  const chords = value?.chords ?? {};
  return (
    <div className="progression">
      {input.labels.map((l) => (
        <Radios key={l} showLegend legend={`Chord for the note marked ${l}`} options={input.romans.map((r) => ({ id: r, label: r }))} value={chords[l] ?? null} onSelect={(r) => onChange({ kind: "progression", chords: { ...chords, [l]: r } as R<"progression">["chords"] })} disabled={disabled} name={`${name}-${l}`} columns="letters" render={(o) => <span>{o.label}</span>} />
      ))}
      <p className="answer-echo" aria-live="polite">{input.labels.map((l) => `${l}: ${chords[l] ?? "?"}`).join("   ")}</p>
    </div>
  );
}
