/**
 * Grade 4 ornament, instrument, term and passage generators (Brief 08, Unit 5).
 *
 * Source: First Steps in Music Theory, Grade 4 sections 13 and 15 (pp. 99-100 and 102-103, read in the PDF). Only the NAMES of the six
 * ornaments are examined at Grade 4 (how they are played is Grade 5), so no question asks how an ornament sounds; ornaments and
 * small notes take no time in the bar. The orchestral lists, techniques and terms come from the versioned Grade 4 vocabulary
 * (`music.VOCAB_G4`), never from the Grade 1-3 lists, so a Grade 1-3 fact can never be credited as Grade 4 knowledge. The instrument
 * clefs are "normally used" clefs, as the book words them; transposing instruments are Grade 5 and are never asked.
 */
import { music, type Measure, type NotationEvent } from "@mtp/curriculum";
import { fits, frag, maxLedger, nameOf, note, pretty, type Gen } from "./families.ts";
import type { Diagnoses } from "./grade1.ts";
import { ORD, cap, diag, optsOf, posText } from "./grade2.ts";

type Pitch = music.Pitch;
type Clef = music.Clef;
type Ctx = Parameters<Gen>[0];
const { formatPitch: F, parseKey, staffPosition } = music;
const T = music.TERMS_G4;
const TECH = music.TECHNIQUES_G4;
const INST = music.INSTRUMENTS_G4;
const FAMILIES = ["strings", "woodwind", "brass", "percussion"] as const;
const clefsIn = (c: Ctx): Clef[] => (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];
const keysIn = (c: Ctx) => (c.scope.keys?.length ? c.scope.keys : ["C major"]);
const an = (s: string) => `${/^[aeiou]/.test(s) ? "an" : "a"} ${s}`;

// ---------------------------------------------------------------------------
// Ornaments
// ---------------------------------------------------------------------------

const ORN_TEXT: Record<music.Ornament, string> = {
  trill: "the letters tr above the note (sometimes followed by a wavy line)",
  turn: "a sideways S-shaped curl above the note",
  "upper-mordent": "a short zig-zag above the note, with no line through it",
  "lower-mordent": "a short zig-zag above the note with a short vertical line through it",
  acciaccatura: "a small note before the main note with a diagonal stroke through its stem and flag",
  appoggiatura: "a small note before the main note with no stroke through its stem",
};
const ORN_NAME: Record<music.Ornament, string> = { trill: "trill", turn: "turn", "upper-mordent": "upper mordent", "lower-mordent": "lower mordent", acciaccatura: "acciaccatura", appoggiatura: "appoggiatura" };
const ornamentsIn = (c: Ctx) => (c.scope.ornaments?.length ? c.scope.ornaments : music.ORNAMENTS) as music.Ornament[];
const SWAP: Record<music.Ornament, [music.Ornament, string, string]> = {
  trill: ["upper-mordent", "trill-mordent-confusion", "A trill is written tr. A mordent is a short zig-zag sign with no letters."],
  turn: ["trill", "turn-inverted", "A turn is the sideways S-shaped curl; it is not the letters tr."],
  "upper-mordent": ["lower-mordent", "upper-lower-mordent-swap", "The mordent with a vertical line through the zig-zag is the lower mordent; without the line it is the upper mordent."],
  "lower-mordent": ["upper-mordent", "upper-lower-mordent-swap", "The lower mordent has a vertical line through its zig-zag; the upper mordent does not."],
  acciaccatura: ["appoggiatura", "acciaccatura-appoggiatura-swap", "The acciaccatura (the crushed note) has a diagonal stroke through its stem; the appoggiatura has none."],
  appoggiatura: ["acciaccatura", "acciaccatura-appoggiatura-swap", "The appoggiatura has no stroke through its stem. The stroked small note is the acciaccatura."],
};
const NATURALS = ["C", "D", "E", "F", "G", "A", "B"] as const;
function mark(p: Pitch, orn: music.Ornament, value: music.NoteValue, extra: Record<string, unknown> = {}): NotationEvent {
  if (orn === "acciaccatura" || orn === "appoggiatura") {
    const above = music.pitchFromNumbers(music.diatonicNumber(p) + 1, 0);
    return note(p, value, { grace: { kind: orn, pitches: [F({ ...above, alter: music.signatureAlter({ tonic: { step: "C", alter: 0 }, mode: "major" }, above.step) })] }, ...extra });
  }
  return note(p, value, { ornament: orn, ...extra });
}
const ornDesc = (orn: music.Ornament) => ORN_TEXT[orn];

