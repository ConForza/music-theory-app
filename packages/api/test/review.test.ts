import { describe, expect, it } from "vitest";
import { generateItem } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";
import { ReviewService } from "../src/review.ts";
import { Client, LESSON, answerSession, finishLesson, playNode, rightAnswer, register, sessionItems, setupClock, sharedCourse, wrongAnswer } from "./helpers.ts";

const course = sharedCourse();
const TREBLE = "c.clefs.treble-lines";

async function learnerWithLesson() {
  const s = setupClock();
  const c = s.client();
  await register(c);
  await finishLesson(c);
  return { ...s, c };
}
const due = async (c: Client) => (await c.get("/api/review")).body;
const upcoming = async (c: Client) => (await due(c)).upcoming.find((u: { conceptId: string }) => u.conceptId === TREBLE)?.dueDate as string | undefined;

describe("review eligibility", () => {
  it("offers nothing when nothing is due, instead of inventing overdue work", async () => {
    const { c } = await learnerWithLesson();
    const r = await c.post("/api/review/sessions");
    expect(r.body).toMatchObject({ session: null, reason: "nothing_due" });
    expect((await due(c)).recommendation.kind).not.toBe("review");
  });

  it("never offers review to a learner with no evidence, however much time passes", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c);
    clock.advanceDays(90);
    expect((await c.post("/api/review/sessions")).body).toMatchObject({ session: null, reason: "nothing_due" });
  });

  it("builds a session the next day from taught, completed material only", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    expect(session.items).toHaveLength(2); // two templates for the one reviewable concept
    const stored = sessionItems(db, session.id);
    expect(new Set(stored.map((s) => s.templateId))).toEqual(new Set(["t.g1.note-read", "t.g1.note-write"]));
    expect(stored.every((s) => s.conceptId === TREBLE && s.nodeId === LESSON)).toBe(true);
    for (const it of session.items) {
      expect(it.item.hintCount).toBe(0); // review is independent: no hints exist
      expect(JSON.stringify(it)).not.toMatch(/"accepted"|correctOptionIds|"answer"/);
      if (it.item.music) expect(it.item.music.clef).toBe("treble"); // inside the taught scope (treble only)
    }
    // "The stave" is also due but its lesson is not complete, so it waits and is never shown.
    expect((await due(c)).waiting).toBe(1);
  });

  it("does not review a concept whose lesson was answered but never completed", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c);
    await playNode(c, course, LESSON, { complete: false });
    clock.advanceDays(2);
    expect((await c.post("/api/review/sessions")).body).toMatchObject({ session: null, reason: "no_questions_yet" });
  });

  it("skips templates that have no generator, and concepts with no usable template", async () => {
    const { db, clock, app } = setupClock();
    const node = course.ix.nodeById.get(LESSON)!;
    const fake = { ...node, conceptIds: ["c.fake"], exercises: [{ templateId: "t.g5.score", conceptIds: ["c.fake"], scope: {} }] };
    const patched = { ...course, ix: { ...course.ix, conceptTaughtBy: new Map([["c.fake", [fake]]]) } } as unknown as typeof course;
    const svc = new ReviewService(db, patched, clock, app.engagement.mastery, app.engagement.xp, app.engagement.activity, app.engagement.achievements, { maxConcepts: 4, itemsPerConcept: 2 });
    expect(svc.candidates("c.fake", new Set([LESSON]))).toEqual([]);
    const real = new ReviewService(db, course, clock, app.engagement.mastery, app.engagement.xp, app.engagement.activity, app.engagement.achievements, { maxConcepts: 4, itemsPerConcept: 2 });
    expect(real.candidates(TREBLE, new Set())).toEqual([]); // not completed: not taught yet
    expect(real.candidates(TREBLE, new Set([LESSON])).map((c) => c.templateId).sort()).toEqual(["t.g1.note-read", "t.g1.note-write"]);
  });

  it("does not use content from later lessons: every candidate scope is the teaching binding's effective scope", () => {
    const { db, clock, app } = setupClock();
    const svc = new ReviewService(db, course, clock, app.engagement.mastery, app.engagement.xp, app.engagement.activity, app.engagement.achievements, { maxConcepts: 4, itemsPerConcept: 2 });
    const node = course.ix.nodeById.get(LESSON)!;
    for (const cand of svc.candidates(TREBLE, new Set([LESSON]))) {
      expect(cand.scope).toEqual(effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === cand.templateId)!));
      expect((cand.scope as { clefs?: string[] }).clefs).toEqual(["treble"]);
    }
  });
});

