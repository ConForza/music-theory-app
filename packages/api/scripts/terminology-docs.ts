/**
 * Generates docs/curriculum/TERMINOLOGY_COVERAGE.md: the book-versus-course terminology comparison for Grades 1-4, the before/after
 * coverage table, the reviewer-count verification, the teacher-approval list and the list of the new terms. Never hand-edited.
 * Run: `npm run docs:terms -w @mtp/api` (write) or `npx tsx scripts/terminology-docs.ts --check` (fail if the file is stale).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { music } from "@mtp/curriculum";
import { rows, type Row } from "./terminology-inventory.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = join(root, "docs/curriculum/TERMINOLOGY_COVERAGE.md");
interface BaseRow { id: string; headword: string; kind: string; language: string; bookGrade: number; vocab: string; taughtAt: string | null; status: string }
const baseline = (JSON.parse(readFileSync(join(root, "content/source-book/terminology-baseline.json"), "utf8")) as { rows: BaseRow[] }).rows;
const esc = (s: string) => s.replace(/\|/g, "\\|");

type Group = { key: string; label: string; match: (r: { bookGrade: number; kind: string; language: string }) => boolean };
const groups: Group[] = [
  { key: "g1w", label: "Grade 1 Italian words", match: (r) => r.bookGrade === 1 && r.kind === "word" },
  { key: "g1s", label: "Grade 1 signs", match: (r) => r.bookGrade === 1 && r.kind === "sign" },
  { key: "g2w", label: "Grade 2 Italian words", match: (r) => r.bookGrade === 2 && r.kind === "word" },
  { key: "g2s", label: "Grade 2 signs", match: (r) => r.bookGrade === 2 && r.kind === "sign" },
  { key: "g3w", label: "Grade 3 Italian words", match: (r) => r.bookGrade === 3 && r.kind === "word" },
  { key: "g4w", label: "Grade 4 Italian words", match: (r) => r.bookGrade === 4 && r.kind === "word" && r.language === "italian" },
  { key: "g4f", label: "Grade 4 French words (taught at Grade 5)", match: (r) => r.bookGrade === 4 && r.kind === "word" && r.language === "french" },
  { key: "g4t", label: "Grade 4 playing techniques and bowing signs", match: (r) => r.bookGrade === 4 && r.kind === "technique" },
  { key: "g4o", label: "Grade 4 ornament signs", match: (r) => r.bookGrade === 4 && r.kind === "ornament" },
];
const tally = (list: Array<{ status: string }>) => {
  const n = (s: string) => list.filter((r) => r.status === s).length;
  return { total: list.length, missing: n("missing"), vocabOnly: n("vocab-only"), taughtOnly: n("taught-only"), practised: n("practised"), assessed: n("assessed") };
};

const L: string[] = [];
L.push("<!-- GENERATED FILE — do not edit by hand. Source: content/source-book/terminology-inventory.json, terminology-baseline.json and the committed content, via packages/api/scripts/terminology-docs.ts. Regenerate with `npm run docs:terms -w @mtp/api`. -->", "");
L.push("# Terminology coverage, Grades 1-4: the reference book against the course", "");
L.push("**Status: development-complete, teacher sign-off pending.** Nothing here is approved for public educational release or endorsed by ABRSM. The reference book's term lists come from a 1999 companion workbook; they are **not** treated as the current official requirement, and its grade placement is **not** treated as official (OPEN_QUESTIONS Q2, Q38). Every placement below that differs from the book, and every term the course teaches that the book does not list, is a teacher decision.", "");
L.push("The comparison is generated from the committed lessons, templates, path and blueprints, not from a hand-kept table. *Taught* means a lesson's explanation names the term or one of its questions asks it. *Practised* means a practice or review node (inside the ten-question cap of a practice run) is bound to a template that can ask it as the right answer. *Assessed* means a unit challenge or grade assessment section lists such a template inside what has been taught by that node. Practised and assessed are measured by running the real generators over 260 seeds.", "");

// ---- 1. reviewer verification
L.push("## 1. Verification of the reviewer's counts", "");
const covered = (list: BaseRow[]) => list.filter((r) => r.status !== "missing").length;
const inVocab = (list: BaseRow[]) => list.filter((r) => r.vocab === "present").length;
const G = (k: string) => baseline.filter(groups.find((g) => g.key === k)!.match);
const rv = (k: string, reported: string, note: string) => {
  const b = G(k);
  return `| ${groups.find((g) => g.key === k)!.label} | ${reported} | ${covered(b)}/${b.length} | ${inVocab(b)}/${b.length} | ${note.replace("{vocab}", String(inVocab(b)))} |`;
};
L.push("The Grade 5 educational review reported Grade 1 32/32, Grade 2 16/31, Grade 3 1/34 and Grade 4 21/22. Re-counted against the book and the tree before this work (PR #13 head):", "");
L.push("| List | Reviewer reported | Covered here (a vocabulary entry exists, or a lesson names the term) | Vocabulary entry exists | Reading |", "|---|---|---|---|---|");
L.push(rv("g1w", "32/32", "Complete. The reviewer's total of 32 is not reproducible under any single counting convention (the printed list has 28 words and ten signs); the conclusion (complete) agrees."));
L.push(rv("g2w", "16/31", "Reproduced: 16 covered. The reviewer's 31 counts *mosso* and *moto* separately; the printed line is one entry. Only {vocab} are real vocabulary entries; four more are named only in a lesson of another grade."));
L.push(rv("g3w", "1/34", "Reproduced within one entry: the two covered entries are *alla breve* (named in a Grade 2 time-signature lesson) and *prima/primo* (met inside *tempo primo*). No Grade 3 book word was a vocabulary entry."));
L.push(rv("g4w", "21/22", "Reproduced exactly: *veloce* was missing and *voce* was met only inside *sotto voce*."));
L.push("");
L.push("*Counting convention.* One entry per printed headword line; alternative spellings and abbreviations on one line are forms of one entry; each printed sign is one entry; Italian words, French words, techniques and ornaments are counted separately (content/source-book/terminology-inventory.json).", "");

// ---- 2. before / after
L.push("## 2. Before and after", "");
L.push("Missing = in no vocabulary and in no lesson. Vocabulary only = a vocabulary entry no lesson teaches. Taught only = taught, but no practice or review can ask it. After this work no entry is in any of the first three states.", "");
L.push("| List | Entries | | Missing | Vocabulary only | Taught only | Practised | Assessed |", "|---|---|---|---|---|---|---|---|");
let totalBefore = 0;
let totalAfter = 0;
for (const g of groups) {
  const b = tally(baseline.filter(g.match));
  const a = tally(rows.filter((r) => g.match({ bookGrade: r.entry.bookGrade, kind: r.entry.kind, language: r.entry.language })).map((r) => ({ status: r.status })));
  totalBefore += b.total - b.missing - b.vocabOnly - b.taughtOnly;
  totalAfter += a.total - a.missing - a.vocabOnly - a.taughtOnly;
  L.push(`| ${g.label} | ${b.total} | before | ${b.missing} | ${b.vocabOnly} | ${b.taughtOnly} | ${b.practised} | ${b.assessed} |`);
  L.push(`| | | **after** | **${a.missing}** | **${a.vocabOnly}** | **${a.taughtOnly}** | **${a.practised}** | **${a.assessed}** |`);
}
const tb = tally(baseline);
const ta = tally(rows.map((r) => ({ status: r.status })));
L.push(`| **All entries** | ${tb.total} | before | ${tb.missing} | ${tb.vocabOnly} | ${tb.taughtOnly} | ${tb.practised} | ${tb.assessed} |`);
L.push(`| | | **after** | **${ta.missing}** | **${ta.vocabOnly}** | **${ta.taughtOnly}** | **${ta.practised}** | **${ta.assessed}** |`, "");
L.push(`Entries both taught and askable in practice or review: ${totalBefore} of ${tb.total} before, ${totalAfter} of ${ta.total} after.`, "");

// ---- 3. what was found, entry by entry
L.push("## 3. Entries that were missing, present but not taught, or taught but not practised", "");
const baseById = new Map(baseline.map((r) => [`${r.id}|${r.bookGrade}`, r]));
const gaps = rows.filter((r) => {
  const b = baseById.get(`${r.entry.id}|${r.entry.bookGrade}`)!;
  return b.status === "missing" || b.status === "vocab-only" || b.status === "taught-only";
});
const word = (r: Row) => { const extra = (r.entry.forms ?? []).filter((f) => !r.entry.headword.toLowerCase().includes(f.toLowerCase())); return r.entry.headword + (extra.length ? ` (${extra.join(", ")})` : ""); };
const byState = (s: string) => gaps.filter((r) => baseById.get(`${r.entry.id}|${r.entry.bookGrade}`)!.status === s);
L.push(`**Missing entirely (${byState("missing").length}):** ${["2", "3", "4"].map((g) => `Grade ${g}: ${byState("missing").filter((r) => String(r.entry.bookGrade) === g).map((r) => `*${esc(word(r))}*`).join(", ") || "none"}.`).join(" ")}`, "");
L.push(`**Present but not taught (${byState("vocab-only").length}):** ${byState("vocab-only").map((r) => `*${esc(word(r))}* (${esc(r.entry.note ?? "")})`).join("; ") || "none"}.`, "");
L.push(`**Taught but not practised (${byState("taught-only").length}):** ${byState("taught-only").map((r) => `*${esc(word(r))}*`).join(", ") || "none"}. These had no vocabulary entry: a lesson of another grade named them (for example *alla breve* as the cut-time sign), but no question could ask them.`, "");
L.push("**Present, taught and assessed before, but at a different grade from the book** are listed in section 5.", "");

// ---- 4. what was built
L.push("## 4. What was built", "");
L.push("| Lesson | Grade | Teaches | Concept |", "|---|---|---|---|");
for (const l of music.BOOK_LESSONS) {
  L.push(`| \`${l.node}\` ${esc(l.title)} | ${l.grade} | ${l.termIds.map((id) => esc((music.TERMS_BOOK.find((x) => x.id === id)?.term ?? "staccatissimo (the wedge sign)"))).join("; ")} | \`${l.conceptId}\` |`);
}
L.push("", `${music.TERMS_BOOK.length} new vocabulary entries (\`VOCAB_BOOK\` version ${music.VOCAB_BOOK_VERSION}: 21 for Grade 2, 34 for Grade 3, 2 for Grade 4) plus the older term *staccatissimo*, taught for the first time. Six new templates (\`t.g2.book-terms\`, \`t.g2.book-use\`, and the same for Grades 3 and 4), eleven new concepts with \`termIds\` boundaries, eleven lessons inserted after each grade's existing terms lesson (one unbroken chain), the new templates appended to every practice, review and blueprint section that already revised the grade's terms (item counts unchanged, so no pass mark moved), and the unit challenge, grade assessment and review nodes of the grade and the next one.`, "");
L.push("Order and safety:", "");
L.push("* Each lesson's questions draw their wrong options only from older terms or from this lesson and the ones before it, so a question never shows a word the learner has not been taught.");
L.push("* A learner who finished a grade before these lessons existed keeps every completion and finds the new lessons waiting. A `*.book-*` template is not offered to them in a practice, review, challenge or assessment run until every lesson that teaches it is completed (`NodeRunService.taughtToLearner`).");
L.push("* No existing template, concept, lesson file, question fingerprint or blueprint item count changed (pinned by `packages/api/test/terminology-course.test.ts` against fixtures taken from the tree before this work).", "");

// ---- 5. placement
L.push("## 5. Grade placement for teacher approval (Q38)", "");
L.push("The book's grade is where the 1999 list prints a term. This course teaches each new term at the grade where the book prints it, because the course's units follow the book's sections, **not** because that grade is an ABRSM requirement. Where an entry was already taught at a different grade, nothing was moved:", "");
L.push("| Term | Book grade | Course teaches it at | Decision needed |", "|---|---|---|---|");
for (const r of rows) {
  if (!r.taughtAt) continue;
  const tg = Number(/^G(\d)/.exec(r.taughtAt)![1]);
  if (tg === r.entry.bookGrade) continue;
  const where = tg > r.entry.bookGrade ? `Grade ${tg} (${r.taughtAt}), later than the book` : `Grade ${tg} (${r.taughtAt}), earlier than the book`;
  L.push(`| *${esc(word(r))}* (${r.entry.kind}${r.entry.language === "french" ? ", French" : ""}) | ${r.entry.bookGrade} | ${where} | Keep, or move to the book's grade? |`);
}
L.push("");
const referenced = new Set(rows.flatMap((r) => r.entry.termIds));
const extras = [...music.TERMS, ...music.TERMS_G4].filter((t) => !referenced.has(t.id));
L.push(`**Course terms that the book does not list in Grades 1-4 (${extras.length}):** ${extras.map((t) => `*${esc(t.term)}*`).join(", ")}. They are kept (removing one would change stored question identities); a teacher decides whether they stay.`, "");
L.push("**Not changed, on purpose:** the French list is printed with the Grade 4 words in the book and taught at Grade 5 (where the Grade 5 papers test it); the book prints *légèrement* where the course teaches *léger*; *staccatissimo* was a Grade 4 vocabulary entry that no lesson taught, and is now taught with the other touch signs at Grade 2; *più mosso* is a standard direction that the book does not print, used as the opposite of the printed *meno mosso*. Editing `VOCAB_G5` or the older lists would version the Grade 4 and 5 question identities, so each is a teacher decision first.", "");

// ---- 6. the new terms
L.push("## 6. The new terms and signs, for teacher review", "");
L.push("Every meaning, character description and phrase gloss is newly written and provisional. *Phrases* are the short directions the questions use; every word of each is taught by its lesson or an earlier one.", "");
L.push("| Term | Lesson | Meaning | Phrases | Described as (for the “a composer wants …” question) |", "|---|---|---|---|---|");
for (const t of music.TERMS_BOOK) {
  L.push(`| *${esc(t.term)}* | \`${t.lesson}\` | ${esc(t.meaning)} | ${esc((t.phrases ?? []).map((p) => `${p.phrase}: ${p.meaning}`).join("; ")) || "—"} | ${esc(t.character ?? "—")} |`);
}
L.push("");
L.push("## 7. Reproduce", "");
L.push("```", "npm run docs:terms -w @mtp/api                       # this file", "npx tsx scripts/terminology-inventory.ts [--exclude-book]   # the classification (--exclude-book gives the before figures)", "npm run author:terms -w @mtp/api                     # the content overlay (run after any author:gradeN)", "```", "");

const text = L.join("\n");
if (process.argv.includes("--check")) {
  const now = (() => { try { return readFileSync(out, "utf8"); } catch { return ""; } })();
  if (now !== text) {
    console.error("docs/curriculum/TERMINOLOGY_COVERAGE.md is stale: run `npm run docs:terms -w @mtp/api`.");
    process.exit(1);
  }
  console.log("TERMINOLOGY_COVERAGE.md is up to date.");
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
