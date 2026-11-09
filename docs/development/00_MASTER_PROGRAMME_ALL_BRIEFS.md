# Music Theory Path — Revised Grades 1–5 Development Programme

**Version 2.0 — 9 November 2026**  
**Scope:** Five complete grade worlds, Grade 1 to Grade 5 only.  
**Concept:** Duolingo-style *music theory teaching*, not a flashcard app, clone or official ABRSM product.

## Read this first

**Required handoff attachments for the coding agent:**
1. The **user-supplied original PDF**, Eric Taylor, *First Steps in Music Theory: Grades 1 to 5*. Do **not** place this copyrighted PDF in a public repository, website bundle or source-control commit.
2. This **development pack**, including `12_source_book_curriculum_crosswalk.md`.
3. The official ABRSM syllabus: https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf . Re-check it when implementation begins.

**Two-authority rule:** *First Steps* informs topic explanations, teaching order and important musical theory; the currently published official syllabus determines grade-by-grade examinable scope. The app's text, staff examples, diagrams, sound and exercises must be independently authored. The book itself states (preface, PDF pp. 7–8) that it supplements other resources and does not cover every examination question type.

## Product definition
A responsive, installable-friendly learning app centred on five grade worlds. Each is a path of units and short lesson nodes. Learners read/hear a musical concept, manipulate a real staff or keyboard, answer questions, get explanations, earn XP, revisit weak material and demonstrate genuine mastery in grade assessments.

**Learning feedback loop:** `learn → see/hear → do → explain mistakes → retry → XP → review → mastery → grade challenge`.

**Non-negotiable UX:** phone/tablet/desktop; keyboard access; accessible notation; original art; voice/sound optional where appropriate; no mandatory lives or punitive streak loss; progress safe on poor connections; meaningful feedback, not just red/green ticks.

**Out of scope:** Grades 6–8, teacher admin, social leaderboards, payments, mandatory AI-generated tutoring, copied ABRSM exams, native iOS/Android apps. These can be reconsidered after Grades 1–5 work.

## Build order and suggested models

| # | Brief | Primary agent | Independent reviewer | Milestone |
|---:|---|---|---|---|
| 01 | Curriculum and Learning Graph | Claude Opus 5.5 | GPT Sol Max | A |
| 02 | Foundation Accounts and Navigation | Claude Sonnet 5.5 | Sol High + Terra | A |
| 03 | Music Notation Audio and Exercise Engine | Opus rules + Sonnet UI | Sol Max + theory teacher | A |
| 04 | Progression XP Mastery and Revision | Sonnet 5.5 | Sol Extra High + Terra | A |
| 05 | Grade 1 Complete Course | Sonnet 5.5 | Sol Extra High + teacher | B |
| 06 | Grade 2 Complete Course | Sonnet 5.5 | Sol High + teacher | C |
| 07 | Grade 3 Complete Course | Sonnet 5.5 | Sol High / Extra High + teacher | C |
| 08 | Grade 4 Complete Course | Sonnet 5.5 | Sol Extra High + teacher | D |
| 09 | Grade 5 Complete Course | Opus logic + Sonnet implementation | Sol Max + teacher | D |
| 10 | Revision Placement and Practice Exams | Sonnet 5.5 | Sol Max | B–D increments |
| 11 | Independent QA Release and Deployment | Sonnet fixes + Terra browser | Sol Max + teacher | Every milestone |

## Scope and release contracts
- **A: Internal vertical slice** = briefs 01–04 and sample Grade 1 unit. Validates source mapping, staff/piano interactions, rewards and accessible feedback.
- **B: Usable Grade 1** = brief 05, plus Grade 1 portions of 10 and 11, with real end-to-end learning.
- **C: Grades 1–3** = briefs 06–07, relevant revision and QA, preserving earlier progress.
- **D: Complete Grades 1–5** = briefs 08–09, all grades' assessment/review and final QA.

**Definition of done for a grade:** Every syllabus outcome is mapped to an original explanation, a demonstration, guided practice, independent assessment, spaced review, signed-off answer rule, original representative examples, accessible alternative and user-facing completion experience. **No placeholder units.**

## Grade-world outline (pedagogical reordering of the source book)

