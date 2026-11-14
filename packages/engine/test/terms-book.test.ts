import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem, type MusicScope } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, generationFingerprint, gradeItem, hashString, wrongResponse } from "../src/index.ts";

/**
 * Independent check of the terminology completion generators (t.gN.book-terms, t.gN.book-use).
 *
 * The generator picks a term and writes its own answer, so a test that asks the generator is circular. Here every question is re-derived from
 * what the learner SEES (the prompt, the options and the printed music) against the vocabulary data and the hand-typed rules of the course:
 * the right option really is the term the prompt asks about, no wrong option could also be right, and no option shows a word that the lesson
 * (or an earlier one) has not yet taught.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 160;
const BOOK = new Map(music.TERMS_BOOK.map((t) => [t.id, t]));
const OLD = new Map([...music.TERMS, ...music.TERMS_G4].map((t) => [t.id, t as { id: string; term: string; meaning: string; category: string; firstGrade?: number }]));
const lessonIndex = (id: string) => music.BOOK_LESSONS.findIndex((l) => l.termIds.includes(id));
const speedy = (category: string) => category === "tempo" || category === "change-of-speed";

interface Q { item: ExerciseItem; lesson: music.BookLesson; scope: MusicScope }
const questions: Q[] = [];
const lessonOfTarget = (item: ExerciseItem) => music.BOOK_LESSONS[lessonIndex((item.answer as { correctOptionIds: string[] }).correctOptionIds[0]!)]!;
for (const lesson of music.BOOK_LESSONS) {
  const node = ix.nodeById.get(lesson.node)!;
  for (const b of node.exercises) {
    const scope = effectiveScope(ix, node, b);
    for (let seed = 1; seed <= SEEDS; seed++) {
      try {
        const item = generateItem(ix, b.templateId, seed, { scope }).item;
        questions.push({ item, lesson: lessonOfTarget(item), scope });
      } catch {
        /* a seed that does not fit */
      }
    }
  }
}
const target = (q: Q) => (q.item.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
const options = (q: Q) => (q.item.answer as { options: Array<{ id: string; label: string }> }).options;
const record = (id: string) => BOOK.get(id) ?? (id === "staccatissimo" ? { id, term: "staccatissimo (the wedge sign)", meaning: "very short and detached", category: "articulation" } : undefined);
const termOf = (id: string) => record(id) ?? OLD.get(id)!;

describe("book term questions are right", () => {
  it("generates plenty of questions for every lesson, and every term of every lesson is asked as the right answer", () => {
    for (const l of music.BOOK_LESSONS) {
      const qs = questions.filter((q) => q.lesson.node === l.node);
      expect(qs.length, l.node).toBeGreaterThan(120);
      const targets = new Set(qs.map(target));
      for (const id of l.termIds) expect(targets.has(id), `${l.node} never asks ${id}`).toBe(true);
      // and only the lesson's own terms are ever the right answer
      for (const t of targets) expect(l.termIds, `${l.node} asked ${t}`).toContain(t);
    }
  });

  it("states one right option, with unique ids and unique labels, and the engine agrees", () => {
    for (const q of questions.filter((_, i) => i % 7 === 0)) {
      const o = options(q);
      expect(new Set(o.map((x) => x.id)).size, q.item.id).toBe(o.length);
      expect(new Set(o.map((x) => x.label.toLowerCase())).size, `${q.item.id}: ${q.item.prompt}`).toBe(o.length);
      expect(o).toHaveLength(4);
      const good = gradeItem(ix, q.item, canonicalResponse(ix, q.item, q.scope), q.scope);
      expect(good.correct, q.item.id).toBe(true);
      const bad = wrongResponse(ix, q.item, q.scope);
      if (bad) expect(gradeItem(ix, q.item, bad, q.scope).correct, q.item.id).toBe(false);
    }
  });

  it("asks exactly what the prompt says: each prompt is re-derived from the vocabulary data", () => {
    const seen = new Set<string>();
    for (const q of questions) {
      const t = termOf(target(q));
      const label = options(q).find((x) => x.id === target(q))!.label;
      const p = q.item.prompt;
      let m: RegExpExecArray | null;
      if ((m = /^What does “(.+)” mean\?$/.exec(p))) {
        expect(m[1], p).toBe(t.term);
        expect(label, p).toBe(t.meaning);
        seen.add("to-meaning");
      } else if ((m = /^Which (word|sign) means “(.+)”\?$/.exec(p))) {
        expect(m[2], p).toBe(t.meaning);
        expect(label, p).toBe(t.term);
        seen.add("to-term");
      } else if ((m = /^What does the direction “(.+)” mean\?$/.exec(p))) {
        const ph = BOOK.get(target(q))!.phrases!.find((x) => x.phrase === m![1]);
        expect(ph, p).toBeTruthy();
        expect(label, p).toBe(ph!.meaning);
        seen.add("phrase");
      } else if ((m = /^A composer wants (.+)\. Which marking fits best\?$/.exec(p))) {
        const c = (BOOK.get(target(q)) as music.TermBook | undefined)?.character ?? (target(q) === "staccatissimo" ? "a note that must be as short and detached as possible" : undefined);
        expect(m[1], p).toBe(c);
        expect(label, p).toBe(t.term);
        seen.add("character");
      } else if ((m = /^This melody is marked “(.+)”\. What does the marking ask the player to do\?$/.exec(p))) {
        expect((q.item.music as { tempoText?: string }).tempoText, p).toBe(m[1]);
        const b = BOOK.get(target(q))!;
        const ph = b.phrases?.find((x) => x.phrase === m![1]);
        if (ph) expect(label, p).toBe(ph.meaning);
        else {
          expect(b.term.split(",")[0]!.replace(/\s*\(.*\)/, ""), p).toBe(m[1]);
          expect(label, p).toBe(b.meaning);
        }
        seen.add("in-tune");
      } else if ((m = /^A score says “(.+)”\. What does it ask the player to do\?$/.exec(p))) {
        // the same question without a melody, when no melody fits the scope
        const ph = BOOK.get(target(q))!.phrases!.find((x) => x.phrase === m![1]);
        expect(ph, p).toBeTruthy();
        expect(label, p).toBe(ph!.meaning);
        seen.add("in-tune");
      } else if (/^Look at the marks on (the second note|the first three notes)\. Which sign is it\?$/.test(p)) {
        const evs = (q.item.music as { measures: Array<{ events: Array<{ articulations?: string[]; slur?: string }> }> }).measures.flatMap((x) => x.events);
        const arts = evs.map((e) => e.articulations?.[0] ?? null);
        const want = BOOK.get(target(q))?.mark ?? (target(q) === "staccatissimo" ? "staccatissimo" : target(q));
        if (target(q) === "semi-staccato") {
          expect(arts.slice(0, 3), p).toEqual(["staccato", "staccato", "staccato"]);
          expect(evs[0]!.slur).toBe("start");
          expect(evs[2]!.slur).toBe("stop");
        } else {
          expect(arts[1], p).toBe(want);
          expect(arts.filter(Boolean), p).toHaveLength(1);
        }
        seen.add("sign");
      } else {
        throw new Error(`unrecognised prompt: ${p}`);
      }
    }
    expect([...seen].sort()).toEqual(["character", "in-tune", "phrase", "sign", "to-meaning", "to-term"]);
  });

  it("never shows a word that has not been taught: every option is an older term or comes from this lesson or an earlier one", () => {
    for (const q of questions) {
      const grade = q.lesson.grade;
      const here = music.BOOK_LESSONS.indexOf(q.lesson);
      for (const o of options(q)) {
        const b = lessonIndex(o.id);
        if (b >= 0) expect(b, `${q.lesson.node}: ${o.id} in “${q.item.prompt}”`).toBeLessThanOrEqual(here);
        else {
          const old = OLD.get(o.id);
          expect(old, `${o.id} is in no vocabulary`).toBeTruthy();
          const firstGrade = old!.firstGrade ?? 4;
          expect(firstGrade, `${o.id} is taught after Grade ${grade}`).toBeLessThanOrEqual(grade);
        }
      }
    }
  });

  it("never lets a wrong option also be right: no shared group or meaning, and no same-kind word beside speed, mood or touch words", () => {
    for (const q of questions) {
      const right = termOf(target(q));
      const rightBook = BOOK.get(target(q));
      const wrong = options(q).filter((o) => o.id !== target(q)).map((o) => termOf(o.id));
      const sign = /Which sign is it\?/.test(q.item.prompt);
      for (const w of wrong) {
        expect(w.meaning, q.item.prompt).not.toBe(right.meaning);
        const wb = BOOK.get(w.id);
        if (rightBook && wb) expect(wb.group, `${q.item.prompt}: ${right.id} / ${w.id}`).not.toBe(rightBook.group);
        if (sign) continue; // a sign question is solved by looking, so its options are the signs themselves
        if (speedy(right.category)) expect(speedy(w.category), `${q.item.prompt}: ${right.id} / ${w.id}`).toBe(false);
        if (right.category === "articulation") expect(["articulation", "dynamics"], `${right.id} / ${w.id}`).not.toContain(w.category);
        if (rightBook?.cls === "mood") {
          // a mood word is only ever beside a mood of another, non-neutral pole (hand-typed poles for the older mood words)
          const OLD_POLE: Record<string, string> = { dolce: "gentle", cantabile: "gentle", grazioso: "gentle", maestoso: "strong", "con-moto": "lively" };
          const pole = (id: string) => BOOK.get(id)?.pole ?? OLD_POLE[id] ?? "neutral";
          const isMood = w.category === "expression" && !BOOK.get(w.id)?.cls?.match(/word/);
          expect(!isMood || (pole(w.id) !== "neutral" && pole(w.id) !== pole(right.id)), `${q.item.prompt}: ${right.id} / ${w.id}`).toBe(true);
          expect(w.category === "dynamics" || speedy(w.category), `${q.item.prompt}: a mood beside ${w.id}`).toBe(false);
        }
      }
    }
  });

  it("keeps hand-typed confusable pairs apart (a strong accent and sforzando, force and forte, calm and quiet, broadening and slowing)", () => {
    const PAIRS: Array<[string, string]> = [["pointed-accent", "sforzando"], ["pointed-accent", "accent"], ["forza", "forte"], ["forza", "fortissimo"], ["tranquillo", "piano"], ["delicato", "piano"], ["allargando", "rallentando"], ["stringendo", "accelerando"], ["semi-staccato", "staccato"], ["staccatissimo", "staccato"], ["triste", "mesto"], ["deciso", "risoluto"], ["adagietto", "larghetto"], ["grave", "larghetto"], ["molto", "assai"], ["a", "al-alla"]];
    for (const q of questions) {
      if (/Which sign is it\?/.test(q.item.prompt)) continue;
      const ids = new Set(options(q).map((o) => o.id));
      // only a pair with the right answer in it matters: two wrong options being alike cannot make either of them right
      for (const [x, y] of PAIRS) expect(ids.has(x) && ids.has(y) && (target(q) === x || target(q) === y), `${q.item.prompt}: ${x} beside ${y}`).toBe(false);
    }
  });

  it("does not offer the same wording twice in a lesson's own questions (the sample space is large)", () => {
    for (const l of music.BOOK_LESSONS) {
      const keys = new Set(questions.filter((q) => q.lesson.node === l.node).map((q) => JSON.stringify([q.item.prompt, options(q).map((o) => o.id).sort(), target(q)])));
      expect(keys.size, l.node).toBeGreaterThan(30);
    }
  });
});

describe("generation fingerprints", () => {
  const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v);
  it("carry VOCAB_BOOK for the book templates only; every other template hashes exactly as before this work", () => {
    let others = 0;
    for (const t of ix.templates.values()) {
      const scope = effectiveScope(ix, ix.nodes.find((n) => n.exercises.some((b) => b.templateId === t.id)) ?? ix.nodes[0]!, { templateId: t.id, conceptIds: [], scope: t.scope });
      // the formula as it was before this work (Grade 4 and 5 vocabularies only)
      const before = { rev: 1, template: t, scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES }, ...(t.grade === 4 ? { vocab4: music.VOCAB_G4 } : {}), ...(t.grade === 5 ? { vocab5: music.VOCAB_G5 } : {}) };
      const oldFp = hashString(JSON.stringify(canonical(before))).toString(16).padStart(8, "0");
      const fp = generationFingerprint(t, scope);
      if (music.isBookTemplate(t.id)) expect(fp, t.id).not.toBe(oldFp);
      else {
        expect(fp, t.id).toBe(oldFp);
        others++;
      }
    }
    expect(others).toBeGreaterThan(230);
  });
});
