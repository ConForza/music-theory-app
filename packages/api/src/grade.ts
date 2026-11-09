import type { CurriculumIndex, ExerciseItem, MusicScope } from "@mtp/curriculum";
import { EngineError, gradeItem, solutionFor, type GradeResult, type LearnerResponse } from "@mtp/engine";
import { ApiError } from "./errors.ts";

/** What the learner submits (validated by the engine's response schema). */
export type Response = LearnerResponse;
export type { GradeResult };

/** After this many wrong attempts at one question, the server also returns the worked answer. */
export const REVEAL_AFTER_WRONG = 3;

/**
 * Grade through the Brief 03 engine. Deterministic and side-effect free; never trusts any correctness claim
 * from the client (the response schema has no such field). Bad answers become a 400 and record nothing.
 */
export function gradeResponse(ix: CurriculumIndex, item: ExerciseItem, response: unknown, scope?: MusicScope): GradeResult {
  try {
    return gradeItem(ix, item, response, scope);
  } catch (e) {
    if (e instanceof EngineError && (e.code === "malformed_response" || e.code === "response_mismatch")) {
      throw new ApiError(400, "bad_response", "That answer does not fit this question.");
    }
    throw e;
  }
}

export function revealSolution(ix: CurriculumIndex, item: ExerciseItem, scope: MusicScope | undefined, correct: boolean, attemptNumber: number): string | undefined {
  if (correct || attemptNumber < REVEAL_AFTER_WRONG) return undefined;
  return solutionFor(ix, item, scope);
}
