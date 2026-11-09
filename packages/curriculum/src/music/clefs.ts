import { diatonicNumber, parsePitch, STEPS, type Pitch } from "./pitch.ts";

export type Clef = "treble" | "bass" | "alto" | "tenor";

/** Pitch on the bottom line of the stave for each clef. */
const BOTTOM_LINE: Record<Clef, string> = { treble: "E4", bass: "G2", alto: "F3", tenor: "D3" };

/**
 * Staff position: 0 = bottom line, 1 = bottom space, 2 = second line ... 8 = top line.
 * Negative values are below the stave; values above 8 are above it.
 */
export function staffPosition(clef: Clef, p: Pitch): number {
  return diatonicNumber(p) - diatonicNumber(parsePitch(BOTTOM_LINE[clef]));
}

/** Natural (unaltered) pitch shown at a staff position; accidentals/key signature are applied separately. */
export function naturalAt(clef: Clef, position: number): Pitch {
  const d = diatonicNumber(parsePitch(BOTTOM_LINE[clef])) + position;
  return { step: STEPS[((d % 7) + 7) % 7]!, alter: 0, octave: Math.floor(d / 7) };
}

/** Number of ledger lines needed to write the pitch in the clef. */
export function ledgerLines(clef: Clef, p: Pitch): number {
  const pos = staffPosition(clef, p);
  if (pos < 0) return Math.floor(-pos / 2);
  if (pos > 8) return Math.floor((pos - 8) / 2);
  return 0;
}

export function isOnLine(position: number): boolean {
  return position % 2 === 0;
}
