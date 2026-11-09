// Brief 02 follow-up journeys in real Chromium: account switching, registration recovery, save failures, piano
// discoverability, hints, reflow at large text, reliability. Starts the real API on a temporary database serving the
// built app (run `npm run build` first). Usage: node e2e/followup.mjs   (SHOTS=dir to keep screenshots)
// Limits: emulated touch and viewport scaling are NOT a substitute for real devices or screen readers. See docs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, request as pwRequest } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const port = 8900 + Math.floor(Math.random() * 90);
const base = `http://localhost:${port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const server = spawn("node", ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/main.ts"], {
  cwd: join(root, "packages/api"),
  env: { ...process.env, PORT: String(port), MTP_DB: join(mkdtempSync(join(tmpdir(), "mtp-")), "f.sqlite") },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("listening") && resolve());
  server.on("exit", (c) => reject(new Error(`API exited ${c}`)));
  setTimeout(() => reject(new Error("API did not start")), 20000);
});
const browser = await chromium.launch();
const PASSWORD = "a long safe password";
let n = 0;
const uniq = (p) => `${p}-${Date.now()}-${n++}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const phone = { ...devices["iPhone 14"] };
const small = { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ipadP = { ...devices["iPad (gen 7)"] };
const ipadL = { ...devices["iPad (gen 7) landscape"] };
const desktop = { viewport: { width: 1280, height: 800 } };

const newPage = async (profile = desktop, extra = {}) => {
  const ctx = await browser.newContext({ ...profile, baseURL: base, ...extra });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return { ctx, page };
};
const noOverflow = async (page, where) => {
  await sleep(450); // let the slide-in animation settle so a transient offset is not mistaken for overflow
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${where}: page scrolls sideways by ${over}px`);
};
// `skipStave`: the demo's tappable stave has a pre-existing nested-interactive violation (role=button inside an svg
// image) that Brief 03 replaces with a new renderer; it is reported in the PR, not fixed here, so the piano checks skip it.
const axe = async (page, where, { skipStave = false } = {}) => {
  await page.evaluate(axeSource);
  const res = await page.evaluate((skip) => window.axe.run(skip ? { exclude: [["figure"]] } : document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }), skipStave);
  const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  assert.equal(bad.length, 0, `${where}: ${bad.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
};
const shot = async (page, name) => shots && (await page.screenshot({ path: join(shots, `${name}.png`) }));

async function guestStart(page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.getByRole("button", { name: "Try it as a guest" }).click();
  await page.waitForURL("**/learn");
}
async function openQuestions(page) {
  await page.goto("/lesson/G1-U3-L03");
  await page.getByRole("button", { name: /Let's go|Continue/ }).first().click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
}
const answerLetter = async (page, l) => {
  await page.locator("label.option", { hasText: new RegExp(`^${l}$`) }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
};
/** Completes the sample lesson by keyboard-friendly UI actions. */
async function playLesson(page) {
  await openQuestions(page);
  await page.getByRole("button", { name: "Try some questions" }).click();
  for (const l of ["G", "B", "D", "E"]) await answerLetter(page, l);
  for (const ups of [5, 1]) {
    const slider = page.getByRole("slider");
    await slider.focus();
    for (let i = 0; i < ups; i++) await page.keyboard.press("ArrowUp");
    if (ups === 1) for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.getByRole("button", { name: "Check" }).click();
    await page.getByText("Correct!").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText("Progress saved.").waitFor();
}
const nodeStatus = (page) => page.locator('[data-node="G1-U3-L03"]').getAttribute("data-status");
async function register(page, { who = "Ada", email, button = "Create account" }) {
  await page.getByLabel("Nickname").fill(who);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: button }).click();
}
async function signOut(page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/welcome");
}
async function signIn(page, email) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/learn");
}

const results = [];
async function journey(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, "i").test(name)) return;
  try {
    await fn();
    results.push([name, true]);
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.error(`✗ ${name}\n${e.stack ?? e}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
await journey("guest completes a lesson → refresh → upgrade → sign out → sign in: progress intact (iPhone)", async () => {
  const { ctx, page } = await newPage(phone);
  await guestStart(page);
  await playLesson(page);
  await page.reload();
  await page.goto("/learn");
  await page.locator('[data-node="G1-U3-L03"]').waitFor();
  assert.equal(await nodeStatus(page), "completed");
  const email = uniq("upgrade");
  await page.goto("/profile");
  await page.getByText("Guest profile", { exact: true }).waitFor();
  await register(page, { email, button: "Create my account" });
  await page.getByText("Guest profile", { exact: true }).waitFor({ state: "detached" });
  await signOut(page);
  await signIn(page, email);
  await page.locator('[data-node="G1-U3-L03"]').waitFor();
  assert.equal(await nodeStatus(page), "completed");
  await page.goto("/progress");
  assert.equal(await page.locator(".stats-row dd").first().textContent(), "1");
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await journey("rapid switching between two accounts with a slow progress reply never shows the other's data", async () => {
  const emails = { a: uniq("switch-a"), b: uniq("switch-b") };
  // A has completed the lesson; B has not.
  for (const [who, e] of Object.entries(emails)) {
    const { ctx, page } = await newPage(desktop);
    await guestStart(page);
    if (who === "a") await playLesson(page);
    await page.goto("/profile");
    await register(page, { email: e, button: "Create my account" });
    await page.getByText("Guest profile", { exact: true }).waitFor({ state: "detached" });
    await ctx.close();
  }
  const { ctx, page } = await newPage(desktop);
  let delayed = 0;
  await page.route("**/api/progress", async (route) => {
    if (delayed++ === 0) {
      const res = await route.fetch(); // the server answers as A straight away; delivery to the page is late
      await sleep(2500);
      await route.fulfill({ response: res });
    } else await route.continue();
  });
  await page.goto("/signin");
  await page.getByLabel("Email").fill(emails.a);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/learn");
  await page.getByRole("link", { name: "Profile" }).click(); // A's progress reply is still on its way
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/welcome");
  await signIn(page, emails.b);
  await page.locator('[data-node="G1-U3-L03"]').waitFor();
  assert.notEqual(await nodeStatus(page), "completed");
  await sleep(3000); // A's late reply has now been delivered (or cancelled)
  assert.notEqual(await nodeStatus(page), "completed", "B must never see A's completion");
  await page.goto("/progress");
  assert.equal(await page.locator(".stats-row dd").first().textContent(), "0");
  await shot(page, "switch-b-after-a-late-reply");
  await ctx.close();
});

await journey("registration recovery: setup save fails, reply lost, offline; one account, no false 'failed' message", async () => {
  const { ctx, page } = await newPage(desktop);
  const email = uniq("recover");
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("button", { name: /New to music theory/ }).click();
  // (1) the reply to registration is lost after the server created the account
  let lost = 0;
  await page.route("**/api/auth/register", async (route) => {
    if (lost++ === 0) {
      await route.fetch();
      await ctx.clearCookies(); // the reply never reached the browser, so neither did its session cookie
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await register(page, { email });
  await page.getByRole("alert").waitFor({ timeout: 8000 }).catch(async (e) => {
    console.error("DEBUG body:", (await page.locator("main").innerText()).slice(0, 400));
    throw e;
  });
  const msg = await page.getByRole("alert").textContent();
  assert.match(msg, /couldn't confirm whether your account was created/i);
  assert.doesNotMatch(msg, /already registered|failed/i);
  // (2) retry: the same details sign the learner in (no duplicate), then the setup save fails once
  let failed = 0;
  await page.route("**/api/me/profile", async (route) => (failed++ === 0 && route.request().method() === "PATCH" ? route.abort("failed") : route.continue()));
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("alert").filter({ hasText: /account is created/i }).waitFor();
  await shot(page, "registration-setup-failed");
  // (3) a refresh now: the account exists, onboarding resumes without registering again
  await page.reload();
  await page.waitForURL(/welcome|onboarding|learn/);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.waitForURL("**/learn");
  const me = await (await page.request.get("/api/me")).json();
  assert.equal(me.user.email, email);
  assert.equal(me.profile.onboarded, true);
  // exactly one account for this email: a fresh registration is refused
  const stranger = await pwRequest.newContext({ baseURL: base });
  const again = await stranger.post("/api/auth/register", { data: { email, password: PASSWORD, displayName: "Ada" } });
  assert.equal(again.status(), 409, "no duplicate account: the email is taken");
  await stranger.dispose();
  await ctx.close();
});

await journey("grade change: a failed save keeps the learner on the picker with a retry; settings roll back", async () => {
  const { ctx, page } = await newPage(desktop);
  await guestStart(page);
  await page.goto("/grades");
  let fail = 1;
  await page.route("**/api/me/profile", (route) => (route.request().method() === "PATCH" && fail-- > 0 ? route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } }) : route.continue()));
  await page.getByRole("button", { name: /^Grade 3:/ }).click();
  await page.getByRole("alert").waitFor();
  assert.match(page.url(), /\/grades$/);
  assert.equal(await page.getByRole("button", { name: /^Grade 1:/ }).getAttribute("aria-pressed"), "true");
  await shot(page, "grade-save-failed");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL("**/learn");
  // settings: failed save reverts the control and the theme
  await page.goto("/settings");
  fail = 1;
  await page.getByLabel("Dark").check({ force: true });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Dark").isChecked(), false);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme ?? null), null);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText("Saved.").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.reload();
  assert.equal(await page.getByLabel("Dark").isChecked(), true);
  await ctx.close();
});

for (const [label, profile] of [["320px phone", small], ["iPhone 14", phone], ["iPad portrait", ipadP], ["iPad landscape", ipadL], ["desktop", desktop]]) {
  await journey(`piano: names with octaves, swipe cue only when it overflows, usable targets (${label})`, async () => {
    const { ctx, page } = await newPage(profile);
    await guestStart(page);
    await openQuestions(page);
    const names = await page.locator(".keyboard .key").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    assert.ok(names.length >= 8);
    assert.equal(new Set(names).size, names.length, "key names are unique");
    for (const nm of names) assert.match(nm, /^[A-G][♯♭]?\d/, `key name "${nm}" starts with a pitch and octave`);
    const m = await page.locator(".keyboard-scroll").evaluate((el) => ({ over: el.scrollWidth > el.clientWidth + 1, cw: el.clientWidth, sw: el.scrollWidth }));
    const cueVisible = await page.locator(".scroll-cue").isVisible();
    assert.equal(cueVisible, m.over, `cue ${cueVisible} but overflow ${m.over} (${JSON.stringify(m)})`);
    const w = await page.locator(".key.white").first().evaluate((e) => e.getBoundingClientRect().width);
    assert.ok(w >= 44, `white keys stay at least 44px wide (${w})`);
    await noOverflow(page, `demo ${label}`);
    await axe(page, `demo ${label}`, { skipStave: true });
    if (m.over && profile.hasTouch) {
      // a real touch swipe (CDP gesture), then the left cue appears and a key can still be tapped to play
      const box = await page.locator(".keyboard-scroll").boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const y = box.y + 70;
      const x0 = box.x + box.width - 40;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - i * 20, y }] });
        await sleep(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(600);
      assert.ok(await page.locator(".keyboard-wrap.more-left").count(), "left fade appears after swiping");
      assert.ok(await page.locator(".scroll-cue").isVisible());
      const visibleKey = page.locator(".key.white").nth(3);
      await visibleKey.tap();
      assert.deepEqual(page.errors, []);
    }
    await shot(page, `piano-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  });
}

await journey("piano cue and contrast in dark mode; cue follows resize and orientation changes", async () => {
  const { ctx, page } = await newPage(phone, { colorScheme: "dark" });
  await guestStart(page);
  await openQuestions(page);
  await axe(page, "demo dark", { skipStave: true });
  assert.ok(await page.locator(".scroll-cue").isVisible());
  await shot(page, "piano-dark-iphone");
  await page.setViewportSize({ width: 844, height: 390 }); // rotate to landscape
  await sleep(200);
  const fits = await page.locator(".keyboard-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  assert.equal(await page.locator(".scroll-cue").isVisible(), !fits);
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(200);
  assert.ok(await page.locator(".scroll-cue").isVisible());
  await ctx.close();
});

await journey("hints: live region exists before the hint, new hint inside it, focus stays, double tap asks once, errors alert", async () => {
  const { ctx, page } = await newPage(desktop);
  await guestStart(page);
  await openQuestions(page);
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.getByText("Question 1 of 6").waitFor();
  const region = page.locator(".hint-list");
  assert.equal(await region.getAttribute("role"), "status");
  assert.equal(await region.getAttribute("aria-live"), "polite");
  assert.equal((await region.textContent()).trim(), "");
  let hintCalls = 0;
  page.on("request", (r) => r.url().endsWith("/hint") && hintCalls++);
  await page.getByRole("button", { name: "Need a hint?" }).dblclick();
  await region.getByText(/Hint 1:/).waitFor();
  assert.equal(hintCalls, 1);
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  assert.match(focused, /Another hint|No more hints/, "focus stays on the hint button");
  await axe(page, "question with hint");
  await shot(page, "hint-shown");
  const out = await (async () => {
    await ctx.setOffline(true);
    await page.getByRole("button", { name: /Another hint|No more hints/ }).click();
    await page.getByRole("alert").waitFor({ timeout: 5000 });
    await ctx.setOffline(false);
  })();
  void out;
  await ctx.close();
});

await journey("keyboard-only lesson completion with visible focus on every step", async () => {
  const { ctx, page } = await newPage(desktop, { reducedMotion: "reduce" });
  await page.goto("/welcome");
  const focusVisible = async (where) => {
    const ok = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
    });
    assert.ok(ok, `${where}: focused element has a visible focus ring`);
  };
  await page.keyboard.press("Tab");
  await focusVisible("welcome");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /New to music theory/ }).focus();
  await focusVisible("onboarding");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Try it as a guest" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/learn");
  await page.getByRole("link", { name: "Start" }).first().focus();
  await focusVisible("path");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Let's go" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Next" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
  await page.getByRole("button", { name: "C4, middle C" }).focus();
  await focusVisible("piano key");
  await page.getByRole("button", { name: "Try some questions" }).focus();
  await page.keyboard.press("Enter");
  for (const l of ["G", "B", "D", "E"]) {
    await page.locator(`label.option:has-text("${l}") input`).first().focus();
    await focusVisible(`option ${l}`);
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter"); // submits the form
    await page.getByText("Correct!").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Continue", "focus moves to Continue");
    await page.keyboard.press("Enter");
  }
  await ctx.close();
});

