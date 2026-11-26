// PWA brief, in a real browser against the REAL production entry point (packages/api/src/main.ts) run as a child process with the
// private-preview gate on, so stopping and starting it is a genuine redeploy / outage:
//   installability (Chromium's own manifest check, with no cookies), preview sign-in once, learner sign-in once, relaunching the app,
//   a server redeploy, an outage with the offline page, revoking a tester, sign-out, and no CSP violation on the new pages.
// What this cannot show (needs a physical iPhone): Safari's Add to Home Screen, standalone launch, Apple Passwords and Face ID. See
// docs/development/PWA_AND_SIGN_IN.md for the device checklist.
// Run: npm run build && node e2e/pwa.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { newInvite } from "../../api/src/preview-gate.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = mkdtempSync(join(tmpdir(), "mtp-pwa-"));
const dbPath = join(dataDir, "mtp.sqlite");
const tester = newInvite("tester1");
const other = newInvite("tester2");
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const port = await freePort();
const base = `http://localhost:${port}`;

let proc = null;
/** Start the production server (as Railway does, minus the pool warm-up to keep this quick) and wait until it answers its healthcheck. */
async function start(access) {
  proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", "packages/api/src/main.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), MTP_DB: dbPath, MTP_PREVIEW_GATE: "1", MTP_PREVIEW_ACCESS: access, MTP_WARM_POOLS: "0", NODE_ENV: "production", MTP_ALLOWED_ORIGINS: base },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not start:\n${log}`);
}
async function stop() {
  if (!proc) return;
  const p = proc;
  proc = null;
  await new Promise((r) => { p.once("exit", r); p.kill("SIGTERM"); });
}

let failures = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log("✓", name);
  } catch (e) {
    failures++;
    console.log("✗", name, "-", String(e.message).split("\n").slice(0, 8).join(" | "));
  }
};

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, baseURL: base };
/** A browser context watching for CSP violations and for any HTTP auth dialog (which must never appear). */
async function open(state) {
  const ctx = await browser.newContext({ ...phone, ...(state ? { storageState: state } : {}), httpCredentials: undefined });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text().slice(0, 160)); });
  page.on("dialog", (d) => { problems.push(`dialog: ${d.message()}`); void d.dismiss(); });
  const visited = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname); });
  return { ctx, page, problems, visited };
}

await start(`${tester.entry},${other.entry}`);
let appState; // the "installed app's" saved cookies, standing in for its own cookie jar between launches

try {
  await test("installable: Chromium finds no installability errors, though the manifest and icons are fetched without cookies", async () => {
    const { ctx, page } = await open();
    await page.goto("/");
    assert.match(page.url(), /\/preview\/signin\?next=%2F$/, "an uninvited visitor is sent to the tester sign-in page");
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    assert.deepEqual(installabilityErrors, [], JSON.stringify(installabilityErrors));
    const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) assert.equal((await fetch(base + icon.src)).headers.get("content-type"), "image/png", icon.src);
    await ctx.close();
  });

  await test("the preview asks for the tester's details once, with a form (no browser auth dialog), then the learner signs up", async () => {
    const { ctx, page, problems } = await open();
    await page.goto("/learn");
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill("wrong-password");
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.getByRole("alert").filter({ hasText: "don't match an invitation" }).waitFor();
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    // Back where they were going; not signed in as a learner yet, so the app's own welcome appears.
    await page.getByRole("link", { name: "Get started" }).waitFor();
    // Learner registration through the app's real form.
    await page.getByRole("link", { name: "Get started" }).click();
    await page.getByRole("button", { name: /New to music theory/ }).click();
    await page.getByLabel(/^Nickname/).fill("Ada");
    await page.getByLabel(/^Email/).fill("ada@example.com");
    await page.getByLabel(/^Password/).fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/(learn|placement)/);
    const cookies = await ctx.cookies();
    for (const name of ["mtp_preview", "mtp_session"]) {
      const c = cookies.find((x) => x.name === name);
      assert.ok(c, name);
      assert.equal(c.httpOnly, true, `${name} is HttpOnly`);
      assert.equal(c.sameSite, "Lax", `${name} is SameSite=Lax`);
      assert.ok(c.expires * 1000 > Date.now() + 59 * 86400_000, `${name} persists for weeks, not just this session`);
    }
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.doesNotMatch(stored, /correct horse|mtp_session|mtp_preview/, "nothing secret in browser storage");
    assert.deepEqual(problems, []);
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("closing and reopening the app goes straight to the learning path: no sign-in, no welcome screen on the way", async () => {
    const { ctx, page, problems, visited } = await open(appState);
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    assert.match(page.url(), /\/learn$/);
    assert.ok(!visited.some((p) => /welcome|signin|preview/.test(p)), `visited ${visited.join(", ")}`);
    assert.deepEqual(problems, []);
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("after a redeploy (server stopped and started on the same volume) the learner is still signed in", async () => {
    await stop();
    await start(`${tester.entry},${other.entry}`);
    const { ctx, page, visited } = await open(appState);
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    assert.ok(!visited.some((p) => /welcome|signin|preview/.test(p)), `visited ${visited.join(", ")}`);
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("offline, or during an outage: a clear offline page with Try again, then back to the path still signed in", async () => {
    const { ctx, page, problems } = await open(appState);
    await page.goto("/learn");
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // controlled by the service worker from here on
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the page");
    // Device offline.
    await ctx.setOffline(true);
    await page.goto("/progress").catch(() => undefined);
    await page.getByRole("heading", { name: "You're offline" }).waitFor();
    assert.match(page.url(), /\/progress$/, "the address is kept, so Try again reloads the same page");
    await ctx.setOffline(false);
    await page.getByRole("link", { name: "Try again" }).click();
    await page.getByRole("heading", { name: /Progress|Your progress/ }).first().waitFor();
    // Server down (a Railway restart): same page, not a sign-in screen, and nothing lost.
    await stop();
    await page.goto("/learn").catch(() => undefined);
    await page.getByRole("heading", { name: "You're offline" }).waitFor();
    await start(`${tester.entry},${other.entry}`);
    await page.getByRole("link", { name: "Try again" }).click();
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    // The worker cached only its offline page: no app, API or personal data in any cache.
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat());
    assert.deepEqual(cached.sort(), ["/offline.css", "/offline.html"]);
    assert.deepEqual(problems, []);
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("an open app that loses the server mid-use shows a connection problem, never a sign-in screen", async () => {
    const { ctx, page } = await open(appState);
    await page.goto("/settings");
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await stop();
    await page.evaluate(() => window.dispatchEvent(new Event("online"))); // the app re-checks the sign-in
    await page.waitForTimeout(300);
    assert.ok(await page.getByRole("heading", { name: "Settings" }).isVisible(), "still on Settings, not signed out");
    await start(`${tester.entry},${other.entry}`);
    await ctx.close();
  });

  await test("revoking the tester ends their preview access on the next deploy, even with a saved session", async () => {
    await stop();
    await start(other.entry); // tester1 removed from MTP_PREVIEW_ACCESS
    const { ctx, page } = await open(appState);
    await page.goto("/learn");
    assert.match(page.url(), /\/preview\/signin/);
    const api = await page.evaluate(async () => { const r = await fetch("/api/me"); return { status: r.status, body: await r.json() }; });
    assert.equal(api.status, 401);
    assert.equal(api.body.error.code, "preview_required");
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.getByRole("alert").waitFor();
    await ctx.close();
    await stop();
    await start(`${tester.entry},${other.entry}`);
  });

  await test("a preview session that ends while the app is open sends the tester to the preview sign-in, not a broken screen", async () => {
    // Fresh preview sign-in (the old session was deleted when tester1 was revoked), learner session still valid.
    const { ctx, page } = await open(appState);
    await page.goto("/learn");
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    await ctx.clearCookies({ name: "mtp_preview" });
    await page.getByRole("link", { name: "Progress", exact: true }).click();
    await page.waitForURL(/\/preview\/signin\?next=%2Fprogress/);
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.waitForURL(/\/progress$/);
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("review P2: a sign-out blocked by expired preview access leaves the learner signed in and comes back pending", async () => {
    const { ctx, page } = await open(appState);
    await page.goto("/settings");
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await ctx.clearCookies({ name: "mtp_preview" });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/preview\/signin\?next=%2Fsettings%3Fpending%3Dsignout$/);
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.waitForURL(/\/settings\?pending=signout$/);
    await page.getByText("You haven't been signed out yet").waitFor();
    const still = await page.evaluate(async () => (await fetch("/api/me")).status);
    assert.equal(still, 200, "the learner was never signed out by the blocked request");
    await page.getByRole("button", { name: "Finish signing out" }).click();
    await page.waitForURL(/\/welcome$/);
    assert.equal(await page.evaluate(async () => (await fetch("/api/me")).status), 401);
    // Sign back in for the next test.
    await page.goto("/signin");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("shared device: 'Sign out and leave the preview' ends both the learner and the preview session", async () => {
    const { ctx, page, problems } = await open(appState);
    await page.goto("/settings");
    const leave = page.getByRole("button", { name: "Sign out and leave the preview on this device" });
    await leave.waitFor();
    const before = Object.fromEntries((await ctx.cookies()).map((c) => [c.name, c.value]));
    await leave.click();
    await page.waitForURL(/\/preview\/signin$/);
    const cookie = `mtp_session=${before.mtp_session}; mtp_preview=${before.mtp_preview}`;
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie } })).status, 401, "both old tokens are dead");
    assert.equal((await (await fetch(`${base}/api/me`, { headers: { cookie } })).json()).error.code, "preview_required");
    assert.deepEqual(problems, []);
    // Restore both for the next test.
    await page.getByLabel("Tester name").fill("tester1");
    await page.getByLabel("Preview password").fill(tester.password);
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.goto("/signin");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    appState = await ctx.storageState();
    await ctx.close();
  });

  await test("signing out ends the learner session for good; the next launch shows the welcome page, the preview stays", async () => {
    const { ctx, page } = await open(appState);
    await page.goto("/settings");
    const before = (await ctx.cookies()).find((c) => c.name === "mtp_session").value;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/welcome$/);
    const replay = await fetch(`${base}/api/me`, { headers: { cookie: `mtp_session=${before}; mtp_preview=${(await ctx.cookies()).find((c) => c.name === "mtp_preview").value}` } });
    assert.equal(replay.status, 401, "the old learner token no longer works anywhere");
    const state = await ctx.storageState();
    await ctx.close();
    const again = await open(state);
    await again.page.goto("/");
    await again.page.getByRole("link", { name: "I already have an account" }).waitFor();
    // Signing back in through the password-manager-friendly form.
    await again.page.getByRole("link", { name: "I already have an account" }).click();
    await again.page.getByLabel("Email").fill("ada@example.com");
    await again.page.getByLabel("Password").fill("correct horse battery");
    await again.page.getByRole("button", { name: "Sign in" }).click();
    await again.page.getByRole("navigation", { name: "Main" }).waitFor();
    await again.ctx.close();
  });
} finally {
  await browser.close();
  await stop();
  rmSync(dataDir, { recursive: true, force: true });
}
if (failures) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
