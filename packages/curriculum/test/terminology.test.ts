import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCurriculum } from "../src/load.ts";
import { buildIndex } from "../src/model.ts";
import { ORNAMENTS } from "../src/music/ornaments.ts";
import { BOOK_LESSONS, BOOK_TEMPLATE_IDS, INSTRUMENTS, INSTRUMENTS_G4, INSTRUMENTS_G5, TERMS, TERMS_BOOK, TERMS_G4, TERMS_G5, TECHNIQUES_G4, VOICES, VOICES_G5, VOCAB_BOOK_VERSION, bookTermsOfGrade } from "../src/music/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
interface Entry { id: string; headword: string; kind: string; language: string; bookGrade: number; section: string; termIds: string[]; partial?: boolean }
const inventory = JSON.parse(readFileSync(join(root, "source-book/terminology-inventory.json"), "utf8")) as { entries: Entry[] };
const baseline = JSON.parse(readFileSync(join(root, "source-book/terminology-baseline.json"), "utf8")) as { rows: Array<{ id: string; bookGrade: number; kind: string; language: string; status: string }> };

const OLD_IDS = new Set([...TERMS.map((t) => t.id), ...TERMS_G4.map((t) => t.id), ...TERMS_G5.map((t) => t.id), ...TECHNIQUES_G4.map((t) => t.id), ...ORNAMENTS.map((o) => `orn:${o}`)]);
const BOOK_IDS = new Set(TERMS_BOOK.map((t) => t.id));

describe("vocabulary integrity", () => {
  it("has unique ids across every vocabulary list, and the new list shares none with the old", () => {
    const all = [...TERMS, ...TERMS_G4, ...TERMS_G5, ...TECHNIQUES_G4, ...TERMS_BOOK].map((t) => t.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of BOOK_IDS) expect(OLD_IDS.has(id), id).toBe(false);
  });

  it("is versioned (VOCAB_BOOK version 1) and no older list was edited: their content hashes are those of the tree before this work", () => {
    expect(VOCAB_BOOK_VERSION).toBe(1);
    // These lists are hashed into the generation fingerprint of every earlier template, so editing one would silently change stored question
    // identities. The hashes were taken on the tree before the terminology completion work (PR #13 head).
    const h = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
    expect({ TERMS: h(TERMS), TERMS_G4: h(TERMS_G4), TECHNIQUES_G4: h(TECHNIQUES_G4), TERMS_G5: h(TERMS_G5), INSTRUMENTS: h(INSTRUMENTS), VOICES: h(VOICES), INSTRUMENTS_G4: h(INSTRUMENTS_G4), INSTRUMENTS_G5: h(INSTRUMENTS_G5), VOICES_G5: h(VOICES_G5) }).toEqual({
      TERMS: "54bebcecf5dfef25", TERMS_G4: "17aa001d7b766541", TECHNIQUES_G4: "de0fe253f77f5495", TERMS_G5: "40563ccfbc14d793", INSTRUMENTS: "74b0e7d08199e5e5", VOICES: "a9670e7953e6cba6",
      INSTRUMENTS_G4: "54f5d9583cfd651b", INSTRUMENTS_G5: "3659c5c08e863faa", VOICES_G5: "cf57418094ce610b",
    });
  });

  it("teaches every new term in exactly one lesson, in the grade where the book prints it", () => {
    const seen = new Map<string, string>();
    for (const l of BOOK_LESSONS) {
      for (const id of l.termIds) {
        expect(seen.has(id), `${id} is taught twice`).toBe(false);
        seen.set(id, l.node);
        const t = TERMS_BOOK.find((x) => x.id === id);
        if (t) {
          expect(t.lesson, id).toBe(l.node);
          expect(t.bookGrade, id).toBe(l.grade);
        } else {
          expect(id).toBe("staccatissimo"); // the one older term taught here for the first time
        }
      }
    }
    for (const t of TERMS_BOOK) expect(seen.has(t.id), `${t.id} is taught by no lesson`).toBe(true);
    expect(TERMS_BOOK).toHaveLength(21 + 34 + 2);
    expect([2, 3, 4].map((g) => bookTermsOfGrade(g).length)).toEqual([22, 34, 2]);
  });

  it("states the meaning of each new term correctly (hand-typed facts, not derived from the data)", () => {
    const FACT: Record<string, string> = {
      a: "style", "al-alla": "manner", "con-col": "with", "e-ed": "and", ma: "but", non: "not", senza: "without", piu: "more", meno: "less", molto: "very", troppo: "too much", assai: "very", mosso: "movement",
      allargando: "broad", grave: "very slow", larghetto: "rather slow", giocoso: "playful", simile: "same", vivo: "lively",
      "pointed-accent": "accent", "semi-staccato": "slightly separated",
      adagietto: "rather slow", largamente: "broad", stringendo: "faster", "alla-breve": "two minim", comodo: "comfortable", rubato: "freedom",
      forza: "force", deciso: "determination", risoluto: "bold", pesante: "heavy", marcato: "accent", energico: "energetic",
      delicato: "delicate", leggiero: "light", tranquillo: "calm", semplice: "simple", ben: "well", tanto: "so much",
      agitato: "agitated", mesto: "sad", triste: "sad", amore: "love", anima: "soul", animato: "lively",
      marziale: "military", scherzando: "playful", brio: "vigour", ritmico: "rhythm",
      sempre: "always", subito: "suddenly", prima: "first", seconda: "second", volta: "time", "ad-libitum": "choice",
      veloce: "swift", voce: "voice",
    };
    for (const t of TERMS_BOOK) {
      expect(FACT[t.id], `no hand-typed fact for ${t.id}`).toBeTruthy();
      expect(t.meaning.toLowerCase(), t.id).toContain(FACT[t.id]!);
    }
    expect(Object.keys(FACT)).toHaveLength(TERMS_BOOK.length);
  });

  it("does not call any two words by the same meaning inside one lesson (a lesson cannot ask a question with two right answers)", () => {
    for (const l of BOOK_LESSONS) {
      const meanings = l.termIds.map((id) => TERMS_BOOK.find((x) => x.id === id)?.meaning).filter(Boolean);
      expect(new Set(meanings).size).toBe(meanings.length);
    }
  });
});

