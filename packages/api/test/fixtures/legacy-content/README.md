# Curriculum content

Schema-validated JSON that is the **source of truth** for the course. Schemas live in `packages/curriculum/src/schema.ts`.

| Path | Contents |
|---|---|
| `release.json` | Curriculum version, syllabus authority (URL, date, SHA-256), review status, changelog |
| `syllabus/abrsm-2020-outcomes.json` | 80 atomic official outcomes, each tied to a numbered item of the 2020 outline |
| `syllabus/grade-scope.json` | What each grade *adds* (keys, metres, values, clefs, ledger lines, interval and chord rules). Cumulative scope is computed. |
| `source-book/first-steps-sections.json` | Citation index of the 75 book sections. Pointers only, no book content. |
| `concepts/grade-N.json` | Concepts, their prerequisites and the music rule sets they rely on |
| `path/grade-N.json` | The grade world: units and ordered path nodes |
| `exercises/families.json` | Reusable exercise families (interaction, grader, mistake feedback, accessibility) |
| `exercises/templates/grade-N.json` | Grade-scoped exercise templates |
| `exercises/items/` | Standalone authored items (examples) |
| `assessments/grade-N.json` | Unit-challenge and grade-assessment blueprints |
| `engine/engine.json` | Rule-set and deterministic-grader registries (contracts for the Brief 03 engine) |
| `policy/progression.json` | Provisional XP, mastery, review and unlock policy (for Brief 04) |
| `lessons/` | Full `LessonContent` files linked from path nodes via `contentRef` |

## Editing rules

1. IDs are permanent. To retire something, remove it from use and record the change in `release.json`'s changelog. Never reuse an ID for a different meaning.
2. Bump `version` / `contentVersion` when learner-visible meaning changes.
3. After any edit, run `npm run docs:generate && npm run check`.
4. Learner-facing text must be original and must not mention the reference book, its author or the exam board.
