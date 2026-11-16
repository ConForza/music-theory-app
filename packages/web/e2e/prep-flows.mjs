// Brief 10 real-browser verification: placement and personalised revision, as a learner would use them.
// Covers: onboarding -> "Find my level" -> placement -> a lower starting grade chosen -> the path opens there without completing anything,
// a second placement that keeps earlier progress, a beginner's short check, quick review (finishing early without penalty, then a full
// session with its reward once), weak-topic practice with its explanation first, explore and mixed practice, and the responsive matrix.
// Run: npm run build && node --import tsx e2e/prep-flows.mjs   (SHOTS=dir saves screenshots; ONLY=text runs matching tests)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { canonicalResponse } from "@mtp/engine";
import { attemptIdFromUrl, axe, get, guest, noOverflow, onQuestion, answerOnScreen, playPrep, post, reachableWrong, serve, shot } from "./preplib.mjs";

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
const completeUpTo = (userId, grade) => {
  const now = S.clock.now().toISOString();
  for (const n of S.course.nodes.filter((x) => x.grade <= grade)) {
    S.db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, n.id);
    S.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, n.id, n.contentVersion, S.course.version, now, now, now, n.contentVersion);
  }
};
const firstNode = (grade) => S.course.nodes.find((n) => n.grade === grade && !n.optional && S.course.isPlayable(n.id)).id;
const stateOf = async (page, nodeId) => (await get(page, "/api/progress")).nodes[nodeId].state;
const me = async (page) => (await get(page, "/api/me")).user.id;

/** Onboarding as a learner who knows some theory but not which grade: ends on the placement introduction. */
async function viaOnboarding(ctx) {
  const page = await ctx.newPage();
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /I already know some theory/ }).click();
  await page.getByRole("heading", { name: "Where would you like to begin?" }).waitFor();
  return page;
}

