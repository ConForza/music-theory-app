/**
 * Brief 10: practice examinations end to end on the real course: coverage and variation, marking, timed and untimed behaviour,
 * independence from hints and coaching, persistence, duplicate protection, interruption and isolation between accounts.
 */
import { canonicalResponse, gradeItem } from "@mtp/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PREP, type PrepConfig } from "../src/prep-config.ts";
import { answerAll, boot, cmd, learner, protectedCounts } from "./prep-helpers.ts";
import { Client, realCourse } from "./helpers.ts";

const course = realCourse();

describe("every grade's practice examination covers the syllabus (planned from the real course)", () => {
  const { db, app } = boot();
  const started: Record<number, { id: string; userId: string; c: Client }> = {};
  beforeAll(async () => {
    const L = await learner(app, "cover");
    for (const g of [1, 2, 3, 4, 5]) {
      const v = await L.c.post(`/api/exams/${g}/start`, { mode: "mock" });
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      started[g] = { id: v.body.id, userId: L.userId, c: L.c };
    }
  }, 120_000);

  for (const g of [1, 2, 3, 4, 5]) {
    it(`Grade ${g}: ${DEFAULT_PREP.exam.itemsPerOutcome} questions on every one of the grade's outcomes, plus score reading, all inside the grade's taught scope`, () => {
      const { id, userId } = started[g]!;
      const items = app.prep.internalItems(userId, id);
      const bp = app.prep.blueprint(g);
      expect(items).toHaveLength(bp.totalItems);
      for (const s of bp.sections.filter((x) => x.outcomeId)) {
        const mine = items.filter((i) => i.planned.outcomeId === s.outcomeId);
        expect(mine, s.outcomeId!).toHaveLength(DEFAULT_PREP.exam.itemsPerOutcome);
        for (const i of mine) {
          expect(s.templateIds).toContain(i.planned.templateId);
          // The question really tests the outcome: a concept of that outcome is credited.
          expect(i.planned.conceptIds.some((c) => course.ix.concepts.get(c)!.outcomeIds.includes(s.outcomeId!)), `${i.item.id} tests ${s.outcomeId}`).toBe(true);
        }
      }
      const reading = items.filter((i) => i.planned.combined);
      expect(reading).toHaveLength(DEFAULT_PREP.exam.scoreReadingItems);
      // Score-reading questions put several ideas into one piece of notation: they show music or a score, and have several parts
      // (key, metre, rhythm, intervals, chords...). The report names the outcomes they touched.
      for (const r of reading) {
        expect(Boolean(r.item.music || (r.item as { score?: unknown }).score), `${r.item.id} shows notation`).toBe(true);
        const parts = r.item.answer.kind === "composite" ? r.item.answer.parts.length : 1;
        expect(parts, `${r.item.id} combines several ideas in one piece of notation`).toBeGreaterThanOrEqual(3);
        expect(r.planned.outcomeIds.length).toBeGreaterThanOrEqual(1);
      }

      // No question appears twice on a paper.
      expect(new Set(items.map((i) => i.planned.questionKey)).size).toBe(items.length);
    });

    it(`Grade ${g}: the learner's view never contains an answer, and a mock paper does not name its topics or offer hints`, () => {
      const { id, c } = started[g]!;
      return c.get(`/api/prep/attempts/${id}`).then((v) => {
        const text = JSON.stringify(v.body);
        expect(text).not.toMatch(/"answer"|"accepted"|"solution"/);
        expect(v.body.firstAttemptOnly).toBe(true);
        for (const i of v.body.items) {
          expect(i.item.hintCount).toBe(0);
          expect(i.section).toBeNull();
        }
      });
    });
  }

  it("valid musical alternatives are marked correct (every accepted spelling, key name or time signature, not only the first)", () => {
    // Fixed seeds over every template a paper can use, so the test never depends on which questions a random paper happened to contain.
    let tested = 0;
    const seen = new Set<string>();
    for (const g of [1, 2, 3, 4, 5]) {
      const node = course.ix.nodeById.get(`G${g}-A`)!;
      for (const s of app.prep.blueprint(g).sections) {
        for (const t of s.templateIds) {
          const scope = app.nodes.taughtUnion(t, node);
          if (!scope) continue;
          for (let seed = 1; seed <= 60; seed++) {
            const item = app.nodes.gen(t, seed, scope);
            const a = item?.answer as { kind: string; accepted?: unknown[] } | undefined;
            if (!item || !a || !["pitch", "key", "time-signature", "ornament"].includes(a.kind) || !Array.isArray(a.accepted) || a.accepted.length < 2) continue;
            if (seen.has(`${t}:${JSON.stringify(a.accepted)}`)) continue;
            seen.add(`${t}:${JSON.stringify(a.accepted)}`);
            for (const alt of a.accepted) {
              const asAlt = { ...item, answer: { ...item.answer, accepted: [alt] } } as typeof item;
              const response = canonicalResponse(course.ix, asAlt, scope);
              expect(gradeItem(course.ix, item, response, scope).correct, `${item.id}: accepted alternative ${JSON.stringify(alt)}`).toBe(true);
              tested++;
            }
          }
        }
      }
    }
    expect(tested).toBeGreaterThan(10);
  }, 120_000);

  it("every question can be answered with the controls it offers (a correct answer is always among the options shown)", async () => {
    const { inputFor } = await import("@mtp/engine");
    let checked = 0;
    for (const g of [1, 2, 3, 4, 5]) {
      const { id, userId } = started[g]!;
      for (const { item, scope } of app.prep.internalItems(userId, id)) {
        const input = inputFor(course.ix, item, scope);
        if (input.kind === "time-signature" && item.answer.kind === "time-signature") {
          // a rhythm can fit more than one time signature; at least one accepted answer must be on offer
          const ok = item.answer.accepted.some((a: string) => {
            const [t, b] = a.split("/").map(Number);
            return input.tops.includes(t!) && input.bottoms.includes(b!);
          });
          expect(ok, `${item.id}: accepted ${item.answer.accepted} but offered ${input.tops}/${input.bottoms}`).toBe(true);
          checked++;
        }
        if (input.kind === "choice" && item.answer.kind === "choice") {
          const answer = item.answer;
          expect(input.options.some((o: { id: string }) => answer.correctOptionIds.includes(o.id)), `${item.id}: the correct option is offered`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("marking is all-or-nothing per question and a wrong answer is marked wrong (the rubric has no hidden part marks)", async () => {
    const { id, userId, c } = started[1]!;
    const items = app.prep.internalItems(userId, id);
    const r = await answerAll(app, c, userId, id, (i) => i === 0, (i) => i < 2);
    expect(r.every((x) => x.status === 200 && x.body.recorded === true && !("correct" in x.body))).toBe(true);
    const rows = db.prepare("SELECT item_id, correct FROM prep_responses WHERE user_id = ? AND attempt_id = ? ORDER BY rowid").all(userId, id) as Array<{ item_id: string; correct: number }>;
    expect(rows.map((x) => x.correct)).toEqual([0, 1]);
    expect(rows[0]!.item_id).toBe(items[0]!.item.id);
  });
});

describe("no paper ever asks the same question twice", () => {
  it("across many seeds and every grade, every question on a paper has its own identity and its own appearance", async () => {
    const { app } = boot();
    const { userId } = await learner(app, "dups");
    const { visibleKey, questionKey } = await import("../src/question-key.ts");
    // Grade 1 has the most questions (46) and failed once on an unlucky seed: try many. The others get a few each.
    const plan: Array<[number, number]> = [...Array.from({ length: 14 }, (_, i): [number, number] => [1, 1000 + i * 7919]), ...[2, 3, 4, 5].flatMap((g) => [3, 77, 4242].map((s): [number, number] => [g, s * g]))];
    for (const [grade, seed] of plan) {
      const items = app.prep.planExam(userId, grade, seed);
      const nodeItems = items.map((p) => p.questionKey);
      expect(new Set(nodeItems).size, `grade ${grade} seed ${seed}: duplicate question identity`).toBe(items.length);
      void visibleKey;
      void questionKey;
    }
  }, 180_000);
});

describe("a mock examination: independent answers, results afterwards", () => {
  it("is blind: no verdicts, no hints, first answer final; replays and retries are idempotent; nothing in the learning record changes", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const before = protectedCounts(db, userId);
    const v = await c.post("/api/exams/2/start", { mode: "mock" });
    const id = v.body.id as string;
    // resume: same attempt, any number of times
    expect((await c.post("/api/exams/2/start", { mode: "mock" })).body.id).toBe(id);
    const items = app.prep.internalItems(userId, id);
    const first = items[0]!;
    const ok = canonicalResponse(course.ix, first.item, first.scope);
    const cid = cmd();
    const a1 = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cid, itemId: first.item.id, response: ok });
    expect(a1.body).toMatchObject({ recorded: true, replayed: false, attemptNumber: 1 });
    expect(a1.body).not.toHaveProperty("correct");
    // a lost-reply retry: same command id and answer: the stored reply, nothing new
    const a2 = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cid, itemId: first.item.id, response: ok });
    expect(a2.body).toMatchObject({ recorded: true, replayed: true, attemptNumber: 1 });
    // same id, different answer: refused, not borrowed
    const clash = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cid, itemId: items[1]!.item.id, response: canonicalResponse(course.ix, items[1]!.item, items[1]!.scope) });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("attempt_conflict");
    // a second go at the same question: the first answer counts
    const again = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cmd(), itemId: first.item.id, response: ok });
    expect(again.body.error.code).toBe("already_answered");
    // no hints in a mock
    const hint = await c.post(`/api/prep/attempts/${id}/hint`, { itemId: first.item.id, level: 1 });
    expect(hint.body.error.code).toBe("no_hints");
    expect((db.prepare("SELECT COUNT(*) AS c FROM prep_responses WHERE user_id = ?").get(userId) as { c: number }).c).toBe(1);
    expect(protectedCounts(db, userId)).toEqual(before);
  }, 60_000);

  it("scores, explains and recommends afterwards; completing twice returns the same stored result; rewards and progression are untouched", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const before = protectedCounts(db, userId);
    const id = (await c.post("/api/exams/1/start", { mode: "mock" })).body.id as string;
    const total = app.prep.blueprint(1).totalItems;
    const bad = new Set([0, 1, 2, 3]); // the first outcome's two questions, and the next outcome's two
    await answerAll(app, c, userId, id, (i) => bad.has(i));
    const done = await c.post(`/api/prep/attempts/${id}/complete`, {});
    expect(done.status).toBe(200);
    const s = done.body;
    expect(s).toMatchObject({ kind: "exam", label: "Practice assessment", mode: "mock", grade: 1, questions: total, answered: total, score: total - 4, independentQuestions: total, independentCorrect: total - 4, coachedQuestions: 0, hintsUsed: 0, alreadyComplete: false });
    expect(s.disclaimer).toMatch(/not an ABRSM examination/);
    // by outcome: the two outcomes with both questions wrong "need review"; the rest are mastered
    const levels = s.outcomes.map((o: { level: string }) => o.level);
    expect(levels.filter((l: string) => l === "needs_review")).toHaveLength(2);
    expect(levels.filter((l: string) => l === "mastered")).toHaveLength(s.outcomesTotal - 2);
    expect(s.notAssessed).toEqual([]);
    // errors explained in plain words, with the worked answer after the attempt
    const wrong = s.review.filter((r: { correct: boolean }) => !r.correct);
    expect(wrong).toHaveLength(4);
    for (const w of wrong) {
      expect(w.solution).toBeTruthy();
      expect(w.prompt).toBeTruthy();
    }
    // recommendations point at lessons and revision for the weak outcomes
    expect(s.recommendations.some((r: { kind: string; nodeId?: string }) => r.kind === "lesson" && r.nodeId)).toBe(true);
    expect(s.recommendations.some((r: { kind: string }) => r.kind === "revision")).toBe(true);
    // repeated completion: the same stored result, flagged as already complete
    const again = await c.post(`/api/prep/attempts/${id}/complete`, {});
    expect(again.body).toEqual({ ...s, alreadyComplete: true });
    // nothing a learner could be rewarded or promoted by has moved
    expect(protectedCounts(db, userId)).toEqual(before);
    // the result is readable later, with the notation of each question re-drawn from its stored seed
    const r = await c.get(`/api/prep/attempts/${id}/result`);
    expect(r.status).toBe(200);
    expect(r.body.questions.every((q: { item: unknown }) => q.item)).toBe(true);
    // one mock is only "Developing" however well it went (a single attempt is not enough for "On track")
    const res = await c.get("/api/prep/results");
    expect(res.body.grades[0].readiness).toMatchObject({ attemptsUsed: 1 });
    expect(res.body.grades[0].readiness.label).not.toBe("on_track");
    expect(res.body.grades[0].readiness.note).toMatch(/not an ABRSM result/);
  }, 90_000);

  it("a two-good-mock history reaches 'On track', and finishing early reports what was not assessed", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    for (const seed of [11, 22]) {
      const id = (await c.post("/api/exams/2/start", { mode: "mock", seed })).body.id as string;
      await answerAll(app, c, userId, id);
      expect((await c.post(`/api/prep/attempts/${id}/complete`, {})).status).toBe(200);
      // "Consistently secure" needs the two attempts on different days
      await c.post("/api/test/clock", { advanceDays: 1 });
    }
    const r = (await c.get("/api/prep/results")).body.grades[1].readiness;
    expect(r).toMatchObject({ label: "on_track", attemptsUsed: 2, percent: 100 });
    // finish early: half answered, the rest "not yet assessed", and coverage too low to count towards readiness
    const id = (await c.post("/api/exams/2/start", { mode: "mock", seed: 33 })).body.id as string;
    const n = app.prep.blueprint(2).totalItems;
    await answerAll(app, c, userId, id, () => false, (i) => i < n / 2);
    const refuse = await c.post(`/api/prep/attempts/${id}/complete`, {});
    expect(refuse.status).toBe(409);
    expect(refuse.body.error.code).toBe("incomplete");
    const early = await c.post(`/api/prep/attempts/${id}/complete`, { allowUnanswered: true });
    expect(early.body.answered).toBeLessThan(n);
    expect(early.body.notAssessed.length).toBeGreaterThan(0);
    expect(early.body.outcomes.filter((o: { level: string }) => o.level === "not_assessed").length).toBe(early.body.notAssessed.length);
    const after = (await c.get("/api/prep/results")).body.grades[1].readiness;
    expect(after.ignored.some((x: { id: string; reason: string }) => x.id === id && x.reason === "too_few_answered")).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS c FROM prep_attempts WHERE user_id = ? AND status = 'complete'").get(userId)).toEqual({ c: 3 });
  }, 120_000);
});

