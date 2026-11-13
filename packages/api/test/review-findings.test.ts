import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app.ts";
import { ReviewService } from "../src/review.ts";
import { COOKIE, createSession, createUser } from "../src/auth.ts";
import { ManualClock } from "../src/clock.ts";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { migrate } from "../src/db.ts";
import { canonicalResponse, generateItem, templateScope } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";
import { questionKey, satisfies } from "../src/question-key.ts";
import { Client, LESSON, answerSession, attemptLesson, canonicalFor, finishLesson, playThrough, register, rightAnswer, sessionItems, setupClock, sharedCourse, wrongFor } from "./helpers.ts";

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

const practise = async (c: Client, keys: Set<string>) => {
  const done = new Set<string>();
  const tpl = "t.g1.note-read";
  for (let seed = 0; seed < 6000 && [...keys].some((k) => !done.has(k)); seed++) {
    const item = generateItem(course.ix, tpl, seed, { evidence: "learning" }).item; // what the practice route serves
    const key = questionKey(item);
    if (!keys.has(key) || done.has(key)) continue;
    done.add(key);
    expect((await c.post("/api/practice/hint", { itemId: item.id, level: 1 })).status).toBe(200);
    expect((await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: item.id, response: canonicalResponse(course.ix, item, templateScope(course.ix, course.ix.templates.get(tpl)!)) })).body.correct).toBe(true);
  }
  return done;
};


describe("R2 ordering: command order, not timestamps, decides whether a question was already met", () => {
  it("practice committed first at the very same instant as the review answer: no fresh credit", async () => {
    const { c, clock, db } = await learner();
    const before = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    clock.advanceDays(1); // move BEFORE practising, then hold the instant still for everything that follows
    const done = await practise(c, lineKeys("t.g1.note-read"));
    expect(done.size).toBe(lineKeys("t.g1.note-read").size);
    const { session } = (await c.post("/api/review/sessions")).body;
    const results = await answerSession(c, db, session.id);
    const reading = results.filter((x) => x.si.kind === "review" && x.si.templateId === "t.g1.note-read");
    expect(reading.length).toBeGreaterThan(0);
    for (const r of reading) expect(r.body.counted).toBe(false);
    const writingCredited = results.filter((x) => x.si.kind === "review" && x.si.templateId !== "t.g1.note-read" && x.body.counted).length;
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(before + writingCredited);
  });

  it("practice after valid independent evidence at the same instant keeps the original credit", async () => {
    const { c, clock, db } = await learner();
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const results = await answerSession(c, db, session.id); // credited first, at this instant
    const credited = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    expect(results.some((r) => r.body.counted)).toBe(true);
    await practise(c, lineKeys("t.g1.note-read")); // same instant, committed afterwards
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(credited);
  });
});

