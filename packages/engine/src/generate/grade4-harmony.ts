/**
 * Grade 4 interval and chord generators (Brief 08, Unit 4).
 *
 * Source: First Steps in Music Theory, Grade 4 sections 9-11 (pp. 88-97, read in the PDF). Grade 3 asked intervals above the tonic;
 * Grade 4 asks the interval between ANY two notes of one scale, including augmented and diminished ones, and root-position triads
 * and chords on I, IV and V (harmonic minor in minor keys), whatever the spacing or doubling. Inversions are Grade 5: a chord whose
 * lowest note is not the root is only ever called "not in root position".
 *
 * Q27: whenever the scale form changes the answer (minor keys), the prompt names it. Intervals are always derived from the two
 * written pitches (`intervalBetween`), never from a table of degrees.
 */
import { deriveScale, music, type Measure, type NotationEvent } from "@mtp/curriculum";
import { fits, frag, maxLedger, nameOf, note, pretty, type Gen } from "./families.ts";
import type { Diagnoses } from "./grade1.ts";
import { ORD, cap, diag, optsOf, posText } from "./grade2.ts";

type Pitch = music.Pitch;
type Clef = music.Clef;
type Ctx = Parameters<Gen>[0];
const { formatPitch: F, formatPitchClass: FC, parseKey, staffPosition, ledgerLines, chromaticNumber, diatonicNumber } = music;

const clefsIn = (c: Ctx): Clef[] => (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];
const keysIn = (c: Ctx) => (c.scope.keys?.length ? c.scope.keys : ["C major"]);
const kw = (k: string) => pretty(k);
const pc = (p: { step: string; alter: number }) => nameOf(p as music.PitchClass);
const pid = (p: { step: string; alter: number }) => FC(p as music.PitchClass);
const QW: Record<string, string> = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const ivWord = (q: string, n: number) => `${QW[q]} ${ORD(n)}`;
const an = (clef: string) => `${/^[aeiou]/.test(clef) ? "an" : "a"} ${clef}`;
const SIGN_WORD: Record<number, string> = { [-2]: "double flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double sharp" };

type FormId = "major" | "harmonic" | "melodic-up" | "melodic-down";
const FORM_TEXT: Record<FormId, string> = { major: "", harmonic: " (harmonic minor)", "melodic-up": " (melodic minor, going up)", "melodic-down": " (melodic minor, coming down)" };

/** Eight ascending-order notes of the scale named (tonic to tonic), spelt from the rules. */
function ascendingNotes(keyText: string, form: FormId, oct: number): Pitch[] {
  const key = parseKey(keyText);
  if (key.mode === "major") return deriveScale(keyText, "major", "ascending", { ...key.tonic, octave: oct });
  if (form === "harmonic") return deriveScale(keyText, "harmonic", "ascending", { ...key.tonic, octave: oct });
  if (form === "melodic-up") return deriveScale(keyText, "melodic", "ascending", { ...key.tonic, octave: oct });
  return deriveScale(keyText, "melodic", "descending", { ...key.tonic, octave: oct + 1 }).reverse();
}
const formsOf = (c: Ctx, keyText: string): FormId[] => {
  if (parseKey(keyText).mode === "major") return ["major"];
  const sf = c.scope.minorForms ?? [];
  return [...(sf.includes("harmonic") ? (["harmonic"] as FormId[]) : []), ...(sf.includes("melodic") ? (["melodic-up", "melodic-down"] as FormId[]) : [])];
};

interface Pair { key: string; form: FormId; lower: Pitch; upper: Pitch; clef: Clef; iv: music.Interval }
function pickPair(c: Ctx): Pair | null {
  const keyText = c.rng.pick(keysIn(c));
  const forms = formsOf(c, keyText);
  if (!forms.length) return null;
  const form = c.rng.pick(forms);
  const clef = c.rng.pick(clefsIn(c));
  const max = Math.min(maxLedger(c), 2);
  for (const oct of c.rng.shuffle([2, 3, 4])) {
    const notes = ascendingNotes(keyText, form, oct);
    const i = c.rng.int(0, 6);
    const j = c.rng.int(i + 1, 7);
    const lower = notes[i]!;
    const upper = notes[j]!;
    if (!fits(clef, [lower, upper], max)) continue;
    const iv = music.intervalBetween(lower, upper);
    return { key: keyText, form, lower, upper, clef, iv };
  }
  return null;
}
const ivCode = (iv: music.Interval) => `${iv.quality}${iv.number}`;
/** The scale form an answer refers to, for the verifier (minor keys only). */
const formField = (p: { key: string; form: FormId }): { minorForm?: "harmonic" | "melodic-ascending" | "melodic-descending" } => (parseKey(p.key).mode === "major" ? {} : { minorForm: p.form === "harmonic" ? "harmonic" : p.form === "melodic-up" ? "melodic-ascending" : "melodic-descending" });

