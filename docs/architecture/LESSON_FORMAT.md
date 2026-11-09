# Reusable lesson and exercise format

Every lesson in every grade uses the same eight-part format, which `LessonContent` in `packages/curriculum/src/schema.ts` encodes. The worked examples are [`content/lessons/G1-U3-L03.json`](../../content/lessons/G1-U3-L03.json) (Grade 1, treble-clef line notes) and [`content/lessons/G5-U4-L06.json`](../../content/lessons/G5-U4-L06.json) (Grade 5, chords at cadence points). [`content/exercises/items/g5-instrument-transpose-example.json`](../../content/exercises/items/g5-instrument-transpose-example.json) adds a Grade 5 transposition item.

| # | Part | Schema field | Rules |
|---|---|---|---|
| 1 | **Learning objective** | `objective.statement`, `successCriteria[]` | One objective per lesson, phrased as something the learner can *do*. The path node holds the same objective. |
| 2 | **Short explanation** | `explanation[]` (1–6 blocks: text, tip, notation) | Plain British English, original wording, one idea per block. Notation blocks carry a text alternative. |
| 3 | **Interactive demonstration** | `demonstration` (widget, music, steps, optional audio, text alternative) | Show it on the stave and/or keyboard. Sound is optional reinforcement unless hearing is the objective, and every step has a text equivalent. |
| 4 | **Guided practice** | `guided[]` (`evidence: "learning"`) | Scaffolded prompts with hints. **Never counts as mastery evidence** (validated). |
| 5 | **Independent questions** | `independent[]` (≥ 2, `evidence: "independent"`) | Varied items from the lesson's templates, fixed or seeded. Only first-attempt, hint-free answers count as evidence. |
| 6 | **Immediate, helpful feedback** | `feedback.correct`, `feedback.mistakes{category: text}`, `feedback.fallback` | Mistake keys must be categories defined by the exercise family (validated). Feedback explains *why*, not just right/wrong. |
| 7 | **Completion and mastery tracking** | `mastery` (concepts, `countsAsEvidence: independent-steps-only`, completion rule) | *Lesson complete* (every step attempted, retries allowed) is distinct from *mastery* (independent evidence across templates and time; see `policy/progression.json`). |
| 8 | **Scheduled revision** | `spacedReview[]` (template, afterDays, increasing) | Seeds the per-concept review queue. Later review nodes interleave earlier grades. |

`provenance` (author, `originality: "original"`, book section pointers, outcomes, notes) is metadata for authors and teachers and is never shown to learners.

## Exercise item contract (`ExerciseItem`)

```jsonc
{
  "id": "i.<lesson-or-template>.<n>",        // stable
  "templateId": "t.g5.cadence-chords", "templateVersion": 1,
  "seed": null,                              // null = fixed authored item; integer = reproducible generator seed
  "evidence": "learning" | "independent",
  "prompt": "…original wording…",
  "music": { NotationFragment },             // clef, key, time signature, measures (events or voices), textAlternative
  "score": { NotationScore },                // optional multi-stave music (SATB, passages)
  "answer": { AnswerSpec },                  // one typed variant per family answer kind (see ARCHITECTURE.md §5)
  "hints": ["…"],
  "feedback": { "correct": "…", "mistakes": { "<category>": "…" }, "fallback": "…" }
}
```

- **Written pitch** is always spelt (`C#5` ≠ `Db5`). `octaveSensitive` and `spellingSensitive` are explicit.
- **Every accepted alternative is checked.** Adding a wrong alternative to `accepted` fails validation; genuinely equivalent alternatives (e.g. any octave in an octave-insensitive reading task, both spellings in a "same sound" keyboard task) pass.
- **Items stay inside what has been taught.** Lesson items must use a template bound on the node, and their notation and answers must fit `effectiveScope(node, binding)`. A bass-clef note in the treble-clef lesson, or a double sharp in Grade 1, fails validation.
- **Multiple valid answers.** `chord-progression` lists every accepted chord per point, and the validator re-derives that set from the melody notes and the cadence rules. Missing alternatives therefore fail the build, as do invalid chords. Grouping and bar-completion templates declare that every convention-compliant answer is accepted.
- **Derived answers.** For transposition, the validator recomputes the transposed key and every note from the source melody and the stated interval. For note reading, it compares with the note actually shown. Every fragment is also checked for bar totals, written-accidental consistency (key signature + bar state) and grade scope (clefs, keys, values, ledger lines).
- **Accessibility.** Every family declares a screen-reader equivalent, a no-sound path and a no-colour path, and every interaction is keyboard-operable. Accessible alternatives earn equal mastery weight.

## Exercise template contract (`ExerciseTemplate`)

A template is a grade-specific specialisation of a family: original prompt pattern, `scope` (validated against cumulative grade scope), `acceptance` policy, `ambiguityChecks` the generator must enforce before showing an item, graduated `hints`, `difficulty` and QA status. Templates are versioned, and attempts must store the template version.

## Authoring checklist (Briefs 05–09)

1. Pick the path node. Its objective, concepts, outcomes and templates are already defined, so change them only with a recorded reason.
2. Write original explanations and examples. Use the book only to check the topic and its order. Never paraphrase its prose or copy its examples.
3. Use only templates bound on the node (`exercises[]`), stay within each binding's scope, and use only mistake categories from their families.
4. Keep the node's `contentVersion` and the LessonContent `contentVersion` equal.
5. Run `npm run check`. Musical answers are re-derived automatically for every answer kind.
6. Set `contentStatus: "draft"`, then request teacher review. Only reviewed content becomes `approved`.
