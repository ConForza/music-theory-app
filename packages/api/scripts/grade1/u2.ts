import type { ExerciseItem } from "@mtp/curriculum";
import { nt, rs, rhythm, type Spec } from "./lib.ts";

const starts = (s: string) => (i: ExerciseItem) => i.prompt.startsWith(s);
const has = (s: string) => (i: ExerciseItem) => i.prompt.includes(s);
const total = starts("Each bar is meant");
const grouping = has("groups its notes");
const restBar = has("writes its rests");
const tieBar = has("does not use a tie");
const hasRest = (i: ExerciseItem) => JSON.stringify(i).includes('"kind":"rest"');

export const U2: Spec[] = [
  {
    node: "G1-U2-L01",
    version: 1,
    objective: { statement: "Understand how bar-lines divide music into bars of equal length.", criteria: ["I know a bar-line is a vertical line across the stave.", "I know every bar in a piece holds the same number of beats.", "I can place bar-lines and finish with a double bar-line."] },
    explain: [
      { text: "Music is divided into short, equal sections called bars. Between one bar and the next we draw a vertical line called a bar-line." },
      { music: rhythm([[nt("crotchet"), nt("crotchet"), nt("minim")], [nt("minim"), nt("crotchet"), nt("crotchet")]], "Two bars of four-beat music in 4/4, each holding the same number of beats, divided by a bar-line and ending with a double bar-line.", "4/4"), caption: "Two bars of 4/4. Each holds four beats, and the piece ends with a double bar-line." },
      { text: "The time signature at the start tells us how many beats go in each bar. Every bar holds exactly that many beats, never more and never fewer." },
      { text: "At the very end of a piece we draw a double bar-line, with a thin line followed by a thick one." },
      { tip: "The first beat of a bar is usually the strongest. Count 'ONE two three four, ONE two three four' and the bar-lines fall just before each ONE." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[nt("crotchet"), nt("crotchet"), nt("minim")], [nt("minim"), nt("minim")], [nt("semibreve")]], "Three bars in 4/4: two crotchets and a minim, two minims, and a semibreve. Each bar lasts four beats.", "4/4"),
      steps: ["Press Play all and count 'one, two, three, four' in each bar.", "Notice every bar fills exactly four beats, even though the notes inside are different.", "The bar-line falls where the count starts again on 'one'.", "The double bar-line at the end shows that the music has finished."],
      text: "Three bars of 4/4 music of different notes that each add up to four beats, ending with a double bar-line.",
    },
    guided: [
      { t: "t.g1.bar-judge", when: total, correct: "Yes: that bar holds exactly the right number of beats." },
      { t: "t.g1.barlines", correct: "Bar-lines placed at the end of each full bar." },
    ],
    independent: [
      { t: "t.g1.barlines", correct: "Every bar-line is where the count starts again." },
      { t: "t.g1.bar-judge", when: total, correct: "That bar adds up correctly." },
      { t: "t.g1.barlines", correct: "Bar-lines and the final double bar-line are right." },
      { t: "t.g1.bar-judge", when: total, correct: "Counted the beats in each bar." },
      { t: "t.g1.barlines", correct: "Bars of equal length, finished correctly." },
      { t: "t.g1.bar-judge", when: total, correct: "The bar that adds up." },
    ],
    recap: ["Bar-lines divide music into bars of equal length.", "Every bar holds the number of beats in the time signature.", "A double bar-line ends the piece."],
    review: [{ t: "t.g1.barlines", afterDays: 1 }, { t: "t.g1.bar-judge", afterDays: 3 }, { t: "t.g1.barlines", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 06 (bar-lines). The time signatures appear here so bar-lines make sense; reading them is taught in the next lesson.",
  },
  {
    node: "G1-U2-L02",
    version: 1,
    objective: { statement: "Read 2/4, 3/4 and 4/4 and say how many crotchet beats are in each bar.", criteria: ["I know the top number says how many beats are in a bar.", "I know the bottom number 4 means the beats are crotchets.", "I can tell 2/4, 3/4 and 4/4 apart."] },
    explain: [
      { text: "A time signature is two numbers, one above the other, written after the clef. The top number tells you how many beats are in each bar." },
      { text: "The bottom number tells you what kind of note counts as one beat. A 4 on the bottom means the beat is a crotchet. So 2/4 means two crotchet beats in a bar, 3/4 means three, and 4/4 means four." },
      { music: rhythm([[nt("crotchet"), nt("crotchet")]], "A bar of 2/4 containing two crotchets.", "2/4"), caption: "2/4: two crotchet beats in every bar." },
      { music: rhythm([[nt("minim"), nt("crotchet")]], "A bar of 3/4 containing a minim and a crotchet.", "3/4"), caption: "3/4: three crotchet beats in every bar." },
      { music: rhythm([[nt("crotchet"), nt("crotchet"), nt("minim")]], "A bar of 4/4 containing two crotchets and a minim.", "4/4"), caption: "4/4: four crotchet beats in every bar." },
      { tip: "4/4 is sometimes written as a letter C, called common time. It means exactly the same as 4/4." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[nt("minim"), nt("crotchet")], [nt("crotchet"), nt("minim")]], "Two bars of 3/4: a minim and a crotchet, then a crotchet and a minim. Each adds up to three beats.", "3/4"),
      steps: ["Press Play all and count 'one, two, three' in each bar.", "In 3/4 every bar has three crotchet beats, however the notes are shaped.", "Try 2/4 and 4/4 in the questions: only the top number changes."],
      text: "Two bars of 3/4 music, each adding up to three crotchet beats.",
    },
    guided: [
      { t: "t.g1.time-signature", correct: "Right: you added up the beats in the bar." },
      { t: "t.g1.bar-judge", when: total, correct: "That bar matches the time signature." },
    ],
    independent: [
      { t: "t.g1.time-signature", correct: "Good: the time signature matches the beats." },
      { t: "t.g1.bar-judge", when: total, correct: "That bar holds the right number of beats." },
      { t: "t.g1.time-signature", correct: "Counted correctly." },
      { t: "t.g1.bar-judge", when: total, correct: "Correct." },
      { t: "t.g1.time-signature", correct: "Right." },
      { t: "t.g1.bar-judge", when: total, correct: "The bar that adds up." },
    ],
    recap: ["The top number is the number of beats in a bar.", "The bottom 4 means the beat is a crotchet.", "2/4 = two beats, 3/4 = three, 4/4 = four (common time, C)."],
    review: [{ t: "t.g1.time-signature", afterDays: 1 }, { t: "t.g1.bar-judge", afterDays: 3 }, { t: "t.g1.time-signature", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 05. The common-time sign is taught here as information; it is not assessed.",
  },
  {
    node: "G1-U2-L03",
    version: 1,
    objective: { statement: "Fill a bar with notes and rests that add up to the time signature.", criteria: ["I can add up the beats already in a bar.", "I can work out how many beats are missing.", "I can finish the bar with notes or rests."] },
    explain: [
      { text: "To finish a bar, first add up the beats you already have, then work out how many are missing." },
      { music: rhythm([[nt("crotchet"), nt("crotchet")]], "A bar for 3/4 with two crotchets so far: one beat is missing."), caption: "This 3/4 bar holds 2 beats so far. One beat is missing." },
      { music: rhythm([[nt("crotchet"), nt("crotchet"), nt("crotchet")]], "The same 3/4 bar finished with a third crotchet.", "3/4"), caption: "A crotchet fills the gap. A crotchet rest would also work, and so would two quavers." },
      { text: "Usually there is more than one correct way to finish a bar. What matters is that the bar adds up exactly, and the beats are still easy to see." },
      { tip: "Check by counting aloud against the time signature. If you land on the last beat exactly, the bar is complete." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[nt("minim"), nt("crotchet")], [nt("crotchet"), nt("crotchet"), nt("crotchet")], [nt("crotchet"), rs("crotchet"), nt("crotchet")]], "Three bars of 3/4: a minim and a crotchet; three crotchets; and a crotchet, a crotchet rest and a crotchet.", "3/4"),
      steps: ["Play all and count 'one, two, three' in every bar.", "All three bars fill 3/4 exactly, in different ways.", "A rest counts towards the total just like a note."],
      text: "Three different ways to fill a bar of 3/4: a minim and crotchet, three crotchets, or a crotchet, rest and crotchet.",
    },
    guided: [
      { t: "t.g1.bar-complete", correct: "The bar adds up exactly." },
      { t: "t.g1.bar-judge", when: total, correct: "Counted correctly." },
    ],
    independent: [
      { t: "t.g1.bar-complete", correct: "A complete bar that adds up." },
      { t: "t.g1.bar-judge", when: total, correct: "That bar adds up." },
      { t: "t.g1.bar-complete", correct: "Finished with the right total." },
      { t: "t.g1.bar-judge", when: total, correct: "Correct." },
      { t: "t.g1.bar-complete", correct: "Another complete bar." },
      { t: "t.g1.bar-judge", when: total, correct: "Counted correctly." },
    ],
    recap: ["Add up what is in the bar, then work out what is missing.", "Notes and rests both count.", "More than one answer can be right if the bar adds up and the beats are clear."],
    review: [{ t: "t.g1.bar-complete", afterDays: 1 }, { t: "t.g1.bar-judge", afterDays: 3 }, { t: "t.g1.bar-complete", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcomes 05 and 06. Any answer that fills the bar and keeps the beats clear is accepted by the grader (acceptAnyRuleCompliant).",
  },
  {
    node: "G1-U2-L04",
    version: 1,
    objective: { statement: "Group short notes with beams so that the beats can be seen.", criteria: ["I beam quavers and semiquavers within a beat.", "I do not join notes across a beat that should stay visible.", "I can pick the bar whose beats are grouped clearly."] },
    explain: [
      { text: "When a bar contains short notes, we join them with beams in groups that show the beat. This makes the music easy to read at a glance." },
      { music: rhythm([[nt("quaver", { beam: "begin" }), nt("quaver", { beam: "end" }), nt("quaver", { beam: "begin" }), nt("quaver", { beam: "end" }), nt("minim")]], "A bar of 4/4: two pairs of beamed quavers, then a minim.", "4/4"), caption: "Each pair of quavers is one beat, so each pair has its own beam." },
      { music: rhythm([[nt("quaver"), nt("quaver"), nt("quaver"), nt("quaver"), nt("minim")]], "The same bar with every quaver written with a flag and no beams.", "4/4"), caption: "The same rhythm with flags only is harder to read. Beam quavers in groups that fill a beat." },
      { text: "In 4/4, keep the middle of the bar visible: do not run a beam from beat 2 into beat 3. Start a new beam on each beat." },
      { tip: "In 2/4, 3/4 and 4/4 each crotchet beat gets its own group: a pair of quavers, or four semiquavers." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[nt("quaver", { beam: "begin" }), nt("quaver", { beam: "end" }), nt("crotchet"), nt("semiquaver", { beam: "begin" }), nt("semiquaver", { beam: "continue" }), nt("semiquaver", { beam: "continue" }), nt("semiquaver", { beam: "end" }), nt("crotchet")]], "One bar of 4/4: two beamed quavers, a crotchet, four beamed semiquavers and a crotchet.", "4/4"),
      steps: ["Play all and tap the beat. Each beam covers exactly one beat.", "Beat one: two quavers. Beat two: a crotchet. Beat three: four semiquavers. Beat four: a crotchet.", "Every beat is easy to find because the beams never run across a beat boundary."],
      text: "A bar of 4/4 with each beat shown separately: a beamed pair of quavers, a crotchet, four beamed semiquavers and a crotchet.",
    },
    guided: [
      { t: "t.g1.grouping", correct: "Grouped so every beat is clear." },
      { t: "t.g1.bar-judge", when: grouping, correct: "That bar shows its beats clearly." },
    ],
    independent: [
      { t: "t.g1.grouping", correct: "Beamed in beat-sized groups." },
      { t: "t.g1.bar-judge", when: grouping, correct: "Clear beats." },
      { t: "t.g1.bar-complete", correct: "A complete bar with the beats clear." },
      { t: "t.g1.bar-judge", when: grouping, correct: "The beats are easy to see." },
      { t: "t.g1.grouping", correct: "Grouped correctly." },
      { t: "t.g1.bar-complete", correct: "Complete and clear." },
    ],
    recap: ["Beam short notes in groups that fill a beat.", "Do not run a beam across the middle of a 4/4 bar.", "Grouping makes the beats easy to see."],
    review: [{ t: "t.g1.grouping", afterDays: 1 }, { t: "t.g1.bar-judge", afterDays: 3 }, { t: "t.g1.bar-complete", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 07. TEACHER TO CONFIRM: the 'keep the middle of a 4/4 bar visible' beaming rule is implemented in the rule set (rhythm.ts); confirm it is a Grade 1 requirement and not a Grade 2 refinement.",
  },
  {
    node: "G1-U2-L05",
    version: 1,
    objective: { statement: "Decide when a tie is needed and when one note is clearer.", criteria: ["I use one note when a single note value fits.", "I use a tie only when no single note fits, such as across a bar-line.", "I can spot an unnecessary tie."] },
    explain: [
      { text: "A tie makes a note longer by joining it to another note of the same pitch. But if one note can show the same length, use the one note: it is easier to read." },
      { music: rhythm([[nt("crotchet", { tie: true }), nt("crotchet"), nt("minim")]], "A 4/4 bar starting with two crotchets tied together and then a minim.", "4/4"), caption: "Two tied crotchets in the same bar are just a minim. Write a minim instead." },
      { music: rhythm([[nt("minim"), nt("minim")]], "The same bar written with two minims.", "4/4"), caption: "Better: one minim and one minim. Same sound, clearer to read." },
      { text: "Ties are for lengths that no single note can show, and for notes that last across a bar-line. In your Grade 1 bars, look for ties that join two notes you could have written as one." },
      { tip: "Ask: could one note value do this job? If yes, use it. If the tie crosses a bar-line, keep it." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[nt("crotchet"), nt("crotchet"), nt("crotchet"), nt("crotchet", { tie: true })], [nt("minim"), nt("minim")]], "Two bars of 4/4. The first ends with a crotchet tied over the bar-line to a minim in the next bar.", "4/4"),
      steps: ["Play all. The tie at the end of bar one carries the sound across the bar-line.", "That tie is needed: no single note can sit across a bar-line.", "Within a bar, two tied notes that could be one note are unnecessary."],
      text: "Two bars of 4/4 with a tie across the bar-line, which is the right place for a tie.",
    },
    guided: [
      { t: "t.g1.bar-judge", when: tieBar, correct: "That bar avoids the unnecessary tie." },
      { t: "t.g1.bar-fix", when: has("tie"), correct: "Rewritten with no unnecessary tie." },
    ],
    independent: [
      { t: "t.g1.bar-judge", when: tieBar, correct: "No tie where one note would do." },
      { t: "t.g1.bar-fix", when: has("tie"), correct: "Rewritten clearly: same sound, no unnecessary tie." },
      { t: "t.g1.bar-judge", when: tieBar, correct: "Clear writing." },
      { t: "t.g1.bar-fix", when: has("tie"), correct: "Right." },
      { t: "t.g1.bar-judge", when: tieBar, correct: "Correct." },
      { t: "t.g1.bar-fix", when: has("tie"), correct: "Handled correctly." },
    ],
    recap: ["If a single note can show the length, use it.", "Use a tie when no single note will do, or when crossing a bar-line.", "An unnecessary tie makes music harder to read."],
    review: [{ t: "t.g1.bar-judge", afterDays: 1 }, { t: "t.g1.grouping", afterDays: 3 }, { t: "t.g1.bar-judge", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcome 07 (ties in bars). Whether Grade 1 asks learners to spot ties across bar-lines is flagged for the teacher.",
  },
  {
    node: "G1-U2-L06",
    version: 1,
    objective: { statement: "Write rests in a bar so that every beat can be seen.", criteria: ["I give each beat its own rest.", "I know a minim rest may fill the first or last two beats of a 4/4 bar.", "I can complete a bar that contains rests."] },
    explain: [
      { text: "Rests need grouping just like notes. The simple rule is that every beat gets its own rest, so the beats stay visible." },
      { music: rhythm([[nt("crotchet"), rs("crotchet"), rs("crotchet"), nt("crotchet")]], "A bar of 4/4: a crotchet, two crotchet rests and a crotchet.", "4/4"), caption: "Beats two and three are silent, so each gets its own crotchet rest." },
      { music: rhythm([[nt("crotchet"), rs("minim"), nt("crotchet")]], "A bar of 4/4 where one minim rest covers beats two and three.", "4/4"), caption: "A minim rest across beats 2 and 3 hides the half-way point of the bar, so avoid it." },
      { text: "In 4/4 you may use a minim rest to fill beats one and two together, or beats three and four together. That keeps the half-bar clear." },
      { tip: "If you are unsure, use one crotchet rest for each silent beat." },
    ],
    demo: {
      widget: "rhythm",
      music: rhythm([[rs("minim"), nt("crotchet"), nt("crotchet")], [nt("crotchet"), rs("crotchet"), nt("minim")]], "Two bars of 4/4. The first has a minim rest then two crotchets. The second has a crotchet, a crotchet rest and a minim.", "4/4"),
      steps: ["Play all and count. In bar one, beats one and two are silent.", "In bar two, beat two is a single silent beat.", "Each rest lines up with the beat, so the pattern is easy to follow."],
      text: "Two bars of 4/4 with rests in clear places: a minim rest on beats one and two, and a crotchet rest on beat two.",
    },
    guided: [
      { t: "t.g1.bar-judge", when: restBar, correct: "That bar writes its rests clearly." },
      { t: "t.g1.bar-complete", when: hasRest, correct: "Rests used to finish the bar." },
    ],
    independent: [
      { t: "t.g1.bar-judge", when: restBar, correct: "Each beat can be seen." },
      { t: "t.g1.bar-complete", when: hasRest, correct: "A complete bar with rests." },
      { t: "t.g1.bar-judge", when: restBar, correct: "Rests grouped correctly." },
      { t: "t.g1.bar-fix", when: has("rests in this bar"), correct: "Every beat can now be seen." },
      { t: "t.g1.bar-judge", when: restBar, correct: "Clear rests." },
      { t: "t.g1.bar-complete", when: hasRest, correct: "Complete and clear." },
    ],
    recap: ["Give each beat its own rest.", "In 4/4 a minim rest may fill beats 1-2 or beats 3-4.", "Notes and rests together must add up to the time signature."],
    review: [{ t: "t.g1.bar-judge", afterDays: 1 }, { t: "t.g1.bar-complete", afterDays: 3 }, { t: "t.g1.bar-judge", afterDays: 7 }],
    notes: "Original wording. Follows Grade 1 outcomes 02 and 07. TEACHER TO CONFIRM: the rest-grouping conventions encoded in the rule set (including rejecting a 3/4 minim rest) are flagged as pending review in EXERCISE_ENGINE section 10.",
  },
];
