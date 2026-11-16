#!/usr/bin/env node
/**
 * Teacher sign-off evidence matrix (issue #22).
 *
 * Reads the committed content, the existing review documents and the existing test files and writes a per-outcome and a per-template evidence
 * matrix under docs/signoff/matrix/. It is READ-ONLY with respect to everything else: it does not run any generator, test or review, it does
 * not touch content/*, and it never writes an approval. A status here describes how much existing evidence there is for a teacher to inspect;
 * it is not an approval, and `qa.status` / `teacherReview` in the content stay exactly as they are.
 *
 *   node scripts/signoff-matrix.mjs            write the matrix files
 *   node scripts/signoff-matrix.mjs --check    fail if the committed files are out of date
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs/signoff/matrix");
const rd = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const json = (p) => JSON.parse(rd(p));
const grades = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------- content
const outcomes = json("content/syllabus/abrsm-2020-outcomes.json").outcomes;
const templates = grades.flatMap((g) => json(`content/exercises/templates/grade-${g}.json`).templates);
const nodes = grades.flatMap((g) => json(`content/path/grade-${g}.json`).nodes);
const assessments = grades.flatMap((g) => json(`content/assessments/grade-${g}.json`).assessments);
const release = json("content/release.json");

const short = (id) => id.replace(/^t\.g[1-5]\./, "");

// ---------------------------------------------------------------- file index (existing tests and docs only)
function walk(dir, keep, out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name === "fixtures" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(join(root, p));
    if (st.isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}
const engineTests = walk("packages/engine/test", (p) => p.endsWith(".ts"));
const apiTests = walk("packages/api/test", (p) => p.endsWith(".ts"));
const webTests = [...walk("packages/web/src/test", (p) => /\.tsx?$/.test(p)), ...walk("packages/web/e2e", (p) => p.endsWith(".mjs"))];
const allTests = [...engineTests, ...apiTests, ...webTests];
const testText = new Map(allTests.map((p) => [p, rd(p).split("\n")]));

/** First line of each file that names the full template id, as `file:line`. Whole-id match (no prefix collisions: `t.g2.rest` vs `t.g2.rest-judge`). */
function testRefs(id, files) {
  const re = new RegExp(`${id.replace(/\./g, "\\.")}(?![A-Za-z0-9-])`);
  const refs = [];
  for (const f of files) {
    const lines = testText.get(f);
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) refs.push(`${f}:${i + 1}`);
  }
  return refs;
}

// ---------------------------------------------------------------- teacher-pack samples (docs/teacher/GRADE_n_TEACHER_REVIEW_PACK.md, section 3)
const packSamples = new Map(); // template id -> { rows, file }
for (const g of grades) {
  const file = `docs/teacher/GRADE_${g}_TEACHER_REVIEW_PACK.md`;
  const text = rd(file);
  const start = text.indexOf("## 3. Generated-question samples");
  const end = text.indexOf("\n## 4.", start);
  if (start < 0) continue;
  for (const line of text.slice(start, end < 0 ? undefined : end).split("\n")) {
    const m = /^\| ([a-z0-9-]+) \(([^)]*)\) \| (\d+) \|/.exec(line);
    if (!m) continue;
    const id = `t.g${g}.${m[1]}`;
    const cur = packSamples.get(id) ?? { rows: 0, file };
    cur.rows += 1;
    packSamples.set(id, cur);
  }
}

// ---------------------------------------------------------------- review findings and other documents that name a template id
const findingDocs = [
  "docs/architecture/REVISION_PLACEMENT_EXAMS.md",
  "docs/curriculum/GRADE_5_PAPER_COMPARISON.md",
  "docs/curriculum/SYLLABUS_GAPS.md",
  "docs/curriculum/TERMINOLOGY_COVERAGE.md",
  "docs/curriculum/OPEN_QUESTIONS.md",
  ...readdirSync(join(root, "docs/handoff")).filter((f) => f.endsWith(".md")).map((f) => `docs/handoff/${f}`),
  ...grades.map((g) => `docs/architecture/GRADE_${g}_COURSE.md`),
];
const docText = new Map(findingDocs.map((p) => [p, rd(p).split("\n")]));
function docRefs(id) {
  const re = new RegExp(`${id.replace(/\./g, "\\.")}(?![A-Za-z0-9-])`);
  const refs = [];
  for (const [f, lines] of docText) {
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) refs.push(`${f}:${i + 1}`);
  }
  return refs;
}

