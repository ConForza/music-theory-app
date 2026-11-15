# Revision, placement and practice examinations (Brief 10)

> **Practice assessments only.** Everything described here is Music Theory Path's own practice material. It is not an ABRSM examination, it does not follow ABRSM's paper layout, marks or timings (none of which this project has confirmed), and nothing it shows is an ABRSM result, a certificate or a prediction of a pass. Not affiliated with or endorsed by ABRSM.
>
> **Nothing here has been reviewed by a teacher.** Every threshold below is a configurable product default (see [Decisions awaiting a teacher](#8-decisions-awaiting-a-teacher)).

Brief 10 adds three things on top of the finished Grade 1-5 courses, **without a parallel curriculum, grader or progression system**:

| Route | What the learner gets | Where |
|---|---|---|
| **Personalised revision** | Quick review (3, 5 or 10 minutes), weak-topic practice, explore and mixed practice | Review tab, and a "5-minute review" card on the Learn home |
| **Placement** | A short adaptive check that suggests a starting grade and the lessons to catch up on | Onboarding ("I already know some theory" -> "Find my level") and Practice tab -> "Not sure where to start?" |
| **Practice examinations** | A full, freshly generated paper for each of Grades 1-5, in practice mode or as a mock examination (optionally timed), with results, strengths, weaknesses and an estimated readiness | Practice tab; results in Progress -> "Practice results" |

## 1. Audit of `main` before this work

"Implemented / Partial / Missing" is measured against **both** versions of Brief 10: the original development-pack brief (`docs/development/10_revision_placement_and_practice_exams.md`) and the implementation brief for this PR. `main` was `dd4c660` (PRs #16 and #17 merged).

| # | Requirement | Before | After this PR | Evidence |
|---|---|---|---|---|
| 1 | Learning path, three study routes | Implemented (learning); partial (revision); partial (assessment) | Implemented | this document |
| 2 | Spaced review of due topics, errors, remediation | **Implemented** (Brief 04: `ReviewService`, `concept_mastery`) | Reused unchanged | `review.ts`, `docs/architecture/PROGRESSION.md` |
| 3 | Quick review of 3-10 minutes, five-minute option, from home | Missing | Implemented | `revision.ts`, `RevisePanel`, `QuickReviewCard`; `revision.test.ts`; `prep-flows.mjs` |
| 4 | Prioritise weak or due concepts | Partial (due only; "weak" list display only) | Implemented | `RevisionService.insights`; `revision.test.ts` |
| 5 | Avoid repeating identical questions | Partial (per concept seen keys) | Implemented for the whole session and across sessions | `revision.test.ts` "fresh set each time" |
| 6 | Finish early without penalty | Missing | Implemented | `RevisionService.complete`; `revision.test.ts`, `prep-flows.mjs` |
| 7 | Weak-topic practice with explanation / earlier lesson first, improvement shown, weak vs untested distinguished | Missing (display only) | Implemented | `insights`, weak preface, `trend`; `revision.test.ts` |
| 8 | Explore by grade, unit, topic, exercise type; mixed practice; earlier-grade material | Partial (practice lab by template, not by concept) | Implemented | `RevisionService.explore/start`; `revision.test.ts` |
| 9 | Reuse the engine and validated generators | n/a | Done: no new generator, grader or scope rule | `prep.ts`, `revision.ts` call `generateItem`, `gradeResponse`, `taughtUnion`, `ReviewService.generateFor` |
| 10 | Placement in onboarding and later navigation | Missing ("planned for a later release") | Implemented | `PlacementIntro`, `Onboarding`; `prep-placement.test.ts`; `prep-flows.mjs` |
| 11 | Placement: varied original questions, recommended grade, gaps, lessons, lower start free, no badges, not equal to passing, history preserved, efficient, documented and tested calculation | Missing | Implemented | [section 4.3](#43-placement); `prep-rules.test.ts`, `prep-placement.test.ts` |
| 12 | Full Grade 1-5 practice examinations, original generated, representative coverage, score reading, balanced, varied | Missing (grade assessments exist but are in-course completion checks with one question per outcome) | Implemented | [section 4.1](#41-how-a-practice-examination-is-composed); `prep-rules.test.ts`, `prep-exam.test.ts`, `npm run audit:prep` |
| 13 | Practice mode and mock examination mode; optional timing | Missing | Implemented | [section 4.2](#42-modes-timing-and-independence); `prep-exam.test.ts` |
| 14 | Do not copy ABRSM questions, branding, UI; do not claim exact simulation | Policy only | Enforced in copy and tests | `PREP_DISCLAIMER`; `prep-ui.test.tsx`; [section 6](#6-sources-and-originality) |
| 15 | Preserve existing grade-completion contracts (Grade 5: 39 questions, 26/39) | Implemented | Unchanged; asserted | `prep-rules.test.ts` "does not change the existing grade-completion assessment contracts" |
| 16 | Results by outcome; strengths, weaknesses, not-assessed; errors explained; recommendations; progress across attempts; qualified readiness | Partial (assessment results had outcomes and "revisit") | Implemented | `PrepResultPage`, `ResultsPage`; `prep-exam.test.ts`; `prep-exams.mjs` |
| 17 | Readiness never inflated by hints or coaching; never an ABRSM result | Missing | Implemented | [section 4.4](#44-results-and-estimated-readiness); `prep-exam.test.ts` "independent", `prep-rules.test.ts` "readiness" |
| 18 | Persist attempts, seeds, template versions, raw responses, scores, rubrics | Implemented for lessons/nodes; missing for exams | Implemented (`prep_attempts`, `prep_responses`) | `009_prep.sql`; `prep-exam.test.ts` "records seeds, template versions..." |
| 19 | Duplicate requests and retries cannot double-award or corrupt | Implemented (client command ids) | Extended to every new route | `prep-exam.test.ts`, `revision.test.ts` |
| 20 | Interrupted attempts resume | Implemented for nodes/reviews | Implemented for exams, placement, revision (any device) | `prep-exam.test.ts`, `prep-exams.mjs` |
| 21 | Old results keep their meaning when rules or curriculum change | Partial (assessment version recorded) | Implemented (rubric snapshot, versions, "scored under earlier rules") | `prep-exam.test.ts` "a new rubric or curriculum never rewrites an old result" |
| 22 | No leakage between accounts or devices | Implemented | Extended and tested for every new route | `prep-exam.test.ts` "privacy and isolation", `revision.test.ts` |
| 23 | Export and deletion | Implemented | Extended to the new tables (delete via `ON DELETE CASCADE`) | `prep-exam.test.ts` |
| 24 | Accessibility accommodations; audio-off does not affect scores | Partial (sound optional everywhere) | Implemented: extra-time setting; no audio-dependent question can enter an exam; speed is never scored | `prep-rules.test.ts`, `prep-exam.test.ts` "timed" |
| 25 | Simple navigation Learn / Review / Placement / Practice exams / Results, no duplicate sections | Partial | Implemented without a new tab: Practice tab hosts exams and placement; Review tab hosts revision; Progress hosts results | `App.tsx`, `PrepPages.tsx` |
| 26 | Mobile, 320px, tablet, desktop, touch, keyboard, screen reader, large text, reduced motion, dark mode | Existing suites | New journeys in every profile | `prep-exams.mjs`, `prep-flows.mjs` |
| 27 | No leaderboards, teacher accounts, subscriptions | n/a | None added | - |
| 28 | Do not alter progression, XP, badges, pass thresholds or historical results | n/a | Not altered, except the one explicit, tested compatibility decision below | [section 5](#5-compatibility-decisions) |

**Reusable components and contracts found:** `NodeRunService.taughtUnion / pick / gen / creditedConcepts` (scope-bounded seeded generation), `ReviewService.candidates / generateFor / resolve`, `gradeResponse`, `questionKey / visibleKey`, `recordExposure`, `MasteryService.record`, `XpService.award` (source-keyed, capped), `ActivityService`, the client command-id idempotency pattern, `AssessmentTemplate` blueprints (reused as the reviewed template pool per outcome), `course.learnerItem`, the web `Question` / `ActionBar` / `Step` components and the `playNode`-style browser helpers. The only edits to existing server code were: a handful of `private` members made public (so the new services can reuse them), `computeNodeStates` gained one optional argument (section 5), and the profile settings gained one optional field.

## 2. Architecture

```
content/ (unchanged)  --->  prep-blueprint.ts   pure rules: blueprint, placement, levels, readiness
                      \
                       ->   prep.ts             PrepService: exams + placement (plan, answer, hint, complete, accept, results)
engine generators  ---->    revision.ts         RevisionService: insights, quick / weak / explore / mixed sessions
graders, scope rules        prep-config.ts      every product default, versioned (RUBRIC_VERSION, BLUEPRINT_VERSION)
                            migrations/009_prep.sql
web:  PrepPages (hub, setup, placement intro, results), PrepPlayer, PrepResult, Revise (panel, explore, player)
```

### Data model (`migrations/009_prep.sql`, additive only)

| Table | Purpose |
|---|---|
| `prep_attempts` | One row per placement check or practice examination: kind, mode, grade, seed, timing (limit, deadline, extra-time percent), curriculum / blueprint / rubric versions, **planned items** (template, version, seed, generation fingerprint, outcome, credited concepts, `coached` flag), a **rubric snapshot**, and the stored **summary**. At most one open attempt per learner, kind, grade and mode (unique partial index) so starting again resumes. |
| `prep_responses` | Every raw answer: client command id (idempotency key), item, template version, seed, response JSON, correct, mistake category, hints used, attempt number. |
| `prep_hint_uses` | Hints shown (practice mode only). |
| `placement_starts` | Which grade a learner chose to start at after a placement check. Superseded, never deleted. |
| `revision_sessions`, `revision_attempts` | Revision sessions and answers, same shape as the review tables. |

All tables carry `user_id` with `ON DELETE CASCADE`; every query filters by it, so another account's attempt is indistinguishable from one that does not exist (404). The export route includes all of them.

### Routes

`GET /api/prep` (hub), `POST /api/exams/:grade/start`, `POST /api/placement/start`, `GET /api/prep/attempts/:id` (+ `/result`), `POST /api/prep/attempts/:id/{hint,answers,complete,abandon,accept}`, `GET /api/prep/results`, `GET /api/revision` (+ `/explore`), `POST /api/revision/sessions`, `GET|POST /api/revision/sessions/:id[/attempts|/complete|/abandon]`. The server grades everything; no route accepts or returns a correctness claim, a score or an answer key.

## 3. What does not change

* **No XP, streak credit, badge, `assessment_results` row, `lesson_progress` row or `concept_mastery` change is ever produced by a practice examination or a placement check.** `protectedCounts` in the tests asserts this for every flow.
* Revision sessions use the same XP ledger and daily-activity record as Review, keyed `revision:<sessionId>`, so a retried finish pays once.
* Grade-completion assessments, unit challenges and their pass marks (Grade 5: 39 questions, 26 of 39) are untouched and asserted.

## 4. The rules

### 4.1 How a practice examination is composed

`examBlueprint(course, grade, cfg)` (pure; `prep-blueprint.ts`):

* **Every syllabus outcome introduced at the grade** (`abrsm2020.gN.*`, 80 across the five grades) gets `itemsPerOutcome` = **2** questions. Two lets the report tell a slip from a gap.
* Each outcome's templates are those the existing, reviewed grade-assessment blueprint already uses for it, then any other generatable template bound to the outcome. A template of a later grade is never used.
* **Score reading:** `scoreReadingItems` = **4** extra questions from multi-part templates that put several ideas into one piece of notation (melodies, passages, scores: `melody`, `passage`, `passage-directions`, `chord-in-passage`, `score`, `score-melody`). Single-question reads (`melody-detail`, `chord-passage-pick`) are deliberately excluded: they test one idea and count under that idea's outcome.
* Paper sizes with the defaults: Grade 1: 46, Grade 2: 30, Grade 3: 28, Grade 4: 40, Grade 5: 36 questions. (Earlier-grade outcomes are not repeated in a later paper; later grades' templates rest on them and revision/placement cover them: see limitations.)
* **Balance** follows the syllabus: questions per domain = outcomes per domain x `itemsPerOutcome` (tested for each grade).
* **No question twice.** Two questions with the same prompt, music and correct answer are the same question however their options are shuffled (`contentKey`); a paper never contains both. (The first version compared the options, so three of thirty reviewed papers asked the same thing twice.)
* **Selection** (`planOne`): the template used for each question rotates from a position derived from the attempt seed, then seeds are walked for music that is new to the paper and, where possible, new to the learner (everything seen in lessons, practice, reviews, earlier papers and any hint or feedback). Questions are generated inside the grade's cumulative taught scope (`taughtUnion` at the grade's assessment node), exactly as the in-course assessment does.
* **Variation and repeatability:** the seed is stored. The same seed for a fresh learner reproduces the paper; different seeds share fewer than 25% of questions in the tests (see `docs/curriculum/PRACTICE_EXAM_COVERAGE.md` for measured overlap).
* **Access:** a learner can take any grade's practice examination at any time; they do not have to have finished the grade's lessons. This is deliberate: it is also for learners who studied elsewhere.

### 4.2 Modes, timing and independence

| | Practice mode | Mock examination | Placement |
|---|---|---|---|
| Hints | Yes (recorded) | **No** (server refuses) | No |
| Verdict shown | After every question, with explanation | **Never until the attempt is closed** (the reply is only "saved"; no right/wrong sound) | Not until the end |
| Retries | Yes; the first try counts | **First answer is final** | First answer is final |
| Timer | No | Optional | No |
| Counts as independent evidence | **No** | Yes, for questions not previously seen with help | No (advice only) |
| Detailed feedback | Per question | After finishing: outcome table, explained mistakes, worked answers, notation | Gaps and lessons |

* **Scoring rubric (version 1):** one mark per question; a question with several parts needs every part right (the same rule as the in-course assessments); the score is first answer, no hints. These are *product* rules. No ABRSM mark scheme is used or implied.
* **Independence is decided by the server.** A question is independent evidence only if it was answered in a mock, with no hint, as a first answer, **and** it was not one the learner had previously been shown with help or with its answer (lesson guided/hinted steps, hints, practice-mode feedback, remedial answers, any earlier completed attempt's worked answers). The flag set when the paper is planned is only the start: **at completion the server re-checks every question against all help recorded up to the moment it was answered** (practice-lab hints and feedback, a practice exam, a lesson step, an earlier paper's worked answers), so help obtained after the paper started still counts, while help that arrives after an answer does not change that answer. Papers steer away from such questions, so a flagged one is rare, and when it occurs it is scored but never counted as independent (tested by forcing the flag).
* **Rationing.** Planning a paper runs on the server's one thread (about 0.4-3 s), so starting a NEW paper or check is limited to 4 per learner per 10 minutes (60 start requests per address); resuming an open one is always free and abandoning does not reset the count. This bounds the cost; it does not remove it (see limitations).
* **Timing (product defaults, not ABRSM's):** `secondsPerQuestion` = **90**; limit = questions x 90 x (1 + extra-time%). Extra-time choices **0, 25, 50, 100%**, an accommodation saved in Settings (or chosen when starting), needing no explanation and **never affecting a score**: speed is not scored at all. The deadline is stored **on the server**, so closing the page or switching device cannot restart or extend it; answers up to 5 seconds late are accepted for network delay and later ones refused (`time_up`); at time-up the learner's answers are saved and the attempt finishes with unanswered questions reported as "not yet assessed", not wrong. The visible clock is `role="timer"` with `aria-live="off"`; assistive technology is told only at 30, 10, 5 and 1 minute marks and at time-up.
* **Finishing early** is always possible and free: the questions not reached are "not yet assessed", and an attempt that assessed too little of the grade is excluded from the readiness estimate (`low_coverage`).
* **No audio is ever required.** Every exercise family has a recorded "without sound" alternative; templates of mode `listen-identify` are excluded from exams and placement by construction, and sound on/off cannot change a mark.

### 4.3 Placement

`recommendPlacement(results, cfg)` (pure; documented and tested in `prep-rules.test.ts`):

1. **Probes** are taken from Grade 1 upward (Grades 1-4; Grade 5 is the destination). Each probe has `probeItems` = **6** questions, one per outcome of that grade.
2. **Which outcomes** (`probeOutcomes`): chosen by *importance*, the number of later-grade concepts that (transitively) have the outcome's concepts as prerequisites, from the curriculum's own prerequisite graph, with each further outcome from an already-chosen domain discounted (so a probe is varied as well as foundational). Ties break on syllabus order; the choice is deterministic. The chosen outcomes are listed in `PRACTICE_EXAM_COVERAGE.md`.
3. **Levels:** a probe is *secure* at >= 80% right first time without hints, *partial* at >= 50%, otherwise *weak*.
4. **Stop rule:** the check stops at the first probe that is not secure, so it is between 6 and 24 questions, never a full five-grade examination.
5. **Recommendation:** the lowest grade whose probe was not secure; Grade 5 if Grades 1-4 were all secure; if a grade was never probed, the first such grade (never above one that was not asked). Every step of an open check follows the rules it **started** with (the rubric snapshot stored on the attempt), so a later change to the defaults cannot stop it early or change what it recommends. A strong later probe cannot lift a weak earlier one (there is no later probe: it stops).
6. **Gaps:** every missed outcome is listed with the lessons that teach it: `start-here` for the recommended grade, `catch-up` for a lower grade the learner passed overall but slipped on (a "mostly there" Grade 2 probe still lists its slip as a catch-up lesson, as the brief's melodic-minor / compound-time example asks).
7. **What it did not ask:** the result lists, per grade covered, the outcomes the short check did not ask about ("Not checked"), and the wording says plainly that "secure" means the questions asked went well, not that every topic was tested (about 24 of the 64 Grade 1-4 outcomes are probed).
7. **Choosing:** the learner may start at any grade from 1 up to the recommendation, with no penalty; never above what was demonstrated. Choosing sets the profile's selected grade and records a `placement_starts` row.
8. **What placement is not:** it completes nothing, awards no badge or XP, writes no `assessment_results`, and is labelled "advice about where to start". Retaking adds a new attempt; the previous start is marked superseded; lesson progress is untouched (tested with real completed lessons).

### 4.4 Results and estimated readiness

> **Release gate: the readiness classification is OFF by default.** Learners are not shown "Consistently secure / Developing / Needs review", the percentage or the explanation until a deployment sets `MTP_SHOW_READINESS=teacher-approved` (`ReleaseGates` in `prep-config.ts`; any other value, including `true` or `1`, leaves it off). It is a *display* gate, not part of the versioned rubric, so flipping it re-scores nothing. While it is off the server **still records and computes everything**: attempts, responses, independent counts and `PrepService.readinessEvidence()` are unchanged, and switching the gate on reads the same stored attempts (tested on one database with the gate off, then on). Withheld **server-side**, so no client receives a label: `readinessFor` then returns only `{ visible: false, attemptsUsed, ignored, note }`. **Still shown with the gate off:** each attempt's score, the independent percentage, outcome levels, strengths and weaknesses, the explained mistakes, next lessons and revision links, the history and the by-attempt trend. Tests: `prep-gate.test.ts`; browser: `prep-exams.mjs` (gate off by default; one journey with the gate on). **To release it** a teacher should first decide the points under "Readiness release gate: what must be decided" in section 9.

* **Per outcome** (`outcomeLevel`, independent answers only): *Not yet assessed* (no independent answer), *Needs review* (none right), *Developing* (some right, or only one asked), *Mastered* (both of two right). Practice-mode attempts also show a labelled "practice level", which is never evidence.
* **Estimated readiness per grade** (`readiness`, rubric version 2), deliberately cautious. Lines are compared on the exact ratio and only the display is rounded (41 of 55 is 74.5%, below 75):
  * only **mock** attempts count; practice-mode attempts are listed as ignored;
  * only attempts scored under the **current** rubric and blueprint are pooled (older ones keep their own result and say "scored under earlier rules");
  * **an unanswered question is not right.** An attempt needs at least 90% of its *questions* answered (`minAnsweredShare`) and independent evidence for at least 80% of the grade's outcomes; the percentage is out of every question that could have been independent evidence, answered or not (so 10 right out of 13 answered on a 36-question paper is 28%, never 77%);
  * estimate = pooled percentage of the newest 2 qualifying attempts, and the text says how many questions it rests on and that the true figure could easily be 10 points either way;
  * **"Consistently secure" (`on_track`) needs two qualifying attempts on different days, EACH at or above 75%.** A strong paper followed by a weak one (90% then 60% pools to 75%) is "Developing", as is a pair on the same day; >= 55% pooled is "Developing"; below is "Needs review"; with no qualifying attempt it says "Not enough independent evidence yet".
* Outcome levels in an exam result are worded "Right both times", "Developing", "Needs review", "Not yet assessed" (the first was "Mastered"; renamed after review because two questions cannot show mastery, and to keep it apart from concept mastery in Review), with a line saying each outcome rests on only two questions.
* Wording: "Practice assessment", "Estimated readiness", "Consistently secure", "Developing", "Needs review". Never a pass, a certificate, a grade or an ABRSM mark; asserted in tests.
* Errors are explained with the exercise family's own mistake categories ("what went wrong, in plain words"), then the rule that was broken, then the worked answer, after the attempt has closed. Recommendations point at the lesson (and a three-minute revision session) for the concepts of the questions the learner actually missed, not the outcome's first concept; a missed score-reading question, which belongs to no single outcome, produces advice from the concepts it exercised.

### 4.5 Personalised revision

`RevisionService.insights` classifies every revisable topic (a topic the learner has been taught, or sits below an accepted placement) into one status, in this order:

| Status | Rule | Why it is separate |
|---|---|---|
| **weak** | `needsRecovery`, or >= 2 wrong among the last 5 independent answers, or the learner got a question on it wrong in their newest independent mock (only the concepts of the questions actually missed, not every concept of the outcome); that last flag clears once they answer it right first time in at least two revision questions without a miss | repeated errors on their own |
| **due** | its spaced-review date has come | time, not skill |
| **untested** | taught, but **no independent answer yet** (and no mock evidence) | **unknown is not weak** |
| **learning** | some evidence, still building | |
| **solid** | proficient or mastered, not due | |

plus a **trend** (improving / steady / declining) comparing the last three independent answers with the three before. Quick review always fills the requested length: weak, then due, then untested, then learning, then solid, with different templates for one topic and no question the learner has met. Weak-topic practice shows the concept summary, the usual slip and the lesson link **before** the questions, and records its answers as learning (`remedial-step`), never as mastery evidence. Other modes record first answers as the same independent `review-item` evidence Review does, so the spaced schedule keeps working.

## 5. Compatibility decisions

One existing rule gains an optional input, and it is the only change to progression behaviour:

* **`computeNodeStates(course, rows, policy, placedGrade = null)`.** For a learner who has **accepted a placement start at Grade N**, nodes of grades below N no longer block nodes of grade N and above from unlocking. **The waiver applies only to nodes of grade N and above**: a node of an earlier grade keeps its own prerequisites, so placing in at Grade 4 does not open (or let anyone pass) the Grade 1-3 assessments and earn their badges. Those earlier nodes stay exactly as they were: not completed, no badge, no XP. For every learner without an accepted placement, `placedGrade` is `null` and behaviour is byte-for-byte the same (the whole existing progression suite passes unmodified). Choosing a lower grade later, or re-placing, simply moves that boundary; nothing already completed or in progress is touched. Tests: `prep-placement.test.ts` ("choosing a starting grade...", "taking placement again...").

Everything else the brief names as protected (progression rules, XP amounts and caps, badge conditions, pass thresholds, historical results) is untouched. Two existing tests that list the migration files were updated for `009_prep.sql`.

## 6. Sources and originality

The official ABRSM Grades 1-5 theory syllabus is the authority for what is examinable; *First Steps in Music Theory* is a teaching reference only. All questions are generated by this project's own seeded generators from its own templates; no official question, past paper, mark scheme, branding or interface is copied or imitated.

**Past papers, used only for skill coverage and difficulty.** For this PR the supplied Grade 5 paper *"2025 Paper C"* (pages 1-12, the whole paper) was read for the *kinds of skill and the difficulty* only, and checked against the Grade 5 practice-exam blueprint; the earlier, fuller comparison of all supplied papers is [GRADE_5_PAPER_COMPARISON.md](../curriculum/GRADE_5_PAPER_COMPARISON.md) (Brief 09), which this PR did not redo. What the check found:

| Section of that paper | Skills it asks | Grade 5 outcome(s) in the blueprint that cover it |
|---|---|---|
| Rhythm | time signature from a bar (incl. tuplets), compound-to-simple rewriting, durations, grouping, correct rests | g5.01, g5.02 |
| Pitch | note in the tenor clef, enharmonic equivalents, checking a transposition for a clarinet in A, comparing bars at pitch | g5.03, g5.04, g5.05, g5.06 |
| Keys and scales | key signatures in four clefs, key of a melody, completing a harmonic minor scale, chromatic scales, scale-degree names | g5.07 (chromatic scales are a **Grade 4** outcome (g4.x); no Grade 5 template asks them, a gap in the Grade 5 paper that a teacher should decide on) |
| Intervals | name, quality and write simple and compound intervals | g5.08 |
| Chords | chords at cadences, naming cadences, naming inverted chords | g5.09, g5.10, g5.11 |
| Terms, signs, instruments | terms, written-out ornaments, instrument facts | g5.12 to g5.15 |
| Music in context | questions over a cello-and-piano score | g5.16 and the score-reading section |

Every skill seen has an outcome, a template pool and, in the blueprint, two questions, **except chromatic scales**: they appear in the paper's Keys and scales section but are a Grade 4 outcome here, and no Grade 5 template asks them (so the statement in an earlier version of this document that every skill was covered was too strong). Two differences are **deliberate and recorded for a teacher**, not hidden: (1) that paper weights sections by *marks* (Keys and scales 15 of 75, the rest 10) while this blueprint weights by *outcome* (two questions each); (2) that paper is labelled *"2 hours maximum"* and *"75 marks"*. **Neither the marks nor the two hours is adopted**: they belong to a practice paper whose relation to the current online examination has not been independently verified, so the product claims no official weighting or duration. The timer default (90 s per question) is ours and is labelled as such everywhere it appears.

## 7. Verification

| Requirement | Where it is proved |
|---|---|
| 1 Placement recommendations and gap detection | `prep-rules.test.ts` (recommendation table, probe selection), `prep-placement.test.ts` (end to end), `prep-flows.mjs` |
| 2 Full syllabus-outcome coverage for every practice exam | `prep-rules.test.ts` (blueprint), `prep-exam.test.ts` (planned papers, all five grades), `npm run audit:prep` (6 seeds x 5 grades, exits 1 on a gap), `docs/curriculum/PRACTICE_EXAM_COVERAGE.md` |
| 3 Meaningful variation between seeds | `prep-exam.test.ts` (overlap, rotating templates, same-seed repeat), the audit's overlap table |
| 4 Correct marking incl. valid alternatives | `prep-exam.test.ts` ("valid musical alternatives": every accepted spelling, key name, time signature) |
| 5 Timed and untimed behaviour | `prep-exam.test.ts` ("timed and untimed behaviour"), `prep-exams.mjs` (timed mock; extra time; time up) |
| 6 Exam scores independent of hints and coaching | `prep-exam.test.ts` ("practice mode is for learning..."), `prep-rules.test.ts` (readiness) |
| 7 Results persistence, historical compatibility, duplicate protection | `prep-exam.test.ts` ("persistence, versions and compatibility", blind-mode replay and clash tests), `revision.test.ts` (XP once) |
| 8 Revision responds to weak and untested concepts | `revision.test.ts` |
| 9 End-to-end browser journeys for all five grades | `prep-exams.mjs` (a full mock in the browser for each of Grades 1-5) |
| 10 Accessibility and mobile layout | `prep-exams.mjs`, `prep-flows.mjs` (phone, 320px, tablet, desktop, dark mode, reduced motion, 200% text; axe WCAG 2 A/AA on every new screen; keyboard-only) |

## 8. Decisions awaiting a teacher

All of these are product defaults in `packages/api/src/prep-config.ts`, versioned (`RUBRIC_VERSION`, `BLUEPRINT_VERSION`) and copied into each attempt, so changing them never rewrites an earlier result.

1. Is **2 questions per outcome + 4 score-reading questions** a fair, representative paper? Would a teacher weight domains differently, or add earlier-grade outcomes to later papers?
2. The score-reading templates: are they genuinely "combining musical concepts" at the right difficulty for each grade?
3. **Placement:** probe length (6), the secure (80%) and partial (50%) lines, and whether stopping at the first non-secure probe misplaces learners with uneven knowledge.
4. **Readiness:** the 75% / 55% lines, the 80% outcome-coverage and 90% answered-questions requirements, and "two attempts on different days, each at the line, before *Consistently secure*". These are *app* thresholds; none is an ABRSM pass mark.
5. **Timer:** 90 seconds per question and extra time of 25 / 50 / 100%. ABRSM's actual online-paper timings should be verified before any "close to the real thing" wording is ever used.
6. "Weak" (2 wrong in the last 5 independent answers) and the quick-review pace (40 s per question).
7. Wording of the explanations of mistakes (these reuse the existing family feedback, which is itself awaiting review).

## 9. Known limitations

* **Later papers do not re-test earlier-grade outcomes.** A Grade 5 paper asks the 16 Grade 5 outcomes (and Grade 5 questions naturally rest on earlier skills); Grades 1-4 foundations are revisited through placement and revision. ABRSM grades are cumulative, so a teacher may want a small carried-forward section.
* Placement stops at the first non-secure probe, so a learner strong in Grade 3 but gappy in Grade 1 is placed at Grade 1 (they can still revise Grade 3 material through explore after taking those lessons, and can always choose a higher grade from the Grades screen, which is unchanged).
* A learner placed above Grade 1 can *revise* earlier-grade topics straight away, but grade assessments, which sample everything taught up to that grade, may still ask earlier ideas they have not studied. This is by design (they asserted knowing them) and is listed for review.
* Estimated readiness is only as good as the question pool: a few templates (for example some rhythm-writing tasks) have no constructible "wrong answer" for tests, so the browser suites build their deliberate wrong answers only where one exists.
* The browser suites run against a local build; the public CI matrix is the evidence for the shared branch.
* No teacher has reviewed any of this; `npm run validate:release` still fails until one has, as before.

### Raised by the educational review of PR #18, not changed here (owner or earlier-brief decisions)

1. **Weighting.** Two questions per outcome weights every outcome equally; the supplied paper weights Keys and scales at 15 of 75 and the Grade 5 blueprint gives them 2 of 36. The review recommends 3-4 questions for broad outcomes (keys, scales, chords, intervals) and 1 for narrow recall (voices, instrument families), and a carried-forward section of about 15-20% earlier-grade items in Grades 3-5. That changes paper sizes and the blueprint version; it is a teacher decision, recorded here and not made.
2. **Score-reading as one mark.** Multi-part score-reading questions are all-or-nothing and feed no outcome; the review recommends part marks or reporting each part against its outcome.
3. **Grade 2 and 3 score reading tests Grade 1 skills (labelled; broadening is a teacher decision).** `t.g2.melody` and `t.g3.melody` share the Grade 1 generator (`fam.score-observation`): a two-bar crotchet melody in 2/4, 3/4 or 4/4 and a major key, asking only (a) crotchet beats per bar, (b) the name of a marked note, (c) the major key. They never use 2/2, 3/2, 4/2, 3/8, compound time, minor keys, intervals or terms, although the templates' scope allows them. **Not changed in this PR** because that generator also serves Grade 1 and every outcome the two templates are bound to, so broadening it means a decision on which skills a Grade 2 / Grade 3 score-reading question should test, new question wordings (minim beats, dotted-crotchet beats) and a re-audit of the earlier briefs' lessons and assessments that use it. **What was done instead:** every Grade 2 and 3 result now says, under "Reading music in context", exactly what those questions covered and what they do not (`SCORE_READING_SKILLS` in `prep-config.ts`, stored with the result's `scoreReading.skills`), and `prep-score-reading.test.ts` fails if the generators and the label ever disagree. No ABRSM weighting is claimed or invented: the section is still four questions, as for every grade, and which skills and how many questions it deserves is a decision for the teacher.
4. **Question-quality defects from earlier generators, status.** Four confirmed by the educational review are now **corrected, each with a regression test that fails on the old code** (`engine/test/release-blockers.test.ts`, `web/src/test/grouping-text.test.tsx`):
   * Grade 5 key of a melody (`t.g5.score-melody`): the melody now begins and ends on the tonic and, in a minor key, ends with the raised 7th, so the relative key is no longer equally consistent (`withKeyEvidence`); the relative-key distractor explains why it is wrong.
   * Grade 1 middle C (`t.g1.middle-c-find`): the written description said "on a ledger line above the stave" for both C4 and D4 in the bass clef. Descriptions now name the exact line or space (`exactGeom`); the shared `geom()` is untouched so other questions keep their text.
   * Grade 2 note grouping (`t.g2.note-grouping`): the generator and marking were sound (the printed grouping is never already accepted; the reference grouping always is; checked over 300 seeds). The defect was the **grouping editor's** spoken description, which ignored beams and so read identically before and after any join or split. It now says "2 beamed together (quaver, quaver)".
   * Grade 5 terminology (`t.g5.term-use`): "A composer wants the player to grief" came from fitting a glossary meaning into a sentence as a verb. The meaning is now only quoted ("Which of these terms means “grief”?").
   Because each fix changes what a given seed produces, the three generators carry a **per-template revision** in their fingerprint (`TEMPLATE_REVISIONS`, `engine/src/generate/index.ts`): an id minted before the fix is refused as stale (so an open paper is closed with the usual "questions were updated" message) instead of silently regenerating as a different question; every other template's fingerprint is byte-for-byte unchanged (tested). Stored scores, responses and mastery evidence are untouched. **No template needed excluding**, so no outcome lost coverage. Still open and not touched here: some single-glossary-word distractors and generic feedback in older generators (item 4 of the original review), which a teacher should sample.
5. **Near-repeats** of one fact through different templates (for example the same Italian term three times) are not caught by the identity rule above.
6. **Timer.** A flat 90 seconds per question treats a voice question the same as a 15-note scale; it stays optional and off by default.

### Readiness release gate: what must be decided before the gate is switched on

1. A teacher has approved the thresholds in section 8 (items 1 to 4), or replaced them.
2. A teacher has sampled the corrected templates above and the still-open distractor/feedback item, and decided whether Grade 2 and 3 score reading should be broadened (item 3 above).
3. The deployment sets `MTP_SHOW_READINESS=teacher-approved`. Nothing in the code or the rubric needs to change, and no stored attempt is affected.
