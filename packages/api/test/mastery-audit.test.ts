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
    expect(Object.keys(CAPACITY_ALLOWLIST).sort()).toEqual(["c.chords.cadential-six-four", "c.metre.anacrusis", "c.scales.minor-melodic-preview", "c.voices.satb-scores"]);
    expect(shortfalls(rows2, CAPACITY_ALLOWLIST)).toEqual([]);
  });

  it("gives the preview concept no generated evidence at all", () => {
    expect(rows2.find((r) => r.conceptId === "c.scales.minor-melodic-preview")!.distinct).toBe(0);
  });
});

describe("Grade 3 mastery capacity (Brief 07; thresholds unchanged)", () => {
  const rows3 = auditCapacity(course, app.nodes, 3);

  it("covers every Grade 3 concept", () => {
    expect(rows3.length).toBe([...course.ix.concepts.values()].filter((c) => c.grade === 3).length);
  });

  it(`gives every required Grade 3 concept at least ${MIN_DISTINCT} distinct questions across at least two question types`, () => {
    // The optional upbeat enrichment has fixed questions only: it never counts towards Grade 3 mastery or assessment.
    expect(shortfalls(rows3, CAPACITY_ALLOWLIST)).toEqual([]);
    for (const r of rows3.filter((x) => x.conceptId !== "c.metre.anacrusis")) {
      expect(Object.values(r.templates).filter((n) => n >= 3).length, r.conceptId).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives the optional upbeat concept no generated evidence at all", () => {
    expect(rows3.find((r) => r.conceptId === "c.metre.anacrusis")!.distinct).toBe(0);
  });
});

describe("Grade 4 mastery capacity (Brief 08; thresholds unchanged)", () => {
  const rows4 = auditCapacity(course, app.nodes, 4);

  it("covers every Grade 4 concept (all 26), and every Grade 4 outcome has at least one audited concept", () => {
    const concepts = [...course.ix.concepts.values()].filter((c) => c.grade === 4);
    expect(rows4.length).toBe(26);
    expect(rows4.length).toBe(concepts.length);
    const outcomes = new Set(concepts.flatMap((c) => c.outcomeIds));
    for (let k = 1; k <= 18; k++) expect(outcomes.has(`abrsm2020.g4.${String(k).padStart(2, "0")}`), `g4.${k}`).toBe(true);
  });

  it(`gives every Grade 4 concept at least ${MIN_DISTINCT} distinct questions across at least two question types, with no allow-listed exception`, () => {
    expect(Object.keys(CAPACITY_ALLOWLIST).sort()).toEqual(["c.chords.cadential-six-four", "c.metre.anacrusis", "c.scales.minor-melodic-preview", "c.voices.satb-scores"]);
    expect(shortfalls(rows4, CAPACITY_ALLOWLIST)).toEqual([]);
    for (const r of rows4) {
      expect(r.distinct, r.conceptId).toBeGreaterThanOrEqual(MIN_DISTINCT);
      expect(Object.values(r.templates).filter((n) => n >= 3).length, r.conceptId).toBeGreaterThanOrEqual(2);
    }
  });

  it("fails validation on a shortfall: too few questions, or one question type only, are reported", () => {
    const low = { conceptId: "c.x.low", grade: 4, templates: { a: 6, b: 3 }, distinct: 9 };
    const oneType = { conceptId: "c.x.one", grade: 4, templates: { a: 40, b: 2 }, distinct: 42 };
    const fine = { conceptId: "c.x.fine", grade: 4, templates: { a: 20, b: 20 }, distinct: 40 };
    const bad = shortfalls([low, oneType, fine], {});
    expect(bad.map((b) => b.conceptId)).toEqual(["c.x.low", "c.x.one"]);
    expect(bad[0]!.problem).toMatch(/only 9 distinct/);
    expect(bad[1]!.problem).toMatch(/only 1 template/);
    // an allow-listed concept is the only way to be excused, and the list is pinned
    expect(shortfalls([low], { "c.x.low": "reason" })).toEqual([]);
  });

  it("never credits earlier-grade questions to a Grade 4 concept: a stripped Grade 4 template set has no capacity", () => {
    // Rebuilding the audit with only the Grade 1-3 templates of the Grade 4 reviews would credit nothing to a Grade 4 concept
    const g4concepts = new Set(rows4.map((r) => r.conceptId));
    for (const n of course.nodes.filter((x) => x.grade === 4 && x.exercises.length)) {
      for (const b of n.exercises.filter((x) => /^t\.g[123]\./.test(x.templateId))) for (const c of b.conceptIds) expect(g4concepts.has(c), `${n.id} ${b.templateId} ${c}`).toBe(false);
    }
  });
});
