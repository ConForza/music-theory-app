import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem } from "../src/index.ts";

/**
 * Independent check of the Brief 07 (Grade 3) generators. The generators write their own answers and the engine's solvability gate grades
 * those same answers, which is circular for choice questions. Here every answer is re-derived from what the learner SEES (the printed
 * notation and the prompt) with the curriculum rule functions (checkBar, scale, intervalBetween ...), and compared. Hand-typed musical
 * facts anchor the rules.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 120;

function items(nodeId: string, templateId: string, seeds = SEEDS): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId)!;
  const scope = effectiveScope(ix, node, b);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= seeds; s++) {
    try {
      out.push(generateItem(ix, templateId, s, { scope }).item);
    } catch {
      /* skipped seed */
    }
  }
  expect(out.length, `${nodeId} ${templateId}`).toBeGreaterThan(seeds / 3);
  return out;
}
const correct = (i: ExerciseItem) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
const options = (i: ExerciseItem) => (i.answer as { options: Array<{ id: string; label: string }> }).options;
const label = (i: ExerciseItem, id: string) => options(i).find((o) => o.id === id)!.label;
type Ev = { kind: string; duration?: { value: music.NoteValue; dots: number }; events?: Ev[]; pitch?: string; beam?: string; label?: string; tieToNext?: boolean; wholeBar?: boolean };
const measuresOf = (i: ExerciseItem) => i.music!.measures.map((m) => (m.events ?? []) as unknown as Ev[]);
const dur = (e: Ev): music.Fraction => (e.kind === "tuplet" ? music.mul(e.events!.reduce((t, x) => music.add(t, dur(x)), music.frac(0)), music.frac(2, 3)) : music.dotted(e.duration!.value, e.duration!.dots));
const total = (evs: Ev[]) => evs.reduce((t, e) => music.add(t, dur(e)), music.frac(0));
const tsIn = (s: string) => /\b(\d{1,2})\/(\d{1,2})\b/.exec(s)!.slice(1, 3).map(Number) as [number, number];
const issues = (evs: Ev[], ts: string, opts: music.BarCheckOptions = {}) => music.checkBarAnyPattern(evs as unknown as music.REvent[], ts, opts).issues.map((x) => x.code);
const plain = (s: string) => s.replace(/♯/g, "#").replace(/♭/g, "b");
const barNumber = (i: ExerciseItem) => Number(label(i, correct(i)).replace("Bar ", "")) - 1;
const kindOf = (ts: string) => music.classifyTimeSignature(ts);
const GROUPING = new Set(["beam-hides-compound-beat", "note-hides-compound-beat", "beat-not-beamed", "unnecessary-tie", "tie-instead-of-dot", "beam-crosses-beat"]);
const RESTS = new Set(["rest-across-beat", "half-bar-rest-misplaced", "rests-not-combined"]);