/** t.g4.interval-name: the interval between two notes of one scale (keyed, or with no key given), quality and number. */
export const intervalName4: Gen = (c): any => {
  if (c.scope.intervalLowerNote === "tonic" || !c.scope.intervalLowerNote) return null;
  const p = pickPair(c);
  if (!p) return null;
  const keyed = true; // every interval question names its key (and, in a minor key, the scale form): the verifier requires it and so does Q27
  const f = frag(p.clef, [{ events: [note(p.lower), note(p.upper)] }], `${an(p.clef)} clef stave with two semibreves: ${posText(staffPosition(p.clef, p.lower))}${p.lower.alter ? ` with a ${SIGN_WORD[p.lower.alter]} sign` : ""}, then ${posText(staffPosition(p.clef, p.upper))}${p.upper.alter ? ` with a ${SIGN_WORD[p.upper.alter]} sign` : ""}.`, keyed ? { key: p.key, showKeySignature: true } : { showKeySignature: false });
  const text = keyed ? `Key: ${kw(p.key)}${FORM_TEXT[p.form]}. Name the interval between these two notes: quality and number.` : "Name the interval between these two notes: quality and number. The interval is the same whatever key signature the notes are written in.";
  // an unkeyed minor-form pair is still unambiguous: the interval depends only on the written notes
  return {
    prompt: text,
    music: f,
    answer: { kind: "interval", task: "identify", key: p.key, ...formField(p), lower: F(p.lower), upper: F(p.upper), acceptedIntervals: [ivCode(p.iv)] },
    hints: ["Count every letter name from the lower note to the upper note, both included, for the number. Then compare the upper note with the major scale of the lower note."],
  };
};

/** t.g4.interval-write: write the note that makes the interval asked, above or below a given note. */
export const intervalWrite4: Gen = (c): any => {
  if (c.scope.intervalLowerNote === "tonic" || !c.scope.intervalLowerNote) return null;
  const p = pickPair(c);
  if (!p) return null;
  const down = c.rng.chance(0.4);
  const known = down ? p.upper : p.lower;
  const answerNote = down ? p.lower : p.upper;
  const dir = down ? "below" : "above";
  const code = ivCode(p.iv);
  return {
    prompt: `Key: ${kw(p.key)}${FORM_TEXT[p.form]}. Write the note that is ${aOrAnWord(QW[p.iv.quality]!)} ${QW[p.iv.quality]} ${ORD(p.iv.number)} ${dir} the note shown.`,
    music: frag(p.clef, [{ events: [note(known)] }], `${an(p.clef)} clef stave in ${p.key} with one semibreve ${posText(staffPosition(p.clef, known))}${known.alter ? ` with a ${SIGN_WORD[known.alter]} sign` : ""}.`, { key: p.key, showKeySignature: true }),
    answer: { kind: "interval", task: "build", key: p.key, ...formField(p), lower: F(known), target: code, direction: down ? "down" : "up", acceptedPitches: [F(answerNote)] },
    hints: [`Count ${p.iv.number} letter names ${down ? "down" : "up"} from the note, counting it as 1. Then check the quality against its major scale.`],
  };
};
const aOrAnWord = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a");

