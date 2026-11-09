import { scale, type Key } from "./keys.ts";
import { samePitchClassSpelling, type PitchClass } from "./pitch.ts";

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
