import { describe, expect, it } from "vitest";
import { foldConcept, rulesFrom, explainMastery, type EvidenceRow } from "../src/mastery.ts";
import { MasteryService } from "../src/mastery-service.ts";
import { ManualClock, addDays } from "../src/clock.ts";
import { LESSON, Client, attemptLesson, canonicalFor, finishLesson, playNode, playThrough, register, setupClock, sharedCourse, wrongFor } from "./helpers.ts";

const course = sharedCourse();
const rules = rulesFrom(course.ix.c.policy);
const C = "c.test";

let n = 0;
const ev = (date: string, o: Partial<EvidenceRow> & { item?: string; tpl?: string }): EvidenceRow => ({
  id: `e${++n}`,
  conceptId: C,
  source: "independent-step",
  counts: true,
  correct: true,
  itemId: o.item ?? `item${n}`,
  templateId: o.tpl ?? "t.a",
  templateVersion: 1,
  seed: null,
  nodeId: null,
  sessionId: null,
  mistakeCategory: null,
  localDate: date,
  occurredAt: `${date}T10:00:00.${String(n).padStart(3, "0")}Z`,
  rulesVersion: 1,
  ...o,
});
const fold = (rows: EvidenceRow[], today = "2026-03-02") => foldConcept(C, rows, rules, today);
const four = (d: string) => [ev(d, { tpl: "t.a" }), ev(d, { tpl: "t.a" }), ev(d, { tpl: "t.b" }), ev(d, { tpl: "t.b" })];

