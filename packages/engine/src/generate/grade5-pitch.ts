/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5 pitch generators (Brief 09, Units 2 and 3): the tenor clef and four-clef reading, octave and same-pitch transposition between
 * clefs, the six-accidental keys, chromatic and compound intervals, and transposing instruments.
 *
 * Source: First Steps in Music Theory, Grade 5 sections 3-7 and 12 (printed pp. 107-115 and 126-129, read in the supplied PDF). The official
 * outline decides what is examinable.
 *
 * Every answer is derived with the rule functions (`music.transpose`, `music.intervalBetween`, `music.scale`, `music.writtenKeyFor`, ...),
 * never typed per question, and the tests recompute them independently. Three things are kept apart (Brief 09, section 4): a note written
 * in another clef at the SAME PITCH, a note transposed by EXACTLY ONE OCTAVE, and a note whose STAVE POSITION was merely copied.
 *
 * Conventions: the transposing-instrument interval is always stated together with its direction ("up a minor 3rd") and with whether the
 * given music is written or concert pitch (OPEN_QUESTIONS Q36); intervals asked at Grade 5 are never doubly augmented or diminished
 * (the book says not every possibility can be covered by the word "doubly").
 */
import { deriveScale, music, type AnswerSpec, type Measure } from "@mtp/curriculum";
import { frag, type Gen } from "./families.ts";
import { KEYS_G5, NEW_KEYS, F, P, WORDS, an, cap, choiceAnswer, clefsIn, family5, fitsIn, keyWords, keysIn, melodyIn5, nameOfPc, note, pretty, shuffled, type Clef, type Ctx, type Ev, type Pitch } from "./grade5-lib.ts";

const { parseKey, formatKey, transpose, parseInterval, intervalBetween, staffPosition, naturalAt, describeInterval } = music;
const CLEF_WORD: Record<Clef, string> = { treble: "treble clef", bass: "bass clef", alto: "alto clef", tenor: "tenor clef" };

/** The rhythm of a short melody: one or two bars of crotchets with a longer last note. */
function rhythmFor(count: number): { ts: string; bars: Array<Array<music.NoteValue>> } | null {
  const c = "crotchet" as const;
  switch (count) {
    case 4: return { ts: "4/4", bars: [[c, c, c, c]] };
    case 5: return { ts: "4/4", bars: [[c, c, c, c], ["semibreve"]] };
    case 6: return { ts: "3/4", bars: [[c, c, c], [c, c, c]] };
    case 7: return { ts: "4/4", bars: [[c, c, c, c], [c, c, "minim"]] };
    case 8: return { ts: "4/4", bars: [[c, c, c, c], [c, c, c, c]] };
    default: return null;
  }
}
/** A melody as a stave fragment, with the key signature and (optionally) marked notes. */
export function melodyFrag(clef: Clef, pitches: Pitch[], key: string | undefined, labels: Record<number, string> = {}, extra: Record<string, unknown> = {}) {
  const r = rhythmFor(pitches.length);
  if (!r) throw new Error(`no rhythm for ${pitches.length} notes`);
  let i = 0;
  const measures: Measure[] = r.bars.map((vals, bi) => ({ events: vals.map((v) => { const k = i++; return note(pitches[k]!, v, labels[k] ? { label: labels[k] } : {}); }), ...(bi === r.bars.length - 1 ? { barline: "final" as const } : {}) }));
  return frag(clef, measures, "A short melody.", { ...(key ? { key, showKeySignature: true } : { showKeySignature: false }), timeSignature: r.ts, ...extra } as never);
}

// ---------------------------------------------------------------------------
// Unit 2: the tenor clef and the four clefs
// ---------------------------------------------------------------------------

/** t.g5.tenor-read: name a note in the tenor clef (the prompt says so). */
export const tenorRead: Gen = (c): any => {
  const d = family5("fam.note-read")(c) as any;
  if (!d || d.music?.clef !== "tenor") return null;
  return { ...d, prompt: d.prompt.replace("this note", "this note in the tenor clef") };
};

/** t.g5.tenor-write: write a note in the tenor clef. */
export const tenorWrite: Gen = (c): any => {
  const d = family5("fam.note-write")(c) as any;
  if (!d || d.answer?.clef !== "tenor") return null;
  return d;
};

