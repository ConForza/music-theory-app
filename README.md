# Music Theory Path (working name)

A Duolingo-inspired, mobile-first course that teaches music theory from **Grade 1 to Grade 5**: five grade worlds of short, interactive lessons with spaced review, unit challenges and grade assessments.

> **Not affiliated with or endorsed by ABRSM.** The app teaches towards the published ABRSM Grades 1–5 theory syllabus. Its practice assessments are not official examinations.

## Status — Brief 01 (curriculum architecture)

This repository currently contains the **curriculum foundation** only. There is no app UI yet (that starts with Brief 02).

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
npm ci                    # Node ≥ 20
npm run check             # typecheck + validate + docs:check + tests
npm run validate          # curriculum rules (coverage, prerequisites, grade scope, music verification, IP)
npm run validate:release  # release gate — fails until teacher sign-off
npm run docs:generate     # regenerate the generated docs after editing content
npm run bundle            # dist/curriculum.json (single-file snapshot)
```

## Layout

- `content/` — the curriculum as schema-validated JSON (source of truth). See [content/README.md](content/README.md).
- `packages/curriculum/` — `@mtp/curriculum`: schema, loader, validator, reference music rules, doc generator.
- `docs/` — architecture, curriculum audit and handoffs.

The user-supplied reference book and any other copyrighted material must **never** be committed (`*.pdf` is ignored and rejected by the validator).
