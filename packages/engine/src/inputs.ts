/**
 * How a learner answers an item: an input descriptor per answer kind. Descriptors are sent to the browser,
 * so they NEVER contain the answer — only what the question already shows (given notes, the time signature,
 * the events whose bar-lines are missing) and the controls the learner may use (values in scope, clef,
 * ledger-line limit, which accidentals exist at this grade).
 */
import { music, type ExerciseItem, type MusicScope, type NotationEvent, type SimpleAnswerSpec } from "@mtp/curriculum";
import { itemContext, type ItemContext } from "./context.ts";
import { signaturePitches } from "./graders/theory.ts";
import type { CurriculumIndex } from "@mtp/curriculum";

type Clef = "treble" | "bass" | "alto" | "tenor";
type Option = { id: string; label: string };
export type RhythmShape = { kind: "note" | "rest"; duration: { value: music.NoteValue; dots: number }; tieToNext?: boolean; beam?: "begin" | "continue" | "end"; wholeBar?: boolean } | { kind: "tuplet"; actual: number; normal: number; events: RhythmShape[] };

export type ItemInput =
  | { kind: "choice"; options: Option[] }
  | { kind: "multi-choice"; options: Option[] }
  | { kind: "pitch-letter" }
  | { kind: "note-name"; accidentals: boolean; doubleAccidentals: boolean; octave: { min: number; max: number } | null }
  | {
      kind: "staff-position";
      clef: Clef;
      maxLedgerLines: number;
      accidentals: boolean;
      doubleAccidentals: boolean;
      key?: string;
      /** Notes already printed on the stave (e.g. the lower note of an interval to build from). */
      shown?: string[];
    }
  | { kind: "keyboard"; from: string; to: string; spelling: boolean }
  | {
      kind: "pitch-sequence";
      purpose: "scale" | "transposition" | "chromatic";
      clef: Clef;
      /** Key signature printed on the answer stave, if any. */
      key?: string;
      /** The learner chooses the key signature of the answer from these keys. */
      keyOptions?: string[];
      length: number;
      given: string[];
      maxLedgerLines: number;
      accidentals: boolean;
      doubleAccidentals: boolean;
    }
  | { kind: "chord-builder"; clef: Clef; key: string; maxLedgerLines: number; minNotes: number; maxNotes: number }
  | {
      kind: "rhythm-builder";
      mode: "complete-bar" | "equivalent-value" | "rewrite" | "add-tuplet";
      timeSignature: string | null;
      bars: number;
      given: RhythmShape[];
      values: music.NoteValue[];
      maxDots: number;
      rests: boolean;
      ties: boolean;
      tuplets: Array<{ actual: number; normal: number }>;
      /** equivalent-value: the length to match, as a fraction of a semibreve. */
      target?: [number, number];
    }
  | { kind: "rhythm-grouping"; timeSignature: string; measures: Array<{ events: RhythmShape[] }> }
  | { kind: "barlines"; timeSignature: string; events: RhythmShape[]; final: boolean }
  | { kind: "time-signature"; tops: number[]; bottoms: number[] }
  | { kind: "key-name"; options: string[]; /** The key signature to read, when the question has no music. */ signature?: { clef: Clef; pitches: string[] } }
  | { kind: "key-signature-writer"; clef: Clef; maxAccidentals: number }
  | { kind: "interval-name"; maxNumber: number; qualities: string[] | null; compound: boolean }
  | { kind: "chord-name"; romans: string[]; inversions: string[] }
  | { kind: "ornament"; options: music.Ornament[] }
  | { kind: "progression"; labels: string[]; romans: string[] }
  | { kind: "composite"; parts: Array<{ id: string; prompt: string; input: Exclude<ItemInput, { kind: "composite" }> }> };

const VALUE_ORDER: music.NoteValue[] = ["breve", "semibreve", "minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"];
const shape = (e: NotationEvent): RhythmShape =>
  e.kind === "tuplet"
    ? { kind: "tuplet", actual: e.actual, normal: e.normal, events: e.events.map(shape) }
    : {
        kind: e.kind === "rest" ? "rest" : "note",
        duration: { value: e.duration.value, dots: e.duration.dots ?? 0 },
        ...(e.kind !== "rest" && e.tieToNext ? { tieToNext: true } : {}),
        ...(e.beam ? { beam: e.beam } : {}),
        ...(e.kind === "rest" && e.wholeBar ? { wholeBar: true } : {}),
      };
export const rhythmShape = shape;
const stripBeams = (e: RhythmShape): RhythmShape => {
  if (e.kind === "tuplet") return { ...e, events: e.events.map(stripBeams) };
  const { beam: _b, ...rest } = e;
  return rest;
};

