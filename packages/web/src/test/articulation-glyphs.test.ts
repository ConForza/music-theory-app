import { describe, expect, it } from "vitest";
import { layoutFragment } from "../components/notation/layout.ts";

/**
 * Review of PR #15 (P1): a pointed accent and a wedge are asymmetric. The renderer puts an articulation on the side opposite the stem, and
 * used the ABOVE glyph in both places, so a mark under a stem-up note pointed the wrong way (the lesson says "∧ over a note or ∨ under it").
 */
const draw = (pitch: string, art: string) => {
  const f = { presentation: "stave", clef: "treble", showKeySignature: false, textAlternative: "one note", measures: [{ events: [{ kind: "note", pitch, duration: { value: "crotchet", dots: 0 }, articulations: [art] }] }] } as never;
  return layoutFragment(f).events.flatMap((e) => e.glyphs.map((g) => g.ch));
};
describe("articulation signs point the right way on either side of the note", () => {
  // treble G4 sits below the middle line (stem up, so the mark goes UNDER the note); treble D5 sits above it (stem down, mark OVER the note)
  it("strong accent: ∨ under a stem-up note, ∧ over a stem-down note", () => {
    expect(draw("G4", "strong-accent")).toContain("");
    expect(draw("G4", "strong-accent")).not.toContain("");
    expect(draw("D5", "strong-accent")).toContain("");
    expect(draw("D5", "strong-accent")).not.toContain("");
  });
  it("staccatissimo wedge: the point is towards the note on either side", () => {
    expect(draw("G4", "staccatissimo")).toContain("");
    expect(draw("D5", "staccatissimo")).toContain("");
  });
  it("symmetric signs are unchanged (staccato dot, accent, tenuto)", () => {
    for (const a of ["staccato", "accent", "tenuto"]) expect(draw("G4", a)).toEqual(draw("D5", a).map((c) => c));
  });
});
