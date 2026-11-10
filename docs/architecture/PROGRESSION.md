# Progression, XP, mastery and adaptive review (Brief 04)

Brief 04 adds the reward and revision loop on top of the Brief 02 path and the Brief 03 engine:

> Learn → Practise → Receive feedback → Earn XP → Unlock lessons → Review weak concepts → Demonstrate mastery

It adds **no second curriculum, grader or unlocking system**. `computeNodeStates` still decides what unlocks, `ProgressService` still decides what is complete, and `@mtp/engine` is still the only judge of musical correctness. Everything below is derived from those, on the server.

```
lesson attempt ──► attempts (Brief 02) ──► mastery_evidence ──► concept_mastery (projection)
node completion ─► xp_ledger + daily_activity ─► goal / streak            ▲
review session ──► review_attempts ──► mastery_evidence ─────────────────┘ + review schedule
```

Two families of tables are deliberately separate:

| Engagement (what you did) | Understanding (what you can show) |
|---|---|
| `xp_ledger`, `daily_activity`, `achievements_awarded` | `mastery_evidence`, `concept_mastery`, `review_sessions`, `review_attempts` |

Neither is an input to the other, and neither is an input to `computeNodeStates`. XP cannot unlock a lesson, mastery cannot complete one, and a streak ending removes nothing.

## 1. The three words learners see

| Word | Means | Decided by |
|---|---|---|
| **Lesson complete** | The required teaching activity was finished: every question answered correctly (retries allowed). Opens the next lesson. | `ProgressService.complete` (Brief 02), unchanged |
| **Mastered** (a *topic*, i.e. a concept) | Enough varied, independent evidence over time, including a successful delayed review. | `foldConcept` over `mastery_evidence` (this brief) |
| **Practice assessment passed** | A separate whole-grade check. Lessons, XP, streaks and mastery never award it. | Brief 10. Until then the grade badges are shown as *not available*. |

The Review screen carries this explanation under "How lessons, mastery and practice assessments differ".

## 2. XP

* Source of truth: `xp_ledger`, append-only. A total is always `SUM(xp)`; there is no cached total to drift. `GET /api/xp` and `GET /api/engagement` read it.
* **Awards** (`content/policy/progression.json` → `xp.perNodeType`): lesson 10, practice 8, review 8, unit challenge 15, grade assessment 25, enrichment 5. A *review session* earns the `review` value (8).
* **What earns XP**: a path node the server just completed (all questions answered correctly in the current run), and a review session the server just completed (every question and remedial question attempted). Nothing else: not opening the app, not practice-lab answers, not partial runs.
* **Idempotency**: each event has a source key, `node:<nodeId>:run<n>` or `review:<sessionId>`, unique per learner (`PRIMARY KEY (user_id, source_key)`). The award is written in the same transaction as the completion, so a retried request, a lost reply or a second device finds the existing row and repeats the original reply.
* **Farming control** (`xp.dailyCapPerNode`, 2): at most two XP awards per node per learner-local day. Further completions of that node that day are recorded with `xp = 0, capped = 1` (so replies stay stable) and the screen says so kindly. Review sessions share one bucket (`review`). Replays after the first completion earn XP under the same rule (`firstCompletionOnly: false`).
* **Accounting across versions**: each row stores `curriculum_version`, `content_version` and the rules version. A content update that starts a new run simply writes a new row; old rows are never rewritten.
* **Forgery**: no endpoint accepts XP, a total, a streak, a mastery state, a due date or a badge. Request bodies are strict Zod objects, so extra keys are a 400.
* **Milestones** (`xp.milestones`, engagement only): shown as "N XP to your next milestone". Milestones carry no benefit.

## 3. Daily goal and streak

