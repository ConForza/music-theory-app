/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5 context generators (Brief 09, Unit 5): ornaments, voices, instruments, Grade 5 terms and score reading.
 *
 * Source: First Steps in Music Theory, Grade 5 sections 14-15 (printed pp. 132-142, read in the supplied PDF); the official outline decides
 * what is examinable. Vocabulary comes only from `music.VOCAB_G5`, so a Grade 4 term or instrument never earns Grade 5 credit.
 *
 * Ornaments (Brief 09, section 4): the only ASSESSED skill is replacing written-out notes with a sign. How each sign is performed is
 * taught in words and asked only as a description ("begins on the note above"); no question asks the learner to write out the notes of an
 * ornament from its sign.
 *
 * Voices: the book gives no ranges, so only the two extremes are ever asked (a part wholly above the alto's top note can only be a
 * soprano; wholly below the tenor's lowest note, a bass); OPEN_QUESTIONS Q34.
 */
import { music, type Measure } from "@mtp/curriculum";
import { frag, type Gen } from "./families.ts";
import { CAD_KEYS, CAD_PAIRS, CAD_TYPES, cadencePhrase, voicings, type ChordSpec } from "./grade5-harmony.ts";
import { F, choiceAnswer, diag, fitsIn, keyWords, keysIn, melodyIn5, note, pretty, shuffled, type Clef, type Ctx, type Ev, type Pitch } from "./grade5-lib.ts";

const { parseKey, diatonicNumber, classifyCadence, intervalBetween, identifyTriad, romanDegree } = music;
const T = music.TERMS_G5;
const INST = music.INSTRUMENTS_G5;
const V = music.VOICES_G5;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const ornamentsIn = (c: Ctx) => (c.scope.ornaments?.length ? c.scope.ornaments : music.ORNAMENTS) as music.Ornament[];

// ---------------------------------------------------------------------------
// Ornaments
// ---------------------------------------------------------------------------

/** t.g5.ornament-replace: written-out notes at the start of a bar are replaced by one sign (the only assessed ornament skill). */
export const ornamentReplace5: Gen = (c): any => {
  const signs = ornamentsIn(c).filter((s) => ["trill", "turn", "upper-mordent", "lower-mordent"].includes(s));
  if (!signs.length) return null;
  const keyText = c.rng.pick(keysIn(c).filter((k) => Math.abs(music.keyFifths(parseKey(k))) <= 4));
  const key = parseKey(keyText);
  const clef = c.rng.pick(["treble", "bass"] as Clef[]);
  const pcs = music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const oct = clef === "treble" ? 4 : 3;
  const idx = c.rng.int(1, 5);
  const at = (d: number): Pitch => { const pc = pcs[((d % 7) + 7) % 7]!; return { ...pc, octave: oct + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) }; };
  const main = at(idx);
  const up = at(idx + 1);
  const down = at(idx - 1);
  if (!fitsIn(clef, [main, up, down], 1)) return null;
  const sign = c.rng.pick(signs);
  const figures: Record<string, Array<[Pitch, music.NoteValue]>> = {
    "upper-mordent": [[main, "semiquaver"], [up, "semiquaver"], [main, "quaver"]],
    "lower-mordent": [[main, "semiquaver"], [down, "semiquaver"], [main, "quaver"]],
    turn: c.rng.chance(0.4)
      ? [[main, "quaver"], [up, "demisemiquaver"], [main, "demisemiquaver"], [down, "demisemiquaver"], [main, "demisemiquaver"]] // a turn written to the right of the note: main, upper, main, lower, main
      : [[up, "semiquaver"], [main, "semiquaver"], [down, "semiquaver"], [main, "semiquaver"]],
    trill: [[up, "semiquaver"], [main, "semiquaver"], [up, "semiquaver"], [main, "semiquaver"], [up, "semiquaver"], [main, "semiquaver"], [down, "semiquaver"], [main, "semiquaver"]],
  };
  const fig = figures[sign]!;
  if (music.classifyOrnamentFigure(main, fig.map(([p]) => p)) !== sign) return null;
  const longMain = sign === "trill";
  const other = (d: number) => note(at(d), "crotchet");
  const events: Ev[] = [...fig.map(([p, v], i) => note(p, v, { beam: i === 0 ? "begin" : i === fig.length - 1 ? "end" : "continue", ...(i === 0 ? { label: "A" } : {}) })), ...(longMain ? [note(at(idx - 2), "minim")] : [other(idx + 2), other(idx - 1)])];
  const ts = longMain ? "3/4" : "3/4";
  const bars: Measure[] = longMain ? [{ events: [...events.slice(0, fig.length)].concat([]) as Ev[] }] : [];
  void bars;
  // 3/4: the figure fills one crotchet beat (mordent, turn) or two beats (trill), the rest are crotchets
  const rest: Ev[] = longMain ? [] : [other(idx + 2), other(idx - 1)];
  const figEvents = events.slice(0, fig.length);
  const full: Ev[] = longMain ? [...figEvents, note(at(idx - 1), "crotchet")] : [...figEvents, ...rest];
  if (music.checkBarAnyPattern(full as unknown as music.REvent[], ts).issues.some((x) => x.code === "bar-overfull" || x.code === "bar-underfull")) return null;
  const f = frag(clef, [{ events: full, barline: "final" }], "A bar.", { key: keyText, showKeySignature: true, timeSignature: ts });
  return {
    prompt: `The beamed group of small notes at the start of this bar (starting at the note marked A) is the written-out version of one ornament on the note ${pretty(F(main).replace(/\d$/, ""))}. Which ornament sign could replace the group?`,
    music: f,
    answer: { kind: "ornament-sign", task: "replace-written-out", mainNote: F(main), writtenOut: fig.map(([p]) => F(p)), accepted: [sign] },
    hints: ["Find the main note, then see whether the extra notes go above it, below it, or both, and how many times they alternate."],
  };
};

