/**
 * Musical verification of authored lesson content and exercise items.
 *
 * Every answer that can be derived from the notation or the task parameters is re-derived here
 * with the reference music rules, and EVERY accepted alternative is compared with the derived
 * answer under the item's spelling/octave policy. Notation fragments are checked for exact bar
 * durations (tuplets, chords, voices, whole-bar rests), accidental spelling (key signature, bar
 * state and ties across bar-lines), beam syntax and the musical scope the item is allowed to use.
 */
import type { Issue } from "./load.ts";
import { effectiveScope, intersectScope, taughtScope, type CurriculumIndex } from "./model.ts";
import {
  add,
  barCapacity,
  chromaticNumber,
  classifyCadence,
  diatonicNumber,
  dotted,
  enharmonic,
  equals,
  formatKey,
  formatPitch,
  frac,
  intervalBetween,
  keyFifths,
  keySignature,
  ledgerLines,
  mul,
  parseInterval,
  parseKey,
  parsePitch,
  parseTimeSignature,
  pitchFromNumbers,
  romanDegree,
  samePitch,
  samePitchClassSpelling,
  sameKey,
  scale,
  signatureAlter,
  staffPosition,
  transpose,
  triad,
  triadContains,
  type Fraction,
  type Interval,
  type Key,
  type Pitch,
  type PitchClass,
} from "./music/index.ts";
import type { AnswerSpec, ExerciseItem, Measure, MusicScope, NotationEvent, NotationFragment, NotationScore, SimpleAnswerSpec } from "./schema.ts";

const ROMANS = ["I", "ii", "IV", "V"] as const;
const INVERSIONS = ["a", "b", "c"] as const;
const ACCIDENTAL_ALTER: Record<string, number> = { sharp: 1, flat: -1, natural: 0, "double-sharp": 2, "double-flat": -2 };
const BEAMABLE = new Set(["quaver", "semiquaver", "demisemiquaver"]);

export type Report = (code: string, where: string, message: string, severity?: "error" | "warning") => void;

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
const fmtFrac = (f: Fraction) => `${f.n}/${f.d}`;

// ---------------------------------------------------------------------------
// Notation
// ---------------------------------------------------------------------------

type Inner = Exclude<NotationEvent, { kind: "tuplet" }>;

export function voicesOf(m: Measure): NotationEvent[][] {
  return m.events ? [m.events] : (m.voices ?? []).map((v) => v.events);
}

export function tupletKind(actual: number, normal: number): "triplet" | "duplet" | "irregular" {
  if (actual === 3 && normal === 2) return "triplet";
  if (actual === 2 && normal === 3) return "duplet";
  return "irregular";
}

/** Exact duration of an event in semibreves; a whole-bar rest lasts `bar`. */
export function eventDuration(e: NotationEvent, bar: Fraction | undefined): Fraction {
  if (e.kind === "tuplet") {
    const written = e.events.reduce((s, x) => add(s, eventDuration(x, bar)), frac(0));
    return mul(written, frac(e.normal, e.actual));
  }
  if (e.kind === "rest" && e.wholeBar) return bar ?? dotted(e.duration.value, e.duration.dots ?? 0);
  return dotted(e.duration.value, e.duration.dots ?? 0);
}

export function voiceDuration(events: NotationEvent[], bar: Fraction | undefined): Fraction {
  return events.reduce((s, e) => add(s, eventDuration(e, bar)), frac(0));
}

/** Flatten tuplets, keeping each inner event with its onset in the bar. */
function timeline(events: NotationEvent[], bar: Fraction | undefined): Array<{ e: Inner; onset: Fraction }> {
  const out: Array<{ e: Inner; onset: Fraction }> = [];
  let t = frac(0);
  for (const e of events) {
    if (e.kind === "tuplet") {
      let inner = t;
      for (const x of e.events) {
        out.push({ e: x, onset: inner });
        inner = add(inner, mul(eventDuration(x, bar), frac(e.normal, e.actual)));
      }
    } else out.push({ e, onset: t });
    t = add(t, eventDuration(e, bar));
  }
  return out;
}

const pitchesOf = (e: Inner): Array<{ pitch: string; writtenAccidental?: string }> =>
  e.kind === "note" ? [{ pitch: e.pitch, writtenAccidental: e.writtenAccidental }] : e.kind === "chord" ? e.notes : [];

/** All pitched events in reading order (measure, voice, position). */
export function pitchedEvents(music: NotationFragment): Inner[] {
  return music.measures.flatMap((m) =>
    voicesOf(m).flatMap((v) => timeline(v, undefined).map((x) => x.e).filter((e) => e.kind !== "rest")),
  );
}

