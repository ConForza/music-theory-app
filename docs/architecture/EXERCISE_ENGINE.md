# Music notation, audio and exercise engine (Brief 03)

Brief 03 turns the curriculum's grader and rule-set contracts (`content/engine/engine.json`) into working software. It covers deterministic music rules, graders for all 22 exercise families, seeded exercise generation, a notation renderer, an interactive keyboard and audio, answer controls for every family, and a practice lab. Briefs 01 and 02 still own the curriculum model, accounts, persistence and lesson player. This brief extends them and does not replace them.

```
packages/curriculum/src/music   pure music rules (one model, shared by the validator, the engine and the renderer)
packages/engine                 @mtp/engine: responses, input descriptors, graders, generators, solutions
packages/api                    grades lesson and practice attempts with the engine (server is the only authority)
packages/web                    notation renderer, keyboard, audio, answer controls, practice pages
content/exercises/showcase      13 original demonstration sets (59 items, all 22 families)
```

## 1. Music rules (`@mtp/curriculum/music`)

Every rule is a pure function. Written pitch is always `{step, alter, octave}` (`F#4` ≠ `Gb4`). A pitch becomes a semitone number only when sound is what is being compared. Durations are exact fractions of a semibreve.

| Rule set (engine.json) | Module | What it does |
|---|---|---|
| pitch, enharmonic, keyboard | `pitch.ts` | parsing and formatting, diatonic vs chromatic numbers, spelling vs sounding equality |
| clefs | `clefs.ts` | staff position and ledger lines in treble, bass, alto and tenor |
| intervals, octave transposition | `interval.ts` | number and quality from spelling, simple and compound intervals, spelling-preserving transposition |
| keys, scales, degrees | `keys.ts` | key signatures (order and per-clef placement), relative keys, major/harmonic/melodic scales, degrees and technical names |
| triads, function, cadences | `chords.ts` | triads (harmonic minor for chord work), identification from any voicing (bass decides the inversion), chords containing a melody note, cadence classification |
| durations, metre | `duration.ts`, `rhythm.ts` | rational values, dots, tuplets, simple/compound/irregular metre, beat structure |
| grouping (simple, compound, irregular) | `rhythm.ts` | bar totals; beaming (half-bar rule in quadruple time, whole bar of half-beat notes in duple/triple, dotted beats in compound time, every standard sub-group pattern in 5 and 7); rest grouping (half-bar rests on beats 1 and 3; crotchet + quaver rest accepted for a dotted-crotchet beat); notes hiding the beat; ties that could be one value; tuplet totals; bar-line positions; convention-compliant auto-beaming |
| accidental bar state | `accidentals.ts` | reads the printed letter, octave and sign under the key signature and the earlier accidentals in the bar, through ties (a continuation takes the pitch of the actual tied note in the event just before it, in its own voice, within or across bars); also works out which sign must be printed; can re-read the music with one rule broken to diagnose mistakes |
| chromatic scale | `chromatic.ts` | semitone steps, each letter used once or twice, no double accidentals |
| transposing instruments | `transposing.ts` | B♭ (M2), A (m3) and F (P5): written ↔ concert pitch and keys |
| ornaments | `ornaments.ts` | the six Grade 5 ornaments; classifies a written-out figure, including near misses such as an inverted turn |
| terms, instruments, voices | `vocabulary.ts` | **provisional** controlled vocabularies (OPEN_QUESTIONS Q2) with grade tags, opposites and similar terms (used to build distractors and diagnose mistakes) |

The rules are tested with `packages/curriculum/test/rules.test.ts`:

* Golden cases come from `test/golden/music-golden.json`, which are hand-typed reference tables: middle C in four clefs, ledger lines, all 30 key signatures, relative keys, scales, 32 intervals (including augmented/diminished and compound), transpositions, B♭/A/F instruments and keys, triads, chord identification and inversions, cadences, dotted and double-dotted values, triplets, duplets and quintuplets, metres, enharmonics and ornaments.
* Rhythm cases cover the 5/8 and 7/8 alternatives, compound rests and ties across the half-bar.
* Accidental cases cover cancellation, octaves, ties over the bar-line and double accidentals.
* fast-check properties check: transposition round trips, inversion arithmetic, scale step patterns for every key, signature-vs-scale consistency, auto-beamed bars that never break the beaming rules, bar-line splits that always fill bars, and printed-sign resolution that reproduces the written pitches.

## 2. Graders (`@mtp/engine`)

`gradeItem(ix, item, response, scope)` validates the response, finds the family's grader and returns `{correct, category, reason, message, marks?, parts?, graderId}`. The scope is the lesson binding's *effective scope* (what has been taught), so minor-form, compound and accidental policies follow the grade boundaries from Brief 01. Every grader in `engine.json` has an implementation, and a test enforces this.

**Answers are derived, not trusted.**

* The note to read is read from the printed stave, with bar state applied.
* Intervals come from the two spellings. Chords come from their pitches. Scales come from `deriveScale`.
* Transpositions come from the source melody. Cadence choices come from melody containment and cadence rules.
* Bar-lines come from cumulative durations. Ornaments come from the figure.

The curriculum validator checks authored `accepted` lists against the same rules at build time.

**Multiple valid answers** are accepted by rule, not from a list:

* any bar completion or grouping that fills the bar and keeps the beats clear;
* both forms of a silent compound beat;
* 3+2 or 2+3 grouping in 5/8;
* any chromatic spelling that uses each letter once or twice;
* any voicing or doubling of a chord;
* every chord pair that contains the melody notes and makes the cadence;
* both compound interval names (10th and compound 3rd);
* every scale note allowed by melodic minor in a numbered build;
* any octave in octave-insensitive reading;
* both names of a black key when sound, not spelling, is assessed.

**Spelling is enforced** where it matters: G♭ for an augmented 4th above C is `enharmonic-spelling`, and A♯ in F major is `letter-skipped-or-repeated`.

**Diagnosis** uses the family's mistake categories. Each category is emitted only when the submitted answer proves it (the Brief 02 review R6 contract), for example:

* clef confusion, counting from the top, ledger miscounts;
* an accidental carried over the bar-line (found by re-reading with that rule broken);
* wrong minor form, or the melodic minor descent not restored;
* quality from the wrong key, augmented/diminished swaps, compound arithmetic;
* the leading note not raised, root confused with bass;
* a chord that lacks the melody note, a non-cadential pair;
* the wrong transposition direction or interval, the key signature missing;
* a half-bar rest misplaced, a compound beat hidden, a tie instead of a dot.

`message` is the authored feedback for that category (else the family's, else the item's fallback). `reason` explains the learner's own answer without giving the answer away. `solutionFor` gives the worked answer, which the server reveals only after three wrong attempts.

**Response contract.** The server grades only the response kind the item's own input offers (`RESPONSE_FOR_INPUT` in `grade.ts`, including each composite part). A bare letter is accepted only where the input is `pitch-letter` (letter-only Grade 1 reading, which keeps stored Brief 02 answers valid). The octave is required exactly when the task is octave-sensitive. Rhythm answers must have the requested shape before any total counts: one value for "write one note", the stated number of bars, and every tie leading to a following note (`danglingTies`).

**Safety.** Responses are a strict Zod union (`responses.ts`) with bounded sizes, spelt pitches and known enums. There is no correctness field anywhere. A malformed or mismatched answer raises `EngineError`; the API turns that into a 400 and records nothing. A fast-check property feeds arbitrary well-formed responses to every authored item and requires a deterministic grade or an `EngineError`, never a crash. It found and fixed one crash, an octave-less note in an interval build.

## 3. Input descriptors

