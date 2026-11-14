# Terminology completion handoff (Grades 2-4)

**Stacked on PR #13** (Grade 5). PR #13 was still open, not merged, when this work started, so this branch is built on its head (`cb906f3`) and its PR targets that branch. When #13 merges, retarget this PR to `main`; nothing here depends on anything that is not in #13.

**Delivered:** every term and sign that the reference book lists for Grades 1-4 (167 entries) is now taught, practised and assessable. Before: 49 missing, 1 present but untaught, 6 taught but not practised. After: none. The numbers are generated: [`docs/curriculum/TERMINOLOGY_COVERAGE.md`](../curriculum/TERMINOLOGY_COVERAGE.md) (before/after table, reviewer-count verification, teacher-approval list, every new term).

## What was built

* `VOCAB_BOOK` version 1 (`packages/curriculum/src/music/vocabulary-book.ts`): 57 new terms (21 Grade 2, 34 Grade 3, 2 Grade 4) and the eleven lessons that teach them. Meanings, characters and phrase glosses are original and provisional.
* Eleven lessons, inserted after each grade's existing terms lesson as one unbroken chain: `G2-U5-L05` to `L08`, `G3-U5-L05` to `L10`, `G4-U5-L06`. Each has the full lesson structure (three guided and six or more independent frozen questions, a notation example, demonstration, recap, spaced review).
* Six templates (`t.g2.book-terms`, `t.g2.book-use` and the Grade 3 and 4 equivalents), eleven concepts with `termIds` boundaries (so each question credits exactly the lesson that teaches its term), `engine/src/generate/terms-book.ts` for the generators.
* Cumulative revision: the new templates were appended to every practice and review node that already revised the grade's terms (nine nodes, including `G3-U1-R1`, `G4-U1-R1` and `G5-U1-R1`), and to every unit-challenge and grade-assessment section that already listed the grade's terms. **Item counts are unchanged**, so no pass mark and no exact ratio moved (Grade 4 27/41 vs 28/41, Grade 5 25/39 vs 26/39, Grade 3 21/32 all still hold).
* A reference inventory (`content/source-book/terminology-inventory.json`: headwords and ids only), its pre-change snapshot (`terminology-baseline.json`), the classifier (`scripts/terminology-inventory.ts`) and the document generator (`scripts/terminology-docs.ts`).

## How learners, progress and identities are protected

* **Question identities.** No existing template, concept, lesson file or fingerprint changed. `VOCAB_BOOK` joins the generation fingerprint of the `*.book-*` templates only. All 1,501 fingerprints that existed before are pinned in `packages/api/test/fixtures/fingerprints-before-terms.json` (produced on the PR #13 head) and must be identical; every earlier lesson file, template, concept, concept boundary, path node (except the nine below) and blueprint section is pinned by hash in `content-before-terms.json`.
* **Progress.** A learner who finished a grade before these lessons existed keeps every completion. The new lessons are `available` for them (their prerequisite was completed); the later ones wait in the chain. The nine practice and review nodes that gained bindings, and the blueprints that gained templates, take version base + 1 (a refresher is offered, nothing is locked).
* **Learn before assessed.** The path-based taught scope would let a practice, review, challenge or assessment draw a template from its first lesson onward, and a learner who skipped the new lessons has not completed them. `NodeRunService.taughtToLearner` therefore offers a `*.book-*` template only once every lesson that teaches it is completed. Inside a question, wrong options come only from older terms or from this lesson and the ones before it, so a question never shows an untaught word. Tests: `terms-book.test.ts`, `terminology-course.test.ts`.
* **No mastery shortfalls.** The Grade 2, 3 and 4 mastery-capacity audits report 0 shortfalls with the eleven new concepts in them (each has at least 100 distinct questions across two templates).

## Pipeline

`author:gradeN` scripts rewrite the practice, review and blueprint entries they own, so the overlay is applied **after** them: `npm run author:terms -w @mtp/api`. It is additive and idempotent (replaces its own sections by id, sets versions to a fixed base + 1). The Grade 4 idempotency test now runs `author-grade4.ts` and then `author-terms.ts` and requires byte-identical files; `terminology-course.test.ts` runs `author-terms.ts` twice. Documents: `npm run docs:terms -w @mtp/api`, `npm run docs:generate`, `npm run docs:grade2|3|4 -w @mtp/api` (Grades 1 and 5 regenerate unchanged).

## Decisions for a teacher (OPEN_QUESTIONS Q38)

Grade placement is **not** treated as an ABRSM requirement; each new term is taught where the book prints it only because the course's units follow the book's sections. Not moved, awaiting a decision: *andantino*, *espressivo*, *sostenuto*, *con moto* (book Grade 2, taught at Grade 3); *dolce* (book Grade 2, taught at Grade 1); the 24 French words (book Grade 4, taught at Grade 5); *léger* taught where the book prints *légèrement*; the course terms the book does not list; *più mosso* (standard, not printed). Editing `VOCAB_G5` or the older lists would version Grade 4 and 5 identities, so each is a teacher decision first.

## Known limitations

* Practice runs take the bindings in order and plan at most ten questions, so a binding after the tenth is never drawn. `G4-U5-P1` has fourteen bindings; its new-word bindings are reached in the unit review, the challenge, the assessment and spaced review, not in that practice. The classifier models this cap.
* The grade review plans ten questions from some 37 bindings, weakest concepts first, so a given run may not draw a new word; spaced review (concept level) covers revision of each new concept.
* Little words (*con*, *e*, *ma*, *non*, *senza*) have no standard phrase made only of words taught by then, so they are asked in recognition questions only.
* Everything is `draft`. No qualified teacher has reviewed the term lists, meanings, descriptions or phrase glosses. No novice-learner session.

## Review requested

* **Technical:** `engine/src/generate/terms-book.ts` (distractor rules, teaching-order guarantee), `api/src/node-run.ts` (`taughtToLearner`), `api/scripts/author-terms.ts` (idempotency, base versions), the fixtures and `terminology-course.test.ts`.
* **Educational:** `docs/curriculum/TERMINOLOGY_COVERAGE.md` section 6 (every new meaning, description and phrase), the eleven lessons' wording and grouping, the Q38 placements, and whether the *a composer wants …* descriptions fit one term each.
