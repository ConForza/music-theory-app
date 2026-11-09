import { useId, type KeyboardEvent, type PointerEvent } from "react";
import type { NotationFragment } from "@mtp/curriculum";
import { BOTTOM_LINE, diatonic, parsePitch, positionName } from "../lib/music";

const S = 12; // line spacing
const H = S / 2; // one position (line or space)
const TREBLE = "M 4,26 C 4,32 -5,33 -5,27 C -5,22 2,22 3,28 L 5,-44 C 12,-40 11,-30 4,-22 C -6,-10 -9,0 -4,8 C 0,14 9,12 10,4 C 11,-4 3,-9 -2,-4 C -6,0 -3,8 3,8";
const BASS = "M -19,-12 C -3,-14 4,-4 0,6 C -4,15 -13,20 -22,24";

type Clef = "treble" | "bass";
const isClef = (c: string): c is Clef => c === "treble" || c === "bass";

interface Placed {
  x: number;
  pitches: string[];
  value: string;
  rest: boolean;
  bar: number;
}

function layout(f: NotationFragment) {
  const placed: Placed[] = [];
  const bars: number[] = [];
  let x = 78 + (f.timeSignature ? 26 : 0);
  f.measures.forEach((m, bar) => {
    const events = m.events ?? m.voices?.[0]?.events ?? [];
    for (const e of events) {
      if (e.kind === "note") placed.push({ x, pitches: [e.pitch], value: e.duration.value, rest: false, bar });
      else if (e.kind === "chord") placed.push({ x, pitches: e.notes.map((n) => n.pitch), value: e.duration.value, rest: false, bar });
      else if (e.kind === "rest") placed.push({ x, pitches: [], value: e.duration.value, rest: true, bar });
      x += 52;
    }
    bars.push(x - 16);
  });
  return { placed, bars, width: x + 14 };
}

/** Stems point up for notes below the middle line (position 4), down from the middle line up; chords use their span. */
export const stemUpFor = (posList: number[]) => posList.length === 0 || Math.max(...posList) + Math.min(...posList) < 8;
const STEM = 7; // stem length in positions beyond the outer notehead

export function pitchesOf(f: NotationFragment): string[] {
  return layout(f).placed.flatMap((p) => p.pitches);
}

/**
 * Read-only stave for treble and bass clefs: notes, chords, simple rests, ledger lines.
 * Notes are keyboard-focusable buttons when `onPlay` is given. The full notation engine (Brief 03) replaces
 * this behind the same NotationFragment contract.
 */
