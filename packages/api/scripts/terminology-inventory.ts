/**
 * Terminology inventory: classifies every entry of content/source-book/terminology-inventory.json against what the course actually
 * does, from the committed lessons, templates, path and blueprints (never from a hand-kept table).
 *
 * For each entry it reports
 *   vocab     - whether every vocabulary id that covers it exists (and in which list);
 *   taught    - the earliest lesson that teaches it: its name appears in the lesson's explanation text, or a question of the lesson targets it;
 *   practised - a practice or review node, bound to a template that can ask it as the correct answer, would draw it;
 *   assessed  - a unit challenge or grade assessment section lists a template that can ask it, inside what has been taught by that node.
 * and a status: missing | vocab-only | taught-only | practised | assessed.
 *
 * Run: `npx tsx scripts/terminology-inventory.ts [--exclude-book] [--out file.json]`.
 *   --exclude-book   ignores everything added by the terminology completion work (VOCAB_BOOK and the *.book-* templates), which gives
 *                    the "before" figures when run on the final tree. The committed baseline snapshot was produced on the tree before it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveScope, mergeScope, music, type ExerciseItem, type MusicScope, type OrderedNode } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { loadCourse } from "../src/course.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const excludeBook = args.includes("--exclude-book");
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
const SEEDS = 260;

export type Status = "missing" | "vocab-only" | "taught-only" | "practised" | "assessed";
export interface Entry { id: string; headword: string; forms?: string[]; kind: string; language: string; bookGrade: number; section: string; termIds: string[]; partial?: boolean; note?: string }
export interface Row { entry: Entry; vocab: "present" | "partial" | "absent"; taughtAt: string | null; taughtIn: "text" | "question" | null; practisedIn: string[]; assessedIn: string[]; status: Status }

const inventory = JSON.parse(readFileSync(join(root, "content/source-book/terminology-inventory.json"), "utf8")) as { entries: Entry[] };
const course = loadCourse();
const ix = course.ix;
const isNew = (templateId: string) => music.isBookTemplate(templateId);

// ---- vocabulary registry: id -> display strings
const vocab = new Map<string, { names: string[]; list: string }>();
const addVocab = (id: string, names: string[], list: string) => vocab.set(id, { names, list });
for (const x of music.TERMS) addVocab(x.id, [x.term], "TERMS");
for (const x of music.TERMS_G4) addVocab(x.id, [x.term], "TERMS_G4");
for (const x of music.TECHNIQUES_G4) addVocab(x.id, [x.term], "TECHNIQUES_G4");
for (const x of music.TERMS_G5) addVocab(x.id, [x.term], "VOCAB_G5");
for (const o of music.ORNAMENTS) addVocab(`orn:${o}`, [o.replace(/-/g, " ")], "ornaments");
if (!excludeBook) for (const x of music.TERMS_BOOK) addVocab(x.id, [x.term, ...(x.forms ?? [])], "VOCAB_BOOK");

const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
const base = (s: string) => norm(s.replace(/\(.*?\)/g, ""));

/** The vocabulary ids a question asks as its answer: the correct option of a choice question, or the ornament of an ornament-naming question. */
function answerTargets(it: ExerciseItem): string[] {
  const a = it.answer as { kind?: string; correctOptionIds?: string[]; accepted?: string[] };
  const first = a.correctOptionIds?.[0];
  if (first) return (music.ORNAMENTS as readonly string[]).includes(first) ? [first, `orn:${first}`] : [first];
  if (a.kind === "ornament" && Array.isArray(a.accepted)) return a.accepted.map((o) => `orn:${o}`);
  return [];
}

// ---- lessons: text and targets
interface LessonInfo { node: OrderedNode; text: string; targets: Set<string> }
const lessons: LessonInfo[] = [];
for (const n of course.nodes) {
  if (n.type !== "lesson" || !n.contentRef) continue;
  if (excludeBook && music.BOOK_LESSONS.some((l) => l.node === n.id)) continue;
  const lc = JSON.parse(readFileSync(join(root, "content", n.contentRef), "utf8")) as { explanation: Array<{ text?: string; caption?: string }>; objective: { statement: string }; guided: ExerciseItem[]; independent: ExerciseItem[] };
  const text = norm([lc.objective.statement, ...lc.explanation.map((b) => b.text ?? "")].join(" "));
  const targets = new Set<string>();
  for (const it of [...lc.guided, ...lc.independent]) {
    for (const id of answerTargets(it)) targets.add(id);
  }
  lessons.push({ node: n, text, targets });
}
const wordRe = (w: string) => new RegExp(`(^|[^\\p{L}0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}0-9])`, "u");

// ---- sampling: which terms can a template ask (as the correct answer) inside a scope
const targetCache = new Map<string, Set<string>>();
function targetsOf(templateId: string, scope: MusicScope): Set<string> {
  const key = `${templateId}|${JSON.stringify(scope)}`;
  const hit = targetCache.get(key);
  if (hit) return hit;
  const out = new Set<string>();
  for (let seed = 0; seed < SEEDS; seed++) {
    try {
      const it = generateItem(ix, templateId, seed, { scope, evidence: "independent" }).item;
      for (const id of answerTargets(it)) out.add(id);
    } catch {
      /* some seeds do not fit the scope */
    }
  }
  targetCache.set(key, out);
  return out;
}
const termish = /term|melody|passage|technique|ornament|instrument|book-/;
const generatable = (templateId: string) => termish.test(templateId) && (!excludeBook || !isNew(templateId));

