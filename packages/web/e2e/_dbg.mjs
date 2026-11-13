import { chromium } from "playwright";
import { answerOnScreen, completeEarlier, finishViaApi, get, guest, post, selectGrade, serve } from "./g4lib.mjs";
import { canonicalResponse } from "@mtp/engine";
const S = await serve({ waive: false });
const browser = await chromium.launch();
const lessons = (process.env.L ?? "G4-U1-L01,G4-U1-L02,G4-U1-L03,G4-U1-L04,G4-U1-L05,G4-U4-L02").split(",");
for (const lesson of lessons) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: S.base });
  const { page, userId } = await guest(ctx);
  completeEarlier(S, userId);
  await selectGrade(page, 4);
  const node = S.course.ix.nodeById.get(lesson);
  const pre = S.course.nodes.filter((n) => n.grade === 4 && n.order < node.order && ["lesson", "practice", "review"].includes(n.type)).at(-1);
  if (pre) await finishViaApi(S, page, userId, pre.id);
  await page.goto(`/lesson/${lesson}`);
  await page.getByRole("button", { name: /Let's go|Continue/ }).click();
  if (await page.getByRole("heading", { name: "Here's the idea" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "See it, hear it" }).waitFor();
    await page.getByRole("button", { name: "Try some questions" }).click();
  }
  const items = S.course.authoredItems(lesson);
  for (const [k, it] of items.entries()) {
    try {
      await answerOnScreen(page, S, it, S.course.scopeFor(lesson, it), canonicalResponse(S.course.ix, it, S.course.scopeFor(lesson, it)));
      await page.locator(".feedback").getByText("Correct!").waitFor({ timeout: 4000 });
      await page.getByRole("button", { name: /Continue|Finish/ }).click();
    } catch (e) {
      console.log(`FAIL ${lesson} #${k + 1} ${it.templateId} (${it.answer.kind}): ${it.prompt.slice(0, 100)} :: ${e.message.split("\n")[0].slice(0, 160)}`);
      const fb = await page.locator(".feedback").innerText().catch(() => "");
      console.log("   feedback:", fb.slice(0, 200).replace(/\n/g, " | "));
      break;
    }
  }
  await ctx.close();
}
await browser.close(); S.close(); process.exit(0);
