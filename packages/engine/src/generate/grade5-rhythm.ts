/* eslint-disable @typescript-eslint/no-explicit-any -- generators return loosely typed drafts that the engine validates (checkItem) before use */
/**
 * Grade 5 rhythm generators (Brief 09, Unit 1): irregular time signatures (5/4, 7/4, 5/8, 7/8), their grouping into twos and threes, and
 * irregular divisions (5, 6, 7 and 9 notes in the time of 4 or 8).
 *
 * Source: First Steps in Music Theory, Grade 5 sections 1-2 (printed pp. 105-107): irregular bars are combinations of two-beat and
 * three-beat groups; "each subdivision of an irregular bar is grouped in the usual way"; 5, 6 or 7 notes in the time of a crotchet are
 * written as semiquavers, 9 in the time of a crotchet as demisemiquavers.
 *
 * Three things are checked independently, never one standing in for another (Brief 09, section 4): the DURATION (the bar adds up), the
 * GROUPING (the notes and beams follow the named pattern, via `checkBar` against that pattern alone) and the TUPLET RATIO (n notes of one
 * written value last exactly the time of `normal` of them).
 *
 * Conventions (OPEN_QUESTIONS Q30, Q35): in x/4 the grouping is shown by the lengths of the notes (a dotted minim for three beats, a minim
 * for two), because crotchets cannot be beamed; so beamed grouping is only read in x/8. A rest only ever fills a whole group or one
 * single unit (a part of a group is not asked).
 */
import { music, type Measure } from "@mtp/curriculum";
import { n, r, rhythmLine, type Gen } from "./families.ts";
import { WORDS, choiceAnswer, diag, type Ctx, type Ev } from "./grade5-lib.ts";

const { frac, mul, add, valueFor, parseTimeSignature } = music;
type NV = music.NoteValue;

const irregularIn = (c: Ctx) => (c.scope.timeSignatures ?? []).filter((t) => music.classifyTimeSignature(t).metre === "irregular");
const unitOf = (ts: string) => frac(1, parseTimeSignature(ts).bottom);
const NAME: Record<number, NV> = { 1: "semibreve", 2: "minim", 4: "crotchet", 8: "quaver", 16: "semiquaver" };
export const unitName = (ts: string): NV => NAME[parseTimeSignature(ts).bottom]!;
const valueOfUnits = (ts: string, k: number) => valueFor(mul(unitOf(ts), frac(k)), 1);
const halfValue = (ts: string) => valueFor(mul(unitOf(ts), frac(1, 2)), 0);
const patternText = (p: number[]) => p.join("+");
/** The groupings the Grade 5 generators ask for: groups of two or three (a group of four is accepted from a learner, and appears as a fact, but is not drawn). */
const taught = (top: number) => music.irregularPatterns(top).filter((p) => Math.max(...p) <= 3);
const structOf = (ts: string, p: number[]) => music.metreStructures(ts).find((s) => s.pattern?.join("+") === p.join("+"))!;
const allowed = (c: Ctx, v: NV, dots = 0) => (!c.scope.noteValues?.length || c.scope.noteValues.includes(v)) && dots <= (c.scope.maxDots ?? 1);
export const barClean = (events: Ev[], ts: string, p: number[], requireBeams = false) => music.checkBar(events as unknown as music.REvent[], structOf(ts, p), { requireBeams }).length === 0;

