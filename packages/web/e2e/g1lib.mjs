// Shared helpers for the Brief 05 Grade 1 browser suites. The server runs IN this process (real content), so the suite can
// read each run's questions with their answers (never exposed by the HTTP API) and drive the real controls to answer them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalResponse, generateItem, inputFor, wrongResponse } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";
import { createApp, createHttpServer, loadCourse, ManualClock, openDb } from "@mtp/api";
import { drive } from "./drive.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "../../..");
export const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
export const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

export async function serve(opts = {}) {
  const course = loadCourse();
  const clock = new ManualClock(new Date(opts.start ?? "2026-03-02T12:00:00Z"));
  const db = openDb(join(mkdtempSync(join(tmpdir(), "g1-")), "g1.sqlite"));
  const app = createApp({ db, course, clock, testClock: true, waiveUnwrittenPrerequisites: opts.waive ?? true });
  const server = createHttpServer(app, join(root, "packages/web/dist"));
  const port = 8800 + Math.floor(Math.random() * 150);
  await new Promise((r) => server.listen(port, r));
  return { app, course, clock, db, base: `http://localhost:${port}`, close: () => server.close() };
}

export async function guest(ctx) {
  const page = await ctx.newPage();
  await page.goto("/welcome");
  const userId = await page.evaluate(async () => {
    const me = await (await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
    await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true, experience: "new", selectedGrade: 1 }) });
    return me.user.id;
  });
  return { page, userId };
}

export const post = (page, path, body = {}) =>
  page.evaluate(async ([p, b]) => {
    const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [path, body]);
export const get = (page, path) => page.evaluate(async (p) => (await fetch(p)).json(), path);

/** Finish a node (and every playable prerequisite first) through the API, answering correctly. `opts.wrong`: first N session answers wrong. */
export async function finishViaApi(S, page, userId, nodeId, seen = new Set(), opts = {}) {
  if (seen.has(nodeId)) return;
  seen.add(nodeId);
  const node = S.course.ix.nodeById.get(nodeId);
  for (const p of node.resolvedUnlockAfter) if (S.course.isPlayable(p)) await finishViaApi(S, page, userId, p, seen);
  const prog = await get(page, "/api/progress");
  if (prog.nodes[nodeId]?.state === "completed") return;
  const lesson = S.course.lesson(nodeId);
  if (lesson) {
    await post(page, `/api/lessons/${nodeId}/start`);
    for (const it of S.course.authoredItems(nodeId)) {
      const r = await post(page, `/api/lessons/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.id, response: canonicalResponse(S.course.ix, it, S.course.scopeFor(nodeId, it)) });
      assert.equal(r.status, 200, `${nodeId} ${it.id}: ${JSON.stringify(r.body)}`);
    }
    const c = await post(page, `/api/lessons/${nodeId}/complete`);
    assert.equal(c.status, 200, `${nodeId} complete: ${JSON.stringify(c.body)}`);
    return c.body;
  }
  const st = await post(page, `/api/nodes/${nodeId}/start`);
  assert.equal(st.status, 200, `${nodeId} start: ${JSON.stringify(st.body)}`);
  let wrong = opts.wrong ?? 0;
  for (const it of S.app.nodes.internalItems(userId, nodeId)) {
    const bad = wrong > 0 ? wrongResponse(S.course.ix, it.item, it.scope) : null;
    if (bad) {
      wrong--;
      await post(page, `/api/nodes/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: bad });
      if (st.body.firstAttemptOnly) continue;
    }
    const r = await post(page, `/api/nodes/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: canonicalResponse(S.course.ix, it.item, it.scope) });
    assert.equal(r.status, 200, `${nodeId} ${it.itemId}: ${JSON.stringify(r.body)}`);
  }
  const c = await post(page, `/api/nodes/${nodeId}/complete`);
  assert.equal(c.status, 200, `${nodeId} complete: ${JSON.stringify(c.body)}`);
  return c.body;
}

/** Answer the question on screen through the real controls, then press Check. */
export async function answerOnScreen(page, S, item, scope, response, soft = false) {
  const input = inputFor(S.course.ix, item, scope);
  const q = page.locator("section.question");
  await q.waitFor();
  if (input.kind === "composite") {
    for (const [i, part] of input.parts.entries()) await drive(page, q.locator("li.composite-part").nth(i), part.input, response.parts[part.id], "tap");
  } else await drive(page, q, input, response, "tap");
  const check = page.getByRole("button", { name: "Check" });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Check"); return b && !b.disabled; }, null, { timeout: 4000 }).catch(() => undefined);
  if (await check.isDisabled()) {
    if (soft) return false; // e.g. an unfinished bar cannot be submitted at all, so it is not a way to answer wrongly
    throw new Error(`Check stayed disabled after driving ${input.kind}: ${item.prompt} / ${JSON.stringify(response) + " GIVEN " + JSON.stringify(input.given ?? null)}`);
  }
  await check.click();
  return true;
}

/** Answer a Brief 04 review session (spaced revision) through the UI; questions are regenerated from their stored seeds. */
export async function playReviewInBrowser(page, S, sessionId) {
  await page.goto(`/review/session/${sessionId}`);
  const row = S.db.prepare("SELECT items FROM review_sessions WHERE id = ?").get(sessionId);
  const list = JSON.parse(row.items);
  for (const si of list.filter((x) => x.kind === "review")) {
    const node = S.course.ix.nodeById.get(si.nodeId);
    const binding = node.exercises.find((b) => b.templateId === si.templateId);
    const scope = effectiveScope(S.course.ix, node, binding);
    const { item } = generateItem(S.course.ix, si.templateId, si.seed, { scope, evidence: "independent" });
    await answerOnScreen(page, S, item, scope, canonicalResponse(S.course.ix, item, scope));
    await page.locator(".feedback .feedback-title").getByText("Correct!").waitFor();
    await page.getByRole("button", { name: /Continue|Finish review/ }).click();
  }
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

/** Play a session node (practice, review, challenge, assessment) in the browser. Returns the final page text. */
export async function playNodeInBrowser(page, S, userId, nodeId, opts = {}) {
  await page.goto(`/lesson/${nodeId}`);
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const items = S.app.nodes.internalItems(userId, nodeId);
  let wrong = opts.wrong ?? 0;
  let n = 0;
  for (const it of items) {
    n++;
    const view = await get(page, `/api/nodes/${nodeId}/session`);
    const st = view.items.find((x) => x.item.id === it.itemId);
    if (st?.answered && view.firstAttemptOnly) { await page.getByRole("button", { name: /Continue|Finish/ }).click().catch(() => {}); continue; }
    const q = page.locator("section.question");
    await q.waitFor();
    const bad = wrong > 0 ? wrongResponse(S.course.ix, it.item, it.scope) : null;
    const sent = bad ? await answerOnScreen(page, S, it.item, it.scope, bad, true) : false;
    if (bad && sent) {
      wrong--;
      await page.locator(".feedback .feedback-title").getByText(/Not quite|Not this time/).waitFor();
      if (opts.afterWrong) await opts.afterWrong(page, n);
      if (view.firstAttemptOnly) { await page.getByRole("button", { name: /Continue|Finish/ }).click(); continue; }
      await page.getByRole("button", { name: "Try again" }).click();
    }
    await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    await page.locator(".feedback").getByText("Correct!").waitFor();
    if (opts.afterEach) await opts.afterEach(page, n);
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
}

// ---- page checks shared by the Grade 1 suites ------------------------------------------------------------------------
export async function noOverflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${where}: page scrolls sideways by ${over}px`);
}
export async function axe(page, where) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
  const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  assert.equal(bad.length, 0, `${where}: accessibility violations: ${bad.map((v) => `${v.id} (${v.nodes[0]?.target}) ${v.nodes[0]?.failureSummary ?? ""}`).join(", ")}`);
}
export async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
}

