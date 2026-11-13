# Brief 08 completion handoff: Grade 4

**Delivered:** all 41 Grade 4 nodes are playable (25 lessons, 5 practice, 5 reviews, 5 unit challenges, the Grade 4 assessment); 58 templates with generators (21 provisional kept, 37 new) and per-option misconception feedback; concept boundaries for all 25 concepts; the mastery audit run for Grade 4 (no shortfalls, no exceptions); independent answer checks and adversarial grading; a full Grade 4 API journey test; real-browser Grade 4 journeys; the completion audit and teacher review pack (generated); an idempotent authoring pipeline. Architecture: [GRADE_4_COURSE.md](../architecture/GRADE_4_COURSE.md).

**Not done, by design:** no teacher has reviewed anything; everything is `draft`, not approved, not "production-ready", not ABRSM-endorsed. **Development completion is not educational approval.** No novice-learner session. Placement and practice exams remain Brief 10.

## Deliberate deviations from the provisional Grade 4 specification

1. All 25 lessons' bindings were rewritten from the lesson specs (the planned ones reused templates before their teaching point). All 21 provisional templates are kept; `t.g4.interval-diatonic`, `t.g4.chord-in-passage`, `t.g4.terms`, `t.g4.instruments`, `t.g4.time-signature` and `t.g4.double-accidental` have new generators under the same ids (the family generators asked tonic-only intervals, mentioned inversions, mixed Grade 1-3 terms, offered transposing instruments, ignored beaming rivals and exposed the bar-state double sign); `t.g4.alto-read`, `t.g4.key-signature` and `t.g4.octave-transpose-alto` wrap the family generator so the prompt names the alto clef; `t.g4.same-pitch` and `t.g4.passage` had no generator and now have one; `t.g4.same-pitch` moved from the note-reading family to note-writing (its answer is a note on the stave).
2. New scope dimension `augmentedDiminished` and chord answer field `voices` (additive, see the architecture note).
3. The alto-clef key signatures stay in G4-U3-L03 (the planned refinement).
4. The G4-U5-L05 passage lesson names First Steps section 15 as its model (the planned path named none).
5. The Grade 4 assessment keeps its planned 41 questions (36 + 5). Its earlier-grade section lists Grade 1-3 templates only (the planned list also contained `t.g4.passage`).
6. Grade 4 golden question keys were removed from the Brief 04 guard (provisional generators); Grades 1-3 and 5 remain pinned. Seven planned Grade 5 review bindings of Grade 4 templates were normalised.

## Open decisions (also in the teacher pack, section 8, and OPEN_QUESTIONS.md)

Q2 the 21-term list and eight techniques; Q7 range of regular signatures (2/8, 12/4); Q9 cancelling double accidentals; Q13 alto-clef key signatures; Q27 intervals in minor keys; Q28 scales with or without a key signature; new Q29 double-dotted rests, Q30 grouping in 2/8, Q31 instrument clefs, Q32 chromatic spelling preference, Q33 Roman numeral forms.

## For Brief 09 (Grade 5)

* Reuse `author-grade4.ts` / `scripts/grade4/*` (specs carry their bindings; `npm run author:grade5` pattern; `fit()` handles the six-block limit; the idempotency and exact-count assertions should be copied, and the "earlier-grade questions cannot pass the assessment" assertion too).
* Grade 5's planned review bindings reference Grade 4 templates; `author-grade4.ts` normalised seven of them. A Grade 5 script should re-run that normalisation for any Grade 4 template it binds.
* The Grade 4 vocabulary is versioned and separate (`VOCAB_G4`); add `VOCAB_G5` the same way (hash it only for Grade 5 templates) rather than editing `TERMS`/`INSTRUMENTS`, which are part of every Grade 1-3 fingerprint. Transposing instruments, the instrument list beyond Grade 4's, and the tenor clef belong there.
* `augmentedDiminished` (Grade 4) and `chromaticIntervals` (Grade 5) are separate: Grade 5 intervals between non-diatonic notes use the latter. `intervalLowerNote: "any"` is the Grade 5 starting point.
* Inversions (`b`, `c`) are not in any Grade 4 scope; `chord-root` asks only "root position?" and "which note is the root?". Grade 5 can turn the first into a real inversion question.
* The chord-writing `voices` field and the two-staff `score` chord questions are reusable for Grade 5 four-part work.
* Octave signs are still text-only; the engraved bracket remains a renderer feature.
* A reviewer should look at: `engine/src/generate/grade4-*.ts`, `grade4-text.ts` (descriptions derived from the notation), `curriculum/music/vocabulary.ts` (the Grade 4 lists), `review-constraints.json` (credit boundaries), `author-grade4.ts`.

## Known limitations

Synthesised sound only; all content draft; instrument clefs are 'normally' (the book's always-used underlining could not be read from the scan); the two bowing signs are characters whose look depends on the learner's font; the breve is drawn in one form only; rests in the new compound times and double-dotted rests are never written; `nextNodeForGrade` still recommends an unpassed challenge before the next unit (unchanged).
