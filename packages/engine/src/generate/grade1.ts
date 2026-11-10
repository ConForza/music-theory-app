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
import { music, type AnswerSpec, type Measure, type NotationEvent, type NotationFragment } from "@mtp/curriculum";
import { staffTargets } from "../graders/pitch.ts";
import { fits } from "./families.ts";
import { frag, maxLedger, nameOf, n, note, pretty, r, randomBar, rhythmLine, tsOf, type Gen } from "./families.ts";

const { naturalAt, parsePitch: P } = music;
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


// ---------------------------------------------------------------------------
// Unit 1: long and short sounds
// ---------------------------------------------------------------------------

type Value = music.NoteValue;
const VALUE_ORDER: Value[] = ["semibreve", "minim", "crotchet", "quaver", "semiquaver"];
const BEAMABLE = new Set<Value>(["quaver", "semiquaver"]);
const beats = (f: music.Fraction) => (f.n * 4) / f.d; // crotchet beats
const beatsText = (b: number) => (Number.isInteger(b) ? String(b) : `${Math.floor(b)}${b % 1 === 0.5 ? "½" : `+${b % 1}`}`.replace(/^0½$/, "½"));
const valuesOf = (c: { scope: { noteValues?: readonly string[] } }): Value[] => VALUE_ORDER.filter((v) => (c.scope.noteValues?.length ? c.scope.noteValues : VALUE_ORDER).includes(v));
const dur = (e: NotationEvent) => (e.kind === "tuplet" ? music.frac(0) : music.dotted(e.duration.value, e.duration.dots ?? 0));
const sumBeats = (evs: NotationEvent[]) => evs.reduce((t, e) => t + beats(dur(e)), 0);

/** Join runs of adjacent short notes that fit inside one crotchet beat with beams (as a printed score would). */
function beamRuns(evs: NotationEvent[]): NotationEvent[] {
  const out = evs.map((e) => ({ ...e })) as Array<NotationEvent & { beam?: string }>;
  let i = 0;
  while (i < out.length) {
    const e = out[i]!;
    if (e.kind === "note" && BEAMABLE.has(e.duration.value) && !(e.duration.dots ?? 0) && !e.tieToNext) {
      let j = i;
      let t = 0;
      while (j < out.length) {
        const x = out[j]!;
        if (!(x.kind === "note" && BEAMABLE.has(x.duration.value) && !(x.duration.dots ?? 0) && !x.tieToNext)) break;
        const next = t + beats(dur(x));
        if (next > 1) break;
        t = next;
        j++;
      }
      if (j - i >= 2) {
        for (let k = i; k < j; k++) out[k]!.beam = k === i ? "begin" : k === j - 1 ? "end" : "continue";
      }
      i = Math.max(j, i + 1);
    } else i++;
  }
  return out as NotationEvent[];
}

