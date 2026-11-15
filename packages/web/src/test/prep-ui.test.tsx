import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clockText, minutesText, spokenTime, levelClass, READINESS_WORDS, LEVEL_WORDS } from "../lib/prep";
import { Question } from "../pages/LessonSteps";
import type { LearnerItem } from "../api/client";

vi.mock("../lib/audio", async (orig) => ({ ...(await orig<typeof import("../lib/audio")>()), cue: vi.fn(), stopAll: vi.fn(), playPitch: vi.fn(), playTimed: vi.fn() }));
import { cue } from "../lib/audio";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item: LearnerItem = {
  id: "i.gen.demo.v1.s1.abc",
  section: "practice",
  evidence: "independent",
  prompt: "Which of these is a crotchet?",
  input: { kind: "choice", options: [{ id: "a", label: "Quarter note" }, { id: "b", label: "Half note" }] },
  hintCount: 0,
  familyId: "fam.choice",
  grade: 1,
} as unknown as LearnerItem;

const setup = (blind: boolean, reply: { correct: boolean }) => {
  const attempt = vi.fn(async () => ({ correct: reply.correct, category: null, message: "SECRET VERDICT", reason: "SECRET REASON", solution: "SECRET SOLUTION", attemptNumber: 1, replayed: false }));
  render(
    <MemoryRouter>
      <Question nodeId="" item={item} index={1} total={2} blind={blind} source={{ attempt, hint: async () => ({ hint: "h", level: 1 }) }} onCorrect={() => undefined} />
    </MemoryRouter>,
  );
  return attempt;
};

it("a blind (mock or placement) answer says only that it was saved: no verdict, no reason, no worked answer, and no right/wrong sound", async () => {
  const user = userEvent.setup();
  const attempt = setup(true, { correct: false });
  await user.click(screen.getByRole("radio", { name: /Half note/ }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  await screen.findByText("Answer saved");
  expect(attempt).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toMatch(/SECRET|Not quite|Not this time|Correct!/);
  expect(cue).not.toHaveBeenCalled();
  // the answer cannot be changed after it is saved: the first answer is final
  for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
});

it("a practice-mode answer still shows its feedback and sounds the cue (the existing behaviour)", async () => {
  const user = userEvent.setup();
  setup(false, { correct: false });
  await user.click(screen.getByRole("radio", { name: /Half note/ }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  await waitFor(() => expect(screen.getByText("SECRET VERDICT")).toBeInTheDocument());
  expect(cue).toHaveBeenCalledWith("wrong");
});

it("times are shown for people and read out in words", () => {
  expect(clockText(0)).toBe("0:00");
  expect(clockText(65)).toBe("1:05");
  expect(clockText(3725)).toBe("1:02:05");
  expect(minutesText(54 * 60)).toBe("54 min");
  expect(minutesText(3900)).toBe("1 h 5 min");
  expect(minutesText(1)).toBe("1 min");
  expect(spokenTime(60)).toBe("1 minute");
  expect(spokenTime(305)).toBe("5 minutes 5 seconds");
  expect(spokenTime(45)).toBe("45 seconds");
});

it("the wording of levels and readiness is the cautious one, and never says pass, certificate or a grade", () => {
  expect(Object.values(READINESS_WORDS)).toEqual(["On track", "Developing", "Needs review", "Not enough evidence yet"]);
  expect(Object.values(LEVEL_WORDS)).toEqual(["Mastered", "Developing", "Needs review", "Not yet assessed"]);
  for (const w of [...Object.values(READINESS_WORDS), ...Object.values(LEVEL_WORDS)]) expect(w).not.toMatch(/pass|certificate|grade|ABRSM/i);
  expect(levelClass("needs_review")).toBe("level-needs-review");
});
