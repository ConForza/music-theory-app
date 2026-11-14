/**
 * Ornament signs (rules.ornament.signs): the six ornaments taught by Grade 5, how each is played, and the
 * classification of a written-out figure by its pattern of letter-name steps around the main note.
 */
import { diatonicNumber, type Pitch } from "./pitch.ts";
import { dotted, type NoteValue } from "./duration.ts";

export const ORNAMENTS = ["trill", "turn", "upper-mordent", "lower-mordent", "acciaccatura", "appoggiatura"] as const;
export type Ornament = (typeof ORNAMENTS)[number];

export const ORNAMENT_INFO: Record<Ornament, { name: string; played: string }> = {
  trill: { name: "trill", played: "rapid alternation of the main note and the note above, for the length of the note" },
  turn: { name: "turn", played: "the note above, the main note, the note below, then the main note" },
  "upper-mordent": { name: "upper mordent", played: "main note, the note above, main note, quickly" },
  "lower-mordent": { name: "lower mordent", played: "main note, the note below, main note, quickly" },
  acciaccatura: { name: "acciaccatura", played: "a crushed grace note squeezed in just before the main note" },
  appoggiatura: { name: "appoggiatura", played: "a leaning grace note that takes time from the main note" },
};

/** Patterns that are near-misses of a real ornament, used to name the learner's likely confusion. */
export type OrnamentShape = Ornament | "inverted-turn" | null;

/** Classify a written-out figure (steps measured in letter names from the main note). */
export function classifyOrnamentFigure(main: Pitch, figure: Pitch[]): OrnamentShape {
  const steps = figure.map((p) => diatonicNumber(p) - diatonicNumber(main));
  const is = (pattern: number[]) => steps.length === pattern.length && steps.every((s, i) => s === pattern[i]);
  if (is([0, 1, 0])) return "upper-mordent";
  if (is([0, -1, 0])) return "lower-mordent";
  if (is([1, 0, -1, 0]) || is([0, 1, 0, -1, 0])) return "turn";
  if (is([-1, 0, 1, 0]) || is([0, -1, 0, 1, 0])) return "inverted-turn";
  const core = steps.slice(-2).join() === "-1,0" ? steps.slice(0, -2) : steps;
  if (core.length >= 4 && core.every((s, i) => s === (core[0] === 1 ? (i % 2 === 0 ? 1 : 0) : i % 2 === 0 ? 0 : 1))) return "trill";
  return null;
}

/** The written length of one note of a written-out figure. */
export interface FigureValue {
  value: NoteValue;
  dots?: number;
}

/**
 * Classify a written-out figure from its pitches AND its note values. Two notes, a step apart, the second on the main note, are told apart by
 * length (First Steps, Grade 5 section 14): an appoggiatura takes half the main note's value, so the two notes are equal; an acciaccatura is
 * a very short note (a semiquaver or less) before a main note at least three times as long. Any other pair of notes is not an ornament.
 * Without values only the pitch patterns of `classifyOrnamentFigure` are recognised.
 */
export function classifyWrittenOut(main: Pitch, figure: Pitch[], values?: FigureValue[]): OrnamentShape {
  if (figure.length !== 2) return classifyOrnamentFigure(main, figure);
  if (!values || values.length !== 2) return null;
  const [grace, target] = figure as [Pitch, Pitch];
  if (diatonicNumber(target) !== diatonicNumber(main) || target.alter !== main.alter) return null;
  if (Math.abs(diatonicNumber(grace) - diatonicNumber(main)) !== 1) return null;
  const a = dotted(values[0]!.value, values[0]!.dots ?? 0);
  const b = dotted(values[1]!.value, values[1]!.dots ?? 0);
  if (a.n * b.d === b.n * a.d) return "appoggiatura";
  if (a.n * 16 <= a.d && b.n * a.d >= 3 * a.n * b.d) return "acciaccatura";
  return null;
}
