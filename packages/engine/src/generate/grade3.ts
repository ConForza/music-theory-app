/**
 * Grade 3 generators added in Brief 07 (one per new template; see content/exercises/templates/grade-3.json).
 *
 * The fourteen Brief 01 templates are untouched (a Brief 04 guard pins their question keys). Like Grade 2, each concept needs
 * more than one way of being asked before Brief 04's unchanged mastery thresholds can be reached, so these generators add
 * judging, counting, reading and explaining tasks. Every answer comes from the Brief 03 music rules (`checkBar`, `scale`,
 * `intervalBetween`, ...), never from a typed table per question, and every wrong option carries a `diagnosis` naming the
 * misconception it matches.
 *
 * Scope discipline: a generator only uses what `c.scope` allows (time signatures, note values, keys, minor forms, ledger lines,
 * rests, triplets, terms). The engine's own gates (checkItem, solvability) run on every draft in addition.
 *
 * Compound-time rest policy (OPEN_QUESTIONS Q4, provisional): a silent dotted-crotchet beat is written either as one dotted-crotchet
 * rest or as a crotchet rest plus a quaver rest; both are accepted and both are shown as correct. A rest never runs across a beat
 * line, except the half-bar rest of 12/8 on beat 1 or 3 (an extension of the 4/4 rule, OPEN_QUESTIONS Q25).
 */
import { deriveScale, music, type Measure, type NotationEvent } from "@mtp/curriculum";
import { frag, maxLedger, n, nameOf, note, pretty, r, rhythmLine, valueWord, type Gen } from "./families.ts";
import { codes, keyWord, keysIn, noteId, noteLabel, spelledOptions, type Diagnoses } from "./grade1.ts";
import { ORD, cap, clefsOf, degreeNote, diag, keyFacts, optsOf, posText, rl, triadNotes } from "./grade2.ts";

type Pitch = music.Pitch;
type Clef = music.Clef;
type Ctx = Parameters<Gen>[0];
type Ev = NotationEvent;

const Q = "quaver" as const;
const C = "crotchet" as const;
const kind = (ts: string) => music.classifyTimeSignature(ts);
const topOf = (ts: string) => music.parseTimeSignature(ts).top;
const compoundTs = (c: Ctx) => (c.scope.timeSignatures ?? []).filter((t) => kind(t).metre === "compound");
const simpleTsAll = (c: Ctx) => (c.scope.timeSignatures ?? []).filter((t) => kind(t).metre === "simple");
const beamed = (len: number, i: number): { beam?: "begin" | "continue" | "end" } => (len > 1 ? { beam: i === 0 ? "begin" : i === len - 1 ? "end" : "continue" } : {});
const run = (value: music.NoteValue, len: number, rest = false): Ev[] => Array.from({ length: len }, (_, i) => (rest ? r(value) : n(value, 0, beamed(len, i))));
const valueOk = (c: Ctx, v: string) => !c.scope.noteValues?.length || c.scope.noteValues.includes(v as never);
const stripBeam = (e: Ev): Ev => {
  if (e.kind === "tuplet") return e;
  const { beam: _b, ...rest } = e as Ev & { beam?: string };
  return rest as Ev;
};
const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const fix = (id: string) => id;

// ---------------------------------------------------------------------------
// Unit 1: compound time
// ---------------------------------------------------------------------------

const KIND_WORD: Record<string, string> = { duple: "duple", triple: "triple", quadruple: "quadruple" };
const metreName = (ts: string) => `${kind(ts).metre} ${KIND_WORD[kind(ts).beats]}`;

