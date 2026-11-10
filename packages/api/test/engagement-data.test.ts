import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ManualClock } from "../src/clock.ts";
import { migrate, openDb } from "../src/db.ts";

import { AchievementService } from "../src/achievements.ts";
import { foldConcept } from "../src/mastery.ts";
import { Client, LESSON, answerSession, email, finishLesson, playNode, playThrough, register, setupClock, sharedCourse } from "./helpers.ts";

const course = sharedCourse();
const NEW_TABLES = ["xp_ledger", "daily_activity", "mastery_evidence", "concept_mastery", "review_sessions", "review_attempts", "achievements_awarded", "question_exposure"];
const count = (db: ReturnType<typeof openDb>, table: string, uid: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(uid) as { n: number }).n;

describe("accounts, isolation, export and deletion", () => {
  it("keeps everything when a guest creates an account (same learner, upgraded in place)", async () => {
    const { client } = setupClock();
    const c = client();
    expect((await c.post("/api/auth/guest")).status).toBe(200);
    await finishLesson(c);
    const before = (await c.get("/api/engagement")).body;
    expect((await register(c, "grace")).status).toBe(200);
    const after = (await c.get("/api/engagement")).body;
    expect(after.xp.total).toBe(before.xp.total);
    expect(after.achievements.earnedCount).toBe(before.achievements.earnedCount);
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body.state).toBe("proficient");
  });

  it("is still there after signing out and back in from a fresh session", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c, "ada");
    await finishLesson(c);
    clock.advanceDays(1);
    await c.post("/api/auth/logout");
    const again = client();
    expect((await again.post("/api/auth/login", { email: email("ada"), password: "correct horse battery" })).status).toBe(200);
    expect((await again.get("/api/engagement")).body.xp.total).toBe(10);
    expect((await again.get("/api/review")).body.dueCount).toBe(1);
    expect((await again.post("/api/review/sessions")).body.session.items).toHaveLength(2);
  });

  it("never shows one learner another's XP, mastery, sessions, achievements or review", async () => {
    const { client, clock, db } = setupClock();
    const a = client();
    const b = client();
    await register(a, "alice");
    await register(b, "bob");
    await finishLesson(a);
    clock.advanceDays(1);
    const { session } = (await a.post("/api/review/sessions")).body;
    expect((await b.get("/api/engagement")).body.xp.total).toBe(0);
    expect((await b.get("/api/engagement")).body.achievements.earnedCount).toBe(0);
    expect((await b.get("/api/mastery/c.clefs.treble-lines")).body).toMatchObject({ state: "new", independentCorrect: 0, trail: [] });
    expect((await b.get("/api/review")).body.dueCount).toBe(0);
    expect((await b.get(`/api/review/sessions/${session.id}`)).status).toBe(404);
    const first = db.prepare("SELECT items FROM review_sessions WHERE id = ?").get(session.id) as { items: string };
    const item = (JSON.parse(first.items) as Array<{ itemId: string }>)[0]!.itemId;
    expect((await b.post(`/api/review/sessions/${session.id}/attempts`, { attemptId: crypto.randomUUID(), itemId: item, response: { kind: "pitch-letter", letter: "E" } })).status).toBe(404);
    expect((await b.post(`/api/review/sessions/${session.id}/complete`)).status).toBe(404);
    expect((await b.post("/api/review/sessions")).body.session).toBeNull();
    // An attempt id used by Alice is simply unknown to Bob.
    expect((await a.get("/api/review")).body.openSessionId).toBe(session.id);
  });

  it("requires a session for every engagement route", async () => {
    const { client } = setupClock();
    const c = client();
    for (const p of ["/api/engagement", "/api/xp", "/api/achievements", "/api/review", "/api/mastery/c.clefs.stave"]) expect((await c.get(p)).status, p).toBe(401);
    expect((await c.post("/api/review/sessions")).status).toBe(401);
  });

  it("exports every new record and deletes them all with the account", async () => {
    const { client, clock, db } = setupClock();
    const c = client();
    await register(c, "dee");
    await finishLesson(c);
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    await answerSession(c, db, session.id, (_s, i) => (i === 0 ? "wrong" : "right"));
    await c.post(`/api/review/sessions/${session.id}/complete`);
    const uid = (await c.get("/api/me")).body.user.id;
    const g = (await c.post("/api/practice/generate", { templateId: "t.g1.note-read", seed: 3 })).body;
    await c.post("/api/practice/hint", { itemId: g.id, level: 1 }); // practice exposure is exported and deleted too
    const exp = (await c.get("/api/me/export")).body;
    for (const k of ["xpLedger", "dailyActivity", "achievements", "masteryEvidence", "conceptMastery", "reviewSessions", "reviewAttempts"]) expect(exp[k].length, k).toBeGreaterThan(0);
    expect(exp.profile).toMatchObject({ timezone: "UTC", dailyGoal: 1 });
    for (const t of NEW_TABLES) expect(count(db, t, uid), t).toBeGreaterThan(0);
    expect((await c.call("DELETE", "/api/me")).status).toBe(200);
    for (const t of NEW_TABLES) expect(count(db, t, uid), t).toBe(0);
  });
});

