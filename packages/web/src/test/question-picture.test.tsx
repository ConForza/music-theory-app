import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NotationFragment } from "@mtp/curriculum";
import { MusicView } from "../pages/LessonSteps.tsx";

/** F6: a keyboard picture inside a question must not name its keys (or describe them) to the learner or a screen reader. */
const fragment = { presentation: "keyboard", clef: "treble", showKeySignature: false, measures: [{ events: [{ kind: "note", pitch: "C4", duration: { value: "crotchet", dots: 0 } }] }], textAlternative: "A piano keyboard with C highlighted." } as unknown as NotationFragment;

describe("question keyboard pictures", () => {
  it("name keys in teaching but are anonymous in questions", () => {
    const teaching = render(<MusicView fragment={fragment} />);
    expect(teaching.container.querySelectorAll(".key-name").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button").some((b) => /\bC\b/.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
    teaching.unmount();
    const q = render(<MusicView fragment={fragment} labels="positions" />);
    expect(q.container.querySelectorAll(".key-name")).toHaveLength(0);
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("aria-label")).not.toMatch(/\b[A-G](#|♯|♭| sharp| flat)?\d?\b/);
    expect(q.container.textContent).not.toMatch(/highlighted\./);
  });
});

describe("stave-position questions", () => {
  it("do not announce the line or space on the note control", () => {
    const f = { presentation: "staff", clef: "treble", showKeySignature: false, measures: [{ events: [{ kind: "note", pitch: "E4", duration: { value: "semibreve", dots: 0 } }] }], textAlternative: "x" } as unknown as NotationFragment;
    const { unmount } = render(<MusicView fragment={f} labels="neutral" />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).join(" ")).not.toMatch(/line|space|\bE\b/);
    unmount();
  });
});

describe("tempo words", () => {
  it("are printed above the first bar", () => {
    const f = { presentation: "stave", clef: "treble", showKeySignature: false, tempoText: "Andante", measures: [{ events: [{ kind: "note", pitch: "E4", duration: { value: "semibreve", dots: 0 } }] }], textAlternative: "x" } as unknown as NotationFragment;
    const { container } = render(<MusicView fragment={f} labels="positions" />);
    expect(container.querySelector(".n-tempo")?.textContent).toBe("Andante");
  });
});