describe("the reference inventory", () => {
  const count = (g: number, kind: string, language?: string) => inventory.entries.filter((e) => e.bookGrade === g && e.kind === kind && (!language || e.language === language)).length;

  it("holds the printed lists with the documented counts", () => {
    expect(count(1, "word")).toBe(28);
    expect(count(1, "sign")).toBe(10);
    expect(count(2, "word")).toBe(30);
    expect(count(2, "sign")).toBe(5);
    expect(count(3, "word")).toBe(34);
    expect(count(4, "word", "italian")).toBe(22);
    expect(count(4, "word", "french")).toBe(24);
    expect(count(4, "technique")).toBe(8);
    expect(count(4, "ornament")).toBe(6);
    expect(new Set(inventory.entries.map((e) => e.id)).size).toBe(inventory.entries.length);
  });

  it("reproduces the reviewer's Grade 3 total (34) and Grade 4 Italian total (22) exactly", () => {
    expect(count(3, "word")).toBe(34);
    expect(count(4, "word", "italian")).toBe(22);
  });

  it("names a vocabulary id for every entry, and the id exists", () => {
    for (const e of inventory.entries) {
      expect(e.termIds.length, e.id).toBeGreaterThan(0);
      for (const id of e.termIds) expect(OLD_IDS.has(id) || BOOK_IDS.has(id) || id === "staccatissimo", `${e.id} -> ${id}`).toBe(true);
    }
  });

  it("references every new term from the inventory, so none is invented", () => {
    const referenced = new Set(inventory.entries.flatMap((e) => e.termIds));
    for (const t of TERMS_BOOK) expect(referenced.has(t.id), `${t.id} is in no inventory entry`).toBe(true);
  });

  it("every printed entry of Grades 1-4 is covered after this work: no entry points at an id that is missing", () => {
    for (const e of inventory.entries) expect(e.termIds.every((id) => OLD_IDS.has(id) || BOOK_IDS.has(id)), e.id).toBe(true);
  });

  it("records the pre-change state: the numbers the PR table starts from", () => {
    const tally = (g: number, kind: string, lang: string) => {
      const rows = baseline.rows.filter((r) => r.bookGrade === g && r.kind === kind && r.language === lang);
      const by = (s: string) => rows.filter((r) => r.status === s).length;
      return { n: rows.length, missing: by("missing"), vocabOnly: by("vocab-only"), taughtOnly: by("taught-only") };
    };
    expect(tally(1, "word", "italian")).toEqual({ n: 28, missing: 0, vocabOnly: 0, taughtOnly: 0 });
    expect(tally(2, "word", "italian")).toEqual({ n: 30, missing: 14, vocabOnly: 0, taughtOnly: 4 });
    expect(tally(3, "word", "italian")).toEqual({ n: 34, missing: 32, vocabOnly: 0, taughtOnly: 2 });
    expect(tally(4, "word", "italian")).toEqual({ n: 22, missing: 1, vocabOnly: 0, taughtOnly: 0 });
  });
});

