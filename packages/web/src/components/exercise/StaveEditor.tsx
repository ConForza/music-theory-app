/**
 * Interactive stave for writing notes (one note, a sequence, a chord) or a key signature, in any clef.
 *
 * Input methods (all equivalent): tap or click a line/space; or focus the stave and use ↑/↓ to move the
 * shadow note and Enter to write it; or the large on-screen buttons; or type note names. A note written with
 * no sign is read like real notation (key signature and earlier accidentals in the bar apply), so the pitch
 * submitted is exactly the pitch written on the stave.
 */
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { NotationEvent, NotationFragment } from "@mtp/curriculum";
import { layoutFragment, type Slots } from "../notation/layout";
import { StaveSvg } from "../notation/Notation";
import { G, SIGN_GLYPH } from "../notation/glyphs";
import { music, positionName, pretty } from "../../lib/music";
import { playPitch } from "../../lib/audio";
import { SignPicker } from "./SimpleInputs";
import "../notation/font";

export type SignId = "none" | "bb" | "b" | "" | "#" | "x";
export interface Written {
  pos: number;
  sign: SignId;
}
const SIGN_NAME: Record<string, music.Sign | undefined> = { bb: "double-flat", b: "flat", "": "natural", "#": "sharp", x: "double-sharp" };
const SIGN_WORD: Record<SignId, string> = { none: "", bb: " double flat", b: " flat", "": " natural", "#": " sharp", x: " double sharp" };

/** Sounding pitches of written notes (key signature + bar state), in order. */
export function resolveWritten(clef: music.Clef, key: string | undefined, notes: Written[], chord = false): music.Pitch[] {
  if (!notes.length) return [];
  const events = notes.map((n) => {
    const nat = music.naturalAt(clef, n.pos);
    const s = SIGN_NAME[n.sign];
    return { pitch: music.formatPitch(nat), ...(n.sign !== "none" && s ? { writtenAccidental: s } : {}) };
  });
  const measures = chord
    ? [{ events: [{ kind: "chord", notes: events, duration: { value: "semibreve", dots: 0 } }] }]
    : [{ events: events.map((e) => ({ kind: "note", ...e, duration: { value: "semibreve", dots: 0 } })) }];
  return music.resolveWrittenPitches({ key, showKeySignature: true, measures } as unknown as music.AFragment).map((r) => r.pitch);
}

/** Written form (position + sign actually needed) of spelt pitches, for typed input and given notes. */
export function toWritten(clef: music.Clef, key: string | undefined, pitches: music.Pitch[]): Written[] {
  const f = { key, showKeySignature: true, measures: [{ events: pitches.map((p) => ({ kind: "note", pitch: music.formatPitch(p), duration: { value: "semibreve" } })) }] };
  const signs = [...music.printedAccidentals(f as unknown as music.AFragment).values()];
  const back: Record<music.Sign, SignId> = { "double-flat": "bb", flat: "b", natural: "", sharp: "#", "double-sharp": "x" };
  return pitches.map((p, i): Written => ({ pos: music.staffPosition(clef, p), sign: signs[i] ? back[signs[i]!] : "none" }));
}

export interface StaveEditorProps {
  clef: music.Clef;
  mode: "single" | "sequence" | "chord" | "signature";
  /** Key signature printed on the stave (also used to read unsigned notes). */
  keyName?: string;
  maxLedgerLines: number;
  accidentals: boolean;
  doubleAccidentals: boolean;
  /** Notes printed before the learner's (e.g. the lower note of an interval, or the given first note of a scale). */
  given?: string[];
  maxNotes?: number;
  value: Written[];
  onChange: (v: Written[]) => void;
  marks?: Array<{ index: number; ok: boolean }>;
  disabled?: boolean;
  label: string;
  /** Announce note names (false for note-writing tasks, where the name is the answer). */
  announceNames?: boolean;
}

