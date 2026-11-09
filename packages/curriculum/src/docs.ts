/**
 * Generates the human-readable curriculum documents from the machine-readable content, so the
 * matrices can never drift from the data. `docs --check` fails CI if a generated file is stale.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { computeCoverage } from "./coverage.ts";
import { REPO_ROOT, type Curriculum } from "./load.ts";
import { buildIndex, type CurriculumIndex } from "./model.ts";

const HEADER = (source: string) =>
  `<!-- GENERATED FILE — do not edit by hand. Source: ${source}. Regenerate with \`npm run docs:generate\`. -->\n`;
const BEGIN = "<!-- BEGIN GENERATED: book-classification -->";
const END = "<!-- END GENERATED: book-classification -->";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const list = (xs: string[]) => (xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "—");
const short = (id: string) => id.replace("abrsm2020.", "");

const CLASS_LABEL: Record<string, string> = {
  core_this_grade: "Core at this grade",
  core_other_grade: "Core at another grade",
  supporting: "Supporting / enrichment",
  no_current_match: "No direct current-syllabus match",
};

function coverageMatrix(ix: CurriculumIndex): string {
  const rows = computeCoverage(ix);
  const planned = rows.filter((r) => r.status === "planned").length;
  const approved = rows.filter((r) => r.status === "teacher-approved").length;
  const out: string[] = [HEADER("content/** via packages/curriculum/src/coverage.ts")];
  out.push("# Curriculum coverage matrix — official outcomes (Grades 1–5)\n");
  out.push(
    `Authority: *${ix.c.release.syllabus.title}* (document dated ${ix.c.release.syllabus.documentDate}, retrieved ${ix.c.release.syllabus.retrievedAt}, SHA-256 \`${ix.c.release.syllabus.sha256.slice(0, 12)}…\`).\n`,
  );
  out.push(
    `**Status: ${planned} of ${rows.length} outcomes have PLANNED coverage in every channel (lesson, practice, review, unit/grade assessment); ${approved} are teacher-approved.** ` +
      "\"Planned\" means the learning graph, exercise templates and assessment blueprints reference the outcome. It is **not** a claim of verified coverage: lesson content is produced in Briefs 05–09 and a qualified teacher must review the outcome decomposition and the exercises.\n",
  );
  out.push("Outcome IDs are atomic decompositions of the numbered items in the official outline (`g1.05` = Grade 1, fifth atomic outcome). The decomposition is the author's interpretation pending review.\n");
  for (const g of [1, 2, 3, 4, 5]) {
    out.push(`\n## Grade ${g}\n`);
    out.push("| Outcome | Item | Statement (paraphrase) | Lessons | Practice templates | Review nodes | Assessments | Book § | Status |");
    out.push("|---|---|---|---|---|---|---|---|---|");
    for (const r of rows.filter((x) => x.grade === g)) {
      const o = ix.outcomes.get(r.outcomeId)!;
      const books = r.bookSections.map((b) => b.replace(/^fs\.g(\d)\.s0?(\d+)$/, "G$1 §$2"));
      out.push(
        `| \`${short(r.outcomeId)}\` | ${o.syllabusItem} | ${esc(r.statement)} | ${list(r.lessons)} | ${list(r.practiceTemplates)} | ${list(r.reviewNodes)} | ${list(r.assessments)} | ${books.join(", ") || "**gap — original content**"} | ${r.status}${r.missing.length ? ` (missing: ${r.missing.join(", ")})` : ""} |`,
      );
    }
  }
  const noBook = rows.filter((r) => r.bookSections.length === 0);
  out.push("\n## Outcomes with no source-book section\n");
  out.push(noBook.length ? noBook.map((r) => `- \`${short(r.outcomeId)}\` — ${r.statement}`).join("\n") : "None.");
  out.push("");
  return out.join("\n");
}

function crosswalk(ix: CurriculumIndex): string {
  const { book } = ix.c;
  const out: string[] = [HEADER("content/source-book/first-steps-sections.json")];
  out.push("# Textbook → syllabus crosswalk (75 sections)\n");
  out.push(
    `Reference: ${ix.c.release.sourceBook.author}, *${ix.c.release.sourceBook.title}* (${ix.c.release.sourceBook.publisher}, first published ${ix.c.release.sourceBook.firstPublished}). ` +
      "Headings and **printed** page numbers were checked against the contents pages of the user-supplied scan; the scan page is two printed pages per image. " +
      "This table is a citation index for authors and teachers. It contains no text, examples or exercises from the book, and none may be copied into the app.\n",
  );
  const counts = Object.entries(CLASS_LABEL).map(([k, v]) => `${v}: **${book.sections.filter((s) => s.classification === k).length}**`);
  out.push(`Section classifications — ${counts.join(" · ")}. Sections with parts treated differently: **${book.sections.filter((s) => s.parts.length).length}**.\n`);
  for (const g of [1, 2, 3, 4, 5]) {
    out.push(`\n## Grade ${g}\n`);
    out.push("| § | Heading (citation) | Printed p. | Scan p. | Classification | Taught at | App units | Concepts | Official outcomes | Reconciliation |");
    out.push("|---:|---|---:|---:|---|---|---|---|---|---|");
    for (const s of book.sections.filter((x) => x.grade === g)) {
      const parts = s.parts.map((p) => `<br>• *${esc(p.topic)}* → ${CLASS_LABEL[p.classification]}${p.taughtAtGrade ? ` (G${p.taughtAtGrade})` : ""}: ${esc(p.note)}`).join("");
      out.push(
        `| ${s.section} | ${esc(s.heading)} | ${s.printedPage} | ${s.scanPage} | ${CLASS_LABEL[s.classification]} | G${s.taughtAtGrade} | ${s.unitIds.join(", ")} | ${list(s.conceptIds)} | ${s.outcomeIds.map(short).join(", ") || "—"} | ${esc(s.reconciliation)}${parts} |`,
      );
    }
  }
  out.push("");
  return out.join("\n");
}

function learningPath(ix: CurriculumIndex): string {
  const out: string[] = [HEADER("content/path/*.json, content/concepts/*.json")];
  out.push("# Learning path and prerequisite graph\n");
  const lessons = ix.nodes.filter((n) => n.type === "lesson");
  out.push(
    `Five grade worlds · ${ix.units.size} units · ${lessons.length} lessons · ${ix.nodes.filter((n) => n.type === "enrichment").length} optional enrichment nodes · ` +
      `${ix.nodes.filter((n) => n.type === "practice").length} practice, ${ix.nodes.filter((n) => n.type === "review").length} review, ${ix.nodes.filter((n) => n.type === "unit_challenge").length} unit-challenge and 5 grade-assessment nodes · ${ix.concepts.size} concepts.\n`,
  );
  out.push(
    "**Unlock rule:** a node unlocks when the nodes in *Unlocks after* are complete. When no list is authored, it unlocks after the previous required lesson, practice or review node. Unit challenges and grade assessments collect independent mastery evidence and never block the next lesson. Enrichment is optional, and no required node depends on it. The validator checks that every concept prerequisite is taught by a node that is guaranteed to be complete first.\n",
  );
  out.push("```mermaid\nflowchart LR");
  for (const w of [...ix.c.worlds].sort((a, b) => a.grade - b.grade)) {
    out.push(`  subgraph G${w.grade}["Grade ${w.grade}: ${w.learnerTitle}"]`);
    out.push(`    ${w.units.map((u) => `${u.id.replace("-", "_")}["${u.id} ${u.learnerTitle}"]`).join(" --> ")} --> G${w.grade}_A(["Grade ${w.grade} assessment"])`);
    out.push("  end");
  }
  for (const g of [1, 2, 3, 4]) out.push(`  G${g}_U${ix.c.worlds.find((w) => w.grade === g)!.units.length} --> G${g + 1}_U1`);
  out.push("```\n");
  const TYPE: Record<string, string> = { lesson: "Lesson", practice: "Practice", review: "Review", unit_challenge: "Unit challenge", grade_assessment: "Grade assessment", enrichment: "Enrichment (optional)" };
  for (const w of [...ix.c.worlds].sort((a, b) => a.grade - b.grade)) {
    out.push(`\n## Grade ${w.grade} — ${w.learnerTitle}\n\n${w.summary}\n`);
    for (const u of w.units) {
      out.push(`\n### ${u.id} — ${u.learnerTitle}\n\n*${u.title}.* ${u.summary} Book sections: ${u.bookSectionIds.map((b) => b.replace(/^fs\.g(\d)\.s0?(\d+)$/, "G$1 §$2")).join(", ") || "—"}.`);
      if (u.refinements.length) out.push(`\nRefinements to the provisional unit map: ${u.refinements.join(" ")}`);
      out.push("\n| Node | Type | Title | Objective | Concepts (prerequisites) | Outcomes | Unlocks after | Min |");
      out.push("|---|---|---|---|---|---|---|---:|");
      for (const n of w.nodes.filter((x) => x.unitId === u.id).map((x) => ix.nodeById.get(x.id)!)) {
        const concepts = n.conceptIds
          .map((cid) => {
            const pre = ix.concepts.get(cid)?.prerequisiteIds ?? [];
            return `\`${cid}\`${pre.length ? ` (${pre.map((p) => `\`${p}\``).join(", ")})` : ""}`;
          })
          .join("<br>");
        const outs = n.type === "lesson" ? n.outcomeIds : n.reviewOutcomeIds;
        const outText = n.assessmentId ? `see \`${n.assessmentId}\`` : outs.map(short).join(", ") || "—";
        out.push(`| \`${n.id}\` | ${TYPE[n.type]} | ${esc(n.title)} | ${esc(n.objective)} | ${concepts || "—"} | ${outText} | ${n.resolvedUnlockAfter.map((x) => `\`${x}\``).join(", ") || "start"} | ${n.estimatedMinutes} |`);
      }
    }
    const ga = w.nodes.find((n) => n.type === "grade_assessment");
    if (ga) out.push(`\n**${ga.title}** (\`${ga.id}\`, assessment \`${ga.assessmentId}\`) — ${ga.objective}`);
  }
  out.push("");
  return out.join("\n");
}

function bookClassificationBlock(ix: CurriculumIndex): string {
  const out: string[] = [BEGIN, ""];
  out.push("| Section | Heading | Classification | Taught at | Note |");
  out.push("|---|---|---|---|---|");
  for (const s of ix.c.book.sections) {
    const special = s.classification !== "core_this_grade" || s.parts.length > 0 || /gap/i.test(s.reconciliation);
    if (!special) continue;
    out.push(`| G${s.grade} §${s.section} (p. ${s.printedPage}) | ${esc(s.heading)} | ${CLASS_LABEL[s.classification]} | G${s.taughtAtGrade} | ${esc(s.reconciliation)} |`);
    for (const p of s.parts) out.push(`| ↳ part | ${esc(p.topic)} | ${CLASS_LABEL[p.classification]} | ${p.taughtAtGrade ? `G${p.taughtAtGrade}` : "not taught"} | ${esc(p.note)} |`);
  }
  const plain = ix.c.book.sections.filter((s) => s.classification === "core_this_grade" && s.parts.length === 0 && !/gap/i.test(s.reconciliation));
  out.push(`\nThe other ${plain.length} sections are **core at this grade**, match the 2020 outline at the same grade and have no recorded gaps: ${plain.map((s) => `G${s.grade} §${s.section}`).join(", ")}.`);
  out.push("", END);
  return out.join("\n");
}

export function renderDocs(c: Curriculum): Map<string, string> {
  const ix = buildIndex(c);
  const docs = new Map<string, string>();
  docs.set("docs/curriculum/COVERAGE_MATRIX.md", coverageMatrix(ix));
  docs.set("docs/curriculum/CURRICULUM_CROSSWALK.md", crosswalk(ix));
  docs.set("docs/curriculum/LEARNING_PATH.md", learningPath(ix));
  const gapsPath = join(REPO_ROOT, "docs/curriculum/SYLLABUS_GAPS.md");
  if (existsSync(gapsPath)) {
    const current = readFileSync(gapsPath, "utf8");
    const start = current.indexOf(BEGIN);
    const end = current.indexOf(END);
    if (start >= 0 && end > start) {
      docs.set("docs/curriculum/SYLLABUS_GAPS.md", current.slice(0, start) + bookClassificationBlock(ix) + current.slice(end + END.length));
    }
  }
  return docs;
}

export function writeDocs(c: Curriculum, repoRoot = REPO_ROOT): string[] {
  const written: string[] = [];
  for (const [rel, text] of renderDocs(c)) {
    const p = join(repoRoot, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    written.push(rel);
  }
  return written;
}

export function checkDocs(c: Curriculum, repoRoot = REPO_ROOT): string[] {
  const stale: string[] = [];
  for (const [rel, text] of renderDocs(c)) {
    const p = join(repoRoot, rel);
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(rel);
  }
  return stale;
}
