// Brief 08 real-browser verification of the Grade 4 course. The server runs in this process with the real content and a controllable
// clock; the learner's actions go through the real controls. Covers: a learner arriving from Grade 3, the first lesson (with a wrong
// answer and its explanation), Unit 1 end to end (all five lessons, practice, review and a challenge in the browser, XP once, revision
// days later), a lesson from every later unit, practice for each later unit, a challenge failed and then passed, resuming after
// interruption, the complete progression to the Grade 4 assessment (a below-pass result with what to revisit, then a retake that
// passes), keyboard-only answering, screen-reader descriptions of alto-clef, double-accidental, ornament and chord notation, and the
// responsive / preference matrix (phone, 320px, tablet, desktop, dark mode, reduced motion, 200% text) with the hardest notation:
// chromatic scales, chords on two staves and multi-bar passages.
// Run: npm run build && node --import tsx e2e/g4.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, completeEarlier, finishViaApi, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, playReviewInBrowser, post, selectGrade, serve, shot } from "./g4lib.mjs";
import { canonicalResponse, generateItem, inputFor } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";

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
/** A guest learner whose Grades 1-3 are finished and who has chosen Grade 4. */
async function grade4Learner(p = profiles.desktop, extra = {}, init = null) {
  const ctx = await ctxFor(p, extra);
  const { page, userId } = await guest(ctx);
  if (init) await page.addInitScript(init);
  completeEarlier(S, userId);
  await selectGrade(page, 4);
  return { ctx, page, userId };
}
const G4 = S.course.nodes.filter((n) => n.grade === 4);
/** The learning node just before a node on the path (finishing it finishes everything earlier, including a previous unit's review). */
const predecessor = (id) => {
  const node = S.course.ix.nodeById.get(id);
  return G4.filter((n) => n.order < node.order && ["lesson", "practice", "review"].includes(n.type) && !n.optional).at(-1);
};
const labelsOf = (page) => page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
await test("learner arriving from Grade 3: Grade 4 opens at its first lesson, later lessons are locked, the first lesson teaches and rewards", async () => {
  const { ctx, page } = await grade4Learner(profiles.iphone, { reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await page.locator('[data-node="G4-U1-L01"]').waitFor();
  assert.equal(await page.locator('[data-node="G4-U1-L01"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G4-U1-L02"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator('[data-node="G4-U4-L01"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator("[data-node]").count(), 42, "all 42 Grade 4 nodes are on the path");
  await noOverflow(page, "grade 4 path");
  await axe(page, "grade 4 path");
  await shot(page, "g4-01-path");
  await page.locator('[data-node="G4-U1-L02"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G4-U1-L02"]').click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "g4-02-locked-node-explains");
  await page.keyboard.press("Escape");
  const taught = [];
  await playLessonInBrowser(page, S, "G4-U1-L01", {
    wrongAt: 1,
    afterTeach: async (p) => { await noOverflow(p, "teach"); await axe(p, "teach"); await shot(p, "g4-03-teach-breve"); },
    afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); await noOverflow(p, "demo"); await shot(p, "g4-04-demo"); },
    afterWrong: async (p) => { await shot(p, "g4-05-wrong-answer-explained"); taught.push(await p.locator(".feedback").innerText()); },
  });
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText(/10 XP/).first().waitFor();
  await noOverflow(page, "lesson complete");
  await axe(page, "lesson complete");
  assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G4-U1-L01"].state, "completed");
  assert.equal(prog.nodes["G4-U1-L02"].state, "available");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("Unit 1 end to end in the browser: five lessons, practice, review and a challenge; XP once each; revision due later", async () => {
  const { ctx, page, userId } = await grade4Learner(profiles.desktop);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["G4-U1-L01", "G4-U1-L02", "G4-U1-L03", "G4-U1-L04", "G4-U1-L05"]) {
    await playLessonInBrowser(page, S, id, { afterTeach: id === "G4-U1-L04" ? async (p) => { await shot(p, "g4-07-teach-grouping"); await axe(p, "grouping teaching"); } : undefined });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  }
  await page.goto("/lesson/G4-U1-P1");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list p").first().waitFor();
  await playNodeInBrowser(page, S, userId, "G4-U1-P1", { wrong: 1 });
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();
  await playNodeInBrowser(page, S, userId, "G4-U1-R1");
  await page.getByRole("heading", { name: "Review complete" }).waitFor();
  const before = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G4-U1-C", {
    wrong: 1, // eight questions and a 70% pass mark: two slips are tolerated, three are not
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
  await shot(page, "g4-09-challenge-passed");
  assert.equal((await get(page, "/api/xp")).total - before, 15, "the challenge pays 15 XP once");
  assert.equal((await get(page, "/api/progress")).nodes["G4-U1-C"].state, "completed");
  assert.equal((await get(page, "/api/review")).groups.ready.length, 0, "nothing is due straight after learning");
  S.clock.advanceDays(4);
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const due = (await get(page, "/api/review")).groups.ready;
  assert.ok(due.length > 0, "Grade 4 topics are due four days later");
  const started = await post(page, "/api/review/sessions");
  assert.equal(started.status, 200);
  await playReviewInBrowser(page, S, started.body.session.id);
  await shot(page, "g4-10-revision-done");
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [lesson, label] of [["G4-U2-L01", "double sharps and cancelling"], ["G4-U2-L03", "the alto clef"], ["G4-U2-L05", "octave transposition into the alto clef"], ["G4-U3-L01", "B major and G sharp minor"], ["G4-U3-L03", "key signatures in the alto clef"], ["G4-U3-L05", "the chromatic scale"], ["G4-U4-L02", "augmented and diminished intervals"], ["G4-U4-L04", "chords: spacing and doubling"], ["G4-U5-L01", "ornament signs"], ["G4-U5-L05", "a passage"]]) {
  await test(`teaching in the browser, a lesson from each later unit: ${lesson} (${label})`, async () => {
    const { ctx, page, userId } = await grade4Learner(profiles.iphone);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, {
      afterTeach: async (p) => { await noOverflow(p, `${lesson} teach`); await axe(p, `${lesson} teach`); await shot(p, `g4-teach-${lesson}`); },
      afterDemo: async (p) => { await noOverflow(p, `${lesson} demo`); await shot(p, `g4-demo-${lesson}`); },
    });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
    assert.equal((await get(page, "/api/progress")).nodes[lesson].state, "completed");
    await ctx.close();
  });
}

for (const unit of ["G4-U2", "G4-U3", "G4-U4", "G4-U5"]) {
  await test(`practice in the browser: ${unit}`, async () => {
    const { ctx, page, userId } = await grade4Learner(profiles.desktop);
    const last = G4.filter((n) => n.unitId === unit && n.type === "lesson").at(-1).id;
    await finishViaApi(S, page, userId, last);
    await playNodeInBrowser(page, S, userId, `${unit}-P1`);
    await page.getByRole("heading", { name: "Practice complete" }).waitFor();
    await noOverflow(page, `${unit} practice done`);
    await ctx.close();
  });
}

await test("a failed unit challenge is recorded honestly, pays nothing, and a retry with fresh questions passes", async () => {
  // a run is sampled per learner; use a learner whose run has at least two choice questions (wrong answers are only injected on choices)
  let ctx, page, userId, items, choices = 0;
  for (let tries = 0; tries < 12 && choices < 2; tries++) {
    if (ctx) await ctx.close();
    ({ ctx, page, userId } = await grade4Learner(profiles.desktop));
    await finishViaApi(S, page, userId, "G4-U4-R1");
    await post(page, "/api/nodes/G4-U4-C/start");
    items = S.app.nodes.internalItems(userId, "G4-U4-C");
    choices = items.filter((it) => inputFor(S.course.ix, it.item, it.scope).kind === "choice").length;
  }
  assert.ok(choices >= 2, `enough choice questions (${choices}) to fail on: six questions, pass mark 70%, two wrong fail`);
  const xp0 = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G4-U4-C", { wrong: choices });
  await page.getByRole("heading", { name: /Not passed yet|Not quite|Challenge not passed/ }).waitFor();
  await noOverflow(page, "failed challenge");
  await axe(page, "failed challenge");
  await shot(page, "g4-challenge-failed");
  assert.equal((await get(page, "/api/xp")).total - xp0, 0, "no XP for a failed run");
  assert.notEqual((await get(page, "/api/progress")).nodes["G4-U2-C"].state, "completed");
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G4-U4-C")) {
    await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.getByRole("heading", { name: /Challenge passed/ }).waitFor();
  assert.equal((await get(page, "/api/progress")).nodes["G4-U4-C"].state, "completed");
  const results = (await get(page, "/api/results")).results.filter((r) => r.nodeId === "G4-U4-C");
  assert.deepEqual(results.map((r) => r.passed).sort(), [false, true]);
  await ctx.close();
});

await test("resumes after an interruption: part-way through a lesson and part-way through a challenge", async () => {
  const { ctx, page, userId } = await grade4Learner(profiles.iphone);
  await finishViaApi(S, page, userId, "G4-U1-L01");
  await post(page, "/api/lessons/G4-U1-L02/start");
  await playLessonInBrowser(page, S, "G4-U1-L02", { stopAfter: 3 });
  await page.getByText(/Question 4 of/).waitFor();
  await page.reload();
  await page.getByText(/Question 4 of/).waitFor();
  await finishViaApi(S, page, userId, "G4-U1-R1");
  await page.goto("/lesson/G4-U1-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G4-U1-C");
  for (let k = 0; k < 2; k++) {
    await answerOnScreen(page, S, items[k].item, items[k].scope, canonicalResponse(S.course.ix, items[k].item, items[k].scope));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(new RegExp(`Question 3 of ${items.length}`)).waitFor();
  await ctx.close();
});

await test("complete progression to the Grade 4 assessment: below the pass mark with what to revisit, then a retake that passes and earns the grade badge", async () => {
  const { ctx, page, userId } = await grade4Learner(profiles.desktop);
  for (const n of G4.filter((x) => x.type === "unit_challenge")) await finishViaApi(S, page, userId, n.id);
  await finishViaApi(S, page, userId, "G4-U5-R1");
  const g4 = (await get(page, "/api/progress")).grades.find((g) => g.grade === 4);
  assert.equal(g4.completedNodes, g4.requiredNodes - 1, "only the assessment is left");
  await post(page, "/api/nodes/G4-A/start");
  const first = S.app.nodes.internalItems(userId, "G4-A");
  assert.equal(first.length, 41);
  const choices = first.filter((it) => inputFor(S.course.ix, it.item, it.scope).kind === "choice").length;
  assert.ok(choices >= 15, `enough choice questions (${choices} of ${first.length}) to fall below the pass mark`);
  await playNodeInBrowser(page, S, userId, "G4-A", { wrong: choices });
  await page.getByRole("heading", { name: "Not passed yet" }).waitFor();
  await page.getByText(/not an ABRSM examination/i).waitFor();
  await noOverflow(page, "assessment result");
  await axe(page, "assessment result");
  await shot(page, "g4-11-assessment-not-passed");
  assert.notEqual((await get(page, "/api/progress")).nodes["G4-A"].state, "completed");
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g4.grade-complete").earned, false);
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G4-A")) {
    try {
      await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    } catch (e) {
      throw new Error(`${it.item.templateId} "${it.item.prompt}" (${inputFor(S.course.ix, it.item, it.scope).kind}): ${e.message}`, { cause: e });
    }
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
  await page.getByRole("heading", { name: "Grade 4 assessment passed" }).waitFor();
  await shot(page, "g4-12-assessment-passed");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G4-A"].state, "completed");
  assert.equal(prog.grades.find((g) => g.grade === 4).completedNodes, 42);
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g4.grade-complete").earned, true);
  const results = (await get(page, "/api/results")).results.filter((r) => r.nodeId === "G4-A");
  assert.deepEqual(results.map((r) => r.passed).sort(), [false, true], "both results are recorded; the retake did not overwrite the first");
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await ctx.close();
});

for (const [name, p] of Object.entries(profiles)) {
  await test(`layout and accessibility on ${name}: a grouping lesson, a question, and a unit challenge`, async () => {
    const { ctx, page, userId } = await grade4Learner(p);
    await finishViaApi(S, page, userId, "G4-U1-L03");
    await page.goto("/lesson/G4-U1-L04");
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
    await shot(page, `g4-${name}-question`);
    await finishViaApi(S, page, userId, "G4-U1-R1");
    await page.goto("/lesson/G4-U1-C");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} challenge question`);
    await axe(page, `${name} challenge question`);
    await ctx.close();
  });
}

await test("keyboard-only: a Grade 4 challenge question is answered with Tab, Space and Enter", async () => {
  const { ctx, page, userId } = await grade4Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G4-U1-R1");
  let started = false;
  for (let tries = 0; tries < 10 && !started; tries++) {
    await post(page, "/api/nodes/G4-U1-C/start");
    const items = S.app.nodes.internalItems(userId, "G4-U1-C");
    const first = items[0];
    const r = canonicalResponse(S.course.ix, first.item, first.scope);
    if (r.kind === "choice") started = true;
    else {
      for (const it of items) await post(page, `/api/nodes/G4-U1-C/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: canonicalResponse(S.course.ix, it.item, it.scope) });
      await post(page, "/api/nodes/G4-U1-C/complete");
      S.clock.advanceDays(1);
    }
  }
  assert.ok(started, "a run whose first question is a choice was found");
  await page.goto("/lesson/G4-U1-C");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const first = S.app.nodes.internalItems(userId, "G4-U1-C")[0];
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

await test("preferences: dark mode, reduced motion and 200% text at 320px on the alto-clef lesson", async () => {
  for (const [label, extra, init, prof] of [
    ["dark", { colorScheme: "dark" }, null, profiles.desktop],
    ["reduced motion", { reducedMotion: "reduce" }, null, profiles.desktop],
    ["200% text at 320px", {}, () => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")), profiles["phone-320"]],
  ]) {
    const { ctx, page, userId } = await grade4Learner(prof, extra, init);
    await finishViaApi(S, page, userId, "G4-U2-L02");
    await page.goto("/lesson/G4-U2-L03");
    await page.getByRole("button", { name: "Let's go" }).click();
    await noOverflow(page, `alto teach (${label})`);
    await axe(page, `alto teach (${label})`);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await noOverflow(page, `alto demo (${label})`);
    await axe(page, `alto demo (${label})`);
    await page.getByRole("button", { name: "Try some questions" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `alto question (${label})`);
    await axe(page, `alto question (${label})`);
    await shot(page, `g4-pref-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  }
});

await test("the hardest notation fits a 320px screen and is described: a 13-note chromatic scale, chords on two staves and a multi-bar passage", async () => {
  // chromatic scale lesson teaching (13 semibreves in one bar)
  {
    const { ctx, page, userId } = await grade4Learner(profiles["phone-320"]);
    await finishViaApi(S, page, userId, predecessor("G4-U3-L05").id);
    await page.goto("/lesson/G4-U3-L05");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("svg.notation-svg").first().waitFor();
    await noOverflow(page, "chromatic teaching on 320px");
    const imgs = await labelsOf(page);
    assert.ok(imgs.length > 0 && imgs.every((t) => t.length > 15), `every notation picture has a description: ${JSON.stringify(imgs)}`);
    await ctx.close();
  }
  // a chromatic-scale question (the learner builds 13 notes)
  {
    const { ctx, page, userId } = await grade4Learner(profiles["phone-320"]);
    const items = S.course.authoredItems("G4-U3-L05");
    const k = items.findIndex((it) => it.templateId === "t.g4.chromatic-scale");
    assert.ok(k >= 0);
    await finishViaApi(S, page, userId, predecessor("G4-U3-L05").id);
    await playLessonInBrowser(page, S, "G4-U3-L05", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    await noOverflow(page, "chromatic scale builder on 320px");
    await ctx.close();
  }
  // chords on two staves (spread chord) and a chord passage
  for (const [lesson, tpl, bars] of [["G4-U4-L04", "t.g4.chord-spread", null], ["G4-U4-L05", "t.g4.chord-in-passage", 3]]) {
    const { ctx, page, userId } = await grade4Learner(profiles["phone-320"]);
    const items = S.course.authoredItems(lesson);
    const k = items.findIndex((it) => it.templateId === tpl);
    assert.ok(k >= 0, `${lesson} has ${tpl}`);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    await noOverflow(page, `${tpl} on 320px`);
    const imgs = await labelsOf(page);
    assert.ok(imgs.length >= 1, "the system of staves is pictured");
    // one picture holds both staves; its description speaks both of them
    assert.ok(imgs.some((t) => /Treble stave/.test(t) && /Bass stave/.test(t)), JSON.stringify(imgs));
    if (bars) assert.ok(imgs.some((t) => /Bar 3/.test(t)), "a three-bar passage describes its third bar");
    await axe(page, `${tpl} question`);
    await ctx.close();
  }
  // a passage with an ornament, a direction and an instrument on 320px
  {
    const { ctx, page, userId } = await grade4Learner(profiles["phone-320"]);
    const items = S.course.authoredItems("G4-U5-L05");
    const k = items.findIndex((it) => it.templateId === "t.g4.passage");
    await finishViaApi(S, page, userId, predecessor("G4-U5-L05").id);
    await playLessonInBrowser(page, S, "G4-U5-L05", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    await noOverflow(page, "passage on 320px");
    await axe(page, "passage question");
    await ctx.close();
  }
});

await test("alto-clef, double-accidental and ornament notation is spoken: positions, signs and what small notes and signs look like", async () => {
  {
    const { ctx, page, userId } = await grade4Learner(profiles.desktop);
    const items = S.course.authoredItems("G4-U2-L03");
    const k = items.findIndex((it) => it.templateId === "t.g4.alto-read");
    await finishViaApi(S, page, userId, predecessor("G4-U2-L03").id);
    await playLessonInBrowser(page, S, "G4-U2-L03", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const described = (await labelsOf(page))[0];
    assert.match(described, /alto-clef/i, "the clef is named");
    assert.match(described, /\b(line|space)\b/, "the position is spoken");
    await ctx.close();
  }
  {
    const { ctx, page, userId } = await grade4Learner(profiles.desktop);
    const items = S.course.authoredItems("G4-U2-L01");
    const k = items.findIndex((it) => it.templateId === "t.g4.double-name");
    await finishViaApi(S, page, userId, predecessor("G4-U2-L01").id);
    await playLessonInBrowser(page, S, "G4-U2-L01", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const described = (await labelsOf(page))[0];
    assert.match(described, /double (sharp|flat) sign/, "the double sign is described");
    await ctx.close();
  }
  {
    const { ctx, page, userId } = await grade4Learner(profiles.desktop);
    const items = S.course.authoredItems("G4-U5-L01");
    const k = items.findIndex((it) => it.templateId === "t.g4.ornament-spot");
    await finishViaApi(S, page, userId, predecessor("G4-U5-L01").id);
    await playLessonInBrowser(page, S, "G4-U5-L01", { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const described = (await labelsOf(page))[0];
    assert.match(described, /zig-zag|sideways S|letters tr|small note/, "ornaments are described by their look");
    assert.match(described, /marked [ABC]/, "marked notes are named");
    await ctx.close();
  }
});


// Review P2-3: C major and A minor have an EMPTY key signature. The writer needs an explicit "No sharps or flats" answer, which must be
// submittable by touch and by keyboard, including after a required practice was interrupted and resumed.
/** Start the required practice until a run holds a write-the-signature question for C major or A minor; answer everything before it by API. */
async function emptySignatureRun(page, userId) {
  await finishViaApi(S, page, userId, predecessor("G4-U3-P1").id);
  await post(page, "/api/nodes/G4-U3-P1/start");
  // The run's key-signature question is replaced, in the stored run, by the same template's question for C major or A minor
  // (a random run almost never draws one); it is regenerated from its seed exactly as a real run would be.
  const row = S.db.prepare("SELECT run, items FROM node_sessions WHERE user_id = ? AND node_id = 'G4-U3-P1' AND status = 'open'").get(userId);
  const planned = JSON.parse(row.items);
  const slot = planned.findIndex((x) => x.templateId === "t.g4.key-signature");
  assert.ok(slot >= 0, "the practice asks a key-signature question");
  const node = S.course.ix.nodeById.get("G4-U3-P1");
  const binding = node.exercises.find((x) => x.templateId === "t.g4.key-signature");
  const scope = effectiveScope(S.course.ix, node, binding);
  for (let seed = 1; seed < 4000; seed++) {
    let g;
    try { g = generateItem(S.course.ix, "t.g4.key-signature", seed, { scope, evidence: "independent" }); } catch { continue; }
    const a = g.item.answer;
    if (a.kind !== "key-signature" || a.task !== "write-signature" || !a.accepted.every((k) => ["C major", "A minor"].includes(k))) continue;
    planned[slot] = { ...planned[slot], itemId: g.item.id, seed, fingerprint: g.fingerprint };
    S.db.prepare("UPDATE node_sessions SET items = ? WHERE user_id = ? AND node_id = 'G4-U3-P1' AND run = ?").run(JSON.stringify(planned), userId, row.run);
    const items = S.app.nodes.internalItems(userId, "G4-U3-P1");
    const k = items.findIndex((it) => it.itemId === g.item.id);
    assert.ok(k >= 0, "the stored run resolves the replaced question");
    return { items, k };
  }
  throw new Error("no seed asks the C major / A minor write-the-signature question");
}
for (const [label, prof, keyboard] of [["mobile (touch)", profiles.iphone, false], ["320px", profiles["phone-320"], false], ["keyboard only", profiles.desktop, true]]) {
  await test(`empty key signature (${label}): "No sharps or flats" answers C major / A minor, also after the required practice is interrupted and resumed`, async () => {
    const { ctx, page, userId } = await grade4Learner(prof);
    const { items, k } = await emptySignatureRun(page, userId);
    assert.deepEqual(items[k].item.answer.accepted.length > 0, true);
    for (let j = 0; j < k; j++) await post(page, "/api/nodes/G4-U3-P1/attempts", { attemptId: crypto.randomUUID(), itemId: items[j].itemId, response: canonicalResponse(S.course.ix, items[j].item, items[j].scope) });
    await page.goto("/lesson/G4-U3-P1");
    await page.getByRole("button", { name: /Let's go|Continue/ }).click();
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    await page.reload(); // the interruption
    await page.getByRole("button", { name: /Let's go|Continue/ }).click();
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const toggle = page.getByRole("button", { name: "No sharps or flats" });
    await toggle.waitFor();
    const check = page.getByRole("button", { name: "Check" });
    assert.equal(await check.isDisabled(), true, "nothing is submittable until the empty signature is chosen");
    if (keyboard) {
      await toggle.focus();
      await page.keyboard.press("Space");
    } else await toggle.tap();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await check.isDisabled(), false);
    await page.waitForTimeout(600); // the Check button fades from disabled to enabled; audit the settled colours
    await noOverflow(page, "empty key signature");
    await axe(page, "empty key signature");
    if (keyboard) {
      for (let i = 0; i < 12; i++) {
        if ((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Check") break;
        await page.keyboard.press("Tab");
      }
      await page.keyboard.press("Enter");
    } else await check.tap();
    await page.locator(".feedback").getByText("Correct!").waitFor();
    await ctx.close();
  });
}

// Review P2-7: playable duplet notes are announced as duplets and triplet notes as triplets (Grade 2 triplet behaviour is unchanged).
await test("tuplet accessibility: duplet notes are named duplets (Grade 4) and triplet notes are named triplets (Grade 2)", async () => {
  const items = S.course.authoredItems("G4-U1-L05");
  const kd = items.findIndex((it) => it.templateId === "t.g4.duplet-read");
  assert.ok(kd >= 0, "the duplet lesson has a notated duplet bar");
  const { ctx, page, userId } = await grade4Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G4-U1-L04");
  await playLessonInBrowser(page, S, "G4-U1-L05", { stopAfter: kd });
  await page.getByText(new RegExp(`Question ${kd + 1} of ${items.length}`)).waitFor();
  const names = await page.locator("svg.notation-svg [role='button']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const inGroup = names.filter((n) => /in a (duplet|triplet|tuplet) group/.test(n));
  assert.ok(inGroup.length >= 2, `duplet notes carry their group: ${JSON.stringify(names)}`);
  assert.ok(inGroup.every((n) => /in a duplet group/.test(n)), `every grouped note is a duplet note, none a triplet: ${JSON.stringify(inGroup)}`);
  assert.ok(!names.some((n) => /triplet|tuplet group/.test(n)), "no duplet note is announced as a triplet or a generic tuplet");
  await ctx.close();
  const g2items = S.course.authoredItems("G2-U5-L04");
  const kt = g2items.findIndex((it) => it.prompt.includes("contains a triplet"));
  assert.ok(kt >= 0);
  const g2 = await grade4Learner(profiles.desktop);
  await finishViaApi(S, g2.page, g2.userId, "G2-U5-L08");
  await playLessonInBrowser(g2.page, S, "G2-U5-L04", { stopAfter: kt });
  await g2.page.getByText(new RegExp(`Question ${kt + 1} of ${g2items.length}`)).waitFor();
  const tnames = await g2.page.locator("svg.notation-svg [role='button']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const tin = tnames.filter((n) => /in a (duplet|triplet|tuplet) group/.test(n));
  assert.ok(tin.length >= 3 && tin.every((n) => /in a triplet group/.test(n)), `triplet notes are announced as triplets: ${JSON.stringify(tnames)}`);
  await g2.ctx.close();
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} Grade 4 journey(s) failed`);
  process.exit(1);
}
console.log("All Grade 4 journeys passed");
process.exit(0);
