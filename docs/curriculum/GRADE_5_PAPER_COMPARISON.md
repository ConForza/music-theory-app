# Grade 5 course compared with eight ABRSM Grade 5 papers

**Status:** the owner approved P1 and P3 to P7 (P2 is a teacher decision). They are built and listed in section 6. Nothing else was changed because of this document, and all new content is `draft` until a teacher signs it off.

**Papers read (supplied by the owner):** four practice papers in the current format (2023 D, 2024 A, 2024 B, 2025 C: 75 marks, 2 hours) and four past papers in the old format (2014 A, B, C and S: 100 marks, 2 hours). No mark schemes or examiner reports were supplied, so correct answers are inferred from the printed questions only.

**Copyright:** the papers are copyrighted. They were used only to compare scope, question types and conventions. No question, melody or wording was copied into the app, and nothing here reproduces a question.

## 1. Shape of the current papers

Seven sections, each worth 10 marks except Keys and Scales (15) and the paper total of 75: Rhythm, Pitch, Keys and scales, Intervals, Chords, Terms/signs/instruments, Music in context. Almost everything is tick, circle or true/false. The only things written by the candidate are four intervals (4.3), a few numbers in 1.3 and 7.5, and chord numerals under two cadences (5.1). The 2014 papers instead ask for scales, transpositions, clef rewriting and a composed melody.

Consequence for the course: the course teaches and assesses more by writing than the current papers do, which is fine for learning. The assessment's question-type mix is not a copy of a paper, and need not be.

## 2. What the papers confirm

| Course decision | What the papers show |
|---|---|
| Cadences in C, G, D and F major only (Q8 area) | All eight papers use exactly these keys. |
| Cadence chords from I, ii, IV and V | 5.1 offers "I, IV or V" in some papers and "I, II, IV or V" in others. 2014 papers say one chord per place, position not required. |
| Perfect, plagal and imperfect cadence names | 5.2 asks exactly these three. |
| Chord naming as numeral plus position a/b/c, including inversions of II, IV and V | 5.3 offers IIb, IIc, IVa/b/c, Va/b, Ib, Ic and similar. Keys used: D, E, F major and E minor (A minor in 2014). |
| Chords are not required to be root position in the cadence questions' answers | Nothing requires it either way, but the 2014 papers say position need not be stated. The course's root-position cadence restriction is stricter than the papers, not looser. |
| Key signatures to six accidentals, with D♯, E♭ and B♭ minor and G♭ and F♯ major | 3.1/3.2 use G♭, F♯ and B major and D♯, E♭ and B♭ minor. |
| Compound intervals named either "major 10th" or "compound major 3rd" | Both forms appear in one answer list. |
| Diminished and augmented octaves | "diminished 8th/8ve" and "augmented 8th/8ve" appear in 4.1 and 4.3. |
| Transposing instruments: B♭ trumpet and clarinet, A clarinet, F horn, cor anglais | Each appears, in both directions (concert to written and written to sounding). |
| Written-out ornaments: trill, turn, mordents, appoggiatura, acciaccatura | 6.2 asks for these. |
| Chromatic scale (taught in Grade 4) | 3.6 tests it at Grade 5, starting on F, A♭, E♭, D♯, D♭ and C♯. |

## 3. Differences and possible gaps

Ranked by how likely they are to matter. "Recommend" is my suggestion, not a change made.

