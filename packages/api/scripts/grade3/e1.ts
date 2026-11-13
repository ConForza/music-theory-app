import type { ExerciseItem } from "@mtp/curriculum";
import { nt, rhythm } from "./lib3.ts";

const choice = (id: string, evidence: "learning" | "independent", prompt: string, options: Array<[string, string]>, right: string, correct: string, diagnoses: Record<string, { category: string; reason: string }>): ExerciseItem =>
  ({
    id,
    templateId: "t.g3.upbeat-facts",
    templateVersion: 1,
    seed: null,
    evidence,
    prompt,
    answer: { kind: "choice", options: options.map(([i, l]) => ({ id: i, label: l })), correctOptionIds: [right], diagnoses },
    hints: ["The upbeat and the last bar together make one whole bar."],
    feedback: { correct, mistakes: Object.fromEntries(Object.values(diagnoses).map((d) => [d.category, d.reason])), fallback: "Not quite. This lesson is optional, so take your time: the opening upbeat and the last bar together add up to one full bar." },
  }) as unknown as ExerciseItem;
const wrong = (reason: string) => ({ category: "evidence-misread", reason });

/** Optional enrichment: upbeat (anacrusis) starts. Never in any challenge, review, assessment or mastery count. */
export function enrichment() {
  return {
    schemaVersion: 1,
    id: "lc.G3-U2-E1",
    lessonId: "G3-U2-E1",
    contentVersion: 1,
    locale: "en-GB",
    objective: { statement: "Optional: understand music that begins before the first bar-line.", successCriteria: ["I know a piece can start with an upbeat before the first bar-line.", "I know the upbeat and the last bar together make one whole bar.", "I know this lesson is optional and is not in the Grade 3 assessment."] },
    explanation: [
      { kind: "text", text: "This lesson is optional. It helps you read music, but you do not need it to complete Grade 3, and nothing in it is in the Grade 3 assessment." },
      { kind: "text", text: "Many tunes begin with a note, or a few notes, before the first bar-line. This is called an upbeat, or an anacrusis. The first full bar starts after the upbeat." },
      { kind: "notation", music: rhythm([[nt("crotchet")], [nt("minim"), nt("minim")], [nt("minim"), nt("crotchet")]], "An upbeat of one crotchet, then a full bar of two minims, then a last bar of a minim and a crotchet.", undefined), caption: "An upbeat of one crotchet. The first full bar begins after it." },
      { kind: "text", text: "Because the piece starts part-way through a bar, the last bar is usually shorter than the others. The upbeat and the last bar together add up to one whole bar. A piece in 3/4 that starts with one crotchet upbeat can end with a last bar of two crotchets." },
      { kind: "text", text: "Whatever the length of the upbeat, group its notes as though they were the end of a bar. The last bar is grouped in the usual way, up to the point where the music stops." },
      { kind: "tip", text: "Upbeat + last bar = one whole bar." },
    ],
    demonstration: {
      widget: "rhythm",
      music: rhythm([[nt("crotchet")], [nt("minim"), nt("minim")], [nt("minim"), nt("crotchet")]], "An upbeat of one crotchet, a bar of two minims and a short last bar.", undefined),
      steps: ["Count one crotchet beat for the upbeat before the first bar-line.", "The full bar that follows has the length of the time signature.", "The last bar is one crotchet short. Together with the upbeat it makes one whole bar."],
      audio: { playback: "synth-generated", optional: true },
      textAlternative: "A crotchet upbeat, a full bar of two minims and a last bar of a minim and a crotchet.",
    },
    guided: [
      choice("i.g3-u2-e1.guided-1", "learning", "A tune starts with one crotchet before the first bar-line. What is this called?", [["upbeat", "An upbeat (anacrusis)"], ["tie", "A tie"], ["triplet", "A triplet"], ["pause", "A pause"]], "upbeat", "Yes: it is an upbeat.", { tie: wrong("A tie joins two notes of the same pitch. A note before the first bar-line is an upbeat."), triplet: wrong("A triplet is a group of three notes in a beat. A note before the first bar-line is an upbeat."), pause: wrong("A pause holds a note longer. A note before the first bar-line is an upbeat.") }),
      choice("i.g3-u2-e1.guided-2", "learning", "A piece in 3/4 starts with an upbeat of one crotchet. How many crotchet beats are in its last bar?", [["1", "One"], ["2", "Two"], ["3", "Three"]], "2", "Yes: one beat of upbeat plus two beats make a whole bar of three.", { "1": wrong("One crotchet plus one crotchet is only two beats. A bar of 3/4 needs three, so the last bar has two."), "3": wrong("Three beats would be a whole bar on its own. The upbeat already supplies one of them.") }),
    ],
    independent: [
      choice("i.g3-u2-e1.ind-1", "independent", "A piece in 4/4 starts with an upbeat of one crotchet. How many crotchet beats are in its last bar?", [["2", "Two"], ["3", "Three"], ["4", "Four"]], "3", "Right: one plus three makes four.", { "2": wrong("One plus two is only three beats. A bar of 4/4 needs four, so the last bar has three."), "4": wrong("Four beats would be a whole bar on its own.") }),
      choice("i.g3-u2-e1.ind-2", "independent", "A piece in 2/4 starts with an upbeat of one quaver. How many quavers are in its last bar? (A bar of 2/4 holds four quavers.)", [["2", "Two"], ["3", "Three"], ["4", "Four"]], "3", "Right: one quaver plus three quavers make a whole bar of four.", { "2": wrong("One plus two is only three quavers. A bar of 2/4 holds four."), "4": wrong("Four quavers would be a whole bar on its own.") }),
      choice("i.g3-u2-e1.ind-3", "independent", "A piece in 6/8 starts with an upbeat of one quaver. How many quavers are in its last bar? (A bar of 6/8 holds six quavers.)", [["3", "Three"], ["5", "Five"], ["6", "Six"]], "5", "Right: one plus five makes six.", { "3": wrong("One plus three is only four quavers. A bar of 6/8 holds six."), "6": wrong("Six quavers would be a whole bar on its own.") }),
      choice("i.g3-u2-e1.ind-4", "independent", "Is the upbeat lesson part of the Grade 3 assessment?", [["yes", "Yes"], ["no", "No, it is optional"]], "no", "Right: it is optional enrichment.", { yes: wrong("This lesson is optional and is never asked in the Grade 3 assessment.") }),
    ],
    recap: ["An upbeat is a note or notes before the first bar-line.", "The upbeat and the last bar together make one whole bar.", "This lesson is optional."],
    spacedReview: [{ templateId: "t.g3.upbeat-facts", afterDays: 7 }],
    mastery: {
      conceptIds: ["c.metre.anacrusis"],
      countsAsEvidence: "independent-steps-only",
      completion: "Optional enrichment. It is complete when every step has been answered correctly. It never counts towards Grade 3 mastery, a unit challenge or the Grade 3 assessment, and it never gates any other node.",
    },
    provenance: {
      authoredBy: "Music Theory Path curriculum team (Brief 07, drafted with AI assistance; pending qualified teacher review)",
      originality: "original",
      bookSectionIds: ["fs.g3.s05"],
      outcomeIds: ["abrsm2020.g3.02"],
      notes: "Optional enrichment (OPEN_QUESTIONS Q5). Book section 5 (upbeat starts) has no explicit outcome in the 2020 outline. Context melodies elsewhere in the course never use an upbeat.",
    },
  };
}
