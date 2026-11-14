/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely typed answer specs */
import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, generationFingerprint, gradeItem, templateScope, wrongResponse } from "../src/index.ts";

/**
 * Independent check of the Brief 09 (Grade 5) generators. The generators write their own answers and the engine's solvability gate
 * grades those same answers, which is circular. Here every answer is re-derived from what the learner SEES (the printed notation and the
 * prompt) with small hand-rolled tables and arithmetic that do NOT use the production helpers (`music.transpose`, `music.scale`,
 * `identifyTriad` ...): letter steps and semitone counts for intervals and transposition, the circle of fifths for key signatures, a
 * stack-of-thirds search for chords, and fixed tables for the four six-accidental scales. Adversarial answers are graded through the real
 * engine.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 200;

function items(nodeId: string, templateId: string, seeds = SEEDS): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId);
  expect(b, `${nodeId} binds ${templateId}`).toBeTruthy();
  const scope = effectiveScope(ix, node, b!);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= seeds; s++) {
    try { out.push(generateItem(ix, templateId, s, { scope }).item); } catch { /* skipped seed */ }
  }
  expect(out.length, `${nodeId} ${templateId}`).toBeGreaterThan(seeds / 3);
  return out;
}
const scopeOf = (nodeId: string, templateId: string) => effectiveScope(ix, ix.nodeById.get(nodeId)!, ix.nodeById.get(nodeId)!.exercises.find((x) => x.templateId === templateId)!);
const A = (i: ExerciseItem) => i.answer as unknown as Record<string, any>;

