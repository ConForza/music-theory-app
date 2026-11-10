import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
function world(waive = true) {
  const db = openDb(":memory:");
  const app = createApp({ db, course, waiveUnwrittenPrerequisites: waive });
  return { db, app, client: () => new Client(app) };
}
async function learner(waive = true) {
  const w = world(waive);
  const c = w.client();
  const me = await register(c);
  return { ...w, c, userId: me.body.user.id as string };
}

describe("Grade 1 prerequisites are strict", () => {
  it("opens the first lesson only, and locks every later one until its prerequisite is complete, with or without the preview waiver", async () => {
    const states: Record<string, string>[] = [];
    for (const waive of [true, false]) {
      const { c } = await learner(waive);
      const p = (await c.get("/api/progress")).body.nodes;
      expect(p["G1-U1-L01"].state).toBe("available");
      expect(p["G1-U1-L02"].state).toBe("locked");
      expect(p["G1-U3-L03"].state).toBe("locked");
      expect((await c.post("/api/lessons/G1-U3-L03/start")).status).toBe(403);
      states.push(Object.fromEntries(Object.entries(p as Record<string, { state: string }>).filter(([id]) => /^G1-U[123]-/.test(id)).map(([id, v]) => [id, v.state])));
    }
    // Everything written is held to real prerequisites, so the waiver changes nothing for the written units.
    expect(states[1]).toEqual(states[0]);
  });

  it("keeps an already-open run on L03 openable (nobody loses a lesson in progress)", async () => {
    const { db, c, userId } = await learner();
    db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at) VALUES (?,?,1,1,'questions',2,'0.2.1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')").run(userId, "G1-U3-L03");
    expect((await c.get("/api/progress")).body.nodes["G1-U3-L03"].state).toBe("in_progress");
  });

  it("does not change what Grade 2-5 learners can reach", async () => {
    const { c } = await learner();
    const nodes = (await c.get("/api/progress")).body.nodes as Record<string, { state: string }>;
    const later = Object.entries(nodes).filter(([id]) => !id.startsWith("G1-"));
    expect(later.filter(([, v]) => v.state !== "coming_soon").map(([id, v]) => `${id}:${v.state}`)).toEqual(["G5-U4-L06:available"]);
  });
});

describe("practice runs (G1-U3-P1)", () => {
  it("builds questions on the server, never sends answers, and completes once with XP", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U3-L07");
    const started = (await c.post("/api/nodes/G1-U3-P1/start")).body;
    expect(started.kind).toBe("practice");
    expect(started.items.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(started)).not.toMatch(/correctOptionIds|accepted/);
    const done = await playSession(c, app, userId, "G1-U3-P1");
    expect(done.status).toBe(200);
    expect(done.body.rewards.xp.awarded).toBe(8);
    expect((await c.post("/api/nodes/G1-U3-P1/complete")).body.alreadyComplete).toBe(true);
    const xp = (await c.get("/api/xp")).body.recent.filter((r: { node_id?: string; nodeId?: string }) => (r.node_id ?? r.nodeId) === "G1-U3-P1");
    expect(xp.length).toBe(1);
  });

  it("serves hints in practice, records the answer as hinted evidence, and refuses hints elsewhere", async () => {
    const { app, db, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U3-L07");
    const s = (await c.post("/api/nodes/G1-U3-P1/start")).body;
    const first = s.items.find((i: { item: { hintCount: number } }) => i.item.hintCount > 0).item;
    expect((await c.post("/api/nodes/G1-U3-P1/hint", { itemId: first.id, level: 1 })).status).toBe(200);
    const internal = app.nodes.internalItems(userId, "G1-U3-P1").find((i) => i.itemId === first.id)!;
    await c.post("/api/nodes/G1-U3-P1/attempts", { attemptId: crypto.randomUUID(), itemId: first.id, response: responseFor(course, "G1-U3-P1", internal.item, internal.scope) });
    const rows = db.prepare("SELECT source, counts FROM mastery_evidence WHERE user_id = ? AND node_id = 'G1-U3-P1' AND item_id = ?").all(userId, first.id) as Array<{ source: string; counts: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source === "hinted-step" && r.counts === 0)).toBe(true);
  });

  it("credits a question only to the concepts whose boundary it sits inside", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U3-L07");
    await c.post("/api/nodes/G1-U3-P1/start");
    for (const it of app.nodes.internalItems(userId, "G1-U3-P1")) {
      if (it.item.music?.clef === "bass") expect(it.conceptIds).not.toContain("c.clefs.treble-lines");
      if (it.item.music?.clef === "treble") expect(it.conceptIds).not.toContain("c.clefs.bass");
    }
  });

  it("refuses the same attempt id for a different answer and replays an identical one", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U3-L07");
    await c.post("/api/nodes/G1-U3-P1/start");
    const it = app.nodes.internalItems(userId, "G1-U3-P1")[0]!;
    const good = responseFor(course, "G1-U3-P1", it.item, it.scope);
    const bad = wrongItemResponse(course, it.item, it.scope);
    const id = crypto.randomUUID();
    expect((await c.post("/api/nodes/G1-U3-P1/attempts", { attemptId: id, itemId: it.itemId, response: good })).status).toBe(200);
    expect((await c.post("/api/nodes/G1-U3-P1/attempts", { attemptId: id, itemId: it.itemId, response: good })).body.replayed).toBe(true);
    if (bad) expect((await c.post("/api/nodes/G1-U3-P1/attempts", { attemptId: id, itemId: it.itemId, response: bad })).status).toBe(409);
  });

  it("is reachable only after the unit's lessons, and is isolated per learner", async () => {
    const a = await learner();
    expect((await a.c.post("/api/nodes/G1-U3-P1/start")).status).toBe(403);
    expect((await a.c.post("/api/nodes/G1-U3-L01/start")).status).toBe(409); // a lesson is not a session
  });
});