/** t.g4.ornament-spot: find the note carrying a named ornament in a short melody. */
export const ornamentSpot: Gen = (c): any => {
  const signs = ornamentsIn(c);
  if (signs.length < 3) return null;
  const chosen = c.rng.shuffle(signs).slice(0, 3);
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass" || x === "alto"));
  const max = Math.min(maxLedger(c), 2);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const pcs = music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  for (const oct of c.rng.shuffle([3, 4, 5])) {
    const seq: Pitch[] = [];
    let d = c.rng.int(0, 4);
    for (let i = 0; i < 6; i++) {
      const x = pcs[((d % 7) + 7) % 7]!;
      seq.push({ ...x, octave: oct + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) });
      d += c.rng.pick([-2, -1, 1, 1, 2]);
    }
    if (!fits(clef, seq, max) || seq.some((p) => Math.abs(staffPosition(clef, p) - 4) > 7)) continue;
    const slots = c.rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3).sort((a, b) => a - b);
    const labels = ["A", "B", "C"];
    const events = seq.map((p, i) => {
      const k = slots.indexOf(i);
      return k >= 0 ? mark(p, chosen[k]!, "crotchet", { label: labels[k] }) : note(p, "crotchet");
    });
    const measures: Measure[] = [{ events: events.slice(0, 3) }, { events: events.slice(3), barline: "final" }];
    // the ornament signs are described in words in the text alternative; the question alternative (what a learner without sight is
    // given) names the position of each marked note and its sign, so the question stays answerable.
    const alt = `${cap(an(clef))} clef melody in ${keyText}, 3/4. ${slots.map((i, k) => `Note ${labels[k]} (note ${i + 1}) has ${ornDesc(chosen[k]!)}`).join("; ")}.`;
    const f = frag(clef, measures.map((m) => ({ ...m, events: m.events })).slice(0, 2), alt, { key: keyText, timeSignature: "3/4" });
    const targetIdx = c.rng.int(0, 2);
    const target = chosen[targetIdx]!;
    return {
      prompt: `Three notes in this melody are marked A, B and C. Which note has the ${ORN_NAME[target]}?`,
      music: f,
      answer: { kind: "choice", options: labels.map((l) => ({ id: l, label: `Note ${l}` })), correctOptionIds: [labels[targetIdx]!], diagnoses: Object.fromEntries(labels.filter((_, k) => k !== targetIdx).map((l, _i) => { const k = labels.indexOf(l); const swap = SWAP[target]; return [l, diag(chosen[k] === swap[0] ? swap[1] : "ornament-confused", `Note ${l} carries the ${ORN_NAME[chosen[k]!]}: ${ORN_TEXT[chosen[k]!]}. Look for ${ORN_TEXT[target]}.`)]; })) as Diagnoses },
      hints: [`The ${ORN_NAME[target]} is shown by ${ORN_TEXT[target]}.`],
    };
  }
  return null;
};

