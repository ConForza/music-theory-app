# Brief 06 completion handoff: Grade 2

**Delivered:** all 41 Grade 2 nodes are playable (24 lessons, 5 practice, 5 reviews, 5 unit challenges, the Grade 2 assessment, and one optional melodic-minor preview); 22 new templates with generators and per-option misconception feedback; concept boundaries for the mastery audit, now run for Grade 2 as well; independent answer checks; a full Grade 2 API journey test; real-browser Grade 2 journeys; the completion audit and teacher review pack (generated). Architecture: [GRADE_2_COURSE.md](../architecture/GRADE_2_COURSE.md).

**Not done, by design:** no teacher has reviewed anything; nothing is approved, "production-ready" or ABRSM-endorsed. No novice-learner session has been run. Placement, practice exams and readiness estimates remain Brief 10.

## Deliberate deviations from the existing Grade 2 specification

1. **Introduction of A, E and D minor** moved to the first minor concept (`c.scales.minor-concept`), so the first minor lesson can use them. The natural-minor pattern is a stepping stone only.
2. **Brief 01's lesson bindings were rewritten** (several were unusable placeholders). The 16 original templates are kept; 22 were added.
3. **Practice and review bindings are derived** from the lessons. Review 1 keeps its Grade 1 foundations; review 5 includes unit 5.
4. **Unit 2 challenge** has 3 questions per section (6 in all, was 4) so it is a fair check; the Grade 2 assessment asks 2 questions per outcome (30 in all, was 17). Pass marks are unchanged.
5. **The optional preview node** lists g2.07 as a related outcome (the lesson schema needs one); it covers nothing. The lesson-content id pattern now accepts `E<n>`.
6. **`t.g2.key-signature`** is unchanged, but C major and A minor are left out of its bindings (writing an empty signature cannot be entered); `t.g2.key-facts` covers them.
7. **Melodies in context are major-key only.**

## For Brief 07 (Grade 3)

* Reuse `author-grade2.ts` and `scripts/grade2/*` as the pattern (specs carry their own bindings, so a lesson, its practice and its reviews cannot drift apart). Write the bindings first, reload, then pick questions; the intermediate path file must always validate.
* Run `npm run audit:mastery -w @mtp/api -- 3` while authoring (the script takes the grade as an argument; `auditCapacity(course, nodes, grade)` is generic) and add a Grade 3 describe block to `mastery-audit.test.ts`.
* A binding must state every dimension its template lists (`BINDING_SCOPE_IMPLICIT`); `author-grade2.ts` fills unstated ones with "none". Look at its `stated()` helper.
* When a template serves several concepts, add a boundary to `review-constraints.json`: `keys`, `timeSignatures`, `termIds`, `promptIncludes` (tells question kinds apart by their wording) and the older fields are available.
* Grade 3 adds the melodic minor: the introduction table entry is `minorForms: melodic` (`c.scales.minor-melodic`). The Grade 2 preview concept (`c.scales.minor-melodic-preview`) has no generated questions; do not reuse its template for mastery. Remove the wording guard in `graders/theory.ts` only by widening the Grade 3 scope (it already names the melodic minor when the scope allows it).
* Rule-checker facts that surprised this brief: x/2 bars need quavers beamed in fours; the checker accepts two beat rests or one minim rest for a silent half of 4/4; dotted rests after a semiquaver are accepted by the checker but deliberately not used (Q4).
* Grade 3's first node should depend on `G2-A` (the previous grade's assessment) or `G2-U5-R1` as the unlocking policy says; Grade 2 has no stored dependency on Grade 3.
* `teachingNodesBefore` now looks at all earlier grades, so Grade 3 blueprints can sample Grade 1-2 templates ("earlier grades" sections) without further changes.

## Reviewer guide

**Sol (code and logic):** `engine/src/generate/grade2.ts` (generators), `api/src/question-key.ts` (new constraint fields, `keyOf`), `api/src/node-run.ts` (one-line scope change), `engine/src/graders/theory.ts` (feedback wording), `api/scripts/author-grade2.ts`. Probe: any way an unenterable or ambiguous question reaches a learner; whether `promptIncludes` boundaries credit the wrong concept; whether a Grade 1 identity could change.

**Terra (student experience):** `npm run build && npm run e2e:grade2 -w @mtp/web` (set `SHOTS=dir`). Look at the triplet and rest notation, the ledger-line lessons, wording on the assessment screens, and lesson length.

**Teacher:** `docs/teacher/GRADE_2_TEACHER_REVIEW_PACK.md`, especially the decisions in section 8 and the term list.

## Known limitations

* Synthesised sound only; no novice testing; all content `draft`.
* The Grade 2 term list is the provisional vocabulary (eight terms first used at Grade 2).
* A few existing templates have small pools (rest regrouping 2-3, triplet writing 4-12); their concepts reach the capacity rule through the added templates.
* `nextNodeForGrade` still recommends an unpassed unit challenge before the next unit (unchanged, as in Brief 05).
