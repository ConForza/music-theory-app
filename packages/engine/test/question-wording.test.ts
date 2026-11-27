/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely typed answer specs */
/**
 * The question-wording audit, at the generator level: representative generated questions of every grade are checked for the wording they now
 * use, and for the constraints and marking the wording must still carry. (Identity continuity across every node binding and lesson is
 * checked in packages/api/test/question-wording.test.ts.)
 */
import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, gradeItem } from "../src/index.ts";

const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const A = (i: ExerciseItem) => i.answer as unknown as Record<string, any>;

/** Items of one template, generated under every node binding that uses it (so each grade's taught scope is exercised). */
function sample(templateId: string, perBinding = 25): ExerciseItem[] {
  const out: ExerciseItem[] = [];
  for (const node of ix.nodes)
    for (const b of node.exercises.filter((x) => x.templateId === templateId)) {
      const scope = effectiveScope(ix, node, b);
      for (let s = 1; s <= perBinding; s++) {
        try {
          out.push(generateItem(ix, templateId, s, { scope }).item);
        } catch {
          // a seed that does not fit a narrow scope
        }
      }
    }
  return out;
}
const words = (s: string) => s.trim().split(/\s+/).length;

describe("t.g5.bar-complete: the reported 7/4 question", () => {
  const items = sample("t.g5.bar-complete");

  it("asks for the action and the constraints only: the given notes are not listed one by one", () => {
    expect(items.length).toBeGreaterThan(40);
    for (const it of items) {
      expect(it.prompt).toMatch(/^Complete this [57]\/[48] bar using notes or rests, following a \d( \+ \d)+ grouping\. (One beat remains|[A-Z][a-z]+ beats remain)\. Do not cross group boundaries\.$/);
      expect(it.prompt).not.toMatch(/then a|already begins/);
      expect(it.legacyPrompt).toMatch(/already begins with/);
    }
  });

  it("still states exactly the time signature, grouping and remaining beats the marking uses", () => {
    for (const it of items) {
      const a = A(it);
      expect(it.prompt).toContain(`${a.timeSignature} bar`);
      expect(it.prompt).toContain(`${a.groupPattern.join(" + ")} grouping`);
      const { top, bottom } = music.parseTimeSignature(a.timeSignature);
      const given = music.totalLength(a.given);
      const left = top - (given.n / given.d) * bottom;
      expect(it.prompt).toContain(left === 1 ? "One beat remains" : `${music.sentenceStart(music.countWord(left))} beats remain`);
    }
  });

  it("pins the screenshot's case word for word", () => {
    const it = items.find((x) => A(x).timeSignature === "7/4" && A(x).groupPattern.join("+") === "2+3+2" && /then a crotchet/.test(x.legacyPrompt ?? ""));
    expect(it?.prompt).toMatch(/^Complete this 7\/4 bar using notes or rests, following a 2 \+ 3 \+ 2 grouping\. (Two|Four) beats remain\. Do not cross group boundaries\.$/);
  });
});

describe("generated wording across Grades 1-5", () => {
  const reworded = [
    "t.g1.bar-complete", "t.g1.scale-build", "t.g1.scale-gap", "t.g1.note-write", "t.g1.accidental-write",
    "t.g2.bar-complete", "t.g2.scale-build-minor", "t.g2.scale-gap",
    "t.g3.bar-complete", "t.g3.ledger-count", "t.g3.scale-gap",
    "t.g4.double-dot-bar", "t.g4.same-pitch", "t.g4.octave-transpose-alto", "t.g4.term-use", "t.g4.alto-write",
    "t.g5.division-write", "t.g5.approach-chord", "t.g5.instrument-transpose", "t.g5.transpose-judge", "t.g5.interval-key-build", "t.g5.chord-build", "t.g5.ornament-replace", "t.g5.rewrite-metre",
  ];

  it.each(reworded)("%s: shorter than (or as long as) its first wording, which it keeps for identity, and still marks correctly", (templateId) => {
    const items = sample(templateId, 6).filter((x) => x.legacyPrompt);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items.slice(0, 20)) {
      expect(words(it.prompt)).toBeLessThanOrEqual(words(it.legacyPrompt!));
    }
    // marking is untouched: the canonical answer of a reworded question is still right
    const node = ix.nodes.find((n) => n.exercises.some((b) => b.templateId === templateId))!;
    const b = node.exercises.find((x) => x.templateId === templateId)!;
    const scope = effectiveScope(ix, node, b);
    const it = generateItem(ix, templateId, 3, { scope }).item;
    expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct).toBe(true);
  });

  it("uses 'an' before octave and other vowel sounds", () => {
    const items = [...sample("t.g1.interval-number", 40), ...sample("t.g2.interval-number", 40)];
    expect(items.some((x) => x.prompt.includes("make an octave"))).toBe(true);
    expect(items.filter((x) => /\ba octave\b|\ba augmented\b/.test(x.prompt))).toEqual([]);
  });

  it("the scale-writing prompts no longer repeat what the answer stave says about the first note", () => {
    for (const t of ["t.g1.scale-build", "t.g3.scale-build-major", "t.g4.scale-build", "t.g5.scale-build"]) for (const it of sample(t, 4)) expect(it.prompt).not.toMatch(/first note/);
  });

  it("term-use situations never mix 'you' with 'the player'", () => {
    for (const it of sample("t.g4.term-use", 30)) expect(it.prompt).not.toMatch(/\byou(r)?\b/i);
  });

  it("transposition prompts do not name the instrument twice", () => {
    for (const it of [...sample("t.g5.transpose-judge", 10), ...sample("t.g5.instrument-transpose", 10)]) expect(it.prompt).not.toMatch(/\(in F\) \(|which sounds/);
  });
});

describe("question descriptions for screen readers", () => {
  it("a rhythm question's description consolidates repeated notes and keeps its beams", () => {
    const items = [...sample("t.g1.note-total", 10), ...sample("t.g5.time-signature", 10), ...sample("t.g2.note-grouping", 10)];
    const alts = items.map((x) => (x.music as any)?.questionAlternative).filter(Boolean) as string[];
    expect(alts.length).toBeGreaterThan(10);
    for (const a of alts) {
      expect(a).toMatch(/^Bar 1: /);
      expect(a).not.toMatch(/\d beamed together \(|dotted dotted/);
      // a run of the same plain value is never listed one by one
      expect(a).not.toMatch(/\ba (quaver|crotchet|semiquaver|minim), a \1, /);
    }
  });

  it("the description of a time-signature question never names the time signature it asks for", () => {
    for (const t of ["t.g1.time-signature", "t.g3.time-signature", "t.g5.time-signature"])
      for (const it of sample(t, 10)) {
        const alt = (it.music as any).questionAlternative as string;
        for (const ts of A(it).accepted as string[]) expect(alt).not.toContain(ts);
      }
  });

  it("the stored text alternative of the older rhythm questions is unchanged in form (it is part of their identity)", () => {
    const it = sample("t.g1.note-total", 3)[0]!;
    expect(it.music!.textAlternative).toMatch(/^Bar 1: (dotted )?(semibreve|minim|crotchet|quaver)/);
  });
});
