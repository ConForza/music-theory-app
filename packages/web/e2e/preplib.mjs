// Helpers for the Brief 10 browser journeys (placement, practice examinations, revision).
export * from "./g5lib.mjs";
import assert from "node:assert/strict";
import { canonicalResponse, inputFor, wrongResponse } from "@mtp/engine";
import { answerOnScreen } from "./g5lib.mjs";

/**
 * The answer to drive through the controls. A question can have several correct answers (a rhythm that fits 3/8 and 6/16), and the first one
 * is not always one the answer controls offer for this scope: then an accepted alternative that IS offered is used. (The API suite proves one always exists.)
 */
export function reachableCanonical(S, item, scope) {
  const first = canonicalResponse(S.course.ix, item, scope);
  const input = inputFor(S.course.ix, item, scope);
  const offered = (r) => input.kind !== "time-signature" || (input.tops.includes(r.top) && input.bottoms.includes(r.bottom));
  if (offered(first) || item.answer.kind !== "time-signature") return first;
  for (const alt of item.answer.accepted) {
    const r = canonicalResponse(S.course.ix, { ...item, answer: { ...item.answer, accepted: [alt] } }, scope);
    if (offered(r)) return r;
  }
  return first;
}

const promptStart = (it) => it.item.prompt.replace(/\s+/g, " ").trim().slice(0, 40);

/** Wait until the question whose prompt starts like `it`'s is the one on screen (the previous one can linger for a moment). */
export async function onQuestion(page, it, label = "", number = 0) {
  await page.locator("section.question").waitFor();
  const head = promptStart(it);
  // The prompt alone can be the same on two neighbouring questions ("Add the time signature to this rhythm."), so the question number is checked too.
  await page.waitForFunction(([t, n]) => {
    const ok = (document.querySelector("section.question .q-prompt")?.textContent ?? "").replace(/\s+/g, " ").trim().startsWith(t);
    return ok && (!n || (document.querySelector("section.question .eyebrow")?.textContent ?? "").includes(`Question ${n} of`));
  }, [head, number], { timeout: 30000 }).catch(async (e) => {
    throw new Error(`${label}: expected "${head}" but the page shows "${(await page.locator("section.question").first().innerText().catch(() => "?")).slice(0, 120).replace(/\n/g, " | ")}"`, { cause: e });
  });
}

/**
 * Answer a practice examination or placement attempt through the real controls. `wrong(i, planned)` says which questions to answer wrongly;
 * `stopAfter` leaves the attempt part-way. In an independent attempt it also checks that no verdict is ever shown while answering.
 * Resolves with the number of questions answered.
 */
export async function playPrep(page, S, userId, attemptId, opts = {}) {
  const blind = opts.blind ?? true;
  let i = opts.from ?? 0;
  for (;;) {
    const items = S.app.prep.internalItems(userId, attemptId);
    if (i >= items.length || i >= (opts.stopAfter ?? Infinity)) break;
    const { item, scope, planned } = items[i];
    await onQuestion(page, { item }, `${attemptId} question ${i + 1}`, i + 1);
    const bad = opts.wrong?.(i, planned) ? wrongResponse(S.course.ix, item, scope) : null;
    const response = bad ?? reachableCanonical(S, item, scope);
    if (opts.beforeAnswer) await opts.beforeAnswer(page, i, item);
    try {
      await answerOnScreen(page, S, item, scope, response);
    } catch (e) {
      const shown = await page.locator("section.question").first().innerText().catch(() => "?");
      if (process.env.DUMP) (await import("node:fs")).writeFileSync(process.env.DUMP, JSON.stringify({ itemId: item.id, answer: item.answer, input: inputFor(S.course.ix, item, scope), scopeTs: scope.timeSignatures, music: item.music, prompt: item.prompt, shown }, null, 1));
      throw new Error(`${attemptId} question ${i + 1} (${item.templateId}) "${item.prompt}" with ${JSON.stringify(response)}: ${e.message.split("\n")[0]} | on screen: ${shown.replace(/\s+/g, " ").slice(0, 300)}`, { cause: e });
    }
    if (blind) {
      await page.locator(".feedback .feedback-title").getByText("Answer saved").waitFor();
      const said = await page.locator(".feedback").innerText();
      assert.ok(!/Correct!|Not quite|Not this time|answer:/i.test(said), `a verdict was shown during an independent attempt: ${said}`);
      await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
    } else {
      await page.locator(".feedback .feedback-title").waitFor();
      if (bad) await page.getByRole("button", { name: "Move on" }).click();
      else await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
    }
    i++;
    if (opts.afterAnswer) await opts.afterAnswer(page, i);
  }
  return i;
}

export const attemptIdFromUrl = (page) => new URL(page.url()).pathname.split("/").pop();
