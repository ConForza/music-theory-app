import { CL, MAJ_G2, MIN3, has, nms, stave, stv, type Spec2 } from "./lib2.ts";

const A_NAT = ["A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5"];
const A_HAR = ["A4", "B4", "C5", "D5", "E5", "F5", "G#5", "A5"];
const E_HAR = ["E4", "F#4", "G4", "A4", "B4", "C5", "D#5", "E5"];
const D_HAR = ["D4", "E4", "F4", "G4", "A4", "Bb4", "C#5", "D5"];
const C_MAJ = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const REL_KEYS = [...MAJ_G2, ...MIN3];
/** Keys whose signature has at least one sign: "write the key signature" needs something to write (C major and A minor have none). */
const SIGN_KEYS = REL_KEYS.filter((k) => k !== "C major" && k !== "A minor");

export const U4: Spec2[] = [
  {
    node: "G2-U4-L01",
    version: 1,
    bind: [
      { t: "t.g2.minor-pattern", c: ["c.scales.minor-concept"], scope: stv(MIN3) },
      { t: "t.g2.minor-facts", c: ["c.scales.minor-concept"], scope: stv(MIN3) },
    ],
    objective: { statement: "Hear and see what makes a scale minor: its pattern of tones and semitones.", criteria: ["I know a minor scale has a lower 3rd than a major scale.", "I know the minor pattern is tone, semitone, tone, tone, semitone, tone, tone.", "I can find the tones and semitones in A, E and D minor."] },
    explain: [
      { text: "Major scales sound bright. Minor scales sound darker, more serious. The difference comes from the pattern of steps." },
      { music: stave("treble", nms(A_NAT), "A minor scale starting on A, using only white keys: A, B, C, D, E, F, G, A."), caption: "A minor, with no sharps or flats: A B C D E F G A." },
      { text: "The pattern from the key note is tone, semitone, tone, tone, semitone, tone, tone. The semitones are between notes 2 and 3, and between notes 5 and 6." },
      { text: "Compare it with A major, whose 3rd note is C♯. In A minor the 3rd note is C, a semitone lower. That lower 3rd, three semitones above the key note instead of four, is what makes the scale (and its tonic triad) minor." },
      { text: "This is the basic shape of a minor scale. In a few lessons you will raise one note to make the harmonic minor, which is the form you need in Grade 2." },
      { tip: "Minor = lower 3rd: three semitones above the key note, where a major scale has four." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(A_NAT), "A minor scale on the white keys from A to A."),
      steps: ["Play A and B: a tone. Then B to C: a semitone.", "Play C, D, E: two tones. Then E to F is the second semitone.", "Finish with F to G and G to A: two tones."],
      text: "A minor scale on white keys: A, B, C, D, E, F, G, A.",
    },
    guided: [
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Yes: you spotted the step size." },
      { t: "t.g2.minor-facts", correct: "Yes: the minor triad has the lower 3rd." },
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Correct step." },
      { t: "t.g2.minor-facts", correct: "Correct lowered note." },
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Correct." },
      { t: "t.g2.minor-pattern", when: has("two semitones"), correct: "You placed both semitones." },
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Correct." },
      { t: "t.g2.minor-pattern", when: has("tone or a semitone"), correct: "Correct." },
    ],
    recap: ["A minor scale has a lower 3rd than a major scale.", "Minor pattern: T S T T S T T.", "The semitones fall between notes 2 and 3 and notes 5 and 6."],
    review: [{ t: "t.g2.minor-pattern", afterDays: 1 }, { t: "t.g2.minor-facts", afterDays: 3 }, { t: "t.g2.minor-pattern", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 7. The natural minor pattern is a stepping stone only: it is never asked as a separate scale (the syllabus asks for the harmonic form). A, E and D minor are first met here as tonics (scope-concepts.json adjusted to match).",
  },
  {
    node: "G2-U4-L02",
    version: 1,
    bind: [
      { t: "t.g2.relative-key", c: ["c.keys.relative"], scope: { keys: REL_KEYS } },
      { t: "t.g2.relative-facts", c: ["c.keys.relative"], scope: { keys: REL_KEYS } },
    ],
    objective: { statement: "Understand relative major and minor keys.", criteria: ["I know relative keys share a key signature.", "I know the relative minor starts on the 6th note of the major scale.", "I can name the relative of C, G or F major and of A, E or D minor."] },
    explain: [
      { text: "Every major key has a relative minor. They are called relatives because they use exactly the same notes and the same key signature, but start in different places." },
      { music: stave("treble", nms(C_MAJ), "The scale of C major: C, D, E, F, G, A, B, C."), caption: "C major, starting on C." },
      { music: stave("treble", nms(A_NAT), "The scale of A minor: A, B, C, D, E, F, G, A."), caption: "A minor uses the same white keys, starting on A, the 6th note of C major." },
      { text: "So the relative minor starts on the 6th note of the major scale. C major's relative is A minor; G major's is E minor; F major's is D minor." },
      { text: "Going the other way, the relative major is three semitones above the minor key note. A minor leads to C major, E minor to G major and D minor to F major." },
      { tip: "Same key signature = relative keys. Count to the 6th note of the major scale to find the minor." },
    ],
    demo: {
      widget: "staff",
      music: stave("treble", nms(["G4", "A4", "B4", "C5", "D5", "E5"]), "The first six notes of G major: G, A, B, C, D, E."),
      steps: ["Count the notes of G major: G is 1, A is 2, B is 3, C is 4, D is 5.", "E is the 6th note. So E minor is the relative minor of G major.", "Both keys have the same key signature: one sharp, F♯."],
      text: "The first six notes of G major: G, A, B, C, D, E. The sixth note, E, is the tonic of the relative minor.",
    },
    guided: [
      { t: "t.g2.relative-facts", when: has("starts on which note"), correct: "Yes: the 6th note." },
      { t: "t.g2.relative-key", correct: "You found the relative key." },
      { t: "t.g2.relative-facts", correct: "Correct." },
    ],
    independent: [
      { t: "t.g2.relative-key", correct: "Correct relative." },
      { t: "t.g2.relative-facts", correct: "Correct." },
      { t: "t.g2.relative-key", correct: "Correct." },
      { t: "t.g2.relative-facts", correct: "Correct." },
      { t: "t.g2.relative-key", correct: "Correct." },
      { t: "t.g2.relative-facts", correct: "Correct." },
    ],
    recap: ["Relative keys share a key signature.", "The relative minor starts on the 6th note of the major scale.", "C/A minor, G/E minor, F/D minor are relative pairs."],
    review: [{ t: "t.g2.relative-key", afterDays: 1 }, { t: "t.g2.relative-facts", afterDays: 3 }, { t: "t.g2.relative-key", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 6. Only relative pairs from the Grade 2 key set are asked.",
  },
  {
    node: "G2-U4-L03",
    version: 1,
    bind: [
      { t: "t.g2.scale-build-minor", c: ["c.scales.minor-harmonic"], scope: stv(["A minor"], { minorForms: ["harmonic"] }) },
      { t: "t.g2.scale-gap", c: ["c.scales.minor-harmonic"], scope: stv(["A minor"], { minorForms: ["harmonic"] }) },
      { t: "t.g2.minor-facts", c: ["c.scales.minor-harmonic"], scope: stv(["A minor"], { minorForms: ["harmonic"] }) },
    ],
    objective: { statement: "Build a harmonic minor scale by raising the 7th note.", criteria: ["I know the harmonic minor raises the 7th note by a semitone.", "I know the raised note is written as an accidental, not in the key signature.", "I can write the scale of A harmonic minor."] },
    explain: [
      { text: "The minor scale you have met ends with a whole tone before the key note. Composers often wanted a semitone there, so the 7th note is raised by one semitone. This gives the harmonic minor scale." },
      { music: stave("treble", nms(A_HAR), "The A harmonic minor scale going up: A, B, C, D, E, F, G sharp, A."), caption: "A harmonic minor: A B C D E F G♯ A. The 7th note, G, is raised to G♯." },
      { text: "The raised note is written with an accidental in front of the note, as it is not part of the key signature. It is the same coming down: A G♯ F E D C B A." },
      { text: "Raising G to G♯ makes a big step between F and G♯: three semitones, or a tone and a half. It is the most characteristic sound of the harmonic minor." },
      { tip: "Harmonic minor: raise the 7th note, going up and coming down." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(A_HAR), "The scale of A harmonic minor with G sharp as the 7th note."),
      steps: ["Play A, B, C, D, E, F: the notes are all white keys.", "Instead of G, play the black key just above it: G♯. That is the raised 7th.", "Now play A to finish. Notice the larger step from F up to G♯ and the semitone from G♯ to A."],
      text: "A harmonic minor in the treble clef: A, B, C, D, E, F, G sharp, A.",
    },
    guided: [
      { t: "t.g2.minor-facts", correct: "Yes: only the 7th note changes." },
      { t: "t.g2.scale-gap", correct: "Right note." },
      { t: "t.g2.scale-build-minor", correct: "You wrote A harmonic minor." },
    ],
    independent: [
      { t: "t.g2.scale-build-minor", correct: "Correct scale." },
      { t: "t.g2.minor-facts", correct: "Correct." },
      { t: "t.g2.scale-gap", correct: "Correct note." },
      { t: "t.g2.scale-build-minor", correct: "Correct." },
      { t: "t.g2.minor-facts", correct: "Correct." },
      { t: "t.g2.scale-gap", correct: "Correct." },
    ],
    recap: ["The harmonic minor raises the 7th note by a semitone.", "The raised note is an accidental, not in the key signature.", "It is the same going up and coming down."],
    review: [{ t: "t.g2.scale-build-minor", afterDays: 1 }, { t: "t.g2.minor-facts", afterDays: 3 }, { t: "t.g2.scale-gap", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 7. Melodic minor is deferred to Grade 3 core and is never required here; the optional preview (G2-U4-E1) is the only mention. The augmented 2nd is described as a tone and a half, never asked by name.",
  },
  {
    node: "G2-U4-L04",
    version: 1,
    bind: [
      { t: "t.g2.scale-build-minor", c: ["c.scales.minor-harmonic-g2"], scope: stv(MIN3, { minorForms: ["harmonic"] }) },
      { t: "t.g2.scale-gap", c: ["c.scales.minor-harmonic-g2"], scope: stv(MIN3, { minorForms: ["harmonic"] }) },
      { t: "t.g2.minor-facts", c: ["c.scales.minor-harmonic-g2"], scope: stv(MIN3, { minorForms: ["harmonic"] }) },
    ],
    objective: { statement: "Write and recognise the harmonic minor scales of A, E and D.", criteria: ["I can write E harmonic minor with F♯ and D♯.", "I can write D harmonic minor with B♭ and C♯.", "I know the raised 7th is one semitone below the key note."] },
    explain: [
      { text: "The method is the same for every harmonic minor: take the notes of the key, then raise the 7th by a semitone." },
      { music: stave("treble", nms(E_HAR), "The scale of E harmonic minor: E, F sharp, G, A, B, C, D sharp, E."), caption: "E harmonic minor: E F♯ G A B C D♯ E. F♯ is in the key signature; the 7th, D, is raised to D♯." },
      { music: stave("treble", nms(D_HAR), "The scale of D harmonic minor: D, E, F, G, A, B flat, C sharp, D."), caption: "D harmonic minor: D E F G A B♭ C♯ D. B♭ is in the key signature; the 7th, C, is raised to C♯." },
      { text: "Notice the 7th is always a semitone below the key note: D♯ to E, and C♯ to D." },
      { text: "Each letter still appears once. In E minor the 7th is D♯, not E♭, because the 7th note must be a kind of D." },
      { tip: "Write the key signature notes, then raise the 7th by one semitone with an accidental." },
    ],
    demo: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(D_HAR), "The scale of D harmonic minor with B flat and C sharp."),
      steps: ["D minor has one flat, B♭. Play D, E, F, G, A, B♭.", "The 7th note would be C. Raise it to C♯.", "Play C♯ and then the key note D."],
      text: "D harmonic minor in the treble clef: D, E, F, G, A, B flat, C sharp, D.",
    },
    guided: [
      { t: "t.g2.minor-facts", correct: "Yes." },
      { t: "t.g2.scale-gap", correct: "Right note." },
      { t: "t.g2.scale-build-minor", correct: "Scale written correctly." },
    ],
    independent: [
      { t: "t.g2.scale-build-minor", correct: "Correct scale." },
      { t: "t.g2.scale-gap", correct: "Correct note." },
      { t: "t.g2.minor-facts", correct: "Correct." },
      { t: "t.g2.scale-build-minor", correct: "Correct." },
      { t: "t.g2.scale-gap", correct: "Correct." },
      { t: "t.g2.minor-facts", correct: "Correct." },
    ],
    recap: ["Write the key's notes, then raise the 7th by a semitone.", "E harmonic minor has F♯ and D♯; D harmonic minor has B♭ and C♯.", "The 7th is a semitone below the key note."],
    review: [{ t: "t.g2.scale-build-minor", afterDays: 1 }, { t: "t.g2.scale-gap", afterDays: 3 }, { t: "t.g2.minor-facts", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcome 9. Scales are asked going up or coming down, written with accidentals (no key signature).",
  },
  {
    node: "G2-U4-L05",
    version: 1,
    bind: [
      { t: "t.g2.key-signature", c: ["c.keys.minor-g2"], scope: { keys: SIGN_KEYS, clefs: CL } },
      { t: "t.g2.key-facts", c: ["c.keys.minor-g2"], scope: { keys: [...MAJ_G2, ...MIN3], clefs: CL } },
      { t: "t.g2.tonic-triad", c: ["c.keys.minor-g2"], scope: stv([...MAJ_G2, ...MIN3], { chordDegrees: ["I"], inversions: ["a"] }) },
      { t: "t.g2.degree", c: ["c.keys.minor-g2"], scope: { keys: [...MAJ_G2, ...MIN3], degreeNaming: "number" } },
      { t: "t.g2.triad-notes", c: ["c.keys.minor-g2"], scope: stv([...MAJ_G2, ...MIN3], { chordDegrees: ["I"], inversions: ["a"], minorForms: ["harmonic"] }) },
      { t: "t.g2.degree-note", c: ["c.keys.minor-g2"], scope: stv([...MAJ_G2, ...MIN3], { minorForms: ["harmonic"] }) },
    ],
    objective: { statement: "Write and recognise the key signatures, tonic triads and scale degrees of A, E and D minor.", criteria: ["I know a minor key has the same key signature as its relative major.", "I can write the tonic triad of A, E and D minor.", "I can say which degree of a minor scale a note is."] },
    explain: [
      { text: "A minor key uses the key signature of its relative major. A minor has none (like C major), E minor has one sharp (like G major) and D minor has one flat (like F major)." },
      { text: "The raised 7th of the harmonic minor is not in the key signature. It is written as an accidental each time it is needed." },
      { text: "The tonic triad of a minor key is degrees 1, 3 and 5, as in a major key. In the minor the 3rd is lower, which gives the chord its minor sound." },
      { text: "A minor: A, C, E. E minor: E, G, B. D minor: D, F, A. The degrees are numbered from the key note, and degree 7 is the raised note." },
      { tip: "Key signature of a minor key = key signature of its relative major (the major key whose 6th note is the minor key's key note)." },
    ],
    demo: {
      widget: "staff",
      music: stave("treble", nms(["E4", "G4", "B4"]), "Three treble notes making the tonic triad of E minor: E, G, B."),
      steps: ["E minor has one sharp, F♯, because its relative major, G, has one sharp.", "The tonic triad uses degrees 1, 3 and 5: E, G and B.", "G is three semitones above E. That lower 3rd, a semitone below what a major triad would use, is what makes the triad minor."],
      text: "The tonic triad of E minor: E, G and B.",
    },
    guided: [
      { t: "t.g2.key-facts", when: has("How many sharps or flats"), correct: "Yes." },
      { t: "t.g2.triad-notes", correct: "You built the triad." },
      { t: "t.g2.degree-note", correct: "Correct degree." },
    ],
    independent: [
      { t: "t.g2.key-signature", correct: "Key signature correct." },
      { t: "t.g2.tonic-triad", correct: "Triad correct." },
      { t: "t.g2.degree", correct: "Degree correct." },
      { t: "t.g2.key-facts", correct: "Correct." },
      { t: "t.g2.triad-notes", correct: "Correct." },
      { t: "t.g2.degree-note", correct: "Correct." },
    ],
    recap: ["A minor key has the key signature of its relative major.", "The tonic triad is degrees 1, 3 and 5.", "The raised 7th is an accidental, not in the key signature."],
    review: [{ t: "t.g2.key-signature", afterDays: 1 }, { t: "t.g2.tonic-triad", afterDays: 3 }, { t: "t.g2.degree", afterDays: 7 }],
    notes: "Original wording. Follows Grade 2 outcomes 9, 10 and 11. Degrees in minor keys follow the harmonic form (the 7th is the raised note).",
  },
];
void [MAJ_G2];
