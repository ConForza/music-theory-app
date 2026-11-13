import { ALL_G3, CL, MAJ_NEW, MIN3, MIN_FLAT, MIN_SHARP, NEW_KEYS, chord, has, nms, stave, type Spec2 } from "./lib3.ts";

const BOTH = ["harmonic", "melodic"];
const SC = (keys: string[], forms: string[] = BOTH) => ({ keys, minorForms: forms, clefs: CL, maxLedgerLines: 2 });
const A_HAR = ["A4", "B4", "C5", "D5", "E5", "F5", "G#5", "A5"];
const A_MEL_UP = ["A4", "B4", "C5", "D5", "E5", "F#5", "G#5", "A5"];
const A_MEL_DOWN = ["A5", "G5", "F5", "E5", "D5", "C5", "B4", "A4"];
const E_MEL_UP = ["E4", "F#4", "G4", "A4", "B4", "C#5", "D#5", "E5"];
const D_MEL_DOWN = ["D5", "C5", "Bb4", "A4", "G4", "F4", "E4", "D4"];
const E_MAJ = ["E4", "F#4", "G#4", "A4", "B4", "C#5", "D#5", "E5"];
const AB_MAJ = ["Ab4", "Bb4", "C5", "Db5", "Eb5", "F5", "G5", "Ab5"];
const B_HAR = ["B4", "C#5", "D5", "E5", "F#5", "G5", "A#5", "B5"];
const FS_MEL_UP = ["F#4", "G#4", "A4", "B4", "C#5", "D#5", "E#5", "F#5"];
const FS_MEL_DOWN = ["F#5", "E5", "D5", "C#5", "B4", "A4", "G#4", "F#4"];
const CS_HAR = ["C#4", "D#4", "E4", "F#4", "G#4", "A4", "B#4", "C#5"];
const G_HAR = ["G4", "A4", "Bb4", "C5", "D5", "Eb5", "F#5", "G5"];
const C_MEL_UP = ["C4", "D4", "Eb4", "F4", "G4", "A4", "B4", "C5"];
const C_MEL_DOWN = ["C5", "Bb4", "Ab4", "G4", "F4", "Eb4", "D4", "C4"];
const F_HAR = ["F4", "G4", "Ab4", "Bb4", "C5", "Db5", "E5", "F5"];

