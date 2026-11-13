# Grade 2 course (Brief 06)

The complete Grade 2 path: 24 lessons, 5 unit practice nodes, 5 unit reviews, 5 unit challenges, the Grade 2 assessment and one optional enrichment node (41 nodes, 40 required). Coverage and verification tables are generated in [GRADE_2_COMPLETION_AUDIT.md](../curriculum/GRADE_2_COMPLETION_AUDIT.md); the material for a teacher is in [GRADE_2_TEACHER_REVIEW_PACK.md](../teacher/GRADE_2_TEACHER_REVIEW_PACK.md). It reuses the Grade 1 architecture ([GRADE_1_COURSE.md](GRADE_1_COURSE.md)) unchanged.

## Content pipeline

```
packages/api/scripts/grade2/u1..u5.ts   compact lesson specs (teaching copy, notation, bindings, question picks)
packages/api/scripts/grade2/e1.ts       the optional melodic-minor preview (fixed questions)
packages/api/scripts/author-grade2.ts   writes the lesson bindings into content/path/grade-2.json, builds content/lessons/G2-*.json,
                                        DERIVES the practice and review bindings, and updates the blueprints (version 2)
packages/engine/src/generate/grade2.ts  Grade 2 generators (one per new template)
content/exercises/templates/grade-2.json  16 Brief 01 templates + 20 new ones (all `draft`)
content/policy/review-constraints.json  concept boundaries for Grade 2 concepts
content/assessments/grade-2.json        five unit challenges and the Grade 2 blueprint (version 2)
packages/api/scripts/grade2-docs.ts     generates the audit and the teacher pack (`npm run docs:grade2 -w @mtp/api`)
```

* Lesson bindings come from the specs, so a lesson's questions, the unit's practice and the reviews cannot drift apart. Unit practice = what the unit's lessons taught. Review 1 keeps its planned Grade 1 foundations; reviews 2 to 4 revisit the units before them; review 5 revisits all five units and the Grade 1 melody template.
* Lesson questions are **picked from the generators** inside the lesson's own taught scope and **frozen** with stable ids, exactly as in Grade 1.
* Cumulative scopes alternate Grade 1 and Grade 2 keys: the scale, signature, triad and degree questions of the practice and review nodes draw on C, G, D, F and the new keys together.

## What changed in shared code (all additive or Grade 2-only)

| Area | Change | Why it cannot disturb Grade 1 |
|---|---|---|
| `node-run.ts` taught scope | `teachingNodesBefore` includes earlier grades' lessons (`grade <= node.grade`) | identical for Grade 1; lets the Grade 2 assessment draw its "earlier grades" section |
| `question-key.ts` | new concept-boundary fields `timeSignatures`, `promptIncludes`, `termIds`; `keyOf` reads minor keys; `t.g2.*` new templates are option-order-insensitive | no Grade 1 constraint uses the new fields; the Grade 1 identity set is untouched; the answer-key branch applies to `t.g2.*` only |
| `grade1.ts` | helper functions exported (no behaviour change) | generated questions and fingerprints are unchanged (Grade 1 docs regenerate byte-identical) |
| `graders/theory.ts` | when a question's scope does not include the other minor form, the "wrong minor form" feedback does not name it | wording only; Grade 3+ scopes still name the melodic minor |
| `schema.ts` | lesson-content id may end in `E<n>` (the enrichment node) | widening only |
| `scope-concepts.json` | A, E and D minor are introduced by `c.scales.minor-concept` (was: the harmonic concepts) | Grade 2 only; see below |
| web `NodeRun.tsx` | the assessment screens name their own grade ("Grade 2 assessment") | Grade 1 wording unchanged |

## Decisions worth knowing

* **Minor keys and the introduction table.** The planned order (minor idea, relative keys, harmonic form, A/E/D scales) needs A, E and D minor as tonics from the first minor lesson, but the introduction table made them available only at the harmonic-minor lessons. They are now introduced by the first minor concept. The natural-minor pattern is a stepping stone (asked only as tone / semitone steps, never as a scale to write); the form asked in Grade 2 is the harmonic minor.
* **Melodic minor** is not in any binding, blueprint, practice or review; its only appearance is the optional G2-U4-E1 preview, whose template has no generator and no place in a blueprint, whose concept has no generated questions, and which pays only the 5 XP enrichment award. The scale grader's feedback no longer names the melodic minor in Grade 2 scopes.
* **The planned lesson bindings of Brief 01 were placeholders** (for example a relative-key binding without the minor keys, harmonic-minor bindings with `keys: []`). They were rewritten from the lesson specs; the Brief 01 templates are kept and still used.
* **Empty signatures.** "Write the key signature of C major / A minor" has nothing to write and cannot be submitted. The shipped `t.g2.key-signature` generator is not changed (a Brief 04 guard test pins every generator-backed question key), so those two keys are simply left out of its bindings; their signatures (no signs) are taught and asked through `t.g2.key-facts`.
* **Rest rules.** The checker accepts both two crotchet rests and one minim rest for a silent half of a 4/4 bar. Questions never depend on that: the half-bar rest is asked as "fill the half with a single two-beat rest" and the middle-of-the-bar minim rest is the error to fix. Dotted rests are never used.
* **Intervals** are by number above the tonic only; the 7th of a minor key is never asked (the form would be ambiguous).

## Mastery capacity

`mastery-audit.test.ts` now also audits Grade 2 (`auditCapacity(course, nodes, 2)`): every required concept has at least 10 distinct questions across at least two types with 3 or more each. The optional preview concept is the single allow-listed exception, with a test that it has no generated evidence. Concept boundaries (which question counts for which concept when a template serves several) are in `review-constraints.json`.

## Testing

* `engine/test/grade2-answers.test.ts`: every new answer re-derived from the printed notation and prompt with the rule functions, plus hand-typed musical facts.
* `api/test/grade2-course.test.ts`: all 41 nodes playable; the whole course and assessment played from the first lesson with Grade 1 history untouched; failed challenge / assessment complete nothing and pay nothing, retakes work; interrupted run resumes with the same questions; first answer in a challenge is final; the preview is optional and never assessed; every generated question fits its node's taught scope; no lesson repeats a question; no unenterable question.
* `web/e2e/g2.mjs`: real-browser journeys (a learner from Grade 1, Unit 1 end to end including revision days later, one lesson from each later unit, practice for each unit, resume, the complete progression to the assessment below then above the pass mark, the optional preview, five viewports with axe, keyboard-only, dark mode, reduced motion, 200% text at 320px, notation descriptions).
* The Brief 02-05 suites run unchanged; the one test that asserted "Grades 2-5 are unreachable" now asserts Grade 2 is locked behind `G1-U7-R1` and Grades 3-5 are unchanged.