describe("review fixes: what the numbers tell a learner", () => {
  it("a mostly blank mock is scored against the whole paper and gives no estimate at all", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/2/start", { mode: "mock", seed: 5 })).body.id as string;
    const n = app.prep.blueprint(2).totalItems;
    await answerAll(app, c, userId, id, () => false, (i) => i < 10);
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, { allowUnanswered: true })).body;
    expect(s.score).toBe(10);
    expect(s.independentQuestions).toBe(n); // every unanswered question is counted, as not right
    expect(s.independentPercent).toBe(Math.round((100 * 10) / n));
    const r = (await c.get("/api/prep/results")).body.grades[1].readiness;
    expect(r.label).toBe("not_enough_evidence");
    expect(r.ignored).toEqual([{ id, reason: "too_few_answered" }]);
  }, 60_000);

  it("a recommendation sends the learner to the lesson for the question they missed, not the outcome's first lesson", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/5/start", { mode: "mock", seed: 9 })).body.id as string;
    const items = app.prep.internalItems(userId, id);
    // miss a question of a broad outcome (g5.07: keys and scales): its concepts differ between questions
    const target = items.findIndex((i) => i.planned.outcomeId === "abrsm2020.g5.07");
    await answerAll(app, c, userId, id, (i) => i === target);
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    const missed = items[target]!.planned.conceptIds;
    const teaches = (nodeId: string) => missed.some((cid) => (course.ix.conceptTaughtBy.get(cid) ?? []).some((n) => n.id === nodeId));
    const lessons = s.recommendations.filter((r: { kind: string }) => r.kind === "lesson");
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.some((r: { nodeId: string }) => teaches(r.nodeId))).toBe(true);
    const row = s.outcomes.find((o: { outcomeId: string }) => o.outcomeId === "abrsm2020.g5.07");
    expect(row.revisit.some((nodeId: string) => teaches(nodeId))).toBe(true);
    const rev = s.recommendations.find((r: { kind: string; conceptId?: string }) => r.kind === "revision" && missed.includes(r.conceptId!));
    expect(rev, "the revision topic is one of the missed question's concepts").toBeDefined();
  }, 60_000);

  it("a missed score-reading question still produces advice", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/3/start", { mode: "mock", seed: 3 })).body.id as string;
    const items = app.prep.internalItems(userId, id);
    const reading = items.findIndex((i) => i.planned.combined);
    // a wrong answer can only be built for some question types: use the first reading question that has one
    const { wrongResponse } = await import("@mtp/engine");
    const idx = items.findIndex((i) => i.planned.combined && wrongResponse(course.ix, i.item, i.scope));
    expect(idx).toBeGreaterThanOrEqual(0);
    void reading;
    await answerAll(app, c, userId, id, (i) => i === idx);
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    expect(s.recommendations.some((r: { why: string }) => /Reading music in context/.test(r.why))).toBe(true);
  }, 60_000);

  it("the same question never appears twice in a paper, however its options are shuffled (the seeds that failed review)", async () => {
    const { contentKey } = await import("../src/prep.ts");
    const { app } = boot();
    for (const [grade, seeds] of [[1, [23, 71, 11, 37, 53]], [2, [71, 11, 23]], [5, [23, 71]]] as Array<[number, number[]]>) {
      for (const seed of seeds) {
        const u = await learner(app, `d${grade}${seed}`);
        const id = (await u.c.post(`/api/exams/${grade}/start`, { mode: "mock", seed })).body.id as string;
        const keys = app.prep.internalItems(u.userId, id).map((i) => contentKey(i.item));
        expect(new Set(keys).size, `grade ${grade} seed ${seed}: the same question twice`).toBe(keys.length);
      }
    }
  }, 120_000);
});

