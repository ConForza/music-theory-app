/**
 * Brief 10: placement. The recommendation is calculated by a documented rule (prep-rules.test.ts); here it is exercised end to end through
 * the routes, together with the promises around it: nothing is completed or awarded, a lower start is free, retaking preserves history.
 */
import { describe, expect, it } from "vitest";
import { answerAll, boot, learner, protectedCounts } from "./prep-helpers.ts";
import { realCourse } from "./helpers.ts";

const course = realCourse();
const stageOf = (app: ReturnType<typeof boot>["app"], userId: string, id: string) => app.prep.internalItems(userId, id).map((i) => i.planned.stage!);

/** Answer the placement check, getting `missPerStage[grade]` questions of each stage wrong. Returns the completed summary. */
async function runPlacement(ctx: ReturnType<typeof boot>, L: Awaited<ReturnType<typeof learner>>, missPerStage: Record<number, number>) {
  const { app } = ctx;
  const start = await L.c.post("/api/placement/start", {});
  const id = start.body.id as string;
  for (let round = 0; round < 6; round++) {
    const items = app.prep.internalItems(L.userId, id);
    const answered = new Set((await L.c.get(`/api/prep/attempts/${id}`)).body.items.filter((i: { answered: boolean }) => i.answered).map((i: { item: { id: string } }) => i.item.id));
    const todo = items.filter((i) => !answered.has(i.item.id));
    if (!todo.length) break;
    const wrongLeft = new Map<number, number>(Object.entries(missPerStage).map(([g, n]) => [Number(g), n]));
    // count wrongs already given per stage
    for (const it of items.filter((i) => answered.has(i.item.id))) void it;
    const seen = new Map<number, number>();
    for (const it of items) {
      const st = it.planned.stage!;
      const k = seen.get(st) ?? 0;
      seen.set(st, k + 1);
      if (answered.has(it.item.id)) continue;
      const bad = k < (wrongLeft.get(st) ?? 0);
      await answerAll(app, L.c, L.userId, id, () => bad, (i) => items[i]!.item.id === it.item.id);
    }
  }
  const done = await L.c.post(`/api/prep/attempts/${id}/complete`, {});
  return { id, summary: done.body, status: done.status };
}

