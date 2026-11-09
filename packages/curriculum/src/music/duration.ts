/** Exact rational durations measured in semibreves (whole notes). */
export interface Fraction {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

export function frac(n: number, d = 1): Fraction {
  if (d === 0) throw new Error("Zero denominator");
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

export function equals(a: Fraction, b: Fraction): boolean {
  return a.n * b.d === b.n * a.d;
}

export const NOTE_VALUES = {
  breve: frac(2),
  semibreve: frac(1),
  minim: frac(1, 2),
  crotchet: frac(1, 4),
  quaver: frac(1, 8),
  semiquaver: frac(1, 16),
  demisemiquaver: frac(1, 32),
} as const;

export type NoteValue = keyof typeof NOTE_VALUES;

/** Duration of a (possibly dotted) value; each dot adds half of the previous addition. */
export function dotted(value: NoteValue, dots = 0): Fraction {
  let total = NOTE_VALUES[value];
  let addition = NOTE_VALUES[value];
  for (let i = 0; i < dots; i++) {
    addition = mul(addition, frac(1, 2));
    total = add(total, addition);
  }
  return total;
}

/** Duration of a tuplet member: `actual` notes in the time of `normal`. */
export function tupletMember(value: NoteValue, actual: number, normal: number): Fraction {
  return mul(NOTE_VALUES[value], frac(normal, actual));
}

export interface TimeSignature {
  top: number;
  bottom: number;
}

export function parseTimeSignature(text: string): TimeSignature {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(text.trim());
  if (!m) throw new Error(`Cannot parse time signature "${text}"`);
  const ts = { top: Number(m[1]), bottom: Number(m[2]) };
  if (![1, 2, 4, 8, 16, 32].includes(ts.bottom)) throw new Error(`Invalid lower figure in "${text}"`);
  return ts;
}

export function barCapacity(ts: TimeSignature): Fraction {
  return frac(ts.top, ts.bottom);
}

export type Metre = "simple" | "compound" | "irregular";
export type BeatCount = "duple" | "triple" | "quadruple" | "quintuple" | "septuple";

/**
 * Classify a time signature by the Grades 1–5 conventions: compound when the upper figure
 * is 6, 9 or 12; simple when 2, 3 or 4; irregular when 5 or 7.
 */
export function classifyTimeSignature(text: string): { metre: Metre; beats: BeatCount } {
  const ts = parseTimeSignature(text);
  const simple: Record<number, BeatCount> = { 2: "duple", 3: "triple", 4: "quadruple" };
  const compound: Record<number, BeatCount> = { 6: "duple", 9: "triple", 12: "quadruple" };
  const irregular: Record<number, BeatCount> = { 5: "quintuple", 7: "septuple" };
  if (simple[ts.top]) return { metre: "simple", beats: simple[ts.top]! };
  if (compound[ts.top]) return { metre: "compound", beats: compound[ts.top]! };
  if (irregular[ts.top]) return { metre: "irregular", beats: irregular[ts.top]! };
  throw new Error(`Time signature ${text} is outside the Grades 1–5 vocabulary`);
}
