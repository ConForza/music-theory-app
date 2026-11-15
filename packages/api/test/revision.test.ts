/**
 * Brief 10: personalised revision. What is weak, due and untested comes from the existing evidence ledger; sessions reuse the Brief 04
 * generators and graders; finishing early is free; rewards are idempotent.
 */
import { canonicalResponse, wrongResponse } from "@mtp/engine";
import { describe, expect, it } from "vitest";
import { answerAll, boot, cmd, completeGrades, learner } from "./prep-helpers.ts";
import { visibleKey } from "../src/question-key.ts";
import { realCourse } from "./helpers.ts";

const course = realCourse();
type Ctx = ReturnType<typeof boot>;

const record = (ctx: Ctx, userId: string, conceptId: string, results: boolean[], template = "t.g1.note-name") => {
  results.forEach((correct, i) => ctx.app.engagement.mastery.record(userId, { id: `t:${conceptId}:${i}:${Math.random()}`, conceptIds: [conceptId], source: "independent-step", correct, itemId: `x${i}`, questionKey: `qk:${conceptId}:${i}:${Math.random()}`, templateId: template, templateVersion: 1, mistakeCategory: correct ? null : "confused-similar-term" }));
};
const byId = (ctx: Ctx, userId: string) => new Map(ctx.app.revision.insights(userId).map((c) => [c.conceptId, c]));

describe("what is weak, what is due and what is simply untested", () => {
  it("a learner who has been taught but not tested has untested topics, none weak: unknown is not weak", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const all = ctx.app.revision.insights(L.userId);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((c) => c.status === "untested")).toBe(true);
    const o = (await L.c.get("/api/revision")).body;
    expect(o.weak).toEqual([]);
    expect(o.untested.length).toBe(all.length);
    expect(o.untested[0].reasons[0]).toMatch(/do not know yet/);
  });

  it("nothing is offered for what has not been taught", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    expect(ctx.app.revision.insights(L.userId)).toEqual([]);
    const s = await L.c.post("/api/revision/sessions", { mode: "quick" });
    expect(s.body).toMatchObject({ session: null, reason: "nothing_taught" });
  });

  it("repeated independent errors make a topic weak (and only that topic); a topic answered well is solid, not weak", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const [weakId, goodId, otherId] = ctx.app.revision.insights(L.userId).map((c) => c.conceptId);
    record(ctx, L.userId, weakId!, [false, true, false]);
    record(ctx, L.userId, goodId!, [true, true, true, true, true]);
    const m = byId(ctx, L.userId);
    expect(m.get(weakId!)).toMatchObject({ status: "weak", recentWrong: 2 });
    expect(m.get(weakId!)!.reasons.join(" ")).toMatch(/2 of your last 3/);
    expect(m.get(goodId!)!.status).not.toBe("weak");
    expect(m.get(otherId!)!.status).toBe("untested");
    expect((await L.c.get("/api/revision")).body.weak.map((w: { conceptId: string }) => w.conceptId)).toEqual([weakId]);
  });

  it("shows whether the learner is improving", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const [a, b] = ctx.app.revision.insights(L.userId).map((c) => c.conceptId);
    record(ctx, L.userId, a!, [false, false, false, true, true, true, true]);
    record(ctx, L.userId, b!, [true, true, true, true, false, false, false]);
    const m = byId(ctx, L.userId);
    expect(m.get(a!)!.trend).toBe("improving");
    expect(m.get(a!)!.status).not.toBe("weak");
    expect(m.get(b!)!.trend).toBe("declining");
    expect(m.get(b!)!.status).toBe("weak");
    expect((await L.c.get("/api/revision")).body.improving.map((x: { conceptId: string }) => x.conceptId)).toContain(a);
  });

  it("a recent independent mock examination that found an outcome weak also flags its topics", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const id = (await L.c.post("/api/exams/1/start", { mode: "mock" })).body.id as string;
    const first = ctx.app.prep.blueprint(1).sections.find((s) => s.outcomeId)!.outcomeId!;
    await answerAll(ctx.app, L.c, L.userId, id, (_i, o) => o === first);
    await L.c.post(`/api/prep/attempts/${id}/complete`, {});
    const flagged = ctx.app.revision.insights(L.userId).filter((c) => c.examWeak);
    expect(flagged.length).toBeGreaterThan(0);
    for (const c of flagged) {
      expect(c.status).toBe("weak");
      expect(course.ix.concepts.get(c.conceptId)!.outcomeIds).toContain(first);
    }
  }, 60_000);
});

