// Renders the app icons from icon.svg with the browser Playwright already provides (no image dependency).
// Run: node packages/web/icon-src/render.mjs   (writes into packages/web/public)
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../public");
mkdirSync(join(out, "icons"), { recursive: true });
const svg = readFileSync(join(here, "icon.svg"), "utf8");
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
// any: rounded square on transparent (shown unmasked by some launchers); maskable/apple: full bleed, art inside the 80% safe zone.
const targets = [
  { file: "icons/icon-192.png", size: 192, round: true },
  { file: "icons/icon-512.png", size: 512, round: true },
  { file: "icons/maskable-192.png", size: 192, round: false },
  { file: "icons/maskable-512.png", size: 512, round: false },
  { file: "apple-touch-icon.png", size: 180, round: false },
];
const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  const radius = t.round ? Math.round(t.size * 0.22) : 0;
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${data}" style="display:block;width:${t.size}px;height:${t.size}px;border-radius:${radius}px"></body></html>`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: join(out, t.file), omitBackground: t.round, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  await page.close();
  console.log("wrote", t.file);
}
await browser.close();
