import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, templateScope } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";
import { questionKey, satisfies } from "../src/question-key.ts";
import { LESSON, answerSession, attemptLesson, canonicalFor, finishLesson, playThrough, register, rightAnswer, sessionItems, setupClock, sharedCourse, wrongFor } from "./helpers.ts";

const course = sharedCourse();
const TREBLE = "c.clefs.treble-lines";
const LINES = { conceptId: TREBLE, clef: "treble" as const, staffPositions: "lines" as const };
const regen = (si: { nodeId: string; templateId: string; seed: number }) => {
  const node = course.ix.nodeById.get(si.nodeId)!;
  const scope = effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === si.templateId)!);
  return generateItem(course.ix, si.templateId, si.seed, { scope, evidence: "independent" }).item;
};
async function learner() {
  const s = setupClock();
  const c = s.client();
  await register(c);
  await finishLesson(c);
  return { ...s, c, uid: (await c.get("/api/me")).body.user.id as string };
}

describe("R1: review only asks about what the concept taught", () => {
  it("never serves a space-note question for treble line notes, across many sessions and remediation", async () => {
    const { c, clock, db } = await learner();
    let served = 0;
    for (let day = 0; day < 12; day++) {
      clock.advanceDays(day === 0 ? 1 : 8);
      const { session } = (await c.post("/api/review/sessions")).body;
      if (!session) continue;
      await answerSession(c, db, session.id, (_s, i) => (i === 0 ? "wrong" : "right")); // include remedial questions
      for (const si of sessionItems(db, session.id)) {
        served++;
        expect(satisfies(regen(si), LINES), `${si.itemId} must be a line-note question`).toBe(true);
      }
      await c.post(`/api/review/sessions/${session.id}/complete`);
    }
    expect(served).toBeGreaterThan(20);
  });

  it("treats a question that breaks the boundary on regeneration as stale", async () => {
    const { c, clock, db } = await learner();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    // Find a space-note question of the same template and swap it in, as if the boundary had moved since the session was made.
    const [first] = sessionItems(db, session.id);
    let bad: ReturnType<typeof sessionItems>[number] | null = null;
    for (let seed = 0; seed < 200 && !bad; seed++) {
      const item = regen({ ...first!, seed });
      if (!satisfies(item, LINES)) bad = { ...first!, seed, itemId: item.id, fingerprint: /\.f([0-9a-f]{8})$/.exec(item.id)![1]! };
    }
    db.prepare("UPDATE review_sessions SET items = ? WHERE id = ?").run(JSON.stringify([bad, ...sessionItems(db, session.id).slice(1)]), session.id);
    const view = (await c.get(`/api/review/sessions/${session.id}`)).body;
    expect(view.items.map((i: { item: { id: string } }) => i.item.id)).not.toContain(bad!.itemId);
  });
});

describe("R2: a new seed is not a new question", () => {
  const keysFor = (template: string) => {
    const node = course.ix.nodeById.get(LESSON)!;
    const scope = effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === template)!);
    const keys = new Set<string>();
    for (let s = 0; s < 300; s++) {
      const item = generateItem(course.ix, template, s, { scope, evidence: "independent" }).item;
      if (satisfies(item, LINES)) keys.add(questionKey(item));
    }
    return keys;
  };

  it("gives the same music and answer the same identity whatever the seed, and different questions different ones", () => {
    const read = keysFor("t.g1.note-read");
    expect(read.size).toBe(5); // five line notes: far fewer than 300 seeds
  });

  it("serves unseen questions first, and a repeated question (new seed, even after a failure) earns no new distinct credit", async () => {
    const { c, clock, db, app, uid } = await learner();
    // Pretend the learner has already met every line-note question there is (seen, some failed).
    let n = 0;
    for (const tpl of ["t.g1.note-read", "t.g1.note-write"]) {
      for (const key of keysFor(tpl)) {
        app.engagement.mastery.record(uid, { id: `lesson:seen-${n}`, conceptIds: [TREBLE], source: "not-first-attempt", correct: false, itemId: `seen-${n++}`, questionKey: key, templateId: tpl, templateVersion: 1 });
      }
    }
    const before = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const results = await answerSession(c, db, session.id);
    for (const r of results.filter((x) => x.si.kind === "review")) expect(r.body.counted).toBe(false);
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(before);
    // They still count for the schedule: the review was passed.
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.delayedReviews).toBe(1);
  });

  it("prefers a question the learner has not met when one exists", async () => {
    const { c, clock, db } = await learner();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const keys = sessionItems(db, session.id).map((si) => questionKey(regen(si)));
    const lessonKeys = new Set(course.authoredItems(LESSON).map((i) => questionKey(i)));
    for (const k of keys) expect(lessonKeys.has(k)).toBe(false);
  });
});

