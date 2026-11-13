// End-to-end student journeys in real Chromium across phone, small phone, tablet and desktop.
// Starts the real API (temporary SQLite DB) serving the built web app, so run `npm run build` first.
// Usage: node e2e/run.mjs   (SHOTS=dir to save screenshots; HEADED not supported in CI)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const port = 8800 + Math.floor(Math.random() * 100);
const base = `http://localhost:${port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");

const server = spawn("node", ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/main.ts"], {
  cwd: join(root, "packages/api"),
  env: { ...process.env, MTP_CONTENT_ROOT: join(root, "packages/api/test/fixtures/legacy-content"), PORT: String(port), MTP_DB: join(mkdtempSync(join(tmpdir(), "mtp-")), "e2e.sqlite") },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("listening") && resolve());
  server.on("exit", (c) => reject(new Error(`API exited ${c}`)));
  setTimeout(() => reject(new Error("API did not start")), 20000);
});

const profiles = [
  { name: "iphone", ...devices["iPhone 14"] },
  { name: "small-phone-320", viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "ipad", ...devices["iPad (gen 7)"] },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
];

const browser = await chromium.launch();
let failures = 0;
const log = (...a) => console.log(...a);

async function noOverflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${where}: page scrolls sideways by ${over}px`);
}
async function axe(page, where) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
  const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  assert.equal(bad.length, 0, `${where}: accessibility violations: ${bad.map((v) => `${v.id} (${v.nodes[0]?.target})`).join(", ")}`);
}
async function shot(page, profile, name) {
  if (shots) await page.screenshot({ path: join(shots, `${profile}-${name}.png`) });
}