1. **French terms are absent at every grade.** The book prints a French list (douce, lent, modéré, léger, très, sans, avec, en dehors, retenu and others) on p. 104, and the papers test French at Grade 5 (a term meaning question and a "with mutes" direction in French; a French tempo word in a score). `TERMS`, `TERMS_G4` and `TERMS_G5` contain none. *Recommend:* add a French group to `VOCAB_G5` (language `french`) using the book's list, and add the French mute direction to the string/brass techniques. Needs teacher confirmation of the list (Q2).
2. **Terms the papers use that the course lacks:** doloroso, a niente (the course has "niente"), tristamente, scherzando and con spirito appear in the music-in-context scores or statements. The course has dolente/dolore but not doloroso. *Recommend:* teacher decides how far the Grade 5 list extends beyond the book; the context questions can use terms printed in the score only if they are glossed.
3. **Time signatures in mixed company.** Paper 1.1 gives three or four signatures drawn from regular and irregular metres together (including x/2, x/16, 4/8 and the cut-time sign) for bars containing tuplets, including quintuplets and duplets. The Grade 5 `time-signature` template uses only 5/4, 7/4, 5/8 and 7/8. Regular metres with duplets and triplets are covered by Grade 4 templates and appear in the assessment's seven earlier questions, but a Grade 5 learner never meets a regular-versus-irregular choice. *Recommend:* a mixed-metre variant of the time-signature template.
4. **Rewriting a bar from simple to compound time and back (1.2).** Three candidate rewritings are offered (a triplet becomes a duplet and the reverse). Grade 3 and Grade 4 cover compound rests and regrouping but I found no template that asks for the other-metre rewrite of a whole bar. *Recommend:* check with the teacher whether this belongs to Grade 4's outline; if so add a Grade 5 review template.
5. **Rests marked right or wrong (1.5)** in 6/8, 12/16 and 3/8. Grades 2 and 3 have rest-judging templates (`t.g2.rest-judge`, `t.g3.compound-rest-judge`) but none in 12/16, 6/16 or irregular time at Grade 5. The three samples I could see do not touch the simple-time minim-versus-two-crotchets question (Q21), so the papers give no evidence on it either way.
6. **Duration arithmetic (1.3 and 7.5).** Beats per bar in compound metres on semiquaver and minim bases, a dotted note equal to a number of demisemiquavers, tuplets worth a number of minim beats, and tied notes worth a number of demisemiquavers. The course has irregular beat counts and tuplet facts, but not demisemiquaver equivalents or tied-note totals. *Recommend:* add as a note-value facts variant.
7. **"Which clef makes this a minor scale" (3.5)** and **"which accidentals complete this scale" (3.4)**, including a harmonic minor in C♯. The course has scale-building and `scale-spot` but no clef-choice scale question. *Recommend:* a low-risk new template (answer is a choice of clef).
8. **Checking a transposition rather than writing it (2.3).** The candidate ticks or crosses each note and the key signature of a transposed bar. The course writes transpositions (`instrument-transpose`, `transpose-key`). The skill is the same; the format is not. *Recommend:* add a judge variant.
9. **Scale-degree names in all keys (3.7).** Supertonic, mediant, submediant and leading note in keys such as F♯ minor, E♭ major and C♯ minor. The course covers degree names, but I did not confirm the six-accidental keys are included in the degree-name template scope.
10. **Roman numeral case.** The papers print I, II, IV, V in capitals for every chord, including the supertonic in a minor key. The course shows "ii". The grader reads the degree whatever the case, so "IIb" is accepted; the lessons should say that either case is correct.
11. **Music in context (section 7).** The papers ask: compare a bar with another part some octaves higher or lower; true/false about tempo, dynamics, the loudest or quietest bar, the largest melodic interval, the final chord (tonic or dominant of a named key), a tie or ornament in a named bar, the highest note; which instrument could play a part at sounding pitch; count a named scale degree in a named range of bars; fill in bar numbers. The course's `score` and `score-melody` cover many of these. I did not check that "count a degree" and "name the loudest bar" exist. *Recommend:* teacher or a later brief reviews this section against the templates one by one.
12. **Only in the 2014 papers:** rewriting short score as open score, naming the key at the end of an extract, and changing time signatures mid-extract. The course has open and short score only as optional enrichment (G5-U5-E1) and has no key-change or time-signature-change questions. These are absent from all four current papers, so I do not recommend adding them.

## 4. What I did not check

- Whether the 2020 outline still examines anything the 2023–25 papers do not (so the course may include a topic the exam has dropped, for example writing scales, composing and clef rewriting). The syllabus currency question (Q1) is still open.
- Grades 1 to 4, because no lower-grade papers were supplied.
- Mark allocation. Without mark schemes I cannot say how much each question type is worth to a candidate beyond the section totals.

## 5. Decisions needed

| # | Decision | Suggested answer |
|---|---|---|
| P1 | Add French terms and the French mute direction to `VOCAB_G5` | Yes, using the book's list, pending teacher confirmation |
| P2 | Extend terms beyond the book where papers use them | Teacher decides |
| P3 | Add a mixed-metre time-signature template | Yes |
| P4 | Add rest-judging in compound and irregular metres | Yes |
| P5 | Add duration facts (demisemiquaver equivalents, tied totals) | Yes |
| P6 | Add the clef-for-minor-scale and judge-a-transposition templates | Yes, lower priority |
| P7 | Note in lessons that capital and lowercase numerals are both accepted | Yes |

## 6. What was built (owner approved "all suggestions")

| # | Result |
|---|---|
| P1 | French terms added to `VOCAB_G5` (version 2): the book's list from p. 104 plus *sourdines*; taught in G5-U5-L06; asked by `t.g5.terms`. |
| P2 | Not done: a teacher decides how far the list goes beyond the book (doloroso, a niente, tristamente, scherzando, con spirito). Added to the teacher pack as item 13 and to `OPEN_QUESTIONS.md` as Q37. |
| P3 | `t.g5.metre-mixed`. About 40% of its bars hold tuplets: triplets in simple time, duplets in compound time, and triplets, quintuplets and septuplets in irregular time. Tuplet bars come from a Grade 5 builder; the Grade 4 reader is untouched. |
| P4 | `t.g5.rest-judge` for dotted-beat metres (9/x, 12/x) and 7/4, 7/8 (two silent groups, three bars), and for the two-group metres 5/x and 6/x (the last unit of the first group and the first unit of the second are silent: one rest for each is right, one rest across the boundary is wrong; two bars). |
| P5 | `t.g5.duration-facts`: beats in a bar and dotted-note or tied-note sums. Tuplet totals in minim beats are not covered. |
| P6 | `t.g5.clef-minor` and `t.g5.transpose-judge`. |
| P7 | Already in the lesson in a different form, but the old wording said "either spelling is accepted", which is only true as a meaning: the app's input is a list that shows ii. The G5-U4-L02 text now says the exam prints capitals, lower case is also recognised, and the app's ii means the same as II. |

The new templates are bound to lessons G5-U1-L01 to L03, G5-U2-L02 and G5-U3-L06, so practice and review use them, and all five are in the unit challenges and the assessment (question counts unchanged). The `duration-facts` template's regular-metre questions earn no concept credit, because the only Grade 5 concept it can attach to is the irregular-metre one: they are practice only.