/** t.g5.tenor-facts: what the tenor clef is, where it puts middle C, who reads it. */
export const tenorFacts: Gen = (c): any => {
  const mode = c.rng.pick(["line", "c-clefs", "reads", "order", "alto-or-tenor"] as const);
  if (mode === "line") {
    const opts: Array<[string, string]> = [["first", "the bottom line"], ["second", "the second line from the bottom"], ["third", "the middle line"], ["fourth", "the fourth line from the bottom (the second line from the top)"], ["fifth", "the top line"]];
    return {
      prompt: "In the tenor clef, which line of the stave does middle C sit on?",
      answer: choiceAnswer(opts, "fourth", { third: ["clef-confusion", "Middle C is on the middle line in the alto clef. The tenor clef is centred one line higher: on the fourth line."], first: ["clef-confusion", "The bottom line is the first line. In the bass clef middle C is above the stave; in the tenor clef it is on the fourth line."], second: ["clef-confusion", "In the tenor clef middle C is on the fourth line: the clef's centre is drawn on that line."], fifth: ["clef-confusion", "The tenor clef is centred on the fourth line, so middle C is there, not on the top line."] }),
      hints: ["A C clef is drawn so that its centre sits on the line that is middle C. The alto clef is centred on the middle line; the tenor clef on the line above it."],
    };
  }
  if (mode === "c-clefs") {
    const opts: Array<[string, string]> = [["at", "alto and tenor"], ["tb", "treble and bass"], ["ta", "treble and alto"], ["bt", "bass and tenor"]];
    return {
      prompt: "Two of the four clefs in use today are called C clefs, because the centre of the sign marks middle C. Which two?",
      answer: choiceAnswer(shuffled(c, opts), "at", { tb: ["clef-confusion", "The treble clef marks G and the bass clef marks F; they are G and F clefs."], ta: ["clef-confusion", "The treble clef is a G clef. The two C clefs are the alto and the tenor."], bt: ["clef-confusion", "The bass clef is an F clef. The two C clefs are the alto and the tenor."] }),
      hints: ["Look at where the centre of each clef sign sits: only the alto and tenor signs mark middle C."],
    };
  }
  if (mode === "reads") {
    const reading = ["cello", "bassoon", "tenor trombone"];
    const not: Array<[string, string]> = [["viola", "the viola reads the alto clef (and sometimes the treble)"], ["flute", "the flute reads the treble clef"], ["violin", "the violin reads the treble clef"], ["trumpet", "the trumpet reads the treble clef"]];
    const right = c.rng.pick(reading);
    const wrongs = shuffled(c, not).slice(0, 3);
    const opts = shuffled(c, [[right, right] as [string, string], ...wrongs.map(([n]) => [n, n] as [string, string])]);
    return {
      prompt: "Which of these instruments can read the tenor clef (as well as the bass clef)?",
      answer: choiceAnswer(opts, right, Object.fromEntries(wrongs.map(([n, why]) => [n, ["wrong-category", `No: ${why}.`]]))),
      hints: ["The tenor clef is used by the higher notes of low instruments, to avoid many ledger lines above the bass stave."],
    };
  }
  if (mode === "alto-or-tenor") {
    const alto = c.rng.chance(0.5);
    const inst = alto ? "viola" : c.rng.pick(["cello", "bassoon", "tenor trombone"]);
    const opts: Array<[string, string]> = [["alto", "the alto clef"], ["tenor", "the tenor clef"]];
    return {
      prompt: `A part for the ${inst} is written in a C clef. Which one is more likely for the ${inst} (the tenor clef is used for its higher notes)?`,
      answer: choiceAnswer(opts, alto ? "alto" : "tenor", { [alto ? "tenor" : "alto"]: ["clef-confusion", alto ? "The viola's own clef is the alto clef." : `The ${inst} reads the tenor clef for its higher notes; the alto clef belongs to the viola.`] }),
      hints: ["The viola is the alto-clef instrument. The cello, bassoon and tenor trombone use the tenor clef."],
    };
  }
  const orders: Array<[string, string]> = [["tatb", "treble, alto, tenor, bass"], ["tbta", "treble, tenor, alto, bass"], ["btat", "bass, tenor, alto, treble"], ["atbt", "alto, treble, tenor, bass"]];
  return {
    prompt: "Which list puts the four clefs, including the tenor clef, in order from the highest range of notes to the lowest?",
    answer: choiceAnswer(shuffled(c, orders), "tatb", { tbta: ["clef-confusion", "The tenor clef has a lower range than the alto clef."], btat: ["clef-confusion", "That list runs from lowest to highest."], atbt: ["clef-confusion", "The treble clef has the highest range of the four."] }),
    hints: ["Treble is highest, then alto, then tenor, and the bass clef covers the lowest notes."],
  };
};

/** t.g5.four-clef-read: name a marked note of a short melody in a key, in any of the four clefs. */
export const fourClefRead: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c, ["alto", "tenor"]));
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const mel = melodyIn5(c, key, clef, c.rng.pick([5, 6]), 1);
  if (!mel) return null;
  // the marked note is one the key signature changes, so that clef AND signature both matter
  const altered = mel.map((p, i) => [p, i] as const).filter(([p]) => p.alter !== 0 && music.signatureAlter(key, p.step) === p.alter);
  const pool = altered.length && c.rng.chance(0.7) ? altered : mel.map((p, i) => [p, i] as const);
  const [target, at] = c.rng.pick(pool);
  const f = melodyFrag(clef, mel, keyText, { [at]: "x" });
  return {
    prompt: "Name the note marked x. Give its letter name and any sharp or flat that the key signature gives it.",
    music: f,
    answer: { kind: "pitch", accepted: [F(target)], octaveSensitive: false, spellingSensitive: true, relation: "same" },
    hints: ["Find the clef first: which line is middle C? Then count to the marked note, and apply the key signature."],
  };
};

/** t.g5.same-pitch: write the same melody, at the same pitch, in another clef. */
export const samePitch5: Gen = (c): any => {
  const clefs = clefsIn(c, ["alto", "tenor"]);
  const from = c.rng.pick(clefs);
  const to = c.rng.pick(clefs.filter((x) => x !== from));
  if (!to || (from !== "tenor" && to !== "tenor" && from !== "alto" && to !== "alto")) return null;
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const mel = melodyIn5(c, key, from, c.rng.pick([4, 5, 6]), 1);
  if (!mel || !fitsIn(to, mel, 2)) return null;
  return {
    prompt: `Write this melody in the ${CLEF_WORD[to]} so that it sounds at exactly the same pitch. Keep the key signature.`,
    music: melodyFrag(from, mel, keyText),
    answer: { kind: "pitch-sequence", clef: to, key: keyText, accepted: [mel.map(F)], derivation: { rule: "transpose", interval: "P1", direction: "up", sourceKey: keyText } },
    hints: [`Find the first note's name in the ${from} clef, then write that same note in the ${to} clef. Do not copy the positions on the stave: the clefs give the same positions different names.`],
  };
};