/** t.g5.ornament-facts: how each sign is commonly performed, as descriptions (never a note-by-note realisation to write out). */
export const ornamentFacts5: Gen = (c): any => {
  const signs = ornamentsIn(c);
  const FACT: Record<string, { q: string; right: string; why: Record<string, string> }[]> = {};
  void FACT;
  const items: Array<{ q: string; right: string; wrongs: Array<[string, string]> }> = [
    { q: "An acciaccatura is played…", right: "as quickly as possible, just before the main note", wrongs: [["so that it takes half the value of the main note", "That describes the appoggiatura, which leans on the main note and takes part of its time."], ["on the beat, with a strong accent", "An accent on the grace note belongs to the appoggiatura; the acciaccatura is crushed in."], ["at the same time as a trill", "An acciaccatura is a single crushed note, not a trill."]] },
    { q: "An appoggiatura (a small note with no stroke through its stem) is…", right: "a leaning note that takes time from the main note and is accented", wrongs: [["a crushed note played as fast as possible", "That describes the acciaccatura, the small note with the stroke."], ["a sign that tells the player to repeat the bar", "Repeat signs are different marks; an appoggiatura is an ornament."], ["a long trill that ends the piece", "An appoggiatura is a single leaning note."]] },
    { q: "How much of the main note's value does an appoggiatura usually take when the main note is not dotted?", right: "half of it", wrongs: [["none: it takes no time at all", "That describes an acciaccatura. An appoggiatura takes time from the main note."], ["all of it", "The main note still sounds after the appoggiatura, so it cannot take all of its value."], ["one quarter of it", "The usual share is half when the main note is undotted (two thirds when it is dotted)."]] },
    { q: "How much of the main note's value does an appoggiatura usually take when the main note is DOTTED?", right: "two thirds of it", wrongs: [["half of it", "Half is the usual share for an undotted main note; a dotted note gives two thirds."], ["none of it", "An appoggiatura takes time from the main note."], ["one third of it", "The usual share for a dotted main note is two thirds."]] },
    { q: "A trill (tr) tells the player to…", right: "alternate quickly between the written note and the note above it", wrongs: [["play the note once, then the note below it, then the note again", "That describes a lower mordent."], ["play the notes above, on, below and on the written note", "That describes a turn."], ["play a crushed note before the written note", "That describes an acciaccatura."]] },
    { q: "A turn (a sideways S-shaped sign) is a group of four notes. It consists of…", right: "the note above, the written note, the note below, then the written note again", wrongs: [["the written note, the note above, then the written note", "That is an upper mordent: three notes."], ["the written note, the note below, then the written note", "That is a lower mordent: three notes."], ["the written note and the note above, repeated many times", "That describes a trill."]] },
    { q: "An upper mordent is…", right: "the written note, the note above, then the written note again", wrongs: [["the written note, the note below, then the written note again", "That is a lower mordent: the extra note is below."], ["the note above, the written note, the note below and the written note", "That is a turn."], ["a rapid alternation of the written note and the note above for its whole length", "That is a trill."]] },
    { q: "A lower mordent (the zig-zag with a short vertical line through it) is…", right: "the written note, the note below, then the written note again", wrongs: [["the written note, the note above, then the written note again", "That is an upper mordent: the extra note is above."], ["the note below, the written note, the note above and the written note", "That is an inverted turn, a different sign."], ["a rapid alternation of the written note and the note below", "A trill uses the note above."]] },
    { q: "A turn written directly over a note…", right: "begins at once, on the note above", wrongs: [["begins only after the note has been sounded", "That is true of a turn placed to the right of the note, not directly over it."], ["begins on the note below", "That is the inverted turn."], ["is played before the beat as a crushed note", "That describes the acciaccatura."]] },
    { q: "Why is there rarely one 'correct' way to play an ornament?", right: "the speed, style and period of the music affect the exact notes and rhythm", wrongs: [["because every ornament sign has several unrelated meanings", "Each sign has a clear basic pattern; it is the rhythm and number of notes that vary."], ["because ornaments are never played in written music", "Ornaments are played; how exactly depends on the music."], ["because only singers may play them", "Ornaments are played by every kind of performer."]] },
  ];
  void signs;
  const useful = items;
  const it = c.rng.pick(useful);
  const opts: Array<[string, string]> = [["r", cap(it.right)], ...it.wrongs.map(([t], i) => [`w${i}`, cap(t)] as [string, string])];
  const cats: Record<string, string> = {};
  it.wrongs.forEach(([, why], i) => { cats[`w${i}`] = why; });
  return {
    prompt: it.q,
    answer: choiceAnswer(shuffled(c, opts), "r", Object.fromEntries(Object.entries(cats).map(([id, why]) => [id, [/mordent|turn|trill/.test(why) ? "trill-mordent-confusion" : "acciaccatura-appoggiatura-swap", why]]))),
    hints: ["Remember the look of each sign, and what it does to the main note."],
  };
};

const ORN_DESC: Record<string, string> = {
  trill: "Alternate quickly between the written note and the note above it",
  turn: "Play the note above, the written note, the note below, then the written note again",
  "upper-mordent": "Play the written note, the note above it, then the written note again",
  "lower-mordent": "Play the written note, the note below it, then the written note again",
  acciaccatura: "Crush the small note in as quickly as possible just before the main note",
  appoggiatura: "Lean on the small note, which takes part of the time of the main note",
};
/** t.g5.ornament-read: from the printed sign to what it asks the player to do (a description, never a note-by-note realisation to write). */
export const ornamentRead5: Gen = (c): any => {
  const signs = ornamentsIn(c);
  const sign = c.rng.pick(signs);
  const keyText = c.rng.pick(keysIn(c).filter((k) => Math.abs(music.keyFifths(parseKey(k))) <= 3));
  const key = parseKey(keyText);
  const pcs = music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const d = c.rng.int(1, 5);
  const main: Pitch = { ...pcs[d % 7]!, octave: 5 };
  const up = { ...pcs[(d + 1) % 7]!, octave: 5 };
  if (!fitsIn("treble", [main, up], 1)) return null;
  const ev = sign === "acciaccatura" || sign === "appoggiatura" ? note(main, "crotchet", { label: "A", grace: { kind: sign, pitches: [F(up)] } }) : note(main, "crotchet", { label: "A", ornament: sign });
  const others = shuffled(c, signs.filter((x) => x !== sign)).slice(0, 3);
  if (others.length < 3) return null;
  const f = frag("treble", [{ events: [ev, note({ ...pcs[(d + 2) % 7]!, octave: 5 }, "crotchet"), note(main, "minim")], barline: "final" }], "A bar.", { key: keyText, showKeySignature: true, timeSignature: "4/4" });
  return {
    prompt: "What does the ornament on the note marked A ask the player to do?",
    music: f,
    answer: choiceAnswer(shuffled(c, [sign, ...others].map((x) => [x, ORN_DESC[x]!] as [string, string])), sign, Object.fromEntries(others.map((x) => [x, [x.includes("mordent") && sign.includes("mordent") ? "upper-lower-mordent-swap" : "trill-mordent-confusion", `That describes ${x === "acciaccatura" || x === "appoggiatura" ? `an ${x}` : `a ${x.replace("-", " ")}`}. Look again at the sign: ${ORN_LOOK_TEXT[sign]}.`]]))),
    hints: ["Small notes before the main note are grace notes; signs above the note are trills, turns and mordents."],
  };
};
const ORN_LOOK_TEXT: Record<string, string> = { trill: "the letters tr", turn: "a sideways S-shaped curl", "upper-mordent": "a short zig-zag with no line through it", "lower-mordent": "a short zig-zag with a vertical line through it", acciaccatura: "a small note with a stroke through its stem", appoggiatura: "a small note without a stroke" };

