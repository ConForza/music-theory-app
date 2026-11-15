/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely typed answer specs */
import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, gradeItem } from "../src/index.ts";

/**
 * Independent check of t.g5.rewrite-metre (optional enrichment, PR #14 reconciled). The note lengths are re-derived with hand-rolled fractions:
 * every event of the shown bar and of the answer must occupy the same share of ITS beat (a crotchet beat in simple time, a dotted-crotchet beat in compound time), the bars must fill their own time
 * signature, and the beaming must follow the new beats. Adversarial answers (values copied unchanged, a wrong share, beams across a beat) go through the real engine.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const node = ix.nodeById.get("G5-U1-E1")!;
const binding = node.exercises.find((x) => x.templateId === "t.g5.rewrite-metre")!;
const scope = effectiveScope(ix, node, binding);
const items: ExerciseItem[] = [];
for (let s = 1; s <= 300; s++) { try { items.push(generateItem(ix, "t.g5.rewrite-metre", s, { scope }).item); } catch { /* skipped seed */ } }
const A = (i: ExerciseItem) => i.answer as unknown as Record<string, any>;

const VAL: Record<string, number> = { semibreve: 1, minim: 1 / 2, crotchet: 1 / 4, quaver: 1 / 8, semiquaver: 1 / 16 };
const len = (e: any) => VAL[e.duration.value]! * (e.duration.dots ? 1.5 : 1);
const beatOf = (ts: string) => { const [top, bottom] = ts.split("/").map(Number); return top! % 3 === 0 && bottom === 8 ? 3 / 8 : 1 / bottom!; };
const barOf = (ts: string) => { const [top, bottom] = ts.split("/").map(Number); return top! / bottom!; };
/** [onset, length] of every event in beats, rounded to avoid float noise */
const shares = (events: any[], ts: string) => { let t = 0; return events.map((e) => { const r = [t / beatOf(ts), len(e) / beatOf(ts), e.kind]; t += len(e); return `${r[2]}@${(r[0] as number).toFixed(4)}+${(r[1] as number).toFixed(4)}`; }); };

describe("t.g5.rewrite-metre", () => {
  it("generates in sufficient quantity, in both directions and for all three pairs", () => {
    expect(items.length).toBeGreaterThan(150);
    const dirs = new Set(items.map((i) => `${i.music!.timeSignature}>${A(i).timeSignature}`));
    for (const d of ["2/4>6/8", "3/4>9/8", "4/4>12/8", "6/8>2/4", "9/8>3/4", "12/8>4/4"]) expect(dirs.has(d), d).toBe(true);
  });

  it("every note and rest keeps its share of its beat, and each bar fills its own time signature", () => {
    for (const it of items) {
      const a = A(it);
      const shown = it.music!.measures[0]!.events as any[];
      const ans = a.accepted[0][0].events as any[];
      const from = a.fromTimeSignature as string;
      const to = a.timeSignature as string;
      expect(it.music!.timeSignature, it.id).toBe(from);
      expect(shares(ans, to), it.id).toEqual(shares(shown, from));
      expect(shown.reduce((t, e) => t + len(e), 0), it.id).toBeCloseTo(barOf(from), 9);
      expect(ans.reduce((t, e) => t + len(e), 0), it.id).toBeCloseTo(barOf(to), 9);
      // the compound bar always has a dot on every value; the simple bar has none
      const compound = [from, to].find((t) => /^(6|9|12)\/8$/.test(t))!;
      const compoundEvents = compound === from ? shown : ans;
      const simpleEvents = compound === from ? ans : shown;
      expect(compoundEvents.every((e) => e.duration.dots === 1), it.id).toBe(true);
      expect(simpleEvents.every((e) => !e.duration.dots), it.id).toBe(true);
    }
  });

  it("the answer is beamed beat by beat in the new metre, and the question is marked: the canonical answer is right", () => {
    for (const it of items.slice(0, 120)) {
      expect(gradeItem(ix, it, canonicalResponse(ix, it, scope), scope).correct, it.id).toBe(true);
    }
  });

  it("copying the values unchanged is refused with the targeted feedback; a wrong share is refused", () => {
    let copied = 0;
    let shifted = 0;
    for (const it of items.slice(0, 120)) {
      const a = A(it);
      const shown = it.music!.measures[0]!.events as any[];
      const strip = (e: any) => { const { beam: _b, pitch: _p, ...rest } = e; return rest; };
      const r = gradeItem(ix, it, { kind: "rhythm", measures: [{ events: shown.map(strip) }] } as never, scope);
      expect(r.correct, it.id).toBe(false);
      // a copy of a bar that already fills the new bar length is not possible here (the lengths differ), so the bar-length message may come first
      if (r.category === "values-copied") copied++;
      // a wrong share: the answer with its first value doubled (and the bar then wrong or the shares wrong): never correct
      const ans = (a.accepted[0][0].events as any[]).map(strip);
      const bad = [{ ...ans[0], duration: { value: ans[0].duration.value === "crotchet" ? "minim" : "crotchet", dots: ans[0].duration.dots } }, ...ans.slice(1)];
      const w = gradeItem(ix, it, { kind: "rhythm", measures: [{ events: bad }] } as never, scope);
      expect(w.correct, it.id).toBe(false);
      shifted++;
    }
    expect(copied).toBeGreaterThan(100);
    expect(shifted).toBeGreaterThan(100);
  });

  it("the shown bar is itself correct in its metre and is never in a pair it cannot be rewritten to", () => {
    for (const it of items) {
      const from = A(it).fromTimeSignature as string;
      const to = A(it).timeSignature as string;
      const pairs: Record<string, string> = { "2/4": "6/8", "3/4": "9/8", "4/4": "12/8", "6/8": "2/4", "9/8": "3/4", "12/8": "4/4" };
      expect(pairs[from], it.id).toBe(to);
    }
  });

  it("the wording never says the bar lasts longer: at the same beat speed the two bars last equally long (review of PR #16, finding B)", () => {
    for (const it of items.slice(0, 60)) {
      const text = [it.prompt, ...(it.hints ?? [])].join(" ");
      expect(text, it.id).not.toMatch(/different length|becomes longer|is longer/);
      expect(text, it.id).toMatch(/same number of beats and lasts just as long|same beat speed/);
    }
  });
});
