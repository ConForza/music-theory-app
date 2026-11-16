// Brief 06 real-browser verification of the Grade 2 course. The server runs in this process with the real content and a
// controllable clock; the learner's actions go through the real controls. Covers: a learner arriving from Grade 1, the first
// lesson (with a wrong answer and its explanation), Unit 1 end to end (all five lessons, practice, review and a challenge in the
// browser, XP once, revision days later), one lesson from each later unit, resuming after interruption, the complete progression
// to the Grade 2 assessment (a below-pass result with what to revisit, then a retake that passes), the optional melodic-minor
// preview, and the responsive / accessibility / preference matrix.
// Run: npm run build && node --import tsx e2e/g2.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, completeGrade1, finishViaApi, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, playReviewInBrowser, post, selectGrade, serve, shot } from "./g2lib.mjs";
import { canonicalResponse, inputFor } from "@mtp/engine";

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
const ctxFor = (p, extra = {}) => browser.newContext({ ...p, baseURL: S.base, ...extra });
const profiles = {
  iphone: devices["iPhone 14"],
  "phone-320": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "ipad-portrait": { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "ipad-landscape": { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
/** A guest learner whose Grade 1 is finished and who has chosen Grade 2. */
async function grade2Learner(p = profiles.desktop, extra = {}, init = null) {
  const ctx = await ctxFor(p, extra);
  const { page, userId } = await guest(ctx);
  if (init) await page.addInitScript(init);
  completeGrade1(S, userId);
  await selectGrade(page, 2);
  return { ctx, page, userId };
}
const G2 = S.course.nodes.filter((n) => n.grade === 2);

await test("learner arriving from Grade 1: Grade 2 opens at its first lesson, later lessons are locked, the first lesson teaches and rewards", async () => {
  const { ctx, page } = await grade2Learner(profiles.iphone, { reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await page.locator('[data-node="G2-U1-L01"]').waitFor();
  assert.equal(await page.locator('[data-node="G2-U1-L01"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G2-U1-L02"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator('[data-node="G2-U3-L01"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator("[data-node]").count(), 45, "all 45 Grade 2 nodes are on the path");
  await noOverflow(page, "grade 2 path");
  await axe(page, "grade 2 path");
  await shot(page, "g2-01-path");
  await page.locator('[data-node="G2-U1-L02"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G2-U1-L02"]').click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "g2-02-locked-node-explains");
  await page.keyboard.press("Escape");
  const taught = [];
  await playLessonInBrowser(page, S, "G2-U1-L01", {
    wrongAt: 1,
    afterTeach: async (p) => { await noOverflow(p, "teach"); await axe(p, "teach"); await shot(p, "g2-03-teach-minim-beats"); },
    afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); await noOverflow(p, "demo"); await shot(p, "g2-04-demo"); },
    afterWrong: async (p) => { await shot(p, "g2-05-wrong-answer-explained"); taught.push(await p.locator(".feedback").innerText()); },
  });
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText(/10 XP/).first().waitFor();
  await noOverflow(page, "lesson complete");
  await axe(page, "lesson complete");
  await shot(page, "g2-06-lesson-complete");
  assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G2-U1-L01"].state, "completed");
  assert.equal(prog.nodes["G2-U1-L02"].state, "available");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("Unit 1 end to end in the browser: five lessons, practice, review and a challenge; XP once each; revision due later", async () => {
  const { ctx, page, userId } = await grade2Learner(profiles.desktop);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["G2-U1-L01", "G2-U1-L02", "G2-U1-L03", "G2-U1-L04", "G2-U1-L05"]) {
    await playLessonInBrowser(page, S, id, { afterTeach: id === "G2-U1-L04" ? async (p) => { await shot(p, "g2-07-teach-triplets"); await axe(p, "triplet teaching"); } : undefined, afterDemo: id === "G2-U1-L05" ? async (p) => { await shot(p, "g2-08-demo-triplet-rest"); } : undefined });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  }
  await page.goto("/lesson/G2-U1-P1");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list p").first().waitFor();
  await playNodeInBrowser(page, S, userId, "G2-U1-P1", { wrong: 1 });
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();
  await playNodeInBrowser(page, S, userId, "G2-U1-R1");
  await page.getByRole("heading", { name: "Review complete" }).waitFor();
  const before = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G2-U1-C", {
    wrong: 1, // six questions and a 70% pass mark: one slip is tolerated, two are not
    afterWrong: async (p, n) => {
      if (n === 1) {
        assert.equal(await p.getByRole("button", { name: "Try again" }).count(), 0, "no retry in a challenge");
        assert.equal(await p.getByRole("button", { name: /hint/i }).count(), 0, "no hints in a challenge");
      }
    },
  });
  await page.getByTestId("score").waitFor();
  await page.getByRole("heading", { name: /Challenge passed/ }).waitFor();
  await noOverflow(page, "challenge result");
  await axe(page, "challenge result");
  await shot(page, "g2-09-challenge-result");
  assert.equal((await get(page, "/api/xp")).total - before, 15, "the challenge pays 15 XP once");
  assert.equal((await get(page, "/api/progress")).nodes["G2-U1-C"].state, "completed");
  assert.equal((await get(page, "/api/review")).groups.ready.length, 0, "nothing is due straight after learning");
  S.clock.advanceDays(4);
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const due = (await get(page, "/api/review")).groups.ready;
  assert.ok(due.length > 0, "Grade 2 topics are due four days later");
  assert.ok(due.some((d) => /triplet|time|beat/i.test(JSON.stringify(d))), "unit 1 topics return");
  const started = await post(page, "/api/review/sessions");
  assert.equal(started.status, 200);
  await playReviewInBrowser(page, S, started.body.session.id);
  await shot(page, "g2-10-revision-done");
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [lesson, label] of [["G2-U2-L03", "rests in a four-beat bar"], ["G2-U2-L05", "two ledger lines"], ["G2-U3-L02", "B flat and E flat major scales"], ["G2-U4-L03", "harmonic minor"], ["G2-U5-L03", "signs on a melody"]]) {
  await test(`teaching in the browser, one lesson from each later unit: ${lesson} (${label})`, async () => {
    const { ctx, page, userId } = await grade2Learner(profiles.iphone);
    const node = S.course.ix.nodeById.get(lesson);
    const prior = G2.filter((n) => n.order < node.order && ["lesson", "enrichment"].includes(n.type) && !n.optional);
    for (const p of prior) await finishViaApi(S, page, userId, p.id);
    await playLessonInBrowser(page, S, lesson, {
      afterTeach: async (p) => { await noOverflow(p, `${lesson} teach`); await axe(p, `${lesson} teach`); await shot(p, `g2-teach-${lesson}`); },
      afterDemo: async (p) => { await noOverflow(p, `${lesson} demo`); await shot(p, `g2-demo-${lesson}`); },
    });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
    assert.equal((await get(page, "/api/progress")).nodes[lesson].state, "completed");
    await ctx.close();
  });
}

for (const unit of ["G2-U2", "G2-U3", "G2-U4", "G2-U5"]) {
  await test(`practice in the browser: ${unit}`, async () => {
    const { ctx, page, userId } = await grade2Learner(profiles.desktop);
    await finishViaApi(S, page, userId, `${unit}-L0${unit === "G2-U4" ? 5 : unit === "G2-U5" ? 4 : unit === "G2-U3" ? 4 : 6}`);
    await playNodeInBrowser(page, S, userId, `${unit}-P1`);
    await page.getByRole("heading", { name: "Practice complete" }).waitFor();
    await noOverflow(page, `${unit} practice done`);
    await ctx.close();
  });
}

await test("resumes after an interruption: part-way through a lesson and part-way through a challenge", async () => {
  const { ctx, page, userId } = await grade2Learner(profiles.iphone);
  await finishViaApi(S, page, userId, "G2-U1-L01");
  await post(page, "/api/lessons/G2-U1-L02/start");
  await playLessonInBrowser(page, S, "G2-U1-L02", { stopAfter: 3 });
  await page.getByText(/Question 4 of/).waitFor();
  await page.reload();
  await page.getByText(/Question 4 of/).waitFor();
  await finishViaApi(S, page, userId, "G2-U1-R1");
  await page.goto("/lesson/G2-U1-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G2-U1-C");
  for (let k = 0; k < 2; k++) {
    await answerOnScreen(page, S, items[k].item, items[k].scope, canonicalResponse(S.course.ix, items[k].item, items[k].scope));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(new RegExp(`Question 3 of ${items.length}`)).waitFor();
  await ctx.close();
});

await test("complete progression to the Grade 2 assessment: below the pass mark with what to revisit, then a retake that passes and earns the grade badge; the preview stays optional", async () => {
  const { ctx, page, userId } = await grade2Learner(profiles.desktop);
  // every unit's lessons, practice, review and challenge are finished (Unit 1 was played in the browser above)
  for (const n of G2.filter((x) => x.type === "unit_challenge")) await finishViaApi(S, page, userId, n.id);
  await finishViaApi(S, page, userId, "G2-U5-R1");
  const g2 = (await get(page, "/api/progress")).grades.find((g) => g.grade === 2);
  assert.equal(g2.completedNodes, g2.requiredNodes - 1, "only the assessment is left");
  await playNodeInBrowser(page, S, userId, "G2-A", { wrong: 14 });
  await page.getByRole("heading", { name: "Not passed yet" }).waitFor();
  await page.getByText(/not an ABRSM examination/i).waitFor();
  await noOverflow(page, "assessment result");
  await axe(page, "assessment result");
  await shot(page, "g2-11-assessment-not-passed");
  assert.notEqual((await get(page, "/api/progress")).nodes["G2-A"].state, "completed");
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g2.grade-complete").earned, false);
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G2-A")) {
    try {
      await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    } catch (e) {
      throw new Error(`${it.item.templateId} "${it.item.prompt}" (${inputFor(S.course.ix, it.item, it.scope).kind}): ${e.message}`, { cause: e });
    }
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
  await page.getByRole("heading", { name: "Grade 2 assessment passed" }).waitFor();
  await shot(page, "g2-12-assessment-passed");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G2-A"].state, "completed");
  assert.equal(prog.grades.find((g) => g.grade === 2).completedNodes, 44);
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g2.grade-complete").earned, true);
  // the preview is optional: still not completed, playable now, and it changes nothing about the grade
  assert.notEqual(prog.nodes["G2-U4-E1"].state, "completed");
  await playLessonInBrowser(page, S, "G2-U4-E1");
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await shot(page, "g2-13-optional-preview-complete");
  assert.equal((await get(page, "/api/progress")).grades.find((g) => g.grade === 2).requiredNodes, 44);
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await shot(page, "g2-14-progress-after-grade");
  await ctx.close();
});

for (const [name, p] of Object.entries(profiles)) {
  await test(`layout and accessibility on ${name}: a triplet lesson, a question, and a unit challenge`, async () => {
    const { ctx, page, userId } = await grade2Learner(p);
    await finishViaApi(S, page, userId, "G2-U1-L03");
    await page.goto("/lesson/G2-U1-L04");
    await page.getByRole("button", { name: "Let's go" }).click();
    await noOverflow(page, `${name} teach`);
    await axe(page, `${name} teach`);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await noOverflow(page, `${name} demo`);
    await axe(page, `${name} demo`);
    await page.getByRole("button", { name: "Try some questions" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} question`);
    await axe(page, `${name} question`);
    await shot(page, `g2-${name}-question`);
    await finishViaApi(S, page, userId, "G2-U1-R1");
    await page.goto("/lesson/G2-U1-C");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} challenge question`);
    await axe(page, `${name} challenge question`);
    await ctx.close();
  });
}

await test("keyboard-only: a Grade 2 challenge question is answered with Tab, Space and Enter", async () => {
  const { ctx, page, userId } = await grade2Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G2-U1-R1");
  // find a challenge run whose first choice question can be answered without a pointer
  let started = false;
  for (let tries = 0; tries < 6 && !started; tries++) {
    await post(page, "/api/nodes/G2-U1-C/start");
    const items = S.app.nodes.internalItems(userId, "G2-U1-C");
    const first = items[0];
    const r = canonicalResponse(S.course.ix, first.item, first.scope);
    if (r.kind === "choice") started = true;
    else {
      // answer it (correctly) and look at the next run's first question
      for (const it of items) await post(page, `/api/nodes/G2-U1-C/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: canonicalResponse(S.course.ix, it.item, it.scope) });
      await post(page, "/api/nodes/G2-U1-C/complete");
      S.clock.advanceDays(1);
    }
  }
  assert.ok(started, "a run whose first question is a choice was found");
  await page.goto("/lesson/G2-U1-C");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const first = S.app.nodes.internalItems(userId, "G2-U1-C")[0];
  const r = canonicalResponse(S.course.ix, first.item, first.scope);
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

await test("preferences: dark mode, reduced motion and 200% text at 320px on a Grade 2 question", async () => {
  for (const [label, extra, init, prof] of [
    ["dark", { colorScheme: "dark" }, null, profiles.desktop],
    ["reduced motion", { reducedMotion: "reduce" }, null, profiles.desktop],
    ["200% text at 320px", {}, () => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")), profiles["phone-320"]],
  ]) {
    const { ctx, page, userId } = await grade2Learner(prof, extra, init);
    await finishViaApi(S, page, userId, "G2-U2-L04");
    await page.goto("/lesson/G2-U2-L05");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await noOverflow(page, `ledger demo (${label})`);
    await axe(page, `ledger demo (${label})`);
    await page.getByRole("button", { name: "Try some questions" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `ledger question (${label})`);
    await axe(page, `ledger question (${label})`);
    await shot(page, `g2-pref-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  }
});

await test("notation has accessible descriptions: a triplet bar and a ledger-line note", async () => {
  const { ctx, page, userId } = await grade2Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G2-U1-L03");
  await page.goto("/lesson/G2-U1-L04");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.locator("svg.notation-svg").first().waitFor();
  const imgs = await page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  assert.ok(imgs.length > 0 && imgs.every((t) => t.length > 15), `every notation picture has a description: ${JSON.stringify(imgs)}`);
  assert.ok(imgs.some((t) => /triplet/i.test(t)), "a triplet is described as a triplet");
  await ctx.close();
});

await test("a melody question is answerable without seeing the page: the triplet's notes and the marked note are named", async () => {
  const items = S.course.authoredItems("G2-U5-L04");
  const kt = items.findIndex((it) => it.prompt.includes("contains a triplet"));
  const kx = items.findIndex((it) => it.prompt.includes("interval, by number"));
  assert.ok(kt >= 0 && kx >= 0, "the lesson asks a triplet question and a marked-note question");
  for (const [k, expectText, inNames] of [[kt, /triplet group of three notes sharing one beat/, /in a triplet group/], [kx, /\(the note marked x\)/, /the note marked x/]]) {
    const { ctx, page, userId } = await grade2Learner(profiles.desktop);
    await finishViaApi(S, page, userId, "G2-U5-L08"); // the melody lesson now follows the four terminology lessons
    await playLessonInBrowser(page, S, "G2-U5-L04", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const described = await page.locator("svg.notation-svg").first().getAttribute("aria-label");
    assert.match(described, /Bar 1:/);
    assert.match(described, expectText, `question ${k + 1} description`);
    const names = await page.locator("svg.notation-svg [role='button']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    assert.ok(names.some((n) => inNames.test(n)), `question ${k + 1}: note buttons carry the information: ${JSON.stringify(names)}`);
    await ctx.close();
  }
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} Grade 2 journey(s) failed`);
  process.exit(1);
}
console.log("All Grade 2 journeys passed");
process.exit(0);
