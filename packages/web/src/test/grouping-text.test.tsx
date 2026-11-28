import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";
import { describeBars } from "../components/exercise/RhythmEditors";

afterEach(cleanup);

/**
 * Educational review of PR #18, Grade 2 note grouping: the text a screen reader hears for the grouping editor did not mention beams, so it was
 * identical before and after the learner joined or split any beam.
 */
const q = (beam?: string) => ({ kind: "note", pitch: "B4", duration: { value: "quaver", dots: 0 }, ...(beam ? { beam } : {}) }) as never;

describe("the grouping editor says what is beamed", () => {
  it("describeBars names beamed groups, so beaming changes the words", () => {
    const flags = describeBars([[q(), q(), q(), q()]]);
    const beamed = describeBars([[q("begin"), q("end"), q("begin"), q("end")]]);
    expect(flags).toBe("Bar 1: four quavers.");
    expect(beamed).toBe("Bar 1: two pairs of beamed quavers.");
    expect(beamed).not.toBe(flags);
    expect(describeBars([[q("begin"), q("continue"), q("continue"), q("end")]])).toBe("Bar 1: four quavers beamed together.");
  });

  it("joining two notes in the editor changes the live description, and separating them restores it", async () => {
    const user = userEvent.setup();
    const input = { kind: "rhythm-grouping", timeSignature: "2/4", measures: [{ events: [q(), q(), q(), q()] }] } as unknown as ItemInput;
    function Harness() {
      const [v, setV] = useState<LearnerResponse | null>(null);
      return <AnswerInput input={input} value={v} onChange={setV} disabled={false} />;
    }
    const { container } = render(<Harness />);
    const live = () => container.querySelector(".grouping-editor p.visually-hidden")!.textContent;
    const before = live();
    expect(before).toBe("Bar 1: four quavers.");
    await user.click(screen.getByRole("button", { name: "Beam note 1 to note 2" }));
    expect(live()).toBe("Bar 1: two quavers beamed together followed by two quavers.");
    await user.click(screen.getByRole("button", { name: "Beam note 3 to note 4" }));
    expect(live()).toBe("Bar 1: two pairs of beamed quavers.");
    await user.click(screen.getByRole("button", { name: "Beam note 1 to note 2" }));
    await user.click(screen.getByRole("button", { name: "Beam note 3 to note 4" }));
    expect(live()).toBe(before);
  });
});

/**
 * First review of PR #30, P1: in the bar builder, a crotchet tied into two quavers that the editor beams together was described exactly as the same
 * notes with no beam ("a crotchet tied to a quaver followed by a quaver"), so a screen-reader user could not check the grouping they had written.
 */
describe("the bar builder describes a tie into a beamed group", () => {
  it("names both the tie and the beam in the live description", async () => {
    const user = userEvent.setup();
    const input = { kind: "rhythm-builder", mode: "rewrite", timeSignature: "4/4", bars: 1, given: [], values: ["minim", "crotchet", "quaver"], maxDots: 1, rests: true, ties: true, tuplets: [] } as unknown as ItemInput;
    function Harness() {
      const [v, setV] = useState<LearnerResponse | null>(null);
      return <AnswerInput input={input} value={v} onChange={setV} disabled={false} />;
    }
    const { container } = render(<Harness />);
    const live = () => container.querySelector(".bar-meter .visually-hidden")!.textContent;
    await user.click(screen.getByRole("button", { name: "Add a crotchet" }));
    await user.click(screen.getByRole("button", { name: "Tie last note to next" }));
    await user.click(screen.getByRole("button", { name: "Add a quaver" }));
    await user.click(screen.getByRole("button", { name: "Add a quaver" }));
    expect(live()).toBe("Bar 1: a crotchet tied into the first of two beamed quavers.");
    // and the same notes without a tie read differently again
    expect(describeBars([[{ kind: "note", duration: { value: "crotchet", dots: 0 } }, q("begin"), q("end")] as never])).toBe("Bar 1: a crotchet followed by two quavers beamed together.");
  });
});
