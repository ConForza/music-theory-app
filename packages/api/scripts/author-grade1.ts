/**
 * Writes the Grade 1 lesson files (content/lessons/G1-*.json) from the unit specs in ./grade1, and links them from the path.
 * Run: npx tsx scripts/author-grade1.ts   (from packages/api).  The output files are the source of truth afterwards;
 * re-running regenerates them deterministically.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLesson, pickItem, startAuthoring, type Spec } from "./grade1/lib.ts";
import { U1 } from "./grade1/u1.ts";
import { U2 } from "./grade1/u2.ts";
import { U3 } from "./grade1/u3.ts";
import { U4 } from "./grade1/u4.ts";
import { U5 } from "./grade1/u5.ts";
import { U6 } from "./grade1/u6.ts";
import { U7 } from "./grade1/u7.ts";
import { questionKey } from "../src/question-key.ts";
import { mergeScope, type ExerciseItem } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec[] = [...U1, ...U2, ...U3, ...U4, ...U5, ...U6, ...U7];
const only = process.argv.slice(2);
// Regeneration starts from a clean slate: a previously generated file that no longer validates must not stop the run.
for (const spec of specs) if (!only.length || only.includes(spec.node)) rmSync(join(root, `lessons/${spec.node}.json`), { force: true });
const a = startAuthoring();

const pathFile = join(root, "path/grade-1.json");
const path = JSON.parse(readFileSync(pathFile, "utf8"));
const byId = new Map<string, Record<string, unknown>>(path.nodes.map((n: { id: string }) => [n.id, n]));

// Questions already in preserved lessons count as used, so new lessons never repeat them as fresh evidence.
for (const keep of ["G1-U3-L03"]) {
  const l = JSON.parse(readFileSync(join(root, `lessons/${keep}.json`), "utf8"));
  for (const it of [...l.independent] as ExerciseItem[]) a.used.add(questionKey(it));
}

// Build everything first so a failure leaves the content folder exactly as it was.
const built = specs.filter((s) => !only.length || only.includes(s.node)).map((spec) => ({ spec, lesson: buildLesson(a, spec) }));
// G1-U3-L03 is the Brief 01 example lesson. Every existing id, version and wording is preserved so earlier attempts stay valid
// historical records; this only appends more independent questions (two more templates' worth) and bumps the content version.
const l03Path = join(root, "lessons/G1-U3-L03.json");
const l03 = JSON.parse(readFileSync(l03Path, "utf8"));
if (!only.length || only.includes("G1-U3-L03")) {
  const node = a.ix.nodeById.get("G1-U3-L03")!;
  const extra = [
    { t: "t.g1.note-read", correct: "Another treble line note read correctly." },
    { t: "t.g1.note-place", when: (i: ExerciseItem) => i.prompt.includes("on a line"), correct: "On the right treble line." },
    { t: "t.g1.note-place", when: (i: ExerciseItem) => i.prompt.includes("on a line"), correct: "On the right line again." },
  ];
  const have = new Set((l03.independent as ExerciseItem[]).map((i) => i.id));
  const inL03 = new Set<string>([...l03.guided, ...l03.independent].map((i: ExerciseItem) => questionKey(i)));
  extra.forEach((p, k) => {
    const item = pickItem(a, node, p, "independent", 5 + k, inL03);
    if (!have.has(item.id)) l03.independent.push(item);
  });
  l03.contentVersion = 3;
  if (!l03.recap.includes("A line note has the line running through the middle of its head.")) l03.recap.push("A line note has the line running through the middle of its head.");
  l03.provenance.authoredBy = "Music Theory Path curriculum team (Brief 01 example, extended in Brief 05; pending qualified teacher review)";
  writeFileSync(l03Path, JSON.stringify(l03, null, 2) + "\n");
  const n3 = byId.get("G1-U3-L03")!;
  n3.contentVersion = 3;
  n3.contentStatus = "draft";
}
for (const { spec, lesson } of built) {
  writeFileSync(join(root, `lessons/${spec.node}.json`), JSON.stringify(lesson, null, 2) + "\n");
  const n = byId.get(spec.node)!;
  n.contentRef = `lessons/${spec.node}.json`;
  n.contentStatus = "draft";
  n.contentVersion = spec.version;
  console.log(`wrote ${spec.node}: ${lesson.guided.length} guided, ${lesson.independent.length} independent`);
}
// Practice, review, unit challenge and Grade assessment nodes are built by the server from their bindings/blueprints.
// A unit's practice node revisits exactly what its lessons taught; a review node revisits everything up to and including its unit.
// Bindings are derived here from the lessons so the three can never drift apart, and are only switched on (status "draft") once
// the lessons they draw on are written.
type Binding = { templateId: string; conceptIds: string[]; scope: Record<string, unknown> };
const nodes = path.nodes as Array<Record<string, unknown> & { id: string; type: string; unitId: string | null; exercises: Binding[] }>;
const lessonsOf = (unit: string) => nodes.filter((n) => n.unitId === unit && n.type === "lesson");
const merge = (list: Binding[]): Binding[] => {
  const out = new Map<string, Binding>();
  for (const b of list) {
    const cur = out.get(b.templateId);
    out.set(b.templateId, cur ? { templateId: b.templateId, conceptIds: [...new Set([...cur.conceptIds, ...b.conceptIds])], scope: mergeScope(cur.scope as never, b.scope as never) as Record<string, unknown> } : { ...b, conceptIds: [...b.conceptIds], scope: { ...b.scope } });
  }
  return [...out.values()];
};
const units = ["G1-U1", "G1-U2", "G1-U3", "G1-U4", "G1-U5", "G1-U6", "G1-U7"];
const written = (unit: string) => lessonsOf(unit).every((l) => l.contentRef);
units.forEach((u, k) => {
  const own = merge(lessonsOf(u).flatMap((l) => l.exercises));
  const upTo = merge(units.slice(0, k + 1).flatMap((x) => lessonsOf(x).flatMap((l) => l.exercises)));
  const ready = units.slice(0, k + 1).every(written);
  for (const n of nodes.filter((x) => x.unitId === u)) {
    if (n.type === "practice" && written(u)) { n.exercises = own; n.contentStatus = "draft"; }
    if (n.type === "review" && ready) { n.exercises = upTo; n.contentStatus = "draft"; }
    if (n.type === "unit_challenge" && written(u)) n.contentStatus = "draft";
  }
});
const assessment = nodes.find((n) => n.type === "grade_assessment");
if (assessment && units.every(written)) assessment.contentStatus = "draft";
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");
