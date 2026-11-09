/**
 * Accidental state on a stave (rules.accidental.bar-state).
 *
 * An accidental applies to its own line or space (letter AND octave) for the rest of the bar, in every voice
 * on that stave, until another accidental cancels it. A key signature applies to every octave. A note tied
 * over a bar-line keeps the tied pitch without repeating the accidental, but does not establish that
 * accidental for later notes in the new bar.
 *
 * Two directions are provided:
 *  - `resolveWrittenPitches` reads what is PRINTED (letter, octave, printed sign) and returns the sounding
 *    spelt pitch of every note. Graders use this, so the answer is computed from the notation a learner sees,
 *    never from the stored pitch.
 *  - `printedAccidentals` works the other way: for spelt pitches it returns which sign must be printed.
 *    Renderers use this when a learner-built sequence carries no explicit signs.
 *
 * `RESOLUTION_MISTAKES` re-reads the music with one rule broken, which is how learner mistakes are diagnosed.
 */
import { parseKey, signatureAlter, type Key } from "./keys.ts";
import { parsePitch, type Pitch } from "./pitch.ts";
import { compare, type Fraction } from "./duration.ts";
import { flatten, type REvent } from "./rhythm.ts";

export type Sign = "sharp" | "flat" | "natural" | "double-sharp" | "double-flat";
export const SIGN_ALTER: Record<Sign, number> = { sharp: 1, flat: -1, natural: 0, "double-sharp": 2, "double-flat": -2 };
export function signFor(alter: number): Sign {
  const s = (Object.keys(SIGN_ALTER) as Sign[]).find((k) => SIGN_ALTER[k] === alter);
  if (!s) throw new Error(`No accidental sign for alteration ${alter}`);
  return s;
}

interface ANote {
  pitch: string;
  writtenAccidental?: Sign;
}
interface AEvent {
  kind: string;
  pitch?: string;
  writtenAccidental?: Sign;
  notes?: ANote[];
  events?: AEvent[];
  tieToNext?: boolean;
  duration?: { value: string; dots?: number };
}
interface AMeasure {
  events?: AEvent[];
  voices?: Array<{ events: AEvent[] }>;
}
export interface AFragment {
  key?: string;
  showKeySignature?: boolean;
  measures: AMeasure[];
}

/** Identifies one notehead: bar, voice, flattened event index within the voice, note index within a chord. */
export interface NoteRef {
  bar: number;
  voice: number;
  event: number;
  note: number;
}
export const refKey = (r: NoteRef) => `${r.bar}.${r.voice}.${r.event}.${r.note}`;

interface Slotted {
  ref: NoteRef;
  onset: Fraction;
  written: ANote;
  tiedFrom: boolean;
}

const voicesOf = (m: AMeasure): AEvent[][] => (m.events ? [m.events] : (m.voices ?? []).map((v) => v.events));
const notesOf = (e: AEvent): ANote[] => (e.kind === "note" && e.pitch ? [{ pitch: e.pitch, writtenAccidental: e.writtenAccidental }] : e.kind === "chord" ? (e.notes ?? []) : []);

/** Every notehead per bar in time order (shared stave state), with tie-continuation flags. */
function noteheads(f: AFragment): Slotted[][] {
  const tiedVoices = new Map<number, boolean>();
  return f.measures.map((m, bar) => {
    const out: Slotted[] = [];
    voicesOf(m).forEach((events, voice) => {
      flatten(events as unknown as REvent[]).forEach((t, event) => {
        const e = t.e as unknown as AEvent;
        const tiedFrom = tiedVoices.get(voice) ?? false;
        tiedVoices.set(voice, Boolean(e.tieToNext) && e.kind !== "rest");
        notesOf(e).forEach((written, note) => out.push({ ref: { bar, voice, event, note }, onset: t.onset, written, tiedFrom }));
      });
    });
    out.sort((a, b) => compare(a.onset, b.onset) || a.ref.voice - b.ref.voice);
    return out;
  });
}

/** Which rule to break when re-reading (for diagnosing mistakes); "none" is the correct reading. */
export type ResolutionRule = "none" | "forget-earlier-accidentals" | "ignore-key-signature" | "carry-over-barline" | "any-octave" | "ignore-ties";

