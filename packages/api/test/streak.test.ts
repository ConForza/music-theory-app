import { describe, expect, it } from "vitest";
import { computeStreak } from "../src/activity.ts";
import { addDays, daysBetween, isValidTimezone, localDate } from "../src/clock.ts";
import { Client, finishLesson, playThrough, register, setupClock, sharedCourse } from "./helpers.ts";

const course = sharedCourse();

describe("calendar days and timezones", () => {
  it("finds the learner-local date across midnight boundaries", () => {
    expect(localDate(new Date("2026-06-10T23:59:59-04:00"), "America/New_York")).toBe("2026-06-10");
    expect(localDate(new Date("2026-06-11T00:00:01-04:00"), "America/New_York")).toBe("2026-06-11");
    expect(localDate(new Date("2026-06-10T23:30:00Z"), "Pacific/Auckland")).toBe("2026-06-11");
  });

  it("handles the UK clocks going forward (a 23-hour day) and back (a 25-hour day)", () => {
    // 29 March 2026: 01:00 GMT becomes 02:00 BST.
    expect(localDate(new Date("2026-03-29T00:59:00Z"), "Europe/London")).toBe("2026-03-29");
    expect(localDate(new Date("2026-03-29T23:30:00Z"), "Europe/London")).toBe("2026-03-30"); // 00:30 BST on the 30th
    // 25 October 2026: 02:00 BST becomes 01:00 GMT.
    expect(localDate(new Date("2026-10-24T23:30:00Z"), "Europe/London")).toBe("2026-10-25"); // 00:30 BST
    expect(localDate(new Date("2026-10-25T23:30:00Z"), "Europe/London")).toBe("2026-10-25"); // 23:30 GMT: still the 25th
    expect(localDate(new Date("2026-10-26T00:00:00Z"), "Europe/London")).toBe("2026-10-26");
  });

  it("does day arithmetic on calendar dates, never on 24-hour blocks", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2); // leap year
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});

