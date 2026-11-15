import { buildIndex, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem, generationFingerprint, gradeItem, hashString, templateScope, TEMPLATE_REVISIONS } from "../src/index.ts";
import { exactGeom } from "../src/generate/grade1.ts";

/**
 * Regression tests for the educational review of PR #18 (release blockers): each reproduces the ACTUAL failure of an item that was shown to
 * learners, and fails on the generators as they were before the fix.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
function seeds(templateId: string, n: number): ExerciseItem[] {
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= n; s++) {
    try {
      out.push(generateItem(ix, templateId, s, {}).item);
    } catch {
      /* a seed that cannot make a question */
    }
  }
  return out;
}

describe("Grade 5 melody-key identification (t.g5.score-melody): the melody proves its key", () => {
  const items = seeds("t.g5.score-melody", 400).filter((i) => i.answer.kind === "composite" && i.answer.parts.some((p) => p.id === "key"));
  const notesOf = (i: ExerciseItem) => i.music!.measures.flatMap((m) => m.events ?? []).filter((e) => e.kind === "note") as Array<{ pitch: string }>;
  it("is exercised enough, in major and minor keys", () => {
    expect(items.length).toBeGreaterThan(60);
    expect(items.some((i) => /minor/.test(i.music!.key ?? ""))).toBe(true);
    expect(items.some((i) => /major/.test(i.music!.key ?? ""))).toBe(true);
  });
  it("begins and ends on the tonic of the written key, so the relative key cannot also fit", () => {
    for (const i of items) {
      const key = music.parseKey(i.music!.key!);
      const ns = notesOf(i);
      const pc = (p: string) => music.formatPitchClass(music.parsePitch(p));
      expect(pc(ns[0]!.pitch), i.music!.key).toBe(music.formatPitchClass(key.tonic));
      expect(pc(ns[ns.length - 1]!.pitch), i.music!.key).toBe(music.formatPitchClass(key.tonic));
    }
  });
  it("in a minor key the note before the final tonic is the raised 7th, which the relative major lacks", () => {
    const minors = items.filter((i) => /minor/.test(i.music!.key!));
    expect(minors.length).toBeGreaterThan(10);
    for (const i of minors) {
      const key = music.parseKey(i.music!.key!);
      const ns = notesOf(i);
      const raised7 = music.formatPitchClass(music.scale(key, "harmonic")[6]!);
      expect(music.formatPitchClass(music.parsePitch(ns[ns.length - 2]!.pitch)), i.music!.key).toBe(raised7);
      // ...and that note is not in the relative major's scale, so the melody cannot be in it
      const relative = music.relativeKey(key);
      expect(music.scale(relative, "major").map(music.formatPitchClass)).not.toContain(raised7);
    }
  });
});

describe("Grade 1 middle-C identification (t.g1.middle-c-find): the written description tells the four notes apart", () => {
  const items = seeds("t.g1.middle-c-find", 200);
  it("no two of the four notes are described the same way (bass-clef C4 and D4 both read 'on a ledger line above the stave')", () => {
    expect(items.length).toBeGreaterThan(60);
    for (const i of items) {
      const phrases = [...i.music!.textAlternative.matchAll(/note \d ([^;.]+)/g)].map((m) => m[1]!);
      expect(phrases.length, i.music!.textAlternative).toBe(4);
      expect(new Set(phrases).size, i.music!.textAlternative).toBe(4);
    }
  });
  it("a note in a space beyond the stave is never said to be 'on a ledger line'", () => {
    for (const clef of ["treble", "bass"] as const) {
      for (const p of ["B3", "C4", "D4", "E4", "E3", "F3", "A3"]) {
        const pos = music.staffPosition(clef, music.parsePitch(p));
        if (pos < 0 || pos > 8) {
          const text = exactGeom(clef, music.parsePitch(p));
          if (Math.abs(pos % 2) === 1 || pos === 9 || pos === -1) expect(text, `${clef} ${p}`).toMatch(/space/);
          else expect(text, `${clef} ${p}`).toMatch(/on the (1st|2nd|3rd) ledger line/);
        }
      }
    }
    expect(exactGeom("bass", music.parsePitch("C4"))).not.toBe(exactGeom("bass", music.parsePitch("D4")));
  });
});

