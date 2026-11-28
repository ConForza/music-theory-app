/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5: intervals under a key signature (PR #14 reconciled with the complete app).
 *
 * Two templates, both for outcome g5.08 (chromatic intervals "from any note"):
 *  - t.g5.interval-key-identify: two notes on a stave that shows a key signature; name the interval. The notes are spelt by the signature
 *    or by a written accidental that overrides it (a natural, sharp or flat). Most questions are chosen so that reading the letters while
 *    ignoring the signature gives a DIFFERENT interval, and the grader says so (`ignored-key-signature`).
 *  - t.g5.interval-key-build: one note on a stave with a key signature; write the note a named interval above or below. About half the
 *    answers need a written sign the signature does not give, and the rest need none, so a sign is never always (or never) required.
 *
 * Every answer comes from the rule functions (`music.intervalBetween`, `music.transpose`, `music.signatureAlter`), never typed per question.
 * Scope kept deliberately small: simple intervals within an octave, no double accidentals, at most two ledger lines, keys of 1-6 accidentals.
 */
import { music } from "@mtp/curriculum";
import { frag, reworded, type Gen } from "./families.ts";
import { F, KEYS_G5, an, clefsIn, fitsIn, keyWords, keysIn, note, pretty, type Clef, type Ctx, type Pitch } from "./grade5-lib.ts";

const { parseKey, intervalBetween, transpose, parseInterval, signatureAlter, keySignature } = music;

const QUAL: Record<string, string> = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const qualWord = (code: string) => `${QUAL[code[0]!]} ${music.ordinal(Number(code.slice(1)))}`;
const SIGN_WORD: Record<number, string> = { [-1]: "flat", 0: "natural", 1: "sharp" };

/** Keys with at least one sharp or flat (a key signature that can matter) and at most six. */
const keyPool = (c: Ctx): string[] => keysIn(c, KEYS_G5).filter((k) => { const n = keySignature(parseKey(k)).count; return n >= 1 && n <= 6; });

const codeOf = (iv: { quality: string; number: number }) => `${iv.quality}${iv.number}`;
const simpleQuality = (code: string) => /^[dmMPA][2-8]$/.test(code);

/** The spelling a note would have if the key signature were IGNORED: only a written accidental counts. */
export function ignoringSignature(p: Pitch, key: music.Key): Pitch {
  return signatureAlter(key, p.step) === p.alter ? { ...p, alter: 0 } : p;
}

/** The interval a learner gets by reading only the written signs, ignoring the key signature. null when that is not a valid simple interval. */
export function bareInterval(lower: Pitch, upper: Pitch, key: music.Key): string | null {
  try {
    const iv = intervalBetween(ignoringSignature(lower, key), ignoringSignature(upper, key));
    const code = codeOf(iv);
    return /^[dmMPA]\d+$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * The signs a note may carry that differ from what the key signature gives its letter. Only signs the lesson teaches are used (review of PR #16, finding C):
 * a NATURAL that cancels a sharp or flat of the signature, or a sharp or flat on a letter the signature leaves natural. A sharp on a letter the signature
 * flattens (B♯ in D♭ major), or a flat on a letter it sharpens (E♭ in F♯ major), is never used: that opposite-direction case is not taught here.
 */
export const overrideAlters = (sig: number): number[] => (sig === 0 ? [-1, 1] : [0]);
/** Is this accidental one the lesson teaches for a letter whose signature accidental is `sig`? (the signature's own, a cancelling natural, or a sign on a natural letter) */
export const taughtAlter = (alter: number, sig: number): boolean => alter === sig || overrideAlters(sig).includes(alter);

/** A pitch of the given letter whose accidental is the signature's (kept) or a different, taught one (an overriding sign). */
function spell(c: Ctx, key: music.Key, step: music.Step, overrides: boolean): { alter: number } | null {
  const sig = signatureAlter(key, step);
  if (!overrides) return { alter: sig };
  return { alter: c.rng.pick(overrideAlters(sig)) };
}

const OCT: Record<Clef, number[]> = { treble: [4], bass: [2, 3], alto: [3, 4], tenor: [3, 4] };

interface Pair { key: string; clef: Clef; lower: Pitch; upper: Pitch; code: string; bare: string | null }

function pickPair(c: Ctx, wantTrap: boolean): Pair | null {
  const keyText = c.rng.pick(keyPool(c));
  const key = parseKey(keyText);
  const clef = c.rng.pick(clefsIn(c, ["treble", "bass", "alto"]));
  const lowStep = c.rng.pick(music.STEPS);
  const interval = c.rng.int(2, 7);
  const upStep = music.STEPS[(music.stepIndex(lowStep) + interval - 1) % 7]!;
  // about a third of the notes carry a written sign that overrides the signature (a natural, or the opposite accidental)
  const lo = spell(c, key, lowStep, c.rng.chance(0.25));
  const up = spell(c, key, upStep, c.rng.chance(0.4));
  if (!lo || !up) return null;
  const octave = c.rng.pick(OCT[clef]);
  const lower: Pitch = { step: lowStep, alter: lo.alter, octave };
  // the upper note is the next occurrence of its letter above the lower note
  let upOct = octave;
  for (let k = 0; k < 3; k++) { if (music.diatonicNumber({ step: upStep, alter: 0, octave: upOct }) > music.diatonicNumber(lower)) break; upOct++; }
  const upper: Pitch = { step: upStep, alter: up.alter, octave: upOct };
  let iv;
  try { iv = intervalBetween(lower, upper); } catch { return null; }
  const code = codeOf(iv);
  if (!simpleQuality(code) || iv.number !== (music.diatonicNumber(upper) - music.diatonicNumber(lower) + 1)) return null;
  if (!fitsIn(clef, [lower, upper], 2)) return null;
  const sigNotes = [lowStep, upStep].filter((s) => signatureAlter(key, s) !== 0).length;
  if (!sigNotes) return null; // the signature must actually matter to the notes
  const bare = bareInterval(lower, upper, key);
  if (wantTrap && (!bare || bare === code)) return null;
  return { key: keyText, clef, lower, upper, code, bare };
}

const signText = (p: Pitch) => (p.alter ? ` with a ${SIGN_WORD[p.alter]} sign` : "");

/** The key signature in words, for the spoken description and the prompt. */
const sigWords = (keyText: string) => {
  const s = keySignature(parseKey(keyText));
  return s.count ? `${s.count} ${s.type === "sharps" ? (s.count === 1 ? "sharp" : "sharps") : s.count === 1 ? "flat" : "flats"}` : "no sharps or flats";
};

/** t.g5.interval-key-identify */
export const intervalKeyIdentify5: Gen = (c): any => {
  // Roughly three in four questions are chosen so that ignoring the signature gives a different answer; the rest are plain.
  const p = pickPair(c, c.rng.chance(0.75));
  if (!p) return null;
  const { key, clef, lower, upper, code } = p;
  const f = frag(clef, [{ events: [note(lower, "semibreve"), note(upper, "semibreve")] }], `Two semibreves in the ${clef} clef in ${key}: ${pretty(F(lower))} then ${pretty(F(upper))}.`, { key, showKeySignature: true });
  return {
    ...reworded(
      `The key signature has ${sigWords(key)} (${keyWords(key)}) and applies to both notes. Name the interval from the lower note to the higher: quality and number.`,
      `The key signature shows ${sigWords(key)} (${keyWords(key)}). Name the interval between these two notes, from the lower to the higher: give its quality and its number. Remember that the key signature applies to every note on the stave.`,
    ),
    music: f,
    answer: { kind: "interval", task: "identify", key, lower: F(lower), upper: F(upper), acceptedIntervals: [code] },
    hints: ["First work out what each note really is: the key signature changes every note of that letter unless a sign in front of the note cancels it or changes it again. Then count the letter names for the number and compare with the major scale of the lower note for the quality."],
  };
};

/** t.g5.interval-key-build */
export const intervalKeyBuild5: Gen = (c): any => {
  const keyText = c.rng.pick(keyPool(c));
  const key = parseKey(keyText);
  const clef = c.rng.pick(clefsIn(c, ["treble", "bass"]).filter((x) => x === "treble" || x === "bass"));
  const wantSign = c.rng.chance(0.55);
  for (let attempt = 0; attempt < 40; attempt++) {
    const start: Pitch = { step: c.rng.pick(music.STEPS), alter: 0, octave: c.rng.pick(OCT[clef]) };
    start.alter = c.rng.chance(0.8) ? signatureAlter(key, start.step) : c.rng.pick(overrideAlters(signatureAlter(key, start.step)));
    const code = c.rng.pick(["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7", "A4", "d5", "A2", "d7", "A5", "d4"]);
    const down = c.rng.chance(0.4);
    let goal: Pitch;
    try { goal = transpose(start, parseInterval(code), down ? "down" : "up"); } catch { continue; }
    if (Math.abs(goal.alter) > 1 || Math.abs(start.alter) > 1) continue;
    // the learner must never need a sign the lesson does not teach (an opposite-direction sign such as a sharp where the signature gives a flat)
    if (!taughtAlter(goal.alter, signatureAlter(key, goal.step))) continue;
    if (!fitsIn(clef, [start, goal], 2)) continue;
    const needsSign = goal.alter !== signatureAlter(key, goal.step);
    if (needsSign !== wantSign && attempt < 30) continue;
    const dir = down ? "below" : "above";
    return {
      ...reworded(
        `The key signature has ${sigWords(keyText)} (${keyWords(keyText)}). Write the note that is ${an(qualWord(code))} ${dir} the note shown. The key signature applies, so add a sharp, flat or natural only where the note needs one.`,
        `The key signature shows ${sigWords(keyText)} (${keyWords(keyText)}). Write the note that is ${an(qualWord(code))} ${dir} the note shown. Write it on the stave: the key signature applies, so add a sharp, flat or natural only where the note needs one.`,
      ),
      music: frag(clef, [{ events: [note(start, "semibreve")] }], `A semibreve ${pretty(F(start))}${signText(start)} in the ${clef} clef in ${keyText}.`, { key: keyText, showKeySignature: true }),
      answer: { kind: "interval", task: "build", key: keyText, lower: F(start), target: code, direction: down ? "down" : "up", acceptedPitches: [F(goal)] },
      hints: [`Count ${code.slice(1)} letter names ${down ? "down" : "up"} from the note shown (counting it as 1) to find the letter. Then decide the accidental that gives the quality, and compare it with what the key signature already gives that letter.`],
    };
  }
  return null;
};
