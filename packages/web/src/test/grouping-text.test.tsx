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
