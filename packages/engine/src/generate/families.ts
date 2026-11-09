/**
 * Generators, one per exercise family (specialised by template). Each samples only from the scope it is given
 * (a template's grade scope, or a lesson binding's effective scope) and writes original prompts. All musical
 * facts come from the rule functions; nothing is hand-typed per item.
 */
import { allowedForms, deriveScale, music, type AnswerSpec, type ExerciseTemplate, type Measure, type MusicScope, type NotationEvent, type NotationFragment, type NotationScore } from "@mtp/curriculum";
import type { Rng } from "../rng.ts";
import { describePosition, spellingsOfKey, staffTargets } from "../graders/pitch.ts";

const { parsePitch: P, formatPitch: F, formatPitchClass: FC, staffPosition, naturalAt, ledgerLines, parseKey, scale } = music;
type Pitch = music.Pitch;
type Clef = music.Clef;

export interface GenCtx {
  rng: Rng;
  scope: MusicScope;
  template: ExerciseTemplate;
}
export interface Draft {
  prompt: string;
  music?: NotationFragment;
  score?: NotationScore;
  answer: AnswerSpec;
  hints?: string[];
  correct?: string;
}
type Gen = (ctx: GenCtx) => Draft | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const pretty = (s: string) => s.replace(/#/g, "♯").replace(/x/g, "𝄪").replace(/([A-G])bb/g, "$1𝄫").replace(/([A-G])b/g, "$1♭");
const nameOf = (p: music.PitchClass) => pretty(FC(p));
const keyName = (k: string) => pretty(k);
const SIGN_WORD: Record<number, string> = { [-2]: "double flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double sharp" };
const ORD = (n: number) => music.ordinal(n);
const clefOf = (c: GenCtx): Clef => c.rng.pick(((c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[]));
const fits = (clef: Clef, ps: Pitch[], max: number) => ps.every((p) => ledgerLines(clef, p) <= max);
const maxLedger = (c: GenCtx) => c.scope.maxLedgerLines ?? 0;
const keysOf = (c: GenCtx) => (c.scope.keys?.length ? c.scope.keys : ["C major"]);
const DISPLAY = "B4";

function note(pitch: Pitch | string, value: music.NoteValue = "semibreve", extra: Record<string, unknown> = {}): NotationEvent {
  return { kind: "note", pitch: typeof pitch === "string" ? pitch : F(pitch), duration: { value, dots: 0 }, ...extra } as NotationEvent;
}
const r = (value: music.NoteValue, dots = 0, extra: Record<string, unknown> = {}): NotationEvent => ({ kind: "rest", duration: { value, dots }, ...extra }) as NotationEvent;
const n = (value: music.NoteValue, dots = 0, extra: Record<string, unknown> = {}): NotationEvent => ({ kind: "note", pitch: DISPLAY, duration: { value, dots }, ...extra }) as NotationEvent;

/** Print exactly the accidentals the spelt pitches need (key signature and bar state), so content is self-consistent. */
export function withSigns(f: NotationFragment): NotationFragment {
  const signs = music.printedAccidentals(f as unknown as music.AFragment);
  return {
    ...f,
    measures: f.measures.map((m, bar) => {
      const voice = (events: NotationEvent[], vi: number) => {
        let idx = 0;
        const fix = (e: NotationEvent): NotationEvent => {
          if (e.kind === "tuplet") return { ...e, events: e.events.map((x) => fix(x) as never) };
          const here = idx++;
          if (e.kind === "note") {
            const s = signs.get(`${bar}.${vi}.${here}.0`);
            const { writtenAccidental: _w, ...rest } = e;
            return (s ? { ...rest, writtenAccidental: s } : rest) as NotationEvent;
          }
          if (e.kind === "chord") return { ...e, notes: e.notes.map((x, ni) => ({ pitch: x.pitch, ...(signs.get(`${bar}.${vi}.${here}.${ni}`) ? { writtenAccidental: signs.get(`${bar}.${vi}.${here}.${ni}`)! } : {}) })) };
          return e;
        };
        return events.map(fix);
      };
      return m.events ? { ...m, events: voice(m.events, 0) } : { ...m, voices: m.voices!.map((v, vi) => ({ ...v, events: voice(v.events, vi) })) };
    }),
  };
}

function frag(clef: Clef, measures: Measure[], text: string, extra: Partial<NotationFragment> = {}): NotationFragment {
  return withSigns({ presentation: "stave", clef, showKeySignature: true, measures, textAlternative: text, ...extra } as NotationFragment);
}

const valueWord = (e: NotationEvent): string => {
  if (e.kind === "tuplet") return `a ${e.actual === 3 ? "triplet" : e.actual === 2 ? "duplet" : `group of ${e.actual}`} of ${e.events.map(valueWord).join(", ")}`;
  const v = `${"dotted ".repeat(e.duration.dots ?? 0)}${e.duration.value}${e.kind === "rest" ? " rest" : ""}`;
  return `${v}${e.kind !== "rest" && e.tieToNext ? " tied to" : ""}`;
};
export const describeRhythm = (ms: Measure[]) => ms.map((m, i) => `Bar ${i + 1}: ${(m.events ?? []).map(valueWord).join(", ")}.`).join(" ");

// Beat fillers: a list of value sequences that fill one beat of the given length (all within scope).
function beatFills(beat: music.Fraction, sc: MusicScope, compound: boolean): NotationEvent[][] {
  const allowed = new Set(sc.noteValues?.length ? sc.noteValues : ["semibreve", "minim", "crotchet", "quaver", "semiquaver"]);
  const val = (f: music.Fraction) => music.valueFor(f, Math.min(1, sc.maxDots ?? 0));
  const out: NotationEvent[][] = [];
  const add = (parts: music.Fraction[], rest = -1) => {
    const evs = parts.map((p, i) => {
      const v = val(p);
      return v && allowed.has(v.value) ? (i === rest ? r(v.value, v.dots) : n(v.value, v.dots)) : null;
    });
    if (evs.every(Boolean)) out.push(evs as NotationEvent[]);
  };
  const third = music.mul(beat, music.frac(1, 3));
  const half = music.mul(beat, music.frac(1, 2));
  const quarter = music.mul(beat, music.frac(1, 4));
  add([beat]);
  if (compound) {
    add([third, third, third]);
    add([music.mul(third, music.frac(2)), third]);
    add([third, music.mul(third, music.frac(2))]);
  } else {
    add([half, half]);
    add([quarter, quarter, half]);
    add([half, quarter, quarter]);
    add([quarter, quarter, quarter, quarter]);
    if ((sc.maxDots ?? 0) >= 1) add([music.mul(quarter, music.frac(3)), quarter]);
  }
  if (sc.rests !== false) add([beat], 0);
  return out;
}

/** A random, convention-compliant bar in `ts` drawn from the scope's values. */
function randomBar(c: GenCtx, ts: string, opts: { noRests?: boolean; needBeams?: boolean } = {}): NotationEvent[] | null {
  const s = c.rng.pick(music.metreStructures(ts));
  const bar: NotationEvent[] = [];
  // Occasionally a longer note across two beats in simple time, starting on a strong beat.
  for (let i = 0; i < s.groups.length; i++) {
    const g = s.groups[i]!;
    const fills = beatFills(g, c.scope, s.metre !== "simple" || (s.pattern ? g.n * s.beatUnit.d / (s.beatUnit.n * g.d) === 3 : false)).filter((f) => !opts.noRests || f.every((e) => e.kind !== "rest"));
    if (!fills.length) return null;
    if (s.metre === "simple" && i % 2 === 0 && i + 1 < s.groups.length && c.rng.chance(0.2)) {
      const v = music.valueFor(music.add(g, s.groups[i + 1]!), 0);
      if (v && (c.scope.noteValues ?? [v.value]).includes(v.value)) {
        bar.push(n(v.value));
        i++;
        continue;
      }
    }
    bar.push(...c.rng.pick(fills).map((e) => ({ ...e })));
  }
  const beamed = music.autoBeam(bar as unknown as music.REvent[], s) as unknown as NotationEvent[];
  if (opts.needBeams && !beamed.some((e) => e.kind !== "tuplet" && e.beam)) return null;
  if (music.checkBarAnyPattern(beamed as unknown as music.REvent[], ts).issues.length) return null;
  return beamed;
}

// ---------------------------------------------------------------------------
// Pitch families
// ---------------------------------------------------------------------------

const noteRead: Gen = (c) => {
  const clef = clefOf(c);
  const max = maxLedger(c);
  const lo = -2 * max - (max > 0 ? 1 : 0);
  const hi = 8 + 2 * max + (max > 0 ? 1 : 0);
  let pos = c.rng.int(lo, hi);
  if (max > 0 && c.rng.chance(0.4)) pos = c.rng.pick([...Array.from({ length: -lo }, (_, i) => lo + i), ...Array.from({ length: hi - 8 }, (_, i) => 9 + i)]);
  let p: Pitch = naturalAt(clef, pos);
  if (c.scope.accidentals && c.rng.chance(0.35)) p = { ...p, alter: c.rng.pick([1, -1]) };
  if (c.scope.doubleAccidentals && c.rng.chance(0.2)) p = { ...p, alter: c.rng.pick([2, -2]) };
  if (ledgerLines(clef, p) > max) return null;
  const sign = p.alter ? `, with a ${SIGN_WORD[p.alter]} sign in front of it` : "";
  return {
    prompt: p.alter ? "Name this note, including its sharp, flat or natural." : "Name this note.",
    music: frag(clef, [{ events: [note(p)] }], `${clef === "alto" ? "An" : "A"} ${clef}-clef stave with one semibreve on the ${describePosition(pos)}${sign}.`),
    answer: { kind: "pitch", accepted: [F(p)], octaveSensitive: c.template.acceptance.octaveSensitive, spellingSensitive: true, relation: "same" },
    hints: [`The note is on the ${describePosition(pos)}. The bottom line of the ${clef} clef is ${FC(naturalAt(clef, 0))}: count up (or down) one letter for each line and space.`],
  };
};

const noteWrite: Gen = (c) => {
  const clef = clefOf(c);
  const max = maxLedger(c);
  const step = c.rng.pick(music.STEPS);
  const alter = c.scope.accidentals && c.rng.chance(0.3) ? c.rng.pick([1, -1]) : 0;
  const target = { step, alter, position: "any" as const, maxLedgerLines: max };
  const answer = { kind: "staff-position" as const, clef, target, accepted: [] as string[], octaveSensitive: true };
  const valid = staffTargets(answer, max);
  if (!valid.length) return null;
  answer.accepted = valid.map(F);
  return {
    prompt: `Write ${nameOf({ step, alter })} in the ${clef} clef. ${max ? `You may use up to ${max} ledger line${max > 1 ? "s" : ""}.` : "Keep it on the stave (no ledger lines)."} Any ${nameOf({ step, alter })} that fits is correct.`,
    answer,
    hints: [`In the ${clef} clef the bottom line is ${FC(naturalAt(clef, 0))}. Count up one letter for each line and space until you reach ${step}.`],
  };
};

const BLACK = [
  ["C#", "Db"],
  ["D#", "Eb"],
  ["F#", "Gb"],
  ["G#", "Ab"],
  ["A#", "Bb"],
];
const keyboard: Gen = (c) => {
  if (c.template.id.includes("tone-semitone")) {
    const lowKey = c.rng.int(48, 59);
    const dist = c.rng.pick([1, 2]);
    const spell = (k: number) => {
      const s = spellingsOfKey(k).filter((p) => Math.abs(p.alter) <= 1);
      return s.find((p) => p.alter === 0) ?? s.find((p) => p.alter === 1) ?? s[0]!;
    };
    const a = spell(lowKey);
    const b = spell(lowKey + dist);
    if ((a.alter || b.alter) && !c.scope.blackKeys && !c.scope.accidentals) return null;
    return {
      prompt: "Is the distance between these two keys a tone or a semitone?",
      music: { presentation: "keyboard", clef: "treble", showKeySignature: false, measures: [{ events: [note(a), note(b)] }], textAlternative: `Two highlighted piano keys: ${nameOf(a)} and the ${dist === 1 ? "very next" : "next-but-one"} key above it, ${nameOf(b)}.` },
      answer: { kind: "choice", options: [{ id: "tone", label: "A tone" }, { id: "semitone", label: "A semitone" }], correctOptionIds: [dist === 2 ? "tone" : "semitone"] },
      hints: ["A semitone is from one key to the very next key, black or white. A tone is two semitones."],
    };
  }
  const black = Boolean(c.scope.blackKeys || c.scope.accidentals) && c.rng.chance(0.45);
  if (!black) {
    const step = c.rng.pick(music.STEPS);
    const ref = `${step}4`;
    return { prompt: `Find ${step} on the keyboard. Any ${step} is correct.`, answer: { kind: "pitch", reference: ref, relation: "same", accepted: [ref], octaveSensitive: false, spellingSensitive: true }, hints: [`Look for the groups of two and three black keys. ${step === "C" ? "C is just to the left of a group of two black keys." : step === "F" ? "F is just to the left of a group of three black keys." : "Find C (left of the two black keys) and count up the white keys."}`] };
  }
  const pair = c.rng.pick(BLACK);
  const which = c.rng.int(0, 1);
  const ref = `${pair[which]}4`;
  return { prompt: `Find ${pretty(pair[which]!)} on the keyboard. Any octave is correct.`, answer: { kind: "pitch", reference: ref, relation: "same-sound", accepted: [`${pair[0]}4`, `${pair[1]}4`], octaveSensitive: false, spellingSensitive: false }, hints: [`A ${which === 0 ? "sharp" : "flat"} is the key just ${which === 0 ? "to the right of (above)" : "to the left of (below)"} ${pair[which]![0]}.`] };
};

function eventsPerBar(ts: string): { value: music.NoteValue; count: number } {
  const t = music.parseTimeSignature(ts);
  const value = ({ 2: "minim", 4: "crotchet", 8: "quaver", 16: "semiquaver" } as Record<number, music.NoteValue>)[t.bottom] ?? "crotchet";
  return { value, count: t.top };
}

const accidentalState: Gen = (c) => {
  if (!c.scope.accidentals) return null;
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const clef = clefOf(c);
  const ts = c.rng.pick(c.scope.timeSignatures?.length ? c.scope.timeSignatures : ["4/4"]);
  const { value, count } = eventsPerBar(ts);
  if (count < 2) return null;
  const max = maxLedger(c);
  const pos = c.rng.int(1, 7);
  const base = naturalAt(clef, pos);
  const sa = music.signatureAlter(key, base.step);
  const scenarios = ["persists", "next-bar", "cancelled", ...(sa !== 0 ? ["signature"] : []), ...(c.scope.ties ? ["tied"] : []), "other-octave"];
  const scenario = c.rng.pick(scenarios);
  const accAlters = [sa === 0 ? c.rng.pick([1, -1]) : 0, ...(c.scope.doubleAccidentals ? [sa + (sa >= 0 ? 1 : -1)] : [])].filter((x) => x !== sa && Math.abs(x) <= 2);
  const acc = c.rng.pick(accAlters);
  const fillerStep = (avoid: music.Step) => {
    const choices = music.STEPS.filter((s) => s !== avoid);
    const s = c.rng.pick(choices);
    const p = { step: s, alter: music.signatureAlter(key, s), octave: base.octave };
    return fits(clef, [p], max) ? p : { ...p, octave: base.octave };
  };
  const at = (alter: number, octave = base.octave): Pitch => ({ step: base.step, alter, octave });
  const fill = (k: number) => Array.from({ length: k }, () => fillerStep(base.step));
  let bars: Pitch[][];
  let targetIndex: [number, number];
  let ties: Array<[number, number]> = [];
  const lastSlot = count - 1;
  switch (scenario) {
    case "persists":
      bars = [[at(acc), ...fill(lastSlot - 1), at(acc)]];
      targetIndex = [0, lastSlot];
      break;
    case "next-bar":
      bars = [[at(acc), ...fill(lastSlot)], [at(sa), ...fill(lastSlot)]];
      targetIndex = [1, 0];
      break;
    case "cancelled": {
      const cancel = sa === 0 ? 0 : acc === 0 ? sa : 0;
      if (cancel === acc) return null;
      bars = [[at(acc), at(cancel), ...fill(Math.max(0, lastSlot - 2)), at(cancel)].slice(0, count)];
      if (bars[0]!.length < 3) return null;
      targetIndex = [0, bars[0]!.length - 1];
      break;
    }
    case "signature":
      bars = [[...fill(lastSlot), at(sa)]];
      targetIndex = [0, lastSlot];
      break;
    case "tied":
      bars = [[...fill(lastSlot), at(acc)], [at(acc), ...fill(lastSlot)]];
      ties = [[0, lastSlot]];
      targetIndex = [1, 0];
      break;
    default: {
      const oct = base.octave + (staffPosition(clef, at(acc, base.octave + 1)) <= 8 + 2 * max ? 1 : -1);
      if (!fits(clef, [at(acc, oct)], max)) return null;
      bars = [[at(acc), ...fill(lastSlot - 1), at(sa, oct)]];
      targetIndex = [0, lastSlot];
    }
  }
  if (!fits(clef, bars.flat(), max)) return null;
  const measures: Measure[] = bars.map((b, bi) => ({
    events: b.map((p, i) => note(p, value, { ...(bi === targetIndex[0] && i === targetIndex[1] ? { label: "*" } : {}), ...(ties.some(([tb, ti]) => tb === bi && ti === i) ? { tieToNext: true } : {}) })),
  }));
  const f = frag(clef, measures, "", { key: keyText, timeSignature: ts });
  const target = f.measures[targetIndex[0]]!.events![targetIndex[1]]!;
  if (target.kind !== "note" || target.writtenAccidental) return null; // the marked note must carry no sign of its own
  const describe = (m: Measure, bi: number) =>
    `Bar ${bi + 1}: ` + (m.events ?? []).map((e) => (e.kind === "note" ? `${P(e.pitch).step} ${describePosition(staffPosition(clef, P(e.pitch)))}${e.writtenAccidental ? ` with a ${e.writtenAccidental.replace("-", " ")} sign` : ""}${e.label ? " (marked *)" : ""}${e.tieToNext ? " tied over" : ""}` : "rest")).join(", ") + ".";
  const sig = music.keySignature(key);
  f.textAlternative = `${clef} clef, key signature: ${sig.count ? `${sig.count} ${sig.count === 1 ? sig.type.slice(0, -1) : sig.type}` : "none"}, ${ts}. ${f.measures.map(describe).join(" ")}`;
  return {
    prompt: "What is the note marked *? Give its letter name and any sharp, flat or natural that applies to it.",
    music: f,
    answer: { kind: "pitch", accepted: [F(P(target.pitch))], octaveSensitive: false, spellingSensitive: true, relation: "same" },
    hints: ["An accidental lasts until the end of the bar, but only on its own line or space. A key signature applies in every octave."],
  };
};

const enharmonic: Gen = (c) => {
  const step = c.rng.pick(music.STEPS);
  const alter = c.rng.pick([-1, 0, 1, 0, 1, -1, ...(c.scope.doubleAccidentals ? [2, -2] : [])]);
  const ref: Pitch = { step, alter, octave: 4 };
  const spellings = spellingsOfKey(music.chromaticNumber(ref)).filter((p) => !(p.step === step) && Math.abs(p.alter) <= (c.scope.doubleAccidentals ? 2 : 1));
  if (!spellings.length) return null;
  return {
    prompt: `Give a note that sounds the same as ${nameOf(ref)} but has a different letter name.`,
    answer: { kind: "pitch", reference: F(ref), relation: "different-spelling", accepted: spellings.map(F), octaveSensitive: false, spellingSensitive: true },
    hints: ["Find the key on the keyboard, then name it from the white key on either side."],
  };
};

// ---------------------------------------------------------------------------
// Scales, keys, degrees, chromatic
// ---------------------------------------------------------------------------

const scaleBuild: Gen = (c) => {
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const forms = key.mode === "major" ? (["major"] as const) : (c.scope.minorForms ?? []);
  if (!forms.length) return null;
  const form = c.rng.pick(forms as readonly ("major" | "harmonic" | "melodic")[]);
  const directions: Array<"ascending" | "descending" | "ascending-descending"> = ["ascending", "descending", ...(form === "melodic" || c.template.grade >= 3 ? (["ascending-descending"] as const) : [])];
  const direction = c.rng.pick(directions);
  const clef = clefOf(c);
  const max = maxLedger(c);
  for (const octave of c.rng.shuffle([2, 3, 4, 5])) {
    const start: Pitch = { ...key.tonic, octave: direction === "descending" ? octave + 1 : octave };
    const notes = deriveScale(keyText, form, direction, start);
    if (!fits(clef, notes, max)) continue;
    const scaleName = form === "major" ? `scale of ${keyName(keyText)}` : `${nameOf(key.tonic)} ${form} minor scale`;
    return {
      prompt: `Write the ${scaleName}, ${direction.replace("-", " then ")}, in the ${clef} clef. Use accidentals instead of a key signature. The first note is written for you.`,
      answer: { kind: "pitch-sequence", clef, key: keyText, accepted: [notes.map(F)], derivation: { rule: "scale", key: keyText, form, direction, start: F(start) } },
      hints: [form === "major" ? "Major pattern: tone, tone, semitone, tone, tone, tone, semitone." : form === "harmonic" ? "Harmonic minor: the key-signature notes with the 7th raised a semitone, going up and coming down." : "Melodic minor raises the 6th and 7th going up, and lowers them again coming down."],
    };
  }
  return null;
};

const keySignature: Gen = (c) => {
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const clef = clefOf(c);
  if (c.template.id.endsWith("relative-key")) {
    const rel = music.formatKey(music.relativeKey(key));
    if (!(c.scope.keys ?? []).includes(rel)) return null;
    return { prompt: `What is the relative ${key.mode === "major" ? "minor" : "major"} of ${keyName(keyText)}?`, answer: { kind: "key-signature", task: "name-key", clef, accepted: [rel] }, hints: ["Relative keys share a key signature. The relative minor starts on the 6th note of the major scale."] };
  }
  if (c.template.grade >= 2 && c.rng.chance(0.5)) {
    return { prompt: `Write the key signature of ${keyName(keyText)} in the ${clef} clef.`, answer: { kind: "key-signature", task: "write-signature", clef, accepted: [keyText] }, hints: ["Sharps are written in the order F C G D A E B; flats in the order B E A D G C F."] };
  }
  const rel = music.formatKey(music.relativeKey(key));
  const both = (c.scope.keys ?? []).includes(rel);
  const majorOnly = !(c.scope.keys ?? []).some((k) => k.endsWith("minor"));
  return {
    prompt: majorOnly ? "Name the major key with this key signature." : "Name a key with this key signature (major or minor).",
    answer: { kind: "key-signature", task: "name-key", clef, accepted: both && !majorOnly ? [keyText, rel] : [key.mode === "major" || !both ? keyText : rel] },
    hints: ["For sharps, the key is a semitone above the last sharp. For flats, it is the second-to-last flat (F major has one flat)."],
  };
};

const degree: Gen = (c) => {
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const clef = clefOf(c);
  const d = c.rng.int(1, 7);
  const pc = scale(key, key.mode === "major" ? "major" : "harmonic")[d - 1]!;
  const max = maxLedger(c);
  const octaves = [2, 3, 4, 5].filter((o) => fits(clef, [{ ...pc, octave: o }], max) && staffPosition(clef, { ...pc, octave: o }) >= -1 && staffPosition(clef, { ...pc, octave: o }) <= 9);
  if (!octaves.length) return null;
  const p = { ...pc, octave: c.rng.pick(octaves) };
  const technical = c.scope.degreeNaming === "technical";
  const options = technical ? music.TECHNICAL_NAMES.map((t) => ({ id: t.replace(/ /g, "-"), label: t })) : [1, 2, 3, 4, 5, 6, 7].map((x) => ({ id: String(x), label: ORD(x) }));
  return {
    prompt: technical ? `Give the technical name of this note in ${keyName(keyText)}.` : `In ${keyName(keyText)}, which degree of the scale is this note?`,
    music: frag(clef, [{ events: [note(p)] }], `A ${clef}-clef stave in ${keyText}${c.scope.keySignatures ? " with its key signature" : ""}, showing ${nameOf(p)}.`, { key: keyText, showKeySignature: Boolean(c.scope.keySignatures) }),
    answer: { kind: "choice", options, correctOptionIds: [technical ? music.TECHNICAL_NAMES[d - 1]!.replace(/ /g, "-") : String(d)] },
    hints: [`Count up the scale of ${keyName(keyText)} from the tonic, ${nameOf(key.tonic)}, which is degree 1.`],
  };
};

const chromatic: Gen = (c) => {
  const clef = clefOf(c);
  const max = maxLedger(c);
  const direction = c.rng.pick(["ascending", "descending"] as const);
  for (let i = 0; i < 6; i++) {
    const step = c.rng.pick(music.STEPS);
    const start: Pitch = { step, alter: c.rng.pick([0, 0, 1, -1]), octave: c.rng.pick([3, 4]) };
    if ((start.alter === 1 && (step === "E" || step === "B")) || (start.alter === -1 && (step === "C" || step === "F"))) continue;
    const notes = music.chromaticFrom(start, direction);
    if (!fits(clef, notes, max)) continue;
    return {
      prompt: `Write a chromatic scale ${direction} from ${nameOf(start)}, one octave, in the ${clef} clef. Use every letter name at least once and no more than twice.`,
      answer: { kind: "pitch-sequence", clef, accepted: [notes.map(F)], derivation: { rule: "chromatic", start: F(start), direction } },
      hints: ["Move by a semitone each time. Between two letters a tone apart, add one note with the same letter as one of them plus an accidental."],
    };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Intervals and chords
// ---------------------------------------------------------------------------

const QUAL_WORD: Record<string, string> = { d: "diminished", m: "minor", M: "major", P: "perfect", A: "augmented" };
const interval: Gen = (c) => {
  const clef = clefOf(c);
  const max = maxLedger(c);
  const sc = c.scope;
  const withQuality = sc.intervalQuality === "number-and-quality";
  const build = c.template.mode !== "identify" ? true : c.rng.chance(0.35) && sc.intervalLowerNote !== "any";
  if (sc.intervalLowerNote === "any") {
    const lower: Pitch = { step: c.rng.pick(music.STEPS), alter: c.rng.pick([0, 0, 1, -1]), octave: c.rng.pick([3, 4]) };
    const pool = ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7", "P8", ...(sc.chromaticIntervals ? ["A4", "d5", "A2", "d7", "A5", "d4", "A6", "d3"] : []), ...(sc.compoundIntervals ? ["M9", "m10", "M10", "P11", "P12", "m13"] : [])];
    const code = c.rng.pick(pool);
    const iv = music.parseInterval(code);
    const upper = music.transpose(lower, iv, "up");
    if (Math.abs(upper.alter) > (sc.doubleAccidentals ? 2 : 1) || !fits(clef, [lower, upper], max)) return null;
    const accepted = iv.number > 8 ? [code, `c${iv.quality}${iv.number - 7}`] : [code];
    return {
      prompt: iv.number > 8 ? "Name this compound interval (for example, major 10th or compound major 3rd)." : "Name this interval: give its quality and number (for example, major 3rd).",
      music: frag(clef, [{ events: [note(lower), note(upper)] }], `Two semibreves in the ${clef} clef, one after the other: ${pretty(F(lower))} then ${pretty(F(upper))} above it.`),
      answer: { kind: "interval", task: "identify", lower: F(lower), upper: F(upper), acceptedIntervals: accepted },
      hints: ["Count the letter names from the lower note to the upper note (both included) for the number. Then compare the top note with the major scale of the lower note."],
    };
  }
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const forms = allowedForms(key, sc);
  if (!forms.length) return null;
  const number = c.rng.int(2, 8);
  const octaves = c.rng.shuffle([2, 3, 4, 5]);
  for (const o of octaves) {
    const lower: Pitch = { ...key.tonic, octave: o };
    const d = music.diatonicNumber(lower) + number - 1;
    const step = music.STEPS[((d % 7) + 7) % 7]!;
    const alters = [...new Set(forms.flatMap((f) => scale(key, f)).filter((x) => x.step === step).map((x) => x.alter))];
    const uppers = alters.map((alter) => ({ step, alter, octave: Math.floor(d / 7) }));
    if (!fits(clef, [lower, ...uppers], max)) continue;
    const upper = c.rng.pick(uppers);
    const iv = music.intervalBetween(lower, upper);
    const ivCode = `${iv.quality}${iv.number}`;
    const sigText = `The lower note is the tonic of ${keyName(keyText)}.`;
    if (build) {
      const target = withQuality ? ivCode : String(number);
      return {
        prompt: withQuality ? `Write a note above ${nameOf(lower)} to make a ${QUAL_WORD[iv.quality]} ${ORD(number)}.` : `Write a note above ${nameOf(lower)} to make a ${ORD(number)} in ${keyName(keyText)}.`,
        music: frag(clef, [{ events: [note(lower)] }], `A semibreve ${nameOf(lower)} in the ${clef} clef.`),
        answer: { kind: "interval", task: "build", key: keyText, lower: F(lower), target, direction: "up", acceptedPitches: withQuality ? [F(upper)] : uppers.map(F) },
        hints: [`Count ${number} letter names up from ${nameOf(lower)}, counting ${nameOf(lower)} as 1.`],
      };
    }
    return {
      prompt: withQuality ? `Name this interval (quality and number). ${sigText}` : `Give the number of this interval (for example, 3rd). ${sigText}`,
      music: frag(clef, [{ events: [note(lower), note(upper)] }], `Two semibreves in the ${clef} clef: ${pretty(F(lower))}, then ${pretty(F(upper))} above it.`),
      answer: { kind: "interval", task: "identify", key: keyText, lower: F(lower), upper: F(upper), acceptedIntervals: [withQuality ? ivCode : String(iv.number)] },
      hints: ["Count every letter name from the bottom note to the top note, including both."],
    };
  }
  return null;
};

const triadChord: Gen = (c) => {
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const romans = (c.scope.chordDegrees?.length ? c.scope.chordDegrees : ["I"]) as string[];
  const inversions = (c.scope.inversions?.length ? c.scope.inversions : ["a"]) as Array<"a" | "b" | "c">;
  const roman = c.rng.pick(romans);
  const inversion = c.rng.pick(inversions);
  const clef = clefOf(c);
  const max = maxLedger(c);
  const identify = c.template.mode === "identify" || c.template.mode === "apply-in-context";
  for (const o of c.rng.shuffle([2, 3, 4])) {
    const voicing = music.voiceTriad(key, roman, inversion, o);
    if (!fits(clef, voicing, max) || voicing.some((p) => staffPosition(clef, p) < -2 * max - 1 || staffPosition(clef, p) > 8 + 2 * max + 1)) continue;
    const posWord = inversion === "a" ? "root position" : inversion === "b" ? "first inversion (b): the 3rd in the bass" : "second inversion (c): the 5th in the bass";
    const tonic = romans.length === 1 && roman === "I";
    if (identify) {
      return {
        prompt: `Name this chord in ${keyName(keyText)}: give its Roman numeral and position (for example, IVb).`,
        music: frag(clef, [{ events: [{ kind: "chord", notes: voicing.map((p) => ({ pitch: F(p) })), duration: { value: "semibreve", dots: 0 } } as NotationEvent] }], `A chord in the ${clef} clef, ${keyText}: ${voicing.map((p) => nameOf(p)).join(", ")} from the bottom up.`, { key: keyText, showKeySignature: Boolean(c.scope.keySignatures) }),
        answer: { kind: "chord", task: "identify", key: keyText, acceptedChords: [{ roman: roman as "I", inversion }] },
        hints: ["Rearrange the notes into a stack of 3rds to find the root, then look at the lowest note for the position."],
      };
    }
    return {
      prompt: tonic ? `Write the tonic triad of ${keyName(keyText)} in the ${clef} clef, in root position, using accidentals.` : `Write chord ${roman}${inversion === "a" ? "" : inversion} of ${keyName(keyText)} in the ${clef} clef (${posWord}).`,
      answer: { kind: "chord", task: "build", key: keyText, target: { roman: roman as "I", inversion }, acceptedVoicings: [voicing.map(F)] },
      hints: [`Chord ${roman} is built on degree ${music.romanDegree(roman)} of the scale: that note, the 3rd above it and the 5th above it.`],
    };
  }
  return null;
};

const cadence: Gen = (c) => {
  const keys = c.scope.cadenceKeys?.length ? c.scope.cadenceKeys : keysOf(c);
  const keyText = c.rng.pick(keys);
  const key = parseKey(keyText);
  const romans = (c.scope.chordDegrees?.length ? c.scope.chordDegrees : ["I", "ii", "IV", "V"]) as string[];
  const types = c.scope.cadenceTypes?.length ? c.scope.cadenceTypes : ["perfect", "plagal", "imperfect"];
  const pairs: Array<[string, string, string]> = [];
  for (const a of romans) for (const b of romans) {
    const t = music.classifyCadence(a, b);
    if (t && types.includes(t)) pairs.push([a, b, t]);
  }
  if (!pairs.length) return null;
  const [r1, r2, type] = c.rng.pick(pairs);
  if (c.template.id.includes("identify")) {
    const v1 = music.voiceTriad(key, r1, "a", 4);
    const v2 = music.voiceTriad(key, r2, "a", 4);
    const ev = (v: Pitch[]): NotationEvent => ({ kind: "chord", notes: v.map((p) => ({ pitch: F(p) })), duration: { value: "minim", dots: 0 } }) as NotationEvent;
    return {
      prompt: `These two chords end a phrase in ${keyName(keyText)}. Which cadence do they make?`,
      music: frag("treble", [{ events: [ev(v1), ev(v2)] }], `Two chords in ${keyText}: ${v1.map(nameOf).join(" ")} then ${v2.map(nameOf).join(" ")}.`, { key: keyText }),
      answer: { kind: "choice", options: types.map((t) => ({ id: t, label: `${t[0]!.toUpperCase()}${t.slice(1)}` })), correctOptionIds: [type] },
      hints: ["Name each chord by its root first. V–I is perfect, IV–I plagal, and any cadence ending on V is imperfect."],
    };
  }
  const melody = [c.rng.pick(music.triad(key, r1)), c.rng.pick(music.triad(key, r2))].map((pc) => ({ ...pc, octave: music.stepIndex(pc.step) >= 5 ? 4 : 5 }));
  const cand = melody.map((m) => music.chordsContaining(key, [m], romans));
  const valid: Array<[string, string, string]> = [];
  for (const a of cand[0]!) for (const b of cand[1]!) {
    const t = music.classifyCadence(a, b);
    if (t && types.includes(t)) valid.push([a, b, t]);
  }
  const acceptedA = [...new Set(valid.map((v) => v[0]))];
  const acceptedB = [...new Set(valid.map((v) => v[1]))];
  const acceptedTypes = [...new Set(valid.map((v) => v[2]))] as Array<"perfect" | "plagal" | "imperfect">;
  return {
    prompt: `Choose a chord for each marked melody note (A and B) in ${keyName(keyText)} so that A–B makes a cadence. Each chord must contain its melody note.`,
    music: frag("treble", [{ events: [note(melody[0]!, "minim", { label: "A" }), note(melody[1]!, "minim", { label: "B" })] }], `A two-note melody in ${keyText}: A is ${nameOf(melody[0]!)}, B is ${nameOf(melody[1]!)}.`, { key: keyText }),
    answer: { kind: "chord-progression", key: keyText, points: [{ label: "A", melodyPitches: [F(melody[0]!)], accepted: acceptedA as never }, { label: "B", melodyPitches: [F(melody[1]!)], accepted: acceptedB as never }], cadences: [{ labels: ["A", "B"], acceptedTypes }] },
    hints: ["List the chords that contain each melody note, then look for a pair that makes V–I, IV–I or ends on V."],
  };
};

// ---------------------------------------------------------------------------
// Transposition and ornaments
// ---------------------------------------------------------------------------

function melodyIn(c: GenCtx, key: music.Key, clef: Clef, len: number): Pitch[] | null {
  const pcs = scale(key, key.mode === "major" ? "major" : "harmonic").slice(0, 7);
  const max = maxLedger(c);
  for (const o of c.rng.shuffle([2, 3, 4, 5])) {
    let d = c.rng.int(0, 4);
    const out: Pitch[] = [];
    for (let i = 0; i < len; i++) {
      const pc = pcs[((d % 7) + 7) % 7]!;
      out.push({ ...pc, octave: o + Math.floor((music.stepIndex(key.tonic.step) + d) / 7) });
      d += c.rng.pick([-2, -1, 1, 1, 2]);
    }
    // Recompute octaves from diatonic movement so the line moves by step/skip.
    if (fits(clef, out, max) && out.every((p) => Math.abs(staffPosition(clef, p) - 4) <= 6 + 2 * max)) return out;
  }
  return null;
}

const transposition: Gen = (c) => {
  const insts = c.scope.instrumentTranspositions ?? [];
  if (insts.length) {
    const inst = c.rng.pick(insts) as music.InstrumentKey;
    const toWritten = c.rng.chance(0.6);
    const keyText = c.rng.pick(keysOf(c).filter((k) => parseKey(k).mode === "major" || c.rng.chance(0.3)));
    const key = parseKey(keyText);
    let newKey: music.Key;
    try {
      newKey = toWritten ? music.writtenKeyFor(key, inst) : music.concertKeyFor(key, inst);
    } catch {
      return null;
    }
    if (!(c.scope.keys ?? []).includes(music.formatKey(newKey))) return null;
    const src = melodyIn(c, key, "treble", 5);
    if (!src) return null;
    const iv = music.INSTRUMENT_INTERVAL[inst];
    const dir = toWritten ? "up" : "down";
    const out = src.map((p) => music.transpose(p, iv, dir));
    if (!fits("treble", out, maxLedger(c)) || out.some((p) => Math.abs(p.alter) > (c.scope.doubleAccidentals ? 2 : 1))) return null;
    const instName = music.TRANSPOSING_INSTRUMENTS.find((t) => t.in === inst)!.name;
    const ivName = music.describeInterval(iv);
    return {
      prompt: toWritten
        ? `This melody is at concert pitch. Write it as it would appear in a part for ${pretty(instName)}, which sounds a ${ivName} lower than written: transpose it up a ${ivName}, with the new key signature.`
        : `This melody is written for ${pretty(instName)}. Write it at concert pitch (as it sounds): down a ${ivName}, with the new key signature.`,
      music: frag("treble", [{ events: src.map((p) => note(p, "crotchet")) }], `A five-note melody in ${keyText}: ${src.map(nameOf).join(", ")}.`, { key: keyText }),
      answer: { kind: "pitch-sequence", clef: "treble", key: music.formatKey(newKey), accepted: [out.map(F)], derivation: { rule: "transpose", interval: `${iv.quality}${iv.number}`, direction: dir, sourceKey: keyText } },
      hints: [`First transpose the key: ${keyName(keyText)} ${dir} a ${ivName} is ${keyName(music.formatKey(newKey))}. Then move every note by the same interval.`],
    };
  }
  const clefs = (c.scope.octaveTranspositionClefs ?? []) as Clef[];
  if (!clefs.length) return null;
  const from = c.rng.pick(clefs);
  const to = c.rng.pick(clefs);
  const keyText = c.rng.pick(keysOf(c));
  const key = parseKey(keyText);
  const src = melodyIn(c, key, from, 4);
  if (!src) return null;
  const dir = staffPosition(to, music.transpose(src[0]!, music.parseInterval("P8"), "up")) <= 8 + maxLedger(c) * 2 && c.rng.chance(0.5) ? "up" : "down";
  const out = src.map((p) => music.transpose(p, music.parseInterval("P8"), dir));
  if (!fits(to, out, maxLedger(c))) return null;
  return {
    prompt: `Write this melody an octave ${dir === "up" ? "higher" : "lower"} in the ${to} clef${to === from ? " (the same clef)" : ""}, keeping the key signature.`,
    music: frag(from, [{ events: src.map((p) => note(p, "crotchet")) }], `A four-note melody in the ${from} clef, ${keyText}: ${src.map(nameOf).join(", ")}.`, { key: keyText }),
    answer: { kind: "pitch-sequence", clef: to, key: keyText, accepted: [out.map(F)], derivation: { rule: "transpose", interval: "P8", direction: dir, sourceKey: keyText } },
    hints: [to === from ? "An octave moves every note seven letter names, so a line note becomes a space note and a space note becomes a line note." : `Work out the first note in the ${to} clef, then keep the same shape for the rest.`],
  };
};

const ornament: Gen = (c) => {
  const signs = (c.scope.ornaments?.length ? c.scope.ornaments : music.ORNAMENTS) as music.Ornament[];
  const main: Pitch = { step: c.rng.pick(["C", "D", "E", "F", "G", "A"] as music.Step[]), alter: 0, octave: 5 };
  const above = music.pitchFromNumbers(music.diatonicNumber(main) + 1, 0);
  const below = music.pitchFromNumbers(music.diatonicNumber(main) - 1, 0);
  const nat = (p: Pitch) => ({ ...p, alter: 0 });
  if (c.template.mode === "build") {
    const figures: Partial<Record<music.Ornament, Pitch[]>> = {
      "upper-mordent": [main, nat(above), main],
      "lower-mordent": [main, nat(below), main],
      turn: [nat(above), main, nat(below), main],
      trill: [nat(above), main, nat(above), main, nat(above), main, nat(below), main],
    };
    const options = signs.filter((s) => figures[s]);
    if (!options.length) return null;
    const sign = c.rng.pick(options);
    const fig = figures[sign]!;
    if (music.classifyOrnamentFigure(main, fig) !== sign) return null;
    return {
      prompt: "These written-out notes could be replaced by one ornament sign on the main note. Which ornament is it?",
      music: frag("treble", [{ events: fig.map((p, i) => note(p, "semiquaver", { beam: i === 0 ? "begin" : i === fig.length - 1 ? "end" : "continue" })) }], `Written-out notes around ${nameOf(main)}: ${fig.map(nameOf).join(", ")}.`),
      answer: { kind: "ornament-sign", task: "replace-written-out", mainNote: F(main), writtenOut: fig.map(F), accepted: [sign] },
      hints: ["Find the main note, then see whether the extra notes go above, below, or both."],
    };
  }
  const sign = c.rng.pick(signs);
  const ev = sign === "acciaccatura" || sign === "appoggiatura" ? note(main, "minim", { grace: { kind: sign, pitches: [F(nat(above))] } }) : note(main, "minim", { ornament: sign });
  return {
    prompt: "Name this ornament sign.",
    music: frag("treble", [{ events: [ev] }], `A minim ${nameOf(main)} with an ornament sign: ${sign === "acciaccatura" ? "a small note with a slash through its stem before it" : sign === "appoggiatura" ? "a small note without a slash before it" : sign === "trill" ? "the letters tr above the note" : sign === "turn" ? "a sideways S-shaped sign above the note" : sign === "upper-mordent" ? "a short zig-zag above the note" : "a short zig-zag with a vertical line through it above the note"}.`),
    answer: { kind: "ornament-sign", task: "name-sign", sign, accepted: [sign] },
    hints: ["Small notes before the main note are grace notes; signs above the note are trills, turns and mordents."],
  };
};

// ---------------------------------------------------------------------------
// Rhythm families
// ---------------------------------------------------------------------------

const tsOf = (c: GenCtx, fallback = ["2/4", "3/4", "4/4"]) => c.rng.pick(c.scope.timeSignatures?.length ? c.scope.timeSignatures : fallback);
const rhythmLine = (measures: Measure[], extra: Partial<NotationFragment> = {}): NotationFragment => ({ presentation: "rhythm-line", clef: "treble", showKeySignature: false, measures, textAlternative: describeRhythm(measures), ...extra }) as NotationFragment;

const timeSignature: Gen = (c) => {
  const ts = tsOf(c);
  const bars = [randomBar(c, ts, { noRests: true }), randomBar(c, ts)];
  if (bars.some((b) => !b)) return null;
  const cap = music.barCapacity(music.parseTimeSignature(ts));
  // Ambiguity: reject when the grouping would also be correct in another time signature with the same bar length.
  const rivals = (c.scope.timeSignatures ?? []).filter((t) => t !== ts && music.equals(music.barCapacity(music.parseTimeSignature(t)), cap));
  if (rivals.some((t) => bars.every((b) => music.checkBarAnyPattern(b as unknown as music.REvent[], t).issues.length === 0))) return null;
  if (bars.flat().length < 5) return null; // too few notes to show the beat grouping
  const measures = bars.map((events) => ({ events: events! }));
  return {
    prompt: "Add the time signature to this rhythm.",
    music: rhythmLine(measures),
    answer: { kind: "time-signature", accepted: [ts] },
    hints: ["Add up each bar. Then look at the beaming: groups of three quavers mean compound time."],
  };
};

const barlines: Gen = (c) => {
  const ts = tsOf(c);
  const bars: NotationEvent[][] = [];
  for (let i = 0; i < 3; i++) {
    const b = randomBar(c, ts);
    if (!b) return null;
    bars.push(b);
  }
  const measures: Measure[] = bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));
  return {
    prompt: `Add the bar-lines to this rhythm in ${ts}, and finish with a double bar-line.`,
    answer: { kind: "rhythm", task: "place-barlines", timeSignature: ts, accepted: [measures], acceptAnyRuleCompliant: false },
    hints: [`Count the beats: in ${ts} each bar holds ${music.describeMetre(music.metreStructure(ts))}.`],
  };
};

const barBuilder: Gen = (c) => {
  const ts = tsOf(c);
  const bar = randomBar(c, ts);
  if (!bar || bar.length < 2) return null;
  const k = c.rng.int(1, Math.max(1, bar.length - 1));
  const given = bar.slice(0, k).map((e) => {
    if (e.kind === "tuplet") return e;
    const { beam: _b, ...rest } = e as NotationEvent & { beam?: string };
    return rest as NotationEvent;
  });
  if (music.checkBarAnyPattern([...given, ...bar.slice(k)] as unknown as music.REvent[], ts, { requireBeams: false }).issues.length) return null;
  const full = [...given, ...bar.slice(k).map((e) => {
    if (e.kind === "tuplet") return e;
    const { beam: _b, ...rest } = e as NotationEvent & { beam?: string };
    return rest as NotationEvent;
  })];
  return {
    prompt: `Complete this bar of ${ts}. Keep what is given at the start, then add notes or rests so the bar adds up exactly. Keep the beats clear.`,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: ts, given, accepted: [[{ events: full }]], acceptAnyRuleCompliant: true },
    hints: [`${ts} has ${music.describeMetre(music.metreStructure(ts))} in each bar.`],
  };
};

const grouping: Gen = (c) => {
  const ts = tsOf(c);
  const s = music.metreStructure(ts);
  if (c.template.id.includes("rest-grouping")) {
    if (s.metre !== "simple" || s.groups.length < 3) return null;
    const beat = music.valueFor(s.beatUnit, 0);
    const two = music.valueFor(music.mul(s.beatUnit, music.frac(2)), 0);
    if (!beat || !two) return null;
    // A two-beat rest starting on beat 2 must be written as two one-beat rests.
    const question: NotationEvent[] = [n(beat.value), r(two.value), ...Array.from({ length: s.groups.length - 3 }, () => n(beat.value))];
    const fixed: NotationEvent[] = [n(beat.value), r(beat.value), r(beat.value), ...Array.from({ length: s.groups.length - 3 }, () => n(beat.value))];
    if (!music.checkBarAnyPattern(question as unknown as music.REvent[], ts).issues.length || music.checkBarAnyPattern(fixed as unknown as music.REvent[], ts).issues.length) return null;
    return {
      prompt: "Rewrite this bar with the rests grouped correctly. It must sound exactly the same.",
      music: rhythmLine([{ events: question }], { timeSignature: ts }),
      answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: fixed }]], acceptAnyRuleCompliant: true },
      hints: ["Each beat needs its own rest unless a rest fills half of a four-beat bar starting on beat 1 or 3."],
    };
  }
  const bar = randomBar(c, ts, { noRests: true, needBeams: true });
  if (!bar) return null;
  const strip = (e: NotationEvent): NotationEvent => {
    if (e.kind === "tuplet") return e;
    const { beam: _b, ...rest } = e as NotationEvent & { beam?: string };
    return rest as NotationEvent;
  };
  let question = bar.map(strip);
  // Sometimes beam across a beat instead of leaving flags.
  const beamable = (e: NotationEvent) => e.kind === "note" && ["quaver", "semiquaver", "demisemiquaver"].includes(e.duration.value);
  if (c.rng.chance(0.5)) {
    const idx = question.map((e, i) => (beamable(e) ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k + 1 < idx.length; k++) {
      const [a, b] = [idx[k]!, idx[k + 1]!];
      if (b !== a + 1) continue;
      const trial = question.map((e, i) => (i === a ? { ...e, beam: "begin" } : i === b ? { ...e, beam: "end" } : e)) as NotationEvent[];
      if (music.checkBarAnyPattern(trial as unknown as music.REvent[], ts).issues.some((x) => x.code.startsWith("beam"))) {
        question = trial;
        break;
      }
    }
  }
  if (!music.checkBarAnyPattern(question as unknown as music.REvent[], ts).issues.length) return null;
  return {
    prompt: "These notes are grouped in a way that hides the beats. Join and split the beams so each beat is clear.",
    music: rhythmLine([{ events: question }], { timeSignature: ts }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: bar }]], acceptAnyRuleCompliant: true },
    hints: [`In ${ts} there are ${music.describeMetre(s)}. Beam the quavers (and shorter notes) beat by beat.`],
  };
};