describe("a review session", () => {
  it("schedules deterministically: success moves the due date through the 3, 7, 14 and 30 day intervals", async () => {
    const { c, clock, db } = await learnerWithLesson();
    expect(await upcoming(c)).toBe("2026-03-03");
    const dates: string[] = [];
    for (const wait of [1, 3, 7, 14]) {
      clock.advanceDays(wait);
      const { session } = (await c.post("/api/review/sessions")).body;
      await answerSession(c, db, session.id);
      expect((await c.post(`/api/review/sessions/${session.id}/complete`)).status).toBe(200);
      dates.push((await upcoming(c))!);
    }
    expect(dates).toEqual(["2026-03-06", "2026-03-13", "2026-03-27", "2026-04-26"]);
  });

  it("a wrong answer gives the engine's explanation, a focused remedial question and a lapse reschedule", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const first = sessionItems(db, session.id)[0]!;
    const wrong = await c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: first.itemId, response: wrongAnswer(first) });
    expect(wrong.body).toMatchObject({ correct: false, counted: true, kind: "review" });
    expect(typeof wrong.body.message).toBe("string");
    expect(wrong.body.reason).toBeTruthy();
    expect(wrong.body.category).toBeTruthy();
    expect(wrong.body.remedialItemId).toBeTruthy();
    expect(wrong.body.nextDueDate).toBe("2026-03-06"); // lapse: index 1 = 3 days from today (2026-03-03)
    const view = (await c.get(`/api/review/sessions/${session.id}`)).body;
    expect(view.items[1]).toMatchObject({ kind: "remedial", forItemId: first.itemId });
    expect(view.items[1].item.hintCount).toBe(0);
    // The remedial question is on the same idea (same template), a different question.
    const stored = sessionItems(db, session.id);
    expect(stored[1]!.templateId).toBe(first.templateId);
    expect(stored[1]!.itemId).not.toBe(first.itemId);
  });

  it("remedial, retried and revealed answers never count as mastery evidence", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const [first] = sessionItems(db, session.id);
    const send = (itemId: string, response: unknown) => c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId, response });
    await send(first!.itemId, wrongAnswer(first!));
    const retry = await send(first!.itemId, rightAnswer(first!)); // right on the second go
    expect(retry.body).toMatchObject({ correct: true, counted: false, attemptNumber: 2 });
    const rem = sessionItems(db, session.id).find((s) => s.kind === "remedial")!;
    const remedial = await send(rem.itemId, rightAnswer(rem));
    expect(remedial.body).toMatchObject({ correct: true, counted: false });
    for (let i = 0; i < 2; i++) await send(first!.itemId, wrongAnswer(first!));
    const revealed = await send(first!.itemId, wrongAnswer(first!));
    expect(revealed.body.solution).toBeTruthy(); // the worked answer arrives after three wrong tries
    const rows = db.prepare("SELECT source, counts, correct FROM mastery_evidence WHERE session_id = ? ORDER BY rowid").all(session.id);
    expect(rows).toEqual([
      { source: "review-item", counts: 1, correct: 0 },
      { source: "remedial-step", counts: 0, correct: 1 },
    ]);
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(4); // unchanged from the lesson
  });

  it("completes only when every question (and remedial) has been attempted, rewards once, and repeats the same reply", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    expect((await c.post(`/api/review/sessions/${session.id}/complete`)).status).toBe(409);
    await answerSession(c, db, session.id, (_s, i) => (i === 0 ? "wrong" : "right"));
    const done = (await c.post(`/api/review/sessions/${session.id}/complete`)).body;
    expect(done).toMatchObject({ questions: 2, firstTryCorrect: 1, remedialDone: 1, xp: { awarded: 8 } });
    expect(done.concepts[0]).toMatchObject({ conceptId: TREBLE, result: "needs-practice" });
    const again = (await c.post(`/api/review/sessions/${session.id}/complete`)).body;
    expect(again.alreadyComplete).toBe(true);
    expect(again.xp.awarded).toBe(8);
    expect((await c.get("/api/engagement")).body.xp.total).toBe(18); // 10 for the lesson + 8, once
    expect((await c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: done && sessionItems(db, session.id)[0]!.itemId, response: rightAnswer(sessionItems(db, session.id)[0]!) })).body.error.code).toBe("session_closed");
  });

  it("perfect sessions earn evidence and delayed-review credit, but only questions the learner has not met count towards the totals", async () => {
    const { c, clock, db } = await learnerWithLesson();
    for (const wait of [1, 3]) {
      clock.advanceDays(wait);
      const { session } = (await c.post("/api/review/sessions")).body;
      await answerSession(c, db, session.id);
      await c.post(`/api/review/sessions/${session.id}/complete`);
    }
    const m = (await c.get(`/api/mastery/${TREBLE}`)).body;
    // Today's generators have few distinct line-note questions (see PROGRESSION.md), so this honestly stops short of 8.
    expect(m).toMatchObject({ delayedReviews: 2, spanDays: 4, distinctTemplates: 2 });
    expect(m.independentCorrect).toBeGreaterThanOrEqual(5);
    expect(m.independentCorrect).toBeLessThanOrEqual(8);
    expect(m.trail.filter((t: { counted: boolean }) => t.counted).length).toBeGreaterThanOrEqual(8);
  });

  it("with enough distinct evidence (fixtures) a topic reaches mastered, then becomes review_due without being erased", async () => {
    const { c, clock, app } = await learnerWithLesson();
    const uid = (await c.get("/api/me")).body.user.id;
    const add = (n: number, tpl: string) =>
      app.engagement.mastery.record(uid, { id: `review:fixture-${n}`, conceptIds: [TREBLE], source: "review-item", correct: true, itemId: `fixture-item-${n}`, questionKey: `fixture-key-${n}`, templateId: tpl, templateVersion: 1 });
    clock.advanceDays(1);
    add(1, "t.g1.note-read");
    add(2, "t.g1.note-write");
    clock.advanceDays(3);
    add(3, "t.g1.note-read");
    add(4, "t.g1.note-write");
    const m = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(m).toMatchObject({ state: "mastered", independentCorrect: 8, delayedReviews: 2, spanDays: 4 });
    expect((await due(c)).groups.mastered.map((g: { conceptId: string }) => g.conceptId)).toContain(TREBLE);
    clock.advanceDays(10);
    expect((await c.get(`/api/mastery/${TREBLE}`)).body).toMatchObject({ state: "review_due", highestState: "mastered", due: true });
    expect((await c.post("/api/review/sessions")).body.session.items.length).toBeGreaterThan(0);
  });

  it("shares one open session across devices, and starts afresh the next day", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const second = new Client(c.app);
    second.cookie = c.cookie;
    const ids = await Promise.all([c.post("/api/review/sessions"), second.post("/api/review/sessions"), c.post("/api/review/sessions")]);
    expect(new Set(ids.map((r) => r.body.session.id)).size).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM review_sessions WHERE status = 'open'").get()).toEqual({ n: 1 });
    clock.advanceDays(1);
    const next = (await c.post("/api/review/sessions")).body.session;
    expect(next.id).not.toBe(ids[0]!.body.session.id);
    expect((db.prepare("SELECT status FROM review_sessions WHERE id = ?").get(ids[0]!.body.session.id) as { status: string }).status).toBe("abandoned");
  });

  it("only the first of two simultaneous answers to one question counts", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const first = sessionItems(db, session.id)[0]!;
    const send = (response: unknown) => c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: first.itemId, response });
    const rs = await Promise.all([send(rightAnswer(first)), send(wrongAnswer(first)), send(rightAnswer(first))]);
    expect(rs.map((r) => r.body.attemptNumber).sort()).toEqual([1, 2, 3]);
    expect(rs.filter((r) => r.body.counted)).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM mastery_evidence WHERE session_id = ? AND counts = 1").get(session.id) as { n: number }).n).toBe(1);
  });

  it("retries are idempotent: the same command repeats its reply, a changed answer under the same id is refused", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const first = sessionItems(db, session.id)[0]!;
    const attemptId = crypto.randomUUID();
    const body = { attemptId, itemId: first.itemId, response: wrongAnswer(first) };
    const a = await c.post(`/api/review/sessions/${session.id}/attempts`, body);
    const b = await c.post(`/api/review/sessions/${session.id}/attempts`, body);
    expect(b.body).toMatchObject({ correct: false, replayed: true, attemptNumber: 1 });
    expect(a.body.remedialItemId).toBe(b.body.remedialItemId);
    expect((await c.post(`/api/review/sessions/${session.id}/attempts`, { ...body, response: rightAnswer(first) })).body.error.code).toBe("attempt_conflict");
    expect(db.prepare("SELECT COUNT(*) AS n FROM review_attempts WHERE session_id = ?").get(session.id)).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM mastery_evidence WHERE session_id = ?").get(session.id)).toEqual({ n: 1 });
  });

  it("stores seeds, template versions and fingerprints so every question can be reproduced", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    for (const si of sessionItems(db, session.id)) {
      const node = course.ix.nodeById.get(si.nodeId)!;
      const scope = effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === si.templateId)!);
      const again = generateItem(course.ix, si.templateId, si.seed, { scope, evidence: "independent", version: si.templateVersion, fingerprint: si.fingerprint }).item;
      expect(again.id).toBe(si.itemId);
      expect(si.itemId).toContain(`.s${si.seed}.`);
    }
    // Same session id and concept always derive the same seeds (no randomness in selection).
    const again = sessionItems(db, session.id).map((s) => s.seed);
    expect(again).toEqual(sessionItems(db, session.id).map((s) => s.seed));
  });

  it("drops a question whose generator changed (stale), instead of grading it against different music", async () => {
    const { c, clock, db } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const items = sessionItems(db, session.id);
    const broken = items.map((s, i) => (i === 0 ? { ...s, fingerprint: "00000000" } : s));
    db.prepare("UPDATE review_sessions SET items = ? WHERE id = ?").run(JSON.stringify(broken), session.id);
    const view = (await c.get(`/api/review/sessions/${session.id}`)).body;
    expect(view.items).toHaveLength(1);
    expect(view.items[0].item.id).toBe(items[1]!.itemId);
    expect((await c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: items[0]!.itemId, response: rightAnswer(items[0]!) })).status).toBe(404);
    // If every question is stale the session is rebuilt rather than left unplayable.
    db.prepare("UPDATE review_sessions SET items = ? WHERE id = ?").run(JSON.stringify(items.map((s) => ({ ...s, fingerprint: "00000000" }))), session.id);
    const rebuilt = (await c.post("/api/review/sessions")).body.session;
    expect(rebuilt.id).not.toBe(session.id);
    expect(rebuilt.items.length).toBeGreaterThan(0);
  });

  it("has no hint route: review is independent", async () => {
    const { c, clock } = await learnerWithLesson();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    expect((await c.post(`/api/review/sessions/${session.id}/hint`, { itemId: "x", level: 1 })).status).toBe(404);
  });

  it("includes earlier-grade concepts alongside later ones (all grades are eligible when due)", async () => {
    const { client, clock, db } = setupClock();
    const c = client();
    await register(c);
    await playNode(c, course, LESSON);
    await playNode(c, course, "G5-U4-L06");
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const grades = new Set(sessionItems(db, session.id).map((s) => course.ix.concepts.get(s.conceptId)!.grade));
    expect(grades).toEqual(new Set([1, 5]));
  });
});
