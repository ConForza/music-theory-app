/**
 * Writes the Grade 4 content (Brief 08): path bindings, the 25 lesson files, the derived practice and review bindings, and the unit
 * challenge / Grade assessment blueprints. Run: `npm run author:grade4 -w @mtp/api`. The output files are the source of truth afterwards;
 * re-running regenerates them deterministically and IDEMPOTENTLY: every section this script owns is replaced by id (never appended),
 * section ids are asserted unique, and the number of questions of every blueprint is asserted exactly (the Grade 3 PR #11 review found a
 * script that appended sections on every run; a test also runs this script twice and compares the files).
 *
 * Same pipeline as Grades 1-3 (author-grade3.ts): lessons are compact specs, their questions are PICKED from the generators inside each
 * lesson's own taught scope and FROZEN as fixed items with stable ids.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLesson, startAuthoring } from "./grade1/lib.ts";
import { U1 } from "./grade4/u1.ts";
import { U2 } from "./grade4/u2.ts";
import { U3 } from "./grade4/u3.ts";
import { U4 } from "./grade4/u4.ts";
import { U5 } from "./grade4/u5.ts";
import type { Spec2 } from "./grade2/lib2.ts";
import { mergeScope } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec2[] = [...U1, ...U2, ...U3, ...U4, ...U5];
const pathFile = join(root, "path/grade-4.json");
const path = JSON.parse(readFileSync(pathFile, "utf8"));
type Binding = { templateId: string; conceptIds: string[]; scope: Record<string, unknown> };
type PathNode = Record<string, unknown> & { id: string; type: string; unitId: string | null; exercises: Binding[]; contentStatus: string };
const nodes = path.nodes as PathNode[];
const byId = new Map(nodes.map((n) => [n.id, n]));
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// Every binding must state its narrowing of every dimension its template lists (BINDING_SCOPE_IMPLICIT). A dimension a spec does not
// mention is stated as the template's own value (no narrowing); the scope actually used is always this binding intersected with what has
// been taught at the node, so it cannot widen anything.
const templates = new Map<string, { scope: Record<string, unknown> }>();
for (const g of [1, 2, 3, 4]) for (const t of JSON.parse(readFileSync(join(root, `exercises/templates/grade-${g}.json`), "utf8")).templates as Array<{ id: string; scope: Record<string, unknown> }>) templates.set(t.id, t);
const stated = (templateId: string, scope: Record<string, unknown>) => {
  const tpl = templates.get(templateId);
  if (!tpl) throw new Error(`Unknown template ${templateId}`);
  const out = clean(scope);
  // A binding may only narrow dimensions its template lists (BINDING_WIDENS_TEMPLATE); any other dimension keeps the taught level.
  for (const k of Object.keys(out)) if (!(k in tpl.scope)) delete out[k];
  for (const [k, v] of Object.entries(tpl.scope)) if (!(k in out)) out[k] = v;
  return out;
};

/** The lesson schema allows at most six explanation blocks (see author-grade3.ts): join text, fold the tip, drop the last example, and log it. */
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
for (const spec of specs) fit(spec);

// 0. Grade 4's planned review binds three Brief 01 Grade 3 templates, which gained dimensions in Brief 07 (a binding must state them all).
{
  let changed = 0;
  for (const n of nodes)
    for (const b of n.exercises ?? [])
      if (["t.g3.time-signature", "t.g3.bar-complete", "t.g3.compound-grouping"].includes(b.templateId)) {
        const full = { noteValues: ["minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"], maxDots: 1, rests: true, ...(b.templateId === "t.g3.time-signature" ? {} : { ties: true }) };
        const next = { ...full, ...b.scope };
        if (JSON.stringify(next) !== JSON.stringify(b.scope)) { b.scope = next; changed++; }
      }
  if (changed) console.log(`stated Grade 3 dimensions on ${changed} planned review bindings`);
}

// 0b. Grade 5's planned reviews bind Grade 4 templates. A binding must state every dimension its template lists, and Grade 4 templates
//     gained dimensions, so those planned bindings are normalised the same way (nothing else about Grade 5 changes).
{
  const g5File = join(root, "path/grade-5.json");
  const g5 = JSON.parse(readFileSync(g5File, "utf8"));
  let changed = 0;
  for (const n of g5.nodes as Array<{ exercises?: Binding[] }>)
    for (const b of n.exercises ?? [])
      if (b.templateId.startsWith("t.g4.")) {
        const next = stated(b.templateId, b.scope);
        if (JSON.stringify(next) !== JSON.stringify(b.scope)) { b.scope = next; changed++; }
      }
  if (changed) { writeFileSync(g5File, JSON.stringify(g5, null, 2) + "\n"); console.log(`stated dimensions on ${changed} planned Grade 5 review bindings of Grade 4 templates`); }
}