describe("Grade 5 terminology (t.g5.term-use): the meaning is quoted, never fitted into a sentence as a verb", () => {
  const items = seeds("t.g5.term-use", 300);
  it("no prompt reads 'wants the player to <meaning>' (for example 'to grief', 'to mutes')", () => {
    expect(items.length).toBeGreaterThan(100);
    for (const i of items) expect(i.prompt).not.toMatch(/wants the player to|do this:/);
  });
  it("every prompt that quotes a meaning has exactly one option with exactly that glossary meaning", () => {
    let checked = 0;
    for (const i of items) {
      const m = /means “(.+)”\?$|has the meaning “(.+)”\?$/.exec(i.prompt);
      if (!m || i.answer.kind !== "choice") continue;
      const meaning = m[1] ?? m[2]!;
      const labels = i.answer.options.map((o) => o.label);
      const withMeaning = music.TERMS_G5.filter((t) => t.meaning === meaning && labels.includes(t.term));
      expect(withMeaning.length, i.prompt).toBe(1);
      expect(i.answer.options.find((o) => i.answer.kind === "choice" && i.answer.correctOptionIds.includes(o.id))!.label, i.prompt).toBe(withMeaning[0]!.term);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("Grade 2 note grouping (t.g2.note-grouping): the question can be told from its answer", () => {
  const items = seeds("t.g2.note-grouping", 300);
  const toResp = (ms: Array<{ events?: unknown[] }>) => ({ kind: "rhythm", measures: ms.map((m) => ({ events: (m.events as Array<Record<string, unknown>>).map(({ pitch: _p, ...e }) => e) })) });
  it("the grouping as printed is not already an accepted answer, and the reference grouping is", () => {
    expect(items.length).toBeGreaterThan(100);
    for (const i of items) {
      const a = i.answer as { accepted: Array<Array<{ events?: unknown[] }>> };
      expect(gradeItem(ix, i, toResp(i.music!.measures as never)).correct, i.music!.questionAlternative).toBe(false);
      expect(gradeItem(ix, i, toResp(a.accepted[0]!)).correct).toBe(true);
    }
  });
  it("the words a learner reads for the question name the beamed groups, so they differ from the grouping asked for", () => {
    for (const i of items) {
      const a = i.answer as { accepted: Array<Array<{ events?: unknown[] }>> };
      const q = i.music!.questionAlternative!;
      expect(q).toMatch(/beamed together|^Bar 1: [^()]*\.$/);
      const asked = (m: unknown[]) => JSON.stringify((m as Array<{ events: Array<{ beam?: string }> }>).map((x) => x.events.map((e) => e.beam ?? "")));
      expect(asked(i.music!.measures as never)).not.toBe(asked(a.accepted[0] as never));
    }
  });
});

describe("history is protected: a question minted before a fix is refused as stale, never silently regenerated differently", () => {
  const legacy = (t: Parameters<typeof generationFingerprint>[0], scope: Parameters<typeof generationFingerprint>[1]) => {
    const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k]) ])) : v);
    return hashString(JSON.stringify(canonical({ rev: 1, template: t, scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES }, ...(t.grade === 4 ? { vocab4: music.VOCAB_G4 } : {}), ...(t.grade === 5 ? { vocab5: music.VOCAB_G5 } : {}) }))).toString(16).padStart(8, "0");
  };
  it("only the three corrected templates have a new fingerprint", () => {
    expect(Object.keys(TEMPLATE_REVISIONS).sort()).toEqual(["t.g1.middle-c-find", "t.g5.score-melody", "t.g5.term-use"]);
    for (const t of ix.templates.values()) {
      if (music.isBookTemplate(t.id)) continue;
      const scope = templateScope(ix, t);
      if (TEMPLATE_REVISIONS[t.id]) expect(generationFingerprint(t, scope), t.id).not.toBe(legacy(t, scope));
      else expect(generationFingerprint(t, scope), t.id).toBe(legacy(t, scope));
    }
  });
  it("an id made under the old generator is refused as stale", () => {
    const t = ix.templates.get("t.g1.middle-c-find")!;
    const scope = templateScope(ix, t);
    expect(() => generateItem(ix, t.id, 5, { scope, version: t.version, fingerprint: legacy(t, scope) })).toThrow(/changed since/);
    const fresh = generateItem(ix, t.id, 5, { scope });
    expect(() => generateItem(ix, t.id, 5, { scope, version: t.version, fingerprint: generationFingerprint(t, scope) })).not.toThrow();
    expect(fresh.item.id).toContain(generationFingerprint(t, scope));
  });
});
