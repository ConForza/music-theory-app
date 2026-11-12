import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { diatonic, parsePitch, semitones } from "../lib/music";
import { playSemitones } from "../lib/audio";
import { ScrollCueText, useScrollCue } from "./ScrollCue";

const WHITE = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_AFTER: Record<string, [string, string]> = { C: ["C♯", "D♭"], D: ["D♯", "E♭"], F: ["F♯", "G♭"], G: ["G♯", "A♭"], A: ["A♯", "B♭"] };

/** Accessible name: written pitch and octave for every key ("G4", "C4, middle C", "F♯4 / G♭4"), so octaves are never ambiguous. */
export const whiteKeyLabel = (pitch: string) => `${pitch}${pitch === "C4" ? ", middle C" : ""}`;
export const blackKeyLabel = (sharp: string, flat: string, octave: number) => `${sharp}${octave} / ${flat}${octave}`;

export interface KeyInfo {
  key: number;
  white: boolean;
  name: string;
  octave: number;
}

/** Semitone numbers and names of every key from `from` to `to` (both white keys). */
export function keysBetween(from: string, to: string): KeyInfo[] {
  const lo = diatonic(parsePitch(from));
  const hi = diatonic(parsePitch(to));
  const out: KeyInfo[] = [];
  for (let d = lo; d <= hi; d++) {
    const step = WHITE[((d % 7) + 7) % 7]!;
    const octave = Math.floor(d / 7);
    const key = semitones({ step, alter: 0, octave });
    out.push({ key, white: true, name: step, octave });
    const b = BLACK_AFTER[step];
    if (b && d < hi) out.push({ key: key + 1, white: false, name: `${b[0]} / ${b[1]}`, octave });
  }
  return out;
}

/**
 * Playable, selectable piano. Every key is a button: tap/click, or arrow keys to move and Enter/Space to press.
 * Selection and feedback are shown with outlines and symbols as well as colour. Sound is optional.
 */
export function Keyboard({
  from,
  to,
  highlight = [],
  selected = [],
  marks,
  onPress,
  onPlay,
  disabled,
  sound = true,
  label = "Piano keyboard",
  showNames = true,
  anonymous = false,
}: {
  from: string;
  to: string;
  /** Pitches to light up (demonstrations). */
  highlight?: string[];
  /** Keys (semitones above C0) the learner has selected. */
  selected?: number[];
  marks?: Record<number, boolean>;
  onPress?: (key: number) => void;
  /** Legacy demo callback with a spelt pitch (white keys natural, black keys sharp). */
  onPlay?: (pitch: string) => void;
  disabled?: boolean;
  sound?: boolean;
  label?: string;
  showNames?: boolean;
  /** Question pictures: keys are not named, so the picture cannot give the answer away. */
  anonymous?: boolean;
}) {
  const keys = keysBetween(from, to);
  const whites = keys.filter((k) => k.white);
  const lit = new Set(highlight.map((p) => semitones(parsePitch(p))));
  const scroller = useRef<HTMLDivElement>(null);
  const cue = useScrollCue(scroller, [from, to]);
  const [focusKey, setFocusKey] = useState<number>(() => selected[0] ?? [...lit][0] ?? whites[0]!.key);
  const first = selected[0] ?? [...lit][0];
  useEffect(() => {
    const el = scroller.current;
    const target = first !== undefined ? el?.querySelector<HTMLElement>(`[data-key="${first}"]`) : null;
    if (el && target && typeof el.scrollTo === "function") el.scrollTo({ left: Math.max(0, target.offsetLeft - el.clientWidth / 2 + 22), behavior: "auto" });
  }, [first]);

  const press = (k: KeyInfo) => {
    if (disabled) return;
    if (sound && !onPlay) playSemitones(k.key); // a legacy onPlay callback owns the sound itself, so it is never doubled
    onPress?.(k.key);
    if (onPlay) {
      const step = k.white ? k.name : k.name[0]!;
      onPlay(`${step}${k.white ? "" : "#"}${k.octave}`);
    }
  };
  const move = (e: KeyboardEvent, k: KeyInfo) => {
    const i = keys.findIndex((x) => x.key === k.key);
    let next: KeyInfo | undefined;
    if (e.key === "ArrowRight") next = keys[Math.min(keys.length - 1, i + 1)];
    else if (e.key === "ArrowLeft") next = keys[Math.max(0, i - 1)];
    else if (e.key === "Home") next = keys[0];
    else if (e.key === "End") next = keys[keys.length - 1];
    if (next) {
      e.preventDefault();
      setFocusKey(next.key);
      scroller.current?.querySelector<HTMLElement>(`[data-key="${next.key}"]`)?.focus();
    }
  };
  const nameOf = (k: KeyInfo) => (k.white ? whiteKeyLabel(`${k.name}${k.octave}`) : blackKeyLabel(k.name.split(" / ")[0]!, k.name.split(" / ")[1]!, k.octave));
  const button = (k: KeyInfo) => {
    const isSel = selected.includes(k.key);
    const mark = marks?.[k.key];
    return (
      <button
        type="button"
        data-key={k.key}
        tabIndex={k.key === focusKey ? 0 : -1}
        className={`key ${k.white ? "white" : "black"}${lit.has(k.key) ? " is-lit" : ""}${isSel ? " is-selected" : ""}${mark === true ? " is-right" : mark === false ? " is-wrong" : ""}`}
        aria-label={anonymous ? `${k.white ? "white" : "black"} key ${keys.filter((x) => x.white === k.white && x.key <= k.key).length} of ${keys.filter((x) => x.white === k.white).length}${lit.has(k.key) ? ", marked in the question" : ""}` : nameOf(k)}
        aria-pressed={onPress ? isSel : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => press(k)}
        onKeyDown={(e) => move(e, k)}
        onFocus={() => setFocusKey(k.key)}
      >
        {k.white && showNames && !anonymous && <span className="key-name" aria-hidden="true">{k.name}{k.name === "C" ? k.octave : ""}</span>}
        {(isSel || mark !== undefined) && <span className="key-mark" aria-hidden="true">{mark === true ? "✓" : mark === false ? "✗" : "●"}</span>}
      </button>
    );
  };
  return (
    <div className={`keyboard-wrap${cue.left ? " more-left" : ""}${cue.right ? " more-right" : ""}`}>
      <ScrollCueText left={cue.left} right={cue.right} what="keys" />
      <div className="keyboard-frame">
        <div className="keyboard-scroll" ref={scroller} role="group" aria-label={`${label}. Use the arrow keys to move between keys and Enter to press.`}>
          <div className="keyboard" style={{ ["--keys" as string]: whites.length }}>
            {whites.map((w) => {
              const black = keys.find((k) => !k.white && k.key === w.key + 1);
              return (
                <div className="key-slot" key={w.key}>
                  {button(w)}
                  {black && button(black)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
