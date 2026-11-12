import type { ExerciseItem } from "@mtp/curriculum";
import { chord, stave, type Spec } from "./lib.ts";

const has = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);

export const U6: Spec[] = [
  {
    node: "G1-U6-L01",
    version: 1,
    objective: { statement: "Recognise and build the tonic triad of C, G, D and F major.", criteria: ["I know a triad is three notes: degrees 1, 3 and 5 of the scale.", "I know the tonic triad is built on degree 1, with the root at the bottom.", "I can write and recognise the tonic triad in the four Grade 1 keys."] },
    explain: [
      { text: "A triad is a chord of three notes, built by taking every other note of the scale: degree 1, degree 3 and degree 5. The tonic triad starts on the tonic, degree 1." },
      { music: chord("treble", ["C4", "E4", "G4"], "A treble stave with the tonic triad of C major: C, E and G sounded together."), caption: "The tonic triad of C major: C (1), E (3) and G (5)." },
      { text: "When the root, the note the triad is named after, is the lowest note, the triad is in root position. In this course all triads are in root position." },
      { music: chord("treble", ["G4", "B4", "D5"], "A treble stave with the tonic triad of G major: G, B and D sounded together."), caption: "The tonic triad of G major: G, B and D. All three are in the key without any change." },
      { music: chord("treble", ["D4", "F#4", "A4"], "A treble stave with the tonic triad of D major: D, F sharp and A."), caption: "The tonic triad of D major: D, F♯ and A. The 3rd, F♯, comes from the major scale, so it needs a sharp." },
      { tip: "Take the scale, then every other note: skip a note, take a note, skip a note, take a note." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", ["C4", "E4", "G4"], "The notes of the C major tonic triad one after the other: C, E and G, each linked to its key."),
      steps: ["Tap C, then E, then G, one at a time. These are degrees 1, 3 and 5.", "On the keyboard, notice they are every other white key: C, skip D, E, skip F, G.", "Played together they make the tonic triad of C major."],
      text: "Notes C, E and G one after another, showing every other note of the C major scale.",
    },
    guided: [
      { t: "t.g1.triad-notes", correct: "Degrees 1, 3 and 5." },
      { t: "t.g1.tonic-triad", correct: "A correct tonic triad." },
    ],
    independent: [
      { t: "t.g1.triad-notes", correct: "Right notes for the triad." },
      { t: "t.g1.tonic-triad", correct: "The triad is built correctly." },
      { t: "t.g1.triad-notes", correct: "Correct." },
      { t: "t.g1.tonic-triad", correct: "A correct triad." },
      { t: "t.g1.triad-notes", correct: "Right." },
      { t: "t.g1.triad-notes", correct: "Correct." },
    ],
    recap: ["A triad has three notes: degrees 1, 3 and 5.", "The tonic triad is built on degree 1.", "In root position the root is the lowest note."],
    review: [{ t: "t.g1.triad-notes", afterDays: 1 }, { t: "t.g1.tonic-triad", afterDays: 3 }, { t: "t.g1.triad-notes", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 14. Only root-position tonic triads are asked, as the syllabus-mapped template scope requires (chordDegrees I, inversion a).",
  },
  {
    node: "G1-U6-L02",
    version: 1,
    objective: { statement: "Name an interval by counting letter names.", criteria: ["I know an interval is the distance between two notes.", "I count both notes when I name an interval by number.", "I can name an interval from a 2nd to an octave above a note."] },
    explain: [
      { text: "An interval is the distance between two notes. At Grade 1 we name it by a number only. To find the number, count the letter names from the lower note to the upper note, counting both of them." },
      { music: stave("treble", [["C4", "C"], ["E4", "E"]], "Two notes in the treble clef, C and E, with the letters in between: C D E."), caption: "C up to E: C, D, E. That counts three letter names, so it is a 3rd." },
      { music: stave("treble", [["C4", "C"], ["G4", "G"]], "Two notes in the treble clef, C and G: C D E F G."), caption: "C up to G: C, D, E, F, G. Five letter names, so it is a 5th." },
      { text: "The same note twice is a unison (1st). Counting up to the next note with the same letter name is an octave, the 8th." },
      { tip: "Always count the lower note as 1. That is the most common slip: counting from the next note instead." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"], "A row of eight notes from C to C, so each can be heard as an interval above the first C."),
      steps: ["Tap the first C, then the second note, D: that is a 2nd (C D).", "Tap C then E: a 3rd (C D E). C then G: a 5th.", "Tap C then the top C: an octave (8th), the same note name an octave higher."],
      text: "A C major scale in the treble clef, used to hear intervals above the first note C.",
    },
    guided: [
      { t: "t.g1.interval-number", correct: "Counted both notes." },
      { t: "t.g1.interval-note", correct: "The note that fits." },
    ],
    independent: [
      { t: "t.g1.interval-number", correct: "The interval is named correctly." },
      { t: "t.g1.interval-note", correct: "Right." },
      { t: "t.g1.interval-number", correct: "Counted correctly." },
      { t: "t.g1.interval-note", correct: "Correct." },
      { t: "t.g1.interval-number", correct: "Right." },
      { t: "t.g1.interval-note", correct: "Counted correctly." },
    ],
    recap: ["An interval is the distance between two notes.", "Count the letter names, including the lower and the upper note.", "At Grade 1 only the number is named, not the quality."],
    review: [{ t: "t.g1.interval-number", afterDays: 1 }, { t: "t.g1.interval-note", afterDays: 3 }, { t: "t.g1.interval-number", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 16. Interval quality (major, minor, perfect) is not introduced until Grade 2.",
  },
  {
    node: "G1-U6-L03",
    version: 1,
    objective: { statement: "Name and write intervals above the tonic in C, G, D and F major.", criteria: ["I know the lower note is always the tonic of the key.", "I can name the interval from the tonic to a note of the scale.", "I can write the note a given number above the tonic."] },
    explain: [
      { text: "In Grade 1 the lower note of an interval is always the tonic of the key. So the interval's number is the same as the degree of the upper note in the scale." },
      { music: stave("treble", [["G4", "G"], ["D5", "D"]], "Two notes: G, the tonic of G major, and D, a 5th above it."), caption: "In G major, D is degree 5, so the interval from G to D is a 5th." },
      { music: stave("treble", [["D4", "D"], ["F#4", "F♯"], ["D5", "D"]], "Three notes in D major: the tonic D, F sharp and the octave D."), caption: "In D major: D to F♯ is a 3rd, and D to the next D is an octave. The F♯ is in the key, so it stays sharp." },
      { text: "The sharps and flats of the key are part of the interval's spelling. A 3rd above D is F sharp in the key of D major." },
      { tip: "To find an interval above the tonic, count up the scale: the tonic is 1, then 2, 3, 4 and so on." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", ["G4", "B4", "D5", "G5"], "Four notes in G major: the tonic G, then a 3rd (B), a 5th (D) and an octave (G) above it."),
      steps: ["Tap G, then B. The interval from G to B is a 3rd.", "Tap G, then D. The interval is a 5th.", "Tap the two Gs. The interval is an octave."],
      text: "The tonic G and the notes a 3rd, a 5th and an octave above it in G major.",
    },
    guided: [
      { t: "t.g1.interval-number", correct: "The interval above the tonic." },
      { t: "t.g1.interval-note", correct: "The right note for the interval." },
    ],
    independent: [
      { t: "t.g1.interval-number", when: has("Give the number"), correct: "Named correctly." },
      { t: "t.g1.interval-note", correct: "The right note." },
      { t: "t.g1.interval-number", when: has("Write a note"), correct: "Written correctly." },
      { t: "t.g1.interval-note", correct: "Right." },
      { t: "t.g1.interval-number", when: has("Give the number"), correct: "Correct." },
      { t: "t.g1.interval-note", correct: "Correct." },
    ],
    recap: ["At Grade 1 intervals start on the tonic.", "The number is the degree of the upper note.", "Sharps or flats of the key belong to the spelling."],
    review: [{ t: "t.g1.interval-number", afterDays: 1 }, { t: "t.g1.interval-note", afterDays: 3 }, { t: "t.g1.interval-number", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 16: intervals above the tonic by number only in C, G, D and F major.",
  },
];
