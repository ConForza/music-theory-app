// Brief 04 real-browser verification: XP, daily goal, streak, concept mastery, adaptive review and badges.
// The server runs with its test clock enabled (MTP_TEST_CLOCK=1) so "days later" is a request, not a wait.
// Journeys: the full 14-step acceptance journey on a 320px phone, an iPhone and desktop; reward + review on iPad portrait
// and landscape; keyboard-only review; dark mode; reduced motion; sound off (no audio context is ever created);
// 200% text at 320px. axe (serious/critical) and "no sideways scroll" are checked on every new screen.
// Run: npm run build && node --import tsx e2e/brief04.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { canonicalResponse, generateItem, inputFor, parseGeneratedItemId, wrongResponse } from "@mtp/engine";
import { drive } from "./drive.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const port = 8600 + Math.floor(Math.random() * 100);
const base = `http://localhost:${port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum);
const LESSON = "G1-U3-L03";
const TREBLE = "c.clefs.treble-lines";

const server = spawn("node", ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/main.ts"], {
  cwd: join(root, "packages/api"),
  env: { ...process.env, PORT: String(port), MTP_TEST_CLOCK: "1", MTP_DB: join(mkdtempSync(join(tmpdir(), "mtp-")), "e2e.sqlite") },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("listening") && resolve());
  server.on("exit", (c) => reject(new Error(`API exited ${c}`)));
  setTimeout(() => reject(new Error("API did not start")), 20000);
});
const clock = {
  set: (iso) => fetch(`${base}/api/test/clock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ set: iso }) }),
  advanceDays: (n) => fetch(`${base}/api/test/clock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advanceDays: n }) }),
};
// Every journey starts "on 2 March 2026, midday" in London (GMT), so the learner-local date is 2026-03-02.
const START = "2026-03-02T12:00:00Z";

const browser = await chromium.launch();
let failures = 0;
const log = (...a) => console.log(...a);

async function noOverflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) {
    const culprits = await page.evaluate(() => {
      const de = document.documentElement;
      const w = de.clientWidth;
      const out = [`client=${w} scroll=${de.scrollWidth} inner=${innerWidth} body.scroll=${document.body.scrollWidth}`];
      for (const e of document.querySelectorAll("body *")) {
        const r = e.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(e);
        const t = range.getBoundingClientRect();
        if (r.right > w + 0.5 || e.scrollWidth > e.clientWidth + 0.5 || t.right > w + 0.5) {
          out.push(`${e.tagName}.${e.className} right=${r.right.toFixed(1)} content=${t.right.toFixed(1)} sw=${e.scrollWidth} cw=${e.clientWidth} "${(e.textContent ?? "").slice(0, 25)}"`);
        }
      }
      return out.slice(0, 14);
    });
    assert.fail(`${where}: page scrolls sideways by ${over}px; wider than the viewport: ${culprits.join(" | ")}`);
  }
}
async function axe(page, where) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
  const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  assert.equal(bad.length, 0, `${where}: accessibility violations: ${bad.map((v) => `${v.id} (${v.nodes[0]?.target}) ${v.nodes[0]?.failureSummary ?? ""}`).join(", ")}`);
}
async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
}
const check = async (page, where) => {
  await noOverflow(page, where);
  await axe(page, where);
};

async function newLearner(browserContext, label, { ui = false } = {}) {
  const page = await browserContext.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const email = `brief04-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  if (ui) {
    await page.goto("/");
    await page.waitForURL("**/welcome");
    await page.getByRole("link", { name: "Get started" }).click();
    await page.getByRole("button", { name: /New to music theory/ }).click();
    await page.getByLabel("Nickname").fill("Ada");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a long safe password");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/learn");
  } else {
    await page.goto("/welcome");
    await page.evaluate(async ({ email }) => {
      const j = (method, url, body) => fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      await j("POST", "/api/auth/register", { email, password: "a long safe password", displayName: "Ada" });
      await j("PATCH", "/api/me/profile", { onboarded: true, experience: "new" });
    }, { email });
  }
  return { page, errors, email };
}

