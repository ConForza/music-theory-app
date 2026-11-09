# Music Theory Path — Brief 08 — Grade 4 Complete Course

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5; Opus for enharmonic/interval rules  
**Independent review:** GPT Sol Extra High + music teacher  
**Priority:** P1  
**Dependencies:** 07

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Complete Grade 4 grounded in *First Steps* Grade 4 §§**1–15** (printed pp. **79–104**) and the official syllabus. This level adds notation complexity, new clefs and meaningful harmonic context.

## Proposed units
| Unit | Content | Book reference | Original interaction |
|---|---|---|---|
| G4-U1 | Breves, double dots, regular metres, duplets | §§1–4, pp. 79–82 | Complete and regroup measures accurately in simple/compound time |
| G4-U2 | Double accidentals, enharmonics and alto clef | §§5,14, pp. 83,101 | Place F𝄪 in its correct spelling; recognise same pitch across treble/alto/bass |
| G4-U3 | More keys, degree names and chromatic scale | §§6–8,12, pp. 84–87,97–98 | Build keys through 5 sharps/flats; label supertonic/mediant/etc.; spell chromatic scale |
| G4-U4 | Intervals and I/IV/V harmony | §§9–11, pp. 88–96 | Identify intervals between arbitrary diatonic notes, build root-position chords |
| G4-U5 | Ornaments, instruments and context | §§13,15, pp. 99–104 | Match ornament signs, recognise instruments and analyse original score excerpts |

## Critical content rules
- All simple and compound duple/triple/quadruple time signatures required at this grade. Include note/rest groupings, breves and double dots, duplets.
- Accurate **alto clef** (C on line 3), octave transpositions between alto and treble/bass and pitch-name recognition across three clefs.
- **Double sharps, double flats and enharmonic equivalents** must be handled as *written* notation, not merely a MIDI match. Explain when a particular spelling is musically expected.
- Scales and key sigs through **five sharps/flats**, both harmonic and melodic minor; technical diatonic degree names, chromatic scale.
- Distinguish triad identification from full chord spelling; Grade 4 covers root-position tonic/subdominant/dominant harmonies, not Grade 5 inversions.
- Grade 4 ornaments and introductory standard orchestral instruments are applied to excerpts, not just memorised labels.

## Content safeguards
Avoid easy loopholes: a pitch-class-only answer must not pass a spelling exercise; an arbitrary interval must not be graded using Grade 3 tonic-only assumption; context-dependent chromatic spellings need unambiguous wording. Teacher and Sol review generated case diversity.

## Deliverables and acceptance
15 sections mapped; all official outcomes addressed, original question bank/approved generators, full Grade 4 assessment, accessible alto-clef and harmony editor, deterministic test suites including edge cases. PR unmerged.
