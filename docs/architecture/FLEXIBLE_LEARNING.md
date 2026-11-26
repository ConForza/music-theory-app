# Flexible learning: Explore lessons and Practise a topic

> Practice material only. Nothing here is an ABRSM examination, result or prediction. Nothing here has been reviewed by a teacher; no syllabus content, musical convention, exam weighting, marking or readiness threshold was changed.

Music Theory Path had one way in: the guided, prerequisite-based path. After testing on real phones, the owner asked for two more, **without weakening the guided path**:

| Mode | What the learner gets | Where |
|---|---|---|
| **Guided learning** (unchanged) | The structured path, prerequisites, unit practice/review/checkpoints, grade assessments, mastery and rewards. Still the recommended route for beginners. | Learn tab |
| **Explore lessons** (new) | Open any written lesson in any grade, in any order. No placement test, no earlier grade or lesson required. Advice about foundations instead of a lock. | Learn → *Explore lessons*; *Explore this lesson anyway* on a locked lesson; *Learn it* links from practice |
| **Practise a topic** (new) | Grade 1-5 → the whole grade (mixed), a practice area, a unit or a single topic → 5, 10 or 20 fresh questions, immediately. No lesson required first. | Practice tab (top), Learn → *Practise a topic* |

Learner-facing wording: **Learn** – study new material; **Practice** – choose what you want to work on; **Review** – revisit material and strengthen your knowledge; **Examinations** – test yourself across a grade.

## 1. Before and after, for the learner

| Situation | Before | After |
|---|---|---|
| A Grade 5 student opens the app for the first time | Must work through Grades 1-4 (or take placement and accept a start grade) before any Grade 5 lesson opens | *Explore lessons* → Grade 5 → any lesson, at once. Placement is still offered, optional |
| A student taps a locked lesson | "Finish the earlier lessons first." Dead end | Same message, plus *Explore it anyway*. Opening it shows "You're exploring ahead of your guided path" and up to three lessons that teach what it builds on |
| A teacher says "practise cadences tonight" | Only possible after finishing the cadence lessons (revision is restricted to taught topics); the practice lab is organised by question type, not topic | Practice → Grade 5 → Cadences → *Cadences in context* → 10 → Start (4 taps from the Practice tab) |
| Repeat the same practice | Navigate the picker again | *Practise again* on the summary: fresh questions, same choice, one tap |
| Topic has few distinct questions | n/a | The session is shorter and says so ("has 4 different questions at the moment… Nothing from other topics has been added") |
| Return to Grade 1 after exploring Grade 5 | n/a | Guided Grade 1 path, selected grade and "next up" are exactly where they were; explored lessons stay completed |
| Tab order | Learn, Review, Practice, Progress | Learn, Practice, Review, Progress (as the brief recommends) |

## 2. The safeguards (the important part)

The brief asks that these be separate. They are, and each is decided by the server:

