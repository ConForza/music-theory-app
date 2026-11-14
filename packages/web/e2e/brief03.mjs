// Brief 03 real-browser verification: every demonstration item of every exercise family is answered through the
// real controls (tap, arrow keys, typing, palette buttons) and must be graded correct by the server. The request
// the browser sends is intercepted and compared with the answer computed by the engine, so what the learner did
// is exactly what was submitted. Also: wrong-answer feedback, keyboard-only use, dark mode, reduced motion, 200%
// text, axe (serious/critical) and no sideways page scroll, on 320px phone, iPhone, iPad and desktop.
// Run: npm run build && node --import tsx e2e/brief03.mjs   (SHOTS=dir saves screenshots)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import { buildIndex, loadCurriculum, music } from "@mtp/curriculum";
import { canonicalResponse, inputFor, wrongResponse } from "@mtp/engine";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const port = 8700 + Math.floor(Math.random() * 100);
const base = `http://localhost:${port}`;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum);
const sets = curriculum.showcase.map((s) => s.content);

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

const browser = await chromium.launch();
let failures = 0;
const log = (...a) => console.log(...a);
const pretty = (p) => p.replace(/#/g, "♯").replace(/x/g, "𝄪").replace(/([A-G])bb/g, "$1𝄫").replace(/([A-G])b/g, "$1♭");
const ORD = (n) => (n === 1 ? "unison" : n === 8 ? "octave" : n === 15 ? "double octave" : `${n}${n === 2 || n === 9 ? "nd" : n === 3 || n === 10 ? "rd" : "th"}`);
const QUAL = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const SIGN_LABEL = { bb: "double flat", b: "flat", "": "natural (no sharp or flat)", "#": "sharp", x: "double sharp" };
const ORN = { trill: "trill", turn: "turn", "upper-mordent": "upper mordent", "lower-mordent": "lower mordent", acciaccatura: "acciaccatura", appoggiatura: "appoggiatura" };

async function noOverflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${where}: page scrolls sideways by ${over}px`);
}
async function axe(page, where) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
  const bad = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  assert.equal(bad.length, 0, `${where}: accessibility violations: ${bad.map((v) => `${v.id} (${v.nodes[0]?.target}) ${v.nodes[0]?.failureSummary ?? ""}`).join(", ")}`);
}
async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
}
async function signIn(ctx) {
  const page = await ctx.newPage();
  await page.goto("/welcome");
  await page.evaluate(async () => {
    await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true, experience: "new" }) });
  });
  return page;
}

// ---- driving each input kind with the real controls ------------------------------------------------------
const within = (scope, legend) => scope.locator("fieldset", { has: scope.page().locator("legend", { hasText: legend }) });
const option = (scope, text) => scope.locator("label.option", { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();

async function tapStave(page, scope, pos) {
  const svg = scope.locator(".stave-editor-stave svg").first();
  const [vbY, vbH] = await svg.evaluate((el) => { const v = el.getAttribute("viewBox").split(" ").map(Number); return [v[1], v[3]]; });
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + box.width * 0.62, box.y + ((-pos / 2 - vbY) / vbH) * box.height);
}

async function typeNotes(scope, pitches) {
  const det = scope.locator("details.type-instead").first();
  if (!(await det.evaluate((d) => d.open))) await det.locator("summary").click();
  await det.locator("input[type=text]").fill(pitches.join(" "));
  await det.getByRole("button", { name: "Write these notes" }).click();
}

async function drive(page, scope, input, r, how) {
  switch (input.kind) {
    case "choice":
      return option(scope, input.options.find((o) => o.id === r.optionId).label).click();
    case "multi-choice":
      for (const id of r.optionIds) await scope.locator("label.option", { hasText: input.options.find((o) => o.id === id).label }).first().click();
      return;
    case "pitch-letter":
      return option(scope, r.letter).click();
    case "note-name": {
      const m = /^([A-G])(bb|b|#|x)?(-?\d)?$/.exec(r.pitch);
      await option(within(scope, "Letter name"), m[1]).click();
      if (input.accidentals) await scope.getByLabel(SIGN_LABEL[m[2] ?? ""], { exact: true }).check();
      if (input.octave && m[3] !== undefined) {
        for (let i = 0; i < 12; i++) {
          const out = await scope.locator(".stepper output").textContent();
          const cur = Number(out.match(/-?\d+$/)?.[0]);
          if (cur === Number(m[3])) break;
          await scope.getByRole("button", { name: cur < Number(m[3]) ? "Octave up" : "Octave down" }).click();
        }
      }
      return;
    }
    case "keyboard": {
      await scope.locator(`button[data-key="${r.key}"]`).click();
      const black = [1, 3, 6, 8, 10].includes(((r.key % 12) + 12) % 12);
      if (r.spelling && input.spelling && black) await option(within(scope, "Which name?"), pretty(r.spelling.replace(/\d$/, ""))).click();
      return;
    }
    case "staff-position": {
      const p = music.parsePitch(r.pitch);
      const pos = music.staffPosition(input.clef, p);
      if (input.shown || how === "type") return typeNotes(scope, [r.pitch]);
      if (how === "tap") await tapStave(page, scope, pos);
      else {
        const slider = scope.getByRole("slider");
        await slider.focus();
        await page.keyboard.press("ArrowUp"); // first press writes the note on the middle line
        for (let i = 4; i < pos; i++) await page.keyboard.press("ArrowUp");
        for (let i = 4; i > pos; i--) await page.keyboard.press("ArrowDown");
      }
      if (p.alter !== 0 || input.accidentals) await scope.getByLabel(p.alter === 0 ? "no accidental sign written" : SIGN_LABEL[{ [-2]: "bb", [-1]: "b", 1: "#", 2: "x" }[p.alter]], { exact: true }).check();
      return;
    }
    case "pitch-sequence": {
      if (input.keyOptions && r.key) await option(within(scope, "Key signature for your answer"), pretty(r.key)).click();
      return typeNotes(scope, r.pitches.slice(input.given.length));
    }
    case "chord-builder":
      return typeNotes(scope, r.pitches);
    case "key-signature-writer":
      return typeNotes(scope, r.accidentals.map((a) => a.pitch));
    case "time-signature":
      await option(within(scope, "Top number"), String(r.top)).click();
      await option(within(scope, "Bottom number"), String(r.bottom)).click();
      return;
    case "key-name":
      return option(scope, pretty(r.key)).click();
    case "interval-name":
      if (input.qualities && r.quality) await option(within(scope, "Quality"), QUAL[r.quality]).click();
      return option(within(scope, "Number"), ORD(r.compound ? r.number + 7 : r.number)).click();
    case "chord-name":
      await option(within(scope, "Chord (Roman numeral)"), r.roman).click();
      if (input.inversions.length > 1) await scope.locator("label.option", { hasText: new RegExp(`^\\s*${r.inversion} —`) }).click();
      return;
    case "ornament":
      return scope.locator("label.option", { hasText: ORN[r.sign] }).first().click();
    case "progression":
      for (const l of input.labels) await option(within(scope, `marked ${l}`), r.chords[l]).click();
      return;
    case "rhythm-builder": {
      let isRest = false;
      let bar = 0;
      for (const [bi, m] of r.measures.entries()) {
        if (bi !== bar) {
          await scope.getByRole("button", { name: `Bar ${bi + 1}`, exact: true }).click();
          bar = bi;
        }
        const events = bi === 0 ? m.events.slice(input.given.length) : m.events;
        const add = async (e) => {
          const wantRest = e.kind === "rest";
          if (wantRest !== isRest) {
            await scope.getByRole("button", { name: isRest ? "Adding rests" : "Rests" }).click();
            isRest = wantRest;
          }
          for (let d = 0; d < (e.duration.dots ?? 0); d++) await scope.locator(".palette-tools button", { hasText: /dot/i }).first().click();
          await scope.locator(".palette-btn", { hasText: new RegExp(`^.*${e.duration.value}$`) }).first().click();
          if (e.tieToNext) await scope.getByRole("button", { name: "Tie last note to next" }).click();
        };
        for (const e of events) {
          if (e.kind === "tuplet") {
            const label = e.actual === 3 && e.normal === 2 ? "Triplet" : e.actual === 2 && e.normal === 3 ? "Duplet" : `${e.actual} in the time of ${e.normal}`;
            await scope.getByRole("button", { name: label }).click();
            for (const x of e.events) await add(x);
          } else await add(e);
        }
      }
      return;
    }
    case "rhythm-grouping": {
      let n = 0;
      for (const m of r.measures) {
        const evs = m.events;
        for (let i = 0; i < evs.length; i++) {
          n++;
          const joined = i + 1 < evs.length && ["begin", "continue"].includes(evs[i].beam) && ["continue", "end"].includes(evs[i + 1]?.beam);
          if (joined) await scope.getByRole("button", { name: `Beam note ${n} to note ${n + 1}` }).click();
        }
      }
      return;
    }
    case "barlines":
      for (const a of r.after) await scope.getByRole("button", { name: new RegExp(`^Bar-line after note ${a} `) }).click();
      if (r.final && input.final) await scope.getByLabel("End with a double bar-line").check();
      return;
  }
  throw new Error(`No driver for ${input.kind}`);
}

/** Answer one item through the UI and check what was sent and how the server graded it. */
async function answer(page, item, response, how) {
  const input = inputFor(ix, item);
  const sent = page.waitForRequest((req) => req.url().includes("/api/practice/attempts") && req.method() === "POST", { timeout: 15000 });
  sent.catch(() => undefined);
  if (input.kind === "composite") {
    for (const [i, part] of input.parts.entries()) await drive(page, page.locator("li.composite-part").nth(i), part.input, response.parts[part.id], how);
  } else await drive(page, page.locator("#answer-form"), input, response, how);
  await page.getByRole("button", { name: "Check" }).click();
  const body = JSON.parse((await sent).postData());
  const res = await (await (await sent).response()).json();
  return { body, res };
}

function sameSubmission(got, want, input) {
  // The bar builder beams by the beat automatically; beams are the learner's own choice only in grouping tasks.
  const beams = input?.kind === "rhythm-grouping";
  const norm = (r) => {
    if (!r) return r;
    if (r.kind === "rhythm") return { kind: "rhythm", measures: r.measures.map((m) => m.events.map((e) => (e.kind === "tuplet" ? [e.actual, e.normal, e.events.map((x) => [x.kind, x.duration.value, x.duration.dots ?? 0, !!x.tieToNext])] : [e.kind, e.duration.value, e.duration.dots ?? 0, !!e.tieToNext, beams ? (e.beam ?? null) : null]))) };
    if (r.kind === "keyboard") return { kind: "keyboard", key: r.key };
    if (r.kind === "composite") return { kind: "composite", parts: Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, norm(v)])) };
    return r;
  };
  assert.deepEqual(norm(got), norm(want));
}

async function playSets(profile, opts = {}) {
  const ctx = await browser.newContext({ ...profile, baseURL: base, ...(opts.ctx ?? {}) });
  const page = await signIn(ctx);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let n = 0;
  const hows = ["keys", "tap", "type"];
  for (const set of sets) {
    if (opts.only && !opts.only.includes(set.id)) continue;
    for (const [i, item] of set.items.entries()) {
      const where = `${profile.name} ${item.id}`;
      await page.goto(`/practice/${set.id}?q=${i + 1}`);
      await page.locator("#q-title").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page, where);
      if (opts.axe) await axe(page, where);
      if (opts.shots && i === 0) await shot(page, `${profile.name}-${set.id.slice(2)}-${i + 1}`);
      const want = canonicalResponse(ix, item);
      const how = hows[n++ % hows.length];
      let body, res;
      try {
        ({ body, res } = await answer(page, item, want, how));
      } catch (e) {
        await page.screenshot({ path: join(tmpdir(), `fail-${profile.name}-${item.id}.png`), fullPage: true });
        throw new Error(`${where} (${how}, input ${inputFor(ix, item).kind}): ${e.message.split("\n")[0]} — screenshot ${join(tmpdir(), `fail-${profile.name}-${item.id}.png`)}; wanted ${JSON.stringify(want).slice(0, 300)}`, { cause: e });
      }
      try {
        sameSubmission(body.response, want, inputFor(ix, item));
      } catch (e) {
        throw new Error(`${where}: the submitted answer differs from what was entered: sent ${JSON.stringify(body.response).slice(0, 400)} wanted ${JSON.stringify(want).slice(0, 400)}`, { cause: e });
      }
      assert.equal(res.correct, true, `${where}: graded ${JSON.stringify(res)}`);
      await page.getByText("Correct!").waitFor();
      if (opts.shots && i === 0) await shot(page, `${profile.name}-${set.id.slice(2)}-${i + 1}-correct`);
    }
  }
  assert.deepEqual(errors, [], `${profile.name}: page errors`);
  await ctx.close();
  return n;
}

// Wrong answers: explained, retry keeps the work, then correct.
async function wrongThenRight(profile) {
  const ctx = await browser.newContext({ ...profile, baseURL: base });
  const page = await signIn(ctx);
  const picks = [
    ["s.notes-on-the-stave", 0],
    ["s.scales", 0],
    ["s.intervals", 4],
    ["s.building-bars", 0],
    ["s.cadences", 0],
  ];
  for (const [setId, i] of picks) {
    const set = sets.find((s) => s.id === setId);
    const item = set.items[i];
    await page.goto(`/practice/${setId}?q=${i + 1}`);
    await page.locator("#q-title").waitFor();
    const bad = wrongResponse(ix, item);
    const { res } = await answer(page, item, bad, "type");
    assert.equal(res.correct, false, `${item.id}: wrong answer accepted`);
    await page.getByText("Not quite").waitFor();
    assert.ok((await page.locator(".feedback").textContent()).length > 20, `${item.id}: no explanation`);
    await shot(page, `${profile.name}-wrong-${setId.slice(2)}`);
    await page.getByRole("button", { name: "Try again" }).click();
    // The editors keep the learner's work; clear what is needed and enter the right answer.
    for (const b of await page.getByRole("button", { name: "Clear" }).all()) if (await b.isEnabled()) await b.click();
    const { res: ok } = await answer(page, item, canonicalResponse(ix, item), "type");
    assert.equal(ok.correct, true, `${item.id}: right answer after retry rejected: ${JSON.stringify(ok)}`);
  }
  await ctx.close();
}

// Keyboard only: Tab to controls, arrows and Space/Enter; no mouse at all.
async function keyboardOnly() {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await signIn(ctx);
  // Note reading: letter radios with the keyboard.
  const set = sets.find((s) => s.id === "s.notes-on-the-stave");
  const item = set.items[0];
  await page.goto(`/practice/${set.id}?q=1`);
  await page.locator("#q-title").waitFor();
  const want = canonicalResponse(ix, item);
  const letter = (want.pitch ?? want.letter)[0];
  await page.locator("input[type=radio]").first().focus();
  for (let i = 0; i < 7; i++) {
    const checked = await page.locator("input[type=radio]:checked").first().getAttribute("value").catch(() => null);
    if (checked === letter) break;
    await page.keyboard.press(i === 0 ? "Space" : "ArrowRight");
  }
  await page.keyboard.press("Enter");
  await page.getByText(/Correct!|Not quite/).waitFor();
  assert.ok(await page.getByText("Correct!").isVisible(), "keyboard-only note reading failed");
  // Piano keyboard: arrows move between keys, Enter presses.
  const kset = sets.find((s) => s.id === "s.keyboard");
  const kitem = kset.items[0];
  await page.goto(`/practice/${kset.id}?q=1`);
  await page.locator("#q-title").waitFor();
  const kw = canonicalResponse(ix, kitem);
  await page.locator("button.key[tabindex='0']").focus();
  for (let i = 0; i < 40; i++) {
    const k = Number(await page.evaluate(() => document.activeElement?.getAttribute("data-key")));
    if (k % 12 === kw.key % 12) break;
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await page.getByText("Correct!").waitFor();
  // Rhythm builder: palette buttons reached with Tab and pressed with Enter.
  const bset = sets.find((s) => s.id === "s.building-bars");
  const bitem = bset.items[0];
  await page.goto(`/practice/${bset.id}?q=1`);
  await page.locator("#q-title").waitFor();
  const bw = canonicalResponse(ix, bitem);
  const binput = inputFor(ix, bitem);
  for (const e of bw.measures[0].events.slice(binput.given.length)) {
    if (e.kind === "rest") {
      await page.getByRole("button", { name: "Rests" }).focus();
      await page.keyboard.press("Enter");
    }
    await page.locator(".palette-btn", { hasText: new RegExp(`${e.duration.value}$`) }).first().focus();
    await page.keyboard.press("Enter");
    if (e.kind === "rest") {
      await page.getByRole("button", { name: "Adding rests" }).focus();
      await page.keyboard.press("Enter");
    }
  }
  await page.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await page.getByText("Correct!").waitFor();
  await ctx.close();
}

// 200% text at 320px: nothing clipped sideways; dark mode and reduced motion render every input family.
async function display() {
  for (const [name, opts] of [
    ["large-text-320", { viewport: { width: 320, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["dark", { viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 }],
    ["reduced-motion", { viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }],
  ]) {
    const ctx = await browser.newContext({ ...opts, baseURL: base });
    const page = await signIn(ctx);
    for (const set of sets) {
      await page.goto(`/practice/${set.id}?q=1`);
      await page.locator("#q-title").waitFor();
      if (name === "large-text-320") await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.evaluate(() => document.fonts.ready);
      try {
        await noOverflow(page, `${name} ${set.id}`);
      } catch (e) {
        const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`));
        throw new Error(`${e.message}; widest: ${wide.join(" | ")}`, { cause: e });
      }
      if (name === "dark") await axe(page, `${name} ${set.id}`);
      if (["s.scales", "s.time-and-grouping", "s.keyboard", "s.chords", "s.instruments-and-score"].includes(set.id)) await shot(page, `${name}-${set.id.slice(2)}`);
    }
    await ctx.close();
  }
}

