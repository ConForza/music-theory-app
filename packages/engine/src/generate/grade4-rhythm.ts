/**
 * Grade 4 rhythm and metre generators (Brief 08, Unit 1): breves, double dots, the regular time signatures, grouping in them, duplets.
 *
 * Source: First Steps in Music Theory, Grade 4 sections 1-4 (pp. 79-82, read in the PDF); the official outline decides what is
 * examinable. Every duration comes from `music.dotted`, `music.valueFor` and the rule checker (`checkBarAnyPattern`), never from a
 * typed table per question.
 *
 * Conventions (OPEN_QUESTIONS Q4/Q7/Q25, Brief 07 handoff):
 *  - the commonly used set of regular time signatures only (Q7);
 *  - a double-dotted REST is asked only as a length ("how many semiquavers"), never written into a bar: the reference book itself says
 *    the convention is to avoid it except where clear, and no source here settles when it is acceptable (teacher decision);
 *  - partly silent beats and a two-beat note starting mid-bar in 12/8 or 12/4 are never asked (as in Grade 3).
 */
import { music, type Measure, type NotationEvent } from "@mtp/curriculum";
import { n, r, randomBar, rhythmLine, type Gen } from "./families.ts";
import { codes } from "./grade1.ts";
import { ORD, cap, diag, optsOf } from "./grade2.ts";

type Ctx = Parameters<Gen>[0];
type Ev = NotationEvent;
type NV = music.NoteValue;

const kind = (ts: string) => music.classifyTimeSignature(ts);
const parts = (ts: string) => music.parseTimeSignature(ts);
const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const NAME: Record<number, NV> = { 1: "semibreve", 2: "minim", 4: "crotchet", 8: "quaver", 16: "semiquaver" };
const BEAMABLE = new Set(["quaver", "semiquaver", "demisemiquaver"]);
const isBeamable = (v: string) => BEAMABLE.has(v);
const beamFlags = (len: number, i: number) => (len > 1 ? { beam: i === 0 ? ("begin" as const) : i === len - 1 ? ("end" as const) : ("continue" as const) } : {});
const unit = (v: NV, dots = 0) => `${dots === 2 ? "double-dotted " : dots === 1 ? "dotted " : ""}${v}`;
const a = (s: string) => (/^[aeiou]/.test(s) ? "an" : "a");
const plural = (s: string) => `${s}s`;
const tsIn = (c: Ctx) => c.scope.timeSignatures ?? [];
const measures = (bars: Ev[][]): Measure[] => bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));
const clean = (ev: Ev[], ts: string) => codes(ev, ts).length === 0;
const sameMusic = (x: Ev[][], y: Ev[][]) => JSON.stringify(x) === JSON.stringify(y);

/** The beat of a regular time signature, as a note value with dots, and its third (compound) or half (simple). */
export function beatNote(ts: string): { value: NV; dots: number } {
  const s = music.metreStructure(ts);
  const v = music.valueFor(s.beatUnit, 1);
  if (!v) throw new Error(`No beat note for ${ts}`);
  return v;
}
const thirdOf = (ts: string): NV => {
  const s = music.metreStructure(ts);
  return music.valueFor(music.mul(s.beatUnit, music.frac(1, 3)), 0)!.value;
};
/** Name of the note counted by the lower figure (6/4: crotchet; 12/16: semiquaver). */
const lowerNote = (ts: string): NV => NAME[parts(ts).bottom]!;
const beatsIn = (ts: string) => {
  const s = music.metreStructure(ts);
  return s.groups.length;
};
export const metreName = (ts: string) => `${kind(ts).metre} ${kind(ts).beats}`;
const beatPhrase = (ts: string) => {
  const b = beatNote(ts);
  return `${unit(b.value, b.dots)}${a("x") ? "" : ""}`;
};

// ---------------------------------------------------------------------------
// Breves
// ---------------------------------------------------------------------------

const breveEv = (value: NV = "breve", extra: Record<string, unknown> = {}): Ev => n(value, 0, extra);