/** t.g4.ornament-facts: match each sign to its name from a description, or a name to its description. */
export const ornamentFacts: Gen = (c): any => {
  const signs = ornamentsIn(c);
  if (signs.length < 4) return null;
  const target = c.rng.pick(signs);
  const mode = c.rng.pick(["describe", "describe", "name", "small-note"] as const);
  if (mode === "small-note") {
    const acc = c.rng.chance(0.5);
    return {
      prompt: `A small note is written just before a main note. It has a diagonal stroke through its stem and flag. What is it called?`,
      answer: { kind: "choice", options: [{ id: "acciaccatura", label: "An acciaccatura" }, { id: "appoggiatura", label: "An appoggiatura" }, { id: "turn", label: "A turn" }, { id: "trill", label: "A trill" }], correctOptionIds: ["acciaccatura"], diagnoses: { appoggiatura: diag("acciaccatura-appoggiatura-swap", "An appoggiatura has no stroke through its stem. The stroke marks the crushed note, the acciaccatura."), turn: diag("ornament-confused", "A turn is a sign above the note, not a small note before it."), trill: diag("ornament-confused", "A trill is a sign above the note (tr), not a small note before it.") } },
      hints: ["Small notes before the main note are grace notes: with a stroke it is the acciaccatura, without one the appoggiatura."],
      ...(acc ? {} : {}),
    };
  }
  if (mode === "describe") {
    const wrong = c.rng.shuffle(signs.filter((s) => s !== target)).slice(0, 3);
    const swap = SWAP[target][0];
    const picks = wrong.includes(swap) ? wrong : [swap, ...wrong.slice(0, 2)];
    const opts = [target, ...picks];
    return {
      prompt: `An ornament is shown by ${ORN_TEXT[target]}. What is it called?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts.map((s) => ({ id: s, label: cap(ORN_NAME[s]) }))), correctOptionIds: [target], diagnoses: Object.fromEntries(picks.map((s) => [s, diag(s === swap ? SWAP[target][1] : "ornament-confused", s === swap ? SWAP[target][2] : `${cap(ORN_NAME[s])} is shown by ${ORN_TEXT[s]}.`)])) as Diagnoses },
      hints: ["Check each detail of the description: letters or a curl, a zig-zag with or without a line, a small note with or without a stroke."],
    };
  }
  const wrong = c.rng.shuffle(signs.filter((s) => s !== target)).slice(0, 3);
  const swap = SWAP[target][0];
  const picks = wrong.includes(swap) ? wrong : [swap, ...wrong.slice(0, 2)];
  const opts = [target, ...picks];
  return {
    prompt: `Which of these describes the ${ORN_NAME[target]}?`,
    answer: { kind: "choice", options: c.rng.shuffle(opts.map((s) => ({ id: s, label: cap(ORN_TEXT[s]) }))), correctOptionIds: [target], diagnoses: Object.fromEntries(picks.map((s) => [s, diag(s === swap ? SWAP[target][1] : "ornament-confused", s === swap ? SWAP[target][2] : `That describes the ${ORN_NAME[s]}.`)])) as Diagnoses },
    hints: ["Think about what is written: a small note, or a sign above the note."],
  };
};

/** t.g4.ornament-bar: ornaments and small notes take no time. A bar is printed without its time signature; the learner adds it. */
export const ornamentBar: Gen = (c): any => {
  const signs = ornamentsIn(c);
  if (signs.length < 2) return null;
  const beats = c.rng.pick([2, 3, 4] as const);
  const ts = `${beats}/4`;
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass"));
  const max = Math.min(maxLedger(c), 2);
  const keyText = c.rng.pick(keysIn(c));
  const key = parseKey(keyText);
  const pcs = music.scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const oct = clef === "treble" ? 4 : 3;
  const ps: Pitch[] = [];
  let d = c.rng.int(0, 4);
  for (let i = 0; i < beats; i++) {
    const x = pcs[((d % 7) + 7) % 7]!;
    ps.push({ ...x, octave: oct + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) });
    d += c.rng.pick([-1, 1, 1, 2, -2]);
  }
  if (!fits(clef, ps, max)) return null;
  // at least one small (grace) note and one ornament sign, so a learner who counts them gets a different bar length
  const graces = signs.filter((s) => s === "acciaccatura" || s === "appoggiatura");
  const sign = signs.filter((s) => s !== "acciaccatura" && s !== "appoggiatura");
  if (!graces.length || !sign.length) return null;
  const at = c.rng.shuffle(ps.map((_, i) => i)).slice(0, Math.min(2, ps.length));
  const evs = ps.map((p, i) => (i === at[0] ? mark(p, c.rng.pick(graces), "crotchet") : i === at[1] ? mark(p, c.rng.pick(sign), "crotchet") : note(p, "crotchet")));
  const wrong = [2, 3, 4].filter((x) => x !== beats);
  const f = frag(clef, [{ events: evs, barline: "final" }], `${cap(an(clef))} clef bar in ${keyText} with no time signature: ${evs.map((e, i) => (e.kind === "note" ? `note ${i + 1} ${posText(staffPosition(clef, music.parsePitch(e.pitch)))}${e.ornament ? `, with ${ornDesc(e.ornament)}` : ""}${e.grace ? `, with ${ornDesc(e.grace.kind)}` : ""}` : "")).join("; ")}. The bar is one complete bar of crotchets.`, { key: keyText });
  return {
    prompt: "This is one complete bar of crotchets. Ornament signs and small notes take no time in the bar. Which time signature is missing?",
    music: f,
    answer: { kind: "choice", options: ["2/4", "3/4", "4/4"].map((t) => ({ id: t, label: t })), correctOptionIds: [ts], diagnoses: Object.fromEntries(wrong.map((x) => [`${x}/4`, diag("grace-note-counted", x > beats ? `That would need ${x} crotchet beats. The bar has only ${beats} full-size crotchets: small notes and ornament signs do not add time.` : `That is too few beats: count every full-size crotchet in the bar (there are ${beats}).`)])) as Diagnoses },
    hints: ["Ignore every ornament sign and every small note; count only the full-size crotchets."],
  };
};

// ---------------------------------------------------------------------------
// Instruments and techniques
// ---------------------------------------------------------------------------

const FAMILY_WORD: Record<string, string> = { strings: "the string family", woodwind: "the woodwind family", brass: "the brass family", percussion: "the percussion family" };
const CLEF_NAME: Record<string, string> = { treble: "treble clef", bass: "bass clef", alto: "alto clef" };
const byFamily = (f: string) => INST.filter((i) => i.family === f).sort((a, b) => a.rank - b.rank);

/** t.g4.instruments: families, clefs, highest and lowest of each family, pitched percussion (Grade 4 lists only). */
export const instruments4: Gen = (c): any => instrumentsMode(c, c.rng.pick(["family", "family", "clef", "clef", "belongs"] as const));
/** t.g4.instrument-range: the highest and lowest of each family, and the one pitched percussion instrument. */
export const instrumentRange: Gen = (c): any => instrumentsMode(c, c.rng.pick(["highest", "lowest", "highest", "lowest", "pitched"] as const));
function instrumentsMode(c: Ctx, mode: "family" | "clef" | "belongs" | "highest" | "lowest" | "pitched") {
  if (mode === "family") {
    const inst = c.rng.pick(INST);
    return {
      prompt: `To which family of the orchestra does the ${inst.name} belong?`,
      answer: { kind: "choice", options: FAMILIES.map((f) => ({ id: f, label: cap(f) })), correctOptionIds: [inst.family], diagnoses: Object.fromEntries(FAMILIES.filter((f) => f !== inst.family).map((f) => [f, diag("wrong-category", `The ${inst.name} belongs to ${FAMILY_WORD[inst.family]}: ${byFamily(inst.family).map((i) => i.name).join(", ")}.`)])) as Diagnoses },
      hints: ["The four families are strings, woodwind, brass and percussion."],
    };
  }
  if (mode === "clef") {
    const inst = c.rng.pick(INST.filter((i) => i.clef));
    const ids = ["treble", "bass", "alto"];
    return {
      prompt: `Which clef does the ${inst.name} normally use?`,
      answer: { kind: "choice", options: ids.map((x) => ({ id: x, label: cap(CLEF_NAME[x]!) })), correctOptionIds: [inst.clef!], diagnoses: Object.fromEntries(ids.filter((x) => x !== inst.clef).map((x) => [x, diag("wrong-category", inst.clef === "alto" ? "Only the viola, among the standard orchestral instruments, normally reads the alto clef." : `High instruments normally read the treble clef and low ones the bass clef. The ${inst.name} normally reads the ${CLEF_NAME[inst.clef!]}.`)])) as Diagnoses },
      hints: ["Treble clef for the higher instruments, bass clef for the lower ones, and one string instrument has its own clef."],
    };
  }
  if (mode === "belongs") {
    const fam = c.rng.pick(FAMILIES.filter((f) => f !== "percussion"));
    const right = c.rng.pick(byFamily(fam));
    const others = c.rng.shuffle(INST.filter((i) => i.family !== fam)).slice(0, 3);
    return {
      prompt: `Which of these instruments belongs to ${FAMILY_WORD[fam]}?`,
      answer: { kind: "choice", options: c.rng.shuffle([right, ...others].map((i) => ({ id: i.id, label: cap(i.name) }))), correctOptionIds: [right.id], diagnoses: Object.fromEntries(others.map((i) => [i.id, diag("wrong-category", `The ${i.name} belongs to ${FAMILY_WORD[i.family]}, not ${FAMILY_WORD[fam]}.`)])) as Diagnoses },
      hints: ["Think about how each instrument makes its sound: bowing strings, blowing across or into a reed, buzzing lips, or striking."],
    };
  }
  if (mode === "pitched") {
    const perc = INST.filter((i) => i.family === "percussion");
    const right = perc.find((i) => i.id === "timpani")!;
    const others = perc.filter((i) => i.id !== "timpani");
    return {
      prompt: "Of these percussion instruments, which can play notes of definite pitch?",
      answer: { kind: "choice", options: c.rng.shuffle(perc.map((i) => ({ id: i.id, label: cap(i.name) }))), correctOptionIds: [right.id], diagnoses: Object.fromEntries(others.map((i) => [i.id, diag("wrong-category", `The ${i.name} makes a sound with no definite pitch. Of the standard percussion, only the timpani are tuned to notes.`)])) as Diagnoses },
      hints: ["Timpani are tuned, often to the tonic and the dominant of the key."],
    };
  }
  // highest / lowest of a family (the book orders each list from the instrument that can play the highest notes to the one that can play the lowest)
  const fam = c.rng.pick(["strings", "woodwind", "brass"] as const);
  const list = byFamily(fam);
  const high = mode === "highest";
  const right = high ? list[0]! : list[list.length - 1]!;
  return {
    prompt: `Which instrument of ${FAMILY_WORD[fam]} (${list.map((i) => i.name).sort().join(", ")}) can play the ${high ? "highest" : "lowest"} notes?`,
    answer: { kind: "choice", options: c.rng.shuffle(list.map((i) => ({ id: i.id, label: cap(i.name) }))), correctOptionIds: [right.id], diagnoses: Object.fromEntries(list.filter((i) => i.id !== right.id).map((i) => [i.id, diag("wrong-category", `The ${right.name} can play ${high ? "higher" : "lower"} notes than the ${i.name}.`)])) as Diagnoses },
    hints: ["From highest to lowest the instruments of a family are usually listed in order of size: the smaller instrument plays higher."],
  };
}

/** t.g4.technique-facts: pizzicato, arco, mutes, strings, the bow signs. Each question has one right meaning among clearly different ones. */
export const techniqueFacts: Gen = (c): any => techniqueMode(c, "meaning");
/** t.g4.technique-use: the direction that asks for a described way of playing. */
export const techniqueUse: Gen = (c): any => techniqueMode(c, "term");
function techniqueMode(c: Ctx, mode: "meaning" | "term") {
  const target = c.rng.pick(TECH);
  const pool = TECH.filter((t) => t.id !== target.id);
  const OPP: Record<string, string> = { pizzicato: "arco", arco: "pizzicato", "con-sordino": "senza-sordino", "senza-sordino": "con-sordino", "down-bow": "up-bow", "up-bow": "down-bow" };
  if (mode === "meaning") {
    const picks = c.rng.shuffle(pool).slice(0, 3);
    const opp = pool.find((t) => t.id === OPP[target.id]);
    const opts = [target, ...(opp && !picks.includes(opp) ? [opp, ...picks.slice(0, 2)] : picks)];
    return {
      prompt: `What does ${target.term} mean?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts.map((t) => ({ id: t.id, label: cap(t.meaning) }))), correctOptionIds: [target.id], diagnoses: Object.fromEntries(opts.filter((t) => t.id !== target.id).map((t) => [t.id, diag(OPP[target.id] === t.id ? "opposite-meaning" : "confused-similar-term", OPP[target.id] === t.id ? `That is the opposite: ${t.term} means to ${t.meaning}.` : `${t.term} means to ${t.meaning}.`)])) as Diagnoses },
      hints: [target.applies === "strings" ? "This is an instruction to string players." : "This is an instruction to string and brass players."],
    };
  }
  const picks = c.rng.shuffle(pool).slice(0, 3);
  const opp = pool.find((t) => t.id === OPP[target.id]);
  const opts = [target, ...(opp && !picks.includes(opp) ? [opp, ...picks.slice(0, 2)] : picks)];
  return {
    prompt: `A player is told to ${target.meaning}. Which direction is written in the music?`,
    answer: { kind: "choice", options: c.rng.shuffle(opts.map((t) => ({ id: t.id, label: t.term }))), correctOptionIds: [target.id], diagnoses: Object.fromEntries(opts.filter((t) => t.id !== target.id).map((t) => [t.id, diag(OPP[target.id] === t.id ? "opposite-meaning" : "confused-similar-term", OPP[target.id] === t.id ? `${t.term} is the opposite instruction.` : `${t.term} means to ${t.meaning}.`)])) as Diagnoses },
    hints: ["Read the meanings carefully: some of these come in opposite pairs."],
  };
}