// The Grade 5 cadence lesson in the lesson player, end to end.
async function grade5Lesson() {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
  const page = await signIn(ctx);
  await page.goto("/lesson/G5-U4-L06");
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Try some questions" }).click();
  // the server above runs the frozen Brief 04 content (where this example lesson is playable on its own), so the questions are read from that snapshot too
  const legacy = loadCurriculum(join(root, "packages/api/test/fixtures/legacy-content")).curriculum;
  const lix = buildIndex(legacy);
  const node = lix.nodeById.get("G5-U4-L06");
  const lesson = legacy.lessons.find((l) => l.file === node.contentRef).content;
  for (const item of [...lesson.guided, ...lesson.independent]) {
    await page.locator("#q-title").waitFor();
    const binding = node.exercises.find((b) => b.templateId === item.templateId);
    const { effectiveScope } = await import("@mtp/curriculum");
    const scope = effectiveScope(lix, node, binding);
    const input = inputFor(lix, item, scope);
    const want = canonicalResponse(lix, item, scope);
    const sent = page.waitForRequest((req) => req.url().includes("/attempts") && req.method() === "POST", { timeout: 15000 });
    sent.catch(() => undefined);
    await drive(page, page.locator("#answer-form"), input, want, "type");
    await page.getByRole("button", { name: "Check" }).click();
    const res = await (await (await sent).response()).json();
    assert.equal(res.correct, true, `${item.id}: ${JSON.stringify(res)}`);
    await shot(page, `lesson-g5-${item.id.split(".").pop()}`);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("heading", { name: "Lesson complete!" }).waitFor();
  await ctx.close();
}

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: "small-phone-320", viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "iphone", ...devices["iPhone 14"] },
  { name: "ipad", ...devices["iPad (gen 7)"] },
];

const run = async (label, fn) => {
  try {
    const out = await fn();
    log(`✓ ${label}${typeof out === "number" ? ` (${out} questions)` : ""}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${label}: ${e.stack ?? e}`);
  }
};

await run("desktop: every demonstration item answered through the UI, axe-clean", () => playSets(profiles[0], { axe: true, shots: Boolean(shots) }));
await run("320px phone: every demonstration item", () => playSets(profiles[1], { shots: Boolean(shots) }));
await run("iPhone: one item per family area", () => playSets(profiles[2], { only: sets.map((s) => s.id).filter((_, i) => i % 2 === 0) }));
await run("iPad: one item per family area", () => playSets(profiles[3], { only: sets.map((s) => s.id).filter((_, i) => i % 2 === 1) }));
await run("wrong answers are explained, then corrected (320px)", () => wrongThenRight(profiles[1]));
await run("keyboard only (note reading, piano, rhythm builder)", keyboardOnly);
await run("200% text at 320px / dark mode / reduced motion", display);
await run("Grade 5 cadence lesson in the lesson player", grade5Lesson);

await browser.close();
server.kill();
if (failures) {
  console.error(`${failures} Brief 03 check(s) failed`);
  process.exit(1);
}
log("All Brief 03 browser checks passed");
