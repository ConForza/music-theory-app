/**
 * Shared constants and helpers for the Grade 5 lesson specs (Brief 09). The Grade 1-4 authoring toolkits are reused as they are: the same
 * picker draws questions from the generators inside a lesson's own taught scope and freezes them. Grade 5 adds builders for staves in all
 * four clefs (the tenor clef included) and irregular-time rhythm lines.
 */
import { frag, note, plainNote, plainRest } from "@mtp/engine";
import type { Frag } from "../grade1/lib.ts";
export { has, any, starts, nm, nms, nt, rs, rline, fixedItem, keys } from "../grade2/lib2.ts";
export type { Spec2, Binding } from "../grade2/lib2.ts";
export { qualityIs } from "../grade4/lib4.ts";
import { rline } from "../grade2/lib2.ts";
import type { ExerciseItem } from "@mtp/curriculum";

export const IRR = ["5/4", "7/4", "5/8", "7/8"];
export const VALS = ["minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"];
export const CL4 = ["treble", "bass", "alto", "tenor"];
export const CL2 = ["treble", "bass"];
export const CLC = ["alto", "tenor"];
/** The keys of Grades 1-4, then the four new keys of Grade 5. */
export const KEYS_OLD = ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major", "E major", "Ab major", "B major", "Db major", "A minor", "E minor", "D minor", "B minor", "F# minor", "C# minor", "G minor", "C minor", "F minor", "G# minor", "Bb minor"];
export const NEWK = ["F# major", "Gb major", "D# minor", "Eb minor"];
export const KEYS_G5 = [...KEYS_OLD, ...NEWK];
export const CK = ["C major", "G major", "D major", "F major"];
export const FORMS = ["harmonic", "melodic"];
export const ORN = ["trill", "turn", "upper-mordent", "lower-mordent", "acciaccatura", "appoggiatura"];
export const rh = (ts: string[], tup = false) => ({ timeSignatures: ts, noteValues: VALS, maxDots: 1, rests: true, ties: true, ...(tup ? { tuplets: ["irregular"] } : {}) });

type P = string | [string, string];
const ev = (p: P, value = "semibreve") => (Array.isArray(p) ? note(p[0], value as never, { label: p[1] }) : note(p, value as never));
/** One bar of semibreves in any of the four clefs. */
export const st = (clef: "treble" | "bass" | "alto" | "tenor", pitches: P[], text: string, extra: Partial<Frag> = {}): Frag => frag(clef, [{ events: pitches.map((p) => ev(p)) }], text, { showKeySignature: false, ...extra });
/** Bars of one note value in any clef. */
export const bars = (clef: "treble" | "bass" | "alto" | "tenor", list: P[][], ts: string, text: string, value = "crotchet", extra: Partial<Frag> = {}): Frag =>
  frag(clef, list.map((b, i) => ({ events: b.map((p) => ev(p, value)), ...(i === list.length - 1 ? { barline: "final" as const } : {}) })), text, { showKeySignature: false, timeSignature: ts, ...extra });
/** A chord of semibreves (one chord per bar when several are given). */
export const chords = (clef: "treble" | "bass" | "alto" | "tenor", list: string[][], text: string, extra: Partial<Frag> = {}): Frag =>
  frag(clef, list.map((b, i) => ({ events: [{ kind: "chord", notes: b.map((pitch) => ({ pitch })), duration: { value: "semibreve", dots: 0 } } as never], ...(i === list.length - 1 ? { barline: "final" as const } : {}) })), text, { showKeySignature: false, ...extra });

const n = (value: string, o: Record<string, unknown> = {}) => plainNote(value as never, 0, o);
const nd = (value: string, dots = 1) => plainNote(value as never, dots, {});
const r = (value: string, dots = 0) => plainRest(value as never, dots, {});
export { n, nd, r };
/** Beam a run of equal short notes: begin, continue ..., end. */
export const beamed = (value: string, count: number) => Array.from({ length: count }, (_, i) => n(value, { beam: i === 0 ? "begin" : i === count - 1 ? "end" : "continue" }));
/** An irregular group of `count` notes in the time of `normal`. */
export const tup = (count: number, normal: number, value: string) => ({ kind: "tuplet", actual: count, normal, events: beamed(value, count), label: String(count) }) as never;

/** A rhythm line from bars of events with a printed time signature. */
export const bar = (events: unknown[][], text: string, ts?: string): Frag => rline(events, text, ts);

/** True for an item whose answer is of the given interval qualities. */
export const iq = (qualities: string) => (i: ExerciseItem) => {
  const a = i.answer as { acceptedIntervals?: string[]; target?: string; correctOptionIds?: string[] };
  const q = a.acceptedIntervals?.[0] ?? a.target ?? a.correctOptionIds?.[0] ?? "";
  return qualities.includes(q[0] ?? "?") && /^[PMmdA]\d/.test(q);
};
export const promptHas = (...words: string[]) => (i: ExerciseItem) => words.some((w) => i.prompt.includes(w));
