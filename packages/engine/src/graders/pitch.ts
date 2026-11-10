/** g.pitch-spelling, g.staff-position, g.keyboard-key, g.accidental-state */
import { music } from "@mtp/curriculum";
import { EngineError } from "../context.ts";
import { readFragment, shownNote } from "../derive.ts";
import { right, wrong, type AnswerOf, type Grader } from "./types.ts";

const { parsePitch, formatPitch, formatPitchClass, chromaticNumber, staffPosition, naturalAt, ledgerLines } = music;
type Pitch = music.Pitch;
type Loose = music.PitchClass & { octave?: number };
const CLEFS: music.Clef[] = ["treble", "bass", "alto", "tenor"];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function parseLoose(text: string): Loose {
  const m = /^([A-G])(bb|b|#|x)?(-?\d)?$/.exec(text);
  if (!m) throw new EngineError("malformed_response", `Not a note name: ${text}`);
  const alter = { bb: -2, b: -1, "#": 1, x: 2 }[m[2] as "bb"] ?? 0;
  return { step: m[1] as music.Step, alter, ...(m[3] !== undefined ? { octave: Number(m[3]) } : {}) };
}
const name = (p: Loose) => (p.octave === undefined ? formatPitchClass(p) : formatPitch(p as Pitch)).replace("#", "♯").replace(/b(?=\d|$)/, "♭").replace("x", "𝄪");
const sameSound = (a: Loose, b: Loose, octave: boolean) => {
  const ca = chromaticNumber({ ...a, octave: a.octave ?? 4 });
  const cb = chromaticNumber({ ...b, octave: b.octave ?? 4 });
  return octave && a.octave !== undefined && b.octave !== undefined ? ca === cb : mod12(ca - cb) === 0;
};
const sameSpelling = (a: Loose, b: Loose, octave: boolean) => a.step === b.step && a.alter === b.alter && (!octave || a.octave === b.octave);

function responsePitch(r: { kind: string; letter?: string; pitch?: string }): Loose {
  if (r.kind === "pitch-letter") return { step: r.letter as music.Step, alter: 0 };
  if (r.kind === "pitch") return parseLoose(r.pitch!);
  throw new EngineError("response_mismatch", "Expected a note name");
}

function judge(a: AnswerOf<"pitch">, ref: Loose, got: Loose, letterOnly: boolean): boolean {
  if (letterOnly) return got.step === ref.step;
  if (a.octaveSensitive && got.octave === undefined) return false;
  if (a.relation === "same") return a.spellingSensitive ? sameSpelling(got, ref, a.octaveSensitive) : sameSound(got, ref, a.octaveSensitive);
  const ss = sameSound(got, ref, a.octaveSensitive);
  return a.relation === "same-sound" ? ss : ss && !sameSpelling(got, ref, false);
}

/** g.pitch-spelling: note reading and enharmonic tasks. The note is read from the printed stave. */
export const gradePitchSpelling: Grader<AnswerOf<"pitch">> = (c, a, r) => {
  const got = responsePitch(r as never);
  const shown = shownNote(c.item);
  const ref: Loose | undefined = shown ?? (a.reference ? parsePitch(a.reference) : a.accepted[0] ? parsePitch(a.accepted[0]) : undefined);
  if (!ref) throw new EngineError("item_inconsistent", "No note to compare with");
  const letterOnly = r.kind === "pitch-letter";
  if (a.relation === "same" && !shown && !a.reference) {
    // No shown note: accept exactly the authored alternatives (validated against the rules at build time).
    const ok = a.accepted.some((x) => judge(a, parsePitch(x), got, letterOnly));
    return ok ? right() : wrong(null, `${name(got)} is not the note asked for.`);
  }
  if (judge(a, ref, got, letterOnly)) return right();
  // Enharmonic tasks.
  if (a.relation !== "same") {
    if (sameSpelling(got, ref, false)) return wrong("same-spelling-given", `${name(got)} is spelt the same way as the note shown. Use a different letter name.`);
    return wrong("not-same-pitch", `${name(got)} does not sound the same as ${name(ref)}: they are ${Math.abs(mod12(chromaticNumber({ ...got, octave: 4 }) - chromaticNumber({ ...ref, octave: 4 })))} semitone(s) apart.`);
  }
  if (got.step === ref.step && got.alter !== ref.alter) return wrong("accidental-ignored", `The letter ${got.step} is right, but the note is not ${name({ step: got.step, alter: got.alter })}.`);
  if (got.step === ref.step && a.octaveSensitive) return wrong(null, `The letter name is right, but that ${got.step} is in a different octave.`);
  const clef = c.item.music?.clef as music.Clef | undefined;
  if (clef && shown) {
    const pos = staffPosition(clef, shown);
    const posName = describePosition(pos);
    const said = `You answered ${got.step}; the note is on the ${posName}.`;
    if (pos >= 0 && pos <= 8 && naturalAt(clef, 8 - pos).step === got.step && 8 - pos !== pos) return wrong("counted-from-top", said);
    if (CLEFS.some((o) => o !== clef && naturalAt(o, pos).step === got.step)) return wrong("clef-confusion", `${said} ${got.step} would be right in a different clef.`);
    const lines = ledgerLines(clef, shown);
    if (lines > 0 && [pos - 2, pos + 2].some((q) => naturalAt(clef, q).step === got.step)) return wrong("ledger-miscount", `${said} Count the ledger lines again.`);
    if ([pos - 1, pos + 1].some((q) => naturalAt(clef, q).step === got.step)) return wrong("off-by-step", `${said} ${got.step} is one step away.`);
    return wrong(null, said);
  }
  return wrong(null, `${name(got)} is not the right note.`);
};

export function describePosition(pos: number): string {
  const ord = (n: number) => ["1st", "2nd", "3rd", "4th", "5th", "6th"][n - 1] ?? `${n}th`;
  if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? `${ord(pos / 2 + 1)} line` : `${ord((pos + 1) / 2)} space`;
  if (pos < 0) return pos % 2 === 0 ? `${ord(-pos / 2)} ledger line below the stave` : pos === -1 ? "space just below the stave" : `space below the ${ord((-pos - 1) / 2)} ledger line`;
  return pos % 2 === 0 ? `${ord((pos - 8) / 2)} ledger line above the stave` : pos === 9 ? "space just above the stave" : `space above the ${ord((pos - 9) / 2)} ledger line`;
}

/** Every pitch satisfying a staff-position target (letter, accidental, line/space, ledger limit, octave). */
export function staffTargets(a: AnswerOf<"staff-position">, maxLedger: number): Pitch[] {
  const t = a.target;
  const out: Pitch[] = [];
  for (let octave = 0; octave <= 8; octave++) {
    const p: Pitch = { step: t.step, alter: t.alter, octave };
    const pos = staffPosition(a.clef, p);
    const posOk = t.position === "any" || (t.position === "line") === (((pos % 2) + 2) % 2 === 0);
    if (posOk && ledgerLines(a.clef, p) <= Math.min(t.maxLedgerLines, maxLedger) && (t.octave === undefined || octave === t.octave)) out.push(p);
  }
  return out;
}

/** g.staff-position: place a note (and its accidental) on the stave. */
export const gradeStaffPosition: Grader<AnswerOf<"staff-position">> = (c, a, r) => {
  if (r.kind !== "staff-position") throw new EngineError("response_mismatch", "Expected a stave position");
  const got = parsePitch(r.pitch);
  const valid = staffTargets(a, c.scope.maxLedgerLines ?? a.target.maxLedgerLines);
  if (!valid.length) throw new EngineError("item_inconsistent", "No position satisfies the target");
  const ok = valid.some((v) => music.samePitch(v, got));
  if (ok) return right();
  const pos = staffPosition(a.clef, got);
  const where = `Your note is ${name({ step: got.step, alter: got.alter })} on the ${describePosition(pos)}.`;
  const t = a.target;
  if (got.step === t.step && got.alter !== t.alter) return wrong("accidental-missing", `The position is right for ${t.step}, but the accidental is not.`);
  if (got.step === t.step) {
    const lines = ledgerLines(a.clef, got);
    if (lines > Math.min(t.maxLedgerLines, c.scope.maxLedgerLines ?? 9)) return wrong("ledger-miscount", `${where} That needs more ledger lines than this question allows.`);
    return wrong("wrong-octave", `${where} The letter is right, but choose the other ${t.step}${t.position !== "any" ? ` (the one on a ${t.position})` : ""}.`);
  }
  // Only categories the submitted note itself proves (Brief 02 review R6): parity first, then mirror counting, then clefs.
  const validPos = valid.map((v) => staffPosition(a.clef, v));
  if (t.position !== "any" && (t.position === "line") !== (((pos % 2) + 2) % 2 === 0)) return wrong("line-space-swap", `${where} The question asks for a note on a ${t.position}.`);
  if (pos >= 0 && pos <= 8 && validPos.includes(8 - pos)) return wrong("counted-from-top", where);
  if (CLEFS.some((o) => o !== a.clef && naturalAt(o, pos).step === t.step)) return wrong("clef-confusion", `${where} That place would be ${t.step} in a different clef.`);
  if (validPos.some((q) => Math.abs(q - pos) === 2) && ledgerLines(a.clef, got) > 0) return wrong("ledger-miscount", where);
  return wrong(null, where);
};

/** Every spelling (−2..+2) of a piano key, given as semitones above C0. */
export function spellingsOfKey(key: number): Pitch[] {
  const out: Pitch[] = [];
  for (const step of music.STEPS) {
    for (let alter = -2; alter <= 2; alter++) {
      const natural = music.naturalSemitones(step) + alter;
      const octave = Math.floor((key - natural) / 12);
      const p = { step, alter, octave };
      if (chromaticNumber(p) === key) out.push(p);
    }
  }
  return out;
}
const isBlack = (key: number) => [1, 3, 6, 8, 10].includes(mod12(key));

/** g.keyboard-key: a key press stands for every spelling of that key; spelling matters only when the task says so. */
export const gradeKeyboard: Grader<AnswerOf<"pitch">> = (_c, a, r) => {
  if (r.kind !== "keyboard") throw new EngineError("response_mismatch", "Expected a piano key");
  if (r.spelling && chromaticNumber(parsePitch(r.spelling)) !== r.key) throw new EngineError("malformed_response", "The spelling does not belong to that key");
  const ref = parsePitch(a.reference ?? a.accepted[0]!);
  const targets = a.accepted.map(parsePitch);
  const spelt = r.spelling ? parsePitch(r.spelling) : undefined;
  const needSpelling = a.spellingSensitive && a.relation !== "same-sound";
  const keyMatches = (p: Pitch) => (a.octaveSensitive ? chromaticNumber(p) === r.key : mod12(chromaticNumber(p) - r.key) === 0);
  let ok: boolean;
  if (a.relation === "same-sound") ok = keyMatches(ref);
  else if (!needSpelling) ok = targets.some(keyMatches);
  else ok = Boolean(spelt) && targets.some((t) => sameSpelling(spelt!, t, a.octaveSensitive));
  if (a.relation === "different-spelling") ok = keyMatches(ref) && Boolean(spelt) && !sameSpelling(spelt!, ref, false);
  if (ok) return right();
  const wantKey = chromaticNumber(targets[0] ?? ref);
  const diff = a.octaveSensitive ? r.key - wantKey : ((mod12(r.key - wantKey) + 6) % 12) - 6;
  if (diff === 0) return wrong("enharmonic-spelling", "That is the right key, but the note is spelt with a different letter name here.");
  if (Math.abs(diff) === 1 && (isBlack(r.key) || isBlack(wantKey))) return wrong("black-key-neighbour", `That key is a semitone ${diff > 0 ? "too high" : "too low"}.`);
  if (Math.abs(diff) <= 2 && !isBlack(r.key) && !isBlack(wantKey)) return wrong("white-key-off-by-one", `That is the next white key ${diff > 0 ? "up" : "down"}.`);
  return wrong(null, `That key is ${Math.abs(diff)} semitones ${diff > 0 ? "too high" : "too low"}.`);
};

/** g.accidental-state: the note's pitch follows from the key signature and the accidentals earlier in the bar. */
export const gradeAccidentalState: Grader<AnswerOf<"pitch">> = (c, a, r) => {
  const got = responsePitch(r as never);
  const music_ = c.item.music;
  if (!music_) throw new EngineError("item_inconsistent", "Accidental-state item needs music");
  const target = shownNote(c.item);
  if (!target) throw new EngineError("item_inconsistent", "Accidental-state item needs one labelled note");
  if (a.octaveSensitive && got.octave === undefined) throw new EngineError("response_mismatch", "Give the octave as well");
  if (sameSpelling(got, target, a.octaveSensitive)) return right();
  // Re-read the bar with one rule broken: if that reading gives the learner's answer, we know the mistake.
  const all = readFragment(music_);
  const idx = all.findIndex((n) => n.label) >= 0 ? all.findIndex((n) => n.label) : all.findIndex((n) => !n.isChord);
  for (const m of music.RESOLUTION_MISTAKES) {
    const alt = music.resolveWrittenPitches(music_ as unknown as music.AFragment, m.rule)[idx]?.pitch;
    if (alt && sameSpelling(got, alt, false) && !sameSpelling(alt, target, false)) return wrong(m.category, `${name(got)} would be right only if ${MISTAKE_TEXT[m.rule]}.`);
  }
  return wrong(null, `${name(got)} is not the pitch of the marked note.`);
};
const MISTAKE_TEXT: Record<string, string> = {
  "forget-earlier-accidentals": "the accidental earlier in the bar did not count",
  "ignore-key-signature": "there were no key signature",
  "carry-over-barline": "accidentals lasted past the bar-line",
  "any-octave": "an accidental affected every octave",
  "ignore-ties": "the tie over the bar-line did not carry the note",
};
