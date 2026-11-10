/**
 * Authoring toolkit for the Grade 1 lessons (Brief 05).
 *
 * Lessons are written as compact specs (teaching copy by hand, notation from small builders). Their questions are picked
 * from the Brief 03 generators inside each lesson's own taught scope and then FROZEN as fixed items with stable ids, so a
 * lesson never changes under a learner unless its content version is bumped. Every musical fact in a frozen item comes
 * from the engine's rules; the picker only chooses which seed to keep. Run: `npm run author:grade1 -w @mtp/api`.
 */
import { buildIndex, effectiveScope, loadCurriculum, type CurriculumIndex, type ExerciseItem, type NotationFragment, type OrderedNode } from "@mtp/curriculum";
import { frag, generateItem, note, plainNote, plainRest, rhythmLine } from "@mtp/engine";
import { loadConstraints, questionKey, satisfies, type ReviewConstraint } from "../../src/question-key.ts";

export type Frag = NotationFragment;
export type Block = { text: string } | { tip: string } | { music: Frag; caption: string };

export interface Pick {
  /** Template to draw from (must be bound on the node). */
  t: string;
  /** Keep only seeds whose question satisfies this (pins the teaching point). */
  when?: (i: ExerciseItem) => boolean;
  prompt?: string;
  hints?: string[];
  /** Specific praise for a correct answer. */
  correct: string;
  /** Extra or replacement misconception feedback, by mistake category. */
  say?: Record<string, string>;
}

export interface Spec {
  node: string;
  version: number;
  objective: { statement: string; criteria: string[] };
  explain: Block[];
  demo: { widget: "staff" | "keyboard" | "staff-and-keyboard" | "rhythm" | "score"; music: Frag; steps: string[]; text: string };
  guided: Pick[];
  independent: Pick[];
  recap: string[];
  review: Array<{ t: string; afterDays: number }>;
  notes: string;
  /** Hand-written questions added after the picked ones (for example questions about an authored melody). */
  fixedIndependent?: ExerciseItem[];
}

export interface Author {
  ix: CurriculumIndex;
  constraints: Map<string, ReviewConstraint>;
  used: Set<string>;
}

export function startAuthoring(): Author {
  const { curriculum } = loadCurriculum();
  const ix = buildIndex(curriculum!);
  return { ix, constraints: loadConstraints(ix.c.root, ix.concepts), used: new Set() };
}

/** Fragment builders. `p` is a pitch, or [pitch, label] to print a name under the note. */
type P = string | [string, string];
const ev = (p: P, value = "semibreve") => (Array.isArray(p) ? note(p[0], value as never, { label: p[1] }) : note(p, value as never));
export const stave = (clef: "treble" | "bass", pitches: P[], text: string, extra: Partial<Frag> = {}): Frag => frag(clef, [{ events: pitches.map((p) => ev(p)) }], text, { showKeySignature: false, ...extra });
/** Bars of crotchets (or another value) in a time signature; accidentals are printed by the bar-state rules. */
export const bars = (clef: "treble" | "bass", list: P[][], ts: string, text: string, value = "crotchet", extra: Partial<Frag> = {}): Frag =>
  frag(clef, list.map((b, i) => ({ events: b.map((p) => ev(p, value)), ...(i === list.length - 1 ? { barline: "final" as const } : {}) })), text, { showKeySignature: false, timeSignature: ts, ...extra });
/** A chord (notes sounded together) as a semibreve on the stave. */
export const chord = (clef: "treble" | "bass", pitches: string[], text: string, extra: Partial<Frag> = {}): Frag =>
  frag(clef, [{ events: [{ kind: "chord", notes: pitches.map((pitch) => ({ pitch })), duration: { value: "semibreve", dots: 0 } } as never] }], text, { showKeySignature: false, ...extra });
export const keys = (pitches: P[], text: string): Frag => ({ presentation: "keyboard", clef: "treble", showKeySignature: false, measures: [{ events: pitches.map((p) => ev(p)) }], textAlternative: text }) as Frag;

export function pickItem(a: Author, node: OrderedNode, p: Pick, section: "guided" | "independent", n: number, inLesson: Set<string> = new Set()): ExerciseItem {
  const binding = node.exercises.find((b) => b.templateId === p.t);
  if (!binding) throw new Error(`${node.id}: template ${p.t} is not bound on the node`);
  const scope = effectiveScope(a.ix, node, binding);
  const own = binding.conceptIds.filter((c) => node.conceptIds.includes(c));
  const evidence = section === "guided" ? "learning" : "independent";
  for (let seed = 1; seed < 40000; seed++) {
    let item: ExerciseItem;
    try {
      item = generateItem(a.ix, p.t, seed, { scope, evidence }).item;
    } catch {
      continue;
    }
    if (p.when && !p.when(item)) continue;
    // The question must sit inside the boundary of at least one concept this lesson teaches.
    if (own.length && !own.some((c) => !a.constraints.get(c) || satisfies(item, a.constraints.get(c)!))) continue;
    // A lesson never asks the same question twice: independent questions must differ from every earlier question (guided included),
    // and a guided question avoids earlier ones too, unless the pool is so small that nothing else exists.
    const key = questionKey(item);
    if (inLesson.has(key)) continue; // never the same question twice in one lesson, guided included
    if (a.used.has(key) && seed < 20000) continue; // and, where the pool allows, not one met in an earlier lesson either
    a.used.add(key);
    inLesson.add(key);
    return {
      ...item,
      id: `i.${node.id.toLowerCase()}.${section === "guided" ? "guided" : "ind"}-${n}`,
      seed: null,
      prompt: p.prompt ?? item.prompt,
      hints: p.hints ?? item.hints,
      feedback: { correct: p.correct, mistakes: { ...item.feedback.mistakes, ...(p.say ?? {}) }, fallback: item.feedback.fallback },
    };
  }
  throw new Error(`${node.id}: no seed satisfies ${section} #${n} (${p.t})`);
}

