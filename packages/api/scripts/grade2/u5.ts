import { CL, MAJ_G2, MIN3, TS_ALL, has, melody, nms, stave, stv, type Spec2 } from "./lib2.ts";

const KEYS10 = [...MAJ_G2, ...MIN3];
const NEW_KEYS = ["A major", "Bb major", "Eb major", ...MIN3];
const termScope = { keys: MAJ_G2, clefs: CL, timeSignatures: ["2/4", "3/4", "4/4", "2/2", "3/2", "3/8"], maxLedgerLines: 2, keySignatures: true, tuplets: ["triplet"] };

/** Original tune for lesson 2: D major, 4/4, marked Largo. */
const LARGO = melody("treble", [[["D4", "crotchet"], ["F#4", "crotchet"], ["A4", "minim"]], [["B4", "crotchet"], ["A4", "crotchet"], ["F#4", "minim"]], [["E4", "crotchet"], ["G4", "crotchet"], ["F#4", "minim"]], [["D4", "semibreve"]]], "4/4", "D major", "A four-bar tune in D major, 4/4, marked Largo. Bar 1: D, F sharp, A minim. Bar 2: B, A, F sharp minim. Bar 3: E, G, F sharp minim. Bar 4: D semibreve.", { tempoText: "Largo" });
/** Original tune for lesson 3: B flat major, 3/4, with sf on the first note and tenuto on the last. */
const SIGNS = melody("treble", [[["Bb4", "crotchet", { dynamic: "sf" }], ["D5", "crotchet"], ["F5", "crotchet"]], [["Eb5", "minim", { art: "tenuto" }], ["D5", "crotchet"]], [["C5", "crotchet", { dynamic: "fp" }], ["A4", "crotchet"], ["Bb4", "crotchet"]], [["Bb4", "minim", { dots: 1 }]]], "3/4", "Bb major", "A four-bar tune in B flat major, 3/4. Bar 1: B flat marked sf, D, F. Bar 2: E flat minim marked tenuto, D. Bar 3: C marked fp, A, B flat. Bar 4: dotted minim B flat.");
/** Original tune for lesson 4: A major, 2/2, with a triplet in bar 2. */
const READ = melody("treble", [[["A4", "minim"], ["C#5", "minim", { dynamic: "mf" }]], [["E5", "crotchet"], ["D5", "crotchet"], ["C#5", "crotchet"], ["B4", "crotchet"]], [["A4", "minim"], ["E4", "minim"]], [["A4", "semibreve"]]], "2/2", "A major", "A four-bar tune in A major, 2/2, marked mf. Bar 1: A minim, C sharp minim. Bar 2: E, D, C sharp, B crotchets. Bar 3: A minim, E minim. Bar 4: A semibreve.");

