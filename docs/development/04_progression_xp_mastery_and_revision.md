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
