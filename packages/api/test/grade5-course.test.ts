import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkItem, effectiveScope, music, taughtScope } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { loadConstraints, questionKey, satisfies, visibleKey } from "../src/question-key.ts";
import { MasteryService, recordExposure } from "../src/mastery-service.ts";
import { ManualClock } from "../src/clock.ts";
import { rulesFrom } from "../src/mastery.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
const EARLIER = course.nodes.filter((n) => n.grade <= 4);
const G5 = course.nodes.filter((n) => n.grade === 5);
const done = "'questions'";
const SESSION = ["practice", "review", "unit_challenge", "grade_assessment"];

const insert = (db: ReturnType<typeof openDb>, id: string, n: (typeof EARLIER)[number]) =>
  db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);

/** A learner whose Grades 1-4 are already finished (as a Brief 08 learner's would be); Grade 5 starts from nothing. */
async function learner() {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c);
  const userId = me.body.user.id as string;
  for (const n of EARLIER) insert(db, userId, n);
  return { db, app, c, userId };
}

describe("the whole of Grade 5 is playable", () => {
  it("has a real learner experience for all 44 nodes (41 required, 3 optional)", () => {
    expect(G5).toHaveLength(44);
    expect(G5.filter((n) => !course.isPlayable(n.id)).map((n) => n.id)).toEqual([]);
    expect(G5.filter((n) => n.contentStatus === "planned")).toEqual([]);
    const count = (t: string) => G5.filter((n) => n.type === t).length;
    expect([count("lesson"), count("practice"), count("review"), count("unit_challenge"), count("grade_assessment"), count("enrichment")]).toEqual([25, 5, 5, 5, 1, 3]);
    expect(G5.filter((n) => n.type === "lesson").every((n) => course.lesson(n.id))).toBe(true);
    expect(G5.filter((n) => SESSION.includes(n.type)).every((n) => course.sessionKind(n.id))).toBe(true);
    // exactly the three enrichment nodes are optional; the other 41 are required
    expect(G5.filter((n) => n.optional).map((n) => n.id).sort()).toEqual(["G5-U4-E1", "G5-U4-E2", "G5-U5-E1"]);
    expect(G5.filter((n) => !n.optional)).toHaveLength(41);
  });

  it("starts after the last Grade 3 review (the established prerequisite policy), and a new learner cannot skip into it", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    await register(c);
    const first = (await c.get("/api/progress")).body.nodes["G5-U1-L01"];
    expect(first.state).toBe("locked");
    expect(first.lockedBy).toEqual(["G4-U5-R1"]);
    expect((await c.post("/api/lessons/G5-U1-L01/start")).status).toBe(403);
    expect((await c.post("/api/nodes/G5-A/start")).status).toBe(403);
  });

  it("can be completed from the first lesson to the Grade 5 assessment, with Grade 1-3 history untouched", async () => {
    const { db, app, c, userId } = await learner();
    expect((await c.get("/api/progress")).body.nodes["G5-U1-L01"].state).toBe("available");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const earlierRows = db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(userId);
    await ensureDone(c, app, userId, "G5-A");
    for (const n of G5.filter((x) => x.type === "unit_challenge")) await ensureDone(c, app, userId, n.id);
    const prog = (await c.get("/api/progress")).body;
    const g5 = prog.grades.find((g: { grade: number }) => g.grade === 5);
    expect(g5.requiredNodes).toBe(41);
    expect(g5.completedNodes).toBe(41);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G5-A" && r.passed)).toHaveLength(1);
    expect(results.filter((r) => /^G5-U\d-C$/.test(r.nodeId) && r.passed)).toHaveLength(5);
    const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(badges.find((b) => b.id === "g5.grade-complete")?.earned).toBe(true);
    expect(db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND (node_id LIKE 'G1-%' OR node_id LIKE 'G2-%' OR node_id LIKE 'G3-%' OR node_id LIKE 'G4-%') ORDER BY node_id").all(userId)).toEqual(earlierRows);
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBeGreaterThan(0);
  }, 1_800_000);

  it("never lets a failed challenge or assessment complete a node or pay completion XP, and allows a retake", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G5-U1-R1");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const failed = await playSession(c, app, userId, "G5-U1-C", { wrong: 6 });
    expect(failed.body.passed).toBe(false);
    expect(failed.body.completedNode).toBe(false);
    expect(failed.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBe(0);
    expect((await c.get("/api/progress")).body.nodes["G5-U1-C"].state).not.toBe("completed");
    const second = await playSession(c, app, userId, "G5-U1-C");
    expect(second.body.passed).toBe(true);
    expect(second.body.rewards.xp.awarded).toBe(15);
    for (const n of G5) if (n.id !== "G5-A" && n.type !== "unit_challenge") await ensureDone(c, app, userId, n.id);
    const before = (await c.get("/api/xp")).body.total as number;
    const bad = await playSession(c, app, userId, "G5-A", { wrong: 39 });
    expect(bad.body.passed).toBe(false);
    expect(bad.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(0);
    expect(((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g5.grade-complete")?.earned).toBe(false);
    const retake = await playSession(c, app, userId, "G5-A");
    expect(retake.body.passed).toBe(true);
    expect(retake.body.rewards.xp.awarded).toBe(25);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G5-A").map((r) => r.passed).sort()).toEqual([false, true]);
  }, 1_800_000);

  it("a learner who knows only the seven earlier-grade questions cannot pass the Grade 5 assessment", async () => {
    const { app, c, userId, db } = await learner();
    for (const n of G5) if (n.id !== "G5-A") insert(db, userId, n);
    const start = (await c.post("/api/nodes/G5-A/start")).body;
    expect(start.items).toHaveLength(39);
    const planned = app.nodes.internalItems(userId, "G5-A");
    const earlier = planned.filter((p) => /^t\.g4\./.test(p.item.templateId));
    expect(earlier).toHaveLength(7);
    // answer exactly the earlier-grade questions right and everything else wrong
    for (const p of planned) {
      const right = /^t\.g4\./.test(p.item.templateId);
      const response = right ? responseFor(course, "G5-A", p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
      await c.post("/api/nodes/G5-A/attempts", { attemptId: crypto.randomUUID(), itemId: p.itemId, response: response ?? responseFor(course, "G5-A", p.item, p.scope) });
    }
    const fin = await c.post("/api/nodes/G5-A/complete");
    expect(fin.body.passed).toBe(false);
  }, 600_000);

  it("review P1-2: on the full 39-question assessment 25 right fails with no completion XP or badge, and 26 right passes and awards completion exactly once", async () => {
    for (const rightCount of [25, 26]) {
      const { app, c, userId, db } = await learner();
      for (const n of G5) if (n.id !== "G5-A") insert(db, userId, n);
      const start = (await c.post("/api/nodes/G5-A/start")).body;
      expect(start.items).toHaveLength(39);
      const planned = app.nodes.internalItems(userId, "G5-A");
      const xp0 = (await c.get("/api/xp")).body.total as number;
      let given = 0;
      for (const [i, p] of planned.entries()) {
        const wantRight = i < rightCount;
        const response = wantRight ? responseFor(course, "G5-A", p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
        expect(response, `question ${i + 1} can be answered ${wantRight ? "right" : "wrong"}`).toBeTruthy();
        const r = await c.post("/api/nodes/G5-A/attempts", { attemptId: crypto.randomUUID(), itemId: p.itemId, response });
        if (wantRight) expect(r.body.correct, `question ${i + 1}`).toBe(true);
        else expect(r.body.correct, `question ${i + 1}`).toBe(false);
        given++;
      }
      expect(given).toBe(39);
      const fin = await c.post("/api/nodes/G5-A/complete");
      const badge = async () => ((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g5.grade-complete")?.earned;
      const xpNow = async () => (await c.get("/api/xp")).body.total as number;
      if (rightCount === 25) {
        expect(fin.body.passed).toBe(false);
        expect(fin.body.completedNode).toBe(false);
        expect(fin.body.rewards).toBeUndefined();
        expect((await xpNow()) - xp0).toBe(0);
        expect(await badge()).toBe(false);
        expect((await c.get("/api/progress")).body.nodes["G5-A"].state).not.toBe("completed");
      } else {
        expect(fin.body.passed).toBe(true);
        expect(fin.body.rewards.xp.awarded).toBe(25);
        const after = await xpNow();
        expect(after - xp0).toBeGreaterThanOrEqual(25);
        expect(await badge()).toBe(true);
        // completing again pays nothing more
        // (a repeated completion replays the stored result; the XP total must not move)
        await c.post("/api/nodes/G5-A/complete");
        expect(await xpNow()).toBe(after);
        expect((await c.get("/api/results")).body.results.filter((r: { nodeId: string; passed: boolean }) => r.nodeId === "G5-A" && r.passed)).toHaveLength(1);
      }
    }
  }, 1_200_000);

  it("review: the exact-ratio threshold applies from Grade 4 onwards; the Grade 3 assessment keeps its released rule (21 of 32 passes, 20 of 32 fails)", async () => {
    for (const rightCount of [21, 20]) {
      const { app, c, userId, db } = await learner();
      db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = 'G3-A'").run(userId);
      const start = (await c.post("/api/nodes/G3-A/start")).body;
      expect(start.items).toHaveLength(32);
      const planned = app.nodes.internalItems(userId, "G3-A");
      for (const [i, p] of planned.entries()) {
        const response = i < rightCount ? responseFor(course, "G3-A", p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
        expect(response).toBeTruthy();
        const r = await c.post("/api/nodes/G3-A/attempts", { attemptId: crypto.randomUUID(), itemId: p.itemId, response });
        expect(r.body.correct, `question ${i + 1}`).toBe(i < rightCount);
      }
      const fin = await c.post("/api/nodes/G3-A/complete");
      expect(fin.body.passed, `${rightCount}/32`).toBe(rightCount === 21);
    }
  }, 600_000);

  it("resumes an interrupted run with the same questions and the answers already given", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G5-U1-R1");
    const first = (await c.post("/api/nodes/G5-U1-C/start")).body;
    const items = app.nodes.internalItems(userId, "G5-U1-C");
    const it = items[0]!;
    expect((await c.post("/api/nodes/G5-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G5-U1-C", it.item, it.scope) })).status).toBe(200);
    const resumed = (await c.post("/api/nodes/G5-U1-C/start")).body;
    expect(resumed.run).toBe(first.run);
    expect(resumed.items.map((x: { item: { id: string } }) => x.item.id)).toEqual(first.items.map((x: { item: { id: string } }) => x.item.id));
    expect(resumed.items[0].answered).toBe(true);
    expect(resumed.items[1].answered).toBe(false);
    const bad = wrongItemResponse(course, items[1]!.item, items[1]!.scope);
    expect(bad).toBeTruthy();
    await c.post("/api/nodes/G5-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: bad });
    expect((await c.post("/api/nodes/G5-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: responseFor(course, "G5-U1-C", items[1]!.item, items[1]!.scope) })).status).toBe(409);
    expect(JSON.stringify(first)).not.toMatch(/correctOptionIds|accepted/);
  }, 300_000);
});

/** Words that belong to a later unit: a node of unit k never shows those of units k+1.. (the learner would meet an untaught idea). */
const U5 = /\b(trill|mordent|acciaccatura|appoggiatura|soprano|mezzo|baritone|piccolo|bass clarinet|double bassoon|tam-tam|glockenspiel|attacca|dolente|lacrimoso|piangevole|volante|tosto)\b/i;
const U4 = /\b(inversion|supertonic|cadence|plagal)\b|chord ii|6\/3|6\/4/i;
const U3 = /chromatic|compound|concert pitch|written pitch|clarinet in|horn in|trumpet in|F♯ major|G♭ major|D♯ minor|E♭ minor/i;
const U2 = /tenor|same pitch|an octave (higher|lower)|exactly one octave/i;
const LATER: Record<number, RegExp> = {
  1: new RegExp([U2, U3, U4, U5].map((r) => r.source).join("|"), "i"),
  2: new RegExp([U3, U4, U5].map((r) => r.source).join("|"), "i"),
  3: new RegExp([U4, U5].map((r) => r.source).join("|"), "i"),
  4: U5,
};

describe("Grade 5 generated nodes only ask what has been taught", () => {
  it("every practice, review and challenge question fits the taught scope of its node, credits a concept, and shows nothing from a later unit", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const sessionNodes = G5.filter((n) => SESSION.includes(n.type) && n.type !== "grade_assessment");
    const bad: string[] = [];
    for (let u = 0; u < 3; u++) {
      const id = `u${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',5,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G5]) insert(db, id, n);
      for (const n of sessionNodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const items = app.nodes.internalItems(id, n.id);
        if (items.length < 6) bad.push(`${n.id} has only ${items.length} questions`);
        const taught = taughtScope(course.ix, n);
        const unit = n.unitId ? Number(/G5-U(\d)/.exec(n.unitId)![1]) : 5;
        for (const it of items) {
          checkItem(it.item, taught, it.itemId, (code, _w, msg, sev = "error") => sev === "error" && bad.push(`${n.id} ${it.itemId}: ${code} ${msg}`));
          if (!it.conceptIds.length) bad.push(`${n.id} ${it.itemId} credits no concept`);
          // Grade 3 foundation questions in the first review are earlier-grade material and use earlier-grade words
          if (it.item.templateId.startsWith("t.g5.") && LATER[unit]) {
            const visible = JSON.stringify({ p: it.item.prompt, m: it.item.music?.textAlternative, h: it.item.hints, a: it.item.answer.kind === "choice" ? it.item.answer.options : null });
            if (LATER[unit]!.test(visible)) bad.push(`${n.id} ${it.itemId} shows a later unit's idea: ${LATER[unit]!.exec(visible)![0]}`);
          }
        }
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        insert(db, id, n);
      }
    }
    expect(bad).toEqual([]);
  }, 1_800_000);

  it("a unit challenge only draws on its own unit and earlier ones; the blueprint shapes are exact and section ids unique", () => {
    const firstUnit = new Map<string, number>();
    for (const n of G5.filter((x) => x.type === "lesson")) for (const b of n.exercises) if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, Number(/G5-U(\d)/.exec(n.unitId!)![1]));
    for (let u = 1; u <= 5; u++) for (const t of new Set(course.ix.assessments.get(`a.g5-u${u}`)!.sections.flatMap((s) => s.templateIds))) expect(firstUnit.get(t)!, `a.g5-u${u} ${t}`).toBeLessThanOrEqual(u);
    const sizes: Record<string, number> = { "a.g5-u1": 6, "a.g5-u2": 6, "a.g5-u3": 8, "a.g5-u4": 6, "a.g5-u5": 12, "a.g5": 39 };
    for (const [id, n] of Object.entries(sizes)) {
      const bp = course.ix.assessments.get(id)!;
      expect(bp.sections.reduce((t, s) => t + s.itemCount, 0), id).toBe(n);
      expect(new Set(bp.sections.map((s) => s.id)).size, `${id} section ids are unique`).toBe(bp.sections.length);
      expect(bp.hintsAllowed).toBe(false);
    }
    const bp = course.ix.assessments.get("a.g5")!;
    const per = new Map<string, number>();
    for (const s of bp.sections) for (const o of s.outcomeIds) per.set(o, (per.get(o) ?? 0) + s.itemCount);
    for (let k = 1; k <= 16; k++) expect(per.get(`abrsm2020.g5.${String(k).padStart(2, "0")}`) ?? 0, `g5.${k}`).toBeGreaterThanOrEqual(2);
    // seven earlier-grade questions: every template is a Grade 4 template, so they cannot be mistaken for Grade 5 evidence
    const earlier = bp.sections.find((s) => s.id === "earlier-grades")!;
    expect(earlier.itemCount).toBe(7);
    expect(earlier.templateIds.every((t) => /^t\.g4\./.test(t))).toBe(true);
    expect(bp.sections.filter((s) => s.id !== "earlier-grades").reduce((n, s) => n + s.itemCount, 0)).toBe(32);
  });

  it("each generated grade assessment is independent of hints, exactly 39 questions with 32 Grade 5 and 7 earlier, and credits the 16 Grade 5 outcomes across runs", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const outcomes = new Set<string>();
    for (let u = 0; u < 6; u++) {
      const id = `a${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',5,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G5]) if (n.id !== "G5-A") insert(db, id, n);
      app.nodes.start(id, "G5-A");
      const items = app.nodes.internalItems(id, "G5-A");
      expect(items.length).toBe(39);
      expect(items.filter((i) => /^t\.g5\./.test(i.item.templateId)).length).toBe(32);
      expect(items.filter((i) => /^t\.g4\./.test(i.item.templateId)).length).toBe(7);
      expect(new Set(items.map((i) => visibleKey(i.item))).size).toBe(items.length);
      for (const it of items) {
        expect(it.item.evidence).toBe("independent");
        for (const c of it.conceptIds) for (const o of course.ix.concepts.get(c)?.outcomeIds ?? []) outcomes.add(o);
      }
      // every Grade 5 outcome has two questions in this very run (the blueprint), each drawn from templates that evidence it
      const run = items.filter((i) => /^t\.g5\./.test(i.item.templateId));
      const byOutcome = new Map<string, number>();
      for (const i of run) for (const o of course.ix.templates.get(i.item.templateId)!.outcomeIds) byOutcome.set(o, (byOutcome.get(o) ?? 0) + 1);
      for (let k = 1; k <= 16; k++) expect(byOutcome.get(`abrsm2020.g5.${String(k).padStart(2, "0")}`) ?? 0, `learner ${u}: g5.${k}`).toBeGreaterThanOrEqual(2);
    }
    for (let k = 1; k <= 16; k++) expect(outcomes.has(`abrsm2020.g5.${String(k).padStart(2, "0")}`), `g5.${k}`).toBe(true);
  }, 900_000);
});

describe("review P1-1: the same Grade 5 question in another seed is not fresh evidence", () => {
  const sample = (node: string, tpl: string, from: number, to: number) => {
    const n = course.ix.nodeById.get(node)!;
    const b = n.exercises.find((x) => x.templateId === tpl)!;
    const scope = effectiveScope(course.ix, n, b);
    const out: ReturnType<typeof generateItem>["item"][] = [];
    for (let s = from; s <= to; s++) { try { out.push(generateItem(course.ix, tpl, s, { scope }).item); } catch { /* skipped */ } }
    return out;
  };
  /** Two different seeds that ask the very same question (found by search, not assumed). */
  const twins = (node: string, tpl: string) => {
    const seen = new Map<string, ReturnType<typeof generateItem>["item"]>();
    for (const it of sample(node, tpl, 1, 400)) {
      const k = questionKey(it);
      const prev = seen.get(k);
      if (prev && prev.id !== it.id) return [prev, it] as const;
      seen.set(k, it);
    }
    return null;
  };
  it("for facts and construction templates alike, equal question keys also share one visible key", () => {
    for (const [node, tpl] of [["G5-U1-L01", "t.g5.metre-facts"], ["G5-U4-L01", "t.g5.chord-build"], ["G5-U3-L05", "t.g5.concert-facts"]] as const) {
      const pair = twins(node, tpl);
      expect(pair, `${tpl} has a repeated question within 400 seeds`).toBeTruthy();
      const [a, b] = pair!;
      expect(a.id).not.toBe(b.id);
      expect(questionKey(a)).toBe(questionKey(b));
      expect(visibleKey(a)).toBe(visibleKey(b));
    }
  });
  it("a second sighting through the real mastery service is not fresh", () => {
    const db = openDb(":memory:");
    const svc = new MasteryService(db, course, new ManualClock(new Date("2026-03-02T10:00:00.000Z")), rulesFrom(course.ix.c.policy));
    const [a, b] = twins("G5-U1-L01", "t.g5.metre-facts")!;
    db.prepare("INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at) VALUES ('u1','U',1,'2026-03-02T10:00:00.000Z','2026-03-02T10:00:00.000Z')").run();
    expect(svc.isFresh("u1", questionKey(a))).toBe(true);
    recordExposure(db, "u1", questionKey(a), "practice-attempt", "2026-03-02T10:00:00.000Z");
    expect(svc.isFresh("u1", questionKey(b))).toBe(false);
  });
});

describe("Grade 5 lessons teach without repeating themselves", () => {
  it("no lesson asks the same question twice, guided and independent included", () => {
    const dupes: string[] = [];
    for (const n of G5.filter((x) => x.type === "lesson")) {
      const seen = new Map<string, string>();
      for (const it of course.authoredItems(n.id)) {
        const k = visibleKey(it);
        if (seen.has(k)) dupes.push(`${n.id}: ${it.id} repeats ${seen.get(k)}`);
        seen.set(k, it.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("every lesson has the full structure (objective, explanation, demonstration, 3 guided, 6 independent, recap, review) and the course has builders, not only choices", () => {
    for (const n of G5.filter((x) => x.type === "lesson")) {
      const l = course.lesson(n.id)!;
      expect(l.objective.statement.length, n.id).toBeGreaterThan(20);
      expect(l.objective.successCriteria.length, n.id).toBeGreaterThanOrEqual(3);
      expect(l.explanation.length, n.id).toBeGreaterThanOrEqual(4);
      expect(l.explanation.some((b) => b.kind === "notation"), `${n.id} shows notation`).toBe(true);
      expect(l.demonstration.steps.length, n.id).toBeGreaterThanOrEqual(3);
      expect(l.items.filter((i) => i.section === "guided").length, n.id).toBe(3);
      expect(l.items.filter((i) => i.section === "independent").length, n.id).toBe(6);
      expect(l.recap.length, n.id).toBe(3);
      const raw = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), `../../../content/lessons/${n.id}.json`), "utf8")) as { spacedReview: unknown[]; provenance: { notes: string; bookSectionIds: string[] } };
      expect(raw.spacedReview.length, n.id).toBe(3);
      expect(raw.provenance.notes.length, n.id).toBeGreaterThan(80);
      expect(raw.provenance.bookSectionIds.length, n.id).toBeGreaterThan(0);
    }
    const kinds = new Set<string>();
    for (const n of G5.filter((x) => x.type === "lesson")) for (const it of course.authoredItems(n.id)) kinds.add(it.answer.kind);
    for (const k of ["rhythm", "pitch-sequence", "staff-position", "key-signature", "interval", "chord", "composite", "pitch", "time-signature", "choice"]) expect(kinds.has(k), k).toBe(true);
  });

  it("every question with notation carries a text description, and descriptions only mention signs that are printed", () => {
    const bad: string[] = [];
    for (const n of G5.filter((x) => x.type === "lesson")) {
      for (const it of course.authoredItems(n.id)) {
        const frs = it.score ? it.score.staves.map((s) => s.music) : it.music ? [it.music] : [];
        for (const f of frs) {
          if (!f.textAlternative || f.textAlternative.length < 8) bad.push(`${n.id} ${it.id} has no text alternative`);
          if (f.presentation !== "stave") continue;
          // a sign is described only if printed: count "with a ... sign" in the description against the printed accidentals
          const printed = f.measures.flatMap((m) => m.events ?? []).flatMap((e) => (e.kind === "note" ? [e.writtenAccidental] : e.kind === "chord" ? e.notes.map((x) => x.writtenAccidental) : [])).filter(Boolean).length;
          const said = (f.textAlternative.match(/(sharp|flat|natural|double sharp|double flat) sign/g) ?? []).length;
          if (/^(A|An) .*-clef stave/.test(f.textAlternative) === false && said !== printed && (it.music?.questionAlternative ?? "") === "") bad.push(`${n.id} ${it.id}: ${said} signs described, ${printed} printed`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("Grade 5 authoring is idempotent", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
  const files = () => ["path/grade-5.json", "assessments/grade-5.json", ...readdirSync(join(root, "lessons")).filter((f) => f.startsWith("G5-")).map((f) => `lessons/${f}`)];
  const digest = () => createHash("sha256").update(files().map((f) => `${f}\n${readFileSync(join(root, f), "utf8")}`).join("\n")).digest("hex");

  it("running the authoring script again changes nothing: no appended sections, the same question counts and the same lesson files", () => {
    const script = join(dirname(fileURLToPath(import.meta.url)), "../scripts/author-grade5.ts");
    expect(existsSync(script)).toBe(true);
    const before = digest();
    
    for (let run = 0; run < 2; run++) {
      execFileSync(process.execPath, ["--import", "tsx", script], { cwd: join(dirname(script), ".."), stdio: "pipe", timeout: 600_000 });
      expect(digest(), `after run ${run + 1}`).toBe(before);
    }
    const as1 = JSON.parse(readFileSync(join(root, "assessments/grade-5.json"), "utf8")).assessments as Array<{ id: string; sections: Array<{ id: string; itemCount: number }> }>;
    for (const bp of as1) {
      expect(new Set(bp.sections.map((s) => s.id)).size, `${bp.id} section ids unique`).toBe(bp.sections.length);
      expect(bp.sections.reduce((n, s) => n + s.itemCount, 0)).toBe(({ "a.g5-u1": 6, "a.g5-u2": 6, "a.g5-u3": 8, "a.g5-u4": 6, "a.g5-u5": 12, "a.g5": 39 } as Record<string, number>)[bp.id]);
    }
  }, 1_500_000);
});

describe("compatibility: Grades 3 and 4 keep their own pass rules next to Grade 5", () => {
  it("Grade 3 keeps its released rounded rule (21 of 32 passes), Grade 4 uses the exact ratio (27 of 41 fails, 28 of 41 passes)", async () => {
    const plan: Array<[string, number, number, boolean]> = [["G3-A", 32, 21, true], ["G3-A", 32, 20, false], ["G4-A", 41, 27, false], ["G4-A", 41, 28, true]];
    for (const [node, total, rightCount, passes] of plan) {
      const { app, c, userId, db } = await learner();
      db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, node);
      const start = (await c.post(`/api/nodes/${node}/start`)).body;
      expect(start.items).toHaveLength(total);
      const planned = app.nodes.internalItems(userId, node);
      for (const [i, p] of planned.entries()) {
        const response = i < rightCount ? responseFor(course, node, p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
        expect(response).toBeTruthy();
        const r = await c.post(`/api/nodes/${node}/attempts`, { attemptId: crypto.randomUUID(), itemId: p.itemId, response });
        expect(r.body.correct, `${node} question ${i + 1}`).toBe(i < rightCount);
      }
      const fin = await c.post(`/api/nodes/${node}/complete`);
      expect(fin.body.passed, `${node} ${rightCount}/${total}`).toBe(passes);
    }
  }, 1_200_000);

  it("Grade 5 uses the exact ratio: 39 questions at 66% need 26 (25 is 64.1%, 26 is 66.7%), and the earlier-grade seven alone are far short", () => {
    const pass = course.ix.c.policy.assessments!.gradePassPercent;
    expect(pass).toBe(66);
    expect(Math.ceil((39 * pass) / 100)).toBe(26);
    expect(25 * 100 >= pass * 39).toBe(false);
    expect(26 * 100 >= pass * 39).toBe(true);
    expect(7 * 100 >= pass * 39).toBe(false);
  });
});

describe("the three enrichment nodes are genuinely optional", () => {
  const E = ["G5-U4-E1", "G5-U4-E2", "G5-U5-E1"];
  it("are playable with authored lessons, marked optional, and bound to their own optional templates only", () => {
    for (const id of E) {
      const n = course.ix.nodeById.get(id)!;
      expect(n.optional, id).toBe(true);
      expect(n.type, id).toBe("enrichment");
      expect(course.isPlayable(id), id).toBe(true);
      expect(course.authoredItems(id).length, id).toBeGreaterThanOrEqual(3);
      expect(n.exercises.every((b) => /six-four|approach|satb/.test(b.templateId)), id).toBe(true);
    }
    expect(course.authoredItems("G5-U5-E1").some((i) => i.templateId === "t.g5.satb-voices")).toBe(true);
  });

  it("appear in no challenge, no assessment, no practice and no review, and gate nothing", () => {
    // G5-U4-E2 is extra practice for the approach chord, which is compulsory since the review of PR #13, so its template is not optional
    const optionalTemplates = new Set(E.filter((id) => id !== "G5-U4-E2").flatMap((id) => course.ix.nodeById.get(id)!.exercises.map((b) => b.templateId)));
    for (const bp of course.ix.assessments.values()) for (const s of bp.sections) for (const t of s.templateIds) expect(optionalTemplates.has(t), `${bp.id} ${t}`).toBe(false);
    for (const n of G5.filter((x) => ["practice", "review"].includes(x.type))) for (const b of n.exercises) expect(optionalTemplates.has(b.templateId), `${n.id} ${b.templateId}`).toBe(false);
    for (const n of G5) if (!E.includes(n.id)) for (const dep of n.resolvedUnlockAfter) expect(E.includes(dep), `${n.id} waits for ${dep}`).toBe(false);
  });

  it("a learner can complete Grade 5 without opening them, and playing them awards no mastery for a compulsory concept", async () => {
    const { db, app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G5-A");
    const prog = (await c.get("/api/progress")).body;
    expect(prog.nodes["G5-A"].state).toBe("completed");
    for (const id of E) expect(prog.nodes[id].state).not.toBe("completed");
    for (const id of E) await ensureDone(c, app, userId, id);
    const rows = db.prepare("SELECT DISTINCT concept_id FROM mastery_evidence WHERE user_id = ? AND node_id IN ('G5-U4-E1','G5-U4-E2','G5-U5-E1')").all(userId) as Array<{ concept_id: string }>;
    // G5-U4-E2 is extra practice with the approach chord, which belongs to the compulsory concept of choosing chords at cadence points
    for (const r of rows) expect(["c.chords.cadential-six-four", "c.cadences.chord-choice", "c.voices.satb-scores"], r.concept_id).toContain(r.concept_id);
  }, 1_800_000);
});

describe("Grade 5 concept boundaries (no false mastery from earlier-grade material)", () => {
  const constraints = loadConstraints(course.ix.c.root, course.ix.concepts);
  const sample = (templateId: string, nodeId: string, n = 150) => {
    const node = course.ix.nodeById.get(nodeId)!;
    const b = node.exercises.find((x) => x.templateId === templateId)!;
    const scope = effectiveScope(course.ix, node, b);
    const out = [];
    for (let s = 1; s <= n; s++) { try { out.push(generateItem(course.ix, templateId, s, { scope }).item); } catch { /* skipped */ } }
    return out;
  };
  const ok = (concept: string, item: ReturnType<typeof sample>[number]) => !constraints.get(concept) || satisfies(item, constraints.get(concept)!);
  const pitches = (it: ReturnType<typeof sample>[number]) => ({ lower: (it.answer as { lower: string }).lower, upper: (it.answer as { upper?: string }).upper });

  it("an ordinary diatonic interval never earns chromatic-interval credit, and a chromatic one does", () => {
    let chromatic = 0;
    let diatonic = 0;
    for (const it of sample("t.g5.interval-any", "G5-U3-L03", 200)) {
      const { lower, upper } = pitches(it);
      const isChromatic = !music.isDiatonicPair(music.parsePitch(lower!), music.parsePitch(upper!));
      expect(ok("c.intervals.chromatic", it), it.prompt).toBe(isChromatic);
      if (isChromatic) chromatic++; else diatonic++;
    }
    expect(chromatic).toBeGreaterThan(20);
    expect(diatonic).toBeGreaterThan(10);
    // a plain C to G is refused by the boundary
    const plain = { ...sample("t.g5.interval-any", "G5-U3-L03", 5)[0]!, answer: { kind: "interval", task: "identify", lower: "C4", upper: "G4", acceptedIntervals: ["P5"] } };
    expect(satisfies(plain as never, constraints.get("c.intervals.chromatic")!)).toBe(false);
  });

  it("a root-position chord never earns inversion credit; first and second inversions do", () => {
    let credited = 0;
    let refused = 0;
    for (const it of sample("t.g5.chord-identify", "G5-U4-L03", 200)) {
      const inv = (it.answer as { acceptedChords: Array<{ inversion: string }> }).acceptedChords[0]!.inversion;
      expect(ok("c.chords.inversions", it), `${it.prompt} ${inv}`).toBe(inv !== "a");
      if (inv !== "a") credited++; else refused++;
    }
    expect(credited).toBeGreaterThan(30);
    expect(refused).toBeGreaterThan(10);
  });

  it("only the supertonic chord earns supertonic credit", () => {
    for (const it of sample("t.g5.chord-identify", "G5-U4-L03", 200)) {
      const roman = (it.answer as { acceptedChords: Array<{ roman: string }> }).acceptedChords[0]!.roman;
      expect(ok("c.chords.supertonic", it), `${roman}`).toBe(roman === "ii");
    }
  });

  it("the four-clef and tenor concepts need an alto or tenor clef; a treble or bass question earns neither", () => {
    let credited = 0;
    for (const it of sample("t.g5.four-clef-read", "G5-U2-L02", 200)) {
      const clef = it.music!.clef;
      expect(ok("c.clefs.four-clefs", it), clef).toBe(clef === "alto" || clef === "tenor");
      if (ok("c.clefs.four-clefs", it)) credited++;
    }
    expect(credited).toBeGreaterThan(30);
    for (const it of sample("t.g5.tenor-read", "G5-U2-L01", 60)) expect(ok("c.clefs.tenor", it)).toBe(true);
  });

  it("octave-transposition credit always involves the tenor clef", () => {
    for (const it of sample("t.g5.octave-transpose", "G5-U2-L03", 100)) {
      expect(it.music!.clef === "tenor" || (it.answer as { clef: string }).clef === "tenor", it.prompt).toBe(true);
      expect(ok("c.transposition.octave-any", it)).toBe(true);
    }
    for (const it of sample("t.g5.clef-position", "G5-U2-L03", 100)) expect(it.score!.staves.some((s) => s.music.clef === "tenor"), it.prompt).toBe(true);
  });

  it("scale and key credit goes to the six-sharp or six-flat concept by the key, never across", () => {
    for (const it of sample("t.g5.scale-build", "G5-U3-L01", 60)) {
      expect(ok("c.scales.keys-six-sharps", it)).toBe(true);
      expect(ok("c.scales.keys-six-flats", it)).toBe(false);
    }
    for (const it of sample("t.g5.scale-build", "G5-U3-L02", 60)) {
      expect(ok("c.scales.keys-six-flats", it)).toBe(true);
      expect(ok("c.scales.keys-six-sharps", it)).toBe(false);
    }
    // a Grade 4 key (B major) never earns six-accidental credit
    const base = sample("t.g5.scale-build", "G5-U3-L01", 5)[0]!;
    const g4 = { ...base, music: undefined, answer: { ...base.answer, key: "B major", derivation: { rule: "scale", key: "B major", form: "major", direction: "ascending", start: "B3" } } };
    expect(satisfies(g4 as never, constraints.get("c.scales.keys-six-sharps")!)).toBe(false);
  });

  it("compound-interval credit needs a compound interval; a simple 5th is refused", () => {
    for (const it of sample("t.g5.interval-compound", "G5-U3-L04", 80)) expect(ok("c.intervals.compound", it)).toBe(true);
    const simple = { ...sample("t.g5.interval-any", "G5-U3-L03", 5)[0]!, answer: { kind: "interval", task: "identify", lower: "C4", upper: "G4", acceptedIntervals: ["P5"] } };
    expect(satisfies(simple as never, constraints.get("c.intervals.compound")!)).toBe(false);
  });

  it("Grade 4 terminology never counts as Grade 5 terminology: Grade 5 term questions only ever ask Grade 5 terms", () => {
    const g5 = new Set(music.TERMS_G5.map((t) => t.id));
    const g4 = new Set(music.TERMS_G4.map((t) => t.id));
    for (const t of ["t.g5.terms", "t.g5.term-use"]) {
      for (const it of sample(t, "G5-U5-L06", 120)) {
        const right = (it.answer as { correctOptionIds?: string[] }).correctOptionIds?.[0];
        if (right && g4.has(right)) throw new Error(`${t} asked a Grade 4 term ${right}`);
        expect(ok("c.terms.g5", it), it.prompt).toBe(true);
      }
    }
    expect([...g4].filter((x) => g5.has(x))).toEqual([]);
    // and a Grade 4 template carries only Grade 4 concepts, so it cannot credit a Grade 5 concept
    expect(course.ix.templates.get("t.g4.terms")!.conceptIds.every((c) => course.ix.concepts.get(c)!.grade === 4)).toBe(true);
  });

  it("a basic chord identification never credits a cadence concept, and no template credits a concept of another grade", () => {
    for (const t of course.ix.templates.values()) {
      if (t.grade !== 5) continue;
      expect(t.conceptIds.every((c) => course.ix.concepts.get(c)?.grade === 5), t.id).toBe(true);
    }
    expect(course.ix.templates.get("t.g5.chord-identify")!.conceptIds.some((c) => c.startsWith("c.cadences."))).toBe(false);
  });
});

describe("ornament assessment never asks for the realisation of a sign to be written", () => {
  it("no Grade 5 template is a build question that writes out notes from an ornament sign, and replacement questions go from notes to a sign", () => {
    for (const t of course.ix.templates.values()) {
      if (t.grade !== 5 || !t.id.includes("ornament")) continue;
      for (const id of [t.id]) {
        const node = [...course.ix.nodeById.values()].find((n) => n.exercises.some((b) => b.templateId === id));
        if (!node) continue;
        const b = node.exercises.find((x) => x.templateId === id)!;
        for (let s = 1; s <= 60; s++) {
          let item;
          try { item = generateItem(course.ix, id, s, { scope: effectiveScope(course.ix, node, b) }).item; } catch { continue; }
          expect(["ornament-sign", "choice"], `${id}: ${item.answer.kind}`).toContain(item.answer.kind);
          if (item.answer.kind === "ornament-sign") expect(item.answer.task, id).toBe("replace-written-out");
        }
      }
    }
  });
});
