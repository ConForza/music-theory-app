import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * A concept-level teaching boundary, narrower than the lesson binding's scope. Every field present must hold.
 *  - `clef`: the question is written in (or asks for) this clef;
 *  - `staffPositions`: every written pitch sits on a line, or in a space, of that clef;
 *  - `includesPitch`: at least one of these spelt pitches (octave included) appears in the question or its answer;
 *  - `ledgerLines`: the most ledger lines any pitch needs in the clef (0 = none).
 */
export interface ReviewConstraint {
  conceptId: string;
  clef?: "treble" | "bass" | "alto" | "tenor";
  staffPositions?: "lines" | "spaces";
  includesPitch?: string[];
  ledgerLines?: number;
}

const PITCH = /^[A-G](bb|b|#|x)?-?\d$/;
function collectPitches(v: unknown, out: string[]) {
  if (typeof v === "string") {
    if (PITCH.test(v)) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => collectPitches(x, out));
  else if (v && typeof v === "object") Object.values(v as object).forEach((x) => collectPitches(x, out));
}

/** The clef a question is written in or asks for (stave items only). */
function clefOf(item: ExerciseItem): string | undefined {
  return item.music?.clef ?? (item.answer as { clef?: string }).clef;
}

/** True when the question satisfies every part of the constraint (a constrained concept must be assessable from written pitches). */
export function satisfies(item: ExerciseItem, c: ReviewConstraint): boolean {
  const pitches: string[] = [];
  collectPitches(item.music ?? null, pitches);
  collectPitches(item.answer, pitches);
  if (!pitches.length) return false;
  if (c.clef && clefOf(item) !== c.clef) return false;
  if (c.includesPitch && !pitches.some((p) => c.includesPitch!.includes(p))) return false;
  if (c.staffPositions) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    const ok = pitches.every((p) => {
      const pos = music.staffPosition(clef, music.parsePitch(p));
      return c.staffPositions === "lines" ? pos % 2 === 0 : pos % 2 !== 0;
    });
    if (!ok) return false;
  }
  if (c.ledgerLines !== undefined) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    if (!pitches.every((p) => music.ledgerLines(clef, music.parsePitch(p)) <= c.ledgerLines!)) return false;
  }
  return true;
}

/** Read content/policy/review-constraints.json (absent file: no extra constraints). */
export function loadConstraints(root: string, concepts: Map<string, unknown>): Map<string, ReviewConstraint> {
  const out = new Map<string, ReviewConstraint>();
  try {
    const file = JSON.parse(readFileSync(join(root, "policy/review-constraints.json"), "utf8")) as { constraints: ReviewConstraint[] };
    for (const c of file.constraints) {
      if (!concepts.has(c.conceptId)) throw new Error(`review-constraints: unknown concept ${c.conceptId}`);
      out.set(c.conceptId, c);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return out;
}
