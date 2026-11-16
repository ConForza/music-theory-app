# Follow-up implementation recommendations

**Proposals only. Nothing here is implemented, and none of the numbers is an owner decision.** Each brief is a separate, bounded PR to open only after the owner picks an option on the [worksheet](OWNER_SIGNOFF_WORKSHEET.md). Figures below are arithmetic from the committed outcomes and the quoted defaults; no generator or audit was run to produce them.

Shared migration facts (checked in `packages/api/src/prep.ts` and `prep-config.ts`):

* A started attempt stores its items, `blueprint_version`, `rubric_version` and a copy of the config. Open and completed attempts keep their meaning; attempts made under other versions are already flagged "older rules" (`prep.ts:951`). No rescoring is needed or allowed (decision 4).
* `BLUEPRINT_VERSION` (now 1) is raised when composition changes; `RUBRIC_VERSION` (now 2) only when scoring or a label's choice rule changes.
* A changed generator must carry a per-template revision (`TEMPLATE_REVISIONS`, `packages/engine/src/generate/index.ts`) so an old question id is refused as stale instead of silently changing meaning. Pinned fingerprints elsewhere must stay byte-identical (tested by `release-blockers.test.ts`).
* Readiness stays hidden throughout (`DEFAULT_GATES.readiness = false`).

## Brief A: weighting

**Evidence.** Uniform 2 per outcome means a Grade 5 paper gives scales 2 of 36 questions. The supplied Grade 5 papers weight Keys and scales at 15 of 75 marks (`GRADE_5_PAPER_COMPARISON.md` section 1); the app's domains do not map one-to-one onto the paper's sections, so this is an indication, not a target. The PR #18 educational review suggested 3-4 for broad outcomes and 1 for narrow recall (REVISION_PLACEMENT_EXAMS.md section 9, item 1).

**Minimal proposal (A1).** Replace the single `itemsPerOutcome` with a per-domain weight, default 2: **broad** domains (keys, scales, chords, intervals) 3; **narrow** domains (voices, instruments) 1. Score reading stays 4. The review's own numbers, applied to today's outcomes:

| Grade | Questions now | Under A1 | At 90 s per question (minutes) | Broad-domain share now → A1 |
|---:|---:|---:|---|---|
| 1 | 46 | 52 | 69 → 78 | 26% → 35% |
| 2 | 30 | 37 | 45 → 55.5 | 47% → 57% |
| 3 | 28 | 34 | 42 → 51 | 43% → 53% |
| 4 | 40 | 45 | 60 → 67.5 | 30% → 40% |
| 5 | 36 | 37 | 54 → 55.5 | 17% → 24% |

Reading: A1 moves Grades 1-4 clearly but Grade 5 hardly at all, because Grade 5 has a single scales outcome. If that matters, the owner must give per-outcome counts (A3); this brief will not invent them. **A2** keeps counts and only changes disclosure (no claim of realistic preparation), the cheapest honest option.

**Implications.** Paper length rises for A1 (timer total follows: questions x 90 s); outcome coverage unchanged; each raised outcome needs enough distinct templates for three non-identical questions per paper (check with the existing coverage audit). `BLUEPRINT_VERSION` 1 → 2. Touches `prep-config.ts`, `examBlueprint()`, the start-screen sentence "Every outcome of the grade is asked 2 times" (`PrepPages.tsx:154`), and regenerates `PRACTICE_EXAM_COVERAGE.md` (`npm run audit:prep -w @mtp/api -- --write`).

**Acceptance tests.** (1) Question counts per grade equal the table the owner approved. (2) Every outcome still appears; none drops below its weight. (3) No duplicate question identity in a paper over fixed seeds at the higher counts. (4) The coverage audit's overlap and template-variation numbers stay in a stated range. (5) `prep-rules.test.ts` "balance across domains" rewritten for weights, not deleted. (6) A pre-change attempt reads back unchanged. (7) Start-screen copy matches the counts. (8) Readiness still withheld (`prep-gate.test.ts` unchanged and green).

## Brief B: cumulative

**Proposal.** One new "carried-forward" section in Grades 3, 4 and 5 papers, drawn **only from the immediately previous grade** (narrowest reading of "some earlier-grade knowledge"), from the pool the in-course grade assessments already use, filtered to the previous grade's templates (`a.g3` sections g2-rhythm, g2-keys, g2-terms-melody; the Grade 3 and Grade 4 templates in `a.g4` and `a.g5` earlier-grade sections), so no new unreviewed templates are introduced. The fraction is the owner's choice:

| Option | Extra questions | Share of paper G3 / G4 / G5 |
|---|---:|---|
| B1 | 4 | 12% / 9% / 10% (papers 32 / 44 / 40) |
| B2 | 6 | 18% / 13% / 14% (papers 34 / 46 / 42), near the review's 15-20% |