// ---------------------------------------------------------------------------
// Terms (Grade 4 list only)
// ---------------------------------------------------------------------------

const groupSize = (g: string) => T.filter((t) => t.group === g).length;
const USE: Record<string, string> = {
  affettuoso: "The tune is meant to be played with real tenderness and affection",
  affrettando: "The music should hurry and press forward",
  amabile: "The melody should sound pleasant and amiable",
  appassionato: "A performer is told to play with passion",
  calando: "The music should get softer and usually slower as the piece closes",
  cantando: "The player should make the melody sing",
  "come-prima": "After a contrasting passage, the music should go back to be played as before",
  "come-sopra": "A repeated line should be played as above",
  facile: "The passage should sound easy and effortless",
  "con-fuoco": "The finale should be played with fire",
  "tempo-giusto": "The march must be kept in strict, exact time",
  "l-istesso-tempo": "The time signature changes but the beat stays at the same speed",
  morendo: "The last chord should die away",
  niente: "The sound should fade to nothing",
  nobilmente: "The theme should be played nobly",
  perdendosi: "The sound should fade away until it is lost",
  "presto-possibile": "The coda is to be played as fast as possible",
  quasi: "The passage should sound as if it were something else (almost like)",
  sonoro: "The player should use a full, resonant tone",
  sopra: "The left hand should play above the right",
  "sotto-voce": "The singers should use an undertone, very softly",
};

