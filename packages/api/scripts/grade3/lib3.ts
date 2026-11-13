/**
 * Shared constants and helpers for the Grade 3 lesson specs (Brief 07). The Grade 1 and Grade 2 authoring toolkits are reused as is:
 * the same picker draws questions from the generators inside a lesson's own taught scope and freezes them.
 */
import type { R } from "../grade1/lib.ts";
export { plainRest, tripletEvent, CL, MAJ_G1, MAJ_G2, MIN3, any, has, nm, nms, plain, rests, rhythm, rline, rs, nt, stave, stv, starts, bars, melody, chord, keys, fixedItem } from "../grade2/lib2.ts";
export type { Spec2, Binding } from "../grade2/lib2.ts";
import { MAJ_G2, MIN3 } from "../grade2/lib2.ts";

export const TS_C = ["6/8", "9/8", "12/8"];
export const TS_S = ["2/4", "3/4", "4/4"];
export const V3 = ["minim", "crotchet", "quaver"];
export const V4 = ["crotchet", "quaver", "semiquaver", "demisemiquaver"];
export const MAJ_NEW = ["E major", "Ab major"];
export const MIN_SHARP = ["B minor", "F# minor", "C# minor"];
export const MIN_FLAT = ["G minor", "C minor", "F minor"];
export const MIN_NEW = [...MIN_SHARP, ...MIN_FLAT];
export const NEW_KEYS = [...MAJ_NEW, ...MIN_NEW];
export const ALL_G3 = [...MAJ_G2, ...MIN3, ...NEW_KEYS];

import { nt, rs } from "../grade2/lib2.ts";
/** A dotted crotchet: one beat of compound time. */
export const dc = (): R => nt("crotchet", { dots: 1 });
export const rdc = (): R => rs("crotchet", { dots: 1 });
/** A group of notes joined by one beam (all must be quavers or shorter). */
export const bm = (values: string[]): R[] => values.map((v, i) => nt(v, { beam: values.length === 1 ? undefined : i === 0 ? "begin" : i === values.length - 1 ? "end" : "continue" }));
/** Three beamed quavers: one beat of compound time. */
export const qqq = (): R[] => bm(["quaver", "quaver", "quaver"]);
