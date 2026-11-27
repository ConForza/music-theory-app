/**
 * The start and bar-lines of a multi-stave system. Piano music (a grand staff) is braced and its bar-lines run through both staves; separate
 * parts and melodies set side by side to compare are bracketed, with each stave keeping its own bar-lines. The brace or bracket sits left of
 * the system's opening line, never on the staves.
 */
import { describe, expect, it } from "vitest";
import type { NotationScore } from "@mtp/curriculum";
import { isGrandStaff, layoutScore, systemStart } from "../components/notation/layout.ts";
import { ENGRAVING } from "../components/notation/glyphs.ts";
import { braceWidthPerSpace } from "./notation-ink.ts";

const N = (pitch: string, value = "minim") => ({ kind: "note", pitch, duration: { value, dots: 0 } });
const music = (clef: string, a: string, b: string) => ({ clef, timeSignature: "2/4", textAlternative: "x", measures: [{ events: [N(a)] }, { events: [N(b)] }] });
const score = (staves: Array<{ label: string; clef: string; instrument?: string }>) =>
  ({
    textAlternative: "x",
    staves: staves.map((s, i) => ({ id: `s${i}`, label: s.label, ...(s.instrument ? { instrument: s.instrument } : {}), music: music(s.clef, s.clef === "bass" ? "C3" : "C5", s.clef === "bass" ? "G2" : "G4") })),
  }) as unknown as NotationScore;

// The kinds of score the course shows (grade 4 and 5 harmony, short score, the instruments-and-score lessons, clef and transposition checks).
const piano = [
  score([{ label: "Treble", clef: "treble" }, { label: "Bass", clef: "bass" }]),
  score([{ label: "Upper stave", clef: "treble" }, { label: "Lower stave", clef: "bass" }]),
  score([{ label: "Right hand", clef: "treble" }, { label: "Left hand", clef: "bass" }]),
];
const separate = [
  score([{ label: "Flute", clef: "treble", instrument: "flute" }, { label: "Piano (left hand)", clef: "bass" }]),
  score([{ label: "Original (tenor clef)", clef: "tenor" }, { label: "Copy (treble clef)", clef: "treble" }]),
  score([{ label: "Concert pitch (given)", clef: "treble" }, { label: "Pupil's version", clef: "treble" }]),
  score([{ label: "Stave A", clef: "treble" }, { label: "Stave B", clef: "alto" }, { label: "Stave C", clef: "bass" }]),
];

describe("grand staff or separate staves", () => {
  it("treats treble-over-bass pairs with no named instrument as piano music", () => {
    for (const s of piano) expect(isGrandStaff(s), s.staves.map((x) => x.label).join("/")).toBe(true);
  });
  it("treats instrument parts and side-by-side comparisons as separate staves", () => {
    for (const s of separate) expect(isGrandStaff(s), s.staves.map((x) => x.label).join("/")).toBe(false);
  });
});

describe("bar-lines across the system", () => {
  it("piano music: every bar-line runs from the upper stave's bottom line to the lower stave's top line", () => {
    const sl = layoutScore(piano[0]!);
    const [upper, lower] = sl.staves;
    const own = upper!.layout.fixed.lines.filter((l) => l.x1 === l.x2);
    expect(own.length).toBe(3); // the middle bar-line and the two lines of the final one
    expect(sl.connectors.map((c) => [c.x1, c.w])).toEqual(own.map((l) => [l.x1, l.w]));
    for (const c of sl.connectors) {
      expect(c.y1).toBeCloseTo(upper!.offset, 9);
      expect(c.y2).toBeCloseTo(lower!.offset - 4, 9);
    }
  });
  it("separate staves keep their own bar-lines, with nothing across the gap", () => {
    for (const s of separate) expect(layoutScore(s).connectors).toEqual([]);
  });
});