/** Alternatives for a term question: different groups only, so no alternative can also be a fair answer. */
function termOptions(c: Ctx, target: music.TermG4): music.TermG4[] {
  const pool = T.filter((t) => t.group !== target.group && !(target.category === "change-of-speed" && t.category === "change-of-speed" && ["fading", "hurry", "same-speed"].includes(t.group) && ["fading", "hurry", "same-speed"].includes(target.group) && false));
  const sameCat = c.rng.shuffle(pool.filter((t) => t.category === target.category));
  const others = c.rng.shuffle(pool.filter((t) => t.category !== target.category));
  const picks: music.TermG4[] = [];
  for (const t of [...sameCat.slice(0, 2), ...others]) {
    if (picks.length === 3) break;
    if (!picks.some((p) => p.group === t.group)) picks.push(t);
  }
  return picks;
}

/** t.g4.terms: the meaning of a Grade 4 term, or the term for a meaning (only for meanings with a single term). */
export const terms4: Gen = (c): any => {
  const target = c.rng.pick(T);
  const reverse = groupSize(target.group) === 1 && c.rng.chance(0.35);
  const picks = termOptions(c, target);
  if (picks.length < 3) return null;
  if (!reverse) {
    return {
      prompt: `What does “${target.term}” mean?`,
      answer: { kind: "choice", options: c.rng.shuffle([target, ...picks].map((t) => ({ id: t.id, label: cap(t.meaning) }))), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((t) => [t.id, diag(t.category === target.category ? "confused-similar-term" : "wrong-category", `${cap(t.meaning)} is the meaning of “${t.term}”.`)])) as Diagnoses },
      hints: [`“${target.term}” is an Italian or French direction of the kind: ${target.category.replace(/-/g, " ")}.`],
    };
  }
  return {
    prompt: `Which direction asks the player to play this way: ${target.meaning}?`,
    answer: { kind: "choice", options: c.rng.shuffle([target, ...picks].map((t) => ({ id: t.id, label: t.term }))), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((t) => [t.id, diag(t.category === target.category ? "confused-similar-term" : "wrong-category", `“${t.term}” means ${t.meaning}.`)])) as Diagnoses },
    hints: [`Think of the Italian word that means “${target.meaning}”.`],
  };
};

