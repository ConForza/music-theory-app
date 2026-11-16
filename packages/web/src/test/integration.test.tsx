/**
 * Brief 02 × Brief 03 integration: the identity-scoped cancellation that protects lessons (PR #5) must also protect the
 * practice lab's calls. Assertions read the server's persisted data (account export), not just what the page shows.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiFailure } from "../api/client";
import { AppProvider, useApp } from "../state/app";
import { startApi } from "./harness";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ADA = { displayName: "Ada", email: "ada@example.com", password: "a long password" };
const BEN = { displayName: "Ben", email: "ben@example.com", password: "another long password" };
const creds = (w: typeof ADA) => ({ email: w.email, password: w.password });
const SET = "s.notes-on-the-stave";
type Harness = ReturnType<typeof startApi>;

async function twoLearners() {
  for (const who of [ADA, BEN]) {
    await api.register(who);
    await api.patchProfile({ experience: "new", selectedGrade: 1, onboarded: true });
    await api.logout();
  }
}
const practiceCount = async (who: typeof ADA) => {
  await api.login(creds(who));
  const exp = (await api.exportData()) as { practiceAttempts: unknown[]; attempts: unknown[] };
  await api.logout();
  return { practice: exp.practiceAttempts.length, lesson: exp.attempts.length };
};
function mountProbe() {
  let app!: ReturnType<typeof useApp>;
  function P() {
    app = useApp();
    return <p data-testid="who">{app.me?.user.displayName ?? "nobody"}</p>;
  }
  render(<AppProvider><P /></AppProvider>);
  return () => app;
}
async function signedInAs(who: typeof ADA) {
  const probe = mountProbe();
  await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("nobody"));
  await act(async () => probe().setMe(await api.login(creds(who))));
  return probe;
}
async function firstItem() {
  const set = await api.practiceSet(SET);
  return set.items[0]!;
}
const ANSWER = { kind: "pitch", pitch: "D5" } as const;
const sentAttempts = (h: Harness) => h.calls.filter((c) => /POST .*\/practice\/attempts/.test(c));

describe("practice calls are bound to the learner who began them", () => {
  it.each([
    ["before the server committed it", (h: Harness) => h.dropNext(/POST .*\/practice\/attempts/, 1)],
    ["after the server committed it but the reply was lost", (h: Harness) => h.loseNext(/POST .*\/practice\/attempts/, 1)],
  ])("A's practice answer whose delivery fails %s is not retried under B", async (_n, breakIt) => {
    const h = startApi();
    await twoLearners();
    const probe = await signedInAs(ADA);
    const item = await firstItem();
    const lessonBefore = (await api.exportData()) as { practiceAttempts: unknown[] };
    expect(lessonBefore.practiceAttempts).toHaveLength(0);
    breakIt(h);
    const outcome = api.practiceAttempt(crypto.randomUUID(), item.id, ANSWER).then(() => "sent", (e: ApiFailure) => e.code);
    await waitFor(() => expect(sentAttempts(h)).toHaveLength(1));
    await act(async () => probe().setMe(null)); // A signs out ...
    await act(async () => probe().setMe(await api.login(creds(BEN)))); // ... B signs in while the retry waits out its backoff
    await act(async () => void (await new Promise((r) => setTimeout(r, 1500))));
    expect(await outcome).toBe("aborted");
    expect(sentAttempts(h)).toHaveLength(1); // never re-dispatched
    await api.logout();
    expect((await practiceCount(BEN))).toEqual({ practice: 0, lesson: 0 }); // persisted data: nothing written to B
    // A's answer was recorded only if the server had committed it before the reply was lost.
    const a = await practiceCount(ADA);
    expect(a.practice).toBe(_n.startsWith("after") ? 1 : 0);
    expect(a.lesson).toBe(0); // practice never touches lesson attempts
  });

  it("the same learner's genuine practice retry recovers and is recorded exactly once", async () => {
    const h = startApi();
    await twoLearners();
    await api.login(creds(ADA));
    const item = await firstItem();
    h.loseNext(/POST .*\/practice\/attempts/, 1); // committed, reply lost
    const id = crypto.randomUUID();
    const r = await api.practiceAttempt(id, item.id, ANSWER);
    expect(r.attemptNumber).toBe(1);
    expect(sentAttempts(h)).toHaveLength(2);
    expect(((await api.exportData()) as { practiceAttempts: unknown[] }).practiceAttempts).toHaveLength(1);
    expect((await api.practiceAttempt(id, item.id, ANSWER)).replayed).toBe(true); // explicit replay is idempotent too
    expect(((await api.exportData()) as { practiceAttempts: unknown[] }).practiceAttempts).toHaveLength(1);
  });

  it("practice loads, hints and question generation in flight for A are cancelled when B signs in", async () => {
    const h = startApi();
    await twoLearners();
    const probe = await signedInAs(ADA);
    const item = await firstItem();
    const slow = [h.hold(/GET .*\/api\/practice$/), h.hold(/POST .*\/practice\/hint/), h.hold(/POST .*\/practice\/generate/)];
    const results = [
      api.practice(), api.practiceHint(item.id, 1), api.generate("t.g1.note-read"),
    ].map((p) => p.then(() => "done", (e: ApiFailure) => e.code));
    await waitFor(() => slow.forEach((s) => expect(s.seen()).toBe(1)));
    await act(async () => probe().setMe(null));
    await act(async () => probe().setMe(await api.login(creds(BEN))));
    slow.forEach((s) => s.release());
    expect(await Promise.all(results)).toEqual(["aborted", "aborted", "aborted"]);
    // a call begun after the change belongs to B and works normally
    expect((await api.practice()).sets.length).toBeGreaterThan(0);
  });
});

describe("Brief 02 hint and feedback announcements also hold in the practice lab", () => {
  it("hint region is persistent and polite, the button survives the last hint, and the verdict region stays mounted", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const { renderApp } = await import("./harness");
    const h = startApi();
    await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true, experience: "new" }) });
    const user = userEvent.setup();
    renderApp(`/practice/${SET}`);
    await screen.findByRole("heading", { level: 1 });
    const region = document.querySelector(".hint-list") as HTMLElement;
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    const verdict = document.querySelector(".feedback") as HTMLElement;
    expect(verdict).toHaveAttribute("role", "status");
    const btn = screen.getByRole("button", { name: "Need a hint?" });
    const slow = h.hold(/POST .*\/practice\/hint/);
    await user.click(btn);
    await user.click(btn); // a second tap while the first is still pending asks nothing more
    slow.release();
    await waitFor(() => expect(region).toHaveTextContent(/Hint 1:/));
    expect(h.calls.filter((c) => /POST .*\/practice\/hint/.test(c))).toHaveLength(1);
    expect(document.querySelector(".hint-list")).toBe(region);
    for (let i = 0; i < 6 && !screen.queryByRole("button", { name: "No more hints" }); i++) {
      await user.click(screen.getByRole("button", { name: "Another hint" }));
      await waitFor(() => expect(region.querySelectorAll("p").length).toBeGreaterThan(i + 1));
    }
    expect(screen.getByRole("button", { name: "No more hints" })).toBeInTheDocument(); // stays, so focus is not dropped
    expect(document.querySelector(".feedback")).toBe(verdict);
  });
});
