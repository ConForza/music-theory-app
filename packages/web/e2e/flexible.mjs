// Flexible learning, real-browser verification: Explore lessons (any lesson, any order) and Practise a topic (any grade / area / topic).
// Covers: Learn -> Explore lessons -> Grade 5 -> a lesson ahead of the path, played through the real controls, completed, while the unit's
// practice, checkpoint and the grade assessment stay locked and the guided path does not move; a locked lesson's "Explore it anyway";
// Practice -> Grade 5 -> Keys and scales -> a topic -> 5 questions answered through the real controls, a summary, "Practise again" with
// fresh questions, finishing early, an explicit shortfall on a narrow topic; and the responsive / accessibility matrix for the new screens.
// Run: npm run build && node --import tsx e2e/flexible.mjs   (SHOTS=dir saves screenshots; ONLY=text runs matching tests)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, get, guest, noOverflow, playLessonInBrowser, reachableCanonical, serve, shot } from "./preplib.mjs";
import { questionKey } from "@mtp/api";

const S = await serve({ waive: false });
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
const profiles = {
  iphone: devices["iPhone 14"],
  "phone-320": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const newCtx = (p = profiles.iphone, extra = {}) => browser.newContext({ ...p, baseURL: S.base, ...extra });
const states = async (page) => (await get(page, "/api/progress")).nodes;

await test("Explore: a fresh learner opens a Grade 5 lesson ahead of the path, completes it through the real controls, and nothing else opens", async () => {
  const ctx = await newCtx();
  const { page } = await guest(ctx);
  await page.goto("/learn");
  // Review of PR #26, finding 5: both new entry points are on screen when Learn first opens, without scrolling.
  const learnWays = page.locator(".learn-ways");
  await learnWays.waitFor();
  await page.waitForTimeout(600); // any page-load scroll would have happened by now
  const box = await learnWays.boundingBox();
  const vh = page.viewportSize().height;
  assert.ok(box && box.y >= 0 && box.y + box.height <= vh, `Explore and Practise are in view on first load (y=${box?.y}, viewport ${vh})`);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.getByRole("link", { name: /Explore lessons/ }).click();
  await page.getByRole("heading", { level: 1, name: "Explore lessons" }).waitFor();
  await page.getByRole("radio", { name: "Grade 5" }).click();
  await page.getByRole("heading", { name: /^Grade 5:/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "Grade 5" }).isChecked(), true);
  const unit = page.getByRole("region", { name: /Unit 3:/ });
  await unit.waitFor();
  await axe(page, "explore lessons");
  await noOverflow(page, "explore lessons");
  await shot(page, "explore-lessons");
  await unit.locator('[data-node="G5-U3-L03"]').getByRole("link").click();
  await page.getByTestId("explore-note").waitFor();
  await axe(page, "explored lesson intro");
  await noOverflow(page, "explored lesson intro");
  await shot(page, "explored-lesson-intro");
  // the explored run is open, so the lesson plays exactly as any other (resuming at its intro)
  await playLessonInBrowser(page, S, "G5-U3-L03");
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  const s = await states(page);
  assert.equal(s["G5-U3-L03"].state, "completed");
  assert.equal(s["G5-U3-L03"].outOfSequence, true);
  for (const n of ["G5-U3-L01", "G5-U3-L02", "G5-U3-L04", "G5-U3-P1", "G5-U3-C", "G5-A"]) assert.notEqual(s[n].state, "completed", n);
  for (const n of ["G5-U3-L04", "G5-U3-P1", "G5-U3-C", "G5-A"]) assert.equal(s[n].state, "locked", n);
  const prog = await get(page, "/api/progress");
  assert.equal(prog.grades[0].nextNodeId, "G1-U1-L01", "the guided path has not moved");
  assert.equal((await get(page, "/api/me")).profile.selectedGrade, 1);
  // the explored completion is tagged, and the next lesson's lock names the real missing step
  await page.goto("/unit/G5-U3");
  await page.locator('[data-node="G5-U3-L03"] .pill-explored').waitFor();
  assert.match(await page.locator('[data-node="G5-U3-L04"]').innerText(), /which you've already explored, will count then/);
  await axe(page, "unit page with an explored lesson");
  await noOverflow(page, "unit page with an explored lesson");
  await shot(page, "unit-explored");
  // and on the path itself (viewing Grade 5 here is the learner's own choice, not something exploring did)
  await page.evaluate(() => fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectedGrade: 5 }) }));
  await page.goto("/learn");
  const marked = page.locator('[data-node="G5-U3-L03"]');
  await marked.locator(".node-badge-explored").waitFor();
  assert.match(await marked.getAttribute("aria-label"), /explored ahead of your path/);
  await axe(page, "path with an explored lesson");
  await ctx.close();
});

await test("Explore: a locked lesson opened from the guided path says it is locked and offers to explore it", async () => {
  const ctx = await newCtx();
  const { page } = await guest(ctx);
  await page.goto("/lesson/G1-U1-L04");
  await page.getByRole("heading", { name: "This lesson is locked" }).waitFor();
  await page.getByRole("link", { name: "Explore it anyway" }).click();
  await page.getByTestId("explore-note").waitFor();
  await ctx.close();
});

