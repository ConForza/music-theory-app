/**
 * Rhythm answer editors. Durations are exact (fractions of a semibreve, from the shared rules); the bar
 * meter says precisely what is left. Beaming in the bar builder follows the beats automatically, so the
 * learner concentrates on values; grouping is edited directly only in grouping tasks.
 */
import { useState } from "react";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import type { NotationEvent, NotationFragment } from "@mtp/curriculum";
import { Notation } from "../notation/Notation";
import { G, restGlyph } from "../notation/glyphs";
import { music } from "../../lib/music";

type Rhythm = Extract<LearnerResponse, { kind: "rhythm" }>;
type REv = Rhythm["measures"][number]["events"][number];
type Inner = Exclude<REv, { kind: "tuplet" }>;
const NOTE_GLYPH: Record<music.NoteValue, string> = { breve: "", semibreve: "", minim: "", crotchet: "", quaver: "", semiquaver: "", demisemiquaver: "" };
const glyphFor = (e: Inner) => (e.kind === "rest" ? restGlyph(e.duration.value).ch : NOTE_GLYPH[e.duration.value]) + (e.duration.dots ? " " + G.dot.repeat(e.duration.dots) : "");
const words = (e: Inner) => `${e.duration.dots === 2 ? "double-dotted " : e.duration.dots ? "dotted " : ""}${e.duration.value}${e.kind === "rest" ? " rest" : ""}${e.kind === "note" && e.tieToNext ? " tied" : ""}`;

/** Shapes → displayable notation (one display pitch: rhythm is unpitched). */
export function rhythmFragment(bars: REv[][], ts: string | null, finalBar = true): NotationFragment {
  const toEv = (e: REv): NotationEvent =>
    e.kind === "tuplet"
      ? ({ kind: "tuplet", actual: e.actual, normal: e.normal, events: e.events.map(toEv) } as NotationEvent)
      : e.kind === "rest"
        ? ({ kind: "rest", duration: { value: e.duration.value, dots: e.duration.dots ?? 0 }, ...(e.beam ? { beam: e.beam } : {}), ...(e.wholeBar ? { wholeBar: true } : {}) } as NotationEvent)
        : ({ kind: "note", pitch: "B4", duration: { value: e.duration.value, dots: e.duration.dots ?? 0 }, ...(e.beam ? { beam: e.beam } : {}), ...(e.tieToNext ? { tieToNext: true } : {}) } as NotationEvent);
  const measures = bars.map((b, i) => ({ events: b.map(toEv), ...(finalBar && i === bars.length - 1 && bars.length > 0 ? { barline: "final" as const } : {}) }));
  return {
    presentation: "rhythm-line",
    clef: "treble",
    showKeySignature: false,
    ...(ts ? { timeSignature: ts } : {}),
    measures: measures.length && measures.some((m) => m.events.length) ? measures : [{ events: [] as NotationEvent[] }],
    textAlternative: bars.map((b, i) => `Bar ${i + 1}: ${b.length ? b.map((e) => (e.kind === "tuplet" ? `${e.actual === 3 ? "triplet" : e.actual === 2 ? "duplet" : `group of ${e.actual}`} (${e.events.map(words).join(", ")})` : words(e))).join(", ") : "empty"}.`).join(" "),
  } as NotationFragment;
}

function beamBar(evs: REv[], ts: string | null): REv[] {
  if (!ts) return evs;
  try {
    return music.autoBeam(evs as unknown as music.REvent[], music.metreStructure(ts)) as unknown as REv[];
  } catch {
    return evs;
  }
}

function remaining(evs: REv[], ts: string | null, target?: [number, number]): { text: string; state: "under" | "full" | "over" } {
  const total = music.totalLength(evs as unknown as music.REvent[]);
  const cap = target ? music.frac(target[0], target[1]) : ts ? music.barCapacity(music.parseTimeSignature(ts)) : null;
  if (!cap) return { text: "", state: "under" };
  const c = music.compare(total, cap);
  const amount = (f: music.Fraction) => {
    const v = music.valueFor(f, 2);
    if (v) return `a ${v.dots === 2 ? "double-dotted " : v.dots ? "dotted " : ""}${v.value}`;
    const q = music.mul(f, music.frac(16));
    return q.d === 1 ? `${q.n} semiquavers' worth` : `${music.formatFraction(f)} of a semibreve`;
  };
  if (c === 0) return { text: target ? "Exactly the right length." : "The bar is full.", state: "full" };
  if (c < 0) return { text: `Still needed: ${amount(music.sub(cap, total))}.`, state: "under" };
  return { text: `Too long by ${amount(music.sub(total, cap))}.`, state: "over" };
}

