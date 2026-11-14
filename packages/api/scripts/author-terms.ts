/**
 * Terminology completion (Grades 2-4): writes the templates, concepts, concept boundaries, path nodes, bindings, blueprint entries and
 * the eleven lessons. Run: `npm run author:terms -w @mtp/api`.
 *
 * ADDITIVE AND IDEMPOTENT. Nothing that already exists is rewritten except by appending: no existing template, concept, lesson, question
 * or lesson binding is touched, so every stored question identity, completion and mastery row stays valid. Every section this script
 * owns is replaced by id (never appended twice); a test runs the script twice and compares the files.
 *
 * What it writes
 *   exercises/templates/grade-{2,3,4}.json   t.gN.book-terms and t.gN.book-use (new ids, VOCAB_BOOK in their fingerprint only)
 *   concepts/grade-{2,3,4}.json              one concept per lesson (c.terms.g2-link ...), each with a `termIds` boundary
 *   policy/review-constraints.json           the boundary of each new concept: the terms it teaches
 *   path/grade-{2,3,4}.json                  the new lesson nodes, inserted after the grade's existing terms lesson (one unbroken chain)
 *   path/grade-*.json (practice and review)  the new templates, appended to every node that already revises the grade's terms
 *   assessments/grade-*.json                 the new templates, appended to every section that already lists the grade's terms
 *                                            (item counts are unchanged, so pass marks and exact ratios are unchanged)
 *   lessons/G{2,3,4}-U5-L*.json              the eleven lessons; their questions are picked from the generators and frozen
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { music } from "@mtp/curriculum";
import type { ExerciseItem } from "@mtp/curriculum";
import { buildLesson, melody, startAuthoring, type Block } from "./grade1/lib.ts";
import type { Spec2 } from "./grade2/lib2.ts";
import { COPY } from "./terms-book/lessons.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const rd = (f: string) => JSON.parse(readFileSync(join(root, f), "utf8"));
const wr = (f: string, v: unknown) => writeFileSync(join(root, f), JSON.stringify(v, null, 2) + "\n");

type Json = Record<string, unknown>;
type Binding = { templateId: string; conceptIds: string[]; scope: Json };
type PathNode = Json & { id: string; type: string; exercises?: Binding[]; contentVersion?: number };

const OUTCOME: Record<number, string> = { 2: "abrsm2020.g2.13", 3: "abrsm2020.g3.12", 4: "abrsm2020.g4.16" };
const SECTION: Record<number, string> = { 2: "fs.g2.s14", 3: "fs.g3.s12", 4: "fs.g4.s15" };
const ANCHOR: Record<number, string> = { 2: "G2-U5-L03", 3: "G3-U5-L03", 4: "G4-U5-L04" };
const PRIOR_CONCEPT: Record<number, string> = { 2: "c.terms.g2-signs", 3: "c.terms.g3", 4: "c.terms.g4" };
const grades = [2, 3, 4] as const;
/**
 * Versions on the tree before this work (PR #13 head). A node or blueprint that gains the new templates is set to exactly base + 1, not
 * incremented, so re-running this script (or running it after an `author:gradeN` script, which rewrites those nodes) never drifts.
 */
const BASE_NODE_VERSION: Record<string, number> = { "G2-U5-P1": 1, "G2-U5-R1": 1, "G3-U1-R1": 1, "G3-U5-P1": 1, "G3-U5-R1": 1, "G4-U1-R1": 1, "G4-U5-P1": 1, "G4-U5-R1": 1, "G5-U1-R1": 1 };
const BASE_BLUEPRINT_VERSION: Record<string, number> = { "a.g2": 2, "a.g2-u5": 2, "a.g3": 2, "a.g3-u5": 2, "a.g4": 1, "a.g4-u5": 1 };
const conceptsOf = (g: number) => music.BOOK_LESSONS.filter((l) => l.grade === g).map((l) => l.conceptId);
const term = (id: string) => music.TERMS_BOOK.find((x) => x.id === id);
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