| Grade | Themes | Critical syllabus guardrail |
|---|---|---|
| 1 | rhythm, bars, stave, clefs, accidentals, major keys C/G/D/F, tonic triads, interval numbers, terms | Two clefs; numbered intervals only above tonic |
| 2 | additional simple metres, triplets, ledger lines, A/B♭/E♭ major, A/E/D harmonic minor, terms | Textbook Grade 2 melodic-minor content deferred to Grade 3 core |
| 3 | 6/8 9/8 12/8 compound time, demisemiquavers, octave moves, keys through four accidentals, melodic minor, interval qualities | Book upbeat chapter mapped as supporting unless official outcome verified |
| 4 | regular metres, breves/double dots/duplets, alto clef, double accidentals, keys to five sharps/flats, chromatic scale, I/IV/V root chords, ornaments/instruments | Exact written spelling and arbitrary diatonic intervals matter |
| 5 | irregular metres, tenor clef, concert-pitch transposition B♭/A/F, six accidental keys, compound intervals, inversions/cadences, voices/instruments, scores | Book SATB and 6/4→5/3 contexts flagged supporting pending outcome mapping |

## Engineering standards across all briefs
- No LLM as the source of truth for standard music answer marking; deterministic model.
- Preserve letter-name spelling, accidental and octave—not just semitone number.
- Validate all generated exercises for solvability, ambiguity, accepted alternatives and test samples.
- Persist durable individual attempts and version both exercise templates and syllabus.
- Separate UX engagement metrics from musical mastery; mastery is earned through independent evidence.
- Secure account separation, appropriate child privacy, idempotent rewards, repeatable migrations, graceful slow-network handling.
- Accessible SVG/canvas notation alternatives, keyboard control, text for sound exercises, 320px–desktop, zoom and reduced motion.
- Original content and IP provenance; no scans, copied exercises or implied ABRSM endorsement.

## Each implementation PR must include
Scope summary and screenshots (where relevant); links to affected book sections and official outcomes; original content/rule changes; unit/integration/E2E tests; accessibility evidence; music QA fixtures; exact-head CI outcome; outstanding risks and next phase dependencies. No automatic merging or deployment.

## Source notes and limitations
- Book: Eric Taylor, *First Steps in Music Theory*, ABRSM Publishing, first published 1999, user-provided PDF. Table of contents at PDF pp. 4–6, preface pp. 7–8; 75 numbered sections. This is a teaching reference, not comprehensive current exam specification.
- Official: *ABRSM Music Theory Syllabus from 2020: Grades 1–5*, publisher PDF URL above, checked 9 Nov 2026; online Grade 1–5 theory exams per ABRSM: https://www.abrsm.org/en-cy/music-theory/about-music-theory .
- **Verification caveat:** any change in the official syllabus after the reference used here must trigger a new versioned coverage audit before release. Some curriculum units are provisional; only the subsequent outcome-level, teacher-reviewed matrix can establish full coverage.

---

# Numbered development briefs

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


---

# Music Theory Path — Brief 02 — Foundation Accounts and Navigation

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5  
**Independent review:** GPT Sol High + Terra UX  
**Priority:** P0  
**Dependencies:** 01

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Deliver the working application shell for a friendly, accessible and genuinely usable Grade 1–5 course. Do not start with a disposable mock-up or presume the app should be embedded in an existing WMF system.

## Product experience
Onboarding must offer **New to music theory** and **I already know some theory**; explain that the five grades are independent educational milestones, not official certificates. Provide grade selection, optional placement test entry point, five-world map, unit overview, lesson player, practice dashboard, review queue, profile/settings and resume entry point. Make the map comprehensible without knowing the book's chapter numbers (which can be shown in optional reference metadata for authors/teachers).

Build a simple branded product, *Music Theory Path* (working name), with original artwork and UI, inspired by the motivational structure of Duolingo but **not** duplicating its characters, icons, illustrations or distinctive assets. A fixed-screen, point-and-click learning experience must work on iPhone, iPad, desktop and keyboard.

## Student user stories
- As a complete beginner, I can see one clear next lesson and learn the musical alphabet before meeting difficult notation.
- As a piano student, I can use an on-screen piano to hear how abstract notation connects to sound.
- As an experienced musician, I can take a placement assessment and unlock appropriate material without cheating the grade-completion rules.
- As a returning learner, I can resume exactly at my last unfinished exercise and keep completed work when switching device.
- As a learner with visual/motor/audio access needs, I can complete equivalent tasks without relying on colour, gesture or hearing alone.

## Engineering
Inspect the target repository and reuse its supported stack. If a new repository, propose a lean TypeScript UI + backend + relational storage architecture and document the choice; implement real migrations, environment configuration, test CI and preview deploy. Implement guest/demo flow with explicit limitations and durable user accounts. Plan UK age-appropriate privacy and consent before launch, minimising children's personal data. Avoid public accounts, follower systems or child leaderboards.

Persist each attempt and lesson position with idempotent commands, durable per-student scoping, secure session handling, safe guest-to-account upgrade and deletion/export mechanisms. User inputs never directly determine authoritative XP, grade unlock or results. Ensure safe retry on flaky connections and refresh.

