/**
 * Writes the Grade 3 content (Brief 07): path bindings, the 19 lesson files, the optional upbeat enrichment, the derived practice and
 * review bindings, and the unit challenge / Grade assessment blueprints (version 2). Run: `npm run author:grade3 -w @mtp/api`.
 * The output files are the source of truth afterwards; re-running regenerates them deterministically.
 *
 * Same pipeline as Grades 1 and 2 (author-grade1.ts, author-grade2.ts): lessons are compact specs, their questions are PICKED from the
 * generators inside each lesson's own taught scope and FROZEN as fixed items with stable ids.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLesson, startAuthoring } from "./grade1/lib.ts";
import { U1 } from "./grade3/u1.ts";
import { U2 } from "./grade3/u2.ts";
import { U3 } from "./grade3/u3.ts";
import { U4 } from "./grade3/u4.ts";
import { U5 } from "./grade3/u5.ts";
import { enrichment } from "./grade3/e1.ts";
import type { Spec2 } from "./grade2/lib2.ts";
import { mergeScope } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec2[] = [...U1, ...U2, ...U3, ...U4, ...U5];
const pathFile = join(root, "path/grade-3.json");
const path = JSON.parse(readFileSync(pathFile, "utf8"));
type Binding = { templateId: string; conceptIds: string[]; scope: Record<string, unknown> };
type PathNode = Record<string, unknown> & { id: string; type: string; unitId: string | null; exercises: Binding[]; contentStatus: string };
const nodes = path.nodes as PathNode[];
const byId = new Map(nodes.map((n) => [n.id, n]));
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// Every binding must state its narrowing of every dimension its template lists (BINDING_SCOPE_IMPLICIT): an unstated one is "none".
const templates = new Map<string, { scope: Record<string, unknown> }>();
for (const g of [1, 2, 3]) for (const t of JSON.parse(readFileSync(join(root, `exercises/templates/grade-${g}.json`), "utf8")).templates as Array<{ id: string; scope: Record<string, unknown> }>) templates.set(t.id, t);
const stated = (templateId: string, scope: Record<string, unknown>) => {
  const out = clean(scope);
  for (const [k, v] of Object.entries(templates.get(templateId)?.scope ?? {})) if (!(k in out)) out[k] = Array.isArray(v) ? [] : typeof v === "number" ? 0 : typeof v === "boolean" ? false : v;
  return out;
};

/**
 * The lesson schema allows at most six explanation blocks. Specs are written freely and fitted here, in a fixed order that loses the
 * least: adjacent text blocks are joined; the closing tip is folded into the last text block; if the lesson is still too long, the
 * last notation example (never the first) is dropped and the dropped caption is logged so the author can see it.
 */
type Blk = { text: string } | { tip: string } | { music: unknown; caption: string };
function fit(spec: Spec2): void {
  const b = [...(spec.explain as Blk[])];
  const mergeText = () => {
    for (let i = b.length - 1; i > 0; i--) {
      const x = b[i]!;
      const y = b[i - 1]!;
      if ("text" in x && "text" in y) { b.splice(i - 1, 2, { text: `${y.text} ${x.text}` }); return true; }
    }
    return false;
  };
  const foldTip = () => {
    const tip = b.findIndex((x) => "tip" in x);
    const lastText = b.map((x, i) => ("text" in x ? i : -1)).filter((i) => i >= 0).pop();
    if (tip < 0 || lastText === undefined) return false;
    b[lastText] = { text: `${(b[lastText] as { text: string }).text} ${(b[tip] as { tip: string }).tip}` };
    b.splice(tip, 1);
    return true;
  };
  const dropExample = () => {
    const notes = b.map((x, i) => ("music" in x ? i : -1)).filter((i) => i >= 0);
    if (notes.length < 2) return false;
    const at = notes[notes.length - 1]!;
    console.log(`  (${spec.node}: dropped example "${(b[at] as { caption: string }).caption}")`);
    b.splice(at, 1);
    return true;
  };
  while (b.length > 6 && (mergeText() || foldTip() || dropExample()));
  spec.explain = b as never;
}
for (const spec of [...U1, ...U2, ...U3, ...U4, ...U5]) fit(spec);

// 0. Grade 4's planned review binds three Brief 01 Grade 3 templates, which gained dimensions in Brief 07 (a binding must state them all).
{
  const g4File = join(root, "path/grade-4.json");
  const g4 = JSON.parse(readFileSync(g4File, "utf8"));
  let changed = 0;
  for (const n of g4.nodes as Array<{ exercises?: Binding[] }>)
    for (const b of n.exercises ?? [])
      if (["t.g3.time-signature", "t.g3.bar-complete", "t.g3.compound-grouping"].includes(b.templateId)) {
        const full = { noteValues: ["minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"], maxDots: 1, rests: true, ...(b.templateId === "t.g3.time-signature" ? {} : { ties: true }) };
        const next = { ...full, ...b.scope };
        if (JSON.stringify(next) !== JSON.stringify(b.scope)) { b.scope = next; changed++; }
      }
  if (changed) writeFileSync(g4File, JSON.stringify(g4, null, 2) + "\n");
}