/** t.g5.ornament-figure: a written-out figure is described by its notes; which sign replaces it? */
export const ornamentFigure5: Gen = (c): any => {
  const signs = ornamentsIn(c).filter((s) => ["trill", "turn", "upper-mordent", "lower-mordent"].includes(s));
  if (!signs.length) return null;
  const keyText = c.rng.pick(keysIn(c).filter((k) => Math.abs(music.keyFifths(parseKey(k))) <= 3));
  const key = parseKey(keyText);
  const pcs = music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const d = c.rng.int(1, 5);
  const at = (k: number): Pitch => { const pc = pcs[((k % 7) + 7) % 7]!; return { ...pc, octave: 4 + Math.floor((music.stepIndex(key.tonic.step) + k) / 7) }; };
  const main = at(d);
  const up = at(d + 1);
  const down = at(d - 1);
  const sign = c.rng.pick(signs);
  const figs: Record<string, Pitch[]> = { "upper-mordent": [main, up, main], "lower-mordent": [main, down, main], turn: [up, main, down, main], trill: [up, main, up, main, up, main, down, main] };
  const fig = figs[sign]!;
  if (!fitsIn("treble", fig, 1) || music.classifyOrnamentFigure(main, fig) !== sign) return null;
  const nm = (p: Pitch) => pretty(F(p).replace(/\d$/, ""));
  const f = frag("treble", [{ events: fig.map((p, i) => note(p, "semiquaver", { beam: i === 0 ? "begin" : i === fig.length - 1 ? "end" : "continue" })) }], "A figure.", { key: keyText, showKeySignature: true });
  const others = signs.filter((x) => x !== sign);
  return {
    prompt: `A composer has written out an ornament on the note ${nm(main)} as these notes: ${fig.map(nm).join(", ")}. Which sign could replace the written-out notes?`,
    music: f,
    answer: choiceAnswer(shuffled(c, signs.map((x) => [x, cap(x.replace("-", " "))] as [string, string])), sign, Object.fromEntries(others.map((x) => [x, [x.includes("mordent") && sign.includes("mordent") ? "upper-lower-mordent-swap" : sign === "turn" || x === "turn" ? "turn-inverted" : "trill-mordent-confusion", `The figure is ${fig.length} notes around ${nm(main)}: ${sign.includes("mordent") ? "the extra note is " + (sign === "upper-mordent" ? "above" : "below") : sign === "turn" ? "above, then below" : "an alternation with the note above"}, which is not ${x.replace("-", " ")}.`]]))),
    hints: ["Find the main note, then see where the extra notes go: above, below, or both, and how often."],
  };
};

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

/** t.g5.voices: the highest and lowest choral voices, and the two unmistakable ranges. */
export const voices5: Gen = (c): any => {
  const mode = c.rng.pick(["highest", "lowest", "range", "range", "range"] as const);
  const opt = (ids: string[]) => ids.map((id) => [id, cap(V.find((v) => v.id === id)!.name)] as [string, string]);
  if (mode === "highest" || mode === "lowest") {
    const right = mode === "highest" ? "soprano" : "bass";
    const ids = ["soprano", "alto", "tenor", "bass"];
    return { prompt: `Which of the four voices of a mixed choir is the ${mode === "highest" ? "highest" : "lowest"}?`, answer: choiceAnswer(shuffled(c, opt(ids)), right, Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, ["wrong-category", `The ${x} is not the ${mode === "highest" ? "highest" : "lowest"} voice: the order, high to low, is soprano, alto, tenor, bass.`]]))), hints: ["High to low: soprano, alto, tenor, bass."] };
  }
  // range: a part wholly in the soprano-only or the bass-only zone
  const sop = c.rng.chance(0.5);
  const clef: Clef = sop ? "treble" : "bass";
  const pool: Pitch[] = sop ? ["E5", "F5", "G5", "A5"].map((p) => music.parsePitch(p)) : ["E2", "F2", "G2", "A2", "B2"].map((p) => music.parsePitch(p));
  const ps = Array.from({ length: 5 }, () => c.rng.pick(pool));
  if (new Set(ps.map(F)).size < 3) return null;
  const f = frag(clef, [{ events: ps.map((p) => note(p, "crotchet")).slice(0, 4) }, { events: [note(ps[4]!, "minim"), { kind: "rest", duration: { value: "minim", dots: 0 } } as Ev], barline: "final" }], "A vocal part.", { showKeySignature: false, timeSignature: "4/4" });
  const ids = ["soprano", "alto", "tenor", "bass"];
  const right = sop ? "soprano" : "bass";
  return {
    prompt: `A choral part lies entirely ${sop ? "above the top note an alto can sing comfortably (D5)" : "below the lowest note a tenor can sing comfortably (C3)"}. Which voice is it written for?`,
    music: f,
    answer: choiceAnswer(shuffled(c, opt(ids)), right, Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, ["wrong-category", `This part is too ${sop ? "high" : "low"} for a ${x}: it lies ${sop ? "above" : "below"} the range of the ${x}.`]]))),
    hints: ["The soprano is the highest choral voice and the bass the lowest."],
  };
};

/** t.g5.voice-groups: the four choral voices as a group, and the voices that lie between them. */
export const voiceGroups5: Gen = (c): any => {
  const mode = c.rng.pick(["between", "satb", "order", "not-choral"] as const);
  const opt = (ids: string[]) => ids.map((id) => [id, cap(V.find((v) => v.id === id)!.name)] as [string, string]);
  if (mode === "between") {
    const pair = c.rng.pick([["soprano", "alto", "mezzo-soprano"], ["tenor", "bass", "baritone"]] as const);
    const ids = ["mezzo-soprano", "baritone", "alto", "tenor", "soprano", "bass"].filter((x) => x !== pair[0] && x !== pair[1] && x !== pair[2]);
    const opts = [pair[2], ...shuffled(c, ids).slice(0, 3)];
    return { prompt: `Singers, especially solo singers, are also classed in intermediate ranges. Which voice lies between the ${pair[0]} and the ${pair[1]}?`, answer: choiceAnswer(shuffled(c, opt(opts)), pair[2], Object.fromEntries(opts.filter((x) => x !== pair[2]).map((x) => [x, ["wrong-category", `The ${pair[2]} is the voice between the ${pair[0]} and the ${pair[1]}.`]]))), hints: ["Mezzo-soprano sits between soprano and alto; baritone between tenor and bass."] };
  }
  if (mode === "satb" || mode === "not-choral") {
    const wrong = c.rng.pick(["mezzo-soprano", "baritone"]);
    const ids = ["soprano", "alto", "tenor", "bass"];
    const opts = [...shuffled(c, ids).slice(0, 3), wrong];
    return { prompt: "Choral music is usually written for four voices: SATB. Which of these voices is NOT one of the four?", answer: choiceAnswer(shuffled(c, opt(opts)), wrong, Object.fromEntries(opts.filter((x) => x !== wrong).map((x) => [x, ["wrong-category", `The ${x} is one of the four choral voices: soprano, alto, tenor and bass.`]]))), hints: ["S, A, T and B are the four choral voices."] };
  }
  const lists: Array<[string, string]> = [["a", "Soprano, mezzo-soprano, alto, tenor, baritone, bass"], ["b", "Soprano, alto, mezzo-soprano, tenor, baritone, bass"], ["c", "Soprano, mezzo-soprano, alto, baritone, tenor, bass"], ["d", "Bass, baritone, tenor, alto, mezzo-soprano, soprano"]];
  return { prompt: "Which list gives all six voices in order, from the highest to the lowest?", answer: choiceAnswer(shuffled(c, lists), "a", { b: ["wrong-category", "The mezzo-soprano lies between the soprano and the alto, not below the alto."], c: ["wrong-category", "The baritone lies between the tenor and the bass, so it comes after the tenor."], d: ["wrong-category", "That list runs from the lowest voice to the highest."] }), hints: ["High to low: soprano, mezzo-soprano, alto, tenor, baritone, bass."] };
};

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