// 1. Lesson bindings come from the specs, so the path, the lessons and the generated nodes can never drift apart.
for (const spec of specs) {
  const n = byId.get(spec.node);
  if (!n) throw new Error(`Unknown node ${spec.node}`);
  n.exercises = spec.bind.map((b) => ({ templateId: b.t, conceptIds: b.c, scope: stated(b.t, b.scope) }));
  n.contentVersion = spec.version;
  // The passage lesson was planned without a book section; section 15 ("General Questions") is its model, so it is named for the provenance record.
  if (spec.node === "G4-U5-L05") n.bookSectionIds = ["fs.g4.s15"];
}
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 2. Build the lessons from the bindings just written.
for (const spec of specs) rmSync(join(root, `lessons/${spec.node}.json`), { force: true });
const a = startAuthoring();
const built = specs.map((spec) => ({ spec, lesson: buildLesson(a, spec) }));
for (const { spec, lesson } of built) {
  writeFileSync(join(root, `lessons/${spec.node}.json`), JSON.stringify(lesson, null, 2) + "\n");
  const n = byId.get(spec.node)!;
  n.contentRef = `lessons/${spec.node}.json`;
  n.contentStatus = "draft";
  console.log(`wrote ${spec.node}: ${lesson.guided.length} guided, ${lesson.independent.length} independent`);
}

