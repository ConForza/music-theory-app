import {
  formatPitchClass,
  parsePitchClass,
  stepIndex,
  STEPS,
  type PitchClass,
  type Step,
} from "./pitch.ts";

export type Mode = "major" | "minor";
export type MinorForm = "harmonic" | "melodic";
export type ScaleForm = "major" | "harmonic" | "melodic-ascending" | "melodic-descending" | "natural";

export interface Key {
  tonic: PitchClass;
  mode: Mode;
}

const SHARP_ORDER: Step[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: Step[] = ["B", "E", "A", "D", "G", "C", "F"];
/** Position on the circle of fifths for natural steps, relative to C. */
const STEP_FIFTHS: Record<Step, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };

export function parseKey(text: string): Key {
  const m = /^\s*([A-G](?:#|b)?)\s+(major|minor)\s*$/.exec(text);
  if (!m) throw new Error(`Cannot parse key "${text}" (expected e.g. "F# major", "Bb minor")`);
  return { tonic: parsePitchClass(m[1]!), mode: m[2] as Mode };
}

export function formatKey(key: Key): string {
  return `${formatPitchClass(key.tonic)} ${key.mode}`;
}

/** Signed number of sharps (+) or flats (-) in the key signature. */
export function keyFifths(key: Key): number {
  const tonicFifths = STEP_FIFTHS[key.tonic.step] + 7 * key.tonic.alter;
  return key.mode === "major" ? tonicFifths : tonicFifths - 3;
}

export interface KeySignature {
  type: "none" | "sharps" | "flats";
  count: number;
  /** Accidentals in the conventional written order, e.g. ["F#", "C#"]. */
  accidentals: string[];
}

export function keySignature(key: Key): KeySignature {
  const fifths = keyFifths(key);
  if (Math.abs(fifths) > 7) throw new Error(`${formatKey(key)} needs more than seven sharps or flats`);
  if (fifths === 0) return { type: "none", count: 0, accidentals: [] };
  if (fifths > 0) {
    return { type: "sharps", count: fifths, accidentals: SHARP_ORDER.slice(0, fifths).map((s) => `${s}#`) };
  }
  return { type: "flats", count: -fifths, accidentals: FLAT_ORDER.slice(0, -fifths).map((s) => `${s}b`) };
}

/** Alteration that the key signature applies to a given letter. */
export function signatureAlter(key: Key, step: Step): number {
  const sig = keySignature(key);
  if (sig.type === "sharps" && SHARP_ORDER.slice(0, sig.count).includes(step)) return 1;
  if (sig.type === "flats" && FLAT_ORDER.slice(0, sig.count).includes(step)) return -1;
  return 0;
}

export function relativeKey(key: Key): Key {
  const fifths = keyFifths(key);
  const mode: Mode = key.mode === "major" ? "minor" : "major";
  // The relative key shares the signature: find the tonic a minor 3rd below (major→minor) or above.
  const tonicStepOffset = key.mode === "major" ? -2 : 2;
  const step = STEPS[(stepIndex(key.tonic.step) + tonicStepOffset + 7) % 7]!;
  const candidate: Key = { tonic: { step, alter: 0 }, mode };
  candidate.tonic.alter = signatureAlter({ tonic: key.tonic, mode: key.mode }, step);
  if (keyFifths(candidate) !== fifths) throw new Error(`Internal error computing relative of ${formatKey(key)}`);
  return candidate;
}

/**
 * One octave of a scale as spelt pitch classes, tonic to tonic (8 notes), in ascending
 * order for every form except "melodic-descending", which is returned descending.
 */
export function scale(key: Key, form: ScaleForm): PitchClass[] {
  if (key.mode === "major" && form !== "major") throw new Error("Major keys have only the major scale form");
  if (key.mode === "minor" && form === "major") throw new Error("Use a minor form for a minor key");
  const start = stepIndex(key.tonic.step);
  const notes: PitchClass[] = [];
  for (let i = 0; i < 8; i++) {
    const step = STEPS[(start + i) % 7]!;
    notes.push({ step, alter: signatureAlter(key, step) });
  }
  const raise = (degree: number) => {
    // degree is 1-based (6 = submediant, 7 = leading note)
    notes[degree - 1] = { ...notes[degree - 1]!, alter: notes[degree - 1]!.alter + 1 };
  };
  if (form === "harmonic") raise(7);
  if (form === "melodic-ascending") {
    raise(6);
    raise(7);
  }
  if (form === "melodic-descending") return notes.reverse();
  return notes;
}

/** All keys whose signatures use at most `maxAccidentals` sharps or flats. */
export function keysUpTo(maxAccidentals: number): Key[] {
  const result: Key[] = [];
  for (const mode of ["major", "minor"] as const) {
    for (const step of STEPS) {
      for (const alter of [-1, 0, 1]) {
        const key: Key = { tonic: { step, alter }, mode };
        if (Math.abs(keyFifths(key)) <= maxAccidentals) result.push(key);
      }
    }
  }
  return result;
}

export function sameKey(a: Key, b: Key): boolean {
  return a.mode === b.mode && a.tonic.step === b.tonic.step && a.tonic.alter === b.tonic.alter;
}
