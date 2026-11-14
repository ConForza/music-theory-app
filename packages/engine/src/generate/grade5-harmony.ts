/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5 harmony generators (Brief 09, Unit 4): inversions of the triads on I, ii, IV and V, identifying and writing them in the Grade 5
 * keys, perfect / plagal / imperfect cadences in C, G, D and F major, and (optional enrichment only) the Ic-V progression and approach
 * chords.
 *
 * Source: First Steps in Music Theory, Grade 5 sections 8-11 (printed pp. 115-126, read in the supplied PDF); the official outline decides
 * what is examinable (cadences only in C, G, D and F major).
 *
 * The position of a chord depends ONLY on which note of the triad is lowest (root: a, third: b, fifth: c), never on spacing or doubling;
 * the voicings below vary both on purpose, and the grader (`identifyTriad`) never looks at either. In a minor key the triad on ii is
 * diminished (root, minor 3rd, diminished 5th) because the harmonic minor is used for chords.
 *
 * Conventions: a cadence question is only asked where the answer is settled by the last two chords (both in root position); a melody
 * question accepts every pair of chords that contains the melody notes and makes the named cadence (never a single "right" sequence).
 */
import { music } from "@mtp/curriculum";
import { frag, type Gen } from "./families.ts";
import { KEYS_G5, F, choiceAnswer, fitsIn, keyWords, keysIn, nameOfPc, note, pretty, shuffled, type Clef, type Ctx, type Ev, type Pitch } from "./grade5-lib.ts";

const { parseKey, triad, identifyTriad, romanDegree, classifyCadence, samePitchClassSpelling, diatonicNumber, staffPosition } = music;
type Inv = "a" | "b" | "c";
const INV_WORD: Record<Inv, string> = { a: "root position", b: "first inversion", c: "second inversion" };
const INV_FIG: Record<Inv, string> = { a: "5/3", b: "6/3", c: "6/4" };
const romans = (c: Ctx) => (c.scope.chordDegrees?.length ? c.scope.chordDegrees : ["I", "ii", "IV", "V"]) as string[];
const invs = (c: Ctx) => (c.scope.inversions?.length ? c.scope.inversions : ["a"]) as Inv[];
/** Quality of the triad on a degree: "major", "minor" or "diminished", by its intervals above the root. */
export function triadQuality(key: music.Key, roman: string): "major" | "minor" | "diminished" {
  const [r, m, f] = triad(key, roman);
  const up = (p: music.PitchClass, from: Pitch) => { let o = from.octave; let x: Pitch = { ...p, octave: o }; while (diatonicNumber(x) <= diatonicNumber(from)) x = { ...p, octave: ++o }; return x; };
  const root: Pitch = { ...r, octave: 3 };
  const third = up(m, root);
  const fifth = up(f, third);
  const i3 = music.intervalBetween(root, third);
  const i5 = music.intervalBetween(root, fifth);
  if (i3.quality === "M" && i5.quality === "P") return "major";
  if (i3.quality === "m" && i5.quality === "P") return "minor";
  if (i3.quality === "m" && i5.quality === "d") return "diminished";
  throw new Error(`Unexpected triad ${i3.quality}${i3.number} ${i5.quality}${i5.number}`);
}

const above = (prev: Pitch, pc: music.PitchClass): Pitch => {
  let o = prev.octave;
  let p: Pitch = { ...pc, octave: o };
  while (diatonicNumber(p) <= diatonicNumber(prev)) p = { ...pc, octave: ++o };
  return p;
};

/** All ways to write a triad with its bass note fixed by the inversion: three upper notes (one chord tone doubled) or two. */
export function voicings(key: music.Key, roman: string, inv: Inv, bassOctave: number, opts: { lo: Pitch; hi: Pitch }): { bass: Pitch; upper: Pitch[] }[] {
  const t = triad(key, roman);
  const order = { a: 0, b: 1, c: 2 }[inv];
  const bassPc = t[order]!;
  const bass: Pitch = { ...bassPc, octave: bassOctave };
  const out: { bass: Pitch; upper: Pitch[] }[] = [];
  const pool: Pitch[] = [];
  for (let o = opts.lo.octave; o <= opts.hi.octave; o++) for (const pc of t) { const p: Pitch = { ...pc, octave: o }; if (diatonicNumber(p) >= diatonicNumber(opts.lo) && diatonicNumber(p) <= diatonicNumber(opts.hi) && diatonicNumber(p) > diatonicNumber(bass)) pool.push(p); }
  pool.sort((x, y) => diatonicNumber(x) - diatonicNumber(y));
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const two = [pool[i]!, pool[j]!];
    if (cover(t, [bass, ...two]) && span(two)) out.push({ bass, upper: two });
    for (let k = j + 1; k < pool.length; k++) {
      const three = [pool[i]!, pool[j]!, pool[k]!];
      if (cover(t, [bass, ...three]) && span(three)) out.push({ bass, upper: three });
    }
  }
  return out;
}
const cover = (t: music.PitchClass[], ps: Pitch[]) => t.every((pc) => ps.some((p) => samePitchClassSpelling(p, pc))) && ps.every((p) => t.some((pc) => samePitchClassSpelling(p, pc)));
const span = (ps: Pitch[]) => ps.every((p, i) => i === 0 || (diatonicNumber(p) > diatonicNumber(ps[i - 1]!) && diatonicNumber(p) - diatonicNumber(ps[i - 1]!) <= 7));
const ENDS = { treble: { lo: { step: "C", alter: 0, octave: 4 } as Pitch, hi: { step: "A", alter: 0, octave: 5 } as Pitch }, bass: { lo: { step: "E", alter: 0, octave: 2 } as Pitch, hi: { step: "G", alter: 0, octave: 3 } as Pitch } } as const;

/** One chord on a single stave, in any spacing and with or without a doubled note. */
function singleStaveChord(c: Ctx, key: music.Key, roman: string, inv: Inv, clef: "treble" | "bass"): Pitch[] | null {
  const bassOctaves = clef === "treble" ? [3, 4] : [2, 3];
  const cands: Pitch[][] = [];
  for (const bo of bassOctaves) {
    const range = clef === "treble" ? { lo: { step: "C", alter: 0, octave: 4 } as Pitch, hi: { step: "G", alter: 0, octave: 5 } as Pitch } : { lo: { step: "E", alter: 0, octave: 2 } as Pitch, hi: { step: "G", alter: 0, octave: 4 } as Pitch };
    for (const v of voicings(key, roman, inv, bo, range)) {
      const all = [v.bass, ...v.upper];
      if (all.length <= 4 && fitsIn(clef, all, 2) && all.every((p) => Math.abs(p.alter) <= 2)) cands.push(all);
    }
  }
  if (!cands.length) return null;
  const pick = c.rng.pick(cands);
  const id = identifyTriad(key, pick);
  return id && romanDegree(id.roman) === romanDegree(roman) && id.inversion === inv ? pick : null;
}