export function StaffView({
  fragment,
  highlight = [],
  onPlay,
  size = "normal",
}: {
  fragment: NotationFragment;
  highlight?: string[];
  onPlay?: (pitch: string) => void;
  size?: "normal" | "compact";
}) {
  const desc = useId();
  if (!isClef(fragment.clef)) {
    return (
      <figure className="staff staff-fallback">
        <figcaption id={desc}>{fragment.textAlternative}</figcaption>
        <p className="muted">A drawing for the {fragment.clef} clef arrives with the notation update; the description above covers this example.</p>
      </figure>
    );
  }
  const clef = fragment.clef;
  const bottom = BOTTOM_LINE[clef];
  const { placed, bars, width } = layout(fragment);
  const positions = placed.flatMap((p) => p.pitches.map((q) => diatonic(parsePitch(q)) - bottom));
  // Stem tips (and flags) are part of the drawing, so they count towards the bounds.
  const reach = placed.flatMap((p) => {
    if (p.rest || p.value === "semibreve") return [];
    const pos = p.pitches.map((q) => diatonic(parsePitch(q)) - bottom);
    return stemUpFor(pos) ? [Math.max(...pos) + STEM + (p.value === "quaver" || p.value === "semiquaver" ? 3 : 0)] : [Math.min(...pos) - STEM - (p.value === "quaver" || p.value === "semiquaver" ? 3 : 0)];
  });
  const topPos = Math.max(8, ...positions, ...reach) + 3;
  const botPos = Math.min(0, ...positions, ...reach) - 4;
  const y = (pos: number) => (topPos - pos) * H;
  const height = (topPos - botPos) * H;
  const scale = size === "compact" ? 0.9 : 1.2;

  return (
    <figure className="staff" style={{ ["--staff-min" as string]: `${Math.min(width, 300) * scale}px` }}>
      <div className="staff-scroll" tabIndex={0} role="group" aria-label="Music notation (scrolls sideways if wide)" aria-describedby={desc}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale} style={{ maxWidth: "none" }} role="img" aria-label={fragment.textAlternative}>
          {[0, 2, 4, 6, 8].map((p) => (
            <line key={p} x1={6} x2={width - 4} y1={y(p)} y2={y(p)} className="staff-line" />
          ))}
          <path d={clef === "treble" ? TREBLE : BASS} transform={`translate(30 ${y(clef === "treble" ? 2 : 6)})`} className="staff-glyph" />
          {fragment.timeSignature && <TimeSig sig={fragment.timeSignature} x={62} cy={y(4)} />}
          {bars.map((bx, i) => (
            <line key={i} x1={bx} x2={bx} y1={y(8)} y2={y(0)} className={i === bars.length - 1 ? "staff-line staff-final" : "staff-line"} />
          ))}
          {placed.map((p, i) => {
            const posList = p.pitches.map((q) => diatonic(parsePitch(q)) - bottom);
            const lit = p.pitches.some((q) => highlight.includes(q));
            const ledgers: number[] = [];
            for (const pos of posList) {
              for (let l = 10; l <= pos; l += 2) ledgers.push(l);
              for (let l = -2; l >= pos; l -= 2) ledgers.push(l);
            }
            const stemUp = stemUpFor(posList);
            const label = p.rest ? `${p.value} rest` : `${p.value} on ${posList.map(positionName).join(" and ")}`;
            const g = (
              <g className={`staff-event${lit ? " is-lit" : ""}${onPlay && !p.rest ? " is-playable" : ""}`}>
                {onPlay && !p.rest && <rect x={p.x - 20} y={0} width={40} height={height} fill="transparent" />}
                {[...new Set(ledgers)].map((l) => (
                  <line key={l} x1={p.x - 11} x2={p.x + 11} y1={y(l)} y2={y(l)} className="staff-line" />
                ))}
                {p.rest ? <Rest value={p.value} x={p.x} y={y} /> : <Heads p={p} posList={posList} stemUp={stemUp} y={y} />}
              </g>
            );
            if (!onPlay || p.rest) return <g key={i}>{g}</g>;
            const play = () => p.pitches.forEach((q) => onPlay(q));
            return (
              <g
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`Play ${label}`}
                onClick={play}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play();
                  }
                }}
              >
                {g}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id={desc} className="visually-hidden">
        {fragment.textAlternative}
      </figcaption>
    </figure>
  );
}

function Heads({ p, posList, stemUp, y }: { p: Placed; posList: number[]; stemUp: boolean; y: (n: number) => number }) {
  const open = p.value === "semibreve" || p.value === "minim";
  const stem = p.value !== "semibreve";
  const hi = Math.max(...posList);
  const lo = Math.min(...posList);
  const sx = stemUp ? p.x + 6 : p.x - 6;
  const y1 = y(stemUp ? lo : hi);
  const y2 = y(stemUp ? hi + STEM : lo - STEM);
  return (
    <>
      {stem && <line x1={sx} x2={sx} y1={y1} y2={y2} className="staff-stem" />}
      {(p.value === "quaver" || p.value === "semiquaver") && (
        <path d={stemUp ? `M ${sx} ${y2} c 2 8 10 8 8 18` : `M ${sx} ${y2} c -2 -8 -10 -8 -8 -18`} className="staff-stem" fill="none" />
      )}
      {posList.map((pos, i) => (
        <g key={i} transform={`translate(${p.x} ${y(pos)}) rotate(-20)`}>
          {p.value === "semibreve" ? (
            <>
              <ellipse rx={7.4} ry={5.2} className="staff-head" />
              <ellipse rx={3} ry={4.4} transform="rotate(50)" className="staff-hole" />
            </>
          ) : (
            <ellipse rx={6.4} ry={4.7} className={open ? "staff-head staff-open" : "staff-head"} />
          )}
        </g>
      ))}
    </>
  );
}

function Rest({ value, x, y }: { value: string; x: number; y: (n: number) => number }) {
  if (value === "semibreve") return <rect x={x - 6} y={y(6)} width={12} height={H * 0.9} className="staff-head" />;
  if (value === "minim") return <rect x={x - 6} y={y(4) - H * 0.9} width={12} height={H * 0.9} className="staff-head" />;
  return <path d={`M ${x - 3} ${y(7)} l 7 6 l -6 6 l 6 7 c -6 -2 -8 3 -4 6`} className="staff-stem" fill="none" />;
}

