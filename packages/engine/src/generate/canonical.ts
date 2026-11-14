/**
 * A correct and a definitely-wrong learner response for any item, built from the item's own answer contract.
 * Used by the generator's solvability gate and by tests that drive every family end to end.
 */
import { music, type CurriculumIndex, type ExerciseItem, type Measure, type MusicScope, type NotationEvent, type SimpleAnswerSpec } from "@mtp/curriculum";
import { itemContext } from "../context.ts";
import { shownNote } from "../derive.ts";
import { inputFor, type ItemInput } from "../inputs.ts";
import { staffTargets } from "../graders/pitch.ts";
import { signaturePitches } from "../graders/theory.ts";
import type { LearnerResponse, SimpleResponse } from "../responses.ts";

const P = music.parsePitch;
const F = music.formatPitch;
type RE = Extract<SimpleResponse, { kind: "rhythm" }>["measures"][number]["events"][number];

export function toRhythmEvent(e: NotationEvent): RE {
  if (e.kind === "tuplet") return { kind: "tuplet", actual: e.actual, normal: e.normal, events: e.events.map(toRhythmEvent) as never };
  return {
    kind: e.kind === "rest" ? "rest" : "note",
    duration: { value: e.duration.value, dots: e.duration.dots ?? 0 },
    ...(e.kind !== "rest" && e.tieToNext ? { tieToNext: true } : {}),
    ...(e.beam ? { beam: e.beam } : {}),
    ...(e.kind === "rest" && e.wholeBar ? { wholeBar: true } : {}),
  } as RE;
}
const toMeasures = (ms: Measure[]) => ms.map((m) => ({ events: (m.events ?? m.voices?.[0]?.events ?? []).map(toRhythmEvent) }));
const stepUp = (p: music.Pitch): music.Pitch => music.pitchFromNumbers(music.diatonicNumber(p) + 1, music.chromaticNumber(p) + (p.step === "E" || p.step === "B" ? 1 : 2));

function pitchText(p: music.Pitch, withOctave: boolean) {
  return withOctave ? F(p) : music.formatPitchClass(p);
}

function canonical(ix: CurriculumIndex, item: ExerciseItem, a: SimpleAnswerSpec, input: ItemInput, scope?: MusicScope): SimpleResponse {
  switch (a.kind) {
    case "choice":
      return { kind: "choice", optionId: a.correctOptionIds[0]! };
    case "multi-choice":
      return { kind: "multi-choice", optionIds: [...a.correctOptionIds] };
    case "pitch": {
      const target = a.relation === "same" ? (shownNote(item) ?? P(a.accepted[0]!)) : P(a.accepted[0]!);
      if (input.kind === "pitch-letter") return { kind: "pitch-letter", letter: target.step };
      if (input.kind === "keyboard") return { kind: "keyboard", key: music.chromaticNumber(P(a.accepted[0]!)), spelling: a.accepted[0]! };
      return { kind: "pitch", pitch: pitchText(target, a.octaveSensitive) };
    }
    case "staff-position": {
      const c = itemContext(ix, item, scope);
      const t = staffTargets(a, c.scope.maxLedgerLines ?? a.target.maxLedgerLines);
      return { kind: "staff-position", pitch: F(t[0] ?? P(a.accepted[0]!)) };
    }
    case "pitch-sequence":
      return { kind: "pitch-sequence", pitches: [...a.accepted[0]!], ...(a.key && a.derivation.rule === "transpose" && a.derivation.interval !== "P8" && a.derivation.interval !== "P1" ? { key: a.key } : {}) };
    case "rhythm":
      if (a.task === "place-barlines") {
        const events = a.accepted[0]!.flatMap((m) => m.events ?? []);
        return { kind: "barlines", after: (music.barlinePositions(events as never, a.timeSignature!) ?? []).filter((x) => x < events.length), final: true };
      }
      return { kind: "rhythm", measures: toMeasures(a.accepted[0]!) } as SimpleResponse;
    case "time-signature": {
      const ts = music.parseTimeSignature(a.accepted[0]!);
      return { kind: "time-signature", top: ts.top, bottom: ts.bottom };
    }
    case "key-signature":
      if (a.task === "name-key") return { kind: "key-name", key: a.accepted[0]! };
      return { kind: "key-signature", accidentals: signaturePitches(music.parseKey(a.accepted[0]!), a.clef).map((pitch) => ({ pitch })) };
    case "interval":
      if (a.task === "identify") {
        const iv = music.intervalBetween(P(a.lower), P(a.upper!));
        const numberOnly = (a.acceptedIntervals ?? []).every((x) => /^\d+$/.test(x));
        return { kind: "interval-name", number: iv.number, ...(numberOnly ? {} : { quality: iv.quality }) };
      }
      return { kind: "staff-position", pitch: a.acceptedPitches![0]! };
    case "chord":
      if (a.task === "identify") return { kind: "chord-name", roman: a.acceptedChords![0]!.roman, inversion: a.acceptedChords![0]!.inversion };
      return { kind: "chord-notes", pitches: [...a.acceptedVoicings![0]!] };
    case "ornament-sign":
      return { kind: "ornament", sign: a.accepted[0]! };
    case "chord-progression": {
      const combos: Array<Record<string, string>> = [{}];
      for (const p of a.points) {
        const next: Array<Record<string, string>> = [];
        for (const c of combos) for (const r of p.accepted) next.push({ ...c, [p.label]: r });
        combos.splice(0, combos.length, ...next);
      }
      const ok = combos.find((c) => a.cadences.every((cad) => {
        const t = music.classifyCadence(c[cad.labels[0]]!, c[cad.labels[1]]!);
        return t !== null && cad.acceptedTypes.includes(t);
      }));
      return { kind: "progression", chords: (ok ?? combos[0]!) as Record<string, "I"> };
    }
  }
}