// ---- tiny independent music arithmetic (no production helpers) -------------------------------------------------------------------
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
interface N { l: number; alter: number; oct: number }
const ALT: Record<string, number> = { bb: -2, b: -1, "": 0, "#": 1, x: 2 };
function pn(text: string): N {
  const m = /^([A-G])(bb|b|#|x)?(-?\d)$/.exec(text);
  if (!m) throw new Error(`bad pitch ${text}`);
  return { l: LETTERS.indexOf(m[1]!), alter: ALT[m[2] ?? ""]!, oct: Number(m[3]) };
}
const steps = (n: N) => n.oct * 7 + n.l; // letter position
const semis = (n: N) => n.oct * 12 + SEMI[n.l]! + n.alter;
const name = (n: N) => `${LETTERS[n.l]}${({ "-2": "bb", "-1": "b", "0": "", "1": "#", "2": "x" } as Record<string, string>)[String(n.alter)]}`;
/** Move by a number of letter steps and semitones (down: negative). */
function move(n: N, dl: number, ds: number): N {
  const target = steps(n) + dl;
  const l = ((target % 7) + 7) % 7;
  const oct = Math.floor(target / 7);
  const alter = semis(n) + ds - (oct * 12 + SEMI[l]!);
  return { l, oct, alter };
}
// interval table: number -> [letter steps, base semitones of the major/perfect interval]
const IV: Record<number, [number, number, "P" | "M"]> = { 1: [0, 0, "P"], 2: [1, 2, "M"], 3: [2, 4, "M"], 4: [3, 5, "P"], 5: [4, 7, "P"], 6: [5, 9, "M"], 7: [6, 11, "M"], 8: [7, 12, "P"] };
function qualityOf(num: number, semitones: number): string {
  const simple = ((num - 1) % 7) + 1;
  const octs = Math.floor((num - 1) / 7);
  const [, base, kind] = IV[simple === 1 && num > 1 ? 8 : simple]!;
  const b = (simple === 1 && num > 1 ? 12 : base) + (simple === 1 && num > 1 ? 0 : 0) + octs * 12 - (simple === 1 && num > 1 ? 12 : 0);
  const diff = semitones - (simple === 1 ? octs * 12 : b);
  if (kind === "P") return ({ "-2": "dd", "-1": "d", "0": "P", "1": "A", "2": "AA" } as Record<string, string>)[String(diff)] ?? "?";
  return ({ "-3": "dd", "-2": "d", "-1": "m", "0": "M", "1": "A", "2": "AA" } as Record<string, string>)[String(diff)] ?? "?";
}
function intervalOf(lo: N, hi: N): string {
  const num = steps(hi) - steps(lo) + 1;
  return `${qualityOf(num, semis(hi) - semis(lo))}${num}`;
}
// circle of fifths for key signatures
const MAJ_FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const MIN_FIFTHS: Record<string, number> = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, "A#": 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
const fifths = (key: string) => { const [t, mode] = key.split(" "); return (mode === "major" ? MAJ_FIFTHS : MIN_FIFTHS)[t!]!; };

describe("Unit 1: irregular time and divisions are checked in three independent ways", () => {
  const VAL: Record<string, [number, number]> = { semibreve: [1, 1], minim: [1, 2], crotchet: [1, 4], quaver: [1, 8], semiquaver: [1, 16], demisemiquaver: [1, 32] };
  const len = (e: any): number => {
    if (e.kind === "tuplet") return (e.events as any[]).reduce((t, x) => t + len(x), 0) * e.normal / e.actual;
    const [n, d] = VAL[e.duration.value]!;
    return (n / d) * (e.duration.dots ? 1.5 : 1);
  };
  const barLen = (evs: any[]) => evs.reduce((t, e) => t + len(e), 0);

  it("every irregular bar adds up to its time signature, and the signature the question asks for is the only one of the four that fits", () => {
    for (const it of items("G5-U1-L01", "t.g5.time-signature")) {
      const ts = A(it).accepted[0] as string;
      const [top, bottom] = ts.split("/").map(Number);
      for (const m of it.music!.measures) expect(barLen(m.events as any[]), it.id).toBeCloseTo(top! / bottom!, 9);
      const fits = ["5/4", "7/4", "5/8", "7/8"].filter((t) => { const [a, b] = t.split("/").map(Number); return Math.abs(barLen(it.music!.measures[0]!.events as any[]) - a! / b!) < 1e-9; });
      expect(fits, it.id).toEqual([ts]);
    }
  });

  it("a stated grouping is checked against that grouping alone: the same total in another grouping is refused", () => {
    let checked = 0;
    for (const it of items("G5-U1-L02", "t.g5.irregular-grouping")) {
      const a = A(it);
      const wantsBeams = (a.groupPattern as number[]).join("+");
      const wrong = ({ "3+2": [2, 3], "2+3": [3, 2], "2+2+3": [3, 2, 2], "3+2+2": [2, 2, 3], "2+3+2": [2, 2, 3] } as Record<string, number[]>)[wantsBeams]!;
      // the shown bar, beamed for the OTHER grouping, is not an accepted answer to this question
      const shown = it.music!.measures[0]!.events as any[];
      const resp = { kind: "rhythm", measures: [{ events: shown.map((e) => ({ kind: e.kind, duration: e.duration, ...(e.beam ? { beam: e.beam } : {}) })) }] } as never;
      void wrong;
      expect(gradeItem(ix, it, resp, scopeOf("G5-U1-L02", "t.g5.irregular-grouping")).correct, `${it.id}: the unchanged shown bar`).toBe(false);
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scopeOf("G5-U1-L02", "t.g5.irregular-grouping")), scopeOf("G5-U1-L02", "t.g5.irregular-grouping")).correct).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("bars to complete keep the given start and add up; the reference bar is accepted", () => {
    const scope = scopeOf("G5-U1-L02", "t.g5.bar-complete");
    let n = 0;
    for (const it of items("G5-U1-L02", "t.g5.bar-complete", 120)) {
      const a = A(it);
      const given = a.given as any[];
      const full = a.accepted[0][0].events as any[];
      const [tt, tb] = (a.timeSignature as string).split("/").map(Number);
      expect(barLen(full), it.id).toBeCloseTo(tt! / tb!, 9);
      expect(full.slice(0, given.length), it.id).toEqual(given);
      // a single note that fills the whole remaining time but straddles the groups is refused when the remainder spans two groups
      n++;
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct, it.id).toBe(true);
    }
    expect(n).toBeGreaterThan(40);
  });

  it("every irregular group takes exactly the time the question says, and the bar still adds up", () => {
    let groups = 0;
    for (const t of ["t.g5.irregular-division", "t.g5.division-write"]) {
      for (const it of items("G5-U1-L03", t)) {
        const bars = t === "t.g5.division-write" ? (A(it).accepted[0] as any[]).map((m) => m.events) : it.music!.measures.map((m) => m.events);
        const ts = t === "t.g5.division-write" ? (A(it).timeSignature as string) : it.music!.timeSignature!;
        const [top, bottom] = ts.split("/").map(Number);
        for (const bar of bars as any[][]) {
          expect(barLen(bar), `${t} ${it.id}`).toBeCloseTo(top! / bottom!, 9);
          for (const e of bar.filter((x) => x.kind === "tuplet")) {
            groups++;
            // n notes of written value v in the time of `normal` of them
            const written = (e.events as any[]).reduce((s, x) => s + len({ ...x, kind: "note" }), 0);
            expect(len(e)).toBeCloseTo(written * e.normal / e.actual, 12);
            expect([[5, 4], [6, 4], [7, 4], [9, 8]].some(([a, n]) => a === e.actual && n === e.normal), `${e.actual}:${e.normal}`).toBe(true);
            const unitValue = len({ ...e.events[0], kind: "note" });
            expect(len(e)).toBeCloseTo(e.normal * unitValue, 12);
          }
        }
      }
    }
    expect(groups).toBeGreaterThan(50);
  });
});