/** t.g5.clef-position: a copy of a melody in another (or the same) clef: same pitch, one octave away, or only the stave positions copied. */
export const clefPosition5: Gen = (c): any => {
  const clefs = clefsIn(c, ["alto", "tenor"]);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const A = c.rng.pick(clefs);
  const kind = c.rng.pick(["same", "up", "down", "positions"] as const);
  const B = kind === "up" || kind === "down" ? c.rng.pick(clefs) : c.rng.pick(clefs.filter((x) => x !== A));
  if (!B) return null;
  if (![A, B].some((x) => x === "tenor")) return null; // a tenor-clef staff is always involved
  const mel = melodyIn5(c, key, A, 4, 1);
  if (!mel) return null;
  let copy: Pitch[];
  if (kind === "same") copy = mel;
  else if (kind === "up" || kind === "down") copy = mel.map((p) => transpose(p, parseInterval("P8"), kind));
  else copy = mel.map((p) => { const base = naturalAt(B, staffPosition(A, p)); return { ...base, alter: music.signatureAlter(key, base.step) }; });
  if (!fitsIn(B, copy, 2) || !fitsIn(A, mel, 1)) return null;
  const rel = copy.map((p, i) => { const iv = intervalBetween(mel[i]!, p); return `${iv.quality}${iv.number}:${Math.sign(music.chromaticNumber(p) - music.chromaticNumber(mel[i]!))}`; });
  const truth = new Set(rel).size > 1 ? "different" : rel[0] === "P1:0" ? "same" : rel[0] === "P8:1" ? "up" : rel[0] === "P8:-1" ? "down" : "different";
  if (truth !== kind) return null;
  const f1 = melodyFrag(A, mel, keyText);
  const f2 = melodyFrag(B, copy, keyText);
  const score = { staves: [{ id: "original", label: `Original (${CLEF_WORD[A]})`, music: f1 }, { id: "copy", label: `Copy (${CLEF_WORD[B]})`, music: f2 }], textAlternative: "A melody and a copy of it." };
  const opts: Array<[string, string]> = [["same", "It sounds at exactly the same pitch"], ["up", "It sounds exactly one octave higher"], ["down", "It sounds exactly one octave lower"], ["different", "It sounds different, and not an octave away: only the positions on the stave were copied"]];
  const why = (k: string): [string, string] => k === "same" ? ["wrong-octave", "The copy does not sound the same: some or all of its notes are named differently."] : k === "different" ? ["wrong-clef", "These notes are not at the positions of the original: the copy is a real change of pitch, not just a change of clef."] : ["wrong-octave", `The copy is not exactly one octave ${k === "up" ? "higher" : "lower"}: compare the letter names of the first notes.`];
  return {
    prompt: `A copyist has written this melody out again in the ${CLEF_WORD[B]}. How does the copy sound compared with the original?`,
    score,
    answer: choiceAnswer(opts, truth, Object.fromEntries(opts.map(([id]) => [id, why(id)]).filter(([id]) => id !== truth) as Array<[string, [string, string]]>)),
    hints: ["Name the first note of each stave. The same letter name and octave number is the same pitch."],
  };
};

/** t.g5.octave-transpose: transpose a melody exactly one octave, using a named clef (the tenor clef is always involved). */
export const octaveTranspose5: Gen = (c): any => {
  const clefs = (c.scope.octaveTranspositionClefs?.length ? c.scope.octaveTranspositionClefs : c.scope.clefs?.length ? c.scope.clefs : ["treble", "bass", "alto", "tenor"]) as Clef[];
  const from = c.rng.pick(clefs);
  const to = c.rng.pick(clefs);
  if (from !== "tenor" && to !== "tenor") return null;
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const mel = melodyIn5(c, key, from, c.rng.pick([4, 5, 6]), 1);
  if (!mel) return null;
  const dir = c.rng.pick(["up", "down"] as const);
  const out = mel.map((p) => transpose(p, parseInterval("P8"), dir));
  if (!fitsIn(to, out, 2)) return null;
  return {
    prompt: `This melody is in the ${CLEF_WORD[from]}. Write it exactly one octave ${dir === "up" ? "higher" : "lower"} in the ${CLEF_WORD[to]}${to === from ? " (the same clef)" : ""}, keeping the key signature.`,
    music: melodyFrag(from, mel, keyText),
    answer: { kind: "pitch-sequence", clef: to, key: keyText, accepted: [out.map(F)], derivation: { rule: "transpose", interval: "P8", direction: dir, sourceKey: keyText } },
    hints: [to === from ? "An octave is eight letter names: a line note becomes a space note a stave's width away." : `Work out the first note, move it an octave ${dir}, then write it in the ${to} clef. Do not just copy the positions.`],
  };
};

/** t.g5.key-signature: write a key signature in any of the four clefs (the prompt names the clef), or name the key shown. */
export const keySignature5: Gen = (c): any => {
  const d = family5("fam.key-signature")(c) as any;
  if (!d) return null;
  return d;
};

// ---------------------------------------------------------------------------
// Unit 3: keys with six sharps or flats
// ---------------------------------------------------------------------------

/** t.g5.scale-build: write a scale of F# major, G♭ major, D# minor or E♭ minor (the six-accidental keys). */
export const scaleBuild5: Gen = (c): any => {
  const d = family5("fam.scale-builder")(c) as any;
  if (!d || d.answer?.kind !== "pitch-sequence" || d.answer.derivation?.rule !== "scale") return null;
  if (!NEW_KEYS.includes(d.answer.derivation.key)) return null;
  return d;
};

const accWord = (n: number, type: string) => `${WORDS[n]} ${n === 1 ? type.slice(0, -1) : type}`;

