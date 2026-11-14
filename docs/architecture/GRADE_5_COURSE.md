# Grade 5 course (Brief 09)

The complete Grade 5 path: 25 lessons, 3 optional enrichment lessons, 5 unit practice nodes, 5 unit reviews, 5 unit challenges and the Grade 5 assessment: **44 nodes, 41 required and 3 optional**. Coverage and verification tables are generated in [GRADE_5_COMPLETION_AUDIT.md](../curriculum/GRADE_5_COMPLETION_AUDIT.md); the material for a teacher is in [GRADE_5_TEACHER_REVIEW_PACK.md](../teacher/GRADE_5_TEACHER_REVIEW_PACK.md). It reuses the Grade 1-4 architecture ([GRADE_4_COURSE.md](GRADE_4_COURSE.md) and earlier) with the small, additive changes below.

**Source hierarchy.** The 2020 ABRSM outline decides what is examinable at Grade 5. Eric Taylor's *First Steps in Music Theory* (Grade 5 sections 1-15, printed pp. 105-142) guided topic order, depth and conventions; the pages (scan pages 60-80) were read directly in the supplied PDF. All teaching copy, examples, passages and questions are original. This is not an ABRSM product and carries no endorsement.

## Units

| Unit | Content | Lessons |
|---|---|---|
| G5-U1 | Irregular time and divisions | 5/4, 7/4, 5/8, 7/8; grouping in twos and threes; quintuplets to nonuplets |
| G5-U2 | Tenor clef and four-clef reading | the tenor clef; reading four clefs and same-pitch copies; octave transposition between any clefs |
| G5-U3 | Six-accidental keys, intervals, transposing instruments | F♯ major / D♯ minor; G♭ major / E♭ minor; chromatic intervals; compound intervals; written and concert pitch; transposing for B♭, A and F |
| G5-U4 | Inversions and cadences | inversions; the supertonic chord; chords in passages; cadence types; finding cadences; chords at cadence points, including the approach chord; optional Ic–V |
| G5-U5 | Ornaments, voices, instruments, score reading | how ornaments are performed; replacing written-out notes with signs; voices; how instruments make sound; more instruments; Grade 5 terms; reading a score; optional SATB |

## Content pipeline

```
packages/api/scripts/grade5/u1..u5.ts      compact lesson specs (teaching copy, notation, bindings, question picks), lib5.ts builders
packages/api/scripts/author-grade5.ts      writes bindings, builds the lessons, DERIVES practice and review bindings, rebuilds blueprints and asserts their size
packages/engine/src/generate/grade5*.ts    generators (rhythm, pitch, harmony, context, extra) and the registry grade5.ts
content/exercises/templates/grade-5.json   60 templates: 20 provisional (kept) + new ones, including five added after the paper comparison (all `draft`)
content/policy/review-constraints.json     concept boundaries for the 28 Grade 5 concepts
content/assessments/grade-5.json           five unit challenges and the Grade 5 blueprint (39 questions)
packages/api/scripts/grade5-docs.ts        generates the audit and the teacher pack (`npm run docs:grade5 -w @mtp/api`)
```

The authoring script is idempotent (sections replaced by id, exact counts asserted, optional templates asserted absent from every blueprint); `grade5-course.test.ts` runs it twice and compares every file.

## What changed in shared code (all additive)

| Area | Change | Why Grades 1-4 are undisturbed |
|---|---|---|
| `music/vocabulary.ts` | `VOCAB_G5` (`TERMS_G5`, `INSTRUMENTS_G5`, `VOICES_G5`) as a separate export | `TERMS`, `INSTRUMENTS`, `VOICES` and the Grade 4 lists are untouched |
| `generate/index.ts` | the fingerprint of a Grade 5 template also hashes `VOCAB_G5` | a test recomputes the old formula for every Grade 1-3 template, and the Grade 4 formula for Grade 4, and requires equality |
| `schema.ts`, `graders/rhythm.ts`, `verify-music.ts` | `RhythmAnswer.groupPattern`: a bar is judged against the named grouping alone | optional; absent in every earlier item |
| `graders/theory.ts`, `inputs.ts`, `canonical.ts`, `verify-music.ts` | a same-pitch copy in another clef is a transposition by `P1` that keeps the key signature (like `P8`) | `P1` never occurred before |
| `inputs.ts` | irregular groups offer 9:8 as well as 5:4, 6:4, 7:4 | only when the scope has `irregular` tuplets |
| `music/keys.ts` | `isDiatonicPair` / `isChromaticPairOfPitches` | new exports |
| `question-key.ts` | boundary fields `clefs`, `chromaticInterval`, `compoundInterval`, `inversions`; `chord ii` read from prompts | new optional constraint fields |
| `web` notation | irregular-group notes are announced by size (quintuplet ...) | triplets and duplets keep their names |
| `mastery-audit.ts` | the three optional concepts are allow-listed, each with a reason | enrichment is never mastery evidence |
| Brief 04 golden-key guard | Grade 5 entries retired (they described provisional generators) | Grades 1-3 stay pinned (246 keys) |