/** The ways a group of `len` units can be filled with notes: each unit whole or split in halves, adjacent whole units merged into one longer note. */
function fills(c: Ctx, ts: string, len: number, opts: { minNotes?: number; allowSplit?: boolean; allowRests?: boolean } = {}): Ev[][] {
  const out: Ev[][] = [];
  type Seg = { len: number; split: boolean; rest?: boolean };
  const walk = (left: number, acc: Seg[]) => {
    if (left === 0) {
      const evs: Ev[] = [];
      for (const s of acc) {
        if (s.split) {
          const h = halfValue(ts);
          if (!h || !allowed(c, h.value)) return;
          evs.push(n(h.value), n(h.value));
        } else {
          const v = valueOfUnits(ts, s.len);
          if (!v || !allowed(c, v.value, v.dots)) return;
          if (s.rest && !c.scope.rests) return;
          evs.push(s.rest ? r(v.value, v.dots) : n(v.value, v.dots));
        }
      }
      if (evs.length >= (opts.minNotes ?? 0)) out.push(evs);
      return;
    }
    walk(left - 1, [...acc, { len: 1, split: false }]);
    if (opts.allowSplit) walk(left - 1, [...acc, { len: 1, split: true }]);
    if (left >= 2) walk(left - 2, [...acc, { len: 2, split: false }]);
    if (left >= 3) walk(left - 3, [...acc, { len: 3, split: false }]);
    if (opts.allowRests) {
      if (left >= 1 && acc.length === 0 && left === len) walk(0, [{ len, split: false, rest: true }]);
      walk(left - 1, [...acc, { len: 1, split: false, rest: true }]);
    }
  };
  walk(len, []);
  // a rest only fills a whole group or one single unit, and never two rests in a row (they would have to be combined)
  return out.filter((f) => !f.some((e, i) => e.kind === "rest" && f[i + 1]?.kind === "rest"));
}

/** Beam the notes of each unit pair/group as the named pattern directs (x/8 only: crotchets cannot be beamed). */
function beamed(events: Ev[], ts: string, pattern: number[], unitsOfEvent: number[]): Ev[] {
  // unitsOfEvent[i] = the unit index (0-based) the event starts in; group of a unit from the pattern
  const groupOfUnit: number[] = [];
  pattern.forEach((len, g) => { for (let k = 0; k < len; k++) groupOfUnit.push(g); });
  const out = events.map((e) => ({ ...e })) as any[];
  const byGroup = new Map<number, number[]>();
  events.forEach((e, i) => {
    if (e.kind === "tuplet") return;
    if (!["quaver", "semiquaver", "demisemiquaver"].includes(e.duration.value)) return;
    const g = groupOfUnit[unitsOfEvent[i]!]!;
    byGroup.set(g, [...(byGroup.get(g) ?? []), i]);
  });
  // only runs that are really consecutive may share a beam
  for (const idxs of byGroup.values()) {
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) run.forEach((ix, k) => { out[ix].beam = k === 0 ? "begin" : k === run.length - 1 ? "end" : "continue"; });
      run = [];
    };
    idxs.forEach((ix, k) => {
      if (k > 0 && ix !== idxs[k - 1]! + 1) flush();
      run.push(ix);
    });
    flush();
  }
  void ts;
  return out as Ev[];
}

/** A bar built from per-unit choices: returns events plus the start unit of each event. */
function buildBar(c: Ctx, ts: string, pattern: number[], opts: { minNotes?: number; allowSplit?: boolean; allowRests?: boolean; beam: boolean }): { events: Ev[]; starts: number[] } | null {
  const events: Ev[] = [];
  const starts: number[] = [];
  let unit = 0;
  for (const len of pattern) {
    const f = fills(c, ts, len, { minNotes: opts.minNotes, allowSplit: opts.allowSplit, allowRests: opts.allowRests });
    if (!f.length) return null;
    const pick = c.rng.pick(f);
    // starting unit of each event in the group
    let u = unit;
    for (const e of pick) {
      events.push(e);
      starts.push(Math.floor(u));
      const len2 = music.eventLength(e as unknown as music.REvent);
      u += (len2.n / len2.d) * parseTimeSignature(ts).bottom;
    }
    unit += len;
  }
  const out = opts.beam ? beamed(events, ts, pattern, starts) : events;
  return { events: out, starts };
}

// ---------------------------------------------------------------------------
// t.g5.time-signature: add the time signature to two bars in irregular time
// ---------------------------------------------------------------------------

