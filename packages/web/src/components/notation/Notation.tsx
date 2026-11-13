import { useId, useMemo, type KeyboardEvent, type ReactNode } from "react";
import type { NotationFragment, NotationScore } from "@mtp/curriculum";
import { layoutFragment, layoutScore, type LaidEvent, type StaveLayout } from "./layout";
import { G } from "./glyphs";
import "./notation.css";
import "./font";

/** Pixels per staff space. The SVG keeps its natural size and scrolls sideways when wider than the screen. */
const PX = { normal: 11, compact: 9, large: 12 } as const;
/** Wide music shrinks to fit the screen, but never below this share of its natural size (then it scrolls). */
const MIN_SCALE = 0.7;
const fit = (w: number, min = MIN_SCALE) => ({ width: "100%", maxWidth: `${w}px`, minWidth: `${Math.round(w * min)}px` });
/** A rhythm line has no clef or key to keep legible, so on a narrow phone it may shrink further before it scrolls (three-bar questions). */
const RHYTHM_MIN_SCALE = 0.5;

export interface NotationProps {
  fragment: NotationFragment;
  size?: keyof typeof PX;
  /** Event ids ("bar.voice.index") or spelt pitches to highlight (e.g. while playing). */
  highlight?: string[];
  /** Per-notehead marks in reading order (true = correct). Shown with ✓/✗ symbols, never colour alone. */
  marks?: Array<{ index: number; ok: boolean }>;
  /** Makes each note a button (e.g. to hear it). */
  onActivate?: (ev: LaidEvent) => void;
  /** Extra SVG drawn on top, in staff-space coordinates (used by editors). */
  overlay?: (layout: StaveLayout) => ReactNode;
  caption?: string;
  /** Hide the visually-hidden text description (when the parent already provides one). */
  describe?: boolean;
  /** Minimum bar width in staff spaces (for empty or nearly empty staves). */
  minWidth?: number;
  /** "positions": accessible labels describe stave positions and printed signs, never pitch names (assessments). */
  labels?: "names" | "positions" | "neutral";
}

function Primitives({ ev, lit, mark }: { ev: Pick<LaidEvent, "glyphs" | "lines" | "paths" | "texts">; lit?: boolean; mark?: boolean | null }) {
  return (
    <g className={`${lit ? "is-lit" : ""}${mark === true ? " is-right" : mark === false ? " is-wrong" : ""}`}>
      {ev.lines.map((l, i) => <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={l.w} className={l.cls} />)}
      {ev.paths.map((p, i) => <path key={`p${i}`} d={p.d} className={p.cls} {...(p.fill ? {} : { fill: "none", strokeWidth: p.w ?? 0.16 })} />)}
      {ev.glyphs.map((g, i) => <text key={`g${i}`} x={g.x} y={g.y} className={`n-smufl ${g.cls ?? ""}`} fontSize={g.size ?? 4}>{g.ch}</text>)}
      {ev.texts.map((t, i) => <text key={`t${i}`} x={t.x} y={t.y} className={t.cls} textAnchor={t.anchor ?? "start"}>{t.text}</text>)}
    </g>
  );
}

export function StaveSvg({ layout, highlight = [], marks, onActivate, overlay, offsetY = 0, px, labels = "names" }: { layout: StaveLayout; highlight?: string[]; marks?: NotationProps["marks"]; onActivate?: NotationProps["onActivate"]; overlay?: NotationProps["overlay"]; offsetY?: number; px: number; labels?: "names" | "positions" | "neutral" }) {
  const markOf = (ev: LaidEvent) => {
    if (!marks) return null;
    const ms = ev.noteIndex.map((i) => marks.find((m) => m.index === i)).filter(Boolean);
    if (!ms.length) return null;
    return ms.every((m) => m!.ok);
  };
  void px;
  return (
    <g transform={`translate(0 ${offsetY})`}>
      {layout.lines.map((p) => <line key={p} x1={0.2} x2={layout.width - 0.2} y1={-p / 2} y2={-p / 2} strokeWidth={0.13} className="n-line" />)}
      <Primitives ev={layout.fixed} />
      {layout.events.map((ev) => {
        const lit = highlight.includes(ev.id) || ev.pitches.some((p) => highlight.includes(p));
        const mark = markOf(ev);
        const body = (
          <>
            <Primitives ev={ev} lit={lit} mark={mark} />
            {mark !== null && (
              <text x={ev.x + ev.width / 2} y={Math.min(-6.2, layout.top + 1.6)} textAnchor="middle" className={`n-mark ${mark ? "is-right" : "is-wrong"}`}>{mark ? "✓" : "✗"}</text>
            )}
          </>
        );
        if (!onActivate || ev.rest) return <g key={ev.id}>{body}</g>;
        const key = (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate(ev);
          }
        };
        return (
          <g key={ev.id} role="button" tabIndex={0} aria-label={`Play ${labels === "neutral" ? (ev.rest ? ev.label : "note") : labels === "positions" ? ev.positionLabel : ev.label}`} className="n-event is-playable" onClick={() => onActivate(ev)} onKeyDown={key}>
            <rect x={ev.x - 1} y={layout.top} width={ev.width + 2} height={layout.bottom - layout.top} fill="transparent" />
            {body}
          </g>
        );
      })}
      {overlay?.(layout)}
    </g>
  );
}