export const U5: Spec2[] = [
  {
    node: "G2-U5-L01",
    version: 1,
    bind: [
      { t: "t.g2.interval-number", c: ["c.intervals.above-tonic-number-g2"], scope: stv(KEYS10, { minorForms: ["harmonic"], intervalQuality: "number-only", intervalLowerNote: "tonic" }) },
      { t: "t.g2.interval-note", c: ["c.intervals.above-tonic-number-g2"], scope: stv(KEYS10, { minorForms: ["harmonic"], intervalQuality: "number-only", intervalLowerNote: "tonic" }) },
    ],
    objective: { statement: "Name and write intervals above the tonic, by number, in the Grade 2 major and minor keys.", criteria: ["I know to count both notes, so the tonic itself is 1.", "I can number an interval above the tonic in A, B♭ or E♭ major.", "I can do the same in A, E or D minor."] },
    explain: [
      { text: "An interval is the distance between two notes. For now we give it a number only: count the letter names from the lower note to the upper note, counting both." },
      { music: stave("treble", [["A4", "1"], ["B4", "2"], ["C#5", "3"], ["D5", "4"], ["E5", "5"], ["F#5", "6"], ["G#5", "7"], ["A5", "8"]], "The notes of A major numbered 1 to 8 above the tonic A."), caption: "Above the tonic A: B is a 2nd, C♯ a 3rd, D a 4th, E a 5th, F♯ a 6th, G♯ a 7th, and A an octave (8th)." },
      { text: "The key tells you which sharps and flats are in the scale, so you use the key to write the note: a 3rd above A in A major is C♯, because C♯ is in the key." },
      { text: "In a minor key the same counting works. A 3rd above A in A minor is C; a 5th above D in D minor is A." },
      { tip: "Count the letters, include both notes, and use the sharps and flats of the key." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(["Eb4", "G4", "Bb4"]), "Three treble notes: E flat, G and B flat."),
      steps: ["The tonic is E♭: that is 1.", "Counting up two more letters, F and then G: G is the 3rd above E♭.", "Two more: A♭, then B♭. B♭ is the 5th above E♭."],
      text: "In E flat major, G is a 3rd above the tonic and B flat is a 5th above it.",
    },
    guided: [
      { t: "t.g2.interval-note", correct: "Yes: counted from the tonic." },
      { t: "t.g2.interval-number", correct: "Correct number." },
      { t: "t.g2.interval-note", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.interval-number", correct: "Correct number." },
      { t: "t.g2.interval-note", correct: "Correct note." },
      { t: "t.g2.interval-number", correct: "Correct." },
      { t: "t.g2.interval-note", correct: "Correct." },
      { t: "t.g2.interval-number", correct: "Correct." },
      { t: "t.g2.interval-note", correct: "Correct." },
    ],
    recap: ["Count both notes when numbering an interval.", "Use the key to know which sharps or flats are in the scale.", "The same counting works in major and minor keys."],
    review: [{ t: "t.g2.interval-number", afterDays: 1 }, { t: "t.g2.interval-note", afterDays: 3 }, { t: "t.g2.interval-number", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 12. Intervals are above the tonic and by number only; qualities (major, minor, perfect) start in Grade 3. The 7th above a minor tonic is not asked, as it depends on the form.",
  },
  {
    node: "G2-U5-L02",
    version: 1,
    bind: [
      { t: "t.g2.terms", c: ["c.terms.g2-words"], scope: {} },
      { t: "t.g2.term-use", c: ["c.terms.g2-words"], scope: termScope },
    ],
    objective: { statement: "Learn five new Italian words for speed and character: presto, largo, vivace, grazioso and maestoso.", criteria: ["I know presto means very fast and largo means slow and broad.", "I know vivace means lively and quick.", "I know grazioso means gracefully and maestoso means majestically."] },
    explain: [
      { text: "Composers write Italian words at the start of a piece to say how fast or in what character it should be played. Here are five new ones." },
      { text: "Presto means very fast. Largo means slow and broad, played with wide, stately sounds. Vivace means lively and quick." },
      { text: "Grazioso means gracefully. Maestoso means majestically, like music for a king's entrance." },
      { music: LARGO, caption: "This original tune is marked Largo, so it should be played slowly and broadly. Imagine a stately procession." },
      { text: "The word appears above the first bar of the music. It tells you how to feel the tune before you start playing." },
      { tip: "Presto = very fast. Largo = slow and broad. Vivace = lively. Grazioso = graceful. Maestoso = majestic." },
    ],
    demo: {
      widget: "score",
      music: LARGO,
      steps: ["Read the word above the first bar: Largo.", "Largo means slow and broad, so play each note with weight and space.", "If it had said Presto instead, you would play the same notes very fast."],
      text: "A short tune in D major marked Largo, meaning slow and broad.",
    },
    guided: [
      { t: "t.g2.term-use", when: has("What does"), correct: "Yes." },
      { t: "t.g2.term-use", when: has("Which marking fits best"), correct: "That marking fits the character." },
      { t: "t.g2.terms", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.term-use", when: has("Which term or sign means"), correct: "Correct term." },
      { t: "t.g2.term-use", when: has("This melody is marked"), correct: "You applied the term to the tune." },
      { t: "t.g2.terms", correct: "Correct." },
      { t: "t.g2.term-use", when: has("Which marking fits best"), correct: "Correct." },
      { t: "t.g2.terms", correct: "Correct." },
      { t: "t.g2.term-use", when: has("What does"), correct: "Correct." },
    ],
    recap: ["Presto: very fast.", "Largo: slow and broad. Vivace: lively and quick.", "Grazioso: gracefully. Maestoso: majestically."],
    review: [{ t: "t.g2.term-use", afterDays: 1 }, { t: "t.g2.terms", afterDays: 3 }, { t: "t.g2.term-use", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 13. The Grade 2 term list is provisional (OPEN_QUESTIONS Q2): it is the set of terms the engine vocabulary marks as first used at Grade 2. TEACHER TO CONFIRM.",
  },
  {
    node: "G2-U5-L03",
    version: 1,
    bind: [
      { t: "t.g2.terms", c: ["c.terms.g2-signs"], scope: {} },
      { t: "t.g2.term-use", c: ["c.terms.g2-signs"], scope: termScope },
    ],
    objective: { statement: "Learn three new signs and words for touch and accent: sforzando (sf), fortepiano (fp) and tenuto.", criteria: ["I know sf means a sudden strong accent.", "I know fp means loud, then immediately quiet.", "I know tenuto means to hold a note for its full length."] },
    explain: [
      { text: "Some signs tell you how to play a single note, not the whole tune. Here are three new ones." },
      { text: "Sforzando, written sf, means a sudden strong accent on one note." },
      { text: "Fortepiano, written fp, means start the note loud, then drop to quiet at once." },
      { text: "Tenuto is a short horizontal line above or below the notehead. It means hold the note for its full length." },
      { music: SIGNS, caption: "An original tune in B♭ major showing all three: sf on the first note, tenuto on the E♭ in bar 2, and fp on the C in bar 3." },
      { tip: "sf = sudden accent. fp = loud then quiet. Tenuto line = hold it, full length." },
    ],
    demo: {
      widget: "score",
      music: SIGNS,
      steps: ["Look at the very first note: it is marked sf, a sudden strong accent.", "In bar 2, the E♭ has a tenuto line: hold it for its full length.", "In bar 3, the C is marked fp: loud at the start, then quiet at once."],
      text: "A short tune in B flat major with sf on the first note, a tenuto mark in bar 2 and fp in bar 3.",
    },
    guided: [
      { t: "t.g2.term-use", when: has("What does"), correct: "Yes." },
      { t: "t.g2.term-use", when: has("What does the mark"), correct: "That is what the mark means." },
      { t: "t.g2.terms", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.term-use", when: has("Which term or sign means"), correct: "Correct." },
      { t: "t.g2.term-use", when: has("What does the mark"), correct: "You read the mark on the note." },
      { t: "t.g2.terms", correct: "Correct." },
      { t: "t.g2.term-use", when: has("Which marking fits best"), correct: "Correct." },
      { t: "t.g2.terms", correct: "Correct." },
      { t: "t.g2.term-use", when: has("What does"), correct: "Correct." },
    ],
    recap: ["sf: a sudden strong accent.", "fp: loud, then immediately quiet.", "Tenuto: hold the note for its full length."],
    review: [{ t: "t.g2.term-use", afterDays: 1 }, { t: "t.g2.terms", afterDays: 3 }, { t: "t.g2.term-use", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 13. The Grade 2 sign list is provisional (OPEN_QUESTIONS Q2). TEACHER TO CONFIRM.",
  },
  {
    node: "G2-U5-L04",
    version: 1,
    bind: [
      { t: "t.g2.melody", c: ["c.context.melody-g2"], scope: { keys: MAJ_G2, timeSignatures: TS_ALL, tuplets: ["triplet"], clefs: CL, maxLedgerLines: 2 } },
      { t: "t.g2.melody-detail", c: ["c.context.melody-g2"], scope: { keys: MAJ_G2, clefs: CL, timeSignatures: TS_ALL, tuplets: ["triplet"], maxLedgerLines: 2, keySignatures: true } },
    ],
    objective: { statement: "Read a short melody and find the key, the time signature, the beats and the marks.", criteria: ["I can read the key signature and time signature at the start.", "I can find a triplet and say which bar it is in.", "I can say what a Grade 2 word or sign tells the player."] },
    explain: [
      { text: "Reading a melody means putting together everything you know. Go through it in the same order each time." },
      { text: "First the clef and the key signature: which key is it, and which sharps or flats are in the scale? Then the time signature: how many beats, and which note is the beat." },
      { music: READ, caption: "This original tune is in A major (three sharps), 2/2 (two minim beats) and marked mf." },
      { text: "Next look for rests, triplets, ties and dots in each bar. Then the marks: words above the stave, dynamics under it, and signs on single notes." },
      { text: "Finally, use the key. You can find the tonic, the tonic triad or the interval from the tonic for any note in the melody." },
      { tip: "Clef, key, time signature, then bar by bar: rhythms, then marks." },
    ],
    demo: {
      widget: "score",
      music: READ,
      steps: ["Three sharps: the key is A major. The time signature is 2/2: two minim beats.", "Bar 1 has two minims. Bar 2 has four crotchets. Count them in minim beats: two crotchets to a beat.", "The mark mf under the second note of bar 1 tells you to play moderately loud."],
      text: "A short tune in A major, 2/2, marked mf.",
    },
    guided: [
      { t: "t.g2.melody-detail", when: has("How many beats"), correct: "Yes." },
      { t: "t.g2.melody-detail", when: has("Which key is it"), correct: "Correct key." },
      { t: "t.g2.melody", correct: "Good: you read each part of the melody." },
    ],
    independent: [
      { t: "t.g2.melody-detail", when: has("triplet"), correct: "You found the triplet." },
      { t: "t.g2.melody-detail", when: has("is marked"), correct: "You applied the word to the tune." },
      { t: "t.g2.melody", correct: "Good reading." },
      { t: "t.g2.melody-detail", when: has("interval, by number"), correct: "Correct interval." },
      { t: "t.g2.melody-detail", when: has("worth one beat"), correct: "Correct." },
      { t: "t.g2.melody", correct: "Good." },
    ],
    recap: ["Read in order: clef, key, time signature, bars, marks.", "The key tells you the sharps or flats; the time signature tells you the beats.", "Words and signs tell you how to play."],
    review: [{ t: "t.g2.melody-detail", afterDays: 1 }, { t: "t.g2.melody", afterDays: 3 }, { t: "t.g2.melody-detail", afterDays: 7 }],
    notes: "Original wording and tunes. Follows Grade 2 outcomes 1, 3, 5, 12 and 13 in context. Melodies are major-key only in this release; minor melodies are a teacher decision (see the teacher review pack).",
  },
];
void [NEW_KEYS, stave];