/** t.g4.breve-facts: how long a breve lasts, what fills a bar of 4/2, how a silent bar of 4/2 is written. */
export const breveFacts: Gen = (c): any => {
  const mode = c.rng.pick(["count", "count", "count", "bar-note", "bar-rest", "which-longer", "silent-ts"] as const);
  if (mode === "count") {
    const target = c.rng.pick<[NV, number]>([["semibreve", 2], ["minim", 4], ["crotchet", 8], ["quaver", 16]]);
    const [v, k] = target;
    const ids = [...new Set([k, k / 2, k * 2, k === 2 ? 3 : k - 2])].filter((x) => x > 0).map(String);
    return {
      prompt: `How many ${plural(v)} last as long as one breve?`,
      music: rhythmLine([{ events: [breveEv()] }], { textAlternative: "One breve (a double whole note)." }),
      answer: { kind: "choice", options: optsOf(ids.sort((x, y) => Number(x) - Number(y))), correctOptionIds: [String(k)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(k)).map((x) => [x, diag("halved-or-doubled", Number(x) === k / 2 ? "That is half the number. A breve is twice as long as a semibreve, so you need twice as many of the shorter notes as you would for a semibreve." : Number(x) === k * 2 ? "That is double. A semibreve is the one that lasts as long as that many; a breve is twice a semibreve, not four times." : "Count again: a breve is two semibreves, each semibreve is two minims, and so on, doubling at every step.")])) },
      hints: ["A breve is two semibreves. A semibreve is two minims, a minim two crotchets."],
    };
  }
  if (mode === "bar-note" || mode === "bar-rest") {
    const rest = mode === "bar-rest";
    const ids = rest ? ["breve", "semibreve", "minim", "crotchet"] : ["breve", "semibreve", "minim", "dotted-minim"];
    const lab = (x: string) => `${cap(x.replace("-", " "))}${rest ? " rest" : ""}`;
    return {
      prompt: rest ? "Which rest shows a silent bar in 4/2?" : "Which single note fills a whole bar of 4/2 on its own?",
      music: rhythmLine([{ events: [rest ? { ...r("breve"), wholeBar: true } as Ev : breveEv()] }], { timeSignature: "4/2", textAlternative: `A time signature of 4/2 with an empty bar.` }),
      answer: { kind: "choice", options: optsOf(ids, lab), correctOptionIds: ["breve"], diagnoses: { semibreve: diag("halved-or-doubled", rest ? "A semibreve rest fills a whole bar in every other time signature, but a bar of 4/2 is two semibreves long, so a semibreve rest would leave half of it unaccounted for." : "A semibreve is only half a bar of 4/2: a bar holds four minims, which is two semibreves."), minim: diag("halved-or-doubled", "A bar of 4/2 holds four minim beats. One minim is only a quarter of the bar."), ...(rest ? { crotchet: diag("halved-or-doubled", "A crotchet is far too short: a bar of 4/2 holds eight crotchets.") } : { "dotted-minim": diag("dot-misread", "A dotted minim lasts three minim beats, one short of the four in a bar of 4/2.") }) } },
      hints: ["A bar of 4/2 holds four minim beats: that is exactly two semibreves, one breve."],
    };
  }
  if (mode === "which-longer") {
    const pairs: Array<[string, Ev, string, Ev, number]> = [
      ["a breve", n("breve"), "two semibreves tied together", n("semibreve"), 0],
      ["a breve", n("breve"), "a semibreve", n("semibreve"), 1],
      ["a dotted semibreve", n("semibreve", 1), "a breve", n("breve"), -1],
    ];
    const [t1, , t2, , rel] = c.rng.pick(pairs);
    if (rel === 0) {
      return {
        prompt: "A breve and two semibreves tied together: how do they compare?",
        answer: { kind: "choice", options: [{ id: "same", label: "They last exactly as long" }, { id: "breve", label: "The breve is longer" }, { id: "tied", label: "The tied semibreves are longer" }], correctOptionIds: ["same"], diagnoses: { breve: diag("halved-or-doubled", "A breve is worth two semibreves, and a tie adds the two values together, so the totals are equal."), tied: diag("tie-dot-confusion", "A tie only adds lengths. Two semibreves joined last two semibreves, the same as one breve.") } },
        hints: ["A tie adds the values of the notes it joins."],
      };
    }
    return {
      prompt: `Which lasts longer, ${t1} or ${t2}?`,
      answer: { kind: "choice", options: [{ id: "first", label: cap(t1) }, { id: "second", label: cap(t2) }], correctOptionIds: [rel === 1 ? "first" : "second"], diagnoses: { [rel === 1 ? "second" : "first"]: diag("dot-misread", rel === 1 ? "A semibreve is half of a breve. Compare the values: 1 semibreve against 2." : "A dotted semibreve is one and a half semibreves; a breve is two.") } },
      hints: ["Measure everything in semibreves: a breve is 2, a dotted semibreve is 1½."],
    };
  }
  // silent-ts: in which time signature is a silent bar shown by a breve rest?
  const pool = ["4/2", "3/2", "2/2", "4/4"];
  return {
    prompt: "In which of these time signatures is a silent bar shown by a breve rest?",
    answer: { kind: "choice", options: optsOf(pool), correctOptionIds: ["4/2"], diagnoses: { "3/2": diag("halved-or-doubled", "In 3/2 a silent bar is shown by a semibreve rest, like almost every other time signature."), "2/2": diag("halved-or-doubled", "In 2/2 a silent bar is shown by a semibreve rest."), "4/4": diag("halved-or-doubled", "In 4/4 a silent bar is a semibreve rest.") } },
    hints: ["A breve rest is used only where a bar is exactly two semibreves long."],
  };
};

/** t.g4.breve-bar: write the breve or the breve rest, alone or after a bar of other notes. Exactly one answer is accepted. */
export const breveBar: Gen = (c): any => {
  const rest = c.rng.chance(0.5);
  const answerBar: Ev[] = [rest ? ({ ...r("breve"), wholeBar: true } as Ev) : breveEv()];
  if (!clean(answerBar, "4/2")) return null;
  const prompt = rest ? "Write a silent bar of 4/2, using one rest." : "Write a bar of 4/2 using one note.";
  return {
    prompt,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: "4/2", given: [], accepted: [[{ events: answerBar }]], acceptAnyRuleCompliant: false },
    hints: rest ? ["A breve rest is a block hanging from the fourth line of the stave, filling the space between the third and fourth lines."] : ["A bar of 4/2 is exactly two semibreves long. Which single note is that?"],
  };
};

// ---------------------------------------------------------------------------
// Double dots
// ---------------------------------------------------------------------------

const DD: Array<{ v: NV; dots: number }> = [
  { v: "breve", dots: 1 }, { v: "breve", dots: 2 }, { v: "semibreve", dots: 2 }, { v: "minim", dots: 2 }, { v: "crotchet", dots: 2 }, { v: "quaver", dots: 2 }, { v: "semiquaver", dots: 2 },
];
const durOf = (v: NV, dots: number) => music.dotted(v, dots);
const countOf = (v: NV, dots: number, inUnit: NV) => {
  const f = music.mul(durOf(v, dots), music.frac(music.NOTE_VALUES[inUnit].d, music.NOTE_VALUES[inUnit].n));
  return f.d === 1 ? f.n : null;
};
const ddValueOk = (c: Ctx, v: NV) => !c.scope.noteValues?.length || c.scope.noteValues.includes(v);

