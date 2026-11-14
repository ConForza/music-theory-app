import { IRR, bar, beamed, has, n, nd, r, rh, tup, type Spec2 } from "./lib5.ts";

const ts4 = ["5/4", "7/4"];
export const U1: Spec2[] = [
  {
    node: "G5-U1-L01",
    version: 1,
    bind: [
      { t: "t.g5.time-signature", c: ["c.metre.irregular"], scope: rh(IRR) },
      { t: "t.g5.metre-facts", c: ["c.metre.irregular"], scope: rh(IRR) },
    ],
    objective: { statement: "Read 5/4, 7/4, 5/8 and 7/8 as combinations of groups of two and three beats.", criteria: ["I can tell an irregular time signature from a regular one.", "I know the upper figure counts the beats and the lower figure names the beat.", "I know the same signature can be grouped in more than one way."] },
    explain: [
      { text: "So far every bar you have met had beats that were all alike: two, three or four of them, simple or compound. A time signature with five or seven beats in a bar is called irregular, because its beats cannot be shared out evenly. Instead the bar breaks into smaller groups of two and three beats. At Grade 5 the irregular signatures are 5/4, 7/4, 5/8 and 7/8." },
      { text: "Read them as you read any time signature. The upper figure says how many beats are in a bar; the lower figure says which note value is one beat: 4 is a crotchet, 8 is a quaver. So 5/4 is five crotchet beats, and 5/8 is five quaver beats. A bar of 7/8 holds seven quavers." },
      { music: bar([[n("crotchet"), n("crotchet"), n("crotchet"), n("crotchet"), n("crotchet")], [nd("minim"), n("minim")]], "Two bars of 5/4. The first has five crotchets. The second has a dotted minim followed by a minim.", "5/4"), caption: "Both bars of 5/4 add up to five crotchets. The second bar shows a 3 + 2 grouping." },
      { text: "A time signature does not say how the beats are grouped. Five beats may fall as 3 + 2 or 2 + 3; seven beats as 2 + 2 + 3, 3 + 2 + 2 or 2 + 3 + 2. The composer shows the grouping with note lengths and beams, and a piece usually keeps the same grouping from bar to bar." },
      { tip: "To find an irregular signature, add up one bar in the smallest beat: five beats or seven. The upper figure is 5 or 7; the lower figure is the value you counted in." },
    ],
    demo: { widget: "rhythm", music: bar([[n("quaver", { beam: "begin" }), n("quaver", { beam: "continue" }), n("quaver", { beam: "end" }), n("quaver", { beam: "begin" }), n("quaver", { beam: "end" })]], "A bar of 5/8: a group of three quavers then a group of two.", "5/8"), steps: ["Count the quavers: there are five.", "Five quaver beats gives 5/8.", "The beams show three, then two: a 3 + 2 grouping."], text: "One bar of 5/8 with five quavers, beamed in a group of three and a group of two." },
    guided: [
      { t: "t.g5.metre-facts", when: has("How many"), correct: "Yes: the upper figure counts the beats." },
      { t: "t.g5.time-signature", correct: "Right: you added up the bar and named the beat." },
      { t: "t.g5.metre-facts", when: has("groupings"), correct: "Yes: only groups of two and three." },
    ],
    independent: [
      { t: "t.g5.time-signature", correct: "Correct signature." },
      { t: "t.g5.metre-facts", when: has("irregular time signature"), correct: "Correct." },
      { t: "t.g5.time-signature", correct: "Correct." },
      { t: "t.g5.metre-facts", when: has("One piece"), correct: "Yes: both groupings are possible." },
      { t: "t.g5.time-signature", correct: "Correct." },
      { t: "t.g5.metre-facts", when: has("counted as one unit"), correct: "Correct." },
    ],
    recap: ["Irregular time has five or seven beats, made of groups of two and three.", "The upper figure counts the beats; the lower figure names the beat.", "The signature does not give the grouping: the notes and beams do."],
    review: [{ t: "t.g5.time-signature", afterDays: 1 }, { t: "t.g5.metre-facts", afterDays: 3 }, { t: "t.g5.time-signature", afterDays: 7 }],
    notes: "Original wording. Follows Grade 5 outcome 1 and First Steps Grade 5 section 1 (p. 105, read in the PDF): five or seven beats; bars are combinations of twos and threes; only 5/4, 7/4, 5/8 and 7/8 at Grade 5. Q30/Q35: grouping in x/4 is shown by note lengths because crotchets cannot be beamed.",
  },
  {
    node: "G5-U1-L02",
    version: 1,
    bind: [
      { t: "t.g5.grouping-judge", c: ["c.metre.irregular-grouping"], scope: rh(["5/8", "7/8"]) },
      { t: "t.g5.irregular-grouping", c: ["c.metre.irregular-grouping"], scope: rh(["5/8", "7/8"]) },
      { t: "t.g5.bar-complete", c: ["c.metre.irregular-grouping"], scope: rh(IRR) },
    ],
    objective: { statement: "Group the notes and rests of an irregular bar so that they show the stated grouping.", criteria: ["I beam each group of two or three separately.", "I never let a note or a rest cross from one group into the next.", "I check the total, the grouping and the beams as three separate things."] },
    explain: [
      { text: "In an irregular bar each group is written as if it were a bar of its own: just as it would be if it were a complete group of two or three beats. There are no special rules beyond that. A group of three quavers is joined by one beam; a group of two is joined by another; the beams never join notes from two different groups." },
      { music: bar([[n("quaver", { beam: "begin" }), n("quaver", { beam: "continue" }), n("quaver", { beam: "end" }), n("quaver", { beam: "begin" }), n("quaver", { beam: "end" })], [n("quaver", { beam: "begin" }), n("quaver", { beam: "end" }), n("quaver", { beam: "begin" }), n("quaver", { beam: "continue" }), n("quaver", { beam: "end" })]], "Two bars of 5/8. The first is grouped three then two; the second is grouped two then three.", "5/8"), caption: "The same five quavers: 3 + 2 in the first bar, 2 + 3 in the second." },
      { text: "A bar that adds up is not necessarily a bar that is grouped well. Check three things one at a time. First, the total: does the bar add up to the signature? Second, the grouping: do the groups match the pattern asked for? Third, the notation: are the beams and rests grouped inside each group?" },
      { music: bar([[nd("minim"), n("minim")], [n("crotchet"), n("crotchet"), n("crotchet"), n("minim")]], "Two bars of 5/4: a dotted minim then a minim (3 + 2), then three crotchets and a minim (3 + 2).", "5/4"), caption: "In 5/4 the groups are shown by note lengths: nothing crosses from beat 3 into beat 4." },
      { text: "Rests follow the same idea. A whole group may be one rest, and a single beat may be one rest; a rest that begins in one group and ends in another is not used. Questions always say which grouping is wanted, so you never have to guess." },
      { tip: "Name the grouping first (for example 2 + 3), then fill or beam one group at a time, left to right." },
    ],
    demo: { widget: "rhythm", music: bar([[...beamed("quaver", 3), ...beamed("quaver", 2), ...beamed("quaver", 2)]], "A bar of 7/8: three quavers, then two, then two.", "7/8"), steps: ["The grouping is 3 + 2 + 2.", "Beam three quavers, then two, then two.", "Check the total: seven quavers."], text: "Seven quavers beamed 3 + 2 + 2." },
    guided: [
      { t: "t.g5.grouping-judge", when: has("Which grouping"), correct: "Yes: you counted the notes under each beam." },
      { t: "t.g5.irregular-grouping", correct: "Right: each group has its own beam." },
      { t: "t.g5.bar-complete", when: has("5/4"), correct: "Yes: a note never crosses into the next group." },
    ],
    independent: [
      { t: "t.g5.grouping-judge", when: has("Which grouping"), correct: "Correct." },
      { t: "t.g5.irregular-grouping", correct: "Correct grouping." },
      { t: "t.g5.bar-complete", correct: "Correct." },
      { t: "t.g5.grouping-judge", when: has("composer wants"), correct: "Correct." },
      { t: "t.g5.irregular-grouping", correct: "Correct." },
      { t: "t.g5.bar-complete", correct: "Correct." },
      { t: "t.g5.grouping-judge", when: has("composer wants"), correct: "Correct." },
    ],
    recap: ["Each group of two or three is written like a bar of its own.", "A beam never joins notes from two groups; no note or rest crosses a group.", "Check the total, the grouping and the beams separately."],
    review: [{ t: "t.g5.grouping-judge", afterDays: 1 }, { t: "t.g5.irregular-grouping", afterDays: 3 }, { t: "t.g5.bar-complete", afterDays: 7 }],
    notes: "Original wording. First Steps Grade 5 section 1 (p. 105): no special rules; each subdivision of an irregular bar is grouped in the usual way. Beamed grouping is read in x/8 only (OPEN_QUESTIONS Q30/Q35); rests fill a whole group or one unit. Every question names the wanted grouping, as the brief requires.",
  },
  {
    node: "G5-U1-L03",
    version: 1,
    bind: [
      { t: "t.g5.irregular-division", c: ["c.rhythm.irregular-divisions"], scope: rh(IRR, true) },
      { t: "t.g5.division-facts", c: ["c.rhythm.irregular-divisions"], scope: rh(IRR, true) },
      { t: "t.g5.division-write", c: ["c.rhythm.irregular-divisions"], scope: rh(IRR, true) },
    ],
    objective: { statement: "Read and write groups of 5, 6, 7 and 9 notes played in the time of 4 or 8.", criteria: ["I can say how much time an irregular group takes.", "I choose the written value that fits the time.", "I check the group's ratio apart from the bar total."] },
    explain: [
      { text: "You already know the triplet: three equal notes played in the time normally taken by two. Other irregular divisions work the same way. A quintuplet puts five notes into the time of four, a sextuplet six into the time of four, a septuplet seven into the time of four, and a nonuplet nine into the time of eight. The number printed over the group is the number of notes." },
      { music: bar([[tup(5, 4, "semiquaver"), n("crotchet"), n("crotchet"), n("crotchet"), n("crotchet")]], "A bar of 5/4: a quintuplet of five semiquavers, then four crotchets.", "5/4"), caption: "Five semiquavers take the time of one crotchet, so the bar still adds up to five crotchets." },
      { text: "The written value depends on the time the group must fit. Five, six or seven notes in the time of a crotchet are written as semiquavers (two beams). Five, six or seven notes in the time of a quaver are written as demisemiquavers (three beams). Nine notes in the time of a crotchet are written as demisemiquavers; nine in the time of a minim are written as semiquavers." },
      { text: "To work out how long a group lasts, imagine the ordinary notes it replaces. Five semiquavers in the time of four semiquavers last as long as four semiquavers: one crotchet. Check this separately from the bar total: first the group's length, then whether the bar adds up." },
      { tip: "Name the group (the number of notes), say what it replaces (the time of 4, or of 8), then say how long that is." },
    ],
    demo: { widget: "rhythm", music: bar([[tup(9, 8, "demisemiquaver"), n("minim"), n("minim")]], "A bar of 5/4: a nonuplet of nine demisemiquavers, then two minims.", "5/4"), steps: ["Nine notes replace eight demisemiquavers.", "Eight demisemiquavers last one crotchet.", "So the nonuplet lasts one crotchet, and the bar adds up to five crotchets."], text: "A nonuplet of nine demisemiquavers lasting one crotchet, then two minims." },
    guided: [
      { t: "t.g5.division-facts", when: has("take the time of"), correct: "Yes: five in the time of four." },
      { t: "t.g5.irregular-division", correct: "Right: you found the time the group takes." },
      { t: "t.g5.division-facts", when: has("Which note value"), correct: "Yes: the value that fits the time." },
    ],
    independent: [
      { t: "t.g5.irregular-division", correct: "Correct." },
      { t: "t.g5.division-write", correct: "Correct group." },
      { t: "t.g5.division-facts", when: has("usually called"), correct: "Correct name." },
      { t: "t.g5.irregular-division", correct: "Correct." },
      { t: "t.g5.division-write", correct: "Correct." },
      { t: "t.g5.division-facts", when: has("Which note value"), correct: "Correct." },
    ],
    recap: ["Quintuplet 5:4, sextuplet 6:4, septuplet 7:4, nonuplet 9:8.", "Notes in the time of a crotchet are semiquavers (or demisemiquavers for nine); in the time of a quaver, demisemiquavers.", "Check the group's length, then the bar total."],
    review: [{ t: "t.g5.irregular-division", afterDays: 1 }, { t: "t.g5.division-facts", afterDays: 3 }, { t: "t.g5.division-write", afterDays: 7 }],
    notes: "Original wording. First Steps Grade 5 section 2 (pp. 106-107, read in the PDF): triplet as the simplest irregular division; 5, 6, 7 in the time of 4; 9 in the time of 8; written values adjust with the time they must fit. The nonuplet in the time of a minim is the book's 9-in-8 case.",
  },
];
void r; void ts4;
