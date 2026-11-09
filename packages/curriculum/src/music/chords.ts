import { scale, type Key } from "./keys.ts";
import { chromaticNumber, diatonicNumber, samePitchClassSpelling, type Pitch, type PitchClass } from "./pitch.ts";

export type Roman = "I" | "ii" | "iii" | "IV" | "V" | "vi" | "vii";
export type Inversion = "a" | "b" | "c";
export type CadenceType = "perfect" | "plagal" | "imperfect";

const DEGREE: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

/** Scale degree (1–7) of a roman numeral, ignoring case (case conventions are optional at Grades 4–5). */
export function romanDegree(roman: string): number {
  const d = DEGREE[roman.toLowerCase()];
  if (!d) throw new Error(`Unknown roman numeral "${roman}"`);
  return d;
}

/**
 * Root-position triad on a scale degree. Minor keys use the harmonic minor form,
 * as the official syllabus specifies for chord work.
 */
export function triad(key: Key, roman: string): [PitchClass, PitchClass, PitchClass] {
  const degree = romanDegree(roman);
  const notes = scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const at = (d: number) => notes[(d - 1) % 7]!;
  return [at(degree), at(degree + 2), at(degree + 4)];
}

export function triadContains(key: Key, roman: string, pc: PitchClass): boolean {
  return triad(key, roman).some((n) => samePitchClassSpelling(n, pc));
}

/** The pitch class that must be in the bass for a given inversion. */
export function bassOf(key: Key, roman: string, inversion: Inversion): PitchClass {
  const t = triad(key, roman);
  return t[{ a: 0, b: 1, c: 2 }[inversion]]!;
}

/**
 * Classify a two-chord cadence using the Grade 5 vocabulary.
 * Imperfect cadences are limited to I–V, ii–V and IV–V (the approach chords the course teaches).
 */
export function classifyCadence(first: string, second: string): CadenceType | null {
  const a = romanDegree(first);
  const b = romanDegree(second);
  if (a === 5 && b === 1) return "perfect";
  if (a === 4 && b === 1) return "plagal";
  if (b === 5 && (a === 1 || a === 2 || a === 4)) return "imperfect";
  return null;
}

export const ALL_ROMANS: Roman[] = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
const INV: Inversion[] = ["a", "b", "c"];

/**
 * Identify a triad (any voicing, any doubling) from its spelt pitches in a key. The bass note (lowest
 * sounding pitch) decides the inversion; spacing of the upper notes never matters. Returns null when the
 * notes are not exactly the three notes of one triad on a degree of the key (harmonic minor in minor keys).
 */
export function identifyTriad(key: Key, pitches: Pitch[], romans: readonly string[] = ALL_ROMANS): { roman: Roman; inversion: Inversion } | null {
  if (pitches.length < 3) return null;
  for (const r of romans) {
    const t = triad(key, r);
    const allIn = pitches.every((p) => t.some((x) => samePitchClassSpelling(x, p)));
    const allPresent = t.every((x) => pitches.some((p) => samePitchClassSpelling(x, p)));
    if (allIn && allPresent) {
      const bass = lowest(pitches);
      const idx = t.findIndex((x) => samePitchClassSpelling(x, bass));
      return { roman: r as Roman, inversion: INV[idx]! };
    }
  }
  return null;
}

export function lowest(pitches: Pitch[]): Pitch {
  return [...pitches].sort((a, b) => chromaticNumber(a) - chromaticNumber(b) || diatonicNumber(a) - diatonicNumber(b))[0]!;
}

/** Chords (from `romans`) that contain every one of the given melody notes. */
export function chordsContaining(key: Key, melody: PitchClass[], romans: readonly string[]): Roman[] {
  return romans.filter((r) => melody.every((m) => triadContains(key, r, m))) as Roman[];
}

/** Root-position or inverted voicing in close position above a bass octave, for demonstrations and generators. */
export function voiceTriad(key: Key, roman: string, inversion: Inversion, bassOctave: number): Pitch[] {
  const t = triad(key, roman);
  const order = [t[{ a: 0, b: 1, c: 2 }[inversion]]!, t[{ a: 1, b: 2, c: 0 }[inversion]]!, t[{ a: 2, b: 0, c: 1 }[inversion]]!];
  const out: Pitch[] = [];
  let prev = -Infinity;
  for (const pc of order) {
    let p: Pitch = { ...pc, octave: out.length === 0 ? bassOctave : out[out.length - 1]!.octave };
    while (diatonicNumber(p) <= prev) p = { ...p, octave: p.octave + 1 };
    out.push(p);
    prev = diatonicNumber(p);
  }
  return out;
}

export const CADENCE_NAMES: Record<CadenceType, string> = { perfect: "perfect cadence (V–I)", plagal: "plagal cadence (IV–I)", imperfect: "imperfect cadence (ending on V)" };