describe("R3: a learner who needed retries still gets review", () => {
  it("schedules review and credits fresh questions after an all-wrong-first completion", async () => {
    const s = setupClock();
    const c = s.client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    for (const it of course.lesson(LESSON)!.items) {
      await attemptLesson(c, LESSON, it.id, wrongFor(course, LESSON, it.id));
      await attemptLesson(c, LESSON, it.id, canonicalFor(course, LESSON, it.id));
    }
    expect((await c.post(`/api/lessons/${LESSON}/complete`)).status).toBe(200);
    const m = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(m).toMatchObject({ independentCorrect: 0, state: "learning", nextDueDate: "2026-03-03" });
    s.clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    expect(session.items.length).toBeGreaterThan(0);
    const results = await answerSession(c, s.db, session.id);
    expect(results.filter((r) => r.si.kind === "review").every((r) => r.body.counted)).toBe(true);
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBeGreaterThan(0);
  });
});

describe("R4: completing a review and its rewards is one transaction", () => {
  it("rolls everything back when a reward write fails, then completes exactly once on retry", async () => {
    for (const table of ["xp_ledger", "daily_activity"]) {
      const { c, clock, db } = await learner();
      clock.advanceDays(1);
      const { session } = (await c.post("/api/review/sessions")).body;
      await answerSession(c, db, session.id);
      const uid = (await c.get("/api/me")).body.user.id;
      const baseline = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(uid) as { n: number }).n;
      const [xp0, act0] = [baseline("xp_ledger"), baseline("daily_activity")];
      db.exec(`CREATE TRIGGER boom BEFORE INSERT ON ${table} WHEN NEW.kind = 'review_session' BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
      const failed = await c.post(`/api/review/sessions/${session.id}/complete`);
      expect(failed.status, table).toBe(500);
      expect((db.prepare("SELECT status, summary FROM review_sessions WHERE id = ?").get(session.id) as { status: string; summary: string | null })).toEqual({ status: "open", summary: null });
      expect([baseline("xp_ledger"), baseline("daily_activity")]).toEqual([xp0, act0]);
      db.exec("DROP TRIGGER boom");
      const ok = await c.post(`/api/review/sessions/${session.id}/complete`);
      expect(ok.status).toBe(200);
      expect(ok.body.xp.awarded).toBe(8);
      expect([baseline("xp_ledger"), baseline("daily_activity")]).toEqual([xp0 + 1, act0 + 1]);
      const again = (await c.post(`/api/review/sessions/${session.id}/complete`)).body;
      expect(again).toMatchObject({ alreadyComplete: true, xp: { awarded: 8 } });
      expect(baseline("xp_ledger")).toBe(xp0 + 1);
    }
  });
});

describe("R5: changing timezone cannot reopen a spent XP cap", () => {
  it("keeps the cap at the same instant when the zone moves forward or back", async () => {
    for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      const { client, clock } = setupClock("2026-03-03T12:00:00Z");
      const c = client();
      await register(c);
      void clock;
      const awards: number[] = [];
      for (let i = 0; i < 2; i++) awards.push((await playThrough(c, course)).body.rewards.xp.awarded);
      expect(awards).toEqual([10, 10]);
      expect((await c.call("PATCH", "/api/me/profile", { timezone: zone })).status).toBe(200);
      expect((await playThrough(c, course)).body.rewards.xp, zone).toMatchObject({ awarded: 0, capped: true });
      expect((await c.call("PATCH", "/api/me/profile", { timezone: "UTC" })).status).toBe(200);
      expect((await playThrough(c, course)).body.rewards.xp.awarded).toBe(0);
    }
  });

  it("still pays again on a genuinely new day in the learner's zone", async () => {
    const { client, clock } = setupClock("2026-03-03T12:00:00Z");
    const c = client();
    await register(c);
    await playThrough(c, course);
    await playThrough(c, course);
    clock.advanceDays(1);
    expect((await playThrough(c, course)).body.rewards.xp.awarded).toBe(10);
  });
});

describe("R6: an interrupted review can always be resumed", () => {
  it("offers Continue after a correct answer, after a slip with a pending similar question, and before completion", async () => {
    for (const plan of ["right", "wrong", "all"] as const) {
      const { c, clock, db } = await learner();
      clock.advanceDays(1);
      const { session } = (await c.post("/api/review/sessions")).body;
      const items = sessionItems(db, session.id);
      const send = (si: (typeof items)[number], ok: boolean) => c.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: si.itemId, response: ok ? rightAnswer(si) : wrongAnswerFor(si) });
      if (plan === "all") await answerSession(c, db, session.id);
      else await send(items[0]!, plan === "right");
      const hub = (await c.get("/api/review")).body;
      expect(hub.openSessionId, plan).toBe(session.id);
      expect(hub.recommendation, plan).toMatchObject({ kind: "review" });
      expect(hub.recommendation.text).toMatch(/in progress/);
      expect((await c.get("/api/engagement")).body.review.openSessionId).toBe(session.id);
      // Finishing from here works and rewards exactly once.
      await answerSession(c, db, session.id);
      expect((await c.post(`/api/review/sessions/${session.id}/complete`)).body.xp.awarded).toBe(8);
      expect((await c.get("/api/review")).body.openSessionId).toBeNull();
    }
  });
});

import { wrongAnswer as wrongAnswerFor } from "./helpers.ts";

describe("R7: finished reviews stay readable after content updates", () => {
  it("serves the stored summary without regenerating questions", async () => {
    const { c, clock, db } = await learner();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    await answerSession(c, db, session.id);
    const done = (await c.post(`/api/review/sessions/${session.id}/complete`)).body;
    const ledger = () => JSON.stringify([db.prepare("SELECT * FROM xp_ledger").all(), db.prepare("SELECT * FROM mastery_evidence").all()]);
    const before = ledger();
    // A content update changed every referenced generator.
    const items = sessionItems(db, session.id).map((s) => ({ ...s, fingerprint: "00000000", templateVersion: 99 }));
    db.prepare("UPDATE review_sessions SET items = ? WHERE id = ?").run(JSON.stringify(items), session.id);
    const r = await c.get(`/api/review/sessions/${session.id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "complete", items: [], summary: { questions: done.questions, firstTryCorrect: done.firstTryCorrect } });
    expect(ledger()).toBe(before);
    expect((await c.post(`/api/review/sessions/${session.id}/complete`)).body).toMatchObject({ alreadyComplete: true, xp: { awarded: 8 } });
  });
});


