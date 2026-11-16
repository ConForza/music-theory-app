/**
 * Grader registry: one implementation per grader id in content/engine/engine.json. Every grader is a pure,
 * deterministic function of (item, scope, response). No model or network call is involved.
 */
import type { SimpleAnswerSpec } from "@mtp/curriculum";
import { EngineError, type ItemContext } from "../context.ts";
import type { SimpleResponse } from "../responses.ts";
import { gradeAccidentalState, gradeKeyboard, gradePitchSpelling, gradeStaffPosition } from "./pitch.ts";
import { gradeBarlines, gradeRhythm, gradeTimeSignature } from "./rhythm.ts";
import {
  gradeChoice,
  gradeChord,
  gradeChromatic,
  gradeInterval,
  gradeKeySignature,
  gradeMultiChoice,
  gradeOrnament,
  gradeProgression,
  gradeScale,
  gradeTransposition,
} from "./theory.ts";
import type { Verdict } from "./types.ts";

type AnyGrader = (c: ItemContext, a: SimpleAnswerSpec, r: SimpleResponse) => Verdict;
const g = (f: unknown) => f as AnyGrader;

export const GRADERS: Record<string, { kinds: Array<SimpleAnswerSpec["kind"] | "composite">; grade: AnyGrader | null }> = {
  "g.choice-exact": { kinds: ["choice"], grade: g(gradeChoice) },
  "g.multi-choice-set": { kinds: ["multi-choice"], grade: g(gradeMultiChoice) },
  "g.duration-equivalence": { kinds: ["rhythm"], grade: g(gradeRhythm) },
  "g.rhythm-bar": { kinds: ["rhythm"], grade: g(gradeRhythm) },
  "g.grouping-check": { kinds: ["rhythm"], grade: g(gradeRhythm) },
  "g.barlines": { kinds: ["rhythm"], grade: g(gradeBarlines) },
  "g.time-signature": { kinds: ["time-signature"], grade: g(gradeTimeSignature) },
  "g.tuplet": { kinds: ["rhythm"], grade: g(gradeRhythm) },
  "g.pitch-spelling": { kinds: ["pitch"], grade: g(gradePitchSpelling) },
  "g.staff-position": { kinds: ["staff-position"], grade: g(gradeStaffPosition) },
  "g.keyboard-key": { kinds: ["pitch"], grade: g(gradeKeyboard) },
  "g.accidental-state": { kinds: ["pitch"], grade: g(gradeAccidentalState) },
  "g.scale-spelling": { kinds: ["pitch-sequence"], grade: g(gradeScale) },
  "g.key-signature": { kinds: ["key-signature"], grade: g(gradeKeySignature) },
  "g.degree": { kinds: ["choice"], grade: g(gradeChoice) },
  "g.interval": { kinds: ["interval"], grade: g(gradeInterval) },
  "g.chord-function": { kinds: ["chord"], grade: g(gradeChord) },
  "g.cadence-choice": { kinds: ["chord-progression"], grade: g(gradeProgression) },
  "g.transposition": { kinds: ["pitch-sequence"], grade: g(gradeTransposition) },
  "g.chromatic-scale": { kinds: ["pitch-sequence"], grade: g(gradeChromatic) },
  "g.ornament-sign": { kinds: ["ornament-sign"], grade: g(gradeOrnament) },
  "g.composite": { kinds: ["composite"], grade: null },
};

/** The grader for a simple answer when it is not the family's own kind (choice items in any family, composite parts). */
export function defaultGraderId(a: SimpleAnswerSpec): string {
  switch (a.kind) {
    case "choice":
      return "g.choice-exact";
    case "multi-choice":
      return "g.multi-choice-set";
    case "pitch":
      return "g.pitch-spelling";
    case "staff-position":
      return "g.staff-position";
    case "pitch-sequence":
      return a.derivation.rule === "scale" ? "g.scale-spelling" : a.derivation.rule === "transpose" ? "g.transposition" : "g.chromatic-scale";
    case "rhythm":
      return a.task === "place-barlines" ? "g.barlines" : a.task === "regroup" ? "g.grouping-check" : a.task === "equivalent-value" ? "g.duration-equivalence" : a.task === "add-tuplet" ? "g.tuplet" : "g.rhythm-bar";
    case "time-signature":
      return "g.time-signature";
    case "key-signature":
      return "g.key-signature";
    case "interval":
      return "g.interval";
    case "chord":
      return "g.chord-function";
    case "ornament-sign":
      return "g.ornament-sign";
    case "chord-progression":
      return "g.cadence-choice";
  }
}

/** Pick the grader: the family's own grader when it handles this answer kind, else the kind's default. */
export function graderIdFor(c: ItemContext, a: SimpleAnswerSpec, top: boolean): string {
  const own = GRADERS[c.family.graderId];
  if (top && own?.kinds.includes(a.kind)) {
    // Within a family, the answer's task decides between specialised rhythm and sequence graders.
    if (a.kind === "rhythm" || a.kind === "pitch-sequence") return defaultGraderId(a);
    return c.family.graderId;
  }
  return defaultGraderId(a);
}

export function gradeSimple(c: ItemContext, a: SimpleAnswerSpec, r: SimpleResponse, top: boolean): Verdict & { graderId: string } {
  const id = graderIdFor(c, a, top);
  const grader = GRADERS[id]?.grade;
  if (!grader) throw new EngineError("unsupported", `No grader for ${id}`);
  return { ...grader(c, a, r), graderId: id };
}
