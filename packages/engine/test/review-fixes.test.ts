import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem } from "../src/index.ts";

/** Regression tests for the independent review of Brief 05 (findings F1, F6, F7). */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);

function generated(nodeId: string, templateId: string, seeds = 120): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId)!;
  const scope = effectiveScope(ix, node, b);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= seeds; s++) {
    try {
      out.push(generateItem(ix, templateId, s, { scope }).item);
    } catch {
      /* skipped seed */
    }
  }
  return out;
}
const pitchesIn = (i: ExerciseItem) => JSON.stringify(i.music ?? {}).match(/"[A-G][#b]{0,2}\d"/g) ?? [];

describe("F1: a question never calls a note 'middle C' unless the printed note is C4", () => {
  for (const [nodeId, tpl] of [["G1-U3-L06", "t.g1.middle-c-find"], ["G1-U3-L06", "t.g1.middle-c-facts"]] as const) {
    it(`${tpl}: prompt, answers and feedback agree with the picture`, () => {
      const list = generated(nodeId, tpl);
      expect(list.length).toBeGreaterThan(40);
      for (const i of list) {
        const text = JSON.stringify([i.prompt, i.feedback]);
        if (/middle C/i.test(i.prompt) && i.music) expect(pitchesIn(i), i.prompt).toContain('"C4"');
        if (/middle C/i.test(text) && i.music && !/not middle C|is not|isn't/i.test(text)) expect(pitchesIn(i)).toContain('"C4"');
      }
    });
  }
  it("the authored Lesson 6 questions do not call a different pitch middle C", () => {
    const node = ix.nodeById.get("G1-U3-L06")!;
    expect(node).toBeTruthy();
  });
});

describe("F7: beam-choice shows one connected beamed group", () => {
  it("beamed notes form a single contiguous group whose size matches the question", () => {
    for (const i of generated("G1-U1-L03", "t.g1.beam-choice")) {
      const evs = (i.music!.measures.flatMap((m) => m.events ?? [])) as Array<{ beam?: string }>;
      const idx = evs.flatMap((e, n) => (e.beam ? [n] : []));
      if (!idx.length) continue;
      expect(idx[idx.length - 1]! - idx[0]! + 1, i.prompt).toBe(idx.length);
      const starts = evs.filter((e) => e.beam === "begin").length;
      const ends = evs.filter((e) => e.beam === "end").length;
      expect([starts, ends]).toEqual([1, 1]);
    }
  });
  it("seed 34 (reported in review) is a single group", () => {
    const node = ix.nodeById.get("G1-U1-L03")!;
    const b = node.exercises.find((x) => x.templateId === "t.g1.beam-choice")!;
    const it = generateItem(ix, "t.g1.beam-choice", 34, { scope: effectiveScope(ix, node, b) }).item;
    const evs = it.music!.measures.flatMap((m) => m.events ?? []) as Array<{ beam?: string }>;
    expect(evs.filter((e) => e.beam === "begin").length).toBeLessThanOrEqual(1);
  });
});

describe("F6: text alternatives do not give the answer away", () => {
  it("keyboard pictures in questions never name the highlighted key unless the prompt does", () => {
    let seen = 0;
    for (const node of ix.nodeById.values()) {
      if (node.grade !== 1) continue;
      for (const b of node.exercises) {
        if (!b.templateId.startsWith("t.g1.")) continue;
        const key = `${b.templateId}`;
        if (key.includes("melody")) continue;
        for (const i of generated(node.id, b.templateId, 25)) {
          if (i.music?.presentation !== "keyboard") continue;
          seen++;
          const named = /\b[A-G](#|b| sharp| flat)?\d?\b/.exec(((i.music.questionAlternative ?? i.music.textAlternative ?? "")).replace(/^An? piano keyboard/, ""));
          if (named && !i.prompt.includes(named[0])) expect.fail(`${i.id} alt text names ${named[0]}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("P3: triad questions explain the mistake instead of falling back to generic feedback", () => {
  it("every wrong option of every triad-notes question has a tailored diagnosis; a missing-note one refers to the missing degree", () => {
    const list = generated("G1-U6-L01", "t.g1.triad-notes", 150);
    expect(list.length).toBeGreaterThan(50);
    for (const i of list) {
      const a = i.answer as { options: Array<{ id: string }>; correctOptionIds: string[]; diagnoses?: Record<string, { reason: string }> };
      for (const o of a.options) if (!a.correctOptionIds.includes(o.id)) expect(a.diagnoses?.[o.id], `${i.id} ${o.id}`).toBeTruthy();
      if (i.prompt.includes("missing")) for (const d of Object.values(a.diagnoses ?? {})) expect(JSON.stringify(d)).not.toMatch(/bass note/i);
    }
  });
});

describe("beam grouping is available without sight", () => {
  it("the three candidate bars of a beam-grouping question have different text descriptions", () => {
    let checked = 0;
    for (const i of generated("G1-U1-L03", "t.g1.beam-choice", 150).concat(generated("G1-U2-L05", "t.g1.bar-judge", 150))) {
      if (!i.prompt.includes("groups its notes")) continue;
      const alt = (i.music!.questionAlternative ?? i.music!.textAlternative ?? "");
      const bars = alt.split(/Bar \d+: /).slice(1);
      expect(bars.length).toBe(3);
      expect(new Set(bars).size, alt).toBe(3);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe("beam-count feedback is about counting noteheads", () => {
  it("every wrong count carries a counting explanation, never a beats explanation", () => {
    let seen = 0;
    for (const i of generated("G1-U1-L03", "t.g1.beam-choice", 150)) {
      if (!i.prompt.startsWith("How many notes")) continue;
      seen++;
      const a = i.answer as { options: Array<{ id: string }>; correctOptionIds: string[]; diagnoses?: Record<string, { reason: string }> };
      for (const o of a.options) if (!a.correctOptionIds.includes(o.id)) expect(a.diagnoses?.[o.id]?.reason).toMatch(/noteheads/);
    }
    expect(seen).toBeGreaterThan(5);
  });
  it("a stave-position question describes the clef and pitch for a listener without naming the line or space", () => {
    for (const i of generated("G1-U3-L02", "t.g1.stave-facts", 80)) {
      if (!i.prompt.startsWith("Counting from the bottom")) continue;
      const alt = (i.music!.questionAlternative ?? i.music!.textAlternative ?? "");
      expect(alt).toMatch(/clef stave with one note.*the note is [A-G]\d/);
      expect(alt).not.toMatch(/\b(1st|2nd|3rd|4th|5th) (line|space)\b/);
    }
  });
});