* **A meaningful session** is a path node completed (every question answered correctly, decided by the server) or a review session completed. Opening the app, refreshing, abandoned runs and empty actions never count. Rows live in `daily_activity` (idempotent on the same source keys as XP).
* **Goal**: default 1 session a day; learners can pick 2 or 3 or turn it off (Settings → Daily goal; the API allows up to the policy maximum of 5). Off hides the goal and the streak; activity is still recorded, so turning it on later restores the streak.
* **Streak**: the number of consecutive learner-local calendar days with at least one meaningful session, whatever the goal size. It stays alive through the end of the next day. After a gap the screen says "Welcome back! … everything you learned is still here" and offers a review. There is no loss of mastery, XP, badges or progress, no hearts, no punishment and no leaderboard.
* **Timezones**: each profile has an IANA `timezone` (the web app keeps it in step with the device, validated by the server). A day is `YYYY-MM-DD` in that zone, and all day arithmetic is done on those dates (`clock.ts`), never by adding 24 hours, so a 23-hour or 25-hour UK clock-change day is still one day. Each activity row stores its local date **when it is written**, so changing timezone later never rewrites history (activity dated after "today" because the learner flew west is treated as today).
* **Timezone edits and the XP cap**: the timezone is a client-editable setting, so the per-node cap counts what was already earned under both readings of "today" (rows stamped with today's date, and rows whose real instant falls inside today's window in the current zone). Changing zone at the same instant cannot reopen a spent cap. Streak days and review due dates are calendar dates and can shift by at most the zone offset (under 27 hours) when the zone is edited; this cannot create a 3-day mastery span, never affects XP, and the streak gates nothing. This is a deliberate, documented policy.
* **Time authority**: only the server's clock is used. A request that straddles midnight keeps the day it was committed on; a late retry returns the stored result and adds nothing.

## 4. Concept mastery

Mastery is per **concept id** (`c.*`, Brief 01). It is a pure, deterministic fold (`foldConcept`) over that learner's rows in `mastery_evidence`, under `rulesVersion` (from `progression.json`, currently 1).

### 4.1 What counts as evidence

A row counts (`counts = 1`) only if **all** hold:

1. It is a lesson **independent** step (authored `evidence: "independent"`) or a **review-session** question. (Guided steps are `learning`.)
2. The answer was graded by the server's engine inside the node binding's effective scope (what has been taught).
3. It was the learner's **first-ever attempt** at that exact item (across all runs). A retry, a replayed lesson question, or any attempt after the worked answer was revealed is recorded but does not count.
4. No hint was used. (Independent steps offer no hints; review has no hint route at all.)
5. It is a valid evidence source for the concept: the concept ids come from the **node's exercise binding** for that template, i.e. what the lesson declares it teaches.

Everything else is still logged with the reason it was excluded, so the state is explainable: `guided-step`, `hinted-step`, `retry-after-reveal`, `not-first-attempt`, `remedial-step`. A *wrong* valid first attempt is also kept (`counts = 1, correct = 0`) as a failure, used for mistake categories and review lapses.

### 4.2 Treatment of practice-lab evidence (decision)

**The Brief 03 practice lab is not mastery evidence.** Practice-lab items are `evidence: "learning"`, offer hints, and can be retried freely; a correct answer there shows the learner can do the task with support, not independently. They write no `mastery_evidence` rows and earn no credit, but they do record *exposure* (`question_exposure`, exported and deleted with the account): a question attempted or hinted in practice can never again be fresh independent evidence, whatever seed it returns under, and it counts as already met when review chooses questions and when the capacity warning counts what is left. The capacity warning checks both the number of distinct questions and the number of distinct question types still attainable. Instead, the **designated independent review activity** is the review session: server-generated items from the Brief 03 generators, no hints, first answer only, graded by the engine. Brief 10 assessments can be added as another counted source (`assessment-item`) the same way. Evidence classification is entirely server-owned: the client sends only an answer.

### 4.3 States and thresholds (provisional, configurable)

`new → learning → practising → proficient → mastered`, plus `review_due`:

| State | Rule (from `progression.json`, **provisional, awaiting teacher acceptance**) |
|---|---|
| `new` | No evidence rows |
| `learning` | Evidence rows exist but none is a counted correct answer |
| `practising` | At least one counted correct answer |
| `proficient` | ≥ 4 distinct correct items **and** ≥ 2 distinct templates |
| `mastered` | ≥ 8 distinct correct items, ≥ 2 distinct templates, the first and latest correct answers ≥ 3 calendar days apart, **and** a successful delayed review since the last lapse |
| `review_due` | Was proficient or mastered, and the next review date has arrived |

