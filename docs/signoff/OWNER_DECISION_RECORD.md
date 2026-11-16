# Owner decision record: private preview (16 November 2026)

Source: issue [#22](https://github.com/ConForza/music-theory-app/issues/22). Baseline: `main` at `50cb97c` (after PR #21).

The owner is a piano teacher. They accepted the five **directions** below for a **private, invite-only preview**. They did **not** supply exact numbers, so every "still open" item is undecided and no document or code here claims the owner approved an exact exam blueprint. Nothing in this record changes exam behaviour; the code defaults are quoted as they are today.

## The five decisions

### 1. Practice-exam weighting: improve before claiming realistic preparation

**Decision.** Broad topics need better weighting or representation before the app claims realistic exam preparation. "2 questions per outcome + 4 score-reading items" is **not** endorsed as exam-equivalent. Produce a minimal evidence-based blueprint proposal; do not silently change counts.

**Today.** `DEFAULT_PREP.exam.itemsPerOutcome = 2`, `scoreReadingItems = 4`, `secondsPerQuestion = 90` (`packages/api/src/prep-config.ts`). `examBlueprint()` gives every outcome the same `itemCount` (`packages/api/src/prep-blueprint.ts`). Papers today: Grade 1 46, Grade 2 30, Grade 3 28, Grade 4 40, Grade 5 36 questions (`docs/curriculum/PRACTICE_EXAM_COVERAGE.md`). The PR #18 educational review already recommended 3-4 for broad outcomes and 1 for narrow recall (`docs/architecture/REVISION_PLACEMENT_EXAMS.md` section 9, "Raised by the educational review", item 1) and section 8 item 1 left it to a teacher.

**Still open.** Which domains count as broad; how many questions each gets; whether paper length may grow; how the timer follows. Proposal with estimated effects: [FOLLOW_UP_BRIEFS.md](FOLLOW_UP_BRIEFS.md#brief-a-weighting).

### 2. Cumulative knowledge: some earlier-grade material in Grades 3-5 papers

**Decision.** Include some earlier-grade knowledge in Grades 3-5 practice papers. Do not assume ABRSM's paper distribution.

**Today.** Practice papers ask only the grade's own outcomes ("Later papers do not re-test earlier-grade outcomes", REVISION_PLACEMENT_EXAMS.md section 9, Known limitations). The in-course **grade assessments** already carry earlier-grade sections (Grade 2: 4 questions, Grade 3: 6, Grade 4: 5, Grade 5: 7; `content/assessments/grade-{2..5}.json`); that reviewed pool is the natural source.

**Still open.** The fraction, which earlier outcomes, fixed or rotating selection. Narrow proposal with examples: [FOLLOW_UP_BRIEFS.md](FOLLOW_UP_BRIEFS.md#brief-b-cumulative).

### 3. Grades 2-3 score reading: broaden beyond the Grade 1-level generator

**Decision.** Context questions at Grades 2 and 3 should test grade-appropriate concepts, not the shared crotchet / major-key generator.

**Today.** `t.g2.melody` and `t.g3.melody` use the Grade 1 family `fam.score-observation`: a two-bar crotchet melody in 2/4, 3/4 or 4/4 and a major key, asking beats per bar, a marked note and the key. Results say so (`SCORE_READING_SKILLS` in `prep-config.ts`); `packages/api/test/prep-score-reading.test.ts` fails if label and generators disagree.

**Still open.** Which skills at each grade, how many questions, minor-key presentation (Q23). Template and lesson implications: [FOLLOW_UP_BRIEFS.md](FOLLOW_UP_BRIEFS.md#brief-c-score-reading).

### 4. Partial marks: keep all-or-nothing for the private preview

**Decision.** Keep current all-or-nothing marking of multi-part questions for the private preview, disclosed as an app-specific convention. Reconsider part marks later. **No retroactive rescoring.**

**Today.** One mark per question; a multi-part question needs every part right (REVISION_PLACEMENT_EXAMS.md section 4.2, "Scoring rubric"). Learners are told on the exam start screen: "Each question is worth one mark, and a question with several parts needs every part right. These are our own product settings, not ABRSM marking." (`packages/web/src/pages/PrepPages.tsx:155`). `RUBRIC_VERSION = 2`.

**Still open.** Nothing for the preview. If part marks are adopted later: a rubric bump and a rule for older attempts (see Brief A notes).

### 5. Placement and readiness: provisional guidance only; readiness stays off

**Decision.** Placement is provisional guidance, not a qualification or exam prediction. **Readiness estimates are not enabled.** `MTP_SHOW_READINESS` stays unset and `DEFAULT_GATES.readiness = false`. The existing numeric thresholds are **not** formally teacher-approved by this decision.

**Today.** `DEFAULT_GATES = { readiness: false }`; `gatesFromEnv` turns it on only for the exact value `teacher-approved` (`prep-config.ts`); `packages/api/test/prep-gate.test.ts` pins this. No file in the repository sets `MTP_SHOW_READINESS`. Placement lines are `secureRatio 0.8`, `partialRatio 0.5`, `probeItems 6`; readiness lines are 75 / 55 with 80% coverage, 90% answered, two attempts on different days. The placement screen says it is "advice only" (`PrepPages.tsx:45`).

**Still open.** Approval or replacement of every threshold above (REVISION_PLACEMENT_EXAMS.md section 8 items 3-6). Not needed for the private preview because readiness is hidden.

## Earlier owner and teacher decisions: preserved, not re-asked

Recorded in `docs/curriculum/OPEN_QUESTIONS.md` and **not modified** by this work; the worksheet does not ask them again.

| Q | Recorded decision (summary) |
|---|---|
| Q12 | Proceed on the author's decomposition (with the Grade 5 widenings listed there). All 80 outcomes stay `teacherReview: pending`: the owner's decision does not replace a teacher's confirmation. |
| Q21 | Accept both two one-beat rests and one two-beat rest in every grade, with a note to the learner. |
| Q34 | Voice ranges stay as they are; revisit only if a paper asks a voice-range question. |
| Q39 | `t.g5.rewrite-metre` stays optional enrichment and never assessed; no blueprint or threshold change. |

The other 35 questions remain open for a teacher. They were not re-reviewed here; see [matrix/OPEN_QUESTION_LINKS.md](matrix/OPEN_QUESTION_LINKS.md).

## Release strategy and what stays truthful

* **Private, invite-only preview first.** No public launch, deployment or blanket teacher approval is authorised.
* No claim of ABRSM endorsement, an official exam simulation, formal syllabus certification or pass predictions (`PREP_DISCLAIMER` already says so).
* `content/release.json` stays exactly: `status: "draft"`, `teacherReview.status: "pending"`, `reviewer: null`, `signedOffAt: null`, `publishedAt: null`, version `0.2.1`. This PR does not edit it.
* Private-preview gates versus public-release gates: [RELEASE_GATES.md](RELEASE_GATES.md).
