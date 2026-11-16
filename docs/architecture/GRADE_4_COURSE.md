# Grade 4 course (Brief 08)

The complete Grade 4 path: 25 lessons, 5 unit practice nodes, 5 unit reviews, 5 unit challenges and the Grade 4 assessment (41 nodes, all required, none optional). Coverage and verification tables are generated in [GRADE_4_COMPLETION_AUDIT.md](../curriculum/GRADE_4_COMPLETION_AUDIT.md); the material for a teacher is in [GRADE_4_TEACHER_REVIEW_PACK.md](../teacher/GRADE_4_TEACHER_REVIEW_PACK.md). It reuses the Grade 1-3 architecture ([GRADE_1_COURSE.md](GRADE_1_COURSE.md), [GRADE_2_COURSE.md](GRADE_2_COURSE.md), [GRADE_3_COURSE.md](GRADE_3_COURSE.md)) with the small, additive changes listed below.

**Source hierarchy.** The 2020 ABRSM outline decides what is examinable at Grade 4. Eric Taylor's *First Steps in Music Theory* (Grade 4 sections 1-15, printed pp. 79-103, and Grade 5 section 3 for the alto-clef octave work) guided topic order, depth and conventions; the pages (scan pages 47-59) were read directly in the supplied PDF. All teaching copy, examples, passages and questions are original. Two things the book does not provide are original here and flagged for a teacher: cancelling double accidentals (Q9) and the orchestral passages. Anything the pages did not make certain is listed in the teacher pack and avoided in questions.

## Units

| Unit | Content | Lessons |
|---|---|---|
| G4-U1 | Breves, double dots, regular metres, duplets | breve and its rest; double dots; all regular time signatures; grouping in the new times; duplets |
| G4-U2 | Double accidentals, enharmonics, the alto clef | double sharps/flats and cancelling; enharmonic equivalents; the alto clef; the same pitch in three clefs; octave transposition with the alto clef |
| G4-U3 | Five-accidental keys, technical names, chromatic scales | B major and G♯ minor; D♭ major and B♭ minor; key signatures in the alto clef; technical names; the chromatic scale |
| G4-U4 | Intervals and primary triads | intervals from any note; augmented and diminished intervals; triads on I, IV, V; chords (spacing, doubling, root position); naming chords in a passage |
| G4-U5 | Ornaments, instruments, passages | ornament signs; the orchestra; techniques and directions; Grade 4 terms; looking closely at a passage |

## Content pipeline

```
packages/api/scripts/grade4/u1..u5.ts      compact lesson specs (teaching copy, notation, bindings, question picks)
packages/api/scripts/grade4/lib4.ts        alto-clef notation builders, rhythm and scale helpers
packages/api/scripts/author-grade4.ts      writes lesson bindings into content/path/grade-4.json, builds content/lessons/G4-*.json,
                                           DERIVES practice and review bindings, rebuilds the blueprints and asserts their size
packages/engine/src/generate/grade4*.ts    Grade 4 generators (rhythm, pitch, harmony, context, text) and the registry grade4.ts
content/exercises/templates/grade-4.json   21 provisional templates (kept) + 37 new ones (all `draft`)
content/policy/review-constraints.json     concept boundaries for the 25 Grade 4 concepts
content/assessments/grade-4.json           five unit challenges and the Grade 4 blueprint (41 questions)
packages/api/scripts/grade4-docs.ts        generates the audit and the teacher pack (`npm run docs:grade4 -w @mtp/api`)
```

The lesson schema allows six explanation blocks, so `author-grade4.ts` fits each spec exactly as the Grade 3 script does (no example was dropped for Grade 4). Questions are picked from the generators inside each lesson's own taught scope and frozen with stable ids. **The script is idempotent**: sections it owns are replaced by id, never appended; section ids and the question count of every blueprint are asserted; `grade4-course.test.ts` runs it twice and compares every file it writes (which also catches a generator change that was not re-authored).

## What changed in shared code

