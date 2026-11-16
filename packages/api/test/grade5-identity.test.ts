import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { describe, expect, it } from "vitest";
import { questionKey, visibleKey } from "../src/question-key.ts";

/**
 * A question's identity decides what counts as fresh evidence. Two Grade 5 questions a learner cannot tell apart must have one identity, however
 * their options were shuffled or whichever worked example or sample completion was stored with them (review of PR #13, findings 1 and 2).
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const gen = (nodeId: string, templateId: string, seed: number): ExerciseItem => {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId)!;
  return generateItem(ix, templateId, seed, { scope: effectiveScope(ix, node, b) }).item;
};

describe("Grade 5 question identity", () => {
  it("the same choice question with its options shuffled is one question", () => {
    const [x, y] = [gen("G5-U5-L03", "t.g5.voices", 2), gen("G5-U5-L03", "t.g5.voices", 3)];
    expect(visibleKey(x)).toBe(visibleKey(y));
    expect(questionKey(x)).toBe(questionKey(y));
  });

  it("a chord-writing question is not changed by its stored worked example", () => {
    const [x, y] = [gen("G5-U4-L01", "t.g5.chord-build", 16), gen("G5-U4-L01", "t.g5.chord-build", 120)];
    expect(x.prompt).toBe(y.prompt);
    expect(visibleKey(x)).toBe(visibleKey(y));
    expect(questionKey(x)).toBe(questionKey(y));
  });

  it("a bar to complete is not changed by the sample completion stored with it", () => {
    const [x, y] = [gen("G5-U1-L02", "t.g5.bar-complete", 19), gen("G5-U1-L02", "t.g5.bar-complete", 28)];
    expect(visibleKey(x)).toBe(visibleKey(y));
    expect(questionKey(x)).toBe(questionKey(y));
  });

  it("whenever two generated Grade 5 questions look the same to a learner they have the same identity", () => {
    const seen = new Map<string, string>();
    let pairs = 0;
    for (const node of ix.nodes.values()) {
      if (!node.id.startsWith("G5-")) continue;
      for (const b of node.exercises) {
        for (let seed = 1; seed <= 60; seed++) {
          let item: ExerciseItem;
          try { item = generateItem(ix, b.templateId, seed, { scope: effectiveScope(ix, node, b) }).item; } catch { continue; }
          const v = visibleKey(item);
          const k = questionKey(item);
          const was = seen.get(v);
          if (was !== undefined) { expect(k, `${node.id} ${b.templateId} seed ${seed}`).toBe(was); pairs++; } else seen.set(v, k);
        }
      }
    }
    expect(pairs).toBeGreaterThan(50);
  }, 600_000);

  it("different questions keep different identities", () => {
    expect(questionKey(gen("G5-U5-L03", "t.g5.voices", 2))).not.toBe(questionKey(gen("G5-U1-L02", "t.g5.bar-complete", 19)));
  });
});
