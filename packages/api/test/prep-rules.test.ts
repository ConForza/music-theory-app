/**
 * Brief 10: the RULES (pure, no database): how a practice examination is composed and balanced, how placement is calculated, and how results
 * become levels and a cautious readiness estimate. These are the rules documented in docs/architecture/REVISION_PLACEMENT_EXAMS.md.
 */
import { generatorTemplateIds } from "@mtp/engine";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREP, RUBRIC_VERSION, BLUEPRINT_VERSION, type PrepConfig } from "../src/prep-config.ts";
import {
  SCORE_READING_TEMPLATE,
  examBlueprint,
  gradeOutcomes,
  outcomeImportance,
  outcomeLevel,
  outcomeTemplates,
  probeOutcomes,
  readiness,
  recommendPlacement,
  stageLevel,
  type ReadinessAttempt,
} from "../src/prep-blueprint.ts";
import { realCourse } from "./helpers.ts";

const course = realCourse();
const generatable = new Set(generatorTemplateIds(course.ix));
const cfg = DEFAULT_PREP;

describe("practice-exam blueprint: coverage and balance", () => {
  for (const grade of [1, 2, 3, 4, 5]) {
    it(`Grade ${grade}: every syllabus outcome of the grade is examined ${cfg.exam.itemsPerOutcome} times, from at least one template`, () => {
      const bp = examBlueprint(course, grade, cfg, generatable);
      const outcomes = gradeOutcomes(course, grade);
      expect(outcomes.length).toBeGreaterThan(0);
      expect(bp.uncovered).toEqual([]);
      for (const o of outcomes) {
        const s = bp.sections.find((x) => x.outcomeId === o.id);
        expect(s, `${o.id} has a section`).toBeDefined();
        expect(s!.itemCount).toBe(cfg.exam.itemsPerOutcome);
        expect(s!.templateIds.length, `${o.id} has a usable template`).toBeGreaterThan(0);
        // Every template can really be generated, and none belongs to a LATER grade.
        for (const t of s!.templateIds) {
          expect(generatable.has(t)).toBe(true);
          expect(course.ix.templates.get(t)!.grade).toBeLessThanOrEqual(grade);
        }
      }
      expect(bp.totalItems).toBe(outcomes.length * cfg.exam.itemsPerOutcome + cfg.exam.scoreReadingItems);
    });

    it(`Grade ${grade}: has a score-reading section built only from templates that combine ideas in notation`, () => {
      const bp = examBlueprint(course, grade, cfg, generatable);
      const reading = bp.sections.find((s) => s.combined)!;
      expect(reading.itemCount).toBe(cfg.exam.scoreReadingItems);
      expect(reading.templateIds.length).toBeGreaterThan(0);
      for (const t of reading.templateIds) expect(t).toMatch(SCORE_READING_TEMPLATE);
    });

    it(`Grade ${grade}: the balance across domains follows the syllabus (items per domain = outcomes per domain x items per outcome)`, () => {
      const bp = examBlueprint(course, grade, cfg, generatable);
      const perDomain = new Map<string, number>();
      for (const s of bp.sections.filter((x) => !x.combined)) perDomain.set(s.domain, (perDomain.get(s.domain) ?? 0) + s.itemCount);
      const expected = new Map<string, number>();
      for (const o of gradeOutcomes(course, grade)) expected.set(o.domain, (expected.get(o.domain) ?? 0) + cfg.exam.itemsPerOutcome);
      expect(Object.fromEntries(perDomain)).toEqual(Object.fromEntries(expected));
    });
  }

  it("covers all 80 official outcomes across the five grades, none twice, none missing", () => {
    const seen = new Set<string>();
    for (const g of [1, 2, 3, 4, 5]) for (const s of examBlueprint(course, g, cfg, generatable).sections) if (s.outcomeId) seen.add(s.outcomeId);
    expect(seen.size).toBe(80);
    expect(seen).toEqual(new Set(course.ix.outcomes.keys()));
  });

  it("never selects an audio-dependent template: a learner with sound off or hearing loss loses nothing", () => {
    for (const g of [1, 2, 3, 4, 5]) for (const s of examBlueprint(course, g, cfg, generatable).sections) for (const t of s.templateIds) expect(course.ix.templates.get(t)!.mode).not.toBe("listen-identify");
  });

  it("the grade-assessment pool is reused where it exists (the reviewed templates come first)", () => {
    const a = course.ix.assessments.get("a.g5")!;
    const sec = a.sections.find((s) => s.outcomeIds[0] === "abrsm2020.g5.01")!;
    expect(outcomeTemplates(course, 5, "abrsm2020.g5.01", generatable).slice(0, sec.templateIds.length)).toEqual(sec.templateIds.filter((t) => generatable.has(t)));
  });

  it("does not change the existing grade-completion assessment contracts (Grade 5 stays 39 questions, pass mark 66%)", () => {
    const a = course.ix.assessments.get("a.g5")!;
    expect(a.sections.reduce((n, s) => n + s.itemCount, 0)).toBe(39);
    expect(course.ix.c.policy.assessments?.gradePassPercent).toBe(66);
    expect(26 / 39).toBeGreaterThanOrEqual(0.66);
    expect(25 / 39).toBeLessThan(0.66);
  });

  it("states its versions", () => {
    expect(cfg.rubricVersion).toBe(RUBRIC_VERSION);
    expect(examBlueprint(course, 1, cfg, generatable).version).toBe(BLUEPRINT_VERSION);
  });
});