"Distinct" means distinct **question identity** (`question-key.ts`: template, prompt, music and answer, independent of seed, session and item id). The same question under another seed, a question the learner already failed or saw remediated, or a replayed lesson question adds no distinct credit, though a passed review of it still moves the schedule. Review prefers questions the learner has not met; if every question in the boundary has been met it serves one anyway (it still tests recall) and says nothing is added. Variety across templates is required, so volume of one question type never reaches proficient. Accessible alternative input kinds (stave click, arrow keys, typed notes, keyboard) produce the same response shape and are classified identically.

`highestState` records the best state ever reached. A due date, a lapse or a long absence never lowers it, and it is what badges check.

### 4.4 Review schedule

* The schedule starts at the learner's **first activity on the concept** (any evidence row, supported or not) at interval index 0, so someone whose every first try was wrong still gets reviewed. A concept taught by a completed lesson but with no rows at all (for example, finished before the ledger existed) starts as `learning` and is first due one interval after the completion day. No evidence or credit is invented for it.
* Intervals (`review.intervalsDays`): **1, 3, 7, 14, 30, 60** days (calendar days), then it stays at 60.
* A **correct review** answered on or after the due date moves the index one step and sets `due = review date + interval`. An early or same-day repeat does not advance it.
* A **wrong review answer** is a *lapse* (one lapse per day): the index resets to `review.lapseResetsTo`, and the concept's current state is capped at `practising` until a later review succeeds (history kept). **Decision:** `lapseResetsTo: 1` is read literally as an index into `intervalsDays` (1 → the second interval, 3 days). If the teacher prefers a lapse to restart at one day, set it to `0`; no code change is needed.
* Due dates are stored as learner-local dates, so they are deterministic and DST-safe.

### 4.5 Explanations

`explainMastery` returns a headline plus what is met and what is still missing in plain words ("2 more correct first-try answers without hints", "a correct answer to a different kind of question", "a correct answer in a scheduled review"). It is shown under "Why is it …?" on Review and after every lesson.

### 4.6 Rules versions and recomputation

* Evidence rows store the `rules_version` they were classified under and are never reinterpreted.
* Projections (`concept_mastery`) record the rules version used to build them and can be rebuilt from the ledger with `MasteryService.rebuildAll` (tested, including a stricter rules version).
* Reads fold from the evidence for *today*, so "review due" is never stale.
* Regrading old attempts with a changed engine is not done silently: it requires a new rules version and an explicit rebuild.

## 5. Adaptive spaced review

`POST /api/review/sessions` builds (or resumes) the learner's one open session:

1. **Due concepts**: those whose next review date has arrived, sorted: needs-recovery first, then most overdue, then id.
2. **Eligibility (taught scope)**: a concept is reviewable only through generator templates bound (in `exercises`) to a **completed, playable** lesson that teaches it, in that binding's effective scope. Earlier-grade concepts therefore appear alongside later ones when due, and nothing the learner has not been taught can ever appear. A concept with no usable template (or whose lesson is not completed) *waits*, and is never shown as work.
3. **Teaching boundary**: a lesson binding's effective scope is coarser than one concept (all treble stave notes versus treble *line* notes), so `content/policy/review-constraints.json` narrows generated questions to exactly what a concept introduced (today: treble line notes use lines only, treble space notes spaces only). Selection walks seeds deterministically until a question satisfies the constraint; on regeneration a question that breaks it is treated as stale. Remedial questions obey the same boundary.
4. **Selection**: up to 4 concepts (`review.session.maxConcepts`), up to 2 questions each (`itemsPerConcept`), preferring the templates the learner has met least recently, so question types vary.
5. **Nothing due → no session.** The screen explains this and offers optional practice. No artificial overdue work is generated.
6. **Reproducibility**: each question stores its seed (derived deterministically from session, concept and template), template version and generation fingerprint. A question whose generator changed since is dropped as *stale* (never regraded); a session with no live questions is rebuilt.
7. **Answering** (`/attempts`): idempotent per client command id. Only the **first** answer to each review question is evidence. A wrong first answer shows the engine's explanation and mistake category, records a lapse, and adds one **remedial** question (same template, new seed) right after it. Remedial answers are logged as `remedial-step` and never count; the learner may retry the original, revisit the explanation, or move to the similar question. The worked answer appears after three wrong tries, as in lessons.
8. **Completing** requires every question and remedial question to have an attempt. The status change, summary, review XP (8, same cap rules), daily-activity row and badge check are **one transaction**: all commit or none do, and a repeated call reads what was committed. A finished session is read from its stored summary, never by regenerating its questions, so content updates cannot break it. An interrupted session is always offered again that day ("Continue review") even after its first answer has already moved the concept's due date.