const chordEvent = (ps: Pitch[], value: music.NoteValue = "semibreve", extra: Record<string, unknown> = {}): Ev => ({ kind: "chord", notes: ps.map((p) => ({ pitch: F(p) })), duration: { value, dots: 0 }, ...extra }) as Ev;

// ---------------------------------------------------------------------------
// t.g5.chord-identify: name a chord (Roman numeral and position)
// ---------------------------------------------------------------------------

export const chordIdentify5: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const clef = c.rng.pick((c.scope.clefs?.length ? c.scope.clefs : ["treble", "bass"]).filter((x) => x === "treble" || x === "bass")) as "treble" | "bass";
  const roman = c.rng.pick(romans(c));
  const inv = c.rng.pick(invs(c));
  const ps = singleStaveChord(c, key, roman, inv, clef);
  if (!ps) return null;
  const sorted = [...ps].sort((a, b) => diatonicNumber(a) - diatonicNumber(b));
  return {
    prompt: `Name this chord in ${keyWords(keyText)}: give its Roman numeral and its position (a, b or c). For example, IVb.`,
    music: frag(clef, [{ events: [chordEvent(sorted)] }], "A chord.", { key: keyText, showKeySignature: true }),
    answer: { kind: "chord", task: "identify", key: keyText, acceptedChords: [{ roman: roman as "I", inversion: inv }] },
    hints: ["Rearrange the notes into a stack of 3rds to find the root, then look at the LOWEST note: root (a), 3rd (b) or 5th (c). Spacing and doubled notes do not matter."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.chord-build: write a chord (any spacing, any doubling, with a stated number of notes)
// ---------------------------------------------------------------------------

export const chordBuild5: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  // A build question has no music of its own, so the learner's stave uses the scope's FIRST clef: the prompt must name that clef (chord identification uses both clefs).
  const clef = ((c.scope.clefs?.length ? c.scope.clefs : ["treble"])[0] === "bass" ? "bass" : "treble") as "treble" | "bass";
  const roman = c.rng.pick(romans(c));
  const inv = c.rng.pick(invs(c));
  const voices = c.rng.pick([3, 3, 4]);
  const ps = singleStaveChord(c, key, roman, inv, clef);
  if (!ps) return null;
  // the example voicing has the number of notes the question asks for
  // the example voicing stays close to the stave (at most one ledger line, within a ninth): every note of it can be placed with the real controls, also on a phone
  const ex = (() => { for (let i = 0; i < 80; i++) { const x = singleStaveChord(c, key, roman, inv, clef); if (x && x.length === voices && fitsIn(clef, x, 1) && Math.max(...x.map(diatonicNumber)) - Math.min(...x.map(diatonicNumber)) <= 8) return x; } return null; })();
  if (!ex) return null;
  const sorted = [...ex].sort((a, b) => diatonicNumber(a) - diatonicNumber(b));
  const bassWord = inv === "a" ? "the root" : inv === "b" ? "the 3rd" : "the 5th";
  const q = triadQuality(key, roman);
  return {
    prompt: `Write chord ${roman}${inv} of ${keyWords(keyText)} in the ${clef} clef, in ${INV_WORD[inv]} (${bassWord} of the chord is the lowest note), using exactly ${voices} notes${voices === 4 ? " (one note of the chord is written twice)" : ""}.${q === "diminished" ? " In a minor key this triad is diminished." : ""} Any spacing is correct.`,
    answer: { kind: "chord", task: "build", key: keyText, target: { roman: roman as "I", inversion: inv }, acceptedVoicings: [sorted.map(F)], voices },
    hints: [`Chord ${roman} is built on degree ${romanDegree(roman)}. Write its three notes, but put ${bassWord} lowest.`],
  };
};

// ---------------------------------------------------------------------------
// t.g5.inversion-facts: the bass note and the position (always an inversion)
// ---------------------------------------------------------------------------

export const inversionFacts5: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const roman = c.rng.pick(romans(c));
  const inv = c.rng.pick(invs(c).filter((x) => x !== "a")) as Inv;
  if (!inv) return null;
  const t = triad(key, roman);
  const bassPc = t[{ a: 0, b: 1, c: 2 }[inv]]!;
  const mode = c.rng.pick(["bass", "position", "figures", "intervals"] as const);
  const name = (pc: music.PitchClass) => nameOfPc(pc);
  if (mode === "bass") {
    const ids = t.map((pc) => name(pc));
    const other: music.PitchClass = { step: music.STEPS[(music.stepIndex(t[0]!.step) + 1) % 7]!, alter: music.signatureAlter(key, music.STEPS[(music.stepIndex(t[0]!.step) + 1) % 7]!) };
    const opts = [...new Set([...ids, name(other)])];
    const right = name(bassPc);
    return {
      prompt: `In the ${INV_WORD[inv]} of chord ${roman} in ${keyWords(keyText)}, which note is in the bass (the lowest note)?`,
      answer: choiceAnswer(shuffled(c, opts.map((x) => [x, x] as [string, string])), right, Object.fromEntries(opts.filter((x) => x !== right).map((x) => [x, [x === ids[0] ? "root-confused-with-bass" : "wrong-degree", x === ids[0] ? `${x} is the root of the chord, but in an inversion the root is not the lowest note.` : x === name(other) ? `${x} is not a note of chord ${roman}.` : `In ${INV_WORD[inv]} the ${inv === "b" ? "3rd" : "5th"} of the chord is the lowest note.`]]))),
      hints: [inv === "b" ? "First inversion: the 3rd of the chord is in the bass." : "Second inversion: the 5th of the chord is in the bass."],
    };
  }
  if (mode === "position") {
    const ids: Array<[string, string]> = [["inv-a", "Root position"], ["inv-b", "First inversion"], ["inv-c", "Second inversion"]];
    return {
      prompt: `A chord ${roman} of ${keyWords(keyText)} has ${name(bassPc)} as its lowest note, whatever notes are written above it. What position is it in?`,
      answer: choiceAnswer(ids, `inv-${inv}`, Object.fromEntries(ids.filter(([id]) => id !== `inv-${inv}`).map(([id]) => [id, ["inversion-misread", `The position depends only on which note of the chord is lowest: ${name(bassPc)} is the ${inv === "b" ? "3rd" : "5th"}, so it is ${INV_WORD[inv]}.`]]))),
      hints: ["Ask which note of the triad is lowest: the root, the 3rd or the 5th."],
    };
  }
  if (mode === "figures") {
    const ids: Array<[string, string]> = [["5/3", "5/3 (five-three)"], ["6/3", "6/3 (six-three)"], ["6/4", "6/4 (six-four)"], ["6/5", "6/5 (six-five)"]];
    return {
      prompt: `Chord ${roman} in ${INV_WORD[inv]} can also be shown with figures instead of a letter. Which figures show ${INV_WORD[inv]}?`,
      answer: choiceAnswer(shuffled(c, ids), INV_FIG[inv], Object.fromEntries(ids.filter(([id]) => id !== INV_FIG[inv]).map(([id]) => [id, ["inversion-misread", id === "5/3" ? "5/3 stands for root position: a 5th and a 3rd above the bass." : id === "6/5" ? "6/5 is not a triad position: it belongs to chords of four notes." : `The figures give the intervals above the bass: ${INV_FIG[inv].replace("/", " and ")} for ${INV_WORD[inv]}.`]]))),
      hints: ["The figures name the intervals above the lowest note: root position 5/3, first inversion 6/3, second inversion 6/4."],
    };
  }
  const rightIv = inv === "b" ? "a 6th and a 3rd" : "a 6th and a 4th";
  const ids = ["a 5th and a 3rd", "a 6th and a 3rd", "a 6th and a 4th", "a 5th and a 4th"];
  return {
    prompt: `Above its lowest note, a triad in ${INV_WORD[inv]} contains which intervals?`,
    answer: choiceAnswer(shuffled(c, ids.map((x) => [x, x] as [string, string])), rightIv, Object.fromEntries(ids.filter((x) => x !== rightIv).map((x) => [x, ["inversion-misread", x === "a 5th and a 3rd" ? "That is root position." : "Count the intervals from the lowest note to each of the other two notes."]]))),
    hints: ["Root position: 5th and 3rd. First inversion: 6th and 3rd. Second inversion: 6th and 4th."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.supertonic-facts: chord ii, diminished in a minor key
// ---------------------------------------------------------------------------

export const supertonicFacts5: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const t = triad(key, "ii");
  const mode = c.rng.pick(["notes", "kind", "kind", "intervals"] as const);
  const q = triadQuality(key, "ii");
  const notes = (ts: music.PitchClass[]) => ts.map(nameOfPc).join("–");
  if (mode === "notes") {
    const right = notes(t);
    const alt1 = notes(triad(key, "IV"));
    const alt2 = notes(triad(key, "V"));
    const wrongFifth = notes([t[0]!, t[1]!, { ...t[2]!, alter: t[2]!.alter + (q === "diminished" ? 1 : -1) }]);
    const opts = [...new Set([right, alt1, alt2, wrongFifth])];
    if (opts.length < 3) return null;
    return {
      prompt: `Which notes make chord ii (the supertonic triad) of ${keyWords(keyText)}? (Notes are listed from the root upwards.)`,
      answer: choiceAnswer(shuffled(c, opts.map((x) => [x, x] as [string, string])), right, Object.fromEntries(opts.filter((x) => x !== right).map((x) => [x, ["wrong-degree", x === wrongFifth ? `The 5th of chord ii is ${nameOfPc(t[2]!)}: use the notes of the scale (the harmonic minor in a minor key), and ${key.mode === "minor" ? "the triad is diminished" : "the triad is minor"}.` : "That is a chord on a different degree: chord ii is built on the 2nd note of the scale."]]))),
      hints: [`Chord ii is built on degree 2 of ${keyWords(keyText)}: ${nameOfPc(t[0]!)}. Add the notes a 3rd and a 5th above, taken from the scale.`],
    };
  }
  if (mode === "kind") {
    const ids: Array<[string, string]> = [["major", "a major triad"], ["minor", "a minor triad"], ["diminished", "a diminished triad"], ["augmented", "an augmented triad"]];
    return {
      prompt: `What kind of triad is chord ii in ${keyWords(keyText)}${key.mode === "minor" ? " (using the harmonic minor)" : ""}?`,
      answer: choiceAnswer(ids, q, Object.fromEntries(ids.filter(([id]) => id !== q).map(([id]) => [id, ["wrong-degree", q === "diminished" ? "In a minor key chord ii has a minor 3rd and a diminished 5th above its root: it is diminished, written ii°." : "In a major key chord ii has a minor 3rd and a perfect 5th above its root, so it is a minor triad."]]))),
      hints: ["Measure the 3rd and the 5th above the root of chord ii."],
    };
  }
  const right = q === "diminished" ? "A minor 3rd and a diminished 5th" : "A minor 3rd and a perfect 5th";
  const ids = ["A minor 3rd and a diminished 5th", "A minor 3rd and a perfect 5th", "A major 3rd and a perfect 5th", "A major 3rd and an augmented 5th"];
  return {
    prompt: `Above the root of chord ii in ${keyWords(keyText)}, which intervals are formed by the other two notes of the chord?`,
    answer: choiceAnswer(shuffled(c, ids.map((x) => [x, x] as [string, string])), right, Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, ["wrong-degree", `In ${keyWords(keyText)}, ${nameOfPc(t[0]!)} up to ${nameOfPc(t[1]!)} and up to ${nameOfPc(t[2]!)} gives ${right.toLowerCase()}.`]]))),
    hints: ["Count the letter names for each number and compare with the major scale of the root for the quality."],
  };
};

