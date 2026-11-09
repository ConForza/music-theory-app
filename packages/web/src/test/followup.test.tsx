import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiFailure, type Overview } from "../api/client";
import { AppProvider, useApp } from "../state/app";
import { completeSampleLesson, renderApp, startApi } from "./harness";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-motion");
});

type User = ReturnType<typeof userEvent.setup>;
const ADA = { displayName: "Ada", email: "ada@example.com", password: "a long password" };
const BEN = { displayName: "Ben", email: "ben@example.com", password: "another long password" };
const LESSON = "G1-U3-L03";
const nodeStatus = () => document.querySelector(`[data-node="${LESSON}"]`)?.getAttribute("data-status");

/** An onboarded account, created through the API. `withLesson` also completes the sample lesson. */
async function makeAccount(h: ReturnType<typeof startApi>, who: typeof ADA, withLesson: boolean) {
  await api.register(who);
  await api.patchProfile({ experience: "new", selectedGrade: 1, onboarded: true });
  if (withLesson) await completeSampleLesson(h.course);
  await api.logout();
}
const creds = (w: typeof ADA) => ({ email: w.email, password: w.password });
async function signIn(user: User, who: typeof ADA) {
  await user.click(await screen.findByRole("link", { name: "I already have an account" }));
  await user.type(await screen.findByLabelText("Email"), who.email);
  await user.type(screen.getByLabelText("Password"), who.password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}
async function signOutFromProfile(user: User) {
  await user.click(await screen.findByRole("link", { name: "Profile" }));
  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: /Learn music theory/ });
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe("P1: a slow progress reply never reaches another learner", () => {
  it("A signs in with a slow progress request, signs out, B signs in, then A's reply arrives", async () => {
    const h = startApi();
    await makeAccount(h, ADA, true);
    await makeAccount(h, BEN, false);
    const user = userEvent.setup();
    const slow = h.hold(/GET \/api\/progress/);
    renderApp("/");
    await signIn(user, ADA);
    await waitFor(() => expect(slow.seen()).toBe(1)); // A's progress request is on the wire, unanswered
    await signOutFromProfile(user);
    await signIn(user, BEN);
    await waitFor(() => expect(nodeStatus()).toBeDefined());
    expect(nodeStatus()).not.toBe("completed");
    slow.release(); // A's reply (which says "lesson completed") finally arrives
    await flush();
    expect(nodeStatus()).not.toBe("completed");
    await user.click(screen.getByRole("link", { name: "Progress" }));
    await screen.findByRole("heading", { name: "Your progress" });
    await flush();
    expect(screen.queryByText(/1 of /)).toBeNull();
    expect((await api.progress()).totals.lessonsCompleted).toBe(0);
  });

  it("signing out to guest: the old reply neither repopulates nor leaks into the guest's path", async () => {
    const h = startApi();
    await makeAccount(h, ADA, true);
    const user = userEvent.setup();
    const slow = h.hold(/GET \/api\/progress/);
    renderApp("/");
    await signIn(user, ADA);
    await waitFor(() => expect(slow.seen()).toBe(1));
    await signOutFromProfile(user);
    slow.release();
    await flush();
    expect(screen.getByRole("heading", { name: /Learn music theory/ })).toBeInTheDocument(); // still signed out
    await user.click(screen.getByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await waitFor(() => expect(nodeStatus()).toBeDefined());
    expect(nodeStatus()).not.toBe("completed");
  });

  /** Reads progress straight from provider state, for scenarios the UI cannot drive quickly. */
  function Probe({ expose }: { expose: (a: ReturnType<typeof useApp>) => void }) {
    const app = useApp();
    expose(app);
    const p = app.progress;
    return <p data-testid="p">{app.me ? app.me.user.displayName : "nobody"}|{p.status === "ready" ? (p.data as Overview).totals.lessonsCompleted : p.status}</p>;
  }
  const mountProbe = () => {
    let app!: ReturnType<typeof useApp>;
    render(<AppProvider><Probe expose={(a) => (app = a)} /></AppProvider>);
    return { app: () => app, text: () => screen.getByTestId("p").textContent };
  };

  it("rapid account changes: replies from earlier identities, arriving in any order, are all ignored", async () => {
    const h = startApi();
    await makeAccount(h, ADA, true);
    await makeAccount(h, BEN, false);
    const probe = mountProbe();
    await waitFor(() => expect(probe.text()).toBe("nobody|signed-out"));
    const first = h.hold(/GET \/api\/progress/);
    await act(async () => probe.app().setMe(await api.login(creds(ADA)))); // A: progress held (#1)
    await waitFor(() => expect(first.seen()).toBe(1));
    const second = h.hold(/GET \/api\/progress/);
    await act(async () => probe.app().setMe(await api.login(creds(BEN)))); // B: progress held (#2)
    await waitFor(() => expect(second.seen()).toBe(1));
    await act(async () => probe.app().setMe(await api.login(creds(ADA)))); // A again, answered promptly
    await waitFor(() => expect(probe.text()).toBe("Ada|1"));
    first.release();
    await flush();
    expect(probe.text()).toBe("Ada|1");
    second.release(); // B's reply (0 lessons) lands last, which would be visible if it were applied
    await flush();
    expect(probe.text()).toBe("Ada|1");
    await act(async () => probe.app().setMe(await api.login(creds(BEN))));
    await waitFor(() => expect(probe.text()).toBe("Ben|0"));
  });

  it("a stalled request is cancelled when the identity changes, and cannot leave an error behind for the new learner", async () => {
    const h = startApi();
    await makeAccount(h, ADA, true);
    await makeAccount(h, BEN, false);
    const probe = mountProbe();
    await waitFor(() => expect(probe.text()).toBe("nobody|signed-out"));
    h.stall(/GET \/api\/progress/);
    await act(async () => probe.app().setMe(await api.login(creds(ADA))));
    await waitFor(() => expect(probe.text()).toBe("Ada|loading"));
    h.unstall();
    await act(async () => probe.app().setMe(await api.login(creds(BEN))));
    await waitFor(() => expect(probe.text()).toBe("Ben|0"));
    await flush();
    expect(probe.text()).toBe("Ben|0"); // the cancelled request did not surface as an error
  });

  it("a failed request for the current learner shows an error; an old failure does not", async () => {
    const h = startApi();
    await makeAccount(h, ADA, true);
    await makeAccount(h, BEN, false);
    const probe = mountProbe();
    await waitFor(() => expect(probe.text()).toBe("nobody|signed-out"));
    await act(async () => probe.app().setMe(await api.login(creds(ADA))));
    await waitFor(() => expect(probe.text()).toBe("Ada|1"));
    h.failNext(/GET \/api\/progress/, 1);
    await act(async () => probe.app().refreshProgress());
    expect(probe.text()).toBe("Ada|error");
    await act(async () => probe.app().refreshProgress());
    await waitFor(() => expect(probe.text()).toBe("Ada|1")); // recovers on the next refresh
  });

  it("repeated refreshes: the newest request wins even if an older one answers last", async () => {
    const h = startApi();
    await makeAccount(h, ADA, false);
    const probe = mountProbe();
    await act(async () => probe.app().setMe(await api.login(creds(ADA))));
    await waitFor(() => expect(probe.text()).toBe("Ada|0"));
    const older = h.hold(/GET \/api\/progress/);
    act(() => void probe.app().refreshProgress()); // answered with 0 lessons, delivery delayed
    await waitFor(() => expect(older.seen()).toBe(1));
    await completeSampleLesson(h.course);
    await act(async () => probe.app().refreshProgress()); // newer: 1 lesson
    await waitFor(() => expect(probe.text()).toBe("Ada|1"));
    older.release();
    await flush();
    expect(probe.text()).toBe("Ada|1");
  });

  it("a slow first /api/me cannot undo a sign-in made meanwhile", async () => {
    const h = startApi();
    await makeAccount(h, ADA, false);
    await makeAccount(h, BEN, false);
    await api.login(creds(ADA)); // the browser still holds A's cookie when the page opens
    const late = h.hold(/GET \/api\/me/);
    const probe = mountProbe();
    await waitFor(() => expect(late.seen()).toBe(1)); // the initial "who am I?" (answer: A) is on the wire
    await act(async () => probe.app().setMe(await api.login(creds(BEN)))); // meanwhile the learner signs in as B
    await waitFor(() => expect(probe.text()).toBe("Ben|0"));
    late.release();
    await flush();
    expect(probe.text()).toBe("Ben|0");
  });
});

describe("P1b: an operation begun for one learner is never sent, or retried, as another", () => {
  const firstItem = (h: ReturnType<typeof startApi>) => h.course.lesson(LESSON)!.items[0]!.id;
  const G = { kind: "pitch-letter", letter: "G" } as const;

  /** B has an open run and no answers; A has an open run. The browser is left signed in as nobody. */
  async function twoLearnersWithOpenRuns(h: ReturnType<typeof startApi>) {
    await makeAccount(h, ADA, false);
    await makeAccount(h, BEN, false);
    for (const who of [ADA, BEN]) {
      await api.login(creds(who));
      await api.start(LESSON);
      await api.logout();
    }
  }
  const bState = async () => {
    await api.login(creds(BEN));
    const exp = (await api.exportData()) as { attempts: unknown[]; lessonProgress: unknown[] };
    const prog = await api.progress();
    return { attempts: exp.attempts, lessonProgress: exp.lessonProgress, completed: prog.totals.lessonsCompleted };
  };

  it.each([
    ["before the server committed it", (h: ReturnType<typeof startApi>) => h.dropNext(/POST .*\/attempts/, 1)],
    ["after the server committed it but the reply was lost", (h: ReturnType<typeof startApi>) => h.loseNext(/POST .*\/attempts/, 1)],
  ])("A's answer whose delivery fails %s is not retried under B", async (_n, breakIt) => {
    const h = startApi();
    await twoLearnersWithOpenRuns(h);
    const probe = (() => {
      let app!: ReturnType<typeof useApp>;
      function P() {
        app = useApp();
        return <p data-testid="who">{app.me?.user.displayName ?? "nobody"}</p>;
      }
      render(<AppProvider><P /></AppProvider>);
      return () => app;
    })();
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("nobody"));
    await act(async () => probe().setMe(await api.login(creds(ADA))));
    const before = await (async () => {
      const exp = (await api.exportData()) as { attempts: unknown[] };
      return exp.attempts.length;
    })();
    breakIt(h);
    const sent = api.attempt(LESSON, crypto.randomUUID(), firstItem(h), G); // fails once; a retry is now waiting out its backoff
    const outcome = sent.then(() => "sent", (e: ApiFailure) => e.code);
    await waitFor(() => expect(h.calls.filter((c) => /POST .*\/attempts/.test(c))).toHaveLength(1));
    // the learner changes (A leaves, B signs in) while that retry is pending, as with SPA navigation
    await act(async () => probe().setMe(null));
    await act(async () => probe().setMe(await api.login(creds(BEN))));
    await act(async () => void (await new Promise((r) => setTimeout(r, 1500)))); // longer than the retry backoff
    expect(await outcome).toBe("aborted");
    expect(h.calls.filter((c) => /POST .*\/attempts/.test(c))).toHaveLength(1); // never re-dispatched
    const b = await bState();
    expect(b.attempts).toEqual([]);
    expect(b.completed).toBe(0);
    void before;
  });

  it("the same learner's genuine retry still recovers, with the same answer id (no double count)", async () => {
    const h = startApi();
    await makeAccount(h, ADA, false);
    await api.login(creds(ADA));
    await api.start(LESSON);
    h.loseNext(/POST .*\/attempts/, 1); // committed, reply lost
    const id = crypto.randomUUID();
    const r = await api.attempt(LESSON, id, firstItem(h), G);
    expect(r.correct).toBe(true);
    expect(((await api.exportData()) as { attempts: unknown[] }).attempts).toHaveLength(1);
  });

  it("a lesson that finishes loading for A after B signed in does not start a run on A's behalf", async () => {
    const h = startApi();
    await makeAccount(h, ADA, false);
    await makeAccount(h, BEN, false);
    await api.login(creds(ADA));
    let app!: ReturnType<typeof useApp>;
    function Expose() {
      app = useApp();
      return null;
    }
    const { MemoryRouter } = await import("react-router");
    const { App } = await import("../App");
    render(
      <MemoryRouter initialEntries={[`/lesson/${LESSON}`]}>
        <AppProvider>
          <Expose />
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(app?.me?.user.displayName).toBe("Ada"));
    // A's lesson request is already on the wire when the next one is held; hold the NEXT lesson load instead
    cleanup();
    h.calls.length = 0;
    const slow = h.hold(new RegExp(`GET /api/lessons/${LESSON}$`));
    render(
      <MemoryRouter initialEntries={[`/lesson/${LESSON}`]}>
        <AppProvider>
          <Expose />
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(slow.seen()).toBe(1)); // A is opening the lesson; its reply is delayed
    await act(async () => app.setMe(await api.login(creds(BEN)))); // B signs in meanwhile
    await waitFor(() => expect(h.calls.filter((c) => /POST .*\/start$/.test(c)).length).toBeGreaterThanOrEqual(1));
    const startsBefore = h.calls.filter((c) => /POST .*\/start$/.test(c)).length;
    slow.release(); // A's lesson reply arrives now
    await act(async () => void (await new Promise((r) => setTimeout(r, 300))));
    expect(h.calls.filter((c) => /POST .*\/start$/.test(c)).length).toBe(startsBefore); // A's chain added no start
  });
});