/** t.g4.interval-facts: how a quality changes when a note moves by a semitone, and where augmented and diminished intervals arise. */
export const intervalFacts4: Gen = (c): any => {
  if (c.scope.intervalLowerNote === "tonic" || !c.scope.intervalLowerNote) return null;
  const mode = c.rng.pick(["change", "change", "change", "where-major", "where-minor", "name-twin"] as const);
  if (mode === "change") {
    const num = c.rng.pick([2, 3, 4, 5, 6, 7]);
    const perfect = num === 4 || num === 5;
    const lowerStep = c.rng.pick(music.STEPS);
    const lower: Pitch = { step: lowerStep, alter: 0, octave: 3 };
    // start from a major (or perfect) interval above a white-key bottom note, or from its minor
    const startQuality = perfect ? "P" : c.rng.pick(["M", "m"]);
    const start = music.transpose(lower, music.parseInterval(`${startQuality}${num}`), "up");
    if (Math.abs(start.alter) > 1) return null;
    const move = c.rng.pick(["top-up", "top-down", "bottom-up", "bottom-down"] as const);
    const newLower = move === "bottom-up" ? { ...lower, alter: lower.alter + 1 } : move === "bottom-down" ? { ...lower, alter: lower.alter - 1 } : lower;
    const newUpper = move === "top-up" ? { ...start, alter: start.alter + 1 } : move === "top-down" ? { ...start, alter: start.alter - 1 } : start;
    if (Math.abs(newUpper.alter) > 2 || Math.abs(newLower.alter) > 1) return null;
    const result = music.intervalBetween(newLower, newUpper);
    const startWord = ivWord(startQuality, num);
    const moveText = { "top-up": "The top note is raised by a semitone (keeping its letter name).", "top-down": "The top note is lowered by a semitone (keeping its letter name).", "bottom-up": "The bottom note is raised by a semitone (keeping its letter name).", "bottom-down": "The bottom note is lowered by a semitone (keeping its letter name)." }[move];
    const quals = perfect ? ["d", "P", "A"] : ["d", "m", "M", "A"];
    if (!quals.includes(result.quality) || result.number !== num) return null;
    return {
      prompt: `Start with a ${startWord}. ${moveText} What is the interval now?`,
      answer: { kind: "choice", options: quals.map((q) => ({ id: `${q}${num}`, label: cap(ivWord(q, num)) })), correctOptionIds: [`${result.quality}${num}`], diagnoses: Object.fromEntries(quals.filter((q) => q !== result.quality).map((q) => [`${q}${num}`, diag("augmented-diminished-swap", q === startQuality ? "The interval has changed: one note moved by a semitone, and that changes the size, so the quality changes too." : q === "A" || q === "d" ? `Check the direction: making the interval a semitone ${move === "top-up" || move === "bottom-down" ? "larger" : "smaller"} moves it ${move === "top-up" || move === "bottom-down" ? "up" : "down"} the list diminished – minor – major – augmented (perfect intervals sit between diminished and augmented).` : "Which way did the interval move? One semitone larger or smaller changes the quality by one step.")])) as Diagnoses },
      hints: ["Larger by a semitone: minor → major, major or perfect → augmented. Smaller by a semitone: major → minor, minor or perfect → diminished."],
    };
  }
  if (mode === "where-major" || mode === "where-minor") {
    const major = mode === "where-major";
    const keyText = major ? "C major" : "A minor";
    const notes = ascendingNotes(keyText, major ? "major" : "harmonic", 4);
    const code = major ? c.rng.pick(["A4", "d5"]) : c.rng.pick(["A2", "d7"]);
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) pairs.push([i, j]);
    const hit = pairs.filter(([i, j]) => ivCode(music.intervalBetween(notes[i]!, notes[j]!)) === code);
    if (hit.length !== 1) return null;
    const rightPair = hit[0]!;
    const decoys = c.rng.shuffle(pairs.filter(([i, j]) => j - i === rightPair[1] - rightPair[0] && !(i === rightPair[0] && j === rightPair[1]))).slice(0, 2);
    const others = c.rng.shuffle(pairs.filter(([i, j]) => Math.abs(j - i - (rightPair[1] - rightPair[0])) === 1)).slice(0, 3 - decoys.length);
    const all = [rightPair, ...decoys, ...others].slice(0, 4);
    if (all.length < 4) return null;
    const id = ([i, j]: [number, number]) => `${i === rightPair[0] && j === rightPair[1] ? code : "x"}${i === rightPair[0] && j === rightPair[1] ? "" : "0"}@${i + 1}-${j + 1}`;
    const label = ([i, j]: [number, number]) => `From the ${ORD(i + 1)} degree up to the ${ORD(j + 1)}`;
    const word = major ? "major scale" : "harmonic minor scale";
    return {
      prompt: `In any ${word}, between which two degrees (counting upwards from the lower) is there ${aOrAnWord(QW[code[0]!]!)} ${ivWord(code[0]!, Number(code.slice(1)))}?`,
      answer: { kind: "choice", options: c.rng.shuffle(all.map((p) => ({ id: id(p), label: label(p) }))), correctOptionIds: [id(rightPair)], diagnoses: Object.fromEntries(all.filter((p) => id(p) !== id(rightPair)).map((p) => [id(p), diag("quality-from-wrong-key", `${label(p)} makes ${aOrAnWord(QW[ivCode(music.intervalBetween(notes[p[0]]!, notes[p[1]]!))[0]!]!)} ${ivWord(ivCode(music.intervalBetween(notes[p[0]]!, notes[p[1]]!))[0]!, p[1] - p[0] + 1)}, which is a different quality.`)])) as Diagnoses },
      hints: [major ? "The augmented 4th and diminished 5th use the 4th and 7th degrees of the major scale." : "In the harmonic minor, the step from the 6th to the raised 7th is three semitones: an augmented 2nd."],
    };
  }
  // name-twin: the same two letters have the same interval name whatever the key signature (the book's rule)
  const p = pickPair(c);
  if (!p) return null;
  return {
    prompt: `In ${kw(p.key)}${FORM_TEXT[p.form]} the notes ${pc(p.lower)} and ${pc(p.upper)} make ${aOrAnWord(QW[p.iv.quality]!)} ${ivWord(p.iv.quality, p.iv.number)}. The same two written notes appear in a piece in another key. What is the interval between them there?`,
    answer: { kind: "choice", options: [{ id: ivCode(p.iv), label: `Still ${aOrAnWord(QW[p.iv.quality]!)} ${ivWord(p.iv.quality, p.iv.number)}` }, { id: "key", label: "It depends on the new key signature" }, { id: "major", label: "It becomes a major interval" }], correctOptionIds: [ivCode(p.iv)], diagnoses: { key: diag("quality-from-wrong-key", "The name of an interval depends only on the two written notes (their letters and signs), not on the key signature they are written in."), major: diag("quality-from-wrong-key", "Changing the key signature does not change the notes themselves, so the interval keeps its name.") } },
    hints: ["Name the interval from the notes as written: letters for the number, semitones for the quality."],
  };
};