await test("onboarding offers placement; a learner who knows Grades 1-4 is suggested Grade 5, chooses Grade 3, and the path opens there without completing anything", async () => {
  const ctx = await newCtx();
  const page = await viaOnboarding(ctx);
  await axe(page, "onboarding grade step");
  await noOverflow(page, "onboarding grade step");
  await page.getByRole("button", { name: "Find my level" }).click();
  await page.getByRole("heading", { name: "Find your starting point" }).waitFor();
  await axe(page, "placement intro");
  await noOverflow(page, "placement intro");
  await shot(page, "placement-intro");
  await page.getByText(/never completes a grade/).first().waitFor();
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/placement\/run\//);
  const id = attemptIdFromUrl(page);
  const userId = await me(page);
  await page.getByRole("button", { name: /Let's go/ }).click();
  const n = await playPrep(page, S, userId, id);
  assert.equal(n, 24, "four secure probes of six questions");
  await page.waitForURL(/\/results\//);
  await page.getByRole("heading", { name: "We suggest starting at Grade 5" }).waitFor();
  await axe(page, "placement result");
  await noOverflow(page, "placement result");
  await shot(page, "placement-result");
  assert.equal(await page.getByTestId("stages").locator("li").count(), 4);
  // lower start, no penalty
  await page.getByRole("radio", { name: /Grade 3/ }).check();
  await page.getByRole("button", { name: "Start at Grade 3" }).click();
  await page.waitForURL(/\/learn/);
  await page.locator(`[data-node="${firstNode(3)}"]`).waitFor();
  assert.equal(await page.locator(`[data-node="${firstNode(3)}"]`).getAttribute("data-status"), "available");
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").get(userId).c, 0, "placing in completes nothing");
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM achievements_awarded WHERE user_id = ?").get(userId).c, 0);
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ?").get(userId).c, 0);
  assert.equal(await stateOf(page, "G3-A"), "locked", "the Grade 3 assessment still has to be earned");
  assert.equal((await get(page, "/api/me")).profile.selectedGrade, 3);
  await ctx.close();
});

await test("a beginner's check stops after one probe and suggests Grade 1 with the lessons to start with; retaking keeps earlier progress", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  // some real progress exists already
  const first = firstNode(1);
  completeUpTo(userId, 0);
  S.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, first, S.course.ix.nodeById.get(first).contentVersion, S.course.version, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", S.course.ix.nodeById.get(first).contentVersion);
  const before = JSON.stringify(S.db.prepare("SELECT * FROM lesson_progress WHERE user_id = ?").all(userId));
  await page.goto("/placement");
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/placement\/run\//);
  const id = attemptIdFromUrl(page);
  await page.getByRole("button", { name: /Let's go/ }).click();
  // three questions answered wrongly: the first three for which the controls can give a wrong answer (two are enough to make the probe not secure)
  const wrongAt = new Set(S.app.prep.internalItems(userId, id).flatMap((it, i) => (reachableWrong(S, it.item, it.scope) ? [i] : [])).slice(0, 3));
  assert.ok(wrongAt.size >= 2, `at least two questions of the probe can be answered wrongly (${wrongAt.size})`);
  const n = await playPrep(page, S, userId, id, { wrong: (i) => wrongAt.has(i) });
  assert.equal(n, 6);
  await page.waitForURL(/\/results\//);
  await page.getByRole("heading", { name: "We suggest starting at Grade 1" }).waitFor();
  await page.getByText(/Not assessed: Grade 2, 3, 4/).waitFor();
  const gaps = page.getByTestId("gaps").locator("li");
  assert.equal(await gaps.count(), wrongAt.size);
  await gaps.first().getByRole("link").first().waitFor();
  await page.getByRole("button", { name: "Start at Grade 1" }).click();
  await page.waitForURL(/\/learn/);
  assert.equal(JSON.stringify(S.db.prepare("SELECT * FROM lesson_progress WHERE user_id = ?").all(userId)), before, "the earlier lesson is exactly as it was");
  // take it again: a second attempt, the first stays in the history
  await page.goto("/placement");
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/placement\/run\//);
  assert.notEqual(attemptIdFromUrl(page), id);
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM prep_attempts WHERE user_id = ? AND kind = 'placement'").get(userId).c, 2);
  await ctx.close();
});

const sessionItems = (userId, sessionId) => JSON.parse(S.db.prepare("SELECT items FROM revision_sessions WHERE user_id = ? AND id = ?").get(userId, sessionId).items);
async function playRevision(page, userId, sessionId, count) {
  let done = 0;
  for (const si of sessionItems(userId, sessionId).slice(0, count)) {
    const r = S.app.engagement.review.resolve(si);
    await onQuestion(page, { item: r.item }, `revision ${sessionId}`, done + 1);
    await answerOnScreen(page, S, r.item, r.scope, canonicalResponse(S.course.ix, r.item, r.scope));
    await page.locator(".feedback").getByText("Correct!").waitFor();
    done++;
    if (done < count) await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  }
  return done;
}

await test("quick review: choose the time, stop early with no penalty, then a full session that pays XP once", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  completeUpTo(userId, 1);
  await page.goto("/review");
  await page.getByTestId("quick-review").waitFor();
  await axe(page, "review with revise panel");
  await noOverflow(page, "review with revise panel");
  await shot(page, "revise-panel");
  await page.getByRole("radio", { name: /3 min/ }).check();
  await page.getByRole("button", { name: /Start 3-minute review/ }).click();
  await page.waitForURL(/\/revision\/session\//);
  const id = new URL(page.url()).pathname.split("/").pop();
  assert.equal(sessionItems(userId, id).length, 5);
  assert.equal(await playRevision(page, userId, id, 2), 2);
  await page.getByRole("button", { name: /Finish early: no penalty/ }).click();
  await page.getByRole("heading", { name: /Stopped early, and that's fine/ }).waitFor();
  await page.getByText(/Nothing is marked wrong for what you didn't reach/).waitFor();
  await axe(page, "revision stopped early");
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ?").get(userId).c, 0);
  // a full 5-minute session
  await page.goto("/review");
  await page.getByRole("radio", { name: /5 min/ }).check();
  await page.getByRole("button", { name: /Start 5-minute review/ }).click();
  await page.waitForURL(/\/revision\/session\//);
  const id2 = new URL(page.url()).pathname.split("/").pop();
  assert.notEqual(id2, id);
  const total = sessionItems(userId, id2).length;
  assert.equal(total, 8);
  await playRevision(page, userId, id2, total);
  await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  await page.getByRole("heading", { name: "Session complete" }).waitFor();
  await page.getByText(/8 of 8 right first time/).waitFor();
  await page.getByText(/\+\d+ XP/).first().waitFor();
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ? AND source_key = ?").get(userId, `revision:${id2}`).c, 1);
  await page.reload();
  assert.equal(S.db.prepare("SELECT COUNT(*) AS c FROM xp_ledger WHERE user_id = ? AND source_key = ?").get(userId, `revision:${id2}`).c, 1, "reloading never pays twice");
  await noOverflow(page, "revision done");
  await ctx.close();
});

await test("weak-topic practice: weak is shown apart from not-yet-tested, the explanation and lesson come first, then the practice", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  completeUpTo(userId, 1);
  const concept = S.app.revision.insights(userId)[0].conceptId;
  for (const [i, ok] of [false, true, false].entries()) S.app.engagement.mastery.record(userId, { id: `e:${i}`, conceptIds: [concept], source: "independent-step", correct: ok, itemId: `x${i}`, questionKey: `qk${i}`, templateId: "t.g1.note-name", templateVersion: 1, mistakeCategory: ok ? null : "confused-similar-term" });
  await page.goto("/review");
  const weak = page.getByTestId("weak-topics");
  await weak.getByText(S.course.ix.concepts.get(concept).title).waitFor();
  assert.equal(await weak.locator("li").count(), 1, "exactly one weak topic");
  await page.getByTestId("untested-topics").getByText(/different from weak|do not know yet/).first().waitFor().catch(() => undefined);
  await page.getByTestId("untested-topics").locator("summary").click();
  await page.getByTestId("untested-topics").getByText(/different from weak/).waitFor();
  assert.ok(!(await page.getByTestId("untested-topics").innerText()).includes(S.course.ix.concepts.get(concept).title), "a weak topic is not listed as untested");
  await page.getByRole("button", { name: "Practise my weak topics" }).click();
  await page.waitForURL(/\/revision\/session\//);
  await page.getByRole("heading", { name: "Let's look at these first" }).waitFor();
  await page.getByText(/Usual slip/).waitFor();
  await page.getByRole("link", { name: /Revisit the lesson/ }).first().waitFor();
  await axe(page, "weak-topic explanation");
  await noOverflow(page, "weak-topic explanation");
  await shot(page, "weak-topic-explanation");
  await page.getByRole("button", { name: "Practise now" }).click();
  await page.locator("section.question").waitFor();
  await page.getByRole("button", { name: /Finish early/ }).click();
  await page.getByRole("heading", { name: /Stopped early|Session complete/ }).waitFor();
  await ctx.close();
});

await test("explore and mixed practice offer only what has been taught, and mix different kinds of topic", async () => {
  const ctx = await newCtx();
  const { page, userId } = await guest(ctx);
  completeUpTo(userId, 2);
  await page.goto("/review/explore");
  await page.getByRole("heading", { name: "Explore and mix" }).waitFor();
  assert.equal(await page.locator("[data-grade]").filter({ hasText: /Grade [345]:/ }).count(), 0, "Grades 3 to 5 are not offered");
  await axe(page, "explore");
  await noOverflow(page, "explore");
  await page.getByRole("button", { name: "Mix all of Grade 2" }).click();
  await page.waitForURL(/\/revision\/session\//);
  const id = new URL(page.url()).pathname.split("/").pop();
  const domains = sessionItems(userId, id).map((s) => S.course.ix.concepts.get(s.conceptId).domain);
  assert.ok(new Set(domains).size >= 3, `mixed practice spans several kinds of topic: ${[...new Set(domains)]}`);
  await page.locator("section.question").waitFor();
  await ctx.close();
});

for (const [name, [p, extra]] of Object.entries({ "320px": [profiles["phone-320"], {}], tablet: [profiles.tablet, {}], desktop: [profiles.desktop, {}], "dark mode": [profiles.iphone, { colorScheme: "dark" }], "reduced motion": [profiles.iphone, { reducedMotion: "reduce" }] })) {
  await test(`layout and accessibility, ${name}: placement result, review with revision, explore, weak-topic explanation`, async () => {
    const ctx = await newCtx(p, extra);
    const { page, userId } = await guest(ctx);
    completeUpTo(userId, 2);
    const concept = S.app.revision.insights(userId)[0].conceptId;
    for (const [i, ok] of [false, false].entries()) S.app.engagement.mastery.record(userId, { id: `m:${i}`, conceptIds: [concept], source: "independent-step", correct: ok, itemId: `y${i}`, questionKey: `mk${i}`, templateId: "t.g1.note-name", templateVersion: 1, mistakeCategory: "confused-similar-term" });
    await page.goto("/review");
    await page.getByTestId("quick-review").waitFor();
    await noOverflow(page, `${name} review`);
    await axe(page, `${name} review`);
    await page.goto("/review/explore");
    await page.getByRole("heading", { name: "Explore and mix" }).waitFor();
    await noOverflow(page, `${name} explore`);
    await axe(page, `${name} explore`);
    await page.goto("/placement");
    await noOverflow(page, `${name} placement intro`);
    await axe(page, `${name} placement intro`);
    // a short placement ending below Grade 2 to see the result with gaps
    const start = await post(page, "/api/placement/start", {});
    const id = start.body.id;
    for (const [i, it] of S.app.prep.internalItems(userId, id).entries()) {
      const { wrongResponse } = await import("@mtp/engine");
      await post(page, `/api/prep/attempts/${id}/answers`, { attemptId: crypto.randomUUID(), itemId: it.item.id, response: i < 3 ? (wrongResponse(S.course.ix, it.item, it.scope) ?? canonicalResponse(S.course.ix, it.item, it.scope)) : canonicalResponse(S.course.ix, it.item, it.scope) });
    }
    await post(page, `/api/prep/attempts/${id}/complete`, {});
    await page.goto(`/results/${id}`);
    await page.getByRole("heading", { name: /We suggest starting at Grade/ }).waitFor();
    await noOverflow(page, `${name} placement result`);
    await axe(page, `${name} placement result`);
    await shot(page, `placement-result-${name.replace(/\W/g, "")}`);
    const rs = await post(page, "/api/revision/sessions", { mode: "weak", conceptId: concept });
    await page.goto(`/revision/session/${rs.body.session.id}`);
    await page.getByRole("heading", { name: "Let's look at these first" }).waitFor();
    await noOverflow(page, `${name} weak explanation`);
    await axe(page, `${name} weak explanation`);
    await ctx.close();
  });
}

await browser.close();
S.close();
log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
