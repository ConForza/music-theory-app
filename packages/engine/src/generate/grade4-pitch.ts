/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 4 pitch generators (Brief 08, Units 2 and 3): double accidentals, enharmonic equivalents, the alto clef, the same pitch in
 * three clefs, octave transposition, the five-accidental keys, technical names and chromatic scales.
 *
 * Source: First Steps in Music Theory, Grade 4 sections 5-8, 12 and 14 (pp. 83-87, 97-98, 101, read in the PDF); the book's Grade 5
 * octave material is used for the alto clef only (the syllabus mapping requires it at Grade 4). Every pitch comes from the
 * curriculum's music rules (`scale`, `chromaticNumber`, `staffPosition`, `checkChromatic`), never from a typed table per question.
 *
 * Spelling matters throughout: pitch answers are spelling-sensitive, and enharmonic answers say so in the prompt.
 * Q9 (cancelling double accidentals): only the unambiguous convention is asked - a natural sign cancels a double sharp or flat and
 * the note is natural again. The older "natural plus sharp" way of reducing a double sharp to a single one is never asked.
 */
import { deriveScale, music, type NotationEvent } from "@mtp/curriculum";
import { staffTargets } from "../graders/pitch.ts";
import { fits, frag, maxLedger, nameOf, note, pretty, type Gen } from "./families.ts";
import type { Diagnoses } from "./grade1.ts";
import { ORD, cap, diag, posText, optsOf } from "./grade2.ts";

type Pitch = music.Pitch;
type Clef = music.Clef;
type Ctx = Parameters<Gen>[0];
const { formatPitch: F, formatPitchClass: FC, parsePitch: P, chromaticNumber, staffPosition, naturalAt, ledgerLines, parseKey, scale } = music;

const SIGN_WORD: Record<number, string> = { [-2]: "double flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double sharp" };
const clefsIn = (c: Ctx): Clef[] => (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];
const keysIn = (c: Ctx) => (c.scope.keys?.length ? c.scope.keys : ["C major"]);
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const pcId = (p: { step: string; alter: number }) => FC(p as music.PitchClass);
const pcLabel = (p: { step: string; alter: number }) => nameOf(p as music.PitchClass);
const aOrAn = (s: string) => (/^[aefhilmnorsx]/i.test(s) ? "an" : "a");
const keyWord = (k: string) => pretty(k);
const articleClef = (clef: string) => `${aOrAn(clef)} ${clef}`;

