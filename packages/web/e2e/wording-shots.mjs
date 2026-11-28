// Question-wording audit evidence: screenshots of representative questions at phone, tablet and desktop sizes, plus the measurements the
// audit reports (how far down the page the music and the answer controls start, and the prompt's height). Each question is reached through
// "Explore lessons" by answering the questions before it with the real controls, so what is captured is exactly what a learner sees.
// Run: npm run build && SHOTS=dir node --import tsx e2e/wording-shots.mjs   (TAG=before|after names the files; LARGE_TEXT=1 adds a 200% text pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices } from "playwright";
import { answerOnScreen, guest, serve } from "./g1lib.mjs";
import { canonicalResponse } from "@mtp/engine";

const out = process.env.SHOTS ?? "wording-shots";
const tag = process.env.TAG ?? "shot";
mkdirSync(out, { recursive: true });
const S = await serve({ waive: false });
const browser = await chromium.launch();

/** [name, lesson node, which item: a template id (first match) or a predicate on the prompt]. */
const TARGETS = [
  ["g5-bar-complete-7-4", "G5-U1-L02", (it) => it.templateId === "t.g5.bar-complete" && it.prompt.includes("2 + 3 + 2")],
  ["g5-division-write", "G5-U1-L03", (it) => it.templateId === "t.g5.division-write"],
  ["g5-approach-chord", "G5-U4-L06", (it) => it.templateId === "t.g5.approach-chord"],
  ["g5-instrument-transpose", "G5-U3-L06", (it) => it.templateId === "t.g5.instrument-transpose"],
  ["g5-interval-key-build", "G5-U3-L07", (it) => it.templateId === "t.g5.interval-key-build"],
  ["g5-ornament-replace", "G5-U5-L02", (it) => it.templateId === "t.g5.ornament-replace"],
  ["g4-double-dot-bar", "G4-U1-L02", (it) => it.templateId === "t.g4.double-dot-bar"],
  ["g1-bar-complete", "G1-U2-L03", (it) => it.templateId === "t.g1.bar-complete"],
  ["g1-scale-build", "G1-U5-L02", (it) => it.templateId === "t.g1.scale-build"],
];
const PROFILES = {
  "iphone-14": devices["iPhone 14"],
  "phone-320": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const only = process.env.PROFILES?.split(",");
const metrics = [];

for (const [pname, profile] of Object.entries(PROFILES)) {
  if (only && !only.includes(pname)) continue;
  for (const large of process.env.LARGE_TEXT ? [false, true] : [false]) {
    const ctx = await browser.newContext({ ...profile, baseURL: S.base });
    const { page } = await guest(ctx);
    for (const [name, node, pick] of TARGETS) {
      const items = S.course.authoredItems(node);
      const target = items.findIndex(pick);
      if (target < 0) throw new Error(`${name}: no matching item in ${node}`);
      await page.goto(`/lesson/${node}?explore=1`);
      await page.getByRole("button", { name: /Let's go|Continue/ }).click();
      if (await page.getByRole("heading", { name: "Here's the idea" }).isVisible().catch(() => false)) {
        await page.getByRole("button", { name: "Next" }).click();
        await page.getByRole("button", { name: "Try some questions" }).click();
      }
      for (let k = 0; ; k++) {
        await page.getByText(new RegExp(`Question ${k + 1} of ${items.length}`)).waitFor();
        if (k >= target) break;
        const scope = S.course.scopeFor(node, items[k]);
        await answerOnScreen(page, S, items[k], scope, canonicalResponse(S.course.ix, items[k], scope));
        await page.locator(".feedback").getByText("Correct!").waitFor();
        await page.getByRole("button", { name: "Continue" }).click();
      }
      if (large) await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%", "important")); // CSSOM, so the CSP allows it
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const top = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null; };
        const prompt = document.querySelector("section.question .q-prompt");
        const bar = document.querySelector(".action-bar");
        return {
          promptHeight: prompt ? Math.round(prompt.getBoundingClientRect().height) : null,
          promptWords: prompt ? prompt.textContent.trim().split(/\s+/).length : null,
          musicTop: top("section.question .music-view, section.question .rhythm-builder, section.question .notation, section.question .score-view"),
          answerTop: top("#answer-form button, #answer-form input, #answer-form [role=radio], #answer-form .palette-btn"),
          viewport: window.innerHeight,
          actionBarTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
          pageHeight: document.documentElement.scrollHeight,
          prompt: prompt?.textContent.trim(),
        };
      });
      const file = `${tag}-${name}-${pname}${large ? "-large-text" : ""}`;
      metrics.push({ tag, name, profile: pname, largeText: large, ...m, answerInFirstScreen: m.answerTop !== null && m.actionBarTop !== null && m.answerTop < m.actionBarTop });
      await page.screenshot({ path: join(out, `${file}.png`), fullPage: false });
      console.log(file, JSON.stringify({ promptWords: m.promptWords, promptHeight: m.promptHeight, musicTop: m.musicTop, answerTop: m.answerTop, actionBarTop: m.actionBarTop }));
    }
    await ctx.close();
  }
}
writeFileSync(join(out, `${tag}-metrics.json`), JSON.stringify(metrics, null, 1));
await browser.close();
S.close();