describe("mastery rules (pure)", () => {
  it("starts new, becomes learning with any non-counting activity, practising with the first independent success", () => {
    expect(fold([]).state).toBe("new");
    expect(fold([ev("2026-03-02", { source: "guided-step", counts: false })]).state).toBe("learning");
    expect(fold([ev("2026-03-02", {})]).state).toBe("practising");
  });

  it("proficient needs 4 independent correct answers across 2 templates", () => {
    expect(fold(four("2026-03-02")).state).toBe("proficient");
    const oneTemplate = [1, 2, 3, 4, 5, 6].map(() => ev("2026-03-02", { tpl: "t.a" }));
    expect(fold(oneTemplate).state).toBe("practising"); // variety is required, not volume
    expect(fold(four("2026-03-02").slice(0, 3)).state).toBe("practising");
  });

  it("does not count the same item twice (repeated identical examples add no evidence)", () => {
    const rows = [ev("2026-03-02", { item: "x", tpl: "t.a" }), ev("2026-03-03", { item: "x", tpl: "t.a" }), ev("2026-03-04", { item: "x", tpl: "t.b" }), ev("2026-03-05", { item: "x", tpl: "t.b" })];
    expect(fold(rows).independentCorrect).toBe(1);
  });

  it("ignores evidence that does not count (guided, hinted, remedial, repeats, reveal) however much of it there is", () => {
    const rows = (["guided-step", "hinted-step", "remedial-step", "not-first-attempt", "retry-after-reveal"] as const).flatMap((source) => [1, 2, 3, 4, 5].map(() => ev("2026-03-02", { source, counts: false })));
    const m = fold(rows);
    expect(m.independentCorrect).toBe(0);
    expect(m.state).toBe("learning");
    expect(m.nextDueDate).toBeNull();
  });

  it("is not mastered without a successful delayed review, even with plenty of varied evidence over several days", () => {
    const rows = [0, 1, 2, 3].flatMap((d) => [ev(addDays("2026-03-02", d), { tpl: "t.a" }), ev(addDays("2026-03-02", d), { tpl: "t.b" })]);
    const m = fold(rows, "2026-03-05");
    expect(m.independentCorrect).toBe(8);
    expect(m.spanDays).toBe(3);
    expect(m.state === "proficient" || m.state === "review_due").toBe(true);
    expect(m.highestState).toBe("proficient");
  });

  it("is mastered with 8 varied correct answers, 3+ days of evidence and a successful review", () => {
    const rows = [
      ...four("2026-03-02"),
      ev("2026-03-03", { source: "review-item", tpl: "t.a" }),
      ev("2026-03-03", { source: "review-item", tpl: "t.b" }),
      ev("2026-03-06", { source: "review-item", tpl: "t.a" }),
      ev("2026-03-06", { source: "review-item", tpl: "t.b" }),
    ];
    const m = fold(rows, "2026-03-06");
    expect(m).toMatchObject({ independentCorrect: 8, distinctTemplates: 2, spanDays: 4, delayedReviews: 2, state: "mastered", reachedMasteredOn: "2026-03-06" });
    expect(explainMastery(m, rules).missing).toEqual([]);
  });

  it("needs the days to pass: eight answers in one day plus a same-day review is not mastery", () => {
    const rows = [...four("2026-03-02"), ...four("2026-03-02").map((r) => ({ ...r, source: "review-item" as const }))];
    expect(fold(rows).state).not.toBe("mastered");
  });

  it("schedules reviews on the policy intervals 1, 3, 7, 14, 30, 60 and then stays at 60", () => {
    let rows = [ev("2026-03-02", {})];
    expect(fold(rows).nextDueDate).toBe("2026-03-03");
    const expected = [3, 7, 14, 30, 60, 60, 60];
    let date = "2026-03-03";
    for (const days of expected) {
      rows = [...rows, ev(date, { source: "review-item", tpl: "t.a" })];
      const m = fold(rows, date);
      expect(m.nextDueDate).toBe(addDays(date, days));
      date = m.nextDueDate!;
    }
  });

  it("a wrong review is a lapse: the interval index resets to the policy value (index 1 = 3 days) and history is kept", () => {
    const rows = [
      ...four("2026-03-02"),
      ev("2026-03-03", { source: "review-item" }),
      ev("2026-03-06", { source: "review-item", tpl: "t.b" }),
      ev("2026-03-06", { source: "review-item", tpl: "t.b", correct: false, mistakeCategory: "clef-confusion" }),
    ];
    const m = fold(rows, "2026-03-06");
    expect(m.lapses).toBe(1);
    expect(m.intervalIndex).toBe(rules.lapseResetsTo);
    expect(m.nextDueDate).toBe("2026-03-09");
    expect(m.state).toBe("practising");
    expect(m.highestState).toBe("proficient");
    expect(m.mistakes).toEqual({ "clef-confusion": 1 });
    // A later successful review restores the standing without erasing anything.
    const recovered = fold([...rows, ev("2026-03-09", { source: "review-item", tpl: "t.a" })], "2026-03-09");
    expect(recovered.needsRecovery).toBe(false);
    expect(recovered.state).toBe("proficient");
  });

  it("a mastered concept becomes review_due without losing its history", () => {
    const rows = [...four("2026-03-02"), ev("2026-03-03", { source: "review-item" }), ev("2026-03-03", { source: "review-item", tpl: "t.b" }), ev("2026-03-06", { source: "review-item" }), ev("2026-03-06", { source: "review-item", tpl: "t.b" })];
    const later = fold(rows, "2026-03-14");
    expect(later.state).toBe("review_due");
    expect(later.highestState).toBe("mastered");
    expect(later.reachedMasteredOn).toBe("2026-03-06");
  });

  it("an early or repeated review on the same day does not advance the schedule", () => {
    const rows = [ev("2026-03-02", {}), ev("2026-03-02", { source: "review-item", tpl: "t.b" })];
    expect(fold(rows).nextDueDate).toBe("2026-03-03");
    const twice = [...rows, ev("2026-03-03", { source: "review-item" }), ev("2026-03-03", { source: "review-item", tpl: "t.b" })];
    expect(fold(twice, "2026-03-03").nextDueDate).toBe("2026-03-06");
  });

  it("is deterministic and independent of today except for the review_due flag", () => {
    const rows = four("2026-03-02");
    expect(fold(rows, "2026-03-02")).toEqual(fold(rows, "2026-03-02"));
    expect(fold(rows, "2026-03-02").nextDueDate).toBe(fold(rows, "2026-04-02").nextDueDate);
    expect(fold(rows, "2026-04-02").state).toBe("review_due");
  });

  it("explains exactly what is missing", () => {
    const m = fold([ev("2026-03-02", {}), ev("2026-03-02", {})]);
    expect(explainMastery(m, rules).missing.join(" ")).toMatch(/2 more correct first-try answers/);
    expect(explainMastery(m, rules).missing.join(" ")).toMatch(/different kind of question/);
  });
});