/** t.g4.double-dot-facts: lengths of double-dotted notes and rests, and what the second dot adds. */
export const doubleDotFacts: Gen = (c): any => {
  const maxDots = c.scope.maxDots ?? 0;
  if (maxDots < 2) return null;
  const mode = c.rng.pick(["count", "count", "count-rest", "second-dot", "second-dot", "compare"] as const);
  const ddPool = DD.filter((d) => d.dots === 2 && d.v !== "breve" && ddValueOk(c, d.v));
  if (!ddPool.length) return null;
  const pick = c.rng.pick(ddPool);
  const isRest = mode === "count-rest";
  if (mode === "count" || mode === "count-rest") {
    const smalls = (["quaver", "semiquaver", "demisemiquaver"] as NV[]).filter((x) => ddValueOk(c, x) && countOf(pick.v, 2, x) !== null && music.lt(music.NOTE_VALUES[x], durOf(pick.v, 2)) && countOf(pick.v, 2, x)! <= 64);
    if (!smalls.length) return null;
    const small = c.rng.pick(smalls);
    // the unit must give a whole number but a double dot always needs a unit at least four times shorter than the note
    const k = countOf(pick.v, 2, small);
    if (!k || k < 4) return null;
    const ids = [...new Set([k, k - 1, k + 1, Math.round(k * 0.75), (k * 4) / 7 + (k * 4) / 7 === 0 ? 0 : (k / 7) * 6])].filter((x) => Number.isInteger(x) && x > 1 && x !== 0);
    const opt = [...new Set([k, k - 1, k + 1, k - 2, k * 2].filter((x) => x > 1))].sort((x, y) => x - y).slice(0, 5);
    if (!opt.includes(k)) return null;
    void ids;
    const plain = countOf(pick.v, 0, small)!;
    const single = countOf(pick.v, 1, small)!;
    const noun = isRest ? "rest" : "note";
    return {
      prompt: `How many ${plural(small)} last as long as a ${unit(pick.v, 2)} ${noun === "rest" ? "rest" : ""}`.trim() + "?",
      music: rhythmLine([{ events: [isRest ? r(pick.v, 2) : n(pick.v, 2)] }], { textAlternative: `One ${unit(pick.v, 2)} ${noun}.` }),
      answer: { kind: "choice", options: optsOf(opt.map(String)), correctOptionIds: [String(k)], diagnoses: Object.fromEntries(opt.filter((x) => x !== k).map((x) => [String(x), x === single ? diag("dot-misread", "That is the length with one dot. The second dot adds half as much again as the first dot added.") : x === plain ? diag("dot-misread", "That is the plain length with no dots. Each dot makes the note longer.") : diag("dot-misread", "Work it out in steps: the plain note, plus half of it, plus a quarter of it.")])) },
      hints: [`${cap(pick.v)} = ${plain} ${plural(small)}; the first dot adds ${plain / 2}; the second adds ${plain / 4}.`],
    };
  }
  if (mode === "second-dot") {
    const base = pick.v;
    const half = music.valueFor(music.mul(music.NOTE_VALUES[base], music.frac(1, 2)), 0)?.value;
    const quarter = music.valueFor(music.mul(music.NOTE_VALUES[base], music.frac(1, 4)), 0)?.value;
    if (!half || !quarter || !ddValueOk(c, half) || !ddValueOk(c, quarter)) return null;
    const rightId = `${base}+${half}+${quarter}`;
    const opts = [rightId, `${base}+${half}+${half}`, `${base}+${half}`, `${base}+${base}`];
    const label = (id: string) => id.split("+").map((x) => `a ${x}`).join(" + ");
    return {
      prompt: `Which notes added together last as long as a double-dotted ${base}?`,
      answer: { kind: "choice", options: optsOf(opts, label), correctOptionIds: [rightId], diagnoses: { [opts[1]!]: diag("dot-misread", `The second dot adds half of what the first dot added (a ${quarter}), not another ${half}.`), [opts[2]!]: diag("dot-misread", "That is the value with only one dot. The second dot adds a little more."), [opts[3]!]: diag("dot-misread", "That is twice the note, far more than two dots add.") } },
      hints: ["The first dot adds half the note; the second dot adds half of that."],
    };
  }
  // compare: a double-dotted X and the single-dotted X plus the next shorter dot value
  const base = pick.v;
  const dotted1 = music.valueFor(durOf(base, 1), 1);
  if (!dotted1) return null;
  const asked = c.rng.pick(["longer", "shorter"] as const);
  const second = music.valueFor(music.mul(music.NOTE_VALUES[base], music.frac(1, 4)), 0)?.value;
  if (!second || !ddValueOk(c, second)) return null;
  return {
    prompt: `A ${unit(base, 1)} is followed by a ${second} tied to it. Compare this with a ${unit(base, 2)}: which is ${asked}?`,
    answer: { kind: "choice", options: [{ id: "same", label: "Neither: they last exactly as long" }, { id: "dd", label: `The ${unit(base, 2)} is longer` }, { id: "tied", label: "The tied pair is longer" }], correctOptionIds: ["same"], diagnoses: { dd: diag("dot-misread", `A ${unit(base, 1)} plus a ${second} is exactly what the second dot adds: the totals are equal.`), tied: diag("tie-dot-confusion", `The second dot adds a ${second}'s worth, so the two ways of writing it are equal.`) } },
    hints: ["Add the tied note to the dotted note and compare with the double-dotted total."],
  };
};