// ---------------------------------------------------------------------------
// Passages of chords on two staves
// ---------------------------------------------------------------------------

export interface ChordSpec { roman: string; inv: Inv }
interface Placed { spec: ChordSpec; bass: Pitch; upper: Pitch[] }

/** Choose smooth voicings for a progression: the upper notes move as little as possible from chord to chord. */
function voiceProgression(c: Ctx, key: music.Key, chords: ChordSpec[]): Placed[] | null {
  const out: Placed[] = [];
  let prev: Pitch[] | null = null;
  for (const spec of chords) {
    let best: { bass: Pitch; upper: Pitch[]; cost: number } | null = null;
    for (const bo of c.rng.shuffle([2, 3])) {
      for (const v of voicings(key, spec.roman, spec.inv, bo, { lo: { step: "C", alter: 0, octave: 4 }, hi: { step: "A", alter: 0, octave: 5 } })) {
        if (v.upper.length !== 3 || !fitsIn("bass", [v.bass], 1) || !fitsIn("treble", v.upper, 1)) continue;
        if (v.upper.some((p) => Math.abs(p.alter) > 2)) continue;
        const id = identifyTriad(key, [v.bass, ...v.upper]);
        if (!id || romanDegree(id.roman) !== romanDegree(spec.roman) || id.inversion !== spec.inv) continue;
        const cost: number = prev ? v.upper.reduce((s, p, i) => s + Math.abs(diatonicNumber(p) - diatonicNumber(prev![i]!)), 0) + Math.abs(diatonicNumber(v.bass) - diatonicNumber(out[out.length - 1]!.bass)) * 0.5 : Math.abs(diatonicNumber(v.upper[2]!) - 33) + c.rng.int(0, 3);
        if (!best || cost < best.cost) best = { ...v, cost };
      }
    }
    if (!best) return null;
    out.push({ spec, bass: best.bass, upper: best.upper });
    prev = best.upper;
  }
  return out;
}

