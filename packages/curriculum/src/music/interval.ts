import { chromaticNumber, diatonicNumber, pitchFromNumbers, type Pitch } from "./pitch.ts";

export type IntervalQuality = "dd" | "d" | "m" | "M" | "P" | "A" | "AA";

export interface Interval {
  /** Interval number counted inclusively by letter names: 1 = unison, 8 = octave, 12 = compound 5th. */
  number: number;
  quality: IntervalQuality;
}

const PERFECT_CLASS = new Set([1, 4, 5]);
/** Semitones in the major/perfect form of each simple interval number (1..7). */
const BASE_SEMITONES: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

export function simpleNumber(n: number): number {
  return ((n - 1) % 7) + 1;
}

export function isCompound(n: number): boolean {
  return n > 8;
}

/** Quality of an interval from its number and semitone size. */
function qualityFor(number: number, semitones: number): IntervalQuality {
  const simple = simpleNumber(number);
  const octaves = Math.floor((number - 1) / 7);
  const diff = semitones - octaves * 12 - BASE_SEMITONES[simple]!;
  if (PERFECT_CLASS.has(simple)) {
    const map: Record<number, IntervalQuality> = { [-2]: "dd", [-1]: "d", 0: "P", 1: "A", 2: "AA" };
    const q = map[diff];
    if (!q) throw new Error(`Interval outside supported range (number ${number}, ${semitones} semitones)`);
    return q;
  }
  const map: Record<number, IntervalQuality> = { [-3]: "dd", [-2]: "d", [-1]: "m", 0: "M", 1: "A", 2: "AA" };
  const q = map[diff];
  if (!q) throw new Error(`Interval outside supported range (number ${number}, ${semitones} semitones)`);
  return q;
}

function semitonesFor(interval: Interval): number {
  const simple = simpleNumber(interval.number);
  const octaves = Math.floor((interval.number - 1) / 7);
  const base = BASE_SEMITONES[simple]! + octaves * 12;
  const perfect = PERFECT_CLASS.has(simple);
  const offset: Record<IntervalQuality, number> = perfect
    ? { dd: -2, d: -1, P: 0, A: 1, AA: 2, m: NaN, M: NaN }
    : { dd: -3, d: -2, m: -1, M: 0, A: 1, AA: 2, P: NaN };
  const o = offset[interval.quality];
  if (Number.isNaN(o)) {
    throw new Error(`Quality ${interval.quality} is not valid for a ${interval.number}`);
  }
  return base + o;
}

/** Interval between two written pitches (order-insensitive: measured from the lower note). */
export function intervalBetween(a: Pitch, b: Pitch): Interval {
  let lower = a;
  let upper = b;
  // Measure from the lower note. For a unison/octave spelling (same letter position), the lower note
  // is the one that sounds lower, so C#–C and C–C# are both an augmented 1st (never "diminished").
  const da = diatonicNumber(a);
  const db = diatonicNumber(b);
  if (db < da || (db === da && chromaticNumber(b) < chromaticNumber(a))) {
    lower = b;
    upper = a;
  }
  const number = diatonicNumber(upper) - diatonicNumber(lower) + 1;
  const semitones = chromaticNumber(upper) - chromaticNumber(lower);
  return { number, quality: qualityFor(number, semitones) };
}

export function transpose(p: Pitch, interval: Interval, direction: "up" | "down"): Pitch {
  const sign = direction === "up" ? 1 : -1;
  const diatonic = diatonicNumber(p) + sign * (interval.number - 1);
  const chromatic = chromaticNumber(p) + sign * semitonesFor(interval);
  return pitchFromNumbers(diatonic, chromatic);
}

const QUALITY_NAMES: Record<IntervalQuality, string> = {
  dd: "doubly diminished",
  d: "diminished",
  m: "minor",
  M: "major",
  P: "perfect",
  A: "augmented",
  AA: "doubly augmented",
};

export function ordinal(n: number): string {
  if (n === 8) return "octave";
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function describeInterval(i: Interval): string {
  return `${QUALITY_NAMES[i.quality]} ${ordinal(i.number)}`;
}

/** Parse shorthand such as "M3", "P5", "m3", "A4", "d5", "P12", "M2". */
export function parseInterval(text: string): Interval {
  const m = /^(dd|d|m|M|P|A|AA)(\d{1,2})$/.exec(text.trim());
  if (!m) throw new Error(`Cannot parse interval "${text}"`);
  const interval = { quality: m[1] as IntervalQuality, number: Number(m[2]) };
  if (interval.number < 1) throw new Error(`Interval number must be at least 1 (got "${text}")`);
  semitonesFor(interval); // validates quality/number combination
  return interval;
}
