# Music Theory Path — Brief 03 — Music Notation Audio and Exercise Engine

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Opus 5.5 for rules/design; Sonnet for components  
**Independent review:** GPT Sol Max + qualified music reviewer  
**Priority:** P0  
**Dependencies:** 01–02

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Create the **musically correct deterministic system** that can teach all 75 book subjects and every official Grades 1–5 learning outcome. This is the most important technical brief. Never let an AI model be the authority for an objectively correct score answer.

## Domain and notation model
Represent a written pitch as `{step: A–G, alter: integer, octave}` rather than pitch number alone; keep written accidental, key signature, contextual sounding pitch, note duration (rational) and staff position separate. Represent rests, measure duration, barline, clef and clef change, voices, ties, tuplets, dots, beams, key signatures and articulations. Implement the exact rules for accidental application, cancellation, repeated pitch and ties over barlines. Include treble/bass/alto/tenor and ledger lines.

Build rules for Grade 1 note values through Grade 5 irregular subdivisions; simple vs compound beats; 2/4 3/4 4/4, Grade 2 additional simple metres, 6/8 9/8 12/8, Grade 4 regular metres, Grade 5 irregular metres. Enforce readable grouping where required; recognise **multiple valid answers** when phrasing or metre permits alternatives. Never force the same beam/rest shape for every context.

Build pitch theory for major, harmonic and melodic minor scales; key signatures and relative keys; intervals by number and quality (including simple/compound); enharmonic spelling and double accidentals; tonic, subdominant, dominant and supertonic chords/inversions; cadences and transposition to/from concert pitch for B♭, A and F instruments. The engine must distinguish an identical sounding note from an incorrectly spelt written answer when the task tests spelling.

## Interactive components (reusable)
1. SVG/canvas stave with line/space selection, keyboard alternative, zoom and accessible descriptions.
2. Piano keyboard that highlights notes, plays authored sounds and can construct intervals/chords/scales.
3. Note value/rest matching and bar-filling with rhythm fraction engine.
4. Drag/tap musical notation editor for noteheads, accidentals, rests, beams, ties and dots.
5. Time signature/rhythm composer and correct-beaming checker.
6. Scale and key-signature constructor with two clefs initially, four across the full programme.
7. Interval explorer with identify/build/listen in both directions, correct written interval spelling.
8. Chord/inversion/cadence builder, roman numeral and bass position support.
9. Clef/transposition editor, including written vs concert pitch.
10. Ornaments, dynamics, tempo, instrument labels, score-annotation and mixed observation tasks.
11. Short response and selection widgets with deterministic, semantically aware grading.

All tasks must be completed by touch *and* keyboard/screen-reader alternative; musical audio must have a visual/text equivalent where sound is not the learning objective.

## Exercise contract and content pipeline
Each item has stable `exerciseTemplateId`, version, approved parameters, seed, grade, outcome mapping, answer/rubric, valid alternatives, mistake categories, graduated hints, explanation, accessible equivalent and reviewer status. Question generators must check ambiguity, correct constraints, difficulty and answer availability before delivery. For example, an 'identify enharmonic' task should say whether sounding or spelling equivalence is being assessed.

Prioritise original authored source examples, with parameterised variants. Do not ingest the book's musical engravings, scan images or exercises into the application. Use a licensed notation library only after reviewing supported clefs, staff symbols, export and accessibility. Separate renderer from rule engine so replacing it does not invalidate answers.

## Music correctness test suite
Golden fixtures plus property-based invariants for: treble/bass middle C; ledger positions; accidental resets; ties across bars; dotted/double-dotted arithmetic; simple/compound grouping; triplet/duplet durations; harmonic vs melodic minor ascending/descending; circle of fifths/key sig ordering; spelling C♯ vs D♭; double flats/sharps; interval transpositions and inversions; valid alternatives in 5/8 and 7/8; alto/tenor clef; transposing B♭/A/F; I–IV–V and inversion analysis; cadence identification.

## Acceptance
Rule engine pure and independently tested; render and interaction state are not the scoring source; at least one complete original interactive exercise in each core widget family; deterministic seeds and sound/notation alignment; teacher-reviewed golden set (including Grade 5). PR stays unmerged.