function passageScore(key: string, placed: Placed[], marks: Record<number, string>, ts = "4/4") {
  const upper = placed.map((p, i) => ({ events: [chordEvent(p.upper, "semibreve", marks[i] ? { label: marks[i] } : {})], ...(i === placed.length - 1 ? { barline: "final" as const } : {}) }));
  const lower = placed.map((p, i) => ({ events: [note(p.bass, "semibreve")], ...(i === placed.length - 1 ? { barline: "final" as const } : {}) }));
  const base = { showKeySignature: true, key, timeSignature: ts, textAlternative: "x" };
  return {
    staves: [
      { id: "upper", label: "Upper stave", music: frag("treble", upper as never, "x", base as never) },
      { id: "lower", label: "Lower stave", music: frag("bass", lower as never, "x", base as never) },
    ],
    textAlternative: "A passage of chords on two staves, one chord in each bar.",
  };
}
const allNotes = (p: Placed) => [p.bass, ...p.upper].map(F);

const MAJOR_PROGS = [
  [{ roman: "I", inv: "a" }, { roman: "IV", inv: "a" }, { roman: "I", inv: "c" }, { roman: "V", inv: "a" }],
  [{ roman: "I", inv: "a" }, { roman: "ii", inv: "b" }, { roman: "V", inv: "a" }, { roman: "I", inv: "a" }],
  [{ roman: "I", inv: "b" }, { roman: "IV", inv: "a" }, { roman: "V", inv: "b" }, { roman: "I", inv: "a" }],
  [{ roman: "I", inv: "a" }, { roman: "V", inv: "b" }, { roman: "I", inv: "a" }, { roman: "IV", inv: "a" }],
  [{ roman: "IV", inv: "b" }, { roman: "I", inv: "c" }, { roman: "V", inv: "a" }, { roman: "I", inv: "a" }],
] as ChordSpec[][];
const MINOR_PROGS = [
  [{ roman: "I", inv: "a" }, { roman: "ii", inv: "b" }, { roman: "V", inv: "a" }, { roman: "I", inv: "a" }],
  [{ roman: "I", inv: "a" }, { roman: "IV", inv: "b" }, { roman: "V", inv: "a" }, { roman: "I", inv: "a" }],
  [{ roman: "I", inv: "b" }, { roman: "IV", inv: "a" }, { roman: "I", inv: "c" }, { roman: "V", inv: "a" }],
  [{ roman: "ii", inv: "a" }, { roman: "V", inv: "b" }, { roman: "I", inv: "a" }, { roman: "IV", inv: "a" }],
] as ChordSpec[][];

const chordAnswerPart = (key: string, p: Placed, id: string, prompt: string) => ({ id, prompt, answer: { kind: "chord" as const, task: "identify" as const, key, pitches: allNotes(p), acceptedChords: [{ roman: p.spec.roman as "I", inversion: p.spec.inv }] } });

/** t.g5.chord-in-passage: name three of the four chords of a short passage (position as well as function). */
export const chordInPassage5: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const pool = (key.mode === "major" ? MAJOR_PROGS : MINOR_PROGS).filter((p) => p.every((x) => romans(c).includes(x.roman) && invs(c).includes(x.inv)));
  if (!pool.length) return null;
  const chords = c.rng.pick(pool);
  const placed = voiceProgression(c, key, chords);
  if (!placed) return null;
  const idx = c.rng.shuffle([0, 1, 2, 3]).slice(0, 3).sort((a, b) => a - b);
  const labels = ["A", "B", "C"];
  const marks = Object.fromEntries(idx.map((i, k) => [i, labels[k]!]));
  const parts = idx.map((i, k) => chordAnswerPart(keyText, placed[i]!, `chord-${labels[k]!.toLowerCase()}`, `Name chord ${labels[k]} (Roman numeral and position).`));
  return {
    prompt: `This passage is in ${keyWords(keyText)}. Each bar has one chord: the lowest note is on the lower stave. Name the chords marked A, B and C.`,
    score: passageScore(keyText, placed, marks),
    answer: { kind: "composite", parts },
    hints: ["For each chord, gather all the notes (both staves) to find the root, then ask which note is lowest."],
  };
};

/** The root-position chord pairs that end a phrase, by cadence type. Only chords of the Grade 5 list. */
export const CAD_PAIRS: Record<"perfect" | "plagal" | "imperfect", Array<[string, string]>> = { perfect: [["V", "I"]], plagal: [["IV", "I"]], imperfect: [["I", "V"], ["ii", "V"], ["IV", "V"]] };
export const CAD_KEYS = (c: Ctx) => (c.scope.cadenceKeys?.length ? c.scope.cadenceKeys : ["C major", "G major", "D major", "F major"]);
const CAD_LABEL: Record<string, string> = { perfect: "Perfect", plagal: "Plagal", imperfect: "Imperfect" };
export const CAD_TYPES = (c: Ctx) => (c.scope.cadenceTypes?.length ? c.scope.cadenceTypes : ["perfect", "plagal", "imperfect"]) as Array<"perfect" | "plagal" | "imperfect">;

/** A four-chord phrase whose last two chords make the named cadence (root position); the first two are any chords that lead there. */
export function cadencePhrase(c: Ctx, key: music.Key, type: "perfect" | "plagal" | "imperfect", first?: ChordSpec[]): ChordSpec[] | null {
  const [x, y] = c.rng.pick(CAD_PAIRS[type].filter(([a, b]) => romans(c).includes(a) && romans(c).includes(b)));
  if (!x) return null;
  const leads: ChordSpec[][] = first ? [first] : [[{ roman: "I", inv: "a" }, { roman: "IV", inv: "a" }], [{ roman: "I", inv: "a" }, { roman: "ii", inv: "b" }], [{ roman: "I", inv: "b" }, { roman: "IV", inv: "a" }], [{ roman: "I", inv: "a" }, { roman: "V", inv: "b" }]];
  const ok = leads.filter((l) => l[1]!.roman !== x && !(l[1]!.roman === x && l[1]!.inv === "a"));
  const lead = c.rng.pick(ok.length ? ok : leads).map((s) => ({ ...s })) as ChordSpec[];
  if (!lead.every((s) => romans(c).includes(s.roman) && invs(c).includes(s.inv))) return null;
  void key;
  return [...lead, { roman: x, inv: "a" }, { roman: y, inv: "a" }];
}