/** t.g4.term-use: a short situation; the learner says what the direction asks (terms that share a meaning are never both options). */
export const termUse4: Gen = (c): any => {
  const target = c.rng.pick(T.filter((t) => USE[t.id]));
  const picks = termOptions(c, target);
  if (picks.length < 3) return null;
  return {
    prompt: `${USE[target.id]}? No: here is the direction on the page — “${target.term}”. What should the player do?`.replace("? No: here is", ". Here is"),
    answer: { kind: "choice", options: c.rng.shuffle([target, ...picks].map((t) => ({ id: t.id, label: cap(t.meaning) }))), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((t) => [t.id, diag(t.category === target.category ? "confused-similar-term" : "wrong-category", `${cap(t.meaning)} is what “${t.term}” asks. Check the word again.`)])) as Diagnoses },
    hints: [`“${target.term}” means ${target.meaning}.`],
  };
};

// ---------------------------------------------------------------------------
// Passages: one short original melody, several concepts
// ---------------------------------------------------------------------------

const PASSAGE_INST = INST.filter((i) => i.pitched && i.clef);
function melodyFor(c: Ctx, keyText: string, clef: Clef, len: number): Pitch[] | null {
  const key = parseKey(keyText);
  const form = key.mode === "major" ? "major" : "harmonic";
  const pcs = music.scale(key, form).slice(0, 7);
  const max = Math.min(maxLedger(c), 2);
  for (const o of c.rng.shuffle(clef === "bass" ? [2, 3] : clef === "alto" ? [3, 4] : [4, 5])) {
    const out: Pitch[] = [];
    let d = c.rng.int(0, 4);
    for (let i = 0; i < len; i++) {
      const x = pcs[((d % 7) + 7) % 7]!;
      out.push({ ...x, octave: o + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) });
      d += c.rng.pick([-2, -1, 1, 1, 2]);
    }
    if (fits(clef, out, max) && out.every((p) => Math.abs(staffPosition(clef, p) - 4) <= 6)) return out;
  }
  return null;
}

type Part = { id: string; prompt: string; answer: import("@mtp/curriculum").AnswerSpec };
const choice = (opts: Array<[string, string]>, right: string, why: Record<string, string> = {}, cat = "wrong-category"): Part["answer"] => ({ kind: "choice", options: opts.map(([id, label]) => ({ id, label })), correctOptionIds: [right], ...(Object.keys(why).length ? { diagnoses: Object.fromEntries(Object.entries(why).map(([k, v]) => [k, diag(cat, v)])) } : {}) }) as never;