## Screens and minimum deliverable
- Five visually differentiated grade worlds with actual course schema data, locked/unlocked states and progression captions.
- Functional sample unit and end-to-end navigation, settings, resume, progress save.
- Course data/content loaded from Brief 01 schema; no hard-coded content in component implementations.
- Responsive staff notation area that can scroll/scale without clipping; meaningful loading and error states.
- Analytics restricted to privacy-conscious counts and completion events; optional notifications disabled by default.

## Acceptance
Guest/student can start, answer, pause, resume and migrate progress safely. Data isolation tests pass, retries create no duplicate attempts/XP, usable from 320px upward with accessible focus, 200%/400% zoom tested, no locked/blank dead ends. CI green; PR unmerged.


---

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


---

# Music Theory Path — Brief 04 — Progression XP Mastery and Revision

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5  
**Independent review:** GPT Sol Extra High + Terra UX  
**Priority:** P0  
**Dependencies:** 01–03

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Provide a recognisably Duolingo-style learning loop without manipulative mechanics or conflating time spent with genuine understanding.

## Main path and game structure
Five grade worlds → topic units → micro-lesson nodes → mixed checkpoint challenges → grade-end challenge. Recommended 3–7-minute lessons; adjust for complex musical construction instead of artificially splitting every task. Introduce some short optional 'hear it' and 'build it' diversions. Keep the map readable and delightful on phone without horizontal scrolling, even with long topic names. Show reason for a locked node, allow replay of unlocked nodes, and support non-linear targeted review.

**Sample Grade 1 loop:** Music notes → stave introduction → treble clef line names → tap a written note → play its piano sound → place the answer → feedback → XP → new lesson unlock → later spaced review.

## XP, streak, levels, badges
- XP rewards meaningful participation and independent success, not repeated easy clicks; ledger entries have unique source-event keys and caps on repetitive farming.
- Daily goal defaults to one meaningful session, adjustable/off. Daily streak is optional and never removes mastered content after a missed day. Timezone + DST safe.
- World badges for substantive achievements: 2 clefs read, C/G/D/F scales complete, Grade 2 triplets mastered, Grade 3 compound-time challenge, Grade 4 chromatic spelling, Grade 5 cadence challenge. Celebrations are short, accessible, muteable and respect reduced motion.
- Avoid finite hearts or punishment that prevent learners recovering from mistakes; no social comparison of children by default.

## Mastery is independent
Track concept knowledge with evidence across multiple templates, unassisted performance, variety, difficulty and review after elapsed time. Suggested states: `new → learning → practising → proficient → mastered → review_due`. Use configuration, empirical tuning and teacher acceptance, not unverified statistical claims.

Do not let a lesson with hints count as proof of mastery. A completed unit may unlock the next topic on a teaching basis, but grade-completion assessment must independently sample all required outcomes. Provide exact, understandable explanation of 'lesson complete' vs 'exam readiness'.

## Adaptive revision
Maintain per-concept queue, spaced intervals, varied question modes and age-appropriate content. A wrong response triggers a worked explanation and a focused remedial step. Interleave prior concepts (e.g. Grade 1 intervals appear in Grade 3 review) without surprising students with unseen later-grade topics. Accessibility alternatives do not give lower mastery weight.

## Data integrity and product testing
Persist attempts/answers/feedback, XP ledger, grade unlocks, mastery evidence, due dates and streak-day events securely. Concurrent devices and duplicate submissions must not inflate results. Cover offline interruptions and timezone changes.

## Acceptance
Fully working interactive path from start to reward and review; replay does not corrupt progression; mistake remediation is helpful; grade unlock cannot be hacked by client state or XP; documented rules and performance metrics; keyboard/mobile testing passes.


---

# Music Theory Path — Brief 05 — Grade 1 Complete Course

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5; Opus for difficult rule changes  
**Independent review:** GPT Sol Extra High + music teacher  
**Priority:** P0  
**Dependencies:** 01–04

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Deliver the **first complete and genuinely teachable Grade 1**. Cover *First Steps* Grade 1 Sections **1–19** (printed pp. **1–28**) and every official Grade 1 syllabus outcome. This is not a demonstration with a couple of quizzes.

