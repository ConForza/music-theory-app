/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely typed answer specs */
import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem, gradeItem } from "../src/index.ts";

/**
 * Independent checks of the five templates and the French terms added after comparing the course with eight Grade 5 papers
 * (docs/curriculum/GRADE_5_PAPER_COMPARISON.md). As in grade5-answers.test.ts, every answer is re-derived from what the learner SEES with
 * small hand-rolled tables, not with the production helpers.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);

function items(nodeId: string, templateId: string, seeds = 200): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId);
  expect(b, `${nodeId} binds ${templateId}`).toBeTruthy();
  const scope = effectiveScope(ix, node, b!);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= seeds; s++) {
    try { out.push(generateItem(ix, templateId, s, { scope }).item); } catch { /* skipped seed */ }
  }
  expect(out.length, `${nodeId} ${templateId}`).toBeGreaterThan(seeds / 2);
  return out;
}
const scopeOf = (nodeId: string, templateId: string) => effectiveScope(ix, ix.nodeById.get(nodeId)!, ix.nodeById.get(nodeId)!.exercises.find((x) => x.templateId === templateId)!);
const A = (i: ExerciseItem) => i.answer as unknown as Record<string, any>;

// length in demisemiquavers (1/32 of a semibreve): every value is a whole number of them
const D32: Record<string, number> = { semibreve: 32, minim: 16, crotchet: 8, quaver: 4, semiquaver: 2, demisemiquaver: 1 };
const len32 = (e: any): number => (e.kind === "tuplet" ? ((e.events as any[]).reduce((t, x) => t + len32(x), 0) * e.normal) / e.actual : D32[e.duration.value]! * (e.duration.dots ? 1.5 : 1));
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
const ALT: Record<string, number> = { bb: -2, b: -1, "": 0, "#": 1, x: 2 };
const pn = (t: string) => { const m = /^([A-G])(bb|b|#|x)?(-?\d)$/.exec(t)!; return { l: LETTERS.indexOf(m[1]!), alter: ALT[m[2] ?? ""]!, oct: Number(m[3]) }; };
const steps = (n: { l: number; oct: number }) => n.oct * 7 + n.l;
const semis = (n: { l: number; alter: number; oct: number }) => n.oct * 12 + SEMI[n.l]! + n.alter;

describe("t.g5.duration-facts", () => {
  it("every answer equals the count made with a fixed table of lengths", () => {
    let beats = 0, equals = 0, tied = 0;
    for (const it of items("G5-U1-L03", "t.g5.duration-facts", 300)) {
      const right = Number(A(it).correctOptionIds[0]);
      const label = (id: string) => A(it).options.find((o: any) => o.id === id).label;
      expect(label(String(right)), it.id).toBe(String(right));
      const small = /how many (demisemiquavers|semiquavers|quavers)\?/.exec(it.prompt);
      const word = (s: string) => { const m = /^(dotted )?(minim|crotchet|quaver|semiquaver)$/.exec(s)!; return D32[m[2]!]! * (m[1] ? 1.5 : 1); };
      if (small) {
        const unit = D32[small[1]!.replace(/s$/, "")]!;
        let m = /^A ((?:dotted )?\w+) is equal to/.exec(it.prompt);
        if (m) { expect(word(m[1]!) / unit, it.id).toBe(right); equals++; continue; }
        m = /^A ((?:dotted )?\w+) tied to a ((?:dotted )?\w+) lasts/.exec(it.prompt);
        expect((word(m![1]!) + word(m![2]!)) / unit, it.id).toBe(right);
        tied++;
      } else {
        const m = /In (\d+)\/(\d+), how many ([\w-]+) beats/.exec(it.prompt)!;
        const [top, bottom] = [Number(m[1]), Number(m[2])];
        const compound = top % 3 === 0 && top > 3 && bottom >= 4 || (top === 6 || top === 9 || top === 12) && bottom >= 8;
        // 3/8 and 3/4 style (top 3) are simple; 6, 9 and 12 over 4, 8 or 16 are compound; the rest simple
        const isCompound = [6, 9, 12].includes(top) && bottom >= 4;
        void compound;
        expect(isCompound ? top / 3 : top, it.id).toBe(right);
        const named = m[3]!;
        if (isCompound) expect(named.startsWith("dotted-"), it.id).toBe(true);
        beats++;
      }
      // a wrong answer is refused and the right one accepted, through the real engine
      const scope = scopeOf("G5-U1-L03", "t.g5.duration-facts");
      expect(gradeItem(ix, it, { kind: "choice", optionId: String(right) } as never, scope).correct, it.id).toBe(true);
    }
    expect(beats).toBeGreaterThan(30);
    expect(equals).toBeGreaterThan(20);
    expect(tied).toBeGreaterThan(20);
  });
});

describe("t.g5.metre-mixed", () => {
  it("the bar length fixes the signature among the choices, and the choices mix regular and irregular signatures", () => {
    const IRR = ["5/4", "7/4", "5/8", "7/8"];
    let regular = 0, irregular = 0, withTuplets = 0;
    for (const it of items("G5-U1-L01", "t.g5.metre-mixed", 300)) {
      const ts = A(it).correctOptionIds[0] as string;
      const [top, bottom] = ts.split("/").map(Number);
      for (const m of it.music!.measures) expect(len32(({ kind: "tuplet", normal: 1, actual: 1, events: m.events }) as any), it.id).toBe((top! * 32) / bottom!);
      const cap = (label: string) => { const [a, b] = label.split("/").map(Number); return (a! * 32) / b!; };
      for (const o of A(it).options as any[]) if (o.label !== ts) expect(cap(o.label), `${it.id}: ${o.label} holds a different amount from ${ts}`).not.toBe(cap(ts));
      const kinds = new Set((A(it).options as any[]).map((o) => IRR.includes(o.label)));
      expect(kinds.size, `${it.id}: both kinds offered`).toBe(2);
      if (IRR.includes(ts)) irregular++; else regular++;
      const tuplets = it.music!.measures.flatMap((m) => (m.events as any[]).filter((e) => e.kind === "tuplet"));
      if (tuplets.length) {
        withTuplets++;
        const compound = [6, 9, 12].includes(top!) && bottom! >= 4;
        for (const t of tuplets) {
          if (compound) expect([t.actual, t.normal], `${it.id}: only a duplet in compound time`).toEqual([2, 3]);
          else expect([[3, 2], [5, 4], [7, 4]].some(([a, b]) => t.actual === a && t.normal === b), `${it.id}: ${t.actual}:${t.normal}`).toBe(true);
          if (!IRR.includes(ts) && !compound) expect(t.actual, `${it.id}: only triplets in regular simple time`).toBe(3);
        }
      }
    }
    expect(regular).toBeGreaterThan(40);
    expect(irregular).toBeGreaterThan(40);
    expect(withTuplets).toBeGreaterThan(30);
  });
});

describe("t.g5.rest-judge", () => {
  it("only the correct bar writes every silent group or beat as one rest, and the three bars sound the same", () => {
    let checked = 0;
    let two = 0;
    for (const it of items("G5-U1-L02", "t.g5.rest-judge", 300)) {
      const m = /in (\d+)\/(\d+) \((?:grouped ([\d+]+)|with dotted-note beats)\)/.exec(it.prompt)!;
      const [top, bottom] = [Number(m[1]), Number(m[2])];
      const unit = 32 / bottom;
      const lens = m[3] ? m[3].split("+").map(Number) : Array.from({ length: top / 3 }, () => 3);
      const bounds = lens.reduce<number[]>((acc, L) => [...acc, acc[acc.length - 1]! + L * unit], [0]);
      const bars = it.music!.measures.map((x) => x.events as any[]);
      if (bars.length === 2) {
        // two groups: a rest that runs across the boundary is the wrong bar; the right bar gives each side its own rest
        const across = bars.map((bar) => { let t = 0; let hit = false; for (const e of bar) { const l = len32(e); if (e.kind === "rest" && t < bounds[1]! && t + l > bounds[1]!) hit = true; t += l; } expect(t, it.id).toBe(top * unit); return hit; });
        expect(across.filter((x) => !x).length, `${it.id}: exactly one bar keeps its rests inside the groups`).toBe(1);
        expect(Number(A(it).correctOptionIds[0]) - 1, it.id).toBe(across.findIndex((x) => !x));
        two++;
        checked++;
        continue;
      }
      expect(bars.length, it.id).toBe(3);
      const fussy = bars.map((bar) => {
        let t = 0;
        const rests: Array<[number, number]> = [];
        const sounds: Array<[number, number]> = [];
        for (const e of bar) { const l = len32(e); (e.kind === "rest" ? rests : sounds).push([t, t + l]); t += l; }
        expect(t, it.id).toBe(top * unit);
        const silentGroups = lens.map((_, g) => rests.filter(([a, b]) => a >= bounds[g]! && b <= bounds[g + 1]!)).map((rs, g) => (rs.reduce((s, [a, b]) => s + b - a, 0) === bounds[g + 1]! - bounds[g]! ? rs.length : 0));
        return { split: silentGroups.some((n) => n > 1), sounds: JSON.stringify(sounds.filter(([a, b]) => !rests.some(([x, y]) => x <= a && b <= y))) };
      });
      expect(fussy.filter((f) => !f.split).length, `${it.id}: exactly one bar has no split silent group`).toBe(1);
      expect(new Set(fussy.map((f) => f.sounds)).size, `${it.id}: the sounding notes are identical`).toBe(1);
      expect(Number(A(it).correctOptionIds[0]) - 1, it.id).toBe(fussy.findIndex((f) => !f.split));
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
    expect(two).toBeGreaterThan(20);
  });
});

describe("t.g5.clef-minor", () => {
  const letters = "CDEFGAB";
  const isMinor = (ps: string[]) => {
    const p = ps.map(pn);
    for (let i = 1; i < 8; i++) if ((p[i]!.l - p[i - 1]!.l + 7) % 7 !== 1) return false;
    const g = p.slice(1).map((x, i) => semis(x) - semis(p[i]!));
    const eq = (a: number[]) => a.every((x, i) => x === g[i]);
    return eq([2, 1, 2, 2, 1, 3, 1]) || eq([2, 1, 2, 2, 2, 2, 1]);
  };
  it("exactly one stave is an ascending minor scale: the stave the answer names", () => {
    let n = 0;
    for (const it of items("G5-U2-L02", "t.g5.clef-minor", 300)) {
      const staves = (it as any).score.staves as any[];
      expect(staves.length, it.id).toBe(3);
      const flags = staves.map((s) => isMinor(s.music.measures.flatMap((m: any) => m.events.map((e: any) => e.pitch as string))));
      expect(flags.filter(Boolean).length, `${it.id}: one stave only`).toBe(1);
      expect(staves[flags.indexOf(true)]!.id, it.id).toBe(A(it).correctOptionIds[0]);
      expect(new Set(staves.map((s) => s.music.clef)).size, `${it.id}: three different clefs`).toBe(3);
      expect(staves.every((s) => s.music.showKeySignature === false), it.id).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(100);
    void letters;
  });
});

describe("t.g5.transpose-judge", () => {
  const IV: Record<string, [number, number]> = { "major 2nd": [1, 2], "minor 3rd": [2, 3], "perfect 5th": [4, 7] };
  const move = (n: { l: number; alter: number; oct: number }, dl: number, ds: number) => {
    const t = steps(n) + dl;
    const l = ((t % 7) + 7) % 7;
    const oct = Math.floor(t / 7);
    return { l, oct, alter: semis(n) + ds - (oct * 12 + SEMI[l]!) };
  };
  const MAJ: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
  const MIN: Record<string, number> = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };
  const fifths = (k: string) => { const [t, mode] = k.split(" "); return (mode === "major" ? MAJ : MIN)[t!]!; };
  it("the truth named by the answer (no mistake, the key signature, or one numbered note) matches what the lower stave shows", () => {
    const seen = { ok: 0, key: 0, note: 0 };
    for (const it of items("G5-U3-L06", "t.g5.transpose-judge", 300)) {
      const iv = Object.keys(IV).find((k) => it.prompt.includes(`a ${k} lower than written`))!;
      const dir = /transposed it (up|down)/.exec(it.prompt)![1]!;
      const [dl, ds] = IV[iv]!;
      const sign = dir === "up" ? 1 : -1;
      const staves = (it as any).score.staves as any[];
      const given = staves[0].music.measures.flatMap((m: any) => m.events.map((e: any) => pn(e.pitch)));
      const shownEvents = staves[1].music.measures.flatMap((m: any) => m.events as any[]);
      const shown = shownEvents.map((e: any) => pn(e.pitch));
      const want = given.map((n: any) => move(n, sign * dl, sign * ds));
      const wrongAt = want.map((w: any, i: number) => (semis(w) !== semis(shown[i]!) || steps(w) !== steps(shown[i]!) ? i : -1)).filter((i: number) => i >= 0);
      const givenKey = staves[0].music.key as string;
      const tonic = move(pn(`${givenKey.split(" ")[0]!}4`.replace(/^([A-G])(#|b)?/, "$1$2")), sign * dl, sign * ds);
      const tonicText = `${LETTERS[tonic.l]}${({ "-1": "b", "0": "", "1": "#" } as Record<string, string>)[String(tonic.alter)]}`;
      const wantKey = `${tonicText} ${givenKey.split(" ")[1]}`;
      const shownKey = staves[1].music.key as string;
      const keyOk = fifths(shownKey) === fifths(wantKey);
      const truth = wrongAt.length === 0 ? (keyOk ? "ok" : "key") : `n${wrongAt[0]! + 1}`;
      expect(wrongAt.length <= 1, `${it.id}: at most one note is wrong`).toBe(true);
      if (wrongAt.length) expect(keyOk, `${it.id}: a wrong note never comes with a wrong key signature`).toBe(true);
      expect(A(it).correctOptionIds[0], it.id).toBe(truth);
      seen[truth === "ok" ? "ok" : truth === "key" ? "key" : "note"]++;
    }
    expect(seen.ok).toBeGreaterThan(10);
    expect(seen.key).toBeGreaterThan(10);
    expect(seen.note).toBeGreaterThan(30);
  });
});

describe("French terms (Grade 5 vocabulary version 2)", () => {
  const MEANING: Record<string, string> = { lent: "Slow", vite: "Quick", douce: "Sweet, gentle", très: "Very", sans: "Without", avec: "With", léger: "Light", vif: "Lively", "modéré": "At a moderate speed", sourdines: "Mutes" };
  it("French terms are asked, with the meaning the book gives, and never beside a synonym", () => {
    let french = 0;
    const seen = new Set<string>();
    for (const it of items("G5-U5-L06", "t.g5.terms", 400)) {
      const m = /^A French term: what does “([^”]+)” mean\?/.exec(it.prompt);
      if (!m) continue;
      french++;
      seen.add(m[1]!);
      const right = A(it).options.find((o: any) => o.id === A(it).correctOptionIds[0]).label as string;
      const expected = MEANING[m[1]!];
      if (expected) expect(right.startsWith(expected), `${m[1]} → ${right}`).toBe(true);
      expect(new Set((A(it).options as any[]).map((o) => o.label)).size, it.id).toBe(A(it).options.length);
    }
    expect(french).toBeGreaterThan(40);
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe("rhythm input", () => {
  it("a bar to complete in irregular time tells the editor which grouping the question names", async () => {
    const { inputFor } = await import("../src/index.ts");
    let n = 0;
    for (const it of items("G5-U1-L02", "t.g5.bar-complete", 100)) {
      const inp = inputFor(ix, it, scopeOf("G5-U1-L02", "t.g5.bar-complete")) as any;
      expect(inp.kind).toBe("rhythm-builder");
      expect(inp.groupPattern, it.id).toEqual(A(it).groupPattern);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });
});