describe("Unit 2: clefs", () => {
  /** Tenor clef: the bottom line is D3; each step up is the next letter. Independent of the production clef tables. */
  const tenorAt = (steps_: number): N => { const base = steps({ l: 1, alter: 0, oct: 3 }) + steps_; return { l: ((base % 7) + 7) % 7, alter: 0, oct: Math.floor(base / 7) }; };
  it("tenor-clef reading: the accepted name matches the note's position counted from D3 on the bottom line and middle C on the fourth line", () => {
    for (const it of items("G5-U2-L01", "t.g5.tenor-read")) {
      const e = it.music!.measures[0]!.events![0] as any;
      const p = pn(e.pitch);
      // position 0 = bottom line; middle C (C4) must be 6 half-positions... on the fourth line = position 6
      const pos = steps(p) - steps({ l: 1, alter: 0, oct: 3 });
      expect(tenorAt(pos).l).toBe(p.l);
      expect(A(it).accepted[0].charAt(0)).toBe(LETTERS[p.l]);
      expect(steps({ l: 0, alter: 0, oct: 4 }) - steps({ l: 1, alter: 0, oct: 3 })).toBe(6); // C4 is on the fourth line (positions 0,2,4,6,8 are lines)
    }
  });

  it("same pitch, one octave, or copied positions: the accepted answer is exactly the right relation, whatever the clefs", () => {
    for (const it of items("G5-U2-L03", "t.g5.clef-position")) {
      const [orig, copy] = it.score!.staves.map((s) => s.music.measures.flatMap((m) => m.events as any[]).map((e) => pn(e.pitch)));
      const diffs = new Set(copy!.map((c, i) => semis(c) - semis(orig![i]!)));
      const sameLetters = copy!.every((c, i) => c.l === orig![i]!.l);
      const truth = diffs.size === 1 && [...diffs][0] === 0 ? "same" : diffs.size === 1 && [...diffs][0] === 12 && sameLetters ? "up" : diffs.size === 1 && [...diffs][0] === -12 && sameLetters ? "down" : "different";
      expect(A(it).correctOptionIds[0], it.id).toBe(truth);
    }
  });

  it("octave transposition: every accepted note is the source note with the same letter and accidental and the octave number one more or one less", () => {
    let n = 0;
    for (const it of items("G5-U2-L03", "t.g5.octave-transpose")) {
      const a = A(it);
      const src = it.music!.measures.flatMap((m) => m.events as any[]).map((e) => pn(e.pitch));
      const dir = a.derivation.direction === "up" ? 1 : -1;
      const out = (a.accepted[0] as string[]).map(pn);
      expect(out.length).toBe(src.length);
      out.forEach((o, i) => { expect(o.l).toBe(src[i]!.l); expect(o.alter).toBe(src[i]!.alter); expect(o.oct).toBe(src[i]!.oct + dir); });
      expect(it.music!.clef === "tenor" || a.clef === "tenor").toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });

  it("same-pitch writing: the accepted notes are the source notes unchanged, and copying the stave positions is graded wrong", () => {
    const scope = scopeOf("G5-U2-L02", "t.g5.same-pitch");
    let n = 0;
    for (const it of items("G5-U2-L02", "t.g5.same-pitch")) {
      const a = A(it);
      const src = it.music!.measures.flatMap((m) => m.events as any[]).map((e) => e.pitch as string);
      expect(a.accepted[0]).toEqual(src);
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct).toBe(true);
      // positions copied: the note at the same height in the new clef
      const bottom: Record<string, [number, number]> = { treble: [2, 4], bass: [4, 2], alto: [3, 3], tenor: [1, 3] };
      const [sl, so] = bottom[it.music!.clef]!;
      const [tl, to] = bottom[a.clef]!;
      const copied = src.map((s) => { const p = pn(s); const pos = steps(p) - (so * 7 + sl); const t = to * 7 + tl + pos; return `${LETTERS[((t % 7) + 7) % 7]}${Math.floor(t / 7)}`; });
      if (copied.join() !== src.map((s) => s.replace(/[#bx]+/, "")).join()) {
        const r = gradeItem(ix, it, { kind: "pitch-sequence", pitches: copied, key: a.key } as never, scope);
        expect(r.correct).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe("Unit 3: six-accidental keys", () => {
  const SCALES: Record<string, string[]> = {
    "F# major": ["F#", "G#", "A#", "B", "C#", "D#", "E#", "F#"],
    "Gb major": ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb"],
    "D# minor harmonic ascending": ["D#", "E#", "F#", "G#", "A#", "B", "Cx", "D#"],
    "D# minor melodic ascending": ["D#", "E#", "F#", "G#", "A#", "B#", "Cx", "D#"],
    "D# minor melodic descending": ["D#", "C#", "B", "A#", "G#", "F#", "E#", "D#"],
    "Eb minor harmonic ascending": ["Eb", "F", "Gb", "Ab", "Bb", "Cb", "D", "Eb"],
    "Eb minor melodic ascending": ["Eb", "F", "Gb", "Ab", "Bb", "C", "D", "Eb"],
    "Eb minor melodic descending": ["Eb", "Db", "Cb", "Bb", "Ab", "Gb", "F", "Eb"],
  };
  const strip = (p: string) => p.replace(/-?\d$/, "");
  it("every scale answer equals a hand-typed table of the four scales (with their double sharps and flats), in every form and direction", () => {
    const seen = new Set<string>();
    for (const node of ["G5-U3-L01", "G5-U3-L02"]) {
      for (const it of items(node, "t.g5.scale-build", 300)) {
        const d = A(it).derivation;
        const dirs: Array<"ascending" | "descending"> = d.direction === "ascending-descending" ? ["ascending"] : [d.direction];
        const pitchNames = (A(it).accepted[0] as string[]).map(strip);
        let key: string;
        if (d.key.endsWith("major")) key = d.key;
        else key = `${d.key} ${d.form === "harmonic" ? "harmonic" : "melodic"} ${d.direction === "descending" ? "descending" : "ascending"}`;
        const table = SCALES[d.key.endsWith("major") ? d.key : (d.direction === "descending" ? `${d.key} melodic descending` : `${d.key} ${d.form} ascending`)];
        void dirs; void key;
        if (d.direction === "ascending-descending") {
          const up = SCALES[d.key.endsWith("major") ? d.key : `${d.key} ${d.form} ascending`]!;
          const down = d.key.endsWith("major") ? [...up].reverse() : d.form === "harmonic" ? [...SCALES[`${d.key} harmonic ascending`]!].reverse() : SCALES[`${d.key} melodic descending`]!;
          expect(pitchNames, it.id).toEqual([...up, ...down.slice(1)]);
        } else if (d.direction === "descending" && d.key.endsWith("major")) expect(pitchNames, it.id).toEqual([...SCALES[d.key]!].reverse());
        else if (d.direction === "descending" && d.form === "harmonic") expect(pitchNames, it.id).toEqual([...SCALES[`${d.key} harmonic ascending`]!].reverse());
        else expect(pitchNames, it.id).toEqual(table);
        seen.add(`${d.key} ${d.form} ${d.direction}`);
      }
    }
    expect(seen.size).toBeGreaterThan(14);
  });

  it("the key signatures have six sharps or flats, by the circle of fifths", () => {
    expect(fifths("F# major")).toBe(6);
    expect(fifths("D# minor")).toBe(6);
    expect(fifths("Gb major")).toBe(-6);
    expect(fifths("Eb minor")).toBe(-6);
    for (const it of items("G5-U3-L01", "t.g5.key-facts", 150)) {
      const m = /sharps|flats/.exec(it.prompt);
      if (!m) continue;
      const key = /of (.*)\?/.exec(it.prompt)![1]!.replace("♯", "#").replace("♭", "b");
      const right = A(it).options.find((o: any) => o.id === A(it).correctOptionIds[0]).id as string;
      expect(right, it.prompt).toBe(`${fifths(key) > 0 ? "sharps" : "flats"}-${Math.abs(fifths(key))}`);
    }
  });
});

describe("Unit 3: intervals", () => {
  it("chromatic and diatonic interval answers match an independent letters-and-semitones calculation, and are never doubly augmented or diminished", () => {
    let chromatic = 0;
    for (const it of items("G5-U3-L03", "t.g5.interval-any", 300)) {
      const a = A(it);
      const lo = pn(a.lower);
      const hi = pn(a.upper);
      expect(a.acceptedIntervals[0], it.id).toBe(intervalOf(lo, hi));
      expect(["dd", "AA"].some((q) => a.acceptedIntervals[0].startsWith(q))).toBe(false);
      // both distances are real: letters for the number, semitones for the quality
      const num = steps(hi) - steps(lo) + 1;
      expect(Number(a.acceptedIntervals[0].replace(/\D/g, ""))).toBe(num);
      if (music.isChromaticPairOfPitches(music.parsePitch(a.lower), music.parsePitch(a.upper))) chromatic++;
    }
    expect(chromatic).toBeGreaterThan(80);
  });

  it("interval writing: the accepted note is the right letter and semitone distance above or below", () => {
    for (const it of items("G5-U3-L03", "t.g5.interval-write", 300)) {
      const a = A(it);
      const start = pn(a.lower);
      const goal = pn(a.acceptedPitches[0]);
      const [lo, hi] = a.direction === "up" ? [start, goal] : [goal, start];
      expect(intervalOf(lo, hi), it.id).toBe(a.target);
    }
  });

  it("compound intervals: a 12th is a 5th plus an octave (7 + 5, never 8 + 5), and both accepted names agree", () => {
    for (const it of items("G5-U3-L04", "t.g5.interval-compound", 300)) {
      const a = A(it);
      const lo = pn(a.lower);
      const hi = pn(a.upper);
      const code = intervalOf(lo, hi);
      expect(a.acceptedIntervals).toContain(code);
      const num = Number(code.replace(/\D/g, ""));
      expect(num).toBeGreaterThan(8);
      const compound = a.acceptedIntervals.find((x: string) => x.startsWith("c"))!;
      expect(compound).toBe(`c${code[0]}${num - 7}`);
    }
    for (const it of items("G5-U3-L04", "t.g5.compound-facts", 200)) {
      const right = A(it).correctOptionIds[0] as string;
      if (/number of the whole interval/.test(it.prompt)) {
        const simple = Number(/a (\d+)(st|nd|rd|th)/.exec(it.prompt)![1]);
        expect(Number(right)).toBe(simple + 7);
      }
    }
  });

  it("a respelt (enharmonic) note, a wrong accidental and the right note in another octave are each graded wrong", () => {
    const scope = scopeOf("G5-U3-L03", "t.g5.interval-write");
    let n = 0;
    for (const it of items("G5-U3-L03", "t.g5.interval-write", 120)) {
      const a = A(it);
      const goal = pn(a.acceptedPitches[0]);
      const respelt = move(goal, 1, 0);
      const sharper = move(goal, 0, 1);
      const bad = [respelt, sharper, { ...goal, oct: goal.oct + 1 }].filter((p) => Math.abs(p.alter) <= 2).map((p) => `${name(p)}${p.oct}`);
      for (const p of bad) {
        const r = gradeItem(ix, it, { kind: "staff-position", pitch: p } as never, scope);
        expect(r.correct, `${it.id}: ${p} for ${a.acceptedPitches[0]}`).toBe(false);
      }
      expect(gradeItem(ix, it, { kind: "staff-position", pitch: a.acceptedPitches[0] } as never, scope).correct).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe("Unit 3: transposing instruments", () => {
  // letter steps and semitones the WRITTEN note is above the SOUNDING one
  const INTERVAL: Record<string, [number, number]> = { M2: [1, 2], m3: [2, 3], P5: [4, 7] };
  it("every transposed phrase is moved by exactly the stated interval in the stated direction, note by note", () => {
    let n = 0;
    for (const it of items("G5-U3-L06", "t.g5.instrument-transpose", 300)) {
      const a = A(it);
      const [dl, ds] = INTERVAL[a.derivation.interval]!;
      const sign = a.derivation.direction === "up" ? 1 : -1;
      const src = it.music!.measures.flatMap((m) => m.events as any[]).map((e) => pn(e.pitch));
      const out = (a.accepted[0] as string[]).map(pn);
      expect(out.length).toBe(src.length);
      out.forEach((o, i) => { const want = move(src[i]!, sign * dl, sign * ds); expect(name(o) + o.oct, `${it.id} note ${i + 1}`).toBe(name(want) + want.oct); });
      // the prompt's direction and the derivation agree: concert -> written goes up, written -> concert goes down
      expect(/concert pitch \(the pitch that sounds\)\. Write it as/.test(it.prompt) ? "up" : "down").toBe(a.derivation.direction);
      // the key signature moves by the interval: up a tone is +2 fifths, up a minor 3rd is -3 fifths, up a perfect 5th is +1
      const fifthsShift = ({ M2: 2, m3: -3, P5: 1 } as Record<string, number>)[a.derivation.interval]! * sign;
      expect([fifthsShift, fifthsShift - 12, fifthsShift + 12], `${it.id} ${it.music!.key} -> ${a.key}`).toContain(fifths(a.key) - fifths(it.music!.key!));
      n++;
    }
    expect(n).toBeGreaterThan(60);
  });

  it("direction is never ambiguous: transposing the wrong way, or not at all, is graded wrong", () => {
    const scope = scopeOf("G5-U3-L06", "t.g5.instrument-transpose");
    let n = 0;
    for (const it of items("G5-U3-L06", "t.g5.instrument-transpose", 100)) {
      const a = A(it);
      const [dl, ds] = INTERVAL[a.derivation.interval]!;
      const sign = a.derivation.direction === "up" ? -1 : 1;
      const src = it.music!.measures.flatMap((m) => m.events as any[]).map((e) => pn(e.pitch));
      const opposite = src.map((p) => { const w = move(p, sign * dl, sign * ds); return `${name(w)}${w.oct}`; });
      expect(gradeItem(ix, it, { kind: "pitch-sequence", pitches: opposite, key: a.key } as never, scope).correct, it.id).toBe(false);
      expect(gradeItem(ix, it, { kind: "pitch-sequence", pitches: src.map((p) => `${name(p)}${p.oct}`), key: it.music!.key } as never, scope).correct, `${it.id} untransposed`).toBe(false);
      // the right notes with the old key signature are not enough
      const right = gradeItem(ix, it, { kind: "pitch-sequence", pitches: a.accepted[0], key: it.music!.key } as never, scope);
      if (it.music!.key !== a.key) expect(right.correct, `${it.id} old key signature`).toBe(false);
      n++;
    }
    expect(n).toBeGreaterThan(30);
  });

  it("conventional sounding-pitch relationships: B♭ a tone, A a minor 3rd, F a perfect 5th lower than written", () => {
    let n = 0;
    for (const it of items("G5-U3-L05", "t.g5.concert-facts", 300)) {
      const m = /A (clarinet in B♭|clarinet in A|trumpet in B♭|horn in F|cor anglais \(in F\)) plays the written note ([A-G][♯♭]?)\. Which note sounds/.exec(it.prompt);
      if (!m) continue;
      const inst = m[1]!.includes("B♭") ? "M2" : m[1]!.includes("in A") ? "m3" : "P5";
      const [dl, ds] = INTERVAL[inst]!;
      const written = pn(`${m[2]!.replace("♯", "#").replace("♭", "b")}4`);
      const sounds = move(written, -dl, -ds);
      const right = A(it).options.find((o: any) => o.id === A(it).correctOptionIds[0]).label as string;
      expect(right.replace("♯", "#").replace("♭", "b"), it.prompt).toBe(name(sounds));
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });

  it("transposed keys: the key signature of the part is found by moving the key, and the instrument's name is never the right key", () => {
    let n = 0;
    for (const it of items("G5-U3-L05", "t.g5.transpose-key", 300)) {
      const m = /(B♭ ?|A |F )?.*in (.*?) is at concert|written part for a (.*?) is in (.*?)\./.exec(it.prompt);
      void m;
      const right = A(it).correctOptionIds[0] as string;
      const toWritten = /is at concert pitch/.test(it.prompt);
      const keyShown = /(?:A melody in|is in) ([A-G][♯♭]? (?:major|minor))/.exec(it.prompt)![1]!.replace("♯", "#").replace("♭", "b");
      const inst = /clarinet in B♭|trumpet in B♭/.test(it.prompt) ? 2 : /clarinet in A/.test(it.prompt) ? -3 : 1;
      const shift = (toWritten ? 1 : -1) * inst;
      // the new key's signature differs from the old one by the fifths of the interval, modulo the equivalent respelling of 12 fifths
      const d = fifths(right) - fifths(keyShown);
      expect([shift, shift - 12, shift + 12], `${it.prompt} -> ${right}`).toContain(d);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });
});

describe("Unit 4: inversions, the supertonic chord and cadences", () => {
  /** Independent chord reading: find the root by a stack of thirds in letter names; the lowest note decides the position. */
  function readChord(pitches: string[]): { root: number; inv: string } {
    const ns = pitches.map(pn).sort((a, b) => semis(a) - semis(b));
    const lets = [...new Set(ns.map((n) => n.l))];
    for (const r of lets) {
      if (lets.length === 3 && lets.includes((r + 2) % 7) && lets.includes((r + 4) % 7)) {
        const bass = ns[0]!.l;
        return { root: r, inv: bass === r ? "a" : bass === (r + 2) % 7 ? "b" : "c" };
      }
    }
    throw new Error(`not a triad ${pitches.join(",")}`);
  }
  const DEGREE: Record<string, number> = { I: 1, ii: 2, IV: 4, V: 5 };
  const tonicLetter = (key: string) => LETTERS.indexOf(key[0]!);
  const degreeOf = (root: number, key: string) => ((root - tonicLetter(key) + 7) % 7) + 1;

  it("chord identification: root by thirds and position by the lowest note agree with the accepted answer; spacing and doubling never matter", () => {
    let inv = 0;
    let doubled = 0;
    for (const node of ["G5-U4-L01", "G5-U4-L02", "G5-U4-L03"]) {
      for (const it of items(node, "t.g5.chord-identify", 300)) {
        const e = it.music!.measures[0]!.events![0] as any;
        const pitches = (e.notes as any[]).map((n) => n.pitch as string);
        const r = readChord(pitches);
        const acc = A(it).acceptedChords[0];
        expect(DEGREE[acc.roman], it.id).toBe(degreeOf(r.root, A(it).key));
        expect(acc.inversion, it.id).toBe(r.inv);
        if (r.inv !== "a") inv++;
        if (pitches.length === 4) doubled++;
      }
    }
    expect(inv).toBeGreaterThan(100);
    expect(doubled).toBeGreaterThan(20);
  });

  it("an inversion is graded from the bass note alone: the same notes in another position are wrong, and a different spacing of the same position is right", () => {
    const scope = scopeOf("G5-U4-L01", "t.g5.chord-identify");
    let n = 0;
    for (const it of items("G5-U4-L01", "t.g5.chord-identify", 100)) {
      const acc = A(it).acceptedChords[0];
      for (const inversion of ["a", "b", "c"]) {
        const r = gradeItem(ix, it, { kind: "chord-name", roman: acc.roman, inversion } as never, scope);
        expect(r.correct, `${it.id} ${acc.roman}${inversion}`).toBe(inversion === acc.inversion);
      }
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });

  it("the supertonic chord of a minor key is a diminished triad: a minor 3rd and a diminished 5th above its root", () => {
    let minorSeen = 0;
    for (const it of items("G5-U4-L02", "t.g5.supertonic-facts", 300)) {
      if (!/kind of triad/.test(it.prompt)) continue;
      const minor = /minor/.test(/in ([A-G][♯♭]? (?:major|minor))/.exec(it.prompt)![1]!);
      expect(A(it).correctOptionIds[0], it.prompt).toBe(minor ? "diminished" : "minor");
      if (minor) minorSeen++;
    }
    expect(minorSeen).toBeGreaterThan(5);
    for (const it of items("G5-U4-L02", "t.g5.chord-build", 200)) {
      const a = A(it);
      if (a.target.roman !== "ii" || !a.key.endsWith("minor")) continue;
      const notes = a.acceptedVoicings[0].map(pn).sort((x: N, y: N) => semis(x) - semis(y));
      const r = readChord(a.acceptedVoicings[0]);
      const root = notes.find((n: N) => n.l === r.root)!;
      const rootRef = { ...root, oct: 3 };
      const third = notes.find((n: N) => n.l === (r.root + 2) % 7)!;
      const fifth = notes.find((n: N) => n.l === (r.root + 4) % 7)!;
      const up = (x: N) => { let o = 3; while (steps({ ...x, oct: o }) <= steps(rootRef)) o++; return { ...x, oct: o }; };
      expect(intervalOf(rootRef, up(third))).toBe("m3");
      expect(intervalOf(rootRef, up(fifth))).toBe("d5");
    }
  });

  it("cadences: perfect is V-I, plagal IV-I, imperfect ends on V, derived from the chords as printed in both bars", () => {
    const classify = (a: number, b: number) => (a === 5 && b === 1 ? "perfect" : a === 4 && b === 1 ? "plagal" : b === 5 && [1, 2, 4].includes(a) ? "imperfect" : null);
    let n = 0;
    for (const node of ["G5-U4-L04", "G5-U4-L05"]) {
      for (const it of items(node, "t.g5.cadence-identify", 200)) {
        const upper = it.score!.staves[0]!.music.measures.map((m) => (m.events![0] as any).notes.map((x: any) => x.pitch as string));
        const lower = it.score!.staves[1]!.music.measures.map((m) => (m.events![0] as any).pitch as string);
        const roots = upper.map((u, i) => readChord([...u, lower[i]!]));
        const degrees = roots.map((r) => degreeOf(r.root, it.score!.staves[0]!.music.key!));
        expect(roots[2]!.inv).toBe("a");
        expect(roots[3]!.inv).toBe("a");
        expect(A(it).correctOptionIds[0], it.id).toBe(classify(degrees[2]!, degrees[3]!));
        n++;
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it("two cadence points in one phrase are each named from their own pair of chords", () => {
    const classify = (a: number, b: number) => (a === 5 && b === 1 ? "perfect" : a === 4 && b === 1 ? "plagal" : b === 5 && [1, 2, 4].includes(a) ? "imperfect" : null);
    for (const it of items("G5-U4-L05", "t.g5.cadence-find", 200)) {
      const upper = it.score!.staves[0]!.music.measures.map((m) => (m.events![0] as any).notes.map((x: any) => x.pitch as string));
      const lower = it.score!.staves[1]!.music.measures.map((m) => (m.events![0] as any).pitch as string);
      const d = upper.map((u, i) => degreeOf(readChord([...u, lower[i]!]).root, it.score!.staves[0]!.music.key!));
      const parts = (A(it).parts as any[]);
      expect(parts[0].answer.correctOptionIds[0]).toBe(classify(d[0]!, d[1]!));
      expect(parts[1].answer.correctOptionIds[0]).toBe(classify(d[2]!, d[3]!));
    }
  });

  it("chords at cadence points: every accepted chord contains its melody note, the pair makes the named cadence, and the melody leaves no other cadence type possible", () => {
    const scope = scopeOf("G5-U4-L06", "t.g5.cadence-chords");
    let n = 0;
    for (const it of items("G5-U4-L06", "t.g5.cadence-chords", 200)) {
      const a = A(it);
      expect(a.cadences[0].acceptedTypes.length, it.id).toBe(1);
      for (const p of a.points) {
        const note = pn(p.melodyPitches[0]);
        for (const r of p.accepted as string[]) {
          const deg = DEGREE[r]!;
          // the melody note's letter is one of the chord's three letters (root, third, fifth above the degree's letter)
          const rootLetter = (tonicLetter(a.key) + deg - 1) % 7;
          expect([rootLetter, (rootLetter + 2) % 7, (rootLetter + 4) % 7], `${it.id} ${r}`).toContain(note.l);
        }
      }
      // the canonical answer passes; a chord lacking its melody note fails
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct).toBe(true);
      const bad = wrongResponse(ix, it, scope);
      if (bad) expect(gradeItem(ix, it, bad, scope).correct).toBe(false);
      n++;
    }
    expect(n).toBeGreaterThan(60);
  });

  it("cadence questions stay in C, G, D and F major", () => {
    for (const t of ["t.g5.cadence-identify", "t.g5.cadence-find", "t.g5.cadence-chords", "t.g5.chord-choice"]) {
      for (const it of items("G5-U4-L06", t.replace("cadence-identify", "cadence-chords").replace("cadence-find", "cadence-chords"), 60)) {
        const key = A(it).key ?? it.music?.key ?? it.score?.staves[0]?.music.key;
        if (key) expect(["C major", "G major", "D major", "F major"]).toContain(key);
      }
    }
  });
});

describe("Unit 5: ornaments, voices, instruments, terms and the score", () => {
  it("replacing written-out notes: the sign is found from letter steps around the main note, independently", () => {
    let n = 0;
    for (const it of items("G5-U5-L02", "t.g5.ornament-replace", 300)) {
      const a = A(it);
      const main = pn(a.mainNote);
      const figure = (a.writtenOut as string[]).map((p) => steps(pn(p)) - steps(main));
      const pattern = figure.join();
      const LEN: Record<string, number> = { crotchet: 8, quaver: 4, semiquaver: 2, demisemiquaver: 1 };
      const len = (v: { value: string; dots?: number }) => LEN[v.value]! * (v.dots ? 1.5 : 1);
      // two notes a step apart, the second on the main note: equal lengths are an appoggiatura, a very short note before a long one an acciaccatura
      const pair = figure.length === 2 && figure[1] === 0 && Math.abs(figure[0]!) === 1 ? (len(a.writtenOutValues[0]) === len(a.writtenOutValues[1]) ? "appoggiatura" : len(a.writtenOutValues[0]) <= 2 && len(a.writtenOutValues[1]) >= 3 * len(a.writtenOutValues[0]) ? "acciaccatura" : null) : undefined;
      const truth = pair !== undefined ? pair : pattern === "0,1,0" ? "upper-mordent" : pattern === "0,-1,0" ? "lower-mordent" : (pattern === "1,0,-1,0" || pattern === "0,1,0,-1,0") ? "turn" : figure.slice(0, 6).every((x, i) => x === (i % 2 === 0 ? 1 : 0)) && figure.slice(-2).join() === "-1,0" ? "trill" : null;
      expect(truth, it.id).toBe(a.accepted[0]);
      n++;
    }
    expect(n).toBeGreaterThan(60);
  });

  it("no ornament question asks for the notes of an ornament to be written from its sign", () => {
    for (const t of ["t.g5.ornament-replace", "t.g5.ornament-facts", "t.g5.ornament-read", "t.g5.ornament-figure"]) {
      const node = [...ix.nodeById.values()].find((x) => x.exercises.some((b) => b.templateId === t))!;
      for (const it of items(node.id, t, 80)) {
        expect(["ornament-sign", "choice"]).toContain(it.answer.kind);
        expect(/write out|writing out/i.test(it.prompt)).toBe(false);
        if (it.answer.kind === "ornament-sign") expect(A(it).task).toBe("replace-written-out");
      }
    }
  });

  it("voice questions only ask the two unmistakable ranges: wholly above the alto's D5 is soprano, wholly below the tenor's C3 is bass", () => {
    let n = 0;
    for (const it of items("G5-U5-L03", "t.g5.voices", 300)) {
      if (!it.music) continue;
      const ps = it.music.measures.flatMap((m) => m.events as any[]).filter((e) => e.kind === "note").map((e) => pn(e.pitch));
      const right = A(it).correctOptionIds[0];
      if (right === "soprano") expect(ps.every((p) => steps(p) > steps(pn("D5")))).toBe(true);
      else { expect(right).toBe("bass"); expect(ps.every((p) => steps(p) < steps(pn("C3")))).toBe(true); }
      n++;
    }
    expect(n).toBeGreaterThan(30);
  });

  it("term questions: one right answer, no synonym among the wrong ones, and only Grade 5 terms", () => {
    const g5 = new Map(music.TERMS_G5.map((t) => [t.id, t]));
    for (const t of ["t.g5.terms", "t.g5.term-use"]) {
      for (const it of items("G5-U5-L06", t, 200)) {
        const ids = A(it).options.map((o: any) => o.id as string);
        const right = A(it).correctOptionIds[0] as string;
        if (!g5.has(right)) continue; // a German phrase translation: options are English phrases
        for (const id of ids) expect(g5.has(id), `${t} option ${id}`).toBe(true);
        const groups = ids.map((id: string) => g5.get(id)!.group);
        expect(new Set(groups).size, `${t} ${it.prompt}`).toBe(ids.length);
      }
    }
  });

  it("a passage question has several connected parts, and each part is answerable and graded right when answered right", () => {
    const scope = scopeOf("G5-U5-L07", "t.g5.score");
    const kinds = new Set<string>();
    for (const it of items("G5-U5-L07", "t.g5.score", 120)) {
      const parts = A(it).parts as any[];
      expect(parts.length, it.id).toBeGreaterThanOrEqual(4);
      for (const p of parts) kinds.add(p.id);
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct).toBe(true);
    }
    for (const k of ["cadence", "key", "chord", "ornament", "term", "interval", "clef"]) expect(kinds.has(k) || (k === "clef" && kinds.has("sound")), k).toBe(true);
  });
});

describe("generation is deterministic, identities are stable, and the Grade 5 vocabulary is version-safe", () => {
  it("the same seed gives the same question for every Grade 5 template", () => {
    for (const t of [...ix.templates.values()].filter((x) => x.grade === 5)) {
      for (const s of [3, 17, 91]) {
        let a: ExerciseItem;
        try { a = generateItem(ix, t.id, s).item; } catch { continue; }
        expect(JSON.stringify(generateItem(ix, t.id, s).item), `${t.id}#${s}`).toBe(JSON.stringify(a));
      }
    }
  });

  it("every Grade 5 template's canonical answer is graded right and a wrong answer wrong, across many seeds", () => {
    let checked = 0;
    for (const t of [...ix.templates.values()].filter((x) => x.grade === 5)) {
      for (let s = 1; s <= 25; s++) {
        let item: ExerciseItem;
        try { item = generateItem(ix, t.id, s).item; } catch { continue; }
        const sc = templateScope(ix, t);
        expect(gradeItem(ix, item, canonicalResponse(ix, item, sc), sc).correct, `${t.id}#${s}`).toBe(true);
        const bad = wrongResponse(ix, item, sc);
        if (bad) expect(gradeItem(ix, item, bad, sc).correct, `${t.id}#${s} wrong`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(900);
  });

  it("a Grade 5 fingerprint depends on the Grade 5 vocabulary, a Grade 4 one does not, and Grade 1-3 identities are unchanged", () => {
    const g5 = ix.templates.get("t.g5.terms")!;
    const withV = generationFingerprint(g5, g5.scope as never);
    const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v);
    const hash = (s: string) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    const without = hash(JSON.stringify(canonical({ rev: 1, template: g5, scope: g5.scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES } }))).toString(16).padStart(8, "0");
    expect(withV).not.toBe(without);
    const g4 = ix.templates.get("t.g4.terms")!;
    const g4f = generationFingerprint(g4, g4.scope as never);
    const g4Old = hash(JSON.stringify(canonical({ rev: 1, template: g4, scope: g4.scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES }, vocab4: music.VOCAB_G4 }))).toString(16).padStart(8, "0");
    expect(g4f).toBe(g4Old);
    for (const t of ix.templates.values()) {
      if (t.grade >= 4) continue;
      const old = hash(JSON.stringify(canonical({ rev: 1, template: t, scope: t.scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES } }))).toString(16).padStart(8, "0");
      expect(generationFingerprint(t, t.scope as never), t.id).toBe(old);
    }
    expect(music.VOCAB_G5.terms.map((x) => x.id).filter((id) => music.TERMS_G4.some((y) => y.id === id))).toEqual([]);
  });
});
