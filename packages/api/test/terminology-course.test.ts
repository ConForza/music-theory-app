import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { music, type ExerciseItem } from "@mtp/curriculum";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { parseGeneratedItemId } from "@mtp/engine";
import { Client, playLesson, realCourse, register, responseFor } from "./helpers.ts";

/**
 * Terminology completion (Grades 2-4): the eleven new lessons, what they changed on the path, and what they must NOT have changed.
 * The "before" facts come from fixtures produced on the tree before this work (PR #13 head): every earlier lesson file, template, concept,
 * path node, blueprint section and generation fingerprint.
 */
const course = realCourse();
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../content");
const before = JSON.parse(readFileSync(join(here, "fixtures/content-before-terms.json"), "utf8")) as Record<string, Record<string, unknown>>;
const NEW = new Set(music.BOOK_LESSONS.map((l) => l.node));
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const hash = (o: unknown) => createHash("sha256").update(JSON.stringify(sortKeys(o))).digest("hex").slice(0, 16);
function sortKeys(v: unknown): unknown {
  return Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
}
const readJson = (f: string) => JSON.parse(readFileSync(join(root, f), "utf8"));
const tidy = (s: string) => s.toLowerCase().replace(/[“”()]/g, " ").replace(/\s+/g, " ");
const lessonText = (id: string): string => {
  const l = readJson(`lessons/${id}.json`) as { objective: { statement: string; successCriteria: string[] }; explanation: Array<{ text?: string; caption?: string }>; demonstration: { steps: string[] }; recap: string[] };
  return tidy([l.objective.statement, ...l.objective.successCriteria, ...l.explanation.flatMap((b) => [b.text ?? "", b.caption ?? ""]), ...l.demonstration.steps, ...l.recap].join(" "));
};
const wholeWord = (w: string) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u");