/** t.g4.double-dot-bar: complete a bar that already holds a double-dotted note (notes only; rests are never asked, see the header). */
export const doubleDotBar: Gen = (c): any => {
  const pool = tsIn(c).filter((t) => ["2/4", "3/4", "4/4", "4/2", "6/8", "9/8", "12/8", "6/4"].includes(t));
  if (!pool.length || (c.scope.maxDots ?? 0) < 2) return null;
  const ts = c.rng.pick(pool);
  const beat = beatNote(ts);
  const cap1 = music.barCapacity(parts(ts));
  const beatLen = durOf(beat.value, beat.dots);
  const cands: Array<{ v: NV; rest: NV; atBeat: number }> = [];
  for (const d of DD.filter((x) => x.dots === 2 && x.v !== "breve")) {
    if (!ddValueOk(c, d.v)) continue;
    const len = durOf(d.v, 2);
    // a note starting on a beat; the short note that rounds it up to whole beats follows at once
    const beatsCovered = Math.ceil((len.n * beatLen.d) / (len.d * beatLen.n));
    const total = music.mul(beatLen, music.frac(beatsCovered));
    const left = music.add(total, music.mul(len, music.frac(-1)));
    const v = music.valueFor(left, 0);
    if (!v || v.dots || !ddValueOk(c, v.value)) continue;
    if (music.compare(total, cap1) > 0) continue;
    cands.push({ v: d.v, rest: v.value, atBeat: beatsCovered });
  }
  if (!cands.length) return null;
  const pickc = c.rng.pick(cands);
  const bar: Ev[] = [n(pickc.v, 2), n(pickc.rest)];
  const used = music.add(durOf(pickc.v, 2), music.NOTE_VALUES[pickc.rest]);
  let left = music.add(cap1, music.mul(used, music.frac(-1)));
  // fill whole beats after it with beat notes, leaving the last beat for the learner when it is a whole beat
  const rest: Ev[] = [];
  while (!music.isZero(left)) {
    const v = music.valueFor(beatLen, 1);
    if (!v || music.lt(left, beatLen)) return null;
    rest.push(n(v.value, v.dots));
    left = music.add(left, music.mul(beatLen, music.frac(-1)));
  }
  const full = [...bar, ...rest];
  if (!clean(full, ts)) return null;
  // the learner supplies the final beat: take it off the end when there is one, otherwise the short note
  const learnerPart = rest.length ? rest.slice(-1) : bar.slice(-1);
  const shown = full.slice(0, full.length - learnerPart.length);
  const missing = learnerPart.map((e) => (e.kind === "note" ? `${unit(e.duration.value, e.duration.dots ?? 0)}` : "")).join(", ");
  void missing;
  return {
    prompt: `Complete this bar of ${ts} with one note. The bar already holds a double-dotted note, written first. Use a note, not a rest.`,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: ts, given: shown, accepted: [[{ events: full }]], acceptAnyRuleCompliant: false },
    hints: [`Add up what is written (a ${unit(pickc.v, 2)} is longer than it looks), then work out what is left in the bar.`],
  };
};

// ---------------------------------------------------------------------------
// Regular time signatures
// ---------------------------------------------------------------------------

const BEAT_LABEL: Record<string, string> = {
  "minim": "a minim", "crotchet": "a crotchet", "quaver": "a quaver",
  "dotted-minim": "a dotted minim", "dotted-crotchet": "a dotted crotchet", "dotted-quaver": "a dotted quaver",
};
const beatId = (ts: string) => {
  const b = beatNote(ts);
  return b.dots ? `dotted-${b.value}` : b.value;
};

