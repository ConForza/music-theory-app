# Music Theory Path (working name)

A Duolingo-inspired, mobile-first course that teaches music theory from **Grade 1 to Grade 5**: five grade worlds of short, interactive lessons with spaced review, unit challenges and grade assessments.

> **Not affiliated with or endorsed by ABRSM.** The app teaches towards the published ABRSM Grades 1–5 theory syllabus. Its practice assessments are not official examinations.

## Status — Brief 07 (Grade 3 complete course)

All **36 Grade 3 nodes are playable** (19 lessons, 5 unit practice, 5 unit reviews, 5 unit challenges, the Grade 3 assessment and one optional upbeat lesson): compound time (6/8, 9/8, 12/8) and its grouping, demisemiquavers, ledger lines beyond two and octave signs, octave transposition, E and A♭ major, six more minor keys with both minor forms, intervals above the tonic by quality, new terms and reading melodies. See [docs/architecture/GRADE_3_COURSE.md](docs/architecture/GRADE_3_COURSE.md), the generated [completion audit](docs/curriculum/GRADE_3_COMPLETION_AUDIT.md) and [teacher review pack](docs/teacher/GRADE_3_TEACHER_REVIEW_PACK.md), and the [handoff](docs/handoff/BRIEF_07_COMPLETION.md). **Nothing is teacher-reviewed or approved.** Browser journey: `npm run build && npm run e2e:grade3 -w @mtp/web`; mastery audit: `npm run audit:mastery -w @mtp/api -- 3`.

## Status — Brief 06 (Grade 2 complete course)

All **41 Grade 2 nodes are playable** (24 lessons, 5 unit practice, 5 unit reviews, 5 unit challenges, the Grade 2 assessment and one optional melodic-minor preview) on the same runtime as Grade 1: new time signatures and triplets, neat rests and two ledger lines, A / B♭ / E♭ major, relative keys and A / E / D harmonic minor, intervals above the tonic, new terms and reading a short melody. Melodic minor is deferred to Grade 3 and appears only in the optional preview. See [docs/architecture/GRADE_2_COURSE.md](docs/architecture/GRADE_2_COURSE.md), the generated [completion audit](docs/curriculum/GRADE_2_COMPLETION_AUDIT.md) and [teacher review pack](docs/teacher/GRADE_2_TEACHER_REVIEW_PACK.md), and the [handoff](docs/handoff/BRIEF_06_COMPLETION.md). **Nothing is teacher-reviewed or approved.** Browser journey: `npm run build && npm run e2e:grade2 -w @mtp/web`.

## Status — Brief 04 (progression, XP, mastery and adaptive revision)

Brief 04 adds the reward and revision loop without a second curriculum or grader: a **server-authoritative XP ledger** (idempotent, capped against farming), an optional **daily goal and timezone-safe streak**, **concept-level mastery** built only from independent first-try evidence (kept separate from XP and from lesson completion), **adaptive spaced review** with targeted remediation (seeded, reproducible Brief 03 questions inside the taught scope), restrained **badges**, and the **Review** screen plus updated dashboard and progress screens. See [docs/architecture/PROGRESSION.md](docs/architecture/PROGRESSION.md) for the rules, thresholds (provisional, awaiting teacher acceptance) and decisions, and the [Brief 04 completion handoff](docs/handoff/BRIEF_04_COMPLETION.md).

## Brief 03 (music notation, audio and exercise engine)

Brief 03 adds a deterministic **music rule engine** and **graders for all 22 exercise families** (`packages/engine`), **seeded exercise generation**, a **notation renderer** (four clefs, beams, ties, tuplets, voices, multi-stave scores; Bravura font), an **interactive keyboard and audio**, answer controls for every family, and a **practice lab** with 13 original demonstration sets. Grading stays on the server. See [docs/architecture/EXERCISE_ENGINE.md](docs/architecture/EXERCISE_ENGINE.md), the browser evidence in [docs/evidence/brief-03](docs/evidence/brief-03/) and the [Brief 04 handoff](docs/handoff/BRIEF_04_HANDOFF.md).

### Application foundation (Brief 02)

