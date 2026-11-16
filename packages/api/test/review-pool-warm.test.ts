/**
 * Brief 11 release audit, F3: the review overview sampled 300 seeds for every candidate template of every concept inside the request. For a
 * learner with many completed lessons the first GET /api/review after a start blocked the server's one thread for 15-25 s. The pools are now
 * cached per candidate (independent of the learner) and filled before the server listens.
 */
import { describe, expect, it } from "vitest";
import { boot, completeGrades, learner } from "./prep-helpers.ts";
import { ensureDone } from "./helpers.ts";

describe("review question pools are sampled before any request", () => {
  const { db, app } = boot();
  it("warmPools samples every candidate once, and a second call has nothing left to do", () => {
    expect(app.engagement.review.warmPools()).toBeGreaterThan(100);
    expect(app.engagement.review.warmPools()).toBe(0);
  }, 300_000);

  it("after warming, the first review overview of a learner with Grades 1-4 complete and real Grade 5 evidence samples nothing and is quick", async () => {
    const L = await learner(app, "returning");
    completeGrades(app, db, L.userId, 4);
    await ensureDone(L.c, app, L.userId, "G5-U1-P1");
    const t0 = performance.now();
    const r = await L.c.get("/api/review");
    const ms = performance.now() - t0;
    expect(r.status).toBe(200);
    expect(app.engagement.review.warmPools(), "the request needed no pool that start-up had not sampled").toBe(0);
    expect(ms, `first /api/review took ${ms.toFixed(0)} ms`).toBeLessThan(3000);
  }, 300_000);

  it("a pool is the same whether it was warmed or sampled on demand", async () => {
    const cold = boot();
    const concept = [...cold.course.ix.conceptTaughtBy.keys()].find((c) => cold.app.engagement.review.candidates(c, new Set(cold.course.nodes.map((n) => n.id))).length > 1)!;
    const all = new Set(cold.course.nodes.map((n) => n.id));
    const onDemand = [...cold.app.engagement.review.poolKeys(concept, all)];
    expect(onDemand.length).toBeGreaterThan(0);
    expect([...app.engagement.review.poolKeys(concept, all)]).toEqual(onDemand);
  }, 120_000);
});