describe("placement end to end", () => {
  it("a learner who knows Grades 1-4 is placed at Grade 5 after 24 independent questions, and is told it is advice, not a grade", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const before = protectedCounts(ctx.db, L.userId);
    const start = await L.c.post("/api/placement/start", {});
    expect(start.body.kind).toBe("placement");
    expect(start.body.items).toHaveLength(6); // one probe at a time: it grows only while the learner keeps showing secure understanding
    expect(start.body.firstAttemptOnly).toBe(true);
    expect((await L.c.post("/api/placement/start", {})).body.id).toBe(start.body.id); // resumes
    const r = await runPlacement(ctx, L, {});
    expect(r.status).toBe(200);
    expect(r.summary).toMatchObject({ kind: "placement", recommendedGrade: 5, allSecure: true, questions: 24, answered: 24, gaps: [] });
    expect(r.summary.stages.map((s: { grade: number; level: string }) => [s.grade, s.level])).toEqual([[1, "secure"], [2, "secure"], [3, "secure"], [4, "secure"]]);
    expect(r.summary.explanation).toMatch(/does not complete any grade/);
    expect(r.summary.disclaimer).toMatch(/not an ABRSM/);
    // it says plainly what a short check did NOT ask, and does not overclaim
    expect(r.summary.explanation).not.toMatch(/exactly|key questions/);
    expect(r.summary.explanation).toMatch(/short check/);
    expect(r.summary.notChecked.map((n: { grade: number }) => n.grade)).toEqual([1, 2, 3, 4]);
    const asked = new Set(ctx.app.prep.internalItems(L.userId, r.id).map((i) => i.planned.outcomeId));
    for (const n of r.summary.notChecked) {
      for (const stmt of n.statements) {
        const o = [...course.ix.outcomes.values()].find((x) => x.statement === stmt)!;
        expect(o.grade).toBe(n.grade);
        expect(asked.has(o.id)).toBe(false);
      }
      expect(n.statements.length).toBeGreaterThan(5); // most of each grade was not asked
    }
    // each probe's questions come from that grade
    expect([...new Set(stageOf(ctx.app, L.userId, r.id))]).toEqual([1, 2, 3, 4]);
    expect(protectedCounts(ctx.db, L.userId)).toEqual(before);
  }, 120_000);

  it("a beginner stops after one probe: Grade 1, with the lessons to start with, and the higher grades are not assessed", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const r = await runPlacement(ctx, L, { 1: 5 });
    expect(r.summary).toMatchObject({ recommendedGrade: 1, decidedBy: 1, questions: 6, notAssessed: [2, 3, 4], allSecure: false });
    expect(r.summary.gaps.length).toBe(5);
    for (const g of r.summary.gaps) {
      expect(g.kind).toBe("start-here");
      expect(g.lessons.length).toBeGreaterThan(0);
      expect(course.ix.nodeById.get(g.lessons[0].nodeId)!.grade).toBe(1);
    }
    expect(r.summary.stages).toEqual([{ grade: 1, asked: 6, correct: 1, level: "weak" }]);
  }, 60_000);

  it("a partial Grade 3 result recommends Grade 3, and a slip in Grade 2 is listed as a catch-up lesson (not a reason to start lower)", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const r = await runPlacement(ctx, L, { 2: 1, 3: 2 });
    expect(r.summary).toMatchObject({ recommendedGrade: 3, decidedBy: 3, notAssessed: [4], questions: 18 });
    expect(r.summary.stages.map((s: { level: string }) => s.level)).toEqual(["secure", "secure", "partial"]);
    const catchUp = r.summary.gaps.filter((g: { kind: string }) => g.kind === "catch-up");
    const here = r.summary.gaps.filter((g: { kind: string }) => g.kind === "start-here");
    expect(catchUp).toHaveLength(1);
    expect(catchUp[0].grade).toBe(2);
    expect(here).toHaveLength(2);
    expect(here.every((g: { grade: number }) => g.grade === 3)).toBe(true);
    // a mixed probe is worded as advice to catch up, and tells the learner they may start lower
    expect(r.summary.explanation).toMatch(/start lower at any time, with no penalty/);
  }, 90_000);

  it("choosing a starting grade: any grade up to the recommendation, nothing above it; it opens that grade's first lesson without completing anything", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const r = await runPlacement(ctx, L, { 3: 3 }); // secure at 1 and 2, weak at 3 -> recommends Grade 3
    expect(r.summary.recommendedGrade).toBe(3);
    const firstOf = (g: number) => course.nodes.find((n) => n.grade === g && !n.optional && course.isPlayable(n.id))!.id;
    const stateOf = async (node: string) => (await L.c.get("/api/progress")).body.nodes[node].state as string;
    expect(await stateOf(firstOf(3))).toBe("locked");
    // above the recommendation: refused. Before it is finished: refused.
    expect((await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 4 })).status).toBe(400);
    const before = protectedCounts(ctx.db, L.userId);
    const ok = await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 3 });
    expect(ok.body).toEqual({ startGrade: 3, recommendedGrade: 3 });
    expect(await stateOf(firstOf(3))).toBe("available");
    expect(await stateOf(firstOf(4))).toBe("locked");
    // Grade 1 and 2 nodes are not completed: no badge, no XP, no assessment result, no lesson marked done
    expect(protectedCounts(ctx.db, L.userId)).toEqual(before);
    expect(await stateOf("G2-A")).not.toBe("completed");
    expect((await L.c.get("/api/achievements")).body.achievements.filter((a: { earned: boolean }) => a.earned)).toHaveLength(0);
    expect((await L.c.get("/api/me")).body.profile.selectedGrade).toBe(3);
    // starting lower is always free: the same placement can be re-accepted at Grade 1 with no penalty, and Grade 3 closes again
    expect((await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 1 })).body.startGrade).toBe(1);
    expect(await stateOf(firstOf(3))).toBe("locked");
    expect(await stateOf(firstOf(1))).toBe("available");
    expect(ctx.app.prep.placedGrade(L.userId)).toBe(1);
  }, 120_000);

  it("a placement is not a grade assessment: no result row, no grade badge, and the grade assessment node stays locked", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const r = await runPlacement(ctx, L, {});
    await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 5 });
    expect((await L.c.get("/api/results")).body.results).toEqual([]);
    const ach = (await L.c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(ach.filter((a) => /grade-complete/.test(a.id) && a.earned)).toEqual([]);
    const progress = (await L.c.get("/api/progress")).body.nodes;
    for (const g of [1, 2, 3, 4, 5]) expect(progress[`G${g}-A`].state).not.toBe("completed");
    expect(Object.values(progress as Record<string, { state: string }>).filter((n) => n.state === "completed")).toHaveLength(0);
  }, 120_000);

  it("taking placement again keeps all earlier progress and history; the newest accepted start applies; the old one is superseded, not deleted", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    // a learner who has really finished Grade 1 in the course
    const now = ctx.app.clock.now().toISOString();
    for (const n of course.nodes.filter((x) => x.grade === 1)) ctx.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(L.userId, n.id, n.contentVersion, course.version, now, now, now, n.contentVersion);
    const lessons = () => ctx.db.prepare("SELECT node_id, run, completed_at FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(L.userId);
    const snapshot = JSON.stringify(lessons());
    const first = await runPlacement(ctx, L, { 2: 4 });
    await L.c.post(`/api/prep/attempts/${first.id}/accept`, { startGrade: 2 });
    const second = await runPlacement(ctx, L, { 3: 3 });
    expect(second.id).not.toBe(first.id);
    await L.c.post(`/api/prep/attempts/${second.id}/accept`, { startGrade: 3 });
    expect(JSON.stringify(lessons())).toBe(snapshot);
    const starts = ctx.db.prepare("SELECT attempt_id, start_grade, superseded_at FROM placement_starts WHERE user_id = ? ORDER BY accepted_at, rowid").all(L.userId) as Array<{ attempt_id: string; start_grade: number; superseded_at: string | null }>;
    expect(starts.map((s) => [s.attempt_id, s.start_grade, s.superseded_at !== null])).toEqual([[first.id, 2, true], [second.id, 3, false]]);
    const hist = (await L.c.get("/api/prep/results")).body.results.filter((x: { kind: string }) => x.kind === "placement");
    expect(hist.map((x: { id: string }) => x.id).sort()).toEqual([first.id, second.id].sort());
    // Grade 1 is still completed
    expect((await L.c.get("/api/progress")).body.nodes["G1-A"].state).toBe("completed");
  }, 180_000);

  it("finishing early never counts an unanswered question as wrong, and never suggests a grade the learner did not get to", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const id = (await L.c.post("/api/placement/start", {})).body.id as string;
    // answer all of Grade 1 correctly (the check grows), then only 3 of the 6 Grade 2 questions, then stop
    const items1 = ctx.app.prep.internalItems(L.userId, id);
    await answerAll(ctx.app, L.c, L.userId, id);
    expect(items1).toHaveLength(6);
    const items = ctx.app.prep.internalItems(L.userId, id);
    expect(items).toHaveLength(12);
    await answerAll(ctx.app, L.c, L.userId, id, () => false, (i) => i >= 6 && i < 9);
    expect((await L.c.post(`/api/prep/attempts/${id}/complete`, {})).status).toBe(409);
    const done = (await L.c.post(`/api/prep/attempts/${id}/complete`, { allowUnanswered: true })).body;
    expect(done.recommendedGrade).toBe(2);
    expect(done.allSecure).toBe(false);
    expect(done.stages).toEqual([{ grade: 1, asked: 6, correct: 6, level: "secure" }]);
    expect(done.notAssessed).toContain(2);
    expect(done.gaps).toEqual([]); // nothing was answered wrongly
    expect(done.explanation).toMatch(/finished early/);
  }, 60_000);

  it("replays are safe: the same answer command twice, completing twice and accepting twice change nothing more", async () => {
    const ctx = boot();
    const L = await learner(ctx.app);
    const r = await runPlacement(ctx, L, { 1: 5 });
    const again = await L.c.post(`/api/prep/attempts/${r.id}/complete`, {});
    expect(again.body).toEqual({ ...r.summary, alreadyComplete: true });
    await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 1 });
    await L.c.post(`/api/prep/attempts/${r.id}/accept`, { startGrade: 1 });
    expect(ctx.db.prepare("SELECT COUNT(*) AS c FROM placement_starts WHERE user_id = ?").get(L.userId)).toEqual({ c: 1 });
    // an unfinished check cannot be accepted
    const open = await L.c.post("/api/placement/start", {});
    expect((await L.c.post(`/api/prep/attempts/${open.body.id}/accept`, { startGrade: 1 })).status).toBe(409);
  }, 60_000);
});