/** Play an authored lesson in the browser: intro, teaching, demonstration, then every question through the real controls. */
export async function playLessonInBrowser(page, S, nodeId, opts = {}) {
  await page.goto(`/lesson/${nodeId}`);
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const view = await get(page, `/api/lessons/${nodeId}`);
  const run = await get(page, `/api/progress`);
  void run;
  const items = S.course.authoredItems(nodeId);
  const answered = new Set();
  // a lesson that was left part-way resumes at the first open question; the teaching steps are skipped
  const onTeach = await page.getByRole("heading", { name: "Here's the idea" }).isVisible().catch(() => false);
  if (onTeach) {
    if (opts.afterTeach) await opts.afterTeach(page);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    if (opts.afterDemo) await opts.afterDemo(page);
    await page.getByRole("button", { name: "Try some questions" }).click();
  }
  const stopAt = opts.stopAfter ?? items.length;
  for (let k = 0; k < Math.min(stopAt, items.length); k++) {
    const it = items[k];
    const scope = S.course.scopeFor(nodeId, it);
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    if (opts.wrongAt === k) {
      const bad = wrongResponse(S.course.ix, it, scope);
      if (bad) {
        await answerOnScreen(page, S, it, scope, bad);
        await page.locator(".feedback .feedback-title").getByText("Not quite").waitFor();
        if (opts.afterWrong) await opts.afterWrong(page);
        await page.getByRole("button", { name: "Try again" }).click();
      }
    }
    await answerOnScreen(page, S, it, scope, canonicalResponse(S.course.ix, it, scope));
    await page.locator(".feedback").getByText("Correct!").waitFor();
    if (opts.afterEach) await opts.afterEach(page, k);
    await page.getByRole("button", { name: "Continue" }).click();
    answered.add(it.id);
  }
  void view;
  return answered;
}
