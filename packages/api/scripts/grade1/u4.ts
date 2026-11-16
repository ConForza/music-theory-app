import type { ExerciseItem } from "@mtp/curriculum";
import { bars, keys, stave, type Spec } from "./lib.ts";

const has = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);
const starts = (s: string) => (i: ExerciseItem) => i.prompt.startsWith(s);

export const U4: Spec[] = [
  {
    node: "G1-U4-L01",
    version: 1,
    objective: { statement: "Name the black keys with sharps and flats, and say what a natural sign does.", criteria: ["I know a sharp raises a note by a semitone and a flat lowers it.", "I can name a black key as a sharp or as a flat.", "I know a natural sign cancels a sharp or a flat."] },
    explain: [
      { text: "The black keys sit between the white keys. We name them by saying how they differ from a white key next door." },
      { music: keys([["C4", "C"], ["C#4", "C♯"]], "A piano keyboard with C and the black key just to its right highlighted: C sharp."), caption: "A sharp (♯) raises a note by a semitone, to the very next key on the right. The black key just right of C is C sharp." },
      { music: keys([["D4", "D"], ["Db4", "D♭"]], "A piano keyboard with D and the black key just to its left highlighted: D flat."), caption: "A flat (♭) lowers a note by a semitone, to the very next key on the left. The black key just left of D is D flat." },
      { text: "That means one black key has two names. C sharp and D flat are the same key, with the same sound. We choose the name that fits the music." },
      { text: "A natural sign (♮) takes away a sharp or a flat. The note goes back to the plain white-key note." },
      { tip: "Sharp points up, flat points down. Sharp = right, flat = left, on the keyboard." },
    ],
    demo: {
      widget: "keyboard",
      music: keys([["C4", "C"], ["C#4", "C♯"], ["D4", "D"], ["D#4", "D♯"], ["E4", "E"]], "Keys from C to E: C, C sharp, D, D sharp and E, with the black keys named."),
      steps: ["Tap C, then the black key to its right. Hear how it is one semitone higher: that is C sharp.", "Tap D, then the black key to its left: D flat. It is the same key you tapped as C sharp.", "Tap D sharp (black, right of D), then E. Notice there is no black key between E and F.", "A key one step away, black or white, is a semitone."],
      text: "Keys C, C sharp, D, D sharp and E on a keyboard, showing a black key with a sharp name to the right of its white key.",
    },
    guided: [
      { t: "t.g1.accidental-facts", when: has("What does a"), correct: "Yes: sharps raise, flats lower." },
      { t: "t.g1.accidental-facts", when: has("using a sharp"), correct: "A sharp is the black key to the right." },
    ],
    independent: [
      { t: "t.g1.accidental-facts", when: has("using a flat"), correct: "A flat is the black key to the left." },
      { t: "t.g1.keyboard", when: (i) => /[♯♭]/.test(i.prompt), correct: "That black key is found." },
      { t: "t.g1.accidental-facts", when: starts("Which sign"), correct: "That is the sign for the job." },
      { t: "t.g1.keyboard", when: (i) => /[♯♭]/.test(i.prompt), correct: "Found it: a black key has two names." },
      { t: "t.g1.accidental-facts", when: has("using a sharp"), correct: "Named correctly with a sharp." },
      { t: "t.g1.accidental-facts", when: has("using a flat"), correct: "Named correctly with a flat." },
    ],
    recap: ["A sharp raises a note by a semitone; a flat lowers it.", "Each black key has a sharp name and a flat name.", "A natural sign cancels a sharp or flat."],
    review: [{ t: "t.g1.accidental-facts", afterDays: 1 }, { t: "t.g1.keyboard", afterDays: 3 }, { t: "t.g1.accidental-facts", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 10. Black keys are taught as sharp/flat pairs; only the five black keys of the octave are used.",
  },
  {
    node: "G1-U4-L02",
    version: 1,
    objective: { statement: "Read and write sharps and flats on the stave.", criteria: ["I know the sign goes directly in front of the note, on the same line or space.", "I can name a note that has a sharp or flat in front of it.", "I can write a sharp or flat note in the treble and bass clefs."] },
    explain: [
      { text: "On the stave, a sharp, flat or natural sign is written directly in front of the note it changes. It sits on the same line or space as the note." },
      { music: stave("treble", [["F4", "F"], ["F#4", "F♯"], ["B4", "B"], ["Bb4", "B♭"]], "A treble stave with F, F sharp, B and B flat. The sharp and flat signs are written in front of their notes."), caption: "F, then F sharp, then B, then B flat. The sign comes before the note." },
      { text: "To read the note, first read the line or space as usual. Then say whether the sign makes it sharp or flat." },
      { text: "To write one, draw the sign first, then the notehead right beside it on the correct line or space." },
      { tip: "A good habit: say the name aloud with its sign: 'F sharp', 'B flat'." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", [["F4", "F"], ["F#4", "F♯"], ["G4", "G"], ["Ab4", "A♭"], ["A4", "A"]], "Five treble-clef notes: F, F sharp, G, A flat and A, each linked to its key."),
      steps: ["Tap F, then F sharp. The sign tells you to move to the black key on the right.", "Tap G, then A flat: the flat tells you to move to the black key on the left of A.", "Notice F sharp and A flat are black keys, and G and A are white."],
      text: "Treble-clef notes F, F sharp, G, A flat and A, each tied to its keyboard key. Sound is optional.",
    },
    guided: [
      { t: "t.g1.accidental-read", correct: "Read the note and applied its sign." },
      { t: "t.g1.accidental-write", correct: "Written with the sign in front." },
    ],
    independent: [
      { t: "t.g1.accidental-read", correct: "Right: letter and sign." },
      { t: "t.g1.accidental-write", correct: "Written on the right line or space with its sign." },
      { t: "t.g1.accidental-read", correct: "Correct." },
      { t: "t.g1.accidental-write", correct: "Well written." },
      { t: "t.g1.accidental-read", correct: "Read correctly." },
      { t: "t.g1.accidental-write", correct: "Correct sign and note." },
    ],
    recap: ["The sign goes directly in front of the note, on the same line or space.", "Read the note first, then apply the sign.", "Write the sign first, then the note."],
    review: [{ t: "t.g1.accidental-read", afterDays: 1 }, { t: "t.g1.accidental-write", afterDays: 3 }, { t: "t.g1.accidental-read", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 10. E sharp, B sharp, C flat and F flat are avoided in generated questions as beyond the beginner's need.",
  },
  {
    node: "G1-U4-L03",
    version: 1,
    objective: { statement: "Know how long a sharp or flat lasts within a bar.", criteria: ["I know an accidental lasts to the end of the bar.", "I know it applies only on its own line or space.", "I know the next bar starts afresh."] },
    explain: [
      { text: "An accidental changes the note it is written in front of, and it keeps working for any later note on the same line or space in the same bar." },
      { music: bars("treble", [["F#4", "G4", "F4", "A4"]], "4/4", "A bar of 4/4 with F sharp, G, F and A. The second F has no sign but is still F sharp."), caption: "The F sharp in beat 3 has no sign of its own, but it is still sharp: the first sharp lasts to the end of the bar." },
      { text: "The accidental stops at the bar-line. In the next bar the same note goes back to normal, unless a new sign is written." },
      { music: bars("treble", [["F#4", "G4", "A4", "B4"], ["F4", "G4", "A4", "B4"]], "4/4", "Two bars of 4/4. The F in bar 1 has a sharp. The F in bar 2 has no sign and is a plain F."), caption: "Bar 1 has an F sharp. In bar 2 the F is plain F again." },
      { text: "The accidental belongs to one line or space only. A sharp on this F does not affect an F in a different octave." },
      { tip: "Ask two questions: 'Is it the same line or space?' and 'Am I still in the same bar?' If both are yes, the accidental still applies." },
    ],
    demo: {
      widget: "staff",
      music: bars("treble", [["F#4", "G4", "F4", "A4"], ["F4", "G4", "F4", "A4"]], "4/4", "Two bars of 4/4. Bar 1: F sharp, G, F, A. Bar 2: F, G, F, A."),
      steps: ["Tap the first F sharp, then the second F in bar 1. They sound the same: both are F sharp.", "Now tap the F in bar 2. It is lower: the sharp has stopped at the bar-line.", "Compare the two F notes in bar 2: no sign, so both are plain F."],
      text: "Two bars; in bar 1 an F sharp is followed by another F that is also sharp, and in bar 2 the F is plain.",
    },
    guided: [
      { t: "t.g1.accidental-count", correct: "An accidental lasts to the end of the bar." },
      { t: "t.g1.accidental-state", correct: "You applied the bar rule." },
    ],
    independent: [
      { t: "t.g1.accidental-state", correct: "Right: sign applied, bar-line respected." },
      { t: "t.g1.accidental-count", correct: "Counted correctly." },
      { t: "t.g1.accidental-state", correct: "Correct." },
      { t: "t.g1.accidental-count", correct: "Right." },
      { t: "t.g1.accidental-state", correct: "Applied the bar rule correctly." },
      { t: "t.g1.accidental-count", correct: "Counted correctly across the bar." },
    ],
    recap: ["An accidental lasts to the end of the bar.", "It affects only its own line or space.", "A new bar starts afresh."],
    review: [{ t: "t.g1.accidental-state", afterDays: 1 }, { t: "t.g1.accidental-count", afterDays: 3 }, { t: "t.g1.accidental-state", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 10 (accidentals within a bar). The notes are in C major so that no key signature interferes.",
  },
  {
    node: "G1-U4-L04",
    version: 1,
    objective: { statement: "Cancel a sharp or flat with a natural, and follow an accidental through a tie.", criteria: ["I know a natural sign cancels an accidental for the rest of the bar.", "I know a tied note keeps its accidental across the bar-line.", "I can read a short passage with several accidentals."] },
    explain: [
      { text: "A natural sign (♮) cancels a sharp or flat. Notes after it on that line or space are plain until the end of the bar." },
      { music: bars("treble", [["F#4", "F4", "G4", "F4"]], "4/4", "A bar of 4/4: F sharp, then F with a natural sign, then G, then F. The last F is plain too."), caption: "The natural sign cancels the F sharp. The last F is plain: the natural lasts to the end of the bar." },
      { text: "A tie joins two notes of the same pitch. If the tie crosses a bar-line, the second note keeps the accidental of the first, even though it is in a new bar." },
      { music: bars("treble", [["A4", "B4", "C5", "F#4"], ["F4", "G4", "A4", "B4"]], "4/4", "Two bars of 4/4. Bar 1 ends on an F sharp. Bar 2 starts on an F with no sign. The F in bar 2 is plain."), caption: "Without a tie, the F in bar 2 is plain. With a tie from the F sharp, it would still be F sharp." },
      { tip: "Only the first note after a tie across a bar-line inherits the accidental. After that the new bar starts afresh." },
    ],
    demo: {
      widget: "staff",
      music: bars("treble", [["F#4", "F4", "G4", "F4"]], "4/4", "A bar of 4/4: F sharp, F natural, G, F."),
      steps: ["Tap the F sharp, then the next F. It is lower: the natural has cancelled the sharp.", "Tap the last F. It is plain too, because the natural lasts to the end of the bar.", "A natural sign is how you undo a sharp or flat without starting a new bar."],
      text: "A bar with an F sharp, a natural-cancelled F, a G and a plain F.",
    },
    guided: [
      { t: "t.g1.accidental-count", correct: "The natural cancelled the sharp." },
      { t: "t.g1.accidental-state", correct: "Followed the accidental correctly." },
    ],
    independent: [
      { t: "t.g1.accidental-state", correct: "Right: you tracked the natural." },
      { t: "t.g1.accidental-count", correct: "Counted correctly after the natural." },
      { t: "t.g1.accidental-state", correct: "Correct." },
      { t: "t.g1.accidental-count", correct: "Right." },
      { t: "t.g1.accidental-state", correct: "Followed it correctly." },
      { t: "t.g1.accidental-count", correct: "Counted correctly." },
    ],
    recap: ["A natural sign cancels a sharp or flat.", "The natural lasts to the end of the bar too.", "A tied note keeps its accidental across the bar-line."],
    review: [{ t: "t.g1.accidental-state", afterDays: 1 }, { t: "t.g1.accidental-count", afterDays: 3 }, { t: "t.g1.accidental-state", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 10 (cancellation). Tied notes across bar-lines are taught here in prose and assessed through generated bars where the tie occurs.",
  },
];