describe("placement probes", () => {
  const importance = outcomeImportance(course);
  it("rank outcomes by how much later learning depends on them", () => {
    // Every Grade 5 outcome is a destination: nothing later depends on it.
    for (const o of gradeOutcomes(course, 5)) expect(importance.get(o.id)).toBe(0);
    // Early foundations are depended on by far more than a late one.
    const g1 = gradeOutcomes(course, 1).map((o) => importance.get(o.id)!);
    expect(Math.max(...g1)).toBeGreaterThan(10);
  });

  for (const grade of [1, 2, 3, 4]) {
    it(`Grade ${grade}: picks ${cfg.placement.probeItems} distinct outcomes of that grade, varied across domains, deterministically`, () => {
      const a = probeOutcomes(course, grade, cfg.placement.probeItems, generatable);
      const b = probeOutcomes(course, grade, cfg.placement.probeItems, generatable);
      expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
      expect(a).toHaveLength(cfg.placement.probeItems);
      expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
      for (const o of a) expect(o.grade).toBe(grade);
      // Varied: a probe of six is not six questions about one domain.
      expect(new Set(a.map((o) => o.domain)).size).toBeGreaterThanOrEqual(3);
    });
  }

  it("prefers the foundational outcome when domains tie", () => {
    const picked = probeOutcomes(course, 1, 1, generatable)[0]!;
    const best = Math.max(...gradeOutcomes(course, 1).map((o) => importance.get(o.id)!));
    expect(importance.get(picked.id)).toBe(best);
  });
});

describe("placement recommendation: how the starting grade is calculated", () => {
  const stage = (grade: number, correct: number, asked = 6, missed: string[] = []) => ({ grade, asked, correct, missed });
  it("levels: secure at 80% or more, partial at 50% or more, otherwise weak", () => {
    expect(stageLevel({ asked: 6, correct: 5 }, cfg)).toBe("secure");
    expect(stageLevel({ asked: 6, correct: 4 }, cfg)).toBe("partial");
    expect(stageLevel({ asked: 6, correct: 3 }, cfg)).toBe("partial");
    expect(stageLevel({ asked: 6, correct: 2 }, cfg)).toBe("weak");
    expect(stageLevel({ asked: 0, correct: 0 }, cfg)).toBe("weak");
  });
  it("all four probes secure: start at Grade 5", () => {
    const r = recommendPlacement([stage(1, 6), stage(2, 5), stage(3, 6), stage(4, 5)], cfg);
    expect(r).toMatchObject({ recommendedGrade: 5, allSecure: true, decidedBy: null, notAssessed: [] });
  });
  it("stops at the first probe that is not secure and starts there", () => {
    const r = recommendPlacement([stage(1, 6), stage(2, 6), stage(3, 4)], cfg);
    expect(r).toMatchObject({ recommendedGrade: 3, allSecure: false, decidedBy: 3, notAssessed: [4] });
  });
  it("a learner who is weak at Grade 1 starts at Grade 1 and higher grades are reported as not assessed", () => {
    const r = recommendPlacement([stage(1, 1)], cfg);
    expect(r).toMatchObject({ recommendedGrade: 1, decidedBy: 1, notAssessed: [2, 3, 4] });
  });
  it("a strong score above a weak one cannot lift the placement (the lowest weak probe decides)", () => {
    expect(recommendPlacement([stage(1, 6), stage(2, 2), stage(3, 6), stage(4, 6)], cfg).recommendedGrade).toBe(2);
  });
  it("is independent of the order the results arrive in", () => {
    expect(recommendPlacement([stage(3, 6), stage(1, 6), stage(2, 3)], cfg).recommendedGrade).toBe(2);
  });
  it("boundary: exactly the secure ratio is secure; one below is not", () => {
    const c: PrepConfig = { ...cfg, placement: { ...cfg.placement, secureRatio: 0.8 } };
    expect(stageLevel({ asked: 5, correct: 4 }, c)).toBe("secure");
    expect(stageLevel({ asked: 10, correct: 7 }, c)).toBe("partial");
  });
});

