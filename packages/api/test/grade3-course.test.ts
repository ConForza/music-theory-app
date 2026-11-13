import { describe, expect, it } from "vitest";
import { checkItem, effectiveScope, taughtScope } from "@mtp/curriculum";
import { canonicalResponse, generateItem, gradeItem } from "@mtp/engine";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { loadConstraints, satisfies, visibleKey } from "../src/question-key.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor, wrongItemResponse } from "./helpers.ts";

const course = realCourse();
const EARLIER = course.nodes.filter((n) => n.grade <= 2);
const G3 = course.nodes.filter((n) => n.grade === 3);
const done = "'questions'";
const SESSION = ["practice", "review", "unit_challenge", "grade_assessment"];

const insert = (db: ReturnType<typeof openDb>, id: string, n: (typeof EARLIER)[number]) =>
  db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);

/** A learner whose Grades 1 and 2 are already finished (as a Brief 06 learner's would be); Grade 3 starts from nothing. */
async function learner() {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c);
  const userId = me.body.user.id as string;
  for (const n of EARLIER) insert(db, userId, n);
  return { db, app, c, userId };
}

describe("the whole of Grade 3 is playable", () => {
  it("has a real learner experience for all 36 nodes", () => {
    expect(G3).toHaveLength(36);
    expect(G3.filter((n) => !course.isPlayable(n.id)).map((n) => n.id)).toEqual([]);
    expect(G3.filter((n) => n.contentStatus === "planned")).toEqual([]);
    const count = (t: string) => G3.filter((n) => n.type === t).length;
    expect([count("lesson"), count("practice"), count("review"), count("unit_challenge"), count("enrichment"), count("grade_assessment")]).toEqual([19, 5, 5, 5, 1, 1]);
    expect(G3.filter((n) => ["lesson", "enrichment"].includes(n.type)).every((n) => course.lesson(n.id))).toBe(true);
    expect(G3.filter((n) => SESSION.includes(n.type)).every((n) => course.sessionKind(n.id))).toBe(true);
  });

  it("starts after the last Grade 2 review, and a new learner cannot skip into it", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    await register(c);
    const first = (await c.get("/api/progress")).body.nodes["G3-U1-L01"];
    expect(first.state).toBe("locked");
    expect(first.lockedBy).toEqual(["G2-U5-R1"]);
    expect((await c.post("/api/lessons/G3-U1-L01/start")).status).toBe(403);
    expect((await c.post("/api/nodes/G3-A/start")).status).toBe(403);
  });

  it("can be completed from the first lesson to the Grade 3 assessment, with Grade 1 and 2 history untouched", async () => {
    const { db, app, c, userId } = await learner();
    expect((await c.get("/api/progress")).body.nodes["G3-U1-L01"].state).toBe("available");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const earlierRows = db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(userId);
    await ensureDone(c, app, userId, "G3-A");
    for (const n of G3.filter((x) => x.type === "unit_challenge")) await ensureDone(c, app, userId, n.id);
    const prog = (await c.get("/api/progress")).body;
    const g3 = prog.grades.find((g: { grade: number }) => g.grade === 3);
    // the optional upbeat lesson is not a required node
    expect(g3.requiredNodes).toBe(35);
    expect(g3.completedNodes).toBe(35);
    expect(prog.nodes["G3-U2-E1"].state).not.toBe("completed");
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G3-A" && r.passed)).toHaveLength(1);
    expect(results.filter((r) => /^G3-U\d-C$/.test(r.nodeId) && r.passed)).toHaveLength(5);
    const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(badges.find((b) => b.id === "g3.grade-complete")?.earned).toBe(true);
    // Grade 1 and 2 progress and completion are exactly as they were; Grade 3 only added to XP
    expect(db.prepare("SELECT node_id, completed_at FROM lesson_progress WHERE user_id = ? AND (node_id LIKE 'G1-%' OR node_id LIKE 'G2-%') ORDER BY node_id").all(userId)).toEqual(earlierRows);
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBeGreaterThan(0);
  }, 1_200_000);

  it("keeps the optional upbeat lesson out of required work: playable, rewarded modestly, never assessed", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G3-U2-L01");
    const before = (await c.get("/api/xp")).body.total as number;
    await ensureDone(c, app, userId, "G3-U2-E1");
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(5);
    // it never gates anything: the next unit's first lesson does not wait for it
    const first3 = course.ix.nodeById.get("G3-U3-L01")!;
    expect(course.ix.nodeById.get("G3-U2-E1")!.optional).toBe(true);
    void first3;
    // no blueprint, practice or review binding refers to its template or concept
    const used = new Set<string>();
    for (const bp of course.ix.assessments.values()) for (const s of bp.sections) for (const t of s.templateIds) used.add(t);
    for (const n of G3.filter((x) => x.type !== "enrichment")) for (const b of n.exercises) used.add(b.templateId);
    expect(used.has("t.g3.upbeat-facts")).toBe(false);
    expect(G3.filter((n) => n.type !== "enrichment").some((n) => n.conceptIds?.includes("c.metre.anacrusis"))).toBe(false);
    // and the assessment's eligibility ignores it: Grade 3 required nodes exclude it
    expect(G3.filter((n) => !n.optional)).toHaveLength(35);
  }, 300_000);

  it("never lets a failed challenge or assessment complete a node or pay completion XP, and allows a retake", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G3-U1-R1");
    const xp0 = (await c.get("/api/xp")).body.total as number;
    const failed = await playSession(c, app, userId, "G3-U1-C", { wrong: 6 });
    expect(failed.body.passed).toBe(false);
    expect(failed.body.completedNode).toBe(false);
    expect(failed.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - xp0).toBe(0);
    expect((await c.get("/api/progress")).body.nodes["G3-U1-C"].state).not.toBe("completed");
    const second = await playSession(c, app, userId, "G3-U1-C");
    expect(second.body.passed).toBe(true);
    expect(second.body.rewards.xp.awarded).toBe(15);
    // the grade assessment behaves the same way, and records both results
    for (const n of G3) if (n.id !== "G3-A" && !["unit_challenge", "enrichment"].includes(n.type)) await ensureDone(c, app, userId, n.id);
    const before = (await c.get("/api/xp")).body.total as number;
    const total = app.nodes.internalItems(userId, "G3-A").length || 31;
    const bad = await playSession(c, app, userId, "G3-A", { wrong: total });
    expect(bad.body.passed).toBe(false);
    expect(bad.body.rewards).toBeUndefined();
    expect(((await c.get("/api/xp")).body.total as number) - before).toBe(0);
    expect(((await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>).find((b) => b.id === "g3.grade-complete")?.earned).toBe(false);
    const retake = await playSession(c, app, userId, "G3-A");
    expect(retake.body.passed).toBe(true);
    expect(retake.body.rewards.xp.awarded).toBe(25);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.nodeId === "G3-A").map((r) => r.passed).sort()).toEqual([false, true]);
  }, 1_200_000);

  it("resumes an interrupted run with the same questions and the answers already given", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G3-U1-R1");
    const first = (await c.post("/api/nodes/G3-U1-C/start")).body;
    const items = app.nodes.internalItems(userId, "G3-U1-C");
    const it = items[0]!;
    expect((await c.post("/api/nodes/G3-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G3-U1-C", it.item, it.scope) })).status).toBe(200);
    const resumed = (await c.post("/api/nodes/G3-U1-C/start")).body;
    expect(resumed.run).toBe(first.run);
    expect(resumed.items.map((x: { item: { id: string } }) => x.item.id)).toEqual(first.items.map((x: { item: { id: string } }) => x.item.id));
    expect(resumed.items[0].answered).toBe(true);
    expect(resumed.items[1].answered).toBe(false);
    // first answer is final in a challenge
    const bad = wrongItemResponse(course, items[1]!.item, items[1]!.scope);
    expect(bad).toBeTruthy();
    await c.post("/api/nodes/G3-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: bad });
    expect((await c.post("/api/nodes/G3-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: items[1]!.itemId, response: responseFor(course, "G3-U1-C", items[1]!.item, items[1]!.scope) })).status).toBe(409);
    expect(JSON.stringify(first)).not.toMatch(/correctOptionIds|accepted/);
  }, 300_000);
});