const SOUND_LABEL: Record<string, string> = { "single reed": "a single reed", "double reed": "a double reed", "air across an edge": "air blown across an edge (no reed)", "lips buzzing into a mouthpiece": "lips buzzing into a mouthpiece", "plucked strings": "plucked strings", struck: "being struck", "bowed or plucked strings": "bowed or plucked strings", "keyboard mechanism": "a keyboard mechanism" };

/** t.g5.instrument-sound: how the sound is made (reeds, edges, buzzing lips ...). */
export const instrumentSound5: Gen = (c): any => {
  const inst = c.rng.pick(INST.filter((i) => ["single reed", "double reed", "air across an edge"].includes(i.sound) || (i.family === "brass" || i.id === "harp")));
  const ids = ["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece", "plucked strings"];
  return {
    prompt: `How is the sound of the ${inst.name} made?`,
    answer: choiceAnswer(shuffled(c, ids.map((x) => [x, cap(SOUND_LABEL[x]!)] as [string, string])), inst.sound, Object.fromEntries(ids.filter((x) => x !== inst.sound).map((x) => [x, ["wrong-category", `The ${inst.name} does not use ${SOUND_LABEL[x]}: it uses ${SOUND_LABEL[inst.sound] ?? inst.sound}.`]]))),
    hints: ["Think of what touches the player's lips: a reed (one or two), an edge, or a metal mouthpiece."],
  };
};

/** t.g5.instruments: the relatives of the Grade 4 woodwinds (piccolo, cor anglais, bass clarinet, double bassoon). */
export const instruments5: Gen = (c): any => instrumentsMode(c, c.rng.pick(["version", "version", "register"] as const));
/** t.g5.instruments-more: trombones, the harp, percussion, the tenor clef, non-orchestral instruments and the organ. */
export const instrumentsMore5: Gen = (c): any => instrumentsMode(c, c.rng.pick(["trombones", "harp", "perc", "non-orch", "tenor-clef", "organ"] as const));
function instrumentsMode(c: Ctx, mode: "version" | "register" | "trombones" | "harp" | "perc" | "non-orch" | "tenor-clef" | "organ"): any {
  const opts = (xs: Array<[string, string]>) => shuffled(c, xs);
  if (mode === "version") {
    const v = c.rng.pick(INST.filter((i) => i.version));
    const of = INST.find((i) => i.id === v.version!.of)!;
    const pool = ["flute", "oboe", "clarinet", "bassoon"].filter((x) => x !== of.id);
    const ids = [of.id, ...shuffled(c, pool).slice(0, 3)];
    return { prompt: `The ${v.name} is a ${v.version!.register === "higher" ? "smaller, higher" : "deeper, lower"} version of which instrument?`, answer: choiceAnswer(opts(ids.map((x) => [x, x] as [string, string])), of.id, Object.fromEntries(ids.filter((x) => x !== of.id).map((x) => [x, ["wrong-category", `The ${v.name} is a version of the ${of.name}, not of the ${x}.`]]))), hints: ["Piccolo: flute. Cor anglais: oboe. Bass clarinet: clarinet. Double bassoon: bassoon."] };
  }
  if (mode === "register") {
    const v = c.rng.pick(INST.filter((i) => i.version));
    const of = INST.find((i) => i.id === v.version!.of)!;
    const pool = INST.filter((i) => i.version && i.id !== v.id).map((i) => i.id);
    const ids = [v.id, ...shuffled(c, pool).slice(0, 3)];
    return { prompt: `Which of these is the ${v.version!.register === "higher" ? "higher" : "deeper"}-sounding version of the ${of.name}?`, answer: choiceAnswer(opts(ids.map((x) => [x, INST.find((i) => i.id === x)!.name] as [string, string])), v.id, Object.fromEntries(ids.filter((x) => x !== v.id).map((x) => [x, ["wrong-category", `The ${INST.find((i) => i.id === x)!.name} is a version of a different instrument.`]]))), hints: ["Each of these instruments is a bigger or smaller relative of one of the Grade 4 woodwinds."] };
  }
  if (mode === "trombones") {
    const o: Array<[string, string]> = [["2t1b", "Two tenor trombones and one bass trombone"], ["3t", "Three tenor trombones"], ["1t2b", "One tenor trombone and two bass trombones"], ["2b", "Two bass trombones only"]];
    return { prompt: "A full orchestra normally has how many trombones of each kind?", answer: choiceAnswer(opts(o), "2t1b", { "3t": ["wrong-category", "One of the three is the bass (tenor-bass) trombone."], "1t2b": ["wrong-category", "There are two tenor trombones and one bass."], "2b": ["wrong-category", "The usual section is two tenor and one bass trombone."] }), hints: ["Two tenor, one bass."] };
  }
  if (mode === "harp") {
    const o: Array<[string, string]> = [["no", "No: it is a string instrument, but not a member of the string section of the orchestra"], ["yes", "Yes: it is one of the string section, with the violins and cellos"], ["perc", "No: it belongs to the percussion section"], ["wind", "No: it belongs to the woodwind section"]];
    return { prompt: "Is the harp a member of the string section of the orchestra?", answer: choiceAnswer(opts(o), "no", { yes: ["wrong-category", "The harp is a string instrument, but the string section means the bowed strings."], perc: ["wrong-category", "The harp is plucked, but it is a string instrument."], wind: ["wrong-category", "The harp has strings, not a reed or mouthpiece."] }), hints: ["The harp has been used in the orchestra since the Romantic period, but is not counted in the string section."] };
  }
  if (mode === "perc") {
    const definite = INST.filter((i) => i.pitch === "definite");
    const indefinite = INST.filter((i) => i.pitch === "indefinite");
    const wantDef = c.rng.chance(0.5);
    const right = c.rng.pick(wantDef ? definite : indefinite);
    const wrongs = shuffled(c, wantDef ? indefinite : definite).slice(0, 3);
    return { prompt: `Which of these percussion instruments plays notes of ${wantDef ? "definite" : "indefinite"} pitch?`, answer: choiceAnswer(opts([right, ...wrongs].map((i) => [i.id, i.name] as [string, string])), right.id, Object.fromEntries(wrongs.map((i) => [i.id, ["wrong-category", `The ${i.name} has ${wantDef ? "no definite pitch" : "definite pitches"}.`]]))), hints: ["Triangle, tambourine, castanets and tam-tam have no definite pitch; xylophone, marimba, glockenspiel, vibraphone, celesta and tubular bells do."] };
  }
  if (mode === "non-orch") {
    const non = INST.filter((i) => i.family === "non-orchestral");
    const right = c.rng.pick(non);
    const wrongs = shuffled(c, INST.filter((i) => ["oboe", "cello", "bassoon", "flute", "viola"].includes(i.id))).slice(0, 3);
    return { prompt: "Which of these is NOT a regular member of the standard orchestra?", answer: choiceAnswer(opts([right, ...wrongs].map((i) => [i.id, i.name] as [string, string])), right.id, Object.fromEntries(wrongs.map((i) => [i.id, ["wrong-category", `The ${i.name} is a regular member of the orchestra.`]]))), hints: ["Guitar, saxophone, recorder, harpsichord, clavichord and organ are not regular members."] };
  }
  if (mode === "tenor-clef") {
    const right = c.rng.pick(["cello", "bassoon", "trombone-tenor"]);
    const wrongs = ["viola", "double-bassoon", "bass-trombone", "flute"];
    const ids = [right, ...shuffled(c, wrongs).slice(0, 3)];
    const nm = (id: string) => INST.find((i) => i.id === id)!.name;
    return { prompt: "Which of these instruments reads the tenor clef for its higher notes?", answer: choiceAnswer(opts(ids.map((x) => [x, nm(x)] as [string, string])), right, Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, ["wrong-category", `The ${nm(x)} normally reads the ${x === "viola" ? "alto" : x === "flute" ? "treble" : "bass"} clef.`]]))), hints: ["Cello, bassoon and tenor trombone use the tenor clef."] };
  }
  const o: Array<[string, string]> = [["3", "Three"], ["2", "Two"], ["1", "One"], ["4", "Four"]];
  return { prompt: "Organ music is normally written on how many staves? (One of them is for the pedal-board.)", answer: choiceAnswer(opts(o), "3", { "2": ["wrong-category", "Two staves are for the hands; the pedals have a third stave of their own."], "1": ["wrong-category", "The hands and the feet each need their own stave."], "4": ["wrong-category", "Three: right hand, left hand and the pedal-board."] }), hints: ["Hands on two staves, feet on a third."] }
};

