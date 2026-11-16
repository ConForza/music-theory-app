# Coding-agent handoff instructions

## Start with Opus — Brief 01

Attach separately: (a) the uploaded `First Steps in Music Theory` PDF; (b) the entire ZIP of these briefs; (c) link to the current official ABRSM Grades 1–5 syllabus. If working in Claude, explicitly verify it can read all PDF pages and the table of contents before starting.

> Implement Brief 01 in `01_curriculum_and_learning_graph.md` only. Read every numbered chapter of Eric Taylor's *First Steps in Music Theory* and produce a complete reference crosswalk. Treat the currently published official ABRSM Music Theory Grade 1–5 syllabus as authoritative for examinable grade boundaries. Flag the Grade 2 melodic-minor mismatch; do not accidentally turn Grade 5 6/4–5/3 progression or SATB book sections into invented official separate requirements. Write an original, versioned curriculum/lesson schema, zero-gap official-outcome matrix and deterministic coverage validator. Include tests and a PR. Do not code the whole app, copy textbook content, merge or deploy.

## Subsequent Sonnet handoff

> Implement the next numbered brief from this pack only, using the merged curriculum architecture and official-outcome IDs. Keep the app original and Duolingo-inspired without cloning UI assets. All theory exercises must use deterministic musical answer validation, with original notation and explanations, Grade 1–5 scope, reliable progress, accessibility and focused tests. Open a PR with precise outcome coverage, screenshots, verification and limitations. Do not merge or deploy.

## Sol review handoff

> Independently review the exact PR head against its numbered brief, source-book chapter mapping and current official ABRSM outcomes. Focus on musically incorrect answers, missing instruction, unintroduced prerequisites, ambiguous/generated exercises, inaccurate accidentals/transposition/grouping, progression exploits, accessibility and content IP risks. Report actionable defects with reproducible evidence and severity. Do not expand scope or reopen settled decisions without new evidence. Re-review fixes and give a clear merge gate recommendation.

## Terra browser/UX handoff

> Test actual end-to-end student interactions, not screenshots alone: phone 320px, typical iPhone, iPad, desktop, landscape, touch and keyboard; long musical examples; reduced motion, sound off, zoom, interruptions, resume and corrective feedback. Identify confusing or tedious learning journeys and propose bounded improvements that preserve music correctness and assessment integrity.

## Human music teacher acceptance

An AI review cannot replace expert validation of representative musical exercises, correct terminology and full grade coverage. Record the signoff, sample seeds and any exceptions per milestone.
