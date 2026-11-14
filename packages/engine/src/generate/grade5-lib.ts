/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Shared helpers for the Grade 5 generators (Brief 09). Additive: nothing here is used by Grades 1-4.
 *
 * Sources: First Steps in Music Theory, Grade 5 sections 1-15 (printed pp. 105-141, read in the supplied PDF); the official outline
 * decides what is examinable. Every musical fact is computed with the rule functions in `@mtp/curriculum` (`music.*`), never typed per
 * question.
 */
import { music, type AnswerSpec, type Measure, type NotationEvent } from "@mtp/curriculum";
import { diag, optsOf } from "./grade2.ts";
import { GENERATORS, type Gen } from "./families.ts";

export type Ctx = Parameters<Gen>[0];
export type Pitch = music.Pitch;
export type Clef = music.Clef;
export type Ev = NotationEvent;
export { diag, optsOf };

/** The 26 keys of Grade 5 (keys up to six sharps or flats; A♭, D♭ and G♭ minor are replaced by their enharmonic equivalents, as the book does). */
export const KEYS_G5 = ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major", "E major", "Ab major", "B major", "Db major", "F# major", "Gb major", "A minor", "E minor", "D minor", "B minor", "F# minor", "C# minor", "G minor", "C minor", "F minor", "G# minor", "Bb minor", "D# minor", "Eb minor"];
export const CLEFS4: Clef[] = ["treble", "bass", "alto", "tenor"];
export const NEW_KEYS = ["F# major", "Gb major", "D# minor", "Eb minor"];

export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
export const pretty = (s: string) => s.replace(/##/g, "𝄪").replace(/x/g, "𝄪").replace(/#/g, "♯").replace(/([A-G])bb/g, "$1𝄫").replace(/([A-G])b/g, "$1♭");
export const nameOfPc = (p: music.PitchClass) => pretty(music.formatPitchClass(p));
export const keyWords = (k: string) => pretty(k);
export const F = music.formatPitch;
export const P = music.parsePitch;

/** A choice answer from [id, label] pairs with an explanation for each wrong option. */
export function choiceAnswer(options: Array<[string, string]>, right: string, why: Record<string, [string, string]> = {}): AnswerSpec {
  const ids = new Set(options.map(([id]) => id));
  if (ids.size !== options.length) throw new Error("duplicate option ids");
  if (!ids.has(right)) throw new Error("correct option missing");
  const wrong = Object.entries(why).filter(([id]) => ids.has(id) && id !== right);
  return {
    kind: "choice",
    options: options.map(([id, label]) => ({ id, label })),
    correctOptionIds: [right],
    ...(wrong.length ? { diagnoses: Object.fromEntries(wrong.map(([id, [category, reason]]) => [id, diag(category, reason)])) } : {}),
  } as AnswerSpec;
}

export const shuffled = <T>(c: Ctx, xs: T[]): T[] => c.rng.shuffle([...xs]);

/** Does every one of these pitches sit within `max` ledger lines in the clef? */
export const fitsIn = (clef: Clef, ps: Pitch[], max: number) => ps.every((p) => music.ledgerLines(clef, p) <= max);

export const note = (pitch: Pitch | string, value: music.NoteValue, extra: Record<string, unknown> = {}): Ev => ({ kind: "note", pitch: typeof pitch === "string" ? pitch : F(pitch), duration: { value, dots: 0 }, ...extra }) as Ev;

export const keysIn = (c: Ctx, fallback = KEYS_G5) => (c.scope.keys?.length ? c.scope.keys : fallback);
export const clefsIn = (c: Ctx, fallback: Clef[] = ["treble"]) => (c.scope.clefs?.length ? c.scope.clefs : fallback) as Clef[];

/** The pitches of a scale's first seven degrees (the harmonic form in minor keys), as a melodic vocabulary. */
export function scaleDegrees(key: music.Key): music.PitchClass[] {
  return music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
}

/**
 * A short stepwise-and-leaping melody in a key, within `max` ledger lines of the clef and not too far from the middle of the stave,
 * as a list of pitches. Returns null when none fits.
 */
export function melodyIn5(c: Ctx, key: music.Key, clef: Clef, len: number, max = 1): Pitch[] | null {
  const pcs = scaleDegrees(key);
  const octs = clef === "bass" ? [2, 3] : clef === "treble" ? [4, 5] : [3, 4];
  for (const o of c.rng.shuffle([...octs])) {
    let d = c.rng.int(0, 4);
    const out: Pitch[] = [];
    for (let i = 0; i < len; i++) {
      const pc = pcs[((d % 7) + 7) % 7]!;
      out.push({ ...pc, octave: o + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) });
      d += c.rng.pick([-2, -1, 1, 1, 2]);
    }
    if (fitsIn(clef, out, max) && out.every((p) => Math.abs(music.staffPosition(clef, p) - 4) <= 5 + 2 * max)) return out;
  }
  return null;
}

export const measuresOf = (bars: Ev[][]): Measure[] => bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));

/** Number words for counting. */
export const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const an = (s: string) => `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`;

/** The provisional family generator for a template, run as it is. */
export const family5 = (familyId: string): Gen => (c) => GENERATORS[familyId]?.(c.template)?.(c) ?? null;
