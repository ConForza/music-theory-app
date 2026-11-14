import { CL4, KEYS_OLD, bars, has, st, type Spec2 } from "./lib5.ts";

const tenor = { clefs: ["tenor"], maxLedgerLines: 2, accidentals: true, doubleAccidentals: false };
const four = { keys: KEYS_OLD, clefs: CL4, maxLedgerLines: 1, accidentals: true, keySignatures: true, doubleAccidentals: false };
const oct = { keys: KEYS_OLD, clefs: CL4, octaveTranspositionClefs: CL4, maxLedgerLines: 2, accidentals: true, keySignatures: true };
const mel = ["G3", "A3", "B3", "C4"];

export const U2: Spec2[] = [
  {
    node: "G5-U2-L01",
    version: 1,
    bind: [
      { t: "t.g5.tenor-read", c: ["c.clefs.tenor"], scope: tenor },
      { t: "t.g5.tenor-write", c: ["c.clefs.tenor"], scope: tenor },
      { t: "t.g5.tenor-facts", c: ["c.clefs.tenor"], scope: { clefs: CL4 } },
    ],
    objective: { statement: "Read and write notes in the tenor clef, whose middle C is on the fourth line.", criteria: ["I know the tenor clef is a C clef centred on the fourth line.", "I can find middle C and name notes around it.", "I do not mix up the tenor clef and the alto clef."] },
    explain: [
      { text: "The tenor clef is another C clef, like the alto clef you already know. A C clef is drawn so that the middle of the sign marks middle C. The only difference between the two is where the sign is centred: the alto clef is centred on the middle (third) line, and the tenor clef is centred on the fourth line from the bottom. So in the tenor clef, middle C is on the fourth line." },
      { music: st("tenor", ["C4"], "A tenor-clef stave with one semibreve, middle C, on the fourth line from the bottom."), caption: "Tenor clef: middle C is on the fourth line." },
      { text: "From middle C you can count to any other note, one letter for each line and space. The line below is A, the space above is D, the top line is E. The bottom line of the tenor clef is D, a seventh below middle C; the lines are D, F, A, C and E, from the bottom up." },
      { music: st("tenor", ["D3", "F3", "A3", "C4", "E4"], "A tenor-clef stave with five semibreves on the five lines: D, F, A, C, E."), caption: "The five lines of the tenor clef, from the bottom: D F A C E." },
      { text: "The treble clef covers the highest notes, the alto clef lower ones, the tenor clef lower still, and the bass clef the lowest of all. The tenor clef is used by cellos, bassoons and tenor trombones for their higher notes; it is no longer used for singers. Because the alto and tenor clefs look so alike, always check which one is printed before you name a note." },
      { tip: "Alto: middle C on the middle line. Tenor: middle C on the fourth line, one line higher. Find middle C first, then count." },
    ],
    demo: { widget: "staff", music: st("tenor", ["E4"], "A tenor-clef stave with one semibreve on the top line."), steps: ["Find middle C: the fourth line.", "The top line is the next line up: E.", "The note is E."], text: "A note on the top line of the tenor clef is E." },
    guided: [
      { t: "t.g5.tenor-facts", when: has("which line"), correct: "Yes: the fourth line." },
      { t: "t.g5.tenor-read", correct: "Right: counted from middle C." },
      { t: "t.g5.tenor-write", correct: "Right: placed in the tenor clef." },
    ],
    independent: [
      { t: "t.g5.tenor-read", correct: "Correct note." },
      { t: "t.g5.tenor-write", correct: "Correct position." },
      { t: "t.g5.tenor-read", correct: "Correct." },
      { t: "t.g5.tenor-facts", when: has("C clefs"), correct: "Correct." },
      { t: "t.g5.tenor-write", correct: "Correct." },
      { t: "t.g5.tenor-facts", when: has("instruments"), correct: "Correct." },
    ],
    recap: ["The tenor clef is a C clef centred on the fourth line: middle C is there.", "The lines are D F A C E, from the bottom.", "Always check whether the clef is alto or tenor before you name a note."],
    review: [{ t: "t.g5.tenor-read", afterDays: 1 }, { t: "t.g5.tenor-write", afterDays: 3 }, { t: "t.g5.tenor-facts", afterDays: 7 }],
    notes: "Original wording. First Steps Grade 5 section 3 (pp. 107-109, read in the PDF): tenor clef centred on the fourth line; the order of the four ranges; used by cellos, bassoons and tenor trombones, no longer by singers.",
  },
  {
    node: "G5-U2-L02",
    version: 1,
    bind: [
      { t: "t.g5.four-clef-read", c: ["c.clefs.four-clefs"], scope: four },
      { t: "t.g5.same-pitch", c: ["c.clefs.four-clefs"], scope: { keys: KEYS_OLD, clefs: CL4, maxLedgerLines: 2, accidentals: true, keySignatures: true } },
      { t: "t.g5.key-signature", c: ["c.clefs.four-clefs"], scope: { keys: KEYS_OLD, clefs: CL4 } },
    ],
    objective: { statement: "Read and write melodies and key signatures in the treble, alto, tenor and bass clefs.", criteria: ["I can write the same sounding note in a different clef.", "I place key signatures in the right order in every clef.", "I do not copy stave positions when I change clef."] },
    explain: [
      { text: "Here is the same four-note phrase, at exactly the same pitch, in the alto, tenor and bass clefs. The notes sound alike, but they sit at different heights on the stave, because each clef gives the lines and spaces different names. To change clef without changing the sound, name each note first and then write the same name in the new clef." },
      { music: bars("alto", [mel], "4/4", "A four-note phrase in the alto clef: G, A, B, C."), caption: "Alto clef: G A B C." },
      { music: bars("tenor", [mel], "4/4", "The same phrase in the tenor clef: G, A, B, C."), caption: "Tenor clef: the same pitches, written higher on the stave." },
      { music: bars("bass", [mel], "4/4", "The same phrase in the bass clef: G, A, B, C."), caption: "Bass clef: the same pitches again." },
      { text: "Key signatures are written in the same order in every clef (F, C, G, D, A, E, B for sharps; B, E, A, D, G, C, F for flats), but the sharps and flats sit at different heights because the clefs differ. A key signature is read the same way in every clef: count the signs, then name the key." },
      { tip: "To write the same sound in another clef: name the note, find its letter in the new clef, check the octave. Never copy the positions." },
    ],
    demo: { widget: "staff", music: st("alto", ["F4", "G4"], "An alto-clef stave in G major with F sharp and G.", { key: "G major", showKeySignature: true }), steps: ["The key signature is one sharp: F sharp.", "In the alto clef the sharp is on the fourth line... the key is G major.", "Name the notes using the signature."], text: "An alto-clef stave in G major." },
    guided: [
      { t: "t.g5.four-clef-read", correct: "Yes: clef first, then the key signature." },
      { t: "t.g5.same-pitch", correct: "Right: named, then written in the new clef." },
      { t: "t.g5.key-signature", correct: "Right: the signs in order." },
    ],
    independent: [
      { t: "t.g5.four-clef-read", correct: "Correct note." },
      { t: "t.g5.same-pitch", correct: "Correct: the same pitch." },
      { t: "t.g5.key-signature", correct: "Correct signature." },
      { t: "t.g5.four-clef-read", correct: "Correct." },
      { t: "t.g5.same-pitch", correct: "Correct." },
      { t: "t.g5.four-clef-read", correct: "Correct." },
    ],
    recap: ["Name each note, then write the same name in the new clef.", "Never copy the stave positions into a different clef.", "Key signatures follow the same order of letters in every clef."],
    review: [{ t: "t.g5.four-clef-read", afterDays: 1 }, { t: "t.g5.same-pitch", afterDays: 3 }, { t: "t.g5.key-signature", afterDays: 7 }],
    notes: "Original wording. First Steps Grade 5 section 3 (pp. 107-109): the same melody in alto, tenor and bass clefs at the same pitch. Q13: key signatures in C clefs are asked (alto in Grade 4, alto and tenor in Grade 5) with the clef named in the prompt; layout 'known' rather than 'written' is flagged for a teacher. Questions use at most one ledger line so the clef, not ledger lines, is what is tested.",
  },
  {
    node: "G5-U2-L03",
    version: 1,
    bind: [
      { t: "t.g5.octave-transpose", c: ["c.transposition.octave-any"], scope: oct },
      { t: "t.g5.clef-position", c: ["c.transposition.octave-any"], scope: oct },
    ],
    objective: { statement: "Transpose a melody exactly one octave higher or lower using any of the four clefs, without confusing this with a change of clef at the same pitch.", criteria: ["I can tell a copy at the same pitch from a copy one octave away.", "I do not write a melody at the wrong pitch or in the wrong clef.", "I keep the key signature when I transpose by an octave."] },
    explain: [
      { text: "You may be asked to write a melody an octave higher or lower in another clef. There are three different things a copy can be. It can sound at exactly the SAME pitch (only the clef changed). It can be EXACTLY ONE OCTAVE higher or lower. Or it can be wrong: the note positions on the stave have simply been copied into a different clef, so every note has changed to a different, unrelated pitch." },
      { text: "Two mistakes are very common. One is to use the wrong C clef: the alto instead of the tenor, or the other way round. The other is to write the melody at the wrong pitch: usually at the same pitch when an octave was asked, sometimes two octaves away. Read the question twice: which clef is wanted, and which way?" },
      { music: bars("tenor", [["C4", "D4", "E4", "F4"]], "4/4", "A four-note phrase in the tenor clef: C, D, E, F."), caption: "A phrase in the tenor clef starting on middle C." },
      { music: bars("treble", [["C5", "D5", "E5", "F5"]], "4/4", "The same phrase one octave higher, in the treble clef: C, D, E, F."), caption: "One octave higher, in the treble clef: C D E F an octave above middle C." },
      { text: "To transpose by an octave: move each note eight letters up or down (the same letter name, the next octave number), then write it in the clef named. The key signature stays the same, because an octave is the same note names." },
      { tip: "Same pitch: same name and octave number. One octave away: same name, octave number one higher or lower. Neither: copied positions." },
    ],
    demo: { widget: "staff", music: bars("alto", [["C4", "D4", "E4", "F4"]], "4/4", "A four-note phrase in the alto clef starting on middle C."), steps: ["Name the first note: middle C (C4).", "One octave lower is C3.", "Write C3 in the clef the question names."], text: "Middle C written in the alto clef; an octave lower is C3." },
    guided: [
      { t: "t.g5.clef-position", correct: "Yes: you compared the real pitches." },
      { t: "t.g5.octave-transpose", correct: "Right: eight letters, in the right clef." },
    ],
    independent: [
      { t: "t.g5.octave-transpose", correct: "Correct octave and clef." },
      { t: "t.g5.clef-position", correct: "Correct." },
      { t: "t.g5.octave-transpose", correct: "Correct." },
      { t: "t.g5.clef-position", correct: "Correct." },
      { t: "t.g5.octave-transpose", correct: "Correct." },
      { t: "t.g5.clef-position", correct: "Correct." },
    ],
    recap: ["A copy can be the same pitch, one octave away, or wrongly copied by position.", "An octave: the same letter names, the octave number one more or one less.", "Check which clef the question names."],
    review: [{ t: "t.g5.octave-transpose", afterDays: 1 }, { t: "t.g5.clef-position", afterDays: 3 }, { t: "t.g5.octave-transpose", afterDays: 7 }],
    notes: "Original wording. First Steps Grade 5 section 3 (pp. 108-109): transposing an octave using a different clef; two common mistakes (the wrong C clef; the wrong pitch). The three relations (same pitch, one octave, positions only) are computed from the real pitches. The tenor clef is always one of the two clefs of an octave-transposition question.",
  },
];
void KEYS_OLD;