## 6. Badges

`content/policy/achievements.json`: each badge has one verifiable condition, either *concepts at least proficient/mastered* (history counts) or *specific nodes completed*. Awards are written by the server only, once (`PRIMARY KEY (user_id, achievement_id)`), never revoked, and each remembers the event that earned it (so a retried completion repeats the same reply).

* A badge can only be earned if its content is playable (`reachable`): a completion row for an unwritten node earns nothing.
* The six badges named in the Brief 04 spec are defined (two clefs; C, G, D, F major scales; Grade 2 triplets mastered; Grade 3 compound-time challenge; Grade 4 chromatic spelling; Grade 5 cadence challenge), plus **Treble line reader**, the one that today's playable content can actually earn, and one **grade-complete** badge per grade that requires its grade assessment node (Brief 10), never lessons or XP.
* The UI shows unearned badges as "Not available yet: its lessons are still being written" when their content does not exist, and always shows the disclaimer: *badges are in-app recognition, not ABRSM certificates*.

## 7. API summary (all need a session; none accept a claim)

| Route | Purpose |
|---|---|
| `GET /api/engagement` | XP total + milestone, goal, streak, review-due count, recent badges |
| `GET /api/xp` | total and recent ledger rows |
| `GET /api/review` | Review hub: groups, weak areas, upcoming, history, recommendation |
| `POST /api/review/sessions` · `GET /…/:id` · `POST /…/:id/attempts` · `POST /…/:id/complete` | the review session |
| `GET /api/mastery/:conceptId` | one concept with its explanation and evidence trail |
| `GET /api/achievements` | all badges with progress and the disclaimer |
| `PATCH /api/me/profile` | now also `timezone` and `dailyGoal` |
| `POST /api/lessons/:id/complete` | now also returns `rewards` (XP, goal, streak, badges, concept evidence) |

`POST /api/test/clock` exists **only** when the server is started with the `testClock` option (`MTP_TEST_CLOCK=1`, refused in production mode); browser journeys use it to move "days later" instantly.

Export (`GET /api/me/export`) and deletion (`DELETE /api/me`) cover every table above; each cascades from `users`.

## 8. Limitations and teacher-review dependencies

* **All thresholds and intervals are starting values, not validated measures.** A qualified teacher must accept or tune them (`progression.json`), including the reading of `lapseResetsTo`.
* **Today's generators offer few distinct questions inside the treble-line boundary** (five `note-read` questions and one `note-write` question), so the treble-line concept can reach *proficient* with passed reviews but not *mastered*; the Review screen says exactly what is missing, and when the distinct questions that remain cannot reach the next level (credited so far plus questions not yet met, sampled from the generators) it says so ("more questions coming") instead of promising progress. Mastery machinery is verified with fixtures. More distinct line-note questions (Briefs 05 to 09, or a richer generator) lift this.
* With today's content only `G1-U3-L03` and `G5-U4-L06` are playable, so only a few concepts can gain evidence. `c.cadences.chord-choice` has just one evidence template (`t.g5.cadence-chords`) and therefore **cannot reach proficient yet**; the UI says exactly why. Concepts taught by lessons that are not written never become reviewable.
* `listen-identify` audio review is not authored; review uses the Brief 03 notation and keyboard controls, all of which work without sound.
* Review sessions are per learner and not shared; there are no teacher dashboards, leaderboards, hearts or currencies.
* Badges for unwritten grades are present but cannot be earned until Briefs 05–10 supply the content.
* Daily dates use the server's clock and the learner's saved timezone. If a device's timezone differs from the saved one the web app updates it on the next load.
