import type { CurriculumIndex, ExerciseItem, MusicScope } from "@mtp/curriculum";
import { EngineError, itemContext, type ItemContext } from "./context.ts";
import { gradeSimple } from "./graders/index.ts";
import type { Verdict } from "./graders/types.ts";
import { LearnerResponse } from "./responses.ts";

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
  const known = knownCategories(c);
  const clean = (v: Verdict): Verdict => ({ ...v, category: v.category && known.has(v.category) ? v.category : null });

  let v: Verdict & { graderId: string };
  if (item.answer.kind === "composite") {
    if (r.kind !== "composite") throw new EngineError("response_mismatch", "Answer every part of this question");
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
    if (r.kind === "composite") throw new EngineError("response_mismatch", "This question has one answer");
    v = gradeSimple(c, item.answer, r, true);
  }
  const out = clean(v);
  return { ...out, graderId: v.graderId, message: messageFor(c, out.correct, out.category) };
}