| Concept | Where it lives | What exploring / topic practice can do to it |
|---|---|---|
| Permission to open a lesson | `ProgressService.openableLesson(…, { explore })` | Explore may open a **written, authored lesson** the guided path has locked. It never opens unwritten content (`coming_soon`) and **never opens a server-built node** (unit practice, unit review, unit checkpoint, grade assessment). |
| Selected grade | `profiles.selected_grade` | Untouched. The Explore and topic pickers have their own grade control that is never saved to the profile (the topic picker remembers its last grade in `localStorage` only, as a convenience). |
| Accepted placement | `placement_starts` | Untouched. Placement remains an optional recommendation. |
| Genuine lesson completion | `lesson_progress.completed_at` | An explored lesson completes through the **unchanged** completion rule (every question right in the current run, at the current content version), and earns that lesson's normal XP, daily activity and its own lesson-attempt evidence. Skipped lessons are never touched. |
| Unlocking the guided path | `computeNodeStates` | An explored completion counts as a satisfied prerequisite **only once its own guided prerequisites are satisfied** (see 2.1). |
| Independent evidence of knowledge | `mastery_evidence`, `concept_mastery` | Topic practice records **none**. Explored lessons record exactly what the same lesson records on the path (its authored evidence levels, hints, attempt counts), for that lesson's own concepts, never its prerequisites'. |
| Unit and grade completion, qualification badges | unit challenge / grade assessment nodes, `assessment_results`, `achievements_awarded` | Unreachable by exploring (2.1). Topic practice never writes them. |
| XP, streaks, achievements | `xp_ledger`, `daily_activity`, `achievements_awarded` | Topic practice: none (the practice-lab rule). Explored lesson: the lesson's normal award, once (source-keyed, as before). |
| Help and answer exposure | `question_exposure` | Every topic-practice answer (`practice-attempt`) and hint (`practice-hint`) is recorded, so the question can never again be fresh independent evidence in Review, revision or a mock examination (`PrepService.helpedKeys` / `coachedItems` and `MasteryService.seenKeys` read this table). Recorded under **both** identities (see 2.2). |
| Personalised revision eligibility | `RevisionService.accessSet` (taught lessons + below placement) | Unchanged. Topic practice is a separate activity, not a removal of taught-scope enforcement. A lesson genuinely completed through Explore is "taught", so it becomes revisable like any completed lesson. |

### 2.1 Why exploring cannot unlock assessments

The guided path is a chain: `L01 → L02 → … → P1 (unit practice) → R1 (unit review) → C (checkpoint)`, the next unit's `L01` hangs off `R1`, and the grade assessment hangs off the last unit's `R1`. If an explored completion simply counted as "complete", finishing the **last lesson of a unit** out of order would open that unit's practice, then review, then checkpoint — and by the same chain, finishing the last lesson of the grade would open the **grade assessment and its badge**.

So migration 010 adds `lesson_progress.explored`, set **by the server** (never a client field) when a learner starts a lesson through Explore **while the guided path has it locked**. `computeNodeStates` then treats a completed node as a satisfied prerequisite if it was not explored, or if its own guided prerequisites are satisfied (computed in path order, so the rule chains). Consequences, all tested:

* Exploring and completing every lesson of Grade 5 Unit 3 and Unit 5 out of order leaves `G5-U3-P1/R1/C`, `G5-U5-P1/R1/C` and `G5-A` locked, refuses `/api/nodes/*/start`, writes no `assessment_results` and awards no grade badge.
* The chain **heals by itself**: a learner who explored `G1-U1-L02` and later completes `G1-U1-L01` finds `G1-U1-L03` open, with no replay.
* An explored lesson left part-way is never the guided "next step" (`nextNodeForGrade` skips `outOfSequence`), so exploring cannot move the learner's guided destination or the dashboard recommendation.
* Exploring a lesson that the guided path already has open is ordinary guided study (`explored` stays 0).
* Every row written before migration 010 has `explored = 0`, so for existing learners `computeNodeStates` is byte-for-byte the old rule (including the placement waiver and the unwritten-prerequisite waiver).

Guided progress (grade and unit "steps complete", the Learn page) counts only completions the guided path recognises; explored completions are reported beside it (`exploredNodes`, "2 explored ahead") while lesson totals and XP stay genuine. When the guided path has no next step in a grade because it is waiting on earlier steps, Learn says what it is waiting for instead of claiming the grade is done.

`NodeProgress` gains `outOfSequence` (explored, prerequisites still unmet) and `waitingFor` (the guided prerequisites it is still waiting for), used by `nextNodeForGrade` and by the screens: an explored lesson carries an **Explored** tag (a corner badge on the path, spoken in its label; a pill in the unit list and node sheet), and a lesson locked behind it never asks the learner to "finish" a lesson they already completed. It names the real missing step: "Finish “G flat major and E flat minor” first. “Chromatic intervals”, which you've already explored, will count then." Every caller of `computeNodeStates` now reads rows through one shared query (`PROGRESS_ROWS_SQL`); before this change the server-built-node service read its own narrower column list, which would have silently ignored the new mark.