export function RhythmBuilder({ input, value, onChange, disabled }: { input: Extract<ItemInput, { kind: "rhythm-builder" }>; value: Rhythm | null; onChange: (r: Rhythm | null) => void; disabled: boolean }) {
  const given = input.given as unknown as REv[];
  const bars: REv[][] = value?.measures.map((m) => m.events) ?? Array.from({ length: input.bars }, (_, i) => (i === 0 ? [...given] : []));
  const [active, setActive] = useState(0);
  const [rest, setRest] = useState(false);
  const [dots, setDots] = useState(0);
  const [tuplet, setTuplet] = useState<{ actual: number; normal: number } | null>(null);
  const ts = input.timeSignature;
  const bar = bars[active] ?? [];
  const lastTop = bar[bar.length - 1];
  const openTuplet = lastTop?.kind === "tuplet" && lastTop.events.length < lastTop.actual ? lastTop : null;
  const lockedCount = active === 0 ? given.length : 0;

  const emit = (next: REv[][]) => {
    const shaped = next.map((b) => beamBar(b.map(strip), ts));
    onChange(shaped.some((b) => b.length > lockedCountOf(shaped, b)) || shaped.some((b, i) => b.length && (i > 0 || !given.length)) ? { kind: "rhythm", measures: shaped.map((events) => ({ events: events.length ? events : [] })) as Rhythm["measures"] } : null);
  };
  const lockedCountOf = (all: REv[][], b: REv[]) => (all.indexOf(b) === 0 ? given.length : 0);
  const add = (v: music.NoteValue) => {
    const ev: Inner = { kind: rest ? "rest" : "note", duration: { value: v, dots } } as Inner;
    const next = bars.map((b) => [...b]);
    const cur = next[active]!;
    if (openTuplet) {
      const t = { ...openTuplet, events: [...openTuplet.events, ev] };
      cur[cur.length - 1] = t as REv;
    } else if (tuplet) {
      cur.push({ kind: "tuplet", actual: tuplet.actual, normal: tuplet.normal, events: [ev] } as REv);
      setTuplet(null);
    } else cur.push(ev);
    setDots(0);
    emit(next);
  };
  const undo = () => {
    const next = bars.map((b) => [...b]);
    const cur = next[active]!;
    if (cur.length <= lockedCount) return;
    const last = cur[cur.length - 1]!;
    if (last.kind === "tuplet" && last.events.length > 1) cur[cur.length - 1] = { ...last, events: last.events.slice(0, -1) } as REv;
    else cur.pop();
    emit(next);
  };
  const tieLast = () => {
    const next = bars.map((b) => [...b]);
    const cur = next[active]!;
    const last = cur[cur.length - 1];
    if (!last || last.kind !== "note" || cur.length <= lockedCount) return;
    cur[cur.length - 1] = { ...last, tieToNext: !last.tieToNext };
    emit(next);
  };
  const clear = () => emit(bars.map((b, i) => (i === 0 ? b.slice(0, given.length) : [])));
  const meter = remaining(bar, ts, input.mode === "equivalent-value" ? input.target : undefined);
  const display = rhythmFragment(bars.map((b) => beamBar(b.map(strip), ts)), ts, input.mode !== "equivalent-value");

  return (
    <div className="rhythm-builder">
      <Notation fragment={display} size="large" describe={false} />
      <p className={`bar-meter is-${meter.state}`} aria-live="polite"><span aria-hidden="true">{meter.state === "full" ? "✓ " : meter.state === "over" ? "! " : ""}</span>{input.bars > 1 ? `Bar ${active + 1}: ` : ""}{meter.text} <span className="visually-hidden">{display.textAlternative}</span></p>
      {input.bars > 1 && (
        <div className="bar-tabs" role="group" aria-label="Choose the bar to edit">
          {bars.map((_, i) => <button key={i} type="button" className={`btn btn-small ${i === active ? "btn-primary" : "btn-quiet"}`} aria-pressed={i === active} onClick={() => setActive(i)} disabled={disabled}>Bar {i + 1}</button>)}
        </div>
      )}
      <div className="palette" role="group" aria-label={rest ? "Add a rest" : "Add a note"}>
        {input.values.map((v) => (
          <button key={v} type="button" className="palette-btn" onClick={() => add(v)} disabled={disabled} aria-label={`Add a ${dots === 2 ? "double-dotted " : dots ? "dotted " : ""}${v}${rest ? " rest" : ""}`}>
            <span className="smufl-inline" aria-hidden="true">{rest ? restGlyph(v).ch : NOTE_GLYPH[v]}{dots ? G.dot.repeat(dots) : ""}</span>
            <span className="palette-name">{v}</span>
          </button>
        ))}
      </div>
      <div className="palette-tools" role="group" aria-label="Note options">
        {input.rests && <button type="button" className={`btn btn-small ${rest ? "btn-primary" : "btn-quiet"}`} aria-pressed={rest} onClick={() => setRest((x) => !x)} disabled={disabled}>{rest ? "Adding rests" : "Rests"}</button>}
        {input.maxDots > 0 && <button type="button" className={`btn btn-small ${dots ? "btn-primary" : "btn-quiet"}`} aria-pressed={dots > 0} onClick={() => setDots((d) => (d + 1) % (input.maxDots + 1))} disabled={disabled}>{dots === 2 ? "Double dot" : dots ? "Dot" : "Add a dot"}</button>}
        {input.ties && <button type="button" className="btn btn-small btn-quiet" onClick={tieLast} disabled={disabled || !lastTop || lastTop.kind !== "note" || bar.length <= lockedCount}>{lastTop?.kind === "note" && lastTop.tieToNext ? "Remove tie" : "Tie last note to next"}</button>}
        {input.tuplets.map((t) => (
          <button key={`${t.actual}:${t.normal}`} type="button" className={`btn btn-small ${tuplet?.actual === t.actual ? "btn-primary" : "btn-quiet"}`} aria-pressed={tuplet?.actual === t.actual} onClick={() => setTuplet(tuplet?.actual === t.actual ? null : t)} disabled={disabled || Boolean(openTuplet)}>
            {t.actual === 3 && t.normal === 2 ? "Triplet" : t.actual === 2 && t.normal === 3 ? "Duplet" : `${t.actual} in the time of ${t.normal}`}
          </button>
        ))}
        <button type="button" className="btn btn-small btn-quiet" onClick={undo} disabled={disabled || bar.length <= lockedCount}>Undo</button>
        <button type="button" className="btn btn-small btn-quiet" onClick={clear} disabled={disabled || bars.every((b, i) => b.length <= (i === 0 ? given.length : 0))}>Clear</button>
      </div>
      {openTuplet && <p className="hint-line" aria-live="polite">Adding to the {openTuplet.actual === 3 ? "triplet" : "group"}: {openTuplet.events.length} of {openTuplet.actual} notes.</p>}
      {tuplet && !openTuplet && <p className="hint-line" aria-live="polite">The next notes you add form a {tuplet.actual === 3 ? "triplet" : tuplet.actual === 2 ? "duplet" : "group"} of {tuplet.actual}.</p>}
    </div>
  );
}