// ---------------------------------------------------------------- OPEN_QUESTIONS.md
const oq = [];
for (const line of rd("docs/curriculum/OPEN_QUESTIONS.md").split("\n")) {
  const m = /^\| <a id="q(\d+)"><\/a>\*\*Q\d+\*\* \| (.*)$/.exec(line);
  if (!m) continue;
  const cells = m[2].split(" | ");
  const text = line;
  const answered = /\*\*Owner decision|\*\*Answered by the owner/.test(text);
  oq.push({ id: `Q${m[1]}`, n: Number(m[1]), text, answered, decider: (cells[cells.length - 2] ?? "").trim(), line: oq.length });
}
const oqLine = new Map();
rd("docs/curriculum/OPEN_QUESTIONS.md").split("\n").forEach((l, i) => {
  const m = /<a id="q(\d+)">/.exec(l);
  if (m) oqLine.set(`Q${m[1]}`, i + 1);
});
const VOCAB_TEMPLATE = /^(terms|term-use|term-sign|book-terms|book-use)$/;
/** Open questions (not owner-answered) that name this template, a lesson it is bound to, one of its concepts or one of its outcomes. */
function openQuestionLinks(t, lessonIds) {
  const keys = [t.id, ...lessonIds, ...t.conceptIds, ...t.outcomeIds.map((o) => o.replace("abrsm2020.", ""))];
  const out = new Set();
  for (const q of oq) {
    const hay = q.text;
    const hit = keys.some((k) => new RegExp(`(?<![A-Za-z0-9.-])${k.replace(/\./g, "\\.")}(?![A-Za-z0-9-])`).test(hay));
    if (hit) out.add(q.id);
  }
  // Q2 / Q38 (provisional vocabulary) apply to every term-list template; they name no template id, so this one link is explicit.
  if (VOCAB_TEMPLATE.test(short(t.id))) {
    out.add("Q2");
    out.add("Q38");
  }
  return [...out].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

// ---------------------------------------------------------------- bindings
const lessonNodes = nodes.filter((n) => n.type === "lesson");
const lessonsOfTemplate = new Map();
const nodesOfTemplate = new Map();
for (const n of nodes)
  for (const b of n.exercises ?? []) {
    (nodesOfTemplate.get(b.templateId) ?? nodesOfTemplate.set(b.templateId, new Set()).get(b.templateId)).add(n.id);
    if (n.type === "lesson") (lessonsOfTemplate.get(b.templateId) ?? lessonsOfTemplate.set(b.templateId, new Set()).get(b.templateId)).add(n.id);
  }
const assessmentsOfTemplate = new Map();
for (const a of assessments)
  for (const s of a.sections ?? [])
    for (const id of s.templateIds ?? []) (assessmentsOfTemplate.get(id) ?? assessmentsOfTemplate.set(id, new Set()).get(id)).add(a.id);
const examText = rd("docs/curriculum/PRACTICE_EXAM_COVERAGE.md");
const examUsed = new Set();
for (const m of examText.matchAll(/Templates used across the 6 papers \(count\): (.*)/g)) {
  const g = examText.slice(0, m.index).match(/### Grade (\d)/g).pop().slice(-1);
  for (const part of m[1].split(", ")) examUsed.add(`t.g${g}.${part.replace(/ \d+\.?$/, "")}`);
}
const SCORE_READING = /^t\.g[1-5]\.(melody|passage|passage-directions|chord-in-passage|score|score-melody)$/;

// ---------------------------------------------------------------- decision / finding tables (every entry cites its source)
/** Templates named by the educational review of PR #18 as corrected: a teacher should sample the corrected generator. */
const CORRECTED = {
  "t.g5.score-melody": "docs/architecture/REVISION_PLACEMENT_EXAMS.md section 9, review item 4 (key of a melody); engine/test/release-blockers.test.ts",
  "t.g1.middle-c-find": "docs/architecture/REVISION_PLACEMENT_EXAMS.md section 9, review item 4 (middle C descriptions); engine/test/release-blockers.test.ts",
  "t.g2.note-grouping": "docs/architecture/REVISION_PLACEMENT_EXAMS.md section 9, review item 4 (grouping editor description); web/src/test/grouping-text.test.tsx",
  "t.g5.term-use": "docs/architecture/REVISION_PLACEMENT_EXAMS.md section 9, review item 4 (term wording); engine/test/release-blockers.test.ts",
};
/** Templates whose own review requirement says a teacher must first decide if they belong. */
const DECISION_FIRST = { "t.g5.rewrite-metre": "OPEN_QUESTIONS Q39 (owner answered: optional enrichment; never assessed)" };
/** Templates whose content the issue's decision 3 says is Grade 1 level. */
const GRADE1_LEVEL_SCORE_READING = new Set(["t.g2.melody", "t.g3.melody"]);

// ---------------------------------------------------------------- per-template rows
const trows = templates.map((t) => {
  const lessons = [...(lessonsOfTemplate.get(t.id) ?? [])].sort();
  const used = (nodesOfTemplate.get(t.id)?.size ?? 0) + (assessmentsOfTemplate.get(t.id)?.size ?? 0) > 0;
  const pack = packSamples.get(t.id);
  const engineRefs = testRefs(t.id, engineTests);
  const otherRefs = testRefs(t.id, [...apiTests, ...webTests]);
  const findings = docRefs(t.id).filter((r) => !r.startsWith("docs/curriculum/OPEN_QUESTIONS.md"));
  const qs = openQuestionLinks(t, lessons);
  const openQs = qs.filter((q) => !oq.find((x) => x.id === q).answered);
  const answeredQs = qs.filter((q) => oq.find((x) => x.id === q).answered);
  const decisions = [];
  if (SCORE_READING.test(t.id)) decisions.push("D1", "D2", "D4");
  if (GRADE1_LEVEL_SCORE_READING.has(t.id)) decisions.push("D3");
  if (t.mode === "build" || /^(melody|passage|passage-directions|chord-in-passage|score|score-melody)$/.test(short(t.id))) decisions.push("D4");
  if (t.grade >= 3) decisions.push("D2");
  const focus = [];
  if (CORRECTED[t.id]) focus.push("corrected after review: teacher to sample the corrected generator");
  if (DECISION_FIRST[t.id]) focus.push("belongs-in-grade decision recorded, sample still needed");
  if (GRADE1_LEVEL_SCORE_READING.has(t.id)) focus.push("Grade 1-level generator reused at this grade (decision 3)");
  for (const q of openQs) focus.push(`open convention question ${q}`);
  const gaps = [];
  if (!used) gaps.push("not used by any node or assessment");
  if (!pack) gaps.push("no seeded sample in the teacher review pack");
  // An engine test that names the template is an independent answer check, a golden grading case or a targeted regression (the matrix links the exact
  // line). Without one, the answers rest on the generic gate (engine.test.ts "generation"), which re-uses the generator's own answer.
  if (!engineRefs.length) focus.push("no engine test names this template (only the generic self-consistency gate): teacher to check the sampled answers by hand");
  const optionalOnly = used && [...(nodesOfTemplate.get(t.id) ?? [])].every((id) => nodes.find((n) => n.id === id)?.optional) && !(assessmentsOfTemplate.get(t.id)?.size);
  const notes = optionalOnly ? ["optional enrichment only: never assessed"] : [];
  let cls;
  if (gaps.length) cls = "c";
  else if (focus.length) cls = "b";
  else cls = "a";
  return {
    id: t.id,
    grade: t.grade,
    family: t.familyId,
    mode: t.mode,
    outcomes: t.outcomeIds.map((o) => o.replace("abrsm2020.", "")),
    lessons,
    assessments: [...(assessmentsOfTemplate.get(t.id) ?? [])].sort(),
    inPracticeExam: examUsed.has(t.id),
    qaStatus: t.qa.status,
    reviewedBy: t.qa.reviewedBy,
    packRows: pack?.rows ?? 0,
    packFile: pack?.file ?? "",
    engineTests: engineRefs,
    otherTests: otherRefs,
    findings,
    openQs,
    answeredQs,
    decisions: [...new Set(decisions)].sort(),
    focus,
    gaps,
    cls,
    optionalOnly,
    notes,
  };
});

// ---------------------------------------------------------------- per-outcome rows
const tByOutcome = new Map();
for (const r of trows) for (const o of r.outcomes) (tByOutcome.get(o) ?? tByOutcome.set(o, []).get(o)).push(r);
const orows = outcomes.map((o) => {
  const short = o.id.replace("abrsm2020.", "");
  const taught = lessonNodes.filter((n) => n.outcomeIds.includes(o.id)).map((n) => n.id);
  const practised = nodes.filter((n) => n.type !== "lesson" && /practice|review|challenge/.test(n.type) && (n.outcomeIds ?? []).includes(o.id)).map((n) => n.id);
  const assessed = assessments.filter((a) => (a.sections ?? []).some((s) => (s.outcomeIds ?? []).includes(o.id))).map((a) => a.id);
  const ts = tByOutcome.get(short) ?? [];
  const count = (c) => ts.filter((t) => t.cls === c).length;
  const hay = oq.filter((q) => new RegExp(`(?<![A-Za-z0-9.-])${short.replace(/\./g, "\\.")}(?![A-Za-z0-9-])`).test(q.text));
  const directOpen = hay.filter((q) => !q.answered).map((q) => q.id);
  const directAnswered = hay.filter((q) => q.answered).map((q) => q.id);
  const assessedTemplates = new Set(
    assessments.flatMap((a) => (a.sections ?? []).filter((s) => (s.outcomeIds ?? []).includes(o.id)).flatMap((s) => s.templateIds ?? [])),
  );
  const assessedRows = trows.filter((r) => assessedTemplates.has(r.id));
  const gaps = [];
  if (!taught.length) gaps.push("no lesson");
  if (!assessed.length) gaps.push("no assessment section");
  if (!ts.length) gaps.push("no template bound");
  const focus = [];
  if (directOpen.length) focus.push(`open question ${directOpen.join(", ")} names this outcome`);
  if (assessedRows.length && !assessedRows.some((r) => r.cls === "a")) focus.push("no assessed template has class A evidence");
  let cls;
  if (gaps.length) cls = "c";
  else if (focus.length) cls = "b";
  else cls = "a";
  const bTpl = assessedRows.filter((r) => r.cls === "b").length;
  const cTpl = assessedRows.filter((r) => r.cls === "c").length;
  return { id: o.id, short, grade: o.grade, domain: o.domain, statement: o.statement, teacherReview: o.teacherReview, decomposition: o.decomposition, evidenceStatus: o.evidenceStatus, taught, practised, assessed, templates: ts.length, a: count("a"), b: count("b"), c: count("c"), directOpen, directAnswered, bTpl, cTpl, focus, gaps, cls };
});

// ---------------------------------------------------------------- rendering
const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (cols, rows) => [cols.map((c) => c.h).join(","), ...rows.map((r) => cols.map((c) => csvCell(c.v(r))).join(","))].join("\n") + "\n";

const tcols = [
  { h: "template", v: (r) => r.id },
  { h: "grade", v: (r) => r.grade },
  { h: "family", v: (r) => r.family },
  { h: "mode", v: (r) => r.mode },
  { h: "outcomes", v: (r) => r.outcomes },
  { h: "taught_in", v: (r) => r.lessons },
  { h: "assessed_by", v: (r) => r.assessments },
  { h: "in_practice_exam_papers", v: (r) => (r.inPracticeExam ? "yes" : "no") },
  { h: "qa_status", v: (r) => r.qaStatus },
  { h: "reviewed_by", v: (r) => r.reviewedBy ?? "null" },
  { h: "teacher_pack_sample_rows", v: (r) => r.packRows },
  { h: "engine_test_refs", v: (r) => r.engineTests },
  { h: "other_test_refs", v: (r) => r.otherTests },
  { h: "review_finding_refs", v: (r) => r.findings },
  { h: "open_questions", v: (r) => r.openQs },
  { h: "owner_answered_questions", v: (r) => r.answeredQs },
  { h: "owner_decisions_touched", v: (r) => r.decisions },
  { h: "evidence_class", v: (r) => r.cls.toUpperCase() },
  { h: "why", v: (r) => [...(r.gaps.length ? r.gaps : r.focus), ...(r.notes ?? [])] },
];
const ocols = [
  { h: "outcome", v: (r) => r.id },
  { h: "grade", v: (r) => r.grade },
  { h: "domain", v: (r) => r.domain },
  { h: "statement", v: (r) => r.statement },
  { h: "teacher_review", v: (r) => r.teacherReview },
  { h: "decomposition", v: (r) => r.decomposition },
  { h: "taught_in", v: (r) => r.taught },
  { h: "unit_practice_review_challenge_nodes", v: (r) => r.practised },
  { h: "assessed_by", v: (r) => r.assessed },
  { h: "templates", v: (r) => r.templates },
  { h: "templates_A", v: (r) => r.a },
  { h: "templates_B", v: (r) => r.b },
  { h: "templates_C", v: (r) => r.c },
  { h: "open_questions_naming_outcome", v: (r) => r.directOpen },
  { h: "owner_answered_questions_naming_outcome", v: (r) => r.directAnswered },
  { h: "evidence_class", v: (r) => r.cls.toUpperCase() },
  { h: "why", v: (r) => (r.gaps.length ? r.gaps : r.focus) },
];

const HEADER = (what) =>
  `<!-- Generated by \`npm run signoff:matrix\` (scripts/signoff-matrix.mjs). Do not edit by hand. ${what} -->\n`;
const tally = (rows) => ["a", "b", "c"].map((c) => `${c.toUpperCase()}=${rows.filter((r) => r.cls === c).length}`).join(", ");

function mdOutcomes() {
  const lines = [
    HEADER("Statuses describe the amount of existing evidence only; they are not approvals."),
    "# Outcome evidence matrix (80 syllabus outcome records)",
    "",
    `Release metadata: status \`${release.status}\`, teacherReview \`${release.teacherReview.status}\`, publishedAt \`${release.publishedAt}\`. Every outcome is \`teacherReview: pending\` (${outcomes.filter((o) => o.teacherReview === "pending").length} of ${outcomes.length}); nothing here changes that.`,
    "",
    `Evidence classes: ${tally(orows)}. Rules are in [EVIDENCE_INVENTORY.md](../EVIDENCE_INVENTORY.md#classification-rules).`,
    "",
    "| Outcome | Domain | Taught | Assessed | Templates A/B/C | Class | Why |",
    "|---|---|---|---|---|---|---|",
    ...orows.map((r) => `| ${r.short} | ${r.domain} | ${r.taught.length ? r.taught.join(", ") : "none"} | ${r.assessed.length ? r.assessed.join(", ") : "none"} | ${r.a}/${r.b}/${r.c} | ${r.cls.toUpperCase()} | ${(r.gaps.length ? r.gaps : r.focus).join("; ") || "-"} |`),
    "",
    "Statements, review state and links to the individual evidence are in [`OUTCOME_EVIDENCE.csv`](OUTCOME_EVIDENCE.csv).",
    "",
  ];
  return lines.join("\n");
}
function mdTemplates() {
  const lines = [
    HEADER("Statuses describe the amount of existing evidence only; they are not approvals."),
    "# Template evidence matrix (245 exercise template records)",
    "",
    `Every template is \`qa.status: ${[...new Set(trows.map((r) => r.qaStatus))].join(", ")}\` with \`reviewedBy: null\`; nothing here changes that.`,
    "",
    `Evidence classes: ${tally(trows)}. Rules are in [EVIDENCE_INVENTORY.md](../EVIDENCE_INVENTORY.md#classification-rules). "Pack" is the number of seeded sample rows in the grade's teacher review pack, "Tests" the number of existing test files that name the template id; exact \`file:line\` references are in [\`TEMPLATE_EVIDENCE.csv\`](TEMPLATE_EVIDENCE.csv).`,
    "",
    "| Template | Mode | Outcomes | Pack | Tests (engine/other) | Open Q | Decisions | Class | Why |",
    "|---|---|---|---:|---:|---|---|---|---|",
    ...trows.map((r) => `| ${r.id} | ${r.mode} | ${r.outcomes.join(", ")} | ${r.packRows} | ${r.engineTests.length}/${r.otherTests.length} | ${r.openQs.join(", ") || "-"} | ${r.decisions.join(", ") || "-"} | ${r.cls.toUpperCase()} | ${[...(r.gaps.length ? r.gaps : r.focus), ...r.notes].join("; ") || "-"} |`),
    "",
  ];
  return lines.join("\n");
}

function mdQuestions() {
  const linkedT = (q) => trows.filter((r) => r.openQs.includes(q) || r.answeredQs.includes(q)).map((r) => r.id);
  const lines = [
    HEADER("Links are structural: a template is linked only if the question row names its id, a lesson it is bound to, one of its concepts or one of its outcomes (plus Q2 and Q38 for the term-list templates). A question with no link is still open; it just names nothing the matrix can follow."),
    "# Open questions and the templates they touch",
    "",
    "Source: [`docs/curriculum/OPEN_QUESTIONS.md`](../../curriculum/OPEN_QUESTIONS.md). Questions the owner has already answered are marked and are not re-asked by the sign-off worksheet; their recorded answers are untouched.",
    "",
    "| Question | State | Decider | Linked templates | Source line |",
    "|---|---|---|---:|---|",
    ...oq.map((q) => `| ${q.id} | ${q.answered ? "owner-answered (kept)" : "open"} | ${q.decider} | ${linkedT(q.id).length} | OPEN_QUESTIONS.md:${oqLine.get(q.id)} |`),
    "",
    `Open: ${oq.filter((q) => !q.answered).length}. Owner-answered: ${oq.filter((q) => q.answered).map((q) => q.id).join(", ")}.`,
    "",
  ];
  return lines.join("\n");
}

const files = {
  "OPEN_QUESTION_LINKS.md": mdQuestions(),
  "OUTCOME_EVIDENCE.csv": csv(ocols, orows),
  "TEMPLATE_EVIDENCE.csv": csv(tcols, trows),
  "OUTCOME_EVIDENCE.md": mdOutcomes(),
  "TEMPLATE_EVIDENCE.md": mdTemplates(),
};

if (process.argv.includes("--summary")) {
  console.log("outcomes", tally(orows), "templates", tally(trows));
  console.log(JSON.stringify({ gapsT: trows.filter((r) => r.cls === "c").map((r) => [r.id, r.gaps]), }, null, 0));
  process.exit(0);
}
if (process.argv.includes("--check")) {
  let bad = 0;
  for (const [name, text] of Object.entries(files)) {
    const p = join(OUT, name);
    if (!existsSync(p) || readFileSync(p, "utf8").replace(/\r\n/g, "\n") !== text) {
      console.error(`out of date: ${relative(root, p)}`);
      bad++;
    }
  }
  if (bad) {
    console.error("Run: npm run signoff:matrix");
    process.exit(1);
  }
  console.log("sign-off matrix is up to date");
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(OUT, name), text);
  console.log(`wrote ${Object.keys(files).length} files to ${relative(root, OUT)}`);
  console.log("outcomes:", tally(orows), "| templates:", tally(trows));
}
