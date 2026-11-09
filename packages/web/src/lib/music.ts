/** Small presentation helpers. Musical answers are never decided here: grading is server-side. */

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

export interface ParsedPitch {
  step: string;
  alter: number;
  octave: number;
}

export function parsePitch(p: string): ParsedPitch {
  const m = /^([A-G])(bb|b|#|x|)(-?\d)$/.exec(p);
  if (!m) throw new Error(`Bad pitch ${p}`);
  const alter = m[2] === "#" ? 1 : m[2] === "x" ? 2 : m[2] === "b" ? -1 : m[2] === "bb" ? -2 : 0;
  return { step: m[1]!, alter, octave: Number(m[3]) };
}

/** Diatonic position: letters above C0. */
export const diatonic = (p: ParsedPitch) => p.octave * 7 + LETTERS.indexOf(p.step);
export const semitones = (p: ParsedPitch) => p.octave * 12 + STEP_SEMITONES[p.step]! + p.alter;
export const frequency = (p: ParsedPitch) => 440 * 2 ** ((semitones(p) - 57) / 12);
export const letterAt = (d: number) => LETTERS[((d % 7) + 7) % 7]!;
export const pitchAt = (d: number) => `${letterAt(d)}${Math.floor(d / 7)}`;

/** Diatonic index of the bottom line of the stave. */
export const BOTTOM_LINE = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 } as const;

export function ordinal(n: number) {
  return ["", "1st", "2nd", "3rd", "4th", "5th"][n] ?? `${n}th`;
}

/** "bottom line", "2nd space"… for a position index counted from the bottom line (0 = bottom line, 1 = first space). */
export function positionName(pos: number): string {
  if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? `${ordinal(pos / 2 + 1)} line` : `${ordinal((pos + 1) / 2)} space`;
  if (pos < 0) return pos % 2 === 0 ? `ledger line ${Math.abs(pos) / 2} below` : `space ${Math.ceil(Math.abs(pos) / 2)} below the stave`;
  return pos % 2 === 0 ? `ledger line ${(pos - 8) / 2} above` : `space ${Math.ceil((pos - 8) / 2)} above the stave`;
}