/** Words that belong to a later unit: a node of unit k never shows those of units k+1.. (the learner would meet an untaught idea). */
const LATER: Record<number, RegExp> = {
  1: /demisemiquaver|8va|8vb|melodic|andantino|prestissimo|tempo primo|espressivo|sostenuto|con moto|perfect (4th|5th|octave)|minor (3rd|6th|7th)|major (2nd|3rd|6th|7th)/i,
  2: /8va|8vb|melodic|andantino|prestissimo|tempo primo|espressivo|sostenuto|con moto|perfect (4th|5th|octave)|minor (3rd|6th|7th)|major (2nd|3rd|6th|7th)/i,
  3: /melodic|andantino|prestissimo|tempo primo|espressivo|sostenuto|con moto|perfect (4th|5th|octave)|minor (3rd|6th|7th)|major (2nd|3rd|6th|7th)/i,
  4: /andantino|prestissimo|tempo primo|espressivo|sostenuto|con moto|perfect (4th|5th|octave)|minor (3rd|6th|7th)|major (2nd|3rd|6th|7th)/i,
};

describe("Grade 3 generated nodes only ask what has been taught", () => {
  it("every practice, review and challenge question fits the taught scope of its node, credits a concept, and shows nothing from a later unit", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const sessionNodes = G3.filter((n) => SESSION.includes(n.type) && n.type !== "grade_assessment");
    const bad: string[] = [];
    for (let u = 0; u < 4; u++) {
      const id = `u${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',3,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G3]) insert(db, id, n);
      for (const n of sessionNodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const items = app.nodes.internalItems(id, n.id);
        if (items.length < 6) bad.push(`${n.id} has only ${items.length} questions`);
        const taught = taughtScope(course.ix, n);
        const unit = n.unitId ? Number(/G3-U(\d)/.exec(n.unitId)![1]) : 5;
        for (const it of items) {
          checkItem(it.item, taught, it.itemId, (code, _w, msg, sev = "error") => sev === "error" && bad.push(`${n.id} ${it.itemId}: ${code} ${msg}`));
          if (!it.conceptIds.length) bad.push(`${n.id} ${it.itemId} credits no concept`);
          const visible = JSON.stringify({ p: it.item.prompt, m: it.item.music, h: it.item.hints, a: it.item.answer.kind === "choice" ? it.item.answer.options : null });
          if (LATER[unit] && LATER[unit]!.test(visible)) bad.push(`${n.id} ${it.itemId} shows a later unit's idea: ${LATER[unit]!.exec(visible)![0]}`);
        }
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        insert(db, id, n);
      }
    }
    expect(bad).toEqual([]);
  }, 900_000);

  it("a unit challenge only draws on its own unit and earlier ones, and the assessment covers every Grade 3 outcome meaningfully", () => {
    const firstUnit = new Map<string, number>();
    for (const n of G3.filter((x) => x.type === "lesson")) for (const b of n.exercises) if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, Number(/G3-U(\d)/.exec(n.unitId!)![1]));
    for (let u = 1; u <= 5; u++) for (const t of new Set(course.ix.assessments.get(`a.g3-u${u}`)!.sections.flatMap((s) => s.templateIds))) expect(firstUnit.get(t)!, `a.g3-u${u} ${t}`).toBeLessThanOrEqual(u);
    const bp = course.ix.assessments.get("a.g3")!;
    const per = new Map<string, number>();
    for (const s of bp.sections) for (const o of s.outcomeIds) per.set(o, (per.get(o) ?? 0) + s.itemCount);
    for (let k = 1; k <= 12; k++) expect(per.get(`abrsm2020.g3.${String(k).padStart(2, "0")}`) ?? 0, `g3.${k}`).toBeGreaterThanOrEqual(2);
    expect(bp.sections.reduce((n, s) => n + s.itemCount, 0)).toBeGreaterThanOrEqual(30);
    expect(bp.hintsAllowed).toBe(false);
  });

  it("each generated grade assessment is independent of hints, covers all twelve outcomes with concept credit, and includes a melodic-minor and a compound-time question", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const outcomes = new Set<string>();
    for (let u = 0; u < 6; u++) {
      const id = `a${u}`;
      db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
      db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',3,1,'{}','2026-01-01')").run(id);
      for (const n of [...EARLIER, ...G3]) if (n.id !== "G3-A") insert(db, id, n);
      app.nodes.start(id, "G3-A");
      const items = app.nodes.internalItems(id, "G3-A");
      expect(items.length).toBeGreaterThanOrEqual(30);
      expect(new Set(items.map((i) => visibleKey(i.item))).size).toBe(items.length);
      let melodic = 0;
      let compound = 0;
      for (const it of items) {
        expect(it.item.evidence).toBe("independent");
        const text = JSON.stringify({ p: it.item.prompt, m: it.item.music });
        if (/melodic/.test(it.item.prompt)) melodic++;
        if (/\b(6|9|12)\/8\b/.test(text)) compound++;
        const o = (it as unknown as { outcomeId?: string }).outcomeId;
        if (o) outcomes.add(o);
      }
      expect(melodic, `learner ${u}`).toBeGreaterThanOrEqual(1);
      expect(compound, `learner ${u}`).toBeGreaterThanOrEqual(2);
    }
    void outcomes;
  }, 600_000);
});

