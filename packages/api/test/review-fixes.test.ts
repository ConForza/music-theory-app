import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { questionKey, visibleKey } from "../src/question-key.ts";
import { Client, ensureDone, playSession, realCourse, register, responseFor } from "./helpers.ts";

/** Regression tests for the independent review of Brief 05 (F2, F3, F4, F5, F8). */
const course = realCourse();
const G1 = course.nodes.filter((n) => n.grade === 1);

function seedLearner(db: ReturnType<typeof openDb>, id: string) {
  db.prepare("INSERT INTO users (id,email,password_hash,display_name,is_guest,created_at,last_seen_at) VALUES (?,NULL,NULL,'t',1,?,?)").run(id, "2026-01-01", "2026-01-01");
  db.prepare("INSERT INTO profiles (user_id,experience,selected_grade,onboarded,settings,updated_at) VALUES (?,'new',1,1,'{}','2026-01-01')").run(id);
  for (const n of G1) db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
}
async function learner() {
  const db = openDb(":memory:");
  const app = createApp({ db, course });
  const c = new Client(app);
  const me = await register(c);
  return { db, app, c, userId: me.body.user.id as string };
}

describe("F2: every challenge and assessment section tests the outcome it is labelled with", () => {
  it("each section is filled to its stated count, with questions that credit a concept of that outcome, for many learners", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const nodes = G1.filter((n) => n.type === "unit_challenge" || n.type === "grade_assessment");
    expect(nodes).toHaveLength(8);
    let sections = 0;
    for (let u = 0; u < 5; u++) {
      const id = `f2-${u}`;
      seedLearner(db, id);
      for (const n of nodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const bp = course.ix.assessments.get(n.assessmentId!)!;
        const items = app.nodes.internalItems(id, n.id);
        for (const s of bp.sections) {
          sections++;
          const wanted = new Set([...course.ix.concepts.values()].filter((c) => c.outcomeIds.some((o) => s.outcomeIds.includes(o))).map((c) => c.id));
          const mine = items.filter((i) => i.sectionId === s.id);
          expect(mine, `${n.id} ${s.id} (${id})`).toHaveLength(s.itemCount);
          for (const i of mine) expect(i.conceptIds.some((c) => wanted.has(c)), `${n.id} ${s.id}: ${i.itemId} credits ${i.conceptIds}`).toBe(true);
        }
        expect(items.length).toBe(bp.sections.reduce((t, s) => t + s.itemCount, 0));
        db.prepare("INSERT OR REPLACE INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
      }
    }
    expect(sections).toBeGreaterThanOrEqual(5 * 21);
  }, 300_000);
});

