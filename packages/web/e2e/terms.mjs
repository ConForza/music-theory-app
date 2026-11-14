// Real-browser verification of the terminology completion lessons (Grades 2-4). The server runs in this process with the real content; the
// learner's actions go through the real controls. Covers: a learner who finished the grade before these lessons existed (everything they
// completed stays completed, the new lessons are waiting), each new lesson played through in the browser with a wrong answer and its
// explanation, the unit practice that asks the new words, the touch-signs lesson's notation read by a screen reader and drawn at 320px,
// keyboard-only answering, dark mode, reduced motion and 200% text.
// Run: npm run build && node --import tsx e2e/terms.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { axe, get, guest, noOverflow, playLessonInBrowser, playNodeInBrowser, post, selectGrade, serve, shot } from "./g4lib.mjs";
import { music } from "@mtp/curriculum";

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
const NEW = new Set(music.BOOK_LESSONS.map((l) => l.node));
const profiles = {
  iphone: devices["iPhone 14"],
  "phone-320": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const ctxFor = (p, extra = {}) => browser.newContext({ ...p, baseURL: S.base, ...extra });

/** Mark every node before `nodeId` completed (as a learner who did the old course up to there), except the new terminology lessons. */
function completeBefore(userId, nodeId) {
  const now = S.clock.now().toISOString();
  const cut = S.course.ix.nodeById.get(nodeId).order;
  for (const n of S.course.nodes.filter((x) => x.order < cut && !NEW.has(x.id))) {
    S.db.prepare("DELETE FROM lesson_progress WHERE user_id = ? AND node_id = ?").run(userId, n.id);
    S.db.prepare("INSERT INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',?,?,?,?,?,?)").run(userId, n.id, n.contentVersion, S.course.version, now, now, now, n.contentVersion);
  }
}
async function learnerAt(grade, firstNew, p = profiles.desktop, extra = {}) {
  const ctx = await ctxFor(p, extra);
  const { page, userId } = await guest(ctx);
  completeBefore(userId, firstNew);
  await selectGrade(page, grade);
  return { ctx, page, userId };
}
const lessonsOf = (g) => music.BOOK_LESSONS.filter((l) => l.grade === g);

await test("a learner who finished the old Grade 2 course keeps every completion and finds the new terminology lessons waiting", async () => {
  const { ctx, page, userId } = await learnerAt(2, "G2-U5-P1");
  // they finished the unit as it was: practice, review and the unit challenge included
  const now = S.clock.now().toISOString();
  for (const id of ["G2-U5-P1", "G2-U5-R1", "G2-U5-C"]) {
    const n = S.course.ix.nodeById.get(id);
    S.db.prepare("INSERT OR REPLACE INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version) VALUES (?,?,1,0,'questions',1,?,?,?,?,1)").run(userId, id, S.course.version, now, now, now);
    void n;
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/learn");
  await page.locator('[data-node="G2-U5-L05"]').waitFor();
  const prog = await get(page, "/api/progress");
  for (const id of ["G2-U5-L03", "G2-U5-L04", "G2-U5-P1", "G2-U5-R1", "G2-U5-C"]) assert.equal(prog.nodes[id].state, "completed", id);
  assert.equal(prog.nodes["G2-U5-L05"].state, "available");
  assert.equal(prog.nodes["G2-U5-L06"].state, "locked");
  assert.equal(await page.locator('[data-node="G2-U5-L05"]').getAttribute("data-status"), "available");
  await shot(page, "terms-01-legacy-path");
  await noOverflow(page, "path");
  await axe(page, "path");
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const grade of [2, 3, 4]) {
  await test(`Grade ${grade}: every new lesson is played in the browser, with a wrong answer explained, and the chain opens one lesson at a time`, async () => {
    const first = lessonsOf(grade)[0].node;
    const { ctx, page } = await learnerAt(grade, first);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/learn");
    await page.locator(`[data-node="${first}"]`).waitFor();
    const mine = lessonsOf(grade);
    for (let k = 0; k < mine.length; k++) {
      const id = mine[k].node;
      const before = await get(page, "/api/progress");
      assert.equal(before.nodes[id].state, "available", `${id} is open once the one before it is done`);
      if (mine[k + 1]) assert.equal(before.nodes[mine[k + 1].node].state, "locked", `${mine[k + 1].node} waits`);
      const taught = [];
      await playLessonInBrowser(page, S, id, {
        wrongAt: k === 0 ? 1 : undefined,
        afterTeach: async (p) => {
          await noOverflow(p, `${id} teach`);
          if (k === 0) { await axe(p, `${id} teach`); await shot(p, `terms-g${grade}-teach`); }
          assert.ok((await p.locator("svg.notation-svg").count()) >= 1, `${id} shows notation in the explanation`);
        },
        afterWrong: async (p) => { taught.push(await p.locator(".feedback").innerText()); await shot(p, `terms-g${grade}-wrong`); },
      });
      await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
      await page.getByText(/10 XP/).first().waitFor();
      if (k === 0) assert.ok(taught[0].length > 40, "the wrong answer got a specific explanation");
      const after = await get(page, "/api/progress");
      assert.equal(after.nodes[id].state, "completed");
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await test("Grade 2: after the four new lessons the unit practice asks the new words through the real controls", async () => {
  const { ctx, page, userId } = await learnerAt(2, "G2-U5-L05");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const l of lessonsOf(2)) {
    await playLessonInBrowser(page, S, l.node);
    await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  }
  await playLessonInBrowser(page, S, "G2-U5-L04");
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  // start the run through the API so its planned questions can be read, then play it through the real controls
  assert.equal((await post(page, "/api/nodes/G2-U5-P1/start")).status, 200);
  const asked = S.app.nodes.internalItems(userId, "G2-U5-P1").filter((i) => /g[234]-book-/.test(i.itemId));
  await playNodeInBrowser(page, S, userId, "G2-U5-P1");
  assert.ok(asked.length >= 2, "the practice included new-word questions");
  assert.equal((await get(page, "/api/progress")).nodes["G2-U5-P1"].state, "completed");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("the touch-signs lesson: the signs have text descriptions for a screen reader, draw at 320px and in dark mode with reduced motion", async () => {
  const { ctx, page } = await learnerAt(2, "G2-U5-L05", profiles["phone-320"], { colorScheme: "dark", reducedMotion: "reduce" });
  for (const id of ["G2-U5-L05", "G2-U5-L06", "G2-U5-L07"]) await post(page, `/api/lessons/${id}/start`);
  // finish the earlier new lessons through the API so the signs lesson is open
  const { finishViaApi } = await import("./g4lib.mjs");
  const userId = (await get(page, "/api/me")).user.id;
  await finishViaApi(S, page, userId, "G2-U5-L07");
  await page.goto("/lesson/G2-U5-L08");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  await page.getByRole("heading", { name: "Here's the idea" }).waitFor();
  const labels = await page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  assert.ok(labels.length >= 1);
  assert.ok(labels.some((l) => /pointed accent|accent/i.test(l)), `a notation figure names the accent: ${labels.join(" / ")}`);
  await noOverflow(page, "signs lesson at 320px");
  await shot(page, "terms-signs-320-dark");
  await axe(page, "signs lesson");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
  const demoLabels = await page.locator("svg.notation-svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  assert.ok(demoLabels.some((l) => /wedge/i.test(l)), `the demonstration describes the wedge: ${demoLabels.join(" / ")}`);
  await ctx.close();
});

await test("keyboard-only: a new lesson question can be answered and confirmed without the mouse, at 200% text", async () => {
  const { ctx, page } = await learnerAt(3, "G3-U5-L05", profiles.desktop, { reducedMotion: "reduce" });
  await page.addInitScript(() => { document.documentElement.style.fontSize = "200%"; });
  await page.goto("/lesson/G3-U5-L05");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  await page.getByRole("heading", { name: "Here's the idea" }).waitFor();
  await noOverflow(page, "teach at 200% text");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
  await page.getByRole("button", { name: "Try some questions" }).click();
  await page.getByText(/Question 1 of 9/).waitFor();
  const radios = page.getByRole("radio");
  assert.ok((await radios.count()) >= 4, "a choice question offers its options as native radio buttons");
  // Tab until a radio has focus, choose with the keyboard, then move to Check and press Enter
  for (let i = 0; i < 40 && (await page.evaluate(() => document.activeElement?.getAttribute("type"))) !== "radio"; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("type")), "radio", "Tab reaches the options");
  await page.keyboard.press("Space");
  assert.ok((await page.getByRole("radio", { checked: true }).count()) === 1, "Space chooses one option");
  for (let i = 0; i < 12 && !(await page.evaluate(() => document.activeElement?.textContent?.trim() === "Check")); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.locator(".feedback").waitFor();
  assert.ok(/Correct!|Not quite/.test(await page.locator(".feedback").innerText()), "the answer was judged");
  await noOverflow(page, "question at 200% text");
  await ctx.close();
});

log(failures ? `\n${failures} failed` : "\nall terminology journeys passed");
S.close();
await browser.close();
process.exit(failures ? 1 : 0);