/** t.g4.metre-facts: kind of time, beat note, beats and lower-note counts for the regular time signatures. */
export const metreFacts4: Gen = (c): any => {
  const pool = tsIn(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const k = kind(ts);
  const mode = c.rng.pick(["name", "name", "beat-note", "beat-note", "beats", "bar-length", "which-ts", "classify-beat"] as const);
  const metre = k.metre as "simple" | "compound";
  if (mode === "name") {
    const all = ["simple duple", "simple triple", "simple quadruple", "compound duple", "compound triple", "compound quadruple"];
    const right = metreName(ts);
    const twin = `${metre === "compound" ? "simple" : "compound"} ${k.beats}`;
    const sameMetre = all.filter((x) => x.startsWith(metre) && x !== right);
    const picks = [twin, ...c.rng.shuffle(sameMetre)].slice(0, 3);
    return {
      prompt: `What kind of time is ${ts}?`,
      answer: { kind: "choice", options: c.rng.shuffle([right, ...picks]).map((x) => ({ id: x, label: cap(x) })), correctOptionIds: [right], diagnoses: Object.fromEntries(picks.map((x) => [x, x === twin ? diag("simple-compound-confusion", metre === "compound" ? `In ${ts} each beat is a dotted note that divides into three: that is compound time.` : `In ${ts} each beat is a plain note that divides into two: that is simple time.`) : diag("beat-count-wrong", `Count the beats in a bar of ${ts}: there are ${words[beatsIn(ts)]}.`)])) },
      hints: [metre === "compound" ? `Divide the top number by 3 to count the beats: ${parts(ts).top} ÷ 3 = ${beatsIn(ts)}.` : `In simple time the top number counts the beats: ${parts(ts).top}.`],
    };
  }
  if (mode === "beat-note") {
    const right = beatId(ts);
    const plainLower = lowerNote(ts);
    const dottedAbove = (() => { const v = music.valueFor(music.mul(music.NOTE_VALUES[plainLower], music.frac(3, 1)), 0); return v?.value; })();
    const options = new Set<string>([right]);
    if (metre === "compound") {
      options.add(plainLower); // the note named by the lower figure
      const dm = music.valueFor(music.mul(music.NOTE_VALUES[plainLower], music.frac(3)), 0) ?? music.valueFor(music.mul(music.NOTE_VALUES[plainLower], music.frac(3)), 1);
      void dm;
      options.add(`dotted-${plainLower}`);
      const twoThirds = music.valueFor(music.mul(music.NOTE_VALUES[plainLower], music.frac(2)), 0)?.value;
      if (twoThirds) options.add(twoThirds);
    } else {
      const v = beatNote(ts).value;
      options.add(`dotted-${v}`);
      const half = music.valueFor(music.mul(music.NOTE_VALUES[v], music.frac(1, 2)), 0)?.value;
      if (half) options.add(half);
      const dbl = music.valueFor(music.mul(music.NOTE_VALUES[v], music.frac(2)), 0)?.value;
      if (dbl) options.add(dbl);
    }
    void dottedAbove;
    const ids = [...options].slice(0, 4);
    if (!ids.includes(right) || ids.length < 4) return null;
    const lab = (x: string) => (BEAT_LABEL[x] ?? `a ${x.replace("dotted-", "dotted ")}`);
    return {
      prompt: `In ${ts}, which note lasts exactly one beat?`,
      answer: { kind: "choice", options: c.rng.shuffle(ids).map((x) => ({ id: x, label: cap(lab(x)) })), correctOptionIds: [right], diagnoses: Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, diag("beat-unit-wrong", metre === "compound" && x === plainLower ? `${cap(lab(x))} is the note the lower number names, but in compound time a beat is three of them: a dotted note.` : metre === "compound" ? `Three ${plural(lowerNote(ts))} (the notes the lower figure names) make one beat in ${ts}. Which note lasts as long as that?` : `In simple time the lower figure names the beat note itself: ${ts} counts ${plural(lowerNote(ts))}.`)])) },
      hints: [metre === "compound" ? `A beat is three ${plural(lowerNote(ts))}. Which note lasts as long as that?` : `The lower figure ${parts(ts).bottom} stands for a ${lowerNote(ts)}.`],
    };
  }
  if (mode === "beats") {
    const beats = beatsIn(ts);
    const ids = [...new Set([beats, parts(ts).top, beats === 2 ? 3 : 2, 4, 6, 12])].filter((x) => x >= 2).sort((x, y) => x - y).slice(0, 4);
    if (!ids.includes(beats)) ids[0] = beats;
    return {
      prompt: `How many beats are there in each bar of ${ts}?`,
      answer: { kind: "choice", options: optsOf([...new Set(ids)].sort((x, y) => x - y).map(String)), correctOptionIds: [String(beats)], diagnoses: Object.fromEntries([...new Set(ids)].filter((x) => x !== beats).map((x) => [String(x), diag("beat-count-wrong", x === parts(ts).top && metre === "compound" ? `${x} is the number written on top, which counts ${plural(lowerNote(ts))}. In compound time three of them make a beat, so ${ts} has ${beats} beats.` : `Count the beats again: ${metre === "compound" ? `${parts(ts).top} ÷ 3` : `the top number`} gives ${beats}.`)])) },
      hints: [metre === "compound" ? `Three ${plural(lowerNote(ts))} make one beat, so divide the top number by 3.` : "In simple time the top number is the number of beats."],
    };
  }
  if (mode === "bar-length") {
    const total = parts(ts).top;
    const ids = [...new Set([total, total / 2, total * 2, beatsIn(ts)])].filter((x) => Number.isInteger(x) && x >= 2).sort((x, y) => x - y);
    if (ids.length < 3) return null;
    return {
      prompt: `How many ${plural(lowerNote(ts))} fill one whole bar of ${ts}?`,
      answer: { kind: "choice", options: optsOf(ids.map(String)), correctOptionIds: [String(total)], diagnoses: Object.fromEntries(ids.filter((x) => x !== total).map((x) => [String(x), diag(x === beatsIn(ts) ? "beat-count-wrong" : "beat-unit-wrong", x === beatsIn(ts) ? `${x} is the number of beats. The lower figure ${parts(ts).bottom} names the ${lowerNote(ts)}, and the top number says how many of those fill the bar.` : `The top number tells you: ${ts} has ${total} ${plural(lowerNote(ts))} in a bar.`)])) },
      hints: [`The lower figure ${parts(ts).bottom} names the ${lowerNote(ts)}; the top figure counts how many there are in a bar.`],
    };
  }
  if (mode === "which-ts") {
    const want = ts;
    const b = beatNote(want);
    const others = [...new Set(pool.filter((t) => t !== want))];
    if (others.length < 3) return null;
    const twins = others.filter((t) => kind(t).metre === metre || beatsIn(t) === beatsIn(want));
    const opts = [want, ...c.rng.shuffle(twins).slice(0, 3)];
    if (opts.length < 4) opts.push(...c.rng.shuffle(others.filter((t) => !opts.includes(t))).slice(0, 4 - opts.length));
    // exactly one option may have this beat count AND this beat note
    const clash = opts.filter((t) => beatsIn(t) === beatsIn(want) && beatId(t) === beatId(want));
    if (clash.length !== 1) return null;
    return {
      prompt: `Which time signature has ${words[beatsIn(want)]} ${unit(b.value, b.dots)} beats in each bar?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts).map((t) => ({ id: t, label: t })), correctOptionIds: [want], diagnoses: Object.fromEntries(opts.filter((t) => t !== want).map((t) => [t, diag(beatsIn(t) === beatsIn(want) ? "beat-unit-wrong" : "beat-count-wrong", beatsIn(t) === beatsIn(want) ? `${t} also has ${words[beatsIn(t)]} beats, but they are ${unit(beatNote(t).value, beatNote(t).dots)}s, not ${unit(b.value, b.dots)}s.` : `${t} has ${words[beatsIn(t)]} beats in a bar, not ${words[beatsIn(want)]}.`)])) },
      hints: [`Beats of ${unit(b.value, b.dots)}: the lower figure names the note counted, and in compound time three of them make a beat.`],
    };
  }
  // classify-beat: does the beat of ts divide into two or three?
  return {
    prompt: `When the beat of ${ts} is divided into equal notes in the usual way, how many notes make one beat?`,
    answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: [metre === "compound" ? "3" : "2"], diagnoses: Object.fromEntries(["2", "3", "4", "6"].filter((x) => x !== (metre === "compound" ? "3" : "2")).map((x) => [x, diag("simple-compound-confusion", metre === "compound" ? `${ts} is compound time: its beat is a dotted note that divides into three equal parts.` : `${ts} is simple time: its beat is a plain note that divides into two equal parts.`)])) },
    hints: [metre === "compound" ? "Compound time: beats divide into three." : "Simple time: beats divide into two."],
  };
};

// ---------------------------------------------------------------------------
// Grouping judge
// ---------------------------------------------------------------------------

const GROUPING = new Set(["beam-hides-compound-beat", "note-hides-compound-beat", "beat-not-beamed", "unnecessary-tie", "tie-instead-of-dot", "beam-crosses-beat", "beam-across-middle", "beam-hides-beat", "note-hides-beat"]);
const groupingOnly = (ev: Ev[], ts: string) => {
  const cs = codes(ev, ts);
  return cs.length > 0 && cs.every((x) => GROUPING.has(x));
};
/** Beam an event run (all must be beamable notes). */
const beam = (evs: Ev[]): Ev[] => evs.map((e, i) => ({ ...e, ...beamFlags(evs.length, i) }) as Ev);

/** One beat, as notes, for the given metre: whole beat note, equal thirds/halves, or a longer-and-shorter pair. */
function beatCell(ts: string, which: number, rng: Ctx["rng"]): Ev[] {
  const b = beatNote(ts);
  const s = music.metreStructure(ts);
  const compound = s.metre === "compound";
  const parts3 = compound ? 3 : 2;
  const sub = music.valueFor(music.mul(s.beatUnit, music.frac(1, parts3)), 0)!;
  const whole = [n(b.value, b.dots)];
  const equal = Array.from({ length: parts3 }, () => n(sub.value));
  const equalBeamed = isBeamable(sub.value) ? beam(equal) : equal;
  const uneven = compound ? [n(music.valueFor(music.mul(s.beatUnit, music.frac(2, 3)), 0)!.value), n(sub.value)] : [n(music.valueFor(music.mul(s.beatUnit, music.frac(3, 4)), 1)?.value ?? sub.value, 1), n(music.valueFor(music.mul(s.beatUnit, music.frac(1, 4)), 0)!.value)];
  const cells = [whole, equalBeamed, uneven];
  void which;
  return rng.pick(cells).map((e) => ({ ...e }));
}

/** t.g4.grouping-judge: which of three bars groups its notes correctly? Each wrong bar breaks one grouping rule; every bar adds up. */
export const groupingJudge4: Gen = (c): any => {
  const pool = tsIn(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const s = music.metreStructure(ts);
  const nb = s.groups.length;
  if (nb < 2) return null;
  const cells = Array.from({ length: nb }, (_, i) => beatCell(ts, i, c.rng));
  if (!cells.some((x) => x.length > 1 && isBeamable((x[0] as { duration: { value: string } }).duration.value))) {
    // ensure at least one beamed cell where beaming exists in this metre
    if (s.metre === "simple" || isBeamable(thirdOf(ts))) {
      const i = c.rng.int(0, nb - 1);
      cells[i] = beatCell(ts, i, c.rng);
    }
  }
  const flat = (cs: Ev[][]) => cs.flat();
  const right = flat(cells);
  if (!clean(right, ts)) return null;
  type Bar = { ev: Ev[]; right: boolean; why: string; cat: string };
  const wrong: Bar[] = [];
  const addWrong = (ev: Ev[], cat: string, why: string) => {
    if (groupingOnly(ev, ts) && JSON.stringify(ev) !== JSON.stringify(right) && !wrong.some((w) => JSON.stringify(w.ev) === JSON.stringify(ev))) wrong.push({ ev, right: false, why, cat });
  };
  const strip = (evs: Ev[]) => evs.map((e) => { const { beam: _b, ...rest } = e as Ev & { beam?: string }; return rest as Ev; });
  // M1: join two neighbouring beamed beats into one beam
  for (let i = 0; i + 1 < nb; i++) {
    const both = [...cells[i]!, ...cells[i + 1]!];
    if (both.every((e) => e.kind === "note" && isBeamable(e.duration.value) && !(e as { duration: { dots?: number } }).duration.dots)) {
      const trial = flat(cells.map((x, j) => (j === i ? beam(strip(both)) : j === i + 1 ? [] : x)));
      addWrong(trial, "compound-beat-hidden", s.metre === "compound" ? "One beam across two beats hides where the second beat begins. Beam each beat separately." : "A beam across the middle of the bar hides the beat. Beam each beat separately.");
    }
  }
  // M2: a beamed beat left as separate flagged notes
  for (let i = 0; i < nb; i++) {
    const x = cells[i]!;
    if (x.length > 1 && x.every((e) => e.kind === "note" && isBeamable(e.duration.value))) addWrong(flat(cells.map((y, j) => (j === i ? strip(x) : y))), "grouping-obscures-beat", "The notes of one beat should be joined by a beam so the beat is easy to see. Do not leave them separate.");
  }
  // M3: a whole-beat note replaced by two tied notes (the tie is not needed inside a beat)
  for (let i = 0; i < nb; i++) {
    const x = cells[i]!;
    if (x.length === 1) {
      const b = beatNote(ts);
      const first = music.valueFor(music.mul(music.dotted(b.value, b.dots), music.frac(2, 3)), 0) ?? null;
      const second = music.valueFor(music.mul(music.dotted(b.value, b.dots), music.frac(1, 3)), 0) ?? null;
      if (s.metre === "compound" && first && second) addWrong(flat(cells.map((y, j) => (j === i ? [n(first.value, 0, { tieToNext: true }), n(second.value)] : y))), "unnecessary-tie", "A tie inside one beat is not needed: write the whole beat as one note. Use a tie only when a note must cross a beat.");
    }
  }
  // M4: compound beams in two and one
  for (let i = 0; i < nb; i++) {
    const x = cells[i]!;
    if (s.metre === "compound" && x.length === 3 && x.every((e) => e.kind === "note" && isBeamable(e.duration.value))) {
      const v = (x[0] as { duration: { value: NV } }).duration.value;
      addWrong(flat(cells.map((y, j) => (j === i ? [...beam([n(v), n(v)]), n(v)] : y))), "compound-beat-hidden", "The three notes of a compound beat belong together. Beam all three, not two and one.");
    }
  }
  const picks: Bar[] = [];
  for (const w of c.rng.shuffle(wrong)) if (picks.length < 2 && !picks.some((p) => p.cat === w.cat && p.why === w.why)) picks.push(w);
  if (picks.length < 2) return null;
  const bars: Bar[] = [{ ev: right, right: true, why: "", cat: "" }, ...picks];
  const order = c.rng.shuffle(bars);
  const f = { ...rhythmLine(measures(order.map((b) => b.ev)), { timeSignature: ts }) };
  return {
    prompt: `All three bars are in ${ts} and add up correctly. Which bar groups its notes and rests correctly?`,
    music: f,
    answer: { kind: "choice", options: order.map((_, i) => ({ id: String(i + 1), label: `Bar ${i + 1}` })), correctOptionIds: [String(order.findIndex((b) => b.right) + 1)], diagnoses: Object.fromEntries(order.map((b, i) => [String(i + 1), b.right ? null : diag(b.cat, b.why)]).filter(([, v]) => v)) as never },
    hints: [`${ts} has ${words[nb]} ${unit(beatNote(ts).value, beatNote(ts).dots)} beats in a bar. Each beat should be easy to see.`],
  };
};

// ---------------------------------------------------------------------------
// Duplets
// ---------------------------------------------------------------------------

const compoundIn = (c: Ctx) => tsIn(c).filter((t) => kind(t).metre === "compound");
const dupletOf = (ts: string, withBeam = true): Ev => {
  const sub = music.valueFor(music.mul(music.metreStructure(ts).beatUnit, music.frac(1, 3)), 0)!;
  return { kind: "tuplet", actual: 2, normal: 3, events: [n(sub.value, 0, withBeam && isBeamable(sub.value) ? { beam: "begin" } : {}), n(sub.value, 0, withBeam && isBeamable(sub.value) ? { beam: "end" } : {})] } as Ev;
};

/** t.g4.duplet-facts: what a duplet is, how long it lasts, how it can be written another way, and how it differs from a triplet. */
export const dupletFacts: Gen = (c): any => {
  if (!(c.scope.tuplets ?? []).includes("duplet")) return null;
  const comp = compoundIn(c);
  if (!comp.length) return null;
  const ts = c.rng.pick(comp);
  const sub = thirdOf(ts);
  const b = beatNote(ts);
  const mode = c.rng.pick(["lasts", "lasts", "in-time-of", "other-way", "other-way", "triplet-or-duplet", "which-time"] as const);
  const fig = { kind: "tuplet", actual: 2, normal: 3 } as const;
  void fig;
  if (mode === "lasts") {
    const right = b.dots ? `dotted-${b.value}` : b.value;
    const ids = [right, sub, `dotted-${sub}`, music.valueFor(music.mul(music.NOTE_VALUES[sub], music.frac(2)), 0)!.value];
    const lab = (x: string) => cap(`${a("x") ? "" : ""}${x.startsWith("dotted-") ? "dotted " + x.slice(7) : x}`);
    return {
      prompt: `In ${ts}, a duplet of two ${plural(sub)} fills one beat. Which single note lasts the same time as the whole duplet?`,
      music: rhythmLine([{ events: [dupletOf(ts)] }], { textAlternative: `A duplet of two ${plural(sub)} marked 2.` }),
      answer: { kind: "choice", options: c.rng.shuffle([...new Set(ids)].map((x) => ({ id: x, label: lab(x) }))), correctOptionIds: [right], diagnoses: Object.fromEntries([...new Set(ids)].filter((x) => x !== right).map((x) => [x, diag("tuplet-total-wrong", x === sub ? `The duplet is two notes, so it lasts longer than one ${sub}: it fills a whole beat.` : x === `dotted-${sub}` ? `A dotted ${sub} is one and a half ${plural(sub)}. The duplet fills three ${plural(sub)}' worth of time: one whole beat.` : `Two ${plural(sub)} written normally would last ${plural(sub)}×2. The duplet squeezes them into the time of three.`)])) },
      hints: [`A duplet of two ${plural(sub)} is played in the time normally taken by three: one whole beat of ${ts}.`],
    };
  }
  if (mode === "in-time-of") {
    return {
      prompt: "A duplet is a group of two equal notes. In the time of how many notes of the same kind are they played?",
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: ["3"], diagnoses: { "2": diag("tuplet-number-wrong", "Two notes in the time of two is just two ordinary notes. A duplet squeezes two notes into the time of three."), "4": diag("tuplet-number-wrong", "Four would make the notes longer than normal. A duplet fits two notes into the time of three."), "6": diag("tuplet-number-wrong", "Six is a whole bar of compound duple time, not the length of one duplet.") } },
      hints: ["In compound time a beat holds three equal notes. A duplet puts two where those three would be."],
    };
  }
  if (mode === "other-way") {
    const dsub = sub;
    const right = `two-dotted-${dsub}`;
    const opts = [right, `two-${dsub}`, `two-dotted-${music.valueFor(music.mul(music.NOTE_VALUES[dsub], music.frac(2)), 0)!.value}`, `${dsub}-and-dotted-${dsub}`];
    const lab = (id: string) => (id === right ? `Two dotted ${plural(dsub)}` : id === `two-${dsub}` ? `Two ordinary ${plural(dsub)}` : id === opts[2] ? `Two dotted ${plural(music.valueFor(music.mul(music.NOTE_VALUES[dsub], music.frac(2)), 0)!.value)}` : `A ${dsub} and a dotted ${dsub}`);
    return {
      prompt: `In ${ts} one beat is written as a duplet of two ${plural(sub)}. How else can exactly the same sound be written, without the figure 2?`,
      music: rhythmLine([{ events: [dupletOf(ts), n(b.value, b.dots)] }], { timeSignature: ts, textAlternative: `A duplet of two ${plural(sub)}, then a ${unit(b.value, b.dots)}.` }),
      answer: { kind: "choice", options: c.rng.shuffle(opts.map((x) => ({ id: x, label: lab(x) }))), correctOptionIds: [right], diagnoses: { [opts[1]!]: diag("tuplet-total-wrong", `Two ordinary ${plural(sub)} fill only two thirds of a beat. Each note of a duplet must be one and a half times as long: add a dot to each.`), [opts[2]!]: diag("written-value-wrong", `Those notes are too long: two of them would fill four ${plural(sub)}, more than a beat.`), [opts[3]!]: diag("written-value-wrong", `A ${sub} and a dotted ${sub} are not equal notes, and a duplet is two equal notes.`) } },
      hints: [`A duplet fills the beat with two equal notes. Each is half a beat: that is one and a half ${plural(sub)}.`],
    };
  }
  if (mode === "triplet-or-duplet") {
    const simple = tsIn(c).filter((t) => kind(t).metre === "simple" && parts(t).bottom >= 4);
    if (!simple.length) return null;
    const st = c.rng.pick(simple);
    const isDup = c.rng.chance(0.5);
    const useTs = isDup ? ts : st;
    const sb = beatNote(useTs);
    return {
      prompt: `In ${useTs}, a group of ${isDup ? "two" : "three"} equal notes marked “${isDup ? 2 : 3}” takes the place of one beat of ${unit(sb.value, sb.dots)}. Is it a duplet or a triplet?`,
      answer: { kind: "choice", options: [{ id: "duplet", label: "A duplet" }, { id: "triplet", label: "A triplet" }], correctOptionIds: [isDup ? "duplet" : "triplet"], diagnoses: { [isDup ? "triplet" : "duplet"]: diag("tuplet-number-wrong", isDup ? "A triplet has three notes. This group has two, so it is a duplet." : "A duplet has two notes. This group has three, so it is a triplet.") } },
      hints: ["The number says how many notes are in the group: 2 is a duplet, 3 is a triplet."],
    };
  }
  // which-time: duplets belong to compound time, triplets to simple time
  const askDup = c.rng.chance(0.5);
  return {
    prompt: askDup ? "Duplets are used to give a compound-time beat two notes instead of three. In which kind of time are they mainly found?" : "Triplets are used to give a simple-time beat three notes instead of two. In which kind of time are they mainly found?",
    answer: { kind: "choice", options: [{ id: "simple", label: "Simple time" }, { id: "compound", label: "Compound time" }], correctOptionIds: [askDup ? "compound" : "simple"], diagnoses: { [askDup ? "simple" : "compound"]: diag("simple-compound-confusion", askDup ? "In simple time beats already divide into two. A duplet changes a compound beat from three notes to two." : "In compound time beats already divide into three. A triplet changes a simple beat from two notes to three.") } },
    hints: ["Duplet: compound time gets two. Triplet: simple time gets three."],
  };
};