/** t.g5.instrument-which: from a way of making sound to the instrument. */
export const instrumentWhich5: Gen = (c): any => {
  const kinds = ["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece"] as const;
  const kind = c.rng.pick(kinds);
  const pool = INST.filter((i) => i.sound === kind && i.family !== "non-orchestral");
  const right = c.rng.pick(pool);
  const wrongs = shuffled(c, INST.filter((i) => i.sound !== kind && i.family !== "percussion" && i.family !== "non-orchestral")).filter((i, k, a) => a.findIndex((x) => x.sound === i.sound) === k || true).slice(0, 3);
  if (wrongs.length < 3) return null;
  const label = SOUND_LABEL[kind]!;
  return {
    prompt: `Which of these instruments makes its sound with ${label}?`,
    answer: choiceAnswer(shuffled(c, [right, ...wrongs].map((i) => [i.id, i.name] as [string, string])), right.id, Object.fromEntries(wrongs.map((i) => [i.id, ["wrong-category", `The ${i.name} uses ${SOUND_LABEL[i.sound] ?? i.sound}.`]]))),
    hints: ["Think of what the player's mouth touches: one reed, two reeds, an edge, or a metal mouthpiece."],
  };
};

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

const termGroupSize = (g: string) => T.filter((t) => t.group === g).length;
function options5(c: Ctx, target: music.TermG5, n = 3): music.TermG5[] {
  // wrong options come from other groups (never a synonym), preferably the same language
  const pool = T.filter((t) => t.group !== target.group && t.meaning !== target.meaning);
  const same = shuffled(c, pool.filter((t) => t.language === target.language));
  const rest = shuffled(c, pool.filter((t) => t.language !== target.language));
  const out: music.TermG5[] = [];
  for (const t of [...same, ...rest]) if (!out.some((o) => o.group === t.group)) out.push(t);
  return out.slice(0, n);
}
const LANG_NOTE: Record<string, string> = { italian: "an Italian term", german: "a German term", french: "a French term", direction: "a direction" };

/** t.g5.terms: what a Grade 5 term (Italian, German, or a pedal or hand direction) means. Grade 4 terms are never asked. */
export const terms5: Gen = (c): any => {
  const target = c.rng.pick(T.filter((t) => termGroupSize(t.group) === 1 || t.language !== "german"));
  const wrongs = options5(c, target);
  if (wrongs.length < 3) return null;
  return {
    prompt: `${cap(LANG_NOTE[target.language]!)}: what does “${target.term}” mean?`,
    answer: choiceAnswer(shuffled(c, [target, ...wrongs].map((t) => [t.id, cap(t.meaning)] as [string, string])), target.id, Object.fromEntries(wrongs.map((t) => [t.id, ["confused-similar-term", `That is the meaning of “${t.term}”.`]]))),
    hints: ["Look for a word you know in another language, or think about the mood or direction it describes."],
  };
};

const ADV: Array<[string, string, music.TermG5["id"]]> = [["sehr", "very", "sehr"], ["etwas", "somewhat", "etwas"], ["wenig", "a little", "wenig"], ["immer", "always", "immer"], ["wieder", "again", "wieder"], ["aber", "but", "aber"]];
const ADJ: Array<[string, string]> = [["langsam", "slow"], ["schnell", "fast"], ["lebhaft", "lively"], ["ruhig", "peaceful"], ["bewegt", "with movement"], ["zart", "tender"], ["breit", "broad"], ["traurig", "sad"]];

/** t.g5.term-use: applied terminology: a German direction in a passage heading, the term for a stated instruction, a pedal or hand direction. */
export const termUse5: Gen = (c): any => {
  const mode = c.rng.pick(["german-phrase", "instruction", "pedal", "heading"] as const);
  if (mode === "german-phrase") {
    const [adv, advEn] = c.rng.pick(ADV);
    const [adj, adjEn] = c.rng.pick(ADJ);
    const german = adv === "wieder" ? `${adj} ${adv}` : `${adv} ${adj}`;
    const right = adv === "wieder" ? `${adjEn} again` : adv === "aber" ? `but ${adjEn}` : `${advEn} ${adjEn}`;
    const mk = (a: string, b: string) => (a === "wieder" ? `${b} again` : a === "aber" ? `but ${b}` : `${a} ${b}`);
    const wrong = [mk(advEn, ADJ.find(([x]) => x !== adj && x === "schnell" && adj !== "schnell")?.[1] ?? "fast"), mk(ADV.find(([x]) => x !== adv)![1], adjEn), `not ${adjEn}`];
    const opts = [...new Set([right, ...wrong])].filter((x) => x !== right || true);
    if (new Set(opts).size < 4) return null;
    return {
      prompt: `A German direction at the start of a piece reads “${german}”. What does it ask for?`,
      music: frag("treble", [{ events: [note("C5", "semibreve")], barline: "final" }], "A bar.", { showKeySignature: false, timeSignature: "4/4", tempoText: cap(german) }),
      answer: choiceAnswer(shuffled(c, opts.map((x) => [x, cap(x)] as [string, string])), right, Object.fromEntries(opts.filter((x) => x !== right).map((x) => [x, ["confused-similar-term", `“${german}” means “${right}”: look at each word.`]]))),
      hints: ["Translate the two words one at a time."],
    };
  }
  if (mode === "pedal") {
    const all = ["una-corda", "tre-corde", "ped-sign", "spread-chord", "mano-sinistra", "mano-destra"].map((id) => T.find((t) => t.id === id)!);
    const t = c.rng.pick(all);
    const picks = [t, ...shuffled(c, all.filter((x) => x.id !== t.id)).slice(0, 3)];
    return {
      prompt: `A pianist reads the direction “${t.term}”. What should be done?`,
      answer: choiceAnswer(shuffled(c, picks.map((x) => [x.id, cap(x.meaning)] as [string, string])), t.id, Object.fromEntries(picks.filter((x) => x.id !== t.id).map((x) => [x.id, ["confused-similar-term", `That is the meaning of “${x.term}”.`]]))),
      hints: ["Una corda and tre corde concern the left pedal and Ped. the right pedal; mano sinistra and mano destra name the hands; a wavy line before a chord spreads it."],
    };
  }
  // instruction: from meaning to term, one term per synonym group so one answer is right
  const target = c.rng.pick(T.filter((t) => t.language !== "german" && termGroupSize(t.group) === 1 && !["pochettino", "misura", "lunga"].includes(t.id)));
  const wrongs = options5(c, target);
  if (wrongs.length < 3) return null;
  const heading = mode === "heading";
  return {
    prompt: heading ? `A composer wants the player to ${target.meaning}. Which direction would be printed?` : `Which direction asks the player to do this: ${target.meaning}?`,
    answer: choiceAnswer(shuffled(c, [target, ...wrongs].map((t) => [t.id, t.term] as [string, string])), target.id, Object.fromEntries(wrongs.map((t) => [t.id, ["confused-similar-term", `“${t.term}” means “${t.meaning}”.`]]))),
    hints: ["Think about which of the four terms has exactly that meaning."],
  };
};