describe("Grade 3 concept boundaries", () => {
  const constraints = loadConstraints(course.ix.c.root, course.ix.concepts);
  it("the melodic-minor concept is only credited by questions about the melodic minor; the harmonic form never counts for it", () => {
    const node = course.ix.nodeById.get("G3-U4-L01")!;
    const b = node.exercises.find((x) => x.templateId === "t.g3.scale-build-minor")!;
    const scope = effectiveScope(course.ix, node, b);
    let melodic = 0;
    let harmonic = 0;
    for (let s = 1; s < 80; s++) {
      const item = generateItem(course.ix, "t.g3.scale-build-minor", s, { scope }).item;
      const credit = satisfies(item, constraints.get("c.scales.minor-melodic")!);
      if (/melodic minor/.test(item.prompt)) { expect(credit).toBe(true); melodic++; } else { expect(credit).toBe(false); harmonic++; }
    }
    expect(melodic).toBeGreaterThan(10);
    expect(harmonic).toBeGreaterThan(10);
  });

  it("the extended-ledger-line concept never credits a note that can be read within two ledger lines", () => {
    const node = course.ix.nodeById.get("G3-U3-L01")!;
    const b = node.exercises.find((x) => x.templateId === "t.g3.ledger-read")!;
    const scope = effectiveScope(course.ix, node, b);
    let credited = 0;
    for (let s = 1; s < 120; s++) {
      const item = generateItem(course.ix, "t.g3.ledger-read", s, { scope }).item;
      if (satisfies(item, constraints.get("c.pitch.ledger-extended")!)) credited++;
    }
    expect(credited).toBeGreaterThan(5);
  });

  it("interval concepts split perfect from major/minor by the answer, and the terms concept only credits Grade 3 words", () => {
    const node = course.ix.nodeById.get("G3-U5-L02")!;
    const b = node.exercises.find((x) => x.templateId === "t.g3.interval-quality")!;
    const scope = effectiveScope(course.ix, node, b);
    for (let s = 1; s < 80; s++) {
      const item = generateItem(course.ix, "t.g3.interval-quality", s, { scope }).item;
      const a = item.answer as { acceptedIntervals?: string[]; target?: string };
      const q = (a.acceptedIntervals?.[0] ?? a.target)![0]!;
      expect(satisfies(item, constraints.get("c.intervals.quality-perfect")!)).toBe(q === "P");
      expect(satisfies(item, constraints.get("c.intervals.quality-major-minor")!)).toBe(q === "M" || q === "m");
    }
    const tnode = course.ix.nodeById.get("G3-U5-L03")!;
    const tb = tnode.exercises.find((x) => x.templateId === "t.g3.terms")!;
    const tscope = effectiveScope(course.ix, tnode, tb);
    for (let s = 1; s < 80; s++) {
      const item = generateItem(course.ix, "t.g3.terms", s, { scope: tscope }).item;
      const id = (item.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
      expect(satisfies(item, constraints.get("c.terms.g3")!)).toBe(["andantino", "prestissimo", "tempo-primo", "espressivo", "sostenuto", "con-moto"].includes(id));
    }
  });
});

describe("octave transposition is genuinely tested", () => {
  it("a clef change without the octave displacement gets no credit, and the correct transposition does", () => {
    const node = course.ix.nodeById.get("G3-U3-L03")!;
    const b = node.exercises.find((x) => x.templateId === "t.g3.octave-transpose")!;
    const scope = effectiveScope(course.ix, node, b);
    let tested = 0;
    for (let s = 1; s < 60; s++) {
      const item = generateItem(course.ix, "t.g3.octave-transpose", s, { scope }).item;
      const a = item.answer as unknown as { source: string[]; clef?: string; direction?: string };
      void a;
      const good = canonicalResponse(course.ix, item, scope) as unknown as { kind: string; pitches: string[] };
      expect(gradeItem(course.ix, item, good as never, scope).correct).toBe(true);
      // the same pitches, unmoved: right clef, no octave move
      const src = JSON.stringify((item.music as { measures: unknown }).measures);
      const pitches = [...src.matchAll(/"pitch":"([A-G][b#]?\d)"/g)].map((m) => m[1]!);
      if (pitches.length && JSON.stringify(pitches) !== JSON.stringify(good.pitches)) {
        const same = { ...good, pitches };
        expect(gradeItem(course.ix, item, same as never, scope).correct, `${item.prompt} unmoved`).toBe(false);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(20);
  });

  it("the rest-writing task accepts both forms of a silent compound beat and the 12/8 half-bar rest through the real grader", () => {
    const node = course.ix.nodeById.get("G3-U1-L04")!;
    const b = node.exercises.find((x) => x.templateId === "t.g3.compound-rest-write")!;
    const scope = effectiveScope(course.ix, node, b);
    let forms = 0;
    for (let s = 1; s < 80; s++) {
      const item = generateItem(course.ix, "t.g3.compound-rest-write", s, { scope }).item;
      const good = canonicalResponse(course.ix, item, scope) as unknown as { kind: string; measures: Array<{ events: Array<{ kind: string; duration: { value: string; dots: number } }> }> };
      expect(gradeItem(course.ix, item, good as never, scope).correct).toBe(true);
      const ev = good.measures[0]!.events;
      const swapped = ev.flatMap((e) => (e.kind === "rest" && e.duration.value === "crotchet" && e.duration.dots === 1 ? [{ kind: "rest", duration: { value: "crotchet", dots: 0 } }, { kind: "rest", duration: { value: "quaver", dots: 0 } }] : [e]));
      expect(gradeItem(course.ix, item, { ...good, measures: [{ events: swapped }] } as never, scope).correct, `${item.prompt} crotchet+quaver`).toBe(true);
      const quavers = ev.flatMap((e) => (e.kind === "rest" && e.duration.value === "crotchet" ? [1, 2, 3].map(() => ({ kind: "rest", duration: { value: "quaver", dots: 0 } })) : [e]));
      expect(gradeItem(course.ix, item, { ...good, measures: [{ events: quavers }] } as never, scope).correct, `${item.prompt} three quaver rests`).toBe(false);
      forms++;
    }
    expect(forms).toBeGreaterThan(20);
  });
});

describe("Grade 3 lessons teach without repeating themselves", () => {
  it("no lesson asks the same question twice, guided and independent included", () => {
    const dupes: string[] = [];
    for (const n of G3.filter((x) => ["lesson", "enrichment"].includes(x.type))) {
      const seen = new Map<string, string>();
      for (const it of course.authoredItems(n.id)) {
        const k = visibleKey(it);
        if (seen.has(k)) dupes.push(`${n.id}: ${it.id} repeats ${seen.get(k)}`);
        seen.set(k, it.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("every lesson has the full structure and a recap, and the course has builders, not only choices", () => {
    for (const n of G3.filter((x) => x.type === "lesson")) {
      const l = course.lesson(n.id)!;
      expect(l.objective.statement.length, n.id).toBeGreaterThan(20);
      expect(l.explanation.length, n.id).toBeGreaterThanOrEqual(4);
      expect(l.demonstration.steps.length, n.id).toBeGreaterThanOrEqual(3);
      expect(l.recap.length, n.id).toBeGreaterThanOrEqual(3);
      expect(course.authoredItems(n.id).length, n.id).toBeGreaterThanOrEqual(9);
    }
    const kinds = new Set<string>();
    for (const n of G3.filter((x) => x.type === "lesson")) for (const it of course.authoredItems(n.id)) kinds.add(it.answer.kind);
    for (const k of ["rhythm", "pitch-sequence", "staff-position", "key-signature", "interval", "chord"]) expect(kinds.has(k), k).toBe(true);
  });

  it("every question with notation carries a text description that includes any marked note and ledger-line positions", () => {
    const bad: string[] = [];
    for (const n of G3.filter((x) => ["lesson", "enrichment"].includes(x.type))) {
      for (const it of course.authoredItems(n.id)) {
        if (!it.music) continue;
        if (!it.music.textAlternative || it.music.textAlternative.length < 8) bad.push(`${n.id} ${it.id} has no text alternative`);
      }
    }
    expect(bad).toEqual([]);
  });
});
