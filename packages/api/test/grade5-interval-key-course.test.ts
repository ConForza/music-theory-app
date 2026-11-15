import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { Client, ensureDone, playSession, realCourse, register } from "./helpers.ts";

/**
 * PR #14 reconciled with the complete Grade 1-5 app: intervals identified and written under key signatures (G5-U3-L07), optional rewriting between
 * simple and compound time (G5-U1-E1, never assessed), a rebalanced Grade 5 assessment (still 39 questions, still 26 right to pass) and clearer wording.
 * What matters here: a learner who finished Grades 1-5 before this change keeps everything, the new nodes are playable through the real server,
 * and what the blueprint now promises holds in the plans the planner really makes.
 */
const course = realCourse();
const NEW_NODES = new Set(["G5-U3-L07", "G5-U1-E1"]);
const OLD = course.nodes.filter((n) => n.grade <= 5 && !NEW_NODES.has(n.id));
const done = "'questions'";
const insert = (db: ReturnType<typeof openDb>, id: string, n: (typeof OLD)[number]) =>
  db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,${done},?,?,?,?,?,?)`).run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);

async function learner(name = "learner", completeOld = true) {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c, name);
  const userId = me.body.user.id as string;
  if (completeOld) for (const n of OLD) insert(db, userId, n);
  return { db, app, c, userId };
}

describe("the new nodes", () => {
  it("G5-U3-L07 is a required, playable lesson before the unit practice; G5-U1-E1 is optional, playable and gates nothing", () => {
    const l7 = course.ix.nodeById.get("G5-U3-L07")!;
    expect(l7.optional).toBe(false);
    expect(l7.type).toBe("lesson");
    expect(course.isPlayable("G5-U3-L07")).toBe(true);
    expect(l7.resolvedUnlockAfter).toContain("G5-U3-L06");
    expect(course.ix.nodeById.get("G5-U3-P1")!.resolvedUnlockAfter).toContain("G5-U3-L07");
    expect(l7.exercises.map((b) => b.templateId).sort()).toEqual(["t.g5.interval-key-build", "t.g5.interval-key-identify"]);
    const e1 = course.ix.nodeById.get("G5-U1-E1")!;
    expect(e1.optional).toBe(true);
    expect(e1.type).toBe("enrichment");
    expect(course.isPlayable("G5-U1-E1")).toBe(true);
    for (const n of course.nodes.filter((x) => x.grade === 5 && x.id !== "G5-U1-E1")) expect(n.resolvedUnlockAfter, n.id).not.toContain("G5-U1-E1");
  });

  it("the practice, review and challenge nodes of Unit 3 and the later reviews draw on the interval-key templates; no practice, review, challenge or assessment ever draws the optional rewrite template", () => {
    const uses = (id: string, t: string) => course.ix.nodeById.get(id)!.exercises.some((b) => b.templateId === t);
    for (const id of ["G5-U3-P1", "G5-U4-R1", "G5-U5-R1"]) expect(uses(id, "t.g5.interval-key-identify"), id).toBe(true);
    for (const n of course.nodes.filter((x) => x.grade === 5 && ["practice", "review"].includes(x.type))) expect(uses(n.id, "t.g5.rewrite-metre"), n.id).toBe(false);
    for (const bp of course.ix.assessments.values()) for (const s of bp.sections) expect(s.templateIds, `${bp.id}/${s.id}`).not.toContain("t.g5.rewrite-metre");
  });

  it("the frozen lesson questions only use signs the lesson teaches (a natural cancelling the signature, or a sign on a letter the signature leaves natural), in every key", () => {
    const L = ["C", "D", "E", "F", "G", "A", "B"];
    const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
    const FLATS = ["B", "E", "A", "D", "G", "C", "F"];
    const MAJ: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
    const MIN: Record<string, number> = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };
    const sig = (key: string, letter: string) => { const [t, m] = key.split(" "); const f = (m === "major" ? MAJ : MIN)[t!]!; return f > 0 && SHARPS.slice(0, f).includes(letter) ? 1 : f < 0 && FLATS.slice(0, -f).includes(letter) ? -1 : 0; };
    const alter = (p: string) => { const m = /^([A-G])(bb|b|#|x)?\d$/.exec(p)!; return { letter: m[1]!, a: ({ bb: -2, b: -1, "": 0, "#": 1, x: 2 } as Record<string, number>)[m[2] ?? ""]! }; };
    const items = course.authoredItems("G5-U3-L07");
    expect(items.length).toBeGreaterThanOrEqual(9);
    for (const it of items) {
      const a = it.answer as unknown as { key: string; lower: string; upper?: string; acceptedPitches?: string[] };
      for (const p of [a.lower, a.upper ?? a.acceptedPitches![0]!]) {
        const { letter, a: x } = alter(p);
        const g = sig(a.key, letter);
        expect(x === g || (g !== 0 && x === 0) || (g === 0 && Math.abs(x) === 1), `${it.id}: ${p} in ${a.key}`).toBe(true);
      }
      expect(L).toContain(alter(a.lower).letter);
    }
  });

  it("the lesson teaches before it assesses: a worked example of a flat sign in a sharp key and of a natural cancelling the signature, with the book section that teaches it (review of PR #16, finding C)", () => {
    const lesson = JSON.parse(readFileSync(new URL("../../../content/lessons/G5-U3-L07.json", import.meta.url), "utf8")) as { explanation: Array<{ text?: string; music?: { key?: string; measures: Array<{ events: Array<{ pitch: string; writtenAccidental?: string }> }> } }> };
    const shown = lesson.explanation.flatMap((b) => (b.music ? [b.music] : []));
    const flatInSharpKey = shown.find((m) => m.key === "D major" && m.measures[0]!.events.some((e) => e.pitch === "A♭4" || e.pitch === "Ab4"));
    expect(flatInSharpKey, "a worked example with a written flat under a sharp signature").toBeTruthy();
    expect(flatInSharpKey!.measures[0]!.events.map((e) => e.writtenAccidental)).toEqual(["natural", "flat"]);
    expect(shown.some((m) => m.key === "G major" && m.measures[0]!.events.some((e) => e.writtenAccidental === "natural"))).toBe(true);
    expect(lesson.explanation.map((b) => b.text ?? "").join(" ")).toMatch(/a sign always means exactly what it says/i);
    expect(course.ix.nodeById.get("G5-U3-L07")!.bookSectionIds).toEqual(["fs.g5.s06", "fs.g4.s09"]);
  });

  it("both are completed through the real server, with evidence for the new concept only (and none for compulsory concepts from the optional node)", async () => {
    const { db, app, c, userId } = await learner();
    expect((await c.get("/api/progress")).body.nodes["G5-U3-L07"].state).toBe("available");
    await ensureDone(c, app, userId, "G5-U3-L07");
    await ensureDone(c, app, userId, "G5-U1-E1");
    const prog = (await c.get("/api/progress")).body.nodes;
    expect(prog["G5-U3-L07"].state).toBe("completed");
    expect(prog["G5-U1-E1"].state).toBe("completed");
    const rows = (n: string) => (db.prepare("SELECT DISTINCT concept_id FROM mastery_evidence WHERE user_id = ? AND node_id = ?").all(userId, n) as Array<{ concept_id: string }>).map((r) => r.concept_id);
    expect(rows("G5-U3-L07")).toEqual(["c.intervals.in-key-signature"]);
    expect(rows("G5-U1-E1")).toEqual(["c.metre.rewrite-simple-compound"]);
  }, 600_000);

  it("the Unit 3 challenge (now version 2) and the Grade 5 assessment (version 2) are passed and recorded with their blueprint version", async () => {
    const { db, app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G5-U3-L07");
    const ch = await playSession(c, app, userId, "G5-U3-C");
    expect(ch.body.passed).toBe(true);
    const a = await playSession(c, app, userId, "G5-A");
    expect(a.body.passed).toBe(true);
    const rows = db.prepare("SELECT assessment_id, assessment_version, max_score, pass_percent FROM assessment_results WHERE user_id = ? ORDER BY assessment_id").all(userId) as Array<{ assessment_id: string; assessment_version: number; max_score: number; pass_percent: number }>;
    expect(rows).toEqual([
      { assessment_id: "a.g5", assessment_version: 2, max_score: 39, pass_percent: 66 },
      { assessment_id: "a.g5-u3", assessment_version: 2, max_score: 8, pass_percent: 70 },
    ]);
  }, 900_000);
});

describe("a learner who finished Grades 1-5 before this change", () => {
  it("keeps every completion, result, evidence row and badge; only the new lesson waits for them", async () => {
    const { db, c, userId } = await learner("old");
    // a v1 Grade 5 assessment and Unit 3 challenge result, and one mastery evidence row, as an earlier build wrote them
    const detail = JSON.stringify({ sections: [], outcomes: [], mistakes: [] });
    for (const [node, id, max, pass] of [["G5-A", "a.g5", 39, 66], ["G5-U3-C", "a.g5-u3", 8, 70]] as const) {
      db.prepare("INSERT INTO assessment_results (user_id,node_id,run,kind,assessment_id,assessment_version,score,max_score,percent,pass_percent,passed,detail,curriculum_version,completed_at) VALUES (?,?,1,?,?,1,?,?,?,?,1,?,?,?)").run(userId, node, node === "G5-A" ? "assessment" : "challenge", id, max, max, 100, pass, detail, "old", "2026-01-02");
    }
    db.prepare("INSERT INTO achievements_awarded (user_id,achievement_id,awarded_at,trigger_key,evidence,rules_version) VALUES (?,?,?,?,?,?)").run(userId, "g5.grade-complete", "2026-01-02", "old", "{}", 1);
    const snap = () => ({
      progress: db.prepare("SELECT node_id, completed_at, completed_content_version FROM lesson_progress WHERE user_id = ? ORDER BY node_id").all(userId),
      results: db.prepare("SELECT node_id, assessment_version, score, max_score, passed FROM assessment_results WHERE user_id = ? ORDER BY node_id").all(userId),
      badges: db.prepare("SELECT achievement_id, awarded_at FROM achievements_awarded WHERE user_id = ? ORDER BY achievement_id").all(userId),
    });
    const before = snap();
    const nodes = (await c.get("/api/progress")).body.nodes as Record<string, { state: string }>;
    for (const n of OLD) expect(nodes[n.id]!.state, n.id).toBe("completed");
    expect(nodes["G5-U3-L07"]!.state).toBe("available");
    expect(nodes["G5-U1-E1"]!.state).toBe("available");
    expect(snap()).toEqual(before);
    const results = (await c.get("/api/results")).body.results as Array<{ nodeId: string; passed: boolean }>;
    expect(results.filter((r) => r.passed).map((r) => r.nodeId).sort()).toEqual(["G5-A", "G5-U3-C"]);
    const badges = (await c.get("/api/achievements")).body.achievements as Array<{ id: string; earned: boolean }>;
    expect(badges.find((b) => b.id === "g5.grade-complete")?.earned).toBe(true);
  });
});

describe("the rebalanced Grade 5 assessment (39 questions, 26 right to pass)", () => {
  const bp = course.ix.assessments.get("a.g5")!;

  it("keeps the size and the pass mark, asks one naming and one writing question for outcome g5.08, and names the key signature once", () => {
    expect(bp.sections.reduce((n, s) => n + s.itemCount, 0)).toBe(39);
    expect(bp.version).toBe(2);
    const s08 = bp.sections.find((s) => s.id === "o-g5-08")!;
    const s08b = bp.sections.find((s) => s.id === "o-g5-08b")!;
    expect([s08.itemCount, s08b.itemCount]).toEqual([1, 1]);
    expect(s08.outcomeIds).toEqual(["abrsm2020.g5.08"]);
    expect(s08b.outcomeIds).toEqual(["abrsm2020.g5.08"]);
    expect(s08.templateIds).toEqual(["t.g5.interval-any", "t.g5.interval-key-identify", "t.g5.interval-compound"]);
    expect(s08b.templateIds).toEqual(["t.g5.interval-write", "t.g5.interval-key-build"]);
    expect(bp.sections.find((s) => s.id === "o-g5-04")!.templateIds).not.toContain("t.g5.key-signature");
    expect(bp.sections.find((s) => s.id === "o-g5-07")!.templateIds).toContain("t.g5.key-signature");
    expect(bp.sections.find((s) => s.id === "o-g5-14")!.templateIds).toEqual(["t.g5.voices", "t.g5.voice-groups"]);
    // all sixteen outcomes are still assessed, two questions each (outcome 8 by its two sections)
    const per = new Map<string, number>();
    for (const s of bp.sections) for (const o of s.outcomeIds) if (o.startsWith("abrsm2020.g5.")) per.set(o, (per.get(o) ?? 0) + s.itemCount);
    expect([...per.keys()]).toHaveLength(16);
    for (const [o, n] of per) expect(n, o).toBe(2);
    expect(Math.ceil((39 * 66) / 100)).toBe(26);
  });

  it("holds in the plans the planner really makes: 40 learners, 40 different assessments", async () => {
    const seen = { keySig: new Set<number>(), writing: 0, naming: 0, keyInterval: 0, voiceTemplates: new Set<number>(), rewrite: 0, sizes: new Set<number>() };
    for (let u = 0; u < 40; u++) {
      const { app, c, userId, db } = await learner(`s${u}`, false);
      for (const n of OLD) if (n.id !== "G5-A") insert(db, userId, n);
      for (const id of NEW_NODES) insert(db, userId, course.ix.nodeById.get(id)! as never);
      const start = (await c.post("/api/nodes/G5-A/start")).body;
      expect(start.items).toHaveLength(39);
      const planned = app.nodes.internalItems(userId, "G5-A");
      seen.sizes.add(planned.length);
      const t = (s: string) => planned.filter((p) => p.sectionId === s).map((p) => p.item.templateId);
      const ids = planned.map((p) => p.item.templateId);
      seen.keySig.add(ids.filter((x) => x === "t.g5.key-signature").length);
      expect(t("o-g5-08")).toHaveLength(1);
      expect(t("o-g5-08b")).toHaveLength(1);
      if (["t.g5.interval-any", "t.g5.interval-key-identify", "t.g5.interval-compound"].includes(t("o-g5-08")[0]!)) seen.naming++;
      if (["t.g5.interval-write", "t.g5.interval-key-build"].includes(t("o-g5-08b")[0]!)) seen.writing++;
      seen.keyInterval += ids.filter((x) => x.startsWith("t.g5.interval-key")).length > 0 ? 1 : 0;
      seen.voiceTemplates.add(new Set(t("o-g5-14")).size);
      seen.rewrite += ids.filter((x) => x === "t.g5.rewrite-metre").length;
    }
    expect([...seen.sizes]).toEqual([39]);
    expect([...seen.keySig]).toEqual([1]); // exactly one key-signature question in every assessment (it was one or two)
    expect(seen.naming).toBe(40);
    expect(seen.writing).toBe(40); // every assessment asks one interval-writing question (it was 72% of them)
    expect(seen.keyInterval).toBeGreaterThan(10); // and the key-signature intervals really appear
    expect([...seen.voiceTemplates]).toEqual([2]); // two different voice templates, never the same one twice
    expect(seen.rewrite).toBe(0);
  }, 900_000);
});