/** t.g4.duplet-read: read a bar of compound time that uses duplets (how many beats they fill, or which time signature fits). Every bar adds up. */
export const dupletRead: Gen = (c): any => {
  if (!(c.scope.tuplets ?? []).includes("duplet")) return null;
  const comp = compoundIn(c);
  if (!comp.length) return null;
  const ts = c.rng.pick(comp);
  const s = music.metreStructure(ts);
  const nb = s.groups.length;
  const b = beatNote(ts);
  const sub = thirdOf(ts);
  const k = c.rng.int(1, Math.max(1, nb - 1));
  const at = new Set(c.rng.shuffle(Array.from({ length: nb }, (_, i) => i)).slice(0, k));
  const bar: Ev[] = Array.from({ length: nb }, (_, i) => (at.has(i) ? dupletOf(ts) : n(b.value, b.dots)));
  if (!clean(bar, ts)) return null;
  const mode = c.rng.pick(["beats", "beats", "which-ts"] as const);
  if (mode === "beats") {
    const ids = [...new Set([k, k + 1, k - 1, nb, 1, 2].filter((x) => x >= 1 && x <= nb + 1))].slice(0, 4).sort((x, y) => x - y);
    if (!ids.includes(k) || ids.length < 3) return null;
    return {
      prompt: `This bar of ${ts} uses duplets of two ${plural(sub)}. How many of its ${words[nb]} beats are filled by duplets?`,
      music: rhythmLine(measures([bar]), { timeSignature: ts }),
      answer: { kind: "choice", options: optsOf(ids.map(String)), correctOptionIds: [String(k)], diagnoses: Object.fromEntries(ids.filter((x) => x !== k).map((x) => [String(x), diag("tuplet-total-wrong", "Each duplet group fills exactly one beat. Count the groups marked 2.")])) as never },
      hints: [`One duplet fills one beat of ${ts}: count the groups marked 2.`],
    };
  }
  // which time signature fits the bar (printed without one): exactly one of the compound signatures of this kind fits
  const options = [...new Set([ts, ...c.rng.shuffle(comp.filter((t) => t !== ts))])].slice(0, 4);
  if (options.length < 3) return null;
  const fitting = options.filter((t) => music.checkBarAnyPattern(bar as unknown as music.REvent[], t).issues.length === 0);
  if (fitting.length !== 1 || fitting[0] !== ts) return null;
  return {
    prompt: "This bar uses duplets and dotted notes. Which of these time signatures does it fit?",
    music: rhythmLine(measures([bar]), {}),
    answer: { kind: "choice", options: c.rng.shuffle(options.map((t) => ({ id: t, label: t }))), correctOptionIds: [ts], diagnoses: Object.fromEntries(options.filter((t) => t !== ts).map((t) => [t, diag("beat-count-wrong", `${t} would need ${words[beatsIn(t)]} ${unit(beatNote(t).value, beatNote(t).dots)} beats in a bar; count the beats in this bar (each duplet is one beat).`)])) as never },
    hints: ["Count the beats: a duplet and a dotted note each fill one beat."],
  };
};

