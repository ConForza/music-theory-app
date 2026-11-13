/**
 * g.key-signature, g.degree, g.interval, g.chord-function, g.cadence-choice, g.scale-spelling,
 * g.transposition, g.chromatic-scale, g.ornament-sign, g.choice-exact, g.multi-choice-set
 */
import { allowedForms, deriveScale, music } from "@mtp/curriculum";
import { EngineError } from "../context.ts";
import { chordPitches, melodyPitches } from "../derive.ts";
import { right, wrong, type AnswerOf, type Grader } from "./types.ts";

const { parsePitch, parseKey, formatPitch, formatKey, keyFifths, samePitch, enharmonic, diatonicNumber, chromaticNumber, intervalBetween, transpose, parseInterval, describeInterval, identifyTriad } = music;
type Pitch = music.Pitch;
const pretty = (p: string) => p.replace(/#/g, "♯").replace(/b(?=\d|$| )/g, "♭").replace(/x/g, "𝄪");
const fmt = (p: Pitch) => pretty(formatPitch(p));

// ---- key signatures -----------------------------------------------------

export const SIGNATURE_PLACEMENT = music.SIGNATURE_PLACEMENT;
export const signaturePitches = music.signaturePitches;

export const gradeKeySignature: Grader<AnswerOf<"key-signature">> = (_c, a, r) => {
  const want = parseKey(a.accepted[0]!);
  if (a.task === "name-key") {
    if (r.kind !== "key-name") throw new EngineError("response_mismatch", "Expected a key name");
    if (a.accepted.includes(r.key)) return right();
    const got = parseKey(r.key);
    const fg = keyFifths(got);
    const fw = keyFifths(want);
    if (fg === fw) return wrong("relative-confusion", `${r.key} shares this key signature, but check whether the music is in the major or the minor key.`);
    if (Math.sign(fg) !== Math.sign(fw) && fg !== 0 && fw !== 0) return wrong("mixed-sharps-flats", `${r.key} has ${fg > 0 ? "sharps" : "flats"}; this key signature has ${fw > 0 ? "sharps" : "flats"}.`);
    return wrong("wrong-count", `${r.key} has ${Math.abs(fg)} ${fg > 0 ? "sharp" : "flat"}${Math.abs(fg) === 1 ? "" : "s"}; count the key signature again.`);
  }
  if (r.kind !== "key-signature") throw new EngineError("response_mismatch", "Expected a key signature");
  const expected = signaturePitches(want, a.clef);
  const got = r.accidentals.map((x) => x.pitch);
  if (JSON.stringify(got) === JSON.stringify(expected)) return right();
  const gotP = got.map(parsePitch);
  const expP = expected.map(parsePitch);
  const types = new Set(gotP.map((p) => Math.sign(p.alter)));
  const wantSign = Math.sign(keyFifths(want));
  if (types.size > 1 || (gotP.length && [...types][0] !== wantSign) || gotP.some((p) => p.alter === 0 || Math.abs(p.alter) > 1)) return wrong("mixed-sharps-flats", `${formatKey(want)} uses only ${wantSign > 0 ? "sharps" : "flats"}.`);
  if (gotP.length !== expP.length) return wrong("wrong-count", `${formatKey(want)} has ${expP.length} ${wantSign > 0 ? "sharp" : "flat"}${expP.length === 1 ? "" : "s"}; you wrote ${gotP.length}.`);
  const letters = (ps: Pitch[]) => ps.map((p) => `${p.step}${p.alter}`).join();
  if (letters(gotP) === letters(expP)) return wrong("wrong-placement", "The right accidentals in the right order, but at least one is on the wrong line or space for this clef.");
  if ([...letters(gotP).split(",")].sort().join() === [...letters(expP).split(",")].sort().join()) return wrong("wrong-order", `The right accidentals, but not in the standard order (${wantSign > 0 ? "F C G D A E B" : "B E A D G C F"}).`);
  return wrong(null, "Those are not the accidentals of this key.");
};

// ---- choices --------------------------------------------------------------

export const gradeChoice: Grader<AnswerOf<"choice">> = (c, a, r) => {
  if (r.kind !== "choice") throw new EngineError("response_mismatch", "Expected a choice");
  if (!a.options.some((o) => o.id === r.optionId)) throw new EngineError("malformed_response", "Unknown option");
  if (a.correctOptionIds.includes(r.optionId)) return right();
  const correctId = a.correctOptionIds[0]!;
  const diagnosed = a.diagnoses?.[r.optionId];
  if (diagnosed) return wrong(diagnosed.category, diagnosed.reason);
  if (c.family.id === "fam.degree") return diagnoseDegree(a, r.optionId, correctId);
  const chosen = music.TERMS.find((t) => t.id === r.optionId);
  const correct = music.TERMS.find((t) => t.id === correctId);
  if (chosen && correct) {
    if (chosen.opposite?.includes(correct.id) || correct.opposite?.includes(chosen.id)) return wrong("opposite-meaning", `${chosen.term} means "${chosen.meaning}" — the opposite.`);
    if (chosen.similar?.includes(correct.id) || correct.similar?.includes(chosen.id) || chosen.category === correct.category) return wrong("confused-similar-term", `${chosen.term} means "${chosen.meaning}".`);
    return wrong("wrong-category", `${chosen.term} is about ${chosen.category.replace(/-/g, " ")}, not ${correct.category.replace(/-/g, " ")}.`);
  }
  return wrong(null, null);
};

function diagnoseDegree(a: AnswerOf<"choice">, chosen: string, correct: string) {
  const num = (id: string) => {
    const n = Number(id);
    if (Number.isInteger(n)) return n;
    const i = music.TECHNICAL_NAMES.indexOf(id.replace(/-/g, " ") as never);
    return i >= 0 ? i + 1 : NaN;
  };
  const g = num(chosen);
  const w = num(correct);
  if (Number.isNaN(g) || Number.isNaN(w)) return wrong(null, null);
  const label = a.options.find((o) => o.id === chosen)?.label ?? chosen;
  if (Math.abs(g - w) === 1 || Math.abs(g - w) === 6) return wrong("off-by-one", `${label} is one degree away. Count from the tonic as 1.`);
  return wrong("counted-from-wrong-note", `${label} is not right. Start counting from the tonic of the key, which is degree 1.`);
}

export const gradeMultiChoice: Grader<AnswerOf<"multi-choice">> = (_c, a, r) => {
  if (r.kind !== "multi-choice") throw new EngineError("response_mismatch", "Expected several choices");
  const ids = new Set(a.options.map((o) => o.id));
  if (r.optionIds.some((x) => !ids.has(x))) throw new EngineError("malformed_response", "Unknown option");
  const got = new Set(r.optionIds);
  const want = new Set(a.correctOptionIds);
  const missing = [...want].filter((x) => !got.has(x)).length;
  const extra = [...got].filter((x) => !want.has(x)).length;
  if (!missing && !extra) return right();
  return wrong(null, [missing ? `${missing} correct answer${missing === 1 ? " is" : "s are"} missing` : "", extra ? `${extra} of your choices ${extra === 1 ? "does" : "do"} not belong` : ""].filter(Boolean).join(", and ") + ".");
};

// ---- intervals ------------------------------------------------------------

function intervalFromCode(code: string): { interval?: music.Interval; numberOnly?: number } {
  if (/^\d{1,2}$/.test(code)) return { numberOnly: Number(code) };
  const compound = code.startsWith("c");
  const iv = parseInterval(compound ? code.slice(1) : code);
  return { interval: compound ? { ...iv, number: iv.number + 7 } : iv };
}

/** Notes a numbered (quality-free) build may land on: the scale notes at that number, in every allowed scale form. */
function diatonicTargets(c: Parameters<Grader>[0], a: AnswerOf<"interval">, n: number): Pitch[] {
  const lower = parsePitch(a.lower);
  const sign = a.direction === "down" ? -1 : 1;
  const d = diatonicNumber(lower) + sign * (n - 1);
  const step = music.STEPS[((d % 7) + 7) % 7]!;
  const octave = Math.floor(d / 7);
  if (!a.key) return [{ step, alter: 0, octave }];
  const key = parseKey(a.key);
  const forms = allowedForms(key, c.scope, a.minorForm);
  const alters = new Set(forms.flatMap((f) => music.scale(key, f)).filter((pc) => pc.step === step).map((pc) => pc.alter));
  return [...alters].map((alter) => ({ step, alter, octave }));
}

export const gradeInterval: Grader<AnswerOf<"interval">> = (c, a, r) => {
  const lower = parsePitch(a.lower);
  if (a.task === "identify") {
    if (r.kind !== "interval-name") throw new EngineError("response_mismatch", "Expected an interval name");
    const truth = intervalBetween(lower, parsePitch(a.upper!));
    const number = r.compound ? r.number + 7 : r.number;
    const qualityMatters = (a.acceptedIntervals ?? []).some((x) => !/^\d+$/.test(x));
    const numberOk = number === truth.number;
    const qualityOk = !qualityMatters || r.quality === truth.quality;
    if (numberOk && qualityOk) return right();
    const said = r.quality ? describeInterval({ number, quality: r.quality }) : `${music.ordinal(number)}`;
    if (!numberOk) {
      const semis = chromaticNumber(parsePitch(a.upper!)) - chromaticNumber(lower);
      if (qualityMatters && r.quality) {
        try {
          const t = transpose(lower, { number, quality: r.quality }, "up");
          if (chromaticNumber(t) - chromaticNumber(lower) === semis) return wrong("enharmonic-spelling", `A ${said} would sound the same, but the interval number comes from the letter names, not the sound.`);
        } catch {
          /* impossible quality for that number */
        }
      }
      if (truth.number > 8 && (number === truth.number - 7 || Math.abs(number - truth.number) === 1)) return wrong("compound-arithmetic", `You said a ${said}. For a compound interval add 7 to the simple number (a compound 3rd is a 10th).`);
      if (Math.abs(number - truth.number) === 1) return wrong("counted-one-end-only", `You said a ${said}. Count both the bottom and the top note.`);
      return wrong(null, `You said a ${said}. Count the letter names from the lower note to the upper note.`);
    }
    if ((r.quality === "A" && truth.quality === "d") || (r.quality === "d" && truth.quality === "A")) return wrong("augmented-diminished-swap", `The number is right, but it is not ${r.quality === "A" ? "augmented" : "diminished"}.`);
    return wrong("quality-from-wrong-key", `The number is right; check the quality by asking whether the top note is in the major scale of the lower note.`);
  }
  // build
  if ((r.kind !== "staff-position" && r.kind !== "pitch") || !/\d$/.test(r.pitch)) throw new EngineError("response_mismatch", "Expected a note on the stave (with its octave)");
  const got = parsePitch(r.pitch);
  const { interval, numberOnly } = intervalFromCode(a.target!);
  const targets = interval ? [transpose(lower, interval, a.direction!)] : diatonicTargets(c, a, numberOnly!);
  if (targets.some((t) => samePitch(t, got))) return right();
  const t0 = targets[0]!;
  const gotNumber = Math.abs(diatonicNumber(got) - diatonicNumber(lower)) + 1;
  const wantNumber = Math.abs(diatonicNumber(t0) - diatonicNumber(lower)) + 1;
  if (targets.some((t) => enharmonic(t, got))) return wrong("enharmonic-spelling", `${fmt(got)} sounds right but is spelt with the wrong letter: the interval number fixes the letter name.`);
  if (gotNumber === wantNumber && got.step === t0.step) {
    let q: string | null;
    try {
      q = describeInterval(intervalBetween(lower, got));
    } catch {
      q = null;
    }
    const swap = interval && ((interval.quality === "A" && q?.startsWith("diminished")) || (interval.quality === "d" && q?.startsWith("augmented")));
    return wrong(swap ? "augmented-diminished-swap" : "quality-from-wrong-key", `${fmt(got)} makes ${q ? `a ${q}` : "the wrong quality"}. Keep the letter and change the accidental.`);
  }
  if (Math.abs(gotNumber - wantNumber) === 7) return wrong("compound-arithmetic", `${fmt(got)} is an octave out.`);
  if (Math.abs(gotNumber - wantNumber) === 1) return wrong("counted-one-end-only", `${fmt(got)} makes a ${music.ordinal(gotNumber)}. Count the lower note as 1.`);
  return wrong(null, `${fmt(got)} makes a ${music.ordinal(gotNumber)}.`);
};

// ---- chords and cadences -------------------------------------------------

export const gradeChord: Grader<AnswerOf<"chord">> = (c, a, r) => {
  const key = parseKey(a.key);
  if (a.task === "identify") {
    if (r.kind !== "chord-name") throw new EngineError("response_mismatch", "Expected a chord name");
    const pitches = chordPitches(c.item, a.pitches);
    const truth = identifyTriad(key, pitches);
    if (!truth) throw new EngineError("item_inconsistent", "The chord shown is not a triad of the key");
    if (music.romanDegree(r.roman) === music.romanDegree(truth.roman) && r.inversion === truth.inversion) return right();
    if (music.romanDegree(r.roman) === music.romanDegree(truth.roman)) return wrong("inversion-misread", `The chord is right; look at the lowest note to find the position (a, b or c).`);
    const bass = music.lowest(pitches);
    const rootIsBass = music.romanDegree(r.roman) === music.degreeOf(key, bass);
    if (truth.inversion !== "a" && rootIsBass) return wrong("root-confused-with-bass", `${pretty(music.formatPitchClass(bass))} is the lowest note, but not the root. Rearrange the notes into 3rds to find the root.`);
    return wrong("wrong-degree", `Chord ${r.roman} does not contain these notes. Find the root by stacking the notes in 3rds.`);
  }
  if (r.kind !== "chord-notes" && r.kind !== "pitch-sequence") throw new EngineError("response_mismatch", "Expected chord notes");
  const got = r.pitches.map(parsePitch);
  const target = a.target!;
  const id = identifyTriad(key, got);
  if (id && music.romanDegree(id.roman) === music.romanDegree(target.roman) && id.inversion === target.inversion) return right();
  const want = music.triad(key, target.roman);
  const has = (pc: music.PitchClass) => got.some((p) => music.samePitchClassSpelling(p, pc));
  if (key.mode === "minor" && music.romanDegree(target.roman) === 5) {
    const lead = want[1]!;
    if (got.some((p) => p.step === lead.step && p.alter === lead.alter - 1)) return wrong("leading-note-not-raised", `In ${formatKey(key)} the 3rd of chord V is the leading note, raised by an accidental.`);
  }
  if (id && music.romanDegree(id.roman) === music.romanDegree(target.roman)) return wrong("inversion-misread", `Those are the right notes, but the lowest note decides the position: ${target.inversion === "a" ? "the root" : target.inversion === "b" ? "the 3rd" : "the 5th"} must be at the bottom.`);
  const missing = want.filter((pc) => !has(pc));
  const extra = got.filter((p) => !want.some((pc) => music.samePitchClassSpelling(p, pc)));
  if (missing.length && !extra.length) return wrong("note-missing", `The chord needs ${missing.map((p) => pretty(music.formatPitchClass(p))).join(" and ")} as well.`);
  return wrong("wrong-degree", `${extra.length ? `${extra.map(fmt).join(", ")} ${extra.length === 1 ? "is" : "are"} not in chord ${target.roman}.` : "That is not the right chord."}`);
};

export const gradeProgression: Grader<AnswerOf<"chord-progression">> = (c, a, r) => {
  if (r.kind !== "progression") throw new EngineError("response_mismatch", "Expected chords for each point");
  const key = parseKey(a.key);
  const romans = c.scope.chordDegrees?.length ? c.scope.chordDegrees : ["I", "ii", "IV", "V"];
  const marks: Array<{ index: number; ok: boolean }> = [];
  let firstProblem: { category: string; reason: string } | null = null;
  a.points.forEach((p, i) => {
    const chosen = r.chords[p.label];
    const okChord = Boolean(chosen && romans.includes(chosen) && p.melodyPitches.every((m) => music.triadContains(key, chosen, parsePitch(m))));
    marks.push({ index: i, ok: okChord });
    if (!okChord && !firstProblem) {
      firstProblem = chosen
        ? { category: "chord-lacks-melody-note", reason: `At ${p.label}, chord ${chosen} does not contain the melody note ${p.melodyPitches.map((x) => pretty(x.replace(/\d$/, ""))).join(" and ")}.` }
        : { category: "chord-lacks-melody-note", reason: `Choose a chord for ${p.label}.` };
    }
  });
  if (firstProblem) return wrong((firstProblem as { category: string }).category, (firstProblem as { reason: string }).reason, { marks });
  const allowedTypes = c.scope.cadenceTypes ?? ["perfect", "plagal", "imperfect"];
  for (const cad of a.cadences) {
    const [x, y] = cad.labels;
    const t = music.classifyCadence(r.chords[x]!, r.chords[y]!);
    if (!t) return wrong("non-cadential-pair", `${r.chords[x]}–${r.chords[y]} at ${x}–${y} is not a cadence. Cadences are V–I, IV–I, or end on V.`, { marks });
    if (!cad.acceptedTypes.includes(t) || !allowedTypes.includes(t)) return wrong("cadence-misnamed", `${r.chords[x]}–${r.chords[y]} makes a ${t} cadence; this question asks for a ${cad.acceptedTypes.join(" or ")} cadence.`, { marks });
  }
  return right(null, { marks });
};

// ---- scales, transposition and chromatic scales --------------------------

function seq(r: Parameters<Grader>[2]): Pitch[] {
  if (r.kind !== "pitch-sequence") throw new EngineError("response_mismatch", "Expected a sequence of notes");
  return r.pitches.map(parsePitch);
}
const markAll = (got: Pitch[], want: Pitch[]) => got.map((p, i) => ({ index: i, ok: Boolean(want[i] && samePitch(p, want[i]!)) }));

export const gradeScale: Grader<AnswerOf<"pitch-sequence">> = (_c, a, r) => {
  const d = a.derivation;
  if (d.rule !== "scale") throw new EngineError("item_inconsistent", "Not a scale task");
  const got = seq(r);
  const want = deriveScale(d.key, d.form, d.direction, parsePitch(d.start));
  const marks = markAll(got, want);
  if (got.length === want.length && marks.every((m) => m.ok)) return right(null, { marks });
  const key = parseKey(d.key);
  if (got.length !== want.length || !got[0] || !samePitch(got[0], want[0]!) || (got.length > 1 && Math.sign(diatonicNumber(got[1]!) - diatonicNumber(got[0]!)) !== Math.sign(diatonicNumber(want[1]!) - diatonicNumber(want[0]!)))) {
    return wrong("wrong-direction-or-octave", `Write ${want.length} notes, starting on ${fmt(want[0]!)} and going ${d.direction.replace("-", " then ")}.`, { marks });
  }
  const letters = (ps: Pitch[]) => ps.map((p) => diatonicNumber(p)).join();
  if (letters(got) !== letters(want)) {
    const bad = got.findIndex((p, i) => diatonicNumber(p) !== diatonicNumber(want[i]!));
    return wrong("letter-skipped-or-repeated", `Note ${bad + 1} (${fmt(got[bad]!)}) breaks the letter pattern: each note uses the next letter name.`, { marks });
  }
  const same = (alt: Pitch[]) => alt.length === got.length && alt.every((p, i) => samePitch(p, got[i]!));
  if (key.mode === "minor") {
    const other = d.form === "harmonic" ? deriveScale(d.key, "melodic", d.direction, parsePitch(d.start)) : deriveScale(d.key, "harmonic", d.direction, parsePitch(d.start));
    if (same(other)) {
      // Where the question's scope does not include the other form (Grade 2 teaches only the harmonic minor), its name is not used:
      // the learner is told what to change, not about a scale they have not met.
      if (!(_c.scope.minorForms ?? []).includes(d.form === "harmonic" ? "melodic" : "harmonic")) return wrong("wrong-minor-form", "Too many notes have been raised. In the harmonic minor only the 7th note is raised: the 6th stays as it is in the key signature.", { marks });
      return wrong("wrong-minor-form", `That is the ${d.form === "harmonic" ? "melodic" : "harmonic"} minor; this question asks for the ${d.form} form.`, { marks });
    }
    if (d.form === "melodic" && d.direction !== "ascending") {
      const up = deriveScale(d.key, "melodic", "ascending", parsePitch(d.start));
      const raisedDown = d.direction === "descending" ? [...up].reverse() : [...up, ...[...up].reverse().slice(1)];
      if (same(raisedDown.map((p, i) => ({ ...p, octave: want[i]!.octave })))) return wrong("melodic-descent-not-restored", "Coming down, the melodic minor lowers the 7th and 6th again (back to the key signature notes).", { marks });
    }
  }
  const wrongIdx = marks.filter((m) => !m.ok).map((m) => m.index);
  const sigMisapplied = wrongIdx.some((i) => music.signatureAlter(key, got[i]!.step) !== 0 && got[i]!.alter !== want[i]!.alter && want[i]!.alter === music.signatureAlter(key, got[i]!.step));
  if (sigMisapplied) return wrong("key-signature-misapplied", `${wrongIdx.map((i) => fmt(got[i]!)).join(", ")}: remember the sharps or flats of ${formatKey(key)}.`, { marks });
  return wrong("semitone-misplaced", `Check the tones and semitones at ${wrongIdx.map((i) => fmt(got[i]!)).join(", ")}.`, { marks });
};

export const gradeTransposition: Grader<AnswerOf<"pitch-sequence">> = (c, a, r) => {
  const d = a.derivation;
  if (d.rule !== "transpose") throw new EngineError("item_inconsistent", "Not a transposition task");
  if (!c.item.music) throw new EngineError("item_inconsistent", "Transposition needs source music");
  const got = seq(r);
  const source = melodyPitches(c.item.music);
  const iv = parseInterval(d.interval);
  const want = source.map((p) => transpose(p, iv, d.direction));
  const marks = markAll(got, want);
  const wantKey = (() => {
    const t = transpose({ ...parseKey(d.sourceKey).tonic, octave: 4 }, iv, d.direction);
    return { tonic: { step: t.step, alter: t.alter }, mode: parseKey(d.sourceKey).mode } as music.Key;
  })();
  const needsKeyChoice = d.interval !== "P8";
  const keyOk = !needsKeyChoice || (r.kind === "pitch-sequence" && r.key !== undefined && keyFifths(parseKey(r.key)) === keyFifths(wantKey));
  const notesOk = got.length === want.length && marks.every((m) => m.ok);
  if (notesOk && keyOk) return right(null, { marks });
  if (notesOk) return wrong("key-signature-missing", `The notes are right; now give the transposed part its key signature (${formatKey(wantKey)}).`, { marks });
  if (got.length !== want.length) return wrong(null, `Transpose every note: the melody has ${want.length} notes.`, { marks });
  if (got.every((p, i) => enharmonic(p, want[i]!))) return wrong("enharmonic-respelling", "Every note sounds right, but some are spelt with the wrong letter name. Move every letter by the same number of steps.", { marks });
  if (got.every((p, i) => music.samePitchClassSpelling(p, want[i]!)) && new Set(got.map((p, i) => p.octave - want[i]!.octave)).size === 1) return wrong("wrong-octave", `The letters are right, but the whole tune is in the wrong octave.`, { marks });
  const sourceClef = c.item.music.clef as music.Clef;
  const samePositions = got.every((p, i) => music.staffPosition(a.clef, p) === music.staffPosition(sourceClef, source[i]!));
  if (sourceClef !== a.clef && samePositions) return wrong("wrong-clef", `You copied the note positions; in the ${a.clef} clef the same positions are different notes.`, { marks });
  const ivs = got.map((p, i) => {
    try {
      const x = intervalBetween(source[i]!, p);
      return `${x.quality}${x.number}:${Math.sign(diatonicNumber(p) - diatonicNumber(source[i]!))}`;
    } catch {
      return "?";
    }
  });
  if (new Set(ivs).size === 1 && ivs[0] !== "?") {
    const [ivText, dir] = ivs[0]!.split(":");
    const wantDir = d.direction === "up" ? "1" : "-1";
    if (ivText === `${iv.quality}${iv.number}` && dir !== wantDir) return wrong("wrong-direction", `You moved the tune ${d.direction === "up" ? "down" : "up"}; this question moves it ${d.direction}.`, { marks });
    return wrong("wrong-interval", `You moved every note by the same interval, but not by a ${describeInterval(iv)}.`, { marks });
  }
  const badAcc = marks.filter((m) => !m.ok).some((m) => source[m.index]!.alter !== 0 || got[m.index]!.alter !== want[m.index]!.alter);
  if (badAcc) return wrong("accidental-not-adjusted", "Some accidentals were not adjusted: work out each accidental from the interval, not by copying it.", { marks });
  return wrong(null, "Some notes are not transposed correctly.", { marks });
};

export const gradeChromatic: Grader<AnswerOf<"pitch-sequence">> = (_c, a, r) => {
  const d = a.derivation;
  if (d.rule !== "chromatic") throw new EngineError("item_inconsistent", "Not a chromatic task");
  const got = seq(r);
  const problems = music.checkChromatic(got, parsePitch(d.start), d.direction);
  const marks = got.map((p, i) => ({ index: i, ok: !problems.some((x) => x.index === i) }));
  if (!problems.length) return right(null, { marks });
  const p = problems[0]!;
  const map: Record<string, string> = { "letter-used-three-times": "letter-used-three-times", "letter-missing": "letter-missing", "not-a-semitone": "not-all-semitones", length: "not-all-semitones", "double-accidental": "unnecessary-accidentals" };
  const order = ["letter-used-three-times", "letter-missing", "double-accidental", "not-a-semitone", "length", "wrong-start", "wrong-end"];
  const pick = [...problems].sort((x, y) => order.indexOf(x.code) - order.indexOf(y.code))[0] ?? p;
  return wrong(map[pick.code] ?? null, pick.message, { marks });
};

// ---- ornaments --------------------------------------------------------------

export const gradeOrnament: Grader<AnswerOf<"ornament-sign">> = (_c, a, r) => {
  if (r.kind !== "ornament") throw new EngineError("response_mismatch", "Expected an ornament");
  const truth = a.task === "name-sign" ? a.sign! : music.classifyOrnamentFigure(parsePitch(a.mainNote!), a.writtenOut!.map(parsePitch));
  const ok = truth !== null && truth !== "inverted-turn" && r.sign === truth;
  if (ok || a.accepted.includes(r.sign) && truth !== null && truth !== "inverted-turn" && a.accepted.includes(truth as never)) return right();
  const pair = (x: string, y: string) => (r.sign === x && truth === y) || (r.sign === y && truth === x);
  const info = music.ORNAMENT_INFO[r.sign];
  const said = `A ${info.name} is played as ${info.played}.`;
  if (pair("upper-mordent", "lower-mordent")) return wrong("upper-lower-mordent-swap", `${said} Check whether the extra note is above or below.`);
  if (r.sign === "turn" && truth === "inverted-turn") return wrong("turn-inverted", "That figure starts below the main note; a turn starts on the note above.");
  if (pair("acciaccatura", "appoggiatura")) return wrong("acciaccatura-appoggiatura-swap", `${said}`);
  if ((r.sign === "trill" && String(truth).includes("mordent")) || (String(r.sign).includes("mordent") && truth === "trill")) return wrong("trill-mordent-confusion", `${said}`);
  return wrong(null, said);
};