const taughtUnion = (templateId: string, node: OrderedNode): MusicScope | null => {
  let scope: MusicScope | null = null;
  for (const n of course.nodes.filter((x) => x.order <= node.order && x.grade <= node.grade && (x.type === "lesson" || x.type === "enrichment"))) {
    if (excludeBook && music.BOOK_LESSONS.some((l) => l.node === n.id)) continue;
    const b = n.exercises.find((x) => x.templateId === templateId);
    if (b) scope = scope ? mergeScope(scope, effectiveScope(ix, n, b)) : effectiveScope(ix, n, b);
  }
  return scope;
};

const practisedBy = new Map<string, Set<string>>(); // termId -> node ids
for (const node of course.nodes) {
  if (node.type !== "practice" && node.type !== "review") continue;
  // A practice run plans min(10, max(6, 2 x bindings)) questions, taking the bindings in the order listed, so a binding after the first ten is never
  // reached (node-run.ts). A review run orders its bindings by weakness and then by a hash, so any of them can be drawn.
  const reachable = node.type === "practice" ? node.exercises.slice(0, Math.min(10, Math.max(6, node.exercises.length * 2))) : node.exercises;
  for (const b of reachable) {
    if (!generatable(b.templateId)) continue;
    for (const id of targetsOf(b.templateId, effectiveScope(ix, node, b))) practisedBy.set(id, (practisedBy.get(id) ?? new Set()).add(node.id));
  }
}
const assessedBy = new Map<string, Set<string>>();
for (const node of course.nodes) {
  if (node.type !== "unit_challenge" && node.type !== "grade_assessment") continue;
  const bp = ix.assessments.get(node.assessmentId!);
  if (!bp) continue;
  for (const s of bp.sections) {
    for (const t of s.templateIds) {
      if (!generatable(t)) continue;
      const scope = taughtUnion(t, node);
      if (!scope) continue;
      for (const id of targetsOf(t, scope)) assessedBy.set(id, (assessedBy.get(id) ?? new Set()).add(node.id));
    }
  }
}

// ---- classification
export function classify(e: Entry): Row {
  const have = e.termIds.map((id) => vocab.get(id));
  const vocabState: Row["vocab"] = have.every(Boolean) ? (e.partial ? "partial" : "present") : "absent";
  const present = e.termIds.filter((id) => vocab.has(id));
  const patterns = new Set<string>();
  const long = (s: string) => base(s).length >= 4 || /\s/.test(base(s));
  for (const s of [e.headword, ...(e.forms ?? [])]) if (long(s)) patterns.add(base(s));
  for (const id of present) for (const s of vocab.get(id)!.names) if (long(s)) patterns.add(base(s));
  if (e.kind === "sign") for (const id of present) for (const s of vocab.get(id)!.names) for (const w of base(s).split(" ")) if (w.length >= 4) patterns.add(w);
  let taughtAt: string | null = null;
  let taughtIn: Row["taughtIn"] = null;
  for (const l of lessons) {
    const byQuestion = present.some((id) => l.targets.has(id)) && e.termIds.every((id) => !vocab.has(id) || true);
    const byText = [...patterns].some((p) => wordRe(p).test(l.text));
    if (byQuestion || byText) {
      taughtAt = l.node.id;
      taughtIn = byQuestion ? "question" : "text";
      break;
    }
  }
  // An entry is practised/assessed when every vocabulary id that covers it can be asked (an entry covered by two ids needs only one of them).
  const practisedIn = [...new Set(present.flatMap((id) => [...(practisedBy.get(id) ?? [])]))];
  const assessedIn = [...new Set(present.flatMap((id) => [...(assessedBy.get(id) ?? [])]))];
  const status: Status = vocabState === "absent" && !taughtAt ? "missing" : !taughtAt && !practisedIn.length ? "vocab-only" : !practisedIn.length ? "taught-only" : assessedIn.length ? "assessed" : "practised";
  return { entry: e, vocab: vocabState, taughtAt, taughtIn, practisedIn, assessedIn, status };
}

export const rows = inventory.entries.map(classify);

if (process.argv[1] && process.argv[1].endsWith("terminology-inventory.ts")) {
  const out = { generatedWith: excludeBook ? "exclude-book" : "full", seeds: SEEDS, rows: rows.map((r) => ({ id: r.entry.id, headword: r.entry.headword, kind: r.entry.kind, language: r.entry.language, bookGrade: r.entry.bookGrade, vocab: r.vocab, taughtAt: r.taughtAt, taughtIn: r.taughtIn, practised: r.practisedIn.length, assessed: r.assessedIn.length, status: r.status })) };
  if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
  const tally = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = `G${r.entry.bookGrade} ${r.entry.kind}/${r.entry.language}`;
    const t = tally.get(k) ?? { missing: 0, "vocab-only": 0, "taught-only": 0, practised: 0, assessed: 0 };
    t[r.status] = (t[r.status] ?? 0) + 1;
    tally.set(k, t);
  }
  for (const [k, v] of [...tally].sort()) console.log(k.padEnd(24), JSON.stringify(v));
}