// ---- 1. templates ---------------------------------------------------------------------------------------------------------------------
const templateOf = (g: number, kind: "terms" | "use", scope: Json): Json => ({
  id: `t.g${g}.book-${kind}`,
  version: 1,
  familyId: "fam.choice",
  grade: g,
  mode: "identify",
  outcomeIds: [OUTCOME[g]],
  conceptIds: conceptsOf(g),
  promptPattern: kind === "terms" ? "What does {term} mean? Which word means this? What does this direction mean?" : "Which marking fits this description? What does this marking ask the player to do? Which sign is on these notes?",
  scope,
  acceptance: { spellingSensitive: false, octaveSensitive: false, enharmonicPolicy: "not-applicable", multipleValidAnswers: false, alternativesNote: "One option is correct. Wrong options never share a group or a meaning with it, and never come from a class of words that could also fit." },
  ambiguityChecks: [
    "Speed words never sit beside speed words, mood words only beside moods of another pole, and touch signs only beside other kinds of word.",
    "A wrong option only ever shows a word that this lesson or an earlier one has taught (VOCAB_BOOK, OPEN_QUESTIONS Q2 and Q38).",
  ],
  hints: [kind === "terms" ? "Use what the lesson told you about the word." : "Think about what the marking asks the player to do."],
  extraMistakeCategories: [],
  difficulty: kind === "terms" ? 1 : 3,
  qa: { status: "draft", reviewRequirements: ["Qualified music teacher reviews a seeded sample of at least 20 generated items.", "Golden answer fixtures pass in the engine."], reviewedBy: null },
});

const useScope: Record<number, Json> = {};
for (const g of grades) {
  const file = `exercises/templates/grade-${g}.json`;
  const doc = rd(file);
  const termUse = (doc.templates as Json[]).find((t) => t.id === `t.g${g}.term-use`)!;
  // the same music scope as the grade's existing term-use template, so a marked melody uses only what the grade has taught
  useScope[g] = { ...(termUse.scope as Json) };
  const ids = new Set([`t.g${g}.book-terms`, `t.g${g}.book-use`]);
  doc.templates = [...(doc.templates as Json[]).filter((t) => !ids.has(t.id as string)), templateOf(g, "terms", {}), templateOf(g, "use", useScope[g]!)];
  wr(file, doc);
}

// ---- 2. concepts and boundaries ---------------------------------------------------------------------------------------------------------
for (const g of grades) {
  const file = `concepts/grade-${g}.json`;
  const doc = rd(file);
  const mine = music.BOOK_LESSONS.filter((l) => l.grade === g);
  const ids = new Set(mine.map((l) => l.conceptId));
  const fresh = mine.map((l, i) => ({
    id: l.conceptId,
    grade: g,
    domain: "terms",
    title: l.title,
    summary: `The Grade ${g} terms and signs of the lesson “${l.title}”.`,
    prerequisiteIds: [i === 0 ? PRIOR_CONCEPT[g] : mine[i - 1]!.conceptId],
    rulesetIds: ["rules.vocabulary.terms"],
    status: "core",
    outcomeIds: [OUTCOME[g]],
  }));
  doc.concepts = [...(doc.concepts as Json[]).filter((c) => !ids.has(c.id as string)), ...fresh];
  wr(file, doc);
}
{
  const doc = rd("policy/review-constraints.json");
  const own = new Set(music.BOOK_LESSONS.map((l) => l.conceptId));
  doc.constraints = [...(doc.constraints as Json[]).filter((c) => !own.has(c.conceptId as string)), ...music.BOOK_LESSONS.map((l) => ({ conceptId: l.conceptId, termIds: l.termIds }))];
  wr("policy/review-constraints.json", doc);
}