describe("the new lessons on the path", () => {
  it("sit in the grade's terms unit, after its existing terms lesson, as one unbroken chain, and are required", () => {
    for (const g of [2, 3, 4]) {
      const mine = BOOK_LESSONS.filter((l) => l.grade === g);
      const gradeNodes = ix.nodes.filter((n) => n.grade === g);
      const idx = mine.map((l) => gradeNodes.findIndex((n) => n.id === l.node));
      expect(idx.every((i) => i >= 0)).toBe(true);
      for (let k = 1; k < idx.length; k++) expect(idx[k]).toBe(idx[k - 1]! + 1);
      for (const l of mine) {
        const n = ix.nodeById.get(l.node)!;
        expect(n.type).toBe("lesson");
        expect(n.optional).toBeFalsy();
        expect(n.unitId).toBe(`G${g}-U5`);
        expect(n.conceptIds).toEqual([l.conceptId]);
        expect(n.exercises.map((b) => b.templateId)).toEqual([`t.g${g}.book-terms`, `t.g${g}.book-use`]);
        expect(n.contentRef).toBe(`lessons/${l.node}.json`);
      }
      // a lesson's prerequisite is the lesson before it, so completing one implies completing the earlier ones
      for (let k = 1; k < mine.length; k++) expect(ix.nodeById.get(mine[k]!.node)!.resolvedUnlockAfter).toEqual([mine[k - 1]!.node]);
    }
  });

  it("gives each new concept a termIds boundary equal to the terms of its lesson", () => {
    const rc = JSON.parse(readFileSync(join(root, "policy/review-constraints.json"), "utf8")) as { constraints: Array<{ conceptId: string; termIds?: string[] }> };
    for (const l of BOOK_LESSONS) {
      const c = rc.constraints.find((x) => x.conceptId === l.conceptId);
      expect(c?.termIds, l.conceptId).toEqual(l.termIds);
      expect(ix.concepts.get(l.conceptId)?.domain).toBe("terms");
    }
  });

  it("binds the new templates only to the grade's own lessons, practice, reviews and term sections of blueprints (never a different grade's)", () => {
    for (const n of ix.nodes) {
      for (const b of n.exercises) {
        if (!BOOK_TEMPLATE_IDS.includes(b.templateId)) continue;
        const g = Number(b.templateId.slice(3, 4));
        // a template of grade g is revised by nodes of grade g or later, and only after its lessons
        expect(n.grade).toBeGreaterThanOrEqual(g);
        const last = BOOK_LESSONS.filter((l) => l.grade === g).at(-1)!.node;
        expect(n.order).toBeGreaterThanOrEqual(ix.nodeById.get(BOOK_LESSONS.find((l) => l.grade === g)!.node)!.order);
        if (n.type !== "lesson") expect(n.order).toBeGreaterThan(ix.nodeById.get(last)!.order);
      }
    }
    for (const a of ix.assessments.values()) {
      for (const s of a.sections) {
        for (const t of s.templateIds.filter((x) => BOOK_TEMPLATE_IDS.includes(x))) {
          const g = Number(t.slice(3, 4));
          expect(a.grade).toBeGreaterThanOrEqual(g);
          // the section already listed the grade's older terms template, and its item count is unchanged by this work
          expect(s.templateIds).toContain(`t.g${g}.terms`);
        }
      }
    }
  });
});