describe("the start of the system", () => {
  for (const s of [...piano, ...separate]) {
    const name = s.staves.map((x) => x.label).join(" / ");
    it(`${name}: the ${isGrandStaff(s) ? "brace" : "bracket"} stays left of the opening line and the stave lines`, () => {
      const sl = layoutScore(s);
      const start = systemStart(sl);
      expect(Boolean(start.brace)).toBe(isGrandStaff(s));
      expect(Boolean(start.bracket)).toBe(!isGrandStaff(s));
      // the stave lines start at the opening line
      expect(start.line.x1).toBe(0.2);
      expect(start.groupRight).toBeLessThan(start.line.x1 - start.line.w / 2 - 0.3);
      // the brace's ink (its width from the font's metadata) ends a clear gap before the opening line's ink
      if (start.brace) expect(start.line.x1 - start.line.w / 2 - (start.brace.x + braceWidthPerSpace * start.brace.size)).toBeGreaterThanOrEqual(0.3);
      if (start.bracket) {
        // the bracket's vertical stroke ends at groupRight; its hooks reach right only above the top stave and below the bottom one
        const nums = [...start.bracket.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
        const yTop = sl.staves[0]!.offset - 4;
        const yBottom = sl.staves[sl.staves.length - 1]!.offset;
        for (const [x, y] of nums) if (x > start.groupRight) expect(y < yTop - 0.5 || y > yBottom + 0.5).toBe(true);
        expect(Math.max(...nums.filter(([, y]) => y >= yTop - 0.2 && y <= yBottom + 0.2).map(([x]) => x)) + start.bracket.w / 2).toBeCloseTo(start.groupRight, 9);
      }
      // everything is inside the drawing
      expect(start.left).toBeLessThan(start.brace ? start.brace.x : start.groupRight - start.bracket!.w);
    });
  }
});

describe("staves whose bar-lines differ (a double above a single, an end repeat above a single)", () => {
  const bars = (clef: string, pitch: string, lines: Array<string | undefined>) => ({
    clef, timeSignature: "2/4", textAlternative: "x",
    measures: lines.map((barline, i) => ({ events: [N(pitch, "crotchet"), N(pitch, i === 1 ? "quaver" : "crotchet"), ...(i === 1 ? [N(pitch, "quaver")] : [])], ...(barline ? { barline } : {}) })),
  });
  const mixed = {
    textAlternative: "x",
    staves: [
      { id: "u", label: "Upper", music: bars("treble", "B4", ["double", "repeat-end", undefined]) },
      { id: "l", label: "Lower", music: bars("bass", "D3", ["single", "single", undefined]) },
    ],
  } as unknown as NotationScore;
  const sl = layoutScore(mixed);
  const [upper, lower] = sl.staves.map((s) => s.layout);

  it("keep every bar's simultaneous notes, and every bar's start, in line", () => {
    expect(lower!.barX).toEqual(upper!.barX);
    for (const ev of upper!.events) {
      const other = lower!.events.find((e) => e.bar === ev.bar && e.index === ev.index)!;
      expect(other.x, `bar ${ev.bar + 1}, note ${ev.index + 1}`).toBeCloseTo(ev.x, 9);
    }
  });
  it("put each bar-line's main stroke in the same place on both staves", () => {
    const main = (l: typeof upper, bar: number) => Math.max(...l!.fixed.lines.filter((ln) => ln.x1 === ln.x2 && ln.x1 > l!.barX[bar]! && ln.x1 < (l!.barX[bar + 1] ?? Infinity)).map((ln) => ln.x1));
    for (const bar of [0, 1, 2]) expect(main(lower, bar)).toBeCloseTo(main(upper, bar), 9);
  });
  it("join only the strokes both staves draw", () => {
    // after bar 1 the double's right line meets the single; after bar 2 the end repeat's thick line does not match the thin single, so it
    // is not joined; the final bar-lines match stroke for stroke
    const joined = sl.connectors.map((c) => c.w);
    expect(joined).toEqual([ENGRAVING.thinBarline, ENGRAVING.thinBarline, ENGRAVING.thickBarline]);
    for (const c of sl.connectors) {
      expect(upper!.fixed.lines.some((ln) => ln.x1 === c.x1 && ln.w === c.w)).toBe(true);
      expect(lower!.fixed.lines.some((ln) => Math.abs(ln.x1 - c.x1) < 1e-9 && ln.w === c.w)).toBe(true);
    }
  });
});