## Proposed seven teaching units and chapter evidence
| Unit | Student-friendly journey | Book reference | Core original interactions |
|---|---|---|---|
| G1-U1 | Notes, durations, silence | §§1,3,11,12, printed pp. 1,3,12–14 | Note/rest matching, beat equivalence, tie vs dot, audio timeline |
| G1-U2 | Count the beat and build bars | §§2,18, pp. 1–2,24–26 | 2/4 3/4 4/4, bar filling, beaming, group correction |
| G1-U3 | The keyboard and the stave | §§4–7, pp. 4–7 | Letter names, treble/bass, middle C, place note, limited ledger lines |
| G1-U4 | Sharps, flats and naturals | §§8,14, pp. 8,18–19 | Keyboard and stave accidentals, cancellation in context |
| G1-U5 | Tones, semitones and major keys | §§9,10,13,15, pp. 9–11,15–20 | C/G/D/F major, major pattern, key signatures, degrees by number |
| G1-U6 | Triads and intervals | §§16,17, pp. 21–23 | Tonic triads in root position, numbered intervals above tonic |
| G1-U7 | Read the music | §19, pp. 27–28; melody context from official syllabus | Terms, tempo, dynamics, articulation, annotation and simple score observations |

Reorder introduction as needed to avoid prerequisite breaks, but preserve the explicit section-to-lesson map. G1-U1 and U3 may be interwoven to make the experience lively. Everything must use original examples, not page screenshots.

## Lesson recipe (every required topic)
Teach one concept through: short plain-English introduction; interactive display on staff and/or piano; at least one guided example; independent response(s) across varied seeds; mistake-specific feedback; a recap; spaced review. `G1-U2-L03` might ask the learner to make a complete 3/4 bar by selecting note/rest values, then show why four crotchet beats exceed its capacity.

## Specific musical rules
- Scope rhythms to semibreve through semiquaver, rests, single dots, ties and Grade 1 grouping; never require advanced metre.
- Keep treble and bass clef and middle C accurate; ledger-line limits under official requirements.
- Grade 1 major keys **C/G/D/F** in both clefs; tonic triads in root position; intervals above tonic by **number only**, not quality.
- Note that the book's Grade 1 section on note grouping includes convention-sensitive alternatives; do not wrongly reject musically acceptable notation where the task is under-specified.
- Test questions about original short melodies, not only isolated flashcards.

## First playable vertical slice
Before mass authoring, implement and validate a 5–7-minute Grade 1 unit fragment covering stave/treble clef/keyboard and targeted correction. Test with a novice learner and a qualified teacher. Only then scale the content.

## Deliverables
Approved lesson specs, original teaching copy, original score/audio examples, generated exercise families and answer fixtures, end-unit reviews, full Grade 1 assessment, curriculum audit, E2E checks. Grade completion uses assessment breadth and mastery—not XP.

## Acceptance
All 19 book sections explicitly mapped and official Grade 1 outcomes covered; teacher signs off representative generated items and all fixed examples; an actual beginner can finish Grade 1 with explanations, activities and revision; no placeholder units or unsupported difficulty jumps; no incorrect grading in golden tests.


---

# Music Theory Path — Brief 06 — Grade 2 Complete Course

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5  
**Independent review:** GPT Sol High + music teacher  
**Priority:** P1  
**Dependencies:** 05

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Complete Grade 2 as a continuation of Grade 1, informed by *First Steps* Grade 2 §§**1–14** (printed pp. **29–52**) while applying the current official syllabus boundaries.

## Proposed units
| Unit | Content | Book reference | Example exercise |
|---|---|---|---|
| G2-U1 | New simple-time signatures and triplets | §§1–2, pp. 29–31 | Place three triplet quavers within a crotchet beat; build 2/2 or 3/8 bar |
| G2-U2 | Correct groupings and ledger lines | §§3–5, pp. 32–38 | Find improper rest grouping; identify notes using two ledger lines above/below |
| G2-U3 | The next major keys | §§6–8, pp. 38–41 | Build A, B♭, E♭ major and identify key sig/tonic triads |
| G2-U4 | Relative keys and harmonic minor | §§9–12, pp. 42–47 | Find A/E/D harmonic minor; raise leading note correctly; relate major/minor |
| G2-U5 | Intervals, terms and music reading | §§13–14, pp. 48–52 | Number intervals from tonic, interpret new directions in an original melody |

## Critical book-to-syllabus reconciliation
The older book explicitly introduces **harmonic and melodic minor in Grade 2 (§§9,11)**. The official 2020 Grade 2 syllabus specifies **harmonic minor only**. Mark its melodic-minor material `deferred to Grade 3 core`; an optional 'coming later' demo is acceptable, but Grade 2 progress or assessment must not require melodic minor.

Similarly, any book content with a richer time/term example than the current requirement should be labelled enrichment rather than presumed examination content. Use the exact official grade-specific key set and ledger-line limits.

