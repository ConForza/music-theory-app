import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { NotationFragment } from "@mtp/curriculum";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";
import { Notation } from "../components/notation/Notation";

/**
 * First review of PR #30: a description should have one reading surface. Static notation is described once, as the picture's own name; the
 * focusable scrolling group keeps only its short label. In an answer editor the live meter announces the description, so the picture there takes a
 * short name instead.
 */
const text = "Bar 1: four quavers beamed together followed by a minim.";
const fragment = {
  presentation: "rhythm-line",
  clef: "treble",
  showKeySignature: false,
  timeSignature: "2/4",
  measures: [{ events: [{ kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } }] }],
  textAlternative: text,
} as unknown as NotationFragment;

const exposures = (root: HTMLElement) => {
  const names = [...root.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label"));
  const visibleText = [...root.querySelectorAll("p, figcaption")].filter((e) => e.getAttribute("aria-hidden") !== "true").map((e) => e.textContent);
  return [...names, ...visibleText].filter((t) => t === text).length;
};

describe("notation descriptions", () => {
  it("static notation carries its description once, as the picture's name, with no describedby or hidden copy", () => {
    const { container } = render(<Notation fragment={fragment} />);
    expect(container.querySelector("svg.notation-svg")!.getAttribute("aria-label")).toBe(text);
    expect(container.querySelector("[aria-describedby]")).toBeNull();
    expect(exposures(container)).toBe(1);
    expect(container.querySelector(".notation-scroll")!.getAttribute("tabindex")).toBe("0");
  });

  it("an editor's picture takes a short name, leaving the description to the editor's live text", () => {
    const { container } = render(<Notation fragment={fragment} describe={false} />);
    expect(exposures(container)).toBe(0);
    expect(container.querySelector("svg.notation-svg")!.getAttribute("aria-label")).toMatch(/^Your answer, drawn as notation/);
  });
});

/**
 * Second review of PR #30, P1: an editor may give its picture the short name only if it reads the whole rhythm somewhere live. The bar-line editor did
 * not, so its last note had no text equivalent and placed bar-lines were never read back. Every editor that uses the short name is checked here.
 */
describe("every answer editor that gives its picture a short name reads the whole rhythm live", () => {
  const nt = (value: string) => ({ kind: "note", duration: { value, dots: 0 } });
  const SHORT = /^Your answer, drawn as notation/;
  function Harness({ input }: { input: ItemInput }) {
    const [v, setV] = useState<LearnerResponse | null>(null);
    return <AnswerInput input={input} value={v} onChange={setV} disabled={false} />;
  }
  const liveText = (root: HTMLElement) => [...root.querySelectorAll("[aria-live]")].map((e) => e.textContent ?? "").join(" ");
  const pictureName = (root: HTMLElement) => root.querySelector("svg.notation-svg")!.getAttribute("aria-label") ?? "";

  it("bar-line placement: every note, the last one included, and the bars as the learner splits them", async () => {
    const user = userEvent.setup();
    const events = [nt("crotchet"), nt("crotchet"), nt("crotchet"), nt("minim"), nt("quaver"), nt("quaver")];
    const { container } = render(<Harness input={{ kind: "barlines", timeSignature: "3/4", events, final: true } as unknown as ItemInput} />);
    expect(pictureName(container)).toMatch(SHORT);
    expect(liveText(container)).toContain("Bar 1: three crotchets, a minim and two quavers.");
    await user.click(screen.getByRole("button", { name: /Bar-line after note 3/ }));
    expect(liveText(container)).toContain("1 bar-line placed in 3/4.");
    expect(liveText(container)).toContain("Bar 1: three crotchets. Bar 2: a minim followed by two quavers.");
  });

  it("bar builder: the given notes and every change, including a tie that has not reached its next note", async () => {
    const user = userEvent.setup();
    const input = { kind: "rhythm-builder", mode: "complete-bar", timeSignature: "3/4", bars: 1, given: [nt("crotchet")], values: ["minim", "crotchet", "quaver"], maxDots: 1, rests: true, ties: true, tuplets: [] } as unknown as ItemInput;
    const { container } = render(<Harness input={input} />);
    expect(pictureName(container)).toMatch(SHORT);
    expect(liveText(container)).toContain("Bar 1: a crotchet.");
    await user.click(screen.getByRole("button", { name: "Add a crotchet" }));
    await user.click(screen.getByRole("button", { name: "Tie last note to next" }));
    expect(liveText(container)).toContain("Bar 1: a crotchet followed by a crotchet tied to the next note.");
  });

  it("beam grouping: the notes and their current beams", () => {
    const input = { kind: "rhythm-grouping", timeSignature: "2/4", measures: [{ events: [nt("quaver"), nt("quaver"), nt("quaver"), nt("quaver")] }] } as unknown as ItemInput;
    const { container } = render(<Harness input={input} />);
    expect(pictureName(container)).toMatch(SHORT);
    expect(liveText(container)).toContain("Bar 1: four quavers.");
  });
});