// 3. Practice, review, challenge and assessment nodes are built by the server from bindings/blueprints.
//    A unit's practice revisits exactly what its lessons taught; unit k's review revisits the units before it (the first unit's review
//    keeps its planned Grade 3 foundations); the last review also keeps the earlier-grade melody bindings it was planned with.
const merge = (list: Binding[]): Binding[] => {
  const out = new Map<string, Binding>();
  for (const b of list) {
    const cur = out.get(b.templateId);
    out.set(b.templateId, cur ? { templateId: b.templateId, conceptIds: [...new Set([...cur.conceptIds, ...b.conceptIds])], scope: mergeScope(cur.scope as never, b.scope as never) as Record<string, unknown> } : { ...b, conceptIds: [...b.conceptIds], scope: { ...b.scope } });
  }
  return [...out.values()];
};
const units = ["G4-U1", "G4-U2", "G4-U3", "G4-U4", "G4-U5"];
const lessonsOf = (u: string) => nodes.filter((n) => n.unitId === u && n.type === "lesson");
const keepMelodies = (nodes.find((n) => n.id === "G4-U5-R1")!.exercises as Binding[]).filter((b) => /^t\.g[123]\.melody$/.test(b.templateId));
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
nodes.find((n) => n.type === "grade_assessment")!.contentStatus = "draft";
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 4. Blueprints. Sections keep their outcomes; the template lists name every template that can honestly evidence the outcome. A section
//    only ever draws from what has been taught, and a unit challenge only from its own unit and earlier ones (a template is dropped
//    from a challenge whose unit comes before the unit that first teaches it).
const SECTION_TEMPLATES: Record<string, string[]> = {
  "o-g4-01": ["t.g4.time-signature", "t.g4.metre-facts", "t.g4.regular-grouping", "t.g4.grouping-judge"],
  "o-g4-02": ["t.g4.breve-facts", "t.g4.breve-bar", "t.g4.breve-double-dot"],
  "o-g4-03": ["t.g4.double-dot-facts", "t.g4.double-dot-bar", "t.g4.breve-double-dot"],
  "o-g4-04": ["t.g4.duplet", "t.g4.duplet-facts", "t.g4.duplet-read"],
  "o-g4-05": ["t.g4.alto-read", "t.g4.alto-write", "t.g4.alto-facts", "t.g4.key-signature"],
  "o-g4-06": ["t.g4.same-pitch", "t.g4.clef-position"],
  "o-g4-07": ["t.g4.octave-transpose-alto", "t.g4.octave-pick-alto"],
  "o-g4-08": ["t.g4.double-accidental", "t.g4.double-facts", "t.g4.double-name", "t.g4.double-write", "t.g4.double-cancel"],
  "o-g4-09": ["t.g4.enharmonic", "t.g4.enharmonic-letter", "t.g4.enharmonic-pick"],
  "o-g4-10": ["t.g4.scale-build", "t.g4.key-signature", "t.g4.key-facts", "t.g4.scale-spot"],
  "o-g4-11": ["t.g4.technical-names", "t.g4.degree-name"],
  "o-g4-12": ["t.g4.chromatic-scale", "t.g4.chromatic-judge"],
  "o-g4-13": ["t.g4.interval-diatonic", "t.g4.interval-write", "t.g4.interval-facts"],
  "o-g4-14": ["t.g4.primary-triad", "t.g4.triad-notes", "t.g4.triad-id"],
  "o-g4-15": ["t.g4.chord-in-passage", "t.g4.chord-passage-pick", "t.g4.chord-spread", "t.g4.chord-root"],
  "o-g4-16": ["t.g4.terms", "t.g4.term-use", "t.g4.technique-facts", "t.g4.technique-use"],
  "o-g4-17": ["t.g4.ornament-name", "t.g4.ornament-spot", "t.g4.ornament-facts", "t.g4.ornament-bar"],
  "o-g4-18": ["t.g4.instruments", "t.g4.instrument-range", "t.g4.technique-facts", "t.g4.technique-use", "t.g4.passage", "t.g4.passage-directions"],
  "o-g1-21": ["t.g4.passage", "t.g4.passage-directions"],
};
const firstUnit = new Map<string, number>();
units.forEach((u, k) => lessonsOf(u).forEach((l) => l.exercises.forEach((b) => { if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, k); })));
const asFile = join(root, "assessments/grade-4.json");
const as = JSON.parse(readFileSync(asFile, "utf8"));
/** The five earlier-grade questions of the Grade 4 assessment: Grade 3 first (continuity), melodies from Grades 1 and 2. A run can pass only with Grade 4 evidence (asserted below). */
const EARLIER = {
  id: "earlier-grades",
  title: "Earlier grades: Grade 3 and melodies",
  outcomeIds: ["abrsm2020.g3.02", "abrsm2020.g3.05", "abrsm2020.g3.08", "abrsm2020.g3.11", "abrsm2020.g1.21"],
  templateIds: ["t.g1.melody", "t.g2.melody", "t.g3.bar-complete", "t.g3.compound-grouping", "t.g3.octave-transpose", "t.g3.scale-build-minor", "t.g3.interval-quality", "t.g3.melody"],
  itemCount: 5,
};
const EXPECT: Record<string, number> = { "a.g4-u1": 8, "a.g4-u2": 10, "a.g4-u3": 8, "a.g4-u4": 6, "a.g4-u5": 8, "a.g4": 41 };
for (const bp of as.assessments) {
  const unitIndex = bp.kind === "unit_challenge" ? units.indexOf(String(bp.unitId)) : 99;
  for (const s of bp.sections) {
    if (SECTION_TEMPLATES[s.id]) s.templateIds = SECTION_TEMPLATES[s.id]!.filter((t) => (firstUnit.get(t) ?? 0) <= unitIndex);
    if (bp.id === "a.g4" && s.id.startsWith("o-g4-")) s.itemCount = 2;
  }
  // Idempotent: the earlier-grade section is replaced, never appended to; ids must stay unique.
  if (bp.id === "a.g4") bp.sections = [...bp.sections.filter((s: { id: string }) => s.id !== EARLIER.id), { ...EARLIER }];
  if (new Set(bp.sections.map((s: { id: string }) => s.id)).size !== bp.sections.length) throw new Error(`${bp.id} has duplicate section ids`);
  for (const s of bp.sections) if (!s.templateIds.length) throw new Error(`${bp.id}/${s.id} has no templates`);
  const total = bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0);
  if (total !== EXPECT[bp.id]) throw new Error(`${bp.id} has ${total} questions, expected exactly ${EXPECT[bp.id]}`);
  if (bp.kind === "unit_challenge" && total < 6) throw new Error(`${bp.id} has too few questions to be a fair check`);
}
// The Grade 4 assessment must not be passable on earlier-grade evidence: even with every earlier question right, the pass mark needs Grade 4 answers.
{
  const bp = as.assessments.find((x: { id: string }) => x.id === "a.g4");
  const earlier = bp.sections.find((s: { id: string }) => s.id === EARLIER.id).itemCount as number;
  const total = bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0) as number;
  const passPercent = JSON.parse(readFileSync(join(root, "policy/progression.json"), "utf8")).assessments.gradePassPercent as number;
  const need = Math.ceil((total * passPercent) / 100);
  if (earlier >= need / 2) throw new Error("earlier-grade questions could decide the Grade 4 assessment");
  console.log(`Grade 4 assessment: ${total} questions (${total - earlier} Grade 4, ${earlier} earlier), pass mark ${passPercent}% = ${need} right, so at least ${need - earlier} must be Grade 4 answers`);
}
writeFileSync(asFile, JSON.stringify(as, null, 2) + "\n");
console.log("assessments updated");
