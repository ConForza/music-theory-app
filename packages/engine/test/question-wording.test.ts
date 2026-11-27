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
const unpitched = (evs: any[]) => evs.map(({ pitch: _p, ...e }) => e);

describe("t.g5.bar-complete: the reported 7/4 question", () => {
  const items = sample("t.g5.bar-complete");
  const unitOf = (ts: string) => (ts.endsWith("/8") ? "quaver" : "crotchet");

  it("asks for the action and the constraints only: the given notes are not listed one by one", () => {
    expect(items.length).toBeGreaterThan(40);
    for (const it of items) {
      expect(it.prompt).toMatch(/^Complete this [57]\/[48] bar using notes or rests, following a \d( \+ \d)+ grouping\. [A-Z][a-z]+ (crotchet|quaver)(s'|'s) worth remains\. Do not cross group boundaries\.$/);
      expect(it.prompt).not.toMatch(/then a|already begins|beats? remain/);
      expect(it.legacyPrompt).toMatch(/already begins with/);
    }
  });

  it("states the time signature, grouping and what remains in the bar's own unit (first review of PR #30: in 7/8 five quavers are not five beats)", () => {
    let eighths = 0;
    for (const it of items) {
      const a = A(it);
      expect(it.prompt).toContain(`${a.timeSignature} bar`);
      expect(it.prompt).toContain(`${a.groupPattern.join(" + ")} grouping`);
      const { top, bottom } = music.parseTimeSignature(a.timeSignature);
      const given = music.totalLength(a.given);
      const left = top - (given.n / given.d) * bottom;
      const unit = unitOf(a.timeSignature);
      expect(it.prompt).toContain(`${music.sentenceStart(music.countWord(left))} ${unit}${left === 1 ? "'s" : "s'"} worth remains`);
      if (bottom === 8) eighths++;
    }
    expect(eighths).toBeGreaterThan(5);
  });

  describe("the authored item from the screenshot (i.g5-u1-l02.ind-3)", () => {
    const lesson = curriculum!.lessons.find((l) => l.content.lessonId === "G5-U1-L02")!.content;
    const item = [...lesson.guided, ...lesson.independent].find((x) => x.id === "i.g5-u1-l02.ind-3")!;
    const node = ix.nodeById.get("G5-U1-L02")!;
    const scope = effectiveScope(ix, node, node.exercises.find((b) => b.templateId === "t.g5.bar-complete")!);
    const n = (value: string, dots = 0) => ({ kind: "note", duration: { value, dots } });
    const r = (value: string) => ({ kind: "rest", duration: { value, dots: 0 } });
    const grade = (tail: unknown[]) => gradeItem(ix, item, { kind: "rhythm", measures: [{ events: [...unpitched(A(item).given), ...tail] }] } as never, scope).correct;

    it("reads exactly as reworded, and keeps its first wording for identity", () => {
      expect(item.prompt).toBe("Complete this 7/4 bar using notes or rests, following a 2 + 3 + 2 grouping. Two crotchets' worth remains. Do not cross group boundaries.");
      expect(item.legacyPrompt).toBe("Complete this bar of 7/4 with notes or rests so that it follows a grouping of 2 + 3 + 2. The bar already begins with a quaver, then a quaver, then a quaver, then a quaver, then a crotchet, then a quaver, then a quaver, then a quaver, then a quaver. Two more beats are needed; no note may join two groups.");
    });

    it("marks as before: every rule-compliant ending is right, a short or long bar is wrong", () => {
      for (const ok of [[n("minim")], [r("minim")], [n("crotchet"), n("crotchet")], [n("crotchet"), r("crotchet")]]) expect(grade(ok), JSON.stringify(ok)).toBe(true);
      for (const bad of [[n("crotchet")], [n("minim", 1)], []]) expect(grade(bad), JSON.stringify(bad)).toBe(false);
    });

    it("its given notes are described in the answer editor in natural words, beamed as the editor beams them", () => {
      // the editor beams by the named grouping (RhythmEditors.beamBar), so the four quavers of the first group share one beam
      const named = music.metreStructures("7/4").find((x) => x.pattern?.join("+") === "2+3+2")!;
      const shown = music.autoBeam(unpitched(A(item).given).map(({ beam: _b, ...e }: any) => e), named);
      expect(music.barsInWords([shown as never], { beams: true })).toBe("Bar 1: four quavers beamed together, a crotchet and four quavers beamed together.");
    });
  });

  it("rejects a note that crosses a group boundary (3 + 2 + 2)", () => {
    const item = items.find((x) => A(x).timeSignature === "7/4" && A(x).groupPattern.join("+") === "3+2+2" && music.equals(music.totalLength(A(x).given), music.frac(3, 4)))!;
    expect(item).toBeDefined();
    const node = ix.nodes.find((nd) => nd.exercises.some((b) => b.templateId === "t.g5.bar-complete"))!;
    const scope = effectiveScope(ix, node, node.exercises.find((b) => b.templateId === "t.g5.bar-complete")!);
    const grade = (tail: unknown[]) => gradeItem(ix, item, { kind: "rhythm", measures: [{ events: [...unpitched(A(item).given), ...tail] }] } as never, scope).correct;
    expect(grade([{ kind: "note", duration: { value: "minim", dots: 0 } }, { kind: "note", duration: { value: "minim", dots: 0 } }])).toBe(true);
    expect(grade([{ kind: "note", duration: { value: "minim", dots: 1 } }, { kind: "note", duration: { value: "crotchet", dots: 0 } }])).toBe(false);
  });
});

describe("generated wording across Grades 1-5", () => {
  const reworded = [
    // (accidental writing now states its ledger-line range, as the first review of PR #30 asked, so it is no shorter than before)
    "t.g1.bar-complete", "t.g1.scale-build", "t.g1.scale-gap", "t.g1.note-write",
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
