/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely typed answer specs */
import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, gradeItem } from "../src/index.ts";

/**
 * Independent check of the intervals-under-a-key-signature generators (PR #14 reconciled with the complete app). Every answer is re-derived
 * from what the learner SEES: the printed key signature and the written accidentals of the stave, with hand-rolled letter and semitone
 * arithmetic and a circle-of-fifths table that do not use the production helpers. Adversarial answers go through the real engine.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const NODE = "G5-U3-L07";
const SEEDS = 300;
const node = ix.nodeById.get(NODE)!;
const scopeFor = (t: string) => effectiveScope(ix, node, node.exercises.find((x) => x.templateId === t)!);
function items(t: string): ExerciseItem[] {
  const scope = scopeFor(t);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    try { out.push(generateItem(ix, t, s, { scope }).item); } catch { /* skipped seed */ }
  }
  expect(out.length, t).toBeGreaterThan(SEEDS * 0.8);
  return out;
}
const A = (i: ExerciseItem) => i.answer as unknown as Record<string, any>;

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
const ALT: Record<string, number> = { bb: -2, b: -1, "": 0, "#": 1, x: 2 };
interface N { l: number; alter: number; oct: number }
const pn = (text: string): N => { const m = /^([A-G])(bb|b|#|x)?(-?\d)$/.exec(text)!; return { l: LETTERS.indexOf(m[1]!), alter: ALT[m[2] ?? ""]!, oct: Number(m[3]) }; };
const steps = (n: N) => n.oct * 7 + n.l;
const semis = (n: N) => n.oct * 12 + SEMI[n.l]! + n.alter;
const fmt = (n: N) => `${LETTERS[n.l]}${({ "-1": "b", "0": "", "1": "#" } as Record<string, string>)[String(n.alter)] ?? "?"}${n.oct}`;
const BASE: Record<number, [number, "P" | "M"]> = { 1: [0, "P"], 2: [2, "M"], 3: [4, "M"], 4: [5, "P"], 5: [7, "P"], 6: [9, "M"], 7: [11, "M"], 8: [12, "P"] };
function quality(num: number, s: number): string {
  const [base, kind] = BASE[num]!;
  const d = s - base;
  return (kind === "P" ? ({ "-1": "d", "0": "P", "1": "A" } as Record<string, string>) : ({ "-2": "d", "-1": "m", "0": "M", "1": "A" } as Record<string, string>))[String(d)] ?? "?";
}
const interval = (lo: N, hi: N) => { const num = steps(hi) - steps(lo) + 1; return `${quality(num, semis(hi) - semis(lo))}${num}`; };
// circle of fifths: order of sharps and flats and the key's number of them
const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS = ["B", "E", "A", "D", "G", "C", "F"];
const MAJ: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
const MIN: Record<string, number> = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };
const fifths = (key: string) => { const [t, m] = key.split(" "); return (m === "major" ? MAJ : MIN)[t!]!; };
const sigAlter = (key: string, letter: string) => { const f = fifths(key); return f > 0 && SHARPS.slice(0, f).includes(letter) ? 1 : f < 0 && FLATS.slice(0, -f).includes(letter) ? -1 : 0; };
const SIGN: Record<string, number> = { sharp: 1, flat: -1, natural: 0, "double-sharp": 2, "double-flat": -2 };

/** What the learner reads: the key signature, then a sign in front of the note (a sign lasts to the end of the bar). */
function seen(i: ExerciseItem): N[] {
  const key = i.music!.key!;
  const bar: Record<string, number> = {};
  const out: N[] = [];
  for (const m of i.music!.measures) for (const e of m.events as any[]) {
    const p = pn(e.pitch);
    const letter = `${LETTERS[p.l]}${p.oct}`;
    const written = e.writtenAccidental as string | undefined;
    if (written) bar[letter] = SIGN[written]!;
    const alter = letter in bar ? bar[letter]! : sigAlter(key, LETTERS[p.l]!);
    out.push({ ...p, alter });
  }
  return out;
}
const ignoring = (n: N, key: string): N => (sigAlter(key, LETTERS[n.l]!) === n.alter ? { ...n, alter: 0 } : n);

describe("intervals under a key signature (identify)", () => {
  const list = items("t.g5.interval-key-identify");

  it("the printed signs agree with the answer: what the learner reads is the spelling the answer uses", () => {
    for (const it of list) {
      const a = A(it);
      const [lo, hi] = seen(it);
      expect(fmt(lo!), it.id).toBe(fmt(pn(a.lower)));
      expect(fmt(hi!), it.id).toBe(fmt(pn(a.upper)));
      expect(it.music!.key, it.id).toBe(a.key);
      expect(it.music!.showKeySignature, it.id).toBe(true);
    }
  });

  it("the interval is correct by independent arithmetic, simple, within an octave, with no double accidentals", () => {
    for (const it of list) {
      const a = A(it);
      const lo = pn(a.lower);
      const hi = pn(a.upper);
      expect(a.acceptedIntervals, it.id).toEqual([interval(lo, hi)]);
      expect(steps(hi) - steps(lo) + 1, it.id).toBeGreaterThanOrEqual(2);
      expect(steps(hi) - steps(lo) + 1, it.id).toBeLessThanOrEqual(7);
      expect(Math.abs(lo.alter) + Math.abs(hi.alter) <= 2 && Math.abs(lo.alter) <= 1 && Math.abs(hi.alter) <= 1, it.id).toBe(true);
      expect(a.acceptedIntervals[0], it.id).toMatch(/^[dmMPA][2-7]$/);
    }
  });

  it("the signature always matters (at least one note's letter is in it) and most questions are traps: the bare letters give a different answer", () => {
    let trap = 0;
    let plain = 0;
    for (const it of list) {
      const a = A(it);
      const lo = pn(a.lower);
      const hi = pn(a.upper);
      expect(sigAlter(a.key, LETTERS[lo.l]!) !== 0 || sigAlter(a.key, LETTERS[hi.l]!) !== 0, it.id).toBe(true);
      const bare = interval(ignoring(lo, a.key), ignoring(hi, a.key));
      if (bare !== a.acceptedIntervals[0]) trap++; else plain++;
    }
    expect(trap / list.length).toBeGreaterThan(0.6);
    expect(plain, "some questions are not traps").toBeGreaterThan(0);
  });

  it("a written sign that overrides the signature occurs, in both directions (natural, and the opposite accidental)", () => {
    const signs = new Set<string>();
    for (const it of list) for (const m of it.music!.measures) for (const e of m.events as any[]) if (e.writtenAccidental) signs.add(e.writtenAccidental);
    expect(signs.has("natural")).toBe(true);
    expect(signs.size).toBeGreaterThanOrEqual(3);
  });

  it("never writes a sign the lesson does not teach: no sharp where the signature flats a letter, no flat where it sharps one (review of PR #16, finding C)", () => {
    for (const it of list) {
      const a = A(it);
      for (const n of seen(it)) {
        const sig = sigAlter(a.key, LETTERS[n.l]!);
        const ok = n.alter === sig || (sig !== 0 && n.alter === 0) || (sig === 0 && Math.abs(n.alter) === 1);
        expect(ok, `${it.id}: ${fmt(n)} in ${a.key}`).toBe(true);
      }
    }
  });

  it("uses sharp and flat keys, major and minor, and three clefs", () => {
    const keys = new Set(list.map((i) => A(i).key as string));
    expect([...keys].some((k) => fifths(k) > 0)).toBe(true);
    expect([...keys].some((k) => fifths(k) < 0)).toBe(true);
    expect([...keys].some((k) => k.endsWith("minor"))).toBe(true);
    expect(Math.max(...[...keys].map((k) => Math.abs(fifths(k))))).toBe(6);
    expect(new Set(list.map((i) => i.music!.clef))).toEqual(new Set(["treble", "bass", "alto"]));
  });

  it("the canonical answer is right; the bare-letter answer gets the ignored-key-signature feedback; a wrong number does not", () => {
    const scope = scopeFor("t.g5.interval-key-identify");
    let ignored = 0;
    for (const it of list) {
      const a = A(it);
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct, it.id).toBe(true);
      const lo = pn(a.lower);
      const hi = pn(a.upper);
      const bare = interval(ignoring(lo, a.key), ignoring(hi, a.key));
      if (/^[dmMPA][1-9]$/.test(bare) && bare !== a.acceptedIntervals[0]) {
        const r = gradeItem(ix, it, { kind: "interval-name", number: Number(bare.slice(1)), quality: bare[0] } as never, scope);
        expect(r.correct, it.id).toBe(false);
        expect(r.category, it.id).toBe("ignored-key-signature");
        expect(r.reason ?? "", it.id).toContain("key signature");
        ignored++;
      }
      const num = Number(a.acceptedIntervals[0].slice(1));
      const off = gradeItem(ix, it, { kind: "interval-name", number: num === 7 ? 6 : num + 1, quality: a.acceptedIntervals[0][0] } as never, scope);
      expect(off.correct, it.id).toBe(false);
    }
    expect(ignored).toBeGreaterThan(list.length / 2);
  });

  it("is deterministic: the same seed makes the same question", () => {
    const scope = scopeFor("t.g5.interval-key-identify");
    for (const s of [1, 7, 42]) expect(JSON.stringify(generateItem(ix, "t.g5.interval-key-identify", s, { scope }).item)).toBe(JSON.stringify(generateItem(ix, "t.g5.interval-key-identify", s, { scope }).item));
  });
});

