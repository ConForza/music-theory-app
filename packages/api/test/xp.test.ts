import { describe, expect, it } from "vitest";
import { LESSON, Client, finishLesson, playThrough, register, setup, setupClock, sharedCourse, deployNewContent, canonicalFor, attemptLesson } from "./helpers.ts";

const course = sharedCourse();
const total = async (c: Client) => (await c.get("/api/engagement")).body.xp.total as number;

describe("XP ledger", () => {
  it("awards the policy value for a first completion, with a clear reason", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    const done = await finishLesson(c);
    expect(done.rewards.xp).toMatchObject({ awarded: 10, capped: false });
    expect(done.rewards.xp.reason).toMatch(/\+10 XP/);
    expect(done.rewards.total).toBe(10);
    expect(await total(c)).toBe(10);
    const eng = (await c.get("/api/engagement")).body;
    expect(eng.xp.milestone).toMatchObject({ next: 20, toNext: 10 });
  });

  it("awards nothing for a lesson that was not finished", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    await attemptLesson(c, LESSON, course.lesson(LESSON)!.items[0]!.id, canonicalFor(course, LESSON, course.lesson(LESSON)!.items[0]!.id));
    expect((await c.post(`/api/lessons/${LESSON}/complete`)).status).toBe(409);
    expect(await total(c)).toBe(0);
  });

  it("does not duplicate XP when a completion is retried (before or after the first reply was seen)", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    const first = await finishLesson(c);
    const again = (await c.post(`/api/lessons/${LESSON}/complete`)).body;
    const third = (await c.post(`/api/lessons/${LESSON}/complete`)).body;
    expect(again.alreadyComplete).toBe(true);
    expect(again.rewards.xp).toEqual(first.rewards.xp);
    expect(third.rewards.xp.awarded).toBe(10);
    expect(await total(c)).toBe(10);
  });

  it("caps replays at two XP awards per node per day, then awards again the next day", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c);
    const awards: number[] = [];
    for (let i = 0; i < 4; i++) awards.push((await playThrough(c, course)).body.rewards.xp.awarded);
    expect(awards).toEqual([10, 10, 0, 0]);
    expect(await total(c)).toBe(20);
    const capped = (await playThrough(c, course)).body.rewards;
    expect(capped.xp.capped).toBe(true);
    expect(capped.xp.reason).toMatch(/already earned XP/);
    clock.advanceDays(1);
    expect((await playThrough(c, course)).body.rewards.xp.awarded).toBe(10);
    expect(await total(c)).toBe(30);
  });

  it("cannot be inflated by concurrent completions of one run", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    for (const it of course.lesson(LESSON)!.items) await attemptLesson(c, LESSON, it.id, canonicalFor(course, LESSON, it.id));
    const replies = await Promise.all(Array.from({ length: 6 }, () => c.post(`/api/lessons/${LESSON}/complete`)));
    expect(replies.every((r) => r.status === 200)).toBe(true);
    expect(replies.filter((r) => !r.body.alreadyComplete)).toHaveLength(1);
    expect(await total(c)).toBe(10);
  });

  it("cannot be set, claimed or forged by the client", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    expect((await c.call("PATCH", "/api/me/profile", { xp: 9999 })).status).toBe(400);
    expect((await c.post(`/api/lessons/${LESSON}/attempts`, { attemptId: crypto.randomUUID(), itemId: course.lesson(LESSON)!.items[0]!.id, response: { kind: "pitch-letter", letter: "E" }, xp: 50, correct: true })).status).toBe(400);
    await c.post(`/api/lessons/${LESSON}/start`);
    const r = await c.post(`/api/lessons/${LESSON}/complete`, { xp: 500, rewards: { xp: { awarded: 500 } } });
    expect(r.status).toBe(409);
    expect(await total(c)).toBe(0);
    expect((await c.post("/api/xp", { xp: 5 })).status).toBe(405);
  });

  it("is never earned by practice-lab answers, and never unlocks anything", async () => {
    const { client, db } = setupClock();
    const c = client();
    await register(c);
    const gen = (await c.post("/api/practice/generate", { templateId: "t.g1.note-read" })).body;
    expect(gen.id).toBeTruthy();
    expect(await total(c)).toBe(0);
    // Even a huge XP balance (written straight into the ledger) changes nothing about unlocking.
    const uid = (await c.get("/api/me")).body.user.id;
    db.prepare("INSERT INTO xp_ledger (user_id,source_key,kind,node_id,node_type,xp,base_xp,capped,local_date,timezone,occurred_at,curriculum_version,rules_version) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,1)").run(uid, "fixture", "node_complete", "G1-U1-L01", "lesson", 100000, 100000, "2026-03-02", "UTC", "2026-03-02T00:00:00Z", "0.1.0");
    const s = setup({ waive: false });
    const c2 = s.client();
    await register(c2);
    const strict = (await c2.get("/api/progress")).body.nodes;
    expect(strict["G1-U3-L03"].state).toBe("locked");
  });

  it("totals are a plain sum of the ledger, and survive curriculum versions", async () => {
    const { client, db, clock } = setupClock();
    const c = client();
    await register(c);
    await playThrough(c, course);
    clock.advanceDays(1);
    const next = deployNewContent(db);
    const c2 = new Client(next);
    c2.cookie = c.cookie;
    // The lesson changed under the learner: the new version is a fresh run that earns again, and the old row is untouched.
    const r = await playThrough(c2, { ...course, lesson: (id: string) => (course.lesson(id) ? { ...course.lesson(id)!, contentVersion: course.lesson(id)!.contentVersion + 1 } : undefined), authoredItems: course.authoredItems, scopeFor: course.scopeFor } as typeof course);
    expect(r.body.rewards.xp.awarded).toBe(10);
    const rows = db.prepare("SELECT curriculum_version, content_version, xp FROM xp_ledger ORDER BY rowid").all() as Array<{ curriculum_version: string; content_version: number; xp: number }>;
    expect(rows.map((x) => x.curriculum_version)).toEqual([course.version, "9.9.9"]);
    expect(rows[1]!.content_version).toBe(rows[0]!.content_version + 1);
    expect(await total(c2)).toBe(rows.reduce((n, x) => n + x.xp, 0));
  });
});