## Required features
- Pulse vs notation visualiser for 2/2, 3/2, 4/2, 3/8 and triplets.
- Rest-grouping and correct-beaming feedback grounded in the metre.
- A keyboard-to-written-key exercise for tonic vs relative minor, augmented 2nd of harmonic minor as an optional explanatory sound example (avoid terminology as gate unless in requirements).
- Exercises alternating Grade 1 major keys and new Grade 2 keys to reinforce cumulative learning.
- New performance terms presented with application on a short authored melody, not a detached vocabulary dump.

## Deliverables and acceptance
No missing book sections, with §11 explicitly deferred; all official Grade 2 outcomes mapped, tested and teacher approved. Grade 2 mixed assessment covers new and prerequisite concepts; repeated questions vary meaningfully. PR unmerged/undeployed.


---

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


---

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


---

# Music Theory Path — Brief 09 — Grade 5 Complete Course

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Opus 5.5 for applied harmonic/transposition rules; Sonnet for content/UI  
**Independent review:** GPT Sol Max + music teacher  
**Priority:** P1  
**Dependencies:** 08

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Complete the most demanding Grade 5 learning path from *First Steps* Grade 5 §§**1–15** (printed pp. **105–142**) and official ABRSM learning outcomes. This must become an **applied theory course**, not merely harder multiple-choice quizzes.

## Proposed units
| Unit | Content | Book reference | Original interactive task |
|---|---|---|---|
| G5-U1 | Irregular time signatures and divisions | §§1–2, pp. 105–106 | Build 5/4, 7/4, 5/8, 7/8 bars with an indicated grouping; identify allowed subdivisions |
| G5-U2 | Tenor clef and transposition | §§3,12, pp. 107–108,126–128 | Move a melody between any two of four clefs; written ↔ concert pitch for B♭/A/F |
| G5-U3 | Advanced keys and intervals | §§4–7, pp. 109–114 | Spell F♯/G♭ major, D♯/E♭ minor and simple/compound intervals accurately |
| G5-U4 | Inversions, chords and cadences | §§8–11, pp. 115–125 | Label inversion, choose cadence-point chord, listen/build perfect/plagal/imperfect cadence |
| G5-U5 | Scoring, ornaments and musical context | §§13–15, pp. 129–142 | Identify voice types/instrument families, recognise ornaments, annotate authored short scores |

## Important book distinctions
The source book has sections on **the 6/4–5/3 progression (§10)** and **SATB in short and open score (§13)**. They are valid musical learning contexts, but do not assume every detail is an explicit standalone official Grade 5 examination requirement. Link each subtopic to a specific official outcome or treat it as clearly labelled supporting/enrichment content.

## Exact official boundaries
- Irregular signatures include **5/4, 7/4, 5/8, 7/8**; phrase/grouping matters. Question prompts must indicate grouping where several answers would be legitimate.
- Read notation in treble, bass, alto and tenor; transfer a simple melody by an octave among clefs; transpose short lines to/from concert pitch for B♭, A and F instruments, with the interval specified.
- Major/minor scales and signatures through **six** sharps/flats; intervals from any note, simple and compound.
- Root position, 1st inversion and 2nd inversion of **tonic, supertonic, subdominant and dominant** chords in keys specified by the syllabus. Cadence-chord selection and perfect/plagal/imperfect cadences in **C, G, D and F major**; no invented extra mandatory chord-selection keys.
- Instrument/voice types, playing/sound production, instrument clefs, ornaments and musical-context observations.

## Applied exercise formats
- Multi-step stave editor: construct, transpose and correct a written melody, preserving note spelling and register.
- Chord-building with functional harmonic labels and inversion; allow more than one correctly voiced representation where task allows.
- Cadence analysis inside an **original** two- or four-bar passage; annotate key, bass movement, chord and classification.
- Short original orchestral/SATB excerpts for instrument/voice interpretation without copying workbook scores.
- Generators that offer hints only in learning mode; independent evidence gathered separately.

## Hard correctness fixtures
B♭ vs A vs F instrument directions; all four clefs and octave offsets; written vs sounding enharmonic spelling; chord inversion irrespective of upper-voice voicing; cadence classification and admissible alternatives; irregular metres and acceptable compound interval spellings.

## Acceptance
15 source sections mapped and all official outcomes independently tested; full Grade 5 mock built from original material; expert teacher signoff on tricky music logic; Grade 5 must be finishable entirely in the app by an attentive student (not just by someone who already knows theory). PR unmerged.


---

# Music Theory Path — Brief 10 — Revision Placement and Practice Exams

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5  
**Independent review:** GPT Sol Max for scoring/coverage  
**Priority:** P1  
**Dependencies:** Grade 1 baseline; expand through 09

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Turn five grade-worlds into a coherent course for learning, retention and honest examination preparation. Distinguish **practice exam** from official ABRSM examination and never issue or imply an official certificate.

