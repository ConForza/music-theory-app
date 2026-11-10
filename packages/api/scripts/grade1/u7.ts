import type { ExerciseItem } from "@mtp/curriculum";
import { fixedItem, melody, stave, type Spec } from "./lib.ts";

const has = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);
const starts = (s: string) => (i: ExerciseItem) => i.prompt.startsWith(s);

/** An original melody used in the explanation and demonstration of lesson 5 (G major, 4/4). */
const TUNE = melody(
  "treble",
  [
    [["G4", "crotchet", { dynamic: "mf" }], ["A4", "crotchet"], ["B4", "crotchet", { label: "x", art: "staccato" }], ["D5", "crotchet"]],
    [["E5", "minim"], ["D5", "minim"]],
    [["B4", "crotchet"], ["G4", "crotchet"], ["A4", "crotchet"], ["B4", "crotchet", { rest: true }]],
    [["G4", "semibreve", { art: "fermata" }]],
  ],
  "4/4",
  "G major",
  "A four-bar melody in G major, 4/4, marked Andante and mf. Bar 1: G, A, B (marked x, staccato), D. Bar 2: E minim, D minim. Bar 3: B, G, A, then a crotchet rest. Bar 4: G semibreve with a pause.",
  { tempoText: "Andante" },
);


/** Two more original melodies for fixed questions: F major in the bass clef (3/4) and D major in the treble clef (2/4). */
const BASS_TUNE = melody(
  "bass",
  [
    [["F2", "crotchet", { dynamic: "p" }], ["G2", "crotchet"], ["A2", "crotchet", { label: "x", art: "accent" }]],
    [["Bb2", "minim"], ["A2", "crotchet"]],
    [["F2", "minim", { dots: 1 }]],
  ],
  "3/4",
  "F major",
  "A three-bar melody in F major, 3/4, bass clef, marked Allegretto and p. Bar 1: F, G, A (marked x, with an accent). Bar 2: B flat minim, A crotchet. Bar 3: F dotted minim.",
  { tempoText: "Allegretto" },
);
const D_TUNE = melody(
  "treble",
  [
    [["D5", "crotchet", { dynamic: "f" }], ["C#5", "crotchet"]],
    [["B4", "crotchet", { label: "x", art: "staccato" }], ["A4", "crotchet"]],
    [["F#4", "crotchet"], ["F#4", "crotchet", { rest: true }]],
  ],
  "2/4",
  "D major",
  "A three-bar melody in D major, 2/4, treble clef, marked Moderato and f. Bar 1: D, C sharp. Bar 2: B (marked x, staccato), A. Bar 3: F sharp, then a crotchet rest.",
  { tempoText: "Moderato" },
);
/** Question pictures describe what is there, never what the question asks for (no key, tempo word, note name or sign meaning). */
const asked = (f: typeof TUNE, text: string) => ({ ...f, textAlternative: text }) as typeof TUNE;
const Q_TUNE = asked(TUNE, "A four-bar melody. Treble clef, key signature of one sharp, time signature 4/4. The word Andante is printed above the first bar and the dynamic mark mf is under the first note. Bar 1: four crotchets, on the 2nd line, the 2nd space, the 3rd line (labelled x, with a dot above it) and the 4th line. Bar 2: two minims, on the 4th space and the 4th line. Bar 3: crotchets on the 3rd line, the 2nd line and the 2nd space, then a crotchet-long symbol. Bar 4: a semibreve on the 2nd line with a curved sign with a dot under it above it.");
const Q_BASS = asked(BASS_TUNE, "A three-bar melody. Bass clef, key signature of one flat, time signature 3/4. The word Allegretto is printed above the first bar and the dynamic mark p is under the first note. Bar 1: three crotchets, in the space just below the stave, on the 1st line and in the 1st space (labelled x, with a > sign above it). Bar 2: a minim on the 2nd line, then a crotchet in the 1st space. Bar 3: a dotted minim in the space just below the stave.");
const Q_D = asked(D_TUNE, "A three-bar melody. Treble clef, key signature of two sharps, time signature 2/4. The word Moderato is printed above the first bar and the dynamic mark f is under the first note. Bar 1: two crotchets, on the 4th line and in the 3rd space. Bar 2: two crotchets, on the 3rd line (labelled x, with a dot above it) and in the 2nd space. Bar 3: a crotchet in the 1st space, then a crotchet-long symbol.");
const mean = (id: string) => ({ id, label: (({ andante: "at a walking pace", allegro: "fast and lively", adagio: "slow", moderato: "at a moderate speed", accent: "emphasise the note", staccato: "short and detached", legato: "smoothly, with the notes joined", fermata: "hold the note longer than its written value" }) as Record<string, string>)[id]! });
const miss = { "evidence-misread": "Look at the melody again and find the thing the question asks about.", "concept-misapplied": "Check what the sign or number means, then try to apply it to this melody." };
const MELODY_ITEMS = [
  fixedItem({
    id: "i.g1-u7-l05.melody-1", templateId: "t.g1.melody", prompt: "Look at this melody and answer the questions.", music: Q_TUNE,
    answer: { kind: "composite", parts: [
      { id: "beats", prompt: "How many crotchet beats are in each bar?", answer: { kind: "choice", options: [2, 3, 4].map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: ["4"] } },
      { id: "marked", prompt: "Name the note marked x.", answer: { kind: "pitch", reference: "B4", relation: "same", accepted: ["B4"], octaveSensitive: false, spellingSensitive: true } },
      { id: "key", prompt: "The melody is in a major key. Which one?", answer: { kind: "key-signature", task: "name-key", clef: "treble", accepted: ["G major"] } },
    ] },
    hints: ["Use the time signature for the beats, the stave for the note, and the key signature for the key."], correct: "All three parts read correctly.", mistakes: miss,
  }),
  fixedItem({
    id: "i.g1-u7-l05.melody-2", templateId: "t.g1.melody-detail", prompt: "Look at the word above the first bar. What does it tell the player?", music: Q_TUNE,
    answer: { kind: "choice", options: ["andante", "allegro", "adagio", "moderato"].map(mean), correctOptionIds: ["andante"] },
    hints: ["Tempo words tell you how fast to play."], correct: "Andante: at a walking pace.", mistakes: { "confused-similar-term": "Close, but that word means something different. Andante is a walking pace.", "opposite-meaning": "That is the opposite speed.", "wrong-category": "That belongs to a different kind of marking." },
  }),
  fixedItem({
    id: "i.g1-u7-l05.melody-3", templateId: "t.g1.melody", prompt: "Look at this bass-clef melody and answer the questions.", music: Q_BASS,
    answer: { kind: "composite", parts: [
      { id: "beats", prompt: "How many crotchet beats are in each bar?", answer: { kind: "choice", options: [2, 3, 4].map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: ["3"] } },
      { id: "marked", prompt: "Name the note marked x.", answer: { kind: "pitch", reference: "A2", relation: "same", accepted: ["A2"], octaveSensitive: false, spellingSensitive: true } },
      { id: "key", prompt: "The melody is in a major key. Which one?", answer: { kind: "key-signature", task: "name-key", clef: "bass", accepted: ["F major"] } },
    ] },
    hints: ["Read the notes in the bass clef: the bottom line is G."], correct: "All three parts read correctly.", mistakes: miss,
  }),
  fixedItem({
    id: "i.g1-u7-l05.melody-4", templateId: "t.g1.melody-detail", prompt: "The note marked x has a sign with it. How should it be played?", music: Q_BASS,
    answer: { kind: "choice", options: ["accent", "staccato", "legato", "fermata"].map(mean), correctOptionIds: ["accent"] },
    hints: ["A > sign over a note is an accent."], correct: "An accent: emphasise the note.", mistakes: { "confused-similar-term": "Close, but that mark means something different. The > sign is an accent.", "opposite-meaning": "That is the opposite.", "wrong-category": "That belongs to a different kind of marking." },
  }),
  fixedItem({
    id: "i.g1-u7-l05.melody-5", templateId: "t.g1.melody-detail", prompt: "The melody is in F major. What is the interval, by number, from the nearest tonic at or below the note marked x, up to x?", music: Q_BASS,
    answer: { kind: "choice", options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), label: n === 1 ? "1st (unison)" : n === 8 ? "8th (octave)" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}` })), correctOptionIds: ["3"] },
    hints: ["The tonic is F. Count F G A, counting the tonic as 1."], correct: "A is a 3rd above F.", mistakes: miss,
  }),
  fixedItem({
    id: "i.g1-u7-l05.melody-6", templateId: "t.g1.melody-detail", prompt: "Which bar of the melody contains a rest?", music: Q_D,
    answer: { kind: "choice", options: [1, 2, 3].map((n) => ({ id: String(n), label: `Bar ${n}` })), correctOptionIds: ["3"] },
    hints: ["A rest is a sign for silence."], correct: "Bar 3 ends with a crotchet rest.", mistakes: miss,
  }),
];

export const U7: Spec[] = [
  {
    node: "G1-U7-L01",
    version: 1,
    objective: { statement: "Know the Italian words that tell you how fast to play.", criteria: ["I know a tempo word at the start of a piece tells the player the speed.", "I know allegro is fast, andante is walking pace and adagio is slow.", "I can match a tempo word to its meaning."] },
    explain: [
      { text: "Tempo means speed. At the start of a piece, a word often tells the player how fast the music should go. Many of these words are Italian, because Italian was the language of music for centuries." },
      { music: stave("treble", [["G4", "G"]], "A treble stave with the word Allegro written above it.", { tempoText: "Allegro", timeSignature: "4/4" }), caption: "Allegro: fast and lively." },
      { text: "From slow to fast, the words you need are: adagio and lento (slow), andante (at a walking pace), moderato (at a moderate speed), allegretto (fairly quick) and allegro (fast and lively)." },
      { tip: "Andante is the walking word. Its root is the Italian verb 'andare', which means 'to go', so think of music that goes along at an easy, steady walk." },
    ],
    demo: {
      widget: "staff",
      music: melody("treble", [[["C4", "crotchet"], ["D4", "crotchet"], ["E4", "crotchet"], ["F4", "crotchet"]]], "4/4", undefined, "Four rising crotchets, C D E F, with the word Andante above the stave.", { tempoText: "Andante" }),
      steps: ["Press Play all. The notes are played at one steady speed.", "Imagine the same notes marked Adagio: slow and calm.", "And now Allegro: quick and bright. The notes are the same; only the speed changes."],
      text: "Four rising notes marked Andante. The word tells the player how fast to take them.",
    },
    guided: [
      { t: "t.g1.terms", correct: "Yes: a tempo word is about speed." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "That word has that meaning." },
    ],
    independent: [
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right word." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Correct." },
    ],
    recap: ["Tempo means speed.", "Adagio and lento: slow. Andante: walking pace. Moderato: moderate.", "Allegretto: fairly quick. Allegro: fast and lively."],
    review: [{ t: "t.g1.terms", afterDays: 1 }, { t: "t.g1.term-sign", afterDays: 3 }, { t: "t.g1.terms", afterDays: 7 }],
    notes: "Original wording and meanings. TEACHER TO CONFIRM: the Grade 1 tempo term list (the ABRSM outline PDF names categories but not individual terms; this list is provisional, see content/syllabus and OPEN_QUESTIONS Q2).",
  },
  {
    node: "G1-U7-L02",
    version: 1,
    objective: { statement: "Know the signs and words that tell you how loudly to play.", criteria: ["I know p means quiet and f means loud.", "I know m means moderately and doubling the letter means very.", "I know crescendo means getting louder and diminuendo getting quieter."] },
    explain: [
      { text: "Dynamics tell the player how loudly or quietly to play. They use letters taken from Italian words: p is piano (quiet) and f is forte (loud)." },
      { music: melody("treble", [[["C5", "crotchet", { dynamic: "p" }], ["D5", "crotchet", { dynamic: "mp" }], ["E5", "crotchet", { dynamic: "mf" }], ["F5", "crotchet", { dynamic: "f" }]]], "4/4", undefined, "Four crotchets marked p, mp, mf and f, getting louder."), caption: "p (quiet), mp (moderately quiet), mf (moderately loud), f (loud)." },
      { text: "An m stands for mezzo, which means moderately. mp is moderately quiet and mf is moderately loud. Doubling a letter makes it stronger: pp is very quiet (pianissimo) and ff is very loud (fortissimo)." },
      { text: "Words can change the volume gradually. Crescendo (cresc.) means getting gradually louder. Diminuendo (dim.) or decrescendo (decresc.) means getting gradually quieter." },
      { tip: "From quietest to loudest: pp, p, mp, mf, f, ff." },
    ],
    demo: {
      widget: "staff",
      music: melody("treble", [[["C5", "crotchet", { dynamic: "pp" }], ["D5", "crotchet", { dynamic: "p" }], ["E5", "crotchet", { dynamic: "f" }], ["F5", "crotchet", { dynamic: "ff" }]]], "4/4", undefined, "Four crotchets marked pp, p, f and ff, getting louder."),
      steps: ["Look at the marks below the notes: pp, p, f, ff.", "Read them in order from quiet to loud.", "Which note is marked to be the loudest? The last, ff."],
      text: "Four notes marked from very quiet (pp) to very loud (ff).",
    },
    guided: [
      { t: "t.g1.terms", correct: "Right meaning." },
      { t: "t.g1.term-sign", when: has("dynamic mark"), correct: "You read the dynamic mark." },
    ],
    independent: [
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: has("dynamic mark"), correct: "Correct." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: has("dynamic mark"), correct: "Right." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right word." },
    ],
    recap: ["p = quiet, f = loud.", "m = moderately; doubling the letter = very.", "Crescendo = getting louder; diminuendo = getting quieter."],
    review: [{ t: "t.g1.terms", afterDays: 1 }, { t: "t.g1.term-sign", afterDays: 3 }, { t: "t.g1.terms", afterDays: 7 }],
    notes: "Original wording. TEACHER TO CONFIRM: Grade 1 dynamic list (pp to ff, cresc., dim./decresc.). Hairpin signs are not drawn by the renderer yet, so crescendo and diminuendo are taught as words.",
  },
  {
    node: "G1-U7-L03",
    version: 1,
    objective: { statement: "Understand common directions and signs: pauses, ties, slurs, speed changes and repeats.", criteria: ["I know rall., rit. and accel. change the speed gradually.", "I know a pause sign means hold the note longer.", "I know da capo means go back to the beginning and fine means the end."] },
    explain: [
      { text: "Besides loudness and speed, composers give other directions. Some change the speed during a piece: rallentando (rall.) or ritardando (rit.) means gradually slower; accelerando (accel.) means gradually faster; a tempo means go back to the original speed." },
      { music: melody("treble", [[["G4", "crotchet"], ["A4", "crotchet"], ["B4", "minim", { art: "fermata" }]]], "4/4", undefined, "A bar of 4/4 with G, A and a minim B with a pause sign above it."), caption: "A pause sign (fermata) over a note: hold it longer than its written length." },
      { text: "A tie joins two notes of the same pitch into one longer sound. A slur is a curved line over different notes and means play them smoothly, joined together." },
      { music: melody("treble", [[["G4", "crotchet", { slur: "start" }], ["A4", "crotchet", { slur: "stop" }], ["B4", "crotchet"], ["D5", "crotchet"]]], "4/4", undefined, "A bar of 4/4 with a slur over the first two notes, G and A."), caption: "A slur over two different notes: play them smoothly." },
      { text: "Da capo (D.C.) means go back to the beginning. Dal segno (D.S.) means go back to the sign. Fine means the end. Ritenuto (riten.) means held back: slower at once. Two small expression words you may meet are dolce (sweetly) and cantabile (in a singing style), and poco means 'a little'. 8va over some notes means play them an octave higher than written. A metronome mark such as M.M. ♩ = 72 gives the exact speed: 72 crotchet beats in a minute." },
      { tip: "A tie joins the SAME note; a slur joins DIFFERENT notes. That is how to tell them apart." },
    ],
    demo: {
      widget: "staff",
      music: melody("treble", [[["G4", "crotchet", { slur: "start" }], ["A4", "crotchet", { slur: "stop" }], ["B4", "minim", { art: "fermata" }]]], "4/4", undefined, "A bar of 4/4: G and A under a slur, then a minim B with a pause sign."),
      steps: ["Look at the curved line over G and A: a slur. They are played smoothly.", "Look at the sign over the B: a pause. Hold it longer than its minim length.", "A tie would join two notes of the same pitch; here the notes differ, so it is a slur."],
      text: "A bar showing a slur over two notes and a pause sign over the last note.",
    },
    guided: [
      { t: "t.g1.terms", correct: "Right meaning." },
      { t: "t.g1.term-sign", when: has("curved line"), correct: "That is what a slur means." },
    ],
    independent: [
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right word." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Correct." },
    ],
    recap: ["rall./rit. = gradually slower; riten. = held back; accel. = gradually faster; a tempo = back to the speed.", "A pause sign: hold the note longer. D.C.: back to the start. D.S.: back to the sign. Fine: the end. 8va: an octave higher.", "A tie joins the same note; a slur joins different notes smoothly."],
    review: [{ t: "t.g1.terms", afterDays: 1 }, { t: "t.g1.term-sign", afterDays: 3 }, { t: "t.g1.terms", afterDays: 7 }],
    notes: "Original wording. TEACHER TO CONFIRM: the Grade 1 'performance directions' list. Dal segno, ritenuto, poco, 8va and metronome marks are INCLUDED here because the reference book lists them at Grade 1 and the 2020 outline does not enumerate terms; the teacher may remove any of them. Repeat marks are taught in words only because the renderer does not yet draw repeat signs.",
  },
  {
    node: "G1-U7-L04",
    version: 1,
    objective: { statement: "Recognise staccato, legato and accent marks and say how to play them.", criteria: ["I know a dot over a note means staccato: short and detached.", "I know a slur means legato: smooth and joined.", "I know a > sign is an accent: emphasise the note."] },
    explain: [
      { text: "Articulation tells the player how to attack and shape each note. It is shown with small marks above or below the notes." },
      { music: melody("treble", [[["C5", "crotchet", { art: "staccato" }], ["C5", "crotchet", { art: "staccato" }], ["C5", "crotchet", { art: "staccato" }], ["C5", "crotchet", { art: "staccato" }]]], "4/4", undefined, "Four crotchets each with a dot: staccato."), caption: "Staccato: a dot over or under the note. Play it short and detached." },
      { music: melody("treble", [[["C5", "crotchet", { slur: "start" }], ["D5", "crotchet"], ["E5", "crotchet"], ["F5", "crotchet", { slur: "stop" }]]], "4/4", undefined, "Four different notes under one long curved line: legato."), caption: "Legato: a curved line over different notes. Play them smoothly, joined together." },
      { music: melody("treble", [[["C5", "crotchet", { art: "accent" }], ["D5", "crotchet"], ["E5", "crotchet"], ["F5", "crotchet"]]], "4/4", undefined, "A first note with an accent sign, followed by three plain notes."), caption: "Accent: a > sign. Emphasise the note, play it with a stronger attack." },
      { tip: "Staccato = short. Legato = smooth. Accent = stress." },
    ],
    demo: {
      widget: "staff",
      music: melody("treble", [[["C5", "crotchet", { art: "staccato" }], ["D5", "crotchet", { art: "staccato" }], ["E5", "crotchet", { slur: "start" }], ["F5", "crotchet", { slur: "stop" }]]], "4/4", undefined, "Two staccato notes followed by two notes under a slur."),
      steps: ["Look at the first two notes: each has a dot. Imagine playing them short and separate.", "The last two notes are under a curve: imagine them smoothly joined.", "Notice the same rhythm can feel very different with different articulation."],
      text: "Two staccato notes followed by two legato notes under a slur.",
    },
    guided: [
      { t: "t.g1.terms", correct: "Right meaning." },
      { t: "t.g1.term-sign", when: has("mark above or below"), correct: "You read the mark." },
    ],
    independent: [
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: has("mark above or below"), correct: "Correct." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Right." },
      { t: "t.g1.terms", correct: "Correct." },
      { t: "t.g1.term-sign", when: starts("Which term"), correct: "Correct." },
    ],
    recap: ["Staccato: short and detached (a dot).", "Legato: smooth and joined (a curved line).", "Accent: emphasise the note (a > sign)."],
    review: [{ t: "t.g1.terms", afterDays: 1 }, { t: "t.g1.term-sign", afterDays: 3 }, { t: "t.g1.terms", afterDays: 7 }],
    notes: "Original wording. TEACHER TO CONFIRM: Grade 1 articulation list. The pool for this concept is only three terms (staccato, legato, accent), so variety comes from the way they are asked (see the mastery-capacity audit).",
  },
  {
    node: "G1-U7-L05",
    version: 1,
    objective: { statement: "Read a short melody and answer questions about what you see and what it means.", criteria: ["I can find the key, the time signature and the tempo word.", "I can name a note and an interval above the tonic.", "I can say what the dynamic and articulation marks ask the player to do."] },
    explain: [
      { text: "Reading music means using everything you know at once. Work through a melody with a checklist: the clef, the key signature, the time signature, the tempo word, the dynamic marks, and then the notes, rests and signs bar by bar." },
      { music: TUNE, caption: "An original melody: G major, 4/4, Andante, mf. Bar 1 has a staccato note marked x, bar 3 ends with a rest, and bar 4 has a pause." },
      { text: "Here the key signature has one sharp, so the key is G major and the tonic is G. The time signature 4/4 means four crotchet beats in each bar. Andante tells you to go at a walking pace, and mf means moderately loud." },
      { text: "The note marked x is B. It is a 3rd above the tonic G, because G A B counts as three. It has a dot, so it is played staccato: short and detached." },
      { tip: "Take it one bar at a time. If a question asks about 'the highest note', look at every bar before you answer." },
    ],
    demo: {
      widget: "staff",
      music: TUNE,
      steps: ["Press Play all and follow the notes along the stave.", "Find the key signature, the time signature and the tempo word before you start.", "Find the note marked x, name it, and say what the dot over it asks the player to do.", "Spot the rest at the end of bar 3 and the pause sign in bar 4."],
      text: "The original four-bar melody in G major, with a tempo word, a dynamic, a staccato note marked x, a rest and a pause.",
    },
    guided: [
      { t: "t.g1.melody-detail", when: has("tell the player"), correct: "You read the mark and gave its meaning." },
      { t: "t.g1.melody", correct: "Each part of the melody question answered." },
    ],
    independent: [
      { t: "t.g1.melody-detail", when: starts("What is the name of the highest"), correct: "You found the highest note." },
      { t: "t.g1.melody-detail", when: has("interval"), correct: "The interval above the tonic, by number." },
      { t: "t.g1.melody-detail", when: has("Look at the word above"), correct: "You read the tempo word." },
      { t: "t.g1.melody-detail", when: has("Which major key"), correct: "You read the key signature." },
      { t: "t.g1.melody", correct: "All parts of the melody question right." },
      { t: "t.g1.melody-detail", when: has("How should it be played"), correct: "You read the articulation mark." },
    ],
    fixedIndependent: MELODY_ITEMS,
    recap: ["Check the clef, key signature, time signature and tempo word first.", "Read the marks on the notes: dynamics, staccato, accents, slurs and pauses.", "Name notes and intervals above the tonic using the key."],
    review: [{ t: "t.g1.melody-detail", afterDays: 1 }, { t: "t.g1.melody", afterDays: 3 }, { t: "t.g1.melody-detail", afterDays: 7 }],
    notes: "Original melody and questions. Follows Grade 1 outcome 21 ('simple questions about a melody written in treble or bass clef'). The melody is composed for this course and is not taken from any published source.",
  },
];
