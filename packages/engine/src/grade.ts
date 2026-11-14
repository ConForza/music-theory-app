import type { CurriculumIndex, ExerciseItem, MusicScope } from "@mtp/curriculum";
import { EngineError, itemContext, type ItemContext } from "./context.ts";
import { gradeSimple } from "./graders/index.ts";
import type { Verdict } from "./graders/types.ts";
import { inputFor, type ItemInput } from "./inputs.ts";
import { LearnerResponse, type SimpleResponse } from "./responses.ts";

/**
 * The response kinds each input offers. The server grades only answers the item's own input could produce, so a
 * client cannot, for example, send a bare letter to a task that assesses spelling, sound or octave.
 */
const RESPONSE_FOR_INPUT: Record<Exclude<ItemInput["kind"], "composite">, SimpleResponse["kind"]> = {
  choice: "choice",
  "multi-choice": "multi-choice",
  "pitch-letter": "pitch-letter",
  "note-name": "pitch",
  "staff-position": "staff-position",
  keyboard: "keyboard",
  "pitch-sequence": "pitch-sequence",
  "chord-builder": "chord-notes",
  "rhythm-builder": "rhythm",
  "rhythm-grouping": "rhythm",
  barlines: "barlines",
  "time-signature": "time-signature",
  "key-name": "key-name",
  "key-signature-writer": "key-signature",
  "interval-name": "interval-name",
  "chord-name": "chord-name",
  ornament: "ornament",
  progression: "progression",
};
function requireKind(input: Exclude<ItemInput, { kind: "composite" }>, r: SimpleResponse) {
  const want = RESPONSE_FOR_INPUT[input.kind];
  if (r.kind !== want) throw new EngineError("response_mismatch", `This question takes a ${want} answer`);
  // An assessed octave must be given; an unassessed one may be given and is ignored by the comparison (review R12).
  if (input.kind === "note-name" && r.kind === "pitch" && input.octave !== null && !/\d$/.test(r.pitch)) {
    throw new EngineError("response_mismatch", "Give the octave as well");
  }
}

export interface GradeResult extends Verdict {
  /** The grader id from engine.json that decided the result. */
  graderId: string;
  /** Learner-facing message: authored feedback for the diagnosed mistake, else the family's, else the item fallback. */
  message: string;
}

function knownCategories(c: ItemContext): Set<string> {
  return new Set([...c.family.mistakeCategories, ...c.template.extraMistakeCategories].map((m) => m.id));
}

export function messageFor(c: ItemContext, correct: boolean, category: string | null): string {
  const item = c.item;
  if (correct) return item.feedback.correct;
  if (category && item.feedback.mistakes[category]) return item.feedback.mistakes[category]!;
  const fam = [...c.family.mistakeCategories, ...c.template.extraMistakeCategories].find((m) => m.id === category);
  return fam?.feedback ?? item.feedback.fallback;
}

/**
 * Grade a learner response deterministically. Throws EngineError("malformed_response" | "response_mismatch")
 * when the response does not fit the item; the HTTP layer turns that into a 400 without recording anything.
 */
export function gradeItem(ix: CurriculumIndex, item: ExerciseItem, rawResponse: unknown, scope?: MusicScope): GradeResult {
  const parsed = LearnerResponse.safeParse(rawResponse);
  if (!parsed.success) throw new EngineError("malformed_response", parsed.error.issues[0]?.message ?? "Malformed answer");
  const r = parsed.data;
  const c = itemContext(ix, item, scope);
  const input = inputFor(ix, item, scope);
  const known = knownCategories(c);
  const clean = (v: Verdict): Verdict => ({ ...v, category: v.category && known.has(v.category) ? v.category : null });

  let v: Verdict & { graderId: string };
  if (item.answer.kind === "composite") {
    if (r.kind !== "composite") throw new EngineError("response_mismatch", "Answer every part of this question");
    const partInputs = input.kind === "composite" ? input.parts : [];
    for (const [id, pr] of Object.entries(r.parts)) {
      const pi = partInputs.find((p) => p.id === id);
      if (!pi) throw new EngineError("response_mismatch", `Unknown part ${id}`);
      requireKind(pi.input, pr);
    }
    const parts = item.answer.parts.map((p) => {
      const pr = r.parts[p.id];
      if (!pr) return { id: p.id, correct: false, category: null, reason: "This part has no answer yet." };
      const pv = gradeSimple(c, p.answer, pr, false);
      return { id: p.id, correct: pv.correct, category: pv.category, reason: pv.reason };
    });
    const firstWrong = parts.find((p) => !p.correct);
    v = {
      graderId: "g.composite",
      correct: !firstWrong,
      category: firstWrong ? (firstWrong.category && known.has(firstWrong.category) ? firstWrong.category : "evidence-misread") : null,
      reason: firstWrong ? `Part ${parts.indexOf(firstWrong) + 1}: ${firstWrong.reason ?? "not quite."}` : null,
      parts,
    };
  } else {
    if (r.kind === "composite" || input.kind === "composite") throw new EngineError("response_mismatch", "This question has one answer");
    requireKind(input, r);
    v = gradeSimple(c, item.answer, r, true);
  }
  const { note, ...rest } = v;
  const out = clean(rest);
  const base = messageFor(c, out.correct, out.category);
  return { ...out, graderId: v.graderId, message: out.correct && note ? `${base} ${note}` : base };
}
