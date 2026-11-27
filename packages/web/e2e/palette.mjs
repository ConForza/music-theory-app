// Shared browser check for the bar builder's note palette (used by the Grade 1 and Grade 4 suites).

/**
 * Palette buttons whose music symbol (with its dots) inks outside the card: past the left or right border, over the top border, or down
 * into the card's name. Measured from the real glyphs in the page: the symbol's baseline and origin (a zero-size probe and the text's own
 * box) and the ink the browser reports around them for the symbol's font.
 */
export const paletteInkOutside = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".palette-btn")].flatMap((btn) => {
      const sym = btn.querySelector(".smufl-inline");
      const range = document.createRange();
      range.selectNodeContents(sym);
      const origin = range.getBoundingClientRect().left;
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      sym.appendChild(probe);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      const ctx = document.createElement("canvas").getContext("2d");
      const cs = getComputedStyle(sym);
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(sym.textContent);
      const box = btn.getBoundingClientRect();
      const b = getComputedStyle(btn);
      const inner = { left: box.left + parseFloat(b.borderLeftWidth), right: box.right - parseFloat(b.borderRightWidth), top: box.top + parseFloat(b.borderTopWidth) };
      const label = btn.querySelector(".palette-name").getBoundingClientRect();
      const ink = { left: origin - m.actualBoundingBoxLeft, right: origin + m.actualBoundingBoxRight, top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent };
      const where = [ink.left < inner.left && "left", ink.right > inner.right && "right", ink.top < inner.top + 2 && "top", ink.bottom > label.top && "label"].filter(Boolean);
      return where.length ? [`${btn.getAttribute("aria-label")}: ${where.join("+")}`] : [];
    }),
  );

/**
 * Checks every symbol the palette can show: notes and rests, each with every number of dots the question allows. Fails when a control the
 * question offers is missing, so a palette change cannot quietly skip a case.
 */
export async function checkEveryPaletteSymbol(page, assert, { rests, maxDots }) {
  const problems = [];
  const restToggle = page.locator(".palette-tools button", { hasText: /^(Rests|Adding rests)$/ });
  const dotToggle = page.locator(".palette-tools button", { hasText: /dot/i });
  assert.equal(await restToggle.count(), rests ? 1 : 0, "the Rests control is offered exactly when the question allows rests");
  assert.equal(await dotToggle.count(), maxDots > 0 ? 1 : 0, "the dot control is offered exactly when the question allows dots");
  for (const rest of rests ? [false, true] : [false]) {
    if (rest) await restToggle.click();
    for (let d = 0; d <= maxDots; d++) {
      problems.push(...(await paletteInkOutside(page)).map((p) => `${p} (${d} dot${d === 1 ? "" : "s"})`));
      if (maxDots > 0) await dotToggle.click(); // the control cycles 0 → 1 → … → maxDots → 0
    }
  }
  assert.deepEqual(problems, [], "every palette symbol stays inside its card");
}