// ---- 3. path: lesson nodes, then bindings on the nodes that revise the grade's terms ------------------------------------------------------
const lessonBindings = (l: music.BookLesson): Binding[] => [
  { templateId: `t.g${l.grade}.book-terms`, conceptIds: [l.conceptId], scope: {} },
  { templateId: `t.g${l.grade}.book-use`, conceptIds: [l.conceptId], scope: { ...useScope[l.grade]! } },
];
const changed = new Set<string>();
for (const g of grades) {
  const file = `path/grade-${g}.json`;
  const doc = rd(file);
  const nodes = doc.nodes as PathNode[];
  const mine = music.BOOK_LESSONS.filter((l) => l.grade === g);
  const ids = new Set(mine.map((l) => l.node));
  const keep = new Map(nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, n]));
  const base = nodes.filter((n) => !ids.has(n.id));
  const at = base.findIndex((n) => n.id === ANCHOR[g]);
  if (at < 0) throw new Error(`anchor ${ANCHOR[g]} not found`);
  const fresh = mine.map((l) => ({
    id: l.node,
    type: "lesson",
    unitId: `G${g}-U5`,
    title: l.title,
    objective: COPY.find((c) => c.node === l.node)!.objective,
    conceptIds: [l.conceptId],
    outcomeIds: [OUTCOME[g]],
    reviewOutcomeIds: [],
    exercises: lessonBindings(l),
    optional: false,
    estimatedMinutes: 6,
    contentVersion: 1,
    contentStatus: "draft",
    bookSectionIds: [SECTION[g]],
    ...(keep.get(l.node)?.contentRef ? { contentRef: keep.get(l.node)!.contentRef } : {}),
  }));
  doc.nodes = [...base.slice(0, at + 1), ...fresh, ...base.slice(at + 1)];
  wr(file, doc);
}
// every practice or review node that revises a grade's existing terms revises the new terms too (cumulative revision)
for (const g of [1, 2, 3, 4, 5]) {
  const file = `path/grade-${g}.json`;
  const doc = rd(file);
  let touched = false;
  for (const n of doc.nodes as PathNode[]) {
    if (n.type !== "practice" && n.type !== "review") continue;
    for (const gr of grades) {
      const old = (n.exercises ?? []).find((b) => b.templateId === `t.g${gr}.terms`);
      if (!old) continue;
      const wanted: Binding[] = [
        { templateId: `t.g${gr}.book-terms`, conceptIds: conceptsOf(gr), scope: {} },
        { templateId: `t.g${gr}.book-use`, conceptIds: conceptsOf(gr), scope: { ...useScope[gr]! } },
      ];
      const have = new Set((n.exercises ?? []).map((b) => b.templateId));
      const add = wanted.filter((b) => !have.has(b.templateId));
      if (add.length) {
        n.exercises = [...(n.exercises ?? []), ...add];
        touched = true;
        changed.add(n.id);
      }
      const base = BASE_NODE_VERSION[n.id];
      if (base === undefined) throw new Error(`${n.id} revises terms but has no recorded base version`);
      if (n.contentVersion !== base + 1) {
        n.contentVersion = base + 1;
        touched = true;
        changed.add(n.id);
      }
    }
  }
  if (touched) wr(file, doc);
}

// ---- 4. blueprints: the new templates join every section that lists the grade's terms (item counts unchanged) ------------------------------
for (const g of [1, 2, 3, 4, 5]) {
  const file = `assessments/grade-${g}.json`;
  const doc = rd(file);
  let touched = false;
  for (const a of doc.assessments as Json[]) {
    let has = false;
    for (const s of a.sections as Json[]) {
      const ids = s.templateIds as string[];
      for (const gr of grades) {
        if (!ids.includes(`t.g${gr}.terms`)) continue;
        for (const t of [`t.g${gr}.book-terms`, `t.g${gr}.book-use`]) if (!ids.includes(t)) { ids.push(t); touched = true; changed.add(a.id as string); }
        has = true;
      }
    }
    if (has) {
      const base = BASE_BLUEPRINT_VERSION[a.id as string];
      if (base === undefined) throw new Error(`${a.id as string} lists terms but has no recorded base version`);
      if (a.version !== base + 1) { a.version = base + 1; touched = true; changed.add(a.id as string); }
    }
  }
  if (touched) wr(file, doc);
}