## Three study routes
1. **Learning path**: sequenced micro-lessons with a motivating reward loop.
2. **Personal revision**: missed questions, concept weakness, due reviews and targeted explanatory lessons.
3. **Assessment mode**: original mixed-topic diagnostics, unit bosses, grade practice papers and readiness profile.

A student should be able to access a '5-minute review' from home, practise specific source-book topics by **concept** rather than by book page, and repeat earlier grades safely. Book section numbers may appear in optional instructor notes, but the public path should use understandable titles.

## Exam content and distribution
- Official ABRSM Grades 1–5 are assessed online; create original practice interfaces that exercise similar *skills*, not a copy of PSI's test UI or official questions.
- Include rhythm, pitch, keys/scales, intervals, terms/signs and music-in-context across every grade where relevant, plus harmony/cadence/transposition for later grades.
- Content-matrix validator must prove every official learning outcome is teachable, practisable and eligible for assessment.
- Draw representative items from approved generation constraints, including full score-reading tasks. Mixed practice is adaptive; formal practice exams have documented, balanced sampling and repeatable seeds.
- Offer untimed practice with feedback and an optional timed mock; do not claim a timed simulation matches an official exam unless format and duration are independently verified.

## Scoring and readiness
- Store raw answers, rubric version, hints used, concept coverage, independent accuracy, question-version and score.
- Prohibit hint-assisted questions from masquerading as independent assessment evidence.
- Show `mastered`, `developing`, `needs review` and `not yet assessed`, plus why and next recommended lesson.
- A grade completion badge is an **in-app achievement**, while examination readiness is a cautiously labelled estimate.
- Use configurable pass/readiness defaults; never present app thresholds as ABRSM pass marks.

## Placement and remedial learning
Placement routes an experienced learner to an estimated starting point but retains prerequisites needed for understanding. If they perform poorly on melodic minor or compound time, propose a Grade 2/3 catch-up lesson. Let a learner elect to begin lower without penalty.

## Integrity, privacy and fairness
Students can export/delete appropriate learning data, retain corrections when scoring rules evolve, and see when an assessment is superseded by a new syllabus version. Don't publish children's results or leaderboards. Audio-disabled alternatives and accessibility accommodations must not unfairly depress scores.

## Acceptance
Mocks from different seeds are meaningfully varied; five grades each have coverage completeness and report-backed question distribution; duplicate submissions never double award; weak topic remediation works; readable reports and no official endorsement claims.


---

# Music Theory Path — Brief 11 — Independent QA Release and Deployment

**Programme:** Duolingo-inspired Music Theory, Grades 1–5  
**Version:** 2.0 — 9 November 2026  
**Owner decision:** Scope limited to Grades 1–5; standalone, mobile-first product by default  
**Implementer:** Claude Sonnet 5.5 for fixes; Terra for browser checks  
**Independent review:** GPT Sol Max + human music-theory teacher  
**Priority:** P0 release gate  
**Dependencies:** Any releasable milestone

> **Source hierarchy:** (1) current official ABRSM Music Theory Grades 1–5 syllabus, (2) user-supplied Eric Taylor *First Steps in Music Theory* for foundational explanations/topic sequencing, and (3) newly authored teaching material and exercises. The uploaded book is a copyrighted reference, not application content or an asset library. Verify official syllabus currency before release.

## Goal
Create stable, musically correct, accessible release candidates instead of endless review loops. Execute proportionate release gates for the vertical slice, Grade 1, Grades 1–3 and complete Grades 1–5.

## Independent verification tracks
### Curriculum and musical accuracy
Teacher validates every grade's official-outcome traceability and **representative samples of each generated exercise template**. Spot-check high-risk note spelling, time grouping, ties, transposing instrument intervals, chromatic scales, minor forms, inversions, and cadence classification. Verify `First Steps` source headings are covered without copied exercises or text. Attach reviewer checklist and regression snapshots to the PR.

### Automated correctness
Types, lints, production build, migrations, pure music-rule unit tests, generator/answer invariants, error feedback snapshots, progression idempotence, user isolation, security probes, contract/integration, and essential browser journeys all pass on the exact reviewed commit.

### Student experience / Terra visual pass
Phones from 320px width, tablets, desktop, portrait/landscape, keyboard navigation, screen-reader equivalents, 200–400% zoom, focus visibility, reduced motion, sound-off mode, notation overflow, long labels and slow network. Observe **a beginner completing one lesson** rather than only taking screenshots of static screens.

