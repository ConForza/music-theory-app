/**
 * The end of a bar never crowds its bar-line: the last note's head, flag, dots or rest stays a clear gap before the bar-line's first mark
 * (the thin line of a final or double bar-line, the dots of an end repeat), and the staves of a score still share every bar-line. A closing
 * bar-line also ends the stave: its lines stop there instead of running on past it.
 */
import { describe, expect, it } from "vitest";
import type { NotationFragment } from "@mtp/curriculum";
import { BARLINE_CLEARANCE, layoutFragment, layoutScore, type StaveLayout } from "../components/notation/layout.ts";
import { ENGRAVING, G, INK_WIDTH, WIDTH } from "../components/notation/glyphs.ts";
import { rhythmFragment } from "../components/exercise/RhythmEditors.tsx";

// Ink width of every glyph that can end a bar, looked up by character (the test measures what is drawn, not how layout reasons about it).
const INK = new Map<string, number>([
  [G.noteheadBlack, WIDTH.noteheadBlack], [G.noteheadHalf, WIDTH.noteheadBlack], [G.noteheadWhole, WIDTH.noteheadWhole], [G.dot, WIDTH.dot],
  [G.flag8thUp, INK_WIDTH.flagUp.quaver!], [G.flag16thUp, INK_WIDTH.flagUp.semiquaver!], [G.flag32ndUp, INK_WIDTH.flagUp.demisemiquaver!],
  [G.flag8thDown, INK_WIDTH.flagDown.quaver!], [G.flag16thDown, INK_WIDTH.flagDown.semiquaver!], [G.flag32ndDown, INK_WIDTH.flagDown.demisemiquaver!],
  [G.restWhole, INK_WIDTH.rest.semibreve], [G.restHalf, INK_WIDTH.rest.minim], [G.restQuarter, INK_WIDTH.rest.crotchet],
  [G.rest8th, INK_WIDTH.rest.quaver], [G.rest16th, INK_WIDTH.rest.semiquaver], [G.rest32nd, INK_WIDTH.rest.demisemiquaver],
]);

/** Rightmost ink of a bar's events, and the left edge of the first bar-line mark after that bar. */
function gapBeforeBarline(l: StaveLayout, bar: number): number {
  const evs = l.events.filter((e) => e.bar === bar);
  const right = Math.max(...evs.flatMap((e) => [...e.glyphs.map((g) => g.x + (INK.get(g.ch) ?? 0)), ...e.lines.map((ln) => Math.max(ln.x1, ln.x2) + ln.w / 2)]));
  const start = l.barX[bar]!;
  const end = l.barX[bar + 1] ?? Infinity;
  const marks = [
    ...l.fixed.lines.filter((ln) => ln.x1 === ln.x2 && ln.x1 > start && ln.x1 < end).map((ln) => ln.x1 - ln.w / 2),
    // the dots of an end repeat: "M<x>,<y> m-0.25,0 …" (radius 0.25)
    ...l.fixed.paths.flatMap((p) => [...p.d.matchAll(/M(-?[\d.]+),[^m]*m-0\.25/g)].map((m) => Number(m[1]) - 0.25)).filter((x) => x > start && x < end),
  ];
  return Math.min(...marks) - right;
}

const n = (value: string, beam?: string, dots = 0) => ({ kind: "note", duration: { value, dots }, ...(beam ? { beam } : {}) });
const r = (value: string, dots = 0) => ({ kind: "rest", duration: { value, dots } });