/** t.g5.key-facts: the six-accidental keys: counts, relatives, enharmonic twins and leading notes. */
export const keyFacts5: Gen = (c): any => {
  const keys = (c.scope.keys ?? []).filter((k) => NEW_KEYS.includes(k));
  if (!keys.length) return null;
  const keyText = c.rng.pick(keys);
  const key = parseKey(keyText);
  const sig = music.keySignature(key);
  const mode = c.rng.pick(["count", "relative", "twin", "leading"] as const);
  if (mode === "count") {
    const opts: Array<[string, string]> = [];
    const mk = (n: number, t: string) => [`${t}-${n}`, accWord(n, t)] as [string, string];
    opts.push(mk(sig.count, sig.type), mk(sig.count - 1, sig.type), mk(sig.count, sig.type === "sharps" ? "flats" : "sharps"), mk(sig.count + 1, sig.type));
    const right = `${sig.type}-${sig.count}`;
    return {
      prompt: `How many sharps or flats are in the key signature of ${keyWords(keyText)}?`,
      answer: choiceAnswer(shuffled(c, opts), right, Object.fromEntries(opts.filter(([id]) => id !== right).map(([id, l]) => [id, ["wrong-count", `${keyWords(keyText)} has ${accWord(sig.count, sig.type)}, not ${l}.`]]))),
      hints: ["Count round the circle of fifths, or count the sharps or flats of the relative key."],
    };
  }
  if (mode === "relative") {
    const rel = music.relativeKey(key);
    const wrongs = [formatKey(key.mode === "major" ? { ...key, mode: "minor" } : { ...key, mode: "major" }), key.mode === "major" ? formatKey(parseKey(music.formatKey(music.relativeKey(parseKey(keyText === "F# major" ? "Gb major" : keyText === "Gb major" ? "F# major" : keyText === "D# minor" ? "Eb minor" : "D# minor"))))) : formatKey(parseKey(keyText === "F# major" ? "Gb major" : keyText === "Gb major" ? "F# major" : keyText === "D# minor" ? "Eb minor" : "D# minor"))];
    const right = formatKey(rel);
    const uniq = [...new Set([right, ...wrongs, key.mode === "major" ? "A minor" : "C major"])].filter((x) => x !== keyText).slice(0, 4);
    if (!uniq.includes(right)) return null;
    return {
      prompt: `What is the relative ${key.mode === "major" ? "minor" : "major"} of ${keyWords(keyText)}?`,
      answer: choiceAnswer(shuffled(c, uniq.map((x) => [x, keyWords(x)] as [string, string])), right, Object.fromEntries(uniq.filter((x) => x !== right).map((x) => [x, ["relative-confusion", `${keyWords(x)} does not share the key signature of ${keyWords(keyText)}. A relative key starts a minor 3rd ${key.mode === "major" ? "below" : "above"} the tonic.`]]))),
      hints: ["A relative minor starts on the sixth note of the major scale; it has the same key signature."],
    };
  }
  if (mode === "twin") {
    const twin: Record<string, string> = { "F# major": "Gb major", "Gb major": "F# major", "D# minor": "Eb minor", "Eb minor": "D# minor" };
    const right = twin[keyText]!;
    const others = ["F# major", "Gb major", "D# minor", "Eb minor", "B major", "Db major"].filter((x) => x !== keyText && x !== right);
    const wrongs = shuffled(c, others).slice(0, 3);
    return {
      prompt: `${keyWords(keyText)} and another key use the very same keys on the piano, but are spelt differently (enharmonic keys). Which is the other key?`,
      answer: choiceAnswer(shuffled(c, [right, ...wrongs].map((x) => [x, keyWords(x)] as [string, string])), right, Object.fromEntries(wrongs.map((x) => [x, ["enharmonic-spelling", `${keyWords(x)} uses different notes on the piano from ${keyWords(keyText)}.`]]))),
      hints: ["Six sharps and six flats meet at the same place on the circle of fifths."],
    };
  }
  // leading note
  const scale = music.scale(key, key.mode === "major" ? "major" : "harmonic");
  const lead = scale[6]!;
  const naturalAlt: music.PitchClass = { step: music.STEPS[(music.stepIndex(lead.step) + 1) % 7]!, alter: 0 };
  void naturalAlt;
  const respelt = music.pitchFromNumbers(music.diatonicNumber({ ...lead, octave: 4 }) + 1, music.chromaticNumber({ ...lead, octave: 4 }));
  const down = music.pitchFromNumbers(music.diatonicNumber({ ...lead, octave: 4 }), music.chromaticNumber({ ...lead, octave: 4 }) - 1);
  const names = [nameOfPc(lead), nameOfPc({ step: respelt.step, alter: respelt.alter }), nameOfPc({ step: down.step, alter: down.alter }), nameOfPc({ step: lead.step, alter: 0 })];
  const ids = [...new Set(names)];
  if (ids.length < 3) return null;
  return {
    prompt: `What is the leading note (the 7th degree) of ${keyWords(keyText)}${key.mode === "minor" ? ", in the harmonic minor" : ""}? Spell it correctly.`,
    answer: choiceAnswer(shuffled(c, ids.map((x) => [x, x] as [string, string])), names[0]!, Object.fromEntries(ids.slice(1).map((x) => [x, [x === names[1] ? "enharmonic-spelling" : "semitone-misplaced", x === names[1] ? `${x} sounds the same, but the leading note must be the ${music.TECHNICAL_NAMES[6]} on the letter just below the tonic's letter: each letter is used once.` : `The leading note of ${keyWords(keyText)} is ${names[0]}.`]]))),
    hints: ["The leading note is a semitone below the tonic and uses the letter just below the tonic's letter."],
  };
};

/** t.g5.scale-spot: one note of a six-accidental scale is spelt with the wrong letter name; which one? */
export const scaleSpot5: Gen = (c): any => {
  const keys = (c.scope.keys ?? []).filter((k) => NEW_KEYS.includes(k));
  if (!keys.length) return null;
  const keyText = c.rng.pick(keys);
  const key = parseKey(keyText);
  const clef: Clef = "treble";
  const start = { ...key.tonic, octave: 4 };
  const notes = deriveScale(keyText, key.mode === "major" ? "major" : "harmonic", "ascending", start);
  const at = c.rng.int(1, 6); // never the first or last note
  const p = notes[at]!;
  const dir = c.rng.pick([1, -1]);
  const respelt = music.pitchFromNumbers(music.diatonicNumber(p) + dir, music.chromaticNumber(p));
  if (Math.abs(respelt.alter) > 2) return null;
  const shown = notes.map((x, i) => (i === at ? respelt : x));
  if (!fitsIn(clef, shown, 2)) return null;
  const events: Ev[] = shown.map((x, i) => note(x, "semibreve", i > 0 && i < 7 ? { label: String(i + 1) } : {}));
  const f = frag(clef, [{ events }], "A scale.", { showKeySignature: false });
  const opts: Array<[string, string]> = [1, 2, 3, 4, 5, 6].map((i) => [String(i + 1), `Note ${i + 1}`]);
  const right = String(at + 1);
  return {
    prompt: `This is meant to be the ${key.mode === "major" ? "scale of" : "harmonic minor scale of"} ${keyWords(keyText)}, written without a key signature. One of the numbered notes sounds right but is spelt with the wrong letter name. Which one?`,
    music: f,
    answer: choiceAnswer(opts, right, Object.fromEntries(opts.filter(([id]) => id !== right).map(([id]) => [id, ["letter-skipped-or-repeated", `Note ${id} is spelt correctly. Look for the place where a letter name is skipped or used twice in a row.`]]))),
    hints: ["In a scale each letter name is used once, in order. A letter that appears twice in a row, or is missed out, shows the wrong spelling."],
  };
};

// ---- intervals ---------------------------------------------------------

const QUAL: Record<string, string> = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const qualWord = (code: string) => `${QUAL[code[0]!]} ${music.ordinal(Number(code.slice(1)))}`;
const SIMPLE_POOL = ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7", "A1", "A2", "A3", "A4", "A5", "A6", "d3", "d4", "d5", "d6", "d7", "d8", "A7"].filter((x) => x !== "d8");