const tuplet: Gen = (c) => {
  if (c.template.id.includes("irregular-division")) {
    const opts = [
      { actual: 5, normal: 4, value: "semiquaver", beat: "crotchet" },
      { actual: 6, normal: 4, value: "semiquaver", beat: "crotchet" },
      { actual: 7, normal: 4, value: "semiquaver", beat: "crotchet" },
      { actual: 4, normal: 3, value: "quaver", beat: "dotted crotchet" },
    ];
    const o = c.rng.pick(opts);
    return {
      prompt: `A group of ${o.actual} ${o.value}s marked “${o.actual}” fills one ${o.beat} beat. It is played in the time of how many ${o.value}s?`,
      answer: { kind: "choice", options: [2, 3, 4, 6].map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: [String(o.normal)] },
      hints: [`How many ${o.value}s normally fit in a ${o.beat}?`],
    };
  }
  const duplet = (c.scope.tuplets ?? []).includes("duplet") && c.rng.chance(c.template.id.includes("duplet") ? 0.8 : 0.2);
  const pool = (c.scope.timeSignatures ?? []).filter((t) => music.classifyTimeSignature(t).metre === (duplet ? "compound" : "simple") && music.parseTimeSignature(t).bottom >= 4);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const s = music.metreStructure(ts);
  const unit = music.valueFor(duplet ? music.mul(s.beatUnit, music.frac(1, 3)) : music.mul(s.beatUnit, music.frac(1, 2)), 0);
  const beat = music.valueFor(s.beatUnit, 1);
  if (!unit || !beat) return null;
  const group: NotationEvent = { kind: "tuplet", actual: duplet ? 2 : 3, normal: duplet ? 3 : 2, events: Array.from({ length: duplet ? 2 : 3 }, (_, i) => n(unit.value, 0, { beam: i === 0 ? "begin" : i === (duplet ? 1 : 2) ? "end" : "continue" })) } as NotationEvent;
  const at = c.rng.int(0, s.groups.length - 1);
  const events = s.groups.map((_, i) => (i === at ? group : n(beat.value, beat.dots)));
  return {
    prompt: `Write one bar of ${ts} that uses a ${duplet ? "duplet (two notes in the time of three)" : "triplet (three notes in the time of two)"} somewhere in the bar.`,
    answer: { kind: "rhythm", task: "add-tuplet", timeSignature: ts, accepted: [[{ events }]], acceptAnyRuleCompliant: true },
    hints: [duplet ? "A duplet of two quavers fills one dotted-crotchet beat." : "A triplet of three quavers fills one crotchet beat."],
  };
};