// ---- 5. lessons -------------------------------------------------------------------------------------------------------------------------
const tgt = (id: string) => (i: ExerciseItem) => (i.answer as { correctOptionIds?: string[] }).correctOptionIds?.[0] === id;
const usable = (id: string) => { const x = term(id); return id === "staccatissimo" || Boolean(x && (x.character || x.mark || x.phrases?.length)); };
const meaningLine = (id: string): string => {
  const x = term(id)!;
  const name = x.term.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return x.cls === "touch" || x.cls === "mark" ? `${cap(name)}: ${x.meaning}.` : `“${name}” means ${x.meaning}.`;
};
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const specs: Spec2[] = music.BOOK_LESSONS.map((l) => {
  const copy = COPY.find((c) => c.node === l.node)!;
  const T = `t.g${l.grade}.book-terms`;
  const U = `t.g${l.grade}.book-use`;
  const explain: Block[] = [{ text: copy.intro }];
  if (l.node !== "G2-U5-L08") for (const c of chunk(l.termIds.map(meaningLine), 4)) explain.push({ text: c.join(" ") });
  if (copy.usage) explain.push({ text: copy.usage });
  if (copy.extra) explain.push({ text: copy.extra });
  const exampleMusic = l.node === "G2-U5-L08"
    ? melody("treble", [[["G4", "crotchet", { art: "strong-accent" }], ["A4", "crotchet"], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", copy.example.text)
    : melody("treble", [[["G4", "crotchet"], ["A4", "crotchet"], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", copy.example.text, { tempoText: copy.example.tempo });
  explain.push({ music: exampleMusic, caption: copy.example.caption });
  explain.push({ tip: copy.tip });
  while (explain.length > 6) {
    const i = explain.findIndex((b, k) => "text" in b && k > 0 && "text" in explain[k - 1]!);
    if (i < 0) throw new Error(`${l.node}: too many blocks`);
    explain.splice(i - 1, 2, { text: `${(explain[i - 1] as { text: string }).text} ${(explain[i] as { text: string }).text}` });
  }
  const demoMusic = l.node === "G2-U5-L08"
    ? melody("treble", [[["G4", "crotchet"], ["A4", "crotchet", { art: "staccatissimo" }], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", copy.demo.text)
    : melody("treble", [[["G4", "crotchet"], ["A4", "crotchet"], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", copy.demo.text, { tempoText: copy.demo.tempo });
  // picks: each term in turn, alternating recognition and use where the term has a description, phrase or sign
  const k = l.termIds.length;
  const total = k >= 6 ? k : 6;
  const pairs = Array.from({ length: Math.max(total, k === 2 ? 4 : 0) }, (_, i) => {
    const id = l.termIds[i % k]!;
    const wantUse = (i + Math.floor(i / k)) % 2 === 1;
    return { id, t: wantUse && usable(id) ? U : T };
  });
  const pick = (p: { id: string; t: string }) => {
    const x = term(p.id);
    if (!x) return { t: p.t, when: tgt(p.id), correct: "Correct: a wedge means staccatissimo, as short as possible." };
    const name = x.term.replace(/\s*\(.*?\)\s*/g, " ").trim();
    return { t: p.t, when: tgt(p.id), correct: x.cls === "touch" || x.cls === "mark" ? `Correct: ${name}: ${x.meaning}.` : `Correct: ${name} means ${x.meaning}.` };
  };
  const guided = [pairs[0]!, { id: l.termIds[Math.min(1, k - 1)]!, t: usable(l.termIds[Math.min(1, k - 1)]!) ? U : T }, { id: l.termIds[Math.min(2, k - 1)]!, t: T }].map(pick);
  return {
    node: l.node,
    version: 1,
    bind: lessonBindings(l).map((b) => ({ t: b.templateId, c: b.conceptIds, scope: b.scope })),
    objective: { statement: copy.objective, criteria: copy.criteria },
    explain,
    demo: { widget: "score", music: demoMusic, steps: copy.demo.steps, text: copy.demo.text },
    guided,
    independent: pairs.map(pick),
    recap: copy.recap,
    review: [{ t: T, afterDays: 1 }, { t: U, afterDays: 3 }, { t: T, afterDays: 7 }],
    notes: copy.notes,
  } as Spec2;
});

for (const l of music.BOOK_LESSONS) rmSync(join(root, `lessons/${l.node}.json`), { force: true });
const author = startAuthoring();
const built = specs.map((spec) => ({ spec, lesson: buildLesson(author, spec) }));
for (const g of grades) {
  const file = `path/grade-${g}.json`;
  const doc = rd(file);
  for (const { spec, lesson } of built.filter((x) => x.spec.node.startsWith(`G${g}-`))) {
    const n = (doc.nodes as PathNode[]).find((x) => x.id === spec.node)!;
    writeFileSync(join(root, `lessons/${spec.node}.json`), JSON.stringify(lesson, null, 2) + "\n");
    n.contentRef = `lessons/${spec.node}.json`;
    n.contentStatus = "draft";
    console.log(`wrote ${spec.node}: ${lesson.guided.length} guided, ${lesson.independent.length} independent`);
  }
  wr(file, doc);
}
console.log(`updated nodes and blueprints: ${[...changed].sort().join(", ") || "(none: already current)"}`);
