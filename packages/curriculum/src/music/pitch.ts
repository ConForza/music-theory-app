/**
 * Written-pitch model. A pitch is a spelt note: letter (step), alteration and octave.
 * Scientific octave numbering: middle C = C4.
 *
 * This module is the curriculum validator's *reference* rule set. It is deliberately small
 * and pure so that Brief 03's exercise engine can adopt or replace it without changing
 * curriculum data. It never collapses spelling to a semitone number unless asked to.
 */

export const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Step = (typeof STEPS)[number];

/** Semitones above C for each natural step. */
const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface PitchClass {
  step: Step;
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp. */
  alter: number;
}

export interface Pitch extends PitchClass {
  octave: number;
}

const ACCIDENTAL_TOKENS: Array<[string, number]> = [
  ["bb", -2],
  ["𝄫", -2],
  ["x", 2],
  ["##", 2],
  ["𝄪", 2],
  ["#", 1],
  ["♯", 1],
  ["b", -1],
  ["♭", -1],
  ["n", 0],
  ["♮", 0],
  ["", 0],
];

function parseAccidental(token: string): number {
  for (const [t, alter] of ACCIDENTAL_TOKENS) {
    if (t === token) return alter;
  }
  throw new Error(`Unknown accidental "${token}"`);
}

const PITCH_CLASS_RE = /^([A-Ga-g])(bb|𝄫|x|##|𝄪|#|♯|b|♭|n|♮)?$/u;
const PITCH_RE = /^([A-Ga-g])(bb|𝄫|x|##|𝄪|#|♯|b|♭|n|♮)?(-?\d)$/u;

export function parsePitchClass(text: string): PitchClass {
  const m = PITCH_CLASS_RE.exec(text.trim());
  if (!m) throw new Error(`Cannot parse pitch class "${text}"`);
  return { step: m[1]!.toUpperCase() as Step, alter: parseAccidental(m[2] ?? "") };
}

export function parsePitch(text: string): Pitch {
  const m = PITCH_RE.exec(text.trim());
  if (!m) throw new Error(`Cannot parse pitch "${text}" (expected e.g. C4, F#5, Bb3, Fx4, Ebb4)`);
  return {
    step: m[1]!.toUpperCase() as Step,
    alter: parseAccidental(m[2] ?? ""),
    octave: Number(m[3]),
  };
}

export function isPitch(text: string): boolean {
  return PITCH_RE.test(text.trim());
}

export function accidentalText(alter: number): string {
  switch (alter) {
    case -2:
      return "bb";
    case -1:
      return "b";
    case 0:
      return "";
    case 1:
      return "#";
    case 2:
      return "x";
    default:
      throw new Error(`Alteration ${alter} is outside the Grade 1–5 range (-2..2)`);
  }
}

export function formatPitchClass(pc: PitchClass): string {
  return `${pc.step}${accidentalText(pc.alter)}`;
}

export function formatPitch(p: Pitch): string {
  return `${formatPitchClass(p)}${p.octave}`;
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

/** Number of diatonic (letter-name) steps above C0. Spelling-sensitive. */
export function diatonicNumber(p: Pitch): number {
  return p.octave * 7 + stepIndex(p.step);
}

/** Semitones above C0. Spelling-insensitive (B#3 and C4 are equal). */
export function chromaticNumber(p: Pitch): number {
  return p.octave * 12 + STEP_SEMITONES[p.step] + p.alter;
}

export function naturalSemitones(step: Step): number {
  return STEP_SEMITONES[step];
}

/** Same spelling (letter and alteration), ignoring octave. */
export function samePitchClassSpelling(a: PitchClass, b: PitchClass): boolean {
  return a.step === b.step && a.alter === b.alter;
}

/** Same written pitch: letter, alteration and octave. */
export function samePitch(a: Pitch, b: Pitch): boolean {
  return samePitchClassSpelling(a, b) && a.octave === b.octave;
}

/** Enharmonic equivalence: same sounding pitch, any spelling. */
export function enharmonic(a: Pitch, b: Pitch): boolean {
  return chromaticNumber(a) === chromaticNumber(b);
}

/** Build a pitch from a diatonic number and a required chromatic number (for spelling-preserving transposition). */
export function pitchFromNumbers(diatonic: number, chromatic: number): Pitch {
  const octave = Math.floor(diatonic / 7);
  const step = STEPS[((diatonic % 7) + 7) % 7]!;
  const natural = octave * 12 + STEP_SEMITONES[step];
  return { step, alter: chromatic - natural, octave };
}