// ---------------------------------------------------------------------------
// Triads and chords
// ---------------------------------------------------------------------------

const ROMAN_WORD: Record<string, string> = { I: "tonic", IV: "subdominant", V: "dominant" };
const romansIn = (c: Ctx) => (c.scope.chordDegrees?.length ? c.scope.chordDegrees : ["I"]) as string[];
const romanLabel = (key: music.Key, r: string) => (key.mode === "minor" ? r.toLowerCase().replace("v", r === "V" ? "V" : "v") : r);
const triadPcs = (keyText: string, roman: string) => music.triad(parseKey(keyText), roman);
const notesText = (pcs: Array<{ step: string; alter: number }>) => pcs.map(pc).join(" – ");

/** t.g4.triad-notes: which notes make the tonic, subdominant or dominant triad of a key (spelling decides). */
export const triadNotes4: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romansIn(c));
  const right = triadPcs(keyText, roman);
  type Opt = { pcs: music.PitchClass[]; cat: string; why: string };
  const opts: Opt[] = [];
  const sameSet = (a: music.PitchClass[], b: music.PitchClass[]) => [...a.map(pid)].sort().join() === [...b.map(pid)].sort().join();
  const push = (o: Opt) => { if (o.pcs.some((x) => Math.abs(x.alter) > 2)) return; if (!sameSet(o.pcs, right) && !opts.some((x) => sameSet(x.pcs, o.pcs))) opts.push(o); };
  for (const other of romansIn(c).filter((r) => r !== roman)) push({ pcs: triadPcs(keyText, other), cat: "wrong-degree", why: `Those are the notes of chord ${other}, the ${ROMAN_WORD[other]}. Chord ${roman} is built on the ${ORD(music.romanDegree(roman))} degree.` });
  const third = right[1]!;
  push({ pcs: [right[0]!, { step: third.step, alter: third.alter + 1 }, right[2]!], cat: "wrong-third", why: "Check the middle note: in this chord it must match the scale of the key (major or harmonic minor), not a semitone higher." });
  push({ pcs: [right[0]!, { step: third.step, alter: third.alter - 1 }, right[2]!], cat: "wrong-third", why: "Check the middle note: in this chord it must match the scale of the key (major or harmonic minor), not a semitone lower." });
  if (key.mode === "minor" && music.romanDegree(roman) === 5) push({ pcs: [right[0]!, { step: third.step, alter: third.alter - 1 }, right[2]!], cat: "leading-note-not-raised", why: "In a minor key the 3rd of chord V is the leading note, which must be raised by an accidental." });
  const fifth = right[2]!;
  push({ pcs: [right[0]!, third, { step: fifth.step, alter: fifth.alter + 1 }], cat: "wrong-fifth", why: "The top note is the 5th above the root: count its distance in letters and semitones." });
  push({ pcs: [right[0]!, third, { step: fifth.step, alter: fifth.alter - 1 }], cat: "wrong-fifth", why: "The top note is the 5th above the root: count its distance in letters and semitones." });
  const picks = c.rng.shuffle(opts).slice(0, 3);
  if (picks.length < 3) return null;
  const idOf = (pcs: music.PitchClass[]) => pcs.map(pid).join("-");
  return {
    prompt: `Which notes make chord ${romanLabel(key, roman)} (the ${ROMAN_WORD[roman]} triad) of ${kw(keyText)}${key.mode === "minor" ? ", using the harmonic minor scale" : ""}?`,
    answer: { kind: "choice", options: c.rng.shuffle([{ id: idOf(right), label: notesText(right) }, ...picks.map((o) => ({ id: idOf(o.pcs), label: notesText(o.pcs) }))]), correctOptionIds: [idOf(right)], diagnoses: Object.fromEntries(picks.map((o) => [idOf(o.pcs), diag(o.cat, o.why)])) as Diagnoses },
    hints: [`Chord ${roman} is built on degree ${music.romanDegree(roman)} of the scale: that note, the one two letters above it and the one four letters above it.`],
  };
};