export const isDiatonicPair = music.isDiatonicPair;
export const isChromaticPair = (lower: Pitch, upper: Pitch) => music.isChromaticPairOfPitches(lower, upper);

function randomPair(c: Ctx, codes: string[], clef: Clef, wantChromatic: boolean | null): { lower: Pitch; upper: Pitch; code: string } | null {
  const code = c.rng.pick(codes);
  const iv = parseInterval(code);
  const lower: Pitch = { step: c.rng.pick(music.STEPS), alter: c.rng.pick([0, 0, 1, -1]), octave: c.rng.pick(clef === "bass" ? [2, 3] : clef === "treble" ? [4] : [3, 4]) };
  let upper: Pitch;
  try { upper = transpose(lower, iv, "up"); } catch { return null; }
  if (Math.abs(upper.alter) > 2 || Math.abs(lower.alter) > 1) return null;
  if (!fitsIn(clef, [lower, upper], 2)) return null;
  if (wantChromatic !== null && isChromaticPair(lower, upper) !== wantChromatic) return null;
  const back = intervalBetween(lower, upper);
  if (`${back.quality}${back.number}` !== code) return null;
  return { lower, upper, code };
}

/** t.g5.interval-any: name the interval between any two notes (chromatic or diatonic, never compound). */
export const intervalAny5: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c, ["treble", "bass", "alto", "tenor"]));
  const pair = randomPair(c, SIMPLE_POOL, clef, c.rng.chance(0.75));
  if (!pair) return null;
  const { lower, upper, code } = pair;
  return {
    prompt: "Name this interval, measured from the lower note to the higher one: give its quality and its number.",
    music: frag(clef, [{ events: [note(lower, "semibreve"), note(upper, "semibreve")] }], `Two semibreves in the ${clef} clef: ${pretty(F(lower))} then ${pretty(F(upper))} above it.`, { showKeySignature: false }),
    answer: { kind: "interval", task: "identify", lower: F(lower), upper: F(upper), acceptedIntervals: [code] },
    hints: ["Count the letter names for the number (both ends). Then compare the upper note with the major scale of the lower note, or count semitones, for the quality."],
  };
};

/** t.g5.interval-write: write the note that makes a named interval above or below a given note. */
export const intervalWrite5: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c, ["treble", "bass"]).filter((x) => x === "treble" || x === "bass"));
  const pair = randomPair(c, SIMPLE_POOL, clef, c.rng.chance(0.7));
  if (!pair) return null;
  const { lower, upper, code } = pair;
  const down = c.rng.chance(0.4);
  const start = down ? upper : lower;
  const goal = down ? lower : upper;
  return {
    prompt: `Write the note that is ${an(qualWord(code))} ${down ? "below" : "above"} ${pretty(F(start).replace(/\d$/, ""))}. Write it on the stave, with any sharp, flat or natural it needs.`,
    music: frag(clef, [{ events: [note(start, "semibreve")] }], `A semibreve ${pretty(F(start))} in the ${clef} clef.`, { showKeySignature: false }),
    answer: { kind: "interval", task: "build", lower: F(start), target: code, direction: down ? "down" : "up", acceptedPitches: [F(goal)] },
    hints: [`Count ${code.slice(1)} letter names ${down ? "down" : "up"} from ${F(start).replace(/\d$/, "")} for the letter, then add the sharp or flat that gives the quality.`],
  };
};

const compoundOf = (q: string, simple: number) => ({ code: `${q}${simple + 7}`, alt: `c${q}${simple}` });
/** t.g5.interval-compound: name an interval larger than an octave, either as "major 10th" or as "compound major 3rd". */
export const intervalCompound5: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c, ["treble", "bass"]).filter((x) => x === "treble" || x === "bass"));
  const pool = SIMPLE_POOL.filter((x) => !x.endsWith("1") && x !== "A7");
  const pair = randomPair(c, pool, clef, null);
  if (!pair) return null;
  const { lower, code } = pair;
  const simple = Number(code.slice(1));
  const upper = transpose(transpose(lower, parseInterval(code), "up"), parseInterval("P8"), "up");
  if (Math.abs(upper.alter) > 2 || !fitsIn(clef, [lower, upper], 3)) return null;
  const { code: c1, alt } = compoundOf(code[0]!, simple);
  const back = intervalBetween(lower, upper);
  if (`${back.quality}${back.number}` !== c1) return null;
  return {
    prompt: "Name this interval, which is larger than an octave. Either form is correct: for example, major 10th, or compound major 3rd.",
    music: frag(clef, [{ events: [note(lower, "semibreve"), note(upper, "semibreve")] }], `Two semibreves in the ${clef} clef, more than an octave apart: ${pretty(F(lower))} then ${pretty(F(upper))} above it.`, { showKeySignature: false }),
    answer: { kind: "interval", task: "identify", lower: F(lower), upper: F(upper), acceptedIntervals: [c1, alt] },
    hints: ["Count the letter names from the lower to the upper note (both ends): that is the number, even above 8. Or count the same interval inside one octave and say 'compound'. The quality stays the same."],
  };
};