describe("streak (pure)", () => {
  const info = (dates: string[], today: string) => computeStreak(dates, today);
  it("counts consecutive days, once per day, and ignores duplicates", () => {
    expect(info(["2026-03-01", "2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03")).toMatchObject({ current: 3, longest: 3, activeToday: true, status: "active_today" });
  });
  it("keeps the streak alive until the end of the next day", () => {
    expect(info(["2026-03-01", "2026-03-02"], "2026-03-03")).toMatchObject({ current: 2, activeToday: false, status: "continuing", missedDays: 0 });
  });
  it("ends the streak after a missed day with a friendly, non-punitive message, and remembers the best run", () => {
    const s = info(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-06");
    expect(s).toMatchObject({ current: 0, longest: 3, status: "returning", missedDays: 2 });
    expect(s.message).toMatch(/Welcome back/);
    expect(s.message).not.toMatch(/lost|broke|failed|shame|punish|ruin/i);
  });
  it("recovers: a new run starts at one", () => {
    expect(info(["2026-03-01", "2026-03-02", "2026-03-06"], "2026-03-06")).toMatchObject({ current: 1, longest: 2 });
  });
  it("copes with activity dated after 'today' (travelling west) without breaking the run", () => {
    expect(info(["2026-03-02", "2026-03-03"], "2026-03-02")).toMatchObject({ current: 1, activeToday: true });
    expect(info(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-02")).toMatchObject({ current: 2, activeToday: true });
  });
  it("starts empty", () => {
    expect(info([], "2026-03-02")).toMatchObject({ current: 0, status: "none" });
  });
  it("counts days across the UK clock changes as consecutive", () => {
    expect(info(["2026-03-28", "2026-03-29", "2026-03-30"], "2026-03-30").current).toBe(3);
    expect(info(["2026-10-24", "2026-10-25", "2026-10-26"], "2026-10-26").current).toBe(3);
  });
});

async function setTimezone(c: Client, timezone: string) {
  const r = await c.call("PATCH", "/api/me/profile", { timezone });
  expect(r.status).toBe(200);
}
const engagement = async (c: Client) => (await c.get("/api/engagement")).body;

describe("daily goal and streak through the API", () => {
  it("a lesson completion counts toward the goal once per session, and reopening the app counts for nothing", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    expect((await engagement(c)).goal).toMatchObject({ enabled: true, target: 1, doneToday: 0, met: false });
    for (let i = 0; i < 3; i++) for (const p of ["/api/engagement", "/api/progress", "/api/me"]) await c.get(p);
    expect((await engagement(c)).goal.doneToday).toBe(0);
    await finishLesson(c);
    expect((await engagement(c)).goal).toMatchObject({ doneToday: 1, met: true });
    await c.post("/api/lessons/G1-U3-L03/complete"); // retried completion: same session, same credit
    expect((await engagement(c)).goal.doneToday).toBe(1);
    await playThrough(c, course); // a genuine second session the same day
    const e = await engagement(c);
    expect(e.goal.doneToday).toBe(2);
    expect(e.streak.current).toBe(1); // one streak day, however many sessions
  });

  it("lets the learner choose a larger goal or switch it off, and then shows no streak", async () => {
    const { client } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    expect((await c.call("PATCH", "/api/me/profile", { dailyGoal: 3 })).body.profile.dailyGoal).toBe(3);
    expect((await engagement(c)).goal).toMatchObject({ target: 3, met: false });
    expect((await c.call("PATCH", "/api/me/profile", { dailyGoal: 9 })).status).toBe(400);
    await c.call("PATCH", "/api/me/profile", { dailyGoal: 0 });
    const off = await engagement(c);
    expect(off.goal).toMatchObject({ enabled: false, target: 0 });
    expect(off.streak).toBeNull();
    // Activity is still recorded, so turning the goal back on restores the streak.
    await c.call("PATCH", "/api/me/profile", { dailyGoal: 1 });
    expect((await engagement(c)).streak.current).toBe(1);
  });

  it("builds a streak over days, ends it kindly after a gap, and recovers, without touching mastery or XP", async () => {
    const { client, clock } = setupClock();
    const c = client();
    await register(c);
    await finishLesson(c);
    clock.advanceDays(1);
    await playThrough(c, course);
    clock.advanceDays(1);
    await playThrough(c, course);
    expect((await engagement(c)).streak).toMatchObject({ current: 3, status: "active_today" });
    const xpBefore = (await engagement(c)).xp.total;
    const masteryBefore = (await c.get("/api/mastery/c.clefs.treble-lines")).body.state;
    clock.advanceDays(4);
    const gone = await engagement(c);
    expect(gone.streak).toMatchObject({ current: 0, longest: 3, status: "returning", missedDays: 3 });
    expect(gone.streak.message).toMatch(/Welcome back/);
    expect(gone.xp.total).toBe(xpBefore);
    expect((await c.get("/api/mastery/c.clefs.treble-lines")).body.highestState).toBe(masteryBefore === "review_due" ? "proficient" : masteryBefore);
    expect((await c.get("/api/progress")).body.nodes["G1-U3-L03"].state).toBe("completed");
    await playThrough(c, course);
    expect((await engagement(c)).streak).toMatchObject({ current: 1, longest: 3 });
  });

  it("counts calendar days across the UK clocks going forward and back, in the learner's timezone", async () => {
    for (const [zone, times] of [
      ["Europe/London", ["2026-03-28T23:30:00Z", "2026-03-29T12:00:00Z", "2026-03-29T23:30:00Z"]], // Sat 23:30, Sun 13:00 BST, Mon 00:30 BST
      ["Europe/London", ["2026-10-24T22:30:00Z", "2026-10-25T23:30:00Z", "2026-10-26T23:30:00Z"]], // 25-hour Sunday in the middle
    ] as const) {
      const { client, clock } = setupClock(times[0]);
      const c = client();
      await register(c);
      await setTimezone(c, zone);
      await finishLesson(c);
      for (const t of times.slice(1)) {
        clock.set(t);
        await playThrough(c, course);
      }
      expect((await engagement(c)).streak.current, `${zone} ${times[0]}`).toBe(3);
    }
  });

  it("splits days at the learner's local midnight, not at UTC midnight", async () => {
    const { client, clock } = setupClock("2026-06-10T23:30:00-04:00"); // 03:30Z on the 11th, still the 10th in New York
    const c = client();
    await register(c);
    await setTimezone(c, "America/New_York");
    await finishLesson(c);
    clock.set("2026-06-11T00:30:00-04:00");
    expect((await engagement(c)).goal.doneToday).toBe(0); // a new local day: the goal is fresh
    await playThrough(c, course);
    expect((await engagement(c)).streak.current).toBe(2);
  });

  it("keeps history when the timezone changes", async () => {
    const { client, clock } = setupClock("2026-03-02T12:00:00Z");
    const c = client();
    await register(c);
    await finishLesson(c); // 2 March in UTC
    await setTimezone(c, "Pacific/Auckland"); // now 3 March 01:00 there
    expect((await engagement(c)).today).toBe("2026-03-03");
    expect((await engagement(c)).streak).toMatchObject({ current: 1, status: "continuing" }); // 2 March is yesterday: nothing was rewritten
    await setTimezone(c, "Pacific/Honolulu"); // flying east: it is 2 March 02:00 there
    expect((await engagement(c)).today).toBe("2026-03-02");
    expect((await engagement(c)).streak).toMatchObject({ current: 1, activeToday: true });
    clock.advanceDays(1);
    await playThrough(c, course);
    expect((await engagement(c)).streak.current).toBe(2);
    expect((await c.call("PATCH", "/api/me/profile", { timezone: "Not/AZone" })).status).toBe(400);
  });

  it("uses the server's clock: a completion that straddles midnight keeps its original day, and a late retry adds nothing", async () => {
    const { client, clock } = setupClock("2026-06-10T23:59:00-04:00");
    const c = client();
    await register(c);
    await setTimezone(c, "America/New_York");
    const first = await finishLesson(c);
    clock.advanceMs(2 * 60_000); // the retry arrives at 00:01 the next day
    const retry = (await c.post("/api/lessons/G1-U3-L03/complete")).body;
    expect(retry.alreadyComplete).toBe(true);
    expect(retry.rewards.xp).toEqual(first.rewards.xp);
    const e = await engagement(c);
    expect(e.goal.doneToday).toBe(0);
    expect(e.streak).toMatchObject({ current: 1, status: "continuing" });
  });
});