function strip(e: REv): REv {
  if (e.kind === "tuplet") return { ...e, events: e.events.map((x) => strip(x) as never) } as REv;
  const { beam: _b, ...rest } = e as Inner;
  return rest as REv;
}

const BEAMABLE = new Set(["quaver", "semiquaver", "demisemiquaver"]);
/** Beam editing: the learner joins or separates neighbouring quavers (and shorter notes). */
export function GroupingEditor({ input, value, onChange, disabled }: { input: Extract<ItemInput, { kind: "rhythm-grouping" }>; value: Rhythm | null; onChange: (r: Rhythm | null) => void; disabled: boolean }) {
  const base = input.measures.map((m) => m.events as unknown as REv[]);
  const joinsFrom = (bars: REv[][]) => bars.map((b) => b.map((e, i) => i + 1 < b.length && e.kind !== "tuplet" && b[i + 1]!.kind !== "tuplet" && Boolean((e as Inner).beam) && (e as Inner).beam !== "end"));
  const joins = value ? joinsFrom(value.measures.map((m) => m.events)) : base.map((b) => b.map(() => false));
  const build = (j: boolean[][]): REv[][] =>
    base.map((b, bi) =>
      b.map((e, i) => {
        if (e.kind === "tuplet") return e;
        const left = i > 0 && j[bi]![i - 1];
        const right = j[bi]![i];
        const beam = left && right ? "continue" : right ? "begin" : left ? "end" : undefined;
        return { ...(e as Inner), ...(beam ? { beam } : {}) } as REv;
      }),
    );
  const toggle = (bi: number, i: number) => {
    const j = joins.map((r) => [...r]);
    j[bi]![i] = !j[bi]![i];
    onChange({ kind: "rhythm", measures: build(j).map((events) => ({ events })) as Rhythm["measures"] });
  };
  const bars = build(joins);
  const display = rhythmFragment(bars, input.timeSignature);
  let counter = 0;
  return (
    <div className="grouping-editor">
      <Notation fragment={display} size="large" describe={false} />
      <p className="visually-hidden" aria-live="polite">{display.textAlternative}</p>
      {base.map((b, bi) => (
        <div key={bi} className="join-row" role="group" aria-label={`Bar ${bi + 1}: join or separate neighbouring notes`}>
          {b.map((e, i) => {
            const n = ++counter;
            const canJoin = i + 1 < b.length && e.kind === "note" && b[i + 1]!.kind === "note" && BEAMABLE.has((e as Inner).duration.value) && BEAMABLE.has((b[i + 1] as Inner).duration.value);
            return (
              <span key={i} className="join-cell">
                <span className="join-note" aria-hidden="true"><span className="smufl-inline">{e.kind === "tuplet" ? "3" : glyphFor(e as Inner)}</span></span>
                {canJoin && (
                  <button type="button" className={`join-btn${joins[bi]![i] ? " is-joined" : ""}`} aria-pressed={joins[bi]![i]} onClick={() => toggle(bi, i)} disabled={disabled} aria-label={`Beam note ${n} to note ${n + 1}`}>
                    <span aria-hidden="true">{joins[bi]![i] ? "━" : "┆"}</span>
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ))}
      <p className="hint-line">Tap between two notes to beam them together; tap again to separate them.</p>
    </div>
  );
}

/** Bar-line placement: tap the gap after a note to put a bar-line there. */
export function BarlineEditor({ input, value, onChange, disabled }: { input: Extract<ItemInput, { kind: "barlines" }>; value: Extract<LearnerResponse, { kind: "barlines" }> | null; onChange: (r: Extract<LearnerResponse, { kind: "barlines" }> | null) => void; disabled: boolean }) {
  const events = input.events as unknown as REv[];
  const after = new Set(value?.after ?? []);
  const final = value?.final ?? false;
  const emit = (a: Set<number>, f: boolean) => onChange({ kind: "barlines", after: [...a].sort((x, y) => x - y), final: f });
  const bars = music.splitAt(events, [...after].sort((x, y) => x - y));
  const display = rhythmFragment(bars.map((b) => beamBar(b, null)), input.timeSignature, false);
  if (final && display.measures.length) display.measures[display.measures.length - 1]!.barline = "final";
  return (
    <div className="barline-editor">
      <Notation fragment={display} size="large" describe={false} />
      <div className="join-row" role="group" aria-label="Place bar-lines">
        {events.map((e, i) => (
          <span key={i} className="join-cell">
            <span className="join-note" aria-hidden="true"><span className="smufl-inline">{e.kind === "tuplet" ? "3" : glyphFor(e as Inner)}</span></span>
            {i < events.length - 1 && (
              <button type="button" className={`join-btn bar-btn${after.has(i + 1) ? " is-joined" : ""}`} aria-pressed={after.has(i + 1)} onClick={() => { const a = new Set(after); if (a.has(i + 1)) a.delete(i + 1); else a.add(i + 1); emit(a, final); }} disabled={disabled} aria-label={`Bar-line after note ${i + 1} (${e.kind === "tuplet" ? "triplet" : words(e as Inner)})`}>
                <span aria-hidden="true">{after.has(i + 1) ? "┃" : "·"}</span>
              </button>
            )}
          </span>
        ))}
      </div>
      {input.final && (
        <label className="check-row">
          <input type="checkbox" checked={final} onChange={(e) => emit(after, e.target.checked)} disabled={disabled} />
          <span>End with a double bar-line</span>
        </label>
      )}
      <p className="hint-line" aria-live="polite">{after.size ? `${after.size} bar-line${after.size === 1 ? "" : "s"} placed in ${input.timeSignature}.` : `Count the beats of ${input.timeSignature} and tap the gaps where each bar ends.`}</p>
    </div>
  );
}
