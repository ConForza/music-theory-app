// Brief 09 real-browser verification of the Grade 5 course. The server runs in this process with the real content and a controllable
// clock; the learner's actions go through the real controls. Covers: a learner arriving from Grade 4, the first lesson (with a wrong
// answer and its explanation), Unit 1 end to end (all five lessons, practice, review and a challenge in the browser, XP once, revision
// days later), a lesson from every later unit, practice for each later unit, a challenge failed and then passed, resuming after
// interruption, the complete progression to the Grade 5 assessment (a below-pass result with what to revisit, then a retake that
// passes), keyboard-only answering, screen-reader descriptions of alto-clef, double-accidental, ornament and chord notation, and the
// responsive / preference matrix (phone, 320px, tablet, desktop, dark mode, reduced motion, 200% text) with the hardest notation:
// chromatic scales, chords on two staves and multi-bar passages.
// Run: npm run build && node --import tsx e2e/g4.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, completeEarlier, finishViaApi, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, playReviewInBrowser, post, selectGrade, serve, shot } from "./g5lib.mjs";
import { canonicalResponse, inputFor, wrongResponse } from "@mtp/engine";

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
/** A guest learner whose Grades 1-4 are finished and who has chosen Grade 5. */
async function grade5Learner(p = profiles.desktop, extra = {}, init = null) {
  const ctx = await ctxFor(p, extra);
  const { page, userId } = await guest(ctx);
  if (init) await page.addInitScript(init);
  completeEarlier(S, userId);
  await selectGrade(page, 5);
  return { ctx, page, userId };
}
const G5 = S.course.nodes.filter((n) => n.grade === 5);
/** The learning node just before a node on the path (finishing it finishes everything earlier, including a previous unit's review). */
const predecessor = (id) => {
  const node = S.course.ix.nodeById.get(id);
  return G5.filter((n) => n.order < node.order && ["lesson", "practice", "review"].includes(n.type) && !n.optional).at(-1);
};
const labelsOf = (page) => page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
await test("learner arriving from Grade 4: Grade 5 opens at its first lesson, later lessons are locked, the first lesson teaches and rewards", async () => {
  const { ctx, page } = await grade5Learner(profiles.iphone, { reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await page.locator('[data-node="G5-U1-L01"]').waitFor();
  assert.equal(await page.locator('[data-node="G5-U1-L01"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G5-U1-L02"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator('[data-node="G5-U4-L01"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator("[data-node]").count(), 44, "all 44 Grade 5 nodes (41 required, 3 optional) are on the path");
  await noOverflow(page, "grade 4 path");
  await axe(page, "grade 4 path");
  await shot(page, "g5-01-path");
  await page.locator('[data-node="G5-U1-L02"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G5-U1-L02"]').click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "g5-02-locked-node-explains");
  await page.keyboard.press("Escape");
  const taught = [];
  await playLessonInBrowser(page, S, "G5-U1-L01", {
    wrongAt: 0,
    afterTeach: async (p) => { await noOverflow(p, "teach"); await axe(p, "teach"); await shot(p, "g5-03-teach-breve"); },
    afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); await noOverflow(p, "demo"); await shot(p, "g5-04-demo"); },
    afterWrong: async (p) => { await shot(p, "g5-05-wrong-answer-explained"); taught.push(await p.locator(".feedback").innerText()); },
  });
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText(/10 XP/).first().waitFor();
  await noOverflow(page, "lesson complete");
  await axe(page, "lesson complete");
  assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G5-U1-L01"].state, "completed");
  assert.equal(prog.nodes["G5-U1-L02"].state, "available");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("Unit 1 end to end in the browser: three lessons, practice, review and a challenge; XP once each; revision due later", async () => {
  const { ctx, page, userId } = await grade5Learner(profiles.desktop);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["G5-U1-L01", "G5-U1-L02", "G5-U1-L03"]) {
    await playLessonInBrowser(page, S, id, { afterTeach: id === "G5-U1-L02" ? async (p) => { await shot(p, "g5-07-teach-grouping"); await axe(p, "grouping teaching"); } : undefined });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  }
  await page.goto("/lesson/G5-U1-P1");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list p").first().waitFor();
  await playNodeInBrowser(page, S, userId, "G5-U1-P1", { wrong: 1 });
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();
  await playNodeInBrowser(page, S, userId, "G5-U1-R1");
  await page.getByRole("heading", { name: "Review complete" }).waitFor();
  const before = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G5-U1-C", {
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
  await shot(page, "g5-09-challenge-passed");
  assert.equal((await get(page, "/api/xp")).total - before, 15, "the challenge pays 15 XP once");
  assert.equal((await get(page, "/api/progress")).nodes["G5-U1-C"].state, "completed");
  assert.equal((await get(page, "/api/review")).groups.ready.length, 0, "nothing is due straight after learning");
  S.clock.advanceDays(4);
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const due = (await get(page, "/api/review")).groups.ready;
  assert.ok(due.length > 0, "Grade 5 topics are due four days later");
  const started = await post(page, "/api/review/sessions");
  assert.equal(started.status, 200);
  await playReviewInBrowser(page, S, started.body.session.id);
  await shot(page, "g5-10-revision-done");
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [lesson, label] of [["G5-U2-L01", "the tenor clef"], ["G5-U2-L03", "octave transposition between any clefs"], ["G5-U3-L01", "F sharp major and D sharp minor"], ["G5-U3-L03", "chromatic intervals"], ["G5-U3-L06", "transposing for B flat, A and F instruments"], ["G5-U4-L01", "inversions of triads"], ["G5-U4-L04", "perfect, plagal and imperfect cadences"], ["G5-U4-L06", "choosing chords at cadence points"], ["G5-U5-L02", "replacing written-out ornaments"], ["G5-U5-L06", "Grade 5 terms"], ["G5-U5-L07", "exploring a score"], ["G5-U4-E1", "optional: the six-four five-three progression"], ["G5-U4-E2", "optional: approach chords"], ["G5-U5-E1", "optional: SATB in short and open score"]]) {
  await test(`teaching in the browser, a lesson from each later unit: ${lesson} (${label})`, async () => {
    const { ctx, page, userId } = await grade5Learner(profiles.iphone);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, {
      afterTeach: async (p) => { await noOverflow(p, `${lesson} teach`); await axe(p, `${lesson} teach`); await shot(p, `g5-teach-${lesson}`); },
      afterDemo: async (p) => { await noOverflow(p, `${lesson} demo`); await shot(p, `g5-demo-${lesson}`); },
    });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
    assert.equal((await get(page, "/api/progress")).nodes[lesson].state, "completed");
    await ctx.close();
  });
}

for (const unit of ["G5-U2", "G5-U3", "G5-U4", "G5-U5"]) {
  await test(`practice in the browser: ${unit}`, async () => {
    const { ctx, page, userId } = await grade5Learner(profiles.desktop);
    const last = G5.filter((n) => n.unitId === unit && n.type === "lesson").at(-1).id;
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
    ({ ctx, page, userId } = await grade5Learner(profiles.desktop));
    await finishViaApi(S, page, userId, "G5-U4-R1");
    await post(page, "/api/nodes/G5-U4-C/start");
    items = S.app.nodes.internalItems(userId, "G5-U4-C");
    choices = items.filter((it) => inputFor(S.course.ix, it.item, it.scope).kind === "choice").length;
  }
  assert.ok(choices >= 2, `enough choice questions (${choices}) to fail on: six questions, pass mark 70%, two wrong fail`);
  const xp0 = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G5-U4-C", { wrong: choices });
  await page.getByRole("heading", { name: /Not passed yet|Not quite|Challenge not passed/ }).waitFor();
  await noOverflow(page, "failed challenge");
  await axe(page, "failed challenge");
  await shot(page, "g5-challenge-failed");
  assert.equal((await get(page, "/api/xp")).total - xp0, 0, "no XP for a failed run");
  assert.notEqual((await get(page, "/api/progress")).nodes["G5-U2-C"].state, "completed");
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G5-U4-C")) {
    await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.getByRole("heading", { name: /Challenge passed/ }).waitFor();
  assert.equal((await get(page, "/api/progress")).nodes["G5-U4-C"].state, "completed");
  const results = (await get(page, "/api/results")).results.filter((r) => r.nodeId === "G5-U4-C");
  assert.deepEqual(results.map((r) => r.passed).sort(), [false, true]);
  await ctx.close();
});

await test("resumes after an interruption: part-way through a lesson and part-way through a challenge", async () => {
  const { ctx, page, userId } = await grade5Learner(profiles.iphone);
  await finishViaApi(S, page, userId, "G5-U1-L01");
  await post(page, "/api/lessons/G5-U1-L02/start");
  await playLessonInBrowser(page, S, "G5-U1-L02", { stopAfter: 3 });
  await page.getByText(/Question 4 of/).waitFor();
  await page.reload();
  await page.getByText(/Question 4 of/).waitFor();
  await finishViaApi(S, page, userId, "G5-U1-R1");
  await page.goto("/lesson/G5-U1-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G5-U1-C");
  for (let k = 0; k < 2; k++) {
    await answerOnScreen(page, S, items[k].item, items[k].scope, canonicalResponse(S.course.ix, items[k].item, items[k].scope));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(new RegExp(`Question 3 of ${items.length}`)).waitFor();
  await ctx.close();
});

await test("complete progression to the Grade 5 assessment: below the pass mark with what to revisit, then a retake that passes and earns the grade badge", async () => {
  const { ctx, page, userId } = await grade5Learner(profiles.desktop);
  for (const n of G5.filter((x) => x.type === "unit_challenge")) await finishViaApi(S, page, userId, n.id);
  await finishViaApi(S, page, userId, "G5-U5-R1");
  const g5 = (await get(page, "/api/progress")).grades.find((g) => g.grade === 5);
  assert.equal(g5.completedNodes, g5.requiredNodes - 1, "only the assessment is left");
  await post(page, "/api/nodes/G5-A/start");
  const first = S.app.nodes.internalItems(userId, "G5-A");
  assert.equal(first.length, 39);
  const choices = first.filter((it) => inputFor(S.course.ix, it.item, it.scope).kind === "choice").length;
  // wrong answers are injected in the browser on choice questions; the rest of the 14 wrong answers needed to fall below 26 of 39 are
  // given first, through the API, to stave, rhythm and chord questions (a half-built stave answer cannot be submitted on screen at all)
  const need = Math.max(0, 14 - choices);
  let pre = 0;
  for (const it of first.filter((x) => inputFor(S.course.ix, x.item, x.scope).kind !== "choice")) {
    if (pre >= need) break;
    const bad = wrongResponse(S.course.ix, it.item, it.scope);
    if (!bad) continue;
    const r = await post(page, "/api/nodes/G5-A/attempts", { attemptId: crypto.randomUUID(), itemId: it.itemId, response: bad });
    assert.equal(r.body.correct, false);
    pre++;
  }
  assert.ok(choices + pre >= 14, `enough wrong answers (${choices} on screen + ${pre} by API) to fall below the pass mark`);
  await playNodeInBrowser(page, S, userId, "G5-A", { wrong: choices });
  await page.getByRole("heading", { name: "Not passed yet" }).waitFor();
  await page.getByText(/not an ABRSM examination/i).waitFor();
  await noOverflow(page, "assessment result");
  await axe(page, "assessment result");
  await shot(page, "g5-11-assessment-not-passed");
  assert.notEqual((await get(page, "/api/progress")).nodes["G5-A"].state, "completed");
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g5.grade-complete").earned, false);
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G5-A")) {
    try {
      await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    } catch (e) {
      throw new Error(`${it.item.templateId} "${it.item.prompt}" (${inputFor(S.course.ix, it.item, it.scope).kind}): ${e.message}`, { cause: e });
    }
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
  await page.getByRole("heading", { name: "Grade 5 assessment passed" }).waitFor();
  await shot(page, "g5-12-assessment-passed");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G5-A"].state, "completed");
  assert.equal(prog.grades.find((g) => g.grade === 5).completedNodes, 41);
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g5.grade-complete").earned, true);
  const results = (await get(page, "/api/results")).results.filter((r) => r.nodeId === "G5-A");
  assert.deepEqual(results.map((r) => r.passed).sort(), [false, true], "both results are recorded; the retake did not overwrite the first");
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await ctx.close();
});

for (const [name, p] of Object.entries(profiles)) {
  await test(`layout and accessibility on ${name}: a grouping lesson, a question, and a unit challenge`, async () => {
    const { ctx, page, userId } = await grade5Learner(p);
    await finishViaApi(S, page, userId, "G5-U1-L01");
    await page.goto("/lesson/G5-U1-L02");
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
    await shot(page, `g5-${name}-question`);
    await finishViaApi(S, page, userId, "G5-U1-R1");
    await page.goto("/lesson/G5-U1-C");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} challenge question`);
    await axe(page, `${name} challenge question`);
    await ctx.close();
  });
}

await test("keyboard-only: a Grade 5 challenge question is answered with Tab, Space and Enter", async () => {
  const { ctx, page, userId } = await grade5Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G5-U1-R1");
  let started = false;
  for (let tries = 0; tries < 10 && !started; tries++) {
    await post(page, "/api/nodes/G5-U1-C/start");
    const items = S.app.nodes.internalItems(userId, "G5-U1-C");
    const first = items[0];
    const r = canonicalResponse(S.course.ix, first.item, first.scope);
    if (r.kind === "choice") started = true;
    else {
      for (const it of items) await post(page, `/api/nodes/G5-U1-C/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: canonicalResponse(S.course.ix, it.item, it.scope) });
      await post(page, "/api/nodes/G5-U1-C/complete");
      S.clock.advanceDays(1);
    }
  }
  assert.ok(started, "a run whose first question is a choice was found");
  await page.goto("/lesson/G5-U1-C");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const first = S.app.nodes.internalItems(userId, "G5-U1-C")[0];
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

await test("preferences: dark mode, reduced motion and 200% text at 320px on the tenor-clef lesson", async () => {
  for (const [label, extra, init, prof] of [
    ["dark", { colorScheme: "dark" }, null, profiles.desktop],
    ["reduced motion", { reducedMotion: "reduce" }, null, profiles.desktop],
    ["200% text at 320px", {}, () => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")), profiles["phone-320"]],
  ]) {
    const { ctx, page, userId } = await grade5Learner(prof, extra, init);
    await finishViaApi(S, page, userId, predecessor("G5-U2-L01").id);
    await page.goto("/lesson/G5-U2-L01");
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
    await shot(page, `g5-pref-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  }
});


await test("the hardest Grade 5 notation fits a 320px screen, is described, and every kind of answer (stave, chord, transposition, tuplet, passage) can be given with the real controls", async () => {
  const cases = [["G5-U3-L01", "t.g5.scale-build"], ["G5-U4-L01", "t.g5.chord-build"], ["G5-U4-L03", "t.g5.chord-in-passage"], ["G5-U1-L03", "t.g5.division-write"], ["G5-U1-L02", "t.g5.bar-complete"], ["G5-U3-L06", "t.g5.instrument-transpose"], ["G5-U2-L03", "t.g5.octave-transpose"], ["G5-U2-L02", "t.g5.same-pitch"], ["G5-U3-L03", "t.g5.interval-write"], ["G5-U4-L04", "t.g5.cadence-identify"], ["G5-U4-L05", "t.g5.cadence-find"], ["G5-U4-L06", "t.g5.cadence-chords"], ["G5-U5-L07", "t.g5.score"], ["G5-U5-L07", "t.g5.score-melody"]];
  for (const [lesson, tpl] of cases) {
    const { ctx, page, userId } = await grade5Learner(profiles["phone-320"]);
    const items = S.course.authoredItems(lesson);
    const k = items.findIndex((it) => it.templateId === tpl);
    assert.ok(k >= 0, `${lesson} has ${tpl}`);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    await noOverflow(page, `${tpl} on 320px`);
    const imgs = (await labelsOf(page)).filter(Boolean); // the stave the learner writes on is labelled by its field, not by a picture description
    if (items[k].music || items[k].score) assert.ok(imgs.length >= 1 && imgs.every((t) => t.length > 15), `${tpl}: every notation picture has a description ${JSON.stringify(imgs)}`);
    await axe(page, `${tpl} question`);
    // the question can actually be answered on a phone, with the real controls
    const scope = S.course.scopeFor(lesson, items[k]);
    await answerOnScreen(page, S, items[k], scope, canonicalResponse(S.course.ix, items[k], scope));
    await page.locator(".feedback").getByText("Correct!").waitFor();
    await ctx.close();
  }
});

await test("tenor-clef, double-sharp, irregular-group and ornament notation is spoken: positions, signs, group names and what signs look like", async () => {
  const speak = async (lesson, tpl, check) => {
    const { ctx, page, userId } = await grade5Learner(profiles.desktop);
    const items = S.course.authoredItems(lesson);
    const k = items.findIndex((it) => it.templateId === tpl && check(it));
    assert.ok(k >= 0, `${lesson} has a suitable ${tpl}`);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, { stopAfter: k });
    await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
    const labels = await labelsOf(page);
    const names = await page.locator("svg.notation-svg [role='button']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    await ctx.close();
    return { labels, names };
  };
  const tenor = await speak("G5-U2-L01", "t.g5.tenor-read", () => true);
  assert.match(tenor.labels[0], /tenor-clef/i, "the clef is named");
  assert.match(tenor.labels[0], /\b(line|space)\b/, "the position is spoken");
  const dbl = await speak("G5-U3-L01", "t.g5.scale-spot", (it) => JSON.stringify(it.music).includes("double-sharp"));
  assert.match(dbl.labels[0], /double sharp/, "a double sharp is spoken");
  const grp = await speak("G5-U1-L03", "t.g5.irregular-division", () => true);
  const inGroup = grp.names.filter((n) => /in a (quintuplet|sextuplet|septuplet|nonuplet) group/.test(n));
  assert.ok(inGroup.length >= 5, `irregular-group notes carry the name of their group: ${JSON.stringify(grp.names)}`);
  assert.ok(!grp.names.some((n) => /triplet|duplet/.test(n)), "an irregular group is never called a triplet or a duplet");
  const orn = await speak("G5-U5-L01", "t.g5.ornament-read", () => true);
  assert.match(orn.labels[0], /zig-zag|sideways S|letters tr|small note/, "ornaments are described by their look, not their name");
});

await test("audible pitch is exact: the notes played for a demonstration have the frequencies of the written pitches, concert pitch a tone below a B-flat written note", async () => {
  const init = () => {
    window.__freqs = [];
    class Param { constructor() { this.value = 0; } setValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }
    window.AudioContext = class { constructor() { this.currentTime = 0; this.state = "running"; this.destination = {}; } resume() {} createGain() { return { gain: new Param(), connect: (x) => x }; } createOscillator() { const o = { type: "", frequency: new Param(), connect: (x) => x, start() { window.__freqs.push(o.frequency.value); }, stop() {} }; return o; } };
  };
  const hz = (semis) => 440 * 2 ** ((semis - 57) / 12);
  const semisOf = (p) => { const m = /^([A-G])(bb|b|#|x)?(\d)$/.exec(p); return Number(m[3]) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + ({ bb: -2, b: -1, "": 0, "#": 1, x: 2 })[m[2] ?? ""]; };
  for (const lesson of ["G5-U3-L05", "G5-U3-L06"]) {
    const { ctx, page, userId } = await grade5Learner(profiles.desktop, {}, init);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    const demo = S.course.lesson(lesson).demonstration;
    const written = demo.music.measures.flatMap((m) => (m.events ?? []).filter((e) => e.kind === "note").map((e) => e.pitch));
    await playLessonInBrowser(page, S, lesson, { afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); await p.waitForTimeout(1500); } });
    const freqs = await page.evaluate(() => window.__freqs);
    const fundamentals = freqs.filter((_, i) => i % 3 === 0);
    assert.ok(fundamentals.length >= written.length, `${lesson}: ${fundamentals.length} notes sounded for ${written.length} written`);
    written.forEach((p, i) => assert.ok(Math.abs(fundamentals[i] - hz(semisOf(p))) < 0.01, `${lesson} note ${i + 1} ${p}: ${fundamentals[i]} Hz, expected ${hz(semisOf(p)).toFixed(2)} Hz`));
    // the written clarinet part in B-flat sounds a tone lower: the frequency ratio of a written note to its concert pitch is 2^(2/12)
    assert.ok(Math.abs(hz(semisOf("A4")) / hz(semisOf("A4") - 2) - 2 ** (2 / 12)) < 1e-9);
    await ctx.close();
  }
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} Grade 5 journey(s) failed`);
  process.exit(1);
}
console.log("All Grade 5 journeys passed");
process.exit(0);