/** t.g5.cadence-identify: name the cadence that ends a phrase (settled by the last two chords, both in root position). */
export const cadenceIdentify5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const type = c.rng.pick(CAD_TYPES(c));
  const chords = cadencePhrase(c, key, type);
  if (!chords) return null;
  if (classifyCadence(chords[2]!.roman, chords[3]!.roman) !== type) return null;
  const placed = voiceProgression(c, key, chords);
  if (!placed) return null;
  const types = CAD_TYPES(c);
  return {
    prompt: `This phrase in ${keyWords(keyText)} has one chord in each bar. Which cadence do the last two chords make?`,
    score: passageScore(keyText, placed, { 2: "C", 3: "D" }),
    answer: choiceAnswer(types.map((t) => [t, CAD_LABEL[t]!] as [string, string]), type, Object.fromEntries(types.filter((t) => t !== type).map((t) => [t, ["cadence-misnamed", t === "imperfect" ? "An imperfect cadence ends on the dominant chord (V). Name the last two chords first." : t === "perfect" ? "A perfect cadence is V followed by I. Name the last two chords first." : "A plagal cadence is IV followed by I. Name the last two chords first."]]))),
    hints: ["Name the last two chords (root first), then compare with V–I (perfect), IV–I (plagal), and any cadence that ends on V (imperfect)."],
  };
};

/** t.g5.cadence-find: a phrase with two cadence points; name both. */
export const cadenceFind5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const types = CAD_TYPES(c);
  const t1 = c.rng.pick(types);
  const t2 = c.rng.pick(types.filter((t) => t !== t1));
  const [a1, b1] = c.rng.pick(CAD_PAIRS[t1].filter(([a, b]) => romans(c).includes(a) && romans(c).includes(b)));
  const [a2, b2] = c.rng.pick(CAD_PAIRS[t2].filter(([a, b]) => romans(c).includes(a) && romans(c).includes(b)));
  if (!a1 || !a2) return null;
  const chords: ChordSpec[] = [{ roman: a1, inv: "a" }, { roman: b1!, inv: "a" }, { roman: a2, inv: "a" }, { roman: b2!, inv: "a" }];
  // the two cadences must not be accidentally the same chord pair run on (V then V), and each must be classified as intended
  if (classifyCadence(a1, b1!) !== t1 || classifyCadence(a2, b2!) !== t2 || b1 === a2) return null;
  const placed = voiceProgression(c, key, chords);
  if (!placed) return null;
  const mk = (t: string) => choiceAnswer(types.map((x) => [x, CAD_LABEL[x]!] as [string, string]), t, Object.fromEntries(types.filter((x) => x !== t).map((x) => [x, ["cadence-misnamed", "Name the two chords at the cadence point first, then compare with V–I, IV–I and endings on V."]])));
  return {
    prompt: `This phrase in ${keyWords(keyText)} has two cadence points: A–B in the first two bars, and C–D in the last two. Name each cadence.`,
    score: passageScore(keyText, placed, { 0: "A", 1: "B", 2: "C", 3: "D" }),
    answer: { kind: "composite", parts: [{ id: "first", prompt: "What cadence do the chords at A and B make?", answer: mk(t1) }, { id: "second", prompt: "What cadence do the chords at C and D make?", answer: mk(t2) }] },
    hints: ["Name each chord first. Then: V–I perfect, IV–I plagal, ending on V imperfect."],
  };
};