export const timeSigIrregular: Gen = (c): any => {
  const ts = c.rng.pick(irregularIn(c));
  if (!ts) return null;
  const pattern = c.rng.pick(taught(parseTimeSignature(ts).top));
  const is4 = parseTimeSignature(ts).bottom === 4;
  const bars: Ev[][] = [];
  for (let i = 0; i < 2; i++) {
    // the second bar repeats the grouping of the first: the pattern is "established"
    const b = buildBar(c, ts, pattern, { minNotes: 0, allowSplit: true, allowRests: i === 1 && c.scope.rests, beam: !is4 });
    if (!b) return null;
    const events = is4 ? withUnitBeams(b.events) : b.events;
    if (!barClean(events, ts, pattern)) return null;
    bars.push(events);
  }
  if (bars.flat().length < 6) return null;
  if (JSON.stringify(bars[0]) === JSON.stringify(bars[1])) return null;
  return {
    prompt: "Add the time signature to this rhythm. The bars use the same grouping throughout.",
    music: rhythmLine(measuresOf(bars)),
    answer: { kind: "time-signature", accepted: [ts] },
    hints: ["Add up the bar in the value of the lower figure. The upper figure is the number of those values in a bar. Irregular time has five or seven."],
  };
};
const measuresOf = (bars: Ev[][]): Measure[] => bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));

/** The events of a given start of a bar, in words ("a dotted minim, then a quaver and a quaver"). */
function startText(evs: Ev[]): string {
  const w = (e: Ev) => (e.kind === "tuplet" ? "a group" : `${e.kind === "rest" ? "a " : "a "}${e.duration.dots ? "dotted " : ""}${e.duration.value}${e.kind === "rest" ? " rest" : ""}`);
  return evs.map(w).join(", then ");
}

/** x/4: beam each pair of quavers that makes up one split crotchet; nothing is beamed across a group. */
function withUnitBeams(events: Ev[]): Ev[] {
  const out = events.map((e) => ({ ...e })) as any[];
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].kind === "note" && out[i + 1].kind === "note" && out[i].duration.value === "quaver" && out[i + 1].duration.value === "quaver" && !out[i].beam) {
      out[i].beam = "begin";
      out[i + 1].beam = "end";
      i++;
    }
  }
  return out as Ev[];
}

// ---------------------------------------------------------------------------
// t.g5.metre-facts: the irregular signatures and what they allow
// ---------------------------------------------------------------------------

