# Owner sign-off worksheet (private preview)

**Nothing on this page is pre-approved, and this PR changes no status** (`draft` / `pending` everywhere, `release.json` untouched). Only a genuine review by you can approve a record, and only then should its status be changed, with your name and the date. Evidence behind every number: [EVIDENCE_INVENTORY.md](EVIDENCE_INVENTORY.md). Your five directions: [OWNER_DECISION_RECORD.md](OWNER_DECISION_RECORD.md).

## 1. Five decision points (the only new educational choices)

None is needed to *run* a private preview. Each is needed before the app may claim realistic exam preparation (1-3) or before a status changes (4-5).

| # | Choose | Options (none is endorsed) | Changes exam behaviour? |
|---|---|---|---|
| 1 | Weighting | ☐ A1 broad domains 3, narrow 1, others 2 (papers 52/37/34/45/37 questions) ☐ A2 keep counts, say so plainly ☐ A3 you give per-outcome counts | A1, A3: yes (new Brief A). A2: no |
| 2 | Earlier-grade questions in Grades 3-5 | ☐ none yet ☐ B1 4 questions ☐ B2 6 questions ☐ other: ____ | Yes (new Brief B) |
| 3 | Grades 2-3 score reading | Tick skills to ask. G2: ☐ 2/2, 3/2, 4/2, 3/8 beats ☐ triplet ☐ harmonic minor key ☐ interval by number ☐ term. G3: ☐ compound-time beats ☐ ledger lines ☐ minor key ☐ interval quality ☐ term. Minor keys (Q23): ☐ include ☐ defer | Yes (new Brief C) |
| 4 | Keep all-or-nothing marking for the preview | ☐ Confirm the wording shown to learners: "Each question is worth one mark, and a question with several parts needs every part right. These are our own product settings, not ABRSM marking." ☐ Change wording to: ____ | No |
| 5 | Placement and readiness stay provisional | ☐ Confirm placement is "advice only", readiness stays hidden, and the 80/50 placement and 75/55 readiness lines remain **unapproved** product defaults ☐ Other: ____ | No |

Nothing about the preview depends on 1-3. Details, tables and acceptance tests: [FOLLOW_UP_BRIEFS.md](FOLLOW_UP_BRIEFS.md).

## 2. What the existing evidence can genuinely support approving

"Class A" means a teacher has enough to inspect: used, four seeded sample questions in the grade's teacher pack, an engine test names it, no open convention question touches it. It is **not** approval.

| Group | Count (G1 / G2 / G3 / G4 / G5) | Look at | If you approve it |
|---|---|---|---|
| Outcome decompositions, class A | 69 (19 / 12 / 8 / 17 / 13) | [OUTCOME_EVIDENCE.md](matrix/OUTCOME_EVIDENCE.md) with the grade's completion audit and pack section 1 | Set those ids to `teacherReview: approved`; Q12 stays as recorded until you do |
| Templates, class A | 141 (17 / 19 / 21 / 45 / 39) | The 4 sampled rows per template in `docs/teacher/GRADE_n_TEACHER_REVIEW_PACK.md` section 3; [TEMPLATE_EVIDENCE.md](matrix/TEMPLATE_EVIDENCE.md) | Set those ids to the `qa.status` you judge true, with `reviewedBy` |

Reviewer: ______________________  Date: ____________  Scope reviewed (grades/ids): ______________________

Approving these does not unlock a public release or make `validate:release` pass; it only becomes useful once all 80 / 245 / 235 records are approved.

## 3. What genuinely needs a focused check first

Groups overlap: one template can have several reasons (96 distinct class-B templates in all).

| Group | Count | The one action |
|---|---:|---|
| Templates with no engine test naming them | 64 | Check the 4 sampled answers in the pack by hand |
| Templates touched by an open convention question | 44 | Answer the question once (largest: **Q2 / Q38** term lists, 16 templates; **Q8** cadences, 7; **Q9**, **Q28**, 5 each) |
| Corrected after review: `t.g5.score-melody`, `t.g1.middle-c-find`, `t.g2.note-grouping`, `t.g5.term-use` | 4 | Sample the corrected question |
| Grade 1-level score reading: `t.g2.melody`, `t.g3.melody` | 2 | Decision point 3 |
| Outcomes with no class-A template | 11 | `g1.07 g1.19 g2.04 g3.06 g3.07 g3.08 g3.12 g4.08 g5.09 g5.12 g5.16`: follow from the template checks above |

Already answered by you and **not** asked again: Q12, Q21, Q34, Q39. The other 23 open questions that name no id (for example Q4-Q7, Q25-Q27, Q29-Q33) stay open for the public release; they do not block the preview.

## 4. Insufficient or not reviewed (8 templates)

`t.g2.time-signature` and `t.g2.ledger-write` are unused anywhere: retire or bind them. `t.g2.melodic-preview`, `t.g3.upbeat-facts`, `t.g5.cadential-six-four`, `t.g5.satb-voices`, `t.g5.satb-facts` and `t.g5.rewrite-metre` are optional, never assessed, and have no pack sample: ☐ leave out of any approval for now ☐ add samples first.

## 5. What would change exam behaviour

Only the briefs you choose in section 1 (A: paper composition and length, B: earlier-grade section, C: Grade 2-3 score-reading questions), each its own PR with a version bump and no rescoring of past attempts. **This PR changes none.** Part marks, readiness thresholds and readiness display are unchanged and out of scope.

## 6. Public release only (nothing to do now)

Check abrsm.org for a newer syllabus (Q1); privacy and retention decisions; hosting and staging; all approvals above. See [RELEASE_GATES.md](RELEASE_GATES.md).