describe("F3: stale questions before completion never score as a shrunken set", () => {
  it("answers on a run whose template has moved on give 409, and no result, XP or badge", async () => {
    const { db, app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U1-R1");
    await c.post("/api/nodes/G1-U1-C/start");
    const items = app.nodes.internalItems(userId, "G1-U1-C");
    for (const it of items) {
      const r = await c.post("/api/nodes/G1-U1-C/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, "G1-U1-C", it.item, it.scope) });
      expect(r.status).toBe(200);
    }
    const xpBefore = (await c.get("/api/xp")).body.total;
    // A deployment changes one template between the last answer and "finish".
    const row = db.prepare("SELECT run, items FROM node_sessions WHERE user_id = ? AND node_id = ? ORDER BY run DESC LIMIT 1").get(userId, "G1-U1-C") as { run: number; items: string };
    const planned = JSON.parse(row.items) as Array<{ templateVersion: number }>;
    planned[0]!.templateVersion += 100;
    db.prepare("UPDATE node_sessions SET items = ? WHERE user_id = ? AND node_id = ? AND run = ?").run(JSON.stringify(planned), userId, "G1-U1-C", row.run);
    const done = await c.post("/api/nodes/G1-U1-C/complete");
    expect(done.status).toBe(409);
    expect(done.body.error?.code ?? done.body.code).toBe("stale_items");
    expect((db.prepare("SELECT COUNT(*) AS n FROM assessment_results WHERE user_id = ? AND node_id = ?").get(userId, "G1-U1-C") as { n: number }).n).toBe(0);
    expect((await c.get("/api/xp")).body.total).toBe(xpBefore);
    expect((await c.get("/api/progress")).body.nodes["G1-U1-C"].state).not.toBe("completed");
  }, 120_000);
});

describe("F4: a hint spends the question's freshness even if it is never answered", () => {
  it("records exposure under the question's identity when a practice hint is shown", async () => {
    const { db, app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U3-L07");
    await c.post("/api/nodes/G1-U3-P1/start");
    const it = app.nodes.internalItems(userId, "G1-U3-P1")[0]!;
    const key = questionKey(it.item);
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM question_exposure WHERE user_id = ? AND question_key = ?").get(userId, key) as { n: number }).n;
    expect(count()).toBe(0);
    expect((await c.post("/api/nodes/G1-U3-P1/hint", { itemId: it.itemId, level: 1 })).status).toBe(200);
    expect(count()).toBe(1);
    const seen = app.engagement.mastery.seenKeys(userId, it.conceptIds[0]!);
    expect(seen.has(key)).toBe(true);
  }, 120_000);
});

describe("F5: question identity ignores explanation text but keeps what the learner sees", () => {
  it("adding or changing wrong-option diagnoses does not change the key; changing the picture or an option label does", () => {
    const node = G1.find((n) => n.id === "G1-U1-L01")!;
    const it = course.authoredItems(node.id).find((i) => i.answer.kind === "choice")!;
    const base = questionKey(it);
    const withDiag = { ...it, answer: { ...it.answer, diagnoses: { x: { category: "c", reason: "r" } } } } as typeof it;
    expect(questionKey(withDiag)).toBe(base);
    const changed = { ...it, prompt: it.prompt + " (different)" };
    expect(questionKey(changed)).not.toBe(base);
  });
});

describe("F8: a saved review URL from before a content update recovers instead of dead-ending", () => {
  it("an open review whose questions were all replaced is not completable, and Start closes and rebuilds it", async () => {
    const { db, c, userId } = await learner();
    const date = (await c.get("/api/review")).body.today ?? new Date().toISOString().slice(0, 10);
    const stale = [{ itemId: "i.gen.gone.v1.s1.deadbeef", conceptId: "c.pitch.letter-names", kind: "review", stale: true }];
    db.prepare("INSERT INTO review_sessions (user_id,id,status,started_at,local_date,timezone,curriculum_version,rules_version,items) VALUES (?,?,'open',?,?,?,?,?,?)").run(userId, "old-session", new Date().toISOString(), date, "UTC", "0", "0", JSON.stringify(stale));
    const view = await c.get("/api/review/sessions/old-session");
    expect(view.status).toBe(200);
    expect(view.body.status).toBe("open");
    expect(view.body.items).toEqual([]);
    // never completed as an empty review: no summary, no XP
    const done = await c.post("/api/review/sessions/old-session/complete");
    expect(done.status).toBe(409);
    const started = await c.post("/api/review/sessions");
    expect(started.status).toBe(200);
    expect(started.body.session?.id ?? null).not.toBe("old-session");
    const row = db.prepare("SELECT status FROM review_sessions WHERE user_id = ? AND id = 'old-session'").get(userId) as { status: string };
    expect(row.status).toBe("abandoned");
  });
});

describe("no repeated question inside one run, even with the options in another order", () => {
  it("every practice, review, challenge and assessment run has distinct learner-visible questions, for many learners", () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const nodes = G1.filter((n) => ["practice", "review", "unit_challenge", "grade_assessment"].includes(n.type));
    const dupes: string[] = [];
    for (let u = 0; u < 12; u++) {
      const id = `dup-${u}`;
      seedLearner(db, id);
      for (const n of nodes) {
        db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(id, n.id);
        app.nodes.start(id, n.id);
        const seen = new Set<string>();
        for (const it of app.nodes.internalItems(id, n.id)) {
          const k = visibleKey(it.item);
          if (seen.has(k)) dupes.push(`${n.id} (${id}): ${it.itemId}`);
          seen.add(k);
        }
        db.prepare("INSERT OR REPLACE INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(id, n.id, n.contentVersion, course.version, "2026-01-01", "2026-01-01", "2026-01-01", n.contentVersion);
      }
    }
    expect(dupes).toEqual([]);
  }, 300_000);

  it("the reported pair (same rest question, options reordered) has one visible identity", () => {
    const a = { id: "x", templateId: "t.g1.rest", prompt: "Which rest lasts as long as a semiquaver?", answer: { kind: "choice", options: [{ id: "a", label: "minim rest" }, { id: "b", label: "quaver rest" }], correctOptionIds: ["b"] } } as never;
    const b = { id: "y", templateId: "t.g1.rest", prompt: "Which rest lasts as long as a semiquaver?", answer: { kind: "choice", options: [{ id: "b", label: "quaver rest" }, { id: "a", label: "minim rest" }], correctOptionIds: ["b"] } } as never;
    expect(visibleKey(a)).toBe(visibleKey(b));
  });
});

describe("challenge results read in plain words", () => {
  it("section headings are the outcome statements, not internal identifiers", async () => {
    const { app, c, userId } = await learner();
    await ensureDone(c, app, userId, "G1-U1-R1");
    const done = await playSession(c, app, userId, "G1-U1-C", { wrong: 8 });
    const titles = (done.body.summary?.sections ?? done.body.sections ?? []).map((s: { title: string }) => s.title);
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t).not.toMatch(/abrsm2020\./);
  }, 300_000);
});

describe("F5 (upgrade): question identity of Brief 04 questions is unchanged", () => {
  it("every question the Brief 04 release could generate (seeds 1-6, golden keys recorded from that release) keeps its key", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { buildIndex, effectiveScope, loadCurriculum } = await import("@mtp/curriculum");
    const { generateItem } = await import("@mtp/engine");
    const golden = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/brief04-question-keys.json", import.meta.url)), "utf8")) as Record<string, string>;
    const { curriculum } = loadCurriculum(fileURLToPath(new URL("./fixtures/legacy-content", import.meta.url)));
    const ix = buildIndex(curriculum!);
    const now: Record<string, string> = {};
    const seen = new Set<string>();
    for (const node of ix.nodes) for (const b of node.exercises) {
      if (seen.has(b.templateId)) continue;
      seen.add(b.templateId);
      const scope = effectiveScope(ix, node, b);
      for (let s = 1; s <= 6; s++) { try { now[`${b.templateId}#${s}`] = questionKey(generateItem(ix, b.templateId, s, { scope }).item); } catch { /* skipped seed */ } }
    }
    const drift = Object.keys(golden).filter((k) => now[k] !== golden[k]);
    expect(Object.keys(golden).length).toBeGreaterThan(300);
    expect(drift).toEqual([]);
    // the question a reviewer hinted on the Brief 04 release (A4-B4, tone or semitone)
    expect(golden["t.g1.tone-semitone#2"]).toBe("8950de608660be6d3ad16ca9");
  }, 120_000);
});

describe("F6 (authored melodies): the description gives the stimulus, not the answer", () => {
  it("every melody question tells the listener the tempo word, signatures and marked-note position, and never the key name or a sign's meaning", () => {
    const items = course.authoredItems("G1-U7-L05").filter((i) => i.id.includes(".melody-"));
    expect(items.length).toBe(6);
    for (const it of items) {
      const alt = it.music!.textAlternative;
      expect(alt, it.id).toMatch(/Andante|Allegretto|Moderato/);
      expect(alt, it.id).toMatch(/key signature of (one|two) (sharps?|flats?)/);
      expect(alt, it.id).toMatch(/time signature \d\/4/);
      expect(alt, it.id).not.toMatch(/\b[A-G]( flat| sharp)? major\b/i);
      expect(alt, it.id).not.toMatch(/accent|staccato|legato|fermata|walking|rest\b/i);
    }
  });
  it("the rests lesson does not claim that any two rests last two beats", () => {
    const text = JSON.stringify(course.lesson("G1-U1-L04") ?? {});
    expect(text.length).toBeGreaterThan(100);
    expect(text).toMatch(/Count rests by their value/);
    expect(text).not.toMatch(/Two rests, two beats of silence/);
  });
});