| Area | Change | Why it cannot disturb Grades 1-3 |
|---|---|---|
| `music/vocabulary.ts` | **Versioned Grade 4 vocabulary** (`TERMS_G4`, `TECHNIQUES_G4`, `INSTRUMENTS_G4`, `VOCAB_G4`), a separate export | `TERMS`, `INSTRUMENTS` and `VOICES` are untouched |
| `generate/index.ts` | the generation fingerprint of a **Grade 4 template** also hashes `VOCAB_G4`; every other template hashes exactly what it hashed before | a test recomputes the old formula for all 140+ non-Grade-4 templates and requires equality, so no stored question id is refused as stale |
| `schema.ts` | `MusicScope.augmentedDiminished` (new optional dimension, introduced by `c.intervals.augmented-diminished`); `ChordAnswer.voices` (optional: the number of notes a chord-writing answer must have) | optional fields; absent in every earlier item |
| `engine/inputs.ts`, `verify-music.ts` | the interval quality choices include diminished and augmented only when `augmentedDiminished` (or Grade 5's `chromaticIntervals`) is in scope; an augmented or diminished answer outside that scope is rejected by the verifier; the chord builder asks for exactly `voices` notes when set | Grade 1-3 scopes have neither dimension, so their inputs and checks are unchanged |
| `graders/theory.ts` | a chord written with the right notes but not the number of notes asked (`voices`) is wrong, with feedback | only when `voices` is set |
| `syllabus/grade-scope.json`, `scope-concepts.json` | Grade 4 adds `augmentedDiminished`; one introduction row | Grade 4 only |
| Grade 4 provisional templates | all kept (21). Seven now use dedicated generators; three wrap the family generator (alto-clef reading, key signatures, octave transposition) so the prompt names the alto clef | no learner could ever see a Grade 4 question before this brief |
| `test/fixtures/brief04-question-keys.json`, `review-fixes.test.ts` | Grade 4 entries removed from the golden-key guard (they described provisional generators); Grades 1-3 and 5 stay pinned | the guard still pins 348 keys |
| `node-run.test.ts` | the "Grade 4-5 coming soon" check became "Grade 5 coming soon; Grade 4 locked behind Grade 3" | |
| `grade-5.json` | the seven planned Grade 5 review bindings of Grade 4 templates now state the dimensions those templates list | nothing else in Grade 5 changes |

## Decisions worth knowing

* **Concept boundaries decide credit, not templates.** A question counts for a Grade 4 concept only when it satisfies that concept's boundary (see the audit, section 4). This is how earlier-grade material is kept from earning Grade 4 mastery: 4/4 never credits `c.metre.regular-all`; a tonic-only chord never credits `c.chords.primary-triads`; a treble-to-bass octave transposition is never generated for alto credit; Grade 1-3 terms are not in the Grade 4 term question bank.
* **No ambiguous answers.** A rhythm is only asked as "add the time signature" when exactly one of the eighteen regular signatures fits every bar (4/8 therefore never appears: 2/4 always fits). Chromatic scales are judged by the rules (semitones, each letter once or twice, no double accidentals), so every musically acceptable spelling is accepted. Enharmonic questions state whether sound or spelling is compared.
* **Double-dotted rests (Q29).** Only their length is asked; none is written into a bar, and no question asks whether one is acceptable.
* **Compound rests in /4 and /16.** Not asked: there is no verified convention, and the Brief 07 handoff asked for one before Grade 4 asks them. The breve rest is the only rest written.
* **Double accidentals (Q9).** A natural sign cancels; the older natural-plus-sharp convention is mentioned once and never asked.
* **Intervals (Q27).** Any two notes of one scale within an octave; in minor keys the prompt names the form (harmonic, melodic going up, melodic coming down). Augmented and diminished intervals are gated by the new dimension, so the first interval lesson offers and asks only major, minor and perfect.
* **Chords.** Root position only; spacing and doubling never matter; chords with another note at the bottom are only called "not in root position" (inversions are Grade 5). Passages are two staves, one chord a bar, answered as composites of the real chord grader.
* **Descriptions.** Every Grade 4 stave a generator draws is described by `grade4-text.ts` from the notation itself (a sign is mentioned only if printed; the key signature is counted; ornaments and small notes are described by their look, never their name).

## Assessment

`a.g4` asks 41 questions per run: two for each of the 18 Grade 4 outcomes (36) and five earlier-grade questions (Grade 3 templates and melodies from Grades 1-2). The 66% pass mark needs 28 right answers, so at least 23 must be Grade 4 answers. The unit challenges have 8, 10, 8, 6 and 8 questions (pass 70%). The existing sample was reviewed and retained (see the audit, section 2).

## Testing

`engine/test/grade4-answers.test.ts` (independent derivation, adversarial answers, fingerprint and determinism checks), `api/test/grade4-course.test.ts` (41 nodes, progression, failed and passed challenge and assessment, retake, interruption, scope and later-unit-wording checks, boundaries, octave grading, the earlier-grade-only learner, idempotent authoring), the Grade 4 block in `mastery-audit.test.ts`, and `web/e2e/g4.mjs` (real-browser journeys on five viewports, keyboard, dark mode, reduced motion, 200% text at 320px, notation descriptions, chromatic scales, chords on two staves and multi-bar passages on 320px).
