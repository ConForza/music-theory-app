# Brief 09 completion handoff: Grade 5

**Delivered:** all 44 Grade 5 nodes are playable (25 lessons, 3 optional enrichment lessons, 5 practice, 5 reviews, 5 unit challenges, the Grade 5 assessment; 41 required); the number of templates is in the audit (20 provisional kept, the rest new), each with a generator, grader and mistake-specific feedback; concept boundaries for all 28 concepts; the mastery audit for Grade 5 (0 shortfalls; three optional concepts allow-listed with reasons); independent answer checks; a Grade 5 API journey test; real-browser journeys; the audit and teacher pack (generated); an idempotent authoring pipeline. Architecture: [GRADE_5_COURSE.md](../architecture/GRADE_5_COURSE.md).

**Not done, by design:** no teacher has reviewed anything; everything is `draft`, not approved, not "production-ready", not ABRSM-endorsed. **Development completion is not educational approval.** No novice-learner session. Placement and practice exams remain Brief 10.

## Deliberate deviations from the provisional Grade 5 specification

1. Unit 1 challenge raised from 4 to 6 questions; the other challenge sizes (6, 8, 6, 12) and the 39-question assessment are kept.
2. The 20 provisional templates are all kept, each with a dedicated generator (the family generators mixed instrument transposition into octave questions and had no ambiguity control); new templates were added for variety and for a second question type per concept.
3. The Ic–V enrichment now unlocks after the cadence lessons (planned after L03) because its questions use cadence-key harmony.
4. Enrichment nodes name an outcome (the lesson schema requires one) but are never mastery evidence.
5. Grade 5 golden question keys were removed from the Brief 04 guard (provisional generators); 246 Grade 1-3 keys stay pinned.
6. Chord writing is asked in treble and bass clef, via an empty stave shown with the question (a build question's own stave follows the clef of the music it shows).

7. After the owner supplied eight Grade 5 papers, French terms and five new templates were added (`docs/curriculum/GRADE_5_PAPER_COMPARISON.md`): `t.g5.metre-mixed`, `t.g5.rest-judge`, `t.g5.duration-facts`, `t.g5.clef-minor`, `t.g5.transpose-judge`. Vocabulary version is now 2. The papers' extra terms (P2) were not added: a teacher decides.

8. **Bug found and fixed (web).** The note-entry rhythm editor beamed every bar by the FIRST pattern of an irregular signature (7/8 as 2+2+3), so a correct bar for "grouping 2 + 3 + 2" was sent beamed the wrong way and refused. It showed up as an intermittent "Unit 1 end to end" failure in the browser suite (it depended on which grouping the seed drew). The rhythm input now carries the question's `groupPattern`, the editor beams by it (or by the first pattern that reads cleanly when none is named), and `web/src/test/rhythm-beam.test.ts` pins it. Grades 1-4 are unaffected: only irregular signatures have more than one pattern.

## Open decisions

Q2 term lists; Q8 enrichment; Q13 key signatures in C clefs; Q14 writing versus identifying chords; Q27-Q33 inherited conventions; new Q34 voice ranges, Q35 grouping in irregular time, Q36 transposition wording. See the teacher pack, section 8.

## For Brief 10 (placement, practice examinations, release preparation)

* Placement and practice exams can draw on every Grade 1-5 template; Grade 5 questions carry `VOCAB_G5` in their fingerprint, Grades 4 and 5 compare pass marks as exact ratios, Grades 1-3 keep the rounded rule: a practice exam should say which rule it uses per grade.
* Optional enrichment templates (`t.g5.cadential-six-four`, `t.g5.satb-voices`, `t.g5.satb-facts`) must stay out of placement and exams. `t.g5.approach-chord` is compulsory and may be used.
* A reviewer should look at: `engine/src/generate/grade5-*.ts`, `curriculum/music/vocabulary.ts` (`VOCAB_G5`), `review-constraints.json` and the new fields in `question-key.ts`, `author-grade5.ts`.

## Known limitations

Synthesised sound only; all content draft; voice ranges are provisional; the approach-chord grader checks the approach chord and the cadence chords as separate points, so the generator only asks where the chord at B is the single possible one and refuses it at A; the octave sign of open-score tenors is described in words only; instrument clefs are 'normally'; the renderer's irregular-group names are announced by size.