describe("outcome levels", () => {
  it("not yet assessed without independent evidence", () => expect(outcomeLevel(0, 0, cfg)).toBe("not_assessed"));
  it("needs review when nothing independent was right", () => expect(outcomeLevel(2, 0, cfg)).toBe("needs_review"));
  it("developing when some were right, or only one question was asked", () => {
    expect(outcomeLevel(2, 1, cfg)).toBe("developing");
    expect(outcomeLevel(1, 1, cfg)).toBe("developing");
  });
  it("mastered only when every one of at least two independent questions was right", () => expect(outcomeLevel(2, 2, cfg)).toBe("mastered"));
});

describe("estimated readiness: cautious by construction", () => {
  const now = { rubricVersion: cfg.rubricVersion, blueprintVersion: cfg.blueprintVersion };
  const att = (id: string, day: number, over: Partial<ReadinessAttempt> = {}): ReadinessAttempt => ({
    id,
    completedAt: `2026-03-${String(day).padStart(2, "0")}T10:00:00Z`,
    mode: "mock",
    rubricVersion: cfg.rubricVersion,
    blueprintVersion: cfg.blueprintVersion,
    curriculumVersion: "1",
    independentQuestions: 36,
    independentCorrect: 30,
    outcomesTotal: 16,
    outcomesAssessed: 16,
    ...over,
  });
  it("no mock attempts: not enough evidence, and says why", () => {
    const r = readiness([], now, cfg);
    expect(r.label).toBe("not_enough_evidence");
    expect(r.percent).toBeNull();
  });
  it("practice-mode attempts never count, however well they went", () => {
    const r = readiness([att("p1", 1, { mode: "practice", independentQuestions: 0, independentCorrect: 0 })], now, cfg);
    expect(r.label).toBe("not_enough_evidence");
    expect(r.ignored).toEqual([{ id: "p1", reason: "practice_mode" }]);
  });
  it("one excellent mock gives 'Developing', never 'On track': one good day is not an estimate", () => {
    const r = readiness([att("m1", 1, { independentCorrect: 36 })], now, cfg);
    expect(r.label).toBe("developing");
    expect(r.detail).toMatch(/one more/i);
  });
  it("two good mocks give 'On track'", () => {
    expect(readiness([att("m1", 1), att("m2", 2)], now, cfg)).toMatchObject({ label: "on_track", percent: 83, attemptsUsed: 2 });
  });
  it("a weak recent mock pulls an estimate down (newest attempts are used)", () => {
    const r = readiness([att("m1", 1), att("m2", 2), att("m3", 3, { independentCorrect: 12 })], now, cfg);
    // pooled over the newest two: (30 + 12) / 72 = 58%
    expect(r).toMatchObject({ label: "developing", percent: 58, basedOn: ["m3", "m2"] });
  });
  it("low independent score: needs review", () => expect(readiness([att("m1", 1, { independentCorrect: 10 })], now, cfg).label).toBe("needs_review"));
  it("an attempt that assessed too little of the grade is ignored", () => {
    const r = readiness([att("m1", 1, { outcomesAssessed: 8 })], now, cfg);
    expect(r.label).toBe("not_enough_evidence");
    expect(r.ignored[0]!.reason).toBe("low_coverage");
  });
  it("attempts scored under earlier rules keep their own result but are not mixed into the estimate", () => {
    const r = readiness([att("old", 1, { rubricVersion: 0 }), att("old2", 2, { blueprintVersion: 0 }), att("m1", 3)], now, cfg);
    expect(r.basedOn).toEqual(["m1"]);
    expect(r.ignored.map((i) => i.reason)).toEqual(["older_rules", "older_rules"]);
  });
  it("the labels are the cautious ones and never claim an ABRSM result, a pass or a grade", () => {
    const titles = new Set(["Not enough independent evidence yet", "Developing", "On track", "Needs review"]);
    for (const a of [[], [att("m1", 1)], [att("m1", 1), att("m2", 2)], [att("m1", 1, { independentCorrect: 5 })]]) {
      const r = readiness(a, now, cfg);
      expect(titles.has(r.title)).toBe(true);
      expect(`${r.title} ${r.detail}`).not.toMatch(/\b(you will pass|guarantee|passed|certificate)\b/i);
      if (/ABRSM/.test(r.detail)) expect(r.detail).toMatch(/not an ABRSM/);
    }
  });
});
