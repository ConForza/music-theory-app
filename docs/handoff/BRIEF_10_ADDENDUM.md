# Brief 10 addendum — Grade 5 educational improvements

**Status:** content, validator and tests delivered in this repository (curriculum `0.3.0`). Delivery in the app (placement, practice exams, real-browser tests) is **not** possible yet, because this repository contains only Brief 01. See *Deferred* below.

## What changed

| # | Improvement | Decision | Where |
|---|---|---|---|
| 1 | Intervals under key signatures | **Implemented** as core practice of outcome `g5.08` (and `g5.04` for the identify form). | Lesson `G5-U3-L07`, concept `c.intervals.in-key-signature`, templates `t.g5.interval-key-identify` / `t.g5.interval-key-build`, 11 items in `content/exercises/items/g5-interval-key-*.json` |
| 2 | Simple ↔ compound rewriting | **Implemented as optional enrichment only.** The 2020 syllabus outline has no such outcome (see `OPEN_QUESTIONS` Q16). It is never assessed. | Enrichment node `G5-U1-E1`, concept `c.metre.rewrite-simple-compound`, template `t.g5.rewrite-metre`, 5 items `g5-rewrite-metre-*.json`, validator task `rewrite-metre` |
| 3 | Assessment balance | **Implemented** with a new optional per-section `mix` (min/max per template), validated by `ASSESSMENT_MIX`. All six Grade 5 assessments move to version 2. | `content/assessments/grade-5.json`, `schema.ts`, `validate.ts` |
| 4 | Wording | **Implemented** for ornaments, voices and family feedback; the voice-range part is deliberately limited (Q15). | `t.g5.ornament-replace` v2, `t.g5.voices` v2, `fam.choice` / `fam.interval` / `fam.ornament` feedback |

### 1. Intervals under key signatures

- Items show a stave with a key signature and either two notes (name the interval) or one note (write the note above/below).
- Seven identify items use treble, bass and alto clefs, sharp and flat keys up to six accidentals. Five of them make the bare-letter reading give a *different* answer (the "ignored key signature" trap); two depend on a written natural overriding the signature (G major `B–F♮ = d5`; F major `F–B♮ = A4`).
- Four build items: three need the learner to add a sign the signature does not give (G♭ in A♭ major, D♯ in D major, D♯ in E minor), and one needs none (B♭ in F major), so a sign is never always or never required.
- **Validator rule added:** an interval item with notation must show exactly the notes the answer is about (`INTERVAL_NOTES_MISMATCH`) and the same key (`INTERVAL_KEY_MISMATCH`). Written accidentals against the signature were already checked (`ACCIDENTAL_MISSING`).
- Two new mistake categories give targeted feedback: `ignored-key-signature`, `accidental-not-applied` (and `redundant-or-missing-accidental` for the build form).
- Scope: simple intervals within an octave, no double accidentals, at most two ledger lines. Compound and double-accidental intervals stay in the existing templates.

### 2. Rewriting between simple and compound time

- **Rule taught:** each note and rest keeps its share of its beat. A crotchet beat (2/4) becomes a dotted-crotchet beat (6/8), so every value gains a dot; going back, every dot is removed. The bar length changes (a 6/8 bar is longer than a 2/4 bar); the beat relationships do not.
- Pairs allowed: 2/4↔6/8, 3/4↔9/8, 4/4↔12/8. Beams must stay within a beat of the new metre (`REWRITE_GROUPING`).
- **Limit by design:** compound → simple only accepts fully dotted bars. A compound bar with three undotted quavers per beat would need triplets, which is a different exercise (deferred).
- **Book evidence (added after the reference book was supplied):** *First Steps* Grade 4 §4 (Duplets, printed pp. 82–83) teaches that a compound rhythm with duplets, or a simple rhythm with triplets, can be written in either metre at the same beat speed, and that dotting each value is the equivalent notation. This matches the rule used here (6/8 dotted-quaver pair = 2/4 quaver pair). It also shows the skill is a **Grade 4** topic (duplets, outcome `abrsm2020.g4.04`), which supports keeping it out of Grade 5 assessments. The book is authoring reference only; it is not exam-paper evidence.
- **Scope evidence and decision:** the syllabus outline in `content/syllabus` lists time signatures (`g4.01`), irregular time signatures (`g5.01`) and irregular divisions (`g5.02`) only. Current examination papers were not available in this repository, so compulsory status could not be confirmed. It therefore stays optional, mapped only to `g4.01`, and excluded from every assessment. A test enforces that.

### 3. Assessment balance

The repository has no exercise generator yet, so "multiple generated assessments" could not be sampled. The review was done on the blueprints (what each section can draw), which is exactly what the sampler will honour.

| Finding in the blueprint | Change |
|---|---|
| Intervals: 2 of 39 grade-assessment items (5%), no key-signature context | Section `o-g5-08` now has 4 dedicated items: simple/chromatic, compound, identify under a key signature, write under a key signature (1 each). `t.g5.score` removed from this section. |
| Key signatures: `t.g5.key-signature` could be drawn up to 4 times in the grade assessment (`o-g5-04`, `o-g5-07`) and 4 times in the Unit 3 challenge | Removed from grade-assessment `o-g5-04`; capped at 1 per section elsewhere (grade assessment: at most 1 in total; Unit 3 challenge: at most 2). |
| Voices: the voices outcome could be filled with two voice questions, or voice + context question | `o-g5-14`: exactly one `t.g5.voices` item and at most one context (`t.g5.score`) item. Instruments are treated the same way. |
| `t.g5.score` (context) appeared in 8 sections, so it could crowd out dedicated items | Maximum one per section; every section keeps at least one dedicated item; at most 6 context items outside the dedicated context section `o-g5-16`. |
| Harmony: 6 items; chord section could be identify-only | `o-g5-09` now has 3 items (identify ≥1, build ≥1, context ≤1): harmony total 7. |
| Practical work (transposition, scales, cadence chords) | Each of `o-g5-05/06/07/10` is guaranteed a *build* item; tests enforce it. |

