/**
 * Test helpers that measure what the notation layout DRAWS, independently of how it reasons: glyph ink widths come straight from the
 * Bravura font's metadata.json (the glyph names are the SMuFL names the renderer's G table already uses), and beams and bar-line strokes
 * are read from the drawn paths and lines.
 */
import { createRequire } from "node:module";
import { G } from "../components/notation/glyphs.ts";
import type { StaveLayout } from "../components/notation/layout.ts";

const metadata = createRequire(import.meta.url)("@vexflow-fonts/bravura/metadata.json") as { glyphBBoxes: Record<string, { bBoxNE: [number, number]; bBoxSW: [number, number] }> };
const SMUFL_NAME: Record<string, string> = { dot: "augmentationDot" };

/** Right edge of a glyph's ink, from its drawing origin, in staff spaces (glyphs are drawn at 4 staff spaces to the em). */
export const INK = new Map<string, number>(
  Object.entries(G)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .flatMap(([name, ch]) => {
      const box = metadata.glyphBBoxes[SMUFL_NAME[name] ?? name];
      return box ? [[ch, box.bBoxNE[0]] as [string, number]] : [];
    }),
);
export const braceWidthPerSpace = metadata.glyphBBoxes.brace!.bBoxNE[0] / 4;

const pathXs = (d: string) => [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));

/** Rightmost ink of a bar: glyphs (with their font widths), stems and ledger lines, beams and ties. Fails on a glyph the font does not know. */
export function inkRight(l: StaveLayout, bar: number): number {
  const evs = l.events.filter((e) => e.bar === bar);
  const xs = evs.flatMap((e) => [
    ...e.glyphs.map((g) => {
      const w = INK.get(g.ch);
      if (w === undefined) throw new Error(`no font width for glyph U+${g.ch.codePointAt(0)!.toString(16)}`);
      return g.x + w * ((g.size ?? 4) / 4);
    }),
    ...e.lines.map((ln) => Math.max(ln.x1, ln.x2) + ln.w / 2),
    ...e.paths.filter((p) => p.cls === "n-beam").flatMap((p) => pathXs(p.d)),
  ]);
  if (!xs.length) throw new Error(`bar ${bar} draws nothing`);
  return Math.max(...xs);
}

/** The left edge of every bar-line mark drawn after a bar (strokes and repeat dots), before the next bar starts. */
export function barlineMarks(l: StaveLayout, bar: number): number[] {
  const start = l.barX[bar]!;
  const end = l.barX[bar + 1] ?? Infinity;
  return [
    ...l.fixed.lines.filter((ln) => ln.x1 === ln.x2 && ln.x1 > start && ln.x1 < end).map((ln) => ln.x1 - ln.w / 2),
    // repeat dots: "M<cx>,<cy> m-0.25,0 …" (radius 0.25)
    ...l.fixed.paths.flatMap((p) => [...p.d.matchAll(/M(-?[\d.]+),[^m]*m-0\.25/g)].map((m) => Number(m[1]) - 0.25)).filter((x) => x > start && x < end),
  ];
}

/** Clear space between a bar's rightmost ink and the first mark of its bar-line. Fails when the bar has no bar-line. */
export function gapBeforeBarline(l: StaveLayout, bar: number): number {
  const marks = barlineMarks(l, bar);
  if (!marks.length) throw new Error(`bar ${bar} has no bar-line`);
  return Math.min(...marks) - inkRight(l, bar);
}