// 1. Lesson bindings come from the specs, so the path, the lessons and the generated nodes can never drift apart.
for (const spec of specs) {
  const n = byId.get(spec.node);
  if (!n) throw new Error(`Unknown node ${spec.node}`);
  n.exercises = spec.bind.map((b) => ({ templateId: b.t, conceptIds: b.c, scope: stated(b.t, b.scope) }));
  n.contentVersion = spec.version;
}
const E1_BINDING = { templateId: "t.g3.upbeat-facts", conceptIds: ["c.metre.anacrusis"], scope: { timeSignatures: ["2/4", "3/4", "4/4", "6/8"] } };
{
  // The optional enrichment's binding is written first so the intermediate path file always validates.
  const n = byId.get("G3-U2-E1")!;
  n.outcomeIds = ["abrsm2020.g3.02"];
  n.exercises = [{ ...E1_BINDING, scope: stated("t.g3.upbeat-facts", E1_BINDING.scope) }];
}
// The planned Grade 2 foundations of review 1: two Grade 2 templates had ambiguity problems found in Grade 2's review and were replaced there.
{
  const r1 = byId.get("G3-U1-R1")!;
  const swap: Record<string, string> = { "t.g2.time-signature": "t.g2.time-sig-read", "t.g2.ledger-write": "t.g2.ledger-place" };
  r1.exercises = r1.exercises.map((b) => (swap[b.templateId] ? { ...b, templateId: swap[b.templateId]!, scope: stated(swap[b.templateId]!, b.scope) } : b));
}
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 2. Build the lessons from the bindings just written.
for (const spec of specs) rmSync(join(root, `lessons/${spec.node}.json`), { force: true });
rmSync(join(root, "lessons/G3-U2-E1.json"), { force: true });
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
writeFileSync(join(root, "lessons/G3-U2-E1.json"), JSON.stringify(e1, null, 2) + "\n");
{
  const n = byId.get("G3-U2-E1")!;
  n.contentRef = "lessons/G3-U2-E1.json";
  n.contentStatus = "draft";
  n.contentVersion = e1.contentVersion;
  console.log("wrote G3-U2-E1 (optional enrichment)");
}