void sameMusic;
void ORD;
void beatPhrase;

// ---------------------------------------------------------------------------
// Reading the time signature from a rhythm (replaces the provisional family generator for t.g4.time-signature)
// ---------------------------------------------------------------------------

/** Every regular time signature (the Q7 set). A rhythm is only asked when exactly one of these fits it: no ambiguous answers. */
export const ALL_REGULAR = ["2/2", "3/2", "4/2", "2/4", "3/4", "4/4", "2/8", "3/8", "4/8", "6/4", "9/4", "12/4", "6/8", "9/8", "12/8", "6/16", "9/16", "12/16"];

/** t.g4.time-signature: add the time signature to a rhythm. The rhythm must fit one regular time signature only. */
export const timeSigRead4: Gen = (c): any => {
  const pool = tsIn(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const b1 = randomBar4(c, ts, true);
  const b2 = randomBar4(c, ts, false);
  if (!b1 || !b2) return null;
  const cap1 = music.barCapacity(parts(ts));
  const rivals = ALL_REGULAR.filter((t) => t !== ts && music.equals(music.barCapacity(parts(t)), cap1));
  const fits = (t: string) => [b1, b2].every((b) => music.checkBarAnyPattern(b as unknown as music.REvent[], t).issues.length === 0);
  if (rivals.some(fits)) return null;
  if ([b1, b2].flat().length < 5) return null;
  return {
    prompt: "Add the time signature to this rhythm.",
    music: rhythmLine(measures([b1, b2]).map((m) => ({ events: m.events })), {}),
    answer: { kind: "time-signature", accepted: [ts] },
    hints: ["Add up each bar, then look at the beaming: groups of three beamed notes (or beats that are dotted notes) mean compound time."],
  };
};
function randomBar4(c: Ctx, ts: string, noRests: boolean): Ev[] | null {
  return randomBar(c, ts, { noRests });
}
