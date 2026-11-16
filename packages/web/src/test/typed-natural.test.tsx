import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";

afterEach(cleanup);

/**
 * Brief 11 release audit, F2: "Type the notes instead" wrote a typed natural with no sign, so beside a printed note of the same line or space
 * that carries an accidental it was read back as that note (typing E2 after a printed E sharp submitted E sharp and was marked wrong).
 */
async function typed(shown: string, text: string, clef = "bass") {
  const user = userEvent.setup();
  const input = { kind: "staff-position", clef, maxLedgerLines: 2, accidentals: true, doubleAccidentals: true, shown: [shown] } as unknown as ItemInput;
  let last: LearnerResponse | null = null;
  function Harness() {
    const [v, setV] = useState<LearnerResponse | null>(null);
    return <AnswerInput input={input} value={v} onChange={(r) => { last = r; setV(r); }} disabled={false} />;
  }
  const { container } = render(<Harness />);
  await user.click(container.querySelector("details.type-instead summary")!);
  await user.type(container.querySelector("details.type-instead input[type=text]")!, text);
  await user.click(screen.getByRole("button", { name: "Write these notes" }));
  cleanup();
  return last as LearnerResponse | null;
}

describe("a typed note is the note that is submitted", () => {
  it("E typed after a printed E sharp is E natural (an augmented 1st below E sharp)", async () => {
    expect(await typed("E#2", "E2")).toEqual({ kind: "staff-position", pitch: "E2" });
  });
  it("C typed after a printed C flat is C natural", async () => {
    expect(await typed("Cb4", "C4", "treble")).toEqual({ kind: "staff-position", pitch: "C4" });
  });
  it("typed notes that need their own sign, or sit on another line, are unchanged", async () => {
    expect(await typed("G#3", "Gx3")).toEqual({ kind: "staff-position", pitch: "Gx3" });
    expect(await typed("A2", "A#2")).toEqual({ kind: "staff-position", pitch: "A#2" });
    expect(await typed("E#2", "G2")).toEqual({ kind: "staff-position", pitch: "G2" });
  });
});
