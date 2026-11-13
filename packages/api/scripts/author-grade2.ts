/**
 * Writes the Grade 2 content (Brief 06): path bindings, the 24 lesson files, the derived practice and review bindings,
 * and the unit challenge / Grade assessment blueprints (version 2). Run: `npm run author:grade2 -w @mtp/api`.
 * The output files are the source of truth afterwards; re-running regenerates them deterministically.
 *
 * Same pipeline as Grade 1 (author-grade1.ts): lessons are compact specs, their questions are PICKED from the generators
 * inside each lesson's own taught scope and FROZEN as fixed items with stable ids.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLesson, startAuthoring } from "./grade1/lib.ts";
import { U1 } from "./grade2/u1.ts";
import { U2 } from "./grade2/u2.ts";
import { U3 } from "./grade2/u3.ts";
import { U4 } from "./grade2/u4.ts";
import { U5 } from "./grade2/u5.ts";
import { enrichment } from "./grade2/e1.ts";
import type { Spec2 } from "./grade2/lib2.ts";
import { mergeScope } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec2[] = [...U1, ...U2, ...U3, ...U4, ...U5];
const pathFile = join(root, "path/grade-2.json");
const path = JSON.parse(readFileSync(pathFile, "utf8"));
type Binding = { templateId: string; conceptIds: string[]; scope: Record<string, unknown> };
type PathNode = Record<string, unknown> & { id: string; type: string; unitId: string | null; exercises: Binding[]; contentStatus: string };
const nodes = path.nodes as PathNode[];
const byId = new Map(nodes.map((n) => [n.id, n]));
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// Every binding must state its narrowing of every dimension its template lists (BINDING_SCOPE_IMPLICIT): an unstated one is "none".
const templates = new Map<string, { scope: Record<string, unknown> }>(
  (JSON.parse(readFileSync(join(root, "exercises/templates/grade-2.json"), "utf8")).templates as Array<{ id: string; scope: Record<string, unknown> }>).map((t) => [t.id, t]),
);
const stated = (templateId: string, scope: Record<string, unknown>) => {
  const out = clean(scope);
  for (const [k, v] of Object.entries(templates.get(templateId)?.scope ?? {})) if (!(k in out)) out[k] = Array.isArray(v) ? [] : typeof v === "number" ? 0 : typeof v === "boolean" ? false : v;
  return out;
};

// 1. Lesson bindings come from the specs, so the path, the lessons and the generated nodes can never drift apart.
for (const spec of specs) {
  const n = byId.get(spec.node);
  if (!n) throw new Error(`Unknown node ${spec.node}`);
  n.exercises = spec.bind.map((b) => ({ templateId: b.t, conceptIds: b.c, scope: stated(b.t, b.scope) }));
  n.contentVersion = spec.version;
}
{
  // The optional preview's binding (see step 2) is written first so the intermediate path file always validates.
  const n = byId.get("G2-U4-E1")!;
  n.outcomeIds = ["abrsm2020.g2.07"];
  n.exercises = [{ templateId: "t.g2.melodic-preview", conceptIds: ["c.scales.minor-melodic-preview"], scope: stated("t.g2.melodic-preview", { keys: ["A minor"], clefs: ["treble"], maxLedgerLines: 2 }) }];
}
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 2. Build the lessons from the bindings just written.
for (const spec of specs) rmSync(join(root, `lessons/${spec.node}.json`), { force: true });
rmSync(join(root, "lessons/G2-U4-E1.json"), { force: true });
const a = startAuthoring();
const built = specs.map((spec) => ({ spec, lesson: buildLesson(a, spec) }));
const e1 = enrichment();
for (const { spec, lesson } of built) {
  writeFileSync(join(root, `lessons/${spec.node}.json`), JSON.stringify(lesson, null, 2) + "\n");
  const n = byId.get(spec.node)!;
  n.contentRef = `lessons/${spec.node}.json`;
  n.contentStatus = "draft";
  console.log(`wrote ${spec.node}: ${lesson.guided.length} guided, ${lesson.independent.length} independent`);
}
writeFileSync(join(root, "lessons/G2-U4-E1.json"), JSON.stringify(e1, null, 2) + "\n");
{
  const n = byId.get("G2-U4-E1")!;
  n.contentRef = "lessons/G2-U4-E1.json";
  n.contentStatus = "draft";
  n.contentVersion = e1.contentVersion;
  // The preview only relates to the harmonic-minor outcome (it recaps it); it is optional and covers nothing. Its one binding is for a template with no
  // generator and no place in any blueprint or review, so it can never count towards Grade 2 mastery or assessment.
  n.outcomeIds = ["abrsm2020.g2.07"];
  n.exercises = [{ templateId: "t.g2.melodic-preview", conceptIds: ["c.scales.minor-melodic-preview"], scope: stated("t.g2.melodic-preview", { keys: ["A minor"], clefs: ["treble"], maxLedgerLines: 2 }) }];
  console.log("wrote G2-U4-E1 (optional enrichment)");
}

// 3. Practice, review, challenge and assessment nodes are built by the server from bindings/blueprints.
//    A unit's practice revisits exactly what its lessons taught; unit k's review revisits the units before it (the first unit's
//    review keeps its Grade 1 foundations); the last review also keeps the Grade 1 melody binding it was planned with.
const merge = (list: Binding[]): Binding[] => {
  const out = new Map<string, Binding>();
  for (const b of list) {
    const cur = out.get(b.templateId);
    out.set(b.templateId, cur ? { templateId: b.templateId, conceptIds: [...new Set([...cur.conceptIds, ...b.conceptIds])], scope: mergeScope(cur.scope as never, b.scope as never) as Record<string, unknown> } : { ...b, conceptIds: [...b.conceptIds], scope: { ...b.scope } });
  }
  return [...out.values()];
};
const units = ["G2-U1", "G2-U2", "G2-U3", "G2-U4", "G2-U5"];
const lessonsOf = (u: string) => nodes.filter((n) => n.unitId === u && n.type === "lesson");
const keepG1Melody = (nodes.find((n) => n.id === "G2-U5-R1")!.exercises as Binding[]).filter((b) => b.templateId === "t.g1.melody");
units.forEach((u, k) => {
  for (const n of nodes.filter((x) => x.unitId === u)) {
    if (n.type === "practice") { n.exercises = merge(lessonsOf(u).flatMap((l) => l.exercises)); n.contentStatus = "draft"; }
    if (n.type === "review") {
      if (k > 0) n.exercises = [...merge(units.slice(0, k === 4 ? 5 : k).flatMap((x) => lessonsOf(x).flatMap((l) => l.exercises))), ...(k === 4 ? keepG1Melody : [])];
      n.contentStatus = "draft";
    }
    if (n.type === "unit_challenge") n.contentStatus = "draft";
  }
});
const assessment = nodes.find((n) => n.type === "grade_assessment")!;
assessment.contentStatus = "draft";
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 4. Blueprints (version 2): the sections keep their outcomes; the template lists gain the Brief 06 templates so every outcome
//    can be asked in more than one way. A section only ever draws from what has been taught.
const SECTION_TEMPLATES: Record<string, string[]> = {
  "o-g2-01": ["t.g2.time-signature", "t.g2.bar-complete", "t.g2.beat-facts", "t.g2.bar-judge", "t.g2.melody-detail"],
  "o-g2-02": ["t.g2.bar-complete", "t.g2.note-grouping", "t.g2.rest-grouping", "t.g2.rest-judge", "t.g2.rest-fix", "t.g2.bar-judge"],
  "o-g2-03": ["t.g2.triplet", "t.g2.triplet-facts", "t.g2.triplet-read", "t.g2.melody-detail"],
  "o-g2-04": ["t.g2.triplet-mixed", "t.g2.triplet-fill"],
  "o-g2-05": ["t.g2.ledger-read", "t.g2.ledger-write", "t.g2.clef-pair", "t.g2.melody-detail"],
  "o-g2-06": ["t.g2.relative-key", "t.g2.relative-facts"],
  "o-g2-07": ["t.g2.scale-build-minor", "t.g2.minor-facts", "t.g2.minor-pattern", "t.g2.scale-gap"],
  "o-g2-08": ["t.g2.scale-build-major", "t.g2.key-signature", "t.g2.scale-gap", "t.g2.key-facts"],
  "o-g2-09": ["t.g2.scale-build-minor", "t.g2.key-signature", "t.g2.key-facts", "t.g2.minor-facts", "t.g2.scale-gap"],
  "o-g2-10": ["t.g2.tonic-triad", "t.g2.triad-notes"],
  "o-g2-11": ["t.g2.degree", "t.g2.degree-note"],
  "o-g2-12": ["t.g2.interval-number", "t.g2.interval-note", "t.g2.melody-detail"],
  "o-g2-13": ["t.g2.terms", "t.g2.term-use", "t.g2.melody-detail"],
  "o-g1-21": ["t.g2.melody", "t.g2.melody-detail"],
};
const asFile = join(root, "assessments/grade-2.json");
const as = JSON.parse(readFileSync(asFile, "utf8"));
for (const bp of as.assessments) {
  bp.version = 2;
  for (const s of bp.sections) {
    // A unit challenge only draws on what its unit and earlier units taught: the melody templates belong to unit 5.
    if (SECTION_TEMPLATES[s.id]) s.templateIds = SECTION_TEMPLATES[s.id].filter((t) => bp.id === "a.g2" || bp.id === "a.g2-u5" || !/\.melody/.test(t));
    if (bp.id === "a.g2" && s.id.startsWith("o-g2-")) s.itemCount = 2;
  }
  // A unit challenge needs enough questions to be a fair check: at least six.
  if (bp.kind === "unit_challenge" && bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0) < 6) for (const s of bp.sections) s.itemCount = 3;
}
writeFileSync(asFile, JSON.stringify(as, null, 2) + "\n");
console.log("assessments updated to version 2");
