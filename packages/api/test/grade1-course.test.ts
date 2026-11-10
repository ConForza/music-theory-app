import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
const G1 = course.nodes.filter((n) => n.grade === 1);

async function learner(waive: boolean) {
  const db = openDb(":memory:");
  const app = createApp({ db, course, waiveUnwrittenPrerequisites: waive });
  const c = new Client(app);
  const me = await register(c);
  return { db, app, c, userId: me.body.user.id as string };
}

describe("the whole of Grade 1 is playable, strict, and honest", () => {
  it("has a real learner experience for all 60 required nodes", () => {
    expect(G1).toHaveLength(60);
    const unplayable = G1.filter((n) => !course.isPlayable(n.id)).map((n) => n.id);
    expect(unplayable).toEqual([]);
    expect(G1.filter((n) => n.contentStatus === "planned")).toEqual([]);
    const count = (t: string) => G1.filter((n) => n.type === t).length;
    expect([count("lesson"), count("practice"), count("review"), count("unit_challenge"), count("grade_assessment")]).toEqual([38, 7, 7, 7, 1]);
  });

  for (const waive of [true, false]) {
    it(`can be completed from beginning to end in path order (preview waiver ${waive ? "on" : "off"}: identical, because nothing is unwritten)`, async () => {
      const { app, c, userId } = await learner(waive);
      await ensureDone(c, app, userId, "G1-A");
      // Unit challenges do not gate the path (by design), so they are played explicitly.
      for (const n of G1.filter((x) => x.type === "unit_challenge")) await ensureDone(c, app, userId, n.id);
      const prog = (await c.get("/api/progress")).body;
      const g1 = prog.grades.find((g: { grade: number }) => g.grade === 1);
      expect(g1.completedNodes).toBe(g1.requiredNodes);
      expect(g1.requiredNodes).toBe(60);
      const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
      expect(results.filter((r) => r.nodeId === "G1-A" && r.passed)).toHaveLength(1);
      expect(results.filter((r) => r.nodeId.endsWith("-C") && r.passed)).toHaveLength(7);
      const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
      expect(badges.find((b) => b.id === "g1.grade-complete")?.earned).toBe(true);
    }, 600_000);
  }

  it("does not complete the grade on XP or lessons alone: a failed assessment is recorded, earns nothing, and can be retaken", async () => {
    const { app, c, userId } = await learner(true);
    await ensureDone(c, app, userId, "G1-U7-R1");
    const before = (await c.get("/api/xp")).body.total as number;
    const failed = await playSession(c, app, userId, "G1-A", { wrong: 21 });
    expect(failed.status).toBe(200);
    expect(failed.body.passed).toBe(false);
    expect(failed.body.completedNode).toBe(false);
    expect(failed.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(0);
    const prog = (await c.get("/api/progress")).body;
    expect(prog.nodes["G1-A"].state).not.toBe("completed");
    const badge = ((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g1.grade-complete");
    expect(badge?.earned).toBe(false);
    // fresh questions on the retake, and a pass completes the grade exactly once
    const second = await playSession(c, app, userId, "G1-A");
    expect(second.body.passed).toBe(true);
    expect(second.body.rewards.xp.awarded).toBe(25);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; run: number; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G1-A").map((r) => r.passed)).toEqual([true, false]);
    expect((await c.post("/api/nodes/G1-A/complete")).body.alreadyComplete).toBe(true);
  }, 600_000);

  it("takes the first answer in a challenge as final", async () => {
    const { app, c, userId } = await learner(true);
    await ensureDone(c, app, userId, "G1-U1-R1");
    const started = (await c.post("/api/nodes/G1-U1-C/start")).body;
    expect(started.firstAttemptOnly).toBe(true);
    expect(started.disclaimer).toMatch(/not an ABRSM examination/);
    const it = app.nodes.internalItems(userId, "G1-U1-C")[0]!;
    const bad = wrongItemResponse(course, it.item, it.scope);
    expect(bad).toBeTruthy();
    expect((await c.post("/api/nodes/G1-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: bad })).status).toBe(200);
    const again = await c.post("/api/nodes/G1-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G1-U1-C", it.item, it.scope) });
    expect(again.status).toBe(409);
    expect(JSON.stringify(started)).not.toMatch(/solution/);
    expect((await c.post("/api/nodes/G1-U1-C/hint", { itemId: it.itemId, level: 1 })).status).toBe(409);
  }, 300_000);
});

describe("generated nodes only ask what has been taught", () => {
  it("every practice, review, challenge and assessment question fits the taught scope of its node, across many learners", async () => {
    const { checkItem, taughtScope } = await import("@mtp/curriculum");
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const sessionNodes = G1.filter((n) => ["practice", "review", "unit_challenge", "grade_assessment"].includes(n.type));
    const bad: string[] = [];
    for (let u = 0; u < 6; u++) {
      const id = `u${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',1,1,'{}','2026-01-01')").run(id);
      // Everything before the last node counts as done, so each node can be opened.
      for (const n of G1) db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
      for (const n of sessionNodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const items = app.nodes.internalItems(id, n.id);
        if (items.length < 4) bad.push(`${n.id} has only ${items.length} questions`);
        const taught = taughtScope(course.ix, n);
        for (const it of items) {
          checkItem(it.item, taught, it.itemId, (code, _w, msg, sev = "error") => sev === "error" && bad.push(`${n.id} ${it.itemId}: ${code} ${msg}`));
          if (!it.conceptIds.length) bad.push(`${n.id} ${it.itemId} credits no concept`);
        }
        // restore the completed row so later nodes can still be opened for this learner
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
      }
    }
    expect(bad).toEqual([]);
  }, 600_000);
});
