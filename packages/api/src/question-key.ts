import { createHash } from "node:crypto";
import type { ExerciseItem } from "@mtp/curriculum";
import { music } from "@mtp/curriculum";

/**
 * A stable identity for *what is being asked*, independent of seed, session and item id. Two generated questions with
 * different seeds that show the same music and expect the same answer share a key, so they cannot both be "fresh
 * first-ever" evidence. Ids and seeds are stripped; everything the learner sees or must answer is kept.
 */
const strip = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(strip)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).filter((k) => k !== "id" && k !== "seed").sort().map((k) => [k, strip((v as Record<string, unknown>)[k])]))
      : v;

export function questionKey(item: ExerciseItem): string {
  const body = JSON.stringify(strip({ t: item.templateId, p: item.prompt, m: item.music ?? null, s: item.score ?? null, a: item.answer }));
  return createHash("sha256").update(body).digest("hex").slice(0, 24);
}

export interface ReviewConstraint {
  conceptId: string;
  clef: "treble" | "bass" | "alto" | "tenor";
  staffPositions: "lines" | "spaces";
}

const PITCH = /^[A-G](bb|b|#|x)?-?\d$/;
function collectPitches(v: unknown, out: string[]) {
  if (typeof v === "string") {
    if (PITCH.test(v)) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => collectPitches(x, out));
  else if (v && typeof v === "object") Object.values(v as object).forEach((x) => collectPitches(x, out));
}

/** True when every pitch the question shows or expects sits where the constraint allows (lines are even positions, spaces odd). */
export function satisfies(item: ExerciseItem, c: ReviewConstraint): boolean {
  const pitches: string[] = [];
  collectPitches(item.music ?? null, pitches);
  collectPitches(item.answer, pitches);
  if (!pitches.length) return false; // a constrained concept must be assessable from written pitches
  return pitches.every((p) => {
    const pos = music.staffPosition(c.clef, music.parsePitch(p));
    return c.staffPositions === "lines" ? pos % 2 === 0 : pos % 2 !== 0;
  });
}
