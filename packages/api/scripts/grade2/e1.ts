import type { ExerciseItem } from "@mtp/curriculum";
import { melody, stave, nms } from "./lib2.ts";

const choice = (id: string, evidence: "learning" | "independent", prompt: string, options: Array<[string, string]>, right: string, correct: string, diagnoses: Record<string, { category: string; reason: string }>): ExerciseItem =>
  ({
    id,
    templateId: "t.g2.melodic-preview",
    templateVersion: 1,
    seed: null,
    evidence,
    prompt,
    answer: { kind: "choice", options: options.map(([i, l]) => ({ id: i, label: l })), correctOptionIds: [right], diagnoses },
    hints: ["Think about which form of the minor scale Grade 2 asks for."],
    feedback: { correct, mistakes: Object.fromEntries(Object.values(diagnoses).map((d) => [d.category, d.reason])), fallback: "Not quite. This is an optional preview, so take your time and try again." },
  }) as unknown as ExerciseItem;

const A_HAR = ["A4", "B4", "C5", "D5", "E5", "F5", "G#5", "A5"];

/** Optional preview of the melodic minor (Grade 3). Never asked in any Grade 2 unit challenge, assessment, review or mastery count. */
export function enrichment() {
  return {
    schemaVersion: 1,
    id: "lc.G2-U4-E1",
    lessonId: "G2-U4-E1",
    contentVersion: 1,
    locale: "en-GB",
    objective: { statement: "Take an optional look ahead at the melodic minor, a scale you will need in Grade 3.", successCriteria: ["I know Grade 2 only asks for the harmonic minor.", "I know the melodic minor changes going up and coming down.", "I know this preview is optional and is not in the Grade 2 assessment."] },
    explanation: [
      { kind: "text", text: "This lesson is a short, optional look ahead. You do not need it for Grade 2: the Grade 2 assessment only asks for the harmonic minor you have just learned." },
      { kind: "text", text: "The harmonic minor has a big step (a tone and a half) between the 6th and 7th notes. Many melodies sound smoother without that step. The melodic minor smooths it away in a different way." },
      { kind: "notation", music: stave("treble", nms(A_HAR), "A harmonic minor going up: A, B, C, D, E, F, G sharp, A."), caption: "Harmonic minor, the Grade 2 scale: only the 7th is raised." },
      { kind: "text", text: "Going up, the melodic minor raises both the 6th and the 7th notes. Coming down, it uses the notes of the key signature again. So the melodic minor is different going up and coming down." },
      { kind: "text", text: "You will learn to write it properly in Grade 3. Until then, remember: for Grade 2, the harmonic minor is all you need." },
      { kind: "tip", text: "Grade 2 = harmonic minor. Grade 3 adds the melodic minor." },
    ],
    demonstration: {
      widget: "staff-and-keyboard",
      music: stave("treble", nms(A_HAR), "A harmonic minor going up, with G sharp as the 7th note."),
      steps: ["Play the harmonic minor you know: A, B, C, D, E, F, G♯, A.", "Notice the big step from F up to G♯. The melodic minor avoids it going up by raising F as well.", "That is the whole idea for now: the melodic minor is a Grade 3 topic."],
      audio: { playback: "synth-generated", optional: true },
      textAlternative: "A harmonic minor scale on the treble stave, shown as a reminder before the Grade 3 preview.",
    },
    guided: [
      choice("i.g2-u4-e1.guided-1", "learning", "Which form of the minor scale does Grade 2 ask for?", [["harmonic", "The harmonic minor"], ["melodic", "The melodic minor"]], "harmonic", "Yes: the harmonic minor is the Grade 2 form.", { melodic: { category: "wrong-minor-form", reason: "The melodic minor is a Grade 3 topic. Grade 2 asks only for the harmonic minor." } }),
    ],
    independent: [
      choice("i.g2-u4-e1.ind-1", "independent", "Is the melodic minor in the Grade 2 assessment?", [["yes", "Yes"], ["no", "No, it is a Grade 3 topic"]], "no", "Right: it is only a preview here.", { yes: { category: "wrong-minor-form", reason: "The Grade 2 assessment only asks for the harmonic minor. The melodic minor comes in Grade 3." } }),
      choice("i.g2-u4-e1.ind-2", "independent", "In the melodic minor, going up, which notes are raised?", [["7", "Only the 7th"], ["67", "The 6th and the 7th"], ["3", "The 3rd"]], "67", "Yes: both the 6th and the 7th go up. You will practise this in Grade 3.", { "7": { category: "wrong-minor-form", reason: "Only the 7th is raised in the harmonic minor. The melodic minor raises the 6th as well, going up." }, "3": { category: "wrong-minor-form", reason: "The 3rd stays lower in every minor scale: it is what makes the scale minor." } }),
    ],
    recap: ["Grade 2 asks only for the harmonic minor.", "The melodic minor raises the 6th and 7th going up and is different coming down.", "You will learn to write it in Grade 3."],
    spacedReview: [{ templateId: "t.g2.melodic-preview", afterDays: 7 }],
    mastery: {
      conceptIds: ["c.scales.minor-melodic-preview"],
      countsAsEvidence: "independent-steps-only",
      completion: "Optional enrichment. It is complete when every step has been answered correctly. It never counts towards Grade 2 mastery, a unit challenge or the Grade 2 assessment.",
    },
    provenance: {
      authoredBy: "Music Theory Path curriculum team (Brief 06, drafted with AI assistance; pending qualified teacher review)",
      originality: "original",
      bookSectionIds: ["fs.g2.s09", "fs.g2.s11"],
      outcomeIds: ["abrsm2020.g2.07"],
      notes: "Optional enrichment. Book section 11 (the melodic minor) is deferred to Grade 3 core, as the official 2020 Grade 2 outline asks only for the harmonic form.",
    },
  };
}
void melody;
