/** Flexible learning in the UI: Practise a topic (choose, play, finish, repeat) and Explore lessons, against the shipped content. */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalResponse, inputFor } from "@mtp/engine";
import { api } from "../api/client";
import { renderApp, startApi } from "./harness";

vi.mock("../lib/audio", async (orig) => ({ ...(await orig<typeof import("../lib/audio")>()), cue: vi.fn(), stopAll: vi.fn(), playPitch: vi.fn(), playTimed: vi.fn() }));

// Production samples every topic's question pool before it listens (startup.ts), so the Practice page's first load is fast. Do the same once
// for this file's shared curriculum instead of making the first test pay for it.
beforeAll(() => {
  const { app } = startApi({ real: true });
  app.engagement.review.warmPools();
  app.topics.overview("warm-up");
}, 300_000);

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => cleanup());

async function guest(selectedGrade = 1) {
  const h = startApi({ waive: false, real: true });
  await api.guest();
  await api.patchProfile({ onboarded: true, experience: "new", selectedGrade });
  return h;
}

describe("Practise a topic", () => {
  it("a fresh guest picks Grade 5 → Keys and scales → a topic → 5 questions, plays, finishes early and practises again", async () => {
    const h = await guest(1);
    const user = userEvent.setup();
    renderApp("/practice");
    const picker = await screen.findByTestId("topic-practice");
    expect(within(picker).getByRole("heading", { level: 1, name: "Choose what you want to work on" })).toBeInTheDocument();
    await user.click(within(picker).getByRole("radio", { name: "Grade 5" }));
    await user.click(within(picker).getByText("Keys, scales and key signatures"));
    await user.click(within(picker).getByRole("button", { name: /^Six sharps/ }));
    await user.click(within(picker).getByRole("radio", { name: "5 questions" }));
    await user.click(within(picker).getByRole("button", { name: "Start: Six sharps" }));
    expect(await screen.findByText(/Grade 5 · Six sharps · Question 1 of 5/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Not sure\? Learn it:/ })).toHaveAttribute("href", expect.stringMatching(/^\/lesson\/G5-U3-L01\?explore=1&from=topic%3A[0-9a-f-]+$/));
    await user.click(screen.getByRole("button", { name: "Finish now" }));
    const done = await screen.findByTestId("topic-summary");
    expect(within(done).getByRole("heading", { name: "Stopped early, and that's fine" })).toBeInTheDocument();
    expect(within(done).getByText(/doesn't change your path, earn XP or count towards mastery/)).toBeInTheDocument();
    const before = h.calls.filter((c) => c === "POST /api/topic-practice/sessions").length;
    await user.click(screen.getByRole("button", { name: "Practise again" }));
    expect(await screen.findByText(/Grade 5 · Six sharps · Question 1 of 5/)).toBeInTheDocument();
    expect(h.calls.filter((c) => c === "POST /api/topic-practice/sessions").length).toBe(before + 1);
    // nothing about the guided path changed
    expect((await api.me()).profile.selectedGrade).toBe(1);
    expect((await api.progress()).totals.lessonsCompleted).toBe(0);
  }, 60_000);

  it("a narrow topic that has fewer different questions says so on the first question", async () => {
    await guest(2);
    const user = userEvent.setup();
    renderApp("/practice");
    const picker = await screen.findByTestId("topic-practice");
    await user.click(within(picker).getByRole("radio", { name: "Grade 2" }));
    await user.click(within(picker).getByText("Keys, scales and key signatures"));
    const topic = within(picker).getByRole("button", { name: /^Melodic minor preview/ });
    expect(topic).toHaveTextContent(/only \d+ different questions/);
    await user.click(topic);
    // counts the topic cannot fill are not offered, and the start line says what will happen
    expect(within(picker).getByRole("radio", { name: "20 questions" })).toBeDisabled();
    expect(within(picker).getByRole("radio", { name: "10 questions" })).toBeDisabled();
    expect(within(picker).getByRole("radio", { name: "5 questions" })).toBeChecked();
    expect(within(picker).getByTestId("topic-start-note")).toHaveTextContent(/this topic has only \d+ different ones/);
    await user.click(within(picker).getByRole("button", { name: /^Start:/ }));
    const note = await screen.findByTestId("topic-shortfall");
    expect(note).toHaveTextContent(/not 5\. Nothing from other topics has been added/);
  }, 60_000);
});

describe("Explore lessons", () => {
  it("lists every grade's units and lessons; opening one ahead of the path gives advice, not a lock, and the path does not move", async () => {
    await guest(1);
    const user = userEvent.setup();
    renderApp("/learn");
    await user.click(await screen.findByRole("link", { name: /Explore lessons/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Explore lessons" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Grade 5" }));
    const unit = await screen.findByRole("region", { name: /Unit 3:/ });
    const open = within(unit).getAllByRole("link", { name: /^Open:/ })[2]!;
    expect(open).toHaveAttribute("href", "/lesson/G5-U3-L03?explore=1");
    await user.click(open);
    const note = await screen.findByTestId("explore-note");
    expect(note).toHaveTextContent(/exploring ahead of your guided path/);
    expect(within(note).getAllByRole("link").length).toBeGreaterThan(0);
    await waitFor(async () => expect((await api.progress()).nodes["G5-U3-L03"]!.state).toBe("in_progress"));
    const prog = await api.progress();
    expect(prog.nodes["G5-U3-L03"]!.outOfSequence).toBe(true);
    expect(prog.grades[0]!.nextNodeId).toBe("G1-U1-L01");
    expect((await api.me()).profile.selectedGrade).toBe(1);
  }, 60_000);

  it("a lesson completed through Explore is tagged, and the next lesson's lock names the real missing step, not the explored one", async () => {
    const h = await guest(1);
    const node = "G1-U1-L02";
    await api.lesson(node, true);
    await api.start(node, true);
    for (const it of h.course.authoredItems(node)) {
      const scope = h.course.scopeFor(node, it);
      const response = it.answer.kind === "pitch" && inputFor(h.course.ix, it, scope).kind === "pitch-letter" ? { kind: "pitch-letter" as const, letter: it.answer.accepted[0]!.charAt(0) as "A" } : canonicalResponse(h.course.ix, it, scope);
      await api.attempt(node, crypto.randomUUID(), it.id, response as never);
    }
    await api.complete(node);
    renderApp("/unit/G1-U1");
    const done = await screen.findByText("Explored", { selector: `[data-node="${node}"] .pill` });
    expect(done).toBeInTheDocument();
    const next = document.querySelector('[data-node="G1-U1-L03"]') as HTMLElement;
    expect(next).toHaveTextContent(/Finish “.+” first\. “.+”, which you've already explored, will count then\./);
  }, 60_000);

  it("a malformed grade in the Explore address falls back to the guided grade instead of breaking the page (review finding 8)", async () => {
    await guest(2);
    renderApp("/learn/explore?grade=2.5");
    expect(await screen.findByRole("heading", { level: 2, name: /^Grade 2:/ })).toBeInTheDocument();
  }, 30_000);

  it("with only explored lessons in a grade, Learn says what the guided path is waiting for, never that the grade is done (review finding 4)", async () => {
    const h = await guest(5);
    for (const node of ["G5-U2-L02", "G5-U2-L03"]) {
      await api.lesson(node, true);
      await api.start(node, true);
      for (const it of h.course.authoredItems(node)) {
        const scope = h.course.scopeFor(node, it);
        const response = it.answer.kind === "pitch" && inputFor(h.course.ix, it, scope).kind === "pitch-letter" ? { kind: "pitch-letter" as const, letter: it.answer.accepted[0]!.charAt(0) as "A" } : canonicalResponse(h.course.ix, it, scope);
        await api.attempt(node, crypto.randomUUID(), it.id, response as never);
      }
      await api.complete(node);
    }
    renderApp("/learn");
    const card = await screen.findByTestId("guided-blocked");
    expect(card).toHaveTextContent(/Your Grade 5 path continues after earlier steps/);
    expect(card).toHaveTextContent(/2 lessons you completed here through Explore will count then/);
    expect(screen.queryByText(/every ready lesson/)).toBeNull();
  }, 60_000);

  it("closing a lesson opened from a practice question returns to that practice session (review finding 7)", async () => {
    await guest(1);
    const user = userEvent.setup();
    renderApp(`/lesson/G1-U1-L03?explore=1&from=${encodeURIComponent("topic:not-a-session")}`);
    await user.click(await screen.findByRole("button", { name: /Close lesson/ }));
    // the practice route answers (this test's session id does not exist, so it is the practice player's not-found page, not Explore)
    expect(await screen.findByRole("heading", { name: /can't find that practice session/ })).toBeInTheDocument();
  }, 30_000);

  it("a locked lesson opened from the guided path offers to explore it instead", async () => {
    await guest(1);
    renderApp("/lesson/G1-U1-L03");
    expect(await screen.findByRole("heading", { name: "This lesson is locked" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore it anyway" })).toHaveAttribute("href", "/lesson/G1-U1-L03?explore=1");
  }, 30_000);
});