describe("migration 006 repairs legacy novelty (both historical orders)", () => {
  async function history(order: "practice-first" | "review-first") {
    const s = setupClock();
    const c = s.client();
    await register(c);
    await finishLesson(c);
    const uid = (await c.get("/api/me")).body.user.id as string;
    s.clock.advanceDays(1);
    if (order === "practice-first") await practise(c, lineKeys("t.g1.note-read")); // March 3 practice...
    const { session } = (await c.post("/api/review/sessions")).body;
    s.clock.advanceMs(60_000);
    await answerSession(c, s.db, session.id); // ...then the review the same day, a minute later
    if (order === "review-first") {
      s.clock.advanceDays(1);
      await practise(c, lineKeys("t.g1.note-read")); // practice on a later day
    }
    return { ...s, c, uid, count: async () => (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect as number };
  }

  for (const order of ["practice-first", "review-first"] as const) {
    it(`${order}: a database that applied 005's default keeps the right count after 006`, async () => {
      const h = await history(order);
      const right = await h.count();
      // Reproduce what 005 did to existing rows: everything fresh.
      h.db.exec("UPDATE mastery_evidence SET fresh = 1");
      h.db.exec("DELETE FROM schema_migrations WHERE version = '006_backfill_novelty.sql'");
      const wrong = await h.count();
      if (order === "practice-first") expect(wrong).toBeGreaterThan(right); // the inflation the review found
      expect(migrate(h.db, join(import.meta.dirname, "../migrations"))).toEqual(["006_backfill_novelty.sql"]);
      expect(await h.count()).toBe(right);
      expect(migrate(h.db, join(import.meta.dirname, "../migrations"))).toEqual([]);
    });

    it(`${order}: a database from before 005 (no fresh column) upgrades to the right count`, async () => {
      const h = await history(order);
      const right = await h.count();
      h.db.exec("ALTER TABLE mastery_evidence DROP COLUMN fresh");
      h.db.exec("DELETE FROM schema_migrations WHERE version IN ('005_evidence_novelty.sql', '006_backfill_novelty.sql')");
      expect(migrate(h.db, join(import.meta.dirname, "../migrations"))).toEqual(["005_evidence_novelty.sql", "006_backfill_novelty.sql"]);
      expect(await h.count()).toBe(right);
    });
  }
});

describe("XP cap: the union of both day readings, counted once", () => {
  it("does not pay again when a zone switch sees one award by date and another by instant", async () => {
    // Two awards, each matching only ONE reading of the final day (the reviewer's exact history), then a third attempt.
    const { client, clock } = setupClock("2026-03-02T12:00:00Z");
    const c = client();
    await register(c);
    expect((await c.call("PATCH", "/api/me/profile", { timezone: "Pacific/Kiritimati" })).status).toBe(200); // UTC+14
    expect((await playThrough(c, course)).body.rewards.xp.awarded).toBe(10); // 02 Mar 12:00Z = 03 Mar 02:00 there
    clock.set("2026-03-03T06:00:00Z");
    expect((await c.call("PATCH", "/api/me/profile", { timezone: "Pacific/Pago_Pago" })).status).toBe(200); // UTC-11
    expect((await playThrough(c, course)).body.rewards.xp.awarded).toBe(10); // 02 Mar 19:00 there
    expect((await playThrough(c, course)).body.rewards.xp).toMatchObject({ awarded: 0, capped: true });
    // Now the learner is on UTC at the same instant: one earlier row is stamped 3 March (outside the window), the other is
    // inside the window but stamped 2 March. Two awards in the union, so the cap holds.
    expect((await c.call("PATCH", "/api/me/profile", { timezone: "UTC" })).status).toBe(200);
    expect((await playThrough(c, course)).body.rewards.xp).toMatchObject({ awarded: 0, capped: true });
  });
});

describe("teaching eligibility is version-aware", () => {
  /** The same database served by a course whose lesson has moved to a new version that also introduces treble space notes. */
  function deployV3(db: ReturnType<typeof setupClock>["db"], clock: ReturnType<typeof setupClock>["clock"]) {
    const node = course.ix.nodeById.get(LESSON)!;
    const read = node.exercises.find((b) => b.templateId === "t.g1.note-read")!;
    const v3 = {
      ...node,
      contentVersion: node.contentVersion + 1,
      conceptIds: [...node.conceptIds, "c.clefs.treble-spaces"],
      exercises: node.exercises.map((b) => (b === read ? { ...b, conceptIds: [...b.conceptIds, "c.clefs.treble-spaces"] } : b)),
    };
    const taught = new Map(course.ix.conceptTaughtBy);
    taught.set("c.clefs.treble-spaces", [v3]);
    const ix = { ...course.ix, nodeById: new Map(course.ix.nodeById).set(LESSON, v3), conceptTaughtBy: taught };
    const patched = { ...course, ix, nodes: course.nodes.map((n) => (n.id === LESSON ? { ...n, contentVersion: v3.contentVersion } : n)) } as unknown as typeof course;
    return createApp({ db, course: patched, clock });
  }

  it("does not make newly introduced material reviewable from a completion of the older version", async () => {
    const { c, clock, db } = await learner(); // completed at the version being served
    clock.advanceDays(1);
    expect((await c.get("/api/review")).body.dueCount).toBe(1); // control: reviewable before the deployment
    const next = new Client(deployV3(db, clock));
    next.cookie = c.cookie;
    const hub = (await next.get("/api/review")).body;
    expect(hub.dueCount).toBe(0); // nothing taught at the current version yet
    expect(hub.groups.ready).toEqual([]);
    expect((await next.get("/api/progress")).body.nodes[LESSON].reviewAvailable).toBe(true); // the path offers the refresher
    const started = (await next.post("/api/review/sessions")).body;
    expect(started.session).toBeNull(); // no question about the new space notes (or anything the old completion cannot vouch for)
    expect((await next.get("/api/mastery/c.clefs.treble-spaces")).body.reviewable).toBe(false);
  });
});

describe("historical practice exposure (Brief 03 databases)", () => {
  it("a question hinted and answered in Brief 03 practice can no longer earn fresh review credit after upgrade", async () => {
    // A database exactly as Brief 03 left it: migrations 001 and 002 only, practice attempts and hints, no exposure tracking.
    const src = join(import.meta.dirname, "../migrations");
    const dir = mkdtempSync(join(tmpdir(), "b03-"));
    mkdirSync(join(dir, "m"));
    for (const f of readdirSync(src).filter((f) => /^00[12]/.test(f))) copyFileSync(join(src, f), join(dir, "m", f));
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    expect(migrate(db, join(dir, "m"))).toEqual(["001_init.sql", "002_practice.sql"]);
    const user = createUser(db as never, { displayName: "Guest" });
    const token = createSession(db as never, user.id).token;
    const tpl = "t.g1.note-read";
    const want = lineKeys(tpl);
    const practised = new Map<string, string>();
    for (let seed = 0; seed < 6000 && practised.size < want.size; seed++) {
      const item = generateItem(course.ix, tpl, seed, { evidence: "learning" }).item;
      const key = questionKey(item);
      if (want.has(key) && !practised.has(key)) practised.set(key, item.id);
    }
    expect(practised.size).toBe(want.size);
    let n = 0;
    for (const id of practised.values()) {
      db.prepare("INSERT INTO practice_hint_uses (user_id,item_id,level,created_at) VALUES (?,?,1,'2026-02-01T10:00:00.000Z')").run(user.id, id);
      db.prepare("INSERT INTO practice_attempts (user_id,id,item_id,template_id,template_version,seed,curriculum_version,response,correct,mistake_category,hints_used,attempt_number,created_at) VALUES (?,?,?,?,1,1,'0.2.1','{}',1,NULL,1,1,'2026-02-01T10:00:01.000Z')").run(user.id, `old-${n++}`, id, tpl);
    }
    // Upgrade to the current schema and code.
    migrate(db, src);
    expect((db.prepare("SELECT COUNT(*) AS n FROM question_exposure").get() as { n: number }).n).toBe(0); // SQL alone cannot recover them
    const clock = new ManualClock(new Date("2026-03-02T12:00:00Z"));
    const app = createApp({ db: db as never, course, clock });
    expect((db.prepare("SELECT COUNT(DISTINCT question_key) AS n FROM question_exposure").get() as { n: number }).n).toBe(want.size); // recovered
    expect(db.prepare("SELECT name FROM data_backfills").all()).toEqual([{ name: "practice-exposure-from-brief-03-history" }]);
    const c = new Client(app);
    c.cookie = `${COOKIE}=${token}`;
    await finishLesson(c);
    const before = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    expect(before).toBe(4);
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const results = await answerSession(c, db as never, session.id);
    for (const r of results.filter((x) => x.si.kind === "review" && x.si.templateId === tpl)) expect(r.body.counted).toBe(false);
    // Running the app again repairs nothing twice and changes nothing.
    createApp({ db: db as never, course, clock });
    expect((db.prepare("SELECT COUNT(*) AS n FROM data_backfills").get() as { n: number }).n).toBe(1);
  });

  it("repairs a database that already took the earlier migrations without touching legitimate credit", async () => {
    const { c, clock, db, uid } = await learner(); // lesson done: four credited independent answers
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    await answerSession(c, db, session.id); // credited review answers, written before any practice
    const credited = (await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect;
    // Practice of the same questions happens later, but its exposure was never recorded (a pre-tracking database).
    db.prepare("DELETE FROM data_backfills").run();
    const tplId = "t.g1.note-read";
    const seen = [...lineKeys(tplId)][0]!;
    for (let seed = 0; seed < 6000; seed++) {
      const item = generateItem(course.ix, tplId, seed, { evidence: "learning" }).item;
      if (questionKey(item) !== seen) continue;
      db.prepare("INSERT INTO practice_hint_uses (user_id,item_id,level,created_at) VALUES (?,?,1,?)").run(uid, item.id, new Date(clock.now().getTime() + 60_000).toISOString());
      break;
    }
    createApp({ db, course, clock });
    expect((await c.get(`/api/mastery/${TREBLE}`)).body.independentCorrect).toBe(credited); // later practice never revokes earlier credit
  });
});

describe("pool capacity cache identity", () => {
  it("does not reuse one provider's pool for a different provider's scope of the same template", () => {
    const { db, clock, app } = setupClock();
    // Two real lessons bind t.g1.note-read to c.clefs.stave with different effective scopes (treble only; treble and bass).
    const narrow = course.ix.nodeById.get("G1-U3-L03")!;
    const wide = course.ix.nodeById.get("G1-U3-L05")!;
    const patched = {
      ...course,
      isPlayable: (id: string) => id === wide.id || course.isPlayable(id),
      ix: { ...course.ix, conceptTaughtBy: new Map([["c.clefs.stave", [narrow, wide]]]) },
    } as unknown as typeof course;
    const make = () => new ReviewService(db, patched, clock, app.engagement.mastery, app.engagement.xp, app.engagement.activity, app.engagement.achievements, { maxConcepts: 4, itemsPerConcept: 2 });
    const svc = make();
    const warm = svc.poolKeys("c.clefs.stave", new Set([narrow.id])).size;
    const other = svc.poolKeys("c.clefs.stave", new Set([wide.id])).size; // same template and concept, a different provider
    const cold = make().poolKeys("c.clefs.stave", new Set([wide.id])).size;
    expect(warm).toBeGreaterThan(0);
    expect(other).toBe(cold); // a warm cache must give the same answer as a cold calculation
    expect(other).toBeGreaterThan(warm); // and the wider provider really does have more distinct questions
  });
});