/** Read-only (or tap-to-hear) notation for one stave in any clef, or a rhythm line. */
export function Notation({ fragment, size = "normal", highlight, marks, onActivate, overlay, caption, describe = true, minWidth, labels }: NotationProps) {
  const desc = useId();
  const layout = useMemo(() => layoutFragment(fragment, minWidth ? { minWidth } : {}), [fragment, minWidth]);
  const px = PX[size];
  const h = layout.bottom - layout.top;
  return (
    <figure className={`notation notation-${size}`}>
      <div className="notation-scroll" tabIndex={0} role="group" aria-label="Music notation (scrolls sideways if wide)" aria-describedby={desc}>
        <svg viewBox={`0 ${layout.top} ${layout.width} ${h}`} style={fit(layout.width * px, fragment.presentation === "rhythm-line" ? RHYTHM_MIN_SCALE : MIN_SCALE)} role={onActivate ? "group" : "img"} aria-label={fragment.textAlternative} className="notation-svg fit">
          <StaveSvg layout={layout} highlight={highlight} marks={marks} onActivate={onActivate} overlay={overlay} px={px} labels={labels} />
        </svg>
      </div>
      {caption && <figcaption className="notation-caption">{caption}</figcaption>}
      {describe && <p id={desc} className="visually-hidden">{fragment.textAlternative}</p>}
    </figure>
  );
}

/** Several staves (short score, open score, transposing parts) aligned bar by bar, with a brace or bracket and labels. */
export function ScoreView({ score, size = "normal", highlight }: { score: NotationScore; size?: keyof typeof PX; highlight?: string[] }) {
  const desc = useId();
  const sl = useMemo(() => layoutScore(score), [score]);
  const px = PX[size];
  const first = sl.staves[0]!;
  const last = sl.staves[sl.staves.length - 1]!;
  const yTop = first.offset - 4;
  const yBottom = last.offset;
  const top = first.offset + first.layout.top;
  const height = sl.height - top;
  return (
    <figure className="notation notation-score">
      <div className="notation-scroll" tabIndex={0} role="group" aria-label="Score (scrolls sideways if wide)" aria-describedby={desc}>
        <svg viewBox={`-0.5 ${top} ${sl.width + 0.5} ${height}`} style={fit((sl.width + 0.5) * px)} role="img" aria-label={score.textAlternative} className="notation-svg fit">
          <line x1={0.2} x2={0.2} y1={yTop} y2={yBottom} strokeWidth={0.16} className="n-line" />
          {sl.staves.length === 2 ? (
            <text x={-0.4} y={yBottom} className="n-smufl n-glyph" fontSize={yBottom - yTop}>{G.brace}</text>
          ) : (
            <path d={`M1.2,${yTop - 0.6} Q0.6,${yTop - 0.2} 0.7,${yTop} L0.7,${yBottom} Q0.6,${yBottom + 0.2} 1.2,${yBottom + 0.6}`} className="n-bracket" fill="none" strokeWidth={0.5} />
          )}
          {sl.staves.map((s) => (
            <g key={s.id}>
              <StaveSvg layout={s.layout} offsetY={s.offset} highlight={highlight} px={px} />
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="notation-caption">Staves from the top: {score.staves.map((s) => s.label).join(", ")}</figcaption>
      <p id={desc} className="visually-hidden">{score.textAlternative}</p>
    </figure>
  );
}