/** t.g5.interval-facts: how a semitone changes an interval; semitones and letter names; the same sound with two names. */
export const intervalFacts5: Gen = (c): any => {
  const mode = c.rng.pick(["change", "change", "semitones", "twin"] as const);
  const clef: Clef = "treble";
  const pair = randomPair(c, ["m3", "M3", "m6", "M6", "P4", "P5", "m7", "M7", "M2", "m2", "A4", "d5", "A2", "d7", "A6", "d3"], clef, null);
  if (!pair) return null;
  const { lower, upper, code } = pair;
  const lowName = pretty(F(lower).replace(/\d$/, ""));
  const upName = pretty(F(upper).replace(/\d$/, ""));
  if (mode === "semitones") {
    const n = music.chromaticNumber(upper) - music.chromaticNumber(lower);
    const letters = Number(code.slice(1));
    const ids = [...new Set([n, n - 1, n + 1, letters])].filter((x) => x > 0).sort((a, b) => a - b).map(String);
    return {
      prompt: `How many semitones are there from ${lowName} up to ${upName}?`,
      answer: choiceAnswer(ids.map((x) => [x, x] as [string, string]), String(n), Object.fromEntries(ids.filter((x) => x !== String(n)).map((x) => [x, ["quality-from-wrong-key", x === String(letters) ? `${x} is the number of the interval (counted in letter names), not its size in semitones.` : "Count the semitones one by one, on a keyboard if it helps: every key, black or white, is one semitone."]]))),
      hints: ["A semitone is the step from one key to the very next, black or white."],
    };
  }
  if (mode === "twin") {
    const enh = music.pitchFromNumbers(music.diatonicNumber(upper) + 1, music.chromaticNumber(upper));
    const enhName = pretty(F(enh).replace(/\d$/, ""));
    if (Math.abs(enh.alter) > 2) return null;
    const iv2 = intervalBetween(lower, enh);
    const code2 = `${iv2.quality}${iv2.number}`;
    if (!"dmMPA".includes(iv2.quality)) return null;
    const wrongs = [...new Set([code, `${iv2.quality === "m" ? "M" : "m"}${iv2.number}`, `${iv2.quality === "A" ? "M" : "A"}${iv2.number}`, `P${iv2.number}`].filter((x) => x !== code2))].filter((x) => { try { parseInterval(x); return true; } catch { return false; } }).slice(0, 3);
    return {
      prompt: `${lowName} up to ${upName} is ${an(qualWord(code))}. The same sound can be written ${lowName} up to ${enhName}. What is that interval called?`,
      answer: choiceAnswer(shuffled(c, [code2, ...wrongs].map((x) => [x, qualWord(x)] as [string, string])), code2, Object.fromEntries(wrongs.map((x) => [x, [x === code ? "enharmonic-spelling" : "augmented-diminished-swap", x === code ? "Respelling the upper note changes its letter name, so the number and name of the interval change too." : `Count the letter names to ${enhName} for the number, then check the quality.`]]))),
      hints: ["The two intervals sound the same, but a different letter name for the upper note gives a different number."],
    };
  }
  // change: the upper note is raised or lowered by a semitone: what is the interval now?
  const dir = c.rng.pick([1, -1]);
  const moved = { ...upper, alter: upper.alter + dir };
  if (Math.abs(moved.alter) > 2) return null;
  const iv2 = intervalBetween(lower, moved);
  const code2 = `${iv2.quality}${iv2.number}`;
  if (!"dmMPA".includes(iv2.quality)) return null;
  const alts = [...new Set(["d", "m", "M", "P", "A"].map((q) => `${q}${iv2.number}`).filter((x) => { try { parseInterval(x); return x !== code2; } catch { return false; } }))].slice(0, 3);
  const movedName = pretty(F(moved).replace(/\d$/, ""));
  return {
    prompt: `${lowName} up to ${upName} is ${an(qualWord(code))}. The upper note is now ${dir > 0 ? "raised" : "lowered"} by a semitone, to ${movedName}. What is the interval now? Chromatic semitone: the letter name stays the same, so the number does not change.`,
    answer: choiceAnswer(shuffled(c, [code2, ...alts].map((x) => [x, qualWord(x)] as [string, string])), code2, Object.fromEntries(alts.map((x) => [x, [x[0] === (dir > 0 ? "d" : "A") ? "augmented-diminished-swap" : "quality-from-wrong-key", `The number stays ${iv2.number}. Raising the upper note makes the interval larger and lowering it makes it smaller: move one step along diminished – minor – major – augmented (perfect intervals sit between diminished and augmented).`]]))),
    hints: ["Larger by a semitone: minor to major, major or perfect to augmented. Smaller: major to minor, minor or perfect to diminished."],
  };
};

/** t.g5.compound-facts: a 12th is a 5th plus an octave, not 8 + 5. */
export const compoundFacts5: Gen = (c): any => {
  const mode = c.rng.pick(["number", "simple", "compound-name", "twin"] as const);
  const simple = c.rng.int(2, 7);
  const q = simple === 4 || simple === 5 ? c.rng.pick(["P", "P", "A", "d"]) : c.rng.pick(["M", "m", "A", "d"]);
  const sq = `${q}${simple}`;
  try { parseInterval(sq); } catch { return null; }
  const compoundN = simple + 7;
  if (mode === "number") {
    const ids = [...new Set([compoundN, simple + 8, simple, compoundN - 1])].sort((a, b) => a - b);
    return {
      prompt: `An octave and a ${music.ordinal(simple)} above the lower note: what is the number of the whole interval?`,
      answer: choiceAnswer(ids.map((x) => [String(x), music.ordinal(x)] as [string, string]), String(compoundN), Object.fromEntries(ids.filter((x) => x !== compoundN).map((x) => [String(x), ["compound-arithmetic", x === simple + 8 ? `Adding 8 + ${simple} counts the shared note twice. An octave is 7 steps on top of the lower note, so ${simple} + 7 = ${compoundN}.` : x === simple ? "That is the simple interval inside the octave; the whole interval is larger than an octave." : "Count up from the lower note: an octave is the 8th note, and the " + music.ordinal(simple) + " above that note is further on."]]))),
      hints: ["Add 7 to the number of the simple interval, because the octave and the interval share a note."],
    };
  }
  if (mode === "simple") {
    const ids = [...new Set([simple, compoundN, compoundN - 8 > 0 ? compoundN - 8 : 2, simple + 1])].filter((x) => x >= 2 && x <= 15).sort((a, b) => a - b);
    return {
      prompt: `A ${qualWord(`${q}${compoundN}`)} is the same as a compound interval built on which simple interval? (Give the simple interval that is left when the octave is taken away.)`,
      answer: choiceAnswer(ids.map((x) => [String(x), `${QUAL[q]} ${music.ordinal(x)}`] as [string, string]), String(simple), Object.fromEntries(ids.filter((x) => x !== simple).map((x) => [String(x), ["compound-arithmetic", `Take 7 away from ${compoundN}: ${compoundN} − 7 = ${simple}. The quality does not change.`]]))),
      hints: ["Subtract 7 from the number to take away an octave. The quality stays the same."],
    };
  }
  if (mode === "compound-name") {
    const right = `${QUAL[q]} ${music.ordinal(compoundN)}`;
    const opts = [[right, right], [`${QUAL[q]} ${music.ordinal(simple + 8)}`, `${QUAL[q]} ${music.ordinal(simple + 8)}`], [`${QUAL[q]} ${music.ordinal(simple)}`, `${QUAL[q]} ${music.ordinal(simple)}`]] as Array<[string, string]>;
    return {
      prompt: `Another way to say “compound ${QUAL[q]} ${music.ordinal(simple)}” is…`,
      answer: choiceAnswer(shuffled(c, opts), right, { [opts[1]![0]]: ["compound-arithmetic", `That adds 8, not 7: the octave and the interval share a note.`], [opts[2]![0]]: ["compound-arithmetic", "A compound interval is larger than an octave; this is the simple interval inside it."] }),
      hints: ["Compound 3rd = 10th, compound 4th = 11th, compound 5th = 12th: add 7."],
    };
  }
  // twin: both names accepted
  const right = `${QUAL[q]} ${music.ordinal(compoundN)}`;
  const opts: Array<[string, string]> = [["both", `Both are correct: “${right}” and “compound ${QUAL[q]} ${music.ordinal(simple)}” name the same interval`], ["first", `Only “${right}” is correct`], ["second", `Only “compound ${QUAL[q]} ${music.ordinal(simple)}” is correct`], ["neither", "The quality changes when the interval is larger than an octave"]];
  return {
    prompt: `Does the quality of an interval change when you give its number as a compound interval? For example, ${right} and compound ${QUAL[q]} ${music.ordinal(simple)}.`,
    answer: choiceAnswer(opts, "both", { first: ["compound-arithmetic", "The second form is also accepted: it counts the interval inside the octave and adds the word compound."], second: ["compound-arithmetic", "The first form is also accepted: it simply keeps counting letter names past 8."], neither: ["compound-arithmetic", "The quality stays the same however the number is given."] }),
    hints: ["Both ways of numbering are accepted, and the quality never changes."],
  };
};