export const metreFacts5: Gen = (c): any => {
  const sigs = irregularIn(c);
  if (!sigs.length) return null;
  const ts = c.rng.pick(sigs);
  const { top, bottom } = parseTimeSignature(ts);
  const unit = NAME[bottom]!;
  const mode = c.rng.pick(["count", "count", "irregular", "groupings", "same-ts", "unit"] as const);
  if (mode === "count") {
    const ids = [...new Set([top, top === 5 ? 7 : 5, top - 1, top + 1, top === 5 ? 3 : 4])].filter((x) => x > 1).sort((a, b) => a - b);
    return {
      prompt: `How many ${unit}s are there in one bar of ${ts}?`,
      answer: choiceAnswer(ids.map((x) => [String(x), `${WORDS[x]}`]), String(top), Object.fromEntries(ids.filter((x) => x !== top).map((x) => [String(x), ["beat-count-wrong", `The upper figure of ${ts} says how many ${unit}s fill the bar: ${WORDS[top]}.`]]))),
      hints: ["The upper figure counts the beats in a bar; the lower figure says which note value is one beat."],
    };
  }
  if (mode === "unit") {
    const ids = ["minim", "crotchet", "quaver", "semiquaver"];
    return {
      prompt: `In ${ts}, which note value is counted as one unit (one beat of the bar)?`,
      answer: choiceAnswer(ids.map((x) => [x, x]), unit, Object.fromEntries(ids.filter((x) => x !== unit).map((x) => [x, ["beat-unit-wrong", `The lower figure ${bottom} stands for the ${unit}, so ${ts} counts in ${unit}s.`]]))),
      hints: ["The lower figure of a time signature names the note value that is counted: 4 is the crotchet, 8 the quaver."],
    };
  }
  if (mode === "irregular") {
    const regular = c.rng.shuffle(["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"]).slice(0, 3);
    const opts = c.rng.shuffle([ts, ...regular]);
    return {
      prompt: "Which of these is an irregular time signature?",
      answer: choiceAnswer(opts.map((x) => [x, x]), ts, Object.fromEntries(regular.map((x) => [x, ["simple-compound-confusion", `${x} is ${music.classifyTimeSignature(x).metre} time: its beats are all alike (${music.classifyTimeSignature(x).beats}). Irregular time has five or seven beats, made of twos and threes.`]]))),
      hints: ["Irregular signatures have five or seven beats in a bar, and the beats fall into unequal groups of two (or four) and three."],
    };
  }
  if (mode === "groupings") {
    const valid = music.irregularPatterns(top).map(patternText);
    const wrongs = (top === 5 ? ["4+1", "2+2+1", "3+3"] : ["3+3+1", "5+2", "2+2+2+1"]).filter((x) => !valid.includes(x));
    const right = c.rng.pick(valid);
    const others = valid.filter((x) => x !== right);
    // only one correct option is offered, so the other genuine groupings are never offered as wrong answers
    const opts = c.rng.shuffle([right, ...wrongs.slice(0, 3)]);
    void others;
    return {
      prompt: `Which of these groupings can a bar of ${ts} use? (Groups are usually of two or three beats, and occasionally of four.)`,
      answer: choiceAnswer(opts.map((x) => [x, x]), right, Object.fromEntries(opts.filter((x) => x !== right).map((x) => [x, ["beat-count-wrong", `${x} is not a normal way to divide ${top} beats: irregular bars are made of groups of two or three beats, and occasionally four.`]]))),
      hints: ["Groups are made of two or three beats (occasionally four), never one."],
    };
  }
  // same-ts: the same signature can be grouped differently
  const valid = music.irregularPatterns(top).map(patternText);
  const [a, b] = c.rng.shuffle(valid).slice(0, 2) as [string, string];
  const opts: Array<[string, string]> = [
    ["both", `Both are possible; the time signature does not say which grouping to use, so the music (note lengths and beams) shows it`],
    ["first", `Only ${a} is correct for ${ts}`],
    ["second", `Only ${b} is correct for ${ts}`],
    ["neither", `${ts} always means the groups are equal`],
  ];
  return {
    prompt: `One piece in ${ts} is felt as ${a} and another as ${b}. What is true?`,
    answer: choiceAnswer(opts, "both", { first: ["wrong-category", `${b} is also a normal grouping of ${ts}.`], second: ["wrong-category", `${a} is also a normal grouping of ${ts}.`], neither: ["wrong-category", "Irregular time is unequal by nature: its groups are twos and threes."] }),
    hints: ["The time signature gives only the number of beats. How they fall into groups is up to the composer and is shown in the music."],
  };
};

// ---------------------------------------------------------------------------
// t.g5.grouping-judge: read the grouping shown by the beams, or judge a bar against a stated grouping (x/8)
// ---------------------------------------------------------------------------

const eighths = (c: Ctx) => irregularIn(c).filter((t) => parseTimeSignature(t).bottom === 8);

