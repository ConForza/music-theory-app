# Grade 3 course (Brief 07)

The complete Grade 3 path: 19 lessons, 5 unit practice nodes, 5 unit reviews, 5 unit challenges, the Grade 3 assessment and one optional enrichment node (36 nodes, 35 required). Coverage and verification tables are generated in [GRADE_3_COMPLETION_AUDIT.md](../curriculum/GRADE_3_COMPLETION_AUDIT.md); the material for a teacher is in [GRADE_3_TEACHER_REVIEW_PACK.md](../teacher/GRADE_3_TEACHER_REVIEW_PACK.md). It reuses the Grade 1 and 2 architecture ([GRADE_1_COURSE.md](GRADE_1_COURSE.md), [GRADE_2_COURSE.md](GRADE_2_COURSE.md)) unchanged.

**Source hierarchy.** The 2020 ABRSM outline decides what is examinable at Grade 3. Eric Taylor's *First Steps in Music Theory* (Grade 3 sections 1-12, printed pp. 53-77, and Grade 2 sections 9 and 11 for the melodic minor) guided topic order, depth and conventions; the pages were read directly in the PDF. All teaching copy, examples and questions are original. Anything the pages did not make certain is listed in the teacher pack and avoided in questions.

## Content pipeline

```
packages/api/scripts/grade3/u1..u5.ts   compact lesson specs (teaching copy, notation, bindings, question picks)
packages/api/scripts/grade3/e1.ts       the optional upbeat lesson (fixed questions)
packages/api/scripts/author-grade3.ts   writes lesson bindings into content/path/grade-3.json, builds content/lessons/G3-*.json,
                                        DERIVES practice and review bindings, updates the blueprints (version 2)
packages/engine/src/generate/grade3.ts  Grade 3 generators (one per new template)
content/exercises/templates/grade-3.json  14 Brief 01 templates + 23 new ones (all `draft`)
content/policy/review-constraints.json  concept boundaries for Grade 3 concepts
content/assessments/grade-3.json        five unit challenges and the Grade 3 blueprint (version 2)
packages/api/scripts/grade3-docs.ts     generates the audit and the teacher pack (`npm run docs:grade3 -w @mtp/api`)
```

The lesson schema allows six explanation blocks, so `author-grade3.ts` fits each spec (joins text, folds the tip, drops the last example and logs it). Questions are picked from the generators inside each lesson's own taught scope and frozen with stable ids.

## What changed in shared code

| Area | Change | Why it cannot disturb Grades 1-2 |
|---|---|---|
| `curriculum/music/rhythm.ts` | a half-bar rest (beats 1-2 or 3-4) is accepted in 12/8, as in 4/4 | only the rest check in compound quadruple time; note rules are untouched; the golden-key test still passes |
| `question-key.ts` | new concept-boundary field `intervalQualities`; `keyOf` reads `t.g3.*` key answers and "melodic minor" prompts; Grade 3 templates are option-order-insensitive | no Grade 1-2 constraint uses them; Grade 1-2 identities are untouched |
| `grade2.ts` | helper functions exported | no behaviour change |
| `generate/index.ts` | Grade 3 generators registered | |
| `scope-concepts.json` | `maxLedgerLines: 4` introduced with the extended-ledger concept | Grade 3 only |
| Brief 01 Grade 3 templates | `time-signature`, `bar-complete`, `compound-grouping` gained `rests`, `noteValues`, `maxDots` (and `ties`) so bindings can hold back untaught material | Grade 3 content was not playable before; the planned Grade 4 review bindings state the new dimensions |
| `mastery-audit.ts` | `c.metre.anacrusis` allow-listed (optional, fixed questions) | one more pinned exception, tested |

## Decisions worth knowing

* **Ambiguous time signatures.** The existing `t.g3.time-signature` generator rejects rhythms that fit another signature in scope, once beaming is read. An engine test checks, for every generated rhythm, that the set of signatures in scope that fit equals the accepted set.
* **Compound rests (Q4, Q25).** Both forms of a silent dotted-crotchet beat are taught, asked and accepted. The half-bar dotted-minim rest of 12/8 is accepted and taught. Partly silent beats and a two-beat note in the middle of 12/8 are never asked.
* **Demisemiquavers (Q26).** Never more than four in a row inside a beat.
* **Octave signs.** Drawn as text: `8va` above the first bar, `8vb` under the first note, always repeated in the prompt and description. Not an engraved bracket.
* **Octave transposition.** `octave-pick` always offers the same pitch in the other clef as a wrong option; the existing `octave-transpose` grader is tested to refuse unmoved pitches.
* **Melodic minor.** Taught in A, E and D minor first (G3-U4-L01), then B, F♯, C♯, G, C, F. The Grade 2 preview concept is not used. Melodic-concept credit requires the prompt to name the melodic minor, so harmonic questions never count for it.
* **Intervals.** Above the tonic only, quality and number. The 6th and 7th of a minor key are never asked by key.
* **Terms (Q2).** The vocabulary has six Grade 3 terms; it was not extended because it is part of every generation fingerprint.
* **Assessment.** 32 questions a run: 2 per outcome, 1 more on octave signs (so the extended-ledger section is only about notes beyond the stave), 3 for g3.08 (so melodic minor is always present), and 6 from Grade 2. Pass marks unchanged.

## Testing

`engine/test/grade3-answers.test.ts` (independent derivation of every new answer), `api/test/grade3-course.test.ts` (36 nodes, progression, failed/passed challenge and assessment, retake, interruption, scope and later-unit-wording checks, boundaries, octave and rest grading through the real grader), Grade 3 block in `mastery-audit.test.ts`, and `web/e2e/g3.mjs` (real-browser journeys on five viewports, keyboard, dark mode, reduced motion, 200% text at 320px, notation descriptions).

## Review round 1 (independent review of PR #11)

* **Assessment size.** `author-grade3.ts` appended the Grade 2 sections on every run, so the committed blueprint had 67 questions (42 from Grade 2). It now replaces its own sections, rebuilds the blueprint from the planned one, and a test pins unique section ids and exactly 32 questions (6 from Grade 2).
* **Extended ledger lines.** The octave-sign templates have their own single-question section (`o-g3-04b`); the `o-g3-04` section draws only ledger-line templates, and a test requires extended-ledger credit in every generated run.
* **Rest writing.** `compound-rest-write` lists every accepted ending (dotted-crotchet rest, crotchet plus quaver rest, and in 12/8 the half-bar rest) and no longer accepts "any bar that adds up", so a sounded note in a silent beat is wrong (tested through the real grader).
* **Octave-sign playback.** Fragments carry an optional `octaveShift` (8va = 1, 8vb = -1). Notation stays at the written octave; full playback and tapping a note sound it 12 semitones away (unit test).
* **Descriptions.** The new ledger questions describe the exact line or space ("on the 3rd ledger line above the stave", "in the space below ...").
* **Browser driver.** Staff taps wait for the stave to settle and retry once; the reviewer also found the fixed action bar could cover the tap point, so the helper scrolls the stave into view first.