describe("UX: say so when the question pool cannot reach the next level", () => {
  it("is not flagged while enough unseen questions remain, and is once they cannot reach mastery", async () => {
    const { c, app, uid } = await learner();
    const fresh = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(fresh.limited).toBe(false); // 4 credited + 6 unseen line-note questions can still reach 8
    // The learner burns most of the pool (wrong first answers expose a question for good).
    let n = 0;
    for (const tpl of ["t.g1.note-read", "t.g1.note-write"]) {
      const node = course.ix.nodeById.get(LESSON)!;
      const scope = effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === tpl)!);
      const seen = new Set<string>();
      for (let s = 0; s < 300 && seen.size < 4; s++) {
        const item = generateItem(course.ix, tpl, s, { scope, evidence: "independent" }).item;
        if (!satisfies(item, LINES) || seen.has(questionKey(item))) continue;
        seen.add(questionKey(item));
        app.engagement.mastery.record(uid, { id: `review:burn-${n}`, conceptIds: [TREBLE], source: "review-item", correct: false, itemId: `burn-${n++}`, questionKey: questionKey(item), templateId: tpl, templateVersion: 1 });
      }
    }
    const card = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(card.limited).toBe(true);
    expect(card.headline).toMatch(/don't have enough different questions/);
    expect(card.missing.join(" ")).toMatch(/still being written/);
  });
});