/** t.g1.note-total: how many crotchet beats do these notes and rests last altogether? */
export const noteTotal: Gen = (c) => {
  const vals = valuesOf(c);
  const rests = Boolean(c.scope.rests);
  const dots = (c.scope.maxDots ?? 0) >= 1;
  const ties = Boolean(c.scope.ties);
  const count = c.rng.int(2, 4);
  const evs: NotationEvent[] = [];
  for (let k = 0; k < count; k++) {
    const v = c.rng.pick(vals);
    const dotted = dots && v !== "semiquaver" && c.rng.chance(0.3);
    const isRest = rests && c.rng.chance(0.3);
    evs.push(isRest ? r(v, dotted ? 1 : 0) : n(v, dotted ? 1 : 0));
    if (ties && !isRest && !dotted && c.rng.chance(0.25)) {
      (evs[evs.length - 1] as { tieToNext?: boolean }).tieToNext = true;
      evs.push(n(v));
    }
  }
  const total = sumBeats(evs);
  if (total * 2 !== Math.round(total * 2) || total < 1 || total > 8) return null;
  const line = beamRuns(evs);
  // Mistakes a learner really makes, each shown only when it gives a different number from the right answer.
  const noDots = evs.reduce((t, e) => t + beats(music.dotted((e as { duration: { value: Value } }).duration.value, 0)), 0);
  const noRests = evs.filter((e) => e.kind !== "rest").reduce((t, e) => t + beats(dur(e)), 0);
  const firstOfTies = evs.reduce((t, e, k) => t + (k > 0 && (evs[k - 1] as { tieToNext?: boolean }).tieToNext ? 0 : beats(dur(e))), 0);
  const diag: Array<[number, string, string]> = [
    [noDots, "dot-misread", "A dot makes a note half as long again, so it adds to the total."],
    [noRests, "note-rest-confusion", "A rest lasts as long as the note of the same name, so rests count towards the total too."],
    [firstOfTies, "tie-dot-confusion", "A tie joins two notes into one longer sound, so both of them count."],
    [total * 2, "halved-or-doubled", "Count again, one note at a time, in crotchet beats."],
    [total / 2, "halved-or-doubled", "Count again, one note at a time, in crotchet beats."],
  ];
  const opts = new Map<number, [string, string] | null>([[total, null]]);
  for (const [v, cat, why] of diag) if (v > 0 && v !== total && !opts.has(v) && opts.size < 4 && v * 2 === Math.round(v * 2)) opts.set(v, [cat, why]);
  for (const extra of [total + 1, total - 1, total + 2, total + 0.5, total - 0.5]) if (opts.size < 4 && extra > 0 && !opts.has(extra)) opts.set(extra, null);
  const ordered = [...opts.keys()].sort((a, b) => a - b);
  const diagnoses = Object.fromEntries([...opts].filter(([, d]) => d).map(([v, d]) => [String(v * 2), { category: d![0], reason: d![1] }]));
  const hasRest = evs.some((e) => e.kind === "rest");
  return {
    prompt: `How many crotchet beats do these ${hasRest ? "notes and rests" : "notes"} last altogether?`,
    music: rhythmLine([{ events: line }]),
    answer: { kind: "choice", options: ordered.map((v) => ({ id: String(v * 2), label: beatsText(v) })), correctOptionIds: [String(total * 2)], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
    hints: ["Count in crotchet beats: semibreve 4, minim 2, crotchet 1, quaver ½, semiquaver ¼. A dot adds half again.", "Add the beats one note or rest at a time."],
  };
};

/** t.g1.note-equivalent: which single note lasts as long as all of these together? */
export const noteEquivalent: Gen = (c) => {
  const vals = valuesOf(c);
  const dotsMax = c.scope.maxDots ?? 0;
  const tied = Boolean(c.scope.ties) && c.rng.chance(0.4);
  const count = tied ? c.rng.pick([2, 2, 3, 4]) : c.rng.int(2, 4);
  const base = c.rng.pick(vals);
  const evs: NotationEvent[] = tied
    ? Array.from({ length: count }, (_, k) => n(base, 0, k < count - 1 ? { tieToNext: true } : {}))
    : Array.from({ length: count }, () => n(c.rng.pick(vals)));
  const total = evs.reduce((t, e) => music.add(t, dur(e)), music.frac(0));
  const answer = music.valueFor(total, dotsMax);
  if (!answer || !vals.includes(answer.value) || (answer.dots > 0 && dotsMax < 1)) return null;
  const nameOfValue = (v: Value, dots: number) => `${dots ? "dotted " : ""}${v}`;
  const correct = nameOfValue(answer.value, answer.dots);
  const i = VALUE_ORDER.indexOf(answer.value);
  const cand = new Map<string, [string, string] | null>([[correct, null]]);
  const dbl = VALUE_ORDER[i - 1];
  const half = VALUE_ORDER[i + 1];
  if (dbl && vals.includes(dbl)) cand.set(nameOfValue(dbl, 0), ["halved-or-doubled", "That note is twice as long as the notes added together. Add the beats first, then find the note with that many."]);
  if (half && vals.includes(half)) cand.set(nameOfValue(half, 0), ["halved-or-doubled", "That note is only half as long as the notes added together. Add the beats first, then find the note with that many."]);
  for (const v of c.rng.shuffle(vals)) if (cand.size < 4) cand.set(nameOfValue(v, 0), cand.get(nameOfValue(v, 0)) ?? null);
  if (dotsMax >= 1 && cand.size < 4) cand.set(nameOfValue(answer.value, answer.dots ? 0 : 1), answer.dots ? ["dot-misread", "Without a dot that note is shorter. A dot makes it half as long again."] : ["dot-misread", "A dot would make the note longer than all of these together."]);
  const labels = c.rng.shuffle([...cand.keys()]);
  const diagnoses = Object.fromEntries([...cand].filter(([, d]) => d).map(([k, d]) => [k.replace(/ /g, "-"), { category: d![0], reason: d![1] }]));
  return {
    prompt: tied ? "These notes are tied together. Which single note lasts as long as all of them?" : "Which single note lasts as long as all of these notes added together?",
    music: rhythmLine([{ events: beamRuns(evs) }]),
    answer: { kind: "choice", options: labels.map((l) => ({ id: l.replace(/ /g, "-"), label: l })), correctOptionIds: [correct.replace(/ /g, "-")], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
    hints: ["Work out how many crotchet beats the notes last altogether.", "Then find the single note that lasts that long."],
  };
};

/** t.g1.beam-choice: flags and beams on quavers and semiquavers. */
export const beamChoice: Gen = (c) => {
  const vals = valuesOf(c).filter((v) => BEAMABLE.has(v));
  if (!vals.length) return null;
  const mode = c.rng.pick(["flag", "beam-value", "beam-value", "beam-count", "beam-beats"] as const);
  const v = c.rng.pick(vals);
  const flags = v === "quaver" ? 1 : 2;
  const other: Value = v === "quaver" ? "semiquaver" : "quaver";
  const valueOptions = (): Array<{ id: string; label: string }> => {
    const names: Value[] = ["crotchet", "quaver", "semiquaver"].filter((x) => valuesOf(c).includes(x as Value)) as Value[];
    return names.map((x) => ({ id: x, label: x }));
  };
  if (mode === "flag") {
    return {
      prompt: `This note has ${flags === 1 ? "one flag" : "two flags"}. What note value is it?`,
      music: rhythmLine([{ events: [n(v)] }]),
      answer: { kind: "choice", options: valueOptions(), correctOptionIds: [v], diagnoses: { [other]: { category: "halved-or-doubled", reason: `One flag makes a quaver and two flags make a semiquaver. This note has ${flags === 1 ? "one flag, so it is the longer of the two" : "two flags, so it is the shorter of the two"}.` } } },
      hints: ["Count the flags: each extra flag halves the length."],
    };
  }
  const size = mode === "beam-beats" ? (v === "quaver" ? c.rng.pick([2, 3, 4]) : c.rng.pick([2, 4])) : c.rng.pick(v === "quaver" ? [2, 3, 4] : [2, 3, 4]);
  const group = beamRuns(Array.from({ length: size }, () => n(v)));
  if (!group.every((e) => (e as { beam?: string }).beam)) return null; // must be one beam group (fits within a beat)
  const lead = [] as NotationEvent[];
  if (mode === "beam-count" && c.rng.chance(0.5)) lead.push(n("crotchet"));
  const line = rhythmLine([{ events: [...lead, ...group] }]);
  if (mode === "beam-value") {
    return {
      prompt: `${size} notes are joined by ${v === "quaver" ? "a beam" : "two beams"}. What value is each note?`,
      music: line,
      answer: { kind: "choice", options: valueOptions(), correctOptionIds: [v], diagnoses: { [other]: { category: "halved-or-doubled", reason: `One beam means quavers; two beams mean semiquavers. This group has ${v === "quaver" ? "one beam" : "two beams"}.` } } },
      hints: ["A beam does the job of the flags: one beam for quavers, two for semiquavers."],
    };
  }
  if (mode === "beam-count") {
    const opts = [2, 3, 4, 5].map((x) => ({ id: String(x), label: String(x) }));
    return {
      prompt: "How many notes are joined together by the beam?",
      music: line,
      answer: { kind: "choice", options: opts, correctOptionIds: [String(size)] },
      hints: ["Count the stems that touch the beam, not the whole bar."],
    };
  }
  const total = size * (v === "quaver" ? 0.5 : 0.25);
  if (total * 2 !== Math.round(total * 2)) return null;
  const opts = new Map<number, [string, string] | null>([[total, null]]);
  for (const x of [size, total * 2, total / 2, total + 1]) if (x * 2 === Math.round(x * 2) && x > 0 && !opts.has(x) && opts.size < 4) opts.set(x, x === size ? ["halved-or-doubled", "That counts the notes, not the beats. Quavers are half a beat each and semiquavers a quarter."] : null);
  const ordered = [...opts.keys()].sort((a, b) => a - b);
  const diagnoses = Object.fromEntries([...opts].filter(([, d]) => d).map(([x, d]) => [String(x * 2), { category: d![0], reason: d![1] }]));
  return {
    prompt: "How many crotchet beats does this beamed group last?",
    music: line,
    answer: { kind: "choice", options: ordered.map((x) => ({ id: String(x * 2), label: beatsText(x) })), correctOptionIds: [String(total * 2)], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
    hints: ["A quaver lasts half a crotchet beat; a semiquaver lasts a quarter. Count the notes and add."],
  };
};

// ---------------------------------------------------------------------------
// Unit 2: count the beat
// ---------------------------------------------------------------------------

const stripBeam = (e: NotationEvent): NotationEvent => {
  if (e.kind === "tuplet") return e;
  const { beam: _b, ...rest } = e as NotationEvent & { beam?: string };
  return rest as NotationEvent;
};
const codes = (events: NotationEvent[], ts: string, opts: music.BarCheckOptions = {}) => music.checkBarAnyPattern(events as unknown as music.REvent[], ts, opts).issues.map((i) => i.code);

/** Is this value-list a bar the learner could have been taught (flat events, scope-safe)? */
function inScope(events: NotationEvent[], c: Parameters<Gen>[0]): boolean {
  return events.every((e) => e.kind !== "tuplet" && (c.scope.noteValues ?? VALUE_ORDER).includes(e.duration.value) && ((e.duration.dots ?? 0) <= (c.scope.maxDots ?? 0)) && (e.kind !== "rest" || c.scope.rests) && (!(e as { tieToNext?: boolean }).tieToNext || c.scope.ties));
}



/** A bar with a silent stretch across two beats: `good` gives each beat its own rest, `bad` merges two of them into one longer rest. */
function silentStretch(c: Parameters<Gen>[0], ts: string): { good: NotationEvent[]; bad: NotationEvent[] } | null {
  const { top } = music.parseTimeSignature(ts);
  if (top < 3 || !c.scope.rests) return null;
  const starts = top === 4 ? [1] : [0, 1]; // zero-based beat where the merged rest would begin (4/4: beats 2-3 only)
  const s0 = c.rng.pick(starts);
  const good: NotationEvent[] = [];
  const bad: NotationEvent[] = [];
  for (let b = 0; b < top; b++) {
    if (b === s0) {
      good.push(r("crotchet"), r("crotchet"));
      bad.push(r("minim"));
      b++;
      continue;
    }
    const filler: NotationEvent[] = c.rng.chance(0.4) ? beamRuns([n("quaver"), n("quaver")]) : [n("crotchet")];
    good.push(...filler);
    bad.push(...filler);
  }
  const goodIssues = codes(good, ts);
  const badIssues = codes(bad, ts, { requireBeams: false });
  if (goodIssues.length || !badIssues.some((x) => x === "rest-across-beat" || x === "rests-not-combined" || x === "half-bar-rest-misplaced")) return null;
  return { good, bad };
}

/** t.g1.bar-judge: three bars, one of them right. Which? (total, beaming, rests or ties) */
export const barJudge: Gen = (c) => {
  const ts = tsOf(c);
  const modes = ["total", "total", "grouping", "grouping"] as Array<"total" | "grouping" | "rest" | "tie">;
  if (c.scope.rests) modes.push("rest");
  if (c.scope.ties) modes.push("tie");
  const mode = c.rng.pick(modes);
  const stretch = mode === "rest" ? silentStretch(c, ts) : null;
  if (mode === "rest" && !stretch) return null;
  const good = stretch ? stretch.good : randomBar(c, ts, mode === "grouping" ? { noRests: true, needBeams: true } : {});
  if (!good) return null;
  const wrongs: NotationEvent[][] = [];
  const addWrong = (b: NotationEvent[] | null) => b && inScope(b, c) && !wrongs.some((w) => JSON.stringify(w) === JSON.stringify(b)) && wrongs.push(b);
  const mutate = (b: NotationEvent[]): NotationEvent[] | null => {
    const plain = b.map(stripBeam);
    const idx = c.rng.int(0, plain.length - 1);
    const e = plain[idx]!;
    if (mode === "total") {
      const choice = c.rng.int(0, 2);
      if (choice === 0) return [...plain, n("crotchet")]; // too long
      if (choice === 1) return plain.length > 1 ? plain.filter((_, k) => k !== idx) : null; // too short
      if (e.kind === "tuplet") return null;
      const smaller = VALUE_ORDER[VALUE_ORDER.indexOf(e.duration.value as Value) + 1];
      return smaller && e.kind === "note" && !(e.duration.dots ?? 0) ? plain.map((x, k) => (k === idx ? n(smaller) : x)) : null;
    }
    if (mode === "grouping") return plain; // unbeamed flags: beats not shown
    if (mode === "rest") return stretch!.bad; // rests merged across a beat
    
    // tie: split a note into two tied notes of a smaller value inside a beat
    if (e.kind !== "note") return null;
    const smaller = VALUE_ORDER[VALUE_ORDER.indexOf(e.duration.value as Value) + 1];
    if (!smaller || (e.duration.dots ?? 0)) return null;
    return [...plain.slice(0, idx), n(smaller, 0, { tieToNext: true }), n(smaller), ...plain.slice(idx + 1)];
  };
  const goodClean = mode === "grouping" ? good : mode === "tie" ? good.map(stripBeam) : good;
  const goodIssues = codes(goodClean, ts);
  if (goodIssues.length) return null;
  if (mode === "rest") {
    // the second wrong bar is another silent stretch of the same bar length, so the right one is the only bar with a rest per beat
    for (let k = 0; k < 20 && wrongs.length < 2; k++) {
      const other = silentStretch(c, ts);
      if (other) addWrong(other.bad);
    }
  }
  for (let k = 0; k < 60 && wrongs.length < 2 && mode !== "rest"; k++) {
    const w = mutate(good);
    if (!w) continue;
    const issues = codes(w, ts);
    const totalBad = issues.some((x) => x === "bar-overfull" || x === "bar-underfull");
    const ok =
      mode === "total" ? totalBad
      : mode === "grouping" ? !totalBad && issues.some((x) => x.startsWith("beam") || x === "beat-not-beamed" || x.startsWith("note-"))
      : !totalBad && issues.includes("unnecessary-tie");
    if (ok) addWrong(w);
  }
  if (mode === "grouping" && wrongs.length < 2) {
    // a second kind of fault: beam across the middle of a four-beat bar, or beams over beat lines
    const plain = good.map(stripBeam);
    const idxs = plain.map((e, i) => (e.kind === "note" && BEAMABLE.has(e.duration.value as Value) ? i : -1)).filter((i) => i >= 0);
    for (let a = 0; a + 1 < idxs.length && wrongs.length < 2; a++) {
      const trial = plain.map((e, i) => (i === idxs[a] ? { ...e, beam: "begin" } : i === idxs[a + 1] ? { ...e, beam: "end" } : e)) as NotationEvent[];
      const issues = codes(trial, ts);
      if (idxs[a + 1] === idxs[a]! + 1 && issues.some((x) => x.startsWith("beam"))) addWrong(trial);
    }
  }
  if (wrongs.length < 2) return null;
  const bars = c.rng.shuffle([{ ev: goodClean, right: true }, { ev: wrongs[0]!, right: false }, { ev: wrongs[1]!, right: false }]);
  const measures: Measure[] = bars.map((b, i) => ({ events: b.ev, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));
  const answerIdx = bars.findIndex((b) => b.right);
  const fragment = rhythmLine(measures, mode === "total" ? {} : { timeSignature: ts });
  const prompt =
    mode === "total" ? `Each bar is meant to be in ${ts}. Which bar has exactly the right number of beats?`
    : mode === "grouping" ? `All three bars add up in ${ts}. Which bar groups its notes so the beats are easy to see?`
    : mode === "rest" ? `All three bars add up in ${ts}. Which bar writes its rests so that each beat can be seen?`
    : `All three bars add up in ${ts}. Which bar does not use a tie where a single note would do?`;
  const labelOf = (i: number) => `Bar ${i + 1}`;
  const why: Record<typeof mode, [string, string]> = {
    total: ["bar-overfull", "Add up the beats in the bar you chose and compare with the time signature: it does not match."],
    grouping: ["grouping-obscures-beat", "In the bar you chose the beats are hidden: quavers and semiquavers belong in beamed groups that show each beat."],
    rest: ["rest-grouping", "In the bar you chose a rest stretches over two beats. Each beat gets its own rest, so the beats stay visible."],
    tie: ["unnecessary-tie", "In the bar you chose two tied notes could have been written as one longer note."],
  };
  const diagnoses = Object.fromEntries(bars.map((b, i) => [String(i + 1), b.right ? null : { category: why[mode][0], reason: why[mode][1] }]).filter(([, v]) => v));
  return {
    prompt,
    music: fragment,
    answer: { kind: "choice", options: bars.map((_, i) => ({ id: String(i + 1), label: labelOf(i) })), correctOptionIds: [String(answerIdx + 1)], diagnoses },
    hints: [`${ts} has ${music.describeMetre(music.metreStructure(ts))} in each bar.`],
  };
};


/** t.g1.bar-fix: rewrite a bar that uses an unnecessary tie, or rests that hide a beat, so it follows the conventions. */
export const barFix: Gen = (c) => {
  const ts = tsOf(c);
  const modes: Array<"tie" | "rest"> = [];
  if (c.scope.ties) modes.push("tie");
  if (c.scope.rests) modes.push("rest");
  if (!modes.length) return null;
  const mode = c.rng.pick(modes);
  const good = randomBar(c, ts, {});
  if (!good || codes(good.map(stripBeam), ts).length === 0 === false) {
    if (!good) return null;
  }
  const plain = good.map(stripBeam);
  let bad: NotationEvent[] | null = null;
  if (mode === "tie") {
    const idxs = plain.map((e, i) => (e.kind === "note" && !(e.duration.dots ?? 0) && VALUE_ORDER.indexOf(e.duration.value as Value) < 4 ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return null;
    const idx = c.rng.pick(idxs);
    const e = plain[idx]! as Extract<NotationEvent, { kind: "note" }>;
    const smaller = VALUE_ORDER[VALUE_ORDER.indexOf(e.duration.value as Value) + 1]! as Value;
    if (!(c.scope.noteValues ?? VALUE_ORDER).includes(smaller)) return null;
    bad = [...plain.slice(0, idx), n(smaller, 0, { tieToNext: true }), n(smaller), ...plain.slice(idx + 1)];
  } else {
    const st = silentStretch(c, ts);
    if (!st) return null;
    bad = st.bad;
    good.length = 0;
    good.push(...st.good);
  }
  const badCodes = codes(bad, ts, { requireBeams: false });
  const want = mode === "tie" ? badCodes.includes("unnecessary-tie") : badCodes.some((x) => x === "rest-across-beat" || x === "rests-not-combined" || x === "half-bar-rest-misplaced");
  if (!want || badCodes.some((x) => x === "bar-overfull" || x === "bar-underfull")) return null;
  if (codes(good, ts).length) return null;
  return {
    prompt: mode === "tie" ? "This bar uses a tie where a single note would do. Rewrite the bar so that it sounds the same but is written clearly." : "The rests in this bar hide a beat. Rewrite the bar so that it sounds the same and every beat can be seen.",
    music: rhythmLine([{ events: bad, barline: "final" }], { timeSignature: ts }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: good }]], acceptAnyRuleCompliant: true },
    hints: mode === "tie" ? ["Two tied notes inside a bar can become one longer note."] : ["Give each silent beat its own rest, unless one minim rest fills the first or last two beats of 4/4."],
  };
};


// ---------------------------------------------------------------------------
// Unit 4: sharps, flats and naturals
// ---------------------------------------------------------------------------

const SIGN_NAME = { 1: "sharp", [-1]: "flat", 0: "natural" } as const;
const SIGN_GLYPH = { 1: "♯", [-1]: "♭", 0: "♮" } as const;
const BLACK_KEYS: Array<{ sharp: string; flat: string; midi: string }> = [
  { sharp: "C#", flat: "Db", midi: "C#4" },
  { sharp: "D#", flat: "Eb", midi: "D#4" },
  { sharp: "F#", flat: "Gb", midi: "F#4" },
  { sharp: "G#", flat: "Ab", midi: "G#4" },
  { sharp: "A#", flat: "Bb", midi: "A#4" },
];

/** t.g1.accidental-facts: what the signs do, and the two names of a black key. */
export const accidentalFacts: Gen = (c) => {
  const mode = c.rng.pick(["effect", "sign-for", "name-sharp", "name-flat"] as const);
  if (mode === "effect") {
    const alter = c.rng.pick([1, -1, 0] as const);
    const right = alter === 1 ? "raise" : alter === -1 ? "lower" : "cancel";
    const opts = [
      { id: "raise", label: "Raises the note by a semitone" },
      { id: "lower", label: "Lowers the note by a semitone" },
      { id: "cancel", label: "Cancels an earlier sharp or flat" },
      { id: "tone", label: "Raises the note by a whole tone" },
    ];
    const diagnoses: Diagnoses = {};
    if (alter === 1) diagnoses.lower = { category: "black-key-neighbour", reason: "A flat lowers a note; a sharp raises it. Think of a sharp as 'up' towards the next key on the right." };
    if (alter === -1) diagnoses.raise = { category: "black-key-neighbour", reason: "A sharp raises a note; a flat lowers it. A flat moves to the next key on the left." };
    if (alter === 0) diagnoses.raise = { category: "black-key-neighbour", reason: "A natural does not move the note up or down: it takes away an earlier sharp or flat." };
    return {
      prompt: `What does a ${SIGN_NAME[alter]} sign (${SIGN_GLYPH[alter]}) do to a note?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts), correctOptionIds: [right], diagnoses },
      hints: ["Sharp = higher, flat = lower, natural = back to the plain white-key note."],
    };
  }
  if (mode === "sign-for") {
    const alter = c.rng.pick([1, -1, 0] as const);
    const ask = alter === 1 ? "raises a note by a semitone" : alter === -1 ? "lowers a note by a semitone" : "cancels an earlier sharp or flat";
    const opts = ([1, -1, 0] as const).map((a) => ({ id: SIGN_NAME[a], label: `${SIGN_NAME[a]} (${SIGN_GLYPH[a]})` }));
    return {
      prompt: `Which sign ${ask}?`,
      answer: { kind: "choice", options: opts, correctOptionIds: [SIGN_NAME[alter]], diagnoses: Object.fromEntries(opts.filter((o) => o.id !== SIGN_NAME[alter]).map((o) => [o.id, { category: "black-key-neighbour", reason: `That sign does a different job. A sharp raises, a flat lowers, and a natural cancels.` }])) },
      hints: ["Sharp = higher, flat = lower, natural = back to the plain white-key note."],
    };
  }
  const key = c.rng.pick(BLACK_KEYS);
  const sharp = mode === "name-sharp";
  const answer = sharp ? key.sharp : key.flat;
  const pool = BLACK_KEYS.map((k) => (sharp ? k.sharp : k.flat));
  const opts = [answer, ...c.rng.shuffle(pool.filter((x) => x !== answer)).slice(0, 3)];
  const idx = pool.indexOf(answer);
  const near = new Set([pool[idx - 1], pool[idx + 1]].filter(Boolean));
  return {
    prompt: `Name the highlighted black key using a ${sharp ? "sharp" : "flat"}.`,
    music: keyboardPicture([key.midi], `A piano keyboard with one black key highlighted, between ${key.sharp[0]} and ${key.flat[0]}.`),
    answer: { kind: "choice", options: c.rng.shuffle(opts).map((o) => ({ id: o, label: pretty(o) })), correctOptionIds: [answer], diagnoses: Object.fromEntries(opts.filter((o) => near.has(o)).map((o) => [o, { category: "black-key-neighbour", reason: `${pretty(o)} is the black key next door. A ${sharp ? "sharp is the black key just above (to the right of)" : "flat is the black key just below (to the left of)"} the white key of the same letter.` }])) },
    hints: [sharp ? "A sharp is the black key just to the right of the white key with that letter." : "A flat is the black key just to the left of the white key with that letter."],
  };
};

const GOOD_ACC = (step: string, alter: number) => !((step === "E" || step === "B") && alter === 1) && !((step === "C" || step === "F") && alter === -1);

/** t.g1.accidental-read: name a note that has a sharp or flat sign in front of it. */
export const accidentalRead: Gen = (c) => {
  const clef = c.rng.pick((c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[]);
  const max = maxLedger(c);
  const pos = c.rng.int(-2 * max - (max ? 1 : 0), 8 + 2 * max + (max ? 1 : 0));
  const alter = c.rng.pick([1, -1]);
  const base = naturalAt(clef, pos);
  if (!GOOD_ACC(base.step, alter) || music.ledgerLines(clef, base) > max) return null;
  const p: Pitch = { ...base, alter };
  return {
    prompt: "Name this note, including its sharp or flat.",
    music: frag(clef, [{ events: [note(p)] }], `A ${clef}-clef stave with one semibreve on the ${describePos(pos)}, with a ${alter === 1 ? "sharp" : "flat"} sign in front of it.`),
    answer: { kind: "pitch", accepted: [music.formatPitch(p)], octaveSensitive: false, spellingSensitive: true, relation: "same" },
    hints: ["Read the line or space as usual, then add the sign in front: a sharp raises it, a flat lowers it."],
  };
};
const describePos = (pos: number) => (pos % 2 === 0 ? `${ORD(pos / 2 + 1)} line` : `${ORD((pos - 1) / 2 + 1)} space`);

/** t.g1.accidental-write: write a sharp or flat note on the stave. */
export const accidentalWrite: Gen = (c) => {
  const clef = c.rng.pick((c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[]);
  const max = maxLedger(c);
  const step = c.rng.pick(music.STEPS);
  const alter = c.rng.pick([1, -1]);
  if (!GOOD_ACC(step, alter)) return null;
  const answer = { kind: "staff-position" as const, clef, target: { step, alter, position: "any" as const, maxLedgerLines: max }, accepted: [] as string[], octaveSensitive: true };
  const valid = staffTargets(answer, max);
  if (!valid.length) return null;
  answer.accepted = valid.map((q) => music.formatPitch(q));
  return {
    prompt: `Write ${pretty(`${step}${alter === 1 ? "#" : "b"}`)} in the ${clef} clef. Put the ${alter === 1 ? "sharp" : "flat"} sign in front of the note. Any ${pretty(`${step}${alter === 1 ? "#" : "b"}`)} that fits is correct.`,
    answer,
    hints: [`Find ${step} first, then add a ${alter === 1 ? "sharp" : "flat"} sign directly in front of the note.`],
  };
};

/** t.g1.accidental-count: how long does an accidental last? Count the notes that carry it. */
export const accidentalCount: Gen = (c) => {
  if (!c.scope.accidentals) return null;
  const clef = c.rng.pick((c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[]);
  const ts = c.rng.pick(c.scope.timeSignatures?.length ? c.scope.timeSignatures : ["4/4"]);
  const slots = music.parseTimeSignature(ts).top;
  if (slots < 3) return null;
  const max = maxLedger(c);
  const pos = c.rng.int(1, 7);
  const x = naturalAt(clef, pos);
  const alter = c.rng.pick([1, -1]);
  if (!GOOD_ACC(x.step, alter)) return null;
  const withAlter = (a: number): Pitch => ({ ...x, alter: a });
  const filler = (): Pitch => {
    const step = c.rng.pick(music.STEPS.filter((s) => s !== x.step));
    return { step, alter: 0, octave: x.octave };
  };
  const mode = c.rng.pick(["same-bar", "natural", "next-bar"] as const);
  let bars: Pitch[][];
  let question: string;
  let correct: number;
  let carried: number; // the wrong count a learner gets from the mistake being diagnosed
  const name = `${pretty(`${x.step}${alter === 1 ? "#" : "b"}`)}`;
  if (mode === "same-bar") {
    const repeats = c.rng.int(1, slots - 2);
    const seq: Pitch[] = [withAlter(alter), ...Array.from({ length: repeats }, () => withAlter(alter))];
    while (seq.length < slots) seq.push(filler());
    const body = [seq[0]!, ...c.rng.shuffle(seq.slice(1))];
    bars = [body];
    correct = body.filter((p) => p.step === x.step).length;
    carried = 1;
    question = `How many notes in this bar sound as ${name}?`;
  } else if (mode === "natural") {
    if (slots < 4) return null;
    const seq: Pitch[] = [withAlter(alter), withAlter(alter), withAlter(0), withAlter(0)];
    bars = [seq.slice(0, slots)];
    correct = 2;
    carried = bars[0]!.length;
    question = `How many notes in this bar sound as ${name}?`;
  } else {
    const m = c.rng.int(1, 2);
    const first = [withAlter(alter), ...Array.from({ length: slots - 1 }, filler)];
    const second = [...Array.from({ length: m }, () => withAlter(0)), ...Array.from({ length: slots - m }, filler)];
    bars = [first, second];
    correct = 0;
    carried = m;
    question = `How many notes in bar 2 sound as ${name}?`;
  }
  if (!fits(clef, bars.flat(), max)) return null;
  const measures: Measure[] = bars.map((b, i) => ({ events: b.map((p) => note(p, "crotchet")), ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));
  const f = frag(clef, measures, "", { timeSignature: ts });
  const desc = f.measures.map((m, bi) => `Bar ${bi + 1}: ` + (m.events ?? []).map((e) => (e.kind === "note" ? `${P(e.pitch).step}${e.writtenAccidental ? ` with a ${e.writtenAccidental.replace("-", " ")} sign` : ""}` : "rest")).join(", ") + ".").join(" ");
  f.textAlternative = `${clef} clef, ${ts}. ${desc}`;
  const opts = new Map<number, [string, string] | null>([[correct, null]]);
  const add = (v: number, d: [string, string] | null) => v >= 0 && v <= slots && !opts.has(v) && opts.size < 4 && opts.set(v, d);
  add(carried, mode === "next-bar" ? ["accidental-carried-over-barline", "An accidental only lasts to the end of its own bar. In the next bar the note goes back to what the key signature says."] : mode === "natural" ? ["accidental-forgotten", "A natural sign cancels the sharp or flat. The notes after it are plain again."] : ["accidental-forgotten", "An accidental lasts until the end of the bar, not just for the note it is written beside."]);
  for (const v of [correct + 1, correct - 1, correct + 2, 0, 1, 2]) add(v, null);
  const ordered = [...opts.keys()].sort((a, b) => a - b);
  const diagnoses = Object.fromEntries([...opts].filter(([, d]) => d).map(([v, d]) => [String(v), { category: d![0], reason: d![1] }]));
  return {
    prompt: question,
    music: f,
    answer: { kind: "choice", options: ordered.map((v) => ({ id: String(v), label: String(v) })), correctOptionIds: [String(correct)], ...(Object.keys(diagnoses).length ? { diagnoses } : {}) },
    hints: ["An accidental lasts until the end of the bar, on its own line or space. A natural sign cancels it. A new bar starts afresh."],
  };
};

// ---------------------------------------------------------------------------
// Unit 3 extra: finding middle C
// ---------------------------------------------------------------------------

/** t.g1.middle-c-find: which note (or key) is middle C? */
export const middleCFind: Gen = (c) => {
  const keyboard = c.rng.chance(0.4);
  if (keyboard) {
    const others = c.rng.shuffle(["C2", "C3", "C5", "C6"]).slice(0, 2);
    const set = ["C4", ...others].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const pos = ["lowest", "middle", "highest"];
    const answer = pos[set.indexOf("C4")]!;
    return {
      prompt: "Three C keys are highlighted. Which one is middle C?",
      music: { presentation: "keyboard", clef: "treble", showKeySignature: false, measures: [{ events: set.map((p) => note(p)) }], textAlternative: `A piano keyboard with three C keys highlighted, in different octaves.` } as NotationFragment,
      answer: { kind: "choice", options: pos.map((p) => ({ id: p, label: `The ${p} one` })), correctOptionIds: [answer], diagnoses: Object.fromEntries(pos.filter((p) => p !== answer).map((p) => [p, { category: "white-key-off-by-one", reason: "Middle C is the C nearest the middle of the keyboard, not the highest or lowest of these Cs." }])) },
      hints: ["Middle C is the C closest to the middle of the keyboard."],
    };
  }
  const clef = c.rng.pick((c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Array<"treble" | "bass">);
  if (maxLedger(c) < 1) return null;
  const pool = clef === "treble" ? ["B3", "C4", "D4", "E4", "F4", "G4"] : ["E3", "F3", "G3", "A3", "B3", "C4", "D4"];
  const count = 4;
  const rest = c.rng.shuffle(pool.filter((p) => p !== "C4")).slice(0, count - 1);
  const seq = c.rng.shuffle(["C4", ...rest]);
  if (seq.some((p) => music.ledgerLines(clef, music.parsePitch(p)) > 1)) return null;
  const idx = seq.indexOf("C4");
  return {
    prompt: `Which of these notes is middle C?`,
    music: frag(clef, [{ events: seq.map((p) => note(p, "crotchet")) }], `Four ${clef}-clef notes in a row: ${seq.map((p) => p.replace(/\d/, "")).join(", ")}.`, { timeSignature: "4/4" }),
    answer: { kind: "choice", options: [1, 2, 3, 4].map((x) => ({ id: String(x), label: `Note ${x}` })), correctOptionIds: [String(idx + 1)], diagnoses: Object.fromEntries([1, 2, 3, 4].filter((x) => x !== idx + 1).map((x) => [String(x), { category: "ledger-miscount", reason: `Middle C is the note on the short ledger line, ${clef === "treble" ? "just below" : "just above"} the stave.` }])) },
    hints: [`Middle C sits on its own short ledger line, ${clef === "treble" ? "below the treble stave" : "above the bass stave"}.`],
  };
};

export const GRADE1_GENERATORS: Record<string, Gen> = {
  "t.g1.letter-names": letterNames,
  "t.g1.stave-facts": staveFacts,
  "t.g1.note-place": notePlace,
  "t.g1.note-total": noteTotal,
  "t.g1.note-equivalent": noteEquivalent,
  "t.g1.beam-choice": beamChoice,
  "t.g1.bar-judge": barJudge,
  "t.g1.bar-fix": barFix,
  "t.g1.middle-c-find": middleCFind,
  "t.g1.accidental-facts": accidentalFacts,
  "t.g1.accidental-read": accidentalRead,
  "t.g1.accidental-write": accidentalWrite,
  "t.g1.accidental-count": accidentalCount,
};