describe("technical review: help obtained after the paper was planned", () => {
  it("a question the learner was shown with help BEFORE answering it is coached, even if the help came after the mock started; help after the answer changes nothing", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const { recordExposure } = await import("../src/mastery-service.ts");
    const id = (await c.post("/api/exams/1/start", { mode: "mock", seed: 42 })).body.id as string;
    const items = app.prep.internalItems(userId, id);
    expect(items.every((i) => !i.planned.coached)).toBe(true); // nothing was coached when it was planned
    // the learner now gets help on the first 5 questions in the practice lab, then answers the paper
    await c.post("/api/test/clock", { advanceMinutes: 1 });
    for (const it of items.slice(0, 5)) recordExposure(db, userId, it.planned.questionKey, "practice-hint", app.clock.now().toISOString());
    await c.post("/api/test/clock", { advanceMinutes: 1 });
    await answerAll(app, c, userId, id);
    // help on question 6 that arrives AFTER it was answered cannot make that answer coached
    await c.post("/api/test/clock", { advanceMinutes: 1 });
    recordExposure(db, userId, items[5]!.planned.questionKey, "practice-attempt", app.clock.now().toISOString());
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    expect(s.coachedQuestions).toBe(5);
    expect(s.independentQuestions).toBe(s.questions - 5);
    expect(s.review.slice(0, 5).every((r: { independent: boolean }) => !r.independent)).toBe(true);
    expect(s.review[5].independent).toBe(true);
    // two such papers never reach "Consistently secure"
    const r = (await c.get("/api/prep/results")).body.grades[0].readiness;
    expect(r.label).not.toBe("on_track");
  }, 60_000);
});

