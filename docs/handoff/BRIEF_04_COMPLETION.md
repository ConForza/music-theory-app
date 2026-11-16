# Brief 04 completion handoff

**Scope delivered:** XP ledger, daily goal and streak, concept-level mastery, adaptive spaced review with remediation, badges, the Review screen, and the updated dashboard, lesson-complete and progress screens. Rules and decisions: [PROGRESSION.md](../architecture/PROGRESSION.md). Browser evidence: [docs/evidence/brief-04](../evidence/brief-04/README.md).

## For Brief 05–09 (course content)

* Add lessons as before; nothing in progression is hard-coded to the two playable lessons.
* **Mastery evidence comes from your lesson's `independent` items**, attributed to the concept ids of the node's `exercises[].conceptIds` for that template. To let a concept reach *proficient* you need **independent items from at least two different templates** bound to that concept (the policy's `minDistinctTemplates: 2`), and at least four items in all. For *mastered* the concept also needs **review**: so bind at least two **generator templates** (86 of 90 have one) to the concept in a lesson that teaches it. A concept with one template can be practised but never proficient (this is the case for `c.cadences.chord-choice` today).
* Review reads the node's binding scope, so bindings must narrow each template to what the lesson taught (the validator already enforces this).
* A guided step with `evidence: "learning"` never counts, whatever you write in `mastery.countsAsEvidence`.
* **Distinct questions matter.** Mastery counts distinct *question identities*, not seeds: give each concept enough distinct questions (a template whose generator can only produce a handful inside the teaching boundary cannot reach mastered). Add a boundary to `content/policy/review-constraints.json` when a concept is narrower than its lesson's binding scope.
* Turn on the badge conditions by authoring the nodes/concepts named in `content/policy/achievements.json` (the file validates ids at start-up).
* Unit challenges and the grade assessment will pay XP automatically (15 / 25) once they are playable; the grade-complete badge needs the grade assessment node (Brief 10).

## For Brief 10 (placement, revision, practice exams)

* Placement and assessments must write completion through the same server-verified route (`lesson_progress`) so `computeNodeStates`, XP and activity stay consistent.
* To make assessment items mastery evidence, call `MasteryService.record` with `source: "review-item"` (or add an `assessment-item` source) from a server-graded, no-hint, first-attempt path; never from the client.
* The review scheduler (`ReviewService.due/candidates`) is reusable for "weak concepts" sampling.

## Open decisions for the teacher (all configurable in `content/policy/progression.json`)

1. Proficient / mastered thresholds (4 / 8 correct, 2 templates, 3 days, delayed review).
2. Review intervals (1, 3, 7, 14, 30, 60 days) and `lapseResetsTo: 1` (read as the second interval, 3 days).
3. XP values, the 2-per-node-per-day cap and milestone steps.
4. Whether a daily goal above 3 sessions should be offered (the API allows 5; the UI offers up to 3).
5. Badge list and wording.

## Known limitations

* Only `G1-U3-L03` and `G5-U4-L06` are playable, so only a few concepts accrue evidence and only one badge (*Treble line reader*) can be earned today. The others show "not available yet" rather than a false state. Their machinery is covered by fixtures (see `engagement-data.test.ts`).
* Mastery and review dates use the learner's saved timezone; the web app updates it from the device. A learner who keeps two devices in different zones sees the most recently saved zone.
* Review is per learner and has no audio-based question (`listen-identify` is not authored); everything is operable without sound.
* The Brief 03 golden tables, vocabularies and generator output still await human musical review (see EXERCISE_ENGINE §10); review questions inherit that status.
* Unlocking is unchanged. In particular the preview waiver of unwritten prerequisites (`waiveUnwrittenPrerequisites`) still applies until Briefs 05–09 land.
* `POST /api/test/clock` must never be enabled in production (it needs `MTP_TEST_CLOCK=1` **and** `NODE_ENV=test`).

## Reviewer guide

**Sol Max (code and logic)** — start at:

* `packages/api/src/mastery.ts` (`foldConcept`, pure) and `mastery-service.ts`
* `packages/api/src/engagement.ts` (`classify`, `onNodeComplete`, read models)
* `packages/api/src/review.ts` (selection, stale handling, lapse and remedial flow)
* `packages/api/src/xp.ts`, `activity.ts`, `clock.ts`, `achievements.ts`
* `packages/api/src/progress.ts` (the two hook points: `attempt` records evidence, `complete` rewards, both inside the existing transaction)
* `packages/api/migrations/003_progression.sql`
* Tests: `xp.test.ts`, `mastery.test.ts`, `review.test.ts`, `streak.test.ts`, `engagement-data.test.ts`

Questions worth probing: any path where a client-influenced value reaches `counts`, `xp`, `local_date` or a due date; any way a hinted/revealed/repeated answer is counted; concurrent `complete` / `attempts` / `start`; DST handling in `localDate`/`addDays`; whether `lapseResetsTo` semantics are acceptable.

**Terra (UX/browser)** — `npm run build && npm run e2e:brief04` (set `SHOTS=dir`). Screens: path with the reward strip (`/learn`), lesson completion rewards, `/review` (nothing due, due, mastered), a review question and summary, `/progress`, `/settings` (daily goal). Please check wording for guilt-free tone, 320px / 200% text, dark mode, reduced motion and the keyboard order on the review question (Check → Continue / "Try a similar question").