const noteValue: Gen = (c) => {
  const id = c.template.id;
  const vals = (c.scope.noteValues ?? []) as music.NoteValue[];
  if (id.endsWith("tie-dot")) {
    const pairs: Array<[music.NoteValue, music.NoteValue, music.NoteValue, number]> = [
      ["minim", "crotchet", "minim", 1],
      ["crotchet", "quaver", "crotchet", 1],
      ["semibreve", "minim", "semibreve", 1],
      ["minim", "minim", "semibreve", 0],
      ["crotchet", "crotchet", "minim", 0],
      ["quaver", "semiquaver", "quaver", 1],
    ];
    const [a, b, v, dots] = c.rng.pick(pairs.filter((p) => vals.includes(p[0]) && vals.includes(p[1]) && vals.includes(p[2]) && p[3] <= (c.scope.maxDots ?? 0)));
    const total = music.add(music.dotted(a), music.dotted(b));
    const measures = [{ events: [n(a, 0, { tieToNext: true }), n(b)] }];
    return {
      prompt: "Write one note that lasts exactly as long as these two tied notes.",
      music: rhythmLine(measures, { textAlternative: `A ${a} tied to a ${b}.` }),
      answer: { kind: "rhythm", task: "equivalent-value", target: [total.n, total.d], accepted: [[{ events: [n(v, dots)] }]], acceptAnyRuleCompliant: true },
      hints: ["A dot adds half the note's own value."],
    };
  }
  if (id.endsWith(".rest")) {
    const v = c.rng.pick(vals.filter((x) => ["semibreve", "minim", "crotchet", "quaver", "semiquaver"].includes(x)));
    const opts = c.rng.shuffle(["semibreve", "minim", "crotchet", "quaver", "semiquaver"].filter((x) => vals.includes(x as never))).slice(0, 4);
    if (!opts.includes(v)) opts[0] = v;
    return {
      prompt: `Which rest lasts as long as a ${v}?`,
      music: rhythmLine([{ events: [n(v)] }], { textAlternative: `One ${v}.` }),
      answer: { kind: "choice", options: c.rng.shuffle(opts).map((x) => ({ id: x, label: `${x} rest` })), correctOptionIds: [v] },
      hints: ["Every note value has a rest of the same length and the same name."],
    };
  }
  if (id.includes("demisemiquaver") || id.includes("breve-double-dot")) {
    const q = id.includes("demisemiquaver")
      ? c.rng.pick([["semiquaver", 0, "demisemiquaver", 2], ["quaver", 0, "demisemiquaver", 4], ["crotchet", 0, "demisemiquaver", 8], ["quaver", 1, "demisemiquaver", 6]] as const)
      : c.rng.pick([["minim", 2, "quaver", 7], ["crotchet", 2, "semiquaver", 7], ["breve", 0, "crotchet", 8], ["breve", 1, "crotchet", 12], ["semibreve", 2, "crotchet", 7]] as const);
    const [value, dots, unit, count] = q;
    if (dots > (c.scope.maxDots ?? 0)) return null;
    const options = c.rng.shuffle([...new Set([count, count + 1, count - 1, count * 2, Math.max(1, count - 2)])].filter((x) => x > 0)).slice(0, 4);
    if (!options.includes(count)) options[0] = count;
    return {
      prompt: `How many ${unit}s last as long as a ${"double-".repeat(dots === 2 ? 1 : 0)}${dots === 1 ? "dotted " : dots === 2 ? "dotted " : ""}${value}?`,
      music: rhythmLine([{ events: [n(value as music.NoteValue, dots)] }], { textAlternative: `One ${dots === 2 ? "double-dotted " : dots === 1 ? "dotted " : ""}${value}.` }),
      answer: { kind: "choice", options: c.rng.shuffle(options).map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: [String(count)] },
      hints: ["Each dot adds half of the value before it: a double dot adds a half and then a quarter."],
    };
  }
  // How many crotchet beats?
  const pool: Array<[music.NoteValue, number, number]> = [["semibreve", 0, 4], ["minim", 0, 2], ["crotchet", 0, 1], ["minim", 1, 3], ["semibreve", 1, 6]];
  const [value, dots, beats] = c.rng.pick(pool.filter((p) => vals.includes(p[0]) && p[1] <= (c.scope.maxDots ?? 0)));
  const options = [1, 2, 3, 4, 6].filter((x) => x !== beats).slice(0, 3).concat(beats).sort((a, b) => a - b);
  return {
    prompt: `How many crotchet beats does this ${dots ? "dotted " : ""}${value} last?`,
    music: rhythmLine([{ events: [n(value, dots)] }], { textAlternative: `One ${dots ? "dotted " : ""}${value}.` }),
    answer: { kind: "choice", options: options.map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: [String(beats)] },
    hints: ["A semibreve lasts 4 crotchet beats, a minim 2, a crotchet 1. A dot adds half again."],
  };
};