describe("quick review", () => {
  it("builds 3, 5 or 10 minutes of questions, weakest first, with no repeated question and one clear session at a time", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const [weak] = ctx.app.revision.insights(L.userId).map((c) => c.conceptId);
    record(ctx, L.userId, weak!, [false, false, true]);
    expect((await L.c.get("/api/revision")).body.quick.questionsFor).toEqual({ 3: 5, 5: 8, 10: 15 });
    const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 5 })).body;
    expect(s.session.items).toHaveLength(8);
    expect(s.session.items[0].conceptId).toBe(weak);
    expect(s.session.items[0].reason).toBe("weak");
    const keys = s.session.items.map((i: { item: unknown }, n: number) => visibleKey(ctx.app.revision["engagement"].review.resolve(JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.session.id) as { items: string }).items)[n])!.item));
    expect(new Set(keys).size).toBe(8);
    // the same topic is not asked twice running
    const concepts = s.session.items.map((i: { conceptId: string }) => i.conceptId);
    for (let i = 1; i < concepts.length; i++) if (new Set(concepts).size > 1) expect(concepts[i]).not.toBe(concepts[i - 1]);
    // asking again resumes it, whatever the request
    const again = (await L.c.post("/api/revision/sessions", { mode: "weak" })).body;
    expect(again).toMatchObject({ resumed: true, mode: "quick" });
    expect(again.session.id).toBe(s.session.id);
    let open = s.session.id as string;
    for (const [minutes, n] of [[3, 5], [10, 15]] as const) {
      await L.c.post(`/api/revision/sessions/${open}/abandon`);
      const next = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes })).body.session;
      expect(next.items).toHaveLength(n);
      open = next.id;
    }
  }, 60_000);

  it("is a fresh set each time: questions the learner has already answered are not repeated", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const seen = new Set<string>();
    for (let round = 0; round < 2; round++) {
      const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body.session;
      const rows = JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.id) as { items: string }).items) as Array<{ itemId: string }>;
      for (const r of rows) {
        const item = ctx.app.revision["engagement"].review.resolve(r as never)!;
        const r2 = canonicalResponse(course.ix, item.item, item.scope);
        const res = await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cmd(), itemId: r.itemId, response: r2 });
        expect(res.body.correct).toBe(true);
      }
      const keys = rows.map((r) => visibleKey(ctx.app.revision["engagement"].review.resolve(r as never)!.item));
      for (const k of keys) expect(seen.has(k), "a question was repeated").toBe(false);
      keys.forEach((k) => seen.add(k));
      await L.c.post(`/api/revision/sessions/${s.id}/complete`);
    }
  }, 90_000);

  it("finishing early is free: answers stay, nothing is penalised, and a short session earns no reward but does not lose any", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 5 })).body.session;
    const rows = JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.id) as { items: string }).items) as Array<{ itemId: string }>;
    for (const r of rows.slice(0, 2)) {
      const it = ctx.app.revision["engagement"].review.resolve(r as never)!;
      await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cmd(), itemId: r.itemId, response: canonicalResponse(course.ix, it.item, it.scope) });
    }
    const done = await L.c.post(`/api/revision/sessions/${s.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ answered: 2, questions: 8, finishedEarly: true, credited: false, xp: null });
    expect(ctx.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ?").get(L.userId)).toEqual({ c: 0 });
    expect((ctx.db.prepare("SELECT COUNT(*) AS c FROM revision_attempts WHERE user_id = ?").get(L.userId) as { c: number }).c).toBe(2);
    expect((ctx.db.prepare("SELECT COUNT(*) AS c FROM mastery_evidence WHERE user_id = ? AND source = 'review-item'").get(L.userId) as { c: number }).c).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("a real session pays XP and counts for the day exactly once, however many times it is finished", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body.session;
    const rows = JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.id) as { items: string }).items) as Array<{ itemId: string }>;
    const first = rows[0]!;
    const it = ctx.app.revision["engagement"].review.resolve(first as never)!;
    const cid = cmd();
    const ans = canonicalResponse(course.ix, it.item, it.scope);
    const a1 = await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cid, itemId: first.itemId, response: ans });
    const a2 = await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cid, itemId: first.itemId, response: ans }); // lost-reply retry
    expect(a2.body).toMatchObject({ correct: true, replayed: true });
    expect(a1.body.replayed).toBe(false);
    expect((await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cid, itemId: rows[1]!.itemId, response: ans })).status).toBe(409);
    for (const r of rows.slice(1)) {
      const x = ctx.app.revision["engagement"].review.resolve(r as never)!;
      await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cmd(), itemId: r.itemId, response: canonicalResponse(course.ix, x.item, x.scope) });
    }
    const f1 = (await L.c.post(`/api/revision/sessions/${s.id}/complete`)).body;
    const f2 = (await L.c.post(`/api/revision/sessions/${s.id}/complete`)).body;
    expect(f1).toMatchObject({ credited: true, alreadyComplete: false });
    expect(f2).toMatchObject({ alreadyComplete: true });
    expect(f1.xp.awarded).toBeGreaterThan(0);
    expect(ctx.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ? AND source_key = ?").get(L.userId, `revision:${s.id}`)).toEqual({ c: 1 });
    expect(ctx.db.prepare("SELECT COUNT(*) AS c FROM daily_activity WHERE user_id = ? AND source_key = ?").get(L.userId, `revision:${s.id}`)).toEqual({ c: 1 });
    expect((await L.c.get("/api/xp")).body.total).toBe(f1.xp.awarded);
  }, 60_000);
});

describe("weak-topic practice", () => {
  it("says so plainly when nothing is weak; otherwise explains first (summary, usual slip, lesson to revisit), then asks as learning, never as mastery evidence", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    expect((await L.c.post("/api/revision/sessions", { mode: "weak" })).body).toMatchObject({ session: null, reason: "no_weak_topics" });
    const [w] = ctx.app.revision.insights(L.userId).map((c) => c.conceptId);
    record(ctx, L.userId, w!, [false, false]);
    const s = (await L.c.post("/api/revision/sessions", { mode: "weak", conceptId: w })).body.session;
    expect(s.mode).toBe("weak");
    expect(s.preface).toHaveLength(1);
    expect(s.preface[0]).toMatchObject({ conceptId: w });
    expect(s.preface[0].summary.length).toBeGreaterThan(10);
    expect(s.preface[0].lessons.length).toBeGreaterThan(0);
    expect(s.preface[0].topMistake).toBeTruthy();
    expect(s.items).toHaveLength(4);
    expect(s.items.every((i: { item: { evidence: string } }) => i.item.evidence === "learning")).toBe(true);
    const row = JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.id) as { items: string }).items)[0];
    const it = ctx.app.revision["engagement"].review.resolve(row)!;
    await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cmd(), itemId: row.itemId, response: canonicalResponse(course.ix, it.item, it.scope) });
    const ev = ctx.db.prepare("SELECT source, counts FROM mastery_evidence WHERE user_id = ? AND id LIKE 'revision:%'").all(L.userId) as Array<{ source: string; counts: number }>;
    expect(ev).toEqual([{ source: "remedial-step", counts: 0 }]);
    // asking for a topic that is not weak is explained, not invented
    expect((await L.c.post("/api/revision/sessions", { mode: "weak", conceptId: "c.nope" })).status).toBe(200);
  }, 60_000);

  it("a wrong answer is explained and can be retried, and the learner is shown the worked answer after repeated misses", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 1);
    const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body.session;
    const row = JSON.parse((ctx.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(L.userId, s.id) as { items: string }).items)[0];
    const it = ctx.app.revision["engagement"].review.resolve(row)!;
    const bad = wrongResponse(course.ix, it.item, it.scope)!;
    const r = [];
    for (let k = 0; k < 3; k++) r.push((await L.c.post(`/api/revision/sessions/${s.id}/attempts`, { attemptId: cmd(), itemId: row.itemId, response: bad })).body);
    expect(r.map((x) => x.correct)).toEqual([false, false, false]);
    expect(r[0].message).toBeTruthy();
    expect(r[0].solution).toBeUndefined();
    expect(r[2].solution).toBeTruthy();
    // only the FIRST answer was evidence
    expect(ctx.db.prepare("SELECT COUNT(*) AS c FROM mastery_evidence WHERE user_id = ? AND id LIKE 'revision:%'").get(L.userId)).toEqual({ c: 1 });
  }, 60_000);
});

describe("explore and mixed practice", () => {
  it("offers only what the learner has been taught, by grade, unit, topic and exercise type", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 2);
    const ex = (await L.c.get("/api/revision/explore")).body;
    expect(ex.grades.filter((g: { available: boolean }) => g.available).map((g: { grade: number }) => g.grade)).toEqual([1, 2]);
    expect(ex.families.length).toBeGreaterThan(3);
    const none = (await L.c.post("/api/revision/sessions", { mode: "explore", grade: 4 })).body;
    expect(none).toMatchObject({ session: null, reason: "nothing_available" });
    const unit = ex.grades[1].units[0];
    const byUnit = (await L.c.post("/api/revision/sessions", { mode: "explore", unitId: unit.unitId, minutes: 3 })).body;
    expect(byUnit.session.items.length).toBeGreaterThan(0);
    const allowed = new Set(unit.concepts.map((c: { conceptId: string }) => c.conceptId));
    expect(byUnit.session.items.every((i: { conceptId: string }) => allowed.has(i.conceptId))).toBe(true);
    await L.c.post(`/api/revision/sessions/${byUnit.session.id}/abandon`);
    const fam = ex.families[0];
    const byFamily = (await L.c.post("/api/revision/sessions", { mode: "explore", familyId: fam.familyId, minutes: 3 })).body.session;
    expect(byFamily.items.every((i: { item: { familyId: string } }) => i.item.familyId === fam.familyId)).toBe(true);
  }, 60_000);

  it("mixed practice interleaves different kinds of topic, so neighbouring questions ask for different thinking", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    completeGrades(ctx.app, ctx.db, L.userId, 3);
    const s = (await L.c.post("/api/revision/sessions", { mode: "mixed", minutes: 5 })).body.session;
    expect(s.items).toHaveLength(8);
    const domains = s.items.map((i: { conceptId: string }) => course.ix.concepts.get(i.conceptId)!.domain);
    expect(new Set(domains).size).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < domains.length; i++) expect(domains[i]).not.toBe(domains[i - 1]);
    // earlier-grade material is included: it is mixed from everything taught, not just the latest grade
    expect(new Set(s.items.map((i: { conceptId: string }) => course.ix.concepts.get(i.conceptId)!.grade)).size).toBeGreaterThan(1);
  }, 60_000);

  it("a learner who placed above Grade 1 can revise Grade 1 material before taking its lessons", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    expect(ctx.app.revision.insights(L.userId)).toEqual([]);
    ctx.db.prepare("INSERT INTO prep_attempts (user_id,id,kind,mode,grade,status,seed,started_at,curriculum_version,blueprint_version,rubric_version,items,rubric,summary,completed_at) VALUES (?,?,'placement','placement',NULL,'complete',1,'2026-01-01T00:00:00Z','x',1,1,'[]','{}','{\"recommendedGrade\":3}','2026-01-01T00:00:00Z')").run(L.userId, "p1");
    ctx.db.prepare("INSERT INTO placement_starts (user_id,attempt_id,start_grade,recommended_grade,accepted_at) VALUES (?,?,3,3,'2026-01-01T00:00:00Z')").run(L.userId, "p1");
    const all = ctx.app.revision.insights(L.userId);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((c) => c.grade <= 2 && c.earlierGrade)).toBe(true);
    const s = (await L.c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body;
    expect(s.session.items.length).toBeGreaterThan(0);
  }, 60_000);

  it("another learner's session is invisible", async () => {
    const ctx = boot();
    const A = await learner(ctx.app, "a");
    const B = await learner(ctx.app, "b");
    completeGrades(ctx.app, ctx.db, A.userId, 1);
    const s = (await A.c.post("/api/revision/sessions", { mode: "quick", minutes: 3 })).body.session;
    for (const [m, p] of [["GET", `/api/revision/sessions/${s.id}`], ["POST", `/api/revision/sessions/${s.id}/complete`], ["POST", `/api/revision/sessions/${s.id}/abandon`]] as const) expect((await B.c.call(m, p, m === "POST" ? {} : undefined)).status).toBe(404);
  }, 60_000);
});