// ---------------------------------------------------------------------------
// Score reading: key, clef, metre, harmony, cadence, instrument, ornament and markings in one short passage
// ---------------------------------------------------------------------------

const MELODY_INST: Record<string, Array<{ id: string; name: string }>> = {
  treble: [{ id: "flute", name: "flute" }, { id: "oboe", name: "oboe" }, { id: "cor-anglais", name: "cor anglais" }, { id: "recorder", name: "recorder" }, { id: "piccolo", name: "piccolo" }],
  tenor: [{ id: "cello", name: "cello" }, { id: "bassoon", name: "bassoon" }, { id: "trombone-tenor", name: "tenor trombone" }],
  alto: [{ id: "viola", name: "viola" }],
};

/** t.g5.score: a short original passage (melody over chords) and several connected questions about it. */
export const score5: Gen = (c): any => {
  const keyText = c.rng.pick(CAD_KEYS(c));
  const key = parseKey(keyText);
  const type = c.rng.pick(CAD_TYPES(c));
  const chords = cadencePhrase(c, key, type);
  if (!chords || classifyCadence(chords[2]!.roman, chords[3]!.roman) !== type) return null;
  const clefs = (c.scope.clefs?.length ? c.scope.clefs : ["treble", "tenor", "alto"]).filter((x) => x === "treble" || x === "tenor" || x === "alto") as Clef[];
  const clef = c.rng.pick(clefs);
  const inst = c.rng.pick(MELODY_INST[clef]!);
  // lower stave: one chord (three notes) in the bass clef per bar
  const placed: Array<{ spec: ChordSpec; notes: Pitch[] }> = [];
  for (const spec of chords) {
    const cands: Pitch[][] = [];
    for (const bo of [2, 3]) for (const v of voicings(key, spec.roman, spec.inv, bo, { lo: { step: "C", alter: 0, octave: 3 }, hi: { step: "C", alter: 0, octave: 4 } })) {
      const all = [v.bass, ...v.upper];
      if (all.length === 3 && fitsIn("bass", all, 1)) cands.push(all);
    }
    if (!cands.length) return null;
    const pick = c.rng.pick(cands);
    const id = identifyTriad(key, pick);
    if (!id || romanDegree(id.roman) !== romanDegree(spec.roman) || id.inversion !== spec.inv) return null;
    placed.push({ spec, notes: pick });
  }
  // melody: four crotchets a bar, the first a chord note, the rest by step in the scale
  const pcs = music.scale(key, "major").slice(0, 7);
  const base = clef === "treble" ? 5 : 4;
  const mel: Pitch[] = [];
  let d = diatonicNumber({ ...key.tonic, octave: base });
  for (const p of placed) {
    const tones = music.triad(key, p.spec.roman);
    let best: Pitch | null = null;
    for (const pc of tones) for (const o of [base - 1, base, base + 1]) {
      const cand: Pitch = { ...pc, octave: o };
      if (!best || Math.abs(diatonicNumber(cand) - d) < Math.abs(diatonicNumber(best) - d)) best = cand;
    }
    d = diatonicNumber(best!);
    mel.push(best!);
    for (let i = 0; i < 3; i++) {
      d += c.rng.pick([-1, 1, 1, -1, 0].filter((x) => x !== 0 || i === 2) as number[]);
      const pc = pcs.find((x) => music.stepIndex(x.step) === ((d % 7) + 7) % 7)!; // d counts letters from C, so the scale is looked up by letter, not by degree
      mel.push({ ...pc, octave: Math.floor(d / 7) } as Pitch);
    }
  }
  if (!fitsIn(clef, mel, 1)) return null;
  // marks: the interval notes x and y (a bar's first and third notes), the ornament B (a bar's second or fourth note), chord A
  const wanted = c.rng.shuffle(["key", "chord", "ornament", "term", "interval"]).slice(0, 2);
  const withOrn = wanted.includes("ornament");
  const withInt = wanted.includes("interval");
  const ornBar = c.rng.int(0, 1);
  const ornIdx = ornBar * 4 + c.rng.pick([1, 3]);
  const ints = [c.rng.int(0, 3) * 4];
  const intX = ints[0]!;
  const intY = intX + 2;
  if (withOrn && withInt && (ornIdx === intX || ornIdx === intY)) return null;
  const sign = c.rng.pick(ornamentsIn(c).filter((s) => ["trill", "turn", "upper-mordent", "lower-mordent"].includes(s)));
  const term = c.rng.pick(T.filter((t) => t.language !== "direction" && termGroupSize(t.group) === 1 && !["pochettino", "misura", "lunga", "loco"].includes(t.id) && t.id !== "ossia"));
  const chordBar = c.rng.int(0, 3);
  const events: Ev[] = mel.map((p, i) => note(p, "crotchet", { ...(withOrn && i === ornIdx ? { ornament: sign, label: "B" } : {}), ...(withInt && i === intX ? { label: "x" } : {}), ...(withInt && i === intY ? { label: "y" } : {}) }));
  const upperBars: Measure[] = [0, 1, 2, 3].map((b) => ({ events: events.slice(b * 4, b * 4 + 4), ...(b === 3 ? { barline: "final" as const } : {}) }));
  const lowerBars: Measure[] = placed.map((p, b) => ({ events: [{ kind: "chord", notes: p.notes.map((x) => ({ pitch: F(x) })), duration: { value: "semibreve", dots: 0 }, ...(wanted.includes("chord") && b === chordBar ? { label: "A" } : {}) } as Ev], ...(b === 3 ? { barline: "final" as const } : {}) }));
  const common = { key: keyText, showKeySignature: true, timeSignature: "4/4" } as const;
  const showTerm = wanted.includes("term");
  const score = {
    staves: [
      { id: "melody", label: cap(inst.name), instrument: inst.id, music: frag(clef, upperBars, "x", { ...common, ...(showTerm ? { tempoText: cap(term.term) } : {}) } as never) },
      { id: "chords", label: "Piano (left hand)", music: frag("bass", lowerBars, "x", common as never) },
    ],
    textAlternative: `A short piece for ${inst.name} and piano, four bars of 4/4.`,
  };
  // ---- the questions
  const parts: Array<{ id: string; prompt: string; answer: any }> = [];
  const instInfo = INST.find((i) => i.id === inst.id)!;
  const instQs: Array<() => any> = [];
  instQs.push(() => ({ id: "clef", prompt: `In which clef is the ${inst.name} part written?`, answer: choiceAnswer(["treble", "alto", "tenor", "bass"].map((x) => [x, `The ${x} clef`] as [string, string]), clef, Object.fromEntries(["treble", "alto", "tenor", "bass"].filter((x) => x !== clef).map((x) => [x, ["clef-confusion", `Find middle C: in this clef it is on ${clef === "tenor" ? "the fourth line" : clef === "alto" ? "the middle line" : "the first ledger line below the stave"}.`]])) as any) }));
  if (inst.id === "cor-anglais") instQs.push(() => ({ id: "sounds", prompt: "The cor anglais is an instrument in F. Its notes sound…", answer: choiceAnswer([["p5", "a perfect 5th lower than written"], ["m3", "a minor 3rd lower than written"], ["m2", "a tone lower than written"], ["same", "exactly as written"]], "p5", { m3: ["wrong-interval", "A minor 3rd is for instruments in A."], m2: ["wrong-interval", "A tone is for instruments in B♭."], same: ["wrong-interval", "The cor anglais is a transposing instrument: it does not sound as written."] } as any) }));
  if (["single reed", "double reed", "air across an edge"].includes(instInfo.sound)) instQs.push(() => ({ id: "sound", prompt: `How is the sound of the ${inst.name} made?`, answer: choiceAnswer(["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece"].map((x) => [x, cap(SOUND_LABEL[x]!)] as [string, string]), instInfo.sound, Object.fromEntries(["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece"].filter((x) => x !== instInfo.sound).map((x) => [x, ["wrong-category", `The ${inst.name} uses ${SOUND_LABEL[instInfo.sound]}.`]])) as any) }));
  if (instInfo.family === "brass" || instInfo.family === "strings") instQs.push(() => ({ id: "family", prompt: `To which family of the orchestra does the ${inst.name} belong?`, answer: choiceAnswer(["strings", "woodwind", "brass", "percussion"].map((x) => [x, cap(x)] as [string, string]), instInfo.family, Object.fromEntries(["strings", "woodwind", "brass", "percussion"].filter((x) => x !== instInfo.family).map((x) => [x, ["wrong-category", `The ${inst.name} belongs to the ${instInfo.family} family.`]])) as any) }));
  parts.push(c.rng.pick(instQs)());
  const cadId = `${chords[2]!.roman}–${chords[3]!.roman}`;
  parts.push({ id: "cadence", prompt: `What cadence do the last two chords (bars 3 and 4, the piano part) make? (They are ${cadId}.)`.replace(/ \(They are .*\)\./, ""), answer: choiceAnswer(CAD_TYPES(c).map((x) => [x, cap(x)] as [string, string]), type, Object.fromEntries(CAD_TYPES(c).filter((x) => x !== type).map((x) => [x, ["cadence-misnamed", "Name the last two chords first: V–I perfect, IV–I plagal, ending on V imperfect."]])) as any) });
  for (const w of wanted) {
    if (w === "key") {
      const rel = music.formatKey(music.relativeKey(key));
      const dom = music.formatKey({ tonic: music.transpose({ ...key.tonic, octave: 4 }, music.parseInterval("P5"), "up") as never, mode: "major" } as never);
      const sub = music.formatKey({ tonic: music.transpose({ ...key.tonic, octave: 4 }, music.parseInterval("P4"), "up") as never, mode: "major" } as never);
      const ids = [...new Set([keyText, rel, dom, sub])];
      parts.push({ id: "key", prompt: "What is the key of the piece?", answer: choiceAnswer(shuffled(c, ids.map((x) => [x, keyWords(x)] as [string, string])), keyText, Object.fromEntries(ids.filter((x) => x !== keyText).map((x) => [x, ["wrong-category", x === rel ? "The relative minor shares the key signature, but the piece begins and ends on the major tonic chord." : `${keyWords(x)} has a different key signature.`]])) as any) });
    } else if (w === "chord") {
      const p = placed[chordBar]!;
      parts.push({ id: "chord", prompt: "Name the chord marked A in the piano part (Roman numeral and position).", answer: { kind: "chord", task: "identify", key: keyText, pitches: p.notes.map(F), acceptedChords: [{ roman: p.spec.roman, inversion: p.spec.inv }] } });
    } else if (w === "ornament") parts.push({ id: "ornament", prompt: `What is the ornament on the note marked B? (It is shown by its sign.)`.replace(" (It is shown by its sign.)", ""), answer: { kind: "ornament-sign", task: "name-sign", sign, accepted: [sign] } });
    else if (w === "term") {
      const wr = options5(c, term);
      if (wr.length < 3) return null;
      parts.push({ id: "term", prompt: `The piece is marked “${term.term}”. What does it ask?`, answer: choiceAnswer(shuffled(c, [term, ...wr].map((t) => [t.id, cap(t.meaning)] as [string, string])), term.id, Object.fromEntries(wr.map((t) => [t.id, ["confused-similar-term", `That is the meaning of “${t.term}”.`]])) as any) });
    } else if (w === "interval") {
      const [x, y] = [mel[intX]!, mel[intY]!];
      const [lo, hi] = diatonicNumber(x) <= diatonicNumber(y) ? [x, y] : [y, x];
      const iv = intervalBetween(lo, hi);
      if (iv.number < 2 || iv.number > 8 || !"dmMPA".includes(iv.quality)) return null;
      parts.push({ id: "interval", prompt: "Name the interval from the lower to the higher of the notes marked x and y (quality and number).", answer: { kind: "interval", task: "identify", key: keyText, lower: F(lo), upper: F(hi), acceptedIntervals: [`${iv.quality}${iv.number}`] } });
    }
  }
  if (parts.length < 4) return null;
  void pretty; void diag; void melodyIn5;
  void CAD_PAIRS;
  return {
    prompt: `Look at this short piece for ${inst.name} and piano and answer the questions.`,
    score,
    answer: { kind: "composite", parts },
    hints: ["Take the questions one at a time. Use the clef and key signature, the printed direction, the marks on the notes and the chords in the piano part."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.score-melody: a one-stave melody for a named (possibly transposing) instrument
// ---------------------------------------------------------------------------

const SOLO: Array<{ id: string; name: string; clef: "treble" | "tenor" | "alto"; transposes?: music.InstrumentKey }> = [
  { id: "flute", name: "flute", clef: "treble" }, { id: "oboe", name: "oboe", clef: "treble" }, { id: "recorder", name: "recorder", clef: "treble" },
  { id: "clarinet", name: "clarinet in B♭", clef: "treble", transposes: "Bb" }, { id: "clarinet", name: "clarinet in A", clef: "treble", transposes: "A" },
  { id: "trumpet", name: "trumpet in B♭", clef: "treble", transposes: "Bb" }, { id: "horn", name: "horn in F", clef: "treble", transposes: "F" },
  { id: "cor-anglais", name: "cor anglais (in F)", clef: "treble", transposes: "F" },
  { id: "cello", name: "cello", clef: "tenor" }, { id: "bassoon", name: "bassoon", clef: "tenor" }, { id: "trombone-tenor", name: "tenor trombone", clef: "tenor" }, { id: "viola", name: "viola", clef: "alto" },
];
export const scoreMelody5: Gen = (c): any => {
  const inst = c.rng.pick(SOLO);
  const clef = inst.clef;
  const keyText = c.rng.pick(keysIn(c).filter((k) => Math.abs(music.keyFifths(parseKey(k))) <= 4));
  const key = parseKey(keyText);
  const mel = melodyIn5(c, key, clef, 6, 1);
  if (!mel) return null;
  const wanted = c.rng.shuffle(["key", "term", "ornament", "interval"]).slice(0, 3);
  const withOrn = wanted.includes("ornament");
  const withInt = wanted.includes("interval");
  const ornAt = c.rng.pick([1, 4]);
  const sign = c.rng.pick(ornamentsIn(c).filter((s) => ["trill", "turn", "upper-mordent", "lower-mordent"].includes(s)));
  const term = c.rng.pick(T.filter((t) => t.language !== "direction" && termGroupSize(t.group) === 1 && !["pochettino", "misura", "lunga", "loco", "ossia"].includes(t.id)));
  const labels: Record<number, string> = {};
  const events: Ev[] = mel.map((p, i) => note(p, "crotchet", { ...(withOrn && i === ornAt ? { ornament: sign, label: "B" } : {}), ...(withInt && i === 0 ? { label: "x" } : {}), ...(withInt && i === 3 ? { label: "y" } : {}) }));
  void labels;
  const f = frag(clef, [{ events: events.slice(0, 3) }, { events: events.slice(3), barline: "final" }], "A melody.", { key: keyText, showKeySignature: true, timeSignature: "3/4", ...(wanted.includes("term") ? { tempoText: cap(term.term) } : {}) });
  const parts: Array<{ id: string; prompt: string; answer: any }> = [];
  const info = INST.find((i) => i.id === inst.id);
  const instQs: Array<() => any> = [() => ({ id: "clef", prompt: `In which clef is this ${inst.name} part written?`, answer: choiceAnswer(["treble", "alto", "tenor", "bass"].map((x) => [x, `The ${x} clef`] as [string, string]), clef, Object.fromEntries(["treble", "alto", "tenor", "bass"].filter((x) => x !== clef).map((x) => [x, ["clef-confusion", "Find middle C in the printed clef before you decide."]])) as any) })];
  if (inst.transposes) { const tr = inst.transposes; instQs.push(() => ({ id: "sounds", prompt: `The ${inst.name} is a transposing instrument. How far from the written notes does it sound?`, answer: choiceAnswer([["Bb", "A tone lower than written"], ["A", "A minor 3rd lower than written"], ["F", "A perfect 5th lower than written"], ["none", "Exactly as written"]], tr, Object.fromEntries([["Bb", "A tone lower than written"], ["A", "A minor 3rd lower than written"], ["F", "A perfect 5th lower than written"], ["none", "Exactly as written"]].filter(([id]) => id !== tr).map(([id]) => [id, ["wrong-interval", "B♭ instruments sound a tone lower, A instruments a minor 3rd lower and F instruments a perfect 5th lower than written."]])) as any) })); }
  if (info && ["single reed", "double reed", "air across an edge"].includes(info.sound)) { const sd = info.sound; const nme = info.name; instQs.push(() => ({ id: "sound", prompt: `How is the sound of the ${nme} made?`, answer: choiceAnswer(["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece"].map((x) => [x, cap(SOUND_LABEL[x]!)] as [string, string]), sd, Object.fromEntries(["single reed", "double reed", "air across an edge", "lips buzzing into a mouthpiece"].filter((x) => x !== sd).map((x) => [x, ["wrong-category", `The ${nme} uses ${SOUND_LABEL[sd]}.`]])) as any) })); }
  parts.push(c.rng.pick(instQs)());
  for (const w of wanted) {
    if (w === "key") {
      const cons = inst.transposes ? (() => { try { return music.concertKeyFor(key, inst.transposes!); } catch { return null; } })() : key;
      if (!cons) return null;
      const target = music.formatKey(cons);
      const dom = music.formatKey({ tonic: music.transpose({ ...key.tonic, octave: 4 }, music.parseInterval("P5"), "up") as never, mode: key.mode } as never);
      const other = inst.transposes ? music.formatKey(music.writtenKeyFor(key, inst.transposes)) : music.formatKey(music.relativeKey(key));
      const ids = [...new Set([target, keyText, other, dom])];
      if (ids.length < 3) return null;
      parts.push({ id: "key", prompt: inst.transposes ? `This is the written part for the ${inst.name}. In which key does the music sound (concert pitch)?` : "What is the key of the melody?", answer: choiceAnswer(shuffled(c, ids.map((x) => [x, keyWords(x)] as [string, string])), target, Object.fromEntries(ids.filter((x) => x !== target).map((x) => [x, [x === keyText && inst.transposes ? "key-signature-missing" : "wrong-category", x === keyText && inst.transposes ? "That is the key written in the part. The instrument sounds lower than written, so the music sounds in a different key." : `${keyWords(x)} has a different key signature or lies the wrong way from the written key.`]])) as any) });
    } else if (w === "ornament") parts.push({ id: "ornament", prompt: "What is the ornament on the note marked B?", answer: { kind: "ornament-sign", task: "name-sign", sign, accepted: [sign] } });
    else if (w === "term") {
      const wr = options5(c, term);
      if (wr.length < 3) return null;
      parts.push({ id: "term", prompt: `The melody is marked “${term.term}”. What does it ask?`, answer: choiceAnswer(shuffled(c, [term, ...wr].map((t) => [t.id, cap(t.meaning)] as [string, string])), term.id, Object.fromEntries(wr.map((t) => [t.id, ["confused-similar-term", `That is the meaning of “${t.term}”.`]])) as any) });
    } else if (w === "interval") {
      const [x, y] = [mel[0]!, mel[3]!];
      const [lo, hi] = diatonicNumber(x) <= diatonicNumber(y) ? [x, y] : [y, x];
      const iv = intervalBetween(lo, hi);
      if (iv.number < 2 || iv.number > 8 || !"dmMPA".includes(iv.quality)) return null;
      parts.push({ id: "interval", prompt: "Name the interval from the lower to the higher of the notes marked x and y (quality and number).", answer: { kind: "interval", task: "identify", key: keyText, lower: F(lo), upper: F(hi), acceptedIntervals: [`${iv.quality}${iv.number}`] } });
    }
  }
  if (parts.length < 4) return null;
  return { prompt: `Look at this melody for the ${inst.name} and answer the questions.`, music: f, answer: { kind: "composite", parts }, hints: ["Take the questions one at a time. Use the clef, the key signature, the printed direction and the marks on the notes."] };
};
