# Music Theory Path — Brief 07 — Grade 3 Complete Course

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5  
**Independent review:** GPT Sol High or Extra High + music teacher  
**Priority:** P1  
**Dependencies:** 06

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Complete Grade 3 from *First Steps* Grade 3 §§**1–12** (printed pp. **53–78**), respecting the official introduction of **compound time** and **melodic minor**.

## Proposed units
| Unit | Content | Book reference | Example original challenge |
|---|---|---|---|
| G3-U1 | Simple vs compound time, correct grouping | §§1–3, pp. 53–60 | Choose/correct grouping in 6/8, 9/8, 12/8; show 3 quavers per compound beat |
| G3-U2 | Small durations and pickup ideas | §§4–5, pp. 61–64 | Demisemiquaver values/rests; upbeat introduction as supporting concept |
| G3-U3 | Extended ledger lines and octave moves | §§6–7, pp. 65–67 | Read across expanded ledger positions; transpose between treble and bass by an octave |
| G3-U4 | Keys and minor forms | §§8–10, pp. 68–72; Grade 2 §11 | Build major/minor keys through four sharps/flats, compare harmonic and melodic minor |
| G3-U5 | Intervals and expression | §§11–12, pp. 73–78 | Give interval number and type above tonic; respond to new terms |

## Explicit differences from the book
- Place **melodic minor** in the formal Grade 3 pathway even though the supplied book taught it in its Grade 2 sequence.
- The book offers `Upbeat Starts` as a Grade 3 section: teach because it is useful for score reading, but assign its official examination status only after mapping to a current syllabus outcome; it must not create an invented compulsory exam domain.
- The official Grade 3 syllabus specifies interval **number and type** above tonic; Grade 4 expands this to intervals between arbitrary diatonic notes.

## Engineering requirements
Interactive compound-beat visualisation and grouping validation with rational rhythms; demisemiquaver note/rest support; keyboard-and-stave scale construction ascending/descending; correct raising/lowering of notes in minor forms; accurate octave transfer across clefs. Include meaningful application in short original scores, not only isolated notes.

## Deliverables and acceptance
All twelve book chapters accounted for, all current official Grade 3 outcomes covered, question/rule fixtures signed off by a theory teacher, Grade 3 world can be completed without Grade 4 concepts, grade assessment independently samples required areas and prior knowledge.