/** Instrument part: ties the passage to the instrument that would play it (always present, so every passage is evidence for the orchestra outcome). */
function instrumentPart(c: Ctx, clef: Clef): { inst: music.InstrumentG4; part: Part; line: string } | null {
  const cands = PASSAGE_INST.filter((i) => i.clef === clef);
  if (!cands.length) return null;
  const inst = c.rng.pick(cands);
  const kind = c.rng.pick(["family", "clef-instrument"] as const);
  if (kind === "family") {
    return { inst, line: `This passage is for the ${inst.name}.`, part: { id: "family", prompt: `To which family of the orchestra does the ${inst.name} belong?`, answer: choice(FAMILIES.map((f) => [f, cap(f)] as [string, string]), inst.family, Object.fromEntries(FAMILIES.filter((f) => f !== inst.family).map((f) => [f, `The ${inst.name} belongs to ${FAMILY_WORD[inst.family]}.`]))) } };
  }
  const ids = ["treble", "bass", "alto"];
  return { inst, line: `This passage is for the ${inst.name}.`, part: { id: "clef", prompt: `The ${inst.name} normally reads one clef. Is this passage written in that clef?`, answer: choice([["yes", `Yes: the ${CLEF_NAME[clef]} is normal for the ${inst.name}`], ["no", `No: the ${inst.name} normally reads a different clef`]], "yes", { no: `The ${inst.name} normally reads the ${CLEF_NAME[inst.clef!]}, and this passage is written in it.` }) } };
  void ids;
}

/** t.g4.passage: a short melody for a named instrument with an interval, an ornament or a direction, and a question about the instrument. */
export const passage4: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass" || x === "alto"));
  const keyText = c.rng.pick(keysIn(c));
  const mel = melodyFor(c, keyText, clef, 6);
  const ip = instrumentPart(c, clef);
  if (!mel || !ip) return null;
  const signs = ornamentsIn(c);
  const term = c.rng.pick(T.filter((t) => groupSize(t.group) === 1 && t.category !== "structure"));
  const markedOrn = signs.length ? c.rng.pick(signs) : null;
  const kinds = c.rng.shuffle(["interval", "term", ...(markedOrn ? ["ornament"] : [])] as string[]).slice(0, 2);
  const withInterval = kinds.includes("interval");
  const ornAt = c.rng.int(1, 4);
  const lowIdx = 1;
  const highIdx = ornAt === 4 ? 5 : 4;
  const events = mel.map((p, i) => (kinds.includes("ornament") && markedOrn && i === ornAt ? mark(p, markedOrn, "crotchet", { label: "A" }) : note(p, "crotchet", withInterval && i === lowIdx ? { label: "x" } : withInterval && i === highIdx ? { label: "y" } : {})));
  // the interval is asked between the notes marked x and y (the ornamented note keeps its own label, so the interval avoids it)
  if (withInterval && kinds.includes("ornament") && (ornAt === lowIdx || ornAt === highIdx)) return null;
  const measures: Measure[] = [{ events: events.slice(0, 3) }, { events: events.slice(3), barline: "final" }];
  const parts: Part[] = [ip.part];
  for (const k of kinds) {
    if (k === "interval") {
      const [x, y] = chromaticOrder(mel[lowIdx]!, mel[highIdx]!);
      const iv = music.intervalBetween(x, y);
      if (iv.number > 8 || iv.number < 2) return null;
      parts.push({ id: "interval", prompt: "What is the interval from the lower to the higher of the notes marked x and y? (Quality and number.)", answer: { kind: "interval", task: "identify", key: keyText, lower: F(x), upper: F(y), acceptedIntervals: [`${iv.quality}${iv.number}`] } });
    } else if (k === "term") {
      const picks = termOptions(c, term);
      if (picks.length < 3) return null;
      parts.push({ id: "term", prompt: `The passage is marked “${term.term}”. What does it ask?`, answer: choice(c.rng.shuffle([term, ...picks]).map((t) => [t.id, cap(t.meaning)] as [string, string]), term.id, Object.fromEntries(picks.map((t) => [t.id, `That is the meaning of “${t.term}”.`])), "confused-similar-term") });
    } else if (k === "ornament" && markedOrn) {
      parts.push({ id: "ornament", prompt: "What is the ornament on the note marked A?", answer: { kind: "ornament-sign", task: "name-sign", sign: markedOrn, accepted: [markedOrn] } });
    }
  }
  if (parts.length < 3) return null;
  const f = frag(clef, measures, "", { key: keyText, timeSignature: "3/4", tempoText: `${cap(term.term)}` });
  return {
    prompt: `${ip.line} Look at the passage and answer the questions.`,
    music: f,
    answer: { kind: "composite", parts },
    hints: ["Take the questions one at a time, using the clef, the key signature, the printed direction and the marks on the notes."],
  };
};
const chromaticOrder = (a: Pitch, b: Pitch): [Pitch, Pitch] => (music.diatonicNumber(a) <= music.diatonicNumber(b) ? [a, b] : [b, a]);

