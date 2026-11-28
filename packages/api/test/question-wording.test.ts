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
  // the Practice Lab's fixed sets are learner-facing too (first review of PR #30)
  for (const s of curriculum!.showcase) out.push(...(s.content.items as ExerciseItem[]));
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

describe("lessons and Practice Lab sets touched by the audit changed only in what learners read", () => {
  // Fixture: for each lesson the audit touched, and every Practice Lab set ("showcase|<set id>"), a hash of the pre-audit file (main at 94754cb)
  // with its learner-facing wording (prompts, hints, feedback and text descriptions) removed. Question identity, which reads some descriptions, is pinned above.
  const was = JSON.parse(readFileSync(join(here, "fixtures/lessons-before-wording-audit.json"), "utf8")) as Record<string, string>;
  const WORDING = new Set(["prompt", "legacyPrompt", "questionAlternative", "textAlternative", "hints", "feedback"]);
  const strip = (o: unknown): unknown =>
    Array.isArray(o) ? o.map(strip) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).filter((k) => !WORDING.has(k)).sort().map((k) => [k, strip((o as Record<string, unknown>)[k])])) : o;
  const contentOf = (key: string) =>
    key.startsWith("showcase|") ? curriculum!.showcase.find((x) => x.content.id === key.slice(9))!.content : curriculum!.lessons.find((l) => l.content.lessonId === key)!.content;
  const wordingFree = (key: string) => createHash("sha256").update(JSON.stringify(strip(contentOf(key)))).digest("hex").slice(0, 16);
  it.each(Object.keys(was))("%s", (key) => expect(wordingFree(key)).toBe(was[key]));

  it("every edited prompt in a lesson or Practice Lab set keeps the wording it was published with", () => {
    for (const l of curriculum!.lessons) for (const it of [...l.content.guided, ...l.content.independent]) if (it.legacyPrompt) expect(it.legacyPrompt, it.id).not.toBe(it.prompt);
    const lab = curriculum!.showcase.flatMap((x) => x.content.items as ExerciseItem[]);
    expect(lab.filter((it) => it.legacyPrompt).length).toBeGreaterThanOrEqual(12);
    for (const it of lab) if (it.legacyPrompt) expect(it.legacyPrompt, it.id).not.toBe(it.prompt);
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
