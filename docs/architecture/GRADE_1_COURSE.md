# Grade 1 course (Brief 05)

The complete Grade 1 path: 38 lessons, 7 unit practice nodes, 7 unit reviews, 7 unit challenges and the Grade 1 assessment. Coverage and verification tables are generated in [GRADE_1_COMPLETION_AUDIT.md](../curriculum/GRADE_1_COMPLETION_AUDIT.md); the material for a teacher is in [GRADE_1_TEACHER_REVIEW_PACK.md](../teacher/GRADE_1_TEACHER_REVIEW_PACK.md).

## Content pipeline

```
packages/api/scripts/grade1/u1..u7.ts   compact lesson specs (hand-written teaching copy, notation builders, question picks)
packages/api/scripts/author-grade1.ts   builds content/lessons/G1-*.json, links them in content/path/grade-1.json,
                                        and DERIVES the practice and review bindings from the lessons
packages/engine/src/generate/grade1.ts  Grade 1 generators (one per new template)
content/exercises/templates/grade-1.json   templates (all `draft`)
content/policy/review-constraints.json  concept-level teaching boundaries
content/assessments/grade-1.json        unit challenge and Grade 1 blueprints (version 2)
```

* A lesson's independent questions are **picked from the generators** inside the lesson's own taught scope and **frozen** as fixed items with stable ids (`i.g1-u4-l03.ind-2`). They only change when the lesson's `contentVersion` is bumped, so a learner's history stays valid. `G1-U3-L03` keeps every original item id and wording; three independent questions were appended and its version moved from 2 to 3.
* Everything musical in an item (answers, accepted alternatives, feedback categories) comes from the Brief 03 rule set; the picker only chooses which seed to keep. `npm run validate` re-derives every answer.
* New choice questions can carry a per-option `diagnoses` map (schema change, optional): choosing a particular wrong option returns a specific mistake category and reason (for example "counted from the top", "accidental carried over the bar-line", "dot misread").

## Runtime

`NodeRunService` (`packages/api/src/node-run.ts`, migration `007_node_sessions.sql`) plans each run on the server from the node's bindings (practice, review) or its blueprint (challenge, assessment): deterministic seeds from learner, node and run; questions the learner has already met are avoided while fresh ones exist; the template, version, seed and generation fingerprint are stored so a question can be reproduced, and a question whose generator changed is replaced rather than regraded. Routes: `POST /api/nodes/:id/start`, `GET .../session`, `POST .../hint` (practice only), `POST .../attempts`, `POST .../complete`, and `GET /api/results`. Answers are never sent to the browser. The web app routes `/lesson/:id` to the lesson player or the node player by the course view's `playKind`.

## Mastery capacity

`mastery-audit.ts` samples every bound template inside every concept's boundary and counts distinct question identities per question type. `mastery-audit.test.ts` fails the build if any Grade 1 concept has fewer than 10 distinct questions or fewer than two question types with at least 3 each. Brief 04's thresholds are untouched. 23 templates were added so that each concept has at least two genuinely different ways of being asked (for example reading a position and writing one; naming a term and recognising a sign; building a scale and finding the missing note).

## Testing

* `grade1-course.test.ts`: all 60 nodes playable; the whole of Grade 1 played start to finish with the preview waiver on and off; a failed assessment is recorded, earns nothing and can be retaken; the first answer in a challenge is final; the taught-scope sweep.
* `node-run.test.ts`: strict prerequisites, grandfathered open runs, Grades 2-5 unchanged, practice behaviour, hints as non-evidence, concept crediting, idempotent attempts.
* `e2e/g1.mjs`: real-browser journeys (new account, first lesson with a wrong answer, a unit's practice/review/challenge, resume, delayed revision with the test clock, the Grade 1 assessment below and then above the pass mark, five viewports with axe, keyboard-only, dark mode, reduced motion, 200% text at 320px, sound off).
* The Brief 02-04 suites run unchanged against a frozen copy of the Brief 04 content (`packages/api/test/fixtures/legacy-content`, `MTP_CONTENT_ROOT` for the browser suites; ignored in production).

## Scope decisions worth knowing

* C major is available from the first lesson (it needs no signs), and the treble clef from the stave lesson, so earlier lessons can show a stave and a key. The three simple time signatures are available from the bar-lines lesson.
* Intervals are by number above the tonic only; triads are root-position tonic triads; no Grade 2-5 material is introduced.