// ---- answers, derived from the engine on the test side and submitted through the real controls --------------------------
const api = (page, method, path, body) =>
  page.evaluate(
    async ([method, path, body]) => {
      const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    },
    [method, path, body],
  );

function resolveReviewItem(itemId) {
  const g = parseGeneratedItemId(itemId);
  const node = ix.nodeById.get(LESSON);
  const binding = node.exercises.find((b) => b.templateId === g.templateId);
  const scope = effectiveScope(ix, node, binding);
  const { item } = generateItem(ix, g.templateId, g.seed, { scope, evidence: "independent" });
  return { item, scope, input: inputFor(ix, item, scope) };
}

async function pressKeys(page, locator, key) {
  await locator.focus();
  await page.keyboard.press(key);
}

/** Answer the question on screen. `how`: "click" (default), "keys" (keyboard only). */
async function answerOnScreen(page, itemId, right, how = "click") {
  const { item, scope, input } = resolveReviewItem(itemId);
  const response = right ? canonicalResponse(ix, item, scope) : wrongResponse(ix, item, scope);
  if (how === "keys") {
    // Native radios: focus the option and press Space; the stave slider already works with arrows.
    if (input.kind === "pitch-letter" || input.kind === "choice") {
      const label = input.kind === "pitch-letter" ? response.letter : input.options.find((o) => o.id === response.optionId).label;
      const radio = page.locator("label.option", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().locator("input");
      await pressKeys(page, radio, "Space");
    } else await drive(page, page.locator("#answer-form"), input, response, "keys");
    const check = page.getByRole("button", { name: "Check" });
    await pressKeys(page, check, "Enter");
  } else {
    await drive(page, page.locator("#answer-form"), input, response, "keys");
    await page.getByRole("button", { name: "Check" }).click();
  }
  return response;
}

/**
 * Work through the open review session on screen. `plan(kind, n)` returns "right" or "wrong" for each first answer to a
 * review question; remedial questions are always answered correctly. Ends on the summary.
 */
async function runReview(page, plan = () => "right", how = "click") {
  let n = 0;
  const notes = { wrong: 0, remedial: 0, explanations: [] };
  const sessionId = new URL(page.url()).pathname.split("/").pop();
  for (let guard = 0; guard < 20; guard++) {
    const s = (await api(page, "GET", `/api/review/sessions/${sessionId}`)).body;
    const idx = s.items.findIndex((i) => !i.answered);
    if (idx === -1) break;
    const it = s.items[idx];
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const right = it.kind === "remedial" ? true : plan(it.kind, n++) === "right";
    if (it.kind === "remedial") notes.remedial++;
    await answerOnScreen(page, it.item.id, right, how);
    if (right) {
      await page.getByText("Correct!").waitFor();
      const btn = page.getByRole("button", { name: /^(Continue|Finish review)$/ });
      if (how === "keys") assert.ok(await btn.evaluate((b) => document.activeElement === b), "focus moves to Continue after an answer");
      if (how === "keys") await page.keyboard.press("Enter");
      else await btn.click();
    } else {
      notes.wrong++;
      await page.getByText("Not quite").waitFor();
      const explanation = await page.locator(".feedback").innerText();
      notes.explanations.push(explanation);
      const similar = page.getByRole("button", { name: "Try a similar question" });
      await similar.waitFor();
      if (how === "keys") await pressKeys(page, similar, "Enter");
      else await similar.click();
      await page.getByText(/A similar question/).waitFor();
    }
  }
  await page.getByRole("heading", { name: /Every answer right first time|Nice work reviewing/ }).waitFor();
  return notes;
}

// ---- lesson through the UI (same route as the Brief 02 journey) ----------------------------------------------------------
async function playLessonThroughUi(page) {
  await page.goto("/learn");
  await page.getByRole("region", { name: /Treble clef: notes on the lines/ }).waitFor();
  await page.getByRole("link", { name: "Start" }).first().click();
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.getByText("Question 1 of 6").waitFor();
  await page.locator("label.option", { hasText: /^D$/ }).click(); // wrong first: guided, so no mastery evidence either way
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Not quite").waitFor();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator("label.option", { hasText: /^G$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Question 2 of 6").waitFor();
  await page.getByRole("button", { name: "Need a hint?" }).click(); // a hinted guided answer: learning, never mastery
  await page.getByText(/skip a letter|G is the line below/).waitFor();
  await page.locator("label.option", { hasText: /^B$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const [q, letter] of [[3, "D"], [4, "E"]]) {
    await page.getByText(`Question ${q} of 6`).waitFor();
    await page.locator("label.option", { hasText: new RegExp(`^${letter}$`) }).click();
    await page.getByRole("button", { name: "Check" }).click();
    await page.getByText("Correct!").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByText("Question 5 of 6").waitFor();
  await page.getByRole("slider").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Question 6 of 6").waitFor();
  await page.getByRole("slider").focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText("Progress saved.").waitFor();
}

const strip = (page) => page.getByRole("region", { name: "Your rewards" });

// =========================================================================================================================
// 1. The acceptance journey (steps 1 to 14), on a phone, a small phone and desktop
// =========================================================================================================================
async function acceptance(p) {
  await clock.set(START);
  const ctx = await browser.newContext({ ...p, baseURL: base, timezoneId: "Europe/London", reducedMotion: "no-preference" });
  const { page, errors, email } = await newLearner(ctx, p.name, { ui: true }); // 1. a brand-new learner
  const s = (n) => shot(page, `${p.name}-${n}`);

  // 2. the learning path, with the quiet reward strip
  await strip(page).waitFor();
  assert.match(await strip(page).innerText(), /0\s*XP/);
  assert.match(await strip(page).innerText(), /0 of 1 session today/);
  await check(page, "path before lesson");
  await s("01-path-new");

  // 3 + 4. complete the lesson and receive XP with a reason
  await playLessonThroughUi(page);
  await page.getByText("+10 XP", { exact: true }).waitFor();
  await page.getByText(/Lesson finished: \+10 XP/).waitFor();
  await page.getByText("Daily goal reached.").waitFor();
  await page.getByRole("list", { name: "New badges" }).getByText("Treble line reader").waitFor();
  await page.getByRole("progressbar", { name: "XP towards your next milestone" }).waitFor();

  // 6. the mastery evidence behind it, in plain words (guided and hinted steps are explicitly not counted)
  await page.getByText("What this counts towards").click();
  await page.getByText("Treble clef line notes").waitFor();
  const evidence = await page.locator(".evidence").textContent();
  assert.match(evidence, /Treble clef line notes[\s\S]*Proficient/);
  assert.match(evidence, /The stave[\s\S]*Practising/);
  assert.match(evidence, /different kind of question/);
  await check(page, "lesson complete");
  await s("02-lesson-complete-rewards");

  // 5. the updated daily goal on the path
  await page.getByRole("link", { name: "Back to the path" }).click();
  await page.waitForURL("**/learn");
  await strip(page).getByText("Goal reached").waitFor();
  assert.match(await strip(page).innerText(), /10\s*XP/);
  assert.match(await strip(page).innerText(), /1 day/);
  await check(page, "path after lesson");
  await s("03-path-after-lesson");

  // Nothing is due yet: Review says so plainly and offers optional practice, never made-up work.
  await page.getByRole("link", { name: /^Review/ }).first().click();
  await page.getByRole("heading", { name: "Keep what you've learned" }).waitFor();
  await page.getByText(/Nothing to review right now/).waitFor();
  await page.getByRole("link", { name: "Optional practice" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Start review/ }).count(), 0);
  await check(page, "review, nothing due");
  await s("04-review-nothing-due");

  // 11. a day later a review is due
  await clock.advanceDays(1);
  await page.goto("/learn");
  await page.getByRole("heading", { name: /1 topic ready to review/ }).waitFor();
  await page.getByRole("link", { name: /Review\s*,\s*1 ready/ }).waitFor();
  await check(page, "path with review due");
  await s("05-path-review-due");

  // 7 + 8. a review session; the first answer is wrong on purpose
  await page.getByRole("link", { name: /^Review/ }).first().click();
  await page.getByRole("heading", { name: "Ready for review" }).waitFor();
  await check(page, "review hub, due");
  await s("06-review-hub-due");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await page.getByText(/Review · Treble clef line notes/).waitFor();
  assert.equal(await page.getByRole("button", { name: /hint/i }).count(), 0, "review has no hints");
  await noOverflow(page, "review question");
  await s("07-review-question");
  const notes = await runReview(page, (_k, n) => (n === 0 ? "wrong" : "right"));
  assert.equal(notes.wrong, 1);
  assert.equal(notes.remedial, 1);
  assert.match(notes.explanations[0], /Not quite/);
  assert.ok(notes.explanations[0].replace(/Not quite/, "").trim().length > 20, "a wrong answer gets a specific explanation");

  // 9 + 10. the summary, XP, and the new schedule
  await page.getByText("+8 XP", { exact: true }).waitFor();
  await page.getByText(/1 of 2 right first time/).waitFor();
  await page.getByText(/Needs a little more practice/).waitFor();
  await check(page, "review summary");
  await s("08-review-summary");
  await page.getByRole("link", { name: "Back to Review" }).click();
  await page.getByText(/was proficient/).first().waitFor();
  const lapsed = await api(page, "GET", `/api/mastery/${TREBLE}`);
  assert.equal(lapsed.body.state, "practising");
  assert.equal(lapsed.body.highestState, "proficient");
  assert.equal(lapsed.body.nextDueDate, "2026-03-06"); // a lapse: back to the second interval, 3 days from 3 March
  await s("09-review-after-slip");

  // 12. the scheduled reviews come back (the clock moves, the browser does not wait)
  await clock.advanceDays(3);
  await page.goto("/review");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await runReview(page);
  await page.getByText("+8 XP", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Back to Review" }).click();
  await clock.advanceDays(7);
  await page.goto("/review");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await runReview(page);
  await page.getByRole("link", { name: "Back to Review" }).click();
  // With today's content there are only a handful of distinct line-note questions, so the honest outcome is "proficient with
  // reviews passed, not yet mastered": the screen must say exactly what is missing (mastery itself is covered with fixtures).
  await page.getByRole("heading", { name: "Nearly mastered" }).waitFor();
  await page.getByText("Treble clef line notes").first().waitFor();
  await check(page, "review hub, nearly mastered");
  await s("10-review-nearly-mastered");
  const mastered = (await api(page, "GET", `/api/mastery/${TREBLE}`)).body;
  assert.equal(mastered.state, "proficient");
  assert.ok(mastered.delayedReviews >= 1 && mastered.spanDays >= 3 && mastered.independentCorrect < 8);
  assert.match(mastered.missing.join(" "), /more correct first-try answers?/);
  if (mastered.limited) {
    // The learner is told, in the list and in the detail, that the question pool (not their effort) is the limit.
    await page.getByText(/more questions coming/).first().waitFor();
    assert.match(mastered.missing.join(" "), /still being written/);
  }
  const trail = mastered.trail;
  assert.ok(trail.some((t) => t.source === "guided-step" && !t.counted), "guided steps are on record but not counted");
  assert.ok(trail.some((t) => t.source === "hinted-step" && !t.counted), "the hinted step is on record but not counted");
  assert.ok(trail.some((t) => t.source === "remedial-step" && !t.counted), "the remedial answer is on record but not counted");

  // Progress: simple summaries first, detail on request
  await page.goto("/progress");
  await page.getByRole("heading", { name: "Understanding" }).waitFor();
  await page.getByRole("heading", { name: "Badges" }).waitFor();
  await page.getByText("Treble line reader").first().waitFor();
  await check(page, "progress");
  await s("11-progress");

  // 13. refresh and sign in again: everything earned is still there
  const before = (await api(page, "GET", "/api/engagement")).body;
  await page.reload();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/welcome");
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long safe password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/learn");
  const after = (await api(page, "GET", "/api/engagement")).body;
  assert.equal(after.xp.total, before.xp.total);
  assert.equal(after.achievements.earnedCount, 1);
  assert.equal((await api(page, "GET", `/api/mastery/${TREBLE}`)).body.state, "proficient");
  assert.equal(before.xp.total, 10 + 8 + 8 + 8);
  await strip(page).waitFor();
  assert.match(await strip(page).innerText(), /34\s*XP/);

  // Time passes without a visit: a warm welcome back, nothing lost, mastery only becomes due for review
  await clock.advanceDays(40);
  await page.goto("/learn");
  await page.getByText(/Welcome back!/).waitFor();
  assert.doesNotMatch(await page.locator(".welcome-back").innerText(), /lost|failed|broke|shame/i);
  await check(page, "welcome back");
  await s("12-welcome-back");
  const later = (await api(page, "GET", `/api/mastery/${TREBLE}`)).body;
  assert.equal(later.state, "review_due");
  assert.equal(later.highestState, "proficient");
  assert.equal((await api(page, "GET", "/api/progress")).body.nodes[LESSON].state, "completed");
  assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

// =========================================================================================================================
// 2. iPad: reward + review in both orientations (learner prepared through the API, then used through the UI)
// =========================================================================================================================
async function seedLesson(page) {
  await api(page, "POST", `/api/lessons/${LESSON}/start`, {});
  const lesson = (await api(page, "GET", `/api/lessons/${LESSON}`)).body;
  const authored = curriculum.lessons.find((l) => l.content.lessonId === LESSON || l.content.id?.includes("g1-u3-l03")).content;
  const items = [...authored.guided, ...authored.independent];
  const node = ix.nodeById.get(LESSON);
  for (const li of lesson.items) {
    const item = items.find((i) => i.id === li.id);
    const binding = node.exercises.find((b) => b.templateId === item.templateId);
    const response = canonicalResponse(ix, item, effectiveScope(ix, node, binding));
    const r = await api(page, "POST", `/api/lessons/${LESSON}/attempts`, { attemptId: crypto.randomUUID(), itemId: li.id, response });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  return api(page, "POST", `/api/lessons/${LESSON}/complete`, {});
}

async function tablet(p) {
  await clock.set(START);
  const ctx = await browser.newContext({ ...p, baseURL: base, timezoneId: "Europe/London" });
  const { page, errors } = await newLearner(ctx, p.name);
  assert.equal((await seedLesson(page)).status, 200);
  await page.goto("/learn");
  await strip(page).waitFor();
  await check(page, `${p.name}: path`);
  await shot(page, `${p.name}-path`);
  await clock.advanceDays(1);
  await page.goto("/review");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await noOverflow(page, `${p.name}: review question`);
  await shot(page, `${p.name}-review-question`);
  await runReview(page, (_k, n) => (n === 0 ? "wrong" : "right"));
  await check(page, `${p.name}: review summary`);
  await shot(page, `${p.name}-review-summary`);
  await page.goto("/progress");
  await page.getByRole("heading", { name: "Badges" }).waitFor();
  await check(page, `${p.name}: progress`);
  await shot(page, `${p.name}-progress`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// =========================================================================================================================
// 3. Keyboard-only review, dark mode, reduced motion, sound off, 200% text
// =========================================================================================================================
async function keyboardOnly() {
  await clock.set(START);
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"], baseURL: base, timezoneId: "Europe/London", viewport: { width: 1100, height: 800 } });
  const { page } = await newLearner(ctx, "keys");
  await seedLesson(page);
  await clock.advanceDays(1);
  await page.goto("/review");
  const start = page.getByRole("button", { name: "Start review" });
  await start.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/review/session/**");
  const notes = await runReview(page, (_k, n) => (n === 0 ? "wrong" : "right"), "keys");
  assert.equal(notes.wrong, 1);
  await page.getByRole("link", { name: "Back to Review" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Keep what you've learned" }).waitFor();
  // The "why" detail is reachable and operable by keyboard.
  const why = page.locator("summary", { hasText: /^Why is it/ }).first();
  await why.focus();
  await page.keyboard.press("Enter");
  await page.getByText(/Practice-lab questions help you learn/).first().waitFor();
  await ctx.close();
}

async function darkAndReduced() {
  await clock.set(START);
  const ctx = await browser.newContext({ ...devices["iPhone 14"], baseURL: base, timezoneId: "Europe/London", colorScheme: "dark", reducedMotion: "reduce" });
  const { page } = await newLearner(ctx, "dark");
  await seedLesson(page);
  // The reward panel with motion reduced: the XP pop does not animate (duration collapses to ~0).
  await page.goto("/lesson/" + LESSON);
  const state = (await api(page, "GET", "/api/progress")).body.nodes[LESSON].state;
  assert.equal(state, "completed");
  await page.goto("/learn");
  await strip(page).waitFor();
  await check(page, "dark: path");
  await shot(page, "dark-path");
  await clock.advanceDays(1);
  await page.goto("/review");
  await page.getByRole("heading", { name: "Ready for review" }).waitFor();
  await check(page, "dark: review hub");
  await shot(page, "dark-review-hub");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await runReview(page);
  const dur = await page.locator(".xp-pop").evaluate((el) => getComputedStyle(el).animationDuration);
  assert.ok(parseFloat(dur) < 0.01, `XP pop animation is suppressed under reduced motion (got ${dur})`);
  await check(page, "dark: review summary");
  await shot(page, "dark-review-summary");
  await page.goto("/progress");
  await page.getByRole("heading", { name: "Badges" }).waitFor();
  await check(page, "dark: progress");
  await ctx.close();
}

async function soundOff() {
  await clock.set(START);
  const ctx = await browser.newContext({ ...devices["iPhone 14"], baseURL: base, timezoneId: "Europe/London" });
  await ctx.addInitScript(() => {
    window.__audioContexts = 0;
    for (const name of ["AudioContext", "webkitAudioContext"]) {
      const A = window[name];
      if (A) window[name] = class extends A { constructor(...a) { super(...a); window.__audioContexts++; } };
    }
  });
  const { page } = await newLearner(ctx, "silent", { ui: true });
  await api(page, "PATCH", "/api/me/profile", { settings: { sound: false } });
  await page.reload();
  await playLessonThroughUi(page);
  await page.getByText("+10 XP", { exact: true }).waitFor();
  await clock.advanceDays(1);
  await page.goto("/review");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await runReview(page);
  await page.getByText("+8 XP", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__audioContexts), 0, "no audio context is created while sound is off");
  await ctx.close();
}

async function largeText() {
  await clock.set(START);
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 320, height: 640 }, timezoneId: "Europe/London" });
  const { page } = await newLearner(ctx, "large");
  await seedLesson(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  await clock.advanceDays(1);
  for (const path of ["/learn", "/review", "/progress", "/settings"]) {
    await page.goto(path);
    await page.locator("main h1, main h2").first().waitFor();
    await page.waitForTimeout(300);
    await check(page, `${path} at 200% text`);
    // The six navigation destinations stay readable: nothing clipped, nothing overlapping its neighbour, all inside the screen.
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll(".tab")].map((t) => {
        const r = t.getBoundingClientRect();
        const label = t.querySelector(".tab-label");
        return { text: t.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom, clipped: label ? label.scrollWidth > label.clientWidth + 1 : false, words: (t.textContent ?? "").trim() };
      }),
    );
    assert.equal(tabs.length, 6, `${path}: six destinations`);
    for (const t of tabs) {
      assert.ok(t.l >= -1 && t.r <= 321, `${path}: tab "${t.text}" inside the screen`);
      assert.ok(!t.clipped, `${path}: tab "${t.text}" label not clipped`);
    }
    for (let i = 0; i < tabs.length; i++)
      for (let j = i + 1; j < tabs.length; j++) {
        const a = tabs[i];
        const b = tabs[j];
        const overlap = a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
        assert.ok(!overlap, `${path}: tabs "${a.text}" and "${b.text}" overlap at 200% text`);
      }
    // Every word of every label fits its own cell (a long word is never split across cells).
    const longest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".tab .tab-label")].map((s) => s.scrollWidth - s.clientWidth)));
    assert.ok(longest <= 1, `${path}: a tab label overflows its cell by ${longest}px`);
  }
  await page.goto("/review");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.waitForURL("**/review/session/**");
  await noOverflow(page, "review question at 200% text");
  await runReview(page, (_k, n) => (n === 0 ? "wrong" : "right"));
  await check(page, "review summary at 200% text");
  await ctx.close();
}

async function settingsGoal() {
  await clock.set(START);
  const ctx = await browser.newContext({ ...devices["iPhone 14"], baseURL: base, timezoneId: "Europe/London" });
  const { page } = await newLearner(ctx, "goal");
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Daily goal" }).waitFor();
  await page.getByLabel("2", { exact: true }).check();
  await page.getByText("Saved.").waitFor();
  assert.equal((await api(page, "GET", "/api/me")).body.profile.dailyGoal, 2);
  await page.getByLabel("Off", { exact: true }).check();
  await page.getByText("Saved.").waitFor();
  await page.goto("/learn");
  await page.getByRole("region", { name: "Your rewards" }).waitFor();
  assert.equal(await page.getByText(/Daily goal/).count(), 0, "the goal and streak are hidden when switched off");
  assert.equal((await api(page, "GET", "/api/me")).body.profile.timezone, "Europe/London");
  await check(page, "settings goal off");
  await ctx.close();
}

async function preferencesCombine() {
  await clock.set(START);
  const ctx = await browser.newContext({ ...devices["iPhone 14"], baseURL: base, timezoneId: "Europe/London" });
  const { page } = await newLearner(ctx, "prefs");
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Look and feel" }).waitFor();
  const settled = () => page.getByText("Saved.").waitFor();
  await page.getByLabel("Dark", { exact: true }).check();
  await settled();
  await page.waitForTimeout(1300);
  await page.getByLabel("Reduce", { exact: true }).check();
  await page.waitForTimeout(1300);
  await page.getByRole("switch", { name: /Play sounds/ }).uncheck();
  await page.waitForTimeout(1300);
  const want = { theme: "dark", motion: "reduce", sound: false };
  assert.deepEqual((await api(page, "GET", "/api/me")).body.profile.settings, want);
  await page.reload();
  await page.getByRole("heading", { name: "Look and feel" }).waitFor();
  assert.equal(await page.getByLabel("Dark", { exact: true }).isChecked(), true, "dark survives the other changes and a reload");
  assert.equal(await page.getByLabel("Reduce", { exact: true }).isChecked(), true, "reduced motion survives");
  assert.equal(await page.getByRole("switch", { name: /Play sounds/ }).isChecked(), false, "sound-off survives");
  assert.deepEqual(await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, motion: document.documentElement.dataset.motion })), { theme: "dark", motion: "reduce" });
  await ctx.close();
}

const profiles = [
  { name: "iphone", ...devices["iPhone 14"] },
  { name: "small-phone-320", viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];
const tablets = [
  { name: "ipad-portrait", ...devices["iPad (gen 7)"] },
  { name: "ipad-landscape", ...devices["iPad (gen 7) landscape"] },
];

async function run(name, fn) {
  try {
    await fn();
    log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}: ${e.stack ?? e}`);
  }
}
for (const p of profiles) await run(`acceptance journey: ${p.name}`, () => acceptance(p));
for (const p of tablets) await run(`reward and review: ${p.name}`, () => tablet(p));
await run("keyboard-only review", keyboardOnly);
await run("dark mode + reduced motion", darkAndReduced);
await run("sound off: no audio is ever started", soundOff);
await run("200% text at 320px", largeText);
await run("daily goal settings and timezone", settingsGoal);
await run("dark mode, reduced motion and sound-off combine and persist", preferencesCombine);

await browser.close();
server.kill();
if (failures) {
  console.error(`${failures} Brief 04 journey(s) failed`);
  process.exit(1);
}
console.log("All Brief 04 browser journeys passed");
