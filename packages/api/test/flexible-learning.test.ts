/**
 * Flexible learning: Explore lessons (any lesson, any order) and Practise a topic (any grade / area / unit / topic, no lesson first).
 * The acceptance tests of the brief, plus the safeguards that keep exploration from manufacturing completion, rewards or eligibility.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalResponse, wrongResponse } from "@mtp/engine";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/db.ts";
import { questionKey } from "../src/question-key.ts";
import { Client, correctResponse, playLesson, realCourse } from "./helpers.ts";
import { boot, completeGrades, learner, protectedCounts } from "./prep-helpers.ts";

const course = realCourse();
const id = () => crypto.randomUUID();
const lessonsOf = (unitId: string) => course.nodes.filter((n) => n.unitId === unitId && n.type === "lesson").map((n) => n.id);

async function explore(c: Client, nodeId: string) {
  const open = await c.get(`/api/lessons/${nodeId}?explore=1`);
  if (open.status !== 200) throw new Error(`${nodeId} open: ${JSON.stringify(open.body)}`);
  const started = await c.post(`/api/lessons/${nodeId}/start`, { explore: true });
  if (started.status !== 200) throw new Error(`${nodeId} start: ${JSON.stringify(started.body)}`);
  return open.body;
}
async function exploreAndComplete(c: Client, nodeId: string) {
  await explore(c, nodeId);
  return playLesson(c, course, nodeId); // start again is idempotent (resumes the explored run)
}
const states = async (c: Client) => (await c.get("/api/progress")).body.nodes as Record<string, { state: string; outOfSequence: boolean; lockedBy: string[] }>;

describe("Explore lessons: free access to any written lesson", () => {
  it("a fresh learner can open and complete a Grade 5 lesson without Grades 1-4, and earns that lesson's normal completion and XP", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const body = await explore(c, "G5-U3-L03");
    expect(body.access).toMatchObject({ mode: "explore", outOfSequence: true });
    // advisory, not a block: lessons that teach what this one builds on
    expect(body.access.foundations.length).toBeGreaterThan(0);
    expect(body.access.foundations.every((f: { nodeId: string }) => course.lesson(f.nodeId))).toBe(true);
    const done = await playLesson(c, course, "G5-U3-L03");
    expect(done.status).toBe(200);
    expect(done.body.rewards.xp.awarded).toBeGreaterThan(0);
    const s = await states(c);
    expect(s["G5-U3-L03"]).toMatchObject({ state: "completed", outOfSequence: true });
    expect((db.prepare("SELECT explored FROM lesson_progress WHERE user_id = ? AND node_id = 'G5-U3-L03'").get(userId) as { explored: number }).explored).toBe(1);
  });

  it("a learner can study a later unit without the earlier units, and skipped lessons stay uncompleted", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    await exploreAndComplete(c, "G5-U4-L02");
    const s = await states(c);
    expect(s["G5-U4-L02"]!.state).toBe("completed");
    for (const n of course.nodes.filter((x) => x.id !== "G5-U4-L02")) expect(s[n.id]!.state).not.toBe("completed");
    const prog = (await c.get("/api/progress")).body;
    expect(prog.totals.lessonsCompleted).toBe(1);
    expect(prog.grades.map((g: { completedNodes: number }) => g.completedNodes)).toEqual([0, 0, 0, 0, 1]);
  });

  it("the guided path still enforces its prerequisites: without Explore a locked lesson is 403, as before", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    expect((await c.get("/api/lessons/G1-U1-L01")).status).toBe(200);
    const locked = await c.get("/api/lessons/G1-U1-L02");
    expect(locked.status).toBe(403);
    expect(locked.body.error).toMatchObject({ code: "locked", lockedBy: ["G1-U1-L01"], explorable: true });
    expect((await c.post("/api/lessons/G1-U1-L02/start")).status).toBe(403);
    expect((await c.post("/api/lessons/G1-U1-L02/attempts", { attemptId: id(), itemId: course.lesson("G1-U1-L02")!.items[0]!.id, response: correctResponse(course, "G1-U1-L02", course.lesson("G1-U1-L02")!.items[0]!.id) })).status).toBe(403);
  });

  it("exploring never opens a unit's practice, review or challenge, the grade assessment, or a qualification badge", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    // every lesson of the last unit of Grade 5 (whose review leads to the grade assessment), and of unit 3, completed out of order
    for (const u of ["G5-U5", "G5-U3"]) for (const n of lessonsOf(u).reverse()) expect((await exploreAndComplete(c, n)).status).toBe(200);
    const s = await states(c);
    for (const n of ["G5-U3-P1", "G5-U3-R1", "G5-U3-C", "G5-U5-P1", "G5-U5-R1", "G5-U5-C", "G5-A"]) {
      expect(s[n]!.state, n).toBe("locked");
      expect((await c.post(`/api/nodes/${n}/start`)).status, n).toBe(403);
      // the explore opt-in is for authored lessons only
      expect((await c.get(`/api/lessons/${n}?explore=1`)).status, n).toBe(403);
      expect((await c.post(`/api/lessons/${n}/start`, { explore: true })).status, n).toBe(403);
    }
    expect((db.prepare("SELECT COUNT(*) AS c FROM achievements_awarded WHERE user_id = ? AND achievement_id LIKE '%grade-complete'").get(userId) as { c: number }).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS c FROM assessment_results WHERE user_id = ?").get(userId) as { c: number }).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS c FROM node_sessions WHERE user_id = ?").get(userId) as { c: number }).c).toBe(0);
  }, 120_000);

  it("direct requests cannot manufacture an exploration mark, a completion or a reward", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    // no client field sets the mark or completion
    expect((await c.post("/api/lessons/G1-U1-L01/start", { explore: true, explored: 0 })).status).toBe(400);
    expect((await c.post("/api/lessons/G1-U1-L01/start", { completed: true })).status).toBe(400);
    // completing an explored lesson still needs every question right, in this run
    await explore(c, "G2-U1-L01");
    const early = await c.post("/api/lessons/G2-U1-L01/complete");
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("incomplete");
    expect(protectedCounts(db, userId).xp_ledger).toBe(0);
    // retrying a completion pays once
    const first = await playLesson(c, course, "G2-U1-L01");
    const again = await c.post("/api/lessons/G2-U1-L01/complete");
    expect(again.body.alreadyComplete).toBe(true);
    expect(again.body.rewards.xp.awarded).toBe(first.body.rewards.xp.awarded);
    expect((db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ?").get(userId) as { c: number }).c).toBe(1);
    // exploring a lesson that is already open on the guided path is not "exploration"
    await c.post("/api/lessons/G1-U1-L01/start", { explore: true });
    expect((db.prepare("SELECT explored FROM lesson_progress WHERE user_id = ? AND node_id = 'G1-U1-L01'").get(userId) as { explored: number }).explored).toBe(0);
  });

  it("returning to Grade 1 loses nothing; an explored lesson starts counting once its earlier lessons are done", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    await exploreAndComplete(c, "G1-U1-L02");
    let s = await states(c);
    expect(s["G1-U1-L02"]).toMatchObject({ state: "completed", outOfSequence: true, waitingFor: ["G1-U1-L01"] });
    expect(s["G1-U1-L03"]).toMatchObject({ state: "locked", lockedBy: ["G1-U1-L02"] }); // not opened by the explored completion
    expect(s["G1-U1-L01"]!.state).toBe("available"); // the guided start is still where it was
    expect((await playLesson(c, course, "G1-U1-L01")).status).toBe(200);
    s = await states(c);
    expect(s["G1-U1-L02"]).toMatchObject({ state: "completed", outOfSequence: false, waitingFor: [] });
    expect(s["G1-U1-L03"]!.state).toBe("available"); // no replay needed
  });

  it("exploring does not move the guided destination: selected grade and next step stay put", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    await c.call("PATCH", "/api/me/profile", { selectedGrade: 1 });
    await explore(c, "G1-U2-L03"); // left open, mid-lesson
    await exploreAndComplete(c, "G5-U1-L02");
    const prog = (await c.get("/api/progress")).body;
    expect(prog.grades[0].nextNodeId).toBe("G1-U1-L01");
    expect(prog.nodes["G1-U2-L03"]).toMatchObject({ state: "in_progress", outOfSequence: true });
    expect(prog.grades[4].nextNodeId).toBeNull(); // nothing in Grade 5 is a guided next step for this learner
    expect((await c.get("/api/me")).body.profile.selectedGrade).toBe(1);
    // the dashboard recommendation follows the guided path too
    expect((await c.get("/api/engagement")).status).toBe(200);
  });

  it("a learner placed at Grade 4 keeps the placement behaviour; exploring Grade 3 does not change it", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    db.prepare("INSERT INTO placement_starts (user_id,attempt_id,start_grade,recommended_grade,accepted_at) VALUES (?,?,?,?,?)").run(userId, "p1", 4, 4, app.clock.now().toISOString());
    let s = await states(c);
    expect(s["G4-U1-L01"]!.state).toBe("available");
    expect(s["G3-U1-L02"]!.state).toBe("locked");
    await exploreAndComplete(c, "G3-U1-L02");
    s = await states(c);
    expect(s["G4-U1-L01"]!.state).toBe("available");
    expect(s["G3-U1-L03"]!.state).toBe("locked");
    expect(s["G3-A"]!.state).toBe("locked");
  });
});

describe("existing learners: migration 010 is additive", () => {
  it("rows written before flexible learning keep exactly their meaning", async () => {
    const dir = join(tmpdir(), `mtp-mig-${id()}`);
    mkdirSync(dir);
    const src = join(import.meta.dirname, "../migrations");
    for (const f of readdirSync(src).filter((f) => f < "010")) copyFileSync(join(src, f), join(dir, f));
    const old = new DatabaseSync(":memory:");
    old.exec("PRAGMA foreign_keys = ON;");
    migrate(old, dir);
    const { app } = boot({ db: old });
    const { c, userId } = await learner(app);
    expect(migrate(old, src)).toEqual(["010_flexible_learning.sql"]);
    // a learner who finished Grade 1 under the guided path
    completeGrades(app, old, userId, 1);
    const s = await states(c);
    for (const n of course.nodes.filter((x) => x.grade === 1)) expect(s[n.id]!.state).toBe("completed");
    expect(Object.values(s).every((x) => !x.outOfSequence)).toBe(true);
    expect(s["G2-U1-L01"]!.state).toBe("available");
    expect((await c.get("/api/progress")).body.grades[1].nextNodeId).toBe("G2-U1-L01");
  });
});

// ---- Practise a topic -----------------------------------------------------------------------------------------------------

async function startTopic(c: Client, body: { grade: number; kind: string; id: string; count: number }) {
  const r = await c.post("/api/topic-practice/sessions", body);
  if (r.status !== 200 || !r.body.session) throw new Error(JSON.stringify(r.body));
  return r.body.session as { id: string; items: Array<{ item: { id: string; hintCount: number; evidence: string }; conceptId: string; lesson: { nodeId: string } | null }>; shortfall: null | { requested: number; available: number } };
}
const gradeTopics = (grade: number) => new Set([...course.ix.concepts.values()].filter((c) => (course.ix.conceptTaughtBy.get(c.id) ?? []).some((n) => n.grade === grade)).map((c) => c.id));

describe("Practise a topic: any grade, area, unit or topic, no lesson first", () => {
  it("a fresh guest can practise a Grade 5 topic immediately", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const ov = (await c.get("/api/topic-practice")).body;
    expect(ov.counts).toEqual([5, 10, 20]);
    const g5 = ov.grades[4];
    const keys = g5.areas.find((a: { areaId: string }) => a.areaId === "keys");
    expect(keys.title).toBe("Keys, scales and key signatures");
    const s = await startTopic(c, { grade: 5, kind: "topic", id: keys.topics[0].conceptId, count: 10 });
    expect(s.items).toHaveLength(10);
    expect(s.items.every((i) => i.conceptId === keys.topics[0].conceptId)).toBe(true);
    expect(s.items.every((i) => i.item.evidence === "learning")).toBe(true);
    expect(s.items[0]!.lesson?.nodeId).toMatch(/^G5-/);
  });

  it("topics, areas and units are derived from each grade's own lessons (not one list for every grade)", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const ov = (await c.get("/api/topic-practice")).body;
    const areaIds = ov.grades.map((g: { areas: Array<{ areaId: string }> }) => g.areas.map((a) => a.areaId).join(","));
    expect(new Set(areaIds).size).toBeGreaterThan(1);
    expect(ov.grades[0].areas.some((a: { areaId: string }) => a.areaId === "cadences")).toBe(false);
    expect(ov.grades[4].areas.some((a: { areaId: string }) => a.areaId === "cadences")).toBe(true);
    for (const g of ov.grades) {
      const mine = gradeTopics(g.grade);
      for (const a of g.areas) for (const t of a.topics) expect(mine.has(t.conceptId)).toBe(true);
    }
  });

  it("area, unit and mixed selections stay inside what was chosen and inside the grade", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const g5 = (await c.get("/api/topic-practice")).body.grades[4];
    const keys = new Set(g5.areas.find((a: { areaId: string }) => a.areaId === "keys").topics.map((t: { conceptId: string }) => t.conceptId));
    const area = await startTopic(c, { grade: 5, kind: "area", id: "keys", count: 20 });
    expect(area.items.every((i) => keys.has(i.conceptId))).toBe(true);
    const unitConcepts = new Set(course.nodes.filter((n) => n.unitId === "G5-U4").flatMap((n) => n.conceptIds));
    const unit = await startTopic(c, { grade: 5, kind: "unit", id: "G5-U4", count: 20 });
    expect(unit.items.every((i) => unitConcepts.has(i.conceptId))).toBe(true);
    for (const g of [1, 3, 5]) {
      const mixed = await startTopic(c, { grade: g, kind: "grade", id: String(g), count: 20 });
      expect(mixed.items).toHaveLength(20);
      expect(mixed.items.every((i) => gradeTopics(g).has(i.conceptId))).toBe(true);
      expect(new Set(mixed.items.map((i) => i.conceptId)).size).toBeGreaterThan(5); // genuinely mixed
      const stored = app.topics.internalItems((await c.get("/api/me")).body.user.id, mixed.id);
      expect(stored.every((x) => x.item.templateId.startsWith(`t.g${g}.`) || Number(x.item.templateId.slice(3, 4)) <= g)).toBe(true);
    }
  }, 60_000);

  it("question counts are honoured and validated; choices outside the grade are refused, never substituted", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    for (const count of [5, 10, 20]) expect((await startTopic(c, { grade: 4, kind: "area", id: "intervals", count })).items).toHaveLength(count);
    expect((await c.post("/api/topic-practice/sessions", { grade: 4, kind: "area", id: "intervals", count: 7 })).status).toBe(400);
    const cross = await c.post("/api/topic-practice/sessions", { grade: 5, kind: "topic", id: "c.scales.minor-concept", count: 10 });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe("bad_scope");
    expect((await c.post("/api/topic-practice/sessions", { grade: 1, kind: "area", id: "cadences", count: 5 })).status).toBe(400);
    expect((await c.post("/api/topic-practice/sessions", { grade: 1, kind: "unit", id: "G2-U1", count: 5 })).status).toBe(400);
  });

  it("small topics are flagged before starting: the overview gives how many different questions they have (null when 20 are available)", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const ov = (await c.get("/api/topic-practice")).body;
    const topic = (g: number, id: string) => ov.grades[g - 1].areas.flatMap((a: { topics: Array<{ conceptId: string; available: number | null }> }) => a.topics).find((t: { conceptId: string }) => t.conceptId === id);
    const small = topic(2, "c.scales.minor-melodic-preview");
    expect(small.available).toBeGreaterThan(0);
    expect(small.available).toBeLessThan(20);
    expect(topic(5, "c.intervals.compound").available).toBeNull();
    for (const g of ov.grades) expect(g.available).toBeNull(); // every grade can fill 20 when mixed
    // the session gives exactly what the overview promised, and stops there
    const s = await startTopic(c, { grade: 2, kind: "topic", id: "c.scales.minor-melodic-preview", count: 20 });
    expect(s.items.length).toBe(small.available);
  });

  it("a narrow topic that cannot supply enough different questions says so, with no other topic added", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    const s = await startTopic(c, { grade: 2, kind: "topic", id: "c.scales.minor-melodic-preview", count: 20 });
    expect(s.shortfall).toEqual({ requested: 20, available: s.items.length });
    expect(s.items.length).toBeLessThan(20);
    expect(s.items.every((i) => i.conceptId === "c.scales.minor-melodic-preview")).toBe(true);
    const userId = (await c.get("/api/me")).body.user.id;
    const keys = app.topics.internalItems(userId, s.id).map((x) => questionKey(x.item));
    expect(new Set(keys).size).toBe(keys.length); // no duplicate inside the session
  });

  it("hints, marking, explanations, finishing early and the summary all work", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const s = await startTopic(c, { grade: 3, kind: "area", id: "intervals", count: 5 });
    const items = app.topics.internalItems(userId, s.id);
    const withHint = s.items.find((i) => i.item.hintCount > 0);
    if (withHint) {
      const h = await c.post(`/api/topic-practice/sessions/${s.id}/hint`, { itemId: withHint.item.id, level: 1 });
      expect(h.status).toBe(200);
      expect(typeof h.body.hint).toBe("string");
    }
    // first question: wrong three times (worked answer revealed), then right
    const q0 = items[0]!;
    const bad = wrongResponse(course.ix, q0.item, q0.scope)!;
    let r;
    for (let k = 0; k < 3; k++) r = await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: q0.itemId, response: bad });
    expect(r!.body).toMatchObject({ correct: false, attemptNumber: 3 });
    expect(typeof r!.body.message).toBe("string");
    expect(r!.body.solution).toBeTruthy();
    expect((await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: q0.itemId, response: canonicalResponse(course.ix, q0.item, q0.scope) })).body.correct).toBe(true);
    // second question right first time; then finish early
    const q1 = items[1]!;
    expect((await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: q1.itemId, response: canonicalResponse(course.ix, q1.item, q1.scope) })).body.correct).toBe(true);
    const sum = (await c.post(`/api/topic-practice/sessions/${s.id}/complete`)).body;
    expect(sum).toMatchObject({ answered: 2, questions: 5, finishedEarly: true, formative: true, alreadyComplete: false });
    expect(sum.firstTryCorrect).toBe(q1.itemId === withHint?.item.id ? 0 : 1);
    expect(sum.mistakes[0]).toMatchObject({ itemId: q0.itemId });
    expect(sum.mistakes[0].solution).toBeTruthy();
    expect(sum.mistakes[0].lesson.nodeId).toMatch(/^G3-/);
    // finishing again returns the same reply; answering after finishing is refused
    expect((await c.post(`/api/topic-practice/sessions/${s.id}/complete`)).body).toMatchObject({ answered: 2, alreadyComplete: true });
    expect((await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: items[2]!.itemId, response: canonicalResponse(course.ix, items[2]!.item, items[2]!.scope) })).status).toBe(409);
  });

  it("repeating a session generates fresh variations", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const keysOf = (sid: string) => new Set(app.topics.internalItems(userId, sid).map((x) => questionKey(x.item)));
    const a = await startTopic(c, { grade: 5, kind: "topic", id: "c.intervals.compound", count: 10 });
    for (const it of app.topics.internalItems(userId, a.id)) await c.post(`/api/topic-practice/sessions/${a.id}/attempts`, { attemptId: id(), itemId: it.itemId, response: canonicalResponse(course.ix, it.item, it.scope) });
    await c.post(`/api/topic-practice/sessions/${a.id}/complete`);
    const b = await startTopic(c, { grade: 5, kind: "topic", id: "c.intervals.compound", count: 10 });
    const [ka, kb] = [keysOf(a.id), keysOf(b.id)];
    expect([...kb].filter((k) => ka.has(k)).length).toBe(0); // answered questions are not served again while new ones exist
  });

  it("is formative: no XP, streak, badge, completion, mastery or readiness evidence; hints and answers are recorded as exposure", async () => {
    const { db, app } = boot();
    const { c, userId } = await learner(app);
    const before = protectedCounts(db, userId);
    const s = await startTopic(c, { grade: 1, kind: "grade", id: "1", count: 10 });
    const items = app.topics.internalItems(userId, s.id);
    for (const [i, it] of items.entries()) {
      if (i === 0 && it.item.hints.length) await c.post(`/api/topic-practice/sessions/${s.id}/hint`, { itemId: it.itemId, level: 1 });
      if (i < 6) await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: it.itemId, response: canonicalResponse(course.ix, it.item, it.scope) });
    }
    await c.post(`/api/topic-practice/sessions/${s.id}/complete`);
    expect(protectedCounts(db, userId)).toEqual(before);
    expect((await c.get("/api/xp")).body.total).toBe(0);
    // every question answered is now "met with help" for review, revision and mock examinations
    const exposed = new Set((db.prepare("SELECT question_key AS k FROM question_exposure WHERE user_id = ?").all(userId) as Array<{ k: string }>).map((r) => r.k));
    for (const it of items.slice(0, 6)) expect(exposed.has(questionKey(it.item))).toBe(true);
    const helped = (app.prep as unknown as { helpedKeys(u: string): Set<string> }).helpedKeys(userId);
    for (const it of items.slice(0, 6)) expect(helped.has(questionKey(it.item))).toBe(true);
    for (const it of items.slice(0, 6)) expect(app.engagement.mastery.seenKeys(userId, it.conceptId).has(questionKey(it.item))).toBe(true);
    // personalised revision keeps its own eligibility: nothing was taught, so there is still nothing to revise
    expect((await c.get("/api/revision")).body.taughtConcepts).toBe(0);
    expect((await c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body.reason).toBe("nothing_taught");
  });

  it("idempotent commands, one open session, and isolation between accounts", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app, "one");
    const other = await learner(app, "two");
    const s = await startTopic(c, { grade: 2, kind: "area", id: "rhythm", count: 5 });
    const it = app.topics.internalItems(userId, s.id)[0]!;
    const cmd = id();
    const right = canonicalResponse(course.ix, it.item, it.scope);
    const first = await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: cmd, itemId: it.itemId, response: right });
    const replay = await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: cmd, itemId: it.itemId, response: right });
    expect(replay.body).toMatchObject({ correct: first.body.correct, attemptNumber: 1, replayed: true });
    const wrong = wrongResponse(course.ix, it.item, it.scope);
    if (wrong) expect((await c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: cmd, itemId: it.itemId, response: wrong })).status).toBe(409);
    // another learner cannot see or answer it
    expect((await other.c.get(`/api/topic-practice/sessions/${s.id}`)).status).toBe(404);
    expect((await other.c.post(`/api/topic-practice/sessions/${s.id}/attempts`, { attemptId: id(), itemId: it.itemId, response: right })).status).toBe(404);
    expect((await other.c.get("/api/topic-practice")).body.open).toBeNull();
    // the open session is offered to resume; starting another closes it, keeping its answers
    expect((await c.get("/api/topic-practice")).body.open.id).toBe(s.id);
    const next = await startTopic(c, { grade: 2, kind: "area", id: "rhythm", count: 5 });
    expect((await c.get(`/api/topic-practice/sessions/${s.id}`)).body.status).toBe("abandoned");
    expect((await c.get("/api/topic-practice")).body.open.id).toBe(next.id);
    // exported with the learner's data
    const exp = (await c.get("/api/me/export")).body;
    expect(exp.topicPracticeSessions).toHaveLength(2);
    expect(exp.topicPracticeAttempts).toHaveLength(1);
  });

  it("a guest who registers keeps their topic practice and explored lessons", async () => {
    const { app } = boot();
    const { c } = await learner(app);
    await exploreAndComplete(c, "G4-U2-L01");
    const s = await startTopic(c, { grade: 4, kind: "area", id: "intervals", count: 5 });
    expect((await c.post("/api/auth/register", { email: "flex@example.com", password: "correct horse battery", displayName: "flex" })).status).toBe(200);
    expect((await states(c))["G4-U2-L01"]!.state).toBe("completed");
    expect((await c.get(`/api/topic-practice/sessions/${s.id}`)).status).toBe(200);
  });
});
