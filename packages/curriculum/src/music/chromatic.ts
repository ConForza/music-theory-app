/**
 * Chromatic scales (rules.scale.chromatic). Any spelling is correct when the scale moves by semitones only,
 * starts and ends on the given note an octave apart, and uses every letter name at least once and at most
 * twice (twelve notes from seven letters). Double accidentals are never needed, so they are reported as
 * unnecessary. The rule is spelling-aware: C–C#–Db would fail (C# and Db are the same sound).
 */
import { chromaticNumber, formatPitch, samePitch, samePitchClassSpelling, STEPS, type Pitch } from "./pitch.ts";

export type ChromaticProblemCode = "length" | "wrong-start" | "wrong-end" | "not-a-semitone" | "letter-used-three-times" | "letter-missing" | "double-accidental";
export interface ChromaticProblem {
  code: ChromaticProblemCode;
  index?: number;
  letter?: string;
  message: string;
}

export function checkChromatic(ps: Pitch[], start: Pitch, direction: "ascending" | "descending"): ChromaticProblem[] {
  const out: ChromaticProblem[] = [];
  const sign = direction === "ascending" ? 1 : -1;
  if (ps.length !== 13) out.push({ code: "length", message: `A chromatic scale over one octave has 13 notes; this has ${ps.length}.` });
  if (!ps[0] || !samePitch(ps[0], start)) out.push({ code: "wrong-start", index: 0, message: `Start on ${formatPitch(start)}.` });
  const last = ps[ps.length - 1];
  if (ps.length > 1 && last && !(samePitchClassSpelling(last, start) && last.octave === start.octave + sign)) {
    out.push({ code: "wrong-end", index: ps.length - 1, message: `Finish on ${formatPitch({ ...start, octave: start.octave + sign })}, an octave ${direction === "ascending" ? "above" : "below"} the first note.` });
  }
  for (let i = 1; i < ps.length; i++) {
    if (chromaticNumber(ps[i]!) - chromaticNumber(ps[i - 1]!) !== sign) {
      out.push({ code: "not-a-semitone", index: i, message: `${formatPitch(ps[i - 1]!)} to ${formatPitch(ps[i]!)} is not a semitone ${direction === "ascending" ? "up" : "down"}.` });
    }
  }
  const counts = new Map<string, number>();
  ps.slice(0, Math.min(12, ps.length)).forEach((p) => counts.set(p.step, (counts.get(p.step) ?? 0) + 1));
  for (const s of STEPS) {
    const c = counts.get(s) ?? 0;
    if (c > 2) out.push({ code: "letter-used-three-times", letter: s, message: `The letter ${s} is used ${c} times; use each letter at most twice.` });
    if (c === 0 && ps.length >= 12) out.push({ code: "letter-missing", letter: s, message: `The letter ${s} is missing; every letter name must appear.` });
  }
  ps.forEach((p, i) => {
    if (Math.abs(p.alter) === 2) out.push({ code: "double-accidental", index: i, message: `${formatPitch(p)} uses a double accidental, which a chromatic scale never needs.` });
  });
  return out;
}

/** Reference spellings used by generators and the keyboard demo: sharps going up, flats coming down. */
export function chromaticFrom(start: Pitch, direction: "ascending" | "descending"): Pitch[] {
  const out: Pitch[] = [start];
  const sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const names = direction === "ascending" ? sharpNames : flatNames;
  let n = chromaticNumber(start);
  for (let i = 0; i < 12; i++) {
    n += direction === "ascending" ? 1 : -1;
    if (i === 11) {
      out.push({ ...start, octave: start.octave + (direction === "ascending" ? 1 : -1) });
      break;
    }
    const pc = ((n % 12) + 12) % 12;
    const name = names[pc]!;
    out.push({ step: name[0] as Pitch["step"], alter: name.length > 1 ? (name[1] === "#" ? 1 : -1) : 0, octave: Math.floor(n / 12) });
  }
  return out;
}