/** t.g4.passage-directions: a passage with a printed direction and technique for strings or brass, and questions about what they ask. */
export const passageDirections: Gen = (c): any => {
  const clef = c.rng.pick(clefsIn(c).filter((x) => x === "treble" || x === "bass" || x === "alto"));
  const keyText = c.rng.pick(keysIn(c));
  const mel = melodyFor(c, keyText, clef, 6);
  const stringsOrBrass = PASSAGE_INST.filter((i) => i.clef === clef && (i.family === "strings" || i.family === "brass"));
  if (!mel || !stringsOrBrass.length) return null;
  const inst = c.rng.pick(stringsOrBrass);
  const techs = TECH.filter((t) => t.applies === "strings-and-brass" || inst.family === "strings");
  const tech = c.rng.pick(techs.filter((t) => !t.id.includes("bow") ));
  const term = c.rng.pick(T.filter((t) => groupSize(t.group) === 1 && t.category !== "structure"));
  const signs = ornamentsIn(c);
  const orn = signs.length ? c.rng.pick(signs) : null;
  const ornAt = c.rng.int(1, 4);
  const events = mel.map((p, i) => (orn && i === ornAt ? mark(p, orn, "crotchet", { label: "A" }) : note(p, "crotchet")));
  const measures: Measure[] = [{ events: events.slice(0, 3) }, { events: events.slice(3), barline: "final" }];
  const tpick = termOptions(c, term);
  const techOpp = techs.filter((t) => t.id !== tech.id);
  const techPicks = c.rng.shuffle(techOpp).slice(0, 3);
  const OPP: Record<string, string> = { pizzicato: "arco", arco: "pizzicato", "con-sordino": "senza-sordino", "senza-sordino": "con-sordino" };
  const oppT = techOpp.find((t) => t.id === OPP[tech.id]);
  const techOpts = [tech, ...(oppT && !techPicks.includes(oppT) ? [oppT, ...techPicks.slice(0, 2)] : techPicks)];
  if (tpick.length < 3 || techOpts.length < 4) return null;
  const parts: Part[] = [
    { id: "technique", prompt: `The ${inst.name} part is marked ${tech.term}. What does it ask the player to do?`, answer: choice(c.rng.shuffle(techOpts).map((t) => [t.id, cap(t.meaning)] as [string, string]), tech.id, Object.fromEntries(techOpts.filter((t) => t.id !== tech.id).map((t) => [t.id, `That is the meaning of ${t.term}.`])), "confused-similar-term") },
    { id: "term", prompt: `The passage is marked “${term.term}”. What does it ask?`, answer: choice(c.rng.shuffle([term, ...tpick]).map((t) => [t.id, cap(t.meaning)] as [string, string]), term.id, Object.fromEntries(tpick.map((t) => [t.id, `That is the meaning of “${t.term}”.`])), "confused-similar-term") },
  ];
  if (orn) parts.push({ id: "ornament", prompt: "What is the ornament on the note marked A?", answer: { kind: "ornament-sign", task: "name-sign", sign: orn, accepted: [orn] } });
  const f = frag(clef, measures, `${cap(an(clef))} clef melody in ${keyText}, 3/4, for ${inst.name}, marked ${term.term} and ${tech.term}. ${events.map((e, i) => (e.kind === "note" ? `Note ${i + 1} ${posText(staffPosition(clef, music.parsePitch(e.pitch)))}${e.ornament ? ` (marked A) with ${ornDesc(e.ornament)}` : ""}${e.grace ? ` (marked A) with ${ornDesc(e.grace.kind)}` : ""}` : "")).join("; ")}.`, { key: keyText, timeSignature: "3/4", tempoText: `${cap(term.term)} · ${tech.term.replace(/ \(.*\)/, "")}` });
  return { prompt: `This passage is for the ${inst.name}. Answer the questions about the directions in it.`, music: f, answer: { kind: "composite", parts }, hints: ["Read the words printed above the stave and the sign on the marked note."] };
};

void optsOf;
void pretty;
void nameOf;
void ORD;
void NATURALS;
