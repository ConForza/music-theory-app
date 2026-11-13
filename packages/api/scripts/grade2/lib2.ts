/**
 * Shared constants and helpers for the Grade 2 lesson specs (Brief 06). Grade 1's authoring toolkit (../grade1/lib.ts) is reused
 * as is: the same picker draws questions from the generators inside a lesson's own taught scope and freezes them.
 */
import type { ExerciseItem } from "@mtp/curriculum";
import { plainNote, plainRest, rhythmLine } from "@mtp/engine";
import type { Spec, Frag } from "../grade1/lib.ts";

export { bars, chord, keys, melody, nt, rhythm, rs, stave, fixedItem } from "../grade1/lib.ts";
export type { Spec, Frag };

export const V5 = ["semibreve", "minim", "crotchet", "quaver", "semiquaver"];
export const TS_OLD = ["2/4", "3/4", "4/4"];
export const TS_ALL = ["2/2", "3/2", "4/2", "3/8", "2/4", "3/4", "4/4"];
export const MAJ_G1 = ["C major", "G major", "D major", "F major"];
export const MAJ_G2 = [...MAJ_G1, "A major", "Bb major", "Eb major"];
export const MIN3 = ["A minor", "E minor", "D minor"];
export const CL = ["treble", "bass"];

export interface Binding { t: string; c: string[]; scope: Record<string, unknown> }
export type Spec2 = Spec & { bind: Binding[] };

export const has = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);
export const starts = (s: string) => (i: ExerciseItem) => i.prompt.startsWith(s);
export const any = (...p: Array<(i: ExerciseItem) => boolean>) => (i: ExerciseItem) => p.some((f) => f(i));

/** A bar-scope with rests, ties off. */
export const rests = (ts: string[]) => ({ timeSignatures: ts, noteValues: V5, maxDots: 1, rests: true });
export const plain = (ts: string[]) => ({ timeSignatures: ts, noteValues: V5, maxDots: 1 });
export const stv = (keys?: string[], extra: Record<string, unknown> = {}) => ({ ...(keys ? { keys } : {}), clefs: CL, maxLedgerLines: 2, ...extra });

/** A triplet group of notes and rests from [units, isRest] parts, for explanations and demonstrations. */
export function tripletEvent(unit: string, parts: Array<[number, boolean]> = [[1, false], [1, false], [1, false]]) {
  const value = (u: number) => (u === 1 ? unit : unit === "quaver" ? "crotchet" : unit === "semiquaver" ? "quaver" : "minim");
  const evs = parts.map(([u, isRest], i) => (isRest ? plainRest(value(u) as never, 0, {}) : plainNote(value(u) as never, 0, parts.every(([u, r]) => !r && u === 1) ? { beam: i === 0 ? "begin" : i === parts.length - 1 ? "end" : "continue" } : {})));
  return { kind: "tuplet", actual: 3, normal: 2, events: evs } as never;
}
/** A rhythm line from raw events (use for triplets), with a text alternative. */
export const rline = (events: unknown[][], text: string, ts?: string): Frag => ({ ...rhythmLine(events.map((e, i) => ({ events: e as never, ...(i === events.length - 1 && ts ? { barline: "final" as const } : {}) })), ts ? { timeSignature: ts } : {}), textAlternative: text }) as Frag;
export { plainNote, plainRest };

/** A pitch with its printed name as the label ("C#5" -> ["C#5", "C♯"]). */
export const nm = (p: string): [string, string] => [p, p.replace(/\d+$/, "").replace("#", "♯").replace(/([A-G])b/, "$1♭")];
export const nms = (ps: string[]): Array<[string, string]> => ps.map(nm);
