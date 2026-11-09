import { useEffect, useRef } from "react";
import { diatonic, parsePitch } from "../lib/music";

const WHITE = ["C", "D", "E", "F", "G", "A", "B"];
// black key sits after these white keys
const BLACK_AFTER: Record<string, string> = { C: "C#", D: "D#", F: "F#", G: "G#", A: "A#" };

/** A playable on-screen piano. Keys are buttons (keyboard and touch); sound is optional and handled by `onPlay`. */
export function Keyboard({ from, to, highlight = [], onPlay }: { from: string; to: string; highlight?: string[]; onPlay: (pitch: string) => void }) {
  const lo = diatonic(parsePitch(from));
  const hi = diatonic(parsePitch(to));
  const whites: Array<{ step: string; octave: number; pitch: string }> = [];
  for (let d = lo; d <= hi; d++) {
    const step = WHITE[((d % 7) + 7) % 7]!;
    const octave = Math.floor(d / 7);
    whites.push({ step, octave, pitch: `${step}${octave}` });
  }
  const scroller = useRef<HTMLDivElement>(null);
  const first = highlight[0];
  useEffect(() => {
    const el = scroller.current;
    const target = first ? el?.querySelector<HTMLElement>(`[data-pitch="${first}"]`) : null;
    if (el && target && typeof el.scrollTo === "function") el.scrollTo({ left: Math.max(0, target.offsetLeft - el.clientWidth / 2 + 22), behavior: "auto" });
  }, [first]);

  return (
    <div className="keyboard-scroll" ref={scroller} role="group" aria-label="Piano keyboard. Each key plays its note." tabIndex={-1}>
      <div className="keyboard" style={{ ["--keys" as string]: whites.length }}>
        {whites.map((k) => {
          const black = BLACK_AFTER[k.step];
          const lit = highlight.includes(k.pitch);
          return (
            <div className="key-slot" key={k.pitch}>
              <button type="button" data-pitch={k.pitch} className={`key white${lit ? " is-lit" : ""}`} aria-label={`${k.step}${k.pitch === "C4" ? ", middle C" : ""}`} onClick={() => onPlay(k.pitch)}>
                <span className="key-name" aria-hidden="true">{k.step}{k.step === "C" ? k.octave : ""}</span>
              </button>
              {black && k.pitch !== whites[whites.length - 1]!.pitch && (
                <button type="button" className="key black" aria-label={`${black.replace("#", " sharp")}${k.octave}`} onClick={() => onPlay(`${black}${k.octave}`)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