/** Checks bar totals, ties, accidentals, beams and grade/lesson scope of one stave. */
export function checkFragment(music: NotationFragment, scope: MusicScope, where: string, report: Report) {
  const sc = scope;
  const presentation = music.presentation ?? "stave";
  // The clef is only assessed knowledge when the fragment is shown as normal stave notation.
  if (presentation === "stave" && !(sc.clefs ?? []).includes(music.clef)) report("FRAGMENT_SCOPE", where, `Clef ${music.clef} is not in scope here`);
  if (presentation === "rhythm-line") {
    if (music.key) report("RHYTHM_LINE_PITCHED", where, "A rhythm-line fragment is unpitched and cannot have a key");
    const pitches = new Set(pitchedEvents(music).flatMap((e) => pitchesOf(e).map((n) => n.pitch)));
    if (pitches.size > 1) report("RHYTHM_LINE_PITCHED", where, `A rhythm-line fragment must use one display pitch for every note (found ${[...pitches].join(", ")})`);
    if (pitchedEvents(music).some((e) => e.kind === "chord")) report("RHYTHM_LINE_PITCHED", where, "A rhythm-line fragment cannot contain chords");
  }
  if (music.key && !(sc.keys ?? []).includes(music.key)) report("FRAGMENT_SCOPE", where, `Key ${music.key} is not in scope here`);
  const showsSignature = Boolean(music.key) && music.showKeySignature !== false && keyFifths(parseKey(music.key!)) !== 0;
  if (showsSignature && !sc.keySignatures) report("FRAGMENT_SCOPE", where, "Key signatures are not in scope here");
  if (music.timeSignature && !(sc.timeSignatures ?? []).includes(music.timeSignature)) {
    report("FRAGMENT_SCOPE", where, `Time signature ${music.timeSignature} is not in scope here`);
  }
  const key: Key | undefined = music.key ? parseKey(music.key) : undefined;
  const bar = music.timeSignature ? barCapacity(parseTimeSignature(music.timeSignature)) : undefined;
  // Pending ties per voice index: pitches that the next event in that voice must continue.
  const pendingTie = new Map<number, Pitch[]>();

  music.measures.forEach((m, bi) => {
    const label = `Bar ${bi + 1}`;
    const voices = voicesOf(m);
    const stave: Array<{ e: Inner; onset: Fraction; voice: number }> = [];
    voices.forEach((events, vi) => {
      // Duration.
      const whole = events.filter((e) => e.kind === "rest" && e.wholeBar);
      if (whole.length && events.length > 1) report("WHOLE_BAR_REST", where, `${label}: a whole-bar rest must be the only event in its voice`);
      if (whole.length && !bar) report("WHOLE_BAR_REST", where, `${label}: a whole-bar rest needs a time signature`);
      if (bar) {
        const total = voiceDuration(events, bar);
        if (!equals(total, bar)) report("BAR_DURATION", where, `${label}${voices.length > 1 ? ` voice ${vi + 1}` : ""} lasts ${fmtFrac(total)} of a semibreve; ${music.timeSignature} needs ${fmtFrac(bar)}`);
      }
      // Scope on values, rests, ties, tuplets, ornaments.
      for (const e of events) {
        if (e.kind === "tuplet") {
          const kind = tupletKind(e.actual, e.normal);
          if (!(sc.tuplets ?? []).includes(kind)) report("FRAGMENT_SCOPE", where, `${label}: ${kind} (${e.actual}:${e.normal}) is not in scope here`);
        }
      }
      const tl = timeline(events, bar);
      let beamOpen = false;
      tl.forEach(({ e, onset }) => {
        if (!(sc.noteValues ?? []).includes(e.duration.value)) report("FRAGMENT_SCOPE", where, `${label}: ${e.duration.value} is not in scope here`);
        if ((e.duration.dots ?? 0) > (sc.maxDots ?? 0)) report("FRAGMENT_SCOPE", where, `${label}: ${e.duration.dots} dot(s) exceed scope`);
        if (e.kind === "rest" && !sc.rests) report("FRAGMENT_SCOPE", where, `${label}: rests are not in scope here`);
        if (e.kind !== "rest" && e.tieToNext && !sc.ties) report("FRAGMENT_SCOPE", where, `${label}: ties are not in scope here`);
        if (e.kind !== "rest" && e.ornament && !(sc.ornaments ?? []).includes(e.ornament)) report("FRAGMENT_SCOPE", where, `${label}: ornament ${e.ornament} is not in scope here`);
        if (e.kind !== "rest" && e.grace && !(sc.ornaments ?? []).includes(e.grace.kind)) report("FRAGMENT_SCOPE", where, `${label}: ${e.grace.kind} is not in scope here`);
        if (e.kind === "chord" && !(sc.chordDegrees ?? []).length) report("FRAGMENT_SCOPE", where, `${label}: chords are not in scope here`);
        // Beams.
        if (e.beam) {
          if (e.kind !== "rest" && !BEAMABLE.has(e.duration.value)) report("BEAM_MALFORMED", where, `${label}: a ${e.duration.value} cannot be beamed`);
          if (e.beam === "begin") {
            if (beamOpen) report("BEAM_MALFORMED", where, `${label}: beam begins inside another beam`);
            beamOpen = true;
          } else if (!beamOpen) report("BEAM_MALFORMED", where, `${label}: beam ${e.beam} without begin`);
          if (e.beam === "end") beamOpen = false;
        } else if (beamOpen && e.kind !== "rest") report("BEAM_MALFORMED", where, `${label}: unbeamed note inside a beam group`);
        stave.push({ e, onset, voice: vi });
      });
      if (beamOpen) report("BEAM_MALFORMED", where, `${label}: beam group is not closed`);
    });

    // Accidentals: shared stave state in time order; tied continuations keep the tied accidental
    // without establishing it for later notes in the bar.
    stave.sort((a, b) => a.onset.n * b.onset.d - b.onset.n * a.onset.d || a.voice - b.voice);
    const state = new Map<string, number>();
    for (const { e, voice } of stave) {
      const tied = pendingTie.get(voice);
      pendingTie.delete(voice);
      const notes = pitchesOf(e);
      if (tied) {
        const here = notes.map((n) => parsePitch(n.pitch));
        const ok = tied.length === here.length && tied.every((t) => here.some((h) => samePitch(t, h)));
        if (!ok) report("TIE_PITCH_MISMATCH", where, `${label}: tie must join the same pitch(es) (${tied.map(formatPitch).join(",")} → ${here.map(formatPitch).join(",") || "rest"})`);
      }
      for (const n of notes) {
        const p = parsePitch(n.pitch);
        if (presentation === "rhythm-line") continue; // display pitch only: nothing pitch-related is assessed
        if (presentation === "keyboard") {
          if (p.alter !== 0 && !sc.blackKeys) report("FRAGMENT_SCOPE", where, `${label}: ${n.pitch} is a black key, which is not in scope here`);
          if (Math.abs(p.alter) === 2 && !sc.doubleAccidentals) report("FRAGMENT_SCOPE", where, `${label}: ${n.pitch} uses a double accidental, which is not in scope here`);
          continue; // no stave: clef, ledger lines and written accidentals do not apply
        }
        const lines = ledgerLines(music.clef, p);
        if (lines > (sc.maxLedgerLines ?? 0)) report("FRAGMENT_SCOPE", where, `${label}: ${n.pitch} needs ${lines} ledger line(s) (limit ${sc.maxLedgerLines ?? 0})`);
        if (p.alter !== 0 && !sc.accidentals) report("FRAGMENT_SCOPE", where, `${label}: ${n.pitch} uses an accidental, which is not in scope here`);
        if (Math.abs(p.alter) === 2 && !sc.doubleAccidentals) report("FRAGMENT_SCOPE", where, `${label}: ${n.pitch} uses a double accidental, which is not in scope here`);
        const slot = `${p.step}${p.octave}`;
        const isContinuation = Boolean(tied?.some((t) => samePitch(t, p)));
        const fromSignature = key && music.showKeySignature !== false ? signatureAlter(key, p.step) : 0;
        const expected = isContinuation ? p.alter : (state.get(slot) ?? fromSignature);
        if (n.writtenAccidental !== undefined) {
          const alter = ACCIDENTAL_ALTER[n.writtenAccidental]!;
          if (alter !== p.alter) report("ACCIDENTAL_MISMATCH", where, `${label}: ${n.pitch} is written with a ${n.writtenAccidental} sign`);
          if (isContinuation) report("ACCIDENTAL_REDUNDANT", where, `${label}: a tied continuation does not repeat its accidental`, "warning");
          else if (alter === expected) report("ACCIDENTAL_REDUNDANT", where, `${label}: the ${n.writtenAccidental} before ${n.pitch} is unnecessary`, "warning");
          if (!isContinuation) state.set(slot, alter);
        } else if (p.alter !== expected) {
          report("ACCIDENTAL_MISSING", where, `${label}: ${n.pitch} needs a written accidental (key signature/bar state gives a different note)`);
        }
      }
      if (e.kind !== "rest" && e.tieToNext) pendingTie.set(voice, notes.map((n) => parsePitch(n.pitch)));
    }
  });
  for (const [, tied] of pendingTie) if (tied.length) report("TIE_DANGLING", where, "A tie at the end of the fragment has no following note");
}