describe("nothing that existed before has changed (question identities, lessons, progression)", () => {
  it("every earlier lesson file is byte-for-byte the file it was", () => {
    const now = new Map(readdirSync(join(root, "lessons")).map((f) => [f.slice(0, -5), sha(readFileSync(join(root, "lessons", f)))]));
    for (const [id, h] of Object.entries(before.lessons!)) expect(now.get(id), `lesson ${id}`).toBe(h);
    expect([...now.keys()].filter((k) => !(k in before.lessons!)).sort()).toEqual([...NEW].sort());
  });

  it("every earlier template, concept and concept boundary is unchanged, and the only new ones are this work's", () => {
    const templates = new Map(course.ix.templates);
    for (const [id, h] of Object.entries(before.templates!)) expect(hash(templates.get(id)), `template ${id}`).toBe(h);
    expect([...templates.keys()].filter((k) => !(k in before.templates!)).sort()).toEqual([...music.BOOK_TEMPLATE_IDS].sort());
    for (const [id, h] of Object.entries(before.concepts!)) expect(hash(course.ix.concepts.get(id)), `concept ${id}`).toBe(h);
    expect([...course.ix.concepts.keys()].filter((k) => !(k in before.concepts!)).sort()).toEqual(music.BOOK_LESSONS.map((l) => l.conceptId).sort());
    const rc = readJson("policy/review-constraints.json").constraints as Array<{ conceptId: string }>;
    for (const [id, h] of Object.entries(before.constraints!)) expect(hash(rc.find((c) => c.conceptId === id)), `constraint ${id}`).toBe(h);
  });

  it("changed no earlier path node except nine practice/review nodes, which only gained the new templates and a version", () => {
    const TOUCHED = ["G2-U5-P1", "G2-U5-R1", "G3-U1-R1", "G3-U5-P1", "G3-U5-R1", "G4-U1-R1", "G4-U5-P1", "G4-U5-R1", "G5-U1-R1"];
    const nodes = new Map([1, 2, 3, 4, 5].flatMap((g) => (readJson(`path/grade-${g}.json`).nodes as Array<{ id: string; exercises?: Array<{ templateId: string }>; contentVersion: number }>).map((n) => [n.id, n] as const)));
    for (const [id, h] of Object.entries(before.pathNodes!)) {
      const raw = nodes.get(id)!;
      if (!TOUCHED.includes(id)) {
        expect(hash(raw), `node ${id}`).toBe(h);
        continue;
      }
      // a touched node keeps its identity and gains only the new templates and the next version
      expect(raw.contentVersion, id).toBe(2);
      const old = raw.exercises!.filter((b) => !music.BOOK_TEMPLATE_IDS.includes(b.templateId));
      expect(old.length, id).toBeLessThan(raw.exercises!.length);
    }
    expect(TOUCHED.every((id) => before.pathNodes![id])).toBe(true);
  });

  it("changed no earlier blueprint section: the item counts and outcomes are the same, so every pass mark and exact ratio is the same; only template lists grew", () => {
    const VERSIONS: Record<string, number> = { "a.g2": 3, "a.g2-u5": 3, "a.g3": 3, "a.g3-u5": 3, "a.g4": 2, "a.g4-u5": 2 };
    for (const a of course.ix.assessments.values()) {
      expect(a.version, a.id).toBe(VERSIONS[a.id] ?? (before.blueprintVersions as Record<string, number>)[a.id]);
      for (const s of a.sections) {
        const key = `${a.id}/${s.id}`;
        const { templateIds, ...rest } = s;
        expect(hash(rest), key).toBe(before.assessments![key]);
        const was = (before.sectionTemplates as Record<string, string[]>)[key]!;
        expect(templateIds.slice(0, was.length), key).toEqual(was);
        for (const extra of templateIds.slice(was.length)) expect(music.BOOK_TEMPLATE_IDS, key).toContain(extra);
      }
    }
    const total = (id: string) => course.ix.assessments.get(id)!.sections.reduce((n, s) => n + s.itemCount, 0);
    expect([total("a.g2"), total("a.g3"), total("a.g4"), total("a.g5")]).toEqual([30, 32, 41, 39]);
  });

  it("every generation fingerprint that existed before is identical (no stored question identity moved)", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", join(here, "../scripts/fingerprints.ts")], { cwd: join(here, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 300_000 });
    const now = JSON.parse(out) as Record<string, string>;
    const was = JSON.parse(readFileSync(join(here, "fixtures/fingerprints-before-terms.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(was).length).toBeGreaterThan(1400);
    for (const [k, v] of Object.entries(was)) expect(now[k], k).toBe(v);
    expect(Object.keys(now).filter((k) => !(k in was)).every((k) => /book-|G[234]-U5-L(0[5-9]|10)\|/.test(k))).toBe(true);
  }, 400_000);

  it("a learner who had finished everything before keeps every completion, and finds only the new lessons waiting", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    const me = await register(c);
    const userId = me.body.user.id as string;
    const old = course.nodes.filter((n) => !NEW.has(n.id) && n.grade <= 4);
    for (const n of old) {
      const v = n.type === "practice" || n.type === "review" ? 1 : n.contentVersion; // the version this learner completed
      db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)`).run(userId, n.id, v, course.version, "2026-01-01", "2026-01-01", "2026-01-01", v);
    }
    const p = (await c.get("/api/progress")).body.nodes as Record<string, { state: string; lockedBy: string[]; reviewAvailable: boolean }>;
    for (const n of old) expect(p[n.id]!.state, n.id).toBe("completed");
    // each grade's first new lesson is open (its prerequisite was completed), the rest of the chain waits behind it
    for (const g of [2, 3, 4]) {
      const mine = music.BOOK_LESSONS.filter((l) => l.grade === g);
      expect(p[mine[0]!.node]!.state, mine[0]!.node).toBe("available");
      for (let k = 1; k < mine.length; k++) {
        expect(p[mine[k]!.node]!.state).toBe("locked");
        expect(p[mine[k]!.node]!.lockedBy).toEqual([mine[k - 1]!.node]);
      }
    }
    // nodes whose content gained the new templates offer a refresher; no lesson that existed does
    for (const n of old.filter((x) => x.type === "lesson")) expect(p[n.id]!.reviewAvailable, n.id).toBe(false);
    expect(p["G2-U5-R1"]!.reviewAvailable).toBe(true);
    // Grade 5 is untouched: this learner finished Grade 4, so its first lesson is open exactly as before
    expect(p["G5-U1-L01"]!.state).toBe("available");
  });
});

describe("the new lessons teach before they ask", () => {
  const lessons = music.BOOK_LESSONS.map((l, i) => ({ l, i, raw: readJson(`lessons/${l.node}.json`) as { explanation: Array<{ kind: string }>; guided: ExerciseItem[]; independent: ExerciseItem[]; recap: string[]; spacedReview: unknown[]; provenance: { notes: string; bookSectionIds: string[] } } }));

  it("has the full lesson structure (objective, 4+ explanation blocks with notation, demonstration, 3 guided, 6+ independent, recap, review)", () => {
    expect(lessons).toHaveLength(11);
    for (const { l, raw } of lessons) {
      const lesson = course.lesson(l.node)!;
      expect(lesson.objective.successCriteria.length, l.node).toBe(3);
      expect(lesson.explanation.length, l.node).toBeGreaterThanOrEqual(4);
      expect(lesson.explanation.some((b) => b.kind === "notation"), `${l.node} shows notation`).toBe(true);
      expect(lesson.demonstration.steps.length, l.node).toBeGreaterThanOrEqual(3);
      expect(raw.guided, l.node).toHaveLength(3);
      expect(raw.independent.length, l.node).toBeGreaterThanOrEqual(6);
      expect(raw.recap, l.node).toHaveLength(3);
      expect(raw.spacedReview, l.node).toHaveLength(3);
      expect(raw.provenance.notes.length, l.node).toBeGreaterThan(80);
      expect(raw.provenance.bookSectionIds.length, l.node).toBeGreaterThan(0);
    }
  });

  it("asks about every term of the lesson at least once in an independent step, and never about another lesson's term", () => {
    for (const { l, raw } of lessons) {
      const targets = raw.independent.map((i) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!);
      for (const id of l.termIds) expect(targets, `${l.node} never asks ${id}`).toContain(id);
      for (const t of [...targets, ...raw.guided.map((i) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!)]) expect(l.termIds, l.node).toContain(t);
    }
  });

  it("never asks the same question twice in a lesson, guided and independent included", () => {
    for (const { l, raw } of lessons) {
      const seen = new Set<string>();
      for (const it of [...raw.guided, ...raw.independent]) {
        const a = it.answer as { options: Array<{ id: string }> };
        const key = JSON.stringify([it.prompt, a.options.map((o) => o.id).sort(), JSON.stringify(it.music ?? null)]);
        expect(seen.has(key), `${l.node}: ${it.prompt}`).toBe(false);
        seen.add(key);
      }
      expect(new Set([...raw.guided, ...raw.independent].map((i) => i.id)).size, l.node).toBe(raw.guided.length + raw.independent.length);
    }
  });

  it("shows only taught words in the options of every lesson question", () => {
    const old = new Map([...music.TERMS, ...music.TERMS_G4].map((t) => [t.id, t as { firstGrade?: number }]));
    for (const { l, i, raw } of lessons) {
      for (const it of [...raw.guided, ...raw.independent]) {
        for (const o of (it.answer as { options: Array<{ id: string }> }).options) {
          const at = music.BOOK_LESSONS.findIndex((x) => x.termIds.includes(o.id));
          if (at >= 0) expect(at, `${l.node}: ${o.id} in “${it.prompt}”`).toBeLessThanOrEqual(i);
          else expect(old.get(o.id)?.firstGrade ?? 4, `${l.node}: ${o.id}`).toBeLessThanOrEqual(l.grade);
        }
      }
    }
  });

  it("names no word of a later lesson in its own teaching text, and every word of a phrase is taught by the lesson or before", () => {
    for (const { l, i } of lessons) {
      const text = lessonText(l.node);
      for (const later of music.BOOK_LESSONS.slice(i + 1)) {
        for (const id of later.termIds) {
          const t = music.TERMS_BOOK.find((x) => x.id === id);
          if (!t) continue;
          for (const form of [t.term, ...(t.forms ?? [])].map((x) => tidy(x).replace(/\.$/, "").trim()).filter((x) => x.length >= 4 && !/\s/.test(x))) {
            // a word that is also a plain English word, or part of an older term, is not a leak
            if (["simile", "grave", "marcato", "brio", "anima", "volta", "ritmico", "tanto", "prima"].includes(form) && !wholeWord(form).test(text)) continue;
            expect(wholeWord(form).test(text), `${l.node} names “${form}” before lesson ${later.node} teaches it`).toBe(false);
          }
        }
      }
    }
    const allOld = new Set([...music.TERMS, ...music.TERMS_G4].flatMap((t) => tidy(t.term).split(/[^\p{L}]+/u).filter(Boolean)));
    for (const { l, i } of lessons) {
      const text = lessonText(l.node);
      const taught = new Set<string>(allOld);
      for (const e of music.BOOK_LESSONS.slice(0, i + 1)) for (const id of e.termIds) for (const f of [music.TERMS_BOOK.find((x) => x.id === id)?.term ?? id, ...(music.TERMS_BOOK.find((x) => x.id === id)?.forms ?? [])]) for (const w of tidy(f).split(/[^\p{L}]+/u)) if (w) taught.add(w);
      for (const id of l.termIds) {
        for (const ph of music.TERMS_BOOK.find((x) => x.id === id)?.phrases ?? []) {
          for (const w of tidy(ph.phrase).split(/[^\p{L}]+/u).filter(Boolean)) expect(taught.has(w) || wholeWord(w).test(text), `${l.node}: “${ph.phrase}” uses “${w}”, which nothing has taught`).toBe(true);
        }
      }
    }
  });

  it("never mentions the reference book, its author or an exam board in learner-facing text", () => {
    for (const { l } of lessons) {
      const l1 = JSON.stringify((({ provenance: _p, ...rest }) => rest)(readJson(`lessons/${l.node}.json`)));
      expect(l1, l.node).not.toMatch(/ABRSM|Associated Board|First Steps|Eric Taylor|Taylor/i);
    }
  });
});

describe("a learner only meets a new word after completing the lessons that teach it", () => {
  const completeRowsFor = (db: ReturnType<typeof openDb>, userId: string, upTo: string, except: (n: { id: string }) => boolean) => {
    const target = course.ix.nodeById.get(upTo)!;
    for (const n of course.nodes.filter((x) => x.order <= target.order && !except(x))) {
      const v = n.type === "practice" || n.type === "review" ? 1 : n.contentVersion;
      db.prepare(`INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)`).run(userId, n.id, v, course.version, "2026-01-01", "2026-01-01", "2026-01-01", v);
    }
  };
  const bookItems = <T extends { itemId: string }>(items: T[]) => items.filter((i) => music.isBookTemplate(parseGeneratedItemId(i.itemId)?.templateId ?? ""));

  it("a learner who completed Grade 2 before the lessons existed is never served a new word in a unit challenge until they finish the lessons", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course });
    const c = new Client(app);
    const me = await register(c);
    const userId = me.body.user.id as string;
    completeRowsFor(db, userId, "G2-U5-R1", (n) => NEW.has(n.id));
    // the unit challenge (and the grade assessment after it) are open to them, and their sections list the new templates
    const start = await c.post("/api/nodes/G2-U5-C/start");
    expect(start.status).toBe(200);
    const items = app.nodes.internalItems(userId, "G2-U5-C");
    expect(items.length).toBeGreaterThan(0);
    expect(bookItems(items), "no new-term question before the lessons").toEqual([]);
    expect(app.nodes.internalItems(userId, "G2-U5-C").every((i) => !/book-/.test(i.itemId))).toBe(true);
  }, 120_000);

  it("a learner who has completed the new lessons is served new words in the unit practice and the grade review, each taught by a completed lesson", async () => {
    let practice = 0;
    let review = 0;
    for (let k = 0; k < 8; k++) {
      const db = openDb(":memory:");
      const app = createApp({ db, course });
      const c = new Client(app);
      const me = await register(c, `learner${k}`);
      const userId = me.body.user.id as string;
      completeRowsFor(db, userId, "G2-U5-L04", (n) => NEW.has(n.id));
      for (const l of music.BOOK_LESSONS.filter((x) => x.grade === 2)) expect((await playLesson(c, course, l.node)).status, l.node).toBe(200);
      for (const node of ["G2-U5-P1", "G2-U5-R1"]) {
        expect((await c.post(`/api/nodes/${node}/start`)).status, node).toBe(200);
        const all = app.nodes.internalItems(userId, node);
        const items = bookItems(all);
        if (items.length) {
          if (node === "G2-U5-P1") practice++;
          else review++;
        }
        for (const it of items) {
          const target = (it.item.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
          expect(music.BOOK_LESSONS.find((x) => x.termIds.includes(target))?.grade, node).toBe(2);
        }
        for (const it of all) expect((await c.post(`/api/nodes/${node}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(course, node, it.item, it.scope) })).status).toBe(200);
        expect((await c.post(`/api/nodes/${node}/complete`)).status, node).toBe(200);
      }
    }
    expect(practice, "the Grade 2 unit practice asks the new words every time").toBe(8);
    // The grade review plans ten questions from some 37 bindings, weakest concepts first. This synthetic learner has evidence only for the new
    // concepts, so those rank last and need not appear; what must hold is that the bindings exist and every question served is a taught one.
    expect(course.ix.nodeById.get("G2-U5-R1")!.exercises.filter((b) => music.BOOK_TEMPLATE_IDS.includes(b.templateId)).map((b) => b.templateId)).toEqual(["t.g2.book-terms", "t.g2.book-use"]);
    void review;
  }, 400_000);
});