function tupletsFor(sc: MusicScope): Array<{ actual: number; normal: number }> {
  const t = sc.tuplets ?? [];
  const out: Array<{ actual: number; normal: number }> = [];
  if (t.includes("triplet")) out.push({ actual: 3, normal: 2 });
  if (t.includes("duplet")) out.push({ actual: 2, normal: 3 });
  if (t.includes("irregular")) out.push({ actual: 5, normal: 4 }, { actual: 6, normal: 4 }, { actual: 7, normal: 4 });
  return out;
}

function values(sc: MusicScope): music.NoteValue[] {
  const v = sc.noteValues?.length ? sc.noteValues : ["semibreve", "minim", "crotchet", "quaver", "semiquaver"];
  return VALUE_ORDER.filter((x) => v.includes(x));
}

/** Keyboard range: the octave containing the note the task is about, plus the octave above. */
function keyboardRange(pitches: string[]): { from: string; to: string } {
  const os = pitches.map((p) => music.parsePitch(p).octave);
  const lo = Math.min(...os, 4);
  return { from: `C${lo}`, to: `C${Math.max(lo + 2, Math.max(...os) + 1)}` };
}

function inputForAnswer(c: ItemContext, a: SimpleAnswerSpec): Exclude<ItemInput, { kind: "composite" }> {
  const { item, scope: sc, family } = c;
  const clefOf = (x?: string): Clef => ((x ?? item.music?.clef ?? sc.clefs?.[0] ?? "treble") as Clef);
  switch (a.kind) {
    case "choice":
      return { kind: "choice", options: a.options };
    case "multi-choice":
      return { kind: "multi-choice", options: a.options };
    case "pitch": {
      if (family.id === "fam.keyboard") {
        const about = a.reference ? [a.reference] : a.accepted;
        return { kind: "keyboard", ...keyboardRange(about), spelling: a.spellingSensitive && a.relation !== "same-sound" };
      }
      const hasSignature = Boolean(item.music?.key && item.music.showKeySignature !== false && music.keyFifths(music.parseKey(item.music.key)) !== 0);
      const letterOnly =
        family.id === "fam.note-read" && !sc.accidentals && !hasSignature && !a.octaveSensitive && a.relation === "same" && a.accepted.every((p) => music.parsePitch(p).alter === 0);
      if (letterOnly) return { kind: "pitch-letter" };
      const octaves = a.accepted.map((p) => music.parsePitch(p).octave);
      return {
        kind: "note-name",
        accidentals: Boolean(sc.accidentals || sc.keySignatures || sc.doubleAccidentals || a.accepted.some((p) => music.parsePitch(p).alter !== 0) || a.reference),
        doubleAccidentals: Boolean(sc.doubleAccidentals),
        octave: a.octaveSensitive ? { min: Math.min(...octaves, 2) - 0, max: Math.max(...octaves, 5) } : null,
      };
    }
    case "staff-position":
      return {
        kind: "staff-position",
        clef: a.clef,
        maxLedgerLines: a.target.maxLedgerLines,
        accidentals: Boolean(sc.accidentals) || a.target.alter !== 0,
        doubleAccidentals: Boolean(sc.doubleAccidentals) || Math.abs(a.target.alter) === 2,
      };
    case "pitch-sequence": {
      const d = a.derivation;
      const base = { clef: a.clef, maxLedgerLines: sc.maxLedgerLines ?? 2, accidentals: true, doubleAccidentals: Boolean(sc.doubleAccidentals) };
      if (d.rule === "scale") {
        const len = d.direction === "ascending-descending" ? 15 : 8;
        return { kind: "pitch-sequence", purpose: "scale", ...base, length: len, given: [d.start] };
      }
      if (d.rule === "chromatic") return { kind: "pitch-sequence", purpose: "chromatic", ...base, length: 13, given: [d.start] };
      const sourceLen = item.music ? item.music.measures.flatMap((m) => (m.events ? [m.events] : (m.voices ?? []).map((v) => v.events))).flat().flatMap((e) => (e.kind === "tuplet" ? e.events : [e])).filter((e) => e.kind !== "rest").length : a.accepted[0]!.length;
      const octave = d.interval === "P8";
      return {
        kind: "pitch-sequence",
        purpose: "transposition",
        ...base,
        ...(octave && a.key ? { key: a.key } : {}),
        ...(!octave ? { keyOptions: (sc.keys ?? []).filter((k) => music.parseKey(k).mode === music.parseKey(d.sourceKey).mode) } : {}),
        length: sourceLen,
        given: [],
      };
    }
    case "rhythm": {
      const ts = a.timeSignature ?? item.music?.timeSignature ?? null;
      const builder = (mode: "complete-bar" | "equivalent-value" | "rewrite" | "add-tuplet", bars: number, given: RhythmShape[] = []): ItemInput => ({
        kind: "rhythm-builder",
        mode,
        timeSignature: mode === "equivalent-value" ? null : ts,
        bars,
        given,
        values: values(sc),
        maxDots: sc.maxDots ?? 0,
        rests: sc.rests !== false,
        ties: Boolean(sc.ties) || mode === "equivalent-value",
        tuplets: tupletsFor(sc),
        ...(a.target ? { target: a.target } : {}),
      });
      if (a.task === "complete-bar") return builder("complete-bar", 1, (a.given ?? []).map(shape)) as never;
      if (a.task === "equivalent-value") return builder("equivalent-value", 1) as never;
      if (a.task === "add-tuplet") return builder("add-tuplet", a.accepted[0]!.length) as never;
      if (a.task === "place-barlines") {
        const events = a.accepted[0]!.flatMap((m) => m.events ?? m.voices?.[0]?.events ?? []).map(shape).map(stripBeams);
        const last = a.accepted[0]![a.accepted[0]!.length - 1];
        return { kind: "barlines", timeSignature: ts!, events, final: last?.barline === "final" || last?.barline === "double" };
      }
      // regroup: when only the beaming differs, the learner joins and splits beams; otherwise they rewrite the bars.
      const shown = item.music?.measures.map((m) => ({ events: (m.events ?? m.voices?.[0]?.events ?? []).map(shape) })) ?? [];
      const sameNotes = (x: RhythmShape[], y: RhythmShape[]) => JSON.stringify(x.map(stripBeams)) === JSON.stringify(y.map(stripBeams));
      const beamsOnly = shown.length === a.accepted[0]!.length && a.accepted[0]!.every((m, i) => sameNotes((m.events ?? []).map(shape), shown[i]?.events ?? []));
      if (beamsOnly) return { kind: "rhythm-grouping", timeSignature: ts!, measures: shown.map((m) => ({ events: m.events.map(stripBeams) })) };
      return builder("rewrite", Math.max(1, shown.length)) as never;
    }
    case "time-signature": {
      const tss = (sc.timeSignatures?.length ? sc.timeSignatures : ["2/4", "3/4", "4/4"]).map(music.parseTimeSignature);
      return { kind: "time-signature", tops: [...new Set(tss.map((t) => t.top))].sort((x, y) => x - y), bottoms: [...new Set(tss.map((t) => t.bottom))].sort((x, y) => x - y) };
    }
    case "key-signature":
      if (a.task === "name-key") {
        const options = sc.keys?.length ? sc.keys : a.accepted;
        const showSignature = !item.music && !c.template.id.endsWith("relative-key");
        return { kind: "key-name", options, ...(showSignature ? { signature: { clef: a.clef, pitches: signaturePitches(music.parseKey(a.accepted[0]!), a.clef) } } : {}) };
      }
      return { kind: "key-signature-writer", clef: a.clef, maxAccidentals: 7 };
    case "interval": {
      if (a.task === "identify") {
        const numberOnly = sc.intervalQuality !== "number-and-quality";
        return {
          kind: "interval-name",
          maxNumber: sc.compoundIntervals ? 15 : 8,
          qualities: numberOnly ? null : sc.chromaticIntervals ? ["d", "m", "M", "P", "A"] : ["m", "M", "P"],
          compound: Boolean(sc.compoundIntervals),
        };
      }
      return { kind: "staff-position", clef: clefOf(), maxLedgerLines: sc.maxLedgerLines ?? 2, accidentals: true, doubleAccidentals: Boolean(sc.doubleAccidentals), ...(a.key ? { key: a.key } : {}), shown: [a.lower] };
    }
    case "chord":
      if (a.task === "identify") return { kind: "chord-name", romans: sc.chordDegrees?.length ? sc.chordDegrees : ["I"], inversions: sc.inversions?.length ? sc.inversions : ["a"] };
      return { kind: "chord-builder", clef: clefOf(), key: a.key, maxLedgerLines: sc.maxLedgerLines ?? 2, minNotes: 3, maxNotes: 4 };
    case "ornament-sign":
      return { kind: "ornament", options: (sc.ornaments?.length ? sc.ornaments : music.ORNAMENTS) as music.Ornament[] };
    case "chord-progression":
      return { kind: "progression", labels: a.points.map((p) => p.label), romans: sc.chordDegrees?.length ? sc.chordDegrees : ["I", "ii", "IV", "V"] };
  }
}

export function inputFor(ix: CurriculumIndex, item: ExerciseItem, scope?: MusicScope): ItemInput {
  const c = itemContext(ix, item, scope);
  if (item.answer.kind === "composite") {
    return { kind: "composite", parts: item.answer.parts.map((p) => ({ id: p.id, prompt: p.prompt, input: inputForAnswer(c, p.answer) })) };
  }
  return inputForAnswer(c, item.answer);
}