export const groupingJudge5: Gen = (c): any => {
  const sigs = eighths(c);
  if (!sigs.length) return null;
  const ts = c.rng.pick(sigs);
  const top = parseTimeSignature(ts).top;
  const patterns = taught(top);
  const P = c.rng.pick(patterns);
  const mode = c.rng.pick(["read", "judge"] as const);
  if (mode === "read") {
    const b = buildBar(c, ts, P, { minNotes: 0, allowSplit: false, beam: true });
    if (!b || !barClean(b.events, ts, P, true)) return null;
    const ids = [...patterns.map(patternText), top === 5 ? "5" : "2+2+2+1"];
    const labels: Record<string, string> = Object.fromEntries(ids.map((x) => [x, x === "5" ? "all five quavers as one group" : x === "2+2+2+1" ? "2+2+2+1" : x]));
    return {
      prompt: `This bar of ${ts} is beamed in groups. Which grouping do the beams show?`,
      music: rhythmLine([{ events: b.events }, { events: buildSame(c, ts, P)!, barline: "final" }], { timeSignature: ts }),
      answer: choiceAnswer(c.rng.shuffle(ids).map((x) => [x, labels[x]!]), patternText(P), Object.fromEntries(ids.filter((x) => x !== patternText(P)).map((x) => [x, ["beam-across-middle", `The beams here do not make groups of ${x.replace(/\+/g, ", ")}: count how many quavers each beam joins.`]]))),
      hints: ["Count the notes under each beam, from left to right. Those numbers are the grouping."],
    };
  }
  // judge: is the bar beamed for the stated grouping?
  const others = patterns.filter((p) => patternText(p) !== patternText(P));
  const correct = c.rng.chance(0.5);
  const shownPattern = correct ? P : c.rng.pick(others);
  const b = buildBar(c, ts, shownPattern, { minNotes: 0, allowSplit: true, beam: true });
  if (!b || !barClean(b.events, ts, shownPattern, true)) return null;
  const opts: Array<[string, string]> = [["yes", `Yes: the beams show ${patternText(P)}`], ["no", `No: they show a different grouping`]];
  return {
    prompt: `The composer wants this bar of ${ts} felt as ${patternText(P)}. Are the notes beamed to show that?`,
    music: rhythmLine([{ events: b.events, barline: "final" }], { timeSignature: ts }),
    answer: choiceAnswer(opts, correct ? "yes" : "no", correct ? { no: ["beam-across-middle", `The beams do join ${P.join(", then ")} notes, which is the grouping asked for.`] } : { yes: ["beam-across-middle", `The beams here make groups of ${shownPattern.join(", then ")}, not ${P.join(", then ")}.`] }),
    hints: ["Count the notes joined by each beam and compare with the grouping the composer wants."],
  };
};

/** A second bar of the same pattern, so a read question shows the grouping established (never identical to the first). */
function buildSame(c: Ctx, ts: string, P: number[]): Ev[] | null {
  const b = buildBar(c, ts, P, { minNotes: 0, allowSplit: true, beam: true });
  return b && barClean(b.events, ts, P, true) ? b.events : null;
}

// ---------------------------------------------------------------------------
// t.g5.irregular-grouping: rewrite a bar so it is grouped as named (x/8)
// ---------------------------------------------------------------------------

export const irregularGrouping5: Gen = (c): any => {
  const sigs = eighths(c);
  if (!sigs.length) return null;
  const ts = c.rng.pick(sigs);
  const top = parseTimeSignature(ts).top;
  const patterns = taught(top);
  const P = c.rng.pick(patterns);
  const Q = c.rng.pick(patterns.filter((p) => patternText(p) !== patternText(P)));
  // the same notes (each unit whole or split in halves) are written once for Q (shown) and once for P (the answer)
  const unitsSplit = Array.from({ length: top }, () => c.rng.chance(0.25));
  const events = (): Ev[] => unitsSplit.flatMap((s) => (s ? [n("semiquaver"), n("semiquaver")] : [n("quaver")]));
  const starts: number[] = unitsSplit.flatMap((s, i) => (s ? [i, i] : [i]));
  const shown = c.rng.chance(0.5) ? beamed(events(), ts, Q, starts) : events();
  const right = beamed(events(), ts, P, starts);
  if (!barClean(right, ts, P, true)) return null;
  // the shown bar must be wrong for P (otherwise there is nothing to correct)
  if (barClean(shown, ts, P, true)) return null;
  return {
    prompt: `Rewrite this bar of ${ts} so that its notes are beamed to show a grouping of ${P.join(" + ")}. The rhythm must sound exactly the same.`,
    music: rhythmLine([{ events: shown, barline: "final" }], { timeSignature: ts }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: right }]], acceptAnyRuleCompliant: true, groupPattern: P },
    hints: [`Beam the first ${P[0]} units together, then the next ${P[1]}${P.length > 2 ? ", then the last " + P[2] : ""}.`],
  };
};

// ---------------------------------------------------------------------------
// t.g5.bar-complete5: complete a bar of irregular time so that it follows a named grouping
// ---------------------------------------------------------------------------

