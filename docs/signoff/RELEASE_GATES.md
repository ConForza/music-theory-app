# Private-preview gates and public-release gates

Two different bars. Meeting the first says nothing about the second, and the private preview must never be described as `validate:release`-certified, teacher-approved, ABRSM-endorsed or an exam simulation.

## Private, invite-only preview: what must be true

| Gate | State at this head | Evidence |
|---|---|---|
| Access is bounded (invite-only; no public listing) | Deployment decision, **not made here** | Staging preparation is a separate piece of work (issue #19 follow-ups) |
| Messaging is accurate and provisional | In place | `PREP_DISCLAIMER`; placement "advice only"; marking disclosure (`PrepPages.tsx:45`, `:155`); no ABRSM claim anywhere in learner copy. Confirm the wording on the worksheet. |
| Readiness is hidden | In place | `DEFAULT_GATES.readiness = false`; `MTP_SHOW_READINESS` unset; `prep-gate.test.ts` (59 tests across the prep gate, score-reading and rules files passed at this head) |
| Existing correctness tests pass | Passing where run for this PR; the full suite is the CI run on the PR | Engine, API and browser suites from Briefs 03-11 and PRs #18, #20, #21 |
| Release metadata is truthful | In place and untouched | `status: draft`, `teacherReview: pending`, `publishedAt: null` |
| Known limitations are disclosed to invitees | Partly: the exam start screen discloses the marking convention; the score-reading limitation is disclosed in each result | `SCORE_READING_SKILLS`. The start-screen sentence "every outcome is asked 2 times" is accurate today and would need updating by Brief A |

Not a gate for the preview: teacher approval of the 245 templates, the 80 outcomes or the open convention questions. They are reported as `draft` / `pending`, and invitees should be told the material has not been teacher-reviewed (this PR does not check or change learner copy for that; see the worksheet).

## Public release: what must be true (none of it is done or claimed)

| Gate | Needed | Reference |
|---|---|---|
| Substantiated teacher sign-off | Real review of the evidence, then `approved` on 80 outcomes, 245 templates, 235 nodes and the release, with reviewer and date | [EVIDENCE_INVENTORY.md](EVIDENCE_INVENTORY.md#exact-remaining-requirements-of-npm-run-validaterelease), `npm run validate:release` |
| Syllabus currency | Someone checks abrsm.org in a browser; result recorded as `none_found` | Q1, `content/release.json` |
| Term lists | An authoritative list or a recorded decision to keep the provisional lists | Q2, Q38 |
| Open convention questions | Teacher answers or accepts the recorded handling | `OPEN_QUESTIONS.md` (35 open) |
| Readiness | Thresholds approved or replaced, then `MTP_SHOW_READINESS=teacher-approved` set deliberately | REVISION_PLACEMENT_EXAMS.md "Readiness release gate" |
| Exam representativeness | Weighting, cumulative and score-reading decisions implemented and verified | [FOLLOW_UP_BRIEFS.md](FOLLOW_UP_BRIEFS.md) |
| Legal and privacy | Owner decisions with legal advice: retention period, privacy notice, children's data | `docs/PRIVACY_PLAN.md`, `docs/IP_AND_PROVENANCE.md` |
| Hosting and staging verification | Single-SQLite-writer cutover, HTTPS, backups, start-up grace (measured 76-78 s under load) | `docs/development/DEPLOYMENT.md`; issue #19 |

The private staging deployment is separate work and is not prepared or implied here.
