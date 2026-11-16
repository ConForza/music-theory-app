import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemInput } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";

afterEach(cleanup);
const semiquaver = { kind: "note", pitch: "C5", duration: { value: "semiquaver", dots: 0 } };
const input = { kind: "rhythm-builder", mode: "complete-bar", timeSignature: "2/4", bars: 1, given: [semiquaver, semiquaver, semiquaver, semiquaver], values: ["minim", "crotchet", "quaver", "semiquaver"], maxDots: 1, rests: false, ties: false, tuplets: [] } as unknown as ItemInput;

describe("bar builder in a challenge or assessment", () => {
  it("teaches with the remaining amount, but in an exam only says whether the bar is full", () => {
    render(<AnswerInput input={input} value={null} onChange={() => undefined} disabled={false} />);
    expect(screen.getByText(/Still needed: a crotchet/)).toBeInTheDocument();
    cleanup();
    render(<AnswerInput input={input} value={null} onChange={() => undefined} disabled={false} exam />);
    expect(screen.queryByText(/Still needed/)).toBeNull();
    expect(screen.queryByText(/crotchet\./)).toBeNull();
    expect(screen.getByText("The bar is not full yet.")).toBeInTheDocument();
  });
});
