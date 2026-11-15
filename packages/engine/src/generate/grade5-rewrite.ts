/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * t.g5.rewrite-metre: rewrite a bar between simple and compound time (PR #14, optional enrichment only; never assessed).
 *
 * Rule taught: every note and rest keeps its share of its BEAT. A crotchet beat (2/4, 3/4, 4/4) becomes a dotted-crotchet beat (6/8, 9/8, 12/8),
 * so each value gains a dot; going back, each dot is removed. The bar changes length; the beat relationships do not. Pairs: 2/4-6/8, 3/4-9/8,
 * 4/4-12/8. Compound to simple is only asked for fully dotted bars (a bar with three undotted quavers per beat would need triplets, a different
 * exercise). Both bars are checked with the rhythm rules (`checkBar`, beams required) and with `music.beatProfile`, the same check the grader uses.
 *
 * Status (OPEN_QUESTIONS Q16): the outline lists no such outcome and current papers were not available, so the question is optional enrichment,
 * mapped only to the Grade 4 time-signature outcome, and no assessment blueprint may name it.
 */
import { music } from "@mtp/curriculum";
import { n, r, rhythmLine, type Gen } from "./families.ts";
import type { Ctx, Ev } from "./grade5-lib.ts";

type NV = music.NoteValue;
/** How one SIMPLE-time beat can be filled: [value, isRest] runs that add up to one beat (a crotchet). Two-beat values are added separately. */
const BEAT: Array<Array<[NV, boolean]>> = [
  [["crotchet", false]],
  [["quaver", false], ["quaver", false]],
  [["quaver", false], ["semiquaver", false], ["semiquaver", false]],
  [["semiquaver", false], ["semiquaver", false], ["quaver", false]],
  [["semiquaver", false], ["semiquaver", false], ["semiquaver", false], ["semiquaver", false]],
  [["quaver", true], ["quaver", false]],
  [["crotchet", true]],
];
const PAIRS: Record<string, string> = { "2/4": "6/8", "3/4": "9/8", "4/4": "12/8" };
const beatName = (ts: string) => (music.classifyTimeSignature(ts).metre === "compound" ? "dotted crotchet" : "crotchet");

const ev = ([v, rest]: [NV, boolean], dots: number): Ev => (rest ? r(v, dots) : n(v, dots)) as Ev;

export const rewriteMetre5: Gen = (c: Ctx): any => {
  const allowedSimple = Object.keys(PAIRS).filter((s) => (c.scope.timeSignatures ?? []).includes(s) && (c.scope.timeSignatures ?? []).includes(PAIRS[s]!));
  if (!allowedSimple.length || (c.scope.maxDots ?? 0) < 1) return null;
  const simple = c.rng.pick(allowedSimple);
  const compound = PAIRS[simple]!;
  const beats = music.parseTimeSignature(simple).top;
  // fill the beats; a two-beat note (minim) may start a beat that begins a half of the bar
  const cells: Array<Array<[NV, boolean]>> = [];
  for (let b = 0; b < beats; b++) {
    const canMinim = b + 1 < beats && b % 2 === 0 && c.rng.chance(0.2) && (c.scope.noteValues ?? []).includes("minim");
    if (canMinim) { cells.push([["minim", false]]); cells.push([]); b++; continue; }
    cells.push(c.rng.pick(BEAT.filter((cell) => cell.every(([v]) => !(c.scope.noteValues?.length) || c.scope.noteValues.includes(v)))));
  }
  const flat = cells.flat();
  if (flat.filter(([, rest]) => rest).length > 1 || flat.length < 3) return null;
  const toDotted = (xs: Array<[NV, boolean]>) => xs.map((x) => ev(x, 1));
  const toPlain = (xs: Array<[NV, boolean]>) => xs.map((x) => ev(x, 0));
  const simpleStruct = music.metreStructure(simple);
  const compoundStruct = music.metreStructure(compound);
  const simpleBar = music.autoBeam(toPlain(flat) as unknown as music.REvent[], simpleStruct) as unknown as Ev[];
  const compoundBar = music.autoBeam(toDotted(flat) as unknown as music.REvent[], compoundStruct) as unknown as Ev[];
  // both bars must be clean in their own metre, with beams as that metre requires, and have the same profile per beat
  if (music.checkBar(simpleBar as never, simpleStruct, { requireBeams: true }).length) return null;
  if (music.checkBar(compoundBar as never, compoundStruct, { requireBeams: true }).length) return null;
  if (music.beatProfile(simpleBar as never, simple).join() !== music.beatProfile(compoundBar as never, compound).join()) return null;
  // The shown bar is written as the learner will meet real music: beamed.
  const toCompound = c.rng.chance(0.6);
  const from = toCompound ? simple : compound;
  const to = toCompound ? compound : simple;
  const shown = toCompound ? simpleBar : compoundBar;
  const answer = toCompound ? compoundBar : simpleBar;
  return {
    prompt: `This bar is written in ${from}, where the beat is a ${beatName(from)}. Rewrite it in ${to}, where the beat is a ${beatName(to)}. Every note and rest keeps its share of its beat, so the music moves at the same beat speed. Beam the notes as ${to} requires.`,
    music: rhythmLine([{ events: shown, barline: "final" }], { timeSignature: from }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: to, fromTimeSignature: from, accepted: [[{ events: answer, barline: "final" }]], acceptAnyRuleCompliant: true },
    hints: [`Compare the beats: in ${from} a beat is a ${beatName(from)} and in ${to} it is a ${beatName(to)}. Write each note or rest as the same share of its beat as before. The bar will be a different length: that is correct.`],
  };
};
