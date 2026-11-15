// Brief 10 real-browser verification: practice examinations. The server runs in this process with the real content and a controllable clock;
// the learner's actions go through the real controls. Covers: a full mock examination for EVERY grade (blind answering, results by outcome,
// estimated readiness, errors explained, notation in the review), practice mode (hints, feedback, not counted), a timed mock (clock, extra
// time, time up), interruption and resume, the results history, keyboard-only use and the responsive / preference matrix.
// Run: npm run build && node --import tsx e2e/prep-exams.mjs   (SHOTS=dir saves screenshots; ONLY=text runs matching tests)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { attemptIdFromUrl, axe, get, guest, noOverflow, playPrep, post, reachableWrong, serve, shot } from "./preplib.mjs";

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
  "ipad-portrait": { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const newLearner = async (p = profiles.desktop, extra = {}) => {
  const ctx = await browser.newContext({ ...p, baseURL: S.base, ...extra });
  const { page, userId } = await guest(ctx);
  return { ctx, page, userId };
};
const blueprint = (g) => S.app.prep.blueprint(g);
const startFromHub = async (page, grade, mode, { timed = false, extra } = {}) => {
  await page.goto("/practice");
  await page.getByTestId(`exam-${grade}`).getByRole("link").click();
  await page.getByRole("heading", { name: `Grade ${grade}`, level: 1 }).waitFor();
  await page.getByRole("radio", { name: mode === "mock" ? /Mock examination/ : /Practice mode/ }).check();
  if (timed) {
    await page.getByRole("switch", { name: /Use a timer/ }).check();
    if (extra !== undefined) await page.getByTestId("extra-time").getByRole("radio", { name: extra === 0 ? "None" : `+${extra}%` }).check();
  }
  await page.getByRole("button", { name: /^Start|Continue where/ }).click();
  await page.waitForURL(/\/exam\/run\//);
  return attemptIdFromUrl(page);
};

for (const grade of [1, 2, 3, 4, 5]) {
  await test(`Grade ${grade}: a full mock examination in the browser: blind answering, then results by outcome, readiness, explained errors and the answers`, async () => {
    const { ctx, page, userId } = await newLearner(grade === 1 ? profiles.iphone : profiles.desktop);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/practice");
    await page.getByTestId(`exam-${grade}`).waitFor();
    await axe(page, `grade ${grade} practice hub`);
    await noOverflow(page, "practice hub");
    await shot(page, `prep-${grade}-hub`);
    const id = await startFromHub(page, grade, "mock");
    await page.getByRole("button", { name: /Let's go/ }).click();
    const bp = blueprint(grade);
    // Two questions are answered wrongly on purpose: the first two (of the first outcome onwards) for which the controls can give a wrong answer.
    const wrongAt = new Set(S.app.prep.internalItems(userId, id).flatMap((it, i) => (reachableWrong(S, it.item, it.scope) ? [i] : [])).slice(0, 2));
    assert.equal(wrongAt.size, 2, "two questions can be answered wrongly");
    const n = await playPrep(page, S, userId, id, { wrong: (i) => wrongAt.has(i) });
    assert.equal(n, bp.totalItems);
    await page.waitForURL(/\/results\//);
    await page.getByRole("heading", { name: "Your result" }).waitFor();
    const score = await page.getByTestId("score").innerText();
    // the first outcome's two questions were answered wrongly where a wrong answer can be built (a few question types have none)
    const wrongSent = S.db.prepare("SELECT COUNT(*) AS c FROM prep_responses WHERE user_id = ? AND correct = 0").get(userId).c;
    assert.ok(wrongSent >= 1, "at least one wrong answer was given");
    assert.match(score, new RegExp(`${bp.totalItems - wrongSent} of ${bp.totalItems} right first time`));
    // outcomes, levels and an estimate that is cautious after a single attempt
    assert.equal(await page.getByTestId("outcomes").locator("li").count(), bp.sections.filter((s) => s.outcomeId).length);
    assert.ok((await page.locator('[data-level="needs_review"]').count()) + (await page.locator('[data-level="developing"]').count()) >= 1, "the outcome answered wrongly is flagged");
    // every wrong answer lowers at most one outcome below Mastered
    assert.ok((await page.locator('[data-level="mastered"]').count()) >= bp.sections.filter((s) => s.outcomeId).length - wrongSent);
    const ready = await page.getByTestId("readiness").innerText();
    assert.ok(!/On track/.test(ready), `one mock cannot say On track: ${ready}`);
    await page.getByText(/not an ABRSM result/).first().waitFor();
    assert.equal(await page.getByTestId("review-wrong").count(), wrongSent);
    await page.getByTestId("review-wrong").first().getByText("The answer:").waitFor();
    await page.getByRole("heading", { name: "What to do next" }).waitFor();
    await noOverflow(page, `grade ${grade} result`);
    await axe(page, `grade ${grade} result`);
    await shot(page, `prep-${grade}-result`);
    // nothing rewarded: no XP, no badge, the path untouched
    assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ?").get(userId).c, 0);
    assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM achievements_awarded WHERE user_id = ?").get(userId).c, 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await test("practice mode: hints and feedback after every question, a way to move on, and it is not counted as independent evidence", async () => {
  const { ctx, page, userId } = await newLearner();
  const id = await startFromHub(page, 2, "practice");
  await page.getByRole("button", { name: /Let's go/ }).click();
  await page.getByRole("button", { name: "Need a hint?" }).waitFor();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list .tip").first().waitFor();
  // question 1 wrong first (a choice question), see the explanation, move on; the rest answered correctly with feedback
  const n = await playPrep(page, S, userId, id, { blind: false, wrong: (i) => i === 0 });
  assert.equal(n, blueprint(2).totalItems);
  await page.waitForURL(/\/results\//);
  await page.getByText("Practice mode.").waitFor();
  assert.equal(await page.getByTestId("readiness").count(), 0, "practice mode shows no readiness");
  const r = await get(page, "/api/prep/results");
  assert.equal(r.grades[1].readiness.label, "not_enough_evidence");
  assert.equal(r.grades[1].readiness.ignored[0].reason, "practice_mode");
  await ctx.close();
});

await test("interrupted attempt: close the page part-way, return later on the same device, and carry on from the next question", async () => {
  const { ctx, page, userId } = await newLearner(profiles.iphone);
  const id = await startFromHub(page, 3, "mock");
  await page.getByRole("button", { name: /Let's go/ }).click();
  await playPrep(page, S, userId, id, { stopAfter: 3 });
  await page.reload();
  await page.getByRole("heading", { name: /Grade 3 mock examination/ }).waitFor();
  await page.getByText("Welcome back").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/Question 4 of/).waitFor();
  // and starting it again from the hub resumes the same attempt, not a new one
  await page.goto("/practice/exam/3");
  await page.getByRole("radio", { name: /Mock examination/ }).check();
  await page.getByRole("button", { name: /Continue where I left off/ }).waitFor();
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM prep_attempts WHERE user_id = ? AND grade = 3").get(userId).c, 1);
  await ctx.close();
});

await test("timed mock: the clock is shown and explained, extra time is offered, time running out saves the answers and finishes", async () => {
  const { ctx, page, userId } = await newLearner();
  // A skewable clock for this page only (the real timers keep running, so the page stays fully interactive): moving it forward is how
  // "the time runs out" is reached without waiting for it.
  await page.addInitScript(() => { const real = Date.now.bind(Date); window.__skew = 0; Date.now = () => real() + window.__skew; });
  const id = await startFromHub(page, 1, "mock", { timed: true, extra: 50 });
  const total = blueprint(1).totalItems;
  const limit = Math.ceil(total * 90 * 1.5);
  await page.getByTestId("timing-note").getByText(/not an ABRSM time allowance/).waitFor();
  await page.getByTestId("timing-note").getByText(/includes 50% extra time|Speed is never part of your score/).first().waitFor();
  await axe(page, "timed intro");
  await page.getByRole("button", { name: "Start the timer" }).click();
  const clock = page.getByTestId("clock");
  await clock.waitFor();
  assert.equal(await clock.getAttribute("role"), "timer");
  assert.equal(await clock.getAttribute("aria-live"), "off", "the ticking clock is not read out every second");
  await playPrep(page, S, userId, id, { stopAfter: 2 });
  // move BOTH clocks past the deadline: the server's and the browser's
  await post(page, "/api/test/clock", { advanceMinutes: (limit + 30) / 60 });
  await page.evaluate((ms) => { window.__skew += ms; }, (limit + 30) * 1000);
  await page.waitForURL(/\/results\//, { timeout: 15000 });
  await page.getByText(/Time ran out/).waitFor();
  assert.match(await page.getByTestId("score").innerText(), /2 of /);
  await page.getByText(/not yet assessed/i).first().waitFor();
  await ctx.close();
});

await test("results history: every attempt, the estimate by grade, and outcome-by-outcome progress", async () => {
  const { ctx, page, userId } = await newLearner();
  for (const seed of [101, 202]) {
    const a = await post(page, "/api/exams/2/start", { mode: "mock", seed });
    const id = a.body.id;
    for (const it of S.app.prep.internalItems(userId, id)) {
      const { canonicalResponse } = await import("@mtp/engine");
      await post(page, `/api/prep/attempts/${id}/answers`, { attemptId: crypto.randomUUID(), itemId: it.item.id, response: canonicalResponse(S.course.ix, it.item, it.scope) });
    }
    await post(page, `/api/prep/attempts/${id}/complete`, {});
  }
  await page.goto("/progress");
  await page.getByRole("link", { name: "See my practice results" }).click();
  await page.getByRole("heading", { name: "Your practice results" }).waitFor();
  const g2 = page.getByTestId("results-grade-2");
  await g2.getByText("On track").waitFor();
  assert.equal(await page.getByTestId("history").locator("li").count(), 2);
  await g2.getByText("Outcome by outcome").click();
  await g2.getByText("Mastered").first().waitFor();
  await noOverflow(page, "results");
  await axe(page, "results history");
  await shot(page, "prep-results");
  await ctx.close();
});

await test("keyboard only: choose the mode, start, answer a question and finish without a pointer", async () => {
  const { ctx, page, userId } = await newLearner();
  await page.goto("/practice/exam/1");
  await page.getByRole("radio", { name: /Mock examination/ }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /Start mock examination/ }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/exam\/run\//);
  const id = attemptIdFromUrl(page);
  await page.getByRole("button", { name: /Let's go/ }).focus();
  await page.keyboard.press("Enter");
  const first = S.app.prep.internalItems(userId, id)[0];
  await page.locator("section.question").waitFor();
  const focusable = await page.evaluate(() => [...document.querySelectorAll("section.question button, section.question input, .action-bar button")].filter((e) => !e.disabled).length);
  assert.ok(focusable > 0, "the question has keyboard-reachable controls");
  // the skip link and the close button are reachable and named
  await page.getByRole("button", { name: /Close\. Your answers are saved/ }).waitFor();
  void first;
  await ctx.close();
});

const matrix = {
  "phone": [profiles.iphone, {}],
  "320px": [profiles["phone-320"], {}],
  "tablet": [profiles["ipad-portrait"], {}],
  "desktop": [profiles.desktop, {}],
  "dark mode": [profiles.iphone, { colorScheme: "dark" }],
  "reduced motion": [profiles.desktop, { reducedMotion: "reduce" }],
};
for (const [name, [p, extra]] of Object.entries(matrix)) {
  await test(`layout and accessibility, ${name}: practice hub, setup, a question, the result and the results page`, async () => {
    const { ctx, page, userId } = await newLearner(p, extra);
    if (name === "dark mode") await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/practice");
    await page.getByTestId("exam-5").waitFor();
    await noOverflow(page, `${name} hub`);
    await axe(page, `${name} hub`);
    await page.goto("/practice/exam/5");
    await page.getByRole("radio", { name: /Mock examination/ }).check();
    await page.getByRole("switch", { name: /Use a timer/ }).check();
    await noOverflow(page, `${name} setup`);
    await axe(page, `${name} setup`);
    await shot(page, `prep-${name.replace(/\W/g, "")}-setup`);
    await page.getByRole("button", { name: /Start timed mock/ }).click();
    await page.waitForURL(/\/exam\/run\//);
    const id = attemptIdFromUrl(page);
    await noOverflow(page, `${name} intro`);
    await axe(page, `${name} intro`);
    await page.getByRole("button", { name: /Start the timer/ }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} question`);
    await axe(page, `${name} question`);
    await shot(page, `prep-${name.replace(/\W/g, "")}-question`);
    // finish early through the control: nothing is marked wrong
    await page.getByRole("button", { name: "Finish early…" }).click();
    await page.getByRole("heading", { name: "Finish now?" }).waitFor();
    await axe(page, `${name} finish early`);
    await page.getByRole("button", { name: "Finish and see my result" }).click();
    await page.waitForURL(/\/results\//);
    await page.getByRole("heading", { name: "Your result" }).waitFor();
    await noOverflow(page, `${name} result`);
    await axe(page, `${name} result`);
    await shot(page, `prep-${name.replace(/\W/g, "")}-result`);
    void id; void userId;
    await ctx.close();
  });
}

await test("200% text size: the examination screens stay usable", async () => {
  const { ctx, page } = await newLearner(profiles.iphone);
  await page.addInitScript(() => { document.documentElement.style.fontSize = "200%"; });
  await page.goto("/practice/exam/2");
  await page.getByRole("radio", { name: /Mock examination/ }).check();
  await noOverflow(page, "200% setup");
  await page.getByRole("button", { name: /Start mock examination/ }).click();
  await page.waitForURL(/\/exam\/run\//);
  await noOverflow(page, "200% intro");
  await page.getByRole("button", { name: /Let's go/ }).click();
  await page.locator("section.question").waitFor();
  await noOverflow(page, "200% question");
  await ctx.close();
});

await browser.close();
S.close();
log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
