import { CL, MAJ_G1, MAJ_G2, has, melody, nms, stave, stv, chord, type Spec2 } from "./lib2.ts";

const A_MAJ = ["A4", "B4", "C#5", "D5", "E5", "F#5", "G#5", "A5"];
const BB_MAJ = ["Bb4", "C5", "D5", "Eb5", "F5", "G5", "A5", "Bb5"];
const EB_MAJ = ["Eb4", "F4", "G4", "Ab4", "Bb4", "C5", "D5", "Eb5"];
const MAJ_A = [...MAJ_G1, "A major"];
/** Keys whose signature has at least one sign: "write the key signature" needs something to write (C major has none). */
const MAJ_SIGNS = MAJ_G2.filter((k) => k !== "C major");
const sigTune = (key: string, p: string, text: string) => melody("treble", [[[p, "semibreve"]]], "4/4", key, text);

export const U3: Spec2[] = [
  {
    node: "G2-U3-L01",
    version: 1,
    bind: [
      { t: "t.g2.scale-build-major", c: ["c.scales.major-a"], scope: stv(MAJ_A) },
      { t: "t.g2.scale-gap", c: ["c.scales.major-a"], scope: stv(MAJ_A) },
    ],
    objective: { statement: "Write and recognise the scale of A major.", criteria: ["I know the major scale pattern is tone, tone, semitone, tone, tone, tone, semitone.", "I know A major has three sharps: F♯, C♯ and G♯.", "I can write the scale of A major."] },
    explain: [
      { text: "Every major scale has the same pattern of steps, whatever note it starts on: tone, tone, semitone, tone, tone, tone, semitone." },
      { text: "To start the pattern on A, some notes need sharps to keep the steps right. A major needs three of them." },
      { music: stave("treble", nms(A_MAJ), "The scale of A major going up: A, B, C sharp, D, E, F sharp, G sharp, A."), caption: "A major: A B C♯ D E F♯ G♯ A. The sharps are F♯, C♯ and G♯." },
      { text: "Check the pattern: A to B is a tone, B to C♯ is a tone, C♯ to D is a semitone, then tone, tone, tone, and G♯ to A is a semitone." },
      { text: "Each letter name is used once, in order. That is why it is C♯ and not D♭: the third note must be some kind of C." },
      { tip: "A major: three sharps, F♯ C♯ G♯. The two semitones fall between notes 3 and 4, and 7 and 8." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(A_MAJ), "The scale of A major going up with its three sharps."),
      steps: ["Play A and B: a tone. Then B to C♯: another tone.", "C♯ to D is the first semitone. Then D, E and F♯ are tone steps.", "G♯ to A is the second semitone: the scale is finished."],
      text: "The scale of A major in the treble clef: A, B, C sharp, D, E, F sharp, G sharp, A.",
    },
    guided: [
      { t: "t.g2.scale-gap", correct: "Right note: the pattern and the letter names fit." },
      { t: "t.g2.scale-build-major", correct: "You wrote A major." },
      { t: "t.g2.scale-gap", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.scale-build-major", correct: "Correct scale." },
      { t: "t.g2.scale-gap", correct: "Correct note." },
      { t: "t.g2.scale-build-major", correct: "Scale written correctly." },
      { t: "t.g2.scale-gap", correct: "Correct." },
      { t: "t.g2.scale-build-major", correct: "A major written correctly." },
      { t: "t.g2.scale-gap", correct: "Right again." },
    ],
    recap: ["The major pattern is T T S T T T S.", "A major has three sharps: F♯, C♯ and G♯.", "Each letter name is used once, in order."],
    review: [{ t: "t.g2.scale-build-major", afterDays: 1 }, { t: "t.g2.scale-gap", afterDays: 3 }, { t: "t.g2.scale-build-major", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 8. Questions in this lesson are about A major only; Grade 1 keys return in the practice and review nodes.",
  },
  {
    node: "G2-U3-L02",
    version: 1,
    bind: [
      { t: "t.g2.scale-build-major", c: ["c.scales.major-bb-eb"], scope: stv(MAJ_G2) },
      { t: "t.g2.scale-gap", c: ["c.scales.major-bb-eb"], scope: stv(MAJ_G2) },
    ],
    objective: { statement: "Write and recognise the scales of B♭ major and E♭ major.", criteria: ["I know B♭ major has two flats: B♭ and E♭.", "I know E♭ major has three flats: B♭, E♭ and A♭.", "I can write both scales."] },
    explain: [
      { text: "Some major scales use flats instead of sharps. F major (from Grade 1) has one flat. B♭ major has two, and E♭ major has three." },
      { music: stave("treble", nms(BB_MAJ), "The scale of B flat major going up: B flat, C, D, E flat, F, G, A, B flat."), caption: "B♭ major: B♭ C D E♭ F G A B♭. The flats are B♭ and E♭." },
      { music: stave("treble", nms(EB_MAJ), "The scale of E flat major going up: E flat, F, G, A flat, B flat, C, D, E flat."), caption: "E♭ major: E♭ F G A♭ B♭ C D E♭. The flats are B♭, E♭ and A♭." },
      { text: "The pattern is still tone, tone, semitone, tone, tone, tone, semitone. In B♭ major the semitones are D to E♭ and A to B♭." },
      { text: "Again each letter appears once: it is E♭ and not D♯ in the scale of B♭." },
      { tip: "Flat keys so far: F (1 flat), B♭ (2 flats), E♭ (3 flats). Flats are added in the order B, E, A." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(EB_MAJ), "The scale of E flat major going up with three flats."),
      steps: ["Start on E♭. Play E♭, F, G: two tones.", "G to A♭ is the first semitone. Then A♭ to B♭, B♭ to C and C to D are tones.", "D to E♭ is the last semitone."],
      text: "The scale of E flat major in the treble clef: E flat, F, G, A flat, B flat, C, D, E flat.",
    },
    guided: [
      { t: "t.g2.scale-gap", correct: "Right note." },
      { t: "t.g2.scale-build-major", correct: "You wrote the scale." },
      { t: "t.g2.scale-gap", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.scale-build-major", correct: "Correct scale." },
      { t: "t.g2.scale-gap", correct: "Correct note." },
      { t: "t.g2.scale-build-major", correct: "Written correctly." },
      { t: "t.g2.scale-gap", correct: "Correct." },
      { t: "t.g2.scale-build-major", correct: "Correct flat scale." },
      { t: "t.g2.scale-gap", correct: "Right again." },
    ],
    recap: ["B♭ major has two flats: B♭ and E♭.", "E♭ major has three flats: B♭, E♭ and A♭.", "The major pattern is the same in every key."],
    review: [{ t: "t.g2.scale-build-major", afterDays: 1 }, { t: "t.g2.scale-gap", afterDays: 3 }, { t: "t.g2.scale-build-major", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 8. Questions here are about B♭ and E♭ major only.",
  },
  {
    node: "G2-U3-L03",
    version: 1,
    bind: [
      { t: "t.g2.key-signature", c: ["c.keys.signatures-g2-major"], scope: stv(MAJ_SIGNS, { maxLedgerLines: undefined }) },
      { t: "t.g2.key-facts", c: ["c.keys.signatures-g2-major"], scope: stv(MAJ_G2, { maxLedgerLines: undefined }) },
    ],
    objective: { statement: "Write and recognise the key signatures of A, B♭ and E♭ major.", criteria: ["I know sharps are added in the order F C G D A E B.", "I know flats are added in the order B E A D G C F.", "I can write the key signature of A, B♭ and E♭ major."] },
    explain: [
      { text: "A key signature collects a key's sharps or flats at the start of the stave, so they do not need to be written before each note." },
      { music: sigTune("A major", "A4", "A treble stave with a key signature of three sharps: F, C and G."), caption: "Three sharps, F♯ C♯ G♯: the key signature of A major." },
      { music: sigTune("Bb major", "Bb4", "A treble stave with a key signature of two flats: B and E."), caption: "Two flats, B♭ and E♭: the key signature of B♭ major." },
      { music: sigTune("Eb major", "Eb4", "A treble stave with a key signature of three flats: B, E and A."), caption: "Three flats, B♭ E♭ A♭: the key signature of E♭ major." },
      { text: "Sharps are always added in the order F, C, G, D, A, E, B and flats in the order B, E, A, D, G, C, F. A key uses the first few in the list." },
      { tip: "Sharp keys: the key note is a semitone above the last sharp. Flat keys: the key note is the second-last flat (one flat: F major)." },
    ],
    demo: {
      widget: "staff",
      music: sigTune("Eb major", "Eb4", "A treble stave with three flats: B, E and A."),
      steps: ["Start the flat order: B, E, A.", "E♭ major has three flats, so it uses B♭, E♭ and A♭.", "The key note is the second-last flat: the flats are B♭, E♭, A♭, so the key is E♭."],
      text: "A treble stave with the key signature of E flat major: three flats, B, E and A.",
    },
    guided: [
      { t: "t.g2.key-facts", when: has("How many sharps or flats"), correct: "Yes: count the signs for the key." },
      { t: "t.g2.key-signature", correct: "Key signature correct." },
      { t: "t.g2.key-facts", when: has("Which major key has"), correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.key-signature", correct: "Correct." },
      { t: "t.g2.key-facts", when: has("Which sharps or flats"), correct: "Correct signs." },
      { t: "t.g2.key-signature", correct: "Correct." },
      { t: "t.g2.key-facts", when: has("What is the last"), correct: "Right: the last one in the order." },
      { t: "t.g2.key-signature", correct: "Written correctly." },
      { t: "t.g2.key-facts", when: has("Is the key signature"), correct: "Correct." },
    ],
    recap: ["Sharps: F C G D A E B. Flats: B E A D G C F.", "A major: three sharps. B♭ major: two flats. E♭ major: three flats.", "Each sign goes on its own line or space in the key signature."],
    review: [{ t: "t.g2.key-signature", afterDays: 1 }, { t: "t.g2.key-facts", afterDays: 3 }, { t: "t.g2.key-signature", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 8. Grade 1 key signatures (G, D, F) return through the cumulative practice and review nodes.",
  },
  {
    node: "G2-U3-L04",
    version: 1,
    bind: [
      { t: "t.g2.tonic-triad", c: ["c.chords.tonic-triad-g2-major"], scope: stv(MAJ_G2, { chordDegrees: ["I"], inversions: ["a"] }) },
      { t: "t.g2.degree", c: ["c.chords.tonic-triad-g2-major"], scope: { keys: MAJ_G2, degreeNaming: "number" } },
      { t: "t.g2.triad-notes", c: ["c.chords.tonic-triad-g2-major"], scope: stv(MAJ_G2, { chordDegrees: ["I"], inversions: ["a"] }) },
      { t: "t.g2.degree-note", c: ["c.chords.tonic-triad-g2-major"], scope: stv(MAJ_G2) },
    ],
    objective: { statement: "Name the notes of the tonic triad and the degrees of the scale in A, B♭ and E♭ major.", criteria: ["I know a tonic triad is built on degrees 1, 3 and 5.", "I can name the tonic triad of A, B♭ and E♭ major.", "I can say which degree of the scale a note is."] },
    explain: [
      { text: "The notes of a scale are numbered from the key note: the tonic is degree 1, then 2, 3 and so on up to 7." },
      { music: stave("treble", [["A4", "1"], ["B4", "2"], ["C#5", "3"], ["D5", "4"], ["E5", "5"], ["F#5", "6"], ["G#5", "7"]], "The scale of A major with its degrees: 1 is A, 2 is B, 3 is C sharp, 4 is D, 5 is E, 6 is F sharp, 7 is G sharp."), caption: "The degrees of A major. A is degree 1, the tonic." },
      { text: "A tonic triad is a chord of three notes built on the tonic: degrees 1, 3 and 5. In root position the tonic is the lowest note." },
      { music: chord("treble", ["A4", "C#5", "E5"], "The tonic triad of A major: A, C sharp and E sounded together."), caption: "The tonic triad of A major: A, C♯, E (degrees 1, 3 and 5)." },
      { music: chord("treble", ["Bb4", "D5", "F5"], "The tonic triad of B flat major: B flat, D and F sounded together."), caption: "B♭ major: B♭, D, F. For E♭ major the triad is E♭, G, B♭." },
      { tip: "Triad = every other note of the scale: 1, 3, 5. Leave out 2 and 4." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: chord("treble", ["Eb4", "G4", "Bb4"], "The tonic triad of E flat major: E flat, G and B flat sounded together."),
      steps: ["Start on the tonic, E♭: that is degree 1.", "Count up two notes: F, then G. G is degree 3.", "Count on two more: A♭, then B♭. B♭ is degree 5. The triad is E♭, G, B♭."],
      text: "The tonic triad of E flat major in the treble clef: E flat, G and B flat.",
    },
    guided: [
      { t: "t.g2.degree-note", correct: "Correct degree." },
      { t: "t.g2.triad-notes", correct: "You built the triad from degrees 1, 3 and 5." },
      { t: "t.g2.degree", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.tonic-triad", correct: "Correct triad." },
      { t: "t.g2.degree", correct: "Correct degree." },
      { t: "t.g2.triad-notes", correct: "Correct." },
      { t: "t.g2.degree-note", correct: "Correct." },
      { t: "t.g2.tonic-triad", correct: "Triad written correctly." },
      { t: "t.g2.degree", correct: "Correct." },
    ],
    recap: ["Scale degrees are numbered from the tonic.", "The tonic triad is degrees 1, 3 and 5.", "A major: A C♯ E. B♭ major: B♭ D F. E♭ major: E♭ G B♭."],
    review: [{ t: "t.g2.tonic-triad", afterDays: 1 }, { t: "t.g2.degree", afterDays: 3 }, { t: "t.g2.triad-notes", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcomes 10 and 11. Root position only; degrees are given by number, not technical name (a Grade 3 outcome).",
  },
];
void [CL];
