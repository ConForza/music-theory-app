import { CL, has, melody, nms, stave, type Spec2 } from "./lib3.ts";

const LED = { clefs: CL, maxLedgerLines: 4 };
const TREBLE_UP = ["A5", "C6", "E6", "G6"];
const TREBLE_DOWN = ["C4", "A3", "F3", "D3"];
const BASS_UP = ["C4", "E4", "G4", "B4"];
const BASS_DOWN = ["E2", "C2", "A1", "F1"];
const KEYS_TAUGHT = ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major", "A minor", "E minor", "D minor"];

export const U3: Spec2[] = [
  {
    node: "G3-U3-L01",
    version: 1,
    bind: [
      { t: "t.g3.ledger-read", c: ["c.pitch.ledger-extended"], scope: LED },
      { t: "t.g3.ledger-place", c: ["c.pitch.ledger-extended"], scope: LED },
      { t: "t.g3.ledger-count", c: ["c.pitch.ledger-extended"], scope: LED },
    ],
    objective: { statement: "Name and write notes that need three or four ledger lines.", criteria: ["I know ledger lines continue the pattern of lines and spaces.", "I can count out from the stave to name a note.", "I can write a named note on the right ledger line or space."] },
    explain: [
      { text: "In Grade 2 you met notes on one or two ledger lines. Ledger lines are short extra lines that continue the stave, with the same pattern of line, space, line, space. In Grade 3 you may need three or four of them, above or below the stave." },
      { music: stave("treble", nms([...TREBLE_DOWN].reverse().concat(TREBLE_UP)), "A treble stave with eight notes outside it: below the stave on ledger lines 4, 3, 2 and 1 (D, F, A, C), then above the stave on ledger lines 1 to 4 (A, C, E, G)."), caption: "Treble clef: D, F, A, C below the stave; A, C, E, G above it." },
      { text: "The bass clef works in the same way. Above the bass stave, the first ledger line is middle C. Below it, the notes continue down by thirds." },
      { music: stave("bass", nms([...BASS_DOWN].reverse().concat(BASS_UP)), "A bass stave with eight notes outside it: below the stave on ledger lines 4, 3, 2 and 1 (F, A, C, E), then above the stave on ledger lines 1 to 4 (C, E, G, B)."), caption: "Bass clef: F, A, C, E below the stave; C, E, G, B above it." },
      { text: "To name a note, find the nearest line or space you know and count one letter for each step. Count the ledger lines from the stave outwards, and remember that a note in a space between two ledger lines sits in that space, not on a line. In this course the highest or lowest notes use up to four ledger lines." },
      { tip: "Ledger lines continue the stave: count outwards, one letter for each line and space." },
    ],
    demo: { widget: "staff-and-keyboard", music: stave("treble", nms(["C4", "A3", "F3", "D3"]), "Four notes below the treble stave on ledger lines 1 to 4: C, A, F, D."), steps: ["Start from the bottom line of the treble stave, E, and count down: D is the space below, C the first ledger line.", "Keep counting down one letter at a time: B, A on the second ledger line, G, F on the third.", "E is the space below that, and D sits on the fourth ledger line."], text: "Four notes below the treble stave: C, A, F and D on ledger lines 1 to 4." },
    guided: [
      { t: "t.g3.ledger-count", when: has("How many ledger lines"), correct: "Yes: you counted from the stave outwards." },
      { t: "t.g3.ledger-read", correct: "Right: you counted to the note." },
      { t: "t.g3.ledger-place", correct: "Right: the note is on the ledger line you counted." },
    ],
    independent: [
      { t: "t.g3.ledger-place", correct: "Correct position." },
      { t: "t.g3.ledger-read", correct: "Correct note name." },
      { t: "t.g3.ledger-count", when: has("Name this note"), correct: "Correct." },
      { t: "t.g3.ledger-place", correct: "Correct." },
      { t: "t.g3.ledger-read", correct: "Correct." },
      { t: "t.g3.ledger-count", when: has("How many ledger lines"), correct: "Correct count." },
    ],
    recap: ["Ledger lines continue the stave: line, space, line, space.", "Count outwards from the stave to name or write a note.", "Grade 3 uses up to four ledger lines above or below the stave."],
    review: [{ t: "t.g3.ledger-read", afterDays: 1 }, { t: "t.g3.ledger-place", afterDays: 3 }, { t: "t.g3.ledger-count", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 4 and book section 6. OPEN_QUESTIONS Q6 (ledger-line limit): provisionally four, as in the template scope; an added introduction row in scope-concepts.json lets the scope reach four. Every question needs at least three ledger lines for its note, so it cannot be answered within the stave.",
  },
  {
    node: "G3-U3-L02",
    version: 1,
    bind: [
      { t: "t.g3.octave-sign", c: ["c.pitch.octave-signs"], scope: LED },
      { t: "t.g3.octave-sound", c: ["c.pitch.octave-signs"], scope: LED },
    ],
    objective: { statement: "Understand the octave signs 8va and 8vb, and say which note sounds.", criteria: ["I know 8va above the notes means play an octave higher.", "I know 8vb below the notes means play an octave lower.", "I can write the note that actually sounds, in the right octave."] },
    explain: [
      { text: "Very high or very low notes need many ledger lines, which are hard to read. An octave sign saves them: the notes are written closer to the stave, and a sign says to play them in another octave." },
      { music: stave("treble", ["G5", "A5", "B5", "C6"], "Four notes in the treble clef, marked 8va above the stave: G, A, B, C.", { tempoText: "8va", octaveShift: 1 }), caption: "8va above the notes: play them an octave higher than they are written." },
      { text: "8va stands for ottava, the Italian word for octave. It is written above the stave, and a dotted line shows how far it reaches. The notes keep their letter names. They simply sound one octave higher, so the G written on the stave sounds as the G one octave above it." },
      { music: stave("bass", [["F2", "8vb"], "E2", "D2", "C2"], "Four notes in the bass clef, marked 8vb below the notes: F, E, D, C.", { octaveShift: -1 }), caption: "8vb below the notes: play them an octave lower than they are written." },
      { text: "8vb, sometimes written 8va bassa, goes below the stave and means one octave lower. When the sign ends, the music returns to the written pitch." },
      { text: "To find the sounding note, keep the letter name and move one octave in the direction of the sign: seven steps of line and space, up for 8va and down for 8vb. Notice that the sign changes how the notes are played, not how they are named." },
      { tip: "8va above = an octave higher. 8vb below = an octave lower. Same letter name, one octave away." },
    ],
    demo: { widget: "staff", music: stave("treble", ["C5", "D5", "E5", "F5"], "Four notes in the treble clef, marked 8va above the stave: C, D, E, F.", { tempoText: "8va", octaveShift: 1 }), steps: ["Read the written notes: C, D, E, F.", "The sign 8va above them means play each one an octave higher.", "They sound as the C, D, E and F one octave above the written notes."], text: "Four treble-clef notes marked 8va: they sound an octave higher." },
    guided: [
      { t: "t.g3.octave-sign", when: has("How is it played"), correct: "Yes: you read the direction of the sign." },
      { t: "t.g3.octave-sound", correct: "Right: the same letter an octave away." },
      { t: "t.g3.octave-sign", when: has("Which sounding pitch"), correct: "Yes: the letter stays; the octave moves." },
    ],
    independent: [
      { t: "t.g3.octave-sound", correct: "Correct sounding note." },
      { t: "t.g3.octave-sign", when: has("How is it played"), correct: "Correct." },
      { t: "t.g3.octave-sound", correct: "Correct." },
      { t: "t.g3.octave-sign", when: has("Which sounding pitch"), correct: "Correct." },
      { t: "t.g3.octave-sound", correct: "Correct." },
      { t: "t.g3.octave-sign", when: has("How is it played"), correct: "Correct." },
    ],
    recap: ["8va above the notes: play an octave higher.", "8vb below the notes: play an octave lower.", "The sounding note has the same letter name, one octave away."],
    review: [{ t: "t.g3.octave-sign", afterDays: 1 }, { t: "t.g3.octave-sound", afterDays: 3 }, { t: "t.g3.octave-sign", afterDays: 7 }],
    notes: "Original wording. Book section 6 (the second half) and the Grade 1 term 8va. The course prints the sign as text (above the first bar for 8va, under the first note for 8vb) instead of an engraved dashed bracket: a known rendering limitation (see the teacher pack). 8vb and 8va bassa are used only as names for the same sign.",
  },
  {
    node: "G3-U3-L03",
    version: 1,
    bind: [
      { t: "t.g3.octave-transpose", c: ["c.transposition.octave-treble-bass"], scope: { clefs: CL, octaveTranspositionClefs: CL, keys: KEYS_TAUGHT, maxLedgerLines: 4 } },
      { t: "t.g3.octave-pick", c: ["c.transposition.octave-treble-bass"], scope: { clefs: CL, octaveTranspositionClefs: CL, maxLedgerLines: 2 } },
    ],
    objective: { statement: "Transpose a melody an octave up or down, into the treble or the bass clef.", criteria: ["I know transposing at the octave moves every note eight steps.", "I know changing the clef is not enough: the note must also move an octave.", "I keep the key signature and write every note in the right place."] },
    explain: [
      { text: "To transpose music is to write it higher or lower, so that it sounds higher or lower. In Grade 3 you transpose at the octave, and you may also change from the treble clef to the bass clef, or the other way round." },
      { text: "Take middle C. In the treble clef it is on the first ledger line below the stave. The same pitch in the bass clef is on the first ledger line above the stave, as in the picture below." },
      { music: stave("bass", [["C4", "C"]], "Middle C in the bass clef, on the first ledger line above the stave."), caption: "The same pitch as the treble clef's middle C: this is NOT an octave lower." },
      { music: stave("bass", [["C3", "C"]], "The C an octave below middle C, in the bass clef, in the second space."), caption: "An octave lower, in the bass clef: the second space." },
      { text: "The last picture is the answer to “write this note an octave lower in the bass clef”. Two things have changed: the clef, and the octave. Writing the same pitch in the new clef would only change the picture, not the sound." },
      { text: "To transpose a melody: choose the new clef and the direction. Move every note by one octave, which is eight letter names, seven lines and spaces. Keep the key signature, and write any accidentals the notes need. Then check the first and last notes." },
      { music: melody("treble", [[["G4", "crotchet"], ["A4", "crotchet"], ["B4", "crotchet"], ["D5", "crotchet"]], [["B4", "minim"], ["G4", "minim"]]], "4/4", "G major", "A two-bar melody in G major in the treble clef: G, A, B, D; then B and G."), caption: "A melody in the treble clef, in G major." },
      { music: melody("bass", [[["G3", "crotchet"], ["A3", "crotchet"], ["B3", "crotchet"], ["D4", "crotchet"]], [["B3", "minim"], ["G3", "minim"]]], "4/4", "G major", "The same melody an octave lower, written in the bass clef, key signature of one sharp."), caption: "An octave lower in the bass clef. Same key signature, every note an octave down." },
      { tip: "Octave transposition = new clef AND one octave up or down. Same pitch in a new clef is not a transposition." },
    ],
    demo: { widget: "staff", music: stave("bass", [["C3", "C"], ["D3", "D"], ["E3", "E"]], "Three notes in the bass clef, C, D and E, an octave below the same notes in the treble clef starting at middle C."), steps: ["Find the first treble-clef note, middle C, on the first ledger line below the stave.", "Move it down one octave: the C in the second space of the bass clef.", "Move the other notes the same way, keeping the key signature."], text: "C, D and E in the bass clef, an octave lower than the treble-clef notes starting at middle C." },
    guided: [
      { t: "t.g3.octave-pick", correct: "Yes: new clef and the octave move." },
      { t: "t.g3.octave-transpose", correct: "Right: every note moved an octave, and the key signature stayed." },
      { t: "t.g3.octave-pick", correct: "Correct position." },
    ],
    independent: [
      { t: "t.g3.octave-transpose", correct: "Correct transposition." },
      { t: "t.g3.octave-pick", correct: "Correct." },
      { t: "t.g3.octave-transpose", correct: "Correct." },
      { t: "t.g3.octave-pick", correct: "Correct." },
      { t: "t.g3.octave-transpose", correct: "Correct." },
      { t: "t.g3.octave-pick", correct: "Correct." },
    ],
    recap: ["Transposing at the octave moves every note up or down eight letter names.", "Changing the clef alone does not transpose: the pitch must move too.", "Keep the key signature and write accidentals as needed."],
    review: [{ t: "t.g3.octave-transpose", afterDays: 1 }, { t: "t.g3.octave-pick", afterDays: 3 }, { t: "t.g3.octave-transpose", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 5 and book section 7. A transposition that only changes the clef is never credited (the same-pitch position is always offered as a wrong option in the position questions, and the grader checks the octave).",
  },
];
