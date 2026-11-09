import { music, type ExerciseItem } from "@mtp/curriculum";

/** What the learner submits. Validated by the HTTP layer before reaching here. */
export type Response =
  | { kind: "choice"; optionId: string }
  | { kind: "pitch-letter"; letter: string }
  | { kind: "staff-position"; pitch: string };

export interface GradeResult {
  correct: boolean;
  /** Mistake category id when diagnosable and the item authored feedback for it. */
  category: string | null;
  /** Learner-facing explanation (authored). */
  message: string;
}

const LETTERS = "CDEFGAB";
// Diatonic index (octave * 7 + letter) of the bottom line of each clef.
const BOTTOM_LINE: Record<string, number> = { treble: 4 * 7 + 2 /* E4 */, bass: 2 * 7 + 4 /* G2 */ };

const dia = (p: string) => music.diatonicNumber(music.parsePitch(p));
const letterAt = (d: number) => LETTERS[((d % 7) + 7) % 7]!;

/** Minimal Brief 02 grader. Brief 03 replaces this behind the grader contracts in content/engine/engine.json. */
export function gradeResponse(item: ExerciseItem, r: Response): GradeResult {
  const a = item.answer;
  let correct: boolean;
  let category: string | null = null;

  if (a.kind === "choice" && r.kind === "choice") {
    correct = a.correctOptionIds.includes(r.optionId);
  } else if (a.kind === "pitch" && r.kind === "pitch-letter") {
    const want = new Set(a.accepted.map((p) => music.parsePitch(p).step));
    correct = want.has(r.letter as never);
    if (!correct) category = diagnosePitch(item, r.letter);
  } else if (a.kind === "staff-position" && r.kind === "staff-position") {
    correct = a.accepted.some((p) => music.samePitch(music.parsePitch(p), music.parsePitch(r.pitch)));
    if (!correct) category = diagnoseStaff(item, r.pitch);
  } else {
    throw new Error("Response kind does not match the item");
  }

  const mistakes = item.feedback.mistakes;
  if (!correct && category && !(category in mistakes)) category = null;
  return {
    correct,
    category,
    message: correct ? item.feedback.correct : category ? (mistakes[category] as string) : item.feedback.fallback,
  };
}

function shownPitch(item: ExerciseItem): { pitch: string; clef: string } | undefined {
  const first = item.music?.measures[0]?.events?.[0];
  if (!first || first.kind !== "note") return undefined;
  return { pitch: first.pitch, clef: item.music!.clef };
}

function diagnosePitch(item: ExerciseItem, letter: string): string | null {
  const shown = shownPitch(item);
  if (!shown || item.answer.kind !== "pitch") return null;
  const want = music.parsePitch(item.answer.accepted[0]!);
  const gap = Math.abs(LETTERS.indexOf(letter) - LETTERS.indexOf(want.step));
  const bottom = BOTTOM_LINE[shown.clef];
  if (bottom !== undefined) {
    const pos = dia(shown.pitch) - bottom;
    if (pos >= 0 && pos <= 8) {
      if (letter === letterAt(bottom + 8 - pos)) return "counted-from-top";
      const other = shown.clef === "treble" ? BOTTOM_LINE.bass! : BOTTOM_LINE.treble!;
      if (letter === letterAt(other + pos)) return "clef-confusion";
    }
  }
  if (gap === 1 || gap === 6) return "off-by-step";
  return null;
}

function diagnoseStaff(item: ExerciseItem, pitch: string): string | null {
  if (item.answer.kind !== "staff-position") return null;
  const a = item.answer;
  const bottom = BOTTOM_LINE[a.clef]!;
  const pos = dia(pitch) - bottom;
  const got = music.parsePitch(pitch);
  if (a.accepted.some((p) => music.parsePitch(p).step === got.step)) return "wrong-octave";
  if (a.target.position !== "any") {
    const onLine = Math.abs(pos) % 2 === 0;
    if ((a.target.position === "line") !== onLine) return "line-space-swap";
  }
  const wantPos = dia(a.accepted[0]!) - bottom;
  if (pos >= 0 && pos <= 8 && pos === 8 - wantPos) return "counted-from-top";
  return null;
}