function TimeSig({ sig, x, cy }: { sig: string; x: number; cy: number }) {
  const [top, bottom] = sig === "C" ? ["4", "4"] : sig.split("/");
  return (
    <g className="staff-time" textAnchor="middle">
      <text x={x} y={cy - 3}>{top}</text>
      <text x={x} y={cy + 21}>{bottom}</text>
    </g>
  );
}

/**
 * Place one note on the stave. Pointer: tap or drag to the nearest line/space. Keyboard: Up/Down/Home/End on the
 * focused stave; plus two large buttons. The accessible value names the position, never the note name.
 */
export function StaffPicker({
  clef,
  value,
  onChange,
  maxLedgerLines,
  disabled,
  shownNote,
}: {
  clef: Clef;
  value: string | null;
  onChange: (pitch: string) => void;
  maxLedgerLines: number;
  disabled?: boolean;
  shownNote?: NotationFragment;
}) {
  const bottom = BOTTOM_LINE[clef];
  const lo = -2 * maxLedgerLines;
  const hi = 8 + 2 * maxLedgerLines;
  const pos = value ? diatonic(parsePitch(value)) - bottom : null;
  const margin = 4;
  const topPos = hi + margin;
  const botPos = lo - margin;
  const y = (p: number) => (topPos - p) * H;
  const height = (topPos - botPos) * H;
  const width = 190;
  const noteX = 120;
  const toPitch = (p: number) => {
    const d = bottom + p;
    return `${"CDEFGAB"[((d % 7) + 7) % 7]}${Math.floor(d / 7)}`;
  };
  const set = (p: number) => {
    if (disabled) return;
    onChange(toPitch(Math.max(lo, Math.min(hi, p))));
  };
  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vy = ((e.clientY - r.top) / r.height) * height;
    set(Math.round(topPos - vy / H));
  };
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (step) {
      e.preventDefault();
      set(pos === null ? 4 : pos + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      set(lo);
    } else if (e.key === "End") {
      e.preventDefault();
      set(hi);
    }
  };
  return (
    <div className="picker">
      {shownNote && <StaffView fragment={shownNote} size="compact" />}
      <div className="picker-row">
        <div
          className="picker-stave"
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Note position on the stave. Use the up and down arrow keys."
          aria-orientation="vertical"
          aria-valuemin={lo}
          aria-valuemax={hi}
          aria-valuenow={pos ?? undefined}
          aria-valuetext={pos === null ? "No note placed yet" : positionName(pos)}
          aria-disabled={disabled}
          onKeyDown={key}
        >
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ touchAction: "none", maxWidth: 320 }} onPointerDown={fromPointer} onPointerMove={(e) => e.buttons === 1 && fromPointer(e)} aria-hidden="true">
            {[0, 2, 4, 6, 8].map((p) => (
              <line key={p} x1={6} x2={width - 6} y1={y(p)} y2={y(p)} className="staff-line" />
            ))}
            <path d={clef === "treble" ? TREBLE : BASS} transform={`translate(34 ${y(clef === "treble" ? 2 : 6)})`} className="staff-glyph" />
            {pos !== null && (
              <g className="picker-note">
                {pos < 0 && Array.from({ length: Math.floor(-pos / 2) }, (_, i) => <line key={i} x1={noteX - 13} x2={noteX + 13} y1={y(-2 * (i + 1))} y2={y(-2 * (i + 1))} className="staff-line" />)}
                {pos > 8 && Array.from({ length: Math.floor((pos - 8) / 2) }, (_, i) => <line key={i} x1={noteX - 13} x2={noteX + 13} y1={y(10 + 2 * i)} y2={y(10 + 2 * i)} className="staff-line" />)}
                <ellipse cx={noteX} cy={y(pos)} rx={8} ry={5.8} transform={`rotate(-20 ${noteX} ${y(pos)})`} className="staff-head staff-open" />
              </g>
            )}
          </svg>
        </div>
        <div className="picker-nudge">
          <button type="button" className="icon-btn" onClick={() => set(pos === null ? 4 : pos + 1)} disabled={disabled || pos === hi} aria-label="Move note up">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
          <button type="button" className="icon-btn" onClick={() => set(pos === null ? 4 : pos - 1)} disabled={disabled || pos === lo} aria-label="Move note down">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
      </div>
      <p className="picker-status" aria-live="polite">{pos === null ? "Tap the stave to place a note." : `Note on the ${positionName(pos)}.`}</p>
    </div>
  );
}