/** Root-position or inverted voicing of a triad across two staves, with spacing and doubling chosen at random. */
function voicing(c: Ctx, keyText: string, roman: string, bassIs: 0 | 1 | 2, doubled: 0 | 1 | 2 | null): Pitch[] | null {
  const t = triadPcs(keyText, roman);
  const bassOct = c.rng.pick([2, 3]);
  const bass: Pitch = { ...t[bassIs]!, octave: bassOct };
  const uppers: music.PitchClass[] = [0, 1, 2].filter((i) => i !== bassIs).map((i) => t[i]!);
  const extra = doubled === null ? [] : [t[doubled]!];
  // upper notes placed above the bass, each in an octave of its own, ascending
  const out: Pitch[] = [bass];
  const pool = c.rng.shuffle([...uppers, ...extra, ...(doubled === bassIs && doubled !== null ? [] : [])]);
  let prev = bass;
  for (const u of pool) {
    let p: Pitch = { ...u, octave: bassOct + c.rng.pick([0, 1]) };
    while (chromaticNumber(p) <= chromaticNumber(prev)) p = { ...p, octave: p.octave + 1 };
    out.push(p);
    prev = p;
  }
  return out.sort((a, b) => chromaticNumber(a) - chromaticNumber(b));
}

/** Split pitches over a treble and a bass stave (notes from middle C up go to the treble). Null when a note would need too many ledger lines. */
function grand(c: Ctx, keyText: string, ps: Pitch[], labelTreble?: string): { score: ReturnType<typeof scoreOf>; ok: boolean } | null {
  const trebleNotes = ps.filter((p) => chromaticNumber(p) >= 60);
  const bassNotes = ps.filter((p) => chromaticNumber(p) < 60);
  const max = Math.min(maxLedger(c), 2);
  if (!fits("treble", trebleNotes, max) || !fits("bass", bassNotes, max)) return null;
  void keyText; void labelTreble;
  return { score: scoreOf(keyText, trebleNotes, bassNotes, labelTreble), ok: true };
}
function chordEv(pitches: Pitch[], extra: Record<string, unknown> = {}): NotationEvent {
  return pitches.length === 1 ? note(pitches[0]!, "semibreve", extra) : ({ kind: "chord", notes: pitches.map((p) => ({ pitch: F(p) })), duration: { value: "semibreve", dots: 0 }, ...extra } as NotationEvent);
}
function scoreOf(keyText: string, trebleNotes: Pitch[], bassNotes: Pitch[], label?: string) {
  const tr = frag("treble", [{ events: [trebleNotes.length ? chordEv(trebleNotes, label ? { label } : {}) : ({ kind: "rest", duration: { value: "semibreve", dots: 0 }, wholeBar: true } as NotationEvent)], barline: "final" }], "", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  const ba = frag("bass", [{ events: [bassNotes.length ? chordEv(bassNotes) : ({ kind: "rest", duration: { value: "semibreve", dots: 0 }, wholeBar: true } as NotationEvent)], barline: "final" }], "", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  return { tr, ba };
}
const staffWords = (clef: Clef, ps: Pitch[]) => (ps.length ? `${ps.map((p) => `${posText(staffPosition(clef, p))}${p.alter ? ` with a ${SIGN_WORD[p.alter]} sign` : ""}`).join("; ")}` : "a rest");
function toScore(keyText: string, ps: Pitch[], tr: NotationEvent | null, ba: NotationEvent | null, text: string) {
  void tr; void ba;
  const treble = ps.filter((p) => chromaticNumber(p) >= 60);
  const bass = ps.filter((p) => chromaticNumber(p) < 60);
  const { tr: t, ba: b } = scoreOf(keyText, treble, bass);
  const tw = `Treble stave: ${staffWords("treble", treble)}.`;
  const bw = `Bass stave: ${staffWords("bass", bass)}.`;
  t.textAlternative = tw;
  b.textAlternative = bw;
  return { staves: [{ id: "treble", label: "Treble", music: t }, { id: "bass", label: "Bass", music: b }], textAlternative: `${text} ${tw} ${bw}` };
}

/** t.g4.chord-spread: name a root-position chord whose notes are spread over both staves, with spacing and doubling varied. */
export const chordSpread: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romansIn(c));
  const doubled = c.rng.pick([null, 0, 0, 2, 1] as const);
  const ps = voicing(c, keyText, roman, 0, doubled);
  if (!ps || !grand(c, keyText, ps)) return null;
  if (music.identifyTriad(key, ps)?.roman !== roman || music.identifyTriad(key, ps)?.inversion !== "a") return null;
  const score = toScore(keyText, ps, null, null, `A chord of ${ps.length} notes in ${keyText}, written on the treble and bass staves.`);
  return {
    prompt: `This chord is in ${kw(keyText)}${key.mode === "minor" ? " (harmonic minor)" : ""}, in root position. Is it the tonic (I), subdominant (IV) or dominant (V) chord?`,
    score,
    answer: { kind: "chord", task: "identify", key: keyText, pitches: ps.map(F), acceptedChords: [{ roman: roman as "I", inversion: "a" }] },
    hints: ["The lowest note is the root. Find which degree of the scale it is: 1 is the tonic, 4 the subdominant, 5 the dominant."],
  };
};