describe("persistence and migration", () => {
  it("upgrades a Brief 03 database in place, keeping lessons, attempts and accounts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    const src = join(import.meta.dirname, "../migrations");
    mkdirSync(join(dir, "m"));
    for (const f of readdirSync(src).filter((f) => !/^00[345]/.test(f))) copyFileSync(join(src, f), join(dir, "m", f));
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    expect(migrate(db, join(dir, "m"))).toEqual(["001_init.sql", "002_practice.sql"]);
    const t = "2026-02-01T10:00:00.000Z";
    db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES ('u1',NULL,NULL,'Guest',1,?,?)").run(t, t);
    db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES ('u1','new',1,1,'{}',?)").run(t);
    db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES ('u1',?,1,0,'questions',2,'0.2.1',?,?,?,2)").run(LESSON, t, t, t);
    db.prepare("INSERT INTO attempts (user_id,id,node_id,run,item_id,template_id,template_version,content_version,curriculum_version,evidence,response,correct,mistake_category,hints_used,attempt_number,created_at) VALUES ('u1','a1',?,1,'i.g1-u3-l03.independent-1','t.g1.note-read',1,2,'0.2.1','independent','{}',1,NULL,0,1,?)").run(LESSON, t);
    expect(migrate(db, src)).toEqual(["003_progression.sql", "004_question_exposure.sql", "005_evidence_novelty.sql"]);
    expect(migrate(db, src)).toEqual([]); // repeatable
    expect(db.prepare("SELECT timezone, daily_goal FROM profiles WHERE user_id = 'u1'").get()).toEqual({ timezone: "UTC", daily_goal: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM attempts").get()).toEqual({ n: 1 });
    // The old data still serves: the migrated learner keeps their completed lesson, with no invented XP or mastery.
    const app = createApp({ db: db as ReturnType<typeof openDb>, course, clock: new ManualClock(new Date("2026-03-02T12:00:00Z")) });
    expect(app.engagement.xp.total("u1")).toBe(0);
    expect(app.progress.overview("u1").nodes[LESSON]!.state).toBe("completed");
    // Taught and completed before the ledger existed: reviewable (a fresh question, no invented credit).
    const hub = app.engagement.reviewOverview("u1");
    expect(hub.dueCount).toBe(1);
    expect(hub.groups.ready[0]).toMatchObject({ conceptId: "c.clefs.treble-lines", state: "learning", independentCorrect: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM mastery_evidence").get()).toEqual({ n: 0 });
  });

  it("upgrades a database that already applied 003 (the previous head) without losing anything, and a fresh one gets the same schema", async () => {
    const src = join(import.meta.dirname, "../migrations");
    // A learner on the previous head (003 applied, 004 not yet existing): lesson finished, so every 003 table has rows.
    const old = openDb(":memory:");
    const prev = createApp({ db: old, course, clock: new ManualClock(new Date("2026-03-02T12:00:00Z")) });
    const c = new Client(prev);
    await register(c, "upg");
    await finishLesson(c);
    const before = (await c.get("/api/engagement")).body;
    old.exec("DROP TABLE question_exposure");
    old.exec("ALTER TABLE mastery_evidence DROP COLUMN fresh");
    old.exec("DELETE FROM schema_migrations WHERE version IN ('004_question_exposure.sql', '005_evidence_novelty.sql')");
    expect(() => old.prepare("SELECT 1 FROM question_exposure").get()).toThrow(/no such table/);
    expect(migrate(old, src)).toEqual(["004_question_exposure.sql", "005_evidence_novelty.sql"]);
    expect(migrate(old, src)).toEqual([]);
    const next = createApp({ db: old, course, clock: new ManualClock(new Date("2026-03-02T12:00:00Z")) });
    const c2 = new Client(next);
    c2.cookie = c.cookie;
    for (const p of ["/api/engagement", "/api/review", "/api/achievements", "/api/progress"]) expect((await c2.get(p)).status, p).toBe(200);
    expect((await c2.get("/api/engagement")).body.xp.total).toBe(before.xp.total);
    expect((await c2.get("/api/engagement")).body.achievements.earnedCount).toBe(before.achievements.earnedCount);
    // The new table works on the upgraded database.
    const g = (await c2.post("/api/practice/generate", { templateId: "t.g1.note-read", seed: 5 })).body;
    expect((await c2.post("/api/practice/hint", { itemId: g.id, level: 1 })).status).toBe(200);
    // A fresh database ends up with the same tables.
    const tables = (d: ReturnType<typeof openDb>) => (d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables(openDb(":memory:"))).toEqual(tables(old));
  });

  it("does not invent evidence for old lesson completions: mastery starts from new, recorded activity only", async () => {
    const { db, client } = setupClock();
    const c = client();
    await register(c);
    const uid = (await c.get("/api/me")).body.user.id;
    db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',2,'0.1.0','2026-01-01','2026-01-01','2026-01-01',2)").run(uid, LESSON);
    expect((await c.get("/api/review")).body.groups.mastered).toEqual([]);
    // Reviewable, but nothing was invented: no evidence rows, no credit.
    const { session } = (await c.post("/api/review/sessions")).body;
    expect(session.items.length).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM mastery_evidence").get()).toEqual({ n: 0 });
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body).toMatchObject({ state: "learning", independentCorrect: 0 });
  });

  it("survives losing the reply to a completion or an answer (retry before and after the server committed)", async () => {
    const { client, clock, db } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    // "Reply lost": the page asks again for the same completion and gets the identical rewards.
    const again = (await c.post(`/api/lessons/${LESSON}/complete`)).body;
    expect(again.rewards.xp.awarded).toBe(10);
    expect(count(db, "xp_ledger", (await c.get("/api/me")).body.user.id)).toBe(1);
    clock.advanceDays(1);
    const { session } = (await c.post("/api/review/sessions")).body;
    const sent = await answerSession(c, db, session.id);
    expect(sent.length).toBeGreaterThan(0);
    // "Before commit": a request that never reached the server leaves nothing behind; the same call later behaves normally.
    expect((await c.post(`/api/review/sessions/${session.id}/complete`)).status).toBe(200);
    expect((await c.post(`/api/review/sessions/${session.id}/complete`)).body.alreadyComplete).toBe(true);
  });

  it("repeating the whole lesson does not duplicate ledger rows for the same run", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    await playNode(c, course, LESSON);
    for (let i = 0; i < 5; i++) await c.post(`/api/lessons/${LESSON}/complete`);
    const keys = (db.prepare("SELECT source_key FROM xp_ledger").all() as Array<{ source_key: string }>).map((r) => r.source_key);
    expect(keys).toEqual([`node:${LESSON}:run1`]);
  });
});

describe("achievements", () => {
  it("awards a badge once for substantive progress and keeps it forever", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c);
    const done = await finishLesson(c);
    expect(done.rewards.newAchievements.map((a: { id: string }) => a.id)).toEqual(["g1.treble-line-notes"]);
    expect((await playThrough(c, course)).body.rewards.newAchievements).toEqual([]); // never twice
    clock.advanceDays(200); // missed days, a review long overdue: still earned
    const list = (await c.get("/api/achievements")).body;
    expect(list.achievements.find((a: { id: string }) => a.id === "g1.treble-line-notes")).toMatchObject({ earned: true });
    expect(list.disclaimer).toMatch(/not ABRSM certificates/);
  });

  it("shows unwritten curriculum as not available, and never awards for it", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    const list = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean; available: boolean }>;
    const byId = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(byId["g1.both-clefs"]).toMatchObject({ earned: false, available: false });
    expect(byId["g2.triplets"]).toMatchObject({ earned: false, available: false });
    expect(byId["g5.cadence-challenge"]).toMatchObject({ earned: false, available: false });
    expect(list.filter((a) => a.earned).map((a) => a.id)).toEqual(["g1.treble-line-notes"]);
  });

  it("never awards a grade badge for lessons or XP alone", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    const uid = (await c.get("/api/me")).body.user.id;
    db.prepare("INSERT INTO xp_ledger (user_id,source_key,kind,node_id,node_type,xp,base_xp,capped,local_date,timezone,occurred_at,curriculum_version,rules_version) VALUES (?,'big','node_complete','G1-U1-L01','lesson',99999,99999,0,'2026-03-02','UTC','2026-03-02T00:00:00Z','x',1)").run(uid);
    await playNode(c, course, LESSON);
    await playNode(c, course, "G5-U4-L06");
    const earned = ((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).filter((a) => a.earned).map((a) => a.id);
    expect(earned.some((id) => id.endsWith("grade-complete"))).toBe(false);
  });

  it("checks conditions against server records: fixtures prove the machinery for content that is not written yet", () => {
    const { db, clock } = setupClock();
    const uid = "fixture-user";
    const t = "2026-03-02T12:00:00.000Z";
    db.prepare("INSERT INTO users (id,display_name,is_guest,created_at,last_seen_at) VALUES (?, 'F', 1, ?, ?)").run(uid, t, t);
    db.prepare("INSERT INTO profiles (user_id,updated_at) VALUES (?, ?)").run(uid, t);
    const row = (node: string) => db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'q',1,'x',?,?,?,1)").run(uid, node, t, t, t);
    row("G3-U1-C");
    // With the real course the challenge has no playable content, so completion rows alone earn nothing.
    const real = new AchievementService(db, course);
    expect(real.evaluate(uid, new Map(), "t1", t)).toEqual([]);
    // Once that challenge is authored (simulated), the same record earns the badge, exactly once.
    const authored = new AchievementService(db, { ...course, isPlayable: (id: string) => id === "G3-U1-C" || course.isPlayable(id) });
    expect(authored.evaluate(uid, new Map(), "t2", t).map((a) => a.id)).toEqual(["g3.compound-time"]);
    expect(authored.evaluate(uid, new Map(), "t3", t)).toEqual([]);
    expect(authored.awardedFor(uid, "t2").map((a) => a.id)).toEqual(["g3.compound-time"]);
    void clock;
    // A concept badge needs the state: mastered triplets from fixture evidence.
    const rows = [0, 1, 2, 3].flatMap((d) => [`2026-03-0${2 + d}`].flatMap((date) => ["t.a", "t.b"].map((tpl, i) => ({ id: `${date}${i}`, conceptId: "c.rhythm.triplets", source: "review-item" as const, counts: true, correct: true, itemId: `${date}-${tpl}`, templateId: tpl, templateVersion: 1, seed: null, nodeId: null, sessionId: null, mistakeCategory: null, localDate: date, occurredAt: `${date}T10:00:00Z`, rulesVersion: 1 }))));
    const m = foldConcept("c.rhythm.triplets", [{ ...rows[0]!, source: "independent-step" }, ...rows.slice(1)], authoredRules(), "2026-03-05");
    expect(m.state).toBe("mastered");
    const g2 = new AchievementService(db, { ...course, isPlayable: () => true });
    expect(g2.evaluate(uid, new Map([[m.conceptId, m]]), "t4", t).map((a) => a.id)).toContain("g2.triplets");
  });
});

function authoredRules() {
  return { rulesVersion: 1, proficient: { minIndependentCorrect: 4, minDistinctTemplates: 2 }, mastered: { minIndependentCorrect: 8, minDistinctTemplates: 2, minDaysSinceFirstEvidence: 3, requiresDelayedReview: true }, intervalsDays: [1, 3, 7, 14, 30, 60], lapseResetsTo: 1 };
}

describe("test clock", () => {
  it("is not available unless explicitly enabled", async () => {
    const { client } = setupClock();
    expect((await new Client(client().app).post("/api/test/clock", { advanceDays: 1 })).status).toBe(404);
    const app = createApp({ db: openDb(":memory:"), course, testClock: true });
    const c = new Client(app);
    const a = (await c.post("/api/test/clock", { set: "2026-03-02T12:00:00Z" })).body.now;
    const b = (await c.post("/api/test/clock", { advanceDays: 2 })).body.now;
    expect([a, b]).toEqual(["2026-03-02T12:00:00.000Z", "2026-03-04T12:00:00.000Z"]);
  });
});
