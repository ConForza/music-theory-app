// Brief 07 real-browser verification of the Grade 3 course. The server runs in this process with the real content and a controllable
// clock; the learner's actions go through the real controls. Covers: a learner arriving from Grade 2, the first lesson (with a wrong
// answer and its explanation), Unit 1 end to end (all five lessons, practice, review and a challenge in the browser, XP once, revision
// days later), a representative lesson from every unit, practice for each later unit, resuming after interruption, the complete
// progression to the Grade 3 assessment (a below-pass result with what to revisit, then a retake that passes), the optional upbeat
// lesson, and the responsive / accessibility / preference matrix, including multi-bar compound rhythms on narrow screens.
// Run: npm run build && node --import tsx e2e/g3.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { answerOnScreen, axe, completeEarlier, finishViaApi, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, playReviewInBrowser, post, selectGrade, serve, shot } from "./g3lib.mjs";
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
/** A guest learner whose Grades 1 and 2 are finished and who has chosen Grade 3. */
async function grade3Learner(p = profiles.desktop, extra = {}, init = null) {
  const ctx = await ctxFor(p, extra);
  const { page, userId } = await guest(ctx);
  if (init) await page.addInitScript(init);
  completeEarlier(S, userId);
  await selectGrade(page, 3);
  return { ctx, page, userId };
}
const G3 = S.course.nodes.filter((n) => n.grade === 3);
/** The learning node just before a node on the path (finishing it finishes everything earlier, including a previous unit's review). */
const predecessor = (id) => {
  const node = S.course.ix.nodeById.get(id);
  return G3.filter((n) => n.order < node.order && ["lesson", "practice", "review"].includes(n.type) && !n.optional).at(-1);
};

