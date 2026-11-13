/**
 * Rhythm and metre rules: beat structure, bar totals, beaming, rest grouping, ties and bar-lines.
 *
 * Everything is exact (`Fraction` of a semibreve). The rules encode the conventions a Grades 1–5
 * learner is taught and deliberately accept every convention-compliant alternative rather than one
 * "house" shape: a bar of quavers in 2/4 may be beamed in pairs or as one group of four, a silent
 * dotted-crotchet beat may be one dotted rest or a crotchet rest + quaver rest, and an irregular bar
 * is accepted under any of its standard sub-group patterns.
 *
 * Event shapes are structurally compatible with the curriculum `NotationEvent` schema, so authored
 * notation and learner answers are checked by the same functions.
 */
import {
  add,
  barCapacity,
  classifyTimeSignature,
  compare,
  dotted,
  equals,
  frac,
  isZero,
  lt,
  mul,
  NOTE_VALUES,
  parseTimeSignature,
  sub,
  valueFor,
  type BeatCount,
  type Fraction,
  type Metre,
  type NoteValue,
  type TimeSignature,
} from "./duration.ts";

export interface RDuration {
  value: NoteValue;
  dots?: number;
}
export interface RInner {
  kind: "note" | "chord" | "rest";
  duration: RDuration;
  tieToNext?: boolean;
  beam?: "begin" | "continue" | "end";
  wholeBar?: boolean;
  pitch?: string;
  notes?: Array<{ pitch: string }>;
}
export interface RTuplet {
  kind: "tuplet";
  actual: number;
  normal: number;
  events: RInner[];
}
export type REvent = RInner | RTuplet;

const BEAMABLE = new Set<NoteValue>(["quaver", "semiquaver", "demisemiquaver"]);
export const isBeamable = (e: RInner) => e.kind !== "rest" && BEAMABLE.has(e.duration.value);

// ---------------------------------------------------------------------------
// Metre structure
// ---------------------------------------------------------------------------

export interface MetreStructure {
  text: string;
  ts: TimeSignature;
  metre: Metre;
  beats: BeatCount;
  capacity: Fraction;
  /** The value counted as one beat (dotted in compound time; the lower-figure unit in irregular time). */
  beatUnit: Fraction;
  /** Lengths of the beat groups in order (irregular: the sub-group pattern, e.g. 3+2 quavers). */
  groups: Fraction[];
  /** Irregular metres: the sub-group pattern in lower-figure units. */
  pattern?: number[];
}

/** Standard sub-group patterns for irregular metres. */
export function irregularPatterns(top: number): number[][] {
  if (top === 5) return [[3, 2], [2, 3]];
  if (top === 7) return [[2, 2, 3], [3, 2, 2], [2, 3, 2]];
  return [];
}

/** One structure for simple and compound metres; one per standard sub-group pattern for irregular metres. */
export function metreStructures(text: string): MetreStructure[] {
  const ts = parseTimeSignature(text);
  const { metre, beats } = classifyTimeSignature(text);
  const unit = frac(1, ts.bottom);
  const capacity = barCapacity(ts);
  if (metre === "simple") {
    return [{ text, ts, metre, beats, capacity, beatUnit: unit, groups: Array.from({ length: ts.top }, () => unit) }];
  }
  if (metre === "compound") {
    const beat = mul(unit, frac(3));
    return [{ text, ts, metre, beats, capacity, beatUnit: beat, groups: Array.from({ length: ts.top / 3 }, () => beat) }];
  }
  return irregularPatterns(ts.top).map((pattern) => ({
    text,
    ts,
    metre,
    beats,
    capacity,
    beatUnit: unit,
    groups: pattern.map((n) => mul(unit, frac(n))),
    pattern,
  }));
}

export function metreStructure(text: string): MetreStructure {
  return metreStructures(text)[0]!;
}

/** Onsets of every beat group, including 0 and the bar end. */
export function beatBoundaries(m: MetreStructure): Fraction[] {
  const out = [frac(0)];
  for (const g of m.groups) out.push(add(out[out.length - 1]!, g));
  return out;
}

