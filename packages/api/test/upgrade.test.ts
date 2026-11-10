import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ManualClock } from "../src/clock.ts";
import { openDb } from "../src/db.ts";
import { Client, finishLesson, realCourse, register, sharedCourse } from "./helpers.ts";

/**
 * Brief 05 section 9: a learner who played the Brief 04 world (only G1-U3-L03 and G5-U4-L06 playable) keeps everything when the
 * Grade 1 course arrives. The same database is opened first by the old content and then by the real content.
 */
describe("a learner from the Brief 04 world meets the full Grade 1 course", () => {
  async function oldLearner() {
    const db = openDb(":memory:");
    const clock = new ManualClock(new Date("2026-03-02T12:00:00Z"));
    const oldApp = createApp({ db, course: sharedCourse(), clock });
    const c = new Client(oldApp);
    await register(c, "old");
    await finishLesson(c); // L03 v2 with first-try evidence and XP
    clock.advanceDays(1);
    const rev = await c.post("/api/review/sessions");
    expect(rev.body.session).toBeTruthy(); // an open review session is left behind
    const snapshot = {
      evidence: db.prepare("SELECT id, concept_id, source, counts, correct, question_key FROM mastery_evidence ORDER BY id, concept_id").all(),
      mastery: db.prepare("SELECT concept_id, state, highest_state, next_due_date FROM concept_mastery ORDER BY concept_id").all(),
      xp: db.prepare("SELECT source_key, xp FROM xp_ledger ORDER BY source_key").all(),
      attempts: (db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n,
    };
    const newApp = createApp({ db, course: realCourse(), clock });
    const n = new Client(newApp);
    n.cookie = c.cookie;
    return { db, clock, c, n, rev, snapshot };
  }

  it("keeps the completion (flagged for review), the evidence, the mastery state and the XP untouched", async () => {
    const { db, n, snapshot } = await oldLearner();
    const prog = (await n.get("/api/progress")).body;
    expect(prog.nodes["G1-U3-L03"]!.state).toBe("completed");
    expect(prog.nodes["G1-U3-L03"].reviewAvailable).toBe(true); // content version 2 -> 3
    expect(db.prepare("SELECT id, concept_id, source, counts, correct, question_key FROM mastery_evidence ORDER BY id, concept_id").all()).toEqual(snapshot.evidence);
    expect(db.prepare("SELECT concept_id, state, highest_state, next_due_date FROM concept_mastery ORDER BY concept_id").all()).toEqual(snapshot.mastery);
    expect(db.prepare("SELECT source_key, xp FROM xp_ledger ORDER BY source_key").all()).toEqual(snapshot.xp);
    expect((db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n).toBe(snapshot.attempts);
  });

  it("serves or rebuilds the open review session without an error, and never asks about untaught material", async () => {
    const { n, rev } = await oldLearner();
    const open = await n.get(`/api/review/sessions/${rev.body.session.id}`);
    expect(open.status).toBe(200);
    const again = await n.post("/api/review/sessions");
    expect(again.status).toBe(200);
    const items = (again.body.session?.items ?? []) as Array<{ item: { prompt: string } }>;
    expect(JSON.stringify(items)).not.toMatch(/correctOptionIds|accepted/);
  });

  it("opens the earlier Grade 1 lessons, lets the grandfathered learner carry on at L04, and leaves Grades 2-5 alone", async () => {
    const { n } = await oldLearner();
    const nodes = (await n.get("/api/progress")).body.nodes as Record<string, { state: string }>;
    expect(nodes["G1-U1-L01"]!.state).toBe("available");
    expect(nodes["G1-U3-L04"]!.state).toBe("available"); // L03 stays complete, so its dependants open (documented)
    expect(nodes["G1-U3-L02"]!.state).toBe("locked");
    expect(nodes["G5-U4-L06"]!.state).toBe("available");
    expect((await n.post("/api/lessons/G1-U3-L04/start")).status).toBe(200);
  });
});