/** t.g4.triad-id: name a close-position triad written on one stave. */
export const triadId: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romansIn(c));
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass"));
  const max = Math.min(maxLedger(c), 2);
  for (const o of c.rng.shuffle([2, 3, 4])) {
    const ps = music.voiceTriad(key, roman, "a", o);
    if (!fits(clef, ps, max)) continue;
    return {
      prompt: `Name this chord in ${kw(keyText)}${key.mode === "minor" ? " (harmonic minor)" : ""}: give its Roman numeral (I, IV or V) or say whether it is the tonic, subdominant or dominant.`,
      music: frag(clef, [{ events: [chordEv(ps)] }], `${cap(an(clef))} clef stave in ${keyText} with one chord of three notes: ${ps.map((p) => `${posText(staffPosition(clef, p))}${p.alter ? ` with a ${SIGN_WORD[p.alter]} sign` : ""}`).join("; ")}.`, { key: keyText, showKeySignature: true }),
      answer: { kind: "chord", task: "identify", key: keyText, acceptedChords: [{ roman: roman as "I", inversion: "a" }] },
      hints: ["The lowest note is the root of the chord. Which degree of the scale is it?"],
    };
  }
  return null;
};

/** t.g4.chord-root: is the chord in root position, and which note is its root? Inverted chords are asked only this way (inversions are Grade 5). */
export const chordRoot: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romansIn(c));
  const inverted = c.rng.chance(0.5);
  const bassIs = (inverted ? c.rng.pick([1, 2]) : 0) as 0 | 1 | 2;
  const doubled = c.rng.pick([null, 0, 1, 2] as const);
  const ps = voicing(c, keyText, roman, bassIs, doubled);
  if (!ps || !grand(c, keyText, ps)) return null;
  const id = music.identifyTriad(key, ps);
  if (!id || id.roman !== roman) return null;
  const root = triadPcs(keyText, roman)[0]!;
  const lowest = ps[0]!;
  const pcsAll = triadPcs(keyText, roman);
  const score = toScore(keyText, ps, null, null, `A chord of ${ps.length} notes in ${keyText}, written on the treble and bass staves.`);
  return {
    prompt: `This chord is made from the notes of one triad in ${kw(keyText)}. Answer both questions: is it in root position, and which note is its root?`,
    score,
    answer: {
      kind: "composite",
      parts: [
        { id: "position", prompt: "Is the chord in root position?", answer: { kind: "choice", options: [{ id: "yes", label: "Yes: the root is the lowest note" }, { id: "no", label: "No: the lowest note is not the root" }], correctOptionIds: [inverted ? "no" : "yes"], diagnoses: { [inverted ? "yes" : "no"]: diag("root-confused-with-bass", inverted ? "The lowest note is not the root here. Arrange the three different notes in a stack of 3rds: the bottom of that stack is the root." : "The lowest note is the root, so the chord is in root position. Doubling or spreading the notes does not change that.") } } },
        { id: "root", prompt: "Which note is the root of the chord?", answer: { kind: "choice", options: c.rng.shuffle(pcsAll.map((x) => ({ id: pid(x), label: pc(x) }))), correctOptionIds: [pid(root)], diagnoses: Object.fromEntries(pcsAll.filter((x) => pid(x) !== pid(root)).map((x) => [pid(x), diag("root-confused-with-bass", pid(x) === pid(lowest) ? `${pc(x)} is the lowest note, but the root is the bottom note of the stack of 3rds, not necessarily the lowest note you can hear.` : `${pc(x)} is the ${pid(x) === pid(pcsAll[1]!) ? "3rd" : "5th"} of the chord, not the root. Stack the notes in 3rds from the bottom.`)])) as Diagnoses } },
      ],
    },
    hints: ["The root is the note you can build the others on by adding thirds: root, 3rd, 5th. The lowest note is the root only in root position."],
  };
};