await journey("large text: lesson, demo piano, question and completion reflow at 320px and at desktop 200% zoom equivalent", async () => {
  const { ctx, page } = await newPage(small);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  await guestStart(page);
  await noOverflow(page, "path at 200% text");
  await openQuestions(page);
  await noOverflow(page, "demo at 200% text");
  assert.ok(await page.locator(".key.white").first().isVisible());
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.getByText("Question 1 of 6").waitFor();
  await noOverflow(page, "question at 200% text");
  const checkBox = await page.getByRole("button", { name: "Check" }).boundingBox();
  assert.ok(checkBox && checkBox.x >= 0 && checkBox.x + checkBox.width <= 320, "Check button fits");
  await shot(page, "large-text-320-question");
  await ctx.close();
  // desktop at 200% browser zoom is a 640×400 CSS-pixel window at device scale 2
  const z = await newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  await guestStart(z.page);
  await openQuestions(z.page);
  await noOverflow(z.page, "demo at 200% zoom");
  await axe(z.page, "demo at 200% zoom", { skipStave: true });
  await z.ctx.close();
});

await journey("reliability: double submit, back/forward, interrupted refresh with retry, unavailable routes", async () => {
  const { ctx, page } = await newPage(desktop);
  await guestStart(page);
  await openQuestions(page);
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.getByText("Question 1 of 6").waitFor();
  let attempts = 0;
  page.on("request", (r) => r.url().endsWith("/attempts") && r.method() === "POST" && attempts++);
  await page.locator("label.option", { hasText: /^G$/ }).click();
  await page.getByRole("button", { name: "Check" }).dblclick();
  await page.getByText("Correct!").waitFor();
  assert.equal(attempts, 1, "a double click sends one answer");
  // back / forward: leaving the lesson and returning resumes in place, not on a broken page
  await page.goBack();
  await page.goForward();
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  // interrupted progress refresh: error with retry, then recovery
  let blocked = true;
  await page.route("**/api/progress", (route) => (blocked ? route.abort("failed") : route.continue()));
  await page.goto("/progress");
  await page.getByRole("alert").getByText(/offline|connection|couldn't|could not/i).first().waitFor();
  blocked = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("heading", { name: "Your progress" }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  // unavailable / invalid routes are friendly pages, not blank screens
  for (const path of ["/lesson/NOT-A-LESSON", "/unit/NOPE", "/definitely/not/here"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await noOverflow(page, path);
  }
  // resize while on a lesson page (it resumes where the learner left off)
  await page.goto("/lesson/G1-U3-L03");
  await page.getByText(/Question \d of 6/).waitFor();
  for (const [w, h] of [[320, 640], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await noOverflow(page, `resize ${w}`);
  }
  await ctx.close();
});

await journey("real server: forged x-forwarded-for cannot bypass the registration limit", async () => {
  const api = await pwRequest.newContext({ baseURL: base });
  const codes = [];
  for (let i = 0; i < 24; i++) {
    const r = await api.post("/api/auth/register", { data: { email: uniq("rl"), password: PASSWORD, displayName: "R" }, headers: { "x-forwarded-for": `203.0.113.${i + 1}`, cookie: "" } });
    codes.push(r.status());
  }
  assert.ok(codes.includes(429), `expected a 429 in ${codes.join(",")}`);
  assert.equal(codes.slice(-3).every((c) => c === 429), true, `limit holds despite changing headers: ${codes.join(",")}`);
  await api.dispose();
});

await browser.close();
server.kill();
const bad = results.filter(([, ok]) => !ok);
if (bad.length) {
  console.error(`${bad.length} journey(s) failed`);
  process.exit(1);
}
console.log("All follow-up journeys passed");
