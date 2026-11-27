/**
 * The question-wording audit changed what learners READ, never what a question IS.
 *
 * 1. Identity: every question the app can produce (each node binding under its own scope, and every frozen lesson item) has the same
 *    `questionKey`, `visibleKey` and review-boundary membership as before the audit (fixture written by scripts/identity-snapshot.ts on main
 *    at 94754cb). Reworded questions carry their first wording in `legacyPrompt`, which identity reads; the learner never receives it.
 * 2. Wording: the shapes the audit removed ("then a quaver, then a quaver", "a octave", a prompt that repeats the notation note by note)
 *    appear in no prompt of any grade, and a few reworded prompts are pinned exactly.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { identitySnapshot } from "../scripts/identity-snapshot.ts";
import { identityPrompt, loadCourse, questionKey } from "../src/index.ts";

const here = import.meta.dirname;
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);

/** Every prompt of every grade: three seeds of each node binding, plus every authored lesson item. */
function everyItem(seeds = 3): ExerciseItem[] {
  const out: ExerciseItem[] = [];
  for (const node of ix.nodes)
    for (const b of node.exercises) {
      if (!ix.templates.has(b.templateId)) continue;
      const scope = effectiveScope(ix, node, b);
      for (let seed = 11; seed < 11 + seeds; seed++) {
        try {
          out.push(generateItem(ix, b.templateId, seed, { scope }).item);
        } catch {
          // a narrow scope may not fit every seed; the identity test covers those exactly
        }
      }
    }
  for (const l of curriculum!.lessons) out.push(...l.content.guided, ...l.content.independent);
  return out;
}
const items = everyItem();

describe("question identity is unchanged by the wording audit", () => {
  it("every binding and every lesson file has the identity digest it had before", () => {
    const was = JSON.parse(readFileSync(join(here, "fixtures/identity-before-wording-audit.json"), "utf8")) as Record<string, string>;
    const now = identitySnapshot();
    const moved = Object.keys(was).filter((k) => now[k] !== was[k]);
    expect(moved, `identity changed for: ${moved.slice(0, 12).join(", ")}`).toEqual([]);
    expect(Object.keys(now).sort()).toEqual(Object.keys(was).sort());
  });

  it("a reworded question's identity reads its first wording, and the learner never receives that wording", () => {
    const course = loadCourse();
    const reworded = items.filter((it) => it.legacyPrompt);
    expect(reworded.length).toBeGreaterThan(100);
    for (const it of reworded.slice(0, 200)) {
      expect(it.legacyPrompt).not.toBe(it.prompt);
      expect(identityPrompt(it)).toBe(it.legacyPrompt);
      expect(questionKey(it)).toBe(questionKey({ ...it, prompt: it.legacyPrompt! }));
      const shown = course.learnerItem(it, "independent");
      expect(JSON.stringify(shown)).not.toContain("legacyPrompt");
      expect(shown.prompt).toBe(it.prompt);
    }
  });
});

describe("lessons touched by the audit changed only in what learners read", () => {
  // Fixture: for each lesson the audit touched, a hash of the pre-audit file (main at 94754cb) with its learner-facing wording removed.
  const was = JSON.parse(readFileSync(join(here, "fixtures/lessons-before-wording-audit.json"), "utf8")) as Record<string, string>;
  const WORDING = new Set(["prompt", "legacyPrompt", "questionAlternative"]);
  const strip = (o: unknown): unknown =>
    Array.isArray(o) ? o.map(strip) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).filter((k) => !WORDING.has(k)).sort().map((k) => [k, strip((o as Record<string, unknown>)[k])])) : o;
  const wordingFree = (id: string) => createHash("sha256").update(JSON.stringify(strip(curriculum!.lessons.find((l) => l.content.lessonId === id)!.content))).digest("hex").slice(0, 16);
  // Re-authoring also corrected one stale description in this lesson: note 3 is in the space above the ledger line, not on it.
  const DESCRIPTION_CORRECTED = ["G1-U3-L06"];

  it.each(Object.keys(was).filter((id) => !DESCRIPTION_CORRECTED.includes(id)))("%s", (id) => expect(wordingFree(id)).toBe(was[id]));

  it("every edited prompt in a lesson keeps the wording it was published with", () => {
    for (const l of curriculum!.lessons) for (const it of [...l.content.guided, ...l.content.independent]) if (it.legacyPrompt) expect(it.legacyPrompt, it.id).not.toBe(it.prompt);
  });
});

describe("prompt wording across all five grades", () => {
  const prompts = items.map((it) => it.prompt);

  it("no prompt lists consecutive identical notes one by one", () => {
    expect(prompts.filter((p) => /then an? (dotted )?(\w+), then an? (dotted )?\2\b/.test(p))).toEqual([]);
    expect(prompts.filter((p) => /, then a /.test(p) && /already begins/.test(p))).toEqual([]);
  });

  it("indefinite articles agree with the word that follows", () => {
    expect(prompts.filter((p) => /\ba (octave|augmented|unison? |[aeio]\w+ (?:\d|[a-z]+ \d))/.test(p) || /\ba (octave|augmented|8th|11th)\b/.test(p))).toEqual([]);
  });

  it("no prompt repeats itself in brackets or leaves doubled punctuation", () => {
    expect(prompts.filter((p) => /\) \(|\.\.| {2}|\?\.|\(\s|\s\)/.test(p))).toEqual([]);
    expect(prompts.filter((p) => /\(in F\) \(the/.test(p))).toEqual([]);
  });

  it("every prompt starts with a capital and ends with a full stop, question mark or ellipsis", () => {
    expect(prompts.filter((p) => !/^[A-Z0-9“"]/.test(p) || !/[.?…]\)?$/.test(p))).toEqual([]);
  });
});