await test("learner arriving from Grade 2: Grade 3 opens at its first lesson, later lessons are locked, the first lesson teaches and rewards", async () => {
  const { ctx, page } = await grade3Learner(profiles.iphone, { reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await page.locator('[data-node="G3-U1-L01"]').waitFor();
  assert.equal(await page.locator('[data-node="G3-U1-L01"]').getAttribute("data-status"), "available");
  assert.equal(await page.locator('[data-node="G3-U1-L02"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator('[data-node="G3-U4-L01"]').getAttribute("data-status"), "locked");
  assert.equal(await page.locator("[data-node]").count(), 42, "all 42 Grade 3 nodes are on the path");
  await noOverflow(page, "grade 3 path");
  await axe(page, "grade 3 path");
  await shot(page, "g3-01-path");
  await page.locator('[data-node="G3-U1-L02"]').scrollIntoViewIfNeeded();
  await page.locator('[data-node="G3-U1-L02"]').click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "g3-02-locked-node-explains");
  await page.keyboard.press("Escape");
  const taught = [];
  await playLessonInBrowser(page, S, "G3-U1-L01", {
    wrongAt: 1,
    afterTeach: async (p) => { await noOverflow(p, "teach"); await axe(p, "teach"); await shot(p, "g3-03-teach-simple-or-compound"); },
    afterDemo: async (p) => { await p.getByRole("button", { name: /Play all/ }).click(); await noOverflow(p, "demo"); await shot(p, "g3-04-demo"); },
    afterWrong: async (p) => { await shot(p, "g3-05-wrong-answer-explained"); taught.push(await p.locator(".feedback").innerText()); },
  });
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await page.getByText(/10 XP/).first().waitFor();
  await noOverflow(page, "lesson complete");
  await axe(page, "lesson complete");
  assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G3-U1-L01"].state, "completed");
  assert.equal(prog.nodes["G3-U1-L02"].state, "available");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("Unit 1 end to end in the browser: five lessons, practice, review and a challenge; XP once each; revision due later", async () => {
  const { ctx, page, userId } = await grade3Learner(profiles.desktop);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["G3-U1-L01", "G3-U1-L02", "G3-U1-L03", "G3-U1-L04", "G3-U1-L05"]) {
    await playLessonInBrowser(page, S, id, { afterTeach: id === "G3-U1-L03" ? async (p) => { await shot(p, "g3-07-teach-compound-grouping"); await axe(p, "compound grouping teaching"); } : undefined });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  }
  await page.goto("/lesson/G3-U1-P1");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.locator(".hint-list p").first().waitFor();
  await playNodeInBrowser(page, S, userId, "G3-U1-P1", { wrong: 1 });
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();
  await playNodeInBrowser(page, S, userId, "G3-U1-R1");
  await page.getByRole("heading", { name: "Review complete" }).waitFor();
  const before = (await get(page, "/api/xp")).total;
  await playNodeInBrowser(page, S, userId, "G3-U1-C", {
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
  await shot(page, "g3-09-challenge-passed");
  assert.equal((await get(page, "/api/xp")).total - before, 15, "the challenge pays 15 XP once");
  assert.equal((await get(page, "/api/progress")).nodes["G3-U1-C"].state, "completed");
  assert.equal((await get(page, "/api/review")).groups.ready.length, 0, "nothing is due straight after learning");
  S.clock.advanceDays(4);
  await page.goto("/review");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const due = (await get(page, "/api/review")).groups.ready;
  assert.ok(due.length > 0, "Grade 3 topics are due four days later");
  const started = await post(page, "/api/review/sessions");
  assert.equal(started.status, 200);
  await playReviewInBrowser(page, S, started.body.session.id);
  await shot(page, "g3-10-revision-done");
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [lesson, label] of [["G3-U2-L02", "beaming demisemiquavers"], ["G3-U3-L02", "octave signs"], ["G3-U3-L03", "octave transposition"], ["G3-U4-L01", "the melodic minor"], ["G3-U4-L03", "B, F sharp and C sharp minor"], ["G3-U5-L02", "major and minor intervals"], ["G3-U5-L03", "Grade 3 terms"]]) {
  await test(`teaching in the browser, a lesson from each later unit: ${lesson} (${label})`, async () => {
    const { ctx, page, userId } = await grade3Learner(profiles.iphone);
    await finishViaApi(S, page, userId, predecessor(lesson).id);
    await playLessonInBrowser(page, S, lesson, {
      afterTeach: async (p) => { await noOverflow(p, `${lesson} teach`); await axe(p, `${lesson} teach`); await shot(p, `g3-teach-${lesson}`); },
      afterDemo: async (p) => { await noOverflow(p, `${lesson} demo`); await shot(p, `g3-demo-${lesson}`); },
    });
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
    assert.equal((await get(page, "/api/progress")).nodes[lesson].state, "completed");
    await ctx.close();
  });
}

for (const unit of ["G3-U2", "G3-U3", "G3-U4", "G3-U5"]) {
  await test(`practice in the browser: ${unit}`, async () => {
    const { ctx, page, userId } = await grade3Learner(profiles.desktop);
    const last = G3.filter((n) => n.unitId === unit && n.type === "lesson").at(-1).id;
    await finishViaApi(S, page, userId, last);
    await playNodeInBrowser(page, S, userId, `${unit}-P1`);
    await page.getByRole("heading", { name: "Practice complete" }).waitFor();
    await noOverflow(page, `${unit} practice done`);
    await ctx.close();
  });
}

await test("resumes after an interruption: part-way through a lesson and part-way through a challenge", async () => {
  const { ctx, page, userId } = await grade3Learner(profiles.iphone);
  await finishViaApi(S, page, userId, "G3-U1-L01");
  await post(page, "/api/lessons/G3-U1-L02/start");
  await playLessonInBrowser(page, S, "G3-U1-L02", { stopAfter: 3 });
  await page.getByText(/Question 4 of/).waitFor();
  await page.reload();
  await page.getByText(/Question 4 of/).waitFor();
  await finishViaApi(S, page, userId, "G3-U1-R1");
  await page.goto("/lesson/G3-U1-C");
  await page.getByRole("button", { name: "Let's go" }).click();
  const items = S.app.nodes.internalItems(userId, "G3-U1-C");
  for (let k = 0; k < 2; k++) {
    await answerOnScreen(page, S, items[k].item, items[k].scope, canonicalResponse(S.course.ix, items[k].item, items[k].scope));
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(new RegExp(`Question 3 of ${items.length}`)).waitFor();
  await ctx.close();
});

await test("complete progression to the Grade 3 assessment: below the pass mark with what to revisit, then a retake that passes and earns the grade badge; the upbeat lesson stays optional", async () => {
  const { ctx, page, userId } = await grade3Learner(profiles.desktop);
  for (const n of G3.filter((x) => x.type === "unit_challenge")) await finishViaApi(S, page, userId, n.id);
  await finishViaApi(S, page, userId, "G3-U5-R1");
  const g3 = (await get(page, "/api/progress")).grades.find((g) => g.grade === 3);
  assert.equal(g3.completedNodes, g3.requiredNodes - 1, "only the assessment is left");
  await post(page, "/api/nodes/G3-A/start");
  const first = S.app.nodes.internalItems(userId, "G3-A");
  const choices = first.filter((it) => inputFor(S.course.ix, it.item, it.scope).kind === "choice").length;
  assert.ok(choices >= Math.ceil(first.length * 0.4), `enough choice questions (${choices} of ${first.length}) to fall below the pass mark`);
  await playNodeInBrowser(page, S, userId, "G3-A", { wrong: choices });
  await page.getByRole("heading", { name: "Not passed yet" }).waitFor();
  await page.getByText(/not an ABRSM examination/i).waitFor();
  await noOverflow(page, "assessment result");
  await axe(page, "assessment result");
  await shot(page, "g3-11-assessment-not-passed");
  assert.notEqual((await get(page, "/api/progress")).nodes["G3-A"].state, "completed");
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g3.grade-complete").earned, false);
  await page.getByRole("button", { name: /Try again with fresh questions/ }).click();
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  for (const it of S.app.nodes.internalItems(userId, "G3-A")) {
    try {
      await answerOnScreen(page, S, it.item, it.scope, canonicalResponse(S.course.ix, it.item, it.scope));
    } catch (e) {
      throw new Error(`${it.item.templateId} "${it.item.prompt}" (${inputFor(S.course.ix, it.item, it.scope).kind}): ${e.message}`, { cause: e });
    }
    await page.getByRole("button", { name: /Continue|Finish/ }).click();
  }
  await page.locator(".lesson-step h1").first().waitFor();
  await page.getByRole("heading", { name: "Grade 3 assessment passed" }).waitFor();
  await shot(page, "g3-12-assessment-passed");
  const prog = await get(page, "/api/progress");
  assert.equal(prog.nodes["G3-A"].state, "completed");
  assert.equal(prog.grades.find((g) => g.grade === 3).completedNodes, 41);
  assert.equal((await get(page, "/api/achievements")).achievements.find((b) => b.id === "g3.grade-complete").earned, true);
  const results = (await get(page, "/api/results")).results.filter((r) => r.nodeId === "G3-A");
  assert.deepEqual(results.map((r) => r.passed).sort(), [false, true], "both results are recorded; the retake did not overwrite the first");
  // the upbeat lesson is optional: still not completed, playable now, and it changes nothing about the grade
  assert.notEqual(prog.nodes["G3-U2-E1"].state, "completed");
  await playLessonInBrowser(page, S, "G3-U2-E1");
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await shot(page, "g3-13-optional-upbeat-complete");
  assert.equal((await get(page, "/api/progress")).grades.find((g) => g.grade === 3).requiredNodes, 41);
  await page.goto("/progress");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await noOverflow(page, "progress");
  await axe(page, "progress");
  await ctx.close();
});

for (const [name, p] of Object.entries(profiles)) {
  await test(`layout and accessibility on ${name}: a compound-time grouping lesson, a question, and a unit challenge`, async () => {
    const { ctx, page, userId } = await grade3Learner(p);
    await finishViaApi(S, page, userId, "G3-U1-L02");
    await page.goto("/lesson/G3-U1-L03");
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
    await shot(page, `g3-${name}-question`);
    await finishViaApi(S, page, userId, "G3-U1-R1");
    await page.goto("/lesson/G3-U1-C");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `${name} challenge question`);
    await axe(page, `${name} challenge question`);
    await ctx.close();
  });
}

await test("keyboard-only: a Grade 3 challenge question is answered with Tab, Space and Enter", async () => {
  const { ctx, page, userId } = await grade3Learner(profiles.desktop);
  await finishViaApi(S, page, userId, "G3-U1-R1");
  let started = false;
  for (let tries = 0; tries < 8 && !started; tries++) {
    await post(page, "/api/nodes/G3-U1-C/start");
    const items = S.app.nodes.internalItems(userId, "G3-U1-C");
    const first = items[0];
    const r = canonicalResponse(S.course.ix, first.item, first.scope);
    if (r.kind === "choice") started = true;
    else {
      for (const it of items) await post(page, `/api/nodes/G3-U1-C/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: canonicalResponse(S.course.ix, it.item, it.scope) });
      await post(page, "/api/nodes/G3-U1-C/complete");
      S.clock.advanceDays(1);
    }
  }
  assert.ok(started, "a run whose first question is a choice was found");
  await page.goto("/lesson/G3-U1-C");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  const first = S.app.nodes.internalItems(userId, "G3-U1-C")[0];
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

await test("preferences: dark mode, reduced motion and 200% text at 320px on a ledger-line lesson", async () => {
  for (const [label, extra, init, prof] of [
    ["dark", { colorScheme: "dark" }, null, profiles.desktop],
    ["reduced motion", { reducedMotion: "reduce" }, null, profiles.desktop],
    ["200% text at 320px", {}, () => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")), profiles["phone-320"]],
  ]) {
    const { ctx, page, userId } = await grade3Learner(prof, extra, init);
    await finishViaApi(S, page, userId, "G3-U3-L01");
    await page.goto("/lesson/G3-U3-L02");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await noOverflow(page, `octave sign demo (${label})`);
    await axe(page, `octave sign demo (${label})`);
    await page.getByRole("button", { name: "Try some questions" }).click();
    await page.locator("section.question").waitFor();
    await noOverflow(page, `octave sign question (${label})`);
    await axe(page, `octave sign question (${label})`);
    await shot(page, `g3-pref-${label.replace(/\W+/g, "-")}`);
    await ctx.close();
  }
});

await test("a multi-bar compound rhythm fits a 320px screen and is described: beams, dotted notes and ties", async () => {
  {
    const { ctx, page, userId } = await grade3Learner(profiles["phone-320"]);
    await finishViaApi(S, page, userId, "G3-U1-L02");
    await page.goto("/lesson/G3-U1-L03");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.locator("svg.notation-svg").first().waitFor();
    await noOverflow(page, "compound teaching on 320px");
    const imgs = await page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    assert.ok(imgs.length > 0 && imgs.every((t) => t.length > 15), `every notation picture has a description: ${JSON.stringify(imgs)}`);
    assert.ok(imgs.some((t) => /dotted crotchet/i.test(t)), "dotted crotchets are named");
    await ctx.close();
  }
  const { ctx, page, userId } = await grade3Learner(profiles["phone-320"]);
  await finishViaApi(S, page, userId, "G3-U1-L02");
  const items = S.course.authoredItems("G3-U1-L03");
  const k = items.findIndex((it) => it.prompt.includes("Which bar groups its notes correctly"));
  assert.ok(k >= 0);
  await playLessonInBrowser(page, S, "G3-U1-L03", { stopAfter: k });
  await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
  await noOverflow(page, "three compound bars on 320px");
  const described = await page.locator("svg.notation-svg").first().getAttribute("aria-label");
  assert.match(described, /Bar 1:/);
  assert.match(described, /Bar 3:/);
  assert.match(described, /beamed together/, "beamed groups are described as groups");
  await ctx.close();
});

await test("ledger-line notes and the sign 8va are described; a marked note is named on its button", async () => {
  const led = S.course.authoredItems("G3-U3-L01");
  const kl = led.findIndex((it) => it.templateId === "t.g3.ledger-count");
  assert.ok(kl >= 0);
  {
    const { ctx, page, userId } = await grade3Learner(profiles.desktop);
    await finishViaApi(S, page, userId, predecessor("G3-U3-L01").id);
    await playLessonInBrowser(page, S, "G3-U3-L01", { stopAfter: kl });
    await page.getByText(new RegExp(`Question ${kl + 1} of ${led.length}`)).waitFor();
    const described = await page.locator("svg.notation-svg").first().getAttribute("aria-label");
    assert.match(described, /ledger line/i, "the ledger-line position is spoken");
    await ctx.close();
  }
  const oct = S.course.authoredItems("G3-U3-L02");
  const ko = oct.findIndex((it) => it.templateId === "t.g3.octave-sign");
  {
    const { ctx, page, userId } = await grade3Learner(profiles.desktop);
    await finishViaApi(S, page, userId, "G3-U3-L01");
    await playLessonInBrowser(page, S, "G3-U3-L02", { stopAfter: ko });
    await page.getByText(new RegExp(`Question ${ko + 1} of ${oct.length}`)).waitFor();
    const described = await page.locator("svg.notation-svg").first().getAttribute("aria-label");
    assert.match(described, /8va|8vb/, "the octave sign is part of the description");
    await ctx.close();
  }
  const mel = S.course.authoredItems("G3-U5-L04");
  const kx = mel.findIndex((it) => it.prompt.includes("note marked x"));
  assert.ok(kx >= 0, "the melody lesson asks a marked-note question");
  {
    const { ctx, page, userId } = await grade3Learner(profiles.desktop);
    await finishViaApi(S, page, userId, "G3-U5-L10");
    await playLessonInBrowser(page, S, "G3-U5-L04", { stopAfter: kx });
    await page.getByText(new RegExp(`Question ${kx + 1} of ${mel.length}`)).waitFor();
    const described = await page.locator("svg.notation-svg").first().getAttribute("aria-label");
    assert.match(described, /\(the note marked x\)/);
    const names = await page.locator("svg.notation-svg [role='button']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    assert.ok(names.some((n) => /the note marked x/.test(n)), `note buttons carry the information: ${JSON.stringify(names)}`);
    await ctx.close();
  }
});

await browser.close();
S.close();
if (failures) {
  console.error(`${failures} Grade 3 journey(s) failed`);
  process.exit(1);
}
console.log("All Grade 3 journeys passed");
process.exit(0);
