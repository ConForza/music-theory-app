/**
 * Authoring aid for content/exercises/showcase/*.json (run: npx tsx scripts/author-showcase.ts).
 *
 * Each demonstration item is drawn from a seeded generator (so its music and answer come from the rules),
 * chosen by a predicate that pins the teaching point (e.g. "a bass-clef note on a ledger line"), then frozen
 * as a fixed authored item (seed: null) with its own id and correct-answer feedback. The output files are the
 * source of truth afterwards; re-running only regenerates them when this script changes. All material is
 * original; nothing is taken from the reference book.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { generateItem } from "../src/index.ts";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../../content/exercises/showcase");
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);

type Pick = { t: string; when?: (i: ExerciseItem) => boolean; correct: string; prompt?: string };
type Set = { id: string; order: number; title: string; summary: string; picks: Pick[]; extra?: ExerciseItem[]; practice: Array<{ templateId: string; label: string }> };

const clef = (c: string) => (i: ExerciseItem) => i.music?.clef === c || (i.answer as { clef?: string }).clef === c;
const json = (i: ExerciseItem) => JSON.stringify(i);
const and = (...fs: Array<(i: ExerciseItem) => boolean>) => (i: ExerciseItem) => fs.every((f) => f(i));
const has = (s: string) => (i: ExerciseItem) => json(i).includes(s);
const promptHas = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);
const alt = (s: string) => (i: ExerciseItem) => (i.music?.textAlternative ?? "").includes(s);

function pick(setId: string, n: number, p: Pick): ExerciseItem {
  for (let seed = 1; seed < 5000; seed++) {
    let g;
    try {
      g = generateItem(ix, p.t, seed, { evidence: "learning" });
    } catch {
      continue;
    }
    if (p.when && !p.when(g.item)) continue;
    const { feedback } = g.item;
    return { ...g.item, id: `i.showcase.${setId}.${n}`, seed: null, prompt: p.prompt ?? g.item.prompt, feedback: { ...feedback, correct: p.correct } };
  }
  throw new Error(`No seed satisfies ${setId} #${n} (${p.t})`);
}

const sets: Set[] = [
  {
    id: "notes-on-the-stave", order: 1, title: "Notes on the stave", summary: "Read and write notes in all four clefs, including ledger lines.",
    picks: [
      { t: "t.g1.note-read", when: and(clef("treble"), (i) => !alt("ledger")(i)), correct: "Yes! You read the treble-clef note from its line or space." },
      { t: "t.g2.ledger-read", when: and(clef("bass"), alt("ledger line")), correct: "Correct. Counting the ledger lines one at a time pays off." },
      { t: "t.g1.note-write", when: clef("bass"), correct: "Well placed. The bass clef's bottom line is G." },
      { t: "t.g4.alto-read", when: clef("alto"), correct: "That's it: in the alto clef, middle C sits on the middle line, and you counted from there." },
      { t: "t.g5.tenor-read", when: clef("tenor"), correct: "Correct. In the tenor clef, middle C is on the fourth line." },
    ],
    practice: [{ templateId: "t.g1.note-read", label: "More note reading" }, { templateId: "t.g1.note-write", label: "More note writing" }],
  },
  {
    id: "keyboard", order: 2, title: "The keyboard", summary: "Find white and black keys, and hear tones and semitones.",
    picks: [
      { t: "t.g1.keyboard", when: has('"relation":"same"'), correct: "Spot on. The black-key groups are your map." },
      { t: "t.g1.keyboard", when: has("same-sound"), correct: "Yes. A black key has two names; both are the same key here." },
      { t: "t.g1.tone-semitone", correct: "Right. Count the keys in between, black and white." },
    ],
    practice: [{ templateId: "t.g1.keyboard", label: "Find more keys" }],
  },
  {
    id: "note-values", order: 3, title: "Note and rest values", summary: "How long notes and rests last, with dots and ties.",
    picks: [
      { t: "t.g1.note-value", correct: "Correct: you counted the crotchet beats exactly." },
      { t: "t.g1.rest", correct: "Yes. Each rest matches the note of the same name." },
      { t: "t.g1.tie-dot", correct: "Exactly. A dot adds half the note's own value, which matches the tie." },
      { t: "t.g4.breve-double-dot", when: has('"dots":2'), correct: "Right. The second dot adds half of what the first dot added." },
    ],
    practice: [{ templateId: "t.g1.tie-dot", label: "More ties and dots" }],
  },
  {
    id: "building-bars", order: 4, title: "Building bars", summary: "Fill bars exactly in simple and compound time, with triplets and duplets.",
    picks: [
      { t: "t.g1.bar-complete", when: has('"3/4"'), correct: "Perfect bar. Any notes that add up and keep the beats clear are correct." },
      { t: "t.g3.bar-complete", when: has('"6/8"'), correct: "Great. In 6/8 you kept each dotted-crotchet beat clear." },
      { t: "t.g2.triplet", when: has('"2/4"'), correct: "Yes! Three quavers in the time of two fill a crotchet beat." },
      { t: "t.g4.duplet", when: has('"6/8"'), correct: "Correct. Two quavers in the time of three fill a dotted-crotchet beat." },
    ],
    practice: [{ templateId: "t.g1.bar-complete", label: "Fill more bars" }],
  },
  {
    id: "time-and-grouping", order: 5, title: "Time signatures and grouping", summary: "Name time signatures, add bar-lines and group notes and rests so the beats show.",
    picks: [
      { t: "t.g1.time-signature", correct: "Correct. You added up the bars and read the grouping." },
      { t: "t.g3.time-signature", when: has('"accepted":["6/8"]'), correct: "Yes. Groups of three quavers mean compound time." },
      { t: "t.g1.barlines", when: has('"3/4"'), correct: "Every bar-line is in the right place, and the piece finishes with a double bar-line." },
      { t: "t.g1.grouping", when: has('"4/4"'), correct: "That's much clearer. Each beat can be seen at a glance." },
      { t: "t.g2.rest-grouping", correct: "Yes: one rest for each beat, so the beats are easy to count." },
      { t: "t.g5.irregular-grouping", when: has('"5/8"'), correct: "Correct. 5/8 can be grouped 3+2 or 2+3, and your grouping makes the pattern clear." },
    ],
    practice: [{ templateId: "t.g1.barlines", label: "More bar-lines" }, { templateId: "t.g3.compound-grouping", label: "Compound grouping" }],
  },
  {
    id: "accidentals-and-keys", order: 6, title: "Accidentals and key signatures", summary: "How long accidentals last, key signatures in every clef, and enharmonic spellings.",
    picks: [
      { t: "t.g1.accidental-state", correct: "Correct. You followed the accidental through the bar and stopped at the bar-line." },
      { t: "t.g1.key-signature", when: has('"name-key"'), correct: "Right. You read the key signature and named the key." },
      { t: "t.g2.key-signature", when: and(has("write-signature"), clef("bass")), correct: "Well written: right accidentals, right order, right places for the bass clef." },
      { t: "t.g2.relative-key", correct: "Yes. Relative keys share a key signature." },
      { t: "t.g4.double-accidental", when: has("double"), correct: "Correct. The double accidental lasts for the rest of the bar too." },
      { t: "t.g4.enharmonic", correct: "Yes. Same key on the piano, different letter name." },
    ],
    practice: [{ templateId: "t.g1.accidental-state", label: "More accidentals" }, { templateId: "t.g4.key-signature", label: "More key signatures" }],
  },
  {
    id: "scales", order: 7, title: "Scales and degrees", summary: "Build major, harmonic minor, melodic minor and chromatic scales, and name scale degrees.",
    picks: [
      { t: "t.g1.scale-build", when: has('"direction":"ascending"'), correct: "Beautiful scale: one note on each letter, semitones in the right places." },
      { t: "t.g2.scale-build-minor", correct: "Correct. Harmonic minor raises the 7th, both ways." },
      { t: "t.g3.scale-build-minor", when: has('"form":"melodic","direction":"ascending-descending"'), correct: "Yes: raised 6th and 7th going up, restored coming down." },
      { t: "t.g4.chromatic-scale", correct: "A correct chromatic scale: every semitone, with no letter used more than twice." },
      { t: "t.g1.degree", correct: "Right. You counted up from the tonic." },
      { t: "t.g4.technical-names", correct: "Correct technical name." },
    ],
    practice: [{ templateId: "t.g2.scale-build-major", label: "More major scales" }, { templateId: "t.g3.scale-build-minor", label: "More minor scales" }],
  },
  {
    id: "intervals", order: 8, title: "Intervals", summary: "Name intervals by number and quality, including compound intervals, and build them.",
    picks: [
      { t: "t.g1.interval-number", when: has('"identify"'), correct: "Correct. You counted both the bottom and the top note." },
      { t: "t.g3.interval-quality", when: has('"identify"'), correct: "Yes: the right number and the right quality." },
      { t: "t.g5.interval-compound", when: has('"acceptedIntervals":["'), correct: "Correct. A compound interval is a simple interval plus an octave." },
      { t: "t.g5.interval-any", when: has('"A'), correct: "Right. The letter names fix the number, and the sound fixes the quality." },
      { t: "t.g3.interval-quality", when: has('"build"'), correct: "Well built: the right letter and the right accidental." },
    ],
    practice: [{ templateId: "t.g4.interval-diatonic", label: "More intervals" }],
  },
  {
    id: "chords", order: 9, title: "Chords and inversions", summary: "Build tonic and primary triads, and name chords and their positions.",
    picks: [
      { t: "t.g1.tonic-triad", correct: "Yes: the tonic, the 3rd and the 5th." },
      { t: "t.g4.primary-triad", when: has('"V"'), correct: "Correct primary triad." },
      { t: "t.g5.chord-identify", when: has('"inversion":"b"'), correct: "Right. The 3rd in the bass makes it a b chord." },
      { t: "t.g5.chord-build", when: has('"inversion":"c"'), correct: "Correct. Any spacing works as long as the 5th is the lowest note." },
    ],
    practice: [{ templateId: "t.g5.chord-identify", label: "More chords" }],
  },
  {
    id: "cadences", order: 10, title: "Cadences", summary: "Choose chords for cadences and recognise perfect, plagal and imperfect cadences.",
    picks: [
      { t: "t.g5.cadence-chords", when: has('"acceptedTypes":["perfect"]'), correct: "A good choice: both chords contain their melody notes and make a perfect cadence." },
      { t: "t.g5.cadence-chords", when: (i) => (i.answer as { points?: Array<{ accepted: string[] }> }).points?.some((p) => p.accepted.length > 1) ?? false, correct: "Correct. More than one chord pair works here; yours is one of them." },
      { t: "t.g5.cadence-identify", correct: "Yes, you named the cadence from its chords." },
    ],
    practice: [{ templateId: "t.g5.cadence-chords", label: "More cadences" }],
  },
  {
    id: "clefs-and-transposition", order: 11, title: "Clefs and transposition", summary: "Move melodies by an octave between clefs, and transpose for instruments in B♭, A and F.",
    picks: [
      { t: "t.g3.octave-transpose", when: (i) => i.music?.clef === "treble" && (i.answer as { clef: string }).clef === "bass", correct: "Correct: an octave lower, rewritten for the bass clef." },
      { t: "t.g4.octave-transpose-alto", when: (i) => (i.answer as { clef: string }).clef === "alto", correct: "Yes. The alto clef puts middle C on the middle line." },
      { t: "t.g5.instrument-transpose", when: promptHas("concert pitch."), correct: "Right notes and the right new key signature." },
    ],
    practice: [{ templateId: "t.g5.instrument-transpose", label: "More transposition" }],
  },
  {
    id: "terms-and-ornaments", order: 12, title: "Terms, signs and ornaments", summary: "Performance directions and the six ornament signs.",
    picks: [
      { t: "t.g1.terms", correct: "Correct meaning." },
      { t: "t.g3.terms", correct: "Yes, that's what it means." },
      { t: "t.g4.ornament-name", when: has("turn"), correct: "Correct: you recognised the sign." },
      { t: "t.g5.ornament-replace", when: has("mordent"), correct: "Yes: that sign stands for exactly those notes." },
    ],
    extra: [
      {
        id: "i.showcase.terms-and-ornaments.9",
        templateId: "t.g1.terms",
        templateVersion: 1,
        seed: null,
        evidence: "learning",
        prompt: "Choose every term that tells you to get gradually slower.",
        answer: { kind: "multi-choice", options: [{ id: "rallentando", label: "rallentando" }, { id: "accelerando", label: "accelerando" }, { id: "ritardando", label: "ritardando" }, { id: "a-tempo", label: "a tempo" }], correctOptionIds: ["rallentando", "ritardando"] },
        hints: ["Two of these mean the same thing."],
        feedback: { correct: "Both are right: rallentando and ritardando both mean gradually getting slower.", mistakes: { "opposite-meaning": "Accelerando means getting faster: the opposite." }, fallback: "Look again: two terms mean gradually slower, one means faster and one means back to the speed before." },
      },
    ],
    practice: [{ templateId: "t.g2.terms", label: "More terms" }],
  },
  {
    id: "instruments-and-score", order: 13, title: "Instruments, voices and the score", summary: "Families, clefs and transpositions of instruments, voice types, and questions about a whole melody.",
    picks: [
      { t: "t.g4.instruments", when: promptHas("family"), correct: "Correct family." },
      { t: "t.g5.instruments", when: promptHas("transposing"), correct: "Yes, that is a transposing instrument." },
      { t: "t.g5.voices", correct: "Correct voice." },
      { t: "t.g1.melody", correct: "All three answers are right. Well observed!" },
    ],
    extra: [
      {
        id: "i.showcase.instruments-and-score.9",
        templateId: "t.g5.score",
        templateVersion: 1,
        seed: null,
        evidence: "learning",
        prompt: "This short score ends a piece in C major. Look at both staves and answer the questions.",
        score: {
          staves: [
            { id: "upper", label: "Right hand", music: { presentation: "stave", clef: "treble", key: "C major", showKeySignature: true, timeSignature: "4/4", measures: [
              { events: [{ kind: "chord", notes: [{ pitch: "G4" }, { pitch: "C5" }, { pitch: "E5" }], duration: { value: "minim", dots: 0 }, label: "A" }, { kind: "chord", notes: [{ pitch: "G4" }, { pitch: "B4" }, { pitch: "D5" }], duration: { value: "minim", dots: 0 }, label: "B" }] },
              { events: [{ kind: "chord", notes: [{ pitch: "G4" }, { pitch: "C5" }, { pitch: "E5" }], duration: { value: "semibreve", dots: 0 }, label: "C" }], barline: "final" },
            ], textAlternative: "Right hand, treble clef: chord G4 C5 E5 (A), chord G4 B4 D5 (B), then chord G4 C5 E5 (C)." } },
            { id: "lower", label: "Left hand", music: { presentation: "stave", clef: "bass", key: "C major", showKeySignature: true, timeSignature: "4/4", measures: [
              { events: [{ kind: "note", pitch: "C3", duration: { value: "minim", dots: 0 } }, { kind: "note", pitch: "G2", duration: { value: "minim", dots: 0 } }] },
              { events: [{ kind: "note", pitch: "C3", duration: { value: "semibreve", dots: 0 } }], barline: "final" },
            ], textAlternative: "Left hand, bass clef: C3, G2, then C3." } },
          ],
          textAlternative: "A two-stave piano short score in C major, 4/4, two bars. Chord A: C3 in the bass with G4 C5 E5 above. Chord B: G2 in the bass with G4 B4 D5 above. Chord C: C3 in the bass with G4 C5 E5 above.",
        },
        answer: { kind: "composite", parts: [
          { id: "chord-a", prompt: "Name chord A (Roman numeral and position).", answer: { kind: "chord", task: "identify", key: "C major", pitches: ["C3", "G4", "C5", "E5"], acceptedChords: [{ roman: "I", inversion: "a" }] } },
          { id: "chord-b", prompt: "Name chord B.", answer: { kind: "chord", task: "identify", key: "C major", pitches: ["G2", "G4", "B4", "D5"], acceptedChords: [{ roman: "V", inversion: "a" }] } },
          { id: "cadence", prompt: "Which cadence do chords B and C make?", answer: { kind: "choice", options: [{ id: "perfect", label: "Perfect" }, { id: "plagal", label: "Plagal" }, { id: "imperfect", label: "Imperfect" }], correctOptionIds: ["perfect"] } },
        ] },
        hints: ["Find each chord's root by stacking its notes in 3rds; the left-hand note is the bass."],
        feedback: { correct: "All three right: I, V, then I again makes a perfect cadence.", mistakes: { "evidence-misread": "Read the notes of both staves together: the left-hand note is the bass of each chord." }, fallback: "Name each chord from all its notes (both staves), then name the cadence from the last two chords." },
      },
    ],
    practice: [{ templateId: "t.g1.melody", label: "Another melody" }],
  },
];

mkdirSync(out, { recursive: true });
for (const s of sets) {
  const items = [...s.picks.map((p, i) => pick(s.id, i + 1, p)), ...(s.extra ?? [])];
  const familyIds = [...new Set(items.map((i) => ix.templates.get(i.templateId)!.familyId))];
  const grade = Math.min(...items.map((i) => ix.templates.get(i.templateId)!.grade));
  const file = {
    schemaVersion: 1,
    id: `s.${s.id}`,
    title: s.title,
    summary: s.summary,
    grade,
    order: s.order,
    familyIds,
    provenance: { authoredBy: "Music Theory Path content team (Brief 03)", originality: "original", notes: "Items drawn from the seeded generators with a teaching-point filter, then fixed. Music and answers come from the rule engine; prompts and feedback are original." },
    review: { status: "pending", reviewedBy: null },
    items,
    practice: s.practice,
  };
  writeFileSync(join(out, `${String(s.order).padStart(2, "0")}-${s.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${s.id}: ${items.length} items, families ${familyIds.join(", ")}`);
}