/** t.g4.chord-build: write a root-position chord with a stated number of notes (so one note must be doubled). */
export const chordBuild4: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romansIn(c));
  const voices = c.rng.pick([3, 4, 4] as const);
  const clef = (clefsIn(c)[0] ?? "treble") as Clef;
  const max = maxLedger(c);
  const t = triadPcs(keyText, roman);
  for (const o of c.rng.shuffle([2, 3, 4])) {
    const base = music.voiceTriad(key, roman, "a", o);
    const ps = voices === 4 ? [...base, { ...t[0]!, octave: base[0]!.octave + 1 }].sort((a, b) => chromaticNumber(a) - chromaticNumber(b)) : base;
    if (!fits(clef, ps, max) || ps.some((p) => staffPosition(clef, p) < -2 * max - 1 || staffPosition(clef, p) > 8 + 2 * max + 1)) continue;
    // exactly the voicing accepted; any voicing with the right pitch classes, the root at the bottom and the right number of notes is accepted
    return {
      prompt: `Write the ${ROMAN_WORD[roman]} chord (chord ${romanLabel(key, roman)}) of ${kw(keyText)}${key.mode === "minor" ? " (harmonic minor)" : ""} in the ${clef} clef, in root position, using ${voices === 3 ? "three notes (a plain triad)" : "four notes (so one note of the triad is written twice)"}.`,
      answer: { kind: "chord", task: "build", key: keyText, voices, target: { roman: roman as "I", inversion: "a" }, acceptedVoicings: [ps.map(F)] },
      hints: ["The lowest note is the root. The other notes are the 3rd and the 5th above it; a doubled note is the same letter an octave higher."],
    };
  }
  return null;
};