### Safety and IP
Use only original illustrations, scores, narration, audio and explanations (or separately licensed material). The user-supplied PDF must stay an authoring reference, **not be committed or bundled** into public product assets. Check developer access controls, child privacy, consent decisions, deletion/export and analytics minimisation. Branding must not imply ABRSM partnership or endorsement.

## Issue closure / no endless loops
Each review issue requires reproducible evidence, owner/severity and acceptance criterion. Fix critical and high-impact defects, rerun affected tests, resolve review threads, report unresolved low-risk items in a release note. Avoid repeatedly expanding scope once gates pass; new ideas go to follow-up backlog.

## Release sequence
A. **Vertical slice** — curriculum + framework + notation + progression + complete sample Grade 1 micro-unit; internal only.
B. **Grade 1 MVP** — full Grade 1 learning, assessment/revision, peer review and usability checks.
C. **Grades 1–3** — expansion with new compound/metre/minor rules; rerun earlier-grade regression.
D. **Grades 1–5** — all five grades, complete current-syllabus traceability, assessment QA and professional music-teacher review.

## Deployment / rollback
Separate staging from production; preserve exercise/content versions and attempt histories; set database backup and rollback plan before schema changes. Migrations and content release toggles are independently reversible where possible. Postdeploy smoke checks: onboarding, grade map, audio, original notation, attempt commit, XP idempotence, review due, accessibility alternative, grade results and account deletion.

## Acceptance
The chosen release milestone has no unfilled syllabus outcomes, missing lesson implementations, or false passes in musical grading; exact-head CI green; accessibility and security gates pass; manual musical signoff recorded; developer and independent reviewer approvals posted. **Do not merge or deploy without explicit owner authorisation.**


---

# Source-book → Duolingo-style course crosswalk (75 sections)

**Source:** Eric Taylor, *First Steps in Music Theory: Grades 1 to 5*, first published 1999, user-supplied PDF. **Printed pages** (not PDF index) are shown below. This is an authored chapter index and curriculum-planning map, not a reproduction of book explanations or exercises.

**Important:** `core` here is a **provisional** syllabus/teaching classification; final status needs the official outcome mapping and a music teacher's check. 'Supporting' topics may be taught but must not be presented as separately required in an exam without matching a current official outcome. This table doesn't itself prove full current syllabus coverage. The source book says it omits some examination-task types.

## Grade 1 — 19 source sections

| § | Topic paraphrase | Printed p. | App unit(s) | Treatment |
|---:|---|---:|---|---|
| 1 | Note values: crotchet, minim, semibreve | 1 | `G1-U1` | core |
| 2 | Bars and time signatures | 1 | `G1-U2` | core |
| 3 | Quavers and semiquavers | 3 | `G1-U1` | core |
| 4 | Letter names of notes | 4 | `G1-U3` | core |
| 5 | Stave and clefs | 5 | `G1-U3` | core |
| 6 | Writing notes on the stave | 6 | `G1-U3` | core |
| 7 | Ledger lines | 7 | `G1-U3` | core |
| 8 | Sharps, flats and naturals | 8 | `G1-U4` | core |
| 9 | Semitones, tones, C major | 9 | `G1-U5` | core |
| 10 | G, D and F major scales | 10 | `G1-U5` | core |
| 11 | Rests | 12 | `G1-U1` | core |
| 12 | Ties and dotted notes | 13 | `G1-U1` | core |
| 13 | Keys and signatures | 15 | `G1-U5` | core |
| 14 | Accidental rules | 18 | `G1-U4` | core |
| 15 | Numbered scale degrees | 19 | `G1-U5` | core |
| 16 | Tonic triads | 21 | `G1-U6` | core |
| 17 | Interval numbers | 22 | `G1-U6` | core |
| 18 | Note grouping within bars | 24 | `G1-U2` | core |
| 19 | Performance terms/signs | 27 | `G1-U7` | core |

## Grade 2 — 14 source sections

| § | Topic paraphrase | Printed p. | App unit(s) | Treatment |
|---:|---|---:|---|---|
| 1 | Additional time signatures | 29 | `G2-U1` | core |
| 2 | Triplets | 30 | `G2-U1` | core |
| 3 | Grouping notes | 32 | `G2-U2` | core |
| 4 | Grouping rests | 33 | `G2-U2` | core |
| 5 | Further ledger lines | 38 | `G2-U2` | core |
| 6 | A major scale | 38 | `G2-U3` | core |
| 7 | B-flat and E-flat major | 39 | `G2-U3` | core |
| 8 | Key signatures | 41 | `G2-U3` | core |
| 9 | Harmonic and melodic forms of minor | 42 | `G2-U4/G3-U4` | split: harmonic G2; melodic G3 |
| 10 | A, E and D harmonic minor | 44 | `G2-U4` | core |
| 11 | A, E and D melodic minor | 45 | `G3-U4` | deferred: Grade 3 core |
| 12 | Relative major/minor | 47 | `G2-U4` | core |
| 13 | Intervals | 48 | `G2-U5` | core |
| 14 | Terms and signs | 49 | `G2-U5` | core |