export const RESOLUTION_MISTAKES: Array<{ rule: Exclude<ResolutionRule, "none">; category: string }> = [
  { rule: "forget-earlier-accidentals", category: "accidental-forgotten" },
  { rule: "ignore-key-signature", category: "key-signature-ignored" },
  { rule: "carry-over-barline", category: "accidental-carried-over-barline" },
  { rule: "any-octave", category: "different-octave-assumed" },
  { rule: "ignore-ties", category: "tie-over-barline" },
];

/**
 * Sounding pitch of every notehead, computed from the printed letter, octave and printed sign only.
 * Returned in reading order (bar, then time) with references back to the notation.
 */
export function resolveWrittenPitches(f: AFragment, rule: ResolutionRule = "none"): Array<{ ref: NoteRef; pitch: Pitch }> {
  const key: Key | undefined = f.key && f.showKeySignature !== false ? parseKey(f.key) : undefined;
  const out: Array<{ ref: NoteRef; pitch: Pitch }> = [];
  let carried = new Map<string, number>();
  const lastTied = new Map<number, Pitch[]>();
  noteheads(f).forEach((bar) => {
    const state = rule === "carry-over-barline" ? carried : new Map<string, number>();
    const tiedNow = new Map<number, Pitch[]>();
    for (const n of bar) {
      const p = parsePitch(n.written.pitch);
      const slot = rule === "any-octave" ? p.step : `${p.step}${p.octave}`;
      const prevTied = lastTied.get(n.ref.voice)?.find((t) => t.step === p.step && t.octave === p.octave);
      let alter: number;
      if (n.tiedFrom && prevTied && rule !== "ignore-ties") {
        alter = prevTied.alter;
      } else if (n.written.writtenAccidental !== undefined) {
        alter = SIGN_ALTER[n.written.writtenAccidental];
        state.set(slot, alter);
      } else {
        const sig = key && rule !== "ignore-key-signature" ? signatureAlter(key, p.step) : 0;
        alter = rule === "forget-earlier-accidentals" ? sig : (state.get(slot) ?? sig);
      }
      const pitch = { step: p.step, alter, octave: p.octave };
      out.push({ ref: n.ref, pitch });
      tiedNow.set(n.ref.voice, [...(tiedNow.get(n.ref.voice) ?? []), pitch]);
    }
    // Ties carry from the last event of each voice in this bar into the next bar.
    lastTied.clear();
    for (const [v, ps] of tiedNow) lastTied.set(v, ps);
    if (rule === "carry-over-barline") carried = state;
  });
  return out;
}

/**
 * The sign to print before each notehead so that it reads as its spelt pitch, or null for none.
 * An explicit `writtenAccidental` is always printed (courtesy accidentals are allowed).
 */
export function printedAccidentals(f: AFragment): Map<string, Sign | null> {
  const key: Key | undefined = f.key && f.showKeySignature !== false ? parseKey(f.key) : undefined;
  const out = new Map<string, Sign | null>();
  const lastTied = new Map<number, Pitch[]>();
  noteheads(f).forEach((bar) => {
    const state = new Map<string, number>();
    const tiedNow = new Map<number, Pitch[]>();
    for (const n of bar) {
      const p = parsePitch(n.written.pitch);
      const slot = `${p.step}${p.octave}`;
      const continuation = n.tiedFrom && Boolean(lastTied.get(n.ref.voice)?.some((t) => t.step === p.step && t.octave === p.octave && t.alter === p.alter));
      let sign: Sign | null = null;
      if (!continuation) {
        const expected = state.get(slot) ?? (key ? signatureAlter(key, p.step) : 0);
        if (n.written.writtenAccidental) sign = n.written.writtenAccidental;
        else if (p.alter !== expected) sign = signFor(p.alter);
        if (sign) state.set(slot, p.alter);
      }
      out.set(refKey(n.ref), sign);
      tiedNow.set(n.ref.voice, [...(tiedNow.get(n.ref.voice) ?? []), p]);
    }
    lastTied.clear();
    for (const [v, ps] of tiedNow) lastTied.set(v, ps);
  });
  return out;
}