function wrongFor(ix: CurriculumIndex, item: ExerciseItem, a: SimpleAnswerSpec, input: ItemInput, scope?: MusicScope): SimpleResponse | null {
  const good = canonical(ix, item, a, input, scope);
  switch (good.kind) {
    case "choice": {
      const other = (a as Extract<SimpleAnswerSpec, { kind: "choice" }>).options.find((o) => o.id !== good.optionId);
      return other ? { kind: "choice", optionId: other.id } : null;
    }
    case "multi-choice":
      return { kind: "multi-choice", optionIds: good.optionIds.slice(0, Math.max(1, good.optionIds.length - 1)).concat(good.optionIds.length === 1 ? ((a as Extract<SimpleAnswerSpec, { kind: "multi-choice" }>).options.find((o) => !good.optionIds.includes(o.id))?.id ?? []) : []) };
    case "pitch-letter":
      return { kind: "pitch-letter", letter: "CDEFGAB"[("CDEFGAB".indexOf(good.letter) + 1) % 7] as "C" };
    case "pitch": {
      const g = /\d$/.test(good.pitch) ? P(good.pitch) : { ...music.parsePitchClass(good.pitch), octave: 4 };
      return { kind: "pitch", pitch: pitchText(stepUp(g), /\d$/.test(good.pitch)) };
    }
    case "keyboard":
      return { kind: "keyboard", key: good.key + 2 };
    case "staff-position":
      return { kind: "staff-position", pitch: F(stepUp(P(good.pitch))) };
    case "pitch-sequence": {
      const ps = [...good.pitches];
      const i = Math.min(2, ps.length - 1);
      ps[i] = F(stepUp(P(ps[i]!)));
      return { ...good, pitches: ps };
    }
    case "rhythm": {
      const ms = good.measures.map((m) => ({ events: [...m.events] }));
      const last = ms[ms.length - 1]!;
      if (last.events.length > 1) last.events.pop();
      else last.events.push({ kind: "note", duration: { value: "crotchet", dots: 0 } } as RE);
      return { kind: "rhythm", measures: ms };
    }
    case "barlines":
      return { kind: "barlines", after: good.after.length ? good.after.map((x, i) => (i === 0 ? x + 1 : x)) : [1], final: true };
    case "time-signature":
      return { kind: "time-signature", top: good.top === 4 ? 3 : 4, bottom: good.bottom };
    case "key-name": {
      const f = music.keyFifths(music.parseKey(good.key));
      return { kind: "key-name", key: f >= 3 ? "C major" : "Eb major" };
    }
    case "key-signature":
      return good.accidentals.length > 0 ? { kind: "key-signature", accidentals: good.accidentals.slice(1) } : { kind: "key-signature", accidentals: [{ pitch: "F#5" }] };
    case "interval-name":
      return { ...good, number: good.number === 2 ? 3 : good.number - 1 };
    case "chord-name":
      return { kind: "chord-name", roman: good.roman === "V" ? "IV" : "V", inversion: good.inversion };
    case "chord-notes":
      return { kind: "chord-notes", pitches: good.pitches.slice(0, 2) };
    case "ornament":
      return { kind: "ornament", sign: good.sign === "turn" ? "trill" : "turn" };
    case "progression": {
      const p0 = (a as Extract<SimpleAnswerSpec, { kind: "chord-progression" }>).points[0]!;
      const key = music.parseKey((a as Extract<SimpleAnswerSpec, { kind: "chord-progression" }>).key);
      const bad = (["I", "ii", "IV", "V"] as const).find((r) => !p0.melodyPitches.every((m) => music.triadContains(key, r, P(m))));
      return bad ? { kind: "progression", chords: { ...good.chords, [p0.label]: bad } } : null;
    }
  }
}

export function canonicalResponse(ix: CurriculumIndex, item: ExerciseItem, scope?: MusicScope): LearnerResponse {
  const input = inputFor(ix, item, scope);
  if (item.answer.kind === "composite") {
    const parts = item.answer.parts.map((p, i) => [p.id, canonical(ix, item, p.answer, (input as Extract<ItemInput, { kind: "composite" }>).parts[i]!.input, scope)]);
    return { kind: "composite", parts: Object.fromEntries(parts) };
  }
  return canonical(ix, item, item.answer, input, scope);
}

export function wrongResponse(ix: CurriculumIndex, item: ExerciseItem, scope?: MusicScope): LearnerResponse | null {
  const input = inputFor(ix, item, scope);
  if (item.answer.kind === "composite") {
    const good = canonicalResponse(ix, item, scope) as Extract<LearnerResponse, { kind: "composite" }>;
    const first = item.answer.parts[0]!;
    const w = wrongFor(ix, item, first.answer, (input as Extract<ItemInput, { kind: "composite" }>).parts[0]!.input, scope);
    return w ? { kind: "composite", parts: { ...good.parts, [first.id]: w } } : null;
  }
  return wrongFor(ix, item, item.answer, input, scope);
}
