/**
 * Writes the Grade 5 content (Brief 09): path bindings, the 25 lesson files, the derived practice and review bindings, and the unit
 * challenge / Grade assessment blueprints. Run: `npm run author:grade5 -w @mtp/api`. The output files are the source of truth afterwards;
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
import { U1 } from "./grade5/u1.ts";
import { U2 } from "./grade5/u2.ts";
import { U3 } from "./grade5/u3.ts";
import { U4 } from "./grade5/u4.ts";
import { U5 } from "./grade5/u5.ts";
import type { Spec2 } from "./grade2/lib2.ts";
import { mergeScope } from "@mtp/curriculum";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const specs: Spec2[] = [...U1, ...U2, ...U3, ...U4, ...U5];
const isOptional = (node: string) => /-E\d$/.test(node);
const pathFile = join(root, "path/grade-5.json");
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
for (const g of [1, 2, 3, 4, 5]) for (const t of JSON.parse(readFileSync(join(root, `exercises/templates/grade-${g}.json`), "utf8")).templates as Array<{ id: string; scope: Record<string, unknown> }>) templates.set(t.id, t);
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

// 1. Lesson bindings come from the specs, so the path, the lessons and the generated nodes can never drift apart.
for (const spec of specs) {
  const n = byId.get(spec.node);
  if (!n) throw new Error(`Unknown node ${spec.node}`);
  n.exercises = spec.bind.map((b) => ({ templateId: b.t, conceptIds: b.c, scope: stated(b.t, b.scope) }));
  n.contentVersion = spec.version;
  // The Ic-V enrichment uses cadence-key harmony, so it follows the cadence lessons (it was planned after the chord lessons).
  if (spec.node === "G5-U4-E1") (n as Record<string, unknown>).unlockAfter = ["G5-U4-L06"];
  // Optional enrichment nodes name the outcome they relate to (the lesson schema requires one); they are never mastery evidence.
  if (isOptional(spec.node)) n.outcomeIds = [{ "G5-U4-E1": "abrsm2020.g5.09", "G5-U4-E2": "abrsm2020.g5.10", "G5-U5-E1": "abrsm2020.g5.14" }[spec.node]!];
  // The passage lesson was planned without a book section; section 15 ("General Questions") is its model, so it is named for the provenance record.
}
writeFileSync(pathFile, JSON.stringify(path, null, 2) + "\n");

// 2. Build the lessons from the bindings just written.
for (const spec of specs) rmSync(join(root, `lessons/${spec.node}.json`), { force: true });
const a = startAuthoring();
const built = specs.map((spec) => ({ spec, lesson: buildLesson(a, spec) }));
for (const { spec, lesson } of built) {
  const n = byId.get(spec.node)!;
  if (isOptional(spec.node)) {
    // Optional enrichment: the lesson says so, and it never counts towards mastery, a challenge or the assessment.
    (lesson.mastery as { completion: string }).completion = spec.node === "G5-U4-E2" ? "Optional extra practice with approach chords. It is complete when every step has been answered correctly. It is never required and gates no other node; its answers count as practice of choosing chords at cadence points, like any other practice of that concept." : "Optional enrichment. It is complete when every step has been answered correctly. It never counts towards Grade 5 mastery, a unit challenge or the Grade 5 assessment, and it never gates any other node.";
  }
  writeFileSync(join(root, `lessons/${spec.node}.json`), JSON.stringify(lesson, null, 2) + "\n"); // after the optional-node wording is set, so it is what is stored
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
const units = ["G5-U1", "G5-U2", "G5-U3", "G5-U4", "G5-U5"];
const lessonsOf = (u: string) => nodes.filter((n) => n.unitId === u && n.type === "lesson");
const keepMelodies = (nodes.find((n) => n.id === "G5-U5-R1")!.exercises as Binding[]).filter((b) => /^t\.g([123]\.melody|4\.passage)$/.test(b.templateId));
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
//    from a challenge whose unit comes before the unit that first teaches it). The optional enrichment templates (Ic-V, SATB) appear nowhere here; the approach chord is compulsory (review of PR #13).
const SECTION_TEMPLATES: Record<string, string[]> = {
  "o-g5-01": ["t.g5.time-signature", "t.g5.metre-facts", "t.g5.irregular-grouping", "t.g5.grouping-judge", "t.g5.bar-complete", "t.g5.metre-mixed", "t.g5.rest-judge", "t.g5.duration-facts"],
  "o-g5-02": ["t.g5.irregular-division", "t.g5.division-facts", "t.g5.division-write"],
  "o-g5-03": ["t.g5.tenor-read", "t.g5.tenor-write", "t.g5.tenor-facts"],
  "o-g5-04": ["t.g5.four-clef-read", "t.g5.same-pitch", "t.g5.key-signature", "t.g5.clef-minor"],
  "o-g5-05": ["t.g5.octave-transpose", "t.g5.clef-position"],
  "o-g5-06": ["t.g5.instrument-transpose", "t.g5.concert-facts", "t.g5.transpose-key", "t.g5.transpose-judge"],
  "o-g5-07": ["t.g5.scale-build", "t.g5.key-signature", "t.g5.key-facts", "t.g5.scale-spot"],
  "o-g5-08": ["t.g5.interval-any", "t.g5.interval-write", "t.g5.interval-compound", "t.g5.interval-facts", "t.g5.compound-facts"],
  "o-g5-09": ["t.g5.chord-identify", "t.g5.chord-build", "t.g5.inversion-facts", "t.g5.supertonic-facts", "t.g5.chord-in-passage"],
  "o-g5-10": ["t.g5.cadence-chords", "t.g5.approach-chord"],
  "o-g5-11": ["t.g5.cadence-identify", "t.g5.cadence-find", "t.g5.cadence-facts", "t.g5.cadence-chords"],
  "o-g5-12": ["t.g5.terms", "t.g5.term-use"],
  "o-g5-13": ["t.g5.ornament-replace", "t.g5.ornament-facts"],
  "o-g5-14": ["t.g5.voices"],
  "o-g5-15": ["t.g5.instruments", "t.g5.instrument-sound"],
  "o-g5-16": ["t.g5.score"],
  "o-g1-21": ["t.g5.score"],
};
/** In the Grade assessment the skills that are CONSTRUCTED (transposing, scales, intervals, chords, cadences) are asked by construction or in a real passage, not by facts alone. */
const FINAL_ONLY: Record<string, string[]> = {
  "o-g5-06": ["t.g5.instrument-transpose", "t.g5.transpose-key"],
  "o-g5-07": ["t.g5.scale-build", "t.g5.key-signature"],
  "o-g5-08": ["t.g5.interval-any", "t.g5.interval-write", "t.g5.interval-compound"],
  "o-g5-09": ["t.g5.chord-identify", "t.g5.chord-build", "t.g5.chord-in-passage"],
  "o-g5-11": ["t.g5.cadence-identify", "t.g5.cadence-find"],
};
const firstUnit = new Map<string, number>();
units.forEach((u, k) => lessonsOf(u).forEach((l) => l.exercises.forEach((b) => { if (!firstUnit.has(b.templateId)) firstUnit.set(b.templateId, k); })));
const asFile = join(root, "assessments/grade-5.json");
const as = JSON.parse(readFileSync(asFile, "utf8"));
/** The seven earlier-grade questions of the Grade 5 assessment: Grade 4 templates, one outcome each. A run can pass only with Grade 5 evidence (asserted below). */
const EARLIER = {
  id: "earlier-grades",
  title: "Earlier grades (cumulative)",
  outcomeIds: ["abrsm2020.g4.01", "abrsm2020.g4.07", "abrsm2020.g4.12", "abrsm2020.g4.13", "abrsm2020.g4.15", "abrsm2020.g4.17", "abrsm2020.g4.18"],
  templateIds: ["t.g4.time-signature", "t.g4.regular-grouping", "t.g4.octave-transpose-alto", "t.g4.chromatic-scale", "t.g4.interval-diatonic", "t.g4.chord-in-passage", "t.g4.ornament-name", "t.g4.instruments", "t.g4.passage"],
  itemCount: 7,
};
// The planned sizes were 4, 6, 8, 6 and 12 questions. Unit 1 (two outcomes) is raised from 4 to 6 so that every outcome of a challenge has at least three questions behind it and a pass needs five of six, not three of four (see the audit, section 2); the rest are kept.
const EXPECT: Record<string, number> = { "a.g5-u1": 6, "a.g5-u2": 6, "a.g5-u3": 8, "a.g5-u4": 6, "a.g5-u5": 12, "a.g5": 39 };
for (const bp of as.assessments) {
  const unitIndex = bp.kind === "unit_challenge" ? units.indexOf(String(bp.unitId)) : 99;
  for (const s of bp.sections) {
    if (SECTION_TEMPLATES[s.id]) s.templateIds = (bp.id === "a.g5" && FINAL_ONLY[s.id] ? FINAL_ONLY[s.id]! : SECTION_TEMPLATES[s.id]!).filter((t) => (firstUnit.get(t) ?? 0) <= unitIndex);
    if (bp.id === "a.g5" && s.id.startsWith("o-g5-")) s.itemCount = 2;
    if (bp.id === "a.g5-u1") s.itemCount = 3;
  }
  // Idempotent: the earlier-grade section is replaced, never appended to; ids must stay unique.
  if (bp.id === "a.g5") bp.sections = [...bp.sections.filter((s: { id: string }) => s.id !== EARLIER.id), { ...EARLIER }];
  if (new Set(bp.sections.map((s: { id: string }) => s.id)).size !== bp.sections.length) throw new Error(`${bp.id} has duplicate section ids`);
  for (const s of bp.sections) if (!s.templateIds.length) throw new Error(`${bp.id}/${s.id} has no templates`);
  for (const s of bp.sections) for (const t of s.templateIds as string[]) if (/satb|six-four/.test(t)) throw new Error(`${bp.id} must never contain an optional enrichment template (${t})`);
  const total = bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0);
  if (total !== EXPECT[bp.id]) throw new Error(`${bp.id} has ${total} questions, expected exactly ${EXPECT[bp.id]}`);
  if (bp.kind === "unit_challenge" && total < 6) throw new Error(`${bp.id} has too few questions to be a fair check`);
}
// The Grade 5 assessment must not be passable on earlier-grade evidence: even with every earlier question right, the pass mark needs Grade 5 answers.
{
  const bp = as.assessments.find((x: { id: string }) => x.id === "a.g5");
  const earlier = bp.sections.find((s: { id: string }) => s.id === EARLIER.id).itemCount as number;
  const total = bp.sections.reduce((n: number, s: { itemCount: number }) => n + s.itemCount, 0) as number;
  const passPercent = JSON.parse(readFileSync(join(root, "policy/progression.json"), "utf8")).assessments.gradePassPercent as number;
  const need = Math.ceil((total * passPercent) / 100);
  if (earlier >= need / 2) throw new Error("earlier-grade questions could decide the Grade 5 assessment");
  console.log(`Grade 5 assessment: ${total} questions (${total - earlier} Grade 5, ${earlier} earlier), pass mark ${passPercent}% = ${need} right, so at least ${need - earlier} must be Grade 5 answers`);
}
writeFileSync(asFile, JSON.stringify(as, null, 2) + "\n");
console.log("assessments updated");