The 16 Grade 5 outcomes are still each sampled by a template that targets them. Grade assessment length: 39 → 42 items (+3), a deliberate trade-off for interval and harmony depth. The mix rules are optional and backwards compatible.

### 4. Wording

- **Ornaments** (`t.g5.ornament-replace` v2): the prompt now says the written-out notes belong to one ornament on a *named* principal note and where the sign goes (above it, or a small note before it). Acciaccatura/appoggiatura are separated by duration, not by guesswork; non-standard figures are not generated.
- **Voices** (`t.g5.voices` v2): the hint no longer reveals the highest-to-lowest order. Prompts must give actual notes (never just "highest/lowest") and always include the neighbouring voice types, so the answer cannot be found by elimination from the extremes. **Range-in-pitch prompts are not generated until a teacher confirms a range table (Q15)**: published ranges vary, and this repository must not guess. The reference book (Grade 5 §15) confirms the six voice types and their order only (mezzo-soprano between soprano and alto, baritone between tenor and bass) and gives no ranges, which matches this approach.
- **Contextual explanations:** family feedback for choices, intervals and ornaments now says *why* and what to check next; every new item has a specific correct-answer explanation and per-mistake feedback.

## Identities and history

- No template, node, assessment, item or concept id was renamed or removed. New ids: three templates, two concepts, two nodes (`G5-U3-L07`, `G5-U1-E1`), sixteen items.
- Grades 1–4 are untouched (all their templates and assessments stay at version 1).
- Reworded templates (`t.g5.ornament-replace`, `t.g5.voices`) and all Grade 5 assessments are bumped to **version 2**; attempts already stored against version 1 remain attributable to the content the learner saw (the Brief 04 progress store must keep recording `templateVersion` and assessment `version`, as already required).
- The Brief 01 example lesson and item still validate unchanged.

## Verification performed

- `npm run check` (typecheck, curriculum validation, generated-docs check, 243 tests; the previous 197 are unchanged).
- `test/brief10-addendum.test.ts` re-derives every new musical example **independently** of the repository's music module (own semitone and letter arithmetic and key-signature table): sounding spelling from signature or written accidental, interval number and quality, letter reached, whether a sign is needed, the trap (the bare-letter answer differs), and, for rewrites, that each event keeps the same fraction of its bar and beams are preserved beat-for-beat.
- Negative tests prove each new rule fires: wrong notes vs answer, wrong key, missing natural, wrong quality, wrong spelling, unchanged values, beam across a beat, mismatched metres, un-rewritable source, unsatisfiable `mix`.

## Educational review (author self-review — not teacher sign-off)

| Item | Result |
|---|---|
| Interval spellings and qualities | Independently checked (above). |
| Does "interval under key signature" belong to `g5.08`? | Yes: the outcome is intervals "from any note"; applying the signature is part of reading any note on a stave. |
| Is the dotted-values rewrite pedagogically sound? | Yes for the stated rule. Real compound music rarely subdivides a beat into two dotted quavers; the exercise is about beat relationships, which the feedback says explicitly. |
| Risks for a teacher to confirm | Q15 (voice ranges), Q16 (rewrite status), and that the interval-in-key items are the right difficulty (set at 4/5). |

All new templates are `qa.status: draft`; the release gate (`npm run validate:release`) still fails until a qualified teacher signs off.

## Deferred (with reasons)

| Deferred | Reason |
|---|---|
| **Real-browser (Playwright) coverage** of the new exercises | This repository has no UI, renderer, engine or browser test harness (Briefs 02–09 are absent). Building one would be an unrelated feature. Handoff: when the player exists, add specs that (a) render each `g5-interval-key-*` item with its signature and written accidentals, (b) accept only the listed spelling in build items, (c) show `ignored-key-signature` feedback for the bare-letter answer, (d) cover keyboard-only and no-colour paths, and (e) the optional enrichment node. |
| **Sampling and reviewing generated assessments** (distribution of real generated papers) | No generator exists yet. The blueprint `mix` rules are the contract; once Brief 03 generates, add a test that samples ≥100 seeds and asserts the same bounds the blueprint tests assert today. |
| **Placement and practice examinations** (the rest of Brief 10) | Depend on the app, progress store and generator (Briefs 02–05); not present here. |
| **Preserving Grades 1–5 progress / previous results in a live store** | There is no progress store yet. Only the data-level guarantees above could be delivered (stable ids, version bumps). |
| **Voice-range prompts in pitch** | Needs a teacher-approved range table (Q15). |
| **Compound → simple rewriting with triplets** (three undotted quavers per beat) | Needs triplet-equivalence rules; larger than a P3 addendum and not syllabus-required. |
| **Promoting the rewrite exercise to core or adding it to an assessment** | Only if Q16 is answered "examinable". |