export const barComplete5: Gen = (c): any => {
  const sigs = irregularIn(c);
  if (!sigs.length) return null;
  const ts = c.rng.pick(sigs);
  const { top, bottom } = parseTimeSignature(ts);
  const P = c.rng.pick(taught(top));
  const is4 = bottom === 4;
  const givenGroups = c.rng.int(1, P.length - 1);
  const built = buildBar(c, ts, P, { minNotes: 0, allowSplit: true, allowRests: false, beam: !is4 });
  if (!built) return null;
  const evs = is4 ? withUnitBeams(built.events) : built.events;
  if (!barClean(evs, ts, P)) return null;
  // the given part is the first `givenGroups` groups, cut where a group ends
  const units = (e: Ev) => { const l = music.eventLength(e as unknown as music.REvent); return (l.n / l.d) * bottom; };
  let u = 0;
  let cut = 0;
  const limit = P.slice(0, givenGroups).reduce((a, b) => a + b, 0);
  while (cut < evs.length && u + 1e-9 < limit) { u += units(evs[cut]!); cut++; }
  if (Math.abs(u - limit) > 1e-9 || cut === 0 || cut >= evs.length) return null;
  const given = evs.slice(0, cut);
  const left = P.slice(givenGroups);
  const leftUnits = left.reduce((a, b) => a + b, 0);
  return {
    prompt: `Complete this bar of ${ts} with notes or rests so that it follows a grouping of ${P.join(" + ")}. The bar already begins with ${startText(given)}. ${leftUnits === 1 ? "One more beat is" : `${WORDS[leftUnits]?.[0]!.toUpperCase()}${WORDS[leftUnits]!.slice(1)} more beats are`} needed; no note may join two groups.`,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: ts, given, accepted: [[{ events: evs, barline: "final" }]], acceptAnyRuleCompliant: true, groupPattern: P },
    hints: [`Fill the last ${left.map((x) => String(x)).join(" + ")} beat${leftUnits === 1 ? "" : "s"} group by group; a note or rest may not cross from one group into the next.`],
  };
};

// ---------------------------------------------------------------------------
// Irregular divisions
// ---------------------------------------------------------------------------

interface Div { actual: number; normal: number; value: NV; of: NV; ts: string[]; word: string }
/** First Steps Grade 5 section 2 (pp. 106-107). `of` is the value whose time the group takes. */
const DIVS: Div[] = [
  { actual: 5, normal: 4, value: "semiquaver", of: "crotchet", ts: ["5/4", "7/4"], word: "quintuplet" },
  { actual: 5, normal: 4, value: "demisemiquaver", of: "quaver", ts: ["5/8", "7/8"], word: "quintuplet" },
  { actual: 6, normal: 4, value: "semiquaver", of: "crotchet", ts: ["5/4", "7/4"], word: "sextuplet" },
  { actual: 6, normal: 4, value: "demisemiquaver", of: "quaver", ts: ["5/8", "7/8"], word: "sextuplet" },
  { actual: 7, normal: 4, value: "semiquaver", of: "crotchet", ts: ["5/4", "7/4"], word: "septuplet" },
  { actual: 7, normal: 4, value: "demisemiquaver", of: "quaver", ts: ["5/8", "7/8"], word: "septuplet" },
  { actual: 9, normal: 8, value: "demisemiquaver", of: "crotchet", ts: ["5/4", "7/4"], word: "nonuplet" },
  { actual: 9, normal: 8, value: "semiquaver", of: "minim", ts: ["5/4", "7/4"], word: "nonuplet" },
];
const divsIn = (c: Ctx) => DIVS.filter((d) => allowedValues(c, d) && d.ts.some((t) => (c.scope.timeSignatures ?? []).includes(t)));
const allowedValues = (c: Ctx, d: Div) => allowed(c, d.value) && allowed(c, d.of) && (c.scope.tuplets ?? []).includes("irregular");
export const divisionLabel = (d: { actual: number }) => ({ 5: "quintuplet", 6: "sextuplet", 7: "septuplet", 9: "nonuplet" })[d.actual as 5]!;

