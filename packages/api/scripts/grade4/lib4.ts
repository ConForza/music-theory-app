/**
 * Shared constants and helpers for the Grade 4 lesson specs (Brief 08). The Grade 1-3 authoring toolkits are reused as they are:
 * the same picker draws questions from the generators inside a lesson's own taught scope and freezes them. Grade 4 adds builders for
 * the alto clef, which the Grade 1 `stave` builders (treble and bass only) cannot draw.
 */
import { frag, note } from "@mtp/engine";
import type { Frag } from "../grade1/lib.ts";
export { has, any, starts, nm, nms, nt, rs, rhythm, rline, melody, fixedItem, plainNote, plainRest, keys } from "../grade2/lib2.ts";
export type { Spec2, Binding } from "../grade2/lib2.ts";
import { nt, plainNote, plainRest } from "../grade2/lib2.ts";
import type { R } from "../grade1/lib.ts";

export const V7 = ["breve", "semibreve", "minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"];
export const V5 = ["minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"];
export const NEWTS = ["2/8", "4/8", "6/4", "9/4", "12/4", "6/16", "9/16", "12/16"];
export const TS_ALL = ["2/2", "3/2", "4/2", "2/4", "3/4", "4/4", "2/8", "3/8", "4/8", "6/4", "9/4", "12/4", "6/8", "9/8", "12/8", "6/16", "9/16", "12/16"];
export const CL3 = ["treble", "bass", "alto"];
export const CL2 = ["treble", "bass"];
/** Keys of Grades 1-3, in the order they were taught. */
export const KEYS_OLD = ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major", "E major", "Ab major", "A minor", "E minor", "D minor", "B minor", "F# minor", "C# minor", "G minor", "C minor", "F minor"];
export const KEYS_NEW = ["B major", "G# minor", "Db major", "Bb minor"];
export const KEYS_G4 = [...KEYS_OLD, ...KEYS_NEW];
export const FORMS = ["harmonic", "melodic"];
export const ORN = ["trill", "turn", "upper-mordent", "lower-mordent", "acciaccatura", "appoggiatura"];

type P = string | [string, string];
const ev = (p: P, value = "semibreve") => (Array.isArray(p) ? note(p[0], value as never, { label: p[1] }) : note(p, value as never));
/** One bar of semibreves in any clef (including the alto clef). */
export const staveC = (clef: "treble" | "bass" | "alto", pitches: P[], text: string, extra: Partial<Frag> = {}): Frag => frag(clef, [{ events: pitches.map((p) => ev(p)) }], text, { showKeySignature: false, ...extra });
/** Bars of one note value in any clef. */
export const barsC = (clef: "treble" | "bass" | "alto", list: P[][], ts: string, text: string, value = "crotchet", extra: Partial<Frag> = {}): Frag =>
  frag(clef, list.map((b, i) => ({ events: b.map((p) => ev(p, value)), ...(i === list.length - 1 ? { barline: "final" as const } : {}) })), text, { showKeySignature: false, timeSignature: ts, ...extra });
/** A chord of semibreves in any clef. */
export const chordC = (clef: "treble" | "bass" | "alto", pitches: string[], text: string, extra: Partial<Frag> = {}): Frag =>
  frag(clef, [{ events: [{ kind: "chord", notes: pitches.map((pitch) => ({ pitch })), duration: { value: "semibreve", dots: 0 } } as never] }], text, { showKeySignature: false, ...extra });

/** A duplet: two equal beamed notes in the time of three. */
export function dupletEv(unit: string, rests = false) {
  const evs = [0, 1].map((i) => (rests && i === 1 ? plainRest(unit as never, 0, {}) : plainNote(unit as never, 0, ["quaver", "semiquaver"].includes(unit) ? { beam: i === 0 ? "begin" : "end" } : {})));
  return { kind: "tuplet", actual: 2, normal: 3, events: evs } as never;
}
/** Beamed group helper for rhythm lines: values beamed together (all must be quavers or shorter). */
export const bm = (values: string[], dots: number[] = []): R[] => values.map((v, i) => nt(v, { dots: dots[i] ?? 0, beam: values.length === 1 ? undefined : i === 0 ? "begin" : i === values.length - 1 ? "end" : "continue" }));
export const dn = (value: string, dots = 1): R => nt(value, { dots });
export const rdn = (value: string, dots = 1): R => ["" + value, { rest: true, dots }];

import { deriveScale, music } from "@mtp/curriculum";
/** The notes of a scale as one bar of semibreves (accidentals as the rules print them), optionally with the key signature. */
export function scaleFrag(opts: { key: string; form: "major" | "harmonic" | "melodic"; dir: "ascending" | "descending"; clef: "treble" | "bass" | "alto"; oct: number; signature: boolean; text?: string }): Frag {
  const start = { ...music.parseKey(opts.key).tonic, octave: opts.dir === "descending" ? opts.oct + 1 : opts.oct };
  const notes = deriveScale(opts.key, opts.form, opts.dir, start).map((p) => music.formatPitch(p));
  const label = opts.key.replace("#", "♯").replace(/([A-G])b/, "$1♭");
  const form = opts.form === "major" ? "scale" : `${opts.form} minor scale`;
  const text = opts.text ?? `${opts.clef === "alto" ? "An" : "A"} ${opts.clef}-clef stave with eight semibreves: the ${opts.key.endsWith("major") ? `${label} ${form}` : `${label.replace(" minor", "")} ${form}`}, ${opts.dir}${opts.signature ? ", with its key signature" : ", written with accidentals instead of a key signature"}.`;
  return frag(opts.clef, [{ events: notes.map((p) => note(p, "semibreve")) }], text, opts.signature ? { key: opts.key, showKeySignature: true } : { showKeySignature: false });
}

import type { ExerciseItem } from "@mtp/curriculum";
/** True for a question whose answer is an interval of one of these qualities (typed answers, built answers, or option ids like "A4@4-7"). */
export const qualityIs = (qualities: string) => (i: ExerciseItem) => {
  const a = i.answer as { acceptedIntervals?: string[]; target?: string; correctOptionIds?: string[] };
  const q = a.acceptedIntervals?.[0] ?? a.target ?? a.correctOptionIds?.[0] ?? "";
  return qualities.includes(q[0] ?? "?") && /^[PMmdA]\d/.test(q);
};
/** A row of chords (one per bar) in any clef. */
export const chordsC = (clef: "treble" | "bass" | "alto", list: string[][], ts: string, text: string, extra: Partial<Frag> = {}): Frag =>
  frag(clef, list.map((b, i) => ({ events: [{ kind: "chord", notes: b.map((pitch) => ({ pitch })), duration: { value: "semibreve", dots: 0 } } as never], ...(i === list.length - 1 ? { barline: "final" as const } : {}) })), text, { showKeySignature: false, timeSignature: ts, ...extra });
