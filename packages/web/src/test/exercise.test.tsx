import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";
import { resolveWritten, StaveEditor, toWritten, type Written } from "../components/exercise/StaveEditor";
import { layoutFragment } from "../components/notation/layout";
import { music } from "../lib/music";

afterEach(cleanup);

function Harness({ input, onValue }: { input: ItemInput; onValue: (r: LearnerResponse | null) => void }) {
  const [v, setV] = useState<LearnerResponse | null>(null);
  return <AnswerInput input={input} value={v} onChange={(r) => { setV(r); onValue(r); }} disabled={false} />;
}

describe("answer inputs keep partial choices (regression)", () => {
  it("interval: quality first, then number", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "interval-name", maxNumber: 8, qualities: ["m", "M", "P"], compound: false }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("major"));
    expect(last).toBeNull();
    await user.click(screen.getByLabelText("7th"));
    expect(last).toEqual({ kind: "interval-name", number: 7, quality: "M" });
  });
  it("chord: numeral first, then position", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "chord-name", romans: ["I", "IV", "V"], inversions: ["a", "b", "c"] }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("IV"));
    await user.click(screen.getByLabelText(/^b —/));
    expect(last).toEqual({ kind: "chord-name", roman: "IV", inversion: "b" });
  });
  it("note name: letter, accidental and octave make one spelt pitch", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "note-name", accidentals: true, doubleAccidentals: false, octave: { min: 2, max: 6 } }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("F"));
    await user.click(screen.getByLabelText("sharp"));
    await user.click(screen.getByRole("button", { name: "Octave up" }));
    expect(last).toEqual({ kind: "pitch", pitch: "F#5" });
  });
});

describe("stave writing is read like real notation", () => {
  it("an unsigned note after an accidental in the bar keeps it; a natural cancels it", () => {
    const w: Written[] = [{ pos: 1, sign: "#" }, { pos: 1, sign: "none" }, { pos: 1, sign: "" }];
    expect(resolveWritten("treble", undefined, w).map(music.formatPitch)).toEqual(["F#4", "F#4", "F4"]);
    expect(resolveWritten("treble", "G major", [{ pos: 1, sign: "none" }]).map(music.formatPitch)).toEqual(["F#4"]);
    expect(toWritten("treble", "G major", [music.parsePitch("F#4"), music.parsePitch("F4")])).toEqual([{ pos: 1, sign: "none" }, { pos: 1, sign: "" }]);
  });
  it("typed key signature becomes the written accidentals in order", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "key-signature-writer", clef: "bass", maxAccidentals: 7 }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByText("Type the notes instead"));
    await user.type(screen.getByRole("textbox"), "F#3 C#3");
    await user.click(screen.getByRole("button", { name: "Write these notes" }));
    expect(last).toEqual({ kind: "key-signature", accidentals: [{ pitch: "F#3" }, { pitch: "C#3" }] });
  });
  it("per-note marks land on the note they refer to (given notes included)", () => {
    const { container } = render(
      <StaveEditor clef="bass" mode="sequence" given={["D3"]} value={[{ pos: 3, sign: "none" }, { pos: 5, sign: "#" }]} onChange={() => undefined} maxLedgerLines={1} accidentals doubleAccidentals={false} label="test" marks={[{ index: 0, ok: true }, { index: 1, ok: true }, { index: 2, ok: false }]} disabled />,
    );
    const marks = [...container.querySelectorAll(".n-mark")].map((m) => m.textContent);
    expect(marks).toEqual(["✓", "✓", "✗"]);
    expect(container.querySelectorAll("g.is-wrong").length).toBe(1);
  });
});

describe("notation layout", () => {
  it("prints accidentals from bar state and key signature, beams by the beat, and counts noteheads", () => {
    const l = layoutFragment({
      presentation: "stave", clef: "treble", key: "G major", showKeySignature: true, timeSignature: "2/4", textAlternative: "x",
      measures: [{ events: [
        { kind: "note", pitch: "F4", writtenAccidental: "natural", duration: { value: "quaver", dots: 0 }, beam: "begin" },
        { kind: "note", pitch: "F4", duration: { value: "quaver", dots: 0 }, beam: "end" },
        { kind: "note", pitch: "F#4", duration: { value: "crotchet", dots: 0 } },
      ] }],
    } as never);
    const signs = l.events.map((e) => e.glyphs.filter((g) => ["", "", ""].includes(g.ch)).length);
    expect(signs).toEqual([1, 0, 1]); // natural, carried, sharp restored
    expect(l.events[0]!.paths.some((p) => p.cls === "n-beam")).toBe(true);
    expect(l.events.flatMap((e) => e.noteIndex)).toEqual([0, 1, 2]);
    expect(l.fixed.glyphs.filter((g) => g.ch === "")).toHaveLength(1); // one sharp in the key signature
  });
});