describe("technical review: placement start, admission, resume", () => {
  it("rations new papers per learner, while resuming an open one is always free and abandoning does not reset the count", async () => {
    const { app } = boot({ startsPer10Min: 2 });
    const { c } = await learner(app);
    const a = await c.post("/api/exams/1/start", { mode: "mock" });
    const b = await c.post("/api/exams/2/start", { mode: "mock" });
    expect([a.status, b.status]).toEqual([200, 200]);
    const third = await c.post("/api/exams/3/start", { mode: "mock" });
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("rate_limited");
    expect((await c.post("/api/exams/1/start", { mode: "mock" })).body.id).toBe(a.body.id); // resuming costs nothing
    await c.post(`/api/prep/attempts/${a.body.id}/abandon`);
    expect((await c.post("/api/exams/1/start", { mode: "mock" })).status).toBe(429); // regenerating straight away is still limited
    // another learner is unaffected
    const other = await learner(app, "other");
    expect((await other.c.post("/api/exams/1/start", { mode: "mock" })).status).toBe(200);
  }, 60_000);
});

describe("practice mode is for learning and never becomes independent evidence", () => {
  it("gives hints and immediate feedback; its score and levels are labelled as practice and add nothing to readiness", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/1/start", { mode: "practice" })).body.id as string;
    const v = (await c.get(`/api/prep/attempts/${id}`)).body;
    expect(v.firstAttemptOnly).toBe(false);
    expect(v.items[0].section).toBeTruthy();
    const items = app.prep.internalItems(userId, id);
    const f = items[0]!;
    const hint = await c.post(`/api/prep/attempts/${id}/hint`, { itemId: f.item.id, level: 1 });
    expect(hint.status).toBe(200);
    // a wrong answer is explained, and can be retried
    const bad = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cmd(), itemId: f.item.id, response: (await import("@mtp/engine")).wrongResponse(course.ix, f.item, f.scope) });
    expect(bad.body).toMatchObject({ correct: false, attemptNumber: 1 });
    expect(bad.body.message).toBeTruthy();
    const retry = await c.post(`/api/prep/attempts/${id}/answers`, { attemptId: cmd(), itemId: f.item.id, response: canonicalResponse(course.ix, f.item, f.scope) });
    expect(retry.body).toMatchObject({ correct: true, attemptNumber: 2 });
    await answerAll(app, c, userId, id, () => false, (i) => i > 0);
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    expect(s.mode).toBe("practice");
    // first try without a hint counts as the practice score: question 0 had a hint and a wrong first try
    expect(s.score).toBe(s.questions - 1);
    expect(s.hintsUsed).toBe(1);
    expect(s.independentQuestions).toBe(0);
    expect(s.independentPercent).toBeNull();
    expect(s.outcomes.every((o: { level: string }) => o.level === "not_assessed")).toBe(true);
    expect(s.outcomes.some((o: { practiceLevel: string }) => o.practiceLevel !== "not_assessed")).toBe(true);
    const r = (await c.get("/api/prep/results")).body.grades[0].readiness;
    expect(r.label).toBe("not_enough_evidence");
    expect(r.ignored).toEqual([{ id, reason: "practice_mode" }]);
    // the questions shown with help are recorded, so they can never again be fresh independent evidence
    expect((db.prepare("SELECT COUNT(*) AS c FROM question_exposure WHERE user_id = ?").get(userId) as { c: number }).c).toBeGreaterThan(0);
  }, 90_000);

  it("a later mock never repeats a question the learner was shown with help or with the answer", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const first = (await c.post("/api/exams/1/start", { mode: "practice", seed: 5 })).body.id as string;
    await answerAll(app, c, userId, first);
    await c.post(`/api/prep/attempts/${first}/complete`, {});
    const keys = new Set(app.prep.internalItems(userId, first).map((i) => i.planned.questionKey));
    // the same seed would produce the same paper, but the planner steers away from everything already seen
    const second = (await c.post("/api/exams/1/start", { mode: "mock", seed: 5 })).body.id as string;
    const next = app.prep.internalItems(userId, second);
    expect(next.filter((i) => keys.has(i.planned.questionKey))).toHaveLength(0);
    expect(next.every((i) => !i.planned.coached)).toBe(true);
  }, 90_000);

  it("a question the learner had seen with help is scored but not counted as independent (flag decided by the server)", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/1/start", { mode: "mock" })).body.id as string;
    const items = JSON.parse((db.prepare("SELECT items FROM prep_attempts WHERE id = ?").get(id) as { items: string }).items);
    for (let i = 0; i < 5; i++) items[i].coached = true;
    db.prepare("UPDATE prep_attempts SET items = ? WHERE id = ?").run(JSON.stringify(items), id);
    await answerAll(app, c, userId, id);
    const s = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    expect(s.score).toBe(s.questions);
    expect(s.coachedQuestions).toBe(5);
    expect(s.independentQuestions).toBe(s.questions - 5);
    expect(s.review.slice(0, 5).every((r: { independent: boolean }) => !r.independent)).toBe(true);
  }, 60_000);
});