/** t.g3.compound-facts: how the beat divides, the beat note, beats in a bar, the kind of time. */
export const compoundFacts: Gen = (c) => {
  const comp = compoundTs(c);
  const simple = simpleTsAll(c).filter((t) => /\/4$/.test(t));
  const mode = c.rng.pick((comp.length ? ["beats", "beats", "beat-note", "divide", "divide", "name", "name", "which-ts", "quavers", "classify-beat"] : ["classify-beat", "classify-beat", "which-beat", "divide-simple", "divide-compound", "dotted-beat"]) as string[]);
  if (mode === "classify-beat" || mode === "which-beat") {
    const BEATS = [
      { id: "s1", text: "a crotchet divided into two quavers", compound: false },
      { id: "s2", text: "a minim divided into two crotchets", compound: false },
      { id: "s3", text: "a quaver divided into two semiquavers", compound: false },
      { id: "c1", text: "a dotted crotchet divided into three quavers", compound: true },
    ];
    if (mode === "which-beat") {
      const ids = BEATS.map((b) => b.id);
      return {
        prompt: "Which of these beats belongs to compound time?",
        answer: { kind: "choice", options: c.rng.shuffle(BEATS.map((b) => ({ id: b.id, label: cap(b.text) }))), correctOptionIds: ["c1"], diagnoses: Object.fromEntries(ids.filter((x) => x !== "c1").map((x) => [x, diag("simple-compound-confusion", "That beat divides into two equal parts, which is simple time. In compound time every beat divides into three.")])) },
        hints: ["In compound time the beat is a dotted note that divides into three equal notes."],
      };
    }
    const b = c.rng.pick(BEATS);
    return {
      prompt: `A piece has beats that are each ${b.text}. Is it in simple time or compound time?`,
      answer: { kind: "choice", options: [{ id: "simple", label: "Simple time" }, { id: "compound", label: "Compound time" }], correctOptionIds: [b.compound ? "compound" : "simple"], diagnoses: { [b.compound ? "simple" : "compound"]: diag("simple-compound-confusion", b.compound ? "Count the equal parts in each beat: there are three, not two. Beats that divide into three are compound time." : "Count the equal parts in each beat: there are two, not three. Beats that divide into two are simple time.") } },
      hints: ["Count the equal notes in one beat: two means simple time, three means compound time."],
    };
  }
  if (mode === "divide-compound" || mode === "dotted-beat") {
    const dotted = mode === "dotted-beat";
    return {
      prompt: dotted ? "In compound time the beat is a dotted crotchet. How many quavers last as long as one dotted crotchet?" : "In compound time, into how many equal notes does each beat divide?",
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: ["3"], diagnoses: { "2": diag("simple-compound-confusion", dotted ? "Two quavers last as long as a plain crotchet. The dot adds half as much again: one more quaver." : "Two equal parts is simple time. In compound time every beat divides into three."), "4": diag("beat-count-wrong", dotted ? "Four quavers is a minim. A dotted crotchet is a crotchet (2 quavers) plus half of it (1 quaver)." : "Four is not the first division of a beat. Compound beats divide into three."), "6": diag("beat-count-wrong", dotted ? "Six quavers is a dotted minim, two whole beats of compound time." : "Six would be two beats' worth. One compound beat divides into three.") } },
      hints: [dotted ? "A crotchet is 2 quavers. The dot adds half its length." : "Compound time: the beat is a dotted note that divides into three."],
    };
  }
  if (mode === "divide-simple") {
    const pool = simple.length ? simple : simpleTsAll(c);
    if (!pool.length) return null;
    const ts = c.rng.pick(pool);
    const sub = music.parseTimeSignature(ts).bottom === 4 ? "quavers" : music.parseTimeSignature(ts).bottom === 2 ? "crotchets" : "semiquavers";
    return {
      prompt: `Each beat of ${ts} is an ordinary (undotted) note. Into how many equal ${sub} does it divide?`,
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: ["2"], diagnoses: { "3": diag("simple-compound-confusion", "Three equal parts is compound time, where the beat is a dotted note. An undotted beat divides into two."), "4": diag("beat-count-wrong", "Four would be two sub-divisions of the beat. The first division of an undotted beat is into two equal parts."), "6": diag("beat-count-wrong", "Six is far too many for one beat. The first division of an undotted beat is into two equal parts.") } },
      hints: ["Simple time: beats divide into two."],
    };
  }
  const ts = c.rng.pick(comp);
  const top = topOf(ts);
  const beats = top / 3;
  const k = kind(ts);
  if (mode === "beats") {
    const ids = [...new Set([beats, top, beats === 2 ? 3 : 2, 4])].sort((a, b) => a - b).map(String);
    return {
      prompt: `How many beats are there in each bar of ${ts}?`,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(beats)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(beats)).map((x) => [x, diag("beat-count-wrong", Number(x) === top ? `${top} is the number of quavers, not the number of beats. In compound time three quavers make one dotted-crotchet beat, so ${ts} has ${beats} beats.` : `Divide the top number by three: ${top} quavers make ${beats} dotted-crotchet beats.`)])) },
      hints: ["The top number counts quavers. Three quavers make one beat."],
    };
  }
  if (mode === "beat-note") {
    const ids = ["crotchet", "dotted-crotchet", "quaver", "dotted-minim"];
    const lab: Record<string, string> = { crotchet: "A crotchet", "dotted-crotchet": "A dotted crotchet", quaver: "A quaver", "dotted-minim": "A dotted minim" };
    return {
      prompt: `In ${ts}, which note is worth one beat?`,
      answer: { kind: "choice", options: optsOf(ids, (x) => lab[x]!), correctOptionIds: ["dotted-crotchet"], diagnoses: { crotchet: diag("beat-unit-wrong", "A crotchet is only two quavers. A compound beat holds three quavers, which is a dotted crotchet."), quaver: diag("beat-unit-wrong", "The bottom number 8 names the quaver that is counted in the bar, but the beat is three of them, a dotted crotchet."), "dotted-minim": diag("beat-unit-wrong", "A dotted minim is six quavers, two whole beats of compound time.") } },
      hints: ["Three quavers make one beat. Which note lasts as long as three quavers?"],
    };
  }
  if (mode === "divide") {
    const pool = [...comp, ...simple.slice(0, 3)];
    const t = c.rng.pick(pool);
    const compound = kind(t).metre === "compound";
    const ans = compound ? "3" : "2";
    return {
      prompt: `When the beat of ${t} is divided in the usual way, into how many equal notes does one beat divide?`,
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: [ans], diagnoses: Object.fromEntries(["2", "3", "4", "6"].filter((x) => x !== ans).map((x) => [x, diag("simple-compound-confusion", compound ? `${t} is compound time: each beat is a dotted note that divides into three, not ${x}.` : `${t} is simple time: each beat divides into two, not ${x}.`)])) },
      hints: [compound ? "Compound time: beats divide into three." : "Simple time: beats divide into two."],
    };
  }
  if (mode === "name") {
    const all = ["simple duple", "simple triple", "simple quadruple", "compound duple", "compound triple", "compound quadruple"];
    const right = metreName(ts);
    const wrong = c.rng.shuffle(all.filter((x) => x !== right));
    // always include the same count in the other kind of time, the commonest confusion
    const twin = `${k.metre === "compound" ? "simple" : "compound"} ${k.beats}`;
    const picks = [twin, ...wrong.filter((x) => x !== twin)].slice(0, 3);
    return {
      prompt: `What kind of time is ${ts}?`,
      answer: { kind: "choice", options: c.rng.shuffle([right, ...picks]).map((x) => ({ id: x, label: cap(x) })), correctOptionIds: [right], diagnoses: Object.fromEntries(picks.map((x) => [x, diag(x.startsWith("simple") ? "simple-compound-confusion" : x.endsWith(k.beats) ? "simple-compound-confusion" : "beat-count-wrong", x.startsWith("simple") ? `${ts} has dotted-crotchet beats that divide into three, so it is compound time.` : `Count the beats in a bar of ${ts}: ${beats}. That makes it ${metreName(ts)}.`)])) },
      hints: [`${ts} has ${top / 3} dotted-crotchet beats in a bar: that is ${words[beats]} beats, so ${metreName(ts)}.`],
    };
  }
  if (mode === "which-ts") {
    const want = c.rng.pick(comp);
    const wk = kind(want);
    const twin = ({ duple: "2/4", triple: "3/4", quadruple: "4/4" } as Record<string, string>)[wk.beats]!;
    const opts = [...new Set([...comp, ...(simple.includes(twin) ? [twin] : [])])];
    if (opts.length < 3) return null;
    return {
      prompt: `Which of these time signatures is in compound ${wk.beats} time?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts.map((t) => ({ id: t, label: t }))), correctOptionIds: [want], diagnoses: Object.fromEntries(opts.filter((t) => t !== want).map((t) => [t, diag(kind(t).metre === "simple" ? "simple-compound-confusion" : "beat-count-wrong", kind(t).metre === "simple" ? `${t} is simple ${kind(t).beats} time. Its beats are undotted notes divided into two.` : `${t} is compound ${kind(t).beats} time: it has ${topOf(t) / 3} dotted-crotchet beats.`)])) },
      hints: ["Compound duple has 2 dotted-crotchet beats, compound triple 3, compound quadruple 4. Divide the top number by 3."],
    };
  }
  // quavers in a bar
  const pool = [...comp, ...simple.slice(0, 3)];
  const t = c.rng.pick(pool);
  const p = music.parseTimeSignature(t);
  const quavers = (p.top * 8) / p.bottom;
  const ids = [...new Set([quavers, p.top, quavers / 2, quavers * 2, 3].filter((x) => Number.isInteger(x) && x > 1))].sort((a, b) => a - b).slice(0, 5).map(String);
  if (!ids.includes(String(quavers))) return null;
  return {
    prompt: `How many quavers fill one whole bar of ${t}?`,
    answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(quavers)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(quavers)).map((x) => [x, diag(Number(x) === p.top ? "beat-unit-wrong" : "beat-count-wrong", `A bar of ${t} holds ${quavers} quavers. Work from the beats: each beat is ${p.bottom === 8 && kind(t).metre === "compound" ? "three quavers" : p.bottom === 4 ? "two quavers" : "one quaver"}.`)])) },
    hints: ["Find the length of one beat in quavers, then multiply by the number of beats."],
  };
};

// ---- bars written from beat cells --------------------------------------------------------------------------------

type CellName = "dc" | "qqq" | "cq" | "qc";
const CELL: Record<CellName, () => Ev[]> = {
  dc: () => [n(C, 1)],
  qqq: () => run(Q, 3),
  cq: () => [n(C), n(Q)],
  qc: () => [n(Q), n(C)],
};
const planBar = (plan: CellName[]) => plan.flatMap((k) => CELL[k]());
const measuresOf = (bars: Ev[][]): Measure[] => bars.map((events, i) => ({ events, ...(i === bars.length - 1 ? { barline: "final" as const } : {}) }));
const clean = (ev: Ev[], ts: string) => codes(ev, ts).length === 0;
const GROUPING = new Set(["beam-hides-compound-beat", "note-hides-compound-beat", "beat-not-beamed", "unnecessary-tie", "tie-instead-of-dot", "beam-crosses-beat"]);
const grouping = (ev: Ev[], ts: string) => {
  const cs = codes(ev, ts);
  return cs.length > 0 && cs.every((x) => GROUPING.has(x));
};

/** Which bar of three groups its notes correctly? Wrong bars hide a beat, tie inside a beat or beam badly; never by miscounting. */
export const compoundJudge: Gen = (c) => {
  const pool = compoundTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = topOf(ts) / 3;
  const mode = c.rng.pick(["beams", "beams", "long"] as const);
  const cells: CellName[] = ["dc", "qqq", "cq", "qc"];
  type Bar = { ev: Ev[]; right: boolean; why: string; cat: string };
  if (mode === "beams") {
    const plan: CellName[] = Array.from({ length: beats }, () => c.rng.pick(cells));
    if (!plan.includes("qqq")) plan[c.rng.int(0, beats - 1)] = "qqq";
    if ((plan as string[]).every((p) => p === "qqq")) plan[c.rng.int(0, beats - 1)] = "dc";
    const right = planBar(plan);
    const variants: Bar[] = [];
    const idx = (name: CellName) => plan.map((p, i) => (p === name ? i : -1)).filter((i) => i >= 0);
    const build = (override: Record<number, Ev[]>) => plan.flatMap((p, i) => override[i] ?? CELL[p]());
    for (const i of idx("dc")) variants.push({ ev: build({ [i]: [n(C, 0, { tieToNext: true }), n(Q)] }), right: false, cat: "tie-instead-of-dot", why: "A tie inside one beat is not needed: a dotted crotchet already shows the whole beat." });
    for (const i of idx("qqq")) variants.push({ ev: build({ [i]: [n(Q, 0, beamed(2, 0)), n(Q, 0, beamed(2, 1)), n(Q)] }), right: false, cat: "compound-beat-hidden", why: "The three quavers of a beat belong together. Beam all three, not two and one." });
    for (let i = 0; i + 1 < beats; i++) {
      if (plan[i] === "qqq" && plan[i + 1] === "qqq") variants.push({ ev: build({ [i]: run(Q, 6), [i + 1]: [] }), right: false, cat: "compound-beat-hidden", why: "One beam across six quavers hides the beats. Beam each group of three separately." });
      if (plan[i] === "dc" && plan[i + 1] === "dc") variants.push({ ev: build({ [i]: [n(C), n(C), n(C)], [i + 1]: [] }), right: false, cat: "compound-beat-hidden", why: "Crotchets run across the beats here and hide them. In compound time write each beat as a dotted crotchet." });
    }
    const wrong = c.rng.shuffle(variants.filter((v) => grouping(v.ev, ts) && !codes(v.ev, ts).some((x) => x === "bar-overfull" || x === "bar-underfull")));
    const picks: Bar[] = [];
    for (const v of wrong) if (picks.length < 2 && !picks.some((p) => p.cat === v.cat && p.why === v.why && JSON.stringify(p.ev) === JSON.stringify(v.ev))) picks.push(v);
    if (picks.length < 2 || !clean(right, ts)) return null;
    return judgeItem(c, ts, [{ ev: right, right: true, why: "", cat: "" }, ...picks], `All three bars are in ${ts}. Which bar groups its notes correctly?`);
  }
  // long: a note lasting two whole beats
  if (beats < 2) return null;
  const at = beats === 2 ? 0 : beats === 3 ? c.rng.int(0, 1) : c.rng.pick([0, 2]);
  const fill = Array.from({ length: beats }, () => c.rng.pick(cells));
  const around = (mid: Ev[]) => fill.flatMap((p, i) => (i === at ? mid : i === at + 1 ? [] : CELL[p]()));
  const right = around([n("minim", 1)]);
  const options: Bar[] = [
    { ev: right, right: true, why: "", cat: "" },
    { ev: around([n(C, 1, { tieToNext: true }), n(C, 1)]), right: false, cat: "tie-instead-of-dot", why: "Two whole beats joined by a tie can be written as one dotted minim. The tie is only needed when a note would hide a beat." },
    { ev: around([n("minim"), n(C)]), right: false, cat: "compound-beat-hidden", why: "A minim and a crotchet do not follow the dotted-crotchet beats: the minim runs into the next beat and hides it." },
  ];
  if (!options.slice(1).every((o) => grouping(o.ev, ts)) || !clean(right, ts)) return null;
  return judgeItem(c, ts, options, `All three bars are in ${ts} and contain a sound that lasts two beats. Which bar writes it correctly?`);
};

function judgeItem(c: Ctx, ts: string, bars: Array<{ ev: Ev[]; right: boolean; why: string; cat: string }>, prompt: string) {
  if (new Set(bars.map((b) => JSON.stringify(b.ev))).size !== bars.length) return null;
  const order = c.rng.shuffle(bars);
  const answerIdx = order.findIndex((b) => b.right);
  const f = rl(measuresOf(order.map((b) => b.ev)), { timeSignature: ts });
  // the printed time signature is part of the fragment (a rhythm line shows it before the first bar)
  return {
    prompt,
    music: f,
    answer: { kind: "choice" as const, options: order.map((_, i) => ({ id: String(i + 1), label: `Bar ${i + 1}` })), correctOptionIds: [String(answerIdx + 1)], diagnoses: Object.fromEntries(order.map((b, i) => [String(i + 1), b.right ? null : diag(b.cat, b.why)]).filter(([, v]) => v)) as Diagnoses },
    hints: [`${ts} has ${words[topOf(ts) / 3]} dotted-crotchet beats in each bar. Each beat should be easy to see.`],
  };
}

/** Which bar writes its rests correctly (compound time)? The rule differs between bars; the beats always add up. */
export const compoundRestJudge: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = compoundTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = topOf(ts) / 3;
  const mode = c.rng.pick((beats >= 3 ? ["split", "span", "span"] : ["split"]) as Array<"split" | "span">);
  type Bar = { ev: Ev[]; right: boolean; why: string; cat: string };
  const rest1 = () => (c.rng.chance(0.5) ? [r(C, 1)] : [r(C), r(Q)]);
  const sound = () => c.rng.pick<CellName>(["dc", "qqq", "cq", "qc"]);
  const rep = (ev: Ev[]) => ev.map((e) => ({ ...e }));
  const restGroup = (ev: Ev[]) => codes(ev, ts).length === 0;
  const badRest = (ev: Ev[]) => { const cs = codes(ev, ts); return cs.length > 0 && cs.every((x) => x === "rest-across-beat" || x === "half-bar-rest-misplaced" || x === "rests-not-combined"); };
  let bars: Bar[];
  let prompt: string;
  if (mode === "split") {
    // one silent beat: written with one rest (or crotchet + quaver rests) vs three small rests
    const at = c.rng.int(0, beats - 1);
    const rest = rest1();
    const fill = Array.from({ length: beats }, () => sound());
    const bar = (mid: Ev[]) => fill.flatMap((p, i) => (i === at ? rep(mid) : CELL[p]()));
    bars = [
      { ev: bar(rest), right: true, why: "", cat: "" },
      { ev: bar(run(Q, 3, true)), right: false, cat: "rest-grouping", why: "Three separate quaver rests for one silent beat is too fussy. A silent beat is one dotted-crotchet rest, or a crotchet rest and a quaver rest." },
      { ev: bar([r(Q), r(C)]), right: false, cat: "rest-grouping", why: "Within a silent beat the longer rest comes first: a crotchet rest then a quaver rest, or a single dotted-crotchet rest." },
    ];
    // the quaver-then-crotchet order is only an error by convention; keep it only when the checker agrees it is
    if (!badRest(bars[1]!.ev) || restGroup(bars[2]!.ev)) bars = bars.slice(0, 2).concat(bars[2]!.ev && !restGroup(bars[2]!.ev) ? [bars[2]!] : []);
    prompt = `All three bars are in ${ts} and have a silent beat. Which bar writes the silent beat correctly?`;
    if (bars.length < 3) {
      const other = (at + 1) % beats;
      const bar2 = fill.flatMap((p, i) => (i === other ? run(Q, 3, true) : i === at ? rep(rest) : CELL[p]()));
      if (!badRest(bar2)) return null;
      bars.push({ ev: bar2, right: false, cat: "rest-grouping", why: "Three separate quaver rests for one silent beat is too fussy. A silent beat is one dotted-crotchet rest, or a crotchet rest and a quaver rest." });
    }
  } else if (mode === "span") {
    // two silent beats in a row: each gets its own rest; one rest must not run across a beat line.
    // (In 12/8 a two-beat rest is acceptable on beat 1 or 3, so the silence is placed on beats 2-3 there and the bar that joins them is wrong.)
    const at = beats === 3 ? c.rng.int(0, 1) : 1;
    const fill = Array.from({ length: beats }, () => sound());
    const bar = (mid: Ev[]) => fill.flatMap((p, i) => (i === at ? rep(mid) : i === at + 1 ? [] : CELL[p]()));
    const mid = beats === 4;
    bars = [
      { ev: bar([...rest1(), ...rest1()]), right: true, why: "", cat: "" },
      { ev: bar([r("minim", 1)]), right: false, cat: mid ? "half-bar-rest-misplaced" : "rest-across-beat", why: mid ? "A two-beat rest may fill the first or the second half of a 12/8 bar, but not the middle two beats." : "One rest should not join two beats of compound time. Give each silent beat its own rest." },
      { ev: bar([...rest1(), ...run(Q, 3, true)]), right: false, cat: "rest-grouping", why: "Three separate quaver rests for one silent beat is too fussy. A silent beat is one dotted-crotchet rest, or a crotchet rest and a quaver rest." },
    ];
    prompt = `All three bars are in ${ts} and have two silent beats in a row. Which bar writes its rests correctly?`;
  } else {
    return null;
  }
  const right = bars.filter((b) => b.right);
  if (right.length !== 1 || !restGroup(right[0]!.ev)) return null;
  for (const b of bars.filter((x) => !x.right)) if (!badRest(b.ev)) return null;
  return judgeItem(c, ts, bars, prompt);
};

/** Triplets and compound time: what is the same and what differs. Prompts always contain the word "triplet". */
export const tripletCompare: Gen = (c) => {
  const comp = compoundTs(c);
  if (!comp.length || !c.scope.tuplets?.includes("triplet")) return null;
  const SIMPLE_OF: Record<string, string> = { "6/8": "2/4", "9/8": "3/4", "12/8": "4/4" };
  const ts = c.rng.pick(comp.filter((t) => SIMPLE_OF[t] && (c.scope.timeSignatures ?? []).includes(SIMPLE_OF[t]!)));
  if (!ts) return null;
  const simple = SIMPLE_OF[ts]!;
  const beats = topOf(ts) / 3;
  const mode = c.rng.pick(["which-compound", "which-simple", "more-notes", "equal-length", "how-many"] as const);
  const sig = (t: string) => ({ id: t, label: t });
  if (mode === "which-compound") {
    const opts = [...new Set([...comp, "3/8"])].filter((t) => (c.scope.timeSignatures ?? []).includes(t));
    return {
      prompt: `Every beat of a bar of ${simple} is a triplet of three quavers. Which compound time signature has the same number of beats, each divided into three quavers?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts.map(sig)), correctOptionIds: [ts], diagnoses: Object.fromEntries(opts.filter((t) => t !== ts).map((t) => [t, diag("simple-compound-confusion", t === "3/8" ? "3/8 is simple time, with three quaver beats. We need dotted-crotchet beats, each divided into three quavers." : `${t} has ${topOf(t) / 3} beats in a bar, but ${simple} has ${beats}.`)])) },
      hints: [`${simple} has ${beats} beats. Which compound signature has ${beats} dotted-crotchet beats?`],
    };
  }
  if (mode === "which-simple") {
    const opts = ["2/4", "3/4", "4/4"].filter((t) => (c.scope.timeSignatures ?? []).includes(t));
    if (opts.length < 3) return null;
    return {
      prompt: `A bar of ${ts} has every beat divided into three quavers. In which simple time signature would the same bar be written with a triplet of quavers on every beat?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts.map(sig)), correctOptionIds: [simple], diagnoses: Object.fromEntries(opts.filter((t) => t !== simple).map((t) => [t, diag("beat-count-wrong", `${t} has ${topOf(t)} beats in a bar, but ${ts} has ${beats}. The number of beats must match.`)])) },
      hints: [`${ts} has ${beats} beats. Which simple time signature has ${beats} beats?`],
    };
  }
  if (mode === "more-notes") {
    return {
      prompt: `Bar A is in ${simple} with a triplet of quavers on every beat. Bar B is in ${ts} with every beat divided into three quavers. Which bar has more notes?`,
      answer: { kind: "choice", options: [{ id: "A", label: `Bar A (${simple}, triplets)` }, { id: "B", label: `Bar B (${ts})` }, { id: "same", label: "They have the same number of notes" }], correctOptionIds: ["same"], diagnoses: { A: diag("tuplet-ignored", `Each triplet beat holds three notes and ${simple} has ${beats} beats: ${beats * 3} notes. That is the same as ${ts}.`), B: diag("simple-compound-confusion", `Bar B has ${beats} beats of three quavers: ${beats * 3} notes. Bar A has the same.`) } },
      hints: [`Count the notes in one beat of each bar, then multiply by the ${beats} beats.`],
    };
  }
  if (mode === "equal-length") {
    const ids = ["crotchet", "dotted-crotchet", "minim", "quaver"];
    const lab: Record<string, string> = { crotchet: "a crotchet", "dotted-crotchet": "a dotted crotchet", minim: "a minim", quaver: "a quaver" };
    return {
      prompt: `A triplet of three quavers takes up one crotchet beat in ${simple}. In ${ts}, three ordinary quavers make one beat. Which note lasts as long as that one beat?`,
      answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: cap(lab[x]!) }))), correctOptionIds: ["dotted-crotchet"], diagnoses: { crotchet: diag("tuplet-total-wrong", "The three quavers of a triplet are squeezed into a crotchet. Three ordinary quavers last longer: a crotchet and a half."), minim: diag("beat-unit-wrong", "A minim is four quavers. One beat of compound time is only three."), quaver: diag("beat-unit-wrong", "A quaver is one third of the beat, not the whole beat.") } },
      hints: ["Three quavers added up: a crotchet plus a quaver, which is a dotted crotchet."],
    };
  }
  const per = beats * 3;
  const ids = [...new Set([per, beats * 2, topOf(ts), beats * 4])].sort((a, b) => a - b).map(String);
  return {
    prompt: `In ${simple}, every beat is a triplet of three quavers. How many quavers are played in one bar?`,
    answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(per)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(per)).map((x) => [x, diag("tuplet-ignored", Number(x) === beats * 2 ? `That is how many ordinary quavers fit in ${simple}. Each beat holds a triplet, three quavers, not two.` : `${beats} beats with three quavers in each beat gives ${per}.`)])) },
    hints: ["Three quavers in each beat: multiply by the number of beats."],
  };
};

/** Looking at a bar: does a group of three quavers need a triplet sign? Counting notes in a bar of compound time or of triplets. */
export const tripletBar: Gen = (c) => {
  const comp = compoundTs(c).filter((t) => topOf(t) <= 9);
  const simple = simpleTsAll(c).filter((t) => t === "2/4" || t === "3/4");
  if (!comp.length || !simple.length || !c.scope.tuplets?.includes("triplet")) return null;
  const isCompound = c.rng.chance(0.5);
  const ts = c.rng.pick(isCompound ? comp : simple);
  const beats = isCompound ? topOf(ts) / 3 : topOf(ts);
  const tuplet = (): Ev => ({ kind: "tuplet", actual: 3, normal: 2, events: run(Q, 3) } as Ev);
  const bar = (): Ev[] => {
    const out: Ev[] = [];
    for (let i = 0; i < beats; i++) {
      const triple = i === 0 || c.rng.chance(0.6);
      if (triple) out.push(...(isCompound ? run(Q, 3) : [tuplet()]));
      else out.push(...(isCompound ? [n(C, 1)] : [n(C)]));
    }
    return out;
  };
  const events = bar();
  const plain = events.map((e) => e);
  const countQ = (evs: Ev[]): number => evs.reduce((s, e) => s + (e.kind === "tuplet" ? e.events.length : e.kind === "note" && e.duration.value === Q ? 1 : 0), 0);
  const total = countQ(plain);
  if (total < 3 || total === beats * 3) {
    // keep at least one beat that is not divided, so the count differs from "three per beat"
    if (total === beats * 3) return null;
  }
  const mode = c.rng.pick(["sign", "sign", "count"] as const);
  const f = rl(measuresOf([events]), { timeSignature: ts });
  if (mode === "sign") {
    const ans = isCompound ? "no" : "yes";
    return {
      prompt: `This bar is in ${ts}. Does the group of three beamed quavers in the first beat need a triplet sign (a 3)?`,
      music: f,
      answer: { kind: "choice", options: [{ id: "yes", label: "Yes, it needs a 3 over the three quavers" }, { id: "no", label: "No, no sign is needed" }], correctOptionIds: [ans], diagnoses: { [ans === "yes" ? "no" : "yes"]: diag(ans === "yes" ? "tuplet-ignored" : "simple-compound-confusion", ans === "yes" ? `${ts} is simple time: a beat is a crotchet that divides into two. Three quavers in one beat is a triplet, so it carries a 3.` : `${ts} is compound time: every beat is a dotted crotchet that already divides into three quavers. No sign is needed for that.`) } },
      hints: [isCompound ? "Compound time: the beat divides into three without any sign." : "Simple time: the beat divides into two, so three notes in a beat are a triplet."],
    };
  }
  const ids = [...new Set([total, total + 1, total - 1, beats * 3])].filter((x) => x > 0).sort((a, b) => a - b).map(String);
  return {
    prompt: `The bar is in ${ts}. How many quavers are written in the whole bar? (Count the three notes of a triplet group as quavers too.)`,
    music: f,
    answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(total)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(total)).map((x) => [x, diag("tuplet-ignored", "Count the quavers in each beat in turn. A dotted crotchet beat holds no quavers; a beat of three beamed quavers holds three.")])) },
    hints: ["Go beat by beat and count the quavers in each."],
  };
};

// ---------------------------------------------------------------------------
// Unit 2: demisemiquavers
// ---------------------------------------------------------------------------

const D = "demisemiquaver" as const;

/** t.g3.demisemi-facts: flags and beams, halves, how many fill a bar, and recognising the rest. */
export const demisemiFacts: Gen = (c) => {
  if (!valueOk(c, D)) return null;
  const mode = c.rng.pick(["flags", "beams", "half-of", "bar", "bar", "rest"] as const);
  if (mode === "flags") {
    return {
      prompt: "How many flags does a single demisemiquaver have when it is not beamed to other notes?",
      answer: { kind: "choice", options: optsOf(["1", "2", "3", "4"]), correctOptionIds: ["3"], diagnoses: { "1": diag("halved-or-doubled", "One flag is a quaver. Each extra flag halves the length: two flags make a semiquaver and three a demisemiquaver."), "2": diag("halved-or-doubled", "Two flags make a semiquaver. A demisemiquaver is half as long again, so it has a third flag."), "4": diag("halved-or-doubled", "Four flags would be a note even shorter than a demisemiquaver. A demisemiquaver has three.") } },
      hints: ["Quaver 1 flag, semiquaver 2 flags, demisemiquaver 3 flags."],
    };
  }
  if (mode === "beams") {
    const counts = [2, 3, 4];
    const pick = c.rng.pick(["semiquaver", "demisemiquaver", "quaver"] as const);
    const right = pick === "quaver" ? 1 : pick === "semiquaver" ? 2 : 3;
    const ids = ["1", "2", "3", "4"];
    void counts;
    return {
      prompt: `How many beams join a group of beamed ${pick}s?`,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(right)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(right)).map((x) => [x, diag("halved-or-doubled", `Beamed ${pick}s have ${right === 1 ? "one beam" : `${words[right]} beams`}, the same as the number of flags a single ${pick} has.`)])) },
      hints: ["The number of beams equals the number of flags on a single note of that value."],
    };
  }
  if (mode === "half-of") {
    const pairs: Array<[string, string]> = [["demisemiquaver", "semiquaver"], ["semiquaver", "quaver"], ["quaver", "crotchet"]];
    const [small, big] = pairs.filter(([s]) => valueOk(c, s))[c.rng.int(0, 0)]!;
    const all = ["quaver", "semiquaver", "crotchet", "minim"].filter((x) => x !== small);
    return {
      prompt: `A ${small} lasts half as long as which note?`,
      answer: { kind: "choice", options: c.rng.shuffle(all.slice(0, 4).map((x) => ({ id: x, label: cap(`a ${x}`) }))), correctOptionIds: [big], diagnoses: Object.fromEntries(all.slice(0, 4).filter((x) => x !== big).map((x) => [x, diag("halved-or-doubled", x === "crotchet" || x === "minim" ? `A ${x} is much longer. A ${small} is half of just the next note up.` : `A ${small} is half of a ${big}. A ${x} is a different length.`)])) },
      hints: ["Each shorter note is half the length of the one before: crotchet, quaver, semiquaver, demisemiquaver."],
    };
  }
  if (mode === "bar") {
    const pool = (c.scope.timeSignatures ?? []).filter((t) => kind(t).metre !== "irregular" && music.parseTimeSignature(t).bottom >= 4);
    if (!pool.length) return null;
    const ts = c.rng.pick(pool);
    const cap32 = music.barCapacity(music.parseTimeSignature(ts));
    const right = (cap32.n * 32) / cap32.d;
    const ids = [...new Set([right, right / 2, right * 2, (right * 3) / 4])].filter((x) => Number.isInteger(x)).sort((a, b) => a - b).map(String);
    return {
      prompt: `How many demisemiquavers fill one whole bar of ${ts}?`,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(right)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(right)).map((x) => [x, diag("halved-or-doubled", `Work it out from one beat: a crotchet is 8 demisemiquavers, a quaver 4. A bar of ${ts} holds ${right}.`)])) },
      hints: ["A crotchet is worth 8 demisemiquavers. Find how many crotchets (or quavers) fill the bar."],
    };
  }
  // rest: name a demisemiquaver rest from its picture
  const values = ["quaver", "semiquaver", "demisemiquaver"] as const;
  const shown = c.rng.pick(values);
  const label = (v: string) => cap(`a ${v} rest`);
  return {
    prompt: "The rest on the stave is a quaver rest, a semiquaver rest or a demisemiquaver rest. Which one is it?",
    music: rhythmLine([{ events: [r(shown)], barline: "final" as const }], { textAlternative: `A single ${shown} rest: it has ${shown === "quaver" ? "one" : shown === "semiquaver" ? "two" : "three"} small flags on its stem.`, questionAlternative: `A single rest with ${shown === "quaver" ? "one" : shown === "semiquaver" ? "two" : "three"} small flags on its stem.` }),
    answer: { kind: "choice", options: values.map((v) => ({ id: v, label: label(v) })), correctOptionIds: [shown], diagnoses: Object.fromEntries(values.filter((v) => v !== shown).map((v) => [v, diag("note-rest-confusion", `Count the flags on the rest: this one has ${shown === "quaver" ? "one" : shown === "semiquaver" ? "two" : "three"}, which makes it ${label(shown)}.`)])) },
    hints: ["The rest has the same number of flags as the note of the same value: one for a quaver, two for a semiquaver, three for a demisemiquaver."],
  };
};

/** A bar of demisemiquavers (never more than four in a row) with its correct beaming, and a version whose beam runs from one beat into the next. */
function demisemiBar(c: Ctx) {
  if (!valueOk(c, D)) return null;
  const pool = (c.scope.timeSignatures ?? []).filter((t) => kind(t).metre !== "irregular" && [4, 8].includes(music.parseTimeSignature(t).bottom) && music.metreStructure(t).groups.length <= 3);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const s = music.metreStructure(ts);
  const compound = s.metre === "compound";
  const S = "semiquaver" as const;
  type V = music.NoteValue;
  const CELLS: V[][] = compound
    ? [[D, D, D, D, Q, Q], [Q, D, D, D, D, Q], [D, D, D, D, C], [C, D, D, D, D], [S, S, Q, Q], [Q, S, S, Q], [D, D, S, Q, Q]]
    : s.groups[0]!.d === 4
      ? [[D, D, D, D, Q], [Q, D, D, D, D], [S, D, D, Q], [D, D, S, Q], [S, Q, D, D], [D, D, D, D, S, S], [S, S, D, D, D, D]]
      : [[D, D, D, D], [S, D, D], [D, D, S]];
  const cells = Array.from({ length: s.groups.length }, () => c.rng.pick(CELLS));
  if (!cells.some((cell) => cell.includes(D))) return null;
  const plain: Ev[] = cells.flat().map((v) => n(v));
  const right = music.autoBeam(plain as unknown as music.REvent[], s) as unknown as Ev[];
  if (!clean(right, ts)) return null;
  const joined = right.map((e) => ({ ...e })) as Array<Ev & { beam?: "begin" | "continue" | "end" }>;
  const first = joined[cells[0]!.length - 1];
  const next = joined[cells[0]!.length];
  let across: Ev[] | null = null;
  if (first && next && first.kind === "note" && next.kind === "note" && first.beam === "end" && next.beam === "begin") {
    first.beam = "continue";
    next.beam = "continue";
    across = joined;
  }
  return { ts, right, across };
}

/** Which bar groups its demisemiquavers correctly? One beam per beat, never across a beat, never more than four demisemiquavers in a row. */
export const demisemiJudge: Gen = (c) => {
  const d = demisemiBar(c);
  if (!d || !d.across) return null;
  const { ts, right, across } = d;
  const bars = [
    { ev: right, right: true, why: "", cat: "" },
    { ev: right.map(stripBeam), right: false, cat: "compound-beat-hidden", why: "These notes are written separately, so the beats are hard to see. Notes shorter than a crotchet are beamed together within each beat." },
    { ev: across, right: false, cat: "compound-beat-hidden", why: "The beam joins notes from two different beats and hides the beat between them. Start a new beam on each beat." },
  ];
  for (const bar of bars.slice(1)) if (!grouping(bar.ev, ts)) return null;
  return judgeItem(c, ts, bars, `All three bars are in ${ts} and contain the same notes. Which bar groups its demisemiquavers correctly?`);
};

/** t.g3.demisemi-regroup: beam a bar of short notes correctly (the notes are shown with separate flags, or with a beam that hides a beat). */
export const demisemiRegroup: Gen = (c) => {
  const d = demisemiBar(c);
  if (!d) return null;
  const { ts, right, across } = d;
  const useAcross = Boolean(across) && c.rng.chance(0.5);
  const question = useAcross ? across! : right.map(stripBeam);
  return {
    prompt: useAcross ? "One beam in this bar runs across two beats and hides the beat. Re-beam the notes so each beat is clear. The notes must stay the same." : "These notes are written with separate flags. Beam them so that each beat is clear. The notes must stay the same.",
    music: rhythmLine([{ events: question }], { timeSignature: ts }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: right }]], acceptAnyRuleCompliant: true },
    hints: [`${ts} has ${music.describeMetre(music.metreStructure(ts))} in each bar. Beam the notes within each beat; start a new beam on each beat.`],
  };
};

/** t.g3.compound-rest-write: finish a bar of compound time whose last beat(s) are silent. Either form of a silent dotted-crotchet beat is accepted. */
export const compoundRestWrite: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = compoundTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = topOf(ts) / 3;
  const silent = beats === 2 ? 1 : c.rng.int(1, 2);
  const cells = Array.from({ length: beats - silent }, () => c.rng.pick<CellName>(["dc", "qqq", "cq", "qc"]));
  const given = planBar(cells).map(stripBeam);
  // Every accepted ending is listed: each silent beat is a dotted-crotchet rest or a crotchet rest plus a quaver rest; in 12/8 the last two beats may be one dotted-minim rest.
  // Nothing but rests is accepted in the silent beats (a sounded note there is wrong), so the answer is not "any bar that adds up".
  const forms: Ev[][] = [[r(C, 1)], [r(C), r(Q)]];
  let endings: Ev[][] = [[]];
  for (let i = 0; i < silent; i++) endings = endings.flatMap((e) => forms.map((f) => [...e, ...f.map((x) => ({ ...x }))]));
  if (ts === "12/8" && silent === 2) endings.push([r("minim", 1)]);
  const fulls = endings.map((e) => [...given, ...e]);
  if (fulls.some((f) => codes(f, ts, { requireBeams: false }).length)) return null;
  return {
    prompt: `Complete this bar of ${ts}. The last ${silent === 1 ? "beat is" : "two beats are"} silent: add the ${silent === 1 ? "rest" : "rests"} so the bar adds up and the beats stay clear.`,
    answer: { kind: "rhythm", task: "complete-bar", timeSignature: ts, given, accepted: fulls.map((f) => [{ events: f }]), acceptAnyRuleCompliant: false },
    hints: ["A silent beat is one dotted-crotchet rest, or a crotchet rest and a quaver rest. Give every silent beat its own rest."],
  };
};

// ---------------------------------------------------------------------------
// Unit 3: ledger lines, octave signs and octave transposition
// ---------------------------------------------------------------------------

/** t.g3.ledger-place: write a named note on a ledger line (or space) beyond the second. The position is stated, so a note inside the stave is never right. */
export const ledgerPlace3: Gen = (c) => {
  const max = maxLedger(c);
  if (max < 3) return null;
  const clef = c.rng.pick(clefsOf(c));
  const pos = c.rng.pick([-8, -7, -6, -5, 12, 13, 14, 15, 16].filter((p) => Math.abs(p < 0 ? p : p - 8) / 2 <= max + 0.5));
  const p = music.naturalAt(clef, pos);
  const need = music.ledgerLines(clef, p);
  if (need < 2 || need > max) return null;
  return {
    prompt: `In the ${clef} clef, write the note ${p.step} that sits ${posText(pos)}.`,
    answer: { kind: "staff-position", clef, target: { step: p.step, alter: 0, position: "any" as const, maxLedgerLines: max, octave: p.octave }, accepted: [music.formatPitch(p)], octaveSensitive: true },
    hints: [`Ledger lines continue the pattern of the stave: a line, a space, a line... Count out from the stave, one line or space at a time.`],
  };
};

/** t.g3.ledger-count: read how a note sits beyond the stave. */
export const ledgerCount: Gen = (c) => {
  const max = maxLedger(c);
  if (max < 3) return null;
  const clef = c.rng.pick(clefsOf(c));
  const pos = c.rng.pick([-9, -8, -7, -6, -5, 12, 13, 14, 15, 16, 17]);
  const p = music.naturalAt(clef, pos);
  const need = music.ledgerLines(clef, p);
  if (need < 3 || need > max) return null;
  const mode = c.rng.pick(["count", "name", "name"] as const);
  const shown = frag(clef, [{ events: [note(p)] }], `A ${clef}-clef stave with one note ${posText(music.staffPosition(clef, p))}.`, { showKeySignature: false });
  if (mode === "count") {
    const ids = ["2", "3", "4", "5"].filter((x) => Number(x) <= max + 1);
    return {
      prompt: "How many ledger lines does this note need? Count every ledger line from the stave out to the note.",
      music: shown,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(need)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(need)).map((x) => [x, diag("ledger-miscount", pos % 2 === 0 ? `Count the ledger lines one at a time starting next to the stave: this note sits on the ${ORD(need)} one.` : `This note sits in a space beyond ledger line ${need}. Count the lines between the stave and the note, not the space itself.`)])) },
      hints: ["Count the short lines from the stave outwards."],
    };
  }
  const letters = music.STEPS.filter((s) => s !== p.step);
  const near = [music.naturalAt(clef, pos - 1), music.naturalAt(clef, pos + 1)].map((x) => x.step);
  const ids = [p.step, ...near.filter((x) => x !== p.step), ...c.rng.shuffle(letters.filter((x) => !near.includes(x)))].slice(0, 4);
  const flipped = music.naturalAt(clef === "treble" ? "bass" : "treble", pos);
  return {
    prompt: `Name this note. (It is written in the ${clef} clef.)`,
    music: shown,
    answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: x }))), correctOptionIds: [p.step], diagnoses: Object.fromEntries(ids.filter((x) => x !== p.step).map((x) => [x, diag(x === flipped.step ? "clef-confusion" : near.includes(x) ? "off-by-step" : "ledger-miscount", x === flipped.step ? `That would be the name in the ${clef === "treble" ? "bass" : "treble"} clef. In the ${clef} clef this position is ${p.step}.` : `Count from the nearest line or space you know in the ${clef} clef, step by step: the note is ${p.step}.`)])) },
    hints: [`In the ${clef} clef the top line is ${nameOf(music.naturalAt(clef, 8))} and the bottom line ${nameOf(music.naturalAt(clef, 0))}. Count on from there, one line or space at a time.`],
  };
};

/** t.g3.octave-sign: what 8va and 8vb mean (their sign is printed with the notes). */
export const octaveSign: Gen = (c) => {
  const clef = c.rng.pick(clefsOf(c));
  const high = c.rng.chance(0.5);
  const pos = clef === "treble" ? c.rng.pick([10, 11, 12, 13]) : c.rng.pick([-6, -7, -8]);
  const useHigh = clef === "treble" ? true : false;
  void high;
  const sign = useHigh ? "8va" : "8vb";
  const p = music.naturalAt(clef, pos);
  const sounds = useHigh ? 12 : -12;
  void sounds;
  const mode = c.rng.pick(["meaning", "sounding"] as const);
  const fig = frag(clef, [{ events: [note(p, "semibreve", useHigh ? {} : { label: "8vb" })] }], `A ${clef}-clef stave with one note ${posText(music.staffPosition(clef, p))}.${useHigh ? " The sign 8va is written above the note." : " The sign 8vb is written below the note."}`, { showKeySignature: false, octaveShift: useHigh ? 1 : -1, ...(useHigh ? { tempoText: "8va" } : {}) });
  if (mode === "meaning") {
    const ids = ["higher", "lower", "same", "two-higher"];
    const right = useHigh ? "higher" : "lower";
    const lab: Record<string, string> = { higher: "An octave higher than written", lower: "An octave lower than written", same: "Exactly as written", "two-higher": "Two octaves higher than written" };
    return {
      prompt: `The note is marked ${sign}. How is it played?`,
      music: fig,
      answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: lab[x]! }))), correctOptionIds: [right], diagnoses: Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, diag("wrong-octave", x === (useHigh ? "lower" : "higher") ? `${sign} points the other way: ${useHigh ? "8va (octava) is above the stave and means higher" : "8vb (octava bassa) is below the stave and means lower"}.` : x === "same" ? `An octave sign changes the pitch: ${sign} tells the player to move it ${useHigh ? "up" : "down"} an octave.` : `${sign} moves the note one octave, not two.`)])) },
      hints: ["8va moves music up an octave; 8vb moves it down an octave."],
    };
  }
  const target = music.transpose(p, music.parseInterval("P8"), useHigh ? "up" : "down");
  const ids = [useHigh ? "up" : "down", useHigh ? "down" : "up", "none"];
  const word = (x: string) => (x === "none" ? "Written pitch unchanged" : `${p.step}, one octave ${x === "up" ? "higher" : "lower"} than the written note`);
  return {
    prompt: `The note is written as ${p.step} on the stave with ${sign}. Which sounding pitch does the player produce?`,
    music: fig,
    answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: word(x) }))), correctOptionIds: [useHigh ? "up" : "down"], diagnoses: Object.fromEntries(ids.filter((x) => x !== (useHigh ? "up" : "down")).map((x) => [x, diag("wrong-octave", x === "none" ? `${sign} changes the sounding pitch by an octave.` : `${sign} means ${useHigh ? "higher" : "lower"}, so the note sounds ${useHigh ? "up" : "down"}.`)])) },
    hints: [`${sign} ${useHigh ? "is above the stave: higher" : "is below the stave: lower"}.`],
    ...(target ? {} : {}),
  };
};

/** t.g3.octave-sound: write the note that sounds when a marked note is played (octave displacement required). */
export const octaveSound: Gen = (c) => {
  const max = maxLedger(c);
  if (max < 3) return null;
  const clef = c.rng.pick(clefsOf(c));
  const up = clef === "treble" ? true : clef === "bass" ? false : c.rng.chance(0.5);
  const writtenPos = up ? c.rng.int(2, 8) : c.rng.int(0, 5);
  const written = music.naturalAt(clef, writtenPos);
  const sounding = music.transpose(written, music.parseInterval("P8"), up ? "up" : "down");
  const need = music.ledgerLines(clef, sounding);
  if (need > max || need < 1) return null;
  const sign = up ? "8va" : "8vb";
  const fig = frag(clef, [{ events: [note(written, "semibreve", up ? {} : { label: "8vb" })] }], `A ${clef}-clef stave with one note ${posText(music.staffPosition(clef, written))}.${up ? " The sign 8va is written above it." : " The sign 8vb is written below it."}`, { showKeySignature: false, octaveShift: up ? 1 : -1, ...(up ? { tempoText: "8va" } : {}) });
  return {
    prompt: `This note is marked ${sign}. In the same clef, write the note that will actually sound, without the sign. You may use up to ${max} ledger lines.`,
    music: fig,
    answer: { kind: "staff-position", clef, target: { step: sounding.step, alter: 0, position: "any" as const, maxLedgerLines: max, octave: sounding.octave }, accepted: [music.formatPitch(sounding)], octaveSensitive: true },
    hints: [`${sign} means ${up ? "an octave higher" : "an octave lower"}: the same letter name, eight steps ${up ? "up" : "down"} the stave (seven lines and spaces away).`],
  };
};

/** t.g3.octave-pick: where does a note go when the clef changes and the pitch moves an octave? Same-pitch positions are never right. */
export const octavePick: Gen = (c) => {
  const clefs = clefsOf(c);
  if (!clefs.includes("treble") || !clefs.includes("bass")) return null;
  const from: Clef = c.rng.pick(["treble", "bass"] as const);
  const to: Clef = from === "treble" ? "bass" : "treble";
  const dir: "up" | "down" = c.rng.pick(["up", "down"] as const);
  const p = music.naturalAt(from, c.rng.pick([-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
  const target = music.transpose(p, music.parseInterval("P8"), dir);
  const same = music.staffPosition(to, p);
  const tpos = music.staffPosition(to, target);
  const max = maxLedger(c);
  if (music.ledgerLines(to, target) > Math.min(max, 2) || music.ledgerLines(to, music.naturalAt(to, same)) > 3) return null;
  const ids = new Map<number, { why: string; cat: string } | null>([[tpos, null]]);
  ids.set(same, { cat: "wrong-octave", why: `That is the same pitch written in the ${to} clef. The question asks for a note an octave ${dir === "up" ? "higher" : "lower"}, so the position must move as well as the clef.` });
  const other = music.staffPosition(to, music.transpose(p, music.parseInterval("P8"), dir === "up" ? "down" : "up"));
  if (!ids.has(other) && music.ledgerLines(to, music.naturalAt(to, other)) <= 3) ids.set(other, { cat: "wrong-direction", why: `That moves the note the wrong way. ${dir === "up" ? "Higher" : "Lower"} means ${dir === "up" ? "up" : "down"} the stave.` });
  for (const d of c.rng.shuffle([-1, 1, 7, -7])) if (ids.size < 4 && !ids.has(tpos + d) && music.ledgerLines(to, music.naturalAt(to, tpos + d)) <= 2) ids.set(tpos + d, { cat: "wrong-interval", why: "That is the right idea but not the right line or space. Count the octave as eight letters, seven steps of line and space." });
  if (ids.size < 3) return null;
  const shown = frag(from, [{ events: [note(p)] }], `A ${from}-clef stave with one note ${posText(music.staffPosition(from, p))}.`, { showKeySignature: false });
  const list = [...ids.keys()];
  return {
    prompt: `This note is in the ${from} clef. It is to be written an octave ${dir === "up" ? "higher" : "lower"} in the ${to} clef. Where is the new note written?`,
    music: shown,
    answer: { kind: "choice", options: c.rng.shuffle(list.map((k) => ({ id: String(k), label: cap(posText(k)) }))), correctOptionIds: [String(tpos)], diagnoses: Object.fromEntries([...ids].filter(([k, v]) => v && k !== tpos).map(([k, v]) => [String(k), diag(v!.cat, v!.why)])) as Diagnoses },
    hints: ["First find the same pitch in the new clef. Then move it up or down by one octave: seven lines and spaces."],
  };
};

// ---------------------------------------------------------------------------
// Unit 4: keys, scales and the two minor forms
// ---------------------------------------------------------------------------

const minorKeys = (c: Ctx) => keysIn(c).filter((k) => k.endsWith("minor"));
const asc = (keyText: string, form: "major" | "harmonic" | "melodic", dir: string, oct = 4) => deriveScale(keyText, form, dir, { ...music.parseKey(keyText).tonic, octave: oct });

/** t.g3.minor-forms: the harmonic and the melodic minor compared (which notes change, which form is shown). */
export const minorForms: Gen = (c) => {
  const forms = c.scope.minorForms ?? [];
  if (!forms.includes("melodic") || !forms.includes("harmonic")) return null;
  const keys = minorKeys(c);
  if (!keys.length) return null;
  const keyText = c.rng.pick(keys);
  const key = music.parseKey(keyText);
  const mode = c.rng.pick(["which-form", "which-form", "descending", "notes-changed", "raised"] as const);
  const clef = c.rng.pick(clefsOf(c));
  const showScale = (form: "harmonic" | "melodic", dir: "ascending" | "descending") => {
    for (const oct of c.rng.shuffle([2, 3, 4])) {
      const notes = asc(keyText, form, dir, oct);
      if (notes.every((p) => music.ledgerLines(clef, p) <= Math.min(maxLedger(c), 2))) return notes;
    }
    return null;
  };
  if (mode === "which-form") {
    const choice = c.rng.pick([["harmonic", "ascending"], ["melodic", "ascending"], ["melodic", "descending"]] as const);
    const notes = showScale(choice[0], choice[1]);
    if (!notes) return null;
    const label = (f: string, d: string) => `${cap(f)} minor, ${d}`;
    const all: Array<[string, string]> = [["harmonic", "ascending"], ["melodic", "ascending"], ["melodic", "descending"], ["harmonic", "descending"]];
    // two forms are the same notes in some directions; the question is only asked where the answer is unique
    const sameNotes = (a: [string, string]) => JSON.stringify(asc(keyText, a[0] as "harmonic", a[1], 4).map(music.formatPitch)) === JSON.stringify(asc(keyText, choice[0], choice[1], 4).map(music.formatPitch));
    const unique = all.filter(sameNotes);
    if (unique.length !== 1) return null;
    const ids = all.map((a) => a.join("-"));
    const right = choice.join("-");
    return {
      prompt: `This is a scale of ${keyWord(keyText)}, written with accidentals and no key signature. Which form of the minor scale is it (harmonic or melodic, going up or coming down)?`,
      music: frag(clef, [{ events: notes.map((p) => note(p)) }], `A ${clef}-clef stave with eight semibreves ${choice[1] === "ascending" ? "going up" : "coming down"}: ${notes.map(nameOf).join(", ")}.`, { showKeySignature: false }),
      answer: { kind: "choice", options: c.rng.shuffle(all.map((a) => ({ id: a.join("-"), label: label(a[0], a[1]) }))), correctOptionIds: [right], diagnoses: Object.fromEntries(ids.filter((x) => x !== right).map((x) => [x, diag(x.startsWith(choice[0]) ? "melodic-descent-not-restored" : "wrong-minor-form", x.startsWith("harmonic") ? "Check the 6th note: in the harmonic minor it stays a semitone above the 5th, and the 7th is raised in both directions." : "Check the 6th and 7th notes against the harmonic minor. In the melodic minor going up both are raised; coming down both are lowered again.")])) as Diagnoses },
      hints: ["Harmonic minor: only the 7th is raised, going up and coming down. Melodic minor: the 6th and 7th are raised going up and lowered again coming down."],
    };
  }
  if (mode === "descending") {
    const ascN = asc(keyText, "melodic", "ascending", 4);
    const ids = ["same-as-up", "natural", "only-seventh"];
    const lab: Record<string, string> = { "same-as-up": "The same notes as going up", natural: "The 6th and 7th are lowered by a semitone, back to the notes of the key signature", "only-seventh": "Only the 7th is lowered" };
    void ascN;
    return {
      prompt: `In ${keyWord(keyText)}, how does the melodic minor scale change when it comes down?`,
      answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: lab[x]! }))), correctOptionIds: ["natural"], diagnoses: { "same-as-up": diag("melodic-descent-not-restored", "The melodic minor only raises the 6th and 7th going up. Coming down they return to the notes of the key signature."), "only-seventh": diag("melodic-descent-not-restored", "Both the 6th and the 7th are lowered coming down, not just the 7th.") } },
      hints: ["Going up: raise the 6th and 7th. Coming down: lower them again."],
    };
  }
  if (mode === "notes-changed") {
    const upN = music.scale(key, "melodic-ascending");
    const downN = [...music.scale(key, "melodic-descending")].reverse();
    const changed = upN.map((p, i) => (music.samePitchClassSpelling(p, downN[i]!) ? -1 : i + 1)).filter((x) => x > 0);
    if (changed.join("-") !== "6-7") return null;
    const ids = ["5-6", "6-7", "7-8", "3-4"];
    return {
      prompt: `Compare the melodic minor scale of ${keyWord(keyText)} going up with the same scale coming down. Which two degrees of the scale have different notes in the two directions?`,
      answer: { kind: "choice", options: c.rng.shuffle(ids.map((x) => ({ id: x, label: `The ${ORD(Number(x.split("-")[0]))} and ${ORD(Number(x.split("-")[1]))}` }))), correctOptionIds: [changed.join("-")], diagnoses: Object.fromEntries(ids.filter((x) => x !== changed.join("-")).map((x) => [x, diag("wrong-minor-form", "In the melodic minor the notes that change are the 6th and 7th degrees: raised going up, lowered coming down.")])) },
      hints: ["Only the 6th and 7th degrees change in the melodic minor."],
    };
  }
  // raised: name the raised 6th / 7th
  const degree = c.rng.pick([6, 7] as const);
  const upN = asc(keyText, "melodic", "ascending", 4);
  const target = upN[degree - 1]!;
  const { options, diagnoses } = spelledOptions(c, target, keyText);
  if (options.length < 3) return null;
  const natural = music.scale(key, "melodic-descending")[degree - 1]!;
  const dg: Diagnoses = { ...diagnoses };
  if (options.some((o) => o.id === noteId(natural))) dg[noteId(natural)] = diag("melodic-descent-not-restored", `That is the ${ORD(degree)} note of the key signature. Going up in the melodic minor it is raised by a semitone: ${noteLabel(target)}.`);
  return {
    prompt: `In the ${noteLabel(key.tonic)} melodic minor scale going up, which note is the ${ORD(degree)} degree?`,
    answer: { kind: "choice", options, correctOptionIds: [noteId(target)], diagnoses: dg },
    hints: ["Start with the notes of the key signature, then raise the 6th and 7th by a semitone."],
  };
};

/** t.g3.scale-gap: a scale with one note missing, in any Grade 3 key and any taught form and direction. */
export const scaleGap3: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const forms = c.scope.minorForms ?? [];
  const form: "major" | "harmonic" | "melodic" = key.mode === "major" ? "major" : c.rng.pick(forms.length ? (forms as Array<"harmonic" | "melodic">) : ["harmonic"]);
  const dir = c.rng.pick(form === "melodic" ? (["ascending", "descending"] as const) : (["ascending", "descending"] as const));
  const clef = c.rng.pick(clefsOf(c));
  for (const octave of c.rng.shuffle([2, 3, 4])) {
    const notes = asc(keyText, form, dir, octave);
    if (!notes.every((p) => music.ledgerLines(clef, p) <= Math.min(maxLedger(c), 2))) continue;
    // in a minor scale the gap is a note whose spelling depends on the form (6th or 7th) half of the time
    const gap = c.rng.chance(0.55) && key.mode === "minor" ? c.rng.pick(dir === "ascending" ? [5, 6] : [1, 2]) : c.rng.int(1, 6);
    const missing = notes[gap]!;
    const { options, diagnoses } = spelledOptions(c, missing, keyText);
    if (options.length < 3) return null;
    const dg: Diagnoses = { ...diagnoses };
    if (key.mode === "minor" && form !== "major") {
      const alt = music.scale(key, form === "harmonic" ? "harmonic" : dir === "ascending" ? "melodic-descending" : "melodic-ascending");
      const degIdx = dir === "ascending" ? gap : notes.length - 1 - gap;
      const other = alt[degIdx];
      if (other && !music.samePitchClassSpelling(other, missing) && options.some((o) => o.id === noteId(other))) dg[noteId(other)] = diag(form === "harmonic" ? "wrong-minor-form" : "melodic-descent-not-restored", form === "harmonic" ? "That would be the melodic minor. The harmonic minor has the 6th from the key signature and only the 7th raised." : dir === "ascending" ? "That is the lowered form. Going up in the melodic minor the 6th and 7th are raised." : "That is the raised form. Coming down in the melodic minor the 6th and 7th return to the key signature.");
    }
    const name = key.mode === "major" ? `scale of ${keyWord(keyText)}` : `${noteLabel(key.tonic)} ${form} minor scale`;
    return {
      prompt: `This is the ${name}, ${dir === "ascending" ? "going up" : "coming down"}. One note is missing and is shown as a rest. Which note belongs in the gap?`,
      music: frag(clef, [{ events: notes.map((p, i) => (i === gap ? r("semibreve") : note(p))) }], `A ${clef}-clef stave with eight semibreves ${dir === "ascending" ? "going up" : "coming down"} a scale of ${keyText}${key.mode === "minor" ? ` (${form} minor)` : ""}, with one note replaced by a rest. The other notes are ${notes.filter((_, i) => i !== gap).map(nameOf).join(", ")}.`, { showKeySignature: false }),
      answer: { kind: "choice", options, correctOptionIds: [noteId(missing)], diagnoses: dg },
      hints: [key.mode === "major" ? "Major scale pattern: tone, tone, semitone, tone, tone, tone, semitone." : form === "harmonic" ? "Harmonic minor: the notes of the key signature with the 7th raised." : "Melodic minor: going up the 6th and 7th are raised; coming down they are not.", "A scale uses each letter name once, in order."],
    };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Unit 5: intervals, terms and melodies
// ---------------------------------------------------------------------------

const QUALITY_WORD: Record<string, string> = { M: "major", m: "minor", P: "perfect" };
const ivWord = (num: number, q: string) => `${QUALITY_WORD[q]} ${ORD(num)}`;

/** Quality of the interval from the tonic to the nth degree (the upper note spelt as in the major scale or in the harmonic / melodic minor form named). */
function qualityOf(tonic: Pitch, upper: Pitch): string {
  return music.intervalBetween(tonic, upper).quality;
}

/** The intervals above the tonic that are in the major scale (and the minor scale, 2nd to 6th via the natural/harmonic forms). */
function intervalPool(key: music.Key, scopeForms: string[]): Array<{ num: number; quality: string; upper: Pitch; tonic: Pitch }> {
  const tonic: Pitch = { ...key.tonic, octave: 4 };
  const out: Array<{ num: number; quality: string; upper: Pitch; tonic: Pitch }> = [];
  const maj = deriveScale(music.formatKey(key), key.mode === "major" ? "major" : "harmonic", "ascending", tonic);
  const nat = key.mode === "minor" ? music.scale(key, "natural") : null;
  for (let num = 2; num <= 8; num++) {
    let upper: Pitch | null = null;
    if (key.mode === "major") upper = maj[num - 1]!;
    else if (num <= 5 || num === 8) upper = num === 8 ? { ...maj[0]!, octave: 5 } : maj[num - 1]!;
    else if (scopeForms.includes("melodic") && scopeForms.includes("harmonic")) upper = null; // 6th and 7th of a minor key depend on the form: never asked without naming it
    if (!upper) continue;
    if (num === 8) upper = { ...tonic, octave: 5 };
    out.push({ num, quality: qualityOf(tonic, upper), upper, tonic });
  }
  void nat;
  return out;
}

/** t.g3.interval-facts: which intervals are perfect, major, minor; how the quality follows the key. */
export const intervalFacts: Gen = (c) => {
  const keys = keysIn(c);
  const mode = c.rng.pick(["perfect-set", "perfect-set", "third", "major-set", "which-quality"] as const);
  if (mode === "perfect-set") {
    const pickN = c.rng.pick([4, 5, 8] as const);
    const ids = ["P4", "P5", "P8", "M2", "M3", "M6"];
    void pickN;
    const right = ["P4", "P5", "P8"];
    const target = c.rng.pick(right);
    const others = c.rng.shuffle(ids.filter((x) => x.startsWith("M"))).slice(0, 3);
    const opts = c.rng.shuffle([target, ...others]);
    const num = (x: string) => Number(x.slice(1));
    return {
      prompt: "Which of these intervals above the tonic can be a perfect interval?",
      answer: { kind: "choice", options: opts.map((x) => ({ id: x, label: cap(`a ${ORD(num(x))}`) })), correctOptionIds: [target], diagnoses: Object.fromEntries(others.map((x) => [x, diag("quality-from-wrong-key", `A ${ORD(num(x))} above the tonic is not perfect: it is a major or a minor interval. Only the 4th, 5th and octave are perfect.`)])) },
      hints: ["The intervals above the tonic that are called perfect are the 4th, the 5th and the octave."],
    };
  }
  if (mode === "major-set") {
    const maj = c.rng.pick([2, 3, 6, 7] as const);
    const opts = [maj, 4, 5, 8].filter((x, i, a) => a.indexOf(x) === i);
    return {
      prompt: `In a major key, what is the quality of the interval from the tonic up to the ${ORD(maj)} degree of the scale?`,
      answer: { kind: "choice", options: [{ id: "major", label: "Major" }, { id: "minor", label: "Minor" }, { id: "perfect", label: "Perfect" }], correctOptionIds: ["major"], diagnoses: { minor: diag("quality-from-wrong-key", `In a major scale the ${ORD(maj)} degree makes a major interval with the tonic. Minor would need the note lowered by a semitone.`), perfect: diag("quality-from-wrong-key", `Only the 4th, 5th and octave are perfect. The ${ORD(maj)} is major in a major key.`) } },
      hints: ["In a major scale the 2nd, 3rd, 6th and 7th degrees make major intervals with the tonic."],
      ...(opts.length ? {} : {}),
    };
  }
  if (mode === "third") {
    const key = music.parseKey(c.rng.pick(keys));
    const q = key.mode === "major" ? "major" : "minor";
    return {
      prompt: `What is the quality of the interval between the tonic and the 3rd degree of ${keyWord(music.formatKey(key))}?`,
      answer: { kind: "choice", options: [{ id: "major", label: "Major" }, { id: "minor", label: "Minor" }, { id: "perfect", label: "Perfect" }], correctOptionIds: [q], diagnoses: { [q === "major" ? "minor" : "major"]: diag("quality-from-wrong-key", q === "major" ? "In a major key the 3rd degree is a major 3rd above the tonic." : "A minor key has a lower 3rd: it is a minor 3rd above the tonic."), perfect: diag("quality-from-wrong-key", "Only the 4th, 5th and octave are perfect. A 3rd is major or minor.") } },
      hints: ["Major keys have a major 3rd above the tonic, minor keys a minor 3rd."],
    };
  }
  // which-quality: semitones to a stated interval
  const pool = [{ n: 2, q: "major", s: 2 }, { n: 3, q: "major", s: 4 }, { n: 3, q: "minor", s: 3 }, { n: 4, q: "perfect", s: 5 }, { n: 5, q: "perfect", s: 7 }, { n: 6, q: "major", s: 9 }, { n: 6, q: "minor", s: 8 }];
  const t = c.rng.pick(pool.filter((x) => x.n <= 6));
  const opts = [...new Set(pool.filter((x) => x.n === t.n).map((x) => `${x.q}`))];
  const ids = [...new Set([...opts, "major", "minor", "perfect"])].slice(0, 3);
  void ids;
  return {
    prompt: `An interval from the tonic is a ${ORD(t.n)} and spans ${t.s} semitones. Is it major, minor or perfect?`,
    answer: { kind: "choice", options: [{ id: "major", label: "Major" }, { id: "minor", label: "Minor" }, { id: "perfect", label: "Perfect" }], correctOptionIds: [t.q], diagnoses: Object.fromEntries(["major", "minor", "perfect"].filter((x) => x !== t.q).map((x) => [x, diag("quality-from-wrong-key", t.q === "perfect" ? "A 4th or 5th of the right size is perfect." : t.q === "major" ? `A ${ORD(t.n)} of ${t.s} semitones is the larger kind, major. The smaller kind has one semitone less.` : `A ${ORD(t.n)} of ${t.s} semitones is the smaller kind, minor. The major ${ORD(t.n)} is one semitone bigger.`)])) },
    hints: ["Perfect: the 4th (5 semitones), 5th (7) and octave (12). A 3rd has 3 (minor) or 4 (major) semitones; a 6th has 8 (minor) or 9 (major)."],
  };
};

/** t.g3.interval-name: name the interval (number and quality) from the tonic up to a note shown on the stave. */
export const intervalName: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const pool = intervalPool(key, c.scope.minorForms ?? []);
  if (!pool.length) return null;
  const clef = c.rng.pick(clefsOf(c));
  const pick = c.rng.pick(pool);
  const oct = c.rng.pick([3, 4]);
  const tonic: Pitch = { ...pick.tonic, octave: oct };
  const upper: Pitch = { ...pick.upper, octave: pick.upper.octave - 4 + oct };
  if (!music.ledgerLines(clef, tonic) && music.ledgerLines(clef, upper) > Math.min(maxLedger(c), 2)) return null;
  if (music.ledgerLines(clef, tonic) > Math.min(maxLedger(c), 2) || music.ledgerLines(clef, upper) > Math.min(maxLedger(c), 2)) return null;
  const rightId = `${pick.quality}${pick.num}`;
  const cands = new Map<string, { label: string; why: string }>();
  const add = (q: string, num: number, why: string) => {
    const id = `${q}${num}`;
    if (id !== rightId && !cands.has(id) && ((num === 4 || num === 5 || num === 8) ? q === "P" : q === "M" || q === "m")) cands.set(id, { label: ivWord(num, q), why });
  };
  const flip = pick.quality === "M" ? "m" : pick.quality === "m" ? "M" : "P";
  if (flip !== "P") add(flip, pick.num, `The number is right, but count the semitones: ${ivWord(pick.num, pick.quality)} is ${pick.quality === "M" ? "the larger" : "the smaller"} ${ORD(pick.num)}.`);
  for (const dn of [-1, 1]) {
    const num = pick.num + dn;
    if (num >= 2 && num <= 8) for (const q of num === 4 || num === 5 || num === 8 ? ["P"] : ["M", "m"]) add(q, num, `Count the letter names from the tonic, counting the tonic as 1: that gives a ${ORD(pick.num)}, not a ${ORD(num)}.`);
  }
  const extras = c.rng.shuffle([2, 3, 4, 5, 6, 7].flatMap((num) => (num === 4 || num === 5 ? ["P"] : ["M", "m"]).map((q) => [q, num] as const)));
  for (const [q, num] of extras) if (cands.size < 5) add(q, num, `That does not match the notes: from ${noteLabel(tonic)} to ${noteLabel(upper)} the letters span ${pick.num} and the quality is ${QUALITY_WORD[pick.quality]}.`);
  const picks = c.rng.shuffle([...cands]).slice(0, 3);
  if (picks.length < 3) return null;
  const bars = [{ events: [note(tonic), note(upper)] }];
  return {
    prompt: `The lower note is the tonic of ${keyWord(keyText)}. Name the interval from the lower note up to the upper note (quality and number).`,
    music: frag(clef, bars, `A ${clef}-clef stave with two notes: the lower note ${noteLabel(tonic)} ${posText(music.staffPosition(clef, tonic))}, then the upper note ${posText(music.staffPosition(clef, upper))}.`, { showKeySignature: false }),
    answer: { kind: "choice", options: c.rng.shuffle([{ id: rightId, label: ivWord(pick.num, pick.quality) }, ...picks.map(([id, x]) => ({ id, label: x.label }))]), correctOptionIds: [rightId], diagnoses: Object.fromEntries(picks.map(([id, x]) => [id, diag(id.slice(1) === String(pick.num) ? "quality-from-wrong-key" : "counted-one-end-only", x.why)])) as Diagnoses },
    hints: ["Count the number first (tonic = 1). Then decide the quality: the 4th, 5th and octave are perfect; the others are major in a major key and the 3rd is minor in a minor key."],
  };
};

type TermT = (typeof music.TERMS)[number];
const G3_NEW = () => music.TERMS.filter((t) => t.firstGrade === 3);
const G3_POOL = () => music.termsUpTo(3);
const CONTEXT3: Record<string, string> = {
  andantino: "a walking piece that moves along a little faster than a gentle stroll (andante)",
  prestissimo: "a breathless finish played as fast as the player possibly can",
  "tempo-primo": "the speed of the opening to return after a slower middle section",
  espressivo: "a passage played with plenty of feeling",
  sostenuto: "long notes that are held on, supported and sustained",
  "con-moto": "a piece that should move forward with energy and movement",
};
/** Never offer a word that could also fit the meaning being tested: speed words never sit beside speed words, nor "similar" terms. */
function termDistractors3(c: Ctx, target: TermT): TermT[] {
  const speedy = (t: TermT) => t.category === "tempo" || t.category === "change-of-speed";
  const pool = G3_POOL().filter((t) => t.meaning !== target.meaning && t.id !== target.id && !target.similar?.includes(t.id) && !t.similar?.includes(target.id) && !(speedy(target) && speedy(t)) && !(target.id === "con-moto" && speedy(t)) && !(target.id === "sostenuto" && (t.id === "legato" || t.id === "tenuto" || t.id === "cantabile")) && !(target.id === "espressivo" && (t.id === "cantabile" || t.id === "dolce")));
  const picks: TermT[] = [];
  for (const t of [...c.rng.shuffle(pool.filter((x) => x.category !== "tempo")), ...c.rng.shuffle(pool)]) {
    if (picks.length === 3) break;
    if (!picks.some((p) => p.meaning === t.meaning || p.id === t.id)) picks.push(t);
  }
  return picks;
}

/** t.g3.term-use: meet each Grade 3 term in words, as a character, or on a short melody. */
export const termUse3: Gen = (c) => {
  const target = c.rng.pick(G3_NEW());
  const picked = c.rng.pick(["to-meaning", "to-term", "character", "in-tune"] as const);
  // "tempo primo" means a return to an earlier speed, so it only makes sense on a melody that has already been in another tempo: never on a two-bar tune
  const mode = picked === "in-tune" && target.id === "tempo-primo" ? "character" : picked;
  const picks = termDistractors3(c, target);
  if (picks.length < 3) return null;
  const optsMeaning = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.meaning }));
  const optsTerm = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.term }));
  const diagFor = (side: "meaning" | "term") => Object.fromEntries(picks.map((p) => [p.id, diag(target.opposite?.includes(p.id) ? "opposite-meaning" : p.category === target.category ? "confused-similar-term" : "wrong-category", side === "meaning" ? `“${p.term}” is a different word: it means “${p.meaning}”.` : `That is “${p.term}”, which means “${p.meaning}”. Look for the term that matches the meaning given.`)]));
  if (mode === "to-meaning") return { prompt: `What does “${target.term}” mean?`, answer: { kind: "choice", options: optsMeaning, correctOptionIds: [target.id], diagnoses: diagFor("meaning") }, hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`] };
  if (mode === "to-term") return { prompt: `Which term or sign means “${target.meaning}”?`, answer: { kind: "choice", options: optsTerm, correctOptionIds: [target.id], diagnoses: diagFor("term") }, hints: [`It is a ${target.category.replace(/-/g, " ")} marking.`] };
  if (mode === "character") return { prompt: `A composer wants ${CONTEXT3[target.id]}. Which marking fits best?`, answer: { kind: "choice", options: optsTerm, correctOptionIds: [target.id], diagnoses: diagFor("term") }, hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`] };
  const m = melodyG3(c, { tempo: target.term });
  if (!m) return null;
  return {
    prompt: `This melody is marked “${target.term}”. What does the marking ask the player to do?`,
    music: m.fragment,
    answer: { kind: "choice", options: optsMeaning, correctOptionIds: [target.id], diagnoses: diagFor("meaning") },
    hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`],
  };
};