`inputFor(ix, item, scope)` returns what the browser needs to collect an answer, and never the answer. Tests assert that no `accepted`/`correct*` keys appear. The kinds are:

* `choice`, `multi-choice`, `pitch-letter` (kept so Brief 02 attempts stay valid), `note-name`
* `staff-position` (with optional shown notes), `keyboard`
* `pitch-sequence` (scale / transposition / chromatic, with key choice when the key signature is part of the answer), `chord-builder`
* `rhythm-builder` (complete-bar / equivalent-value / rewrite / add-tuplet), `rhythm-grouping`, `barlines`
* `time-signature`, `key-name` (with the signature to read), `key-signature-writer`
* `interval-name`, `chord-name`, `ornament`, `progression`, `composite`

Controls are limited to what the scope allows: the values and dots in scope, accidentals only once taught, double accidentals only at Grade 4+, and the ledger-line limit.

## 4. Generation

`generateItem(ix, templateId, seed, {scope, version})` is pure: the same template version and seed always give the same question and answer. Generators exist for 86 of the 90 templates and all 22 families. They sample only from the given scope (a binding's effective scope in lessons) and write original prompts. Each draft must pass three gates before it is returned, or the generator retries from the same seeded stream:

1. the curriculum music verifier (`checkItem`): scope, bar totals, accidental spelling and every accepted answer re-derived;
2. ambiguity checks, for example a time-signature question whose grouping would also fit another metre is rejected;
3. solvability: the engine must grade the canonical answer correct and a known wrong answer incorrect.

Each generated item carries `templateId`, `templateVersion`, `seed`, grade, outcome and concept ids, the template's hints, the family's feedback and accessibility equivalent, and its review status (`generated: true, humanReviewed: false`).

Item ids encode template, version, seed and a **generation fingerprint** (`i.gen.g2-scale-build-minor.v1.s12345.f1a2b3c4d`). The fingerprint hashes `GENERATOR_REVISION` (bump it when generator code changes what a seed produces), the template, the effective scope and the shared vocabularies. The server regenerates the item to grade it, and refuses the id as stale (409) if the version or any of these inputs has changed, rather than grading against a different question. Generation uses two deterministic streams (40 + 400 candidates). An independent 200-seed sweep over all 86 generator templates (17,200 items) produced no failures. An infeasible scope surfaces as `generation_failed` (HTTP 503, "try another"), never as a missing exercise.

The four templates without a generator are `t.g4.same-pitch`, `t.g4.passage`, `t.g5.four-clef-read` (compare tasks) and `t.g5.score`, which has an authored demonstration item instead.

## 5. Notation renderer (`packages/web/src/components/notation`)

`layout.ts` is a pure layout engine from `NotationFragment` / `NotationScore` to positioned primitives in staff spaces, and `Notation.tsx` draws them as SVG. It supports:

* all four clefs (plus the percussion clef for rhythm lines), key and time signatures;
* ledger lines, and accidentals printed by the bar-state rules (explicit signs are always shown);
* noteheads, chords (seconds offset), stems, flags, beams with secondary and partial beams, dots;
* ties, slurs, tuplets (number, and a bracket when unbeamed), multiple voices (stem direction by voice);
* rests, including whole-bar rests;
* articulations, fermatas, ornament signs, grace notes, dynamics and labels;
* single, double, final and repeat bar-lines;
* aligned multi-stave scores with a brace or bracket;
* timed playback events taken from the same layout.

**Accessibility.**

* Every figure has the fragment's text alternative. In questions, playable notes are labelled by stave position and printed signs ("Play semibreve on the 4th line"), never by pitch name, so the label cannot give away a reading answer.
* Notes are focusable buttons when they can be heard (the SVG then uses `role="group"`, not `role="img"`, so axe finds no nested-interactive violation).
* Highlight and correct/incorrect marks use ✓/✗ symbols as well as colour.
* Wide music shrinks to fit, down to 70% of its natural size, then scrolls inside its own box, never the page. This is verified at 320px and at 200% text.

**Separation.** The renderer draws only. It uses the shared music rules to decide which accidentals to print, but nothing in `packages/web` decides correctness. Replacing the renderer cannot change a grade.

### Library review (decision record)

| Option | Licence | Clefs/symbols | Why not adopted |
|---|---|---|---|
| VexFlow 5 | MIT | full | It would own layout and SVG structure, so making per-note accessibility, touch editing and responsive scaling fit around it is harder than the ~700 lines of layout here. It would also add about 1 MB. |
| Verovio | LGPL-3.0 | full (MEI) | WASM size, LGPL obligations for a bundled web app, and its output is not interactive. |
| OpenSheetMusicDisplay | BSD | full (MusicXML) | Built on VexFlow. MusicXML round trips are unnecessary because content is already JSON. |
| abcjs | MIT | good | ABC notation is a second content model; alto and tenor support and per-note accessibility are limited. |

**Adopted:** an in-house layout engine with the **Bravura** SMuFL font (Steinberg, SIL Open Font License 1.1), bundled from `@vexflow-fonts/bravura@1.0.2` and recorded in the asset register (IP_AND_PROVENANCE §6). The engraving metrics (glyph boxes, stem anchors, beam thickness) come from Bravura's `metadata.json`.

## 6. Keyboard and audio

**`Keyboard.tsx`:**

* buttons with roving focus: arrow keys, Home and End move; Enter or Space presses;
* `aria-pressed` selection and highlighting;
* ✓/✗ marks;
* names such as "G, octave 4", "C, middle C", "F sharp or G flat, octave 4";
* a spelling chooser for black keys when the task assesses spelling.

**`lib/audio.ts`:**

* a WebAudio synth in which every note has a scheduled stop;
* every scheduled note stays cancellable until it ends; polyphony is capped at 12 notes sounding at once, releasing the oldest of those first;
* `stopAll` runs on navigation, a new phrase and `visibilitychange`, so notes can't stick;
* timed playback from the notation (tempo, exact durations, ties merged per voice across bar-lines with no new attack), highlighting each event as it sounds;
* frequency comes from the spelt pitch the stave shows, and transposing parts pass their offset.

Sound is optional everywhere: no task depends on hearing, each figure has a text equivalent, and the Settings sound switch silences everything.

## 7. Answer controls (`packages/web/src/components/exercise`)

* **`StaveEditor`** writes one note, a sequence, a chord or a key signature in any clef. You can tap a line or space; use ↑/↓ with Enter (for a single note the arrows move the note itself, as in Brief 02); use the large buttons; or *type the notes instead*. A note written with no sign is read like real notation, under the key signature and earlier accidentals in the bar, so the pitch submitted is exactly what is written. Note names are not announced in note-writing tasks, where the name is the answer.
* **`RhythmBuilder`** has a palette of values and rests, dots, ties, triplets, duplets and irregular groups. It beams by the beat automatically and shows an exact remaining-time meter ("Still needed: a dotted crotchet").
* **`GroupingEditor`** joins or separates neighbouring beamable notes. **`BarlineEditor`** places bar-lines in the gaps, plus the final double bar-line.
* **Selection controls** cover note names (letter + accidental + octave), time signatures, keys (with the signature drawn), interval names, chord names and positions, ornaments (with the signs drawn), cadence chords per marked note, and multi-part questions.

All of these use native radios, checkboxes and buttons, with 44px+ targets and selection shown by outline and symbol. Partial selections are kept until complete. Retrying keeps the learner's work.

## 8. Server integration

* **Lessons:** `POST /api/lessons/:id/attempts` accepts every engine response shape and grades within the node binding's effective scope. Brief 02 behaviour is unchanged: client attempt ids are idempotent, an id reused for a different answer gives 409, completion is decided by the server, versions are stored, and hints come from the server. Replays recompute the explanation deterministically while the stored verdict stays authoritative. The Grade 5 cadence lesson (`G5-U4-L06`) is now playable.
* **Practice lab:** these routes need a session and never affect lesson progress.
  * `GET /api/practice`
  * `GET /api/practice/sets/:id`
  * `POST /api/practice/generate {templateId, seed?}`
  * `POST /api/practice/attempts`
  * `POST /api/practice/hint`

  Attempts are stored in `practice_attempts` (migration 002), with the same idempotency contract and per-user keys, and are included in the data export and account deletion.

## 9. Tests

| Suite | Count | What |
|---|---|---|
| `curriculum` | 417 | Brief 01 validator tests plus rule golden tables, rhythm/accidental/chromatic cases and properties |
| `engine` | 225 | registry coverage; every authored item (fixtures, lessons, standalone, showcase) graded correct/incorrect with no answer leaks; 25 seeds per generator template (deterministic, valid, solvable); golden grading cases; malformed-answer safety; determinism property |
| `api` | 62 | Brief 02 suites plus engine integration, practice lab, idempotency, cross-account isolation, tampered/stale ids, reveal policy, lesson-progress isolation |
| `web` (Vitest + axe) | 92 | Brief 02 journeys and follow-up regressions plus input regressions, stave bar-state reading, mark alignment, layout, and `integration.test.tsx` (practice calls bound to the learner who began them) |
| `e2e/run.mjs` | Brief 02 journeys | unchanged, passing |
| `e2e/followup.mjs` | Brief 02 follow-up journeys | account switching, onboarding recovery, piano accessibility, hint/feedback announcements; passing |
| `e2e/brief03.mjs` | 59 + 59 + 33 + 26 questions | every demonstration item answered through the real controls on desktop (axe on each) and 320px; subsets on iPhone and iPad; the submitted request compared with the engine's answer; wrong-answer explanation and retry; keyboard-only; 200% text at 320px; dark mode (axe); reduced motion; the Grade 5 lesson end to end |

### Integration with Brief 02 follow-up (PR #5)

* The practice API calls (`practice`, `practiceSet`, `generate`, `practiceAttempt`, `practiceHint`) are bound to the signed-in learner's identity scope exactly like the lesson calls. A delayed practice answer from learner A is cancelled, never retried, when B signs in (tests: `integration.test.tsx`, both before-commit and after-commit reply loss, checked against the persisted export).
* `Keyboard` combines the Brief 03 interactive keyboard with the shared scroll cue and pitch-and-octave accessible names; `Question` uses the persistent hint and verdict live regions, level-keyed hints and the one-hint-at-a-time guard for lessons and practice alike.
* `npm run e2e` runs `run.mjs`, `followup.mjs` and `brief03.mjs`. The navigation now has five tabs (Practice added), so the tab bar uses five columns.

## 10. Limitations and outstanding review

* **No human musical review has happened.** The golden tables (`music-golden.json`), the grouping conventions in `rhythm.ts`, the vocabulary lists and every demonstration item are marked pending. A qualified teacher must check them in particular:
  * the 3/4 minim-rest convention (currently rejected: "each beat needs its own rest");
  * the lenient treatment of syncopation in simple time;
  * tenor-clef key-signature placement;
  * voice ranges;
  * term definitions.
* The renderer does not yet draw hairpins, 8va lines, repeat endings, lyrics or cross-stave beams, or join systemic bar-lines across staves. None is needed by Grades 1–5 items so far. Audio is a synthesised tone, not sampled instruments.
* Audio-dependent ("listen and identify") tasks are not authored. The `listen-identify` mode is supported by the contract, but no template uses it yet.
* Composite score questions in `t.g4.passage` and `t.g5.score` are authored, not generated.

These later briefs build on this: Brief 04 (XP, streaks, mastery from the attempt log), Brief 05–09 (lesson content using these inputs and generators), Brief 10 (assessments drawing seeded items from the practice API).
