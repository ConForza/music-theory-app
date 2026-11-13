import { ALL_G3, CL, TS_C, TS_S, V3, has, melody, nms, stave, type Spec2 } from "./lib3.ts";

const IV = { keys: ALL_G3, clefs: CL, maxLedgerLines: 2, intervalQuality: "number-and-quality", intervalLowerNote: "tonic", minorForms: ["harmonic", "melodic"] };
const FACTS = { keys: ALL_G3, intervalQuality: "number-and-quality", intervalLowerNote: "tonic" };
const TERM_SCOPE = { keys: ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major"], clefs: CL, timeSignatures: [...TS_S, ...TS_C], noteValues: V3, maxDots: 1, maxLedgerLines: 2, keySignatures: true, minorForms: ["harmonic"] };
const MEL_SCOPE = { keys: ALL_G3, clefs: CL, timeSignatures: [...TS_S, ...TS_C], noteValues: V3, maxDots: 1, maxLedgerLines: 2, keySignatures: true, minorForms: ["harmonic"] };
const C_UP = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

export const U5: Spec2[] = [
  {
    node: "G3-U5-L01",
    version: 1,
    bind: [
      { t: "t.g3.interval-quality", c: ["c.intervals.quality-perfect"], scope: IV },
      { t: "t.g3.interval-facts", c: ["c.intervals.quality-perfect"], scope: FACTS },
    ],
    objective: { statement: "Name the perfect intervals above the tonic: the 4th, 5th and octave.", criteria: ["I know an interval has a number and a quality.", "I know the 4th, 5th and octave above the tonic are perfect.", "I can name and write perfect intervals in the Grade 3 keys."] },
    explain: [
      { text: "In Grade 2 you named an interval by its number only: you counted the letter names, starting with the lower note as 1. Two intervals with the same number can still be different sizes, so Grade 3 adds a quality." },
      { text: "The quality is a word such as perfect, major or minor. In Grade 3 the lower note is always the tonic, the key note of one of the keys you know. This lesson is about the perfect intervals." },
      { text: "The 4th, the 5th and the octave above the tonic are always perfect, in major keys and in minor keys alike." },
      { music: stave("treble", [["C4", "C"], ["F4", "F"]], "Two notes in the treble clef: C, then F above it. From C to F is a perfect 4th."), caption: "C to F: a perfect 4th." },
      { music: stave("treble", [["C4", "C"], ["G4", "G"]], "Two notes in the treble clef: C, then G above it. From C to G is a perfect 5th."), caption: "C to G: a perfect 5th." },
      { music: stave("treble", [["C4", "C"], ["C5", "C"]], "Two notes in the treble clef: middle C, then the C an octave above. From C to C is a perfect octave."), caption: "C to the C above: a perfect octave." },
      { text: "The same holds in any key. In E flat major the perfect 4th above E flat is A flat, and the perfect 5th is B flat. In F sharp minor, the perfect 4th above F sharp is B, and the perfect 5th is C sharp." },
      { text: "The other intervals above the tonic, the 2nd, 3rd, 6th and 7th, are not perfect. They come in major and minor kinds, and the next lesson shows how." },
      { tip: "4th, 5th and octave above the tonic = perfect, in every major and minor key." },
    ],
    demo: { widget: "staff", music: stave("treble", [["Eb4", "E♭"], ["Ab4", "A♭"], ["Bb4", "B♭"], ["Eb5", "E♭"]], "E flat, then A flat, B flat and E flat an octave higher: the perfect 4th, 5th and octave above E flat."), steps: ["Count from E flat as 1: F is 2, G is 3, A flat is 4. E flat to A flat is a perfect 4th.", "B flat is 5: a perfect 5th.", "The next E flat is 8: a perfect octave."], text: "E flat with A flat, B flat and E flat an octave above: perfect 4th, 5th and octave." },
    guided: [
      { t: "t.g3.interval-facts", when: has("can be a perfect"), correct: "Yes: the 4th, 5th and octave are perfect." },
      { t: "t.g3.interval-quality", when: has("Name this interval"), correct: "Yes: perfect, and the right number." },
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "You counted the number and kept the quality." },
    ],
    independent: [
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "Correct note." },
      { t: "t.g3.interval-quality", when: has("Name this interval"), correct: "Correct interval." },
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "Correct." },
      { t: "t.g3.interval-quality", when: has("Name this interval"), correct: "Correct." },
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "Correct." },
      { t: "t.g3.interval-quality", when: has("Name this interval"), correct: "Correct." },
    ],
    recap: ["An interval has a number and a quality.", "The 4th, 5th and octave above the tonic are perfect.", "This holds in every major and minor key."],
    review: [{ t: "t.g3.interval-quality", afterDays: 1 }, { t: "t.g3.interval-facts", afterDays: 3 }, { t: "t.g3.interval-quality", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 11 and book section 11. The lower note is always the tonic (Grade 4 extends intervals to any two notes of a key). Only perfect intervals are asked in this lesson; major and minor intervals come next.",
  },
  {
    node: "G3-U5-L02",
    version: 1,
    bind: [
      { t: "t.g3.interval-quality", c: ["c.intervals.quality-major-minor"], scope: IV },
      { t: "t.g3.interval-name", c: ["c.intervals.quality-perfect", "c.intervals.quality-major-minor"], scope: IV },
      { t: "t.g3.interval-facts", c: ["c.intervals.quality-perfect", "c.intervals.quality-major-minor"], scope: FACTS },
    ],
    objective: { statement: "Name major and minor intervals above the tonic.", criteria: ["I know a major scale gives major 2nds, 3rds, 6ths and 7ths above the tonic.", "I know a minor key has a minor 3rd above the tonic.", "I can write and name major and minor intervals correctly spelt."] },
    explain: [
      { text: "The 2nd, 3rd, 6th and 7th above the tonic are not perfect. They are major or minor. A minor interval is one semitone smaller than the major interval with the same number." },
      { text: "In a major key every one of these intervals is major. Above C, in C major:" },
      { music: stave("treble", nms(C_UP), "The scale of C major: C, D, E, F, G, A, B, C."), caption: "From C: D is a major 2nd, E a major 3rd, F a perfect 4th, G a perfect 5th, A a major 6th, B a major 7th, C a perfect octave." },
      { text: "A minor key has a lower 3rd, so the interval from the tonic to the 3rd degree is a minor 3rd. In the harmonic minor, and in the lower form of the melodic minor, the 6th is a minor 6th too. The 2nd is always major." },
      { music: stave("treble", [["C4", "C"], ["Eb4", "E♭"], ["Ab4", "A♭"], ["Bb4", "B♭"]], "C, then E flat, A flat and B flat above it: a minor 3rd, a minor 6th and a minor 7th above C."), caption: "Above C in C minor: minor 3rd (E♭), minor 6th (A♭) and minor 7th (B♭)." },
      { text: "The number comes from counting letter names; the quality comes from the size. The note E♭ above C is still a 3rd, because the letters are C, D, E, but it is a minor 3rd: one semitone smaller than C to E." },
      { text: "The pattern is the same in every key, though the notes need different sharps or flats. Look at the notes carefully when you write an interval, and spell the upper note with the letter that gives the right number." },
      { tip: "Count the number from the letters. Then compare with the major scale: the same size is major, a semitone smaller is minor." },
    ],
    demo: { widget: "staff", music: stave("treble", [["C4", "C"], ["E4", "E"], ["Eb4", "E♭"]], "C, then E, then E flat: a major 3rd and a minor 3rd above C."), steps: ["From C to E is four semitones: a major 3rd.", "From C to E flat is three semitones: a minor 3rd.", "Both are 3rds, because the letters are C, D, E. The quality tells the size."], text: "A major 3rd (C to E) and a minor 3rd (C to E flat)." },
    guided: [
      { t: "t.g3.interval-facts", when: has("In a major key"), correct: "Yes: major scales give major intervals." },
      { t: "t.g3.interval-name", correct: "Right: number first, then the quality." },
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "The upper note has the right letter and the right size." },
    ],
    independent: [
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "Correct note." },
      { t: "t.g3.interval-name", correct: "Correct interval." },
      { t: "t.g3.interval-facts", when: has("between the tonic and the 3rd degree"), correct: "Correct quality." },
      { t: "t.g3.interval-quality", when: has("Name this interval"), correct: "Correct." },
      { t: "t.g3.interval-name", correct: "Correct." },
      { t: "t.g3.interval-quality", when: has("Write a note above"), correct: "Correct." },
    ],
    recap: ["Major scales have major 2nds, 3rds, 6ths and 7ths above the tonic.", "A minor interval is one semitone smaller than the major one.", "The 3rd above the tonic of a minor key is a minor 3rd."],
    review: [{ t: "t.g3.interval-name", afterDays: 1 }, { t: "t.g3.interval-quality", afterDays: 3 }, { t: "t.g3.interval-facts", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 11 and book section 11. The 6th and 7th above the tonic of a minor key depend on the minor form, so name-the-interval questions never ask them as the quality of a minor-key degree; they are asked only as intervals between two printed notes, or as intervals to build.",
  },
  {
    node: "G3-U5-L03",
    version: 1,
    bind: [
      { t: "t.g3.terms", c: ["c.terms.g3"], scope: {} },
      { t: "t.g3.term-use", c: ["c.terms.g3"], scope: TERM_SCOPE },
    ],
    objective: { statement: "Learn six more performance words and what they ask the player to do.", criteria: ["I know andantino, prestissimo and tempo primo are about speed.", "I know espressivo, sostenuto and con moto are about the way to play.", "I can match each word with its meaning, in words or on a melody."] },
    explain: [
      { text: "Music is full of Italian words that say how to play. Here are six new ones. Three are about speed and three are about the character of the music." },
      { text: "Andantino means a little faster than andante, the walking pace you know. Prestissimo means as fast as possible: faster than presto. Tempo primo means return to the speed at the start." },
      { text: "Espressivo means expressively, with feeling. Sostenuto means sustained: the notes are held on and supported. Con moto means with movement, so the music keeps moving forward." },
      { text: "These words are usually written above the stave at the start of a piece or a section. Always check whether a word describes speed, loudness, the touch of the notes or the mood." },
      { text: "Speed words only compare with other speed words. Andantino and prestissimo are not opposites of each other: one is a gentle walking pace, one is the fastest of all." },
      { tip: "Speed: andantino, prestissimo, tempo primo. Character: espressivo, sostenuto, con moto." },
    ],
    demo: { widget: "score", music: melody("treble", [[["G4", "crotchet"], ["A4", "crotchet"], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", "A two-bar melody in G major marked espressivo.", { tempoText: "espressivo" }), steps: ["Look at the word above the first bar: espressivo.", "It describes the character: play with feeling.", "It does not change the speed: only the way you shape the notes."], text: "A short melody in G major with the word espressivo above the first bar." },
    guided: [
      { t: "t.g3.terms", when: has("andantino"), correct: "Yes: a little faster than andante." },
      { t: "t.g3.term-use", when: has("A composer wants"), correct: "Yes: you matched the description." },
      { t: "t.g3.terms", when: has("sostenuto"), correct: "Yes: sustained." },
    ],
    independent: [
      { t: "t.g3.terms", when: has("prestissimo"), correct: "Correct: as fast as possible." },
      { t: "t.g3.term-use", when: has("This melody is marked"), correct: "Correct." },
      { t: "t.g3.terms", when: has("con moto"), correct: "Correct: with movement." },
      { t: "t.g3.term-use", when: has("Which term or sign means"), correct: "Correct." },
      { t: "t.g3.terms", when: has("espressivo"), correct: "Correct: expressively." },
      { t: "t.g3.term-use", when: has("tempo primo"), correct: "Correct." },
    ],
    recap: ["Andantino, prestissimo and tempo primo describe speed.", "Espressivo, sostenuto and con moto describe the way to play.", "Check whether a word is about speed, touch or mood."],
    review: [{ t: "t.g3.terms", afterDays: 1 }, { t: "t.g3.term-use", afterDays: 3 }, { t: "t.g3.terms", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 12. OPEN_QUESTIONS Q2: the Grade 3 term list is the provisional vocabulary (six terms first used at Grade 3). The reference book lists many more Grade 3 words; they are not added, because the vocabulary is part of every question's generation fingerprint and an authoritative list is still awaited. TEACHER TO CONFIRM the meaning of andantino (a little faster than andante), which varies between sources.",
  },
  {
    node: "G3-U5-L04",
    version: 1,
    bind: [
      { t: "t.g3.melody-detail", c: ["c.context.melody-g3"], scope: MEL_SCOPE },
      { t: "t.g3.melody", c: ["c.context.melody-g3"], scope: { keys: ALL_G3, clefs: CL, timeSignatures: [...TS_S, ...TS_C, "2/2", "3/2", "4/2", "3/8"], maxLedgerLines: 4, intervalQuality: "number-and-quality", intervalLowerNote: "tonic" } },
    ],
    objective: { statement: "Answer questions about a short melody, including melodies in compound time.", criteria: ["I look at the clef, key signature and time signature first.", "I can say whether the melody is in simple or compound time and count its beats.", "I can name the interval from the tonic to a marked note, with its quality."] },
    explain: [
      { text: "A question about a melody is easiest if you read it in the same order every time. Start with the clef, then the key signature, then the time signature, then any words or signs above the stave. Only then look at the notes." },
      { music: melody("treble", [[["E5", "crotchet", { dots: 1 }], ["D5", "quaver", { beam: "begin" }], ["C5", "quaver", { beam: "continue" }], ["B4", "quaver", { beam: "end" }]], [["A4", "crotchet", { dots: 1 }], ["A4", "crotchet", { dots: 1 }]]], "6/8", "A minor", "A two-bar melody in A minor in the treble clef, in 6/8, marked andantino. Bar 1: a dotted crotchet E, then three quavers D, C, B. Bar 2: two dotted crotchets, A and A.", { tempoText: "andantino" }), caption: "A melody in 6/8 in A minor. What is the clef, the key, the time, the tempo word?" },
      { text: "For this melody: the treble clef, no sharps or flats, so A minor or C major; the last note is A and the music feels minor, so A minor. The time signature 6/8 is compound duple: two dotted-crotchet beats in each bar. The word andantino says to play a little faster than a walking pace." },
      { text: "To name an interval, find the tonic of the key, then count up to the note, calling the tonic 1. In A minor, E is a 5th above A, and the interval is a perfect 5th. Check the quality: 4ths, 5ths and octaves are perfect." },
      { text: "Notes beyond the stave count as well: read their ledger lines slowly, from the stave outwards. If the melody has a sign such as 8va, the sounding notes are an octave away from the written ones." },
      { tip: "Clef, key, time, words, then the notes. Say simple or compound before you count the beats." },
    ],
    demo: { widget: "score", music: melody("treble", [[["E5", "crotchet", { dots: 1 }], ["D5", "quaver", { beam: "begin" }], ["C5", "quaver", { beam: "continue" }], ["B4", "quaver", { beam: "end" }]], [["A4", "crotchet", { dots: 1 }], ["A4", "crotchet", { dots: 1 }]]], "6/8", "A minor", "A two-bar melody in A minor, 6/8, marked andantino.", { tempoText: "andantino" }), steps: ["Clef: treble. Key signature: none, so A minor. Time signature: 6/8.", "6/8 is compound duple: two dotted-crotchet beats in a bar.", "The word andantino sets the speed: a little faster than andante."], text: "A two-bar melody in A minor in 6/8, marked andantino." },
    guided: [
      { t: "t.g3.melody-detail", correct: "Yes: you read the right part of the melody." },
      { t: "t.g3.melody-detail", correct: "Yes." },
      { t: "t.g3.melody", correct: "You answered every part of the melody." },
    ],
    independent: [
      { t: "t.g3.melody-detail", correct: "Correct." },
      { t: "t.g3.melody", correct: "Correct." },
      { t: "t.g3.melody-detail", correct: "Correct." },
      { t: "t.g3.melody-detail", correct: "Correct." },
      { t: "t.g3.melody", correct: "Correct." },
      { t: "t.g3.melody-detail", correct: "Correct." },
    ],
    recap: ["Read clef, key signature, time signature and words before the notes.", "Say simple or compound before counting beats.", "Name an interval from the tonic by number first, then by quality."],
    review: [{ t: "t.g3.melody-detail", afterDays: 1 }, { t: "t.g3.melody", afterDays: 3 }, { t: "t.g3.melody-detail", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 21 (questions about a melody) as it extends to Grade 3, and Grade 3 outcomes 1, 11 and 12. Context melodies never begin with an upbeat (OPEN_QUESTIONS Q5). The 6th and 7th of a minor key are not asked by interval from the tonic in melodies.",
  },
];