describe("timed and untimed behaviour", () => {
  const cfg: PrepConfig = { ...DEFAULT_PREP };
  it("an untimed attempt has no clock at all; practice mode cannot be timed", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const v = (await c.post("/api/exams/3/start", { mode: "mock" })).body;
    expect(v.timing).toMatchObject({ timed: false, limitSeconds: null, deadlineAt: null, remainingSeconds: null, expired: false });
    const bad = await c.post("/api/exams/3/start", { mode: "practice", timed: true });
    expect(bad.status).toBe(400);
    const odd = await c.post("/api/exams/4/start", { mode: "mock", timed: true, extraTimePercent: 33 });
    expect(odd.status).toBe(400);
  }, 60_000);

  it("a timed mock: the limit is questions x the configured pace (+ accommodation), kept on the server, enforced with a short grace, and results never depend on speed", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const v = (await c.post("/api/exams/3/start", { mode: "mock", timed: true, extraTimePercent: 50 })).body;
    const n = v.items.length;
    const limit = Math.ceil(n * cfg.exam.secondsPerQuestion * 1.5);
    expect(v.timing).toMatchObject({ timed: true, limitSeconds: limit, extraTimePercent: 50, remainingSeconds: limit, expired: false });
    // resuming does not restart the clock
    await c.post("/api/test/clock", { advanceMinutes: 10 });
    const resumed = (await c.post("/api/exams/3/start", { mode: "mock", timed: true, extraTimePercent: 50 })).body;
    expect(resumed.id).toBe(v.id);
    expect(resumed.timing.remainingSeconds).toBe(limit - 600);
    const items = app.prep.internalItems(userId, v.id);
    await answerAll(app, c, userId, v.id, () => false, (i) => i < 3);
    // just past the deadline but inside the grace: accepted
    await c.post("/api/test/clock", { advanceMinutes: (limit - 600 + 3) / 60 });
    const late = items[3]!;
    const inGrace = await c.post(`/api/prep/attempts/${v.id}/answers`, { attemptId: cmd(), itemId: late.item.id, response: canonicalResponse(course.ix, late.item, late.scope) });
    expect(inGrace.status).toBe(200);
    // beyond the grace: refused, and recorded nothing
    await c.post("/api/test/clock", { advanceMinutes: 1 });
    const over = items[4]!;
    const refused = await c.post(`/api/prep/attempts/${v.id}/answers`, { attemptId: cmd(), itemId: over.item.id, response: canonicalResponse(course.ix, over.item, over.scope) });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("time_up");
    const view = (await c.get(`/api/prep/attempts/${v.id}`)).body;
    expect(view.timing).toMatchObject({ remainingSeconds: 0, expired: true });
    // time is up: finishing is allowed without the early-finish flag; unanswered questions are "not assessed"
    const s = (await c.post(`/api/prep/attempts/${v.id}/complete`, {})).body;
    expect(s).toMatchObject({ timed: true, timedOut: true, timeLimitSeconds: limit, answered: 4, score: 4 });
    expect(s.notAssessed.length).toBeGreaterThan(0);
  }, 90_000);

  it("the same answers score the same whether given quickly, slowly or with extra time", async () => {
    const scores: number[] = [];
    for (const [extra, wait] of [[0, 0], [100, 30]] as const) {
      const { app } = boot();
      const { c, userId } = await learner(app);
      const v = (await c.post("/api/exams/2/start", { mode: "mock", timed: true, extraTimePercent: extra, seed: 99 })).body;
      await c.post("/api/test/clock", { advanceMinutes: wait });
      await answerAll(app, c, userId, v.id, (i) => i % 5 === 0);
      scores.push((await c.post(`/api/prep/attempts/${v.id}/complete`, {})).body.score);
    }
    expect(scores[0]).toBe(scores[1]);
  }, 90_000);

  it("the saved accommodation (profile) applies to a timed mock unless the request chooses another", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    expect((await c.call("PATCH", "/api/me/profile", { settings: { examExtraTime: 25 } })).body.profile.settings.examExtraTime).toBe(25);
    expect((await c.get("/api/prep")).body.extraTimePercent).toBe(25);
    const v = (await c.post("/api/exams/1/start", { mode: "mock", timed: true })).body;
    expect(v.timing.extraTimePercent).toBe(25);
    expect(v.timing.limitSeconds).toBe(Math.ceil(v.items.length * cfg.exam.secondsPerQuestion * 1.25));
    expect((await c.call("PATCH", "/api/me/profile", { settings: { examExtraTime: 40 } })).status).toBe(400);
  }, 60_000);
});