async function journey(p) {
  const ctx = await browser.newContext({ ...p, baseURL: base, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const email = `student-${p.name}-${Date.now()}@example.com`;

  // Welcome → onboarding → account
  await page.goto("/");
  await page.waitForURL("**/welcome");
  await noOverflow(page, "welcome");
  await axe(page, "welcome");
  await shot(page, p.name, "01-welcome");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.getByLabel("Nickname").fill("Ada");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long safe password");
  await noOverflow(page, "onboarding account");
  await axe(page, "onboarding");
  await shot(page, p.name, "02-save-progress");
  await page.getByRole("button", { name: "Create account" }).click();

  // Learning path
  await page.waitForURL("**/learn");
  const next = page.getByRole("region", { name: /Treble clef: notes on the lines/ });
  await next.waitFor();
  await noOverflow(page, "path");
  await axe(page, "path");
  await page.locator('[data-node="G1-U3-L03"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, p.name, "03-path");
  assert.equal(await page.locator('[data-node="G1-U3-L03"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G1-U1-L01"]').getAttribute("data-status"), "coming_soon");

  // Coming-soon node explains itself (no dead end)
  await page.locator('[data-node="G1-U1-L01"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G1-U1-L01"]').click();
  await page.getByRole("dialog").getByText(/still being written/).waitFor();
  await shot(page, p.name, "04-coming-soon-sheet");
  await page.keyboard.press("Escape");

  // Lesson: intro → teach → demo
  await page.getByRole("link", { name: "Start" }).first().click();
  await page.waitForURL("**/lesson/G1-U3-L03");
  await page.getByRole("heading", { name: "Treble clef: notes on the lines" }).waitFor();
  await noOverflow(page, "lesson intro");
  await shot(page, p.name, "05-lesson-intro");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("heading", { name: "Here's the idea" }).waitFor();
  await noOverflow(page, "teach");
  await shot(page, p.name, "06-teach");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
  await page.getByRole("button", { name: /^G\d$/ }).first().click(); // keys are named by pitch and octave, e.g. "G4"
  await noOverflow(page, "demo");
  await shot(page, p.name, "07-demo");
  await page.getByRole("button", { name: "Try some questions" }).click();

  // Q1: wrong, then right
  await page.getByText("Question 1 of 6").waitFor();
  await noOverflow(page, "question");
  await page.locator("label.option", { hasText: /^D$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Not quite").waitFor();
  await page.getByText(/counted from the bottom/i).waitFor();
  await shot(page, p.name, "08-feedback-try-again");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator("label.option", { hasText: /^G$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await shot(page, p.name, "09-feedback-correct");
  await page.getByRole("button", { name: "Continue" }).click();

  // Q2 (hint, answer), then interrupt
  await page.getByText("Question 2 of 6").waitFor();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.getByText(/skip a letter|G is the line below/).waitFor();
  await page.locator("label.option", { hasText: /^B$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Question 3 of 6").waitFor();
  await page.getByRole("button", { name: /Close lesson/ }).click();
  await page.waitForURL("**/learn");
  await page.getByText("Pick up where you left off").waitFor();
  await shot(page, p.name, "10-path-in-progress");

  // Resume exactly at Q3, even after a full reload
  await page.reload();
  await page.getByRole("link", { name: "Continue" }).first().click();
  await page.getByText("Question 3 of 6").waitFor();
  await page.locator("label.option", { hasText: /^D$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Question 4 of 6").waitFor();
  await page.locator("label.option", { hasText: /^E$/ }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Q5, Q6: place a note on the stave with the keyboard
  await page.getByText("Question 5 of 6").waitFor();
  const slider = page.getByRole("slider");
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp"); // 4 (middle) +4 = top line
  assert.match(await slider.getAttribute("aria-valuetext"), /5th line/);
  await noOverflow(page, "stave picker");
  await shot(page, p.name, "11-stave-picker");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Question 6 of 6").waitFor();
  await page.getByRole("slider").focus();
  await page.keyboard.press("ArrowUp"); // first press places the note on the middle line
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // second line up: G
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();

  // Completion
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText("Progress saved.").waitFor();
  await noOverflow(page, "complete");
  await axe(page, "complete");
  await shot(page, p.name, "12-complete");
  await page.getByRole("link", { name: "Back to the path" }).click();
  await page.waitForURL("**/learn");
  await page.locator('[data-node="G1-U3-L03"]').waitFor();
  assert.equal(await page.locator('[data-node="G1-U3-L03"]').getAttribute("data-status"), "completed");
  await page.locator('[data-node="G1-U3-L03"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, p.name, "13-path-completed");

  // Progress, profile, settings, unit overview
  await page.goto("/progress");
  await page.getByRole("heading", { name: "Your progress" }).waitFor();
  assert.equal(await page.locator(".stats-row dd").first().textContent(), "1");
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await shot(page, p.name, "14-progress");
  await page.goto("/unit/G1-U3");
  await page.getByRole("heading", { name: /Keyboard and stave|stave/i }).first().waitFor();
  await noOverflow(page, "unit");
  await axe(page, "unit");
  await shot(page, p.name, "15-unit");
  await page.goto("/settings");
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByLabel("Dark").check();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await noOverflow(page, "settings");
  await shot(page, p.name, "16-settings-dark");
  await page.goto("/learn");
  await page.locator(".next-card").waitFor();
  await shot(page, p.name, "17-path-dark");
  await page.goto("/profile");
  await axe(page, "profile (dark)");
  await page.goto("/settings");
  await page.getByLabel("Light").check();

  // Persistence across sign-out / sign-in
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/welcome");
  await page.getByRole("link", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a long safe password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/learn");
  await page.locator('[data-node="G1-U3-L03"][data-status="completed"]').waitFor();

  // Invalid routes
  await page.goto("/nope");
  await page.getByRole("heading", { name: /can't find that page/ }).waitFor();
  await page.goto("/unit/NOPE");
  await page.getByRole("heading", { name: /can't find that unit/ }).waitFor();
  await page.goto("/lesson/NOPE");
  await page.getByRole("heading", { name: /can't find that lesson/ }).waitFor();
  await page.goto("/lesson/G1-U1-L01");
  await page.getByRole("heading", { name: "Coming soon" }).waitFor();

  assert.deepEqual(errors, [], `console errors on ${p.name}`);
  await ctx.close();
}

for (const p of profiles) {
  try {
    await journey(p);
    log(`✓ ${p.name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${p.name}: ${e.stack ?? e}`);
  }
}

// Keyboard-only, reduced motion, 400% zoom equivalent (320px at 2x text), offline retry, guest upgrade
async function extras() {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/welcome");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Get started");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: /New to music theory/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Try it as a guest" }).click();
  await page.waitForURL("**/learn");
  // reduced motion: no running animations on the path
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length);
  assert.equal(running, 0, "infinite animations should not run with reduced motion");

  // Guest completes nothing but upgrades; the guest session is the same learner
  await page.goto("/profile");
  await page.getByText("Guest profile", { exact: true }).waitFor();
  await page.getByLabel("Nickname").fill("Grace");
  await page.getByLabel("Email").fill(`guest-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("another long password");
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByText("Guest profile", { exact: true }).waitFor({ state: "detached" });
  await page.getByRole("heading", { name: "Grace" }).waitFor();

  // Offline during an answer: nothing is lost, retry works
  await page.goto("/lesson/G1-U3-L03");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.locator("label.option", { hasText: /^G$/ }).click();
  await ctx.setOffline(true);
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText(/didn't send/).waitFor({ timeout: 10000 });
  await ctx.setOffline(false);
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct!").waitFor();
  await ctx.close();

  // 320px wide at 200% text size still reflows without sideways scrolling
  const small = await browser.newContext({ baseURL: base, viewport: { width: 320, height: 568 } });
  const sp = await small.newPage();
  await sp.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  await sp.goto("/welcome");
  await noOverflow(sp, "welcome at 200% text");
  await sp.getByRole("link", { name: "Get started" }).click();
  await noOverflow(sp, "onboarding at 200% text");
  await small.close();
}
// Signed-in screens at 320px with text enlarged to 200%: no sideways scroll, no clipped tabs, no label on top of a button
async function largeText() {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.getByRole("button", { name: "Try it as a guest" }).click();
  await page.waitForURL("**/learn");
  for (const path of ["/learn", "/grades", "/unit/G1-U3", "/progress", "/profile", "/settings"]) {
    await page.goto(path);
    await page.locator("main h1, main h2").first().waitFor();
    await page.waitForTimeout(300);
    await noOverflow(page, `${path} at 200% text`);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll(".tab")].filter((t) => {
        const r = t.getBoundingClientRect();
        return t.scrollWidth > t.clientWidth + 1 || r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
      }).map((t) => t.textContent),
    );
    assert.deepEqual(clipped, [], `${path}: tab labels clipped at 200% text`);
  }
  await page.goto("/learn");
  await page.locator(".node-label").first().waitFor();
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".node-slot")].map((slot) => ({
      id: slot.querySelector("[data-node]")?.getAttribute("data-node"),
      node: slot.querySelector(".node").getBoundingClientRect(),
      label: slot.querySelector(".node-label").getBoundingClientRect(),
    }));
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const out = [];
    for (const a of boxes) for (const b of boxes) {
      if (a !== b && (hit(a.label, b.node) || hit(a.label, b.label))) out.push(`${a.id} label over ${b.id}`);
    }
    return out;
  });
  assert.deepEqual(overlaps, [], "path labels overlap other nodes at 200% text");
  await ctx.close();
}

// Each grade world has its own palette, in light and dark, with readable contrast
async function palettes() {
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ baseURL: base, viewport: { width: 400, height: 800 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /already know some theory/ }).click();
    await page.locator(".grade-card").first().waitFor();
    const badges = await page.$$eval(".grade-num", (els) => els.map((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, fg: c.color }; }));
    assert.equal(badges.length, 5);
    assert.equal(new Set(badges.map((b) => b.bg)).size, 5, `${scheme}: grade worlds share a colour: ${badges.map((b) => b.bg)}`);
    for (const b of badges) assert.ok(contrast(rgb(b.bg), rgb(b.fg)) >= 4.5, `${scheme}: low contrast ${b.fg} on ${b.bg}`);
    await ctx.close();
  }
}

try {
  await largeText();
  log("✓ signed-in screens at 200% text");
} catch (e) {
  failures++;
  console.error(`✗ large text: ${e.stack ?? e}`);
}
try {
  await palettes();
  log("✓ five distinct world palettes (light and dark)");
} catch (e) {
  failures++;
  console.error(`✗ palettes: ${e.stack ?? e}`);
}
try {
  await extras();
  log("✓ keyboard / reduced motion / guest upgrade / offline retry / large text");
} catch (e) {
  failures++;
  console.error(`✗ extras: ${e.stack ?? e}`);
}

await browser.close();
server.kill();
if (failures) {
  console.error(`${failures} journey(s) failed`);
  process.exit(1);
}
log("All end-to-end journeys passed");