## Grade 3 — 12 source sections

| § | Topic paraphrase | Printed p. | App unit(s) | Treatment |
|---:|---|---:|---|---|
| 1 | Simple versus compound time | 53 | `G3-U1` | core |
| 2 | Notes grouped in 6/8, 9/8 and 12/8 | 55 | `G3-U1` | core |
| 3 | Rests grouped in compound time | 57 | `G3-U1` | core |
| 4 | Demisemiquavers and rests | 61 | `G3-U2` | core |
| 5 | Upbeat starts | 62 | `G3-U2` | supporting; map official outcome |
| 6 | Ledger lines and octave signs | 65 | `G3-U3` | core |
| 7 | Octave transposition | 66 | `G3-U3` | core |
| 8 | E and A-flat major | 68 | `G3-U4` | core |
| 9 | B, F-sharp and C-sharp minor | 69 | `G3-U4` | core |
| 10 | G, C and F minor | 71 | `G3-U4` | core |
| 11 | Intervals | 73 | `G3-U5` | core |
| 12 | Performance directions | 76 | `G3-U5` | core |

## Grade 4 — 15 source sections

| § | Topic paraphrase | Printed p. | App unit(s) | Treatment |
|---:|---|---:|---|---|
| 1 | Breves | 79 | `G4-U1` | core |
| 2 | Double dots | 79 | `G4-U1` | core |
| 3 | Regular time signatures | 80 | `G4-U1` | core |
| 4 | Duplets | 82 | `G4-U1` | core |
| 5 | Double sharps/flats and enharmonics | 83 | `G4-U2` | core |
| 6 | B major and G-sharp minor | 84 | `G4-U3` | core |
| 7 | D-flat major and B-flat minor | 85 | `G4-U3` | core |
| 8 | Technical scale-degree names | 86 | `G4-U3` | core |
| 9 | Intervals | 88 | `G4-U4` | core |
| 10 | Tonic/subdominant/dominant triads | 92 | `G4-U4` | core |
| 11 | Tonic/subdominant/dominant chords | 95 | `G4-U4` | core |
| 12 | Chromatic scale | 97 | `G4-U3` | core |
| 13 | Ornament signs | 99 | `G4-U5` | core |
| 14 | Alto clef | 101 | `G4-U2` | core |
| 15 | General questions | 102 | `G4-U5` | core |

## Grade 5 — 15 source sections

| § | Topic paraphrase | Printed p. | App unit(s) | Treatment |
|---:|---|---:|---|---|
| 1 | Irregular time signatures | 105 | `G5-U1` | core |
| 2 | Irregular time divisions | 106 | `G5-U1` | core |
| 3 | Tenor clef and octave transposition | 107 | `G5-U2` | core |
| 4 | F-sharp major and D-sharp minor | 109 | `G5-U3` | core |
| 5 | G-flat major and E-flat minor | 111 | `G5-U3` | core |
| 6 | Diatonic and chromatic intervals | 112 | `G5-U3` | core |
| 7 | Compound intervals | 114 | `G5-U3` | core |
| 8 | Triad inversions | 115 | `G5-U4` | core |
| 9 | Identify chords | 117 | `G5-U4` | core |
| 10 | 6/4–5/3 harmonic progression | 120 | `G5-U4` | supporting; verify formal boundary |
| 11 | Cadence-point chords | 122 | `G5-U4` | core |
| 12 | B-flat, A and F instrument transposition | 126 | `G5-U2` | core |
| 13 | SATB short and open score | 129 | `G5-U5` | supporting; verify formal boundary |
| 14 | Ornaments | 132 | `G5-U5` | core |
| 15 | General questions | 138 | `G5-U5` | core |

## Required curriculum gap audit beyond this book

For each published official syllabus outcome, add a mapped `SyllabusOutcomeID`, lesson IDs, assessment templates, teacher verification and release status. Particular checks: official Grade 1/4/5 questions on original score excerpts; Grade 2 harmonic-only minor scope; Grade 3 melodic minor; Grade 4 orchestral instruments; Grade 5 instrument families/production, all four clefs, and cadence limitations. For every row of this crosswalk, record whether the topic is teaching context or an examinable requirement at this level.

**Do not treat printed-page reference as permission to copy:** do not import images, diagrams, staff examples or prose from the PDF into the published application.