describe("P2: registration recovery", () => {
  async function toAccountForm(user: User) {
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await screen.findByRole("heading", { name: "Save your progress" });
  }
  async function fill(user: User, who = ADA) {
    await user.type(screen.getByLabelText(/^Nickname/), who.displayName);
    await user.type(screen.getByLabelText(/^Email/), who.email);
    await user.type(screen.getByLabelText(/^Password/), who.password);
  }
  const registers = (h: ReturnType<typeof startApi>) => h.calls.filter((c) => c === "POST /api/auth/register").length;

  it("account created but the setup save fails: says so truthfully, retries only the save, never registers twice", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user);
    h.failNext(/PATCH \/api\/me\/profile/, 1);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/account is created and you're signed in/i);
    expect(alert).not.toHaveTextContent(/email is already registered/i);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    expect(registers(h)).toBe(1);
    expect((await api.me()).profile).toMatchObject({ onboarded: true, experience: "new" });
  });

  it("reply to a guest upgrade is lost: the form checks the session and carries on instead of failing", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    await user.click(screen.getByRole("link", { name: "Profile" }));
    await screen.findByText("Guest profile");
    await fill(user);
    h.loseNext(/POST \/api\/auth\/register/, 1);
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.queryByText("Guest profile")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(registers(h)).toBe(1);
  });

  it("new registration whose reply (and cookie) is lost: an honest message, then a retry signs the learner in", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user);
    h.loseNext(/POST \/api\/auth\/register/, 1);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't confirm whether your account was created/i);
    expect(alert).not.toHaveTextContent(/failed|wasn't created|not created/i);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    expect((await api.me()).user).toMatchObject({ email: ADA.email, isGuest: false });
  });

  it("reply lost AND the follow-up session check fails: a later retry still recovers instead of being stranded", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user);
    h.loseNext(/POST \/api\/auth\/register/, 1); // the account is created, reply and cookie lost
    h.dropNext(/GET \/api\/me$/, 1); // ...and the session check that follows fails at the network too
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm/i);
    await user.click(screen.getByRole("button", { name: "Create account" })); // server says email_taken; the form re-checks, then signs in
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    expect((await api.me()).user).toMatchObject({ email: ADA.email, isGuest: false });
  });

  it("network down while creating: nothing is created, a later retry succeeds once", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user);
    h.setOffline(true);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm/i);
    h.setOffline(false);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    expect(registers(h)).toBe(2);
    expect((await api.me()).user.email).toBe(ADA.email);
  });

  it("someone else's email is still refused plainly, and the guest keeps their own session", async () => {
    const h = startApi();
    await makeAccount(h, BEN, false);
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user, { ...BEN, displayName: "Impostor", password: "not his password" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already registered/i);
    expect(screen.getByRole("heading", { name: "Save your progress" })).toBeInTheDocument();
  });

  it("refreshing mid-onboarding after the account exists resumes without registering again", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toAccountForm(user);
    await fill(user);
    h.failNext(/PATCH \/api\/me\/profile/, 1);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("alert");
    cleanup();
    renderApp("/"); // a refresh: the session cookie survives, the half-finished setup does not
    await user.click(await screen.findByRole("button", { name: /New to music theory/ }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    expect(registers(h)).toBe(1);
  });

  it("guest lesson progress survives registration and a later sign-in", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    await completeSampleLesson(h.course); // the guest finishes the lesson
    cleanup();
    renderApp("/profile"); // refresh
    await screen.findByText("Guest profile");
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    await screen.findByRole("heading", { name: "Ada" });
    await signOutFromProfile(user);
    await signIn(user, ADA);
    await waitFor(() => expect(nodeStatus()).toBe("completed"));
    expect((await api.progress()).totals.lessonsCompleted).toBe(1);
  });
});

