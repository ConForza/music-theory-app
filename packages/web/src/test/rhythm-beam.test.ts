import { music } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { beamBar } from "../components/exercise/RhythmEditors.tsx";

/**
 * Regression for a bug the browser suite found (CI run on 50df9ee): the note-entry editor beamed every bar by the FIRST pattern of an
 * irregular signature (7/8 as 2+2+3), so a correct bar for "grouping 2 + 3 + 2" was sent beamed the wrong way and refused.
 */
const note = (value: string) => ({ kind: "note", pitch: "B4", duration: { value, dots: 0 } }) as never;
const bar = [note("crotchet"), note("quaver"), ...Array.from({ length: 8 }, () => note("semiquaver"))];

describe("the note-entry editor beams by the grouping the question names", () => {
  const issues = (events: unknown[], pattern: string) => music.checkBar(events as never, music.metreStructures("7/8").find((s) => s.pattern!.join("+") === pattern)!, { requireBeams: true });
  it("7/8 as 2+3+2 is beamed as 2+3+2, not as the default 2+2+3", () => {
    expect(issues(beamBar(bar as never, "7/8", [2, 3, 2]) as never, "2+3+2")).toEqual([]);
    expect(issues(beamBar(bar as never, "7/8") as never, "2+3+2").length).toBeGreaterThan(0);
  });
  it("every pattern of 5/8 and 7/8 beams its own bar cleanly", () => {
    for (const ts of ["5/8", "7/8"]) {
      for (const s of music.metreStructures(ts)) {
        const events = s.pattern!.flatMap((len) => Array.from({ length: len }, () => note("quaver")));
        expect(music.checkBar(beamBar(events as never, ts, s.pattern!) as never, s, { requireBeams: true }), `${ts} ${s.pattern!.join("+")}`).toEqual([]);
      }
    }
  });
});

describe("with no grouping named, an irregular bar is beamed by a pattern that fits it", () => {
  it("a 7/8 bar that only reads as 3+2+2 is beamed as 3+2+2 although 2+2+3 is the default", () => {
    const events = [note("quaver"), note("quaver"), note("quaver"), note("crotchet"), note("crotchet")];
    const s = music.metreStructures("7/8").find((x) => x.pattern!.join("+") === "3+2+2")!;
    expect(music.checkBar(beamBar(events as never, "7/8") as never, s, { requireBeams: true })).toEqual([]);
  });
});
