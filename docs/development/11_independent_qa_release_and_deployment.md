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