// Passage: three chords, one per bar, over two staves.
export function chordLabelEvent(pitches: Pitch[], label: string): NotationEvent {
  return chordEv(pitches, { label });
}
export function chordPassage(c: Ctx, nChords: number): { keyText: string; romans: string[]; voicings: Pitch[][]; score: ReturnType<typeof toScore> } | null {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const set = romansIn(c);
  const romans: string[] = [];
  for (let i = 0; i < nChords; i++) {
    let r = c.rng.pick(set);
    for (let t = 0; t < 4 && i > 0 && r === romans[i - 1]; t++) r = c.rng.pick(set);
    romans.push(r);
  }
  if (new Set(romans).size < 2) return null;
  const voicings: Pitch[][] = [];
  for (const r of romans) {
    const v = voicing(c, keyText, r, 0, c.rng.pick([null, 0, 2] as const));
    if (!v || !grand(c, keyText, v)) return null;
    voicings.push(v);
  }
  const labels = ["A", "B", "C", "D"];
  const trMeasures: Measure[] = voicings.map((v, i) => ({ events: [chordEv(v.filter((p) => chromaticNumber(p) >= 60), { label: labels[i]! })].map((e) => (v.some((p) => chromaticNumber(p) >= 60) ? e : ({ kind: "rest", duration: { value: "semibreve", dots: 0 }, wholeBar: true } as NotationEvent))), ...(i === voicings.length - 1 ? { barline: "final" as const } : {}) }));
  const baMeasures: Measure[] = voicings.map((v, i) => ({ events: [v.some((p) => chromaticNumber(p) < 60) ? chordEv(v.filter((p) => chromaticNumber(p) < 60)) : ({ kind: "rest", duration: { value: "semibreve", dots: 0 }, wholeBar: true } as NotationEvent)], ...(i === voicings.length - 1 ? { barline: "final" as const } : {}) }));
  const tr = frag("treble", trMeasures, "", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  const ba = frag("bass", baMeasures, "", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  const desc = (clef: Clef, f: typeof tr, ch: Pitch[][], sel: (p: Pitch) => boolean) => f.measures.map((_, i) => `Bar ${i + 1}${clef === "treble" ? ` (chord ${labels[i]})` : ""}: ${staffWords(clef, ch[i]!.filter(sel))}.`).join(" ");
  tr.textAlternative = `Treble stave. ${desc("treble", tr, voicings, (p) => chromaticNumber(p) >= 60)}`;
  ba.textAlternative = `Bass stave. ${desc("bass", ba, voicings, (p) => chromaticNumber(p) < 60)}`;
  const score = { staves: [{ id: "treble", label: "Treble", music: tr }, { id: "bass", label: "Bass", music: ba }], textAlternative: `A ${nChords}-bar passage in ${keyText}, ${key.mode === "minor" ? "harmonic minor, " : ""}with one chord in each bar. ${tr.textAlternative} ${ba.textAlternative}` };
  return { keyText, romans, voicings, score };
}

/** t.g4.chord-in-passage: name the chords marked A, B and C in a short passage; every chord is tonic, subdominant or dominant in root position. */
export const chordInPassage4: Gen = (c): any => {
  const p = chordPassage(c, 3);
  if (!p) return null;
  const key = parseKey(p.keyText);
  const labels = ["A", "B", "C"];
  return {
    prompt: `This passage is in ${kw(p.keyText)}${key.mode === "minor" ? " (harmonic minor)" : ""}. Every marked chord is in root position. Name chords A, B and C: tonic (I), subdominant (IV) or dominant (V).`,
    score: p.score,
    answer: { kind: "composite", parts: p.romans.map((r, i) => ({ id: `chord-${labels[i]!.toLowerCase()}`, prompt: `Name chord ${labels[i]}.`, answer: { kind: "chord", task: "identify", key: p.keyText, pitches: p.voicings[i]!.map(F), acceptedChords: [{ roman: r as "I", inversion: "a" }] } })) },
    hints: ["For each chord, find the lowest note (the root) and say which degree of the key it is."],
  };
};

void ledgerLines;
void diatonicNumber;
void optsOf;


/** t.g4.chord-passage-pick: in a four-chord passage, which marked chord is the subdominant or the dominant? Exactly one chord has the function asked. */
export const chordPassagePick: Gen = (c): any => {
  const p = chordPassage(c, 4);
  if (!p) return null;
  const key = parseKey(p.keyText);
  const labels = ["A", "B", "C", "D"];
  const ask = c.rng.pick(["IV", "V"].filter((r) => romansIn(c).includes(r)));
  const hits = p.romans.map((r, i) => (r === ask ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) return null;
  return {
    prompt: `This passage is in ${kw(p.keyText)}${key.mode === "minor" ? " (harmonic minor)" : ""}. Every chord is in root position. Which marked chord in the passage is the ${ROMAN_WORD[ask]} chord (${ask})?`,
    score: p.score,
    answer: { kind: "choice", options: labels.map((l) => ({ id: l, label: `Chord ${l}` })), correctOptionIds: [labels[hits[0]!]!], diagnoses: Object.fromEntries(labels.map((l, i) => [l, i === hits[0] ? null : diag("wrong-degree", `Chord ${l} is the ${ROMAN_WORD[p.romans[i]!]} chord (${p.romans[i]}): its root is degree ${music.romanDegree(p.romans[i]!)} of the scale. The ${ROMAN_WORD[ask]} chord is built on degree ${music.romanDegree(ask)}.`)]).filter(([, v]) => v)) as Diagnoses },
    hints: [`Find the root (the lowest note) of each chord and say which degree of ${kw(p.keyText)} it is. The ${ROMAN_WORD[ask]} is degree ${music.romanDegree(ask)}.`],
  };
};