function tupletEvent(d: Div, rest = false): Ev {
  const evs = Array.from({ length: d.actual }, (_, i) => ({ kind: "note", pitch: "B4", duration: { value: d.value, dots: 0 }, beam: i === 0 ? "begin" : i === d.actual - 1 ? "end" : "continue" }) as any);
  void rest;
  return { kind: "tuplet", actual: d.actual, normal: d.normal, events: evs, label: String(d.actual) } as Ev;
}
const unitsOfTime = (ts: string, of: NV) => {
  const l = music.NOTE_VALUES[of];
  const u = unitOf(ts);
  return (l.n / l.d) / (u.n / u.d);
};

/** A complete bar of `ts` (grouped as `P`) containing one irregular group that takes the time of `d.of`, with the other notes whole units. */
function barWithTuplet(c: Ctx, ts: string, P: number[], d: Div): { bar: Ev[]; before: Ev[]; group: Ev } | null {
  const span = unitsOfTime(ts, d.of);
  if (!Number.isInteger(span) || span < 1) return null;
  const total = P.reduce((a, b) => a + b, 0);
  // the group sits at the start of one group of the pattern that is long enough to hold it; the rest of the bar is whole units
  const starts = [0, ...P.slice(0, -1).reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? 0) + x], [])].map((s, i) => ({ s, len: P[i]! }));
  const holders = starts.filter((g) => g.len >= span);
  if (!holders.length) return null;
  const at = c.rng.pick(holders).s;
  const group = tupletEvent(d);
  const before: Ev[] = [];
  const bar: Ev[] = [];
  let u = 0;
  while (u < total) {
    if (u === at) {
      bar.push(group);
      u += span;
      continue;
    }
    // whole units, merged to the group's end where convenient
    const remainInGroup = (() => { let acc = 0; for (const l of P) { if (u < acc + l) return acc + l - u; acc += l; } return 1; })();
    const stopBeforeTuplet = u < at ? at - u : Infinity;
    const take = Math.min(remainInGroup, stopBeforeTuplet);
    const k = c.rng.int(1, take);
    const v = valueOfUnits(ts, k);
    if (!v || !allowed(c, v.value, v.dots)) return null;
    bar.push(n(v.value, v.dots));
    u += k;
  }
  const idx = bar.indexOf(group);
  before.push(...bar.slice(0, idx));
  if (!barClean(bar, ts, P)) return null;
  return { bar, before, group };
}

/** t.g5.irregular-division: read the bar, and say which note value the irregular group takes the time of. */
export const irregularDivision5: Gen = (c): any => {
  const d = c.rng.pick(divsIn(c));
  if (!d) return null;
  const ts = c.rng.pick(d.ts.filter((t) => (c.scope.timeSignatures ?? []).includes(t)));
  const P = c.rng.pick(taught(parseTimeSignature(ts).top));
  const b = barWithTuplet(c, ts, P, d);
  if (!b) return null;
  const ids = ["minim", "crotchet", "quaver", "semiquaver", "dotted-crotchet"].filter((x) => allowedOpt(x));
  const right = d.of;
  const alt = (x: string) => x === "dotted-crotchet" ? "a dotted crotchet" : `a ${x}`;
  const opts = [...new Set([right, d.value, "minim", "crotchet", "quaver"].filter((x) => x !== undefined))].slice(0, 4) as string[];
  if (!opts.includes(right)) opts.push(right);
  void ids; void alt;
  return {
    prompt: `The marked group of ${d.actual} ${d.value}s is a ${d.word}. It is played in the time of which single note value?`,
    music: rhythmLine([{ events: b.bar, barline: "final" }], { timeSignature: ts }),
    answer: choiceAnswer(c.rng.shuffle(opts).map((x) => [x, `a ${x}`]), right, Object.fromEntries(opts.filter((x) => x !== right).map((x) => [x, [x === d.value ? "tuplet-ignored" : "tuplet-number-wrong", x === d.value ? `A ${d.value} is the written value of each note in the group, not the length of the whole group.` : `The group takes the time of ${d.normal} ${d.value}s, which is one ${right}, not one ${x}.`]]))),
    hints: [`${d.actual} ${d.value}s are squeezed into the time that ${d.normal} ${d.value}s would take. Work out what ${d.normal} ${d.value}s make.`],
  };
};
const allowedOpt = (x: string) => !!x;

