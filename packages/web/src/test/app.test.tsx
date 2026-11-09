import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { positionName } from "../lib/music";
import { renderApp, startApi } from "./harness";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

async function guestOnboard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("link", { name: "Get started" }));
  await user.click(screen.getByRole("button", { name: /New to music theory/ }));
  await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
  await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
}

const pick = (user: ReturnType<typeof userEvent.setup>, letter: string) => user.click(screen.getByLabelText(letter, { selector: "input" }));
async function answer(user: ReturnType<typeof userEvent.setup>, letter: string) {
  await pick(user, letter);
  await user.click(screen.getByRole("button", { name: "Check" }));
}

async function noSeriousViolations(el: HTMLElement) {
  // jsdom has no layout or colour, so colour contrast is covered by the browser run (e2e) instead.
  const r = await axe.run(el, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

describe("signed-out and access control", () => {
  it("sends signed-out visitors from protected pages to the welcome page", async () => {
    startApi();
    renderApp("/learn");
    expect(await screen.findByRole("heading", { name: /Learn music theory/ })).toBeInTheDocument();
  });

  it("shows a friendly page for unknown routes", async () => {
    startApi();
    renderApp("/not/a/page");
    expect(await screen.findByRole("heading", { name: /can't find that page/ })).toBeInTheDocument();
  });

  it("shows sign-in errors without revealing whether the account exists", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/signin");
    await user.type(await screen.findByLabelText("Email"), "ghost@example.com");
    await user.type(screen.getByLabelText(/^Password/), "whatever1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match.");
  });
});

describe("onboarding, path and navigation", () => {
  it("takes a beginner from welcome to a path generated from the curriculum", async () => {
    const { course } = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await noSeriousViolations(document.body);
    await guestOnboard(user);

    // Units and nodes come from the curriculum, not from the components.
    const grade1 = course.view.worlds[0]!;
    for (const u of grade1.units) expect(screen.getByRole("heading", { level: 2, name: u.learnerTitle })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-node]").length).toBe(grade1.nodes.length);
    expect(screen.getByRole("link", { name: /Start/ })).toHaveAttribute("href", "/lesson/G1-U3-L03");
    await noSeriousViolations(document.body);
  });

  it("explains a coming-soon node instead of leaving a dead end", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/");
    await guestOnboard(user);
    await user.click(document.querySelector<HTMLElement>('[data-node="G1-U1-L01"]')!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/still being written/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lets an experienced learner pick a grade, and remembers it", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /already know some theory/ }));
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /Grade 3: Compound Time and Minor Keys/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    expect(await screen.findByRole("link", { name: /Grade 3: Compound Time and Minor Keys. Change grade/ })).toBeInTheDocument();
    expect(await screen.findByText(/Nothing to start in Grade 3/)).toBeInTheDocument();
  });

  it("shows unit overviews and rejects unknown units", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/unit/G1-U3");
    expect(await screen.findByRole("heading", { name: "Welcome" }).catch(() => null)).toBeNull();
    cleanup();
    renderApp("/");
    await guestOnboard(user);
    cleanup();
    renderApp("/unit/G1-U3");
    expect(await screen.findByRole("heading", { level: 1, name: "The keyboard and the stave" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start: Treble clef: notes on the lines/ })).toBeInTheDocument();
    cleanup();
    renderApp("/unit/NOPE");
    expect(await screen.findByRole("heading", { name: /can't find that unit/ })).toBeInTheDocument();
  });
});

describe("lesson player", () => {
  it("runs the sample lesson end to end, grading on the server, and saves the result", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/");
    await guestOnboard(user);
    await user.click(screen.getByRole("link", { name: /Start/ }));

    await user.click(await screen.findByRole("button", { name: "Let's go" }));
    await screen.findByRole("heading", { name: "Here's the idea" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "See it, hear it" });
    expect(screen.getAllByRole("button", { name: /^Play / }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Try some questions" }));

    // A wrong answer gets the authored explanation and a way to retry; the check button does nothing until chosen.
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    await answer(user, "D");
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText(/counted from the bottom/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await answer(user, "G");
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    for (const l of ["B", "D", "E"]) {
      await answer(user, l);
      await user.click(await screen.findByRole("button", { name: "Continue" }));
    }

    // Stave questions: keyboard control, position (never note name) is announced
    const slider = await screen.findByRole("slider");
    slider.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(slider).toHaveAttribute("aria-valuetext", positionName(8));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowUp}{ArrowDown}{ArrowDown}");
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Lesson complete!" })).toBeInTheDocument();
    expect(await screen.findByText("Progress saved.")).toBeInTheDocument();
    await noSeriousViolations(document.body);
    await user.click(screen.getByRole("link", { name: "Back to the path" }));
    await waitFor(() => expect(document.querySelector('[data-node="G1-U3-L03"]')).toHaveAttribute("data-status", "completed"));
  });

  it("resumes at the first unanswered question after an interruption", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/");
    await guestOnboard(user);
    await user.click(screen.getByRole("link", { name: /Start/ }));
    await user.click(await screen.findByRole("button", { name: "Let's go" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Try some questions" }));
    await answer(user, "G");
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: /Close lesson/ }));
    expect(await screen.findByText("Pick up where you left off")).toBeInTheDocument();

    cleanup(); // the app is closed and reopened: same session, same learner
    renderApp("/lesson/G1-U3-L03");
    expect(await screen.findByText(/Question 2 of 6/)).toBeInTheDocument();
  });

  it("keeps the answer and reports it when the network drops, then succeeds on retry", async () => {
    const api = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await guestOnboard(user);
    await user.click(screen.getByRole("link", { name: /Start/ }));
    await user.click(await screen.findByRole("button", { name: "Let's go" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Try some questions" }));
    await pick(user, "G");
    api.setOffline(true);
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/didn't send/, undefined, { timeout: 5000 })).toBeInTheDocument();
    api.setOffline(false);
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
  });

  it("refuses locked, coming-soon and unknown lessons with a clear page", async () => {
    startApi({ waive: false });
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await screen.findByText(/Nothing to start in Grade 1/);
    cleanup();
    renderApp("/lesson/G1-U3-L03");
    expect(await screen.findByRole("heading", { name: "This lesson is locked" })).toBeInTheDocument();
    cleanup();
    renderApp("/lesson/G1-U1-L01");
    expect(await screen.findByRole("heading", { name: "Coming soon" })).toBeInTheDocument();
    cleanup();
    renderApp("/lesson/NOPE");
    expect(await screen.findByRole("heading", { name: /can't find that lesson/ })).toBeInTheDocument();
  });
});

describe("profile, progress and settings", () => {
  it("shows honest progress, applies settings immediately and upgrades a guest in place", async () => {
    startApi();
    const user = userEvent.setup();
    renderApp("/");
    await guestOnboard(user);

    await user.click(screen.getByRole("link", { name: "Settings" }));
    await user.click(await screen.findByLabelText("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByLabelText("Reduce"));
    expect(document.documentElement.dataset.motion).toBe("reduce");
    await noSeriousViolations(document.body);

    await user.click(screen.getByRole("link", { name: "Progress" }));
    expect(await screen.findByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThanOrEqual(5);

    await user.click(screen.getByRole("link", { name: "Profile" }));
    expect(await screen.findByText("Guest profile")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Nickname/), "Grace");
    await user.type(screen.getByLabelText(/^Email/), "grace@example.com");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByRole("heading", { name: "Grace" })).toBeInTheDocument();
    expect(screen.queryByText("Guest profile")).toBeNull();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-motion");
  });
});