describe("intervals under a key signature (write)", () => {
  const list = items("t.g5.interval-key-build");

  it("the note to write is correct by independent arithmetic, in the right direction, with no double accidentals", () => {
    for (const it of list) {
      const a = A(it);
      const start = pn(a.lower);
      const goal = pn(a.acceptedPitches[0]);
      expect(a.acceptedPitches, it.id).toHaveLength(1);
      expect(Math.abs(goal.alter), it.id).toBeLessThanOrEqual(1);
      const [lo, hi] = a.direction === "up" ? [start, goal] : [goal, start];
      expect(interval(lo, hi), it.id).toBe(a.target);
      expect(steps(goal) > steps(start), it.id).toBe(a.direction === "up");
      expect(it.music!.key, it.id).toBe(a.key);
      expect(seen(it).map(fmt), it.id).toEqual([fmt(start)]);
    }
  });

  it("the given note and the note to write only carry signs the lesson teaches (review of PR #16, finding C)", () => {
    for (const it of list) {
      const a = A(it);
      for (const p of [pn(a.lower), pn(a.acceptedPitches[0])]) {
        const sig = sigAlter(a.key, LETTERS[p.l]!);
        expect(p.alter === sig || (sig !== 0 && p.alter === 0) || (sig === 0 && Math.abs(p.alter) === 1), `${it.id}: ${fmt(p)} in ${a.key}`).toBe(true);
      }
    }
  });

  it("a sign is sometimes needed and sometimes not (neither always nor never)", () => {
    let needs = 0;
    for (const it of list) {
      const a = A(it);
      const goal = pn(a.acceptedPitches[0]);
      if (goal.alter !== sigAlter(a.key, LETTERS[goal.l]!)) needs++;
    }
    expect(needs / list.length).toBeGreaterThan(0.3);
    expect(needs / list.length).toBeLessThan(0.8);
  });

  it("the right note is accepted however it is written; a missing needed sign is named accidental-not-applied; a wrong letter is not", () => {
    const scope = scopeFor("t.g5.interval-key-build");
    let missing = 0;
    for (const it of list) {
      const a = A(it);
      const goal = pn(a.acceptedPitches[0]);
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct, it.id).toBe(true);
      expect(gradeItem(ix, it, { kind: "staff-position", pitch: a.acceptedPitches[0] } as never, scope).correct, it.id).toBe(true);
      const sig = sigAlter(a.key, LETTERS[goal.l]!);
      if (goal.alter !== sig) {
        // the learner writes the right letter on the right line and leaves the signature to supply the accidental
        const r = gradeItem(ix, it, { kind: "staff-position", pitch: fmt({ ...goal, alter: sig }) } as never, scope);
        expect(r.correct, it.id).toBe(false);
        expect(r.category, it.id).toBe("accidental-not-applied");
        missing++;
      }
      const wrongLetter = fmt({ ...goal, l: (goal.l + 1) % 7, oct: goal.l === 6 ? goal.oct + 1 : goal.oct, alter: 0 });
      expect(gradeItem(ix, it, { kind: "staff-position", pitch: wrongLetter } as never, scope).correct, it.id).toBe(false);
    }
    expect(missing).toBeGreaterThan(20);
  });

  it("the stave editor input carries the key, so a learner who writes no sign gets the signature's accidental", () => {
    for (const it of list.slice(0, 20)) {
      // inputFor tells the browser which key the stave uses; it must be the key the question shows
      expect(A(it).key).toBe(it.music!.key);
    }
  });
});
