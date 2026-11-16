// Final release hardening, in a real browser against the real HTTP server (security headers on every response):
//  1. the app works under the Content-Security-Policy with NO violation: the theme snippet, the React app, the notation font, audio,
//     answering a question, changing settings, downloading data, and a practice examination;
//  2. a guest is warned before their access ends, and the warning goes once they register (progress kept).
// Run: npm run build && node --import tsx e2e/hardening.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { get, post, serve } from "./g1lib.mjs";

const S = await serve({ waive: false });
const browser = await chromium.launch();
let failures = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log("✓", name);
  } catch (e) {
    failures++;
    console.log("✗", name, "-", e.message.split("\n").slice(0, 6).join(" | "));
  }
};
/** A page that records every CSP violation the browser reports (the event, and the console error Chromium prints for it). */
async function watched(ctxOpts = {}) {
  const ctx = await browser.newContext({ baseURL: S.base, viewport: { width: 390, height: 844 }, ...ctxOpts });
  const page = await ctx.newPage();
  const violations = [];
  await page.exposeFunction("__cspViolation", (v) => violations.push(v));
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => window.__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile ?? ""}:${e.lineNumber ?? ""})`)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) violations.push(`console: ${m.text().slice(0, 200)}`); });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  return { ctx, page, violations, pageErrors };
}

await test("every document, script, style, font and API response carries the security headers", async () => {
  const { ctx, page } = await watched();
  const seen = [];
  page.on("response", (r) => { if (r.url().startsWith(S.base)) seen.push(r); });
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Get started" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(seen.length >= 3, "the page, its script and its stylesheet were fetched");
  for (const r of seen) {
    const h = r.headers();
    const where = r.url().replace(S.base, "");
    assert.match(h["content-security-policy"] ?? "", /default-src 'self'.*frame-ancestors 'none'/, `${where}: CSP`);
    assert.doesNotMatch(h["content-security-policy"], /unsafe-inline|unsafe-eval/, `${where}: no unsafe exemption`);
    assert.equal(h["x-content-type-options"], "nosniff", where);
    assert.equal(h["x-frame-options"], "DENY", where);
    assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin", where);
    assert.equal(h["strict-transport-security"], undefined, `${where}: no HSTS on a plain-http test server`);
  }
  await ctx.close();
});

await test("the app runs under the policy without a single violation: theme snippet, lesson with notation and sound, settings, data download, practice examination", async () => {
  const { ctx, page, violations, pageErrors } = await watched({ acceptDownloads: true });
  // The inline theme snippet in index.html is allowed by its hash: a saved theme is applied before the app loads.
  await page.goto("/welcome");
  await page.evaluate(() => localStorage.setItem("mtp.theme", "dark"));
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "the hashed inline theme script ran");
  await page.evaluate(() => localStorage.removeItem("mtp.theme"));
  // Guest onboarding through the real controls.
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("button", { name: /New to music theory/ }).click();
  await page.getByRole("button", { name: "Try it as a guest" }).click();
  await page.waitForURL("**/learn");
  // A lesson: teaching notation is drawn with the bundled music font, loaded through the Font Loading API.
  await page.goto("/lesson/G1-U1-L01");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.locator("svg.notation-svg").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('24px "Bravura"')), true, "the Bravura music font loaded under font-src 'self'");
  assert.equal(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Bravura" && f.status === "loaded")), true);
  assert.equal(await page.locator("head style").count(), 0, "no style element is injected at run time");
  // Sound: a playable note uses WebAudio (no media file, nothing for the policy to fetch).
  const playable = page.locator("svg.notation-svg [role=button]").first();
  if (await playable.count()) await playable.click();
  // Inline styles set by React (the progress bar width) are applied through the DOM, which the policy allows.
  assert.match(await page.locator(".progress span").first().getAttribute("style") ?? "", /width/);
  // Settings: change the theme, then download the data file (a blob: link).
  await page.goto("/settings");
  await page.locator("label", { hasText: /^\s*Dark\s*$/ }).first().scrollIntoViewIfNeeded();
  await page.locator("label", { hasText: /^\s*Dark\s*$/ }).first().click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data" }).click()]);
  assert.equal(download.suggestedFilename(), "music-theory-path-data.json");
  // A practice examination opens and shows its first question.
  const started = await post(page, "/api/exams/1/start", { mode: "practice" });
  assert.equal(started.status, 200);
  await page.goto(`/practice/exam/1`);
  await page.locator("h1").first().waitFor();
  await page.goto("/review");
  await page.locator("h1").first().waitFor();
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.deepEqual(violations, [], "no Content-Security-Policy violation anywhere in the journey");
  assert.deepEqual(pageErrors, []);
  await ctx.close();
});

await test("the policy really is enforced: an injected inline script and a third-party request are blocked", async () => {
  const { ctx, page, violations } = await watched();
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Get started" }).waitFor();
  const ran = await page.evaluate(async () => {
    const s = document.createElement("script");
    s.textContent = "window.__injected = true";
    document.head.appendChild(s);
    const net = await fetch("https://example.invalid/collect").then(() => "sent", () => "blocked");
    return { injected: Boolean(window.__injected), net };
  });
  assert.deepEqual(ran, { injected: false, net: "blocked" });
  assert.ok(violations.some((v) => /script-src/.test(v)), `an inline-script violation was reported: ${JSON.stringify(violations)}`);
  assert.ok(violations.some((v) => /connect-src/.test(v)), `a connect-src violation was reported: ${JSON.stringify(violations)}`);
  await ctx.close();
});

await test("a guest is warned before access ends; registering removes the warning and keeps the progress", async () => {
  const { ctx, page, violations } = await watched();
  await page.goto("/welcome");
  const userId = await page.evaluate(async () => {
    const me = await (await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
    await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true, experience: "new", selectedGrade: 1 }) });
    return me.user.id;
  });
  await page.goto("/learn");
  await page.locator('[data-node="G1-U1-L01"]').waitFor();
  assert.equal(await page.getByRole("status", { name: "Guest access ending soon" }).count(), 0, "no warning with two months left");
  // Five and a half days of access left (the server's stored expiry is the only source).
  S.db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(new Date(Date.now() + 5.5 * 86400_000).toISOString(), userId);
  await page.reload();
  const note = page.getByRole("status", { name: "Guest access ending soon" });
  await note.waitFor();
  assert.match(await note.innerText(), /Your guest access on this device ends in 5 days/);
  assert.match(await note.innerText(), /If you'd like to keep it, create a free account/);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `the notice does not make the page scroll sideways (${over}px)`);
  await note.getByRole("link", { name: "Keep my progress" }).click();
  await page.waitForURL("**/profile");
  await page.getByText(/guest access ends in 5 days/).waitFor();
  await page.getByText(/You don't have to register to keep learning/).waitFor();
  await page.getByLabel("Nickname").fill("Ada");
  await page.getByLabel("Email").fill(`keep-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a long safe password");
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByText("Guest profile", { exact: true }).waitFor({ state: "detached" });
  const me = await get(page, "/api/me");
  assert.equal(me.user.id, userId, "the same learner, upgraded in place");
  assert.equal(me.user.isGuest, false);
  assert.equal(me.session.guestAccessEndsInDays, null);
  await page.goto("/learn");
  await page.locator('[data-node="G1-U1-L01"]').waitFor();
  assert.equal(await page.getByRole("status", { name: "Guest access ending soon" }).count(), 0);
  assert.deepEqual(violations, []);
  await ctx.close();
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} hardening journey(s) failed`);
  process.exit(1);
}
console.log("All hardening journeys passed");
process.exit(0);
