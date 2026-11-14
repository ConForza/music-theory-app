/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5 additions made after comparing the course with eight ABRSM Grade 5 papers (docs/curriculum/GRADE_5_PAPER_COMPARISON.md,
 * decisions P3-P6). The papers were used only to see which question types are asked; nothing is copied from them.
 *
 *  - t.g5.metre-mixed     which time signature fits a bar, offered among regular AND irregular signatures
 *  - t.g5.rest-judge      which bar writes its rests correctly, in compound and irregular time (checked with `music.checkBar`)
 *  - t.g5.duration-facts  beats in a bar and note-value sums (dotted notes, ties) counted in smaller values
 *  - t.g5.clef-minor      which clef makes a given set of notes an ascending minor scale
 *  - t.g5.transpose-judge is a transposed bar right, or what is wrong with it
 *
 * Every answer is computed with the rule functions in `@mtp/curriculum`, never typed per question; the tests recompute them independently.
 */
import { music, type Measure } from "@mtp/curriculum";
import { n, r, rhythmLine, frag, type Gen } from "./families.ts";
import { ALL_REGULAR, timeSigRead4 } from "./grade4-rhythm.ts";
import { timeSigIrregular } from "./grade5-rhythm.ts";
import { INST_LABEL, instIn, ivText, melodyFrag } from "./grade5-pitch.ts";
import { KEYS_G5, F, WORDS, choiceAnswer, fitsIn, keyWords, melodyIn5, note, shuffled, type Clef, type Ctx, type Ev, type Pitch } from "./grade5-lib.ts";

const { frac, mul, valueFor, parseTimeSignature, classifyTimeSignature, barCapacity, equals, parseKey, formatKey, naturalAt, staffPosition, transpose } = music;
const MAX_IRREGULAR = ["5/4", "7/4", "5/8", "7/8"];
const wordOf = (x: number) => WORDS[x] ?? String(x);
const nameOf = (f: music.Fraction): string | null => {
  const v = valueFor(f, 1);
  return v ? `${v.dots ? "dotted-" : ""}${v.value}` : null;
};
const measuresOf = (bars: Ev[][]): Measure[] => bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));

// ---------------------------------------------------------------------------
// t.g5.metre-mixed
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// bars with tuplets for t.g5.metre-mixed
// ---------------------------------------------------------------------------

/** Two bars in a regular or irregular signature, every one with at least one tuplet: triplets, quintuplets and septuplets in a beat of simple or irregular time, duplets in a compound beat. */
function tupletBars(c: Ctx, ts: string): Ev[][] | null {
  const kinds = c.scope.tuplets ?? [];
  const st = music.metreStructures(ts)[0]!;
  const { bottom, top } = parseTimeSignature(ts);
  const compound = st.metre === "compound";
  const beats = compound ? st.groups.length : top;
  const beatF = compound ? mul(frac(1, bottom), frac(3)) : frac(1, bottom);
  const kinds2: Array<"duplet" | "triplet" | "five" | "seven"> = compound ? (kinds.includes("duplet") ? ["duplet"] : []) : [...(kinds.includes("triplet") ? (["triplet"] as const) : []), ...(kinds.includes("irregular") ? (["five", "seven"] as const) : [])];
  if (!kinds2.length) return null;
  const beamNotes = (vs: Ev[]): Ev[] => vs.map((e, i) => ({ ...e, beam: i === 0 ? "begin" : i === vs.length - 1 ? "end" : "continue" }) as Ev);
  const canBeam = (v: music.NoteValue) => v === "quaver" || v === "semiquaver" || v === "demisemiquaver";
  const tuplet = (kind: "duplet" | "triplet" | "five" | "seven"): Ev | null => {
    const count = kind === "duplet" ? 2 : kind === "triplet" ? 3 : kind === "five" ? 5 : 7;
    const normal = kind === "duplet" ? 3 : 2 * (kind === "triplet" ? 1 : 2);
    const each = kind === "duplet" ? valueFor(frac(1, bottom), 0) : kind === "triplet" ? valueFor(mul(beatF, frac(1, 2)), 0) : valueFor(mul(beatF, frac(1, 4)), 0);
    if (!each) return null;
    const notes = Array.from({ length: count }, () => n(each.value, 0));
    return { kind: "tuplet", actual: count, normal, events: canBeam(each.value) ? beamNotes(notes) : notes } as Ev;
  };
  const plain = (): Ev[] | null => {
    const whole = valueFor(beatF, 1);
    if (!whole) return null;
    if (compound) return c.rng.chance(0.5) ? [n(whole.value, whole.dots)] : (() => { const sub = valueFor(frac(1, bottom), 0); return sub ? (canBeam(sub.value) ? beamNotes : (x: Ev[]) => x)(Array.from({ length: 3 }, () => n(sub.value, 0))) : null; })();
    const half = valueFor(mul(beatF, frac(1, 2)), 0);
    return c.rng.chance(0.5) || !half ? [n(whole.value, whole.dots)] : canBeam(half.value) ? beamNotes([n(half.value, 0), n(half.value, 0)]) : [n(half.value, 0), n(half.value, 0)];
  };
  const bars: Ev[][] = [];
  for (let b = 0; b < 2; b++) {
    const tupletAt = c.rng.int(0, beats - 1);
    const bar: Ev[] = [];
    for (let k = 0; k < beats; k++) {
      const piece = k === tupletAt || c.rng.chance(0.25) ? tuplet(c.rng.pick(kinds2)) : null;
      const evs = piece ? [piece] : plain();
      if (!evs) return null;
      bar.push(...evs);
    }
    bars.push(bar);
  }
  if (JSON.stringify(bars[0]) === JSON.stringify(bars[1])) return null;
  const s0 = music.metreStructures(ts)[0]!;
  for (const b of bars) if (music.checkBar(b as unknown as music.REvent[], s0, { requireBeams: false }).some((x) => x.code === "bar-overfull" || x.code === "bar-underfull" || x.code === "tuplet-total-wrong")) return null;
  return bars;
}

