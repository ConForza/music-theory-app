import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkItem, effectiveScope, music, taughtScope } from "@mtp/curriculum";
import { canonicalResponse, generateItem, gradeItem } from "@mtp/engine";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { loadConstraints, questionKey, satisfies, visibleKey } from "../src/question-key.ts";
import { MasteryService, recordExposure } from "../src/mastery-service.ts";
import { ManualClock } from "../src/clock.ts";
import { rulesFrom } from "../src/mastery.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
const EARLIER = course.nodes.filter((n) => n.grade <= 3);
const G4 = course.nodes.filter((n) => n.grade === 4);
const done = "'questions'";
const SESSION = ["practice", "review", "unit_challenge", "grade_assessment"];

const insert = (db: ReturnType<typeof openDb>, id: string, n: (typeof EARLIER)[number]) =>
  db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);

/** A learner whose Grades 1-3 are already finished (as a Brief 07 learner's would be); Grade 4 starts from nothing. */
async function learner() {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c);
  const userId = me.body.user.id as string;
  for (const n of EARLIER) insert(db, userId, n);
  return { db, app, c, userId };
}

describe("the whole of Grade 4 is playable", () => {
  it("has a real learner experience for all 41 nodes", () => {
    expect(G4).toHaveLength(41);
    expect(G4.filter((n) => !course.isPlayable(n.id)).map((n) => n.id)).toEqual([]);
    expect(G4.filter((n) => n.contentStatus === "planned")).toEqual([]);
    const count = (t: string) => G4.filter((n) => n.type === t).length;
    expect([count("lesson"), count("practice"), count("review"), count("unit_challenge"), count("grade_assessment")]).toEqual([25, 5, 5, 5, 1]);
    expect(G4.filter((n) => n.type === "lesson").every((n) => course.lesson(n.id))).toBe(true);
    expect(G4.filter((n) => SESSION.includes(n.type)).every((n) => course.sessionKind(n.id))).toBe(true);
    // nothing is optional: all 41 are required
    expect(G4.filter((n) => n.optional)).toEqual([]);
  });

  it("starts after the last Grade 3 review (the established prerequisite policy), and a new learner cannot skip into it", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    await register(c);
    const first = (await c.get("/api/progress")).body.nodes["G4-U1-L01"];
    expect(first.state).toBe("locked");
    expect(first.lockedBy).toEqual(["G3-U5-R1"]);
    expect((await c.post("/api/lessons/G4-U1-L01/start")).status).toBe(403);
    expect((await c.post("/api/nodes/G4-A/start")).status).toBe(403);
  });

  it("can be completed from the first lesson to the Grade 4 assessment, with Grade 1-3 history untouched", async () => {
    const { db, app, c, userId } = await learner();
    expect((await c.get("/api/progress")).body.nodes["G4-U1-L01"].state).toBe("available");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const earlierRows = db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(userId);
    await ensureDone(c, app, userId, "G4-A");
    for (const n of G4.filter((x) => x.type === "unit_challenge")) await ensureDone(c, app, userId, n.id);
    const prog = (await c.get("/api/progress")).body;
    const g4 = prog.grades.find((g: { grade: number }) => g.grade === 4);
    expect(g4.requiredNodes).toBe(41);
    expect(g4.completedNodes).toBe(41);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G4-A" && r.passed)).toHaveLength(1);
    expect(results.filter((r) => /^G4-U\d-C$/.test(r.nodeId) && r.passed)).toHaveLength(5);
    const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(badges.find((b) => b.id === "g4.grade-complete")?.earned).toBe(true);
    expect(db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND (node_id LIKE 'G1-%' OR node_id LIKE 'G2-%' OR node_id LIKE 'G3-%') ORDER BY node_id").all(userId)).toEqual(earlierRows);
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBeGreaterThan(0);
  }, 1_800_000);

  it("never lets a failed challenge or assessment complete a node or pay completion XP, and allows a retake", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G4-U1-R1");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const failed = await playSession(c, app, userId, "G4-U1-C", { wrong: 8 });
    expect(failed.body.passed).toBe(false);
    expect(failed.body.completedNode).toBe(false);
    expect(failed.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBe(0);
    expect((await c.get("/api/progress")).body.nodes["G4-U1-C"].state).not.toBe("completed");
    const second = await playSession(c, app, userId, "G4-U1-C");
    expect(second.body.passed).toBe(true);
    expect(second.body.rewards.xp.awarded).toBe(15);
    for (const n of G4) if (n.id !== "G4-A" && n.type !== "unit_challenge") await ensureDone(c, app, userId, n.id);
    const before = (await c.get("/api/xp")).body.total as number;
    const bad = await playSession(c, app, userId, "G4-A", { wrong: 41 });
    expect(bad.body.passed).toBe(false);
    expect(bad.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(0);
    expect(((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g4.grade-complete")?.earned).toBe(false);
    const retake = await playSession(c, app, userId, "G4-A");
    expect(retake.body.passed).toBe(true);
    expect(retake.body.rewards.xp.awarded).toBe(25);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G4-A").map((r) => r.passed).sort()).toEqual([false, true]);
  }, 1_800_000);

  it("a learner who knows only the five earlier-grade questions cannot pass the Grade 4 assessment", async () => {
    const { app, c, userId, db } = await learner();
    for (const n of G4) if (n.id !== "G4-A") insert(db, userId, n);
    const start = (await c.post("/api/nodes/G4-A/start")).body;
    expect(start.items).toHaveLength(41);
    const planned = app.nodes.internalItems(userId, "G4-A");
    const earlier = planned.filter((p) => /^t\.g[123]\./.test(p.item.templateId));
    expect(earlier).toHaveLength(5);
    // answer exactly the earlier-grade questions right and everything else wrong
    for (const p of planned) {
      const right = /^t\.g[123]\./.test(p.item.templateId);
      const response = right ? responseFor(course, "G4-A", p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
      await c.post("/api/nodes/G4-A/attempts", { attemptId: crypto.randomUUID(), itemId: p.itemId, response: response ?? responseFor(course, "G4-A", p.item, p.scope) });
    }
    const fin = await c.post("/api/nodes/G4-A/complete");
    expect(fin.body.passed).toBe(false);
  }, 600_000);

  it("review P1-2: on the full 41-question assessment 27 right fails with no completion XP or badge, and 28 right passes and awards completion exactly once", async () => {
    for (const rightCount of [27, 28]) {
      const { app, c, userId, db } = await learner();
      for (const n of G4) if (n.id !== "G4-A") insert(db, userId, n);
      const start = (await c.post("/api/nodes/G4-A/start")).body;
      expect(start.items).toHaveLength(41);
      const planned = app.nodes.internalItems(userId, "G4-A");
      const xp0 = (await c.get("/api/xp")).body.total as number;
      let given = 0;
      for (const [i, p] of planned.entries()) {
        const wantRight = i < rightCount;
        const response = wantRight ? responseFor(course, "G4-A", p.item, p.scope) : wrongItemResponse(course, p.item, p.scope);
        expect(response, `question ${i + 1} can be answered ${wantRight ? "right" : "wrong"}`).toBeTruthy();
        const r = await c.post("/api/nodes/G4-A/attempts", { attemptId: crypto.randomUUID(), itemId: p.itemId, response });
        if (wantRight) expect(r.body.correct, `question ${i + 1}`).toBe(true);
        else expect(r.body.correct, `question ${i + 1}`).toBe(false);
        given++;
      }
      expect(given).toBe(41);
      const fin = await c.post("/api/nodes/G4-A/complete");
      const badge = async () => ((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g4.grade-complete")?.earned;
      const xpNow = async () => (await c.get("/api/xp")).body.total as number;
      if (rightCount === 27) {
        expect(fin.body.passed).toBe(false);
        expect(fin.body.completedNode).toBe(false);
        expect(fin.body.rewards).toBeUndefined();
        expect((await xpNow()) - xp0).toBe(0);
        expect(await badge()).toBe(false);
        expect((await c.get("/api/progress")).body.nodes["G4-A"].state).not.toBe("completed");
      } else {
        expect(fin.body.passed).toBe(true);
        expect(fin.body.rewards.xp.awarded).toBe(25);
        const after = await xpNow();
        expect(after - xp0).toBeGreaterThanOrEqual(25);
        expect(await badge()).toBe(true);
        // completing again pays nothing more
        // (a repeated completion replays the stored result; the XP total must not move)
        await c.post("/api/nodes/G4-A/complete");
        expect(await xpNow()).toBe(after);
        expect((await c.get("/api/results")).body.results.filter((r: { nodeId: string; passed: boolean }) => r.nodeId === "G4-A" && r.passed)).toHaveLength(1);
      }
    }
  }, 1_200_000);

  it("resumes an interrupted run with the same questions and the answers already given", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G4-U1-R1");
    const first = (await c.post("/api/nodes/G4-U1-C/start")).body;
    const items = app.nodes.internalItems(userId, "G4-U1-C");
    const it = items[0]!;
    expect((await c.post("/api/nodes/G4-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G4-U1-C", it.item, it.scope) })).status).toBe(200);
    const resumed = (await c.post("/api/nodes/G4-U1-C/start")).body;
    expect(resumed.run).toBe(first.run);
    expect(resumed.items.map((x: { item: { id: string } }) => x.item.id)).toEqual(first.items.map((x: { item: { id: string } }) => x.item.id));
    expect(resumed.items[0].answered).toBe(true);
    expect(resumed.items[1].answered).toBe(false);
    const bad = wrongItemResponse(course, items[1]!.item, items[1]!.scope);
    expect(bad).toBeTruthy();
    await c.post("/api/nodes/G4-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: bad });
    expect((await c.post("/api/nodes/G4-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: responseFor(course, "G4-U1-C", items[1]!.item, items[1]!.scope) })).status).toBe(409);
    expect(JSON.stringify(first)).not.toMatch(/correctOptionIds|accepted/);
  }, 300_000);
});

/** Words that belong to a later unit: a node of unit k never shows those of units k+1.. (the learner would meet an untaught idea). */
const U5 = /\b(trill|mordent|acciaccatura|appoggiatura|pizzicato|arco|sordino|ponticello|affettuoso|affrettando|amabile|appassionato|calando|cantando|morendo|perdendosi|nobilmente|sonoro)\b/i;
const U4 = /\b(augmented|diminished)\b|chord (IV|V)\b|root position|\btriad\b/i;
const U3 = /chromatic|supertonic|mediant|submediant|leading note|\bB major\b|G♯ minor|D♭ major|B♭ minor/i;
const U2 = /alto|double sharp|double flat|𝄪|𝄫|enharmonic/i;
const LATER: Record<number, RegExp> = {
  1: new RegExp([U2, U3, U4, U5].map((r) => r.source).join("|"), "i"),
  2: new RegExp([U3, U4, U5].map((r) => r.source).join("|"), "i"),
  3: new RegExp([U4, U5].map((r) => r.source).join("|"), "i"),
  4: U5,
};

describe("Grade 4 generated nodes only ask what has been taught", () => {
  it("every practice, review and challenge question fits the taught scope of its node, credits a concept, and shows nothing from a later unit", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const sessionNodes = G4.filter((n) => SESSION.includes(n.type) && n.type !== "grade_assessment");
    const bad: string[] = [];
    for (let u = 0; u < 3; u++) {
      const id = `u${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',4,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G4]) insert(db, id, n);
      for (const n of sessionNodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const items = app.nodes.internalItems(id, n.id);
        if (items.length < 6) bad.push(`${n.id} has only ${items.length} questions`);
        const taught = taughtScope(course.ix, n);
        const unit = n.unitId ? Number(/G4-U(\d)/.exec(n.unitId)![1]) : 5;
        for (const it of items) {
          checkItem(it.item, taught, it.itemId, (code, _w, msg, sev = "error") => sev === "error" && bad.push(`${n.id} ${it.itemId}: ${code} ${msg}`));
          if (!it.conceptIds.length) bad.push(`${n.id} ${it.itemId} credits no concept`);
          // Grade 3 foundation questions in the first review are earlier-grade material and use earlier-grade words
          if (it.item.templateId.startsWith("t.g4.") && LATER[unit]) {
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
    for (const n of G4.filter((x) => x.type === "lesson")) for (const b of n.exercises) if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, Number(/G4-U(\d)/.exec(n.unitId!)![1]));
    for (let u = 1; u <= 5; u++) for (const t of new Set(course.ix.assessments.get(`a.g4-u${u}`)!.sections.flatMap((s) => s.templateIds))) expect(firstUnit.get(t)!, `a.g4-u${u} ${t}`).toBeLessThanOrEqual(u);
    const sizes: Record<string, number> = { "a.g4-u1": 8, "a.g4-u2": 10, "a.g4-u3": 8, "a.g4-u4": 6, "a.g4-u5": 8, "a.g4": 41 };
    for (const [id, n] of Object.entries(sizes)) {
      const bp = course.ix.assessments.get(id)!;
      expect(bp.sections.reduce((t, s) => t + s.itemCount, 0), id).toBe(n);
      expect(new Set(bp.sections.map((s) => s.id)).size, `${id} section ids are unique`).toBe(bp.sections.length);
      expect(bp.hintsAllowed).toBe(false);
    }
    const bp = course.ix.assessments.get("a.g4")!;
    const per = new Map<string, number>();
    for (const s of bp.sections) for (const o of s.outcomeIds) per.set(o, (per.get(o) ?? 0) + s.itemCount);
    for (let k = 1; k <= 18; k++) expect(per.get(`abrsm2020.g4.${String(k).padStart(2, "0")}`) ?? 0, `g4.${k}`).toBeGreaterThanOrEqual(2);
    // five earlier-grade questions: every template is a Grade 1-3 template, so they cannot be mistaken for Grade 4 evidence
    const earlier = bp.sections.find((s) => s.id === "earlier-grades")!;
    expect(earlier.itemCount).toBe(5);
    expect(earlier.templateIds.every((t) => /^t\.g[123]\./.test(t))).toBe(true);
    expect(bp.sections.filter((s) => s.id !== "earlier-grades").reduce((n, s) => n + s.itemCount, 0)).toBe(36);
  });

  it("each generated grade assessment is independent of hints, exactly 41 questions with 36 Grade 4 and 5 earlier, and credits every one of the 18 outcomes", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const outcomes = new Set<string>();
    for (let u = 0; u < 6; u++) {
      const id = `a${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',4,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G4]) if (n.id !== "G4-A") insert(db, id, n);
      app.nodes.start(id, "G4-A");
      const items = app.nodes.internalItems(id, "G4-A");
      expect(items.length).toBe(41);
      expect(items.filter((i) => /^t\.g4\./.test(i.item.templateId)).length).toBe(36);
      expect(items.filter((i) => /^t\.g[123]\./.test(i.item.templateId)).length).toBe(5);
      expect(new Set(items.map((i) => visibleKey(i.item))).size).toBe(items.length);
      for (const it of items) {
        expect(it.item.evidence).toBe("independent");
        for (const c of it.conceptIds) for (const o of course.ix.concepts.get(c)?.outcomeIds ?? []) outcomes.add(o);
      }
      // meaningful evidence: every Grade 4 outcome is credited in this very run, not only across runs
      const here = new Set(items.flatMap((i) => i.conceptIds.flatMap((c) => course.ix.concepts.get(c)?.outcomeIds ?? [])));
      for (let k = 1; k <= 18; k++) expect(here.has(`abrsm2020.g4.${String(k).padStart(2, "0")}`), `learner ${u}: g4.${k}`).toBe(true);
    }
    for (let k = 1; k <= 18; k++) expect(outcomes.has(`abrsm2020.g4.${String(k).padStart(2, "0")}`)).toBe(true);
  }, 900_000);
});

describe("Grade 4 concept boundaries (no false mastery from earlier-grade material)", () => {
  const constraints = loadConstraints(course.ix.c.root, course.ix.concepts);
  const sample = (templateId: string, nodeId: string, n = 120) => {
    const node = course.ix.nodeById.get(nodeId)!;
    const b = node.exercises.find((x) => x.templateId === templateId)!;
    const scope = effectiveScope(course.ix, node, b);
    const out = [];
    for (let s = 1; s <= n; s++) { try { out.push(generateItem(course.ix, templateId, s, { scope }).item); } catch { /* skipped */ } }
    return out;
  };
  const ok = (concept: string, item: ReturnType<typeof sample>[number]) => !constraints.get(concept) || satisfies(item, constraints.get(concept)!);

  it("regular-time-signature concepts credit only the eight signatures new at Grade 4, never 4/4 or 6/8", () => {
    const NEW = new Set(["2/8", "4/8", "6/4", "9/4", "12/4", "6/16", "9/16", "12/16"]);
    let credited = 0;
    for (const t of ["t.g4.metre-facts", "t.g4.time-signature"]) {
      for (const i of sample(t, "G4-U1-P1", 150)) {
        if (!ok("c.metre.regular-all", i)) continue;
        credited++;
        const ts = i.music?.timeSignature ?? (i.answer as { accepted?: string[] }).accepted?.[0] ?? /\b(\d{1,2}\/\d{1,2})\b/.exec(i.prompt)?.[1] ?? (i.answer as { correctOptionIds?: string[] }).correctOptionIds?.[0];
        expect(NEW.has(String(ts)), `${t}: ${i.prompt} -> ${ts}`).toBe(true);
      }
    }
    expect(credited).toBeGreaterThan(30);
    // a question about 4/4 is refused by the boundary
    const old = { ...sample("t.g4.metre-facts", "G4-U1-P1", 5)[0]!, prompt: "What kind of time is 4/4?", answer: { kind: "choice" as const, options: [{ id: "simple quadruple", label: "Simple quadruple" }, { id: "compound quadruple", label: "Compound quadruple" }], correctOptionIds: ["simple quadruple"] } };
    expect(satisfies(old as never, constraints.get("c.metre.regular-all")!)).toBe(false);
  });

  it("the double-dot concept credits only questions about double-dotted values, the breve concept only breve or 4/2 questions", () => {
    for (const t of ["t.g4.double-dot-facts", "t.g4.double-dot-bar", "t.g4.breve-double-dot"]) for (const i of sample(t, "G4-U1-P1", 120)) if (ok("c.rhythm.double-dots", i)) expect(i.prompt, t).toMatch(/double-dotted/);
    for (const t of ["t.g4.breve-facts", "t.g4.breve-bar", "t.g4.breve-double-dot"]) for (const i of sample(t, "G4-U1-P1", 120)) if (ok("c.rhythm.breve", i)) expect(i.prompt, t).toMatch(/breve|4\/2/);
    // "how many crotchets last as long as a dotted semibreve" is Grade 1 knowledge: it earns no Grade 4 breve or double-dot credit
    const plainDot = sample("t.g4.breve-double-dot", "G4-U1-P1", 200).find((i) => !/breve|double-dotted/.test(i.prompt));
    if (plainDot) { expect(ok("c.rhythm.breve", plainDot)).toBe(false); expect(ok("c.rhythm.double-dots", plainDot)).toBe(false); }
  });

  it("the alto-clef concepts credit only questions that name the alto clef; octave transposition between treble and bass earns no alto credit", () => {
    for (const t of ["t.g4.octave-transpose-alto", "t.g4.octave-pick-alto"]) for (const i of sample(t, "G4-U2-P1", 120)) expect(ok("c.transposition.octave-alto", i) ? /alto/.test(i.prompt) : true, i.prompt).toBe(true);
    for (const i of sample("t.g4.octave-transpose-alto", "G4-U2-P1", 200)) expect([i.music?.clef, (i.answer as { clef?: string }).clef].includes("alto"), `no treble-bass-only item is ever generated: ${i.prompt}`).toBe(true);
    for (const i of sample("t.g4.key-signature", "G4-U3-P1", 120)) { const a = i.answer as { clef: string; accidentals?: unknown[]; accepted?: string[] }; const empty = a.accidentals ? a.accidentals.length === 0 : (a.accepted ?? []).some((k) => ["C major", "A minor"].includes(k)); expect(ok("c.keys.signatures-alto", i), i.prompt).toBe(a.clef === "alto" && !empty); }
  });

  it("scale and key concepts split the sharp keys from the flat keys and credit no key learned before Grade 4", () => {
    for (const i of sample("t.g4.key-signature", "G4-U3-P1", 200)) {
      const key = (i.answer as { accepted: string[] }).accepted[0]!;
      const sharp = ["B major", "G# minor"].includes(key);
      const flat = ["Db major", "Bb minor"].includes(key);
      expect(ok("c.scales.keys-five-sharps", i), key).toBe(sharp);
      expect(ok("c.scales.keys-five-flats", i), key).toBe(flat);
    }
  });

  it("interval concepts split major/minor/perfect from augmented/diminished by the answer", () => {
    let aug = 0, plainQ = 0;
    for (const nodeId of ["G4-U4-P1"]) for (const t of ["t.g4.interval-diatonic", "t.g4.interval-write", "t.g4.interval-facts"]) for (const i of sample(t, nodeId, 200)) {
      const a = ok("c.intervals.augmented-diminished", i);
      const m = ok("c.intervals.any-diatonic", i);
      expect(a && m, `an item is never both: ${i.prompt}`).toBe(false);
      if (a) aug++;
      if (m) plainQ++;
    }
    expect(aug).toBeGreaterThan(10);
    expect(plainQ).toBeGreaterThan(10);
  });

  it("the terms concept only credits the 21 Grade 4 terms and the techniques concept only the eight techniques; no Grade 1-3 term is ever offered", () => {
    const g123 = new Set(music.TERMS.map((t) => t.id));
    for (const t of ["t.g4.terms", "t.g4.term-use"]) for (const i of sample(t, "G4-U5-P1", 120)) {
      expect(ok("c.terms.g4", i)).toBe(true);
      for (const o of (i.answer as { options: Array<{ id: string }> }).options) expect(g123.has(o.id), o.id).toBe(false);
    }
    for (const t of ["t.g4.technique-facts", "t.g4.technique-use"]) for (const i of sample(t, "G4-U5-P1", 120)) { expect(ok("c.instruments.techniques", i)).toBe(true); expect(ok("c.terms.g4", i)).toBe(false); }
  });

  it("review P2-6: tonic-bottomed intervals, tonic-chord questions, empty alto signatures and unprinted double signs earn no Grade 4 credit", () => {
    const tonicOf = (k: string) => /^([A-G][b#]?)/.exec(k)![1]!;
    for (const t of ["t.g4.interval-diatonic", "t.g4.interval-write"]) {
      for (const i of sample(t, "G4-U4-L01", 200)) {
        const a = i.answer as { key: string; lower: string; direction?: string; acceptedPitches?: string[] };
        const lower = a.direction === "down" ? a.acceptedPitches![0]! : a.lower;
        const fromTonic = lower.replace(/-?\d+$/, "") === tonicOf(a.key);
        expect(ok("c.intervals.any-diatonic", i), `${i.prompt} ${lower}`).toBe(!fromTonic);
      }
    }
    for (const i of [...sample("t.g4.triad-notes", "G4-U4-L03", 200), ...sample("t.g4.triad-id", "G4-U4-L03", 200)]) {
      const named = /chord (I|IV|V)\b/.exec(i.prompt)?.[1] ?? (i.answer as { acceptedChords?: Array<{ roman: string }> }).acceptedChords?.[0]?.roman;
      expect(ok("c.chords.primary-triads", i), i.prompt).toBe(named === "IV" || named === "V");
    }
    for (const i of sample("t.g4.key-signature", "G4-U3-L03", 200)) {
      const a = i.answer as { accidentals?: unknown[] };
      if (a.accidentals) expect(ok("c.keys.signatures-alto", i)).toBe(a.accidentals.length > 0);
    }
    for (const i of [...sample("t.g4.double-name", "G4-U2-L01", 100), ...sample("t.g4.double-facts", "G4-U2-L01", 100)]) expect(ok("c.accidentals.double", i), i.prompt).toBe(true);
    // a stave that prints only single signs, answered with a single accidental, is not a double-accidental question
    const single = sample("t.g4.double-name", "G4-U2-L01", 20)[0]!;
    const plain = { ...single, music: undefined, answer: { kind: "pitch", accepted: ["C#4"], relation: "same", octaveSensitive: true, spellingSensitive: true }, prompt: "Name this note." } as never;
    expect(ok("c.accidentals.double", plain)).toBe(false);
  });

  it("the primary-triad concept credits chords IV and V and naming questions, and a tonic-only chord writing question earns no Grade 4 credit", () => {
    const tonicOnly = sample("t.g4.primary-triad", "G4-U4-P1", 200).filter((i) => /Write chord I of/.test(i.prompt));
    expect(tonicOnly.length).toBeGreaterThan(0);
    for (const i of tonicOnly) expect(ok("c.chords.primary-triads", i)).toBe(false);
    const sub = sample("t.g4.primary-triad", "G4-U4-P1", 200).filter((i) => /Write chord (IV|V) of/.test(i.prompt));
    for (const i of sub) expect(ok("c.chords.primary-triads", i)).toBe(true);
  });
});

describe("octave transposition into the alto clef is genuinely tested", () => {
  it("a clef change without the octave displacement gets no credit, and the correct transposition does", () => {
    const node = course.ix.nodeById.get("G4-U2-L05")!;
    const b = node.exercises.find((x) => x.templateId === "t.g4.octave-transpose-alto")!;
    const scope = effectiveScope(course.ix, node, b);
    let checked = 0;
    for (let s = 1; s <= 40 && checked < 12; s++) {
      let item;
      try { item = generateItem(course.ix, "t.g4.octave-transpose-alto", s, { scope }).item; } catch { continue; }
      const a = item.answer as unknown as { accepted: string[][]; clef: string };
      const src = item.music!.measures.flatMap((m) => m.events ?? []).map((e) => (e as { pitch: string }).pitch);
      expect(gradeItem(course.ix, item, canonicalResponse(course.ix, item, scope), scope).correct).toBe(true);
      // same pitch (no octave move) in the new clef: refused
      const same = src.map((p) => music.formatPitch(music.parsePitch(p)));
      const verdict = gradeItem(course.ix, item, { kind: "pitch-sequence", pitches: same as never }, scope);
      expect(verdict.correct, `${item.prompt}`).toBe(false);
      // an octave the wrong way is refused as well
      const dir = /higher/.test(item.prompt) ? -1 : 1;
      const wrongWay = src.map((p) => music.formatPitch({ ...music.parsePitch(p), octave: music.parsePitch(p).octave + dir }));
      expect(gradeItem(course.ix, item, { kind: "pitch-sequence", pitches: wrongWay as never }, scope).correct).toBe(false);
      void a;
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe("review P1-1: the same Grade 4 question in another seed is not fresh evidence", () => {
  const item = (node: string, tpl: string, seed: number) => {
    const n = course.ix.nodeById.get(node)!;
    const b = n.exercises.find((x) => x.templateId === tpl)!;
    return generateItem(course.ix, tpl, seed, { scope: effectiveScope(course.ix, n, b) }).item;
  };
  it("metre-facts seeds 2 and 18 and chord-build seeds 18 and 36 share one question key and one visible key", () => {
    const a = item("G4-U1-L03", "t.g4.metre-facts", 2);
    const b = item("G4-U1-L03", "t.g4.metre-facts", 18);
    expect(a.id).not.toBe(b.id);
    expect(questionKey(a)).toBe(questionKey(b));
    expect(visibleKey(a)).toBe(visibleKey(b));
    const c = item("G4-U4-L04", "t.g4.chord-build", 18);
    const d = item("G4-U4-L04", "t.g4.chord-build", 36);
    expect(c.id).not.toBe(d.id);
    expect(questionKey(c)).toBe(questionKey(d));
    expect(visibleKey(c)).toBe(visibleKey(d));
  });
  it("a second sighting through the real mastery service is not fresh", () => {
    const db = openDb(":memory:");
    const svc = new MasteryService(db, course, new ManualClock(new Date("2026-03-02T10:00:00.000Z")), rulesFrom(course.ix.c.policy));
    const a = item("G4-U1-L03", "t.g4.metre-facts", 2);
    const b = item("G4-U1-L03", "t.g4.metre-facts", 18);
    db.prepare("INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at) VALUES ('u1','U',1,'2026-03-02T10:00:00.000Z','2026-03-02T10:00:00.000Z')").run();
    expect(svc.isFresh("u1", questionKey(a))).toBe(true);
    recordExposure(db, "u1", questionKey(a), "practice-attempt", "2026-03-02T10:00:00.000Z");
    expect(svc.isFresh("u1", questionKey(b))).toBe(false);
  });
});

describe("Grade 4 lessons teach without repeating themselves", () => {
  it("no lesson asks the same question twice, guided and independent included", () => {
    const dupes: string[] = [];
    for (const n of G4.filter((x) => x.type === "lesson")) {
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
    for (const n of G4.filter((x) => x.type === "lesson")) {
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
    for (const n of G4.filter((x) => x.type === "lesson")) for (const it of course.authoredItems(n.id)) kinds.add(it.answer.kind);
    for (const k of ["rhythm", "pitch-sequence", "staff-position", "key-signature", "interval", "chord", "composite", "pitch", "time-signature", "choice"]) expect(kinds.has(k), k).toBe(true);
  });

  it("every question with notation carries a text description, and descriptions only mention signs that are printed", () => {
    const bad: string[] = [];
    for (const n of G4.filter((x) => x.type === "lesson")) {
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

describe("Grade 4 authoring is idempotent", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
  const files = () => ["path/grade-4.json", "path/grade-5.json", "assessments/grade-4.json", ...readdirSync(join(root, "lessons")).filter((f) => f.startsWith("G4-")).map((f) => `lessons/${f}`)];
  const digest = () => createHash("sha256").update(files().map((f) => `${f}\n${readFileSync(join(root, f), "utf8")}`).join("\n")).digest("hex");

  it("running the authoring script again changes nothing: no appended sections, the same question counts and the same lesson files", () => {
    const script = join(dirname(fileURLToPath(import.meta.url)), "../scripts/author-grade4.ts");
    expect(existsSync(script)).toBe(true);
    const before = digest();
    
    for (let run = 0; run < 2; run++) {
      execFileSync(process.execPath, ["--import", "tsx", script], { cwd: join(dirname(script), ".."), stdio: "pipe", timeout: 600_000 });
      expect(digest(), `after run ${run + 1}`).toBe(before);
    }
    const as1 = JSON.parse(readFileSync(join(root, "assessments/grade-4.json"), "utf8")).assessments as Array<{ id: string; sections: Array<{ id: string; itemCount: number }> }>;
    for (const bp of as1) {
      expect(new Set(bp.sections.map((s) => s.id)).size, `${bp.id} section ids unique`).toBe(bp.sections.length);
      expect(bp.sections.reduce((n, s) => n + s.itemCount, 0)).toBe(({ "a.g4-u1": 8, "a.g4-u2": 10, "a.g4-u3": 8, "a.g4-u4": 6, "a.g4-u5": 8, "a.g4": 41 } as Record<string, number>)[bp.id]);
    }
  }, 1_500_000);
});