export const U4: Spec2[] = [
  {
    node: "G3-U4-L01",
    version: 1,
    bind: [
      { t: "t.g3.scale-build-minor", c: ["c.scales.minor-melodic"], scope: SC(MIN3) },
      { t: "t.g3.minor-forms", c: ["c.scales.minor-melodic"], scope: SC(MIN3) },
      { t: "t.g3.scale-gap", c: ["c.scales.minor-melodic"], scope: SC(MIN3) },
    ],
    objective: { statement: "Learn the melodic minor scale, and how it differs from the harmonic minor.", criteria: ["I know the melodic minor raises the 6th and 7th notes going up.", "I know it uses the notes of the key signature again coming down.", "I can write the melodic minor of A, E and D minor, up and down."] },
    explain: [
      { text: "In Grade 2 you learned the harmonic minor: the notes of the key signature with the 7th raised by a semitone. It has an awkward big step between the 6th and 7th notes." },
      { music: stave("treble", nms(A_HAR), "A harmonic minor going up: A, B, C, D, E, F, G sharp, A."), caption: "Harmonic minor: only the 7th is raised, going up and coming down." },
      { text: "The melodic minor smooths that step away. Going up, it raises both the 6th and the 7th notes. Coming down, it lowers them again, so the notes are those of the key signature. That means the melodic minor is different going up and coming down." },
      { music: stave("treble", nms(A_MEL_UP), "A melodic minor going up: A, B, C, D, E, F sharp, G sharp, A."), caption: "A melodic minor going up: F and G are both raised." },
      { music: stave("treble", nms(A_MEL_DOWN), "A melodic minor coming down: A, G, F, E, D, C, B, A, with F and G natural."), caption: "A melodic minor coming down: F and G are natural again." },
      { text: "The same idea works in every minor key. In E minor going up, the 6th (C) and 7th (D) become C sharp and D sharp. In D minor, coming down, B flat and C return, because B flat is in the key signature." },
      { music: stave("treble", nms(E_MEL_UP), "E melodic minor going up: E, F sharp, G, A, B, C sharp, D sharp, E."), caption: "E melodic minor going up: C sharp and D sharp." },
      { music: stave("treble", nms(D_MEL_DOWN), "D melodic minor coming down: D, C, B flat, A, G, F, E, D."), caption: "D melodic minor coming down: B flat and C natural." },
      { tip: "Melodic minor: up, raise the 6th and 7th. Down, lower them again. Harmonic minor: the 7th is raised both ways." },
    ],
    demo: { widget: "staff-and-keyboard", music: stave("treble", nms(A_MEL_UP), "A melodic minor scale going up: A, B, C, D, E, F sharp, G sharp, A."), steps: ["Start with A natural minor: A, B, C, D, E, F, G.", "Going up, raise the 6th (F) and the 7th (G) by a semitone: F sharp and G sharp.", "Coming down, use the notes of the key signature again: G natural and F natural."], text: "A melodic minor going up: A, B, C, D, E, F sharp, G sharp, A." },
    guided: [
      { t: "t.g3.minor-forms", when: has("how does the melodic minor scale change"), correct: "Yes: both notes go back down." },
      { t: "t.g3.scale-gap", when: has("melodic"), correct: "Yes: you used the form and the direction." },
      { t: "t.g3.scale-build-minor", when: has("melodic"), correct: "You wrote the melodic minor with its raised notes." },
    ],
    independent: [
      { t: "t.g3.minor-forms", when: has("Which form of the minor scale"), correct: "Correct form." },
      { t: "t.g3.scale-build-minor", when: has("melodic"), correct: "Correct melodic minor." },
      { t: "t.g3.scale-gap", when: has("melodic"), correct: "Correct note." },
      { t: "t.g3.minor-forms", when: has("In the"), correct: "Correct." },
      { t: "t.g3.scale-build-minor", when: has("melodic"), correct: "Correct." },
      { t: "t.g3.scale-gap", when: has("melodic"), correct: "Correct." },
    ],
    recap: ["Melodic minor going up: the 6th and 7th are raised.", "Melodic minor coming down: the 6th and 7th return to the key signature.", "Harmonic minor raises only the 7th, up and down."],
    review: [{ t: "t.g3.minor-forms", afterDays: 1 }, { t: "t.g3.scale-gap", afterDays: 3 }, { t: "t.g3.scale-build-minor", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 8 and book Grade 2 sections 9 and 11 (the melodic form), moved to Grade 3 as the 2020 outline requires; Grade 2 stays harmonic-only. The first keys are A, E and D minor.",
  },
  {
    node: "G3-U4-L02",
    version: 1,
    bind: [
      { t: "t.g3.scale-build-major", c: ["c.scales.major-e-ab"], scope: { keys: MAJ_NEW, clefs: CL, maxLedgerLines: 2 } },
      { t: "t.g3.key-signature", c: ["c.scales.major-e-ab"], scope: { keys: MAJ_NEW, clefs: CL } },
      { t: "t.g3.key-facts", c: ["c.scales.major-e-ab"], scope: { keys: MAJ_NEW, clefs: CL, keySignatures: true } },
      { t: "t.g3.scale-gap", c: ["c.scales.major-e-ab"], scope: { keys: MAJ_NEW, minorForms: [], clefs: CL, maxLedgerLines: 2 } },
    ],
    objective: { statement: "Learn the scales and key signatures of E major and A flat major.", criteria: ["I know E major has four sharps: F, C, G and D.", "I know A flat major has four flats: B, E, A and D.", "I can write both scales and both key signatures."] },
    explain: [
      { text: "Grade 3 takes key signatures up to four sharps or four flats. Two new major keys arrive: E major, with four sharps, and A flat major, with four flats." },
      { music: stave("treble", nms(E_MAJ), "The scale of E major in the treble clef with its key signature of four sharps: E, F sharp, G sharp, A, B, C sharp, D sharp, E.", { key: "E major", showKeySignature: true }), caption: "E major: four sharps (F♯ C♯ G♯ D♯), the new one being D♯." },
      { music: stave("treble", nms(AB_MAJ), "The scale of A flat major in the treble clef with its key signature of four flats: A flat, B flat, C, D flat, E flat, F, G, A flat.", { key: "Ab major", showKeySignature: true }), caption: "A♭ major: four flats (B♭ E♭ A♭ D♭), the new one being D♭." },
      { text: "Sharps are added in the order F, C, G, D, A, E, B. Flats are added in the order B, E, A, D, G, C, F. Four sharps use the first four letters of the sharp order, and four flats use the first four of the flat order." },
      { text: "Two quick checks. In a sharp key, the key note is a semitone above the last sharp: the last sharp of E major is D sharp, and E is a semitone above it. In a flat key with two or more flats, the key is named by the second-last flat: in A flat major the flats are B, E, A, D, and the second-last is A." },
      { text: "Written without a key signature, a scale needs its accidentals beside the notes. E major has sharps on F, G, C and D. A flat major has flats on B, E, A and D. Coming down, the same accidentals are used." },
      { tip: "E major: F♯ C♯ G♯ D♯. A♭ major: B♭ E♭ A♭ D♭. The major scale pattern is tone, tone, semitone, tone, tone, tone, semitone." },
    ],
    demo: { widget: "staff-and-keyboard", music: stave("treble", nms(AB_MAJ), "A flat major scale: A flat, B flat, C, D flat, E flat, F, G, A flat.", { key: "Ab major", showKeySignature: true }), steps: ["Start on A flat. The key signature gives B flat, E flat, A flat and D flat.", "Every letter appears once: A, B, C, D, E, F, G, then A again.", "Check the pattern: tone, tone, semitone, tone, tone, tone, semitone."], text: "A flat major scale with its four-flat key signature." },
    guided: [
      { t: "t.g3.key-facts", correct: "Yes: you counted the sharps or flats." },
      { t: "t.g3.key-signature", correct: "You wrote the key signature in the right order." },
      { t: "t.g3.scale-gap", correct: "Yes: that note keeps the pattern." },
    ],
    independent: [
      { t: "t.g3.scale-build-major", correct: "Correct scale." },
      { t: "t.g3.key-signature", correct: "Correct key signature." },
      { t: "t.g3.key-facts", correct: "Correct." },
      { t: "t.g3.scale-build-major", correct: "Correct." },
      { t: "t.g3.scale-gap", correct: "Correct." },
      { t: "t.g3.key-signature", correct: "Correct." },
    ],
    recap: ["E major has four sharps (F, C, G, D).", "A flat major has four flats (B, E, A, D).", "In a sharp key the key note is a semitone above the last sharp."],
    review: [{ t: "t.g3.scale-build-major", afterDays: 1 }, { t: "t.g3.key-signature", afterDays: 3 }, { t: "t.g3.key-facts", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 6 and book sections 8 and 9. The second-last-flat shortcut holds for every flat key with at least two flats.",
  },
  {
    node: "G3-U4-L03",
    version: 1,
    bind: [
      { t: "t.g3.scale-build-minor", c: ["c.scales.minor-sharp-g3"], scope: SC(MIN_SHARP) },
      { t: "t.g3.key-signature", c: ["c.scales.minor-sharp-g3"], scope: { keys: MIN_SHARP, clefs: CL } },
      { t: "t.g3.minor-forms", c: ["c.scales.minor-sharp-g3"], scope: SC(MIN_SHARP) },
      { t: "t.g3.key-facts", c: ["c.scales.minor-sharp-g3"], scope: { keys: MIN_SHARP, clefs: CL, keySignatures: true } },
      { t: "t.g3.scale-gap", c: ["c.scales.minor-sharp-g3"], scope: SC(MIN_SHARP) },
    ],
    objective: { statement: "Learn the minor scales of B, F sharp and C sharp minor, in both forms.", criteria: ["I know B minor has two sharps, F sharp minor three and C sharp minor four.", "I can write the harmonic and melodic forms of each.", "I know the raised notes sometimes need an unusual spelling, such as E sharp or B sharp."] },
    explain: [
      { text: "Three new minor keys have sharps in their key signatures. B minor has two sharps (F♯, C♯), F♯ minor has three (F♯, C♯, G♯) and C♯ minor has four (F♯, C♯, G♯, D♯). Each is the relative minor of a major key you know: D major, A major and E major." },
      { music: stave("treble", nms(B_HAR), "B harmonic minor going up: B, C sharp, D, E, F sharp, G, A sharp, B."), caption: "B harmonic minor: the 7th, A, is raised to A♯." },
      { music: stave("treble", nms(FS_MEL_UP), "F sharp melodic minor going up: F sharp, G sharp, A, B, C sharp, D sharp, E sharp, F sharp."), caption: "F♯ melodic minor going up: D♯ and E♯." },
      { music: stave("treble", nms(FS_MEL_DOWN), "F sharp melodic minor coming down: F sharp, E, D, C sharp, B, A, G sharp, F sharp."), caption: "Coming down: E and D natural, as in the key signature." },
      { music: stave("treble", nms(CS_HAR), "C sharp harmonic minor going up: C sharp, D sharp, E, F sharp, G sharp, A, B sharp, C sharp."), caption: "C♯ harmonic minor: the 7th, B, is raised to B♯." },
      { text: "Notice E sharp and B sharp. In F sharp minor the raised 7th is E, so E becomes E sharp, which sounds the same as F but must be written as E sharp so that every letter name is used once. In C sharp minor the raised 7th is B sharp." },
      { tip: "Keep the letter names in order: the raised 7th of F♯ minor is E♯ and of C♯ minor is B♯, never F or C." },
    ],
    demo: { widget: "staff-and-keyboard", music: stave("treble", nms(CS_HAR), "C sharp harmonic minor scale: C sharp, D sharp, E, F sharp, G sharp, A, B sharp, C sharp."), steps: ["Start on C sharp. The key signature has F sharp, C sharp, G sharp and D sharp.", "Write each letter in order: C♯, D♯, E, F♯, G♯, A, B.", "Raise the 7th, B, by a semitone: it is B sharp. Then finish on C sharp."], text: "C sharp harmonic minor: with B sharp as the raised 7th." },
    guided: [
      { t: "t.g3.key-facts", correct: "Yes: you knew the key signature." },
      { t: "t.g3.scale-gap", correct: "Yes: you used the form of the scale." },
      { t: "t.g3.scale-build-minor", correct: "Right: the raised note has the right letter name." },
    ],
    independent: [
      { t: "t.g3.scale-build-minor", correct: "Correct scale." },
      { t: "t.g3.key-signature", correct: "Correct key signature." },
      { t: "t.g3.minor-forms", correct: "Correct." },
      { t: "t.g3.scale-build-minor", correct: "Correct." },
      { t: "t.g3.scale-gap", correct: "Correct." },
      { t: "t.g3.key-facts", correct: "Correct." },
    ],
    recap: ["B minor: 2 sharps. F♯ minor: 3 sharps. C♯ minor: 4 sharps.", "Their relative majors are D, A and E major.", "Raised notes keep their letter name: E♯ and B♯ appear."],
    review: [{ t: "t.g3.scale-build-minor", afterDays: 1 }, { t: "t.g3.key-signature", afterDays: 3 }, { t: "t.g3.scale-gap", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcomes 7 and 8 and book sections 9 and 10. The spelling of E sharp and B sharp is deliberate and checked by the scale grader.",
  },
  {
    node: "G3-U4-L04",
    version: 1,
    bind: [
      { t: "t.g3.scale-build-minor", c: ["c.scales.minor-flat-g3"], scope: SC(MIN_FLAT) },
      { t: "t.g3.key-signature", c: ["c.scales.minor-flat-g3"], scope: { keys: MIN_FLAT, clefs: CL } },
      { t: "t.g3.minor-forms", c: ["c.scales.minor-flat-g3"], scope: SC(MIN_FLAT) },
      { t: "t.g3.key-facts", c: ["c.scales.minor-flat-g3"], scope: { keys: MIN_FLAT, clefs: CL, keySignatures: true } },
      { t: "t.g3.scale-gap", c: ["c.scales.minor-flat-g3"], scope: SC(MIN_FLAT) },
    ],
    objective: { statement: "Learn the minor scales of G, C and F minor, in both forms.", criteria: ["I know G minor has two flats, C minor three and F minor four.", "I can write the harmonic and melodic forms of each.", "I know the raised notes sometimes need a natural sign."] },
    explain: [
      { text: "Three new minor keys have flats in their key signatures. G minor has two (B♭, E♭), C minor has three (B♭, E♭, A♭) and F minor has four (B♭, E♭, A♭, D♭). They are the relative minors of B♭ major, E♭ major and A♭ major." },
      { music: stave("treble", nms(G_HAR), "G harmonic minor going up: G, A, B flat, C, D, E flat, F sharp, G."), caption: "G harmonic minor: the 7th, F, is raised to F♯." },
      { music: stave("treble", nms(C_MEL_UP), "C melodic minor going up: C, D, E flat, F, G, A, B, C, with A and B natural."), caption: "C melodic minor going up: A♭ and B♭ are raised, to A and B natural." },
      { music: stave("treble", nms(C_MEL_DOWN), "C melodic minor coming down: C, B flat, A flat, G, F, E flat, D, C."), caption: "Coming down: B♭ and A♭, as in the key signature." },
      { music: stave("treble", nms(F_HAR), "F harmonic minor going up: F, G, A flat, B flat, C, D flat, E, F."), caption: "F harmonic minor: the 7th, E♭, is raised to E natural." },
      { text: "In a flat key, raising a note often means cancelling a flat: the raised 7th of C minor is B natural, and the raised 7th of F minor is E natural. When the scale is written with its key signature, that raised note needs a natural sign." },
      { tip: "Raise a flat note by cancelling the flat. Raise a natural note by adding a sharp." },
    ],
    demo: { widget: "staff-and-keyboard", music: stave("treble", nms(C_MEL_UP), "C melodic minor scale going up: C, D, E flat, F, G, A, B, C."), steps: ["Start with C minor: C, D, E flat, F, G, A flat, B flat.", "Going up, raise the 6th and 7th: A flat becomes A, and B flat becomes B.", "Coming down, bring the flats back: B flat and A flat."], text: "C melodic minor going up: with A natural and B natural." },
    guided: [
      { t: "t.g3.key-facts", correct: "Yes: you counted the flats." },
      { t: "t.g3.scale-gap", correct: "Yes: you used the form of the scale." },
      { t: "t.g3.scale-build-minor", correct: "Right: raised notes cancel the flats." },
    ],
    independent: [
      { t: "t.g3.scale-build-minor", correct: "Correct scale." },
      { t: "t.g3.key-signature", correct: "Correct key signature." },
      { t: "t.g3.minor-forms", correct: "Correct." },
      { t: "t.g3.scale-build-minor", correct: "Correct." },
      { t: "t.g3.scale-gap", correct: "Correct." },
      { t: "t.g3.key-facts", correct: "Correct." },
    ],
    recap: ["G minor: 2 flats. C minor: 3 flats. F minor: 4 flats.", "Their relative majors are B♭, E♭ and A♭ major.", "Raising a flat note means cancelling the flat."],
    review: [{ t: "t.g3.scale-build-minor", afterDays: 1 }, { t: "t.g3.key-signature", afterDays: 3 }, { t: "t.g3.scale-gap", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcomes 7 and 8 and book sections 10 and 11.",
  },
  {
    node: "G3-U4-L05",
    version: 1,
    bind: [
      { t: "t.g3.key-signature", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, clefs: CL } },
      { t: "t.g3.tonic-triad", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, clefs: CL, chordDegrees: ["I"], inversions: ["a"], maxLedgerLines: 2 } },
      { t: "t.g3.degree", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, degreeNaming: "number", minorForms: BOTH } },
      { t: "t.g3.key-facts", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, clefs: CL, keySignatures: true } },
      { t: "t.g3.degree-note", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, clefs: CL, minorForms: ["harmonic"], maxLedgerLines: 2 } },
      { t: "t.g3.triad-notes", c: ["c.keys.signatures-g3"], scope: { keys: NEW_KEYS, clefs: CL, maxLedgerLines: 2, chordDegrees: ["I"], inversions: ["a"], minorForms: ["harmonic"] } },
    ],
    objective: { statement: "Use the new keys: write key signatures, tonic triads and name scale degrees.", criteria: ["I can write the key signature of every Grade 3 key.", "I can write the tonic triad: the 1st, 3rd and 5th notes of the scale.", "I can name the degree of a note by number."] },
    explain: [
      { text: "You now know eight new keys: E major, A♭ major, and the minor keys B, F♯, C♯, G, C and F. Here you put them to work in three ways: key signatures, tonic triads and scale degrees." },
      { text: "A key signature lists the sharps or flats of a key, in the usual order, at the start of every stave. Count them for the key, and write them in order from the first." },
      { text: "The tonic triad is three notes built on the key note: the 1st, 3rd and 5th degrees of the scale. In a major key it is a major triad; in a minor key it is minor. The notes use the sharps or flats of the key." },
      { music: chord("treble", ["E4", "G#4", "B4"], "The tonic triad of E major: E, G sharp, B, written as a chord.", { key: "E major", showKeySignature: true }), caption: "E major: E, G♯, B. The G♯ comes from the key signature." },
      { music: chord("treble", ["C4", "Eb4", "G4"], "The tonic triad of C minor: C, E flat, G, written as a chord.", { key: "C minor", showKeySignature: true }), caption: "C minor: C, E♭, G. The E♭ is the lowered 3rd of a minor key." },
      { text: "Degrees are numbers: the key note is degree 1, then 2, 3, up to 7. In a minor key the raised 6th and 7th of the minor forms keep the number of the note they replace. In C♯ minor, B♯ is degree 7 and B natural is also degree 7." },
      { tip: "Tonic triad = degrees 1, 3 and 5. Degree numbers do not change when a note is raised or lowered." },
    ],
    demo: { widget: "staff", music: chord("treble", ["F#4", "A4", "C#5"], "The tonic triad of F sharp minor: F sharp, A, C sharp.", { key: "F# minor", showKeySignature: true }), steps: ["The key note, F sharp, is degree 1.", "Count up: G sharp is 2, A is 3, B is 4, C sharp is 5.", "The triad is degrees 1, 3 and 5: F sharp, A and C sharp."], text: "The tonic triad of F sharp minor: F sharp, A and C sharp." },
    guided: [
      { t: "t.g3.triad-notes", correct: "Yes: degrees 1, 3 and 5." },
      { t: "t.g3.degree-note", correct: "Yes: you counted up from the tonic." },
      { t: "t.g3.key-signature", correct: "You wrote the key signature in order." },
    ],
    independent: [
      { t: "t.g3.tonic-triad", correct: "Correct triad." },
      { t: "t.g3.degree", correct: "Correct degree." },
      { t: "t.g3.key-facts", correct: "Correct." },
      { t: "t.g3.tonic-triad", correct: "Correct." },
      { t: "t.g3.degree", correct: "Correct." },
      { t: "t.g3.triad-notes", correct: "Correct." },
    ],
    recap: ["The key signature lists the key's sharps or flats in order.", "The tonic triad is degrees 1, 3 and 5.", "A degree is named by number; raising a note does not change its number."],
    review: [{ t: "t.g3.key-signature", afterDays: 1 }, { t: "t.g3.tonic-triad", afterDays: 3 }, { t: "t.g3.degree", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcomes 6, 7, 9 and 10. Questions use the eight new keys only, so earlier keys stay in earlier grades' revision.",
  },
];
void ALL_G3;
void MAJ_NEW;
void MIN_SHARP;
