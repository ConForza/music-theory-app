/**
 * Transposing instruments (rules.transpose.instrument). A part is WRITTEN at one pitch and SOUNDS (concert
 * pitch) at another. The Grade 5 instruments: B♭ (sounds a major 2nd lower), A (minor 3rd lower) and F
 * (perfect 5th lower). Transposition is interval-based, so spelling and key signatures follow exactly:
 * written D major for a B♭ clarinet sounds C major; a written F♯ sounds E.
 */
import { formatKey, keySignature, type Key } from "./keys.ts";
import { parseInterval, transpose, type Interval } from "./interval.ts";
import type { Pitch } from "./pitch.ts";

export type InstrumentKey = "Bb" | "A" | "F";
/** Interval by which the written note is HIGHER than the sounding note. */
export const INSTRUMENT_INTERVAL: Record<InstrumentKey, Interval> = { Bb: parseInterval("M2"), A: parseInterval("m3"), F: parseInterval("P5") };

export const TRANSPOSING_INSTRUMENTS: Array<{ id: string; name: string; in: InstrumentKey; family: string }> = [
  { id: "clarinet-bb", name: "clarinet in B♭", in: "Bb", family: "woodwind" },
  { id: "clarinet-a", name: "clarinet in A", in: "A", family: "woodwind" },
  { id: "trumpet-bb", name: "trumpet in B♭", in: "Bb", family: "brass" },
  { id: "horn-f", name: "horn in F", in: "F", family: "brass" },
  { id: "cor-anglais-f", name: "cor anglais (in F)", in: "F", family: "woodwind" },
];

export function writtenToConcert(p: Pitch, inst: InstrumentKey): Pitch {
  return transpose(p, INSTRUMENT_INTERVAL[inst], "down");
}
export function concertToWritten(p: Pitch, inst: InstrumentKey): Pitch {
  return transpose(p, INSTRUMENT_INTERVAL[inst], "up");
}

function moveKey(key: Key, iv: Interval, dir: "up" | "down"): Key {
  const t = transpose({ ...key.tonic, octave: 4 }, iv, dir);
  const k: Key = { tonic: { step: t.step, alter: t.alter }, mode: key.mode };
  keySignature(k); // throws when the key would need more than seven sharps/flats
  return k;
}
export const writtenKeyFor = (concert: Key, inst: InstrumentKey) => moveKey(concert, INSTRUMENT_INTERVAL[inst], "up");
export const concertKeyFor = (written: Key, inst: InstrumentKey) => moveKey(written, INSTRUMENT_INTERVAL[inst], "down");
export const describeKeyChange = (from: Key, to: Key) => `${formatKey(from)} → ${formatKey(to)}`;
