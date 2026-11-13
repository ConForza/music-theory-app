# Brief 07 completion handoff: Grade 3

**Delivered:** all 36 Grade 3 nodes are playable (19 lessons, 5 practice, 5 reviews, 5 unit challenges, the Grade 3 assessment, one optional upbeat lesson); 23 new templates with generators and per-option misconception feedback; concept boundaries; the mastery audit run for Grade 3; independent answer checks; a full Grade 3 API journey test; real-browser Grade 3 journeys; the completion audit and teacher review pack (generated). Architecture: [GRADE_3_COURSE.md](../architecture/GRADE_3_COURSE.md).

**Not done, by design:** no teacher has reviewed anything; everything is `draft`, not approved, not "production-ready", not ABRSM-endorsed. No novice-learner session. Placement and practice exams remain Brief 10.

## Deliberate deviations from the provisional Grade 3 specification

1. Bindings of all 19 lessons were rewritten from the lesson specs (the planned ones reused templates before their teaching point). The 14 Brief 01 templates are kept; three gained scope dimensions; 23 templates were added.
2. G3-U1-R1 keeps its planned Grade 2 foundations, with two Grade 2 templates replaced as in Grade 2's review (`time-sig-read`, `ledger-place`).
3. Unit 1 and 2 challenges have 6 questions (3 per section, was 4); the Grade 3 assessment has 32 (was 16). Pass marks unchanged.
4. The optional upbeat node lists g3.02 as related outcome (schema needs one); it covers nothing.
5. The rule checker accepts a 12/8 half-bar rest (Q25).
6. Ledger limit four; `maxLedgerLines: 4` introduction row added (Q6).

## Open decisions (also in the teacher pack, section 8)

Q2 terms (six only, andantino's meaning), Q4/Q25 compound rests, Q5 upbeats, Q6 ledger limit, Q26 demisemiquaver beaming (book allows two groups of four), Q27 6th/7th of minor keys avoided in interval questions.

## For Brief 08 (Grade 4)

* Reuse `author-grade3.ts` / `scripts/grade3/*` (specs carry their bindings; run `npm run author:grade4` pattern; `fit()` handles the six-block limit).
* The vocabulary (`TERMS`) is part of every generation fingerprint: extend it deliberately, ideally with a versioned vocabulary, before adding the many Grade 3-4 terms the book lists.
* G4-U1-R1 binds three Grade 3 templates with the dimensions stated by this brief; keep them stated.
* Partly silent beats, two-beat notes mid-bar in 12/8 and double-dotted rests need a verified convention before Grade 4 asks them; the checker is lenient there.
* Intervals extend to any two notes of a key at Grade 4; `intervalQualities` boundaries and `interval-name` are the starting point; the 6th/7th of minor keys then need a form rule.
* Octave signs are text only; an engraved bracket needs a notation feature.
* A reviewer should look at: `engine/src/generate/grade3.ts`, `question-key.ts`, `curriculum/music/rhythm.ts` (12/8 rest), `author-grade3.ts`.

## Known limitations

Synthesised sound only; all content draft; very narrow phones shrink multi-bar rhythm lines (readable, time signature close to the first note); `nextNodeForGrade` still recommends an unpassed challenge before the next unit (unchanged).