export function StaveEditor({ clef, mode, keyName, maxLedgerLines, accidentals, doubleAccidentals, given = [], maxNotes = 16, value, onChange, marks, disabled, label, announceNames = true }: StaveEditorProps) {
  const uid = useId();
  const lo = -2 * maxLedgerLines - (mode === "signature" ? 0 : 1);
  const hi = 8 + 2 * maxLedgerLines + (mode === "signature" ? 0 : 1);
  const [cursor, setCursor] = useState(() => (value.length ? value[value.length - 1]!.pos : 4));
  const [sign, setSign] = useState<SignId>(mode === "signature" ? "#" : "none");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const givenPitches = given.map(music.parsePitch);
  const givenWritten = toWritten(clef, keyName, givenPitches);
  const all = mode === "single" ? [...givenWritten, ...value] : mode === "sequence" ? [...givenWritten, ...value] : value;
  const pitches = mode === "signature" ? [] : resolveWritten(clef, keyName, all, mode === "chord");
  const full = mode === "sequence" && value.length + given.length >= maxNotes;

  // Build what is drawn from exactly what was written.
  const fragment = ((): NotationFragment => {
    const ev = (w: Written): { pitch: string; writtenAccidental?: music.Sign } => {
      const nat = music.naturalAt(clef, w.pos);
      const s = SIGN_NAME[w.sign];
      const resolved = resolveWritten(clef, keyName, [w]);
      return { pitch: music.formatPitch({ ...nat, alter: w.sign === "none" ? resolved[0]!.alter : music.SIGN_ALTER[s!] }), ...(w.sign !== "none" && s ? { writtenAccidental: s } : {}) };
    };
    let events: NotationEvent[] = [];
    if (mode === "chord" && value.length >= 2) events = [{ kind: "chord", notes: value.map(ev), duration: { value: "semibreve", dots: 0 } } as NotationEvent];
    if (mode === "chord" && value.length === 1) events = [{ kind: "note", ...ev(value[0]!), duration: { value: "semibreve", dots: 0 } } as NotationEvent];
    if (mode === "single" || mode === "sequence") {
      // Pitches follow bar state, so draw them resolved; signs exactly as written.
      events = all.map((w, i) => ({ kind: "note", pitch: music.formatPitch(pitches[i]!), ...(w.sign !== "none" && SIGN_NAME[w.sign] ? { writtenAccidental: SIGN_NAME[w.sign] } : {}), duration: { value: "semibreve", dots: 0 } }) as NotationEvent);
    }
    return { presentation: "stave", clef, key: keyName, showKeySignature: Boolean(keyName), measures: [{ events }], textAlternative: label } as NotationFragment;
  })();

  const count = mode === "chord" ? 1 : mode === "signature" ? 0 : all.length;
  const slotW = 3.1;
  // Untimed: each written note gets an even slot.
  const layout = layoutFragment(fragment, { slots: slotsFor(count, slotW), minWidth: mode === "signature" ? 9 : slotW * (count + (full ? 0 : 1)) });
  const startX = layout.barX[0] ?? 6;
  const ghostX = mode === "chord" ? startX + 1.2 : mode === "signature" ? startX + value.length * 1.05 + 0.2 : startX + 1.2 + count * slotW;
  const top = Math.min(layout.top, -hi / 2 - 1);
  const bottom = Math.max(layout.bottom, -lo / 2 + 1);
  const width = Math.max(layout.width, ghostX + 4);
  const px = 12;

  const place = (pos: number) => {
    if (disabled) return;
    const p = Math.max(lo, Math.min(hi, pos));
    setCursor(p);
    const w: Written = { pos: p, sign: accidentals || mode === "signature" ? sign : "none" };
    if (mode === "single") onChange([w]);
    else if (mode === "sequence") {
      if (!full) onChange([...value, w]);
    } else if (mode === "chord") {
      const exists = value.findIndex((x) => x.pos === p);
      onChange(exists >= 0 ? value.filter((_, i) => i !== exists) : value.length >= maxNotes ? value : [...value, w]);
    } else if (value.length < 7) onChange([...value, { pos: p, sign: sign === "b" ? "b" : "#" }]);
    if (mode !== "signature") {
      const sounding = resolveWritten(clef, keyName, mode === "sequence" ? [...all, w] : [w]);
      playPitch(music.formatPitch(sounding[sounding.length - 1]!), 0.7);
    }
  };
  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vy = top + ((e.clientY - r.top) / r.height) * (bottom - top);
    place(Math.round(-vy * 2));
  };
  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      // Writing one note: the arrows move the note itself (the first press writes it where the shadow is).
      const next = mode === "single" && !value.length ? cursor : Math.max(lo, Math.min(hi, cursor + (e.key === "ArrowUp" ? 1 : -1)));
      if (mode === "single") place(next);
      else setCursor(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      place(cursor);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };
  const setLastSign = (s: string) => {
    setSign(s as SignId);
    if (value.length && mode !== "signature") onChange(value.map((w, i) => (i === value.length - 1 ? { ...w, sign: s as SignId } : w)));
  };
  const submitTyped = () => {
    const parts = typed.trim().split(/[\s,]+/).filter(Boolean);
    try {
      const ps = parts.map((p) => music.parsePitch(p.replace("♯", "#").replace("♭", "b")));
      if (mode === "signature") {
        onChange(ps.map((p) => ({ pos: music.staffPosition(clef, p), sign: p.alter < 0 ? "b" : "#" })));
      } else {
        const written = toWritten(clef, keyName, [...(mode === "sequence" ? givenPitches : []), ...ps]).slice(mode === "sequence" ? givenPitches.length : 0);
        if (written.some((w) => w.pos < lo || w.pos > hi)) throw new Error("range");
        onChange(mode === "single" ? written.slice(-1) : written);
      }
      setTypeError(null);
    } catch {
      setTypeError("Use note names with octaves, such as C4 F#4 Bb3 (middle C is C4), within the stave and its ledger lines.");
    }
  };

  const describeNote = (w: Written, i: number) => `${announceNames ? `${pretty(music.formatPitch(pitches[i] ?? music.naturalAt(clef, w.pos)))} — ` : ""}${positionName(w.pos)}${SIGN_WORD[w.sign] ? `, with a${SIGN_WORD[w.sign]} sign` : ""}`;
  const status =
    mode === "signature"
      ? value.length
        ? `Key signature: ${value.map((w) => `${music.naturalAt(clef, w.pos).step}${w.sign === "b" ? "♭" : "♯"} (${positionName(w.pos)})`).join(", ")}`
        : "No sharps or flats written yet."
      : all.length
        ? all.map((w, i) => `${i + 1}. ${describeNote(w, i)}${i < givenWritten.length && mode !== "chord" ? " (given)" : ""}`).join("; ")
        : "No notes written yet.";

  return (
    <div className="stave-editor">
      <div
        className="stave-editor-stave"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label}. Use the up and down arrow keys to choose a line or space, Enter to write the note${mode === "sequence" || mode === "chord" || mode === "signature" ? ", and Backspace to remove the last one" : ""}.`}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={cursor}
        aria-valuetext={positionName(cursor)}
        aria-disabled={disabled}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 ${top} ${width} ${bottom - top}`} style={{ touchAction: "none", width: "100%", maxWidth: `${width * px}px`, minWidth: `${Math.round(width * px * 0.75)}px` }} onPointerDown={fromPointer} aria-hidden="true" className="notation-svg fit">
          {/* Marks index the whole submitted sequence, given notes included, exactly as drawn. */}
          <StaveSvg layout={layout} marks={marks} px={px} />
          {mode === "signature" &&
            value.map((w, i) => (
              <text key={i} x={startX + i * 1.05} y={-w.pos / 2} className="n-smufl n-glyph" fontSize={4}>{SIGN_GLYPH[w.sign === "b" ? "flat" : "sharp"].ch}</text>
            ))}
          {!disabled && !full && (
            <g className="n-ghost">
              <rect x={ghostX - 0.8} y={top} width={2.9} height={bottom - top} className="n-cursor" />
              {mode === "signature" ? (
                <text x={ghostX} y={-cursor / 2} className="n-smufl" fontSize={4}>{sign === "b" ? G.flat : G.sharp}</text>
              ) : (
                <>
                  {cursor < -1 && Array.from({ length: Math.floor(-cursor / 2) }, (_, i) => <line key={i} x1={ghostX - 0.4} x2={ghostX + 2.1} y1={i + 1} y2={i + 1} strokeWidth={0.16} className="n-line" />)}
                  {cursor > 9 && Array.from({ length: Math.floor((cursor - 8) / 2) }, (_, i) => <line key={i} x1={ghostX - 0.4} x2={ghostX + 2.1} y1={-5 - i} y2={-5 - i} strokeWidth={0.16} className="n-line" />)}
                  <text x={ghostX} y={-cursor / 2} className="n-smufl" fontSize={4}>{G.noteheadWhole}</text>
                </>
              )}
            </g>
          )}
        </svg>
      </div>
      <div className="editor-tools">
        <div className="editor-nudge" role="group" aria-label="Move and write">
          <button type="button" className="icon-btn" onClick={() => (mode === "single" ? place(value.length ? cursor + 1 : cursor) : setCursor((c) => Math.min(hi, c + 1)))} disabled={disabled || cursor >= hi} aria-label={mode === "single" ? "Move note up" : "Move the shadow note up"}>▲</button>
          <button type="button" className="icon-btn" onClick={() => (mode === "single" ? place(value.length ? cursor - 1 : cursor) : setCursor((c) => Math.max(lo, c - 1)))} disabled={disabled || cursor <= lo} aria-label={mode === "single" ? "Move note down" : "Move the shadow note down"}>▼</button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => place(cursor)} disabled={disabled || full}>{mode === "chord" ? "Add / remove note" : mode === "single" ? "Write note here" : "Add"}</button>
          {mode !== "single" && <button type="button" className="btn btn-quiet btn-small" onClick={() => onChange(value.slice(0, -1))} disabled={disabled || !value.length}>Undo</button>}
          {mode !== "single" && <button type="button" className="btn btn-quiet btn-small" onClick={() => onChange([])} disabled={disabled || !value.length}>Clear</button>}
        </div>
        {(accidentals || mode === "signature") && (
          <SignPicker
            value={sign}
            onChange={setLastSign}
            double={doubleAccidentals && mode !== "signature"}
            disabled={Boolean(disabled)}
            name={`${uid}-sign`}
            legend={mode === "signature" ? "Sharp or flat" : value.length && mode !== "chord" ? "Accidental for the last note (and the next)" : "Accidental"}
            allowNone={mode !== "signature"}
          />
        )}
        <p className="picker-status" aria-live="polite">{mode === "single" ? (value.length ? `Note on the ${describeNote(value[0]!, given.length)}.` : "Tap the stave to place a note.") : `Shadow note: ${positionName(cursor)}. ${status}`}</p>
        <details className="type-instead" open={typing} onToggle={(e) => setTyping((e.target as HTMLDetailsElement).open)}>
          <summary>Type the notes instead</summary>
          <label className="field">
            <span>{mode === "signature" ? "Sharps or flats in order, with octaves (e.g. F#5 C#5)" : "Note names with octaves, separated by spaces (e.g. D4 E4 F#4)"}</span>
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={disabled} autoComplete="off" spellCheck={false} />
          </label>
          <button type="button" className="btn btn-ghost btn-small" onClick={submitTyped} disabled={disabled || !typed.trim()}>Write these notes</button>
          {typeError && <p className="form-error" role="alert">{typeError}</p>}
        </details>
      </div>
    </div>
  );
}

function slotsFor(n: number, w: number): Slots {
  return [Array.from({ length: Math.max(n, 1) }, (_, i) => ({ key: `${i}/1`, onset: music.frac(i), width: w }))];
}
