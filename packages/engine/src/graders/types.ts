import type { SimpleAnswerSpec } from "@mtp/curriculum";
import type { ItemContext } from "../context.ts";
import type { SimpleResponse } from "../responses.ts";

/** A grader's decision. `reason` explains THIS answer (never the authored text) and does not give the answer away. */
export interface Verdict {
  correct: boolean;
  category: string | null;
  reason: string | null;
  /** A note shown to the learner after a CORRECT answer (a convention worth knowing); never changes the verdict. */
  note?: string;
  /** Per-element marks for sequences and progressions (index into the learner's answer). */
  marks?: Array<{ index: number; ok: boolean }>;
  parts?: Array<{ id: string; correct: boolean; category: string | null; reason: string | null }>;
}

export type Grader<A extends SimpleAnswerSpec = SimpleAnswerSpec> = (c: ItemContext, a: A, r: SimpleResponse) => Verdict;
export type AnswerOf<K extends SimpleAnswerSpec["kind"]> = Extract<SimpleAnswerSpec, { kind: K }>;

export const right = (reason: string | null = null, extra: Partial<Verdict> = {}): Verdict => ({ correct: true, category: null, reason, ...extra });
export const wrong = (category: string | null, reason: string | null, extra: Partial<Verdict> = {}): Verdict => ({ correct: false, category, reason, ...extra });
