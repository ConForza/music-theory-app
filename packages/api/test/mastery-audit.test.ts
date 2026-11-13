import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { auditCapacity, CAPACITY_ALLOWLIST, MIN_DISTINCT, shortfalls } from "../src/mastery-audit.ts";
import { questionKey } from "../src/question-key.ts";
import { realCourse } from "./helpers.ts";

const course = realCourse();
const app = createApp({ db: openDb(":memory:"), course });

describe("Grade 1 mastery capacity (Brief 04 thresholds are not weakened)", () => {
  const rows = auditCapacity(course, app.nodes);

  it("covers every Grade 1 concept", () => {
    expect(rows.length).toBe([...course.ix.concepts.values()].filter((c) => c.grade === 1).length);
  });

  it(`gives every concept at least ${MIN_DISTINCT} distinct questions across at least two question types`, () => {
    // Anything that genuinely cannot is listed here with the reason, never silently skipped. Currently nothing.
    const allowlist: Record<string, string> = {};
    expect(shortfalls(rows, allowlist)).toEqual([]);
  });

  it("does not count the same question with its options shuffled as a new question", () => {
    const base = {
      id: "i.a", templateId: "t.g1.letter-names", templateVersion: 1, seed: null, evidence: "independent" as const, prompt: "Which?", hints: [], feedback: { correct: "y", mistakes: {}, fallback: "n" },
      answer: { kind: "choice" as const, options: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }], correctOptionIds: ["B"] },
    };
    const shuffled = { ...base, id: "i.b", seed: 5, answer: { ...base.answer, options: [{ id: "C", label: "C" }, { id: "A", label: "A" }, { id: "B", label: "B" }] } };
    expect(questionKey(shuffled)).toBe(questionKey(base));
    const other = { ...base, answer: { ...base.answer, correctOptionIds: ["C"] } };
    expect(questionKey(other)).not.toBe(questionKey(base));
  });
});

describe("Grade 2 mastery capacity (Brief 04 thresholds are not weakened)", () => {
  const rows2 = auditCapacity(course, app.nodes, 2);

  it("covers every Grade 2 concept", () => {
    expect(rows2.length).toBe([...course.ix.concepts.values()].filter((c) => c.grade === 2).length);
  });

  it(`gives every required Grade 2 concept at least ${MIN_DISTINCT} distinct questions across at least two question types`, () => {
    // The optional melodic-minor preview has no generated questions by design: it never counts towards Grade 2 mastery or assessment.
    expect(Object.keys(CAPACITY_ALLOWLIST)).toEqual(["c.scales.minor-melodic-preview"]);
    expect(shortfalls(rows2, CAPACITY_ALLOWLIST)).toEqual([]);
  });

  it("gives the preview concept no generated evidence at all", () => {
    expect(rows2.find((r) => r.conceptId === "c.scales.minor-melodic-preview")!.distinct).toBe(0);
  });
});