export function buildLesson(a: Author, spec: Spec) {
  const inLesson = new Set<string>();
  const node = a.ix.nodeById.get(spec.node)!;
  if (!node) throw new Error(`Unknown node ${spec.node}`);
  if (node.type !== "lesson") throw new Error(`${spec.node} is not a lesson`);
  const lesson = {
    schemaVersion: 1,
    id: `lc.${node.id}`,
    lessonId: node.id,
    contentVersion: spec.version,
    locale: "en-GB",
    objective: { statement: spec.objective.statement, successCriteria: spec.objective.criteria },
    explanation: spec.explain.map((b) => ("text" in b ? { kind: "text", text: b.text } : "tip" in b ? { kind: "tip", text: b.tip } : { kind: "notation", music: b.music, caption: b.caption })),
    demonstration: { widget: spec.demo.widget, music: spec.demo.music, steps: spec.demo.steps, audio: { playback: "synth-generated", optional: true }, textAlternative: spec.demo.text },
    guided: spec.guided.map((p, i) => pickItem(a, node, p, "guided", i + 1, inLesson)),
    independent: [...spec.independent.map((p, i) => pickItem(a, node, p, "independent", i + 1, inLesson)), ...(spec.fixedIndependent ?? [])],
    recap: spec.recap,
    spacedReview: spec.review.map((r) => ({ templateId: r.t, afterDays: r.afterDays })),
    mastery: {
      conceptIds: node.conceptIds,
      countsAsEvidence: "independent-steps-only",
      completion: "The lesson is complete when every step has been answered correctly (retries allowed). Only first-attempt, hint-free independent answers count as mastery evidence; guided steps never do.",
    },
    provenance: {
      authoredBy: "Music Theory Path curriculum team (Brief 05, drafted with AI assistance; pending qualified teacher review)",
      originality: "original",
      bookSectionIds: node.bookSectionIds,
      outcomeIds: node.outcomeIds,
      notes: spec.notes,
    },
  };
  return lesson;
}

/** Rhythm builders: [value, options]. Pitchless (a rhythm line) with an automatic text alternative. */
export type R = [value: string, opts?: { dots?: number; rest?: boolean; tie?: boolean; beam?: "begin" | "continue" | "end"; label?: string }];
const toEv = ([value, o = {}]: R) => {
  const extra: Record<string, unknown> = {};
  if (o.tie) extra.tieToNext = true;
  if (o.beam) extra.beam = o.beam;
  if (o.label) extra.label = o.label;
  return (o.rest ? plainRest(value as never, o.dots ?? 0, extra) : plainNote(value as never, o.dots ?? 0, extra));
};
/** One or more bars of rhythm. Pass a time signature to print it (then every bar must add up). */
export const rhythm = (bars: R[][], text?: string, ts?: string): Frag => {
  const f = rhythmLine(bars.map((b, i) => ({ events: b.map(toEv), ...(i === bars.length - 1 && ts ? { barline: "final" as const } : {}) })), ts ? { timeSignature: ts } : {});
  return text ? { ...f, textAlternative: text } : f;
};
/** Shorthand: n("crotchet") etc. */
export const nt = (value: string, o: NonNullable<R[1]> = {}): R => [value, o];
export const rs = (value: string, o: NonNullable<R[1]> = {}): R => [value, { ...o, rest: true }];

/** A hand-written melody: [pitch, value, options] per note; `rest: true` makes a rest (pitch ignored). */
export type M = [pitch: string, value: string, o?: { rest?: boolean; dots?: number; dynamic?: string; art?: string; slur?: "start" | "stop"; label?: string; tie?: boolean; beam?: "begin" | "continue" | "end" }];
export const melody = (clef: "treble" | "bass", barList: M[][], ts: string, key: string | undefined, text: string, extra: Partial<Frag> = {}): Frag =>
  frag(
    clef,
    barList.map((b, bi) => ({
      events: b.map(([pitch, value, o = {}]) => {
        if (o.rest) return plainRest(value as never, o.dots ?? 0, {});
        const e: Record<string, unknown> = {};
        if (o.dynamic) e.dynamic = o.dynamic;
        if (o.art) e.articulations = [o.art];
        if (o.slur) e.slur = o.slur;
        if (o.label) e.label = o.label;
        if (o.tie) e.tieToNext = true;
        if (o.beam) e.beam = o.beam;
        if (o.dots) e.duration = { value, dots: o.dots };
        return note(pitch, value as never, e);
      }),
      ...(bi === barList.length - 1 ? { barline: "final" as const } : {}),
    })),
    text,
    { timeSignature: ts, ...(key ? { key, showKeySignature: true } : { showKeySignature: false }), ...extra },
  );

/** A hand-written fixed item. Its answer is re-derived by the validator and the engine like any other. */
export function fixedItem(f: { id: string; templateId: string; prompt: string; music: Frag; answer: ExerciseItem["answer"]; hints: string[]; correct: string; mistakes: Record<string, string> }): ExerciseItem {
  return { id: f.id, templateId: f.templateId, templateVersion: 1, seed: null, evidence: "independent", prompt: f.prompt, music: f.music, answer: f.answer, hints: f.hints, feedback: { correct: f.correct, mistakes: f.mistakes, fallback: "Not quite. Look at the melody again, one thing at a time: clef, key, time signature, then the marks." } };
}