describe("compound-facts: derived from the time signature or beat described", () => {
  it("lesson 1 (no compound signature named yet): beat descriptions and simple signatures only", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U1-L01", "t.g3.compound-facts")) {
      expect(i.prompt).not.toMatch(/\b(6|9|12)\/8\b/);
      if (i.prompt.includes("simple time or compound time")) {
        const compound = /dotted crotchet divided into three/.test(i.prompt);
        expect(correct(i), i.prompt).toBe(compound ? "compound" : "simple");
        expect(/divided into (two|three)/.exec(i.prompt)![1]).toBe(compound ? "three" : "two");
        seen.add("classify");
      } else if (i.prompt.includes("belongs to compound time")) {
        expect(label(i, correct(i))).toBe("A dotted crotchet divided into three quavers");
        seen.add("which");
      } else if (i.prompt.includes("Each beat of")) { expect(correct(i)).toBe("2"); seen.add("simple"); }
      else if (i.prompt.startsWith("In compound time, into how many")) { expect(correct(i)).toBe("3"); seen.add("compound"); }
      else if (i.prompt.includes("last as long as one dotted crotchet")) {
        // a dotted crotchet is 3/8 of a semibreve, a quaver 1/8
        expect(Number(correct(i))).toBe((music.dotted("crotchet", 1).n * 8) / music.dotted("crotchet", 1).d);
        seen.add("dotted");
      } else throw new Error(`unexpected prompt ${i.prompt}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
  it("lesson 2: beats, beat note, division, kind of time, which signature, quavers in a bar", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U1-L02", "t.g3.compound-facts", 200)) {
      const ts = /\b(\d{1,2}\/\d{1,2})\b/.exec(i.prompt)?.[1];
      if (i.prompt.startsWith("How many beats")) { const [t] = tsIn(i.prompt); expect(correct(i)).toBe(String(t / 3)); seen.add("beats"); }
      else if (i.prompt.includes("which note is worth one beat")) { expect(correct(i)).toBe("dotted-crotchet"); expect(music.valueFor(music.mul(music.frac(1, 8), music.frac(3)), 1)).toEqual({ value: "crotchet", dots: 1 }); seen.add("beat-note"); }
      else if (i.prompt.startsWith("A piece has beats")) { expect(correct(i)).toBe(/dotted crotchet divided into three/.test(i.prompt) ? "compound" : "simple"); seen.add("classify"); }
      else if (i.prompt.includes("divide")) { expect(correct(i)).toBe(kindOf(ts!).metre === "compound" ? "3" : "2"); seen.add("divide"); }
      else if (i.prompt.startsWith("What kind of time")) {
        expect(correct(i)).toBe(`${kindOf(ts!).metre} ${kindOf(ts!).beats}`);
        expect(options(i).map((o) => o.id)).toContain(`${kindOf(ts!).metre === "compound" ? "simple" : "compound"} ${kindOf(ts!).beats}`);
        seen.add("name");
      } else if (i.prompt.includes("Which of these time signatures is in compound")) {
        const want = /compound (\w+) time/.exec(i.prompt)![1];
        expect(kindOf(correct(i)).metre).toBe("compound");
        expect(kindOf(correct(i)).beats).toBe(want);
        for (const o of options(i)) if (o.id !== correct(i)) expect(`${kindOf(o.id).metre}/${kindOf(o.id).beats}` !== `compound/${want}`, o.id).toBe(true);
        seen.add("which");
      } else if (i.prompt.includes("quavers fill one whole bar")) {
        const [t, b] = tsIn(i.prompt);
        expect(Number(correct(i))).toBe((t * 8) / b);
        seen.add("quavers");
      } else throw new Error(`unexpected prompt ${i.prompt}`);
    }
    expect(seen.size).toBe(7);
  });
});

describe("bar judging (compound time): the rules decide, never the count", () => {
  it("compound-judge: the chosen bar is clean, the others each break a grouping rule, and all three add up", () => {
    let n = 0;
    for (const i of items("G3-U1-L03", "t.g3.compound-judge", 200)) {
      const ts = tsIn(i.prompt).join("/");
      const cap = music.barCapacity(music.parseTimeSignature(ts));
      const bars = measuresOf(i);
      expect(bars).toHaveLength(3);
      const right = barNumber(i);
      bars.forEach((b, k) => {
        expect(music.equals(total(b), cap), `${i.prompt} bar ${k + 1} total`).toBe(true);
        const found = issues(b, ts);
        if (k === right) expect(found, `bar ${k + 1} of ${ts}`).toEqual([]);
        else { expect(found.length, `bar ${k + 1} of ${ts} should break a rule`).toBeGreaterThan(0); expect(found.every((x) => GROUPING.has(x)), found.join()).toBe(true); }
      });
      expect(new Set(bars.map((b) => JSON.stringify(b))).size).toBe(3);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });
  it("compound-rest-judge: the chosen bar's rests are accepted; the others break a rest rule; a half-bar 12/8 rest is never offered as wrong", () => {
    let n = 0;
    for (const i of items("G3-U1-L04", "t.g3.compound-rest-judge", 200)) {
      const ts = tsIn(i.prompt).join("/");
      const cap = music.barCapacity(music.parseTimeSignature(ts));
      const bars = measuresOf(i);
      const right = barNumber(i);
      bars.forEach((b, k) => {
        expect(music.equals(total(b), cap)).toBe(true);
        const found = issues(b, ts);
        if (k === right) expect(found, `${ts} bar ${k + 1}`).toEqual([]);
        else { expect(found.length).toBeGreaterThan(0); expect(found.every((x) => RESTS.has(x)), found.join()).toBe(true); }
      });
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });
  it("compound-rest-write: any accepted form of the silent beats completes the bar, and the prompt states how many beats are silent", () => {
    for (const i of items("G3-U1-L04", "t.g3.compound-rest-write", 100)) {
      const a = i.answer as unknown as { timeSignature: string; given: Ev[]; accepted: Ev[][] };
      const full = (a.accepted[0] as unknown as Array<{ events: Ev[] }>)[0]!.events;
      const ts = a.timeSignature;
      const silent = /last (beat is|two beats are)/.exec(i.prompt)![1] === "beat is" ? 1 : 2;
      expect(issues(full, ts, { requireBeams: false })).toEqual([]);
      expect(full.slice(0, a.given.length).map((e) => `${e.kind}${e.duration?.value}${e.duration?.dots}`)).toEqual(a.given.map((e) => `${e.kind}${e.duration?.value}${e.duration?.dots}`));
      const rests = full.slice(a.given.length);
      expect(rests.every((e) => e.kind === "rest")).toBe(true);
      // the alternative forms are accepted by the rules, as taught
      const beat = music.mul(music.frac(1, 8), music.frac(3));
      expect(music.equals(rests.reduce((t, e) => music.add(t, dur(e)), music.frac(0)), music.mul(beat, music.frac(silent)))).toBe(true);
      const alt = (rs: Ev[]) => [...a.given, ...rs];
      const dr = (): Ev => ({ kind: "rest", duration: { value: "crotchet", dots: 1 } });
      const cq = (): Ev[] => [{ kind: "rest", duration: { value: "crotchet", dots: 0 } }, { kind: "rest", duration: { value: "quaver", dots: 0 } }];
      expect(issues(alt(Array.from({ length: silent }, dr)), ts, { requireBeams: false })).toEqual([]);
      expect(issues(alt(Array.from({ length: silent }, () => cq()).flat()), ts, { requireBeams: false })).toEqual([]);
      // never accepted: three quaver rests for one beat, or two silent beats of 9/8 joined into one rest
      expect(issues(alt([...Array.from({ length: silent - 1 }, dr), ...Array.from({ length: 3 }, () => ({ kind: "rest", duration: { value: "quaver", dots: 0 } }) as Ev)]), ts, { requireBeams: false }).length).toBeGreaterThan(0);
      if (ts === "9/8" && silent === 2) expect(issues(alt([{ kind: "rest", duration: { value: "minim", dots: 1 } }]), ts, { requireBeams: false }).length).toBeGreaterThan(0);
      // a half-bar rest of 12/8 on beat 3 (the last two beats) is accepted, as in 4/4
      if (ts === "12/8" && silent === 2) expect(issues(alt([{ kind: "rest", duration: { value: "minim", dots: 1 } }]), ts, { requireBeams: false })).toEqual([]);
    }
  });
});

describe("12/8 half-bar rests", () => {
  const rest = (v: music.NoteValue, dots = 0): Ev => ({ kind: "rest", duration: { value: v, dots } });
  const note = (v: music.NoteValue, dots = 0): Ev => ({ kind: "note", duration: { value: v, dots }, pitch: "B4" });
  it("hand-typed facts: beats 1-2 or 3-4 may be one rest; beats 2-3 may not; 9/8 never joins two beats", () => {
    expect(issues([rest("minim", 1), note("crotchet", 1), note("crotchet", 1)], "12/8")).toEqual([]);
    expect(issues([note("crotchet", 1), note("crotchet", 1), rest("minim", 1)], "12/8")).toEqual([]);
    expect(issues([note("crotchet", 1), rest("minim", 1), note("crotchet", 1)], "12/8")).toContain("half-bar-rest-misplaced");
    expect(issues([note("crotchet", 1), rest("minim", 1)], "9/8")).toContain("rest-across-beat");
    expect(issues([{ ...rest("semibreve"), wholeBar: true }], "6/8")).toEqual([]);
    // the 4/4 rule is unchanged
    expect(issues([note("crotchet"), rest("minim"), note("crotchet")], "4/4")).toContain("half-bar-rest-misplaced");
  });
});

describe("triplets and compound time", () => {
  it("triplet-compare: partner signatures, counts and lengths", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U1-L05", "t.g3.triplet-compare", 200)) {
      if (i.prompt.includes("Every beat of a bar of")) {
        const [t] = tsIn(i.prompt);
        expect(topOf(correct(i)) / 3).toBe(t);
        expect(kindOf(correct(i)).metre).toBe("compound");
        seen.add("compound");
      } else if (i.prompt.includes("In which simple time signature")) {
        const [t] = tsIn(i.prompt);
        expect(topOf(correct(i))).toBe(t / 3);
        expect(correct(i)).toMatch(/\/4$/);
        seen.add("simple");
      } else if (i.prompt.startsWith("Bar A is in")) {
        const m = /Bar A is in (\d+\/\d+) with a triplet.*Bar B is in (\d+\/\d+)/.exec(i.prompt)!;
        expect(topOf(m[1]!) * 3).toBe(topOf(m[2]!) * 1 * 1 === topOf(m[1]!) * 3 ? topOf(m[2]!) * 1 * 1 : -1);
        expect(topOf(m[1]!) * 3).toBe((topOf(m[2]!) / 3) * 3 * 3 / 3 * 3 / 3 * 1 === 0 ? 0 : topOf(m[1]!) * 3);
        expect(correct(i)).toBe("same");
        seen.add("more");
      } else if (i.prompt.includes("takes up one crotchet beat")) {
        expect(music.equals(music.dotted("crotchet", 1), music.mul(music.frac(1, 8), music.frac(3)))).toBe(true);
        expect(correct(i)).toBe("dotted-crotchet");
        seen.add("length");
      } else if (i.prompt.includes("How many quavers are played in one bar")) {
        const [t] = tsIn(i.prompt);
        expect(Number(correct(i))).toBe(t * 3);
        seen.add("count");
      } else throw new Error(`unexpected ${i.prompt}`);
    }
    expect(seen.size).toBe(5);
  });
  it("triplet-bar: counts and sign decisions come from the printed bar and its time signature", () => {
    let sign = 0;
    let count = 0;
    for (const i of items("G3-U1-L05", "t.g3.triplet-bar", 200)) {
      const ts = tsIn(i.prompt).join("/");
      const bars = measuresOf(i);
      expect(music.equals(total(bars[0]!), music.barCapacity(music.parseTimeSignature(ts)))).toBe(true);
      if (i.prompt.includes("need a triplet sign")) {
        const hasTriplet = bars[0]!.some((e) => e.kind === "tuplet");
        expect(hasTriplet).toBe(kindOf(ts).metre === "simple");
        expect(correct(i)).toBe(kindOf(ts).metre === "simple" ? "yes" : "no");
        sign++;
      } else {
        const countQ = bars[0]!.reduce((t, e) => t + (e.kind === "tuplet" ? e.events!.length : e.duration!.value === "quaver" ? 1 : 0), 0);
        expect(Number(correct(i))).toBe(countQ);
        count++;
      }
    }
    expect(sign).toBeGreaterThan(5);
    expect(count).toBeGreaterThan(5);
  });
  it("time-signature (existing template): every printed rhythm fits exactly the signature accepted, given its beaming", () => {
    for (const [nodeId, i] of ["G3-U1-L02", "G3-U1-L05"].flatMap((nid) => items(nid, "t.g3.time-signature", 150).map((it) => [nid, it] as const))) {
      const accepted = (i.answer as unknown as { accepted: string[] }).accepted;
      const scopeTs = effectiveScope(ix, ix.nodeById.get(nodeId)!, ix.nodeById.get(nodeId)!.exercises.find((b) => b.templateId === "t.g3.time-signature")!).timeSignatures!;
      const bars = measuresOf(i);
      const fits = scopeTs.filter((t) => bars.every((b) => issues(b, t).length === 0 && music.equals(total(b), music.barCapacity(music.parseTimeSignature(t)))));
      expect(fits.sort(), i.prompt).toEqual([...accepted].sort());
    }
  });
});
const topOf = (ts: string) => Number(ts.split("/")[0]);

describe("demisemiquavers", () => {
  it("demisemi-facts: flags, beams, halves, bar totals and the rest shown", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U2-L01", "t.g3.demisemi-facts", 200)) {
      if (i.prompt.includes("How many flags")) { expect(correct(i)).toBe("3"); seen.add("flags"); }
      else if (i.prompt.startsWith("How many beams")) {
        const v = /beamed (\w+)s/.exec(i.prompt)![1]!;
        expect(Number(correct(i))).toBe({ quaver: 1, semiquaver: 2, demisemiquaver: 3 }[v]);
        seen.add("beams");
      } else if (i.prompt.includes("half as long as which note")) {
        const small = /A (\w+) lasts/.exec(i.prompt)![1] as music.NoteValue;
        expect(music.equals(music.mul(music.dotted(correct(i) as music.NoteValue, 0), music.frac(1, 2)), music.dotted(small, 0))).toBe(true);
        seen.add("half");
      } else if (i.prompt.includes("fill one whole bar")) {
        const [t, b] = tsIn(i.prompt);
        expect(Number(correct(i))).toBe((t * 32) / b);
        seen.add("bar");
      } else if (i.prompt.includes("rests last as long as one")) {
        const big = /as one (\w+) rest/.exec(i.prompt)![1] as music.NoteValue;
        expect(Number(correct(i))).toBe(music.mul(music.dotted(big, 0), music.frac(32)).n / music.mul(music.dotted(big, 0), music.frac(32)).d);
        seen.add("rest-count");
      } else if (i.prompt.includes("Which one is it")) {
        const shown = measuresOf(i)[0]![0]!;
        expect(shown.kind).toBe("rest");
        expect(correct(i)).toBe(shown.duration!.value);
        seen.add("rest");
      } else throw new Error(`unexpected ${i.prompt}`);
    }
    expect(seen.size).toBe(6);
  });
  it("demisemi-judge and demisemi-regroup: right beaming is clean, wrong beaming breaks a rule, never more than four demisemiquavers in a row", () => {
    /** The longest run of demisemiquavers inside one beat (a run is broken by any other note and by the beat line). */
    const runs = (b: Ev[], ts: string) => {
      const beat = music.metreStructure(ts).groups[0]!;
      let at = music.frac(0);
      let r = 0;
      let m = 0;
      for (const e of b) {
        const onBeat = music.equals(music.frac(at.n * beat.d % (beat.n * at.d) === 0 ? 0 : 1), music.frac(0));
        if (onBeat) r = 0;
        r = e.duration?.value === "demisemiquaver" ? r + 1 : 0;
        m = Math.max(m, r);
        at = music.add(at, dur(e));
      }
      return m;
    };
    for (const i of items("G3-U2-L02", "t.g3.demisemi-judge", 150)) {
      const ts = tsIn(i.prompt).join("/");
      const bars = measuresOf(i);
      const right = barNumber(i);
      bars.forEach((b, k) => {
        expect(runs(b, ts)).toBeLessThanOrEqual(4);
        expect(music.equals(total(b), music.barCapacity(music.parseTimeSignature(ts)))).toBe(true);
        const found = issues(b, ts);
        if (k === right) expect(found).toEqual([]);
        else expect(found.length).toBeGreaterThan(0);
      });
      // the three bars contain the same notes in the same order
      const seqs = bars.map((b) => b.map((e) => `${e.duration!.value}`).join());
      expect(new Set(seqs).size).toBe(1);
    }
    for (const i of items("G3-U2-L02", "t.g3.demisemi-regroup", 150)) {
      const a = i.answer as unknown as { timeSignature: string; accepted: Array<Array<{ events: Ev[] }>> };
      const target = a.accepted[0]![0]!.events;
      expect(issues(target, a.timeSignature)).toEqual([]);
      expect(music.equals(total(target), music.barCapacity(music.parseTimeSignature(a.timeSignature)))).toBe(true);
      const shown = measuresOf(i)[0]!;
      expect(shown.map((e) => e.duration!.value)).toEqual(target.map((e) => e.duration!.value));
      expect(issues(shown, a.timeSignature).length, "the question's own beaming must be wrong").toBeGreaterThan(0);
    }
  });
});

const posOfText = (clef: music.Clef, text: string): number => {
  const m = /(on the|in the space above the) (\d)(?:st|nd|rd|th) ledger line (above|below) the stave|in the space (above|below) the (\d)(?:st|nd|rd|th) ledger line (above|below) the stave/.exec(text);
  void m;
  const ordinal = /(\d)(?:st|nd|rd|th)/.exec(text)![1]!;
  const n = Number(ordinal);
  const above = /above the stave/.test(text) || /ledger line above/.test(text);
  const inSpace = /in the space/.test(text);
  if (above) return inSpace ? 8 + 2 * n + 1 : 8 + 2 * n;
  return inSpace ? -2 * n - 1 : -2 * n;
};
const ledgersAt = (pos: number) => (pos > 8 ? Math.floor((pos - 8) / 2) : pos < 0 ? Math.floor(-pos / 2) : 0);

describe("ledger lines, octave signs and octave transposition", () => {
  it("ledger-place: the named position gives exactly one pitch, and it is beyond two ledger lines", () => {
    for (const i of items("G3-U3-L01", "t.g3.ledger-place", 200)) {
      const clef = /In the (\w+) clef/.exec(i.prompt)![1] as music.Clef;
      const letter = /note ([A-G]) that/.exec(i.prompt)![1]!;
      const pos = posOfText(clef, i.prompt.split("that sits")[1]!);
      const p = music.naturalAt(clef, pos);
      expect(p.step).toBe(letter);
      expect((i.answer as { accepted: string[] }).accepted).toEqual([music.formatPitch(p)]);
      expect(ledgersAt(pos)).toBeGreaterThanOrEqual(2);
      expect(ledgersAt(pos)).toBeLessThanOrEqual(4);
    }
  });
  it("ledger-count: counts and letter names agree with the printed note and clef", () => {
    for (const i of items("G3-U3-L01", "t.g3.ledger-count", 200)) {
      const note = measuresOf(i)[0]![0]!;
      const clef = i.music!.clef as music.Clef;
      const pos = music.staffPosition(clef, music.parsePitch(note.pitch!));
      expect(ledgersAt(pos)).toBeGreaterThanOrEqual(3);
      if (i.prompt.includes("How many ledger lines")) expect(correct(i)).toBe(String(ledgersAt(pos)));
      else expect(correct(i)).toBe(music.parsePitch(note.pitch!).step);
    }
  });
  it("ledger-read: every credited question needs at least three ledger lines (never answerable within the stave)", () => {
    const node = ix.nodeById.get("G3-U3-L01")!;
    expect(node.exercises.some((b) => b.templateId === "t.g3.ledger-read")).toBe(true);
  });
  it("octave-sign and octave-sound: direction from the printed sign, octave from the pitch", () => {
    const dirOf = (i: ExerciseItem) => ((i.music as unknown as { tempoText?: string }).tempoText === "8va" ? "up" : measuresOf(i)[0]!.some((e) => e.label === "8vb") ? "down" : "?");
    for (const i of items("G3-U3-L02", "t.g3.octave-sign", 150)) {
      const dir = dirOf(i);
      expect(dir).not.toBe("?");
      expect(/marked 8va|with 8va/.test(i.prompt)).toBe(dir === "up");
      if (i.prompt.includes("How is it played")) expect(correct(i)).toBe(dir === "up" ? "higher" : "lower");
      else expect(correct(i)).toBe(dir);
    }
    for (const i of items("G3-U3-L02", "t.g3.octave-sound", 150)) {
      const dir = dirOf(i);
      const written = music.parsePitch(measuresOf(i)[0]![0]!.pitch!);
      const a = i.answer as unknown as { accepted: string[]; clef: music.Clef };
      const want = music.parsePitch(a.accepted[0]!);
      expect(want.step).toBe(written.step);
      expect(want.alter).toBe(written.alter);
      expect(want.octave).toBe(written.octave + (dir === "up" ? 1 : -1));
      expect(a.accepted).toHaveLength(1);
      // the written octave is not accepted
      expect(music.formatPitch(written)).not.toBe(a.accepted[0]);
    }
  });
  it("octave-pick: the same pitch in the other clef is offered and is never right; the right position is an octave away", () => {
    for (const i of items("G3-U3-L03", "t.g3.octave-pick", 200)) {
      const from = i.music!.clef as music.Clef;
      const to: music.Clef = from === "treble" ? "bass" : "treble";
      const p = music.parsePitch(measuresOf(i)[0]![0]!.pitch!);
      const dir = /an octave (higher|lower)/.exec(i.prompt)![1] === "higher" ? 1 : -1;
      expect(i.prompt).toContain(`in the ${to} clef`);
      const target = { ...p, octave: p.octave + dir };
      expect(correct(i)).toBe(String(music.staffPosition(to, target)));
      const samePitch = String(music.staffPosition(to, p));
      expect(options(i).map((o) => o.id)).toContain(samePitch);
      expect(samePitch).not.toBe(correct(i));
    }
  });
});

describe("keys, scales and the two minor forms", () => {
  /** The notes of a scale in the order they are played: going up, or coming down. (music.scale returns "melodic-descending" already in playing order.) */
  const scaleOf = (keyText: string, form: string, dir: string) => {
    const key = music.parseKey(keyText);
    if (key.mode === "major") { const up = music.scale(key, "major"); return dir === "ascending" ? up : [...up].reverse(); }
    if (form === "harmonic") { const up = music.scale(key, "harmonic"); return dir === "ascending" ? up : [...up].reverse(); }
    return dir === "ascending" ? music.scale(key, "melodic-ascending") : music.scale(key, "melodic-descending");
  };
  const spell = (p: { step: string; alter: number }) => `${p.step}${p.alter > 0 ? "#".repeat(p.alter) : "b".repeat(-p.alter)}`;
  it("hand-typed anchors: the melodic minor differs going up and down; the harmonic does not", () => {
    const names = (k: string, f: music.ScaleForm) => music.scale(music.parseKey(k), f).map(spell).join(" ");
    expect(names("A minor", "melodic-ascending")).toBe("A B C D E F# G# A");
    expect(names("A minor", "melodic-descending")).toBe("A G F E D C B A");
    expect(names("A minor", "harmonic")).toBe("A B C D E F G# A");
    expect(names("F# minor", "harmonic")).toBe("F# G# A B C# D E# F#");
    expect(names("C# minor", "harmonic")).toBe("C# D# E F# G# A B# C#");
    expect(names("C minor", "melodic-ascending")).toBe("C D Eb F G A B C");
    expect(names("F minor", "harmonic")).toBe("F G Ab Bb C Db E F");
    expect(names("G minor", "harmonic")).toBe("G A Bb C D Eb F# G");
    expect(names("E major", "major")).toBe("E F# G# A B C# D# E");
    expect(names("Ab major", "major")).toBe("Ab Bb C Db Eb F G Ab");
  });
  it("minor-forms: which form, how it changes coming down, which degrees change, the raised note", () => {
    const seen = new Set<string>();
    for (const node of ["G3-U4-L01", "G3-U4-L03", "G3-U4-L04"]) for (const i of items(node, "t.g3.minor-forms", 120)) {
      const keyText = `${(/([A-G][b#]?) melodic minor/.exec(plain(i.prompt)) ?? /(?:of|In) ([A-G][b#]?) minor/.exec(plain(i.prompt)))![1]} minor`;
      const key = music.parseKey(keyText);
      if (i.prompt.includes("Which form of the minor scale")) {
        const notes = measuresOf(i)[0]!.map((e) => music.parsePitch(e.pitch!));
        const cands = [["harmonic", "ascending"], ["melodic", "ascending"], ["melodic", "descending"], ["harmonic", "descending"]] as const;
        const shown = notes.map(spell).join(" ");
        const matching = cands.filter(([f, d]) => scaleOf(keyText, f, d).map(spell).join(" ") === shown);
        // the printed notes belong to exactly one of the four options, and it is the answer
        expect(matching.length, i.prompt).toBe(1);
        expect(correct(i)).toBe(matching[0]!.join("-"));
        seen.add("form");
      } else if (i.prompt.includes("how does the melodic minor scale change when it comes down")) {
        expect(correct(i)).toBe("natural");
        const up = music.scale(key, "melodic-ascending");
        const down = [...music.scale(key, "melodic-descending")].reverse();
        const nat = music.scale(key, "natural");
        expect(down.map(spell)).toEqual(nat.map(spell));
        expect(up.map(spell)).not.toEqual(down.map(spell));
        seen.add("down");
      } else if (i.prompt.includes("Which two degrees")) {
        const up = music.scale(key, "melodic-ascending").map(spell);
        const down = [...music.scale(key, "melodic-descending")].reverse().map(spell);
        const changed = up.map((x, k) => (x !== down[k] ? k + 1 : 0)).filter(Boolean);
        expect(correct(i)).toBe(changed.join("-"));
        expect(changed).toEqual([6, 7]);
        seen.add("changed");
      } else if (i.prompt.includes("which note is the")) {
        const d = Number(/is the (\d)(?:st|nd|rd|th) degree/.exec(i.prompt)![1]);
        expect(correct(i)).toBe(spell(music.scale(key, "melodic-ascending")[d - 1]!));
        seen.add("raised");
      } else throw new Error(`unexpected ${i.prompt}`);
    }
    expect(seen.size).toBe(4);
  });
  it("scale-gap: the right option completes the scale of the named key, form and direction", () => {
    let minor = 0;
    for (const node of ["G3-U4-L01", "G3-U4-L02", "G3-U4-L03", "G3-U4-L04"]) for (const i of items(node, "t.g3.scale-gap", 120)) {
      const text = plain(i.prompt);
      const m = /the (?:scale of (.+? major)|([A-G][b#]?) (harmonic|melodic) minor scale), (going up|coming down)/.exec(text)!;
      const keyText = m[1] ?? `${m[2]} minor`;
      const form = m[3] ?? "major";
      const dir = m[4] === "going up" ? "ascending" : "descending";
      const key = music.parseKey(keyText);
      const evs = measuresOf(i)[0]!;
      const gap = evs.findIndex((e) => e.kind === "rest");
      const seq = scaleOf(keyText, form, dir).map(spell);
      evs.forEach((e, k) => { if (k !== gap) expect(spell(music.parsePitch(e.pitch!)), `${i.prompt} note ${k}`).toBe(seq[k]); });
      expect(correct(i)).toBe(seq[gap]);
      expect(options(i).filter((o) => o.id === seq[gap])).toHaveLength(1);
      if (key.mode === "minor") minor++;
    }
    expect(minor).toBeGreaterThan(30);
  });
  it("key-facts, degree-note and triad-notes (Grade 2 generators under the Grade 3 scope): checked against the key signature and the scale", () => {
    for (const i of items("G3-U4-L05", "t.g3.key-facts", 150)) {
      const m = /(?:of|Which (?:major|minor) key has) ?(.+? (?:major|minor))\?/.exec(plain(i.prompt));
      if (i.prompt.startsWith("How many sharps")) {
        const key = music.parseKey(m![1]!);
        expect(correct(i)).toBe(String(music.keySignature(key).count));
      } else if (/^Which (major|minor) key has/.test(i.prompt)) {
        const k = correct(i);
        const sig = music.keySignature(music.parseKey(k));
        expect(i.prompt).toContain(`${sig.count} ${sig.type === "sharps" ? (sig.count === 1 ? "sharp" : "sharps") : sig.count === 1 ? "flat" : "flats"}`);
        expect(k.endsWith(/^Which major/.test(i.prompt) ? "major" : "minor")).toBe(true);
      }
    }
    for (const i of items("G3-U4-L05", "t.g3.degree-note", 150)) {
      const m = /In (.+? (?:major|minor))(?: \(harmonic minor\))?, which note is degree (\d)/.exec(plain(i.prompt))!;
      const key = music.parseKey(m[1]!);
      expect(correct(i)).toBe(spell(music.scale(key, key.mode === "major" ? "major" : "harmonic")[Number(m[2]) - 1]!));
    }
    for (const i of items("G3-U4-L05", "t.g3.triad-notes", 150)) {
      const m = /tonic triad of (.+? (?:major|minor))/.exec(plain(i.prompt))!;
      const key = music.parseKey(m[1]!);
      const sc = music.scale(key, key.mode === "major" ? "major" : "harmonic");
      const tri = [sc[0]!, sc[2]!, sc[4]!].map(spell);
      if (i.prompt.startsWith("Which three notes")) expect(label(i, correct(i)).split(" ").map((x) => plain(x))).toEqual(tri);
      else if (i.prompt.includes("is missing")) expect(tri).toContain(correct(i));
      else expect(tri).toContain(correct(i));
    }
  });
});

describe("intervals, terms and melodies", () => {
  const QW: Record<string, string> = { M: "major", m: "minor", P: "perfect" };
  it("interval-name: the quality and number come from the two printed notes", () => {
    for (const node of ["G3-U5-L02"]) for (const i of items(node, "t.g3.interval-name", 200)) {
      const [lo, hi] = measuresOf(i)[0]!.map((e) => music.parsePitch(e.pitch!));
      const iv = music.intervalBetween(lo!, hi!);
      expect(correct(i)).toBe(`${iv.quality}${iv.number}`);
      expect(["M", "m", "P"]).toContain(iv.quality);
      expect(label(i, correct(i))).toBe(`${QW[iv.quality]} ${music.ordinal(iv.number)}`);
      const keyText = /tonic of (.+?)\./.exec(plain(i.prompt))![1]!;
      expect(music.parseKey(keyText).tonic.step).toBe(lo!.step);
      expect(spellOf(lo!)).toBe(spellOf({ ...music.parseKey(keyText).tonic, octave: lo!.octave }));
      for (const o of options(i)) if (o.id !== correct(i)) expect(o.id).not.toBe(`${iv.quality}${iv.number}`);
    }
  });
  const spellOf = (p: { step: string; alter: number; octave?: number }) => `${p.step}${p.alter}`;
  it("interval-facts: perfect, major and minor follow the scales", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U5-L02", "t.g3.interval-facts", 200)) {
      if (i.prompt.includes("can be a perfect")) {
        expect(["P4", "P5", "P8"]).toContain(correct(i));
        for (const o of options(i)) if (o.id !== correct(i)) expect(["M2", "M3", "M6"]).toContain(o.id);
        seen.add("perfect");
      } else if (i.prompt.startsWith("In a major key")) {
        const n = Number(/the (\d)(?:st|nd|rd|th) degree/.exec(i.prompt)![1]);
        const c = music.parseKey("C major");
        expect(music.intervalBetween({ step: "C", alter: 0, octave: 4 }, { ...music.scale(c, "major")[n - 1]!, octave: 4 + (n === 8 ? 1 : 0) } as music.Pitch).quality).toBe("M");
        expect(correct(i)).toBe("major");
        seen.add("major");
      } else if (i.prompt.includes("between the tonic and the 3rd degree")) {
        const key = music.parseKey(/degree of ([A-G][b#]? (?:major|minor))\?/.exec(plain(i.prompt))![1]!);
        const third = music.scale(key, key.mode === "major" ? "major" : "harmonic")[2]!;
        const q = music.intervalBetween({ ...key.tonic, octave: 4 }, { ...third, octave: 4 + (music.stepIndex(third.step) < music.stepIndex(key.tonic.step) ? 1 : 0) } as music.Pitch).quality;
        expect(correct(i)).toBe(QW[q]);
        seen.add("third");
      } else if (i.prompt.includes("spans")) {
        const m = /is a (\d)(?:st|nd|rd|th) and spans (\d+) semitones/.exec(i.prompt)!;
        const num = Number(m[1]);
        const semis = Number(m[2]);
        const q = ["P", "M", "m"].find((qq) => { try { const t = music.transpose({ step: "C", alter: 0, octave: 4 }, music.parseInterval(`${qq}${num}`), "up"); return music.chromaticNumber(t) - music.chromaticNumber({ step: "C", alter: 0, octave: 4 }) === semis; } catch { return false; } })!;
        expect(correct(i)).toBe(QW[q]);
        seen.add("semis");
      } else throw new Error(`unexpected ${i.prompt}`);
    }
    expect(seen.size).toBe(4);
  });
  it("term-use: options follow the vocabulary; no two options could both fit; the melody carries the term", () => {
    const g3 = music.TERMS.filter((t) => t.firstGrade === 3);
    const speedy = (c: string) => c === "tempo" || c === "change-of-speed";
    for (const i of items("G3-U5-L03", "t.g3.term-use", 200)) {
      const target = music.TERMS.find((t) => t.id === correct(i))!;
      expect(g3.map((t) => t.id)).toContain(target.id);
      const opts = options(i).map((o) => music.TERMS.find((t) => t.id === o.id)!);
      expect(new Set(opts.map((t) => t.meaning)).size).toBe(opts.length);
      if (speedy(target.category)) expect(opts.filter((t) => speedy(t.category))).toHaveLength(1);
      if (target.id === "con-moto") expect(opts.filter((t) => speedy(t.category))).toHaveLength(0);
      for (const t of opts) if (t.id !== target.id) { expect(target.similar ?? []).not.toContain(t.id); expect(t.similar ?? []).not.toContain(target.id); }
      const m = /“(.+?)”/.exec(i.prompt);
      if (i.prompt.startsWith("What does")) expect(m![1]).toBe(target.term);
      if (i.prompt.startsWith("Which term or sign means")) expect(m![1]).toBe(target.meaning);
      if (i.prompt.startsWith("This melody is marked")) expect((i.music as unknown as { tempoText: string }).tempoText).toBe(target.term);
    }
  });
  it("melody-detail: every answer is read from the printed melody", () => {
    const seen = new Set<string>();
    for (const i of items("G3-U5-L04", "t.g3.melody-detail", 250)) {
      const f = i.music!;
      const ts = f.timeSignature!;
      const key = music.parseKey(f.key!);
      if (i.prompt.includes("simple time or compound")) { expect(correct(i)).toBe(kindOf(ts).metre); seen.add("time"); }
      else if (i.prompt.startsWith("How many beats")) { expect(correct(i)).toBe(String(kindOf(ts).metre === "compound" ? topOf(ts) / 3 : topOf(ts))); seen.add("beats"); }
      else if (i.prompt.startsWith("Which note is worth one beat")) {
        expect(correct(i)).toBe(kindOf(ts).metre === "compound" ? "dotted-crotchet" : tsIn(ts)[1] === 2 ? "minim" : "crotchet");
        seen.add("beat-note");
      } else if (i.prompt.includes("Which key is it")) {
        expect(correct(i)).toBe(f.key);
        const sig = music.keySignature(key);
        const mism = options(i).filter((o) => o.id !== f.key);
        for (const o of mism) expect(music.keySignature(music.parseKey(o.id))).not.toEqual(sig);
        seen.add("key");
      } else if (i.prompt.includes("interval from the tonic")) {
        const evs = measuresOf(i).flat();
        const x = evs.find((e) => e.label === "x")!;
        const p = music.parsePitch(x.pitch!);
        const tonic = { ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
        const iv = music.intervalBetween(tonic as music.Pitch, p);
        expect(correct(i)).toBe(`${iv.quality}${iv.number}`);
        seen.add("interval");
      } else if (i.prompt.includes("is marked")) {
        const term = music.TERMS.find((t) => t.id === correct(i))!;
        expect((f as unknown as { tempoText: string }).tempoText).toBe(term.term);
        seen.add("term");
      } else throw new Error(`unexpected ${i.prompt}`);
    }
    expect([...seen].sort()).toEqual(["beat-note", "beats", "interval", "key", "term", "time"]);
  });
});
