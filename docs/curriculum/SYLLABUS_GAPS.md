# Syllabus gap audit — *First Steps in Music Theory* vs the ABRSM 2020 Grades 1–5 syllabus

**Status:** draft for independent review (GPT Sol Max) and qualified-teacher sign-off. Nothing here claims verified coverage.

## 1. Authorities and method

| Role | Source | Notes |
|---|---|---|
| **Authority for examinable scope** | *The ABRSM Music Theory Syllabus from 2020: Grades 1 to 5* (one-page outline, dated July 2020), [official PDF](https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf). Retrieved 9 Nov 2026; SHA-256 recorded in `content/release.json`. | Read in full and decomposed into 80 atomic outcomes (`content/syllabus/abrsm-2020-outcomes.json`). The time-signature glyphs were read from the rendered page because they are images in the PDF. |
| Teaching reference | Eric Taylor, *First Steps in Music Theory: Grades 1 to 5* (1999), user-supplied scan. | All 75 sections read (OCR text plus page images where the OCR was unclear). The preface says the book supports other publications and leaves out composition-type questions. |
| Original material | This project | All learner-facing explanations, examples and exercises are newly written. |

**Currency check.** No newer Grades 1–5 theory syllabus was found. However, the abrsm.org HTML pages were blocked by the site's bot protection from the build environment, so this could not be confirmed on the publisher's own pages. A human must confirm this before release ([OPEN_QUESTIONS Q1](OPEN_QUESTIONS.md#q1)). Secondary sources (tutors and publishers) agree that the move to online exams changed the question formats but not the syllabus content. They also report that composition tasks and the Grade 5 short/open-score question were dropped. Those reports are used only as corroboration, never as authority.

**Method.**
1. Each numbered item in the outline was split into atomic outcomes, citing the item number.
2. Each book section was classified (see §4) and mapped to app concepts, units and outcomes.
3. The reverse check: for every outcome, find the book sections that teach it. Outcomes with no section, or only partial coverage, are gaps that need original material (see §3).
4. The validator (`npm run validate`) enforces the results mechanically: zero unmapped core sections, zero outcomes without a lesson, practice, review and assessment, and zero above-grade material in any template or assessment.

## 2. Book content that is graded differently, outdated or beyond the current syllabus

| # | Book section | Finding | Treatment in the app |
|---|---|---|---|
| A1 | **G2 §9** Harmonic and melodic forms; **G2 §11** Melodic A/E/D minor | The 1999 book lets Grade 2 candidates choose *either* minor form. The 2020 outline says **"harmonic only"** at Grade 2 and requires both forms from Grade 3. | §9 is split: the harmonic part is core at G2, the melodic part is core at G3. §11 is **core at another grade (G3)**. Melodic minor is taught in `G3-U4-L01`. `G2-U4-E1` is an optional, never-assessed preview. The validator blocks melodic minor from the Grade 2 scope. |
| A2 | **G1 §18** (answering two-bar rhythm); **G3 §5** (upbeat in a composed four-bar rhythm) | Rhythm composition is not in the 2020 outline. | Recorded as `no_current_match` parts. Not taught or assessed. |
| A3 | **G3 §5** Upbeat starts | Anacrusis is not an explicit outcome, but it is common in real melodies. | **Supporting**: optional enrichment node `G3-U2-E1`, never a compulsory assessment domain ([Q5](OPEN_QUESTIONS.md#q5)). |
| A4 | **G3 §6** Octave signs | Related to "beyond two ledger lines" and to terms and signs. Not a separate outcome. | Supporting concept `c.pitch.octave-signs`, taught in a required lesson because it helps reading. Not separately mandatory in assessments. |
| A5 | **G5 §10** The 6/4–5/3 progression | The outline requires identifying I/ii/IV/V in root position, first and second inversion, so Ic and V can each be identified. It does not name the Ic–V progression as a task. | **Supporting**: optional enrichment `G5-U4-E1`. Chord identification of Ic and V stays core (`g5.09`). |
| A6 | **G5 §11** Approach chords | The outline says "choice of suitable chords at cadential points". Approach chords are not named. | That part is **supporting**: optional enrichment `G5-U4-E2`. |
| A7 | **G5 §13** SATB short and open score | Voice types are core (G5 item 5). Transcribing between short and open score is not in the 2020 outline; secondary sources say it was removed. | Section is **supporting**. Transcription is `no_current_match`. Optional enrichment `G5-U5-E1`. |
| A8 | **G5 §14** Ornaments (realisation) | The outline allows replacing written-out ornaments with signs **"but not vice versa"**. | Realisation is taught for understanding only (`G5-U5-L01`). Template `t.g5.ornament-replace` assesses only the written-out → sign direction. Writing out ornaments is never assessed. |
| A9 | **G2 §4** Grouping of rests (includes 2/4, 3/4, 4/4) | The G1 outline says "grouping of the notes listed above". G2 says "grouping of notes **and rests**". | G1 teaches basic rest placement (`G1-U2-L06`). The full rest-grouping rules are core at G2 ([Q3](OPEN_QUESTIONS.md#q3)). |
| A10 | **G4 §11** / **G5 §9** roman-numeral conventions | The book says capital-only numerals are acceptable in exams. | Acceptance rules accept words, capital-only numerals and case-sensitive numerals. |
| A11 | Term and sign lists (G1 §19, G2 §14, G3 §12, G4 §15, G5 §15) | The book's lists match the 1999 companion workbooks. The 2020 outline publishes **no** term lists. | Terms stay core per grade, but the vocabulary is **unverified** until an authoritative current list is supplied ([Q2](OPEN_QUESTIONS.md#q2)). No term list is committed yet. |
| A12 | **G5 §3** Tenor clef; octave transpositions | The book first teaches octave transposition into C clefs at Grade 5. The outline requires it for the **alto** clef from Grade 4 (G4 item 2). | Part recorded as **core at another grade (G4)**; original lesson `G4-U2-L05`. |

## 3. Official requirements that the book omits or covers only partly

| # | Outcome(s) | Gap | Plan |
|---|---|---|---|
| B1 | `g1.21` simple questions about a melody (cumulative to all grades) | No book section. The preface says applied question types are covered elsewhere. | Original "Looking closely at a melody/passage/score" lessons in every grade (`G1-U7-L05`, `G2-U5-L04`, `G3-U5-L04`, `G4-U5-L05`, `G5-U5-L07`) and a `fam.score-observation` template in every grade assessment. |
| B2 | `g4.08` cancelling double sharps and double flats | G4 §5 introduces 𝄪/𝄫 but not how to cancel them. | Original content in `G4-U2-L01`. The exact cancellation convention needs teacher confirmation ([Q9](OPEN_QUESTIONS.md#q9)). |
| B3 | `g4.07` octave transposition to and from the alto clef | G4 §14 shows the same pitch in three clefs but does not teach octave transposition into alto. The book teaches it only at G5 §3 (see A12). | Original lesson `G4-U2-L05`. |
| B4 | `g4.18` instrument questions *related to a passage* | G4 §15 lists instruments but has no passage-based application. | Original passages in `G4-U5-L05` and `t.g4.passage`. |
| B5 | `g5.15` basic sound production; instrument clefs | G5 §15 covers reeds and some families. Strings, brass and percussion sound production are only implied. | Original lesson `G5-U5-L04`. |
| B6 | `g5.16` general musical observation on actual music | Not covered as an applied task. | Original authored scores in `G5-U5-L07` and `t.g5.score`. |
| B7 | `g5.04` four clefs "in any of the keys set for this grade" | Covered by G5 §§3–5 (key-signature layouts in all clefs). Writing scales in alto or tenor is explicitly *not* asked. | Templates read notes and key signatures in four clefs. Scale writing stays in treble and bass. |
| B8 | Exam format | Grades 1–5 are assessed online. The book was written for paper exams. | The app practises understanding through both *identify* and *build* tasks. It does not imitate the online exam interface ([Q10](OPEN_QUESTIONS.md#q10)). |

## 4. Classification of all 75 sections

Classification vocabulary required by Brief 01: **core at this grade**, **core at another grade**, **supporting/enrichment**, **no direct current-syllabus match**. The full per-section mapping (units, concepts, outcomes, printed pages) is in [CURRICULUM_CROSSWALK.md](CURRICULUM_CROSSWALK.md). The table below is generated from `content/source-book/first-steps-sections.json` and lists every section that needs reconciliation.

<!-- BEGIN GENERATED: book-classification -->

| Section | Heading | Classification | Taught at | Note |
|---|---|---|---|---|
| G1 §18 (p. 24) | The Grouping of Notes Within a Bar | Core at this grade | G1 | Matches G1 item 2 (grouping). The book's 'choices' guidance supports accepting multiple valid groupings. |
| ↳ part | Writing an answering two-bar rhythm | No direct current-syllabus match | not taught | Rhythm composition is not in the 2020 outline; the book refers to it as exam preparation. Not taught or assessed. |
| G2 §9 (p. 42) | Harmonic and Melodic Forms of the Minor Scale | Core at this grade | G2 | Split. The 1999 book lets Grade 2 candidates choose harmonic or melodic form; the 2020 outline specifies harmonic only at Grade 2 and both forms from Grade 3. |
| ↳ part | Melodic minor form | Core at another grade | G3 | Taught in G3-U4-L01; optional non-assessed preview in G2-U4-E1. |
| ↳ part | Choosing either form in Grade 2 | No direct current-syllabus match | not taught | Outdated exam option; Grade 2 progress and assessment require harmonic minor only. |
| G2 §11 (p. 45) | The Melodic Scales of A, E and D Minor | Core at another grade | G3 | Deferred: core at Grade 3 under the 2020 outline. Grade 2 must not require it. |
| G3 §5 (p. 62) | Upbeat Starts | Supporting / enrichment | G3 | No explicit 2020 outcome. Useful for reading real melodies; taught as an optional enrichment node and never a compulsory assessment domain. |
| ↳ part | Using an upbeat in a composed four-bar rhythm | No direct current-syllabus match | not taught | Rhythm composition is not in the 2020 outline. |
| G3 §6 (p. 65) | Ledger Lines and Octave Signs | Core at this grade | G3 | Matches G3 item 2 (beyond two ledger lines). |
| ↳ part | Octave signs (8va/8vb) | Supporting / enrichment | G3 | A convention related to item 2 and to terms and signs; not a separately stated outcome. |
| G4 §5 (p. 83) | Double Sharps and Flats; Enharmonic Equivalents | Core at this grade | G4 | Matches G4 item 2. Gap: the book does not cover cancelling double accidentals, which the outline lists; original content needed. |
| G4 §14 (p. 101) | The Alto Clef | Core at this grade | G4 | Matches G4 item 2 (alto clef; same pitch in three clefs). Gap at this grade: octave transposition into/out of the alto clef is required by the outline at Grade 4 but the book only teaches it at Grade 5 (§3); original content in G4-U2-L05. |
| G4 §15 (p. 102) | General Questions | Core at this grade | G4 | Matches G4 item 5 (terms; orchestral instruments). Partial gap: applying instrument knowledge to a passage of music needs original passages. |
| G5 §3 (p. 107) | The Tenor Clef; Octave Transpositions | Core at this grade | G5 | Matches G5 item 2. Differently graded: the book first teaches octave transposition into C clefs here, but the outline requires it for the alto clef from Grade 4 (G4 item 2). |
| ↳ part | Octave transposition involving the alto clef | Core at another grade | G4 | Required from Grade 4 by the 2020 outline; taught in G4-U2-L05 with original material. |
| G5 §10 (p. 120) | The 6/4–5/3 Progression | Supporting / enrichment | G5 | The outline lists inversions of I and V (so Ic and V can be identified as chords) but does not name the Ic–V progression as a separate task. Taught as optional enrichment; never a separate mandatory assessment item. |
| G5 §11 (p. 122) | Chords at Cadence Points | Core at this grade | G5 | Matches G5 item 4 (chords at cadential points; perfect/plagal/imperfect in C, G, D, F major). |
| ↳ part | Approach chords before a cadence | Supporting / enrichment | G5 | Not named in the outline; optional enrichment (G5-U4-E2). |
| G5 §13 (p. 129) | SATB in Short and Open Score | Supporting / enrichment | G5 | Voice types are core (item 5). Transcribing between short and open score is not in the 2020 outline (secondary sources report the question was removed with the online format). Taught as optional enrichment only. |
| ↳ part | Transcribing between short and open score | No direct current-syllabus match | not taught | Not a 2020 outcome; never assessed. |
| G5 §14 (p. 132) | Ornaments | Core at this grade | G5 | Matches G5 item 5 (recognition; replacing written-out ornaments with signs). |
| ↳ part | Writing out how an ornament is performed | Supporting / enrichment | G5 | Taught for understanding only. The outline says 'but not vice versa': never assessed. |
| G5 §15 (p. 138) | General Questions | Core at this grade | G5 | Matches G5 item 5. Partial gap: 'basic way instruments produce sound' and 'general musical observation' need fuller original content and authored scores. |

The other 61 sections are **core at this grade**, match the 2020 outline at the same grade and have no recorded gaps: G1 §1, G1 §2, G1 §3, G1 §4, G1 §5, G1 §6, G1 §7, G1 §8, G1 §9, G1 §10, G1 §11, G1 §12, G1 §13, G1 §14, G1 §15, G1 §16, G1 §17, G1 §19, G2 §1, G2 §2, G2 §3, G2 §4, G2 §5, G2 §6, G2 §7, G2 §8, G2 §10, G2 §12, G2 §13, G2 §14, G3 §1, G3 §2, G3 §3, G3 §4, G3 §7, G3 §8, G3 §9, G3 §10, G3 §11, G3 §12, G4 §1, G4 §2, G4 §3, G4 §4, G4 §6, G4 §7, G4 §8, G4 §9, G4 §10, G4 §11, G4 §12, G4 §13, G5 §1, G5 §2, G5 §4, G5 §5, G5 §6, G5 §7, G5 §8, G5 §9, G5 §12.

<!-- END GENERATED: book-classification -->

## 5. Grade-boundary guardrails enforced automatically

- **Keys**: the cumulative key set per grade is checked against the music rules. G1 is exactly C/G/D/F major. G2 adds A/B♭/E♭ major and A/E/D minor. G3, G4 and G5 must be exactly all keys up to 4, 5 and 6 sharps or flats.
- **Minor forms**: melodic minor is rejected in Grade 2 scope.
- **Metres**: G1–2 simple only; G3 adds compound; G4 regular only; G5 adds 5/4, 7/4, 5/8, 7/8.
- **Intervals**: number only above the tonic (G1–2) → number and quality above the tonic (G3) → any two diatonic notes within an octave (G4) → any note, simple and compound, chromatic (G5).
- **Harmony**: tonic triads only (G1–3) → root-position I/IV/V (G4) → I/ii/IV/V in a/b/c (G5). Cadence keys are limited to C/G/D/F major.
- **Assessments**: no outcome, template or concept above the assessment's grade. Enrichment-only templates cannot appear in assessments. Every grade assessment samples every outcome introduced at that grade.

## 6. Residual risks

- The atomic outcome decomposition is an interpretation (all 80 outcomes are `teacherReview: pending`).
- Term lists, ledger-line caps and rare regular time signatures need authoritative confirmation (Q2, Q6, Q7).
- Exercise templates are `draft`. Each needs a teacher-reviewed sample of generated items and golden fixtures in the Brief 03 engine.
