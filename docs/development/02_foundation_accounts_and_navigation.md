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
