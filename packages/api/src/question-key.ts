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
const strip = (v: unknown, alt = false): unknown =>
  Array.isArray(v)
    ? v.map((x) => strip(x, alt))
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).filter((k) => k !== "id" && k !== "seed" && k !== "diagnoses" && k !== "questionAlternative" && !(alt && k === "textAlternative")).sort().map((k) => [k, strip((v as Record<string, unknown>)[k], alt)]))
      : v;

/**
 * The order options are shown in is not part of what is asked: the same question with its options shuffled is the same
 * question, and must not count as fresh evidence. Options (also inside composite parts) are put in a fixed order first.
 */
const normaliseAnswer = (a: unknown): unknown => {
  if (Array.isArray(a)) return a.map(normaliseAnswer);
  if (a && typeof a === "object") {
    const o = Object.fromEntries(Object.entries(a as Record<string, unknown>).map(([k, v]) => [k, normaliseAnswer(v)]));
    if (Array.isArray(o.options)) o.options = [...(o.options as Array<{ id: string }>)].sort((x, y) => String(x.id).localeCompare(String(y.id)));
    return o;
  }
  return a;
};

/**
 * Templates introduced in Brief 05. Their questions ignore option order. The older templates keep the order-sensitive identity
 * they always had, so exposure and evidence rows stored by earlier briefs still match the same questions after an upgrade.
 * (Misconception `diagnoses` are feedback, not part of what is asked, so they never affect any identity.)
 */
export const ORDER_INSENSITIVE_TEMPLATES = new Set(
  ["letter-names", "stave-facts", "note-place", "note-total", "note-equivalent", "beam-choice", "bar-judge", "bar-fix", "middle-c-find", "middle-c-facts", "accidental-facts", "accidental-read", "accidental-write", "accidental-count", "step-size", "scale-gap", "key-facts", "key-write", "degree-note", "triad-notes", "interval-note", "term-sign", "melody-detail"].map((x) => `t.g1.${x}`),
);

export function questionKey(item: ExerciseItem): string {
  const answer = ORDER_INSENSITIVE_TEMPLATES.has(item.templateId) ? normaliseAnswer(item.answer) : item.answer;
  // Brief 04 templates keep hashing their text alternative exactly as that release did, so exposure and evidence stored then still match
  // after an upgrade (the learner-facing wording for questions lives in `questionAlternative`, which is never hashed). Templates new in
  // Brief 05 have no history to match, so descriptions never take part in their identity at all.
  const body = JSON.stringify(strip({ t: item.templateId, p: item.prompt, m: item.music ?? null, s: item.score ?? null, a: answer }, ORDER_INSENSITIVE_TEMPLATES.has(item.templateId)));
  return createHash("sha256").update(body).digest("hex").slice(0, 24);
}

/**
 * What the learner sees, whatever the template: the same question with its options in a different order is the same question.
 * Used to avoid repeats inside one lesson, practice, review, challenge or assessment (never stored as evidence or exposure,
 * so it cannot disturb the identities earlier briefs recorded).
 */
export function visibleKey(item: ExerciseItem): string {
  // For "complete the bar" the stimulus is the printed time signature and the given notes; the stored accepted answer is only one
  // worked solution, so two different sample solutions of the same bar are the same question.
  const a = normaliseAnswer(item.answer) as Record<string, unknown>;
  const answer = a && typeof a === "object" && (a as { kind?: string; task?: string }).kind === "rhythm" && (a as { task?: string }).task === "complete-bar" ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== "accepted")) : a;
  const body = JSON.stringify(strip({ t: item.templateId, p: item.prompt, m: item.music ?? null, s: item.score ?? null, a: answer }, true));
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
  /** Rhythm concepts: the written or answered music must contain one of these values / a rest / a dot / a tie / a beam. */
  rhythm?: { values?: string[]; rest?: boolean; dot?: boolean; tie?: boolean; beam?: boolean };
  /** Alternative to the pitch fields: a question whose prompt names one of these words is about the concept (for example "middle C"). */
  promptMentions?: string[];
  /** The music shows one of these written accidental signs ("sharp", "flat", "natural"). */
  showsSign?: string[];
  /** Key concepts: the question is about one of these keys. */
  keys?: string[];
  /** Vocabulary concepts: the term asked about (or its meaning) is in one of these categories. */
  termCategories?: string[];
  clef?: "treble" | "bass" | "alto" | "tenor";
  staffPositions?: "lines" | "spaces";
  includesPitch?: string[];
  ledgerLines?: number;
  /** At least one written pitch needs this many ledger lines or more (the concept is about reading beyond the stave). */
  minLedgerLines?: number;
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

