/**
 * Grade 1 generators added in Brief 05 (one per new template; see content/exercises/templates/grade-1.json).
 *
 * Brief 04 showed that a concept with a single template, or a template that can only ask a handful of distinct questions,
 * can never reach "proficient" or "mastered" without weakening the policy. These generators add genuinely different
 * ways of showing the same understanding (reading a position, counting round the alphabet, judging a bar, naming a
 * term from its meaning ...), each with a large pool of distinct questions inside the Grade 1 boundary. Every
 * answer is derived by the music rules, not typed per item. Wrong options carry a `diagnosis` so a learner who picks
 * one is told which misconception it matches.
 *
 * Existing templates and generators are untouched, so stored ids for them stay valid.
 */
import { music, type AnswerSpec, type NotationFragment } from "@mtp/curriculum";
import { staffTargets } from "../graders/pitch.ts";
import { frag, maxLedger, nameOf, note, r, type Gen } from "./families.ts";

const { naturalAt } = music;
type Pitch = music.Pitch;
type Clef = music.Clef;

const LETTERS = music.STEPS as readonly string[];
const letterOpts = (ids: readonly string[]) => ids.map((l) => ({ id: l, label: l }));

type Diagnoses = NonNullable<Extract<AnswerSpec, { kind: "choice" }>["diagnoses"]>;
const ORD = (n: number) => music.ordinal(n);

/** A keyboard picture with the given keys highlighted. */
function keyboardPicture(pitches: string[], text: string): NotationFragment {
  return { presentation: "keyboard", clef: "treble", showKeySignature: false, measures: [{ events: pitches.map((p) => note(p)) }], textAlternative: text } as NotationFragment;
}

/** Four distinct letters containing `answer`, usually including a neighbour so a near-miss is possible. */
function fourLetters(c: Parameters<Gen>[0], answer: string): string[] {
  const i = LETTERS.indexOf(answer);
  const near = c.rng.shuffle([LETTERS[(i + 1) % 7]!, LETTERS[(i + 6) % 7]!]).slice(0, c.rng.int(1, 2));
  const far = c.rng.shuffle(LETTERS.filter((l) => l !== answer && !near.includes(l)));
  const picks = [answer, ...near, ...far].slice(0, 4);
  return c.rng.shuffle(picks);
}

