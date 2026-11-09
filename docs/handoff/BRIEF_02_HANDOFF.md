# Handoff to Brief 02 — Foundation, accounts and navigation

**From:** Brief 01 (curriculum audit, learning graph, content schema)
**To:** the Brief 02 implementer (app shell)
**State at handoff:** curriculum v0.1.0, `status: draft`, structural validation green, coverage *planned* (not teacher-verified).

## What you can rely on

| Need | Use | Notes |
|---|---|---|
| Types and loading | `import { loadCurriculum, buildIndex, type GradeWorld, type PathNode } from "@mtp/curriculum"` | Pure TS, no I/O beyond reading `content/`. For browsers, ship `npm run bundle` → `dist/curriculum.json` (format `music-theory-path/curriculum-bundle@1`). |
| World map | `worlds[].learnerTitle`, `units[].learnerTitle`, `nodes[]` in order | Learner-facing titles never contain book chapter numbers. Book pointers (`bookSectionIds`) are optional author/teacher metadata. |
| Lock state and reasons | bundle `nodes[].unlockAfter` (already resolved) | A node is unlocked when every id in `unlockAfter` is complete. Show the reason as "Finish ⟨title of each incomplete prerequisite⟩". Unit challenges and grade assessments never block the next lesson. Enrichment (`optional: true`) is skippable. |
| Node kinds | `type`: `lesson`, `practice`, `review`, `unit_challenge`, `grade_assessment`, `enrichment` | Render all six. `contentStatus: "planned"` nodes have no content yet, so show a clear "coming soon" state, never a blank screen or dead end. |
| Sample unit for the vertical slice | `G1-U3` (keyboard and stave), with `G1-U3-L03` fully authored | The Brief 05 vertical slice should complete `G1-U3`. Until then, `G1-U3-L03` is the only playable lesson. |
| Lesson player data | `LessonContent` (see [LESSON_FORMAT.md](../architecture/LESSON_FORMAT.md)) | Eight parts in order: objective → explanation → demonstration → guided → independent → feedback → completion → spaced review. |
| Progress persistence fields | `ExerciseItem.id`, `templateId`, `templateVersion`, `seed`, `evidence`; `PathNode.contentVersion` | Store these with every attempt so later content changes never rewrite history (Brief 04). |
| Policy defaults | `content/policy/progression.json` (provisional) | XP ≠ mastery. Grade completion needs the grade assessment. Never derive unlocks or results from client-supplied XP. |

## Constraints you must keep

1. **No hard-coded curriculum in components.** Read everything from the content or bundle.
2. **Don't fork the schema.** If the app needs new fields, add them to `packages/curriculum/src/schema.ts` with a migration note, and keep `npm run check` green.
3. **Spelling-aware music data.** Pitches are strings like `F#4`, parsed by `music.parsePitch`. Never store MIDI numbers as the source of truth.
4. **Accessibility from day one.** Each `NotationFragment` has a `textAlternative`, and each family declares keyboard, screen-reader, no-sound and no-colour paths.
5. **IP.** No book text or images. No ABRSM branding or implied endorsement. Practice assessments show the practice-only disclaimer.
6. **CI.** `.github/workflows/ci.yml` runs `npm ci && npm run check`. Add your app's lint, build and tests to the same workflow and keep the curriculum checks.

## Suggested Brief 02 package layout

```
packages/curriculum   (exists)  schema, content loader, validator, reference music rules
packages/web          (new)     TypeScript UI (stack chosen and documented in Brief 02)
packages/api          (new)     backend + relational storage, migrations, sessions
```

## Open items that affect you (from [OPEN_QUESTIONS.md](../curriculum/OPEN_QUESTIONS.md))

- None block the shell. Q2 (term lists) and Q1 (syllabus currency) block *release*, not navigation.
- Show "practice estimate" wording everywhere readiness appears (Q11); never "pass mark".

## Verification commands

```bash
npm ci
npm run check            # typecheck + validate + docs:check + tests
npm run validate         # structural curriculum validation (must pass)
npm run validate:release # release gate (expected to FAIL until teacher review)
npm run bundle           # writes dist/curriculum.json
```