/** A short authored-style melody for Grade 3 reading questions: simple or compound time, major or minor key, optional tempo mark. */
function melodyG3(c: Ctx, opts: { tempo?: string; ts?: string; keyText?: string; bars?: number } = {}) {
  const tsPool = (c.scope.timeSignatures ?? []).filter((t) => ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"].includes(t) && topOf(t) <= 9);
  const keys = (c.scope.keys ?? []).filter((k) => k.endsWith("major") || (c.scope.minorForms ?? []).includes("harmonic"));
  if (!tsPool.length || !keys.length) return null;
  const ts = opts.ts ?? c.rng.pick(tsPool);
  const keyText = opts.keyText ?? c.rng.pick(keys);
  const key = music.parseKey(keyText);
  const clef = c.rng.pick(clefsOf(c));
  const s = music.metreStructure(ts);
  const bars = opts.bars ?? 2;
  const compound = s.metre === "compound";
  const beatsN = s.groups.length;
  // per beat: one note, or (compound) a dotted crotchet / crotchet + quaver / three quavers; (simple) a crotchet or two quavers
  const plan: number[][] = Array.from({ length: bars }, () => Array.from({ length: beatsN }, () => c.rng.int(0, 2)));
  const count = (k: number) => (compound ? [1, 2, 3][k]! : [1, 2, 1][k]!);
  const total = plan.flat().reduce((a, k) => a + count(k), 0);
  const sc = music.scale(key, key.mode === "major" ? "major" : "harmonic");
  const tune: Pitch[] = [];
  let degree = c.rng.int(0, 2);
  const tonicOct = clef === "treble" ? 4 : 3;
  for (let i = 0; i < total; i++) {
    degree = Math.max(0, Math.min(7, degree + c.rng.pick([-2, -1, -1, 0, 1, 1, 2])));
    const pc = sc[degree % 7]!;
    tune.push({ step: pc.step, alter: pc.alter, octave: tonicOct + Math.floor(degree / 7) + (music.stepIndex(pc.step) < music.stepIndex(key.tonic.step) ? 1 : 0) });
  }
  if (!tune.every((p) => music.ledgerLines(clef, p) <= 2)) return null;
  let k = 0;
  const measures: Measure[] = plan.map((row, bi) => {
    const events: Ev[] = [];
    row.forEach((kk) => {
      if (compound) {
        if (kk === 0) events.push(note(tune[k++]!, C, { duration: { value: C, dots: 1 } }));
        else if (kk === 1) { events.push(note(tune[k++]!, C)); events.push(note(tune[k++]!, Q)); }
        else for (let i = 0; i < 3; i++) events.push(note(tune[k++]!, Q, beamed(3, i)));
      } else {
        const bv = music.parseTimeSignature(ts).bottom === 4 ? C : "minim";
        if (kk === 1) for (let i = 0; i < 2; i++) events.push(note(tune[k++]!, Q, beamed(2, i)));
        else events.push(note(tune[k++]!, bv));
      }
    });
    return { events, ...(bi === bars - 1 ? { barline: "final" as const } : {}) };
  });
  const sig = music.keySignature(key);
  const sigWord = sig.count === 0 ? "no sharps or flats" : `${sig.count} ${sig.count === 1 ? (sig.type === "sharps" ? "sharp" : "flat") : sig.type}`;
  const describe = (ms: Measure[]) => {
    const one = (e: Ev): string => (e.kind === "rest" ? valueWord(e) : e.kind === "note" ? `${valueWord(e)} ${posText(music.staffPosition(clef, music.parsePitch(e.pitch)))}${(e as { label?: string }).label === "x" ? " (the note marked x)" : ""}` : valueWord(e));
    return `A ${bars}-bar melody in the ${clef} clef, key signature of ${sigWord}, time signature ${ts}. ${ms.map((m, i) => `Bar ${i + 1}: ${(m.events ?? []).map(one).join("; ")}.`).join(" ")}${opts.tempo ? ` The tempo mark above the first bar says “${opts.tempo}”.` : ""}`;
  };
  const fragment = frag(clef, measures, describe(measures), { key: keyText, timeSignature: ts, showKeySignature: true, ...(opts.tempo ? { tempoText: opts.tempo } : {}) });
  return { fragment, tune, measures, describe, ts, keyText, clef, key, compound, plan };
}

/** t.g3.melody-detail: one question about a short melody in simple or compound time (type of time, beats, key, interval to the tonic, term). */
export const melodyDetail3: Gen = (c) => {
  const m = melodyG3(c, {});
  if (!m) return null;
  const { ts, keyText, key } = m;
  const top = topOf(ts);
  const modes = ["time", "beats", "beat-note", "key", "interval", "term"] as const;
  const mode = c.rng.pick(modes);
  if (mode === "time") {
    const right = kind(ts).metre;
    return {
      prompt: "Is this melody in simple time or compound time?",
      music: m.fragment,
      answer: { kind: "choice", options: [{ id: "simple", label: "Simple time" }, { id: "compound", label: "Compound time" }], correctOptionIds: [right], diagnoses: { [right === "simple" ? "compound" : "simple"]: diag("evidence-misread", right === "simple" ? "Look at the time signature: the beat is an undotted note divided into two." : "Look at the time signature and the beams: 6, 9 or 12 on top means dotted-crotchet beats divided into three.") } },
      hints: ["Compare the time signature: 6/8, 9/8 and 12/8 are compound; 2/4, 3/4 and 4/4 are simple."],
    };
  }
  if (mode === "beats") {
    const beats = kind(ts).metre === "compound" ? top / 3 : top;
    const ids = [...new Set([2, 3, 4, top])].sort((a, b) => a - b).map(String);
    return {
      prompt: "How many beats are there in each bar of this melody?",
      music: m.fragment,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(beats)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(beats)).map((x) => [x, diag("evidence-misread", kind(ts).metre === "compound" ? "In compound time the top number counts quavers. Divide it by three to count the dotted-crotchet beats." : "The top number of the time signature says how many beats are in a bar.")])) },
      hints: ["Read the time signature and decide whether it is simple or compound."],
    };
  }
  if (mode === "beat-note") {
    const b = kind(ts).metre === "compound" ? "dotted-crotchet" : music.parseTimeSignature(ts).bottom === 2 ? "minim" : "crotchet";
    const ids = ["minim", "crotchet", "dotted-crotchet", "quaver"];
    const lab: Record<string, string> = { minim: "A minim", crotchet: "A crotchet", "dotted-crotchet": "A dotted crotchet", quaver: "A quaver" };
    return {
      prompt: "Which note is worth one beat in this melody's time signature?",
      music: m.fragment,
      answer: { kind: "choice", options: optsOf(ids, (x) => lab[x]!), correctOptionIds: [b], diagnoses: Object.fromEntries(ids.filter((x) => x !== b).map((x) => [x, diag("evidence-misread", kind(ts).metre === "compound" ? "In 6/8, 9/8 and 12/8 the beat is a dotted crotchet, three quavers." : "The bottom number names the beat in simple time: 2 is a minim and 4 a crotchet.")])) },
      hints: ["Is the time signature simple or compound? That decides the kind of beat."],
    };
  }
  if (mode === "key") {
    const all = (c.scope.keys ?? []).filter((k) => k.endsWith(key.mode));
    if (all.length < 4) return null;
    const options = c.rng.shuffle([keyText, ...c.rng.shuffle(all.filter((k) => k !== keyText)).slice(0, 3)]);
    const sigOf = (k: string) => music.keySignature(music.parseKey(k));
    // two options with the same signature (relative keys) would be ambiguous: only the same mode is offered, so signatures differ
    if (new Set(options.map((k) => `${sigOf(k).type}${sigOf(k).count}`)).size !== options.length) return null;
    return {
      prompt: `The melody is in a ${key.mode} key. Which key is it?`,
      music: m.fragment,
      answer: { kind: "choice", options: options.map((k) => ({ id: k, label: keyWord(k) })), correctOptionIds: [keyText], diagnoses: Object.fromEntries(options.filter((k) => k !== keyText).map((k) => [k, diag("evidence-misread", `${keyWord(k)} has ${sigOf(k).count} ${sigOf(k).type}, which does not match the key signature on the stave.`)])) },
      hints: ["Count the sharps or flats in the key signature, then choose the key with that many."],
    };
  }
  if (mode === "interval") {
    const tune = m.tune;
    const cand = tune.map((p, i) => ({ p, i })).filter(({ p }) => {
      const ton: Pitch = { ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
      const num = music.diatonicNumber(p) - music.diatonicNumber(ton) + 1;
      return num >= 3 && num <= 5 && (key.mode === "major" || num <= 5);
    });
    if (!cand.length) return null;
    const { p: x, i: idx } = c.rng.pick(cand);
    const ton: Pitch = { ...key.tonic, octave: x.octave - (music.stepIndex(x.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
    const iv = music.intervalBetween(ton, x);
    if (!["M", "m", "P"].includes(iv.quality) || iv.number < 3 || iv.number > 5) return null;
    const rightId = `${iv.quality}${iv.number}`;
    const labelled = m.fragment.measures.map((ms) => ({ ...ms, events: (ms.events ?? []).map((e) => ({ ...e })) }));
    let count = 0;
    labelled.forEach((ms) => (ms.events as Ev[]).forEach((e) => { if (e.kind === "note") { if (count === idx) (e as { label?: string }).label = "x"; count++; } }));
    const options = ["M3", "m3", "P4", "P5"];
    if (!options.includes(rightId)) return null;
    return {
      prompt: `The melody is in ${keyWord(keyText)}. What is the interval from the tonic (the nearest tonic below the note) up to the note marked x? Give quality and number.`,
      music: { ...m.fragment, measures: labelled, textAlternative: m.describe(labelled as Measure[]) },
      answer: { kind: "choice", options: options.map((id) => ({ id, label: ivWord(Number(id.slice(1)), id[0]!) })), correctOptionIds: [rightId], diagnoses: Object.fromEntries(options.filter((x2) => x2 !== rightId).map((x2) => [x2, diag("evidence-misread", x2.slice(1) === rightId.slice(1) ? `The number is right, but the quality is not: in ${keyWord(keyText)} the interval from the tonic is ${ivWord(iv.number, iv.quality)}.` : "Count the tonic as 1 when you count up to the marked note.")])) },
      hints: ["Count the number first (tonic = 1), then decide: the 4th and 5th are perfect, the 3rd is major in a major key and minor in a minor key."],
    };
  }
  const target = c.rng.pick(G3_NEW().filter((t) => t.category === "tempo" || t.category === "expression"));
  const picks = termDistractors3(c, target);
  if (picks.length < 3) return null;
  const mt = melodyG3(c, { tempo: target.term });
  if (!mt) return null;
  return {
    prompt: `The melody is marked “${target.term}”. Which description of the way to play it is right?`,
    music: mt.fragment,
    answer: { kind: "choice", options: c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.meaning })), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((p) => [p.id, diag("evidence-misread", `“${p.term}” means “${p.meaning}”, which is a different marking.`)])) },
    hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`],
  };
};

/** The generator behind each new Grade 3 template. key-facts, degree-note and triad-notes reuse the Grade 2 generators, which read the keys and minor forms of the scope. */
export const GRADE3_GENERATORS: Record<string, Gen> = {
  "t.g3.compound-facts": compoundFacts,
  "t.g3.compound-judge": compoundJudge,
  "t.g3.compound-rest-judge": compoundRestJudge,
  "t.g3.triplet-compare": tripletCompare,
  "t.g3.triplet-bar": tripletBar,
  "t.g3.demisemi-facts": demisemiFacts,
  "t.g3.demisemi-judge": demisemiJudge,
  "t.g3.demisemi-regroup": demisemiRegroup,
  "t.g3.compound-rest-write": compoundRestWrite,
  "t.g3.ledger-place": ledgerPlace3,
  "t.g3.ledger-count": ledgerCount,
  "t.g3.octave-sign": octaveSign,
  "t.g3.octave-sound": octaveSound,
  "t.g3.octave-pick": octavePick,
  "t.g3.minor-forms": minorForms,
  "t.g3.scale-gap": scaleGap3,
  "t.g3.key-facts": keyFacts,
  "t.g3.degree-note": degreeNote,
  "t.g3.triad-notes": triadNotes,
  "t.g3.interval-facts": intervalFacts,
  "t.g3.interval-name": intervalName,
  "t.g3.term-use": termUse3,
  "t.g3.melody-detail": melodyDetail3,
};
export { fix, pretty };