/** Any spelling of a sound with at most the given alteration, excluding spellings that use the given letter. */
function spellingsOfSound(num: number, maxAlter: number): music.PitchClass[] {
  const out: music.PitchClass[] = [];
  for (const step of music.STEPS) {
    for (let alter = -maxAlter; alter <= maxAlter; alter++) if (mod12(music.naturalSemitones(step) + alter) === mod12(num)) out.push({ step, alter });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unit 2: double accidentals
// ---------------------------------------------------------------------------

/** t.g4.double-facts: what a double sharp or flat does to a note, which sound it makes, which sign is which. */
export const doubleFacts: Gen = (c): any => {
  if (!c.scope.doubleAccidentals) return null;
  const mode = c.rng.pick(["semitones", "semitones", "same-sound", "same-sound", "same-sound", "sign", "higher-lower"] as const);
  const sharp = c.rng.chance(0.5);
  if (mode === "semitones") {
    return {
      prompt: sharp ? "A double sharp raises a note by how many semitones?" : "A double flat lowers a note by how many semitones?",
      answer: { kind: "choice", options: optsOf(["1", "2", "3", "4"]), correctOptionIds: ["2"], diagnoses: { "1": diag("double-as-single", `That is what a single ${sharp ? "sharp" : "flat"} does. A double sign is two single signs together.`), "3": diag("double-as-single", "A double sign is worth exactly two semitones: two single signs, one semitone each."), "4": diag("double-as-single", "Four semitones is a whole major third. A double sign is worth just two semitones.") } },
      hints: [`A double ${sharp ? "sharp" : "flat"} is two ${sharp ? "sharps" : "flats"} together.`],
    };
  }
  if (mode === "sign") {
    const asked = c.rng.pick(["double-sharp", "double-flat", "natural"] as const);
    const opts = [{ id: "double-sharp", label: "𝄪 (double sharp)" }, { id: "double-flat", label: "𝄫 (double flat)" }, { id: "sharp", label: "♯ (sharp)" }, { id: "flat", label: "♭ (flat)" }];
    if (asked === "natural") return null;
    return {
      prompt: asked === "double-sharp" ? "Which sign is the double sharp: the one that raises a note by two semitones?" : "Which sign is the double flat: the one that lowers a note by two semitones?",
      answer: { kind: "choice", options: opts, correctOptionIds: [asked], diagnoses: asked === "double-sharp" ? { "double-flat": diag("sign-direction", "𝄫 lowers a note: the double flat. A raising sign is a sharp."), sharp: diag("double-as-single", "A single sharp raises by one semitone only."), flat: diag("sign-direction", "A flat lowers a note; this question asks for a sign that raises it.") } : { "double-sharp": diag("sign-direction", "𝄪 raises a note. A lowering sign is a flat."), flat: diag("double-as-single", "A single flat lowers by one semitone only."), sharp: diag("sign-direction", "A sharp raises a note; this question asks for a sign that lowers it.") } },
      hints: ["Sharps raise, flats lower. The double signs do it twice."],
    };
  }
  if (mode === "higher-lower") {
    const step = c.rng.pick(music.STEPS);
    const p: music.PitchClass = { step, alter: sharp ? 2 : -2 };
    const plain: music.PitchClass = { step, alter: 0 };
    const single: music.PitchClass = { step, alter: sharp ? 1 : -1 };
    return {
      prompt: `Compare ${pcLabel(p)} with ${pcLabel(single)} and ${pcLabel(plain)}. Which sentence is true?`,
      answer: { kind: "choice", options: [{ id: "right", label: `${pcLabel(p)} is ${sharp ? "higher" : "lower"} than ${pcLabel(single)}, and that is ${sharp ? "higher" : "lower"} than ${pcLabel(plain)}` }, { id: "same-as-single", label: `${pcLabel(p)} sounds the same as ${pcLabel(single)}` }, { id: "same-as-plain", label: `${pcLabel(p)} sounds the same as ${pcLabel(plain)}` }, { id: "wrong-way", label: `${pcLabel(p)} is ${sharp ? "lower" : "higher"} than ${pcLabel(plain)}` }], correctOptionIds: ["right"], diagnoses: { "same-as-single": diag("double-as-single", "The double sign moves the note two semitones; the single sign moves it only one, so they cannot sound the same."), "same-as-plain": diag("double-as-single", "A double sign always changes the note: the sound moves two semitones away from the plain note."), "wrong-way": diag("sign-direction", `A double ${sharp ? "sharp" : "flat"} moves the note ${sharp ? "up" : "down"}.`) } },
      hints: ["Count the semitones each sign moves the note from the plain letter name."],
    };
  }
  // same-sound: which of these sounds the same as X𝄪?
  const step = c.rng.pick(music.STEPS);
  const alter = sharp ? 2 : -2;
  const ref: Pitch = { step, alter, octave: 4 };
  const sound = chromaticNumber(ref);
  const right = c.rng.pick(spellingsOfSound(sound, 1).filter((s) => s.step !== step));
  if (!right) return null;
  const single: music.PitchClass = { step, alter: sharp ? 1 : -1 };
  const plain: music.PitchClass = { step, alter: 0 };
  const beyond = c.rng.pick(spellingsOfSound(sound + (sharp ? 1 : -1), 1));
  const cand = [right, single, plain, beyond].filter((x) => x);
  const ids = new Map<string, music.PitchClass>();
  for (const x of cand) if (!ids.has(pcId(x))) ids.set(pcId(x), x);
  // exactly one option may share the sound of the reference
  if ([...ids.values()].filter((x) => mod12(music.naturalSemitones(x.step) + x.alter) === mod12(sound)).length !== 1 || ids.size < 4) return null;
  return {
    prompt: `Which of these notes sounds the same as ${pcLabel(ref)}?`,
    answer: { kind: "choice", options: c.rng.shuffle([...ids].map(([id, x]) => ({ id, label: pcLabel(x) }))), correctOptionIds: [pcId(right)], diagnoses: Object.fromEntries([...ids].filter(([id]) => id !== pcId(right)).map(([id, x]) => [id, diag(id === pcId(single) ? "double-as-single" : id === pcId(plain) ? "double-ignored" : "not-two-semitones", id === pcId(single) ? `${pcLabel(x)} is only one semitone from ${pcLabel(plain)}. The double sign moves two.` : id === pcId(plain) ? `${pcLabel(x)} is the plain note: the double sign has to be counted.` : `Count two semitones ${sharp ? "up" : "down"} from ${pcLabel(plain)}: this note is one semitone too far.`)])) as Diagnoses },
    hints: [`Find ${pcLabel(plain)} on the keyboard, then move two keys' distance (two semitones) ${sharp ? "up" : "down"}.`],
  };
};

/** t.g4.double-name: name a note written with a double sharp or double flat sign (any clef taught). */
export const doubleName: Gen = (c): any => {
  if (!c.scope.doubleAccidentals) return null;
  const clef = c.rng.pick(clefsIn(c));
  const max = Math.min(maxLedger(c), 2);
  const pos = c.rng.int(-1, 9);
  const base = naturalAt(clef, pos);
  const p: Pitch = { ...base, alter: c.rng.pick([2, -2]) };
  if (!fits(clef, [p], max) || staffPosition(clef, p) < -1 - 2 * max || staffPosition(clef, p) > 9 + 2 * max) return null;
  const sign = SIGN_WORD[p.alter]!;
  const text = `${cap(articleClef(clef))} clef stave with one semibreve ${posText(staffPosition(clef, p))}, with a ${sign} sign in front of it.`.replace(/^(\w)/, (x) => x);
  return {
    prompt: "This note has a double sharp or a double flat in front of it. Name it, including its sign.",
    music: frag(clef, [{ events: [note(p)] }], text, { showKeySignature: false }),
    answer: { kind: "pitch", accepted: [F(p)], octaveSensitive: false, spellingSensitive: true, relation: "same" },
    hints: [`Name the letter of the line or space first. The sign in front of it changes the note: a ${sign}.`],
  };
};

/** t.g4.double-write: write a double sharp or double flat note on the stave in the clef asked. */
export const doubleWrite: Gen = (c): any => {
  if (!c.scope.doubleAccidentals) return null;
  const clef = c.rng.pick(clefsIn(c));
  const max = Math.min(maxLedger(c), 2);
  const step = c.rng.pick(music.STEPS);
  const alter = c.rng.pick([2, -2]);
  const answer = { kind: "staff-position" as const, clef, target: { step, alter, position: "any" as const, maxLedgerLines: max }, accepted: [] as string[], octaveSensitive: true };
  const valid = staffTargets(answer, max);
  if (!valid.length) return null;
  answer.accepted = valid.map(F);
  return {
    prompt: `Write ${pcLabel({ step, alter })} in the ${clef} clef. ${max ? `You may use up to ${max} ledger line${max > 1 ? "s" : ""}.` : "Keep it on the stave."} Any ${pcLabel({ step, alter })} that fits is correct.`,
    answer,
    hints: [`First put the note on its line or space for the letter ${step}. Then add the sign: ${alter > 0 ? "𝄪 for a double sharp" : "𝄫 for a double flat"}.`],
  };
};

/** t.g4.double-cancel: how long a double accidental lasts and which sign cancels it (natural only: see the header, Q9). */
export const doubleCancel: Gen = (c): any => {
  if (!c.scope.doubleAccidentals) return null;
  const mode = c.rng.pick(["sign", "sign", "lasts", "lasts", "next-bar"] as const);
  const sharp = c.rng.chance(0.5);
  if (mode === "sign") {
    return {
      prompt: `A note has been written with a double ${sharp ? "sharp" : "flat"}. Later in the same bar the same note must be plain again, with no sharp or flat at all. Which sign is written before it?`,
      answer: { kind: "choice", options: [{ id: "natural", label: "♮ (natural)" }, { id: "sharp", label: "♯ (sharp)" }, { id: "flat", label: "♭ (flat)" }, { id: sharp ? "double-flat" : "double-sharp", label: sharp ? "𝄫 (double flat)" : "𝄪 (double sharp)" }], correctOptionIds: ["natural"], diagnoses: { sharp: diag("cancel-wrong-sign", `A ${sharp ? "sharp" : "flat"} would leave the note altered. To make it plain, cancel the alteration with a natural sign.`), flat: diag("cancel-wrong-sign", "A flat would lower the note. To make it plain, cancel the alteration with a natural sign."), [sharp ? "double-flat" : "double-sharp"]: diag("cancel-wrong-sign", "That is another double sign, which alters the note again. A natural sign cancels the alteration.") } },
      hints: ["A natural sign cancels any earlier sharp, flat, double sharp or double flat on that note."],
    };
  }
  const clef = c.rng.pick(clefsIn(c));
  const max = Math.min(maxLedger(c), 2);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const ts = "4/4";
  const base = naturalAt(clef, c.rng.int(1, 7));
  const sa = music.signatureAlter(key, base.step);
  const acc = sharp ? 2 : -2;
  const filler = (avoid: string) => {
    const s = c.rng.pick(music.STEPS.filter((x) => x !== avoid));
    return { step: s, alter: music.signatureAlter(key, s), octave: base.octave } as Pitch;
  };
  const at = (alter: number): Pitch => ({ step: base.step, alter, octave: base.octave });
  const bars: Pitch[][] = mode === "lasts" ? [[at(acc), filler(base.step), filler(base.step), at(acc)]] : [[at(acc), filler(base.step), filler(base.step), filler(base.step)], [at(sa), filler(base.step), filler(base.step), filler(base.step)]];
  if (!fits(clef, bars.flat(), max)) return null;
  const targetBar = mode === "lasts" ? 0 : 1;
  const targetIdx = mode === "lasts" ? 3 : 0;
  const measures = bars.map((b, bi) => ({ events: b.map((p, i) => note(p, "crotchet", bi === targetBar && i === targetIdx ? { label: "*" } : {})) }));
  const f = frag(clef, measures, "", { key: keyText, timeSignature: ts });
  const t = f.measures[targetBar]!.events![targetIdx]!;
  if (t.kind !== "note" || t.writtenAccidental) return null;
  const describe = (m: { events?: NotationEvent[] }, bi: number) => `Bar ${bi + 1}: ` + (m.events ?? []).map((e) => (e.kind === "note" ? `a note ${posText(staffPosition(clef, P(e.pitch)))}${e.writtenAccidental ? ` with a ${e.writtenAccidental.replace("-", " ")} sign` : ""}${e.label ? " (marked *)" : ""}` : "rest")).join(", ") + ".";
  const sig = music.keySignature(key);
  f.textAlternative = `${cap(articleClef(clef))} clef, key signature: ${sig.count ? `${sig.count} ${sig.type}` : "none"}, ${ts}. ` + f.measures.map(describe).join(" ");
  const correct = at(mode === "lasts" ? acc : sa);
  const optsSet = new Map<string, music.PitchClass>();
  for (const alter of [correct.alter, 2, 1, 0, -1, -2]) {
    if (optsSet.size < 4 && !optsSet.has(pcId({ step: base.step, alter }))) optsSet.set(pcId({ step: base.step, alter }), { step: base.step, alter });
  }
  const rightId = pcId(correct);
  return {
    prompt: mode === "lasts" ? "The first note has a double accidental. What is the note marked *? Give its letter name and any sharp, flat or natural that applies to it." : "The first note of bar 1 has a double accidental. What is the note marked * at the start of bar 2? Give its letter name and any sharp, flat or natural that applies.",
    music: f,
    answer: { kind: "choice", options: c.rng.shuffle([...optsSet].map(([id, x]) => ({ id, label: pcLabel(x) }))), correctOptionIds: [rightId], diagnoses: Object.fromEntries([...optsSet].filter(([id]) => id !== rightId).map(([id]) => [id, diag(mode === "lasts" ? "double-forgotten" : "double-carried-over", mode === "lasts" ? "An accidental lasts until the end of the bar, on the same line or space. The first note's sign still applies here." : "An accidental lasts only to the barline. In a new bar the key signature applies again.")])) as Diagnoses },
    hints: ["An accidental affects every later note on the same line or space until the barline. After the barline the key signature rules again."],
  };
};

// ---------------------------------------------------------------------------
// Unit 2: enharmonic equivalents
// ---------------------------------------------------------------------------

/** t.g4.enharmonic-letter: write the note that sounds the same, using a stated letter name (one correct spelling). */
export const enharmonicLetter: Gen = (c): any => {
  const dbl = Boolean(c.scope.doubleAccidentals);
  const step = c.rng.pick(music.STEPS);
  const alter = c.rng.pick([-1, 0, 1, 0, 1, -1, ...(dbl ? [2, -2] : [])]);
  const ref: Pitch = { step, alter, octave: 4 };
  const options = music.STEPS.filter((s) => s !== step).map((s) => {
    const natural = music.naturalSemitones(s);
    let a = chromaticNumber(ref) - (4 * 12 + natural);
    // the letter in the octave nearest the reference
    while (a > 6) a -= 12;
    while (a < -6) a += 12;
    return { step: s, alter: a };
  }).filter((x) => Math.abs(x.alter) <= (dbl ? 2 : 1) && x.alter !== 0 + 99);
  if (!options.length) return null;
  const target = c.rng.pick(options);
  const out: Pitch = { ...target, octave: 4 };
  // put the answer in the octave whose pitch number matches the reference
  let octave = 4;
  while (chromaticNumber({ ...target, octave }) > chromaticNumber(ref)) octave--;
  while (chromaticNumber({ ...target, octave }) < chromaticNumber(ref)) octave++;
  out.octave = octave;
  if (chromaticNumber(out) !== chromaticNumber(ref)) return null;
  return {
    prompt: `Write a note that sounds the same as ${pcLabel(ref)} but uses the letter name ${target.step}. Give its letter name and sign.`,
    answer: { kind: "pitch", reference: F(ref), relation: "different-spelling", letter: target.step, accepted: [F(out)], octaveSensitive: false, spellingSensitive: true },
    hints: [`Find ${pcLabel(ref)} on the keyboard, then ask which sign ${target.step} needs to reach the same key.`],
  };
};

/** t.g4.enharmonic-pick: choose the enharmonic equivalent, or the pair that sound the same. */
export const enharmonicPick: Gen = (c): any => {
  const dbl = Boolean(c.scope.doubleAccidentals);
  const mode = c.rng.pick(["which", "which", "pair"] as const);
  if (mode === "which") {
    const step = c.rng.pick(music.STEPS);
    const alter = c.rng.pick([-1, 1, 1, -1, 0, ...(dbl ? [2, -2] : [])]);
    const ref: Pitch = { step, alter, octave: 4 };
    const sound = chromaticNumber(ref);
    const right = c.rng.pick(spellingsOfSound(sound, dbl ? 2 : 1).filter((x) => x.step !== step));
    if (!right) return null;
    const neighbours = [1, -1].map((d) => c.rng.pick(spellingsOfSound(sound + d, 1)));
    const same = { step, alter: alter === 0 ? 1 : 0 } as music.PitchClass;
    const set = new Map<string, music.PitchClass>();
    for (const x of [right, ...neighbours, same]) if (x && !set.has(pcId(x)) && mod12(music.naturalSemitones(x.step) + x.alter) !== (x === right ? -1 : mod12(sound)) || x === right) set.set(pcId(x), x);
    const list = [...set].filter(([, x]) => x === right || mod12(music.naturalSemitones(x.step) + x.alter) !== mod12(sound));
    if (list.length < 4 || !list.some(([, x]) => x === right)) return null;
    const four = [list.find(([, x]) => x === right)!, ...list.filter(([, x]) => x !== right).slice(0, 3)];
    return {
      prompt: `Which of these notes sounds the same as ${pcLabel(ref)}?`,
      answer: { kind: "choice", options: c.rng.shuffle(four.map(([id, x]) => ({ id, label: pcLabel(x) }))), correctOptionIds: [pcId(right)], diagnoses: Object.fromEntries(four.filter(([, x]) => x !== right).map(([id, x]) => [id, diag("not-same-pitch", `${pcLabel(x)} is a different sound: it is ${Math.abs(mod12(music.naturalSemitones(x.step) + x.alter) - mod12(sound)) === 1 || Math.abs(mod12(music.naturalSemitones(x.step) + x.alter) - mod12(sound)) === 11 ? "a semitone" : "some semitones"} away from ${pcLabel(ref)}.`)])) as Diagnoses },
      hints: ["Enharmonic notes are the same key on the keyboard with different names."],
    };
  }
  // pair: exactly one of four pairs shares a sound
  const mk = (): [music.PitchClass, music.PitchClass, boolean] => {
    const step = c.rng.pick(music.STEPS);
    const alter = c.rng.pick([-1, 0, 1, ...(dbl ? [2, -2] : [])]);
    const a: music.PitchClass = { step, alter };
    const same = c.rng.chance(0.5);
    const sounds = spellingsOfSound(mod12(music.naturalSemitones(step) + alter) + (same ? 0 : c.rng.pick([1, -1])), dbl ? 2 : 1).filter((x) => x.step !== step);
    if (!sounds.length) return [a, a, false];
    return [a, c.rng.pick(sounds), same];
  };
  const pairs: Array<[music.PitchClass, music.PitchClass, boolean]> = [];
  for (let i = 0; i < 40 && pairs.length < 4; i++) {
    const want = pairs.some((p) => p[2]) ? false : pairs.length === 3 ? true : c.rng.chance(0.3);
    const p = mk();
    if (p[0].step === p[1].step || p[2] !== want) continue;
    if (pairs.some((q) => pcId(q[0]) === pcId(p[0]) && pcId(q[1]) === pcId(p[1]))) continue;
    pairs.push(p);
  }
  if (pairs.length < 4 || pairs.filter((p) => p[2]).length !== 1) return null;
  const order = c.rng.shuffle(pairs);
  const id = (p: (typeof pairs)[number]) => `${pcId(p[0])}-${pcId(p[1])}`;
  const right = order.find((p) => p[2])!;
  return {
    prompt: "Exactly one of these pairs of notes sounds the same (the notes are enharmonic equivalents). Which pair is it?",
    answer: { kind: "choice", options: order.map((p) => ({ id: id(p), label: `${pcLabel(p[0])} and ${pcLabel(p[1])}` })), correctOptionIds: [id(right)], diagnoses: Object.fromEntries(order.filter((p) => !p[2]).map((p) => [id(p), diag("not-same-pitch", `${pcLabel(p[0])} and ${pcLabel(p[1])} are different keys on the keyboard, one semitone apart.`)])) as Diagnoses },
    hints: ["Enharmonic notes are the same key on the keyboard. Check each pair on the keyboard in your mind."],
  };
};

// ---------------------------------------------------------------------------
// Unit 2: the alto clef
// ---------------------------------------------------------------------------

/** t.g4.alto-facts: the alto clef - middle C on the middle line, the notes of the lines, the clefs compared. */
export const altoFacts: Gen = (c): any => {
  if (!clefsIn(c).includes("alto")) return null;
  const mode = c.rng.pick(["middle-c", "line-note", "line-note", "line-note", "which-clef", "space-note"] as const);
  if (mode === "middle-c") {
    return {
      prompt: "In the alto clef, which line of the stave is middle C?",
      answer: { kind: "choice", options: [{ id: "bottom", label: "The bottom line" }, { id: "second", label: "The second line" }, { id: "middle", label: "The middle line" }, { id: "top", label: "The top line" }], correctOptionIds: ["middle"], diagnoses: { bottom: diag("clef-confusion", "Middle C sits below the bass stave's top... in the alto clef the clef sign itself points to middle C: its centre rests on the middle line."), second: diag("line-space-swap", "The alto clef is centred on the middle line, and the centre of the clef is middle C."), top: diag("clef-confusion", "The top line of the alto stave is G, a fifth above middle C.") } },
      hints: ["The C clef is printed centred on the line that is middle C. For the alto clef that is the middle line."],
    };
  }
  if (mode === "which-clef") {
    const opts = [{ id: "alto", label: "The alto clef" }, { id: "treble", label: "The treble clef" }, { id: "bass", label: "The bass clef" }];
    return {
      prompt: "Which clef has middle C on the middle line of the stave?",
      answer: { kind: "choice", options: opts, correctOptionIds: ["alto"], diagnoses: { treble: diag("clef-confusion", "In the treble clef middle C is on a ledger line below the stave."), bass: diag("clef-confusion", "In the bass clef middle C is on a ledger line above the stave.") } },
      hints: ["Treble: middle C is below the stave. Bass: above it. Which clef puts it in the middle?"],
    };
  }
  const space = mode === "space-note";
  const pos = space ? c.rng.pick([1, 3, 5, 7]) : c.rng.pick([0, 2, 4, 6, 8]);
  const p = naturalAt("alto", pos);
  const trebleReading = naturalAt("treble", pos);
  const bassReading = naturalAt("bass", pos);
  const ids = new Map<string, { label: string; cat?: string; why?: string }>([[p.step, { label: p.step }]]);
  if (!ids.has(trebleReading.step)) ids.set(trebleReading.step, { label: trebleReading.step, cat: "clef-confusion", why: `That is the note at this position in the treble clef. In the alto clef the same position is a different note: count from middle C on the middle line.` });
  if (!ids.has(bassReading.step)) ids.set(bassReading.step, { label: bassReading.step, cat: "clef-confusion", why: `That is the note at this position in the bass clef. In the alto clef count from middle C on the middle line.` });
  for (const d of c.rng.shuffle([1, -1, 2, -2])) {
    const s = music.STEPS[(music.STEPS.indexOf(p.step) + d + 7) % 7]!;
    if (ids.size < 4 && !ids.has(s)) ids.set(s, { label: s, cat: "off-by-step", why: "Close: you are one step out. Count line and space, line and space, from middle C on the middle line." });
  }
  const where = pos === 0 || pos === 8 ? (pos === 0 ? "bottom line" : "top line") : describeLines(pos);
  return {
    prompt: `Which note is written on the ${where} of the alto-clef stave? Give its letter name.`,
    answer: { kind: "choice", options: c.rng.shuffle([...ids].map(([id, x]) => ({ id, label: x.label }))), correctOptionIds: [p.step], diagnoses: Object.fromEntries([...ids].filter(([id]) => id !== p.step).map(([id, x]) => [id, diag(x.cat!, x.why!)])) as Diagnoses },
    hints: [`Middle C is on the middle line. Count up (or down) one letter for each line and space.`],
  };
};
const describeLines = (pos: number) => {
  const ord = ["1st", "2nd", "3rd", "4th", "5th"];
  return pos % 2 === 0 ? `${ord[pos / 2]} line` : `${ord[(pos - 1) / 2]} space`;
};

/** t.g4.same-pitch: write the same sounding pitch in another of the three clefs (octave and spelling both count). */
export const samePitch4: Gen = (c): any => {
  const clefs = clefsIn(c).filter((x) => ["treble", "alto", "bass"].includes(x));
  if (clefs.length < 2 || !clefs.includes("alto")) return null;
  const max = Math.min(maxLedger(c), 2);
  const from = c.rng.pick(clefs);
  const to = c.rng.pick(clefs.filter((x) => x !== from));
  const base = naturalAt(from, c.rng.int(-2 * max, 8 + 2 * max));
  const p: Pitch = { ...base, alter: c.scope.accidentals && c.rng.chance(0.3) ? c.rng.pick([1, -1]) : 0 };
  if (!fits(from, [p], max) || !fits(to, [p], max)) return null;
  const answer = { kind: "staff-position" as const, clef: to, target: { step: p.step, alter: p.alter, position: "any" as const, maxLedgerLines: max, octave: p.octave }, accepted: [F(p)], octaveSensitive: true };
  return {
    prompt: `This note is written in the ${from} clef. Write the note that sounds exactly the same, in the ${to} clef. (Same pitch, not an octave higher or lower.)`,
    music: frag(from, [{ events: [note(p)] }], `${cap(articleClef(from))} clef stave with one semibreve ${posText(staffPosition(from, p))}${p.alter ? `, with a ${SIGN_WORD[p.alter]} sign` : ""}.`, { showKeySignature: false }),
    answer,
    hints: ["First name the note and its octave in the clef you can read. Then find that exact pitch in the new clef."],
  };
};

/** t.g4.clef-position: where the same pitch sits in another clef (choice by position). */
export const clefPosition: Gen = (c): any => {
  const clefs = clefsIn(c).filter((x) => ["treble", "alto", "bass"].includes(x));
  if (clefs.length < 2 || !clefs.includes("alto")) return null;
  const max = Math.min(maxLedger(c), 2);
  const from = c.rng.pick(clefs);
  const to = c.rng.pick(clefs.filter((x) => x !== from));
  const base = naturalAt(from, c.rng.int(-2 * max, 8 + 2 * max));
  if (!fits(from, [base], max) || !fits(to, [base], max)) return null;
  const here = staffPosition(from, base);
  const there = staffPosition(to, base);
  const ids = new Map<number, { cat: string; why: string } | null>([[there, null]]);
  if (here !== there) ids.set(here, { cat: "clef-confusion", why: `That is where the note is written in the ${from} clef. A new clef moves the note: the same pitch sits somewhere else on the ${to} stave.` });
  const octaveMove = staffPosition(to, { ...base, octave: base.octave + (staffPosition(to, { ...base, octave: base.octave + 1 }) <= 8 + 2 * max ? 1 : -1) });
  if (!ids.has(octaveMove) && fits(to, [naturalAt(to, octaveMove)], max)) ids.set(octaveMove, { cat: "wrong-octave", why: "That is the same letter name an octave away. The question asks for exactly the same pitch." });
  for (const d of c.rng.shuffle([1, -1, 2, -2])) if (ids.size < 4 && !ids.has(there + d) && fits(to, [naturalAt(to, there + d)], max)) ids.set(there + d, { cat: "off-by-step", why: "You are a step out. Name the note first, then find that exact letter in the new clef." });
  if (ids.size < 3) return null;
  return {
    prompt: `This note is in the ${from} clef. Where is the same pitch written in the ${to} clef?`,
    music: frag(from, [{ events: [note(base)] }], `${cap(articleClef(from))} clef stave with one semibreve ${posText(here)}.`, { showKeySignature: false }),
    answer: { kind: "choice", options: c.rng.shuffle([...ids.keys()].map((k) => ({ id: String(k), label: cap(posText(k)) }))), correctOptionIds: [String(there)], diagnoses: Object.fromEntries([...ids].filter(([k, v]) => v && k !== there).map(([k, v]) => [String(k), diag(v!.cat, v!.why)])) as Diagnoses },
    hints: ["Name the note and its octave first. Then count from the clef's anchor: middle C on the middle line in the alto clef."],
  };
};

/** t.g4.octave-pick-alto: choose where an octave-transposed note goes, into or out of the alto clef. Always offers the same pitch as a wrong option. */
export const octavePickAlto: Gen = (c): any => {
  const clefs = clefsIn(c).filter((x) => ["treble", "alto", "bass"].includes(x));
  if (!clefs.includes("alto")) return null;
  const from = c.rng.pick(clefs);
  const to = from === "alto" ? c.rng.pick(clefs.filter((x) => x !== "alto")) : "alto";
  const dir: "up" | "down" = c.rng.pick(["up", "down"] as const);
  const max = Math.min(maxLedger(c), 2);
  const p = naturalAt(from, c.rng.int(-2, 10));
  const target = music.transpose(p, music.parseInterval("P8"), dir);
  const same = staffPosition(to, p);
  const tpos = staffPosition(to, target);
  if (ledgerLines(to, target) > max || ledgerLines(to, naturalAt(to, same)) > max + 1 || ledgerLines(from, p) > max) return null;
  const ids = new Map<number, { why: string; cat: string } | null>([[tpos, null]]);
  ids.set(same, { cat: "wrong-octave", why: `That is the same pitch written in the ${to} clef. The question asks for a note an octave ${dir === "up" ? "higher" : "lower"}, so the position must move as well as the clef.` });
  const other = staffPosition(to, music.transpose(p, music.parseInterval("P8"), dir === "up" ? "down" : "up"));
  if (!ids.has(other) && ledgerLines(to, naturalAt(to, other)) <= max + 1) ids.set(other, { cat: "wrong-direction", why: `That moves the note the wrong way. ${dir === "up" ? "Higher" : "Lower"} means ${dir === "up" ? "up" : "down"}.` });
  for (const d of c.rng.shuffle([-1, 1, 7, -7])) if (ids.size < 4 && !ids.has(tpos + d) && ledgerLines(to, naturalAt(to, tpos + d)) <= max) ids.set(tpos + d, { cat: "wrong-interval", why: "Right idea, but not the right line or space. An octave is eight letter names: seven steps of line and space." });
  if (ids.size < 3) return null;
  return {
    prompt: `This note is in the ${from} clef. It is to be written an octave ${dir === "up" ? "higher" : "lower"} in the ${to} clef. Where is the new note written?`,
    music: frag(from, [{ events: [note(p)] }], `${cap(articleClef(from))} clef stave with one semibreve ${posText(staffPosition(from, p))}.`, { showKeySignature: false }),
    answer: { kind: "choice", options: c.rng.shuffle([...ids.keys()].map((k) => ({ id: String(k), label: cap(posText(k)) }))), correctOptionIds: [String(tpos)], diagnoses: Object.fromEntries([...ids].filter(([k, v]) => v && k !== tpos).map(([k, v]) => [String(k), diag(v!.cat, v!.why)])) as Diagnoses },
    hints: ["Find the same pitch in the new clef first, then move it one octave: seven steps of line and space."],
  };
};

// ---------------------------------------------------------------------------
// Unit 3: keys, degrees, chromatic scales
// ---------------------------------------------------------------------------

const scaleNotes = (keyText: string, form: "major" | "harmonic" | "melodic", dir: "ascending" | "descending", oct = 4): Pitch[] => deriveScale(keyText, form, dir, { ...parseKey(keyText).tonic, octave: oct });
const NEW_KEYS = ["B major", "G# minor", "Db major", "Bb minor"];

/** t.g4.key-facts: the five-accidental keys: counts, relatives, the raised notes, which scale needs a double sharp. */
export const keyFacts4: Gen = (c): any => {
  const pool = keysIn(c).filter((k) => NEW_KEYS.includes(k));
  const keys = pool.length ? pool : keysIn(c);
  if (!keys.length) return null;
  const keyText = c.rng.pick(keys);
  const key = parseKey(keyText);
  const sig = music.keySignature(key);
  const mode = c.rng.pick(["count", "relative", "relative", "raised-seventh", "double", "list"] as const);
  if (mode === "count") {
    const n = sig.count;
    const ids = [...new Set([n, n - 1, n + 1, n === 5 ? 4 : 5, 6].filter((x) => x >= 0 && x !== (n === 5 ? 99 : -1)))].slice(0, 4);
    if (!ids.includes(n)) ids[0] = n;
    return {
      prompt: `How many ${sig.type === "sharps" ? "sharps" : "flats"} are in the key signature of ${keyWord(keyText)}?`,
      answer: { kind: "choice", options: optsOf([...new Set(ids)].sort((x, y) => x - y).map(String)), correctOptionIds: [String(n)], diagnoses: Object.fromEntries([...new Set(ids)].filter((x) => x !== n).map((x) => [String(x), diag("wrong-count", `${keyWord(keyText)} has ${n} ${sig.type}: ${sig.accidentals.map(pretty).join(", ")}.`)])) as Diagnoses },
      hints: [`The ${sig.type} come in a fixed order: ${sig.type === "sharps" ? "F C G D A E B" : "B E A D G C F"}.`],
    };
  }
  if (mode === "relative") {
    const rel = music.relativeKey(key);
    const relText = music.formatKey(rel);
    const wrong = [key.mode === "major" ? music.formatKey({ tonic: key.tonic, mode: "minor" }) : music.formatKey({ tonic: key.tonic, mode: "major" }), music.formatKey({ tonic: music.pitchFromNumbers(0, 0) as never, mode: rel.mode })].slice(0, 1);
    const spare = ["B minor", "C# minor", "G minor", "Bb major", "E minor", "D major", "F# minor", "A minor"].filter((k) => k !== relText && k !== keyText && !wrong.includes(k) && music.keyFifths(parseKey(k)) !== music.keyFifths(key));
    const options = [relText, ...wrong, ...c.rng.shuffle(spare)].slice(0, 4);
    return {
      prompt: `What is the relative ${key.mode === "major" ? "minor" : "major"} of ${keyWord(keyText)}?`,
      answer: { kind: "choice", options: c.rng.shuffle(options.map((k) => ({ id: k, label: keyWord(k) }))), correctOptionIds: [relText], diagnoses: Object.fromEntries(options.filter((k) => k !== relText).map((k) => [k, diag(k === wrong[0] ? "relative-confusion" : "wrong-count", k === wrong[0] ? `${keyWord(k)} is the tonic ${key.mode === "major" ? "minor" : "major"} (it shares the starting note), not the relative. The relative key shares the key signature.` : `${keyWord(k)} has a different key signature from ${keyWord(keyText)}. The relative key has the same one.`)])) as Diagnoses },
      hints: ["Relative keys share a key signature. The relative minor starts on the 6th note of the major scale (a minor third below the major tonic)."],
    };
  }
  if (mode === "raised-seventh") {
    const minorKeys = keys.filter((k) => k.endsWith("minor"));
    const mk = minorKeys.length ? c.rng.pick(minorKeys) : null;
    if (!mk) return null;
    const mkey = parseKey(mk);
    const seventh = scale(mkey, "harmonic")[6]!;
    const enh = spellingsOfSound(mod12(music.naturalSemitones(seventh.step) + seventh.alter), 2).filter((x) => x.step !== seventh.step);
    const wrongEnh = enh.find((x) => Math.abs(x.alter) <= 1) ?? enh[0]!;
    const natural7 = scale(mkey, "natural")[6]!;
    const ids = new Map<string, music.PitchClass>([[pcId(seventh), seventh]]);
    ids.set(pcId(wrongEnh), wrongEnh);
    if (!ids.has(pcId(natural7))) ids.set(pcId(natural7), natural7);
    const sixth = scale(mkey, "harmonic")[5]!;
    if (!ids.has(pcId(sixth))) ids.set(pcId(sixth), sixth);
    if (ids.size < 4) return null;
    return {
      prompt: `In the harmonic minor scale of ${keyWord(mk)}, what is the leading note (the 7th degree, raised)? Spelling matters.`,
      answer: { kind: "choice", options: c.rng.shuffle([...ids].map(([id, x]) => ({ id, label: pcLabel(x) }))), correctOptionIds: [pcId(seventh)], diagnoses: Object.fromEntries([...ids].filter(([id]) => id !== pcId(seventh)).map(([id, x]) => [id, id === pcId(wrongEnh) ? diag("letter-skipped-or-repeated", `${pcLabel(x)} sounds the same, but a scale uses every letter name once and in order. The note below the tonic ${pcLabel(mkey.tonic)} must carry the letter ${seventh.step}.`) : id === pcId(natural7) ? diag("wrong-minor-form", "That is the 7th of the key signature (the natural minor). The harmonic minor raises the 7th by a semitone.") : diag("off-by-one", "That is the 6th degree. The leading note is the 7th, a semitone below the tonic.")])) as Diagnoses },
      hints: ["The harmonic minor raises the 7th by a semitone: take the 7th from the key signature and add a sharp or natural (a double sharp if it was sharp already)."],
    };
  }
  if (mode === "double") {
    const mkeys = ["C# minor", "F# minor", "G# minor", "B minor"].filter((k) => !c.scope.keys?.length || c.scope.keys.includes(k));
    if (mkeys.length < 3 || !mkeys.includes("G# minor")) return null;
    const four = [...new Set(["G# minor", ...c.rng.shuffle(mkeys.filter((k) => k !== "G# minor"))])].slice(0, 4);
    const hasDouble = (k: string) => (["harmonic", "melodic-ascending"] as const).some((f) => scale(parseKey(k), f).some((x) => Math.abs(x.alter) === 2));
    if (four.filter(hasDouble).length !== 1 || four.length < 3) return null;
    return {
      prompt: "In which of these minor keys does the harmonic or melodic minor scale need a double sharp?",
      answer: { kind: "choice", options: c.rng.shuffle(four.map((k) => ({ id: k, label: keyWord(k) }))), correctOptionIds: ["G# minor"], diagnoses: Object.fromEntries(four.filter((k) => k !== "G# minor").map((k) => [k, diag("wrong-minor-form", `${keyWord(k)} needs only single sharps in its harmonic and melodic minor scales. The key that already has F♯ in its signature has to raise it again.`)])) as Diagnoses },
      hints: ["A double sharp is needed when a note that is already sharp in the key signature must be raised again: the 7th of G♯ minor."],
    };
  }
  // list: which accidentals are in the key signature (the first n of the order)
  const names = sig.accidentals.map(pretty);
  const ids = [names.join(" "), names.slice(0, -1).join(" ") || "none", [...names.slice(0, -1), pretty(sig.type === "sharps" ? "Fb" : "Cb")].join(" "), (sig.type === "sharps" ? ["B♭", "E♭", "A♭", "D♭", "G♭"] : ["F♯", "C♯", "G♯", "D♯", "A♯"]).slice(0, sig.count).join(" ")];
  if (new Set(ids).size < 4) return null;
  return {
    prompt: `Which of these shows all of the ${sig.type} of ${keyWord(keyText)}, in order?`,
    answer: { kind: "choice", options: c.rng.shuffle(ids.map((x, i) => ({ id: String(i), label: x }))), correctOptionIds: ["0"], diagnoses: { "1": diag("wrong-count", "One accidental is missing: the key signature has more than that."), "2": diag("wrong-order", `The ${sig.type} follow a fixed order: ${sig.type === "sharps" ? "F C G D A E B" : "B E A D G C F"}.`), "3": diag("mixed-sharps-flats", `${keyWord(keyText)} uses only ${sig.type}.`) } as Diagnoses },
    hints: [`${sig.type === "sharps" ? "Sharps: F C G D A E B" : "Flats: B E A D G C F"}; take as many as the key has.`],
  };
};

/** t.g4.scale-spot: one note of a written scale is spelt with the wrong letter name; find it (spelling, not sound). */
export const scaleSpot: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const forms = key.mode === "major" ? (["major"] as const) : ((c.scope.minorForms ?? []).length ? ((c.scope.minorForms ?? []) as Array<"harmonic" | "melodic">) : (["harmonic"] as const));
  const form = c.rng.pick(forms as readonly ("major" | "harmonic" | "melodic")[]);
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass"));
  const max = Math.min(maxLedger(c), 2);
  for (const oct of c.rng.shuffle([3, 4])) {
    const notes = scaleNotes(keyText, form, "ascending", oct);
    if (!fits(clef, notes, max)) continue;
    const bad = c.rng.int(1, 6);
    const original = notes[bad]!;
    const alt = spellingsOfSound(mod12(music.naturalSemitones(original.step) + original.alter), 2).filter((x) => x.step !== original.step && Math.abs(x.alter) <= 2)[0];
    if (!alt) continue;
    const shownP: Pitch = { ...alt, octave: oct + (chromaticNumber({ ...alt, octave: oct }) < chromaticNumber(original) - 6 ? 1 : chromaticNumber({ ...alt, octave: oct }) > chromaticNumber(original) + 6 ? -1 : 0) } as Pitch;
    let q = shownP;
    while (chromaticNumber(q) < chromaticNumber(original)) q = { ...q, octave: q.octave + 1 };
    while (chromaticNumber(q) > chromaticNumber(original)) q = { ...q, octave: q.octave - 1 };
    if (chromaticNumber(q) !== chromaticNumber(original) || !fits(clef, [q], max) || Math.abs(q.alter) > 2) continue;
    const shown = notes.map((p, i) => (i === bad ? q : p));
    const otherIdx = c.rng.shuffle([1, 2, 3, 4, 5, 6].filter((i) => i !== bad)).slice(0, 3);
    const idxs = [bad, ...otherIdx];
    const label = (i: number) => `The ${ORD(i + 1)} note (${pcLabel(shown[i]!)})`;
    const formName = key.mode === "major" ? `scale of ${keyWord(keyText)}` : `${pcLabel(key.tonic)} ${form} minor scale`;
    return {
      prompt: `This is meant to be the ${formName}, going up. Every note sounds right, but one is spelt with the wrong letter name. Which one?`,
      music: frag(clef, [{ events: shown.map((p) => note(p)) }], `${cap(articleClef(clef))} clef stave with eight semibreves going up, the ${formName}: ${shown.map(nameOf).join(", ")}.`, { showKeySignature: false }),
      answer: { kind: "choice", options: c.rng.shuffle(idxs.map((i) => ({ id: String(i), label: label(i) }))), correctOptionIds: [String(bad)], diagnoses: Object.fromEntries(otherIdx.map((i) => [String(i), diag("letter-skipped-or-repeated", `The ${ORD(i + 1)} note is spelt correctly. A scale uses each letter name once, in order: check which letter is missing or used twice.`)])) as Diagnoses },
      hints: ["Write the letter names in order from the tonic. Which note breaks the pattern of letters?"],
    };
  }
  return null;
};

const TECH_LABEL = (d: number) => music.TECHNICAL_NAMES[d - 1]!;
/** t.g4.degree-name: find the note with a technical name, or name the degree by its technical name, in keys that may need double sharps. */
export const degreeName: Gen = (c): any => {
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const form = key.mode === "major" ? "major" : "harmonic";
  const notes = scale(key, form).slice(0, 7);
  const mode = c.rng.pick(["find-note", "find-note", "find-note", "facts"] as const);
  if (mode === "facts") {
    const facts = [
      { q: "Which degree of the scale is the dominant?", opts: ["tonic", "mediant", "subdominant", "dominant"], a: "dominant", why: "The dominant is the 5th degree." },
      { q: "Which degree of the scale is the mediant?", opts: ["supertonic", "mediant", "dominant", "submediant"], a: "mediant", why: "The mediant is the 3rd degree." },
      { q: "Which degree is the leading note?", opts: ["the 5th", "the 6th", "the 7th", "the 2nd"], a: "the 7th", why: "The leading note is the 7th degree, a semitone below the tonic." },
      { q: "Which degree is the submediant?", opts: ["the 3rd", "the 4th", "the 6th", "the 7th"], a: "the 6th", why: "The submediant is the 6th degree, as far below the tonic as the mediant is above it." },
      { q: "The supertonic is the note directly above the tonic. Which degree is it?", opts: ["the 2nd", "the 3rd", "the 4th", "the 7th"], a: "the 2nd", why: "The supertonic is the 2nd degree." },
      { q: "Which technical name belongs to the 4th degree?", opts: ["dominant", "subdominant", "submediant", "mediant"], a: "subdominant", why: "The subdominant is the 4th degree, as far below the tonic as the dominant is above it." },
    ];
    const f = c.rng.pick(facts);
    return {
      prompt: f.q,
      answer: { kind: "choice", options: c.rng.shuffle(f.opts.map((o) => ({ id: o, label: cap(o) }))), correctOptionIds: [f.a], diagnoses: Object.fromEntries(f.opts.filter((o) => o !== f.a).map((o) => [o, diag("name-number-mismatch", f.why)])) as Diagnoses },
      hints: ["The names in order are: tonic, supertonic, mediant, subdominant, dominant, submediant, leading note."],
    };
  }
  const d = c.rng.int(1, 7);
  const target = notes[d - 1]!;
  const ids = new Map<string, music.PitchClass>([[pcId(target), target]]);
  for (const x of c.rng.shuffle(notes.filter((_, i) => i !== d - 1))) if (ids.size < 4) ids.set(pcId(x), x);
  const formNote = key.mode === "minor" ? " (harmonic minor)" : "";
  return {
    prompt: `In ${keyWord(keyText)}${formNote}, which note is the ${TECH_LABEL(d)}?`,
    answer: { kind: "choice", options: c.rng.shuffle([...ids].map(([id, x]) => ({ id, label: pcLabel(x) }))), correctOptionIds: [pcId(target)], diagnoses: Object.fromEntries([...ids].filter(([id]) => id !== pcId(target)).map(([id, x]) => { const di = notes.findIndex((y) => pcId(y) === id) + 1; return [id, diag("counted-from-wrong-note", `${pcLabel(x)} is the ${TECH_LABEL(di)} (the ${ORD(di)} degree) of ${keyWord(keyText)}. The ${TECH_LABEL(d)} is the ${ORD(d)}.`)]; })) as Diagnoses },
    hints: [`Write out the scale of ${keyWord(keyText)}${formNote} from the tonic, ${pcLabel(key.tonic)}, and count to degree ${d}.`],
  };
};

/** t.g4.chromatic-judge: which written chromatic scale is correct? Exactly one option passes the rules; each wrong one is the correct scale with ONE note changed and breaks one named rule. */
export const chromaticJudge: Gen = (c): any => {
  const direction = c.rng.pick(["ascending", "descending"] as const);
  const step = c.rng.pick(music.STEPS);
  const alter = c.rng.pick([0, 0, 1, -1]);
  if ((alter === 1 && (step === "E" || step === "B")) || (alter === -1 && (step === "C" || step === "F"))) return null;
  const start: Pitch = { step, alter, octave: 4 };
  const sign = direction === "ascending" ? 1 : -1;
  const sound0 = chromaticNumber(start);
  const withOctave = (pc: music.PitchClass, sound: number): Pitch => {
    let octave = Math.floor(sound / 12);
    let p: Pitch = { ...pc, octave };
    while (chromaticNumber(p) < sound) p = { ...p, octave: ++octave };
    while (chromaticNumber(p) > sound) p = { ...p, octave: --octave };
    return p;
  };
  // a correct scale: every black key spelt with a sharp throughout, or with a flat throughout (the two usual spellings)
  const build = (accidental: 1 | -1): Pitch[] | null => {
    const out: Pitch[] = [start];
    for (let i = 1; i <= 12; i++) {
      const sound = sound0 + sign * i;
      if (i === 12) { out.push({ ...start, octave: start.octave + sign }); break; }
      const l = spellingsOfSound(sound, 1);
      const pc = l.find((x) => x.alter === 0) ?? l.find((x) => x.alter === accidental);
      if (!pc) return null;
      out.push(withOctave(pc, sound));
    }
    return out;
  };
  const problems = (ps: Pitch[]) => music.checkChromatic(ps, start, direction);
  const valid = ([1, -1] as const).map(build).filter((x): x is Pitch[] => Boolean(x) && problems(x!).length === 0);
  if (!valid.length) return null;
  const right = c.rng.pick(valid);
  // every one-note edit: respell a note (same sound, other letter) or move it a semitone (wrong sound); group the results by the rule they break
  const byRule = new Map<string, Pitch[][]>();
  for (let i = 1; i <= 11; i++) {
    const sound = chromaticNumber(right[i]!);
    const edits: Pitch[] = [
      ...spellingsOfSound(sound, 2).filter((x) => x.step !== right[i]!.step).map((x) => withOctave(x, sound)),
      ...[1, -1].map((d) => ({ ...right[i]!, alter: right[i]!.alter + d })),
    ].filter((x) => Math.abs(x.alter) <= 2);
    for (const e of edits) {
      const ps = right.map((x, k) => (k === i ? e : x));
      const first = problems(ps)[0];
      if (!first || JSON.stringify(ps.map(F)) === JSON.stringify(right.map(F))) continue;
      byRule.set(first.code, [...(byRule.get(first.code) ?? []), ps]);
    }
  }
  const reasons: Record<string, string> = {
    "letter-used-three-times": "One letter name is used three times. In a one-octave chromatic scale each letter is used once or twice.",
    "letter-missing": "One letter name is missing. Every letter name must appear at least once.",
    "not-a-semitone": "One note is not a semitone from its neighbours. A chromatic scale moves by semitones only.",
    "double-accidental": "A double accidental is not needed in a chromatic scale: use the simpler sharp or flat spelling.",
  };
  const rules = c.rng.shuffle([...byRule.keys()].filter((k) => reasons[k]));
  if (rules.length < 3) return null;
  const picks = rules.slice(0, 3).map((k) => ({ code: k, ps: c.rng.pick(byRule.get(k)!) }));
  const fmt = (ps: Pitch[]) => ps.map((p) => pcLabel(p)).join("  ");
  const all = [{ id: "right", ps: right, d: null as null | { category: string; reason: string } }, ...picks.map((b, i) => ({ id: `w${i}`, ps: b.ps, d: diag(b.code === "not-a-semitone" ? "not-all-semitones" : b.code, reasons[b.code]!) }))];
  const order = c.rng.shuffle(all);
  if (new Set(order.map((o) => fmt(o.ps))).size < 4) return null;
  return {
    prompt: `Four chromatic scales are written ${direction}, one octave, starting on ${pcLabel(start)}. Exactly one is written correctly. Which one?`,
    answer: { kind: "choice", options: order.map((o, i) => ({ id: o.id, label: `${String.fromCharCode(65 + i)}: ${fmt(o.ps)}` })), correctOptionIds: ["right"], diagnoses: Object.fromEntries(order.filter((o) => o.d).map((o) => [o.id, o.d!])) as Diagnoses },
    hints: ["Check three things: every note a semitone from the last; every letter name used once or twice; no double accidentals."],
  };
};

/** t.g4.double-accidental: read a note in a bar where a double sharp or double flat has been written; the accidental lasts to the barline. */
export const doubleRead: Gen = (c): any => {
  if (!c.scope.doubleAccidentals) return null;
  const clef = c.rng.pick(clefsIn(c));
  const max = Math.min(maxLedger(c), 2);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const scenario = c.rng.pick(["lasts", "lasts", "next-bar", "other-octave"] as const);
  const base = naturalAt(clef, c.rng.int(1, 7));
  const sa = music.signatureAlter(key, base.step);
  const acc = c.rng.pick([2, -2]);
  const filler = () => {
    const s = c.rng.pick(music.STEPS.filter((x) => x !== base.step));
    return { step: s, alter: music.signatureAlter(key, s), octave: base.octave } as Pitch;
  };
  const at = (alter: number, octave = base.octave): Pitch => ({ step: base.step, alter, octave });
  let bars: Pitch[][];
  let target: [number, number];
  const octShift = staffPosition(clef, at(acc, base.octave + 1)) <= 8 + 2 * max ? 1 : -1;
  if (scenario === "lasts") { bars = [[at(acc), filler(), filler(), at(acc)]]; target = [0, 3]; }
  else if (scenario === "next-bar") { bars = [[at(acc), filler(), filler(), filler()], [at(sa), filler(), filler(), filler()]]; target = [1, 0]; }
  else { bars = [[at(acc), filler(), filler(), at(sa, base.octave + octShift)]]; target = [0, 3]; }
  if (!fits(clef, bars.flat(), max)) return null;
  const measures = bars.map((b, bi) => ({ events: b.map((p, i) => note(p, "crotchet", bi === target[0] && i === target[1] ? { label: "*" } : {})) }));
  const f = frag(clef, measures, "", { key: keyText, timeSignature: "4/4" });
  const tgt = f.measures[target[0]]!.events![target[1]]!;
  if (tgt.kind !== "note" || tgt.writtenAccidental) return null;
  const describe = (m: { events?: NotationEvent[] }, bi: number) => `Bar ${bi + 1}: ` + (m.events ?? []).map((e) => (e.kind === "note" ? `a note ${posText(staffPosition(clef, P(e.pitch)))}${e.writtenAccidental ? ` with a ${e.writtenAccidental.replace("-", " ")} sign` : ""}${e.label ? " (marked *)" : ""}` : "rest")).join(", ") + ".";
  const sig = music.keySignature(key);
  f.textAlternative = `${cap(articleClef(clef))} clef, key signature: ${sig.count ? `${sig.count} ${sig.type}` : "none"}, 4/4. ` + f.measures.map(describe).join(" ");
  return {
    prompt: "The first bar contains a double sharp or double flat. What is the note marked *? Give its letter name and any sharp, flat or natural that applies to it.",
    music: f,
    answer: { kind: "pitch", accepted: [F(P(tgt.pitch))], octaveSensitive: false, spellingSensitive: true, relation: "same" },
    hints: ["An accidental lasts until the end of the bar, but only on its own line or space. A key signature applies in every octave."],
  };
};