/** t.g1.letter-names: the musical alphabet and the white keys. */
export const letterNames: Gen = (c) => {
  const mode = c.rng.pick(["name-key", "name-key", "alphabet", "walk"] as const);
  if (mode === "name-key") {
    const step = c.rng.pick(LETTERS);
    const octave = c.rng.pick([3, 4, 5]);
    const p = `${step}${octave}`;
    const opts = fourLetters(c, step);
    const i = LETTERS.indexOf(step);
    const diagnoses: Diagnoses = {};
    for (const o of opts) if (o !== step && (o === LETTERS[(i + 1) % 7] || o === LETTERS[(i + 6) % 7])) diagnoses[o] = { category: "white-key-off-by-one", reason: `${o} is the key next door. Find the group of two or three black keys first, then count along the white keys from C or F.` };
    return {
      prompt: "Which letter name belongs to the highlighted key?",
      music: keyboardPicture([p], `A piano keyboard with one white key highlighted: ${step}${step === "C" && octave === 4 ? " (middle C)" : ""}.`),
      answer: { kind: "choice", options: letterOpts(opts), correctOptionIds: [step], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
      hints: ["C is the white key just to the left of a group of two black keys; F is just to the left of a group of three.", "From C the white keys run C, D, E, F, G, A, B."],
    };
  }
  if (mode === "alphabet") {
    const step = c.rng.pick(LETTERS);
    const after = c.rng.chance(0.5);
    const i = LETTERS.indexOf(step);
    const answer = LETTERS[(i + (after ? 1 : 6)) % 7]!;
    const wrapNote = answer === "A" && after ? " After G the alphabet starts again at A." : answer === "G" && !after ? " Before A comes G, because the alphabet loops round." : "";
    const opts = fourLetters(c, answer);
    const diagnoses: Diagnoses = {};
    const twice = LETTERS[(i + (after ? 2 : 5)) % 7]!;
    if (opts.includes(twice)) diagnoses[twice] = { category: "white-key-off-by-one", reason: `${twice} is two letters away. Take just one step ${after ? "forward" : "back"} from ${step}.` };
    return {
      prompt: `In the musical alphabet, which letter comes straight ${after ? "after" : "before"} ${step}?${wrapNote ? "" : ""}`,
      answer: { kind: "choice", options: letterOpts(opts), correctOptionIds: [answer], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
      hints: ["The musical alphabet only uses A B C D E F G, then starts again at A.", "Say the letters in order, out loud if you like, and stop on the one you want."],
      correct: `Yes: ${answer}.${wrapNote}`,
    };
  }
  // walk: count white keys along the keyboard from a highlighted key.
  const start = c.rng.pick(LETTERS);
  const dist = c.rng.pick([1, 2, 3]);
  const up = c.rng.chance(0.5);
  const i = LETTERS.indexOf(start);
  const answer = LETTERS[(i + (up ? dist : 7 - dist)) % 7]!;
  const octave = 4;
  const opts = fourLetters(c, answer);
  const diagnoses: Diagnoses = {};
  const wrongWay = LETTERS[(i + (up ? 7 - dist : dist)) % 7]!;
  if (opts.includes(wrongWay) && wrongWay !== answer) diagnoses[wrongWay] = { category: "white-key-off-by-one", reason: `That is ${dist} white key${dist > 1 ? "s" : ""} the other way. Moving right makes the pitch higher; moving left makes it lower.` };
  return {
    prompt: `Start on the highlighted key. Move ${dist} white key${dist > 1 ? "s" : ""} to the ${up ? "right" : "left"}. Which letter do you reach?`,
    music: keyboardPicture([`${start}${octave}`], `A piano keyboard with ${start} highlighted.`),
    answer: { kind: "choice", options: letterOpts(opts), correctOptionIds: [answer], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
    hints: ["Count each white key you pass, not the key you start on.", "Right is higher, left is lower."],
  };
};

const POSITION_LABEL = (pos: number) => (pos % 2 === 0 ? `${ORD(pos / 2 + 1)} line` : `${ORD((pos - 1) / 2 + 1)} space`);

/** t.g1.stave-facts: the stave, counting lines and spaces, and the two clefs. */
export const staveFacts: Gen = (c) => {
  const clefs = (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];
  const mode = c.rng.pick(["position", "position", "position", "clef-id", "clef-line", "count"] as const);
  if (mode === "count") {
    const lines = c.rng.chance(0.5);
    const answer = lines ? "5" : "4";
    return {
      prompt: `How many ${lines ? "lines" : "spaces"} does a stave have?`,
      answer: { kind: "choice", options: ["3", "4", "5", "6"].map((x) => ({ id: x, label: x })), correctOptionIds: [answer], diagnoses: { [lines ? "4" : "5"]: { category: "line-space-swap", reason: "You have counted the lines when the question is about spaces (or the other way round). There is always one more line than there are spaces." } } },
      hints: ["A stave has five lines, and the spaces are the gaps between them."],
    };
  }
  if (mode === "clef-id" || mode === "clef-line") {
    if (!clefs.includes("treble") || !clefs.includes("bass")) return null;
    const clef = c.rng.pick(["treble", "bass"] as const);
    if (mode === "clef-id") {
      const p: Pitch = naturalAt(clef, c.rng.pick([0, 2, 4, 6, 8, 1, 3, 5, 7]));
      return {
        prompt: "Which clef is at the start of this stave?",
        music: frag(clef, [{ events: [note(p)] }], `A ${clef}-clef stave with one note.`),
        answer: { kind: "choice", options: [{ id: "treble", label: "Treble clef" }, { id: "bass", label: "Bass clef" }], correctOptionIds: [clef], diagnoses: { [clef === "treble" ? "bass" : "treble"]: { category: "clef-confusion", reason: clef === "treble" ? "The treble clef has a curl that winds round the second line. The bass clef is the one with two dots." : "The bass clef has two dots, one above and one below the line for F. The treble clef is the one with the winding curl." } } },
        hints: ["The treble clef winds round a line like a curl; the bass clef is a hook with two dots."],
      };
    }
    const target = clef === "treble" ? "G" : "F";
    const opts = fourLetters(c, target);
    return {
      prompt: clef === "treble" ? "The treble clef curls round one line. Which note is on that line?" : "The two dots of the bass clef sit either side of one line. Which note is on that line?",
      music: frag(clef, [{ events: [r("semibreve")] }], `A ${clef}-clef stave with the clef and a rest, but no notes.`),
      answer: { kind: "choice", options: letterOpts(opts), correctOptionIds: [target], diagnoses: Object.fromEntries(opts.filter((o) => o !== target && (clef === "treble" ? o === "F" : o === "G")).map((o) => [o, { category: "clef-confusion", reason: clef === "treble" ? "F is the note the bass clef marks. The treble clef marks G." : "G is the note the treble clef marks. The bass clef marks F." }])) },
      hints: [clef === "treble" ? "The treble clef is also called the G clef." : "The bass clef is also called the F clef."],
    };
  }
  // position: which line or space is this note on, counting from the bottom?
  const clef = c.rng.pick(clefs);
  const pos = c.rng.int(0, 8);
  const p = naturalAt(clef, pos);
  if (music.ledgerLines(clef, p) > maxLedger(c)) return null;
  const answer = POSITION_LABEL(pos);
  const fromTop = pos % 2 === 0 ? POSITION_LABEL(8 - pos) : POSITION_LABEL(8 - pos);
  const swapped = POSITION_LABEL(pos % 2 === 0 ? Math.min(8, pos + 1) : pos - 1);
  const pool = c.rng.shuffle([...new Set([answer, fromTop, swapped, ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(POSITION_LABEL)])]);
  const opts = [answer, ...[fromTop, swapped].filter((o) => o !== answer), ...pool.filter((o) => o !== answer && o !== fromTop && o !== swapped)].slice(0, 4);
  const diagnoses: Diagnoses = {};
  if (fromTop !== answer && opts.includes(fromTop)) diagnoses[fromTop] = { category: "counted-from-top", reason: "That is where the note would be if you counted from the top. Always count from the bottom of the stave." };
  if (opts.includes(swapped) && swapped !== answer && swapped !== fromTop) diagnoses[swapped] = { category: "line-space-swap", reason: pos % 2 === 0 ? "This note sits ON a line, with the line running through its middle, not in a space." : "This note sits in a space, between two lines, not on a line." };
  const shuffled = c.rng.shuffle(opts);
  return {
    prompt: "Counting from the bottom of the stave, where is this note?",
    music: frag(clef, [{ events: [note(p)] }], `A ${clef}-clef stave with one note on the ${describe(pos)}.`),
    answer: { kind: "choice", options: shuffled.map((o) => ({ id: o.replace(/ /g, "-"), label: o })), correctOptionIds: [answer.replace(/ /g, "-")], ...(Object.keys(diagnoses).length ? { diagnoses: Object.fromEntries(Object.entries(diagnoses).map(([k, v]) => [k.replace(/ /g, "-"), v])) } : {}) },
    hints: ["Lines and spaces are both counted from the bottom: the bottom line is the 1st line, the gap above it is the 1st space."],
  };
};
const describe = (pos: number) => POSITION_LABEL(pos);

/** t.g1.note-place: write a named note on a stated line or in a stated space (or on the ledger line for middle C). */
export const notePlace: Gen = (c) => {
  const clefs = (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];
  const clef = c.rng.pick(clefs);
  const max = maxLedger(c);
  const wantLedger = max > 0 && c.rng.chance(0.2);
  if (wantLedger) {
    // Middle C is the one ledger-line note in Grade 1: one line below the treble stave, one above the bass stave.
    const mid = clef === "treble" ? "C4" : clef === "bass" ? "C4" : null;
    if (!mid) return null;
    const answer = { kind: "staff-position" as const, clef, target: { step: "C" as const, alter: 0, position: "any" as const, maxLedgerLines: 1, octave: 4 }, accepted: [] as string[], octaveSensitive: true };
    const valid = staffTargets(answer, 1).filter((p) => music.formatPitch(p) === mid);
    if (!valid.length) return null;
    answer.accepted = valid.map((p) => music.formatPitch(p));
    return {
      prompt: `Write middle C in the ${clef} clef. Middle C sits on a short ledger line, ${clef === "treble" ? "just below" : "just above"} the stave.`,
      answer,
      hints: [clef === "treble" ? "Middle C is the note one ledger line below the treble stave." : "Middle C is the note one ledger line above the bass stave."],
    };
  }
  const line = c.rng.chance(0.5);
  const pos = line ? c.rng.pick([0, 2, 4, 6, 8]) : c.rng.pick([1, 3, 5, 7]);
  const p = naturalAt(clef, pos);
  const step = p.step;
  const answer = { kind: "staff-position" as const, clef, target: { step, alter: 0, position: (line ? "line" : "space") as "line" | "space", maxLedgerLines: 0 }, accepted: [] as string[], octaveSensitive: true };
  const valid = staffTargets(answer, 0);
  if (!valid.length) return null;
  answer.accepted = valid.map((q) => music.formatPitch(q));
  return {
    prompt: `Write ${nameOf({ step, alter: 0 })} ${line ? "on a line" : "in a space"} of the ${clef}-clef stave.`,
    answer,
    hints: [`In the ${clef} clef the bottom line is ${nameOf({ step: naturalAt(clef, 0).step, alter: 0 })}. Count up the lines and spaces, one letter each, until you reach ${step}.`],
  };
};

export const GRADE1_GENERATORS: Record<string, Gen> = {
  "t.g1.letter-names": letterNames,
  "t.g1.stave-facts": staveFacts,
  "t.g1.note-place": notePlace,
};
