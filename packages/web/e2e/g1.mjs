// Brief 05 real-browser verification of the Grade 1 course. The server runs in this process with the real content and a
// controllable clock; the learner's actions go through the real controls. Covers: a new account, the first lesson (with a
// wrong answer and its explanation), XP, a unit's practice, review and challenge, resuming after interruption, delayed
// revision with the test clock, the Grade 1 assessment (a below-pass-mark result, then a retake that passes), and the
// responsive / accessibility / preference matrix.
// Run: npm run build && node --import tsx e2e/g1.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, finishViaApi, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, playReviewInBrowser, post, serve, shot } from "./g1lib.mjs";
import { canonicalResponse } from "@mtp/engine";

const S = await serve();
const browser = await chromium.launch();
const log = console.log;
let failures = 0;
const test = async (name, fn) => {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    await fn();
    log("✓", name);
  } catch (e) {
    failures++;
    log("✗", name, "-", e.message.split("\n").slice(0, 6).join(" | "));
  }
};
const ctxFor = (p, extra = {}) => browser.newContext({ ...p, baseURL: S.base, ...extra });

const profiles = {
  iphone: devices["iPhone 14"],
  "phone-320": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "ipad-portrait": { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "ipad-landscape": { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

await test("new learner: signs up, starts at Unit 1, later lessons are locked, first lesson teaches and rewards", async () => {
  const ctx = await ctxFor(profiles.iphone, { reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForURL("**/welcome");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.getByLabel("Nickname").fill("Ada");
  await page.getByLabel("Email").fill(`g1-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a long safe password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/learn");
  await page.locator('[data-node="G1-U1-L01"]').waitFor();
  assert.equal(await page.locator('[data-node="G1-U1-L01"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G1-U1-L02"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator('[data-node="G1-U3-L03"]').getAttribute("data-status"), "locked");
  await noOverflow(page, "path");
  await axe(page, "path");
  await shot(page, "g1-01-path-new-learner");
  await page.locator('[data-node="G1-U1-L02"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G1-U1-L02"]').click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "g1-02-locked-node-explains");
  await page.keyboard.press("Escape");
  // lesson 1: teaching screens, a wrong answer with a specific explanation, completion with XP
  const taught = [];
  await playLessonInBrowser(page, S, "G1-U1-L01", {
    wrongAt: 1,
    afterTeach: async (p) => {
      await noOverflow(p, "teach");
      await axe(p, "teach");
      await shot(p, "g1-03-teach");
    },
    afterDemo: async (p) => {
      await p.getByRole("button", { name: /Play all/ }).click();
      await noOverflow(p, "demo");
      await shot(p, "g1-04-demo-rhythm");
    },
    afterWrong: async (p) => {
      await shot(p, "g1-05-wrong-answer-explained");
      taught.push(await p.locator(".feedback").innerText());
    },
  });
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText(/\+10 XP|10 XP/).first().waitFor();
  await noOverflow(page, "lesson complete");
  await axe(page, "lesson complete");
  await shot(page, "g1-06-lesson-complete");
  assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G1-U1-L01"].state, "completed");
  assert.equal(prog.nodes["G1-U1-L02"].state, "available");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("a unit end to end: practice (with a hint), review, and a challenge with a wrong first answer; XP once each; revision due later", async () => {
  const ctx = await ctxFor(profiles.iphone);
  const { page, userId } = await guest(ctx);
  await finishViaApi(S, page, userId, "G1-U1-L06");
  // practice with a hint and a wrong answer
  await page.goto("/lesson/G1-U1-P1");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list p").first().waitFor();
  await shot(page, "g1-07-practice-hint");
  await playNodeInBrowser(page, S, userId, "G1-U1-P1", { wrong: 1 });
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();
  await shot(page, "g1-08-practice-complete");
  await playNodeInBrowser(page, S, userId, "G1-U1-R1");
  await page.getByRole("heading", { name: "Review complete" }).waitFor();
  const before = (await get(page, "/api/xp")).total;
  // challenge: first answers are final; two wrong answers are tolerated by the 70% pass mark
  await playNodeInBrowser(page, S, userId, "G1-U1-C", {
    wrong: 2,
    afterWrong: async (p, n) => {
      if (n === 1) {
        assert.equal(await p.getByRole("button", { name: "Try again" }).count(), 0, "no retry in a challenge");
        assert.equal(await p.getByRole("button", { name: /hint/i }).count(), 0, "no hints in a challenge");
        await shot(p, "g1-09-challenge-wrong-final");
      }
    },
  });
  await page.getByTestId("score").waitFor();
  await page.getByRole("heading", { name: /Challenge passed/ }).waitFor();
  await noOverflow(page, "challenge result");
  await axe(page, "challenge result");
  await shot(page, "g1-10-challenge-result");
  const gained = (await get(page, "/api/xp")).total - before;
  assert.equal(gained, 15, "the challenge pays 15 XP once");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G1-U1-C"].state, "completed");
  // revision (Brief 04 scheduler): nothing is due on the day, then the unit's topics come back days later
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal((await get(page, "/api/review")).groups.ready.length, 0, "nothing is due straight after learning");
  S.clock.advanceDays(4);
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const due = (await get(page, "/api/review")).groups.ready;
  assert.ok(due.length > 0, "topics from the unit are due four days later");
  await noOverflow(page, "review hub");
  await axe(page, "review hub");
  await shot(page, "g1-11-review-hub-days-later");
  const started = await post(page, "/api/review/sessions");
  assert.equal(started.status, 200);
  await playReviewInBrowser(page, S, started.body.session.id);
  await page.getByText(/Review finished|Every answer right first time|Nice work reviewing/).first().waitFor();
  await shot(page, "g1-11b-review-done");
  await ctx.close();
});

await test("resumes after an interruption: part-way through a lesson and part-way through a challenge", async () => {
  const ctx = await ctxFor(profiles.iphone);
  const { page, userId } = await guest(ctx);
  await finishViaApi(S, page, userId, "G1-U1-R1");
  await post(page, "/api/lessons/G1-U2-L01/start");
  await playLessonInBrowser(page, S, "G1-U2-L01", { stopAfter: 3 });
  await page.getByText(/Question 4 of/).waitFor();
  await page.reload();
  await page.getByText(/Question 4 of/).waitFor(); // a lesson reopens at the first unanswered question
  // challenge
  await finishViaApi(S, page, userId, "G1-U2-R1");
  await page.goto("/lesson/G1-U2-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G1-U2-C");
  for (let k = 0; k < 2; k++) {
    await answerOnScreen(page, S, items[k].item, items[k].scope, canonicalResponse(S.course.ix, items[k].item, items[k].scope));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(new RegExp(`Question 3 of ${items.length}`)).waitFor();
  await ctx.close();
});

await test("Grade 1 assessment: an honest below-pass result with what to revisit, then a retake that passes and earns the grade badge", async () => {
  const ctx = await ctxFor(profiles.desktop);
  const { page, userId } = await guest(ctx);
  await finishViaApi(S, page, userId, "G1-U7-R1");
  await playNodeInBrowser(page, S, userId, "G1-A", { wrong: 11 });
  await page.getByRole("heading", { name: "Not passed yet" }).waitFor();
  await page.getByText(/not an ABRSM examination/i).waitFor();
  await noOverflow(page, "assessment result");
  await axe(page, "assessment result");
  await shot(page, "g1-12-assessment-not-passed");
  assert.notEqual((await get(page, "/api/progress")).nodes["G1-A"].state, "completed");
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await playNodeInBrowserFromIntro(page, S, userId);
  await page.getByRole("heading", { name: "Grade 1 assessment passed" }).waitFor();
  await shot(page, "g1-13-assessment-passed");
  assert.equal((await get(page, "/api/progress")).nodes["G1-A"].state, "completed");
  const badges = (await get(page, "/api/achievements")).achievements;
  assert.equal(badges.find((b) => b.id === "g1.grade-complete").earned, true);
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await shot(page, "g1-14-progress-after-grade");
  await ctx.close();
});
async function playNodeInBrowserFromIntro(page, S2, userId) {
  // after "Try again" the player reloads a fresh run at its intro screen
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S2.app.nodes.internalItems(userId, "G1-A")) {
    await answerOnScreen(page, S2, it.item, it.scope, canonicalResponse(S2.course.ix, it.item, it.scope));
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
}

for (const [name, p] of Object.entries(profiles)) {
  await test(`layout and accessibility on ${name}: teaching, a question, wrong feedback, and a challenge result`, async () => {
    const ctx = await ctxFor(p);
    const { page, userId } = await guest(ctx);
    await finishViaApi(S, page, userId, "G1-U3-L06");
    await page.goto("/lesson/G1-U3-L07");
    await page.getByRole("button", { name: "Let's go" }).click();
    await noOverflow(page, `${name} intro`);
    await noOverflow(page, `${name} teach`);
    await axe(page, `${name} teach`);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await noOverflow(page, `${name} demo`);
    await axe(page, `${name} demo`);
    await page.getByRole("button", { name: "Try some questions" }).click();
    const it = S.course.authoredItems("G1-U3-L07")[0];
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} question`);
    await axe(page, `${name} question`);
    await shot(page, `g1-${name}-question`);
    await ctx.close();
  });
}

await test("keyboard-only: a challenge question is answered with Tab, Space and Enter", async () => {
  const ctx = await ctxFor(profiles.desktop);
  const { page, userId } = await guest(ctx);
  await finishViaApi(S, page, userId, "G1-U1-R1");
  // find a challenge whose first question is a choice, then answer it without a pointer
  await page.goto("/lesson/G1-U1-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G1-U1-C");
  const first = items[0];
  const r = canonicalResponse(S.course.ix, first.item, first.scope);
  assert.equal(r.kind, "choice", "first question of the unit-1 challenge is a choice");
  const label = first.item.answer.options.find((o) => o.id === r.optionId).label;
  const radio = page.locator("label.option", { hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).locator("input").first();
  await radio.focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 12; i++) {
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (name === "Check") break;
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  await page.locator(".feedback").getByText("Correct!").waitFor();
  await ctx.close();
});

await test("preferences: dark mode, reduced motion, 200% text at 320px, and sound switched off", async () => {
  for (const [label, extra, init] of [
    ["dark", { colorScheme: "dark" }, null],
    ["reduced motion", { reducedMotion: "reduce" }, null],
    ["200% text at 320px", {}, () => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%"))],
  ]) {
    const ctx = await ctxFor(label.startsWith("200") ? profiles["phone-320"] : profiles.desktop, extra);
    const page0 = await ctx.newPage();
    if (init) await page0.addInitScript(init);
    await page0.close();
    const { page, userId } = await guest(ctx);
    if (init) await page.addInitScript(init);
    await finishViaApi(S, page, userId, "G1-U1-R1");
    await page.goto("/lesson/G1-U1-C");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `challenge question (${label})`);
    await axe(page, `challenge question (${label})`);
    await shot(page, `g1-pref-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  }
  const ctx = await ctxFor(profiles.iphone);
  const { page, userId } = await guest(ctx);
  await page.addInitScript(() => {
    window.__ac = 0;
    const A = window.AudioContext;
    if (A) window.AudioContext = function (...a) { window.__ac++; return new A(...a); };
  });
  await post(page, "/api/me/profile", {}).catch(() => {});
  await page.evaluate(() => fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: { sound: false } }) }));
  await playLessonInBrowser(page, S, "G1-U1-L01", { afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); } });
  assert.equal(await page.evaluate(() => window.__ac), 0, "no audio is created when sound is off");
  await ctx.close();
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} Grade 1 journey(s) failed`);
  process.exit(1);
}
console.log("All Grade 1 journeys passed");
process.exit(0);