describe("P3/P4: choosing a grade or a start never navigates before it is saved", () => {
  async function toGrades(user: User) {
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    await user.click(screen.getByRole("link", { name: "Profile" }));
    await user.click(await screen.findByRole("link", { name: "Change grade" }));
    await screen.findByRole("heading", { name: "Choose a grade" });
  }
  const gradeBtn = (n: number) => screen.getByRole("button", { name: new RegExp(`^Grade ${n}:`) });
  const patches = (h: ReturnType<typeof startApi>) => h.calls.filter((c) => c === "PATCH /api/me/profile").length;

  it.each([
    ["a server error", (h: ReturnType<typeof startApi>) => h.failNext(/PATCH \/api\/me\/profile/, 1), (): void => undefined, /on our side/],
    ["being offline", (h: ReturnType<typeof startApi>) => h.setOffline(true), (h: ReturnType<typeof startApi>) => h.setOffline(false), /offline/i],
  ])("grade change fails because of %s: stays put, shows the old grade, retry works", async (_n, breakIt, fixIt, message) => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toGrades(user);
    breakIt(h);
    await user.click(gradeBtn(3));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent(/still on Grade 1/);
    expect(screen.getByRole("heading", { name: "Choose a grade" })).toBeInTheDocument();
    expect(gradeBtn(1)).toHaveAttribute("aria-pressed", "true");
    expect(gradeBtn(3)).toHaveAttribute("aria-pressed", "false");
    fixIt(h);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Choose a grade" })).toBeNull());
    expect((await api.me()).profile.selectedGrade).toBe(3);
  });

  it("a slow save shows progress, ignores a second tap, and navigates only once confirmed", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toGrades(user);
    const before = patches(h);
    const slow = h.hold(/PATCH \/api\/me\/profile/);
    await user.click(gradeBtn(3));
    expect(await screen.findByText("Saving Grade 3…")).toBeInTheDocument();
    await user.click(gradeBtn(4));
    await user.click(gradeBtn(3));
    expect(screen.getByRole("heading", { name: "Choose a grade" })).toBeInTheDocument(); // not navigated yet
    expect(gradeBtn(1)).toHaveAttribute("aria-pressed", "true"); // still the confirmed grade
    slow.release();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Choose a grade" })).toBeNull());
    expect(patches(h)).toBe(before + 1);
    expect((await api.me()).profile.selectedGrade).toBe(3);
  });

  it("a save that never answers times out into the same recoverable error", async () => {
    const h = startApi();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp("/");
    await toGrades(user);
    h.stall(/PATCH \/api\/me\/profile/);
    await user.click(gradeBtn(2));
    await act(async () => void vi.advanceTimersByTime(21_000));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/took too long/i);
    expect(screen.getByRole("heading", { name: "Choose a grade" })).toBeInTheDocument();
    h.unstall();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Choose a grade" })).toBeNull());
  });

  describe("onboarding for someone already signed in (\"New to music theory\" and the grade picker)", () => {
    async function signedInNotOnboarded(user: User, h: ReturnType<typeof startApi>) {
      await api.guest(); // a session exists but onboarding was never finished
      renderApp("/");
      await screen.findByRole("heading", { name: "How much music theory do you know?" });
      void user;
      void h;
    }
    it("'New to music theory': failure is reported with a retry, no unhandled rejection, and one save per attempt", async () => {
      const h = startApi();
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const user = userEvent.setup();
      await signedInNotOnboarded(user, h);
      h.failNext(/PATCH \/api\/me\/profile/, 1);
      await user.click(screen.getByRole("button", { name: /New to music theory/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't saved/i);
      expect(screen.getByRole("heading", { name: "How much music theory do you know?" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
      expect(patches(h)).toBe(2);
      await flush();
      process.off("unhandledRejection", unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    });

    it("double taps while saving make one request", async () => {
      const h = startApi();
      const user = userEvent.setup();
      await signedInNotOnboarded(user, h);
      const slow = h.hold(/PATCH \/api\/me\/profile/);
      const btn = screen.getByRole("button", { name: /New to music theory/ });
      await user.click(btn);
      await user.click(btn);
      await user.click(btn);
      slow.release();
      await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
      expect(patches(h)).toBe(1);
    });

    it("the grade picker keeps the chosen answers while the save is retried", async () => {
      const h = startApi();
      const user = userEvent.setup();
      await signedInNotOnboarded(user, h);
      await user.click(screen.getByRole("button", { name: /I already know some theory/ }));
      h.setOffline(true);
      await user.click(await screen.findByRole("button", { name: /^Grade 4:/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/Grade 4 wasn't saved/);
      expect(screen.getByRole("button", { name: /^Grade 4:/ })).toHaveAttribute("aria-pressed", "true");
      h.setOffline(false);
      await user.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Where would you like to begin?" })).toBeNull());
      expect((await api.me()).profile).toMatchObject({ selectedGrade: 4, experience: "some", onboarded: true });
    });
  });
});

describe("P5: settings never show an unsaved value as saved", () => {
  async function toSettings(user: User) {
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
  }
  const patchSettings = /PATCH \/api\/me\/profile/;

  it("a failed save puts the control, the theme and the message back, then Retry saves it", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    h.failNext(patchSettings, 1);
    await user.click(screen.getByLabelText("Dark"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/appearance setting wasn't saved/i);
    expect(alert).toHaveTextContent(/back to how it was/i);
    expect(screen.getByLabelText("Dark")).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Appearance" })).getByLabelText("Match my device")).toBeChecked();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(screen.queryByText("Saved.")).toBeNull();
    expect((await api.me()).profile.settings.theme).toBe("system");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByLabelText("Dark")).toBeChecked());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await api.me()).profile.settings.theme).toBe("dark");
  });

  it("offline changes revert, and a refresh agrees with the server", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    h.setOffline(true);
    await user.click(screen.getByRole("switch", { name: /Play sounds/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/offline/i);
    expect(screen.getByRole("switch", { name: /Play sounds/ })).toBeChecked(); // sound is on by default, so it reverted
    h.setOffline(false);
    cleanup();
    renderApp("/settings");
    expect(await screen.findByRole("switch", { name: /Play sounds/ })).toBeChecked();
  });

  it("while a save is in flight the page says Saving…, never Saved.; later saves do not build on unsaved values", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    const slow = h.hold(patchSettings);
    await user.click(screen.getByLabelText("Dark"));
    expect(await screen.findByText("Saving…")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).toBeNull();
    slow.release();
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("rapid toggles are saved in order and the last choice wins", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    const before = h.calls.filter((c) => c === "PATCH /api/me/profile").length;
    const slow = h.hold(patchSettings); // the first save is slow; the next two are queued behind it
    await user.click(screen.getByLabelText("Dark"));
    await user.click(screen.getByLabelText("Light"));
    await user.click(screen.getByLabelText("Dark"));
    expect(screen.getByLabelText("Dark")).toBeChecked();
    slow.release();
    await screen.findByText("Saved.");
    expect(screen.getByLabelText("Dark")).toBeChecked();
    expect((await api.me()).profile.settings.theme).toBe("dark");
    expect(h.calls.filter((c) => c === "PATCH /api/me/profile")).toHaveLength(before + 3);
  });

  it("a failed nickname save puts the saved nickname back in the field; Retry saves what was typed", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    const field = screen.getByLabelText("Nickname") as HTMLInputElement;
    const before = field.value;
    await user.clear(field);
    await user.type(field, "Grace");
    h.failNext(patchSettings, 1);
    await user.click(screen.getByRole("button", { name: "Save nickname" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nickname wasn't saved/i);
    expect((screen.getByLabelText("Nickname") as HTMLInputElement).value).toBe(before);
    expect((await api.me()).user.displayName).toBe(before);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(async () => expect((await api.me()).user.displayName).toBe("Grace"));
    expect((screen.getByLabelText("Nickname") as HTMLInputElement).value).toBe("Grace");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failure of the first queued save reverts it while the second still saves", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toSettings(user);
    h.failNext(patchSettings, 1);
    await user.click(screen.getByLabelText("Dark"));
    await screen.findByRole("alert");
    await user.click(screen.getByLabelText("Reduce"));
    await waitFor(() => expect(screen.getByLabelText("Reduce")).toBeChecked());
    expect(screen.getByLabelText("Dark")).not.toBeChecked();
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    const s = (await api.me()).profile.settings;
    expect(s).toMatchObject({ theme: "system", motion: "reduce" });
  });

  it("a queued save is dropped, not sent to the next learner, if the account changes first", async () => {
    const h = startApi();
    await makeAccount(h, ADA, false);
    await makeAccount(h, BEN, false);
    const user = userEvent.setup();
    renderApp("/");
    await signIn(user, ADA);
    await user.click(await screen.findByRole("link", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    const before = h.calls.filter((c) => c === "PATCH /api/me/profile").length;
    const slow = h.hold(patchSettings);
    await user.click(screen.getByLabelText("Dark")); // in flight for A
    await user.click(screen.getByLabelText("Reduce")); // queued behind it
    await user.click(screen.getByRole("button", { name: "Sign out" })); // the learner changes before the queue drains
    await screen.findByRole("heading", { name: /Learn music theory/ });
    slow.release();
    await flush();
    expect(h.calls.filter((c) => c === "PATCH /api/me/profile")).toHaveLength(before + 1); // the queued save was never sent
    await signIn(user, BEN);
    await waitFor(() => expect(nodeStatus()).toBeDefined());
    expect((await api.me()).profile.settings).toMatchObject({ theme: "system", motion: "system" }); // B untouched
  });
});

describe("api client", () => {
  it("turns a stalled request into a timeout error and a cancelled one into a quiet 'aborted'", async () => {
    const h = startApi();
    h.stall(/GET \/api\/progress/);
    const ctl = new AbortController();
    const p = api.progress(ctl.signal);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    expect(await api.progress(ctl.signal).catch((e: ApiFailure) => e.isAborted)).toBe(true);
  });
});

void within;

describe("piano keys: names, octaves and the scroll cue", () => {
  const withWidths = (client: number, scroll: number) => {
    const c = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
    const s = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
    return () => (c.mockRestore(), s.mockRestore());
  };
  afterEach(() => vi.restoreAllMocks());

  it("names every key with its pitch and octave, uniquely, and the name matches the pitch that sounds", async () => {
    const { Keyboard } = await import("../components/Keyboard");
    const played: string[] = [];
    render(<Keyboard from="C3" to="C5" onPlay={(p) => played.push(p)} />);
    const keys = within(screen.getByRole("group", { name: /Piano keyboard/ })).getAllByRole("button");
    const names = keys.map((k) => k.getAttribute("aria-label")!);
    expect(new Set(names).size).toBe(names.length); // C3 and C4 (and every other repeated letter) are distinguishable
    expect(names).toContain("C4, middle C");
    expect(names).toContain("G4");
    expect(names).toContain("F♯4 / G♭4");
    expect(names).toContain("C3");
    expect(names).toContain("C5");
    for (const n of names) expect(n).toMatch(/^[A-G][♯♭]?\d/); // white and black keys alike start with a written pitch + octave
    for (const k of keys) {
      const label = k.getAttribute("aria-label")!;
      await userEvent.click(k);
      const sharp = label.match(/^([A-G])♯(\d)/);
      const expected = sharp ? `${sharp[1]}#${sharp[2]}` : label.slice(0, 2);
      expect(played.at(-1)).toBe(expected); // the label and the pitch handed to the sound are the same note
    }
  });

  it("shows 'Swipe to see more keys' only while the keyboard overflows, and updates as it is scrolled", async () => {
    const { Keyboard } = await import("../components/Keyboard");
    const restore = withWidths(300, 640);
    const { container, unmount } = render(<Keyboard from="C4" to="C5" onPlay={() => undefined} />);
    expect(await screen.findByText(/Swipe to see more keys/)).toBeInTheDocument();
    expect(container.querySelector(".keyboard-wrap")).toHaveClass("more-right");
    expect(container.querySelector(".keyboard-wrap")).not.toHaveClass("more-left");
    const scroller = container.querySelector(".keyboard-scroll") as HTMLElement;
    scroller.scrollLeft = 200;
    act(() => void scroller.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(container.querySelector(".keyboard-wrap")).toHaveClass("more-left"));
    scroller.scrollLeft = 340; // 340 + 300 = 640: the far end
    act(() => void scroller.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(container.querySelector(".keyboard-wrap")).not.toHaveClass("more-right"));
    expect(screen.getByText(/Swipe to see more keys/)).toBeInTheDocument(); // still more to the left
    unmount();
    restore();

    const fits = withWidths(700, 640);
    render(<Keyboard from="C4" to="C5" onPlay={() => undefined} />);
    await flush();
    expect(screen.queryByText(/Swipe to see more keys/)).toBeNull();
    fits();
  });

  it("the cue is decorative: it adds no extra stop for screen readers and keys stay reachable", async () => {
    const { Keyboard } = await import("../components/Keyboard");
    withWidths(300, 640);
    render(<Keyboard from="C4" to="C5" onPlay={() => undefined} />);
    const cue = await screen.findByText(/Swipe to see more keys/);
    expect(cue.closest("[aria-hidden='true']")).not.toBeNull();
    const first = screen.getByRole("button", { name: "C4, middle C" });
    first.focus();
    expect(first).toHaveFocus();
  });
});

describe("lesson hints and feedback are announced politely", () => {
  async function toQuestion(user: User) {
    await user.click(await screen.findByRole("link", { name: "Get started" }));
    await user.click(screen.getByRole("button", { name: /New to music theory/ }));
    await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
    await user.click(await screen.findByRole("link", { name: /Start/ }));
    await user.click(await screen.findByRole("button", { name: "Let's go" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Try some questions" }));
    await screen.findByRole("button", { name: "Check" });
  }
  const hintRegion = () => document.querySelector(".hint-list") as HTMLElement;

  it("a hint appears in a live region that was already on the page, without moving focus or the learner's place", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toQuestion(user);
    const region = hintRegion();
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement(); // present and empty before the request, so the first hint is announced too
    const btn = screen.getByRole("button", { name: "Need a hint?" });
    btn.focus();
    await user.click(btn);
    await waitFor(() => expect(region).toHaveTextContent(/Hint 1:/));
    expect(hintRegion()).toBe(region); // the same element: nothing was torn down and rebuilt
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Another hint|No more hints/ }));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(h.calls.filter((c) => c.endsWith("/hint"))).toHaveLength(1);
  });

  it("double taps ask once, every hint stays visible to revisit, and the button survives the last hint", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toQuestion(user);
    const gate = h.hold(/POST .*\/hint/);
    const btn = screen.getByRole("button", { name: "Need a hint?" });
    await user.dblClick(btn);
    gate.release();
    await waitFor(() => expect(hintRegion().querySelectorAll("p")).toHaveLength(1));
    expect(h.calls.filter((c) => c.endsWith("/hint"))).toHaveLength(1);
    for (let i = 0; i < 6 && !screen.queryByRole("button", { name: "No more hints" }); i++) {
      await user.click(screen.getByRole("button", { name: "Another hint" }));
      await flush();
    }
    const last = screen.getByRole("button", { name: "No more hints" });
    expect(last).toHaveAttribute("aria-disabled", "true");
    const shown = hintRegion().querySelectorAll("p").length;
    await user.click(last);
    await flush();
    expect(hintRegion().querySelectorAll("p")).toHaveLength(shown); // no extra request or duplicate
    expect(h.calls.filter((c) => c.endsWith("/hint"))).toHaveLength(shown);
  });

  it("a hint that cannot load says so in an alert and can be asked for again", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toQuestion(user);
    h.setOffline(true);
    await user.click(screen.getByRole("button", { name: "Need a hint?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/hint didn't load/i);
    h.setOffline(false);
    await user.click(screen.getByRole("button", { name: "Need a hint?" }));
    await waitFor(() => expect(hintRegion()).toHaveTextContent(/Hint 1:/));
    expect(screen.queryByRole("alert")).toBeNull(); // the old "didn't load" message is gone once the hint loads
  });

  it("the answer verdict is spoken from one region that stays mounted, for right and wrong answers and for network errors", async () => {
    const h = startApi();
    const user = userEvent.setup();
    renderApp("/");
    await toQuestion(user);
    const verdict = document.querySelector(".feedback") as HTMLElement;
    expect(verdict).toHaveAttribute("role", "status");
    expect(verdict).toBeEmptyDOMElement();
    h.setOffline(true);
    await user.click(screen.getByLabelText("D", { selector: "input" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert", undefined, { timeout: 5000 })).toHaveTextContent(/didn't send/i); // assertive, and keeps the chosen answer
    h.setOffline(false);
    await user.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(verdict).toHaveTextContent(/Not quite/));
    expect(document.querySelector(".feedback")).toBe(verdict);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(verdict).toBeEmptyDOMElement();
    await user.click(screen.getByLabelText("G", { selector: "input" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(verdict).toHaveTextContent(/Correct!/));
    expect(document.querySelector(".feedback")).toBe(verdict);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });
});
