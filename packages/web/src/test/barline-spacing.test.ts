/**
 * The end of a bar never crowds its bar-line: the last note's head, flag, dots or rest stays a clear gap before the bar-line's first mark
 * (the thin line of a final or double bar-line, the dots of an end repeat), and the staves of a score still share every bar-line. A closing
 * bar-line also ends the stave: its lines stop there instead of running on past it.
 */
import { describe, expect, it } from "vitest";
import type { NotationFragment } from "@mtp/curriculum";
import { BARLINE_CLEARANCE, layoutFragment, layoutScore, type StaveLayout } from "../components/notation/layout.ts";
import { ENGRAVING } from "../components/notation/glyphs.ts";
import { rhythmFragment } from "../components/exercise/RhythmEditors.tsx";
import { barlineMarks, gapBeforeBarline, INK } from "./notation-ink.ts";

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
    // two crotchet slots (3.4 each) and the 0.4 lead-out; the single bar-line's stroke stays centred on the slots' end
    expect(l.boundaries[0]!.width + ENGRAVING.thinBarline / 2).toBeCloseTo(7.2, 6);
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

const stave = (measures: unknown[], clef = "treble") => ({ presentation: "stave", clef, timeSignature: "2/4", textAlternative: "x", measures }) as unknown as NotationFragment;
const P = (pitch: string, value: string, dots = 0) => ({ kind: "note", pitch, duration: { value, dots } });

describe("open fragments (one bar, no bar-line given)", () => {
  it("draw no bar-line and are not widened for one", () => {
    // a flagged quaver and a quaver rest take the same slot; with nothing drawn after them, the flag must not widen the fragment
    // (G4 takes an up-stem, whose flag reaches furthest right)
    const flag = layoutFragment(stave([{ events: [P("G4", "quaver")] }]));
    const rest = layoutFragment(stave([{ events: [{ kind: "rest", duration: { value: "quaver", dots: 0 } }] }]));
    expect(flag.fixed.lines.filter((ln) => ln.x1 === ln.x2)).toEqual([]);
    expect(flag.width).toBeCloseTo(rest.width, 9);
  });
  it("still clear an explicit single bar-line (and draw it)", () => {
    const l = layoutFragment(stave([{ events: [P("G4", "quaver")], barline: "single" }]));
    expect(barlineMarks(l, 0)).toHaveLength(1);
    expect(gapBeforeBarline(l, 0)).toBeGreaterThanOrEqual(BARLINE_CLEARANCE - 1e-9);
  });
});

describe("repeat bar-lines", () => {
  it("an end repeat's dots sit 0.16 staff spaces clear of its thin line", () => {
    const l = layoutFragment(stave([{ events: [P("B4", "minim")], barline: "repeat-end" }, { events: [P("B4", "minim")] }]));
    const thin = l.fixed.lines.find((ln) => ln.w === ENGRAVING.thinBarline)!;
    const dots = l.fixed.paths.flatMap((p) => [...p.d.matchAll(/M(-?[\d.]+),[^m]*m-0\.25/g)].map((m) => Number(m[1])));
    expect(dots).toHaveLength(2);
    for (const cx of dots) expect(thin.x1 - thin.w / 2 - (cx + 0.25)).toBeCloseTo(0.16, 9);
  });
  it("a start repeat draws its dots to the right of its thin line, clear of the next bar's music and accidentals", () => {
    const l = layoutFragment(stave([{ events: [P("B4", "minim")], barline: "repeat-start" }, { events: [P("F#5", "minim")] }]));
    const thin = l.fixed.lines.find((ln) => ln.w === ENGRAVING.thinBarline && ln.x1 < l.barX[1]!)!;
    const dots = l.fixed.paths.flatMap((p) => [...p.d.matchAll(/M(-?[\d.]+),[^m]*m-0\.25/g)].map((m) => Number(m[1])));
    expect(dots).toHaveLength(2);
    // Bravura's repeatBarlineDotSeparation: 0.16 staff spaces between the thin line and the dots
    for (const cx of dots) expect(cx - 0.25 - (thin.x1 + thin.w / 2)).toBeCloseTo(0.16, 9);
    // the next bar's first ink (here the sharp in front of its note) starts after the dots
    const next = l.events.find((e) => e.bar === 1)!;
    const firstInk = Math.min(...next.glyphs.map((g) => g.x));
    expect(firstInk).toBeGreaterThan(Math.max(...dots) + 0.25);
  });
});

describe("whole-bar rests", () => {
  it("are centred between the bar's start and its bar-line, as finally resolved in a score", () => {
    const rest = { events: [{ kind: "rest", duration: { value: "minim", dots: 0 }, wholeBar: true }] };
    const control = layoutScore({ textAlternative: "x", staves: [
      { id: "a", label: "Upper", music: stave([rest, { events: [P("B4", "minim")] }]) },
      { id: "b", label: "Lower", music: stave([{ events: [P("C3", "crotchet"), P("D3", "crotchet")] }, { events: [P("G2", "minim")] }], "bass") },
    ] } as never);
    // the lower stave's last note is a flagged quaver this time: the shared bar-line moves right, and the rest must follow to stay centred
    const wide = layoutScore({ textAlternative: "x", staves: [
      { id: "a", label: "Upper", music: stave([rest, { events: [P("B4", "minim")] }]) },
      { id: "b", label: "Lower", music: stave([{ events: [P("C3", "crotchet"), P("D3", "quaver"), P("B2", "quaver")] }, { events: [P("G2", "minim")] }], "bass") },
    ] } as never);
    const centre = (sl: ReturnType<typeof layoutScore>) => {
      const l = sl.staves[0]!.layout;
      const g = l.events.find((e) => e.bar === 0 && e.rest)!.glyphs[0]!;
      return { rest: g.x + INK.get(g.ch)! / 2, bar: (l.barX[0]! + Math.min(...barlineMarks(l, 0))) / 2 };
    };
    expect(Math.min(...barlineMarks(wide.staves[0]!.layout, 0))).toBeGreaterThan(Math.min(...barlineMarks(control.staves[0]!.layout, 0)) + 0.5);
    for (const sl of [control, wide]) {
      const c = centre(sl);
      expect(c.rest).toBeCloseTo(c.bar, 6);
    }
  });
});