### 2.2 Help is recognised whatever the option order (review of PR #26, P1)

The reviewer showed that a learner could open a Grade 1 mock, see the worked answer to the same minim-rest question in topic practice with its options reordered, and then have the mock count that answer as independent. The cause was older than this PR: help and evidence were matched on `questionKey`, which for templates from before Brief 05 keeps the option order (and some sampled worked solutions) so that history stored by those briefs still matches. Practice reorders options; the mock did not recognise the question.

Migration 011 adds a nullable `visible_key` (the existing order-insensitive `visibleKey`) to `question_exposure` and `mastery_evidence`. Every new record of help or evidence stores both identities (`exposeItem`, `NewEvidence.visibleKey`), and every decision about independence or novelty treats a question as met if **either** identity matches **either** stored identity:

* mock planning (`helpedKeys`, `metKeys`, the `coached` flag; planned items now carry `visibleKey`);
* mock scoring at completion (`coachedItems`: help at or before the first answer, under either identity; a paper planned earlier derives the visible identity from its stored seed);
* mastery novelty (`isFresh`, `creditedFresh`, the fold's distinct-question count) and the "prefer new questions" sets used by Review, revision, unit practice and topic practice.

Legacy rows keep matching by `question_key` exactly as before. A one-time backfill (`backfillVisibleIdentity`, recorded in `data_backfills`) gives earlier practice-lab exposures and supported lesson evidence their visible identity, then withdraws "fresh" from any evidence row that the learner had in fact met with help earlier. Generated questions recorded before this change in unit-practice hints, practice-exam feedback and review remediation cannot be regenerated without their run's scope and keep matching by their exact identity; that residue is listed in the backfill's detail. Regression: help on a reordered copy after a mock opens and before its first answer makes the question coached (the test fails without the fix: 0 coached instead of 1).

## 3. Practise a topic: how questions are chosen

`packages/api/src/topic-practice.ts` (`TopicPracticeService`). No new generator, grader, scope rule or curriculum list.

* **What a grade offers** is derived from the curriculum: the concepts taught by that grade's playable lessons (and enrichments) that have at least one generator. Grades differ (Grade 1: 41 topics in 7 areas; Grade 5: 29 topics in 10 areas; Cadences appears only in Grade 5, and so on).
* **Practice areas** group the curriculum's own `domain` enum into learner headings (`PRACTICE_AREAS`): Notes, clefs and notation (pitch, clefs, accidentals); Rhythm, rests and time signatures (rhythm, metre); Keys, scales and key signatures (scales, keys); Intervals; Chords and harmony; Cadences; Transposition; Musical terms and signs (terms, ornaments); Score reading (context); Instruments and voices. This is a presentation mapping of a fixed schema enum, not a topic list: an area with nothing at a grade does not appear. Units come straight from the path.
* **Which questions**: for each topic, `ReviewService.candidates(concept, that grade's lessons)` — the templates bound to the lesson that teaches it, **in that lesson's effective teaching scope** — and `ReviewService.generateFor`, which enforces the concept-level boundary (`satisfies`) and walks seeds deterministically. So a Grade 5 topic is asked exactly as the Grade 5 lesson frames it. A grade's "mixed" practice is that grade's topics, interleaved across areas.
* **Identity is what the learner sees.** A question's options can be reordered by its generator; to the learner that is the same question. Availability, de-duplication within a session and the preference for questions the learner has not met all use the order-insensitive `visibleKey` (review of PR #26, P2), so a 20-question session shows 20 questions that look different, and the advertised count is the number of genuinely different questions.
* **No seed search on the request thread.** The review pools sampled at start-up now record, for every question type, each different (visible) question with a seed that reproduces it inside the lesson's scope and the topic's concept boundary (`ReviewService.candidateQuestions`). Starting a session picks from those and generates only the questions it keeps: about 50 ms for 20 Grade 5 *SATB in short and open score* questions (2.2-3.5 s before), 5-75 ms for small topics, areas and mixed grades. The pools are shared per loaded curriculum.
* **Fresh repeats**: questions the learner has already met (either identity, including earlier topic practice) come only after every new one, so *Practise again* brings different questions (tested: zero overlap on a topic with enough variety).
* **Insufficient variety is explicit, and shown before starting.** The overview gives every topic, area, unit and grade an `available` count: the number of different questions it can supply, or `null` when it can fill 20 (`ReviewService.distinctUpTo`, learner-independent and cached; it reads the review pools production already samples at start-up, about 30 ms for every topic of every grade). The picker shows "only 4 different questions" on such a topic, does not offer counts it cannot fill (the smallest count always stays available), and says what will happen before Start. A topic stops as soon as it has given that many, and the session still carries `shortfall: { requested, available }`, shown on the first question, as a backstop. It is **never padded from another topic**. Measured: Grade 2 *Melodic minor preview* gives 4 different questions; Grade 1 *Treble clef space notes* 10. With pool warming turned off (`MTP_WARM_POOLS=0`, local development only) the first Practice page load samples instead, about 6 s once per process.
* **Playing**: server grading; hints (logged); the engine's feedback and reason on every answer; the worked answer after three wrong tries (the existing `REVEAL_AFTER_WRONG`); "Move on"; "Not sure? Learn it" (opens the teaching lesson in Explore mode); "Finish now" at any time.
* **Summary**: first-attempt accuracy (a hinted answer is not first-attempt), per-topic results, the questions missed first time with what went wrong and the worked answer (only for questions the learner answered, which are already recorded as exposed), lesson links, *Practise again*, *Choose another topic*.
* **Sessions**: idempotent client command ids, as everywhere; one open session per learner (starting another closes the previous one, keeping its answers; the open one is offered to resume); isolation by `user_id` (another learner gets 404); exported with the learner's data; deleted with the account (`ON DELETE CASCADE`). Starting a new session is rationed (30 per learner per 10 minutes, 180 per address); viewing and answering are not. A session whose every question has since gone stale (its generator changed) is closed when opened, keeping its answers, and offers to start the same choice again instead of an empty player. The summary counts every hint shown, including on a question left unanswered.

## 4. Data and routes

**Migration `010_flexible_learning.sql` (additive):** `lesson_progress.explored INTEGER NOT NULL DEFAULT 0`; new tables `topic_practice_sessions`, `topic_practice_attempts`, `topic_practice_hint_uses` (all `user_id … ON DELETE CASCADE`). No existing row is rewritten. No onboarding, progress, XP, streak, badge, mastery, placement, assessment or setting changes for existing users. Open sessions of every existing kind are unaffected.

**Routes:**

* `GET /api/lessons/:id?explore=1`, `POST /api/lessons/:id/start {explore: true}` — the only change to existing routes; without the flag behaviour is as before (a locked lesson is 403, now with `explorable` in the error). The start body is strictly validated (no other field is accepted). `GET /api/lessons/:id` also returns `access: { mode, outOfSequence, foundations[] }`.
* `GET /api/topic-practice`, `POST /api/topic-practice/sessions {grade, kind: grade|area|unit|topic, id, count: 5|10|20}`, `GET /api/topic-practice/sessions/:id`, `POST …/:id/hint`, `POST …/:id/attempts`, `POST …/:id/complete`, `POST …/:id/abandon`. No route accepts or returns a correctness claim, score or answer key; a choice that does not belong to the chosen grade is a 400 (`bad_scope`).

**Web:** `pages/Flexible.tsx` (Explore lessons page, topic picker, topic player and summary); `Lesson.tsx` (explore mode, advisory, *Explore it anyway*); `NodeSheet.tsx` (*Explore this lesson anyway* on locked lessons only); `Learn.tsx` (two entry buttons; the preview note now describes the real behaviour); `Practice.tsx` (topic practice first, then examinations, then the practice lab); `Shell.tsx` (tab order).

## 5. Decisions and departures from the brief

1. **Explore covers authored lessons (and optional enrichment lessons) only.** Unit practice, unit review, unit checkpoints and grade assessments stay on the guided path. Topic practice covers the "practise anything" need without opening assessment eligibility. *(The brief says "any available lesson"; these nodes are not lessons.)*
2. **An explored completion is a real completion but counts for unlocking only once its prerequisites are met** (2.1). This is the mechanism behind "must not falsely award unit or grade completion, qualification badges or mastery of prerequisites".
3. **Explored lessons earn their normal XP and their own evidence.** The brief allows this ("subject to the existing evidence and completion requirements"). Concept badges (mastery-based) can therefore be earned through explored lessons plus genuine later review, exactly as on the path; grade/checkpoint badges cannot.
4. **Topic practice never counts for the daily goal or streak** (practice-lab rule), as well as no XP, mastery, completion or readiness.
5. **Hints are offered in topic practice**; the worked answer follows three wrong tries and appears in the summary for missed questions. All of it is recorded as exposure.
6. **Mixed practice for a grade uses the topics introduced in that grade**, each in its lesson's scope (which already includes earlier-grade material the lesson builds on). Earlier grades' topics are one tap away by switching grade.
7. **Navigation**: tabs reordered to Learn, Practice, Review, Progress (brief's recommendation). The Practice page now leads with topic practice; the examinations heading became an `h2` (one `h1` per page). The Learn page's old "Early preview… open the ready ones in any order" note, which was no longer true, now points to Explore and topic practice. No other existing screen changed.
8. **One open topic-practice session per learner**: starting another closes the previous one (answers kept). This keeps "resume" unambiguous across devices.
9. **Follow-ups agreed after the first review of this PR**: the Explored tag and honest lock wording, the "later grades build on earlier ones" line, and showing small pools (with unfillable counts disabled) before starting.

## 5a. Deployment and rollback

* **Migrations 010 and 011 are additive and transactional**, and run before the server listens. Take and verify the usual pre-deploy SQLite backup (`docs/development/RAILWAY.md`, one-writer rule).
* **A code-only rollback onto the upgraded volume is unsafe once learners have explored ahead.** The older code does not read `lesson_progress.explored`, so it would treat explored completions as ordinary ones and open guided steps after them (the reviewer reproduced `G1-U1-L06` opening). Prefer a forward fix. If a rollback is unavoidable, use a build that still honours the marker, or restore the pre-deploy backup, accepting that a restore discards learner writes made since it.
* Start-up warming of the review pools (now also recording visible identities and seeds) took about 28-42 s locally for 376 candidate pools; Railway timing and memory headroom are still to be measured on the first deploy.

## 6. Limitations and genuinely unresolved issues

* **Topic scope follows the lesson binding**, and grades are cumulative, so questions can use earlier-grade skills (e.g. Grade 5 *Six sharps* can ask for the key signature in the alto clef: Grade 5 asks key signatures in all four clefs). The topic picker and the Explore page say so in one line. Whether any particular lesson's scope is right is for the per-grade teacher review, not this PR. The "Learn it" link points to the topic's own lesson, not to the earlier skill a question also uses.
* **Near-repeats across templates** (the same fact through two templates) are not detected, as already noted for examinations.
* **A narrow topic can be small** (4-16 distinct questions on a few Grade 1-3 topics). Shown before starting and handled transparently; enlarging those pools is content work outside this brief.
* **`available` is sampled**: the count comes from the first 300 seeds of each question type (the same sampling Review uses), so it is "at least this many"; the session's own `shortfall` remains the final word.
* **The `explored` mark is never cleared.** It does not need to be (the rule heals once prerequisites are done), but exports will show it.
* **Placement + Explore interaction**: a learner placed at Grade N who explores a lower-grade lesson is treated by the same rule (the lower-grade node keeps its own prerequisites, as placement already required).
* **Physical iPhone verification has not been done by me.** Everything below "automated" in section 7 is from Chromium (Playwright device emulation and jsdom), not a device.

## 7. Verification

**Automated (run in CI):**

| Requirement | Test |
|---|---|
| Fresh learner completes a Grade 5 lesson without Grades 1-4; later unit without earlier units; skipped lessons stay uncompleted; return to Grade 1; guided path still enforced; direct API cannot manufacture marks, completions, rewards or eligibility; placement unaffected; pre-010 rows keep their meaning; guest conversion | `packages/api/test/flexible-learning.test.ts` (Explore and migration blocks) |
| Fresh guest practises a Grade 5 topic; topic/area/unit/mixed selections stay in scope and in grade; counts 5/10/20; refusal of out-of-grade choices; shortfall; hints, marking, explanations, worked answers, finish early, summary; fresh repeats; no XP/mastery/completion/readiness; exposure recorded and read by mock-exam independence and review; revision eligibility unchanged; idempotency, one open session, isolation, export | `packages/api/test/flexible-learning.test.ts` (Practise a topic block) |
| UI journeys (jsdom, real API) | `packages/web/src/test/flexible.test.tsx` |
| Real-browser journeys: explore + play a Grade 5 lesson through the real controls with nothing else opening; *Explore it anyway*; topic practice answered through the real controls, summary, *Practise again* with different questions, finish early; shortfall; iPhone 14 / 320 px / tablet / desktop-dark with axe (WCAG 2.1 AA serious/critical) and no sideways scroll | `packages/web/e2e/flexible.mjs` (in the `prep` browser shard) |
| Regression: every existing API, UI and browser suite | `npm run check`, CI browser shards |

**Manual acceptance on a physical iPhone (installed PWA) — for the owner:**

1. Open the installed app. Learn shows the grade chip, then *Explore lessons* and *Practise a topic* side by side; both are easy to tap with a thumb.
2. *Explore lessons* → tap **5** → Unit 3 → *Open* on "Chromatic intervals". A notice says you are exploring ahead of your guided path, with links to lessons that help. Tap *Let's go* and play the lesson; notation renders; sound plays if sound is on.
3. Finish it. Close. Learn (Grade 1) still says "Next up: Beats, crotchets, minims and semibreves". Switch the Learn grade to 5: the explored lesson shows as completed with a small Explored badge (VoiceOver: "explored ahead of your path"); Unit 3 practice/checkpoint and the Grade 5 assessment show as locked. Open the Unit 3 overview: "Compound intervals" says to finish "G flat major and E flat minor" first and that "Chromatic intervals" will count then.
4. On the Grade 1 path tap a locked lesson: the sheet offers *Explore this lesson anyway*.
5. Practice tab → **5** → *Keys, scales and key signatures* → *Six flats* → **10** → *Start*. The start button stays visible above the tab bar and clear of the home indicator.
6. Answer a few, use *Need a hint?*, get one wrong three times (the answer appears), tap *Not sure? Learn it* and come back with the close button, then *Finish now*. The summary lists the missed question with the answer and a lesson link.
7. *Practise again*: new questions, no extra taps. Close and reopen the app: Practice offers *Carry on* for the open session.
8. Practice → **2** → *Keys, scales…*: *Melodic minor preview* says "only 4 different questions"; selecting it greys out 10 and 20 and the line under Start says you'll get 4. Start: the first question repeats that, and says nothing from other topics was added.
9. Settings → Dark theme, and iOS larger text: repeat steps 2 and 5; nothing is cut off, nothing scrolls sideways; VoiceOver reads the grade buttons as "Grade 1"… and the counts as "5 questions"….
10. Profile → Progress: XP unchanged by topic practice; the explored lesson's XP is there once.
11. Rotate to landscape on the question screen; then airplane mode mid-answer: the answer is not lost, *Check* again works once back online.