export function checkScore(score: NotationScore, scope: MusicScope, where: string, report: Report) {
  const counts = new Set(score.staves.map((s) => s.music.measures.length));
  if (counts.size > 1) report("SCORE_ALIGNMENT", where, "All staves must have the same number of bars");
  const ts = new Set(score.staves.map((s) => s.music.timeSignature ?? ""));
  if (ts.size > 1) report("SCORE_ALIGNMENT", where, "All staves must share the time signature");
  for (const s of score.staves) checkFragment(s.music, scope, `${where}#${s.id}`, report);
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function intervalFromCode(code: string): { interval?: Interval; numberOnly?: number } {
  if (/^\d{1,2}$/.test(code)) return { numberOnly: Number(code) };
  const compound = code.startsWith("c");
  const iv = parseInterval(compound ? code.slice(1) : code);
  return { interval: compound ? { ...iv, number: iv.number + 7 } : iv };
}

/** Pitch classes of every form of the key's scale (major, or harmonic/melodic/natural minor). */
type MinorScaleForm = "harmonic" | "melodic-ascending" | "melodic-descending";

/** Scale forms a task may draw on: the major scale, or the minor forms allowed by the effective scope. */
export function allowedForms(key: Key, sc: MusicScope, specific?: MinorScaleForm): Array<"major" | MinorScaleForm> {
  if (key.mode === "major") return ["major"];
  const allowed: MinorScaleForm[] = [];
  if ((sc.minorForms ?? []).includes("harmonic")) allowed.push("harmonic");
  if ((sc.minorForms ?? []).includes("melodic")) allowed.push("melodic-ascending", "melodic-descending");
  return specific ? allowed.filter((f) => f === specific) : allowed;
}

function scaleMembers(key: Key, forms: Array<"major" | MinorScaleForm>): PitchClass[] {
  return forms.flatMap((f) => scale(key, f));
}

function identifyChord(key: Key, pitches: Pitch[]): { roman: string; inversion: string } | null {
  for (const r of ROMANS) {
    const t = triad(key, r);
    const allIn = pitches.every((p) => t.some((x) => samePitchClassSpelling(x, p)));
    const allPresent = t.every((x) => pitches.some((p) => samePitchClassSpelling(x, p)));
    if (allIn && allPresent) {
      const bass = [...pitches].sort((a, b) => chromaticNumber(a) - chromaticNumber(b) || diatonicNumber(a) - diatonicNumber(b))[0]!;
      const idx = t.findIndex((x) => samePitchClassSpelling(x, bass));
      return { roman: r, inversion: INVERSIONS[idx]! };
    }
  }
  return null;
}

function classifyOrnament(main: Pitch, figure: Pitch[]): string | null {
  const steps = figure.map((p) => diatonicNumber(p) - diatonicNumber(main));
  const is = (pattern: number[]) => steps.length === pattern.length && steps.every((s, i) => s === pattern[i]);
  if (is([0, 1, 0])) return "upper-mordent";
  if (is([0, -1, 0])) return "lower-mordent";
  if (is([1, 0, -1, 0]) || is([0, 1, 0, -1, 0])) return "turn";
  const core = steps.slice(-2).join() === "-1,0" ? steps.slice(0, -2) : steps;
  if (core.length >= 4 && core.every((s, i) => s === (core[0] === 1 ? (i % 2 === 0 ? 1 : 0) : i % 2 === 0 ? 0 : 1))) return "trill";
  return null;
}

function deriveScale(keyName: string, form: "major" | "harmonic" | "melodic", direction: string, start: Pitch): Pitch[] {
  const key = parseKey(keyName);
  const asc = scale(key, form === "major" ? "major" : form === "harmonic" ? "harmonic" : "melodic-ascending");
  const withOctaves = (pcs: PitchClass[], from: Pitch, step: 1 | -1) => {
    const out: Pitch[] = [];
    let d = diatonicNumber(from);
    for (const pc of pcs) {
      const probe = pitchFromNumbers(d, 0);
      out.push({ step: pc.step, alter: pc.alter, octave: probe.octave });
      d += step;
    }
    return out;
  };
  const up = withOctaves(asc, start, 1);
  const top = up[up.length - 1]!;
  const descPcs = form === "melodic" ? scale(key, "melodic-descending") : [...asc].reverse();
  const down = withOctaves(descPcs, direction === "descending" ? start : top, -1);
  if (direction === "ascending") return up;
  if (direction === "descending") return down;
  return [...up, ...down.slice(1)];
}

/** Re-derive the answer of an item where possible and compare EVERY accepted alternative. */
export function checkAnswer(item: ExerciseItem, answer: AnswerSpec | SimpleAnswerSpec, sc: MusicScope, where: string, report: Report) {
  const music = item.music;
  const a = answer;
  const keyInScope = (k: string, what = "Key") => {
    if (!(sc.keys ?? []).includes(k)) report("ANSWER_SCOPE", where, `${what} ${k} is not in scope here`);
  };
  switch (a.kind) {
    case "choice":
    case "multi-choice": {
      const ids = a.options.map((o) => o.id);
      if (new Set(ids).size !== ids.length) report("CHOICE_DUPLICATE", where, "Option ids must be unique");
      for (const c of a.correctOptionIds) if (!ids.includes(c)) report("CHOICE_UNKNOWN", where, `Correct option ${c} is not an option`);
      if (a.correctOptionIds.length === ids.length) report("CHOICE_TRIVIAL", where, "Every option is correct");
      return;
    }
    case "pitch": {
      const notes = music ? pitchedEvents(music).filter((e) => e.kind === "note") : [];
      const labelled = notes.filter((n) => n.label);
      const shownEv = labelled.length === 1 ? labelled[0] : notes.length === 1 ? notes[0] : undefined;
      const ref = shownEv && shownEv.kind === "note" ? parsePitch(shownEv.pitch) : a.reference ? parsePitch(a.reference) : undefined;
      if (!ref) {
        report("ANSWER_UNVERIFIABLE", where, "Pitch answer needs a single (or single labelled) shown note or a reference pitch");
        return;
      }
      for (const acc of a.accepted) {
        const p = parsePitch(acc);
        const sameSoundAnyOctave = (((chromaticNumber(p) - chromaticNumber(ref)) % 12) + 12) % 12 === 0;
        const sameSound = a.octaveSensitive ? enharmonic(p, ref) : sameSoundAnyOctave;
        let ok: boolean;
        if (a.relation === "same") {
          ok = a.spellingSensitive
            ? samePitchClassSpelling(p, ref) && (!a.octaveSensitive || p.octave === ref.octave)
            : sameSound;
        } else {
          ok = sameSound && (a.relation === "same-sound" || !samePitchClassSpelling(p, ref));
        }
        if (!ok) report("ANSWER_MISMATCH", where, `Accepted alternative ${acc} is not correct for ${formatPitch(ref)} (${a.relation}, spelling ${a.spellingSensitive ? "sensitive" : "insensitive"}, octave ${a.octaveSensitive ? "sensitive" : "insensitive"})`);
        if (Math.abs(p.alter) === 2 && !sc.doubleAccidentals) report("ANSWER_SCOPE", where, `${acc} uses a double accidental, which is not in scope here`);
      }
      return;
    }
    case "staff-position": {
      if (!(sc.clefs ?? []).includes(a.clef)) report("ANSWER_SCOPE", where, `Clef ${a.clef} is not in scope here`);
      const t = a.target;
      const limit = Math.min(t.maxLedgerLines, sc.maxLedgerLines ?? 0);
      if (t.maxLedgerLines > (sc.maxLedgerLines ?? 0)) report("ANSWER_SCOPE", where, `Target allows ${t.maxLedgerLines} ledger lines; scope allows ${sc.maxLedgerLines ?? 0}`);
      const satisfies = (p: Pitch) => {
        const pos = staffPosition(a.clef, p);
        const posOk = t.position === "any" || (t.position === "line") === (((pos % 2) + 2) % 2 === 0);
        return p.step === t.step && p.alter === t.alter && posOk && ledgerLines(a.clef, p) <= limit && (t.octave === undefined || p.octave === t.octave);
      };
      const derived: string[] = [];
      for (let octave = 0; octave <= 8; octave++) {
        const p: Pitch = { step: t.step, alter: t.alter, octave };
        if (satisfies(p)) derived.push(formatPitch(p));
      }
      if (!derived.length) report("ANSWER_UNSOLVABLE", where, "No staff position satisfies the target");
      for (const acc of a.accepted) if (!satisfies(parsePitch(acc))) report("ANSWER_MISMATCH", where, `Accepted ${acc} does not satisfy the target`);
      if (a.octaveSensitive && !sameSet(derived, a.accepted)) report("ANSWER_MISMATCH", where, `Every valid position must be accepted: derived [${derived.join(", ")}], authored [${a.accepted.join(", ")}]`);
      return;
    }
    case "pitch-sequence": {
      if (!(sc.clefs ?? []).includes(a.clef)) report("ANSWER_SCOPE", where, `Clef ${a.clef} is not in scope here`);
      const d = a.derivation;
      let derived: Pitch[] | null = null;
      if (d.rule === "transpose") {
        if (!music) {
          report("ANSWER_UNVERIFIABLE", where, "Transposition item has no source music");
          return;
        }
        const source = parseKey(d.sourceKey);
        if (!music.key || !sameKey(parseKey(music.key), source)) report("TRANSPOSE_SOURCE_KEY", where, `Source key ${d.sourceKey} ≠ music key ${String(music.key)}`);
        const interval = parseInterval(d.interval);
        if (interval.number === 8 && interval.quality === "P") {
          const clefs = sc.octaveTranspositionClefs ?? [];
          if (!clefs.includes(a.clef) || !clefs.includes(music.clef)) report("ANSWER_SCOPE", where, `Octave transposition ${music.clef} → ${a.clef} is not in scope here`);
        } else {
          const ok = ["M2", "m3", "P5"].includes(d.interval) && (sc.instrumentTranspositions ?? []).length > 0;
          if (!ok) report("ANSWER_SCOPE", where, `Transposition by ${d.interval} is not in scope here`);
        }
        const newTonic = transpose({ ...source.tonic, octave: 4 }, interval, d.direction);
        const derivedKey: Key = { tonic: { step: newTonic.step, alter: newTonic.alter }, mode: source.mode };
        try {
          keySignature(derivedKey);
        } catch (e) {
          report("TRANSPOSE_KEY", where, String(e));
          return;
        }
        if (!a.key || !sameKey(derivedKey, parseKey(a.key))) report("TRANSPOSE_KEY", where, `Answer key ${String(a.key)}; derived ${formatKey(derivedKey)}`);
        keyInScope(formatKey(derivedKey), "Derived key");
        derived = pitchedEvents(music).flatMap((e) => pitchesOf(e)).map((n) => transpose(parsePitch(n.pitch), interval, d.direction));
      } else if (d.rule === "scale") {
        keyInScope(d.key);
        if (a.key && a.key !== d.key) report("SCALE_KEY", where, `Answer key ${a.key} ≠ derivation key ${d.key}`);
        const key = parseKey(d.key);
        if ((key.mode === "major") !== (d.form === "major")) report("SCALE_FORM", where, `${d.form} form does not fit ${d.key}`);
        if (d.form !== "major" && !(sc.minorForms ?? []).includes(d.form)) report("ANSWER_SCOPE", where, `${d.form} minor is not in scope here`);
        const start = parsePitch(d.start);
        if (!samePitchClassSpelling(start, key.tonic)) report("SCALE_START", where, `Scale must start on the tonic ${formatKey(key).split(" ")[0]}`);
        derived = deriveScale(d.key, d.form, d.direction, start);
      } else {
        const start = parsePitch(d.start);
        for (const alt of a.accepted) {
          const ps = alt.map(parsePitch);
          const sign = d.direction === "ascending" ? 1 : -1;
          const problems: string[] = [];
          if (ps.length !== 13) problems.push(`${ps.length} notes (expected 13)`);
          if (!ps[0] || !samePitch(ps[0], start)) problems.push("does not begin on the given note");
          const last = ps[ps.length - 1];
          if (last && (!samePitchClassSpelling(last, start) || last.octave !== start.octave + sign)) problems.push("does not end an octave from the start");
          ps.slice(1).forEach((p, i) => {
            if (chromaticNumber(p) - chromaticNumber(ps[i]!) !== sign) problems.push(`step ${i + 1} is not a semitone`);
          });
          const counts = new Map<string, number>();
          ps.slice(0, 12).forEach((p) => counts.set(p.step, (counts.get(p.step) ?? 0) + 1));
          for (const s of ["A", "B", "C", "D", "E", "F", "G"]) {
            const c = counts.get(s) ?? 0;
            if (c < 1 || c > 2) problems.push(`letter ${s} used ${c} time(s)`);
          }
          if (ps.some((p) => Math.abs(p.alter) === 2) && !sc.doubleAccidentals) problems.push("double accidentals are not in scope");
          if (problems.length) report("ANSWER_MISMATCH", where, `Chromatic alternative [${alt.join(" ")}] is invalid: ${problems.join("; ")}`);
          for (const p of ps) {
            const lines = ledgerLines(a.clef, p);
            if (lines > (sc.maxLedgerLines ?? 0)) report("ANSWER_SCOPE", where, `${formatPitch(p)} needs ${lines} ledger lines`);
          }
        }
        return;
      }
      const text = derived.map(formatPitch).join(" ");
      a.accepted.forEach((alt, i) => {
        if (alt.join(" ") !== text) report("ANSWER_MISMATCH", where, `Accepted alternative ${i + 1} [${alt.join(" ")}] differs from the derived answer [${text}]`);
      });
      for (const p of derived) {
        const lines = ledgerLines(a.clef, p);
        if (lines > (sc.maxLedgerLines ?? 0)) report("ANSWER_SCOPE", where, `${formatPitch(p)} needs ${lines} ledger lines`);
        if (Math.abs(p.alter) === 2 && !sc.doubleAccidentals) report("ANSWER_SCOPE", where, `${formatPitch(p)} uses a double accidental, which is not in scope here`);
      }
      return;
    }
    case "rhythm": {
      const ts = a.timeSignature ?? music?.timeSignature;
      if (a.task === "equivalent-value" && !a.target) report("RHYTHM_TARGET", where, "equivalent-value needs a target");
      if (a.task !== "equivalent-value" && !ts) report("RHYTHM_TARGET", where, `${a.task} needs a time signature`);
      a.accepted.forEach((measures, i) => {
        // Rhythm answers are unpitched: check them as a rhythm line so no clef or pitch knowledge is assumed.
        const frag: NotationFragment = { presentation: "rhythm-line", clef: music?.clef ?? "treble", showKeySignature: false, measures, textAlternative: "answer", ...(a.task !== "equivalent-value" && ts ? { timeSignature: ts } : {}) };
        checkFragment(frag, { ...sc, keys: sc.keys }, `${where}#accepted[${i}]`, report);
        if (a.task === "equivalent-value" && a.target) {
          const total = measures.flatMap(voicesOf).reduce((s, v) => add(s, voiceDuration(v, undefined)), frac(0));
          if (!equals(total, frac(a.target[0], a.target[1]))) report("ANSWER_MISMATCH", where, `Accepted alternative ${i + 1} lasts ${fmtFrac(total)}, target ${a.target[0]}/${a.target[1]}`);
        }
        if (a.task === "complete-bar" && a.given) {
          const first = measures[0]?.events ?? [];
          if (JSON.stringify(first.slice(0, a.given.length)) !== JSON.stringify(a.given)) report("ANSWER_MISMATCH", where, `Accepted alternative ${i + 1} does not begin with the given events`);
        }
        if (a.task === "add-tuplet" && !measures.some((m) => voicesOf(m).some((v) => v.some((e) => e.kind === "tuplet")))) {
          report("ANSWER_MISMATCH", where, `Accepted alternative ${i + 1} contains no tuplet`);
        }
      });
      return;
    }
    case "time-signature": {
      const caps = a.accepted.map((t) => {
        if (!(sc.timeSignatures ?? []).includes(t)) report("ANSWER_SCOPE", where, `Time signature ${t} is not in scope here`);
        return barCapacity(parseTimeSignature(t));
      });
      if (caps.some((c) => !equals(c, caps[0]!))) report("ANSWER_MISMATCH", where, "Accepted time signatures have different bar lengths");
      if (music) {
        music.measures.forEach((m, bi) => {
          for (const v of voicesOf(m)) {
            for (const [i, cap] of caps.entries()) {
              const total = voiceDuration(v, cap);
              if (!equals(total, cap)) report("ANSWER_MISMATCH", where, `Bar ${bi + 1} lasts ${fmtFrac(total)}, which does not fit accepted ${a.accepted[i]}`);
            }
          }
        });
      }
      return;
    }
    case "key-signature": {
      if (!(sc.clefs ?? []).includes(a.clef)) report("ANSWER_SCOPE", where, `Clef ${a.clef} is not in scope here`);
      if (!sc.keySignatures) report("ANSWER_SCOPE", where, "Key signatures are not in scope here");
      const fifths = a.accepted.map((k) => {
        keyInScope(k);
        return keyFifths(parseKey(k));
      });
      if (fifths.some((f) => f !== fifths[0])) report("ANSWER_MISMATCH", where, "Accepted keys do not share one key signature");
      if (music?.key) {
        if (keyFifths(parseKey(music.key)) !== fifths[0]) report("ANSWER_MISMATCH", where, `Accepted keys do not match the signature of ${music.key}`);
        if (a.task === "name-key" && !a.accepted.includes(music.key)) report("ANSWER_MISMATCH", where, `The shown key ${music.key} must be accepted`);
      }
      return;
    }
    case "interval": {
      const key = a.key ? parseKey(a.key) : undefined;
      if (a.key) keyInScope(a.key);
      const lower = parsePitch(a.lower);
      // Diatonic membership uses only the scale forms this task may draw on (e.g. harmonic minor only at Grade 2).
      const forms = key ? allowedForms(key, sc, a.minorForm) : [];
      if (key && key.mode === "minor" && forms.length === 0) {
        report("ANSWER_SCOPE", where, a.minorForm ? `${a.minorForm} minor is not in scope here` : "No minor scale form is in scope here");
      }
      const members = key ? scaleMembers(key, forms) : [];
      const inKey = (p: PitchClass) => members.some((x) => samePitchClassSpelling(x, p));
      const checkScopeFor = (upperPitch: Pitch, iv: Interval) => {
        if (iv.number > 8 && !sc.compoundIntervals) report("ANSWER_SCOPE", where, "Compound intervals are not in scope here");
        const mode = sc.intervalLowerNote;
        if (!mode) report("ANSWER_SCOPE", where, "Intervals are not in scope here");
        if (mode === "tonic" && (!key || !samePitchClassSpelling(lower, key.tonic))) report("ANSWER_SCOPE", where, "At this point the lower note must be the tonic of the stated key");
        if (mode === "tonic" || mode === "any-diatonic") {
          if (!key) report("ANSWER_SCOPE", where, "A key is required for diatonic interval tasks");
          else if (!inKey(lower) || !inKey(upperPitch)) report("ANSWER_SCOPE", where, `${formatPitch(lower)}–${formatPitch(upperPitch)} is not in the ${forms.join("/")} form(s) of ${a.key} allowed here`);
        }
        if (Math.abs(upperPitch.alter) === 2 && !sc.doubleAccidentals) report("ANSWER_SCOPE", where, "Double accidentals are not in scope here");
      };
      if (a.task === "identify") {
        const upper = parsePitch(a.upper!);
        let derived: Interval;
        try {
          derived = intervalBetween(lower, upper);
        } catch (e) {
          report("ANSWER_UNSOLVABLE", where, String(e));
          return;
        }
        checkScopeFor(upper, derived);
        for (const code of a.acceptedIntervals ?? []) {
          let parsedCode: ReturnType<typeof intervalFromCode>;
          try {
            parsedCode = intervalFromCode(code);
          } catch (e) {
            report("ANSWER_MISMATCH", where, `Accepted ${code} is not a valid interval: ${String(e)}`);
            continue;
          }
          const { interval, numberOnly } = parsedCode;
          if (numberOnly !== undefined) {
            if (sc.intervalQuality !== "number-only") report("ANSWER_SCOPE", where, `"${code}" gives a number only, but quality is required here`);
            if (numberOnly !== derived.number) report("ANSWER_MISMATCH", where, `Accepted ${code}; the interval is a ${derived.number}`);
          } else if (interval && (interval.number !== derived.number || interval.quality !== derived.quality)) {
            report("ANSWER_MISMATCH", where, `Accepted ${code}; derived ${derived.quality}${derived.number}`);
          }
        }
      } else {
        let built: ReturnType<typeof intervalFromCode>;
        try {
          built = intervalFromCode(a.target!);
        } catch (e) {
          report("ANSWER_UNSOLVABLE", where, `Target ${a.target} is not a valid interval: ${String(e)}`);
          return;
        }
        const { interval, numberOnly } = built;
        let derivedSet: Pitch[];
        if (numberOnly !== undefined) {
          if (!key) {
            report("ANSWER_UNVERIFIABLE", where, "Building an interval by number needs a key");
            return;
          }
          // The upper note is the scale note on that letter in each allowed form (harmonic minor raises the
          // 7th; melodic minor allows both raised and unraised 6th/7th). Every such spelling must be accepted.
          const d = diatonicNumber(lower) + (a.direction === "up" ? 1 : -1) * (numberOnly - 1);
          const probe = pitchFromNumbers(d, 0);
          const alters = Array.from(new Set(members.filter((m) => m.step === probe.step).map((m) => m.alter)));
          derivedSet = alters.map((alter) => ({ step: probe.step, alter, octave: probe.octave }));
          if (!derivedSet.length) {
            report("ANSWER_UNSOLVABLE", where, `No allowed scale note on ${probe.step}`);
            return;
          }
        } else derivedSet = [transpose(lower, interval!, a.direction!)];
        for (const dp of derivedSet) checkScopeFor(dp, intervalBetween(lower, dp));
        const accepted = (a.acceptedPitches ?? []).map(parsePitch);
        for (const acc of accepted) {
          if (!derivedSet.some((dp) => samePitch(dp, acc))) report("ANSWER_MISMATCH", where, `Accepted ${formatPitch(acc)}; derived ${derivedSet.map(formatPitch).join(" or ")}`);
        }
        for (const dp of derivedSet) {
          if (!accepted.some((acc) => samePitch(dp, acc))) report("ANSWER_MISMATCH", where, `Valid answer ${formatPitch(dp)} is not accepted (allowed forms: ${forms.join("/") || "major"})`);
        }
      }
      return;
    }
    case "chord": {
      keyInScope(a.key);
      const key = parseKey(a.key);
      const scopeChord = (c: { roman: string; inversion: string }) => {
        if (!(sc.chordDegrees ?? []).includes(c.roman as never)) report("ANSWER_SCOPE", where, `Chord ${c.roman} is not in scope here`);
        if (!(sc.inversions ?? []).includes(c.inversion as never)) report("ANSWER_SCOPE", where, `Inversion ${c.inversion} is not in scope here`);
      };
      if (a.task === "identify") {
        let pitches = a.pitches?.map(parsePitch);
        if (!pitches && music) {
          const chord = pitchedEvents(music).find((e) => e.kind === "chord");
          pitches = chord && chord.kind === "chord" ? chord.notes.map((n) => parsePitch(n.pitch)) : undefined;
        }
        if (!pitches) {
          report("ANSWER_UNVERIFIABLE", where, "Chord identification needs pitches or a chord in the music");
          return;
        }
        const derived = identifyChord(key, pitches);
        if (!derived) {
          report("ANSWER_UNSOLVABLE", where, `${pitches.map(formatPitch).join(" ")} is not I, ii, IV or V in ${a.key}`);
          return;
        }
        scopeChord(derived);
        for (const c of a.acceptedChords ?? []) {
          if (romanDegree(c.roman) !== romanDegree(derived.roman) || c.inversion !== derived.inversion) report("ANSWER_MISMATCH", where, `Accepted ${c.roman}${c.inversion}; derived ${derived.roman}${derived.inversion}`);
        }
      } else {
        scopeChord(a.target!);
        a.acceptedVoicings?.forEach((v, i) => {
          const d = identifyChord(key, v.map(parsePitch));
          if (!d || d.roman !== a.target!.roman || d.inversion !== a.target!.inversion) report("ANSWER_MISMATCH", where, `Voicing ${i + 1} [${v.join(" ")}] is ${d ? d.roman + d.inversion : "not a I/ii/IV/V chord"}, not ${a.target!.roman}${a.target!.inversion}`);
        });
      }
      return;
    }
    case "ornament-sign": {
      for (const o of a.accepted) if (!(sc.ornaments ?? []).includes(o)) report("ANSWER_SCOPE", where, `Ornament ${o} is not in scope here`);
      const derived = a.task === "name-sign" ? a.sign! : classifyOrnament(parsePitch(a.mainNote!), a.writtenOut!.map(parsePitch));
      if (!derived) {
        report("ANSWER_UNSOLVABLE", where, "Written-out figure does not match a mordent, turn or trill pattern");
        return;
      }
      for (const o of a.accepted) if (o !== derived) report("ANSWER_MISMATCH", where, `Accepted ${o}; derived ${derived}`);
      return;
    }
    case "chord-progression": {
      const key = parseKey(a.key);
      if (music?.key && !sameKey(parseKey(music.key), key)) report("CADENCE_KEY", where, `Answer key ${a.key} ≠ music key ${music.key}`);
      if (!(sc.cadenceKeys ?? []).includes(a.key)) report("CADENCE_KEY", where, `Cadence key ${a.key} is outside the cadence keys in scope`);
      const candidates = new Map<string, string[]>();
      for (const p of a.points) {
        const labelled = music ? pitchedEvents(music).filter((n) => n.kind === "note" && n.label === p.label).map((n) => (n.kind === "note" ? n.pitch : "")) : [];
        if (music && !sameSet(labelled, p.melodyPitches)) report("CADENCE_LABELS", where, `Point ${p.label}: score shows [${labelled.join(", ")}], answer lists [${p.melodyPitches.join(", ")}]`);
        const pcs = p.melodyPitches.map(parsePitch);
        candidates.set(p.label, ROMANS.filter((r) => (sc.chordDegrees ?? []).includes(r) && pcs.every((pc) => triadContains(key, r, pc))));
      }
      const derived = new Map<string, Set<string>>();
      a.points.forEach((p) => derived.set(p.label, new Set(candidates.get(p.label))));
      for (const cad of a.cadences) {
        const [l1, l2] = cad.labels;
        const valid: Array<[string, string, string]> = [];
        for (const r1 of candidates.get(l1) ?? []) for (const r2 of candidates.get(l2) ?? []) {
          const type = classifyCadence(r1, r2);
          if (type && (sc.cadenceTypes ?? []).includes(type)) valid.push([r1, r2, type]);
        }
        if (!valid.length) report("CADENCE_UNSOLVABLE", where, `No valid cadence for ${l1}–${l2}`);
        derived.set(l1, new Set([...(derived.get(l1) ?? [])].filter((r) => valid.some((v) => v[0] === r))));
        derived.set(l2, new Set([...(derived.get(l2) ?? [])].filter((r) => valid.some((v) => v[1] === r))));
        const types = Array.from(new Set(valid.map((v) => v[2])));
        if (!sameSet(types, cad.acceptedTypes)) report("CADENCE_TYPE_MISMATCH", where, `${l1}–${l2}: derived ${types.join("/")}, authored ${cad.acceptedTypes.join("/")}`);
      }
      for (const p of a.points) {
        const d = [...(derived.get(p.label) ?? [])];
        if (!sameSet(d, p.accepted)) report("ANSWER_MISMATCH", where, `Point ${p.label}: derived valid chords [${d.join(", ")}], authored [${p.accepted.join(", ")}]`);
      }
      return;
    }
    case "composite": {
      for (const part of a.parts) checkAnswer(item, part.answer, sc, `${where}#${part.id}`, report);
      return;
    }
  }
}

/** Verify one item against a musical scope: notation, score and answer. */
export function checkItem(item: ExerciseItem, scope: MusicScope, where: string, report: Report) {
  // Malformed musical values (e.g. an impossible interval) must be reported, never crash validation.
  try {
    if (item.music) checkFragment(item.music, scope, `${where}#music`, report);
    if (item.score) checkScore(item.score, scope, `${where}#score`, report);
    checkAnswer(item, item.answer, scope, where, report);
  } catch (e) {
    report("MUSIC_INVALID", where, `Could not verify item: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const ALWAYS_ALLOWED_KINDS = new Set(["choice", "multi-choice"]);

/** Checks that apply to any item: template, version, evidence, feedback and answer kind. */
function checkItemContract(ix: CurriculumIndex, item: ExerciseItem, where: string, report: Report, expectedEvidence?: string) {
  const tpl = ix.templates.get(item.templateId);
  if (!tpl) {
    report("UNKNOWN_REF", where, `Unknown template ${item.templateId}`);
    return undefined;
  }
  if (tpl.version !== item.templateVersion) report("TEMPLATE_VERSION", where, `Item targets v${item.templateVersion}, template is v${tpl.version}`);
  if (expectedEvidence && item.evidence !== expectedEvidence) report("ITEM_EVIDENCE", where, `Expected evidence "${expectedEvidence}"`);
  const fam = ix.families.get(tpl.familyId);
  if (fam) {
    const known = new Set([...fam.mistakeCategories, ...tpl.extraMistakeCategories].map((m) => m.id));
    for (const k of Object.keys(item.feedback.mistakes)) if (!known.has(k)) report("FEEDBACK_UNKNOWN_CATEGORY", where, `Mistake category "${k}" is not defined for ${fam.id}`);
    if (Object.keys(item.feedback.mistakes).length === 0) report("ITEM_WITHOUT_FEEDBACK", where, "Item needs at least one mistake-specific feedback message");
    if (!ALWAYS_ALLOWED_KINDS.has(item.answer.kind) && item.answer.kind !== fam.answerKind) {
      report("ANSWER_KIND", where, `Answer kind ${item.answer.kind} does not match family answer kind ${fam.answerKind}`);
    }
  }
  return tpl;
}

/** A standalone item is limited to its template's scope within the template's grade. */
export function verifyStandaloneItem(ix: CurriculumIndex, item: ExerciseItem, where: string): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (code, w, message, severity = "error") => issues.push({ code, severity, message, where: w });
  const tpl = checkItemContract(ix, item, where, report);
  if (tpl) checkItem(item, intersectScope(ix.cumulativeScope.get(tpl.grade) ?? {}, tpl.scope), where, report);
  return issues;
}

export function verifyLessonMusic(ix: CurriculumIndex): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (code, where, message, severity = "error") => issues.push({ code, severity, message, where });

  for (const { file, content } of ix.c.lessons) {
    const node = ix.nodeById.get(content.lessonId);
    if (!node) continue; // reported elsewhere
    // Teaching material (explanation, demonstration) may use anything taught at or before this node.
    const taughtOnly = taughtScope(ix, node);
    content.explanation.forEach((b, i) => b.kind === "notation" && checkFragment(b.music, taughtOnly, `${file}#explanation[${i}]`, report));
    checkFragment(content.demonstration.music, taughtOnly, `${file}#demonstration`, report);
    for (const [items, evidence] of [[content.guided, "learning"], [content.independent, "independent"]] as const) {
      for (const it of items) {
        const where = `${file}#${it.id}`;
        const tpl = checkItemContract(ix, it, where, report, evidence);
        if (!tpl) continue;
        const binding = node.exercises.find((b) => b.templateId === tpl.id);
        if (!binding) {
          report("ITEM_TEMPLATE_NOT_ON_NODE", where, `${tpl.id} is not bound on the lesson node`);
          continue;
        }
        // Items are limited to what the binding allows at this node (taught scope ∩ binding narrowing).
        checkItem(it, effectiveScope(ix, node, binding), where, report);
      }
    }
    for (const x of content.mastery.conceptIds) if (!node.conceptIds.includes(x)) report("MASTERY_CONCEPT", file, `${x} is not taught by ${node.id}`);
    for (const o of content.provenance.outcomeIds) if (!node.outcomeIds.includes(o)) report("PROVENANCE_OUTCOME", file, `${o} is not an outcome of ${node.id}`);
    for (const b of content.provenance.bookSectionIds) if (!node.bookSectionIds.includes(b)) report("PROVENANCE_BOOK", file, `${b} is not listed on ${node.id}`, "warning");
    for (const r of content.spacedReview) {
      const t = ix.templates.get(r.templateId);
      if (!t) report("UNKNOWN_REF", file, `Spaced review template ${r.templateId} not found`);
      else if (t.grade > node.grade) report("TEMPLATE_BEYOND_GRADE", file, `Spaced review uses Grade ${t.grade} template`);
    }
    const days = content.spacedReview.map((r) => r.afterDays);
    if (days.some((d, i) => i > 0 && d <= days[i - 1]!)) report("SPACED_REVIEW_ORDER", file, "Spaced review intervals must increase");
  }
  for (const { file, content } of ix.c.items) {
    const tpl = ix.templates.get(content.item.templateId);
    if (tpl) for (const o of content.outcomeIds) if (!tpl.outcomeIds.includes(o)) report("PROVENANCE_OUTCOME", file, `${o} is not targeted by ${tpl.id}`);
    issues.push(...verifyStandaloneItem(ix, content.item, `${file}#${content.item.id}`));
  }
  return issues;
}