The repository contains the **student app** (React + Vite), a **backend** (accounts, sessions, path state, lesson progress on SQLite) and the Brief 01 curriculum foundation. Two lessons are playable end to end (Grade 1, *Treble clef: notes on the lines*, and the Grade 5 cadence lesson); every other node shows as *Coming soon*. See [docs/architecture/APP_ARCHITECTURE.md](docs/architecture/APP_ARCHITECTURE.md), [docs/PRIVACY_PLAN.md](docs/PRIVACY_PLAN.md) and the original briefs in [docs/development](docs/development/).

### Curriculum foundation (Brief 01)

| Deliverable | Location |
|---|---|
| Grades 1–5 curriculum coverage matrix (80 official outcomes) | [docs/curriculum/COVERAGE_MATRIX.md](docs/curriculum/COVERAGE_MATRIX.md) *(generated)* |
| Textbook → syllabus crosswalk (all 75 sections, printed pages) | [docs/curriculum/CURRICULUM_CROSSWALK.md](docs/curriculum/CURRICULUM_CROSSWALK.md) *(generated)* |
| Gap audit (book vs official syllabus) | [docs/curriculum/SYLLABUS_GAPS.md](docs/curriculum/SYLLABUS_GAPS.md) |
| Learning path and prerequisite graph | [docs/curriculum/LEARNING_PATH.md](docs/curriculum/LEARNING_PATH.md) *(generated)* |
| Lesson and exercise content schemas | [packages/curriculum/src/schema.ts](packages/curriculum/src/schema.ts), [docs/architecture/LESSON_FORMAT.md](docs/architecture/LESSON_FORMAT.md) |
| Architecture | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) |
| Automated curriculum validation | `npm run validate`, tests in [packages/curriculum/test](packages/curriculum/test) |
| Example lessons | [content/lessons/G1-U3-L03.json](content/lessons/G1-U3-L03.json), [content/lessons/G5-U4-L06.json](content/lessons/G5-U4-L06.json), [content/exercises/items/g5-instrument-transpose-example.json](content/exercises/items/g5-instrument-transpose-example.json) |
| Unresolved curriculum questions | [docs/curriculum/OPEN_QUESTIONS.md](docs/curriculum/OPEN_QUESTIONS.md) |
| Brief 02 handoff | [docs/handoff/BRIEF_02_HANDOFF.md](docs/handoff/BRIEF_02_HANDOFF.md) |
| IP policy | [docs/IP_AND_PROVENANCE.md](docs/IP_AND_PROVENANCE.md) |

**Coverage is planned, not verified.** Every official outcome is mapped to lessons, practice, review and assessments in the plan, but no qualified teacher has reviewed it yet. The release gate (`npm run validate:release`) fails until one has.

## Commands

```bash
npm ci                    # Node ≥ 22.13
npm run dev               # API :8787 + web :5173 (open http://localhost:5173)
npm run build && npm start  # production-like, one server on :8787
npm run e2e               # real-browser journeys, Brief 02 + Brief 03 (after build; needs Playwright Chromium)
npm run check             # typecheck + lint + validate + docs:check + tests + build
npm run validate          # curriculum rules (coverage, prerequisites, grade scope, music verification, IP)
npm run validate:release  # release gate — fails until teacher sign-off
npm run docs:generate     # regenerate the generated docs after editing content
npm run bundle            # dist/curriculum.json (single-file snapshot)
```

## Layout

- `content/` — the curriculum as schema-validated JSON (source of truth). See [content/README.md](content/README.md).
- `packages/curriculum/` — `@mtp/curriculum`: schema, loader, validator, reference music rules, doc generator.
- `packages/engine/` — `@mtp/engine`: graders, response and input contracts, seeded generators.
- `packages/api/` — `@mtp/api`: accounts, sessions, course projection, path state, progress, migrations.
- `packages/web/` — `@mtp/web`: the student app and browser journeys.
- `docs/` — architecture, curriculum audit and handoffs.

The user-supplied reference book and any other copyrighted material must **never** be committed (`*.pdf` is ignored and rejected by the validator).