function rhythmEvents(item: ExerciseItem): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ((o.kind === "note" || o.kind === "rest" || o.kind === "chord") && o.duration) out.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(item.music ?? null);
  walk((item.answer as { accepted?: unknown }).accepted);
  walk((item.answer as { given?: unknown }).given);
  return out;
}

/** The key a question is about: its printed key, a stated key, a scale's start note, or a named key answer. */
function keyOf(item: ExerciseItem): string | undefined {
  const a = item.answer as { key?: string; accepted?: unknown[]; derivation?: { rule?: string; start?: string; sourceKey?: string }; keyName?: string };
  if (a.keyName) return a.keyName;
  if (item.music?.key) return item.music.key;
  if (a.key) return a.key;
  if (a.derivation?.rule === "scale" && a.derivation.start) return `${a.derivation.start.replace(/\d+$/, "")} major`;
  if (typeof a.accepted?.[0] === "string" && /major$/.test(a.accepted[0] as string)) return a.accepted[0] as string;
  const m = /\b([A-G][b#]?) major\b/.exec(item.prompt.replace(/♯/g, "#").replace(/♭/g, "b"));
  return m ? `${m[1]} major` : undefined;
}

/** True when the question satisfies every part of the constraint (pitch fields need written pitches to judge). */
export function satisfies(item: ExerciseItem, c: ReviewConstraint): boolean {
  if (c.promptMentions?.some((w) => item.prompt.includes(w))) return true;
  if (c.rhythm) {
    const evs = rhythmEvents(item);
    const r = c.rhythm;
    if (r.values && !evs.some((e) => r.values!.includes((e.duration as { value: string }).value))) return false;
    if (r.rest && !evs.some((e) => e.kind === "rest") && !/ rest"/.test(JSON.stringify((item.answer as { options?: unknown }).options ?? ""))) return false;
    if (r.dot && !evs.some((e) => ((e.duration as { dots?: number }).dots ?? 0) > 0)) return false;
    if (r.tie && !evs.some((e) => e.tieToNext === true)) return false;
    if (r.beam && !evs.some((e) => typeof e.beam === "string" && e.beam !== "none")) return false;
  }
  if (c.showsSign) {
    const signs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.writtenAccidental === "string") signs.push(o.writtenAccidental);
        Object.values(o).forEach(walk);
      }
    };
    walk(item.music ?? null);
    if (!signs.some((x) => c.showsSign!.includes(x))) return false;
  }
  if (c.keys) {
    const k = keyOf(item);
    if (!k || !c.keys.includes(k)) return false;
  }
  if (c.termCategories) {
    const t = (item.answer as { kind?: string; correctOptionIds?: string[] }).correctOptionIds?.[0];
    const term = music.TERMS.find((x) => x.id === t);
    if (!term || !c.termCategories.includes(term.category)) return false;
  }
  const needsPitch = Boolean(c.clef || c.staffPositions || c.includesPitch || c.ledgerLines !== undefined || c.minLedgerLines !== undefined);
  if (!needsPitch) return true;
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
  if (c.minLedgerLines !== undefined) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    if (!pitches.some((p) => music.ledgerLines(clef, music.parsePitch(p)) >= c.minLedgerLines!)) return false;
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