/** A bar (or two) shown without its time signature; the choices mix regular and irregular signatures. Only signatures of a different bar length are offered as wrong answers. */
export const metreMixed5: Gen = (c): any => {
  const pool = c.scope.timeSignatures ?? [];
  const regular = ALL_REGULAR.filter((t) => pool.includes(t));
  const irregular = MAX_IRREGULAR.filter((t) => pool.includes(t));
  if (!regular.length || !irregular.length) return null;
  const useIrregular = c.rng.chance(0.5);
  let d: any;
  let ts: string;
  if ((c.scope.tuplets ?? []).length && c.rng.chance(0.4)) {
    // a bar with tuplets (a triplet or duplet, and in irregular time quintuplets and septuplets)
    ts = c.rng.pick(useIrregular ? irregular : regular);
    const bars = tupletBars(c, ts);
    if (!bars) return null;
    d = { music: rhythmLine(measuresOf(bars)) };
  } else {
    const inner = useIrregular
      ? timeSigIrregular({ ...c, scope: { ...c.scope, timeSignatures: irregular } })
      : timeSigRead4({ ...c, scope: { ...c.scope, timeSignatures: regular } });
    if (!inner) return null;
    d = inner as any;
    ts = d.answer.accepted[0];
  }
  const cap = barCapacity(parseTimeSignature(ts));
  const rivals = [...regular, ...irregular].filter((t) => t !== ts && !equals(barCapacity(parseTimeSignature(t)), cap));
  // always offer at least one signature of the other kind (regular against irregular), so the choice is really mixed
  const otherKind = shuffled(c, rivals.filter((t) => (classifyTimeSignature(t).metre === "irregular") !== useIrregular));
  const sameKind = shuffled(c, rivals.filter((t) => (classifyTimeSignature(t).metre === "irregular") === useIrregular));
  const wrongs: string[] = [];
  for (const t of [otherKind[0], ...sameKind, ...otherKind.slice(1)]) if (t && !wrongs.includes(t) && wrongs.length < 3) wrongs.push(t);
  if (wrongs.length < 3) return null;
  const opts = shuffled(c, [ts, ...wrongs]);
  return {
    prompt: "Which time signature belongs to this rhythm? The bars use one time signature throughout.",
    music: d.music,
    answer: choiceAnswer(
      opts.map((t) => [t, t] as [string, string]),
      ts,
      Object.fromEntries(wrongs.map((t) => [t, ["beat-count-wrong", `${t} holds a different amount of music in a bar. Add up one bar in the value of the lower figure and compare.`] as [string, string]])),
    ),
    hints: ["Add up one bar. A dotted-note beat, or three beamed notes to a beat, means each beat divides into three; five or seven beats means irregular time."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.rest-judge
// ---------------------------------------------------------------------------

type Bar = { ev: Ev[]; right: boolean };

/** Which bar writes its rests correctly (compound or irregular time)? The beats always add up; only the rests differ. */
export const restJudge5: Gen = (c): any => {
  if (!c.scope.rests) return null;
  const pool = (c.scope.timeSignatures ?? []).filter((t) => classifyTimeSignature(t).metre !== "simple");
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const { bottom } = parseTimeSignature(ts);
  const structs = music.metreStructures(ts);
  const s = c.rng.pick(structs);
  const lens: number[] = s.metre === "irregular" ? s.pattern! : Array.from({ length: s.groups.length }, () => 3);
  const unit = frac(1, bottom);
  const val = (k: number) => valueFor(mul(unit, frac(k)), 1);
  const unitV = val(1);
  if (!unitV) return null;
  const beamed = bottom >= 8;
  const sound = (L: number): Ev[] => {
    const kind = c.rng.pick(L === 3 ? (["whole", "split", "two-one"] as const) : L === 1 ? (["whole"] as const) : (["whole", "split"] as const));
    if (kind === "whole") { const v = val(L); return v ? [n(v.value, v.dots)] : []; }
    if (kind === "two-one") { const a = val(2); return a ? [n(a.value, a.dots), n(unitV.value, unitV.dots)] : []; }
    return Array.from({ length: L }, (_, i) => n(unitV.value, unitV.dots, beamed ? { beam: i === 0 ? "begin" : i === L - 1 ? "end" : "continue" } : {}));
  };
  if (lens.length === 2) {
    // Two groups: the last unit of the first and the first unit of the second are silent. Right: a rest for each; wrong: one rest across the boundary.
    const two = val(2);
    if (!two) return null;
    const part1 = sound(lens[0]! - 1);
    const part2 = sound(lens[1]! - 1);
    if (!part1.length || !part2.length) return null;
    const copy = (xs: Ev[]) => xs.map((e) => ({ ...e }));
    const make2 = (across: boolean): Ev[] => [...copy(part1), ...(across ? [r(two.value, two.dots)] : [r(unitV.value, unitV.dots), r(unitV.value, unitV.dots)]), ...copy(part2)];
    const pair: Bar[] = [{ ev: make2(false), right: true }, { ev: make2(true), right: false }];
    const iss = (b: Bar) => music.checkBar(b.ev as unknown as music.REvent[], s, { requireBeams: false });
    if (iss(pair[0]!).length) return null;
    const bad = iss(pair[1]!);
    if (!bad.length || !bad.every((x) => x.code === "rest-across-beat")) return null;
    const ord = shuffled(c, pair);
    const at2 = ord.findIndex((b) => b.right);
    const noun = s.metre === "irregular" ? "group" : "beat";
    const unitWord = `${unitV.value}${unitV.dots ? " (dotted)" : ""}`;
    return {
      prompt: `Each bar is in ${ts} (${s.metre === "irregular" ? `grouped ${s.pattern!.join("+")}` : "with dotted-note beats"}). The last ${unitWord} of the first ${noun} and the first ${unitWord} of the second ${noun} are silent. Which bar writes the rests correctly?`,
      music: rhythmLine(measuresOf(ord.map((b) => b.ev)), { timeSignature: ts }),
      answer: {
        kind: "choice",
        options: ord.map((_, i) => ({ id: String(i + 1), label: `Bar ${i + 1}` })),
        correctOptionIds: [String(at2 + 1)],
        diagnoses: Object.fromEntries(ord.map((b, i) => [String(i + 1), b.right ? null : { category: "rest-grouping", reason: `A rest must not run across the line between two ${noun}s: each ${noun} needs its own rest.` }]).filter(([, v]) => v)),
      },
      hints: [`Each ${noun} is marked off from the next: a rest should not join the end of one to the start of the next.`],
    };
  }
  if (lens.length < 3) return null;
  const idx = lens.map((_, i) => i);
  const picked = shuffled(c, idx).slice(0, 2);
  const [A, B] = picked as [number, number];
  const base: Array<Ev[] | "rest"> = lens.map((L, i) => (i === A || i === B ? "rest" : sound(L)));
  if (base.some((g) => g !== "rest" && !g.length)) return null;
  const restOf = (L: number): Ev[] => { const v = val(L); return v ? [r(v.value, v.dots)] : []; };
  const fussy = (L: number): Ev[] => Array.from({ length: L }, () => r(unitV.value, unitV.dots));
  const make = (fussyAt: number | null): Ev[] => lens.flatMap((L, i) => { const g = base[i]!; return g === "rest" ? (i === fussyAt ? fussy(L) : restOf(L)) : g.map((e) => ({ ...e })); });
  const bars: Bar[] = [
    { ev: make(null), right: true },
    { ev: make(A), right: false },
    { ev: make(B), right: false },
  ];
  const issues = (b: Bar) => music.checkBar(b.ev as unknown as music.REvent[], s, { requireBeams: false });
  if (issues(bars[0]!).length) return null;
  for (const b of bars.slice(1)) {
    const is = issues(b);
    if (!is.length || !is.every((x) => x.code === "rests-not-combined")) return null;
  }
  if (new Set(bars.map((b) => JSON.stringify(b.ev))).size !== 3) return null;
  const order = shuffled(c, bars);
  const at = order.findIndex((b) => b.right);
  const where = s.metre === "irregular" ? `grouped ${s.pattern!.join("+")}` : "with dotted-note beats";
  return {
    prompt: `All three bars are in ${ts} (${where}) and have two silent ${s.metre === "irregular" ? "groups" : "beats"}. Which bar writes its rests correctly?`,
    music: rhythmLine(measuresOf(order.map((b) => b.ev)), { timeSignature: ts }),
    answer: {
      kind: "choice",
      options: order.map((_, i) => ({ id: String(i + 1), label: `Bar ${i + 1}` })),
      correctOptionIds: [String(at + 1)],
      diagnoses: Object.fromEntries(order.map((b, i) => [String(i + 1), b.right ? null : { category: "rest-grouping", reason: s.metre === "irregular" ? "A silent group is written as one rest that fills the group, not as several small rests." : "A whole silent beat is one rest (a dotted rest, or a rest and a smaller rest), not three small rests." }]).filter(([, v]) => v)),
    },
    hints: ["Look at each silent group or beat on its own: it should be one rest, not a row of small ones."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.duration-facts
// ---------------------------------------------------------------------------

const VALS: Array<{ value: music.NoteValue; dots: number }> = [
  { value: "minim", dots: 1 }, { value: "minim", dots: 0 }, { value: "crotchet", dots: 1 }, { value: "crotchet", dots: 0 }, { value: "quaver", dots: 1 }, { value: "quaver", dots: 0 }, { value: "semiquaver", dots: 1 }, { value: "semiquaver", dots: 0 },
];
const durOf = (v: { value: music.NoteValue; dots: number }) => music.dotted(v.value, v.dots);
const nameV = (v: { value: music.NoteValue; dots: number }) => `${v.dots ? "dotted " : ""}${v.value}`;
const plural = (s: string) => `${s}s`;

/** Beats in a bar of a regular signature, and sums of note values counted in smaller values (a dotted note, or two tied notes, in demisemiquavers or semiquavers). */
export const durationFacts5: Gen = (c): any => {
  const mode = c.rng.pick(["beats", "beats", "equals", "tied"] as const);
  const numberChoice = (right: number, wrongs: Array<[number, string, string]>, prompt: string, hint: string) => {
    const seen = new Map<number, [string, string]>();
    for (const [x, cat, why] of wrongs) if (x > 0 && Number.isInteger(x) && x !== right && !seen.has(x)) seen.set(x, [cat, why]);
    if (seen.size < 2) return null;
    const ids = [right, ...seen.keys()].sort((p, q) => p - q);
    return {
      prompt,
      answer: choiceAnswer(ids.map((x) => [String(x), String(x)] as [string, string]), String(right), Object.fromEntries([...seen].map(([x, w]) => [String(x), w]))),
      hints: [hint],
    };
  };
  if (mode === "beats") {
    const pool = (c.scope.timeSignatures ?? []).filter((t) => classifyTimeSignature(t).metre !== "irregular");
    if (!pool.length) return null;
    const ts = c.rng.pick(pool);
    const st = music.metreStructures(ts)[0]!;
    const unitName = nameOf(st.beatUnit);
    if (!unitName) return null;
    const top = st.groups.length;
    const t = parseTimeSignature(ts).top;
    return numberChoice(
      top,
      [[t, "beat-count-wrong", st.metre === "compound" ? `${t} counts the small notes: each beat is three of them (a dotted note).` : `${t} is the upper figure, but the question names a different note value.`], [top + 1, "beat-count-wrong", "Count again: one beat is the value named by the question."], [top * 2, "beat-count-wrong", "That counts the notes of half the size."], [Math.max(1, top - 1), "beat-count-wrong", "Count again: one beat is the value named by the question."]],
      `In ${ts}, how many ${unitName} beats are there in one bar?`,
      st.metre === "compound" ? "When the beats are dotted notes, each beat equals three of the lower-figure notes: divide the upper figure by three." : "In simple time the upper figure is the number of beats.",
    );
  }
  const smalls = [{ value: "demisemiquaver" as const, dots: 0 }, { value: "semiquaver" as const, dots: 0 }, { value: "quaver" as const, dots: 0 }];
  if (mode === "equals") {
    const big = c.rng.pick(VALS.filter((v) => v.value !== "semiquaver" || v.dots === 0));
    const small = c.rng.pick(smalls);
    const ratio = (durOf(big).n * durOf(small).d) / (durOf(big).d * durOf(small).n);
    if (!Number.isInteger(ratio) || ratio < 4 || ratio > 24) return null;
    if (!big.dots && small.value !== "demisemiquaver") return null; // plain note values in the next size down are too easy
    const noDot = (durOf({ value: big.value, dots: 0 }).n * durOf(small).d) / (durOf({ value: big.value, dots: 0 }).d * durOf(small).n);
    const wrongs: Array<[number, string, string]> = [[ratio + (small.value === "quaver" ? 1 : 2), "note-value-sum", "Count again how many of the smaller note fit in the bigger note."], [ratio - 1, "note-value-sum", "Count again how many of the smaller note fit in the bigger note."]];
    if (big.dots && noDot !== ratio) wrongs.push([noDot, "dot-forgotten", "A dot adds half of the note's own length: the dotted note is longer than the plain one."]);
    wrongs.push([ratio * 2, "note-value-sum", "That is twice too many."]);
    return numberChoice(ratio, wrongs, `A ${nameV(big)} is equal to how many ${plural(small.value)}?`, `A dot adds half the length. Write each note as a number of ${plural(small.value)} and add.`);
  }
  // tied: two tied notes counted in small values
  const small = c.rng.pick(smalls);
  const a = c.rng.pick(VALS);
  const b = c.rng.pick(VALS);
  const total = add2(durOf(a), durOf(b));
  const ratio = (total.n * durOf(small).d) / (total.d * durOf(small).n);
  if (!Number.isInteger(ratio) || ratio < 5 || ratio > 40) return null;
  if (!a.dots && !b.dots && small.value !== "demisemiquaver") return null;
  if (equals(durOf(a), durOf(b)) && a.dots === b.dots && a.value === b.value && c.rng.chance(0.5)) return null;
  const ra = (durOf(a).n * durOf(small).d) / (durOf(a).d * durOf(small).n);
  const rb = (durOf(b).n * durOf(small).d) / (durOf(b).d * durOf(small).n);
  if (!Number.isInteger(ra) || !Number.isInteger(rb)) return null;
  const wrongs: Array<[number, string, string]> = [[ra, "tie-not-added", "A tie joins the two notes: add them."], [rb, "tie-not-added", "A tie joins the two notes: add them."], [ratio + 1, "note-value-sum", "Count again: write each note in the smaller value, then add."], [Math.max(1, ratio - 1), "note-value-sum", "Count again: write each note in the smaller value, then add."]];
  return numberChoice(ratio, wrongs, `A ${nameV(a)} tied to a ${nameV(b)} lasts as long as how many ${plural(small.value)}?`, "A tie adds the two lengths together. Count each note in the smaller value, then add.");
};
function add2(a: music.Fraction, b: music.Fraction): music.Fraction {
  return music.add(a, b);
}

// ---------------------------------------------------------------------------
// t.g5.clef-minor
// ---------------------------------------------------------------------------

const CLEF_NAME: Record<Clef, string> = { treble: "treble clef", bass: "bass clef", alto: "alto clef", tenor: "tenor clef" };

/** Is this run of eight notes an ascending minor scale (harmonic or melodic form)? Letters must be consecutive, the semitones must fit a form. Written without the scale functions. */
export function isAscendingMinor(ps: Pitch[]): boolean {
  if (ps.length !== 8) return false;
  const letters = "CDEFGAB";
  for (let i = 1; i < 8; i++) if (letters.indexOf(ps[i]!.step) !== (letters.indexOf(ps[i - 1]!.step) + 1) % 7) return false;
  const semis = ps.map((p) => music.chromaticNumber(p));
  const gaps = semis.slice(1).map((x, i) => x - semis[i]!);
  const same = (a: number[]) => a.every((x, i) => x === gaps[i]);
  return same([2, 1, 2, 2, 1, 3, 1]) || same([2, 1, 2, 2, 2, 2, 1]);
}

/** Eight notes written on three staves with different clefs and no key signature: only one stave reads as an ascending minor scale. */
export const clefMinor5: Gen = (c): any => {
  const clefs = ((c.scope.clefs?.length ? c.scope.clefs : ["treble", "bass", "alto", "tenor"]) as Clef[]);
  const keys = (c.scope.keys ?? KEYS_G5).filter((k) => parseKey(k).mode === "minor");
  if (clefs.length < 3 || !keys.length) return null;
  const keyText = c.rng.pick(keys);
  const key = parseKey(keyText);
  const form = c.rng.pick(["harmonic", "melodic-ascending"] as const);
  const pcs = music.scale(key, form);
  const trueClef = c.rng.pick(clefs);
  const octs = trueClef === "bass" ? [2, 3] : trueClef === "treble" ? [4, 5] : [3, 4];
  const o = c.rng.pick(octs);
  const scale: Pitch[] = pcs.map((pc, i) => ({ ...pc, octave: o + Math.floor((music.stepIndex(key.tonic.step) + i) / 7) }));
  if (!isAscendingMinor(scale) || !fitsIn(trueClef, scale, 2)) return null;
  const positions = scale.map((p) => staffPosition(trueClef, p));
  const others = shuffled(c, clefs.filter((x) => x !== trueClef)).slice(0, 2);
  const staves: Array<{ clef: Clef; pitches: Pitch[] }> = [{ clef: trueClef, pitches: scale }, ...others.map((cl) => ({ clef: cl, pitches: positions.map((pos, i) => ({ ...naturalAt(cl, pos), alter: scale[i]!.alter })) }))];
  if (staves.some((s) => !fitsIn(s.clef, s.pitches, 2))) return null;
  if (staves.filter((s) => isAscendingMinor(s.pitches)).length !== 1) return null;
  const order = shuffled(c, staves);
  const letters = ["A", "B", "C"];
  const at = order.findIndex((s) => s.clef === trueClef);
  const stave = (s: { clef: Clef; pitches: Pitch[] }, i: number) => {
    const ms: Measure[] = [0, 2, 4, 6].map((k, bi) => ({ events: [note(s.pitches[k]!, "minim"), note(s.pitches[k + 1]!, "minim")], ...(bi === 3 ? { barline: "final" as const } : {}) }));
    return { id: letters[i]!.toLowerCase(), label: `Stave ${letters[i]} (${CLEF_NAME[s.clef]})`, music: frag(s.clef, ms, `Eight notes in the ${CLEF_NAME[s.clef]}.`, { showKeySignature: false, timeSignature: "4/4" }) };
  };
  const ids = letters.map((l) => l.toLowerCase());
  return {
    prompt: "The same eight notes are written on three staves. Each stave has a different clef and no key signature. The accidentals are the same on every stave. Only one of the clefs makes the notes an ascending minor scale (harmonic or melodic form). Which stave is it?",
    score: { staves: order.map(stave), textAlternative: "The same eight notes on three staves with three different clefs." },
    answer: choiceAnswer(ids.map((id, i) => [id, `Stave ${letters[i]}`] as [string, string]), ids[at]!, Object.fromEntries(ids.filter((_, i) => i !== at).map((id) => [id, ["clef-confusion", "In this clef the notes get different letter names, and the pattern of tones and semitones is not that of a minor scale."] as [string, string]]))),
    hints: ["Name the notes in each clef. A scale uses each letter name once in order (A B C D E F G A, say). Then check the semitones: a minor scale has a semitone after its second note and after its fifth."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.transpose-judge
// ---------------------------------------------------------------------------

/** A transposed bar is shown next to the original. It has no mistake, or exactly one: a note moved, or the key signature of the wrong key. */
export const transposeJudge5: Gen = (c): any => {
  const insts = instIn(c);
  if (!insts.length) return null;
  const inst = c.rng.pick(insts);
  const label = c.rng.pick(INST_LABEL[inst]);
  const toWritten = c.rng.chance(0.5);
  const keyText = c.rng.pick(c.scope.keys ?? KEYS_G5);
  const key = parseKey(keyText);
  let newKey: music.Key;
  try { newKey = toWritten ? music.writtenKeyFor(key, inst) : music.concertKeyFor(key, inst); } catch { return null; }
  const newText = formatKey(newKey);
  if (!(c.scope.keys ?? KEYS_G5).includes(newText)) return null;
  const mel = melodyIn5(c, key, "treble", 6, 1);
  if (!mel) return null;
  const iv = music.INSTRUMENT_INTERVAL[inst];
  const dir = toWritten ? "up" : "down";
  const right = mel.map((p) => transpose(p, iv, dir));
  if (!fitsIn("treble", right, 2) || right.some((p) => Math.abs(p.alter) > 1)) return null;
  const truth = c.rng.pick(["ok", "key", "note", "note"] as const);
  let shown = right;
  let shownKey = newText;
  let badAt = -1;
  if (truth === "note") {
    badAt = c.rng.int(0, right.length - 1);
    const p = right[badAt]!;
    const bad: Pitch = c.rng.chance(0.5) ? { ...p, alter: p.alter === 0 ? c.rng.pick([-1, 1]) : 0 } : music.pitchFromNumbers(music.diatonicNumber(p) + c.rng.pick([-1, 1]), music.chromaticNumber(p) + c.rng.pick([-1, 0, 1]));
    if (music.chromaticNumber(bad) === music.chromaticNumber(p) && bad.step === p.step || Math.abs(bad.alter) > 1) return null;
    shown = right.map((x, i) => (i === badAt ? bad : x));
    if (!fitsIn("treble", shown, 2) || F(bad) === F(p)) return null;
  } else if (truth === "key") {
    const f = music.keyFifths(newKey);
    const cand = (c.scope.keys ?? KEYS_G5).filter((k) => parseKey(k).mode === newKey.mode && Math.abs(music.keyFifths(parseKey(k)) - f) === 1);
    if (!cand.length) return null;
    shownKey = c.rng.pick(cand);
  }
  const ids = ["ok", "key", ...Array.from({ length: mel.length }, (_, i) => `n${i + 1}`)];
  const labelOf = (id: string) => (id === "ok" ? "The bar and its key signature are correct" : id === "key" ? "Only the key signature is wrong" : `Only note ${id.slice(1)} is wrong`);
  const truthId = truth === "ok" ? "ok" : truth === "key" ? "key" : `n${badAt + 1}`;
  const pickedWrong = shuffled(c, ids.filter((x) => x !== truthId)).slice(0, 3);
  const opts = shuffled(c, [truthId, ...pickedWrong]);
  const labels: Record<number, string> = Object.fromEntries(shown.map((_, i) => [i, String(i + 1)]));
  const given = melodyFrag("treble", mel, keyText, {}, {});
  const proposed = melodyFrag("treble", shown, shownKey, labels, {});
  const who = toWritten ? "concert pitch" : `the written part for the ${label}`;
  const target = toWritten ? `the written part for the ${label}` : "concert pitch";
  return {
    prompt: `The top stave is ${who}. A pupil has transposed it ${dir} a ${ivText(inst)} to give ${target} (the ${label} sounds a ${ivText(inst)} lower than written). Look at the lower stave carefully, noting that the notes are numbered. Which statement is true?`,
    score: { staves: [{ id: "given", label: toWritten ? "Concert pitch (given)" : `Written for the ${label} (given)`, music: given }, { id: "pupil", label: toWritten ? `Pupil's version, written for the ${label}` : "Pupil's version, concert pitch", music: proposed }], textAlternative: "A melody and a pupil's transposition of it." },
    answer: choiceAnswer(opts.map((id) => [id, labelOf(id)] as [string, string]), truthId, Object.fromEntries(opts.filter((id) => id !== truthId).map((id) => [id, ["transposition-check", id === "ok" ? "There is a mistake: check each note against the interval, and the key signature against the new key." : id === "key" ? `The key signature is right: ${keyWords(keyText)} ${dir} a ${ivText(inst)} is ${keyWords(newText)}.` : "That note is right: it is the original note moved by the interval."] as [string, string]]))),
    hints: [`Find the new key first: ${keyWords(keyText)} ${dir} a ${ivText(inst)} is ${keyWords(newText)}. Then move each note by the same interval and compare.`],
  };
};

void wordOf;
export type { Ctx };
