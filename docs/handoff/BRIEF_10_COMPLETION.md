# Brief 10 completion handoff: revision, placement and practice examinations

**Status: development-complete, not teacher-reviewed. Draft PR; not ready, not merged, not deployed.**

Rules, the audit matrix against `main`, every product default and what a teacher must still decide are in [docs/architecture/REVISION_PLACEMENT_EXAMS.md](../architecture/REVISION_PLACEMENT_EXAMS.md). Measured coverage and variation of every paper: [docs/curriculum/PRACTICE_EXAM_COVERAGE.md](../curriculum/PRACTICE_EXAM_COVERAGE.md). This page is the map for the two reviewers.

## What was built

* **Server** (`packages/api/src`): `prep-config.ts` (every default, versioned), `prep-blueprint.ts` (pure rules: exam composition, placement probes and recommendation, outcome levels, readiness), `prep.ts` (`PrepService`: placement + practice examinations), `revision.ts` (`RevisionService`), migration `009_prep.sql`, 18 routes in `app.ts`, and one optional argument to `computeNodeStates` for accepted placements.
* **Web** (`packages/web/src`): `PrepPages.tsx` (exam hub, setup, placement intro, results history), `PrepPlayer.tsx` (the player for exams and placement: blind answering, server-clocked timer, resume, finish early), `PrepResult.tsx` (exam result and placement result with the start-grade choice), `Revise.tsx` (revise panel on Review, 5-minute card on Learn, explore, revision player), `Question` gained a `blind` mode, onboarding offers "Find my level", Settings has the extra-time accommodation.
* **Navigation**: no new tab. Practice tab = practice examinations + placement + the existing lab; Review tab = revision; Progress -> "Practice results".
* **Docs/CI**: architecture doc, generated coverage report, `npm run audit:prep -w @mtp/api` (CI step), `e2e:prep` browser shard added to the matrix.

## Where to look hardest

**For the technical review (Sol Max)**

1. `prep.ts` `answer` / `complete` / `startExam`: idempotency (command id checked **before** the status check so a lost reply after completion still replays), the one-first-answer rule, the deadline rules (`graceSeconds`), one transaction for completion, the unique partial index that makes "start again" resume, stale-generator handling (`view` closes the attempt as abandoned rather than regrading).
2. The independence flag: `PlannedPrepItem.coached` is set at planning from `helpedKeys` (exposures, guided/hinted/remedial evidence, every earlier completed attempt's questions); `summariseExam.independentOf` requires mock + not coached + answered + no hints. Check there is no path by which a practice-mode answer, a hinted answer or a re-seen question reaches `independentQuestions`.
3. `path-state.ts`: `placedPast` is the **only** progression change. Confirm that with no accepted placement the function is unchanged.
4. Tenancy: every `prep_*` / `revision_*` query filters by `user_id`; route handlers pass `ctx.user!.id`. `prep-exam.test.ts` "privacy and isolation" is the test.
5. Performance (below): planning is synchronous.

**For the educational review (Opus)**

1. Is two questions per outcome plus four multi-part score-reading questions a representative paper? Does the weighting (per outcome, not per ABRSM section marks) mislead anyone?
2. The placement rule and its wording ("advice about where to start", never a grade).
3. Readiness wording: "Estimated readiness", "Consistently secure" only after two independent mock attempts on different days, each at the line, with unanswered questions counted as not right (rubric 2, after the first review). Is "Consistently secure" safe, given it is *our* number?
4. The explanations of mistakes (they reuse family feedback, themselves unreviewed) and the order of results: score, readiness, outcomes, strengths/weaknesses, plain-words mistakes, next steps, answers.
5. Weak-topic practice: explanation first, then questions recorded as learning. Is two wrong in the last five a fair meaning of "weak"? Is "untested is not weak" visible enough?

## Verification (all run on this branch)

See the PR description for the exact results and head SHA. Commands:

```
npm run check                                    # typecheck, lint, validate, docs:check, all tests, build
npm run audit:mastery -w @mtp/api                # existing mastery capacity audit, Grades 1-5
npm run audit:prep -w @mtp/api                   # practice-exam coverage / variation audit (exits 1 on a gap)
npm run validate                                 # syllabus coverage (80 outcomes mapped)
npm run build && npm run e2e                     # every browser shard, including e2e:prep (Brief 10)
```

## Known limitations and open items

1. **No teacher has reviewed any of it.** All thresholds are placeholders in `prep-config.ts`.
2. **Planning is synchronous.** Starting a practice examination generates 28-46 questions on the Node thread: about 0.4 to 3 s per start on a developer machine (the in-course assessment start has the same shape, only smaller). It is fine for the current single-process, small-scale deployment and is stated here so it is decided deliberately before scale: a worker, a pre-built question pool or caching of the credited-concept check would remove it. New papers and checks are rationed (4 per learner and 60 start requests per address per 10 minutes; resuming is free), which bounds but does not remove the cost: a determined actor with many guest accounts can still occupy the thread, so a worker or pre-built question pool is the real fix.
3. A later grade's paper does not re-test earlier grades' outcomes (placement and revision cover them). See the architecture doc.
4. Starting a mock when one is already open resumes it with its original timing; the setup page says so and offers "Start a new one instead".
5. Practice mode keeps the engine's existing "worked answer after three misses" rule; the full set of worked answers is shown after finishing.
6. The "Not yet tested" list on the Review hub shows the first twelve topics only.
7. Not done, by instruction: Brief 11's release audit, deployment, marking the PR ready, merging.
8. **Educational review of PR #18** (changes required, 11 defects). Fixed in this PR: readiness no longer counts a mostly blank paper (1), no longer pools a decline into a pass (2), labels renamed (rubric 2); no paper asks the same question twice (4); recommendations and revisit links use the concepts of the questions missed (6); the exam weak flag is narrow and clears with practice (7); placement says what it did not check (8); documentation overstatement corrected (11). **Not fixed here, for owner or earlier-brief decisions** (see the last section of the architecture doc): Grade 2/3 score-reading generators (3), unanswerable items in older generators (5, 9, 10), question weighting and carried-forward items, part marks, near-repeats.
9. **Independent technical review of PR #18** (changes required, 6 findings), all fixed in this PR with a regression test each (the waiver and coaching tests were confirmed to fail without their fix): help obtained after the paper started now counts as coaching (P1); an open placement check follows its own stored rules and a recommendation never rests on an unprobed grade; the unlock waiver applies only to the chosen grade and above (it had opened the Grade 1-3 assessments and let their badges be earned); a fully answered open attempt finishes when reopened; readiness compares the exact ratio, not the rounded one; new papers are rationed per learner and address.
