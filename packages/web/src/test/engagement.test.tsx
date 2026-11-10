import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MilestoneBar, GoalRing, StatePill, ConceptRow } from "../components/Engagement";
import { friendlyDate, plural } from "../lib/progression";
import { completeSampleLesson, renderApp, startApi } from "./harness";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

async function signedIn() {
  const api = startApi();
  const user = userEvent.setup();
  renderApp("/");
  await user.click(await screen.findByRole("link", { name: "Get started" }));
  await user.click(screen.getByRole("button", { name: /New to music theory/ }));
  await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
  await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
  return { api, user };
}
async function noSeriousViolations(el: HTMLElement) {
  const r = await axe.run(el, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

describe("progression helpers", () => {
  it("words dates from calendar days, not hours", () => {
    expect(friendlyDate("2026-03-02", "2026-03-02")).toBe("today");
    expect(friendlyDate("2026-03-03", "2026-03-02")).toBe("tomorrow");
    expect(friendlyDate("2026-03-30", "2026-03-28")).toBe("in 2 days"); // across the UK clock change
    expect(friendlyDate("2026-03-20", "2026-03-02")).toBe("20 Mar");
    expect(friendlyDate(null, "2026-03-02")).toBe("not scheduled");
    expect(plural(1, "topic")).toBe("1 topic");
    expect(plural(2, "topic")).toBe("2 topics");
  });
});

describe("reward components", () => {
  it("describe progress in words as well as with a bar, and are accessible", async () => {
    const { container } = render(
      <div>
        <MilestoneBar total={30} milestone={{ level: 2, previous: 20, next: 50, toNext: 20, percent: 33 }} />
        <GoalRing done={1} target={2} />
        <StatePill state="practising" />
        <ul>
          <ConceptRow
            today="2026-03-02"
            c={{ conceptId: "c.x", title: "Treble clef line notes", summary: "", grade: 1, state: "proficient", highestState: "proficient", independentCorrect: 4, distinctTemplates: 2, spanDays: 0, delayedReviews: 0, lapses: 0, nextDueDate: "2026-03-03", due: false, reviewable: true, headline: "Next: mastered.", met: ["Proficient"], missing: ["a correct answer in a scheduled review"], mistakes: [{ id: "clef-confusion", count: 1, label: "Read as another clef.", tip: "Check the clef." }] }}
          />
        </ul>
      </div>,
    );
    expect(screen.getByRole("progressbar", { name: "XP towards your next milestone" })).toHaveAttribute("aria-valuetext", "30 of 50 XP");
    expect(screen.getByText("20 XP to your next milestone (50).")).toBeInTheDocument();
    expect(screen.getByText("Practising")).toBeInTheDocument();
    expect(screen.getByText(/next review tomorrow/)).toBeInTheDocument();
    expect(screen.getByText("a correct answer in a scheduled review")).toBeInTheDocument();
    await noSeriousViolations(container);
  });
});

describe("dashboard and review (real API, controlled clock)", () => {
  it("shows XP, the optional daily goal and no streak pressure for a new learner", async () => {
    await signedIn();
    const strip = await screen.findByRole("region", { name: "Your rewards" });
    expect(within(strip).getByText(/XP/)).toBeInTheDocument();
    expect(within(strip).getByText("0 of 1 session today")).toBeInTheDocument();
    expect(within(strip).queryByText(/streak/i)).toBeNull();
    expect(within(strip).queryByText(/^\d+ days?$/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /ready to review/ })).toBeNull();
    await noSeriousViolations(strip);
  });

  it("rewards a finished lesson, then nudges a review when it falls due, and says plainly when nothing is due", async () => {
    const { api } = await signedIn();
    await completeSampleLesson(api.course);
    cleanup();
    renderApp("/review");
    expect(await screen.findByText(/Nothing to review right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Optional practice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start review/ })).toBeNull();
    api.clock.advanceDays(1);
    cleanup();
    renderApp("/learn");
    expect(await screen.findByRole("heading", { name: "1 topic ready to review" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review, 1 ready" })).toBeInTheDocument();
  });

  it("lists topics by where they stand with an honest, expandable explanation, and distinguishes lesson complete from mastered", async () => {
    const { api } = await signedIn();
    await completeSampleLesson(api.course);
    cleanup();
    renderApp("/review");
    expect((await screen.findAllByText("Treble clef line notes")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Nearly mastered" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still learning" })).toBeInTheDocument(); // The stave: only one kind of question so far
    const how = screen.getByText(/How lessons, mastery and practice assessments differ/);
    await userEvent.setup().click(how);
    expect(screen.getByText(/Lesson complete:/)).toBeInTheDocument();
    expect(screen.getByText(/never count towards it/)).toBeInTheDocument();
    await noSeriousViolations(document.body);
  });

  it("shows rewards, understanding and badges on the progress screen, with the badge disclaimer", async () => {
    const { api } = await signedIn();
    await completeSampleLesson(api.course);
    cleanup();
    renderApp("/progress");
    expect(await screen.findByRole("heading", { name: "Rewards" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Understanding" })).toBeInTheDocument();
    const badges = await screen.findByRole("heading", { name: "Badges" });
    expect(badges).toBeInTheDocument();
    const section = badges.closest("section")!;
    expect(within(section).getByText("Earned")).toBeInTheDocument();
    expect(within(section).getAllByText(/still being written/).length).toBeGreaterThan(3);
    expect(within(section).getByText(/not ABRSM certificates/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/never unlocks lessons/)).toBeInTheDocument());
    await noSeriousViolations(document.body);
  });

  it("changes the daily goal in settings and hides the strip's goal when it is switched off", async () => {
    const { api } = await signedIn();
    const user = userEvent.setup();
    cleanup();
    renderApp("/settings");
    const group = await screen.findByRole("group", { name: "Sessions a day" });
    await user.click(within(group).getByLabelText("Off"));
    await waitFor(() => expect(api.calls).toContain("PATCH /api/me/profile"));
    cleanup();
    renderApp("/learn");
    await screen.findByRole("region", { name: "Your rewards" });
    expect(screen.queryByText(/Daily goal/)).toBeNull();
  });
});