/** t.g5.division-facts: arithmetic and names of the irregular divisions. */
export const divisionFacts5: Gen = (c): any => {
  const ds = divsIn(c);
  if (!ds.length) return null;
  const d = c.rng.pick(ds);
  const mode = c.rng.pick(["time-of", "written", "name"] as const);
  if (mode === "time-of") {
    const ids = [...new Set([d.normal, d.actual, d.normal - 1, d.normal * 2])].filter((x) => x > 1).sort((a, b) => a - b).map(String);
    return {
      prompt: `${d.actual} ${d.value}s are played as a ${d.word}. They take the time of how many ${d.value}s of the usual length?`,
      answer: choiceAnswer(ids.map((x) => [x, x]), String(d.normal), Object.fromEntries(ids.filter((x) => x !== String(d.normal)).map((x) => [x, [x === String(d.actual) ? "tuplet-ignored" : "tuplet-number-wrong", x === String(d.actual) ? `${d.actual} is how many notes are written. The group is squeezed into the time of ${d.normal} ordinary ${d.value}s.` : `A ${d.word} of ${d.value}s takes the time of ${d.normal} of them.`]]))),
      hints: ["Compare with a triplet: three notes take the time of two."],
    };
  }
  if (mode === "written") {
    const ids = ["quaver", "semiquaver", "demisemiquaver"].filter((x) => allowed(c, x as NV));
    const text = `${d.actual} notes are to be played in the time of one ${d.of}${d.of === "minim" ? "" : ""}. Which note value should each one be written as?`;
    // only the cases the book states (5, 6, 7 or 9 notes in the time of a crotchet, quaver or minim) are asked
    return {
      prompt: text,
      answer: choiceAnswer(ids.map((x) => [x, x]), d.value, Object.fromEntries(ids.filter((x) => x !== d.value).map((x) => [x, ["written-value-wrong", `${d.actual} ${x}s are not the right length to take the time of one ${d.of}: the group needs ${d.value}s (each is about ${d.normal} to a ${d.of}).`]]))),
      hints: [`Which note value would give ${d.normal} to the ${d.of}? Then squeeze ${d.actual} into that time.`],
    };
  }
  const names = ["quintuplet", "sextuplet", "septuplet", "nonuplet"];
  return {
    prompt: `What is a group of ${d.actual} equal notes played in the time of ${d.normal} usually called?`,
    answer: choiceAnswer(names.map((x) => [x, x]), d.word, Object.fromEntries(names.filter((x) => x !== d.word).map((x) => [x, ["tuplet-number-wrong", `A ${x} has ${({ quintuplet: 5, sextuplet: 6, septuplet: 7, nonuplet: 9 } as Record<string, number>)[x]} notes; this group has ${d.actual}.`]]))),
    hints: ["The name comes from the Latin number: quintuplet five, sextuplet six, septuplet seven, nonuplet nine."],
  };
};

/** t.g5.division-write: write the irregular group that completes a bar. */
export const divisionWrite5: Gen = (c): any => {
  const d = c.rng.pick(divsIn(c));
  if (!d) return null;
  const ts = c.rng.pick(d.ts.filter((t) => (c.scope.timeSignatures ?? []).includes(t)));
  const P = c.rng.pick(taught(parseTimeSignature(ts).top));
  const b = barWithTuplet(c, ts, P, d);
  if (!b) return null;
  // the group must be the last thing in the bar so that what is given is a plain start of the bar
  if (b.bar[b.bar.length - 1] !== b.group) return null;
  if (!b.before.length) return null;
  return {
    prompt: `Finish this bar of ${ts}, which already begins with ${startText(b.before)}, with a ${d.word}: ${d.actual} equal ${d.value}s, beamed together, played in the time of one ${d.of}${d.of === "minim" ? "" : ""}. Choose the ${d.word} sign for the group.`,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: ts, given: b.before, accepted: [[{ events: b.bar, barline: "final" }]], acceptAnyRuleCompliant: false },
    hints: [`The group of ${d.actual} ${d.value}s fills exactly the time of one ${d.of}. Add it with the tuplet button, then add the ${d.actual} notes.`],
  };
};

void add; void diag;
