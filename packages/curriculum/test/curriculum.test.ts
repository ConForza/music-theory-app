import { describe, expect, it } from "vitest";
import { computeCoverage } from "../src/coverage.ts";
import { checkDocs } from "../src/docs.ts";
import { loadCurriculum } from "../src/load.ts";
import { buildIndex } from "../src/model.ts";
import { AssessmentTemplate, ExerciseItem, LessonContent } from "../src/schema.ts";
import { validateContentRoot } from "../src/validate.ts";

const { curriculum, issues } = loadCurriculum();

describe("committed curriculum", () => {
  it("loads without schema errors", () => {
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(curriculum).toBeDefined();
  });

  it("passes structural validation, including the repository scan for prohibited files", () => {
    const report = validateContentRoot();
    expect(report.errors).toEqual([]);
  });

  it("inventories all 75 book sections with the correct per-grade counts and printed pages", () => {
    const s = curriculum!.book.sections;
    expect(s).toHaveLength(75);
    expect([1, 2, 3, 4, 5].map((g) => s.filter((x) => x.grade === g).length)).toEqual([19, 14, 12, 15, 15]);
    // Spot checks against the book's contents pages (printed numbering, not scan index).
    const page = (id: string) => s.find((x) => x.id === id)!.printedPage;
    expect(page("fs.g1.s01")).toBe(1);
    expect(page("fs.g1.s19")).toBe(27);
    expect(page("fs.g2.s05")).toBe(38);
    expect(page("fs.g3.s05")).toBe(62);
    expect(page("fs.g4.s15")).toBe(102);
    expect(page("fs.g5.s10")).toBe(120);
    expect(page("fs.g5.s15")).toBe(138);
  });

  it("records the key book/syllabus reconciliations required by Brief 01", () => {
    const s = (id: string) => curriculum!.book.sections.find((x) => x.id === id)!;
    expect(s("fs.g2.s11").classification).toBe("core_other_grade");
    expect(s("fs.g2.s11").taughtAtGrade).toBe(3);
    expect(s("fs.g2.s09").parts.some((p) => p.classification === "core_other_grade" && p.taughtAtGrade === 3)).toBe(true);
    expect(s("fs.g3.s05").classification).toBe("supporting");
    expect(s("fs.g5.s10").classification).toBe("supporting");
    expect(s("fs.g5.s13").classification).toBe("supporting");
    expect(s("fs.g5.s13").parts.some((p) => p.classification === "no_current_match")).toBe(true);
  });

  it("decomposes every numbered official syllabus item (G1: 5 items, G2–G3: 4, G4–G5: 5)", () => {
    const items = (g: number) => new Set(curriculum!.syllabus.outcomes.filter((o) => o.grade === g).map((o) => o.syllabusItem));
    expect([1, 2, 3, 4, 5].map((g) => items(g).size)).toEqual([5, 4, 4, 5, 5]);
  });

  it("reports coverage as planned (never verified) until teacher review", () => {
    const rows = computeCoverage(buildIndex(curriculum!));
    expect(rows).toHaveLength(80);
    expect(rows.every((r) => r.status === "planned")).toBe(true);
    expect(rows.some((r) => r.status === "teacher-approved")).toBe(false);
  });

  it("keeps generated documentation in sync with the data", () => {
    expect(checkDocs(curriculum!)).toEqual([]);
  });

  it("has five grade worlds, each ending in a grade assessment", () => {
    expect(curriculum!.worlds.map((w) => w.grade).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const w of curriculum!.worlds) expect(w.nodes.at(-1)!.type).toBe("grade_assessment");
  });

  it("includes the two required example lessons and one example transposition item", () => {
    const ids = curriculum!.lessons.map((l) => l.content.lessonId).sort();
    // Brief 05 adds the Grade 1 lessons; the two original examples must still be present.
    expect(ids).toContain("G1-U3-L03");
    expect(ids).toContain("G5-U4-L06");
    expect(curriculum!.items.map((i) => i.content.item.templateId)).toContain("t.g5.instrument-transpose");
  });

  it("keeps every grade's scope inside Grades 1–5 vocabulary", () => {
    const ix = buildIndex(curriculum!);
    const g5 = ix.cumulativeScope.get(5)!;
    expect(g5.keys).toHaveLength(26);
    expect(g5.clefs?.sort()).toEqual(["alto", "bass", "tenor", "treble"]);
    expect(g5.cadenceKeys?.sort()).toEqual(["C major", "D major", "F major", "G major"]);
  });
});

describe("schema guards", () => {
  it("rejects an assessment that allows hints", () => {
    const a = structuredClone(curriculum!.assessments[0]!.assessments[0]!) as Record<string, unknown>;
    a.hintsAllowed = true;
    expect(AssessmentTemplate.safeParse(a).success).toBe(false);
  });

  it("rejects malformed pitches and IDs", () => {
    const item = structuredClone(curriculum!.lessons[0]!.content.independent[0]!) as Record<string, unknown>;
    expect(ExerciseItem.safeParse({ ...item, templateId: "g1-note-read" }).success).toBe(false);
    const bad = structuredClone(item) as { answer: { accepted: string[] } };
    bad.answer.accepted = ["H4"];
    expect(ExerciseItem.safeParse(bad).success).toBe(false);
  });

  it("rejects lesson content that is not marked original", () => {
    const l = structuredClone(curriculum!.lessons[0]!.content) as { provenance: Record<string, unknown> };
    l.provenance.originality = "adapted";
    expect(LessonContent.safeParse(l).success).toBe(false);
  });
});