// 3. Practice, review, challenge and assessment nodes are built by the server from bindings/blueprints.
//    A unit's practice revisits exactly what its lessons taught; unit k's review revisits the units before it (the first unit's review
//    keeps its planned Grade 2 foundations); the last review also keeps the Grade 1 and 2 melody bindings it was planned with.
const merge = (list: Binding[]): Binding[] => {
  const out = new Map<string, Binding>();
  for (const b of list) {
    const cur = out.get(b.templateId);
    out.set(b.templateId, cur ? { templateId: b.templateId, conceptIds: [...new Set([...cur.conceptIds, ...b.conceptIds])], scope: mergeScope(cur.scope as never, b.scope as never) as Record<string, unknown> } : { ...b, conceptIds: [...b.conceptIds], scope: { ...b.scope } });
  }
  return [...out.values()];
};
const units = ["G3-U1", "G3-U2", "G3-U3", "G3-U4", "G3-U5"];
const lessonsOf = (u: string) => nodes.filter((n) => n.unitId === u && n.type === "lesson");
const keepMelodies = (nodes.find((n) => n.id === "G3-U5-R1")!.exercises as Binding[]).filter((b) => b.templateId === "t.g1.melody" || b.templateId === "t.g2.melody");
units.forEach((u, k) => {
  for (const n of nodes.filter((x) => x.unitId === u)) {
    if (n.type === "practice") { n.exercises = merge(lessonsOf(u).flatMap((l) => l.exercises)); n.contentStatus = "draft"; }
    if (n.type === "review") {
      if (k > 0) n.exercises = [...merge(units.slice(0, k === 4 ? 5 : k).flatMap((x) => lessonsOf(x).flatMap((l) => l.exercises))), ...(k === 4 ? keepMelodies : [])];
      n.contentStatus = "draft";
    }
    if (n.type === "unit_challenge") n.contentStatus = "draft";
  }
});
const assessment = nodes.find((n) => n.type === "grade_assessment")!;
assessment.contentStatus = "draft";
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 4. Blueprints (version 2): sections keep their outcomes; the template lists gain the Brief 07 templates so every outcome can be
//    asked in more than one way. A section only ever draws from what has been taught, and a unit challenge only from its own unit
//    and earlier ones (a template is dropped from a challenge whose unit comes before the unit that first teaches it).
const SECTION_TEMPLATES: Record<string, string[]> = {
  "o-g3-01": ["t.g3.time-signature", "t.g3.compound-facts", "t.g3.triplet-compare", "t.g3.triplet-bar", "t.g3.bar-complete"],
  "o-g3-02": ["t.g3.bar-complete", "t.g3.compound-grouping", "t.g3.compound-judge", "t.g3.compound-rest-judge", "t.g3.compound-rest-write", "t.g3.demisemi-judge", "t.g3.demisemi-regroup"],
  "o-g3-03": ["t.g3.demisemiquaver", "t.g3.demisemi-facts", "t.g3.demisemi-judge", "t.g3.demisemi-regroup"],
  "o-g3-04": ["t.g3.ledger-read", "t.g3.ledger-place", "t.g3.ledger-count"],
  "o-g3-04b": ["t.g3.octave-sign", "t.g3.octave-sound"],
  "o-g3-05": ["t.g3.octave-transpose", "t.g3.octave-pick"],
  "o-g3-06": ["t.g3.scale-build-major", "t.g3.key-signature", "t.g3.key-facts", "t.g3.scale-gap"],
  "o-g3-07": ["t.g3.scale-build-minor", "t.g3.key-signature", "t.g3.key-facts", "t.g3.scale-gap"],
  "o-g3-08": ["t.g3.minor-forms", "t.g3.scale-gap", "t.g3.scale-build-minor"],
  "o-g3-09": ["t.g3.tonic-triad", "t.g3.triad-notes"],
  "o-g3-10": ["t.g3.degree", "t.g3.degree-note"],
  "o-g3-11": ["t.g3.interval-quality", "t.g3.interval-name", "t.g3.interval-facts"],
  "o-g3-12": ["t.g3.terms", "t.g3.term-use"],
  "o-g1-21": ["t.g3.melody", "t.g3.melody-detail"],
};
const firstUnit = new Map<string, number>();
units.forEach((u, k) => lessonsOf(u).forEach((l) => l.exercises.forEach((b) => { if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, k); })));
const asFile = join(root, "assessments/grade-3.json");
const as = JSON.parse(readFileSync(asFile, "utf8"));
const EARLIER = [
  { id: "g2-rhythm", title: "Grade 2 rhythm and metre", outcomeIds: ["abrsm2020.g2.01", "abrsm2020.g2.02", "abrsm2020.g2.03"], templateIds: ["t.g2.time-sig-read", "t.g2.bar-complete", "t.g2.rest-judge", "t.g2.triplet-read", "t.g2.note-grouping"], itemCount: 2 },
  { id: "g2-keys", title: "Grade 2 keys and scales", outcomeIds: ["abrsm2020.g2.08", "abrsm2020.g2.09", "abrsm2020.g2.10", "abrsm2020.g2.11"], templateIds: ["t.g2.scale-build-major", "t.g2.scale-build-minor", "t.g2.key-signature", "t.g2.tonic-triad", "t.g2.degree-note"], itemCount: 2 },
  { id: "g2-terms-melody", title: "Grade 2 terms and melodies", outcomeIds: ["abrsm2020.g2.13", "abrsm2020.g1.21"], templateIds: ["t.g2.terms", "t.g2.melody-detail"], itemCount: 2 },
];
for (const bp of as.assessments) {
  bp.version = 2;
  const unitIndex = bp.kind === "unit_challenge" ? units.indexOf(String(bp.unitId)) : 99;
  // The extended-ledger section asks only about notes beyond the stave; octave signs have their own single question.
  if ((bp.id === "a.g3" || bp.id === "a.g3-u3") && !bp.sections.some((s: { id: string }) => s.id === "o-g3-04b")) {
    const at = bp.sections.findIndex((s: { id: string }) => s.id === "o-g3-04");
    bp.sections.splice(at + 1, 0, { id: "o-g3-04b", title: "abrsm2020.g3.04", outcomeIds: ["abrsm2020.g3.04"], templateIds: [], itemCount: 1 });
  }
  for (const s of bp.sections) {
    if (SECTION_TEMPLATES[s.id]) s.templateIds = SECTION_TEMPLATES[s.id].filter((t) => (firstUnit.get(t) ?? 0) <= unitIndex);
    if (bp.id === "a.g3" && s.id.startsWith("o-g3-")) s.itemCount = s.id === "o-g3-08" ? 3 : 2;
  }
  // Idempotent: every section this script owns is replaced, never appended to ("earlier-grades" is the planned section it supersedes).
  if (bp.id === "a.g3") bp.sections = [...bp.sections.filter((s: { id: string }) => s.id !== "earlier-grades" && !EARLIER.some((e) => e.id === s.id)), ...EARLIER];
  if (new Set(bp.sections.map((s: { id: string }) => s.id)).size !== bp.sections.length) throw new Error(`${bp.id} has duplicate section ids`);
  // A unit challenge needs enough questions to be a fair check: at least six.
  if (bp.kind === "unit_challenge" && bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0) < 6) for (const s of bp.sections) s.itemCount = 3;
  for (const s of bp.sections) if (s.id === "o-g3-04b") s.itemCount = 1;
  for (const s of bp.sections) if (!s.templateIds.length) throw new Error(`${bp.id}/${s.id} has no templates`);
}
writeFileSync(asFile, JSON.stringify(as, null, 2) + "\n");
console.log("assessments updated to version 2");