describe("mastery from real attempts", () => {
  const evidence = (db: ReturnType<typeof setupClock>["db"], concept: string) =>
    db.prepare("SELECT source, counts, correct, item_id FROM mastery_evidence WHERE concept_id = ? ORDER BY rowid").all(concept) as Array<{ source: string; counts: number; correct: number; item_id: string }>;

  it("counts the lesson's independent first-try answers and not its guided steps", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    const rows = evidence(db, "c.clefs.treble-lines");
    expect(rows.filter((r) => r.source === "guided-step")).toHaveLength(2);
    expect(rows.filter((r) => r.source === "guided-step").every((r) => r.counts === 0)).toBe(true);
    expect(rows.filter((r) => r.counts === 1)).toHaveLength(4);
    const detail = (await c.get("/api/mastery/c.clefs.treble-lines")).body;
    expect(detail).toMatchObject({ state: "proficient", independentCorrect: 4, distinctTemplates: 2 });
    // The stave concept only has one template of evidence so far: variety is required.
    expect((await c.get("/api/mastery/c.clefs.stave")).body).toMatchObject({ state: "practising", distinctTemplates: 1 });
  });

  it("a hint on a guided step makes it hinted evidence, never mastery", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    const guided = course.lesson(LESSON)!.items[0]!;
    expect((await c.post(`/api/lessons/${LESSON}/hint`, { itemId: guided.id, level: 1 })).status).toBe(200);
    await attemptLesson(c, LESSON, guided.id, canonicalFor(course, LESSON, guided.id));
    const row = evidence(db, "c.clefs.treble-lines")[0]!;
    expect(row).toMatchObject({ source: "hinted-step", counts: 0 });
  });

  it("only the first attempt counts; a retry after a wrong answer, and a retry after the worked answer, do not", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    const items = course.lesson(LESSON)!.items;
    for (const it of items.slice(0, 2)) await attemptLesson(c, LESSON, it.id, canonicalFor(course, LESSON, it.id));
    const indep = items.filter((i) => i.evidence === "independent");
    const [wrongOnce, revealed, clean1, clean2] = indep as [typeof indep[0], typeof indep[0], typeof indep[0], typeof indep[0]];
    await attemptLesson(c, LESSON, wrongOnce.id, wrongFor(course, LESSON, wrongOnce.id));
    await attemptLesson(c, LESSON, wrongOnce.id, canonicalFor(course, LESSON, wrongOnce.id));
    for (let i = 0; i < 3; i++) await attemptLesson(c, LESSON, revealed.id, wrongFor(course, LESSON, revealed.id));
    const afterReveal = await attemptLesson(c, LESSON, revealed.id, canonicalFor(course, LESSON, revealed.id));
    expect(afterReveal.body.attemptNumber).toBe(4);
    for (const it of [clean1, clean2]) await attemptLesson(c, LESSON, it.id, canonicalFor(course, LESSON, it.id));
    const rows = evidence(db, "c.clefs.treble-lines");
    const bySource = (id: string) => rows.filter((r) => r.item_id === id).map((r) => `${r.source}:${r.counts}:${r.correct}`);
    expect(bySource(wrongOnce.id)).toEqual(["independent-step:1:0", "not-first-attempt:0:1"]);
    expect(bySource(revealed.id)).toEqual(["independent-step:1:0", "not-first-attempt:0:0", "not-first-attempt:0:0", "retry-after-reveal:0:1"]);
    const m = (await c.get("/api/mastery/c.clefs.treble-lines")).body;
    expect(m.independentCorrect).toBe(2); // only clean1 and clean2 are valid correct evidence
    expect(m.state).toBe("practising");
    expect(m.mistakes.length).toBeGreaterThan(0);
  });

  it("replaying a lesson does not add evidence for questions already answered", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    await playThrough(c, course);
    await playThrough(c, course);
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body.independentCorrect).toBe(4);
  });

  it("practice-lab answers, correct or not, are never mastery evidence", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    for (let i = 0; i < 6; i++) {
      const g = (await c.post("/api/practice/generate", { templateId: "t.g1.note-read", seed: 100 + i })).body;
      expect(g.id).toBeTruthy();
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM mastery_evidence").get()).toEqual({ n: 0 });
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body).toMatchObject({ state: "new", independentCorrect: 0 });
  });

  it("a client cannot claim an evidence level, a mastery state or a due date", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    const id = course.lesson(LESSON)!.items[0]!.id;
    for (const extra of [{ evidence: "independent" }, { mastery: "mastered" }, { hintsUsed: 0 }, { dueDate: "2020-01-01" }]) {
      expect((await c.post(`/api/lessons/${LESSON}/attempts`, { attemptId: crypto.randomUUID(), itemId: id, response: canonicalFor(course, LESSON, id), ...extra })).status).toBe(400);
    }
    expect((await c.call("PUT", "/api/mastery/c.clefs.treble-lines", { state: "mastered" })).status).toBe(405);
  });

  it("answers given through different input kinds are treated identically (pitch letter and stave position)", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    const kinds = new Set(course.lesson(LESSON)!.items.filter((i) => i.evidence === "independent").map((i) => i.input.kind));
    expect(kinds.size).toBeGreaterThan(1);
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body.independentCorrect).toBe(4);
  });

  it("works with the Grade 5 lesson and honestly reports what the current content cannot yet prove", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await playNode(c, course, "G5-U4-L06");
    const chord = (await c.get("/api/mastery/c.cadences.chord-choice")).body;
    expect(chord.independentCorrect).toBe(2);
    expect(chord.distinctTemplates).toBe(1);
    expect(chord.state).toBe("practising");
    expect(chord.missing.join(" ")).toMatch(/different kind of question/);
  });

  it("rebuilds the projection from the evidence ledger, and re-reads it under a new rules version without touching old rows", async () => {
    const { client, db, clock, app } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    const uid = (await c.get("/api/me")).body.user.id;
    const before = db.prepare("SELECT concept_id, state, detail FROM concept_mastery WHERE user_id = ? ORDER BY concept_id").all(uid);
    db.prepare("DELETE FROM concept_mastery").run();
    const rebuilt = app.engagement.mastery.rebuildAll(uid);
    expect(rebuilt.map((m) => m.conceptId)).toEqual(before.map((b) => (b as { concept_id: string }).concept_id));
    expect(db.prepare("SELECT concept_id, state, detail FROM concept_mastery WHERE user_id = ? ORDER BY concept_id").all(uid)).toEqual(before);
    // A stricter policy re-reads the same evidence differently; the stored classification is untouched.
    const stricter = new MasteryService(db, course, new ManualClock(clock.now()), { ...rules, rulesVersion: 2, proficient: { minIndependentCorrect: 6, minDistinctTemplates: 2 } });
    const m = stricter.rebuildAll(uid).find((x) => x.conceptId === "c.clefs.treble-lines")!;
    expect(m).toMatchObject({ state: "practising", rulesVersion: 2 });
    expect((db.prepare("SELECT DISTINCT rules_version FROM mastery_evidence").all() as Array<{ rules_version: number }>).map((r) => r.rules_version)).toEqual([1]);
  });
});