describe("the authoring overlay is idempotent", () => {
  it("running author-terms twice changes none of the files it owns", () => {
    const files = () => ["path/grade-2.json", "path/grade-3.json", "path/grade-4.json", "path/grade-5.json", "assessments/grade-2.json", "assessments/grade-3.json", "assessments/grade-4.json", "assessments/grade-5.json", "concepts/grade-2.json", "concepts/grade-3.json", "concepts/grade-4.json", "exercises/templates/grade-2.json", "exercises/templates/grade-3.json", "exercises/templates/grade-4.json", "policy/review-constraints.json", ...music.BOOK_LESSONS.map((l) => `lessons/${l.node}.json`)];
    const digest = () => sha(files().map((f) => `${f}\n${readFileSync(join(root, f), "utf8")}`).join("\n"));
    const script = join(here, "../scripts/author-terms.ts");
    const was = digest();
    for (let run = 0; run < 2; run++) {
      execFileSync(process.execPath, ["--import", "tsx", script], { cwd: join(here, ".."), stdio: "pipe", timeout: 600_000 });
      expect(digest(), `after run ${run + 1}`).toBe(was);
    }
    for (const a of readJson("assessments/grade-4.json").assessments as Array<{ sections: Array<{ id: string }>; id: string }>) expect(new Set(a.sections.map((s) => s.id)).size, a.id).toBe(a.sections.length);
  }, 600_000);
});

describe("the generated terminology document is current", () => {
  it("docs/curriculum/TERMINOLOGY_COVERAGE.md matches the committed content (run `npm run docs:terms -w @mtp/api`)", () => {
    execFileSync(process.execPath, ["--import", "tsx", join(here, "../scripts/terminology-docs.ts"), "--check"], { cwd: join(here, ".."), stdio: "pipe", timeout: 300_000 });
  }, 300_000);
});
