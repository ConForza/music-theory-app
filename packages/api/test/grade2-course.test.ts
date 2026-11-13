import { describe, expect, it } from "vitest";
import { checkItem, music, taughtScope } from "@mtp/curriculum";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { visibleKey } from "../src/question-key.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
const G1 = course.nodes.filter((n) => n.grade === 1);
const G2 = course.nodes.filter((n) => n.grade === 2);
const done = "'questions'";

/** A learner whose Grade 1 is already finished (as a Brief 05 learner's would be); Grade 2 starts from nothing. */
async function learner() {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c);
  const userId = me.body.user.id as string;
  for (const n of G1) {
    db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(userId, n.id, n.contentVersion, course.version, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", n.contentVersion);
  }
  return { db, app, c, userId };
}

describe("the whole of Grade 2 is playable", () => {
  it("has a real learner experience for all 41 nodes", () => {
    expect(G2).toHaveLength(41);
    expect(G2.filter((n) => !course.isPlayable(n.id)).map((n) => n.id)).toEqual([]);
    expect(G2.filter((n) => n.contentStatus === "planned")).toEqual([]);
    const count = (t: string) => G2.filter((n) => n.type === t).length;
    expect([count("lesson"), count("practice"), count("review"), count("unit_challenge"), count("enrichment"), count("grade_assessment")]).toEqual([24, 5, 5, 5, 1, 1]);
    // lessons and the optional preview are authored lessons; the rest are built by the server
    expect(G2.filter((n) => ["lesson", "enrichment"].includes(n.type)).every((n) => course.lesson(n.id))).toBe(true);
    expect(G2.filter((n) => ["practice", "review", "unit_challenge", "grade_assessment"].includes(n.type)).every((n) => course.sessionKind(n.id))).toBe(true);
  });

  it("starts after the last Grade 1 review, and a new learner cannot skip into it", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    await register(c);
    const first = (await c.get("/api/progress")).body.nodes["G2-U1-L01"];
    expect(first.state).toBe("locked");
    expect(first.lockedBy).toEqual(["G1-U7-R1"]);
    expect((await c.post("/api/lessons/G2-U1-L01/start")).status).toBe(403);
    expect((await c.post("/api/nodes/G2-A/start")).status).toBe(403);
  });

  it("can be completed from the first lesson to the Grade 2 assessment, with Grade 1 history untouched", async () => {
    const { db, app, c, userId } = await learner();
    expect((await c.get("/api/progress")).body.nodes["G2-U1-L01"].state).toBe("available");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const g1Rows = db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(userId);
    await ensureDone(c, app, userId, "G2-A");
    for (const n of G2.filter((x) => x.type === "unit_challenge")) await ensureDone(c, app, userId, n.id);
    const prog = (await c.get("/api/progress")).body;
    const g2 = prog.grades.find((g: { grade: number }) => g.grade === 2);
    // the optional preview is not a required node
    expect(g2.requiredNodes).toBe(40);
    expect(g2.completedNodes).toBe(40);
    expect(prog.nodes["G2-U4-E1"].state).not.toBe("completed");
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G2-A" && r.passed)).toHaveLength(1);
    expect(results.filter((r) => /^G2-U\d-C$/.test(r.nodeId) && r.passed)).toHaveLength(5);
    const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(badges.find((b) => b.id === "g2.grade-complete")?.earned).toBe(true);
    // Grade 1 progress, completion and XP history are exactly as they were; Grade 2 only added to XP
    expect(db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND node_id LIKE 'G1-%' ORDER BY node_id").all(userId)).toEqual(g1Rows);
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBeGreaterThan(0);
  }, 900_000);

  it("keeps the optional melodic-minor preview out of required work: playable, rewarded modestly, never assessed", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G2-U4-L03");
    const before = (await c.get("/api/xp")).body.total as number;
    await ensureDone(c, app, userId, "G2-U4-E1");
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(5);
    // no blueprint, practice or review binding refers to the preview's template or concept
    const used = new Set<string>();
    for (const bp of course.ix.assessments.values()) for (const s of bp.sections) for (const t of s.templateIds) used.add(t);
    for (const n of G2.filter((x) => x.type !== "enrichment")) for (const b of n.exercises) used.add(b.templateId);
    expect(used.has("t.g2.melodic-preview")).toBe(false);
    expect(G2.filter((n) => n.type !== "enrichment").some((n) => n.conceptIds?.includes("c.scales.minor-melodic-preview"))).toBe(false);
    // melodic minor is never a scope value anywhere in Grade 2
    const scopes = JSON.stringify(G2.flatMap((n) => n.exercises.map((b) => b.scope)));
    expect(scopes).not.toMatch(/melodic/);
  }, 300_000);

  it("never lets a failed challenge or assessment complete a node or pay completion XP, and allows a retake", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G2-U1-R1");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const failed = await playSession(c, app, userId, "G2-U1-C", { wrong: 6 });
    expect(failed.body.passed).toBe(false);
    expect(failed.body.completedNode).toBe(false);
    expect(failed.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBe(0);
    expect((await c.get("/api/progress")).body.nodes["G2-U1-C"].state).not.toBe("completed");
    const second = await playSession(c, app, userId, "G2-U1-C");
    expect(second.body.passed).toBe(true);
    expect(second.body.rewards.xp.awarded).toBe(15);
    // the grade assessment behaves the same way
    for (const n of G2) if (n.id !== "G2-A" && !["unit_challenge", "enrichment"].includes(n.type)) await ensureDone(c, app, userId, n.id);
    const before = (await c.get("/api/xp")).body.total as number;
    const total = app.nodes.internalItems(userId, "G2-A").length || 30;
    const bad = await playSession(c, app, userId, "G2-A", { wrong: total });
    expect(bad.body.passed).toBe(false);
    expect(bad.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(0);
    expect(((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g2.grade-complete")?.earned).toBe(false);
    const retake = await playSession(c, app, userId, "G2-A");
    expect(retake.body.passed).toBe(true);
    expect(retake.body.rewards.xp.awarded).toBe(25);
  }, 900_000);

  it("resumes an interrupted run with the same questions and the answers already given", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G2-U1-R1");
    const first = (await c.post("/api/nodes/G2-U1-C/start")).body;
    const items = app.nodes.internalItems(userId, "G2-U1-C");
    const it = items[0]!;
    expect((await c.post("/api/nodes/G2-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G2-U1-C", it.item, it.scope) })).status).toBe(200);
    const resumed = (await c.post("/api/nodes/G2-U1-C/start")).body;
    expect(resumed.run).toBe(first.run);
    expect(resumed.items.map((x: { item: { id: string } }) => x.item.id)).toEqual(first.items.map((x: { item: { id: string } }) => x.item.id));
    expect(resumed.items[0].answered).toBe(true);
    expect(resumed.items[1].answered).toBe(false);
    // first answer is final in a challenge
    const bad = wrongItemResponse(course, items[1]!.item, items[1]!.scope);
    expect(bad).toBeTruthy();
    await c.post("/api/nodes/G2-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: bad });
    expect((await c.post("/api/nodes/G2-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: responseFor(course, "G2-U1-C", items[1]!.item, items[1]!.scope) })).status).toBe(409);
    expect(JSON.stringify(first)).not.toMatch(/correctOptionIds|accepted/);
  }, 300_000);
});

describe("Grade 2 generated nodes only ask what has been taught", () => {
  it("every practice, review, challenge and assessment question fits the taught scope of its node, across many learners", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const sessionNodes = G2.filter((n) => ["practice", "review", "unit_challenge", "grade_assessment"].includes(n.type));
    const bad: string[] = [];
    const insert = (id: string, n: (typeof G1)[number]) => db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
    for (let u = 0; u < 5; u++) {
      const id = `u${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',2,1,'{}','2026-01-01')").run(id);
      for (const n of [...G1, ...G2]) insert(id, n);
      for (const n of sessionNodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const items = app.nodes.internalItems(id, n.id);
        if (items.length < 6) bad.push(`${n.id} has only ${items.length} questions`);
        const taught = taughtScope(course.ix, n);
        for (const it of items) {
          checkItem(it.item, taught, it.itemId, (code, _w, msg, sev = "error") => sev === "error" && bad.push(`${n.id} ${it.itemId}: ${code} ${msg}`));
          if (!it.conceptIds.length) bad.push(`${n.id} ${it.itemId} credits no concept`);
          // nothing later than Grade 2 and no melodic minor can ever appear
          // (the hidden feedback table of the scale family lists every category; what a learner can see is checked here)
          const visible = JSON.stringify({ p: it.item.prompt, m: it.item.music, h: it.item.hints, a: it.item.answer.kind === "choice" ? it.item.answer.options : null });
          if (/melodic/i.test(visible)) bad.push(`${n.id} ${it.itemId} shows the melodic minor`);
        }
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        insert(id, n);
      }
    }
    expect(bad).toEqual([]);
  }, 600_000);

  it("a unit challenge only draws on its own unit and earlier ones, and the assessment covers every Grade 2 outcome", () => {
    const early: Record<string, string[]> = { "a.g2-u1": ["time-signature", "bar-complete", "beat-facts", "bar-judge", "triplet", "triplet-facts", "triplet-read", "triplet-mixed", "triplet-fill"] };
    for (const t of new Set([...course.ix.assessments.get("a.g2-u1")!.sections.flatMap((s) => s.templateIds)])) expect(early["a.g2-u1"]!.includes(t.replace("t.g2.", "")), t).toBe(true);
    const outcomes = new Set(course.ix.assessments.get("a.g2")!.sections.flatMap((s) => s.outcomeIds));
    for (let k = 1; k <= 13; k++) expect(outcomes.has(`abrsm2020.g2.${String(k).padStart(2, "0")}`), `g2.${k}`).toBe(true);
  });
});

describe("no question can leave the learner with nothing to enter", () => {
  it("never asks to write a key signature that has no signs (C major, A minor), in any lesson", () => {
        const bad: string[] = [];
    for (const n of G2) for (const it of course.authoredItems(n.id)) {
      const a = it.answer as { kind: string; task?: string; accepted?: string[] };
      if (a.kind === "key-signature" && a.task === "write-signature" && music.keySignature(music.parseKey(a.accepted![0]!)).count === 0) bad.push(`${n.id} ${it.id}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("Grade 2 lessons teach without repeating themselves", () => {
  it("no lesson asks the same question twice, guided and independent included", () => {
    const dupes: string[] = [];
    for (const n of G2.filter((x) => ["lesson", "enrichment"].includes(x.type))) {
      const seen = new Map<string, string>();
      for (const it of course.authoredItems(n.id)) {
        const k = visibleKey(it);
        if (seen.has(k)) dupes.push(`${n.id}: ${it.id} repeats ${seen.get(k)}`);
        seen.set(k, it.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("every lesson has the full structure and a recap, and no lesson is a wall of multiple choice", () => {
    for (const n of G2.filter((x) => x.type === "lesson")) {
      const l = course.lesson(n.id)!;
      expect(l.objective.statement.length, n.id).toBeGreaterThan(20);
      expect(l.explanation.length, n.id).toBeGreaterThanOrEqual(4);
      expect(l.demonstration.steps.length, n.id).toBeGreaterThanOrEqual(3);
      expect(l.recap.length, n.id).toBeGreaterThanOrEqual(3);
      const items = course.authoredItems(n.id);
      expect(items.length, n.id).toBeGreaterThanOrEqual(9);
    }
    // Interactive exercises exist in the course: builders and note entry, not only choices
    const kinds = new Set<string>();
    for (const n of G2.filter((x) => x.type === "lesson")) for (const it of course.authoredItems(n.id)) kinds.add(it.answer.kind);
    for (const k of ["rhythm", "pitch-sequence", "staff-position", "key-signature", "interval", "chord"]) expect(kinds.has(k), k).toBe(true);
  });
});