Selection: deterministic rotation through the previous grade's assessed templates per seed, so papers differ but are reproducible. Examples, taken from sample rows already in the teacher packs (no new generation):

* Grade 3 paper, from Grade 2: "All three bars are in 3/4. In each bar, a silence starts halfway through one beat and ends halfway through the next. Which bar writes the rests correctly?"; "Write the A harmonic minor scale, descending, in the treble clef."
* Grade 4 paper, from Grade 3: "Write this melody an octave lower in the bass clef, keeping the key signature."; a compound-time beaming question.
* Grade 5 paper, from Grade 4: "Key: F♯ minor (melodic minor, coming down). Name the interval between these two notes."; "Write a chromatic scale ascending from E."

**Implications.** Carried-forward questions must be reported separately and never count as evidence for the paper's own outcomes (the rule the grade assessments already follow); readiness coverage denominators exclude them. `BLUEPRINT_VERSION` bump; paper length and timer grow by k questions. Q39 is respected: `t.g5.rewrite-metre` stays optional and out of the pool (its answer concerned the assessment's seven earlier-grade slots, which this section does not change).

**Acceptance tests.** (1) Each of Grades 3-5 has exactly k carried-forward items, all from the previous grade's pool. (2) Grades 1-2 papers unchanged. (3) Own-outcome coverage and weights unchanged. (4) Carried-forward answers never raise or lower the grade's outcome levels. (5) Deterministic per seed. (6) Result screen labels the section. (7) Old attempts unchanged.

## Brief C: score reading

**Today.** `t.g2.melody` / `t.g3.melody` share `fam.score-observation` with Grade 1 and produce only a crotchet melody in 2/4, 3/4 or 4/4 and a major key (beats per bar, a marked note, the key). Their declared scope already allows more (Grade 2: 2/2, 3/2, 4/2, 3/8, a triplet, two ledger lines, A/E/D harmonic minor; Grade 3: compound time, more minor keys), so the work is in the generator, not the template data.

**Candidate skills (the owner picks; none is decided).** Grade 2: beats per bar in 2/2, 3/2, 4/2 and 3/8 (g2.01); a triplet group (g2.04); the harmonic-minor key from its signature and raised 7th (g2.06-07, needs a decision on Q23); an interval from the tonic by number (g2.12); one Grade 2 term (g2.13). Grade 3: beats in 6/8, 9/8, 12/8 (g3.01); a note beyond two ledger lines (g3.04); a minor key (g3.07); an interval by number and quality (g3.11); one Grade 3 term (g3.12).

**Implications (what must be touched).**
* **Generator:** Grade 1's output must stay byte-identical (`t.g1.melody`, `melody-detail`, `upbeat-facts` share the family); change only the Grade 2/3 templates and register them in `TEMPLATE_REVISIONS`.
* **Lessons bound to these templates** (taught-scope enforcement means the lesson must teach what is now asked): `t.g2.melody`: G2-U5-L04, G2-U5-P1, G2-U5-R1, G3-U1-R1, G3-U5-R1, G4-U5-R1, G5-U5-R1. `t.g3.melody`: G3-U5-L04, G3-U5-P1, G3-U5-R1, G4-U1-R1, G4-U5-R1, G5-U5-R1.
* **Assessments that sample them:** `a.g2-u5`, `a.g2`, `a.g4` (Grade 2); `a.g3-u5`, `a.g4` (Grade 3). Their questions change.
* **Concepts:** `c.context.melody-g2` / `-g3` capacity must still pass `mastery-audit.test.ts`.
* **Label:** update `SCORE_READING_SKILLS` and `prep-score-reading.test.ts` in the same PR; the label must describe exactly what is asked. `RUBRIC_VERSION` stays 2 unless the owner changes how parts are scored.
* **Q23** (major-key-only melodies, "yes for now") is superseded in part by decision 3 and needs a one-line teacher answer on minor-key presentation, or minor keys are deferred.

**Acceptance tests.** (1) Over 300 seeds every item stays inside the skills the owner listed and the lesson's taught scope. (2) Every part's answer re-derived from the printed notation, in the style of `grade2-answers.test.ts`. (3) `t.g1.melody` output unchanged for fixed seeds. (4) Old question ids refused as stale. (5) Label and generator agree (updated `prep-score-reading.test.ts`). (6) Lesson, practice, review and assessment tests for the touched units green.

## Small content tasks (independent, no exam behaviour)

* Retire or bind `t.g2.time-signature` and `t.g2.ledger-write` (unused; validator warnings; they block any future "all templates approved").
* Add pack samples for the six optional class-C templates when a teacher wants to approve them (regenerate with the existing `docs:grade{n}` scripts).