/** "three crotchet beats", "two dotted-crotchet beats", "five quavers grouped 3+2". */
export function describeMetre(m: MetreStructure): string {
  const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const name = (f: Fraction) => {
    const v = valueFor(f, 1);
    return v ? `${v.dots ? "dotted-" : ""}${v.value}` : `${f.n}/${f.d}`;
  };
  if (m.metre === "irregular") return `${words[m.ts.top]} ${name(m.beatUnit)}s grouped ${m.pattern!.join("+")}`;
  return `${words[m.groups.length]} ${name(m.beatUnit)} beat${m.groups.length === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface Timed {
  e: RInner;
  onset: Fraction;
  dur: Fraction;
  /** Index in the flattened event list. */
  index: number;
  /** Index of the containing tuplet among the bar's top-level events, if any. */
  tuplet?: number;
}

export function innerDuration(e: RInner, bar?: Fraction): Fraction {
  if (e.kind === "rest" && e.wholeBar) return bar ?? dotted(e.duration.value, e.duration.dots ?? 0);
  return dotted(e.duration.value, e.duration.dots ?? 0);
}

export function eventLength(e: REvent, bar?: Fraction): Fraction {
  if (e.kind === "tuplet") {
    const written = e.events.reduce((s, x) => add(s, innerDuration(x, bar)), frac(0));
    return mul(written, frac(e.normal, e.actual));
  }
  return innerDuration(e, bar);
}

export function totalLength(events: REvent[], bar?: Fraction): Fraction {
  return events.reduce((s, e) => add(s, eventLength(e, bar)), frac(0));
}

export function flatten(events: REvent[], bar?: Fraction): Timed[] {
  const out: Timed[] = [];
  let t = frac(0);
  events.forEach((e, top) => {
    if (e.kind === "tuplet") {
      let inner = t;
      for (const x of e.events) {
        const dur = mul(innerDuration(x, bar), frac(e.normal, e.actual));
        out.push({ e: x, onset: inner, dur, index: out.length, tuplet: top });
        inner = add(inner, dur);
      }
    } else {
      out.push({ e, onset: t, dur: innerDuration(e, bar), index: out.length });
    }
    t = add(t, eventLength(e, bar));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Bar checks
// ---------------------------------------------------------------------------

export type RhythmIssueCode =
  | "bar-overfull"
  | "bar-underfull"
  | "beam-across-middle"
  | "beam-hides-compound-beat"
  | "beam-crosses-beat"
  | "beam-on-unbeamable"
  | "beam-malformed"
  | "beat-not-beamed"
  | "rest-across-beat"
  | "half-bar-rest-misplaced"
  | "rests-not-combined"
  | "note-across-middle"
  | "note-hides-compound-beat"
  | "unnecessary-tie"
  | "tie-instead-of-dot"
  | "tuplet-total-wrong";

export interface RhythmIssue {
  code: RhythmIssueCode;
  /** Flattened event index the issue is anchored to. */
  at: number;
  message: string;
}

export interface BarCheckOptions {
  /** Report beamable notes within one beat that are not beamed together (grouping tasks). Default true. */
  requireBeams?: boolean;
  /** Report ties that could be one written value (default true). */
  checkTies?: boolean;
}

const within = (s: Fraction, e: Fraction, lo: Fraction, hi: Fraction) => compare(s, lo) >= 0 && compare(e, hi) <= 0;
const crosses = (s: Fraction, e: Fraction, b: Fraction) => lt(s, b) && lt(b, e);

function beamGroups(tl: Timed[]): { groups: Timed[][]; malformed: number[] } {
  const groups: Timed[][] = [];
  const malformed: number[] = [];
  let cur: Timed[] | null = null;
  for (const t of tl) {
    const b = t.e.beam;
    if (b === "begin") {
      if (cur) malformed.push(t.index);
      cur = [t];
    } else if (b === "continue" || b === "end") {
      if (!cur) {
        malformed.push(t.index);
        continue;
      }
      cur.push(t);
      if (b === "end") {
        groups.push(cur);
        cur = null;
      }
    } else if (cur && t.e.kind !== "rest") {
      malformed.push(t.index);
    }
  }
  if (cur) malformed.push(cur[0]!.index);
  return { groups, malformed };
}

/** Spans a single beam group may cover in this metre for notes no shorter than `shortest`. */
function beamSpans(m: MetreStructure, shortest: Fraction): Array<[Fraction, Fraction]> {
  const b = beatBoundaries(m);
  const spans: Array<[Fraction, Fraction]> = [];
  for (let i = 0; i + 1 < b.length; i++) spans.push([b[i]!, b[i + 1]!]);
  if (m.metre === "simple") {
    // Notes of half a beat (quavers in x/4, semiquavers in x/8) may be beamed across the whole bar in
    // duple and triple time, and across each half of the bar in quadruple time.
    const half = mul(m.beatUnit, frac(1, 2));
    if (compare(shortest, half) >= 0) {
      if (m.groups.length === 2 || m.groups.length === 3) spans.push([frac(0), m.capacity]);
      if (m.groups.length === 4) spans.push([frac(0), b[2]!], [b[2]!, m.capacity]);
    }
  }
  return spans;
}

/**
 * Check one bar (one voice) against the metre. Returns every issue found; an empty list means the bar is
 * correctly filled and grouped under the conventions taught at Grades 1–5.
 */
export function checkBar(events: REvent[], m: MetreStructure, opts: BarCheckOptions = {}): RhythmIssue[] {
  const requireBeams = opts.requireBeams ?? true;
  const checkTies = opts.checkTies ?? true;
  const issues: RhythmIssue[] = [];
  const push = (code: RhythmIssueCode, at: number, message: string) => issues.push({ code, at, message });
  const tl = flatten(events, m.capacity);
  const total = totalLength(events, m.capacity);
  const c = compare(total, m.capacity);
  if (c > 0) push("bar-overfull", tl.length - 1, "The bar holds more than the time signature allows.");
  if (c < 0) push("bar-underfull", Math.max(0, tl.length - 1), "The bar does not yet add up to the time signature.");

  const bounds = beatBoundaries(m);
  const inner = bounds.slice(1, -1);
  const middle = m.metre === "simple" && m.groups.length === 4 ? bounds[2]! : null;
  // Brief 07: a rest may fill half of a four-beat bar (beats 1-2 or 3-4) in compound quadruple time as well (12/8), as in 4/4.
  // Notes keep the stricter rule (only simple time has the "middle of the bar" note rule), so no existing note check changes.
  const restMiddle = m.metre !== "irregular" && m.groups.length === 4 ? bounds[2]! : null;
  const compoundLike = m.metre !== "simple";

  // Tuplet written totals.
  events.forEach((e) => {
    if (e.kind !== "tuplet") return;
    const written = e.events.reduce((s, x) => add(s, innerDuration(x)), frac(0));
    const unit = mul(written, frac(1, e.actual));
    const plain = (Object.values(NOTE_VALUES) as Fraction[]).some((v) => equals(v, unit));
    if (!plain) {
      const first = tl.find((t) => t.e === e.events[0]);
      push("tuplet-total-wrong", first?.index ?? 0, `The ${e.actual} notes of the group do not add up to ${e.actual} equal values.`);
    }
  });

  // Beams.
  const { groups, malformed } = beamGroups(tl);
  for (const i of malformed) push("beam-malformed", i, "A beam is opened or closed in the wrong place.");
  const groupOf = new Map<number, number>();
  groups.forEach((g, gi) => g.forEach((t) => groupOf.set(t.index, gi)));
  for (const g of groups) {
    const notes = g.filter((t) => t.e.kind !== "rest");
    const bad = notes.find((t) => !BEAMABLE.has(t.e.duration.value));
    if (bad) {
      push("beam-on-unbeamable", bad.index, `A ${bad.e.duration.value} cannot be beamed.`);
      continue;
    }
    const s = g[0]!.onset;
    const e = add(g[g.length - 1]!.onset, g[g.length - 1]!.dur);
    const shortest = notes.reduce((min, t) => (lt(t.dur, min) ? t.dur : min), m.capacity);
    const inTuplet = g.every((t) => t.tuplet !== undefined && t.tuplet === g[0]!.tuplet);
    const ok = inTuplet || beamSpans(m, shortest).some(([lo, hi]) => within(s, e, lo, hi));
    if (!ok) {
      if (middle && crosses(s, e, middle)) push("beam-across-middle", g[0]!.index, "The beam joins notes across the middle of the bar.");
      else if (compoundLike) push("beam-hides-compound-beat", g[0]!.index, "The beam runs across a beat, which hides where the beats are.");
      else push("beam-crosses-beat", g[0]!.index, "The beam joins notes from different beats.");
    }
  }
  if (requireBeams) {
    for (let i = 0; i + 1 < bounds.length; i++) {
      const [lo, hi] = [bounds[i]!, bounds[i + 1]!];
      const inBeat = tl.filter((t) => within(t.onset, add(t.onset, t.dur), lo, hi));
      // Runs of consecutive beamable notes inside one beat must share one beam (rests may break a run).
      let run: Timed[] = [];
      const flush = () => {
        for (let k = 0; k + 1 < run.length; k++) {
          const a = groupOf.get(run[k]!.index);
          const b = groupOf.get(run[k + 1]!.index);
          if (a === undefined || b === undefined || a !== b) {
            push("beat-not-beamed", run[k + 1]!.index, "Quavers (and shorter notes) inside one beat should be beamed together.");
            break;
          }
        }
        run = [];
      };
      let prev: Timed | null = null;
      for (const t of inBeat) {
        const contiguous = prev !== null && t.index === prev.index + 1;
        if (!contiguous) flush();
        if (isBeamable(t.e)) run.push(t);
        else flush();
        prev = t;
      }
      flush();
    }
  }

  // Rests.
  tl.forEach((t) => {
    if (t.e.kind !== "rest" || t.tuplet !== undefined) return;
    const end = add(t.onset, t.dur);
    if (t.e.wholeBar || (isZero(t.onset) && equals(t.dur, m.capacity))) return;
    const crossing = inner.filter((b) => crosses(t.onset, end, b));
    if (!crossing.length) return;
    if (restMiddle) {
      const halfBar = mul(m.capacity, frac(1, 2));
      const startsHalf = isZero(t.onset) || equals(t.onset, restMiddle);
      if (startsHalf && equals(t.dur, halfBar)) return; // a half-bar rest on beat 1 or 3
      if (crossing.some((b) => equals(b, restMiddle))) {
        push("half-bar-rest-misplaced", t.index, "A rest may cover half of a 4-beat bar only on beat 1 or beat 3.");
        return;
      }
    }
    push("rest-across-beat", t.index, "Each beat needs its own rest; a rest should not run across a beat.");
  });
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [lo, hi] = [bounds[i]!, bounds[i + 1]!];
    const inBeat = tl.filter((t) => t.tuplet === undefined && within(t.onset, add(t.onset, t.dur), lo, hi));
    if (!inBeat.length || !inBeat.every((t) => t.e.kind === "rest")) continue;
    if (inBeat.length < 2 || !equals(inBeat[0]!.onset, lo)) continue;
    const beatLen = sub(hi, lo);
    if (!valueFor(beatLen, 1)) continue;
    // Compound beats: crotchet rest + quaver rest is the accepted alternative to a dotted-crotchet rest.
    if (compoundLike && inBeat.length === 2 && equals(inBeat[0]!.dur, mul(beatLen, frac(2, 3))) && equals(inBeat[1]!.dur, mul(beatLen, frac(1, 3)))) continue;
    push("rests-not-combined", inBeat[1]!.index, "A whole beat of silence is written as a single rest.");
  }

  // Notes that hide the beat.
  tl.forEach((t) => {
    if (t.e.kind === "rest" || t.tuplet !== undefined) return;
    const end = add(t.onset, t.dur);
    if (middle && !isZero(t.onset) && crosses(t.onset, end, middle)) {
      push("note-across-middle", t.index, "A note starting after beat 1 should not run across the middle of the bar; use a tie.");
      return;
    }
    if (compoundLike) {
      const cross = inner.some((b) => crosses(t.onset, end, b));
      const onBeat = bounds.some((b) => equals(b, t.onset));
      const endsOnBeat = bounds.some((b) => equals(b, end));
      if (cross && !(onBeat && endsOnBeat)) push("note-hides-compound-beat", t.index, "This note runs across a beat without starting and ending on beats; tie it so each beat is visible.");
    }
  });

  // Ties that could be a single written value.
  if (checkTies) {
    for (let k = 0; k + 1 < tl.length; k++) {
      const a = tl[k]!;
      const b = tl[k + 1]!;
      if (a.e.kind === "rest" || !a.e.tieToNext || a.tuplet !== undefined || b.tuplet !== undefined) continue;
      const combined = add(a.dur, b.dur);
      const v = valueFor(combined, 2);
      if (!v) continue;
      const merged: RInner = { kind: a.e.kind, duration: { value: v.value, dots: v.dots }, ...(a.e.pitch ? { pitch: a.e.pitch } : {}) };
      const replaced: REvent[] = [];
      let idx = 0;
      for (const e of events) {
        if (e.kind === "tuplet") {
          replaced.push(e);
          idx += e.events.length;
          continue;
        }
        if (idx === a.index) replaced.push({ ...merged, ...(b.e.tieToNext ? { tieToNext: true } : {}) });
        else if (idx !== b.index) replaced.push(e);
        idx++;
      }
      const after = checkBar(replaced, m, { requireBeams: false, checkTies: false }).filter((x) => x.code === "note-across-middle" || x.code === "note-hides-compound-beat");
      if (after.length === 0) {
        push(v.dots ? "tie-instead-of-dot" : "unnecessary-tie", a.index, v.dots ? `These tied notes can be written as one dotted ${v.value}.` : `These tied notes can be written as one ${v.value}.`);
      }
    }
  }
  return issues;
}

/**
 * Check a bar under every structure the time signature allows (irregular metres have several sub-group
 * patterns) and return the best fit. A bar is correct when any standard pattern accepts it.
 */
export function checkBarAnyPattern(events: REvent[], text: string, opts: BarCheckOptions = {}): { structure: MetreStructure; issues: RhythmIssue[] } {
  let best: { structure: MetreStructure; issues: RhythmIssue[] } | null = null;
  for (const s of metreStructures(text)) {
    const issues = checkBar(events, s, opts);
    if (!best || issues.length < best.issues.length) best = { structure: s, issues };
  }
  return best!;
}

// ---------------------------------------------------------------------------
// Conventional beaming (for display and generated material)
// ---------------------------------------------------------------------------

const stripBeam = (e: RInner): RInner => {
  const { beam: _b, ...rest } = e;
  return rest;
};

/** Beam beamable notes beat by beat (always convention-compliant); tuplets are beamed as a group. */
export function autoBeam<E extends REvent>(events: E[], m: MetreStructure): E[] {
  const bounds = beatBoundaries(m);
  const tl = flatten(events, m.capacity);
  const beamOf = new Map<number, RInner["beam"]>();
  const mark = (run: Timed[]) => {
    if (run.length < 2) return;
    run.forEach((t, i) => beamOf.set(t.index, i === 0 ? "begin" : i === run.length - 1 ? "end" : "continue"));
  };
  // Tuplet groups.
  const tupletRuns = new Map<number, Timed[]>();
  for (const t of tl) if (t.tuplet !== undefined && isBeamable(t.e)) tupletRuns.set(t.tuplet, [...(tupletRuns.get(t.tuplet) ?? []), t]);
  for (const run of tupletRuns.values()) if (run.length === run[run.length - 1]!.index - run[0]!.index + 1) mark(run);
  for (let i = 0; i + 1 < bounds.length; i++) {
    let run: Timed[] = [];
    for (const t of tl) {
      if (t.tuplet !== undefined) {
        mark(run);
        run = [];
        continue;
      }
      const inBeat = within(t.onset, add(t.onset, t.dur), bounds[i]!, bounds[i + 1]!);
      if (inBeat && isBeamable(t.e)) run.push(t);
      else {
        mark(run);
        run = [];
      }
    }
    mark(run);
  }
  let idx = 0;
  return events.map((e) => {
    if (e.kind === "tuplet") {
      const evs = e.events.map((x) => {
        const b = beamOf.get(idx++);
        return b ? { ...stripBeam(x), beam: b } : stripBeam(x);
      });
      return { ...e, events: evs };
    }
    const b = beamOf.get(idx++);
    return (b ? { ...stripBeam(e as RInner), beam: b } : stripBeam(e as RInner)) as E;
  });
}

// ---------------------------------------------------------------------------
// Bar-lines
// ---------------------------------------------------------------------------

/**
 * Positions (event counts) after which bar-lines fall when `events` are written in `text` time, or null when
 * an event would straddle a bar-line (the sequence cannot be barred without ties).
 */
export function barlinePositions(events: REvent[], text: string): number[] | null {
  const cap = barCapacity(parseTimeSignature(text));
  const out: number[] = [];
  let t = frac(0);
  for (let i = 0; i < events.length; i++) {
    t = add(t, eventLength(events[i]!));
    const c = compare(t, cap);
    if (c > 0) return null;
    if (c === 0) {
      out.push(i + 1);
      t = frac(0);
    }
  }
  if (!isZero(t)) return null;
  return out;
}

/** Split a flat sequence into bars at the given positions. */
export function splitAt<E>(events: E[], positions: number[]): E[][] {
  const bars: E[][] = [];
  let start = 0;
  for (const p of positions) {
    bars.push(events.slice(start, p));
    start = p;
  }
  if (start < events.length) bars.push(events.slice(start));
  return bars;
}

/**
 * Ties that end nowhere: a tied note must be followed, in the same voice, by another note (possibly at the start of
 * the next bar). A tie into a rest, or from the very last note of the passage, is a notation error.
 * Returns the indices (in the flattened passage) of the offending tied notes.
 */
export function danglingTies(bars: REvent[][]): number[] {
  const flat = bars.flatMap((b) => b.flatMap((e) => (e.kind === "tuplet" ? e.events : [e as RInner])));
  const out: number[] = [];
  flat.forEach((e, i) => {
    if (e.kind === "rest" || !e.tieToNext) return;
    const next = flat[i + 1];
    if (!next || next.kind === "rest") out.push(i);
  });
  return out;
}