describe("space before the bar-line", () => {
  // 7/8 bars like the Grade 5 "rewrite this bar" question, ending in every way a bar can end.
  const endings: Record<string, unknown[]> = {
    "beamed quavers": [n("quaver", "begin"), n("quaver", "continue"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "end")],
    "unbeamed quavers (flags)": Array.from({ length: 7 }, () => n("quaver")),
    "beamed semiquavers": [n("quaver", "begin"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "continue"), n("semiquaver", "continue"), n("semiquaver", "end")],
    "flagged semiquavers": [n("quaver", "begin"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "end"), n("quaver", "begin"), n("quaver", "end"), n("semiquaver"), n("semiquaver")],
    "a demisemiquaver rest": [n("crotchet", undefined, 1), r("quaver"), r("crotchet"), r("semiquaver"), n("demisemiquaver"), r("demisemiquaver")],
    "a dotted rest": [n("minim", undefined, 1), r("quaver", 1)],
    "a flagged demisemiquaver": [n("minim", undefined, 1), r("semiquaver"), r("demisemiquaver"), n("demisemiquaver")],
  };
  for (const [name, bar] of Object.entries(endings)) {
    it(`a final bar-line clears ${name}`, () => {
      const l = layoutFragment(rhythmFragment([bar as never], "7/8"));
      expect(gapBeforeBarline(l, 0)).toBeGreaterThanOrEqual(BARLINE_CLEARANCE - 1e-9);
    });
  }

  for (const barline of ["single", "double", "final", "repeat-end"] as const) {
    it(`a ${barline} bar-line on a pitched stave clears flags and stems in both directions`, () => {
      const f = {
        presentation: "stave", clef: "treble", timeSignature: "2/4", textAlternative: "x",
        measures: [
          { events: [{ kind: "note", pitch: "C5", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "E4", duration: { value: "quaver", dots: 0 } }, { kind: "note", pitch: "A5", duration: { value: "semiquaver", dots: 0 } }, { kind: "note", pitch: "F4", duration: { value: "semiquaver", dots: 0 } }], barline },
          { events: [{ kind: "note", pitch: "G4", duration: { value: "minim", dots: 0 } }] },
        ],
      } as unknown as NotationFragment;
      const l = layoutFragment(f);
      expect(gapBeforeBarline(l, 0)).toBeGreaterThanOrEqual(BARLINE_CLEARANCE - 1e-9);
      expect(gapBeforeBarline(l, 1)).toBeGreaterThanOrEqual(BARLINE_CLEARANCE - 1e-9);
    });
  }

  it("leaves bars whose music already clears the bar-line exactly as wide as before", () => {
    const l = layoutFragment({ presentation: "stave", clef: "treble", timeSignature: "2/4", textAlternative: "x", measures: [{ events: [{ kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } }] }] } as unknown as NotationFragment);
    // two crotchet slots (3.4 each) and the 0.4 lead-out
    expect(l.barWidths[0]! + 0.08).toBeCloseTo(7.2, 6); // the single bar-line line stays centred on the slots' end
  });

  it("the staves of a score keep their bar-lines aligned when only one stave ends a bar with a flag", () => {
    const bar = (events: unknown[]) => ({ events });
    const score = {
      textAlternative: "x",
      staves: [
        { id: "a", label: "Upper", music: { presentation: "stave", clef: "treble", timeSignature: "2/4", textAlternative: "x", measures: [bar([{ kind: "note", pitch: "C5", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "E4", duration: { value: "crotchet", dots: 0 } }]), bar([{ kind: "note", pitch: "G4", duration: { value: "minim", dots: 0 } }])] } },
        { id: "b", label: "Lower", music: { presentation: "stave", clef: "bass", timeSignature: "2/4", textAlternative: "x", measures: [bar([{ kind: "note", pitch: "C3", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "D3", duration: { value: "quaver", dots: 0 } }, { kind: "note", pitch: "B2", duration: { value: "quaver", dots: 0 } }]), bar([{ kind: "note", pitch: "G2", duration: { value: "minim", dots: 0 } }])] } },
      ],
    };
    const sl = layoutScore(score as never);
    const barlines = sl.staves.map((s) => s.layout.fixed.lines.filter((ln) => ln.x1 === ln.x2).map((ln) => ln.x1));
    expect(barlines[0]).toEqual(barlines[1]);
    for (const s of sl.staves) expect(gapBeforeBarline(s.layout, 0)).toBeGreaterThanOrEqual(BARLINE_CLEARANCE - 1e-9);
  });
});

describe("stave lines at the end of the music", () => {
  const twoBars = (barline?: string) =>
    ({
      presentation: "stave", clef: "treble", timeSignature: "2/4", textAlternative: "x",
      measures: [
        { events: [{ kind: "note", pitch: "B4", duration: { value: "minim", dots: 0 } }] },
        { events: [{ kind: "note", pitch: "B4", duration: { value: "minim", dots: 0 } }], ...(barline ? { barline } : {}) },
      ],
    }) as unknown as NotationFragment;
  /** The right edge of the last bar-line's rightmost line. */
  const lastBarlineEdge = (l: StaveLayout) => Math.max(...l.fixed.lines.filter((ln) => ln.x1 === ln.x2).map((ln) => ln.x1 + ln.w / 2));

  for (const [name, f] of [
    ["final (the default at the end of several bars)", twoBars()],
    ["double", twoBars("double")],
    ["end repeat", twoBars("repeat-end")],
    ["final on a rhythm line", rhythmFragment([[n("crotchet"), n("crotchet")], [n("minim")]] as never, "2/4")],
  ] as const) {
    it(`stop at the outer edge of a closing ${name} bar-line`, () => {
      const l = layoutFragment(f);
      expect(l.staffEnd).toBeCloseTo(lastBarlineEdge(l), 9);
      expect(l.width).toBeLessThanOrEqual(l.staffEnd + 0.4);
    });
  }

  it("still run to the edge of an open stave (one bar, no bar-line), as in the stave editors", () => {
    const l = layoutFragment({ presentation: "stave", clef: "treble", textAlternative: "x", measures: [{ events: [{ kind: "note", pitch: "B4", duration: { value: "semibreve", dots: 0 } }] }] } as unknown as NotationFragment);
    expect(l.fixed.lines.filter((ln) => ln.x1 === ln.x2)).toHaveLength(0);
    expect(l.staffEnd).toBeCloseTo(l.width - 0.2, 9);
  });

  it("the final bar-line's thick line is the last thing drawn", () => {
    const l = layoutFragment(twoBars());
    const thick = l.fixed.lines.find((ln) => ln.w === ENGRAVING.thickBarline)!;
    expect(l.staffEnd).toBeCloseTo(thick.x1 + ENGRAVING.thickBarline / 2, 9);
  });
});