// ---------------------------------------------------------------------------
// Vocabulary and score observation
// ---------------------------------------------------------------------------

const choiceFamily: Gen = (c) => {
  const id = c.template.id;
  if (id.endsWith("voices")) {
    const vs = c.rng.shuffle(music.VOICES).slice(0, 4);
    const top = (v: music.VoiceInfo) => music.chromaticNumber(P(v.range[1]));
    const highest = c.rng.chance(0.5);
    const sorted = [...vs].sort((a, b) => top(a) - top(b));
    if (top(sorted[0]!) === top(sorted[1]!) || top(sorted[sorted.length - 1]!) === top(sorted[sorted.length - 2]!)) return null;
    const ans = highest ? sorted[sorted.length - 1]! : sorted[0]!;
    return { prompt: `Which of these voices is usually the ${highest ? "highest" : "lowest"}?`, answer: { kind: "choice", options: vs.map((v) => ({ id: v.id, label: v.name })), correctOptionIds: [ans.id] }, hints: ["From highest to lowest: soprano, mezzo-soprano, alto, tenor, baritone, bass."] };
  }
  if (id.endsWith("instruments")) {
    const kind = c.rng.pick(["family", "clef", "transposing"] as const);
    if (kind === "family") {
      const inst = c.rng.pick(music.INSTRUMENTS.filter((i) => i.family !== "keyboard"));
      return { prompt: `To which family of the orchestra does the ${inst.name} belong?`, answer: { kind: "choice", options: ["strings", "woodwind", "brass", "percussion"].map((f) => ({ id: f, label: f })), correctOptionIds: [inst.family] }, hints: [`Think about how the ${inst.name} makes its sound.`] };
    }
    if (kind === "clef") {
      const inst = c.rng.pick(music.INSTRUMENTS.filter((i) => i.clefs.length === 1 || i.id === "viola"));
      return { prompt: `Which clef does the ${inst.name} normally use?`, answer: { kind: "choice", options: ["treble", "bass", "alto", "tenor"].map((f) => ({ id: f, label: `${f} clef` })), correctOptionIds: [inst.clefs[0]!] }, hints: ["High instruments read the treble clef and low ones the bass clef; one string instrument has its own clef."] };
    }
    const trans = music.INSTRUMENTS.filter((i) => i.transposition && i.id !== "double-bass");
    const plain = c.rng.shuffle(music.INSTRUMENTS.filter((i) => !i.transposition && i.family !== "keyboard")).slice(0, 3);
    const ans = c.rng.pick(trans);
    return { prompt: "Which of these is a transposing instrument (its music is written at a different pitch from the sound)?", answer: { kind: "choice", options: c.rng.shuffle([ans, ...plain]).map((i) => ({ id: i.id, label: i.name })), correctOptionIds: [ans.id] }, hints: ["Instruments 'in B♭', 'in A' or 'in F' are transposing instruments."] };
  }
  const pool = music.termsUpTo(c.template.grade);
  const target = c.rng.pick(pool);
  const same = (t: music.Term) => t.meaning === target.meaning;
  const preferred = pool.filter((t) => !same(t) && (target.opposite?.includes(t.id) || target.similar?.includes(t.id)));
  const others = c.rng.shuffle(pool.filter((t) => !same(t) && !preferred.includes(t)));
  const picks: music.Term[] = [];
  for (const t of [...c.rng.shuffle(preferred), ...others]) {
    if (picks.length === 3) break;
    if (!picks.some((p) => p.meaning === t.meaning)) picks.push(t);
  }
  if (picks.length < 3) return null;
  return {
    prompt: `What does “${target.term}” mean?`,
    answer: { kind: "choice", options: c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.meaning })), correctOptionIds: [target.id] },
    hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`],
  };
};

const scoreObservation: Gen = (c) => {
  const keyText = c.rng.pick(keysOf(c).filter((k) => k.endsWith("major")));
  if (!keyText) return null;
  const key = parseKey(keyText);
  const ts = c.rng.pick((c.scope.timeSignatures ?? ["4/4"]).filter((t) => music.classifyTimeSignature(t).metre === "simple" && music.parseTimeSignature(t).bottom === 4));
  if (!ts) return null;
  const clef = clefOf(c);
  const beats = music.parseTimeSignature(ts).top;
  const tune = melodyIn(c, key, clef, beats * 2);
  if (!tune) return null;
  const labelAt = c.rng.int(1, tune.length - 1);
  const measures: Measure[] = [0, 1].map((b) => ({ events: tune.slice(b * beats, b * beats + beats).map((p, i) => note(p, "crotchet", b * beats + i === labelAt ? { label: "x" } : {})) }));
  measures[1]!.barline = "final";
  const f = frag(clef, measures, `A two-bar melody in the ${clef} clef with a key signature, time signature ${ts}. The notes are ${tune.map(nameOf).join(", ")}; the note marked x is the ${ORD(labelAt + 1)} note.`, { key: keyText, timeSignature: ts });
  const marked = tune[labelAt]!;
  return {
    prompt: "Look at this melody and answer the questions.",
    music: f,
    answer: {
      kind: "composite",
      parts: [
        { id: "beats", prompt: "How many crotchet beats are in each bar?", answer: { kind: "choice", options: [2, 3, 4].map((x) => ({ id: String(x), label: String(x) })), correctOptionIds: [String(beats)] } },
        { id: "marked", prompt: "Name the note marked x.", answer: { kind: "pitch", reference: F(marked), relation: "same", accepted: [F(marked)], octaveSensitive: false, spellingSensitive: true } },
        { id: "key", prompt: "The melody is in a major key. Which one?", answer: { kind: "key-signature", task: "name-key", clef, accepted: [keyText] } },
      ],
    },
    hints: ["Use the time signature for the beats, the stave for the note, and the key signature for the key."],
  };
};

/** Family → generator (undefined: this template has no generator yet). */
export const GENERATORS: Record<string, (t: ExerciseTemplate) => Gen | undefined> = {
  "fam.note-read": (t) => (t.mode === "compare" ? undefined : noteRead),
  "fam.note-write": () => noteWrite,
  "fam.keyboard": () => keyboard,
  "fam.accidental-state": () => accidentalState,
  "fam.enharmonic": () => enharmonic,
  "fam.scale-builder": () => scaleBuild,
  "fam.key-signature": () => keySignature,
  "fam.degree": () => degree,
  "fam.chromatic-scale": () => chromatic,
  "fam.interval": () => interval,
  "fam.triad-chord": () => triadChord,
  "fam.cadence": () => cadence,
  "fam.transposition": () => transposition,
  "fam.ornament": () => ornament,
  "fam.time-signature": () => timeSignature,
  "fam.barlines": () => barlines,
  "fam.bar-builder": () => barBuilder,
  "fam.grouping": () => grouping,
  "fam.tuplet": () => tuplet,
  "fam.note-value": () => noteValue,
  "fam.choice": () => choiceFamily,
  "fam.score-observation": (t) => (t.grade <= 3 ? scoreObservation : undefined),
};
