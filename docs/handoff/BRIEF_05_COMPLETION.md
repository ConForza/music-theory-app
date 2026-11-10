# Brief 05 completion handoff: Grade 1

**Delivered:** all 60 Grade 1 nodes are playable (38 lessons, 7 practice, 7 review, 7 unit challenges, the Grade 1 assessment); a server-side runtime for the four generated node kinds; 23 new Grade 1 templates with generators and per-option misconception feedback; a mastery-capacity audit with a failing test; a full Grade 1 API journey test; real-browser Grade 1 journeys; the completion audit and teacher review pack (generated). Architecture: [GRADE_1_COURSE.md](../architecture/GRADE_1_COURSE.md). Progression rules: [PROGRESSION.md](../architecture/PROGRESSION.md) section 8.

**Not done, by design:** no teacher has reviewed anything; nothing is approved or "production-ready". Placement tests, the practice-exam system and the broader readiness estimates remain Brief 10. No novice-learner session has been run.

## For Brief 06-09 (Grades 2-5)

* Reuse `author-grade1.ts`/`lib.ts` as a pattern: lesson specs in `scripts/grade<n>/`, practice and review bindings derived from the lessons, questions picked from generators and frozen.
* Run `npm run audit:mastery -w @mtp/api` while authoring; the capacity test generalises (`auditCapacity(course, nodes, grade)`).
* Add a concept boundary to `review-constraints.json` whenever a template's scope is wider than one concept (the credited-concepts filter depends on it).
* Grade 2's first node depends on `G1-U7-R1` (the previous grade's last review), as the unlocking policy says. Make Grade 2 nodes playable only together with their lessons.
* Avoid editing existing template data or generator behaviour: either changes generation fingerprints (stored ids go stale). Add new templates instead.

## For Brief 10 (placement, revision, practice exams)

* **Reuse `NodeRunService`.** Planning (`plan`), taught-scope resolution (`taughtUnion`), concept crediting (`creditedConcepts`), stale-question replacement, first-answer-final grading and the result summary are generic over a blueprint (`AssessmentTemplate` sections). A placement test or full practice exam can be a new blueprint plus a new `SessionKind` rather than new machinery.
* **`assessment_results`** (migration 007) already stores one row per finished challenge or assessment run with score, pass mark, pass flag and per-section / per-outcome detail (`detail` JSON). Readiness estimates can be computed from it; nothing yet reads it except `GET /api/results` and the result screen.
* **Evidence classification (decision).** Challenge and assessment answers are recorded as `independent-step` (first, hint-free answer), not as a new `assessment-item` source: the policy file lists `assessment-item`, but the database's `mastery_evidence.source` CHECK constraint and `COUNTING_SOURCES` only know the existing values, and a table rebuild was not worth it. If Brief 10 wants assessment answers distinguishable, add the source with a migration and a rules-version bump; existing rows keep their meaning.
* **Open threshold.** `policy.assessments` (70% unit challenge, 66% Grade assessment) is provisional (Q18). Brief 10 owns whether and how a readiness estimate is shown; Brief 05 shows only the run's own score and the not-an-ABRSM-examination statement.
* **Grade completion** is "a passed Grade assessment run" (completes `G1-A` through `lesson_progress`, which the grade badge reads). A weaker rule (for example sampled breadth over several runs) would be a policy change, not a code change.

## Reviewer guide

**Sol Max (code and logic):** `packages/api/src/node-run.ts` (planning, crediting, completion, results), `question-key.ts` (constraints, option-order-insensitive keys), `migrations/007_node_sessions.sql`, `path-state.ts` (grandfathered open runs), `engine/src/generate/grade1.ts` (generators), `curriculum/src/schema.ts` (`diagnoses`). Questions worth probing: any way a hinted or revealed answer could be counted; whether a failed challenge can ever complete a node or pay XP; concurrent complete/attempt; whether a question can reach a learner outside the taught scope; whether `creditedConcepts` over-credits.

**Terra (student experience):** `npm run build && npm run e2e:grade1` (set `SHOTS=dir`). Screens are in `docs/evidence/brief-05/screens`. Look at wording on the challenge and assessment screens (is a below-pass result kind and useful?), the lesson length, and the demonstration screens for rhythm.

**Teacher:** the pack at `docs/teacher/GRADE_1_TEACHER_REVIEW_PACK.md`.

## Known limitations

* `nextNodeForGrade` still recommends an unpassed unit challenge before the next unit's first lesson. Challenges do not gate the path (by design), so this is only a recommendation order. Not changed in Brief 05.

* Teaching quality is untested with real beginners. Synthesised sound only; hairpins, repeat marks, 8va and the common-time sign are not drawn.
* Vocabulary concepts (especially articulation) rest on few facts; variety comes from how they are asked.
* The first answer in a challenge counts; some learners may find that harsh. Pass marks are provisional.
* A bar that is still unfinished cannot be submitted in the rhythm builder, so it cannot be used to answer wrongly on purpose (the test driver works around this).