// ---- transposing instruments --------------------------------------------

type InstKey = music.InstrumentKey;
const INST_NAME: Record<InstKey, string> = { Bb: "B♭", A: "A", F: "F" };
export const INST_LABEL: Record<InstKey, string[]> = { Bb: ["clarinet in B♭", "trumpet in B♭"], A: ["clarinet in A"], F: ["horn in F", "cor anglais (in F)"] };
export const instIn = (c: Ctx): InstKey[] => (c.scope.instrumentTranspositions ?? []) as InstKey[];
export const ivText = (k: InstKey) => describeInterval(music.INSTRUMENT_INTERVAL[k]);

/** t.g5.concert-facts: written and sounding pitch of one note, and the direction of the transposition. */
export const concertFacts5: Gen = (c): any => {
  const insts = instIn(c);
  if (!insts.length) return null;
  const inst = c.rng.pick(insts);
  const label = c.rng.pick(INST_LABEL[inst]);
  const mode = c.rng.pick(["sounds", "written", "direction", "interval"] as const);
  if (mode === "interval") {
    const opts: Array<[string, string]> = [["Bb", "a tone (major 2nd)"], ["A", "a minor 3rd"], ["F", "a perfect 5th"], ["C", "an octave"]];
    const names: Record<InstKey, string> = { Bb: "B♭", A: "A", F: "F" };
    return {
      prompt: `An instrument “in ${names[inst]}” sounds how far BELOW the note that is written for it?`,
      answer: choiceAnswer(opts, inst, Object.fromEntries(opts.filter(([id]) => id !== inst).map(([id]) => [id, ["wrong-interval", `That is the distance for an instrument in ${id === "C" ? "C an octave lower" : id === "Bb" ? "B♭" : id}, not for one in ${names[inst]}.`]]))),
      hints: ["B♭ instruments sound a tone lower than written, A instruments a minor 3rd lower, F instruments a perfect 5th lower."],
    };
  }
  if (mode === "direction") {
    const toWritten = c.rng.chance(0.5);
    const right = `${toWritten ? "up" : "down"} a ${ivText(inst)}`;
    const other = `${toWritten ? "down" : "up"} a ${ivText(inst)}`;
    const wrongI = (["Bb", "A", "F"] as InstKey[]).filter((k) => k !== inst);
    const opts: Array<[string, string]> = [["r", right], ["w", other], ["i1", `${toWritten ? "up" : "down"} a ${ivText(wrongI[0]!)}`], ["i2", `${toWritten ? "up" : "down"} a ${ivText(wrongI[1]!)}`]];
    return {
      prompt: toWritten ? `You have a melody at concert pitch (as it sounds). To write the part for a ${label}, which way do you transpose?` : `You have the written part for a ${label}. To write it at concert pitch (as it sounds), which way do you transpose?`,
      answer: choiceAnswer(shuffled(c, opts), "r", { w: ["wrong-direction", `That is the opposite direction. The ${label} sounds ${ivText(inst)} lower than written, so the written part is higher than the sounding pitch.`], i1: ["wrong-interval", `Right direction, wrong distance: the ${label} is in ${INST_NAME[inst]}.`], i2: ["wrong-interval", `Right direction, wrong distance: the ${label} is in ${INST_NAME[inst]}.`] }),
      hints: ["Written pitch is always higher than concert pitch for these instruments. Concert to written goes up; written to concert goes down."],
    };
  }
  // sounds / written for one note
  const nat = c.rng.pick([{ step: "C" as const, alter: 0 }, { step: "D" as const, alter: 0 }, { step: "E" as const, alter: 0 }, { step: "F" as const, alter: 0 }, { step: "G" as const, alter: 0 }, { step: "A" as const, alter: 0 }, { step: "F" as const, alter: 1 }, { step: "B" as const, alter: -1 }]);
  const given: Pitch = { ...nat, octave: 4 };
  const toConcert = mode === "sounds";
  const answer = toConcert ? music.writtenToConcert(given, inst) : music.concertToWritten(given, inst);
  if (Math.abs(answer.alter) > 1) return null;
  const wrongWay = toConcert ? music.concertToWritten(given, inst) : music.writtenToConcert(given, inst);
  const respelt = music.pitchFromNumbers(music.diatonicNumber(answer) + 1, music.chromaticNumber(answer));
  const cands: Array<[string, Pitch, string, string]> = [
    ["right", answer, "", ""],
    ["wrong-way", wrongWay, "wrong-direction", `That moves the note the wrong way: ${toConcert ? "written to concert" : "concert to written"} goes ${toConcert ? "down" : "up"}.`],
    ["same", given, "wrong-interval", `That is the note you were given: the ${label} does not sound as it is written.`],
    ["respelt", respelt, "enharmonic-respelling", "That sounds the same but is spelt with the wrong letter name: the transposition moves every letter by the same number of steps."],
  ];
  const seen = new Set<string>();
  const use = cands.filter(([, p]) => { const k = F(p).replace(/\d$/, ""); if (seen.has(k) || Math.abs(p.alter) > 2) return false; seen.add(k); return true; });
  if (use.length < 3 || !use.some(([id]) => id === "right")) return null;
  const nm = (p: Pitch) => pretty(F(p).replace(/\d$/, ""));
  return {
    prompt: toConcert ? `A ${label} plays the written note ${nm(given)}. Which note sounds (concert pitch)?` : `For the sound ${nm(given)} (concert pitch) to be played on a ${label}, which note must be written?`,
    answer: choiceAnswer(shuffled(c, use.map(([id, p]) => [id, nm(p)] as [string, string])), "right", Object.fromEntries(use.filter(([id]) => id !== "right").map(([id, , cat, why]) => [id, [cat, why]]))),
    hints: [`The ${label} is in ${INST_NAME[inst]}: it sounds a ${ivText(inst)} below the written note.`],
  };
};

