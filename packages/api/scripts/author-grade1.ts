/**
 * Writes the Grade 1 lesson files (content/lessons/G1-*.json) from the unit specs in ./grade1, and links them from the path.
 * Run: npx tsx scripts/author-grade1.ts   (from packages/api).  The output files are the source of truth afterwards;
 * re-running regenerates them deterministically.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLesson, pickItem, startAuthoring, type Spec } from "./grade1/lib.ts";
import { U3 } from "./grade1/u3.ts";
import { questionKey } from "../src/question-key.ts";
import type { ExerciseItem } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec[] = [...U3];
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
  extra.forEach((p, k) => {
    const item = pickItem(a, node, p, "independent", 5 + k);
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
for (const n of path.nodes as Array<Record<string, unknown>>) {
  if (n.type !== "lesson" && n.contentStatus === "planned" && (n.id as string) === "G1-U3-P1") n.contentStatus = "draft";
}
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");
