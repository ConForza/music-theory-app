import { V4, bm, dc, has, nt, qqq, rhythm, rs, type Spec2 } from "./lib3.ts";

const D4 = () => bm(["demisemiquaver", "demisemiquaver", "demisemiquaver", "demisemiquaver"]);
const SC = { timeSignatures: ["2/4", "3/4", "6/8", "9/8", "3/8"], noteValues: V4 };

export const U2: Spec2[] = [
  {
    node: "G3-U2-L01",
    version: 1,
    bind: [
      { t: "t.g3.demisemiquaver", c: ["c.rhythm.demisemiquavers"], scope: { noteValues: V4 } },
      { t: "t.g3.demisemi-facts", c: ["c.rhythm.demisemiquavers"], scope: { timeSignatures: ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8", "3/8"], noteValues: V4, rests: true } },
    ],
    objective: { statement: "Recognise the demisemiquaver and its rest, and know how long they last.", criteria: ["I know a demisemiquaver has three flags, or three beams when grouped.", "I know it lasts half as long as a semiquaver.", "I know how many demisemiquavers fit into a quaver, a crotchet and a bar."] },
    explain: [
      { text: "You already know the crotchet, the quaver and the semiquaver. Each one is half as long as the one before. The next note in the line is the demisemiquaver, half as long as a semiquaver." },
      { music: rhythm([[nt("crotchet"), nt("quaver"), nt("semiquaver"), nt("demisemiquaver")]], "A crotchet, a quaver, a semiquaver and a demisemiquaver, each half the length of the one before."), caption: "Each note has one more flag than the last: the demisemiquaver has three." },
      { text: "Notes with flags are joined by beams when they are grouped. A beamed group of demisemiquavers has three beams. Two demisemiquavers last as long as one semiquaver, four as long as a quaver, and eight as long as a crotchet." },
      { music: rhythm([[nt("quaver"), ...D4()]], "A quaver, then a group of four beamed demisemiquavers. Both last the same time."), caption: "One quaver lasts as long as four demisemiquavers." },
      { text: "The demisemiquaver rest has three flags on its stem, like the note it stands for. It follows the same rules as the rests you already know." },
      { music: rhythm([[nt("demisemiquaver"), rs("demisemiquaver"), nt("demisemiquaver"), rs("demisemiquaver")]], "A demisemiquaver, a demisemiquaver rest, a demisemiquaver and a demisemiquaver rest."), caption: "The demisemiquaver rest: three flags." },
      { tip: "Demisemiquaver: 3 flags or beams, half a semiquaver. 2 = a semiquaver, 4 = a quaver, 8 = a crotchet." },
    ],
    demo: { widget: "rhythm", music: rhythm([[nt("quaver"), ...D4()]], "A quaver and four demisemiquavers."), steps: ["Tap one quaver.", "Now tap four very quick even notes in the same time: these are the four demisemiquavers.", "One quaver lasts as long as four demisemiquavers."], text: "A quaver, then four beamed demisemiquavers of the same total length." },
    guided: [
      { t: "t.g3.demisemi-facts", when: has("How many flags"), correct: "Yes: three flags." },
      { t: "t.g3.demisemiquaver", when: has("as long as a quaver"), correct: "Yes: four demisemiquavers make a quaver." },
      { t: "t.g3.demisemi-facts", when: has("Which one is it"), correct: "Yes: you counted the flags on the rest." },
    ],
    independent: [
      { t: "t.g3.demisemiquaver", when: has("as long as a crotchet"), correct: "Correct: eight make a crotchet." },
      { t: "t.g3.demisemi-facts", when: has("half as long"), correct: "Correct." },
      { t: "t.g3.demisemiquaver", when: has("as long as a semiquaver"), correct: "Correct." },
      { t: "t.g3.demisemi-facts", when: has("fill one whole bar"), correct: "Correct count." },
      { t: "t.g3.demisemi-facts", when: has("Which one is it"), correct: "Correct rest." },
      { t: "t.g3.demisemiquaver", when: has("as long as a dotted quaver"), correct: "Correct: a dotted quaver is six demisemiquavers." },
    ],
    recap: ["A demisemiquaver has three flags (or three beams when grouped).", "It lasts half as long as a semiquaver: 2 = a semiquaver, 4 = a quaver, 8 = a crotchet.", "Its rest has three flags."],
    review: [{ t: "t.g3.demisemiquaver", afterDays: 1 }, { t: "t.g3.demisemi-facts", afterDays: 3 }, { t: "t.g3.demisemiquaver", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 3 and book section 4. The note value is also called a thirty-second note; the course uses the British name throughout.",
  },
  {
    node: "G3-U2-L02",
    version: 1,
    bind: [
      { t: "t.g3.demisemi-judge", c: ["c.rhythm.demisemiquaver-grouping"], scope: SC },
      { t: "t.g3.demisemi-regroup", c: ["c.rhythm.demisemiquaver-grouping"], scope: SC },
    ],
    objective: { statement: "Group demisemiquavers (and the notes around them) so that every beat can be seen.", criteria: ["I beam the short notes of one beat together.", "I start a new beam on each beat.", "I do not beam across a beat line."] },
    explain: [
      { text: "Short notes are easiest to read when they are beamed in beats. The rule is the one you know from quavers and semiquavers: join the notes of one beat with a beam, and never join notes from two different beats." },
      { music: rhythm([[...bm(["demisemiquaver", "demisemiquaver", "demisemiquaver", "demisemiquaver", "quaver"]), ...bm(["quaver", "demisemiquaver", "demisemiquaver", "demisemiquaver", "demisemiquaver"])]], "One bar of 2/4. Beat 1: four demisemiquavers and a quaver under one beam. Beat 2: a quaver and four demisemiquavers under one beam.", "2/4"), caption: "2/4: one beam for each crotchet beat." },
      { text: "In compound time the same rule applies to the dotted-crotchet beat: all the short notes of one beat share a beam, and a new beam starts on the next beat." },
      { music: rhythm([[...bm(["demisemiquaver", "demisemiquaver", "demisemiquaver", "demisemiquaver", "quaver", "quaver"]), dc()]], "One bar of 6/8. Beat 1: four demisemiquavers and two quavers under one beam. Beat 2: a dotted crotchet.", "6/8"), caption: "6/8: the beam covers exactly the first beat." },
      { text: "A beam is a way of showing beats, so a beam that runs across a beat line is wrong, even if the notes add up. In this course a beat never has more than four demisemiquavers in a row, so every beat can be beamed with one beam." },
      { text: "Demisemiquaver rests are arranged in the same way as semiquaver and quaver rests. You will meet them mixed with notes in later grades." },
      { tip: "One beam for each beat. Never beam across a beat line." },
    ],
    demo: { widget: "rhythm", music: rhythm([[...bm(["demisemiquaver", "demisemiquaver", "semiquaver", "quaver"]), ...bm(["semiquaver", "quaver", "demisemiquaver", "demisemiquaver"])]], "A bar of 2/4: two beamed groups, one for each beat.", "2/4"), steps: ["Find the first beat: the first crotchet's worth of notes.", "Check that one beam joins all the notes of that beat.", "Check that a new beam starts on the second beat."], text: "A bar of 2/4 with one beamed group for each beat." },
    guided: [
      { t: "t.g3.demisemi-judge", correct: "Yes: one beam for each beat." },
      { t: "t.g3.demisemi-regroup", correct: "You beamed the notes beat by beat." },
      { t: "t.g3.demisemi-judge", correct: "Correct bar." },
    ],
    independent: [
      { t: "t.g3.demisemi-regroup", correct: "Correct beaming." },
      { t: "t.g3.demisemi-judge", correct: "Correct bar." },
      { t: "t.g3.demisemi-regroup", correct: "Correct." },
      { t: "t.g3.demisemi-judge", correct: "Correct." },
      { t: "t.g3.demisemi-regroup", correct: "Correct." },
      { t: "t.g3.demisemi-judge", correct: "Correct." },
    ],
    recap: ["Beam the short notes of each beat together.", "Start a new beam on each beat; never beam across a beat line.", "The same rule works in simple and in compound time."],
    review: [{ t: "t.g3.demisemi-judge", afterDays: 1 }, { t: "t.g3.demisemi-regroup", afterDays: 3 }, { t: "t.g3.demisemi-judge", afterDays: 7 }],
    notes: "Original wording. Follows Grade 3 outcome 3 and book section 4. The book also allows eight demisemiquavers in a crotchet beat to be beamed in two groups of four; the rule checker asks for one beam over the whole beat, so the course never uses more than four in a row (OPEN_QUESTIONS Q26, TEACHER TO CONFIRM). Dotted rests after short notes are not asked (Q4).",
  },
];
void qqq;
