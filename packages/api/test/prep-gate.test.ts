/**
 * Release gate for estimated readiness (PR #18 release blockers): OFF by default. While off, no classification, percentage or explanation
 * reaches a client, but every score, outcome level, recommendation and attempt is still recorded and shown, and the evidence is intact:
 * switching the gate on later reads the very same stored attempts.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { DEFAULT_GATES, gatesFromEnv } from "../src/prep-config.ts";
import { answerAll, boot, learner } from "./prep-helpers.ts";
import { realCourse } from "./helpers.ts";

describe("the gate's default", () => {
  it("is off in code, off with no environment, and on only for the one explicit value", () => {
    expect(DEFAULT_GATES).toEqual({ readiness: false });
    expect(gatesFromEnv({})).toEqual({ readiness: false });
    for (const v of ["", "1", "true", "yes", "on", "TEACHER-APPROVED"]) expect(gatesFromEnv({ MTP_SHOW_READINESS: v }), v).toEqual({ readiness: false });
    expect(gatesFromEnv({ MTP_SHOW_READINESS: "teacher-approved" })).toEqual({ readiness: true });
  });
  it("an app built with no gates reads the environment and shows nothing unless it is set", async () => {
    const before = process.env.MTP_SHOW_READINESS;
    delete process.env.MTP_SHOW_READINESS;
    try {
      const app = createApp({ db: boot().db, course: realCourse(), waiveUnwrittenPrerequisites: false, testClock: true });
      expect(app.prep.gates).toEqual({ readiness: false });
    } finally {
      if (before !== undefined) process.env.MTP_SHOW_READINESS = before;
    }
  });
});

describe("with the gate off, readiness is withheld but evidence and scores are not", () => {
  it("sends no label, percentage or explanation anywhere, keeps the score, outcome levels and attempt history, and keeps the evidence", async () => {
    const { db, app } = boot({ gates: { readiness: false } });
    const { c, userId } = await learner(app);
    const ids: string[] = [];
    for (const seed of [11, 22]) {
      const v = await c.post("/api/exams/2/start", { mode: "mock", seed });
      expect(v.status).toBe(200);
      await answerAll(app, c, userId, v.body.id, (i) => i < 3);
      const done = await c.post(`/api/prep/attempts/${v.body.id}/complete`, {});
      expect(done.status).toBe(200);
      ids.push(v.body.id);
      // a result still carries the individual mock score, the independent percentage, outcome levels and what to revise
      expect(done.body.score).toBeGreaterThan(0);
      expect(done.body.independentPercent).not.toBeNull();
      expect(done.body.outcomes.some((o: { level: string }) => o.level !== "not_assessed")).toBe(true);
      expect(done.body.recommendations.length).toBeGreaterThan(0);
      await c.post("/api/test/clock", { advanceDays: 1 });
    }
    const gated = { visible: false, attemptsUsed: 2 };
    const results = await c.get("/api/prep/results");
    expect(results.body.grades[1].readiness).toMatchObject(gated);
    for (const k of ["label", "percent", "title", "detail", "basedOn"]) expect(results.body.grades[1].readiness, k).not.toHaveProperty(k);
    expect(results.body.grades[1].readiness.note).toMatch(/not shown yet/);
    expect(results.body.results.filter((r: { grade: number }) => r.grade === 2)).toHaveLength(2);
    expect(results.body.grades[1].progress.attempts).toHaveLength(2);
    // the practice hub: the same
    const hub = await c.get("/api/prep");
    expect(hub.body.grades[1].readiness).toMatchObject({ visible: false });
    expect(hub.body.grades[1].readiness).not.toHaveProperty("label");
    expect(hub.body.grades[1].mockAttempts).toBe(2);
    // nowhere in any response body does a readiness label appear
    expect(JSON.stringify([results.body, hub.body, (await c.get(`/api/prep/attempts/${ids[0]}/result`)).body])).not.toMatch(/on_track|Consistently secure|"needs_review","title"/);
    // the evidence is intact: the estimate is still computed from the stored attempts
    const evidence = app.prep.readinessEvidence(userId, 2);
    expect(evidence.attemptsUsed).toBe(2);
    expect(evidence.label).toBeDefined();
    expect(evidence.percent).not.toBeNull();
    const stored = db.prepare("SELECT COUNT(*) AS n FROM prep_attempts WHERE user_id = ? AND status = 'complete'").get(userId) as { n: number };
    expect(stored.n).toBe(2);
    // a second app on the same database with the gate on shows the estimate from those same attempts
    const on = createApp({ db, course: realCourse(), waiveUnwrittenPrerequisites: false, testClock: true, releaseGates: { readiness: true } });
    const shown = on.prep.readinessFor(userId, 2);
    expect(shown).toMatchObject({ visible: true, attemptsUsed: 2, label: evidence.label, percent: evidence.percent });
  }, 120_000);

  it("with the gate on, the response is the full estimate", async () => {
    const { app } = boot({ gates: { readiness: true } });
    const { c } = await learner(app);
    const res = await c.get("/api/prep/results");
    expect(res.body.grades[0].readiness).toMatchObject({ visible: true, label: "not_enough_evidence", attemptsUsed: 0 });
  });
});