/** t.g5.transpose-key: the key of a written part (or of the sound), found by moving the key by the instrument's interval. */
export const transposeKey5: Gen = (c): any => {
  const insts = instIn(c);
  if (!insts.length) return null;
  const inst = c.rng.pick(insts);
  const label = c.rng.pick(INST_LABEL[inst]);
  const toWritten = c.rng.chance(0.55);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  let target: music.Key;
  try { target = toWritten ? music.writtenKeyFor(key, inst) : music.concertKeyFor(key, inst); } catch { return null; }
  const targetText = formatKey(target);
  if (!(c.scope.keys ?? KEYS_G5).includes(targetText)) return null;
  const wrongWay = (() => { try { return formatKey(toWritten ? music.concertKeyFor(key, inst) : music.writtenKeyFor(key, inst)); } catch { return null; } })();
  const instKey = `${INST_NAME[inst]} ${key.mode}`;
  const cands: Array<[string, string, string]> = [[targetText, "right", ""]];
  if (wrongWay) cands.push([wrongWay, "wrong-direction", `That moves the key the wrong way: ${toWritten ? "the written part is higher than the sound" : "the sound is lower than the written part"}.`]);
  const instAsKey = `${inst === "Bb" ? "Bb" : inst} ${key.mode}`;
  if ((c.scope.keys ?? KEYS_G5).includes(instAsKey)) cands.push([instAsKey, "wrong-interval", `${instKey.replace("B♭", "B♭")} is the name of the instrument, not the key of the music: transpose the key by the instrument's interval.`]);
  cands.push([keyText, "key-signature-missing", "That is the key of the music you were given: a transposed part needs a different key signature."]);
  const uniq: Array<[string, string, string]> = [];
  for (const x of cands) if (!uniq.some((u) => u[0] === x[0])) uniq.push(x);
  if (uniq.length < 3) return null;
  return {
    prompt: toWritten ? `A melody in ${keyWords(keyText)} is at concert pitch. It is to be written as the part for a ${label}. In which key is the part written?` : `The written part for a ${label} is in ${keyWords(keyText)}. In which key does it sound (concert pitch)?`,
    answer: choiceAnswer(shuffled(c, uniq.map(([k]) => [k, keyWords(k)] as [string, string])), targetText, Object.fromEntries(uniq.filter(([k]) => k !== targetText).map(([k, cat, why]) => [k, [cat, why]]))),
    hints: [`Move the key ${toWritten ? "up" : "down"} a ${ivText(inst)}, as you would move any note.`],
  };
};

/** t.g5.instrument-transpose: transpose a short phrase between concert pitch and the written part of an instrument in B♭, A or F. */
export const instrumentTranspose5: Gen = (c): any => {
  const insts = instIn(c);
  if (!insts.length) return null;
  const inst = c.rng.pick(insts);
  const label = c.rng.pick(INST_LABEL[inst]);
  const toWritten = c.rng.chance(0.5);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  let newKey: music.Key;
  try { newKey = toWritten ? music.writtenKeyFor(key, inst) : music.concertKeyFor(key, inst); } catch { return null; }
  const newText = formatKey(newKey);
  if (!(c.scope.keys ?? KEYS_G5).includes(newText)) return null;
  const mel = melodyIn5(c, key, "treble", c.rng.pick([6, 7, 8]), 1);
  if (!mel) return null;
  const iv = music.INSTRUMENT_INTERVAL[inst];
  const dir = toWritten ? "up" : "down";
  const out = mel.map((p) => transpose(p, iv, dir));
  if (!fitsIn("treble", out, 2) || out.some((p) => Math.abs(p.alter) > 2)) return null;
  const ivCode = `${iv.quality}${iv.number}`;
  const f = melodyFrag("treble", mel, keyText, {}, { tempoText: c.rng.pick(["Andante", "Moderato", "Allegretto"]) });
  return {
    prompt: toWritten
      ? `This melody is at concert pitch (the pitch that sounds). Write it as the part for a ${label}, which sounds a ${ivText(inst)} lower than written: transpose it up a ${ivText(inst)}, and give it its new key signature.`
      : `This melody is the written part for a ${label}, which sounds a ${ivText(inst)} lower than written. Write it at concert pitch (the pitch that sounds): transpose it down a ${ivText(inst)}, and give it its new key signature.`,
    music: f,
    answer: { kind: "pitch-sequence", clef: "treble", key: newText, accepted: [out.map(F)], derivation: { rule: "transpose", interval: ivCode, direction: dir, sourceKey: keyText } },
    hints: [`First find the new key: ${keyWords(keyText)} ${dir} a ${ivText(inst)} is ${keyWords(newText)}. Then move every note by the same interval. A note that is not in the key moves to the note that is the same interval from the new key's tonic.`],
  };
};

void cap; void P; void shuffled;
export type { AnswerSpec };