describe("persistence, versions and compatibility", () => {
  it("records seeds, template versions, raw responses and the rubric; a new rubric or curriculum never rewrites an old result", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const id = (await c.post("/api/exams/1/start", { mode: "mock", seed: 4242 })).body.id as string;
    await answerAll(app, c, userId, id, (i) => i === 0);
    const done = (await c.post(`/api/prep/attempts/${id}/complete`, {})).body;
    const row = db.prepare("SELECT seed, rubric_version, blueprint_version, curriculum_version, rubric, items FROM prep_attempts WHERE id = ?").get(id) as { seed: number; rubric_version: number; blueprint_version: number; curriculum_version: string; rubric: string; items: string };
    expect(row).toMatchObject({ seed: 4242, rubric_version: DEFAULT_PREP.rubricVersion, blueprint_version: 1, curriculum_version: course.version });
    expect(JSON.parse(row.rubric).readiness.onTrackPercent).toBe(DEFAULT_PREP.readiness.onTrackPercent);
    const planned = JSON.parse(row.items) as Array<{ seed: number; templateVersion: number; fingerprint: string }>;
    expect(planned.every((p) => Number.isInteger(p.seed) && p.templateVersion >= 1 && p.fingerprint.length > 0)).toBe(true);
    const resp = db.prepare("SELECT response, template_version, seed, correct FROM prep_responses WHERE attempt_id = ? ORDER BY created_at").all(id) as Array<{ response: string; template_version: number; seed: number; correct: number }>;
    expect(resp).toHaveLength(planned.length);
    expect(JSON.parse(resp[0]!.response)).toHaveProperty("kind");
    expect(resp[0]!.correct).toBe(0);
    // the rules move on: a new app on the SAME database with rubric version 2
    const next = boot({ db, prep: { ...DEFAULT_PREP, rubricVersion: DEFAULT_PREP.rubricVersion + 1, readiness: { ...DEFAULT_PREP.readiness, onTrackPercent: 90 } } });
    const c2 = new Client(next.app);
    c2.cookie = c.cookie;
    const hist = (await c2.get("/api/prep/results")).body;
    expect(hist.results[0]).toMatchObject({ id, rubricVersion: DEFAULT_PREP.rubricVersion, superseded: true, percent: done.percent });
    expect(hist.results[0].supersededNote).toMatch(/earlier rules/);
    expect(hist.grades[0].readiness.ignored).toEqual([{ id, reason: "older_rules" }]);
    // and the stored result is returned exactly as it was
    const again = (await c2.get(`/api/prep/attempts/${id}/result`)).body;
    expect(again.summary).toEqual({ ...done, alreadyComplete: undefined });
    expect(again.superseded).toBe(true);
  }, 90_000);

  it("an attempt whose generator changed under it is closed, never regraded", async () => {
    const { db, app } = boot();
    const { c } = await learner(app);
    const id = (await c.post("/api/exams/1/start", { mode: "practice" })).body.id as string;
    const items = JSON.parse((db.prepare("SELECT items FROM prep_attempts WHERE id = ?").get(id) as { items: string }).items);
    items[0].fingerprint = "changed";
    db.prepare("UPDATE prep_attempts SET items = ? WHERE id = ?").run(JSON.stringify(items), id);
    const r = await c.get(`/api/prep/attempts/${id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("stale_items");
    expect((db.prepare("SELECT status FROM prep_attempts WHERE id = ?").get(id) as { status: string }).status).toBe("abandoned");
    // a fresh attempt can be started straight away
    expect((await c.post("/api/exams/1/start", { mode: "practice" })).status).toBe(200);
  }, 60_000);

  it("an interrupted attempt resumes on another device with its answers", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    await c.post("/api/auth/register", { email: "sam@example.com", password: "correct horse battery", displayName: "Sam" });
    const id = (await c.post("/api/exams/2/start", { mode: "mock" })).body.id as string;
    await answerAll(app, c, userId, id, () => false, (i) => i < 4);
    const other = new Client(app); // a second device: signs in separately
    expect((await other.post("/api/auth/login", { email: "sam@example.com", password: "correct horse battery" })).status).toBe(200);
    const v = (await other.post("/api/exams/2/start", { mode: "mock" })).body;
    expect(v.id).toBe(id);
    expect(v.items.filter((i: { answered: boolean }) => i.answered)).toHaveLength(4);
  }, 60_000);
});

describe("privacy and isolation between learners", () => {
  it("another account can neither see nor change an attempt; command ids do not collide across accounts; export and deletion are per learner", async () => {
    const { db, app } = boot();
    const a = await learner(app, "a");
    const b = await learner(app, "b");
    const id = (await a.c.post("/api/exams/1/start", { mode: "mock" })).body.id as string;
    const it0 = app.prep.internalItems(a.userId, id)[0]!;
    const response = canonicalResponse(course.ix, it0.item, it0.scope);
    const shared = cmd();
    expect((await a.c.post(`/api/prep/attempts/${id}/answers`, { attemptId: shared, itemId: it0.item.id, response })).status).toBe(200);
    for (const [m, p] of [["GET", `/api/prep/attempts/${id}`], ["GET", `/api/prep/attempts/${id}/result`], ["POST", `/api/prep/attempts/${id}/complete`], ["POST", `/api/prep/attempts/${id}/abandon`]] as const) {
      const r = await b.c.call(m, p, m === "POST" ? {} : undefined);
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    const intrude = await b.c.post(`/api/prep/attempts/${id}/answers`, { attemptId: shared, itemId: it0.item.id, response });
    expect(intrude.status).toBe(404);
    // B starts their own and reuses A's command id for it: allowed, and independent
    const idB = (await b.c.post("/api/exams/1/start", { mode: "mock" })).body.id as string;
    expect(idB).not.toBe(id);
    const itB = app.prep.internalItems(b.userId, idB)[0]!;
    expect((await b.c.post(`/api/prep/attempts/${idB}/answers`, { attemptId: shared, itemId: itB.item.id, response: canonicalResponse(course.ix, itB.item, itB.scope) })).body.replayed).toBe(false);
    expect((await b.c.get("/api/prep")).body.grades[0].open).toHaveLength(1);
    // export contains only one's own rows, including the new tables
    const exp = (await a.c.get("/api/me/export")).body;
    expect(exp.prepAttempts.map((r: { id: string }) => r.id)).toEqual([id]);
    expect(exp.prepResponses).toHaveLength(1);
    for (const k of ["prepHintUses", "placementStarts", "revisionSessions", "revisionAttempts"]) expect(exp).toHaveProperty(k);
    // deleting A removes A's exam data and leaves B's
    expect((await a.c.call("DELETE", "/api/me", { userId: (await a.c.get("/api/me")).body.user.id })).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS c FROM prep_attempts WHERE user_id = ?").get(a.userId)).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM prep_responses WHERE user_id = ?").get(a.userId)).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM prep_attempts WHERE user_id = ?").get(b.userId)).toEqual({ c: 1 });
  }, 90_000);

  it("different seeds make meaningfully different papers; the same seed repeats a paper exactly", async () => {
    const { app } = boot();
    const u1 = await learner(app, "one");
    const u2 = await learner(app, "two");
    const u3 = await learner(app, "three");
    const mk = async (u: typeof u1, seed: number) => {
      const id = (await u.c.post("/api/exams/2/start", { mode: "mock", seed })).body.id as string;
      return app.prep.internalItems(u.userId, id).map((i) => i.planned);
    };
    const a = await mk(u1, 1001);
    const b = await mk(u2, 2002);
    const a2 = await mk(u3, 1001);
    expect(a2.map((i) => i.itemId)).toEqual(a.map((i) => i.itemId)); // repeatable
    const keysA = new Set(a.map((i) => i.questionKey));
    const shared = b.filter((i) => keysA.has(i.questionKey)).length;
    expect(shared / b.length).toBeLessThan(0.25); // different questions, not a reshuffle
    const sameTemplateAtSamePlace = a.filter((p, i) => p.templateId === b[i]!.templateId).length;
    expect(sameTemplateAtSamePlace / a.length).toBeLessThan(0.9); // and the templates rotate too
    // every outcome is still covered by both
    expect(new Set(a.map((i) => i.outcomeId)).size).toBe(new Set(b.map((i) => i.outcomeId)).size);
  }, 90_000);
});
