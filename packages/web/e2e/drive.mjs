// Shared helpers for driving the real answer controls (copied from the Brief 03 suite so that suite stays untouched).
import { music } from "@mtp/curriculum";


export const pretty = (p) => p.replace(/#/g, "♯").replace(/x/g, "𝄪").replace(/([A-G])bb/g, "$1𝄫").replace(/([A-G])b/g, "$1♭");
const QUAL = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const SIGN_LABEL = { bb: "double flat", b: "flat", "": "natural (no sharp or flat)", "#": "sharp", x: "double sharp" };
const ORN = { trill: "trill", turn: "turn", "upper-mordent": "upper mordent", "lower-mordent": "lower mordent", acciaccatura: "acciaccatura", appoggiatura: "appoggiatura" };
const ORD = (n) => (n === 1 ? "unison" : n === 8 ? "octave" : n === 15 ? "double octave" : `${n}${n === 2 || n === 9 ? "nd" : n === 3 || n === 10 ? "rd" : "th"}`);

export const within = (scope, legend) => scope.locator("fieldset", { has: scope.page().locator("legend", { hasText: legend }) });
export const option = (scope, text) => scope.locator("label.option", { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();

export async function tapStave(page, scope, pos) {
  const svg = scope.locator(".stave-editor-stave svg").first();
  const [vbY, vbH] = await svg.evaluate((el) => { const v = el.getAttribute("viewBox").split(" ").map(Number); return [v[1], v[3]]; });
  // centre the stave, so the fixed action bar at the bottom of the screen never covers the tap point
  await svg.evaluate((el) => el.scrollIntoView({ block: "center" }));
  // wait for the stave to stop moving (a slower machine can still be settling after the previous question), then tap
  let box = await svg.boundingBox();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(80);
    const again = await svg.boundingBox();
    const still = again && box && Math.abs(again.y - box.y) < 0.5 && Math.abs(again.height - box.height) < 0.5;
    box = again;
    if (still) break;
  }
  await page.mouse.click(box.x + box.width * 0.62, box.y + ((-pos / 2 - vbY) / vbH) * box.height);
}

export async function typeNotes(scope, pitches) {
  const det = scope.locator("details.type-instead").first();
  if (!(await det.evaluate((d) => d.open))) await det.locator("summary").click();
  await det.locator("input[type=text]").fill(pitches.join(" "));
  await det.getByRole("button", { name: "Write these notes" }).click();
}

export async function drive(page, scope, input, r, how) {
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
