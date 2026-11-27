import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NotationFragment } from "@mtp/curriculum";
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
