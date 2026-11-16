# Music Theory Path — Brief 01 — Curriculum and Learning Graph

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Opus 5.5 (high)  
**Independent review:** GPT Sol Max  
**Priority:** P0  
**Dependencies:** None

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Convert all **75 source-book sections** into a complete, versioned, original interactive course, while ensuring **every official ABRSM Grade 1–5 objective** has teachable lessons, independent practice, review, and assessment. This is the foundation that all other briefs consume; **do not build the full UI yet**.

## Authoritative reference work
- Read the uploaded *First Steps in Music Theory* in full, with particular attention to its contents (PDF pages 4–6), explanatory chapters and preface (PDF pages 7–8). Record the book's printed page numbers, not just PDF page indices.
- Read the official ABRSM syllabus from 2020: https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf; confirm whether a newer official revision exists at implementation time.
- Build `CURRICULUM_CROSSWALK.md`: one line per book section (G1 1–19, G2 1–14, G3 1–12, G4 1–15, G5 1–15); link each to one or more app concepts, grade units and official syllabus objectives.
- Build `SYLLABUS_GAPS.md`: classify each section as **core at this grade**, **core at another grade**, **supporting/enrichment**, or **no direct current-syllabus match**. Explicitly include the textbook's Grade 2 melodic minor treatment (Grade 3 core under the official syllabus), Grade 3 upbeat starts, Grade 5 SATB short/open scores and the Grade 5 6/4→5/3 progression, without automatically treating all such topics as current exam requirements.
- Check each official exam requirement for coverage missing from the book, especially score-based interpretation, musical context, orchestral instruments, voice/instrument knowledge and original examination-style application.

## Proposed learning path / first-pass unit map
Grade 1: `G1-U1` Note values/rests/ties/dots; `G1-U2` bars and time; `G1-U3` keyboard, stave, treble/bass, ledger lines; `G1-U4` accidentals; `G1-U5` tones, major keys and key signatures; `G1-U6` degrees, tonic triads and intervals; `G1-U7` musical terms and melody observation.

Grade 2: `G2-U1` new simple-time signatures and triplets; `G2-U2` grouping, rests and two ledger lines; `G2-U3` A/B♭/E♭ major keys; `G2-U4` relative keys and harmonic minor A/E/D; `G2-U5` intervals and terms.

Grade 3: `G3-U1` simple vs compound time, grouping and rests; `G3-U2` demisemiquavers/optional upbeat enrichment; `G3-U3` extended ledger lines and octave transfers; `G3-U4` keys through four sharps/flats and both minor forms; `G3-U5` interval qualities and terminology.

Grade 4: `G4-U1` all relevant regular metres, breves/double dots/duplets; `G4-U2` double accidentals, alto clef and octave transfer; `G4-U3` expanded keys, chromatic scales and technical degree names; `G4-U4` intervals and I/IV/V root-position chords; `G4-U5` ornaments, instruments and score questions.

Grade 5: `G5-U1` irregular time and divisions; `G5-U2` tenor clef, four-clef reading and transposition; `G5-U3` keys to six sharps/flats and all required interval forms; `G5-U4` chord inversions, identifying progressions and cadences; `G5-U5` ornaments, voices, instruments and applied score interpretation.

This is a **provisional pedagogical reordering** of the source book, not a replica of its pagination. Refine it only with a documented reason.

## Content model to implement
- `CurriculumRelease` with official source URL/version, approval status and publication timestamp.
- `SyllabusOutcome` (stable ID, grade, canonical brief description, source section, evidence status).
- `SourceBookSection` (grade, section number, heading, printed page, permitted citation-only pointer).
- `Concept` (stable ID, prerequisite IDs, ruleset IDs), `Unit` and `Lesson` (sequence and content version).
- Mappings `Lesson↔Concept`, `Lesson↔Outcome`, `BookSection↔Concept`, `AssessmentTemplate↔Outcome`.
- `ExerciseTemplate` (original prompt pattern, musical constraints, deterministic grading, error feedback, accessibility equivalent, review requirements, QA status).
- `LessonContent` (micro-explanation, sound/notation demonstration, guided steps, independent steps, recap and spaced-review prompts).
- Distinguish **reference provenance** from user-visible lesson content; no embedded textbook scans or extracts.

## Curriculum validator / automated tests
Produce a command that fails if any official outcome has no lesson, practice, review or assessment; if core book sections are unmapped; if a lesson relies on untaught prerequisites; if an exercise lacks grading or feedback; if content IDs are duplicated; or if a grade's assessment includes advanced mandatory knowledge beyond that grade.

Include a machine-readable `curriculum.json`/TS equivalent plus human-readable matrix. Record alternate teaching order when a book section is intentionally split across grades. Never claim 100% coverage until teacher review confirms it.

## Acceptance / PR contents
- All 75 book sections inventoried with correct grade and print-page numbers.
- Full official syllabus outcomes represented and audited; all differences explicitly reconciled.
- Provisional, coherent graph for all five grades; stable content schema and validation tooling.
- At least two realistic lesson JSON examples (one simple Grade 1 notation lesson and one complex Grade 5 cadence/transposition exercise).
- Tests and documentation green. Open focused PR, leave unmerged and undeployed.