/** t.g5.cadence-facts: which pair makes which cadence. */
export const cadenceFacts5: Gen = (c): any => {
  const types = CAD_TYPES(c);
  const mode = c.rng.pick(["type-of", "pair-for", "ends-on"] as const);
  const all: Array<[string, string, "perfect" | "plagal" | "imperfect"]> = [["V", "I", "perfect"], ["IV", "I", "plagal"], ["I", "V", "imperfect"], ["ii", "V", "imperfect"], ["IV", "V", "imperfect"]];
  const pairs = all.filter(([a, b, t]) => types.includes(t) && romans(c).includes(a) && romans(c).includes(b));
  const [a, b, t] = c.rng.pick(pairs);
  if (mode === "type-of") {
    return {
      prompt: `A phrase ends with chord ${a} followed by chord ${b}. What kind of cadence is this?`,
      answer: choiceAnswer(types.map((x) => [x, CAD_LABEL[x]!] as [string, string]), t, Object.fromEntries(types.filter((x) => x !== t).map((x) => [x, ["cadence-misnamed", x === "perfect" ? "A perfect cadence is V followed by I." : x === "plagal" ? "A plagal cadence is IV followed by I." : "An imperfect cadence ends on the dominant chord, V."]]))),
      hints: ["V–I is perfect, IV–I is plagal, and any cadence ending on V is imperfect."],
    };
  }
  if (mode === "ends-on") {
    const q = c.rng.pick(["imperfect", "tonic"] as const);
    if (q === "imperfect") {
      const opts: Array<[string, string]> = [["V", "the dominant chord (V)"], ["I", "the tonic chord (I)"], ["IV", "the subdominant chord (IV)"], ["ii", "the supertonic chord (ii)"]];
      return { prompt: "An imperfect cadence always ends on which chord?", answer: choiceAnswer(opts, "V", { I: ["cadence-misnamed", "Cadences that end on the tonic are perfect (V–I) or plagal (IV–I)."], IV: ["cadence-misnamed", "No Grade 5 cadence ends on the subdominant."], ii: ["cadence-misnamed", "No Grade 5 cadence ends on the supertonic."] }), hints: ["Imperfect cadences end on the dominant."] };
    }
    const opts: Array<[string, string]> = [["perfect-plagal", "A perfect cadence and a plagal cadence"], ["perfect-imperfect", "A perfect cadence and an imperfect cadence"], ["plagal-imperfect", "A plagal cadence and an imperfect cadence"], ["imperfect", "Only an imperfect cadence"]];
    return { prompt: "Which cadences end on the tonic chord?", answer: choiceAnswer(opts, "perfect-plagal", { "perfect-imperfect": ["cadence-misnamed", "An imperfect cadence ends on V, not on the tonic."], "plagal-imperfect": ["cadence-misnamed", "An imperfect cadence ends on V, not on the tonic."], imperfect: ["cadence-misnamed", "Imperfect cadences end on V; the two that end on the tonic are the perfect and plagal cadences."] }), hints: ["V–I and IV–I both end on I."] };
  }
  // pair-for: which pair makes the named cadence?
  const opts = [...new Set(pairs.map(([x, y, tt]) => [`${x}–${y}`, tt] as const).filter(([, tt]) => tt !== t).map(([id]) => id))];
  const own = `${a}–${b}`;
  const ids = shuffled(c, [own, ...opts.slice(0, 3)]);
  if (ids.length < 3) return null;
  return {
    prompt: `Which pair of chords makes ${t === "imperfect" ? "an imperfect" : `a ${t}`} cadence?`,
    answer: choiceAnswer(ids.map((x) => [x, x] as [string, string]), own, Object.fromEntries(ids.filter((x) => x !== own).map((x) => [x, ["cadence-misnamed", `${x} makes a ${all.find(([p, q]) => `${p}–${q}` === x)![2]} cadence, not ${t === "imperfect" ? "an imperfect" : `a ${t}`} one.`]]))),
    hints: ["V–I perfect; IV–I plagal; I–V, ii–V and IV–V are imperfect."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.cadence-chords: choose chords for melody notes at a cadence point (every valid pair accepted)
// ---------------------------------------------------------------------------

function cadenceMelody(c: Ctx, key: music.Key, r1: string, r2: string, lead: number): Pitch[] | null {
  const pcs = music.scale(key, "major").slice(0, 7);
  const t1 = triad(key, r1);
  const t2 = triad(key, r2);
  const oct = (pc: music.PitchClass): Pitch => ({ ...pc, octave: music.stepIndex(pc.step) >= 5 ? 4 : 5 });
  const a = oct(c.rng.pick(t1));
  const b = oct(c.rng.pick(t2));
  const out: Pitch[] = [];
  let cur = a;
  const back: Pitch[] = [];
  // walk backwards from A by step or small skip, staying in the scale
  for (let i = 0; i < lead; i++) {
    const move = c.rng.pick([-2, -1, 1, 1, 2]);
    const d = diatonicNumber(cur) + move;
    const pc = pcs[((d % 7) + 7) % 7]!;
    cur = { ...pc, octave: Math.floor(d / 7) } as Pitch;
    back.push(cur);
  }
  out.push(...back.reverse(), a, b);
  const ledger = (p: Pitch) => music.ledgerLines("treble", p) <= 1;
  if (!out.every(ledger) || out.some((p) => !pcs.some((x) => samePitchClassSpelling(x, p)))) return null;
  return out;
}

export const cadenceChords5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const type = c.rng.pick(CAD_TYPES(c));
  const [r1, r2] = c.rng.pick(CAD_PAIRS[type].filter(([a, b]) => romans(c).includes(a) && romans(c).includes(b)));
  if (!r1) return null;
  const mel = cadenceMelody(c, key, r1, r2!, 4);
  if (!mel) return null;
  const A = mel[4]!;
  const B = mel[5]!;
  const rs = romans(c);
  const accA = music.chordsContaining(key, [A], rs);
  const accB = music.chordsContaining(key, [B], rs);
  // the validator derives the cadence types from EVERY chord that contains the melody notes, so the melody must leave only the named type possible
  const pairs = accA.flatMap((x) => accB.map((y) => [x, y, classifyCadence(x, y)] as const)).filter((p) => p[2] && CAD_TYPES(c).includes(p[2]));
  if (new Set(pairs.map((p) => p[2])).size !== 1 || pairs[0]?.[2] !== type) return null;
  const okA = [...new Set(pairs.map((p) => p[0]))];
  const okB = [...new Set(pairs.map((p) => p[1]))];
  const events: Ev[] = mel.map((p, i) => note(p, i < 4 ? "crotchet" : "minim", i === 4 ? { label: "A" } : i === 5 ? { label: "B" } : {}));
  const f = frag("treble", [{ events: events.slice(0, 4) }, { events: events.slice(4), barline: "final" }], "A melody.", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  const typeWord = type === "imperfect" ? "an imperfect" : `a ${type}`;
  return {
    prompt: `The melody notes marked A and B come at a cadence point in ${keyWords(keyText)}. Choose a chord for each (I, ii, IV or V) so that A and B make ${typeWord} cadence. Each chord must contain its melody note; any pair that works is correct.`,
    music: f,
    answer: { kind: "chord-progression", key: keyText, points: [{ label: "A", melodyPitches: [F(A)], accepted: okA as never }, { label: "B", melodyPitches: [F(B)], accepted: okB as never }], cadences: [{ labels: ["A", "B"], acceptedTypes: [type] }] },
    hints: ["List the chords that contain each melody note, then pick a pair that makes the cadence: V–I perfect, IV–I plagal, ending on V imperfect."],
  };
};

/** t.g5.chord-choice: pick the pair of chords for two melody notes at a cadence point (exactly one offered pair fits both the notes and the named cadence). */
export const chordChoice5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const type = c.rng.pick(CAD_TYPES(c));
  const rs = romans(c);
  const [r1, r2] = c.rng.pick(CAD_PAIRS[type].filter(([a, b]) => rs.includes(a) && rs.includes(b)));
  if (!r1) return null;
  const oct = (pc: music.PitchClass): Pitch => ({ ...pc, octave: music.stepIndex(pc.step) >= 5 ? 4 : 5 });
  const A = oct(c.rng.pick(triad(key, r1)));
  const B = oct(c.rng.pick(triad(key, r2)));
  const fits = ([x, y]: [string, string]) => music.triadContains(key, x, A) && music.triadContains(key, y, B) && classifyCadence(x, y) === type;
  const all: Array<[string, string]> = rs.flatMap((x) => rs.filter((y) => y !== x).map((y) => [x, y] as [string, string]));
  const valid = all.filter(fits);
  const right = valid.find(([x, y]) => x === r1 && y === r2)!;
  const bad = shuffled(c, all.filter((p) => !fits(p)));
  // distractors that fail in different ways: one chord lacking its note, one making another cadence (or none)
  const lacks = bad.filter(([x, y]) => !(music.triadContains(key, x, A) && music.triadContains(key, y, B)));
  const wrongType = bad.filter(([x, y]) => music.triadContains(key, x, A) && music.triadContains(key, y, B));
  const picks = [...lacks.slice(0, 2), ...wrongType.slice(0, 1), ...lacks.slice(2)].slice(0, 3);
  if (picks.length < 3) return null;
  const lab = (p: [string, string]) => `${p[0]}–${p[1]}`;
  const typeWord = type === "imperfect" ? "an imperfect" : `a ${type}`;
  const f = frag("treble", [{ events: [note(A, "minim", { label: "A" }), note(B, "minim", { label: "B" })], barline: "final" }], "A two-note melody.", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  return {
    prompt: `The melody notes marked A and B come at a cadence point in ${keyWords(keyText)}. Which pair of chords, with each chord containing its melody note, makes ${typeWord} cadence?`,
    music: f,
    answer: choiceAnswer(shuffled(c, [right, ...picks].map((p) => [lab(p), lab(p)] as [string, string])), lab(right), Object.fromEntries(picks.map((p) => [lab(p), [music.triadContains(key, p[0], A) && music.triadContains(key, p[1], B) ? "cadence-misnamed" : "chord-lacks-melody-note", music.triadContains(key, p[0], A) && music.triadContains(key, p[1], B) ? `${lab(p)} contains both melody notes but makes ${classifyCadence(p[0], p[1]) ? `a ${classifyCadence(p[0], p[1])} cadence` : "no cadence"}, not ${typeWord} one.` : `Chord ${music.triadContains(key, p[0], A) ? p[1] : p[0]} does not contain its melody note (${music.triadContains(key, p[0], A) ? nameOfPc(B) : nameOfPc(A)}).`]]))),
    hints: ["Check each chord contains its melody note, then check the pair makes the cadence named."],
  };
};

// ---------------------------------------------------------------------------
// Optional enrichment (never compulsory, never mastery evidence, never in an assessment)
// ---------------------------------------------------------------------------

/** t.g5.cadential-six-four (G5-U4-E1): the Ic-V progression on the dominant. */
export const sixFourFiveThree5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const yes = c.rng.chance(0.55);
  const chords: ChordSpec[] = yes
    ? c.rng.pick([[{ roman: "I", inv: "a" }, { roman: "IV", inv: "a" }, { roman: "I", inv: "c" }, { roman: "V", inv: "a" }], [{ roman: "ii", inv: "b" }, { roman: "I", inv: "a" }, { roman: "I", inv: "c" }, { roman: "V", inv: "a" }]]) as ChordSpec[]
    : c.rng.pick([[{ roman: "I", inv: "a" }, { roman: "IV", inv: "a" }, { roman: "I", inv: "b" }, { roman: "V", inv: "a" }], [{ roman: "I", inv: "a" }, { roman: "ii", inv: "a" }, { roman: "IV", inv: "b" }, { roman: "V", inv: "a" }]]) as ChordSpec[];
  const placed = voiceProgression(c, key, chords);
  if (!placed) return null;
  const parts = [chordAnswerPart(keyText, placed[2]!, "chord-c", "Name chord C (Roman numeral and position)."), chordAnswerPart(keyText, placed[3]!, "chord-d", "Name chord D (Roman numeral and position)."), { id: "progression", prompt: "Do chords C and D make the six-four five-three progression on the dominant (a second-inversion tonic chord followed by the dominant chord in root position)?", answer: choiceAnswer([["yes", "Yes"], ["no", "No"]], yes ? "yes" : "no", yes ? { no: ["evidence-misread", "Chord C is the tonic in second inversion (Ic) and chord D is the dominant in root position: that is the 6/4–5/3 progression."] } : { yes: ["evidence-misread", "Look at the lowest note of chord C: for this progression it must be the 5th of the tonic chord (the dominant note), which is in the bass of both chords."] }) }];
  return {
    prompt: `This passage in ${keyWords(keyText)} has one chord in each bar. Look at the last two chords, C and D.`,
    score: passageScore(keyText, placed, { 2: "C", 3: "D" }),
    answer: { kind: "composite", parts },
    hints: ["In a six-four five-three progression both chords have the dominant note in the bass: the second-inversion tonic, then the dominant chord in root position."],
  };
};

/** t.g5.approach-chord (G5-U4-E2): a chord before two cadence chords. */
export const approachChord5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const type = c.rng.pick(CAD_TYPES(c));
  const [r1, r2] = c.rng.pick(CAD_PAIRS[type].filter(([a, b]) => romans(c).includes(a) && romans(c).includes(b)));
  if (!r1) return null;
  const mel = cadenceMelody(c, key, r1, r2!, 4);
  if (!mel) return null;
  const rs = romans(c);
  const pts = [mel[3]!, mel[4]!, mel[5]!];
  const accs = pts.map((p) => music.chordsContaining(key, [p], rs));
  const pairs = accs[1]!.flatMap((x) => accs[2]!.map((y) => [x, y, classifyCadence(x, y)] as const)).filter((p) => p[2] && CAD_TYPES(c).includes(p[2]));
  if (new Set(pairs.map((p) => p[2])).size !== 1 || pairs[0]?.[2] !== type || !accs[0]!.length) return null;
  const okB = [...new Set(pairs.map((p) => p[0]))];
  const okC = [...new Set(pairs.map((p) => p[1]))];
  const events: Ev[] = mel.map((p, i) => note(p, i < 3 ? "crotchet" : i === 3 ? "crotchet" : "minim", i === 3 ? { label: "A" } : i === 4 ? { label: "B" } : i === 5 ? { label: "C" } : {}));
  // 3 lead-in crotchets + A (crotchet) = bar 1; B and C (minims) = bar 2
  const f = frag("treble", [{ events: events.slice(0, 4) }, { events: events.slice(4), barline: "final" }], "A melody.", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  return {
    prompt: `In ${keyWords(keyText)}, B and C make a ${type} cadence. The chord at A comes BEFORE the cadence chords: it is an approach chord. Choose a chord for each of A, B and C (I, ii, IV or V), each containing its melody note, so that B and C make the cadence. (The approach chord may be any of I, ii, IV or V that fits the melody note.)`,
    music: f,
    answer: { kind: "chord-progression", key: keyText, points: [{ label: "A", melodyPitches: [F(pts[0]!)], accepted: accs[0] as never }, { label: "B", melodyPitches: [F(pts[1]!)], accepted: okB as never }, { label: "C", melodyPitches: [F(pts[2]!)], accepted: okC as never }], cadences: [{ labels: ["B", "C"], acceptedTypes: [type] }] },
    hints: ["First choose the cadence chords for B and C. Then pick any of I, ii, IV or V that contains the melody note at A."],
  };
};

// ---- SATB in short score (optional enrichment) ----------------------------------

type Voice = "soprano" | "alto" | "tenor" | "bass";
/** A four-part chord with the soprano and alto on the upper stave and the tenor and bass on the lower stave. */
function satbVoicing(c: Ctx, key: music.Key, roman: string): { S: Pitch; A: Pitch; T: Pitch; B: Pitch } | null {
  const t = triad(key, roman);
  const pool = (lo: Pitch, hi: Pitch): Pitch[] => {
    const out: Pitch[] = [];
    for (let o = lo.octave; o <= hi.octave; o++) for (const pc of t) { const p: Pitch = { ...pc, octave: o }; if (diatonicNumber(p) >= diatonicNumber(lo) && diatonicNumber(p) <= diatonicNumber(hi)) out.push(p); }
    return out;
  };
  const P = (step: string, octave: number): Pitch => ({ step: step as music.Step, alter: 0, octave });
  const Bs = pool(P("E", 2), P("C", 3));
  const Ts = pool(P("C", 3), P("G", 3));
  const As = pool(P("C", 4), P("A", 4));
  const Ss = pool(P("E", 4), P("G", 5));
  const tries: Array<{ S: Pitch; A: Pitch; T: Pitch; B: Pitch }> = [];
  for (const B of Bs) for (const T of Ts) for (const A of As) for (const S of Ss) {
    if (!(diatonicNumber(S) > diatonicNumber(A) && diatonicNumber(A) > diatonicNumber(T) && diatonicNumber(T) > diatonicNumber(B))) continue;
    if (diatonicNumber(S) - diatonicNumber(A) > 7 || diatonicNumber(A) - diatonicNumber(T) > 7) continue;
    if (!cover(t, [S, A, T, B]) || ![S, A, T, B].every((p) => Math.abs(p.alter) <= 1)) continue;
    // the bass is the root (a chord in root position)
    if (!samePitchClassSpelling(B, t[0]!)) continue;
    tries.push({ S, A, T, B });
  }
  return tries.length ? c.rng.pick(tries) : null;
}

export const satbVoices5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const prog = c.rng.pick([["I", "IV", "V", "I"], ["I", "ii", "V", "I"], ["I", "V", "IV", "I"]]);
  const v = prog.map((r) => satbVoicing(c, key, r));
  if (v.some((x) => !x)) return null;
  const which: Voice = c.rng.pick(["soprano", "alto", "tenor", "bass"]);
  const at = c.rng.int(0, 3);
  const mark = (voice: Voice, i: number) => (voice === which && i === at ? { label: "x" } : {});
  const bar = (voice: Voice, i: number, p: Pitch): Ev => note(p, "semibreve", mark(voice, i));
  const stem = (v: Voice) => (v === "soprano" || v === "tenor" ? "up" : "down");
  const mk = (clef: Clef, voices: [Voice, Voice]) => frag(clef, v.map((x, i) => ({
    voices: voices.map((vo, k) => ({ id: k === 0 ? "v1" : "v2", stem: stem(vo) as "up", events: [bar(vo, i, x![{ soprano: "S", alto: "A", tenor: "T", bass: "B" }[vo] as "S"])] })),
    ...(i === v.length - 1 ? { barline: "final" as const } : {}),
  })) as never, "A passage for four voices.", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  const score = { staves: [{ id: "upper", label: "Upper stave", music: mk("treble", ["soprano", "alto"]) }, { id: "lower", label: "Lower stave", music: mk("bass", ["tenor", "bass"]) }], textAlternative: "Four-part vocal music in short score: soprano and alto share the upper stave, tenor and bass share the lower stave." };
  const opts: Array<[string, string]> = [["soprano", "Soprano"], ["alto", "Alto"], ["tenor", "Tenor"], ["bass", "Bass"]];
  return {
    prompt: "This is four-part vocal music in short score (SATB): two voices share each stave. Which voice sings the note marked x?",
    score,
    answer: choiceAnswer(opts, which, Object.fromEntries(opts.filter(([id]) => id !== which).map(([id]) => [id, ["evidence-misread", "Look at which stave the note is on and which way its stem goes: the stems of soprano and tenor notes go up; those of alto and bass notes go down. The upper stave holds soprano and alto; the lower stave holds tenor and bass."]]))),
    hints: ["Upper stave: soprano (stem up) and alto (stem down). Lower stave: tenor (stem up) and bass (stem down)."],
  };
};

export const satbFacts5: Gen = (c): any => {
  const mode = c.rng.pick(["order", "stems", "open", "stave"] as const);
  if (mode === "order") {
    const ids: Array<[string, string]> = [["sa-tb", "Soprano, alto, tenor, bass"], ["sb-at", "Soprano, bass, alto, tenor"], ["ts-ab", "Tenor, soprano, alto, bass"], ["as-tb", "Alto, soprano, tenor, bass"]];
    return { prompt: "SATB stands for the four voices of a mixed choir. In which order are they listed in a score, from the top?", answer: choiceAnswer(shuffled(c, ids), "sa-tb", Object.fromEntries(ids.filter(([id]) => id !== "sa-tb").map(([id]) => [id, ["evidence-misread", "SATB: soprano, alto, tenor, bass, from the highest voice to the lowest."]]))), hints: ["S, A, T, B: highest to lowest."] };
  }
  if (mode === "stems") {
    const ids: Array<[string, string]> = [["up-down", "Soprano and tenor stems go up; alto and bass stems go down"], ["down-up", "Soprano and tenor stems go down; alto and bass stems go up"], ["all-up", "All stems go up"], ["high-low", "Stems go up on the upper stave and down on the lower stave"]];
    return { prompt: "In short score, which way do the stems of the voices on a shared stave go?", answer: choiceAnswer(shuffled(c, ids), "up-down", Object.fromEntries(ids.filter(([id]) => id !== "up-down").map(([id]) => [id, ["evidence-misread", "The upper voice of each stave (soprano, tenor) has stems up; the lower voice (alto, bass) has stems down."]]))), hints: ["The stems tell the two voices on one stave apart."] };
  }
  if (mode === "stave") {
    const ids: Array<[string, string]> = [["sa", "The soprano and alto share the upper stave; the tenor and bass share the lower stave"], ["st", "The soprano and tenor share the upper stave"], ["sab", "The soprano, alto and tenor share the upper stave"], ["each", "Each voice has its own stave"]];
    return { prompt: "In short score, how are the four voices of a choir written?", answer: choiceAnswer(shuffled(c, ids), "sa", Object.fromEntries(ids.filter(([id]) => id !== "sa").map(([id]) => [id, ["evidence-misread", id === "each" ? "That is open score. In short score the four voices share two staves." : "In short score soprano and alto share the upper stave, tenor and bass the lower."]]))), hints: ["Short score uses two staves; open score uses four."] };
  }
  const ids: Array<[string, string]> = [["open", "Open score"], ["short", "Short score"], ["piano", "Piano reduction"], ["tab", "Tablature"]];
  return { prompt: "When each voice of a choir has a stave of its own, the music is said to be in…", answer: choiceAnswer(ids, "open", { short: ["evidence-misread", "Short score puts all four voices on two staves."], piano: ["evidence-misread", "A piano reduction is for a keyboard player, not a name for the layout of vocal parts."], tab: ["evidence-misread", "Tablature is for fretted instruments."] }), hints: ["Open score: four staves. Short score: two staves."] };
};

void KEYS_G5; void pretty; void staffPosition; void F;
export const _internal = { voiceProgression };
export type { Inv };