await test("Practise a topic: Grade 5 -> Keys and scales -> a topic -> 5 questions, answered on screen; summary; practise again with fresh questions", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  await page.goto("/learn");
  await page.getByRole("link", { name: /Practise a topic/ }).click();
  const picker = page.getByTestId("topic-practice");
  await picker.waitFor();
  await axe(page, "topic picker");
  await noOverflow(page, "topic picker");
  await picker.getByRole("radio", { name: "Grade 5" }).check();
  await picker.locator("details[data-area=keys] summary").click();
  await picker.getByRole("button", { name: /^Six flats/ }).click();
  await picker.getByRole("radio", { name: "5 questions" }).check();
  await shot(page, "topic-picker");
  await page.getByTestId("topic-start").click();
  await page.waitForURL(/\/practice\/topic\//);
  const first = new URL(page.url()).pathname.split("/").pop();
  const items = S.app.topics.internalItems(userId, first);
  assert.equal(items.length, 5);
  for (const [k, it] of items.entries()) {
    await page.getByText(new RegExp(`Six flats · Question ${k + 1} of 5`)).waitFor();
    if (k === 0) {
      await axe(page, "topic question");
      await noOverflow(page, "topic question");
      await shot(page, "topic-question");
    }
    await answerOnScreen(page, S, it.item, it.scope, reachableCanonical(S, it.item, it.scope));
    await page.locator(".feedback").getByText("Correct!").waitFor();
    await page.getByRole("button", { name: k === 4 ? "Finish" : "Next question", exact: true }).click();
  }
  const summary = page.getByTestId("topic-summary");
  await summary.waitFor();
  assert.match(await page.getByTestId("topic-score").innerText(), /5 of 5 right first time/);
  await axe(page, "topic summary");
  await noOverflow(page, "topic summary");
  await shot(page, "topic-summary");
  // formative: no XP, no lesson completed
  assert.equal((await get(page, "/api/xp")).total, 0);
  assert.equal((await get(page, "/api/progress")).totals.lessonsCompleted, 0);
  await page.getByTestId("topic-again").click();
  await page.waitForURL((u) => u.pathname.startsWith("/practice/topic/") && !u.pathname.endsWith(first));
  await page.getByText(/Six flats · Question 1 of 5/).waitFor();
  const second = new URL(page.url()).pathname.split("/").pop();
  const before = new Set(items.map((x) => questionKey(x.item)));
  const again = S.app.topics.internalItems(userId, second).map((x) => questionKey(x.item));
  assert.equal(again.filter((k) => before.has(k)).length, 0, "practise again brings different questions");
  // "Not sure? Learn it" opens the lesson, and closing it comes back to this practice question (review finding 7)
  await page.getByRole("link", { name: /Not sure\? Learn it/ }).click();
  await page.getByRole("button", { name: /Close lesson/ }).click();
  await page.waitForURL((u) => u.pathname.endsWith(`/practice/topic/${second}`));
  await page.getByText(/Six flats · Question 1 of 5/).waitFor();
  // finish early, from the first question
  await page.getByRole("button", { name: "Finish now" }).click();
  await page.getByRole("heading", { name: "Stopped early, and that's fine" }).waitFor();
  await ctx.close();
});

await test("Practise a topic: a narrow topic with fewer different questions says so, and never adds another topic", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  await page.goto("/practice");
  const picker = page.getByTestId("topic-practice");
  await picker.getByRole("radio", { name: "Grade 2" }).check();
  await picker.locator("details[data-area=keys] summary").click();
  await picker.getByRole("button", { name: /^Melodic minor preview/ }).click();
  assert.equal(await picker.getByRole("radio", { name: "20 questions" }).isDisabled(), true, "a count the topic cannot fill is not offered");
  assert.match(await page.getByTestId("topic-start-note").innerText(), /only \d+ different/);
  await page.getByTestId("topic-start").click();
  await page.getByTestId("topic-shortfall").waitFor();
  const id = new URL(page.url()).pathname.split("/").pop();
  const items = S.app.topics.internalItems(userId, id);
  assert.ok(items.length < 5);
  assert.ok(items.every((x) => x.conceptId === "c.scales.minor-melodic-preview"));
  await ctx.close();
});

for (const [name, profile] of Object.entries(profiles)) {
  await test(`responsive and accessible (${name}, ${name === "desktop" ? "dark" : "light"}): Practice and Explore lessons`, async () => {
    const ctx = await newCtx(profile, name === "desktop" ? { colorScheme: "dark" } : {});
    const { page } = await guest(ctx);
    await page.goto("/practice");
    await page.getByTestId("topic-practice").waitFor();
    await page.locator("details[data-area=rhythm] summary").click();
    await noOverflow(page, `${name} practice`);
    await axe(page, `${name} practice`);
    await shot(page, `practice-${name}`);
    await page.goto("/learn/explore?grade=3");
    await page.locator(".explore-unit").first().waitFor();
    await noOverflow(page, `${name} explore`);
    await axe(page, `${name} explore`);
    await ctx.close();
  });
}

await browser.close();
S.close();
log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