const lineKeys = (tpl: string) => {
  const node = course.ix.nodeById.get(LESSON)!;
  const scope = effectiveScope(course.ix, node, node.exercises.find((b) => b.templateId === tpl)!);
  const keys = new Set<string>();
  for (let s = 0; s < 300; s++) {
    const item = generateItem(course.ix, tpl, s, { scope, evidence: "independent" }).item;
    if (satisfies(item, LINES)) keys.add(questionKey(item));
  }
  return keys;
};

describe("R2 (practice boundary): a question met in practice is no longer fresh", () => {
  it("hinted practice answers earn no credit, but the same question later in review earns none either", async () => {
    const { c, clock, db } = await learner();
    const before = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    // Practise every line-note question there is, through the real practice routes, each with a hint first.
    const practised = new Set<string>();
    for (const tpl of ["t.g1.note-read", "t.g1.note-write"]) {
      const want = lineKeys(tpl);
      for (let seed = 0; seed < 6000 && [...want].some((k) => !practised.has(k)); seed++) {
        const item = generateItem(course.ix, tpl, seed, { evidence: "learning" }).item; // what the practice route serves
        const key = questionKey(item);
        if (!want.has(key) || practised.has(key)) continue;
        practised.add(key);
        expect((await c.post("/api/practice/hint", { itemId: item.id, level: 1 })).status).toBe(200);
        const r = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: item.id, response: canonicalResponse(course.ix, item, templateScope(course.ix, course.ix.templates.get(tpl)!)) });
        expect(r.body.correct).toBe(true);
      }
    }
    // Every in-boundary reading question was met in practice (the writing question is asked differently there: no overlap).
    for (const k of lineKeys("t.g1.note-read")) expect(practised.has(k)).toBe(true);
    // Practice itself is not mastery evidence.
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(before);
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const results = await answerSession(c, db, session.id);
    const reading = results.filter((x) => x.si.kind === "review" && x.si.templateId === "t.g1.note-read");
    expect(reading.length).toBeGreaterThan(0);
    for (const r of reading) expect(r.body.counted).toBe(false); // met in practice: no fresh credit
    const credited = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect - before;
    expect(credited).toBe(results.filter((x) => x.si.kind === "review" && x.si.templateId !== "t.g1.note-read" && x.body.counted).length);
  });
});

describe("P2: the capacity warning also considers question-type variety", () => {
  async function allWrongFirst() {
    const s = setupClock();
    const c = s.client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    for (const it of course.lesson(LESSON)!.items) {
      await attemptLesson(c, LESSON, it.id, wrongFor(course, LESSON, it.id));
      await attemptLesson(c, LESSON, it.id, canonicalFor(course, LESSON, it.id));
    }
    await c.post(`/api/lessons/${LESSON}/complete`);
    return { ...s, c, uid: (await c.get("/api/me")).body.user.id as string };
  }
  const record = (app: ReturnType<typeof setupClock>["app"], uid: string, key: string, tpl: string, correct: boolean, n: number) =>
    app.engagement.mastery.record(uid, { id: `review:cap-${n}`, conceptIds: [TREBLE], source: "review-item", correct, itemId: `cap-${n}`, questionKey: key, templateId: tpl, templateVersion: 1 });

  it("flags a topic that has enough credited questions but can never get a second question type", async () => {
    const { c, app, uid } = await allWrongFirst();
    let n = 0;
    for (const k of lineKeys("t.g1.note-read")) record(app, uid, k, "t.g1.note-read", true, n++); // five reading questions credited
    for (const k of lineKeys("t.g1.note-write")) record(app, uid, k, "t.g1.note-write", false, n++); // the only writing question failed
    const card = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(card).toMatchObject({ independentCorrect: 5, distinctTemplates: 1, state: "practising", limited: true });
    expect(card.headline).toMatch(/don't have enough different questions/);
  });

  it("does not flag it while an unseen question of another type remains", async () => {
    const { c, app, uid } = await allWrongFirst();
    let n = 0;
    for (const k of lineKeys("t.g1.note-read")) record(app, uid, k, "t.g1.note-read", true, n++);
    const card = (await c.get(`/api/mastery/${TREBLE}`)).body;
    expect(card).toMatchObject({ independentCorrect: 5, distinctTemplates: 1, limited: false });
  });
});