## Decisions worth knowing

* **Three independent checks for rhythm:** the bar total, the named grouping (against that grouping alone) and the tuplet ratio are never allowed to stand in for each other.
* **Same pitch, one octave, copied positions** are three different relations, computed from real pitches.
* **Inversions** are judged from the lowest note only; spacing and doubling are varied on purpose.
* **Cadence melody questions** accept every pair of chords that contains the melody notes and makes the named cadence, and are generated only when the melody leaves exactly that cadence type possible (the validator derives the types).
* **Chord writing** is asked in the treble and the bass clef: the question shows an empty stave in the asked clef with the key signature (a build question has no music of its own, so this is how the clef reaches the learner's stave); chord identification also uses both clefs.
* **Ornaments:** only replacing written-out notes with a sign is assessed; performance is described in words.
* **Enrichment** (Ic–V, SATB reading) is playable, bound to its own templates, and in no practice, review, challenge or assessment. The approach chord is compulsory (taught in G5-U4-L06, asked in Unit 4 practice, review, the challenge and the assessment); G5-U4-E2 is extra practice on the same template.

## Assessment

`a.g5` asks 39 questions per run: two for each of the 16 outcomes (32) and seven Grade 4 questions. The 66% pass mark, compared as an exact ratio from Grade 4 onwards, needs **26** right (25 fails), so at least 19 must be Grade 5 answers. The unit challenges have 6, 6, 8, 6 and 12 questions (pass 70%); Unit 1 was raised from the planned 4 to 6.

## Testing

`engine/test/grade5-answers.test.ts` (independent derivation, adversarial answers, determinism, fingerprints), `api/test/grade5-course.test.ts` (44 nodes, progression, failed and passed challenge and assessment, 25/26 of 39, Grade 3 21/32 and Grade 4 27/41 vs 28/41, retake, interruption, scope and later-unit wording, boundaries, enrichment, idempotent authoring), the Grade 5 block of the mastery audit, and `web/e2e/g5.mjs` (real-browser journeys on five viewports, keyboard, dark mode, reduced motion, 200% text at 320px, spoken descriptions, exact audio frequencies).

## Additions after comparing the course with eight Grade 5 papers

`docs/curriculum/GRADE_5_PAPER_COMPARISON.md` records what the papers showed. Decisions P1 and P3 to P7 were taken and built:

* **French terms** (`VOCAB_G5` version 2): the book's French list plus *sourdines*; asked by `t.g5.terms` ("A French term: ...") and taught in G5-U5-L06. Synonym groups keep French words from being offered beside their German or Italian equivalents.
* `grade5-extra.ts`: `t.g5.metre-mixed` (regular against irregular signatures; wrong choices always hold a different bar length), `t.g5.rest-judge` (rests in dotted-beat and irregular bars, decided by `music.checkBar`), `t.g5.duration-facts` (beats in a bar; dotted notes and ties counted in smaller values), `t.g5.clef-minor` (which clef makes the notes an ascending minor scale) and `t.g5.transpose-judge` (is a pupil's transposition right). All are bound to existing lessons, so practice and review draw on them, and all five also feed the unit challenges and the assessment. Counts of questions in every blueprint are unchanged.
* Independent checks are in `packages/engine/test/grade5-extra.test.ts`.
* `t.g5.metre-mixed` also draws bars with tuplets (own Grade 5 builder), and `t.g5.rest-judge` covers two-group metres with a rest-across-the-boundary distractor.
* Not built: tuplet totals in `t.g5.duration-facts`, and anything for P2 (terms beyond the book), which is a teacher decision (Q37).
