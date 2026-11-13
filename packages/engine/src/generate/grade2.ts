/**
 * Grade 2 generators added in Brief 06 (one per new template; see content/exercises/templates/grade-2-extra.json).
 *
 * The sixteen Brief 01 templates only offered one way of asking each idea (and some only a handful of distinct
 * questions), so a concept could not reach "proficient" or "mastered" under Brief 04's unchanged thresholds. These
 * generators add genuinely different ways of showing the same understanding (judging a bar, counting a triplet, comparing
 * two clefs, finding a missing note in a minor scale, meeting a new term in a short tune ...). Every answer comes from
 * the Brief 03 music rules, never from a typed table per item, and a wrong option carries a `diagnosis` naming the
 * misconception it matches. Existing templates and generators are untouched, so stored question ids stay valid.
 *
 * Scope discipline: a generator only uses what `c.scope` allows (time signatures, keys, note values, ledger lines,
 * rests, triplets). The engine's own gates (checkItem, solvability) run on every draft in addition.
 */
import { deriveScale, music, type Measure, type NotationEvent } from "@mtp/curriculum";
import { GENERATORS, frag, maxLedger, melodyIn, n, nameOf, note, pretty, r, rhythmLine, valueWord, type Gen } from "./families.ts";
import { barJudge as barJudgeG1, codes, geom, keyWord, keysIn, noteId, noteLabel, spelledOptions, type Diagnoses } from "./grade1.ts";

type Pitch = music.Pitch;
type Clef = music.Clef;
type Ctx = Parameters<Gen>[0];
const ORD = (x: number) => music.ordinal(x);
const BEAT_NAME: Record<number, string> = { 1: "semibreve", 2: "minim", 4: "crotchet", 8: "quaver", 16: "semiquaver" };
const BEAMABLE = new Set(["quaver", "semiquaver"]);
const withA = (v: string, dots = 0) => `a ${dots ? "dotted " : ""}${v}`;
const diag = (category: string, reason: string) => ({ category, reason });
const optsOf = (ids: string[], label: (id: string) => string = (x) => x) => ids.map((id) => ({ id, label: label(id) }));
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const formOf = (k: music.Key): "major" | "harmonic" => (k.mode === "major" ? "major" : "harmonic");
const clefsOf = (c: Ctx): Clef[] => (c.scope.clefs?.length ? c.scope.clefs : ["treble"]) as Clef[];

/** The note value that is one beat of a simple time signature (minim in x/2, crotchet in x/4, quaver in x/8). */
function beatValue(ts: string): music.NoteValue {
  const v = music.valueFor(music.metreStructure(ts).beatUnit, 0);
  if (!v) throw new Error(`no beat value for ${ts}`);
  return v.value;
}
const times = (v: music.NoteValue, k: number, dots = 1) => music.valueFor(music.mul(music.dotted(v, 0), music.frac(k)), dots);
const halfOf = (v: music.NoteValue): music.NoteValue | null => music.valueFor(music.mul(music.dotted(v, 0), music.frac(1, 2)), 0)?.value ?? null;
const valueOk = (c: Ctx, v: music.NoteValue | null | undefined): v is music.NoteValue => Boolean(v) && (!c.scope.noteValues?.length || c.scope.noteValues.includes(v!));
const beamFlag = (v: string, len: number, i: number) => (BEAMABLE.has(v) && len > 1 ? { beam: i === 0 ? "begin" : i === len - 1 ? "end" : "continue" } : {});
/** One beat written as a single note, or as two notes of half the value (beamed when they have flags). */
function beatFill(c: Ctx, ts: string, split: boolean): NotationEvent[] {
  const b = beatValue(ts);
  const h = halfOf(b);
  if (split && valueOk(c, h)) return [0, 1].map((i) => n(h, 0, beamFlag(h, 2, i)));
  return [n(b)];
}
const simpleTs = (c: Ctx, minBeats = 2) => (c.scope.timeSignatures ?? []).filter((t) => music.classifyTimeSignature(t).metre === "simple" && music.metreStructure(t).groups.length >= minBeats);

// ---------------------------------------------------------------------------
// Unit 1: new simple times and triplets
// ---------------------------------------------------------------------------

/** t.g2.beat-facts: beats per bar, the note that is the beat, duple/triple/quadruple, the single note that fills a bar. */
export const beatFacts: Gen = (c) => {
  const pool = c.scope.timeSignatures?.length ? c.scope.timeSignatures : ["2/2", "3/2", "4/2", "3/8"];
  const ts = c.rng.pick(pool);
  const { top, bottom } = music.parseTimeSignature(ts);
  const unit = BEAT_NAME[bottom]!;
  const cls = music.classifyTimeSignature(ts).beats;
  const mode = c.rng.pick(["beats", "beat-note", "classify", "classify", "fills", "which-ts"] as const);
  if (mode === "beats") {
    const ids = ["2", "3", "4"];
    return {
      prompt: `How many beats are there in each bar of ${ts}?`,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(top)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(top)).map((x) => [x, diag("beat-count-wrong", Number(x) === bottom ? `That is the bottom number. The top number says how many beats are in a bar; in ${ts} that is ${top}.` : `Look at the top number of ${ts}: it tells you how many beats are in each bar.`)])) },
      hints: ["The top number of a time signature says how many beats are in a bar."],
    };
  }
  if (mode === "beat-note") {
    const ids = ["semibreve", "minim", "crotchet", "quaver"];
    const byTop = BEAT_NAME[top];
    return {
      prompt: `In ${ts}, which note is worth one beat?`,
      answer: { kind: "choice", options: optsOf(ids, (x) => withA(x)), correctOptionIds: [unit], diagnoses: Object.fromEntries(ids.filter((x) => x !== unit).map((x) => [x, diag("beat-unit-wrong", x === byTop ? "The top number counts the beats; it does not name the note. The bottom number does: 2 means minim beats, 4 crotchet beats and 8 quaver beats." : `Check the bottom number of ${ts}: 2 means minim beats, 4 means crotchet beats and 8 means quaver beats.`)])) },
      hints: ["The bottom number tells you which note is the beat: 2 = minim, 4 = crotchet, 8 = quaver."],
    };
  }
  if (mode === "classify") {
    const ids = ["duple", "triple", "quadruple"];
    const need = (x: string) => ({ duple: 2, triple: 3, quadruple: 4 })[x]!;
    return {
      prompt: `Is ${ts} duple, triple or quadruple time?`,
      answer: { kind: "choice", options: optsOf(ids, cap), correctOptionIds: [cls], diagnoses: Object.fromEntries(ids.filter((x) => x !== cls).map((x) => [x, diag("beat-count-wrong", `${cap(x)} time has ${need(x)} beats in a bar. ${ts} has ${top}, so it is ${cls}.`)])) },
      hints: ["Duple means two beats in a bar, triple means three and quadruple means four. Count the beats from the top number."],
    };
  }
  const LISTED = ["semibreve", "minim", "crotchet", "quaver"];
  if (mode === "fills") {
    const v = music.valueFor(music.barCapacity(music.parseTimeSignature(ts)), 1);
    if (!v || !LISTED.includes(v.value)) return null;
    const answer = `${v.value}${v.dots ? "." : ""}`;
    const cands = new Map<string, { label: string; why: string }>();
    for (const t of [...pool.filter((x) => x !== ts), "2/4", "3/4", "4/4"]) {
      const cv = music.valueFor(music.barCapacity(music.parseTimeSignature(t)), 1);
      if (!cv || !LISTED.includes(cv.value)) continue;
      const id = `${cv.value}${cv.dots ? "." : ""}`;
      if (id !== answer && !cands.has(id)) cands.set(id, { label: withA(cv.value, cv.dots), why: `That fills a whole bar of ${t}, not ${ts}. A bar of ${ts} holds ${top} ${unit} beats.` });
    }
    const one = beatValue(ts);
    if (one !== answer && !cands.has(one)) cands.set(one, { label: withA(one), why: `That is only one beat. A bar of ${ts} holds ${top} ${unit} beats.` });
    const picks = c.rng.shuffle([...cands]).slice(0, 3);
    if (picks.length < 3) return null;
    return {
      prompt: `Which single note lasts exactly as long as one whole bar of ${ts}?`,
      answer: { kind: "choice", options: c.rng.shuffle([{ id: answer, label: withA(v.value, v.dots) }, ...picks.map(([id, x]) => ({ id, label: x.label }))]), correctOptionIds: [answer], diagnoses: Object.fromEntries(picks.map(([id, x]) => [id, diag("beat-count-wrong", x.why)])) },
      hints: [`A bar of ${ts} is ${top} ${unit} beats. Which single note has that length?`],
    };
  }
  const all = [...new Set([...pool, "2/2", "3/2", "4/2", "3/8", "2/4", "3/4", "4/4"])];
  const others = all.filter((t) => { const p = music.parseTimeSignature(t); return !(p.top === top && p.bottom === bottom); });
  const picks = c.rng.shuffle(others).slice(0, 3);
  if (picks.length < 3) return null;
  const why = (t: string) => {
    const p = music.parseTimeSignature(t);
    return p.top === top ? `${t} has ${top} beats, but they are ${BEAT_NAME[p.bottom]} beats (the bottom number is ${p.bottom}).` : p.bottom === bottom ? `${t} has the right kind of beat but ${p.top} of them in a bar.` : `${t} has ${p.top} ${BEAT_NAME[p.bottom]} beats in a bar.`;
  };
  return {
    prompt: `Which time signature has ${top} ${unit} beats in each bar?`,
    answer: { kind: "choice", options: c.rng.shuffle([ts, ...picks]).map((t) => ({ id: t, label: t })), correctOptionIds: [ts], diagnoses: Object.fromEntries(picks.map((t) => [t, diag(music.parseTimeSignature(t).top === top ? "beat-unit-wrong" : "beat-count-wrong", why(t))])) },
    hints: ["The top number counts the beats; the bottom number names the note that is the beat."],
  };
};

const TRIPLET_UNITS = ["crotchet", "quaver", "semiquaver"] as const;
const lengthText = (beats: number, beat: string) => (beats === 1 ? `one ${beat} beat` : beats === 0.5 ? `half a ${beat} beat` : beats === 1.5 ? `one and a half ${beat} beats` : `${beats} ${beat} beats`);

/** t.g2.triplet-facts: what a triplet is worth, how many notes, which number, how it compares with ordinary notes. */
export const tripletFacts: Gen = (c) => {
  const units = TRIPLET_UNITS.filter((u) => valueOk(c, u));
  if (!units.length) return null;
  const mode = c.rng.pick(["equal", "equal", "count", "number", "compare", "bar-count"] as const);
  const u = c.rng.pick(units);
  if (mode === "equal") {
    const two = times(u, 2, 0)!.value;
    const three = times(u, 3, 1)!;
    const four = times(u, 4, 0)?.value;
    const items = new Map<string, { label: string; d: ReturnType<typeof diag> | null }>([
      [two, { label: withA(two), d: null }],
      [u, { label: withA(u), d: diag("tuplet-total-wrong", `That is the length of just one of the notes. A triplet fits three ${u}s into the time of two, so the whole group lasts as long as ${withA(two)}.`) }],
      [`${three.value}.`, { label: withA(three.value, three.dots), d: diag("tuplet-total-wrong", `Three ordinary ${u}s would last that long. A triplet squeezes the three into the time of two ${u}s, so it is shorter.`) }],
    ]);
    if (four && !items.has(four)) items.set(four, { label: withA(four), d: diag("tuplet-total-wrong", `That is the length of four ${u}s. A triplet group is the time of two ${u}s.`) });
    const ids = [...items.keys()];
    return {
      prompt: `Three ${u}s are played as a triplet. Together they last as long as which single note?`,
      answer: { kind: "choice", options: c.rng.shuffle(ids.map((id) => ({ id, label: items.get(id)!.label }))), correctOptionIds: [two], diagnoses: Object.fromEntries(ids.filter((id) => id !== two).map((id) => [id, items.get(id)!.d!])) },
      hints: ["A triplet puts three notes into the time that two of the same notes would normally take."],
    };
  }
  if (mode === "count") {
    return {
      prompt: "How many notes are in a triplet group?",
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: ["3"], diagnoses: { "2": diag("tuplet-number-wrong", "Two is how many notes the group takes the time of. The group itself has three notes."), "4": diag("tuplet-number-wrong", "A triplet has three notes, not four."), "6": diag("tuplet-number-wrong", "Six notes is two triplets. One triplet group has three notes.") } },
      hints: ["The word triplet comes from three."],
    };
  }
  if (mode === "number") {
    return {
      prompt: "Which number is written above (or below) the notes of a triplet?",
      answer: { kind: "choice", options: optsOf(["2", "3", "4", "6"]), correctOptionIds: ["3"], diagnoses: { "2": diag("tuplet-number-wrong", "The number counts the notes in the group, and a triplet has three."), "4": diag("tuplet-number-wrong", "That is not the number of notes in a triplet."), "6": diag("tuplet-number-wrong", "The sign for a triplet is 3: one number for the three notes together.") } },
      hints: ["The number tells you how many notes are squeezed into the group."],
    };
  }
  if (mode === "compare") {
    return {
      prompt: `Which lasts longer: three ordinary ${u}s, or a triplet of three ${u}s?`,
      answer: { kind: "choice", options: [{ id: "ordinary", label: `Three ordinary ${u}s` }, { id: "triplet", label: `The triplet of three ${u}s` }, { id: "same", label: "They last the same time" }], correctOptionIds: ["ordinary"], diagnoses: { triplet: diag("tuplet-total-wrong", `The triplet squeezes its three notes into the time of two ${u}s, so it is the shorter one.`), same: diag("tuplet-total-wrong", `The triplet is played faster: three notes in the time of two. So it is not the same as three ordinary ${u}s.`) } },
      hints: ["A triplet fits three notes into the time of two."],
    };
  }
  const pool = simpleTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = music.parseTimeSignature(ts).top;
  const bv = beatValue(ts);
  const h = halfOf(bv);
  if (!h || !valueOk(c, h)) return null;
  const right = beats * 3;
  const ids = [...new Set([beats * 2, right, beats * 4, beats * 3 - 1].filter((x) => x > 0))].sort((a, b) => a - b).map(String);
  return {
    prompt: `In ${ts}, every beat is filled by a triplet of ${h}s. How many ${h}s are played in one bar?`,
    answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(right)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(right)).map((x) => [x, diag("tuplet-total-wrong", Number(x) === beats * 2 ? `That counts two ${h}s a beat, which is how many ordinary ${h}s fit in a ${bv}. A triplet has three in each beat.` : `Each beat holds one triplet of three ${h}s, and there are ${beats} beats in a bar of ${ts}.`)])) },
    hints: [`${ts} has ${beats} ${bv} beats. A triplet of ${h}s fills one ${bv} beat.`],
  };
};


/**
 * Screen-reader descriptions that CLOSE a triplet group ("a triplet (minim rest, crotchet), then minim"), so a listener can tell where the
 * group ends. (The shared description lists the group's notes together with the notes after it.)
 */
const word = (e: NotationEvent): string => (e.kind === "tuplet" ? `a triplet (${e.events.map(word).join(", ")})` : valueWord(e));
const describeBars = (ms: Measure[]) => ms.map((m, i) => `Bar ${i + 1}: ${(m.events ?? []).map(word).join(", ")}.`).join(" ");
const describeBeamed = (ms: Measure[]) =>
  ms
    .map((m, i) => {
      const parts: string[] = [];
      let group: string[] | null = null;
      for (const e of m.events ?? []) {
        const beam = e.kind === "tuplet" ? undefined : (e as { beam?: string }).beam;
        if (beam === "begin") group = [word(e)];
        else if (group && (beam === "continue" || beam === "end")) {
          group.push(word(e));
          if (beam === "end") { parts.push(`${group.length} beamed together (${group.join(", ")})`); group = null; }
        } else parts.push(word(e));
      }
      return `Bar ${i + 1}: ${parts.join(", ")}.`;
    })
    .join(" ");
/** A rhythm line whose descriptions close each triplet group. */
const rl = (measures: Measure[], extra: Parameters<typeof rhythmLine>[1] = {}) => ({ ...rhythmLine(measures, extra), textAlternative: describeBars(measures), questionAlternative: describeBeamed(measures) });

/** A tuplet event (3 in the time of 2) from [units, isRest] parts; one unit is `unit`. Adjacent notes with flags are beamed. */
function tripletGroup(unit: music.NoteValue, parts: Array<[number, boolean]>): NotationEvent | null {
  const members = parts.map(([u, isRest]) => {
    const v = times(unit, u, 0);
    return v ? { v: v.value, isRest } : null;
  });
  if (members.some((m) => !m)) return null;
  const evs = members.map((m) => (m!.isRest ? r(m!.v) : n(m!.v))) as NotationEvent[];
  const ok = (k: number) => evs[k]!.kind === "note" && BEAMABLE.has((evs[k] as { duration: { value: string } }).duration.value);
  let i = 0;
  while (i < evs.length) {
    if (ok(i)) {
      let j = i;
      while (j + 1 < evs.length && ok(j + 1)) j++;
      if (j > i) for (let k = i; k <= j; k++) (evs[k] as { beam?: string }).beam = k === i ? "begin" : k === j ? "end" : "continue";
      i = j + 1;
    } else i++;
  }
  return { kind: "tuplet", actual: 3, normal: 2, events: evs } as NotationEvent;
}

/** A simple-time bar in which one beat is a triplet group. */
function barWithTriplet(c: Ctx, ts: string, parts: Array<[number, boolean]>) {
  const s = music.metreStructure(ts);
  if (s.metre !== "simple") return null;
  const bv = beatValue(ts);
  const unit = halfOf(bv);
  if (!unit || !valueOk(c, unit) || !valueOk(c, bv)) return null;
  const group = tripletGroup(unit, parts);
  if (!group) return null;
  const pos = c.rng.int(0, s.groups.length - 1);
  return { events: s.groups.map((_, i) => (i === pos ? group : n(bv))), pos, beat: bv, unit };
}

/** t.g2.triplet-read: read a bar that contains a triplet. */
export const tripletRead: Gen = (c) => {
  const pool = simpleTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const bar = barWithTriplet(c, ts, [[1, false], [1, false], [1, false]]);
  if (!bar) return null;
  const beats = music.parseTimeSignature(ts).top;
  const fragment = rl([{ events: bar.events, barline: "final" }], { timeSignature: ts });
  const mode = c.rng.pick(["single", "single", "played", "which-beat"] as const);
  if (mode === "single") {
    const dotted = times(bar.unit, 3, 1)!;
    const ids = [bar.beat, bar.unit, `${dotted.value}.`];
    const label = (id: string) => (id.endsWith(".") ? withA(id.slice(0, -1), 1) : withA(id));
    return {
      prompt: "The three notes joined by the bracket marked 3 are a triplet. Which single note lasts as long as the whole group?",
      music: fragment,
      answer: { kind: "choice", options: c.rng.shuffle(optsOf(ids, label)), correctOptionIds: [bar.beat], diagnoses: { [bar.unit]: diag("tuplet-total-wrong", `That is the length of one note of the group. All three together fill one beat, which is ${withA(bar.beat)}.`), [`${dotted.value}.`]: diag("tuplet-total-wrong", `Three ordinary ${bar.unit}s would last that long. The triplet squeezes them into one beat.`) } },
      hints: ["The triplet group takes the place of one ordinary beat."],
    };
  }
  if (mode === "played") {
    const total = beats - 1 + 3;
    const ids = [...new Set([beats, beats + 1, total, total + 1])].sort((a, b) => a - b).map(String);
    return {
      prompt: "How many notes are played in this bar altogether? Count every note, including each note of the triplet.",
      music: fragment,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(total)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(total)).map((x) => [x, diag("tuplet-number-wrong", Number(x) === beats ? "That counts the triplet group as one note. It has three notes." : "Count the single notes, then add the three notes of the triplet.")])) },
      hints: ["Count the notes outside the triplet, then add three for the triplet group."],
    };
  }
  const place = bar.pos + 1;
  const ids = Array.from({ length: beats }, (_, i) => String(i + 1));
  return {
    prompt: "On which beat of the bar does the triplet start?",
    music: fragment,
    answer: { kind: "choice", options: optsOf(ids, (x) => `Beat ${x}`), correctOptionIds: [String(place)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(place)).map((x) => [x, diag("tuplet-number-wrong", `Each beat is one ${bar.beat}, and the triplet group fills one whole beat. Count the single notes before it to find its beat.`)])) },
    hints: ["The triplet fills exactly one beat, so count the notes before it."],
  };
};

const MIXED_PATTERNS: Array<{ parts: Array<[number, boolean]>; equal: boolean }> = [
  { parts: [[1, false], [1, false], [1, true]], equal: true },
  { parts: [[1, true], [1, false], [1, false]], equal: true },
  { parts: [[1, false], [1, true], [1, false]], equal: true },
  { parts: [[2, false], [1, false]], equal: false },
  { parts: [[1, false], [2, false]], equal: false },
  { parts: [[2, true], [1, false]], equal: false },
  { parts: [[1, false], [2, true]], equal: false },
  { parts: [[1, true], [2, false]], equal: false },
];

/** t.g2.triplet-mixed: triplet groups that contain rests or unequal notes. */
export const tripletMixed: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = simpleTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const mode = c.rng.pick(["notes", "total", "silent"] as const);
  const patterns = MIXED_PATTERNS.filter((p) => (mode === "silent" ? p.equal && p.parts.some(([, x]) => x) : mode === "notes" ? p.parts.some(([, x]) => x) : true));
  const pat = c.rng.pick(patterns);
  const bar = barWithTriplet(c, ts, pat.parts);
  if (!bar) return null;
  const fragment = rl([{ events: bar.events, barline: "final" }], { timeSignature: ts });
  if (mode === "notes") {
    const sounded = pat.parts.filter(([, x]) => !x).length;
    const ids = ["1", "2", "3"];
    return {
      prompt: "How many notes are actually played in the triplet group? A rest is silence, so do not count it.",
      music: fragment,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(sounded)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(sounded)).map((x) => [x, diag("tuplet-number-wrong", Number(x) > sounded ? "That counts a rest as a note. Only the notes are played; the rest is a silence." : "Count only the notes in the bracket: the rests are silences, but every note sounds.")])) },
      hints: ["Look inside the bracket and count the notes. Skip the rests."],
    };
  }
  if (mode === "total") {
    const lab: Record<string, string> = { half: lengthText(0.5, bar.beat), one: lengthText(1, bar.beat), "one-half": lengthText(1.5, bar.beat), two: lengthText(2, bar.beat) };
    return {
      prompt: "The whole triplet group (notes and rests together) is played in the time of how long?",
      music: fragment,
      answer: { kind: "choice", options: optsOf(["half", "one", "one-half", "two"], (x) => lab[x]!), correctOptionIds: ["one"], diagnoses: { "one-half": diag("tuplet-total-wrong", `The written values add up to ${lab["one-half"]}, but a triplet is played in the time of two of its units, which is one beat. The 3 sign tells you to squeeze the group.`), half: diag("tuplet-total-wrong", "A triplet fills one whole beat, not half a beat."), two: diag("tuplet-total-wrong", "A triplet fills one beat. Check which note is the beat in this time signature.") } },
      hints: ["A triplet group takes the time of two of its units, which is the length of one beat."],
    };
  }
  const idx = pat.parts.findIndex(([, x]) => x);
  const ids = ["0", "1", "2"];
  const lab = ["The first of the three parts", "The second of the three parts", "The third of the three parts"];
  return {
    prompt: "A triplet is divided into three equal parts. Which part of this triplet is silent?",
    music: fragment,
    answer: { kind: "choice", options: optsOf(ids, (x) => lab[Number(x)]!), correctOptionIds: [String(idx)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(idx)).map((x) => [x, diag("tuplet-number-wrong", "That part is a note. Look for the rest sign inside the bracket and count which place it takes.")])) },
    hints: ["Find the rest inside the bracket and count which place it takes."],
  };
};

/** t.g2.triplet-fill: three groups marked 3; which one is complete (adds up to three units)? */
export const tripletFill: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = simpleTs(c);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const unit = halfOf(beatValue(ts));
  if (!unit || !valueOk(c, unit)) return null;
  const make = (total: number) => {
    const out: Array<[number, boolean]> = [];
    let left = total;
    while (left > 0) {
      const u = left >= 2 && c.rng.chance(0.4) ? 2 : 1;
      out.push([u, c.rng.chance(0.35)]);
      left -= u;
    }
    if (out.every(([, x]) => x)) out[0]![1] = false;
    return out;
  };
  const sets = c.rng.shuffle([3, 2, 4]).map((total) => ({ parts: make(total), total }));
  const groups = sets.map((s) => tripletGroup(unit, s.parts));
  if (groups.some((g) => !g)) return null;
  const answerIdx = sets.findIndex((s) => s.total === 3);
  const measures: Measure[] = groups.map((g, i) => ({ events: [g!], ...(i === groups.length - 1 ? { barline: "final" as const } : {}) }));
  return {
    prompt: `Each group is marked 3, so it must add up to three ${unit}s of written length (notes and rests together). Which group is complete?`,
    music: rl(measures),
    answer: { kind: "choice", options: sets.map((_, i) => ({ id: String(i + 1), label: `Group ${i + 1}` })), correctOptionIds: [String(answerIdx + 1)], diagnoses: Object.fromEntries(sets.map((s, i) => [String(i + 1), i === answerIdx ? null : diag("tuplet-total-wrong", s.total < 3 ? `Group ${i + 1} adds up to only ${s.total} ${unit}s' worth, so it is missing something.` : `Group ${i + 1} adds up to ${s.total} ${unit}s' worth, which is too much for a triplet.`)]).filter(([, v]) => v)) },
    hints: [`Add up the written lengths in each group. A ${unit} counts as 1; a note or rest twice as long counts as 2.`],
  };
};

// ---------------------------------------------------------------------------
// Unit 2: neat rhythms, rests, ledger lines
// ---------------------------------------------------------------------------


/**
 * t.g2.time-sig-read: "add the time signature". Replaces the Brief 01 template `t.g2.time-signature` for lessons and blueprints. Its generator
 * decides a rhythm that fits two time signatures of the same bar length (four crotchets are 4/4 or 2/2) by the NOTES alone, ignoring a
 * beaming preference, and then accepts BOTH, as the lesson teaches. The shipped generator treated 4/4 as the only answer.
 */
export const timeSigRead: Gen = (c) => {
  const d = GENERATORS["fam.time-signature"]?.(c.template)?.(c);
  if (!d || !d.music) return null;
  const ts = (d.answer as { accepted: string[] }).accepted[0]!;
  const bars = d.music.measures.map((m) => (m.events ?? []) as unknown as music.REvent[]);
  const cap = music.barCapacity(music.parseTimeSignature(ts));
  const rivals = (c.scope.timeSignatures ?? []).filter((t) => t !== ts && music.equals(music.barCapacity(music.parseTimeSignature(t)), cap) && bars.every((b) => music.checkBarAnyPattern(b, t, { requireBeams: false }).issues.length === 0));
  return {
    ...d,
    prompt: rivals.length ? "Add a time signature that fits this rhythm. More than one may fit; give any one of them." : "Add the time signature to this rhythm.",
    answer: { kind: "time-signature", accepted: [ts, ...rivals] },
    hints: ["Add up each bar, then look at how the notes are grouped into beats."],
  };
};

const stripBeams = (ms: Measure[]): Measure[] => ms.map((m) => ({ ...m, events: (m.events ?? []).map((e) => { if (e.kind === "tuplet") return e; const { beam: _b, ...rest } = e as NotationEvent & { beam?: string }; return rest as NotationEvent; }) }));
/**
 * t.g2.bar-judge: Grade 1's bar judge, with one change. In its "right number of beats" mode the wrong bars lose their beams, so the one beamed
 * bar was the answer (389 of 461 such questions). Here all three bars are shown unbeamed, so only the beat count can decide.
 */
export const barJudge: Gen = (c) => {
  const d = barJudgeG1(c);
  if (!d || !d.music || !d.prompt.includes("exactly the right number of beats")) return d;
  const measures = stripBeams(d.music.measures);
  return { ...d, music: rhythmLine(measures) };
};

/** t.g2.ledger-place: write a named note on a ledger line (or in a space beyond one). The position is stated, so a note inside the stave is never right. */
export const ledgerPlace: Gen = (c) => {
  const clefs = clefsOf(c);
  if (maxLedger(c) < 2) return null;
  const clef = c.rng.pick(clefs);
  const pos = c.rng.pick([-5, -4, -3, -2, 10, 11, 12, 13]);
  const p = music.naturalAt(clef, pos);
  if (music.ledgerLines(clef, p) < 1 || music.ledgerLines(clef, p) > 2) return null;
  const answer = { kind: "staff-position" as const, clef, target: { step: p.step, alter: 0, position: "any" as const, maxLedgerLines: 2, octave: p.octave }, accepted: [music.formatPitch(p)], octaveSensitive: true };
  return {
    prompt: `In the ${clef} clef, write the note ${p.step} that sits ${posText(pos)}.`,
    answer,
    hints: [`In the ${clef} clef the bottom line is ${nameOf(music.naturalAt(clef, 0))}. Count up or down one letter for each line and space, including the spaces between ledger lines.`],
  };
};

const RESTISH = new Set(["rest-across-beat", "rests-not-combined", "half-bar-rest-misplaced"]);

/**
 * t.g2.rest-judge: three bars, one answer, decided by a rest rule and never by counting. Three kinds, told apart by the prompt wording:
 * "silent beats" (each silent beat gets its own rest: which bar writes its rests correctly?), "half of the bar" (a two-beat rest may only
 * fill a half of a four-beat bar: which bar breaks that rule?) and "halfway through one beat" (a rest must not run across a beat line).
 */
export const restJudge: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = simpleTs(c, 2);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = music.metreStructure(ts).groups.length;
  const bv = beatValue(ts);
  const two = times(bv, 2, 0)?.value;
  const half = halfOf(bv);
  const modes: Array<"beats" | "half" | "part"> = [];
  if (beats >= 3 && two && valueOk(c, two)) modes.push("beats");
  if (beats === 4 && two && valueOk(c, two) && ts.endsWith("/4")) modes.push("half");
  if (valueOk(c, half)) modes.push("part");
  if (!modes.length || !valueOk(c, bv)) return null;
  const mode = c.rng.pick(modes);
  const seed = Array.from({ length: beats }, () => beatFill(c, ts, c.rng.chance(0.35)));
  /** A bar from beat slots: `over[b]` replaces the filler of beat b (and swallows `span` beats). */
  const bar = (over: Record<number, { span: number; ev: NotationEvent[] }> = {}) => {
    const out: NotationEvent[] = [];
    for (let b = 0; b < beats; b++) {
      const o = over[b];
      if (o) { out.push(...o.ev); b += o.span - 1; } else out.push(...seed[b]!);
    }
    return out;
  };
  const issues = (ev: NotationEvent[]) => codes(ev, ts, { requireBeams: false });
  const restish = (ev: NotationEvent[]) => { const cs = issues(ev); return cs.some((x) => RESTISH.has(x)) && !cs.some((x) => x === "bar-underfull" || x === "bar-overfull"); };
  const clean = (ev: NotationEvent[]) => codes(ev, ts).length === 0;
  type Bar = { ev: NotationEvent[]; right: boolean; why: string };
  let prompt: string;
  let category = "rest-across-beat";
  let bars: Bar[];
  if (mode === "beats") {
    const merge = (at: number): Record<number, { span: number; ev: NotationEvent[] }> => ({ [at]: { span: 2, ev: [r(two!)] } });
    const why = "A single rest joins two beats here. Give each silent beat its own rest so that the beats stay easy to see.";
    if (beats === 3) {
      const at = c.rng.int(0, 1);
      bars = [{ ev: bar({ [at]: { span: 2, ev: [r(bv), r(bv)] } }), right: true, why: "" }, { ev: bar(merge(0)), right: false, why }, { ev: bar(merge(1)), right: false, why }];
    } else {
      bars = [
        { ev: bar({ 1: { span: 2, ev: [r(bv), r(bv)] } }), right: true, why: "" },
        { ev: bar(merge(1)), right: false, why },
        { ev: [...seed[0]!, r(two!), r(bv)], right: false, why },
      ];
    }
    prompt = `All three bars are in ${ts} and each has silent beats. Which bar writes its rests correctly?`;
  } else if (mode === "half") {
    category = "half-bar-rest-misplaced";
    const ok = "That bar follows the rule: its two-beat rest fills exactly half of the bar, from beat 1 or from beat 3.";
    bars = [
      { ev: bar({ 1: { span: 2, ev: [r(two!)] } }), right: true, why: "" },
      { ev: bar({ 0: { span: 2, ev: [r(two!)] } }), right: false, why: ok },
      { ev: bar({ 2: { span: 2, ev: [r(two!)] } }), right: false, why: ok },
    ];
    prompt = `All three bars are in ${ts}. A two-beat rest may only fill the first or the second half of the bar. Which bar breaks that rule?`;
  } else {
    const h = half!;
    const mid = (at: number, ev: NotationEvent[]) => ({ [at]: { span: 2, ev } });
    const straddle = [n(h), r(bv), n(h)];
    const why = "That rest runs on from the middle of one beat into the next. Finish the rest for the first beat, then start a new rest for the next beat.";
    const at = c.rng.int(0, beats - 2);
    const other = beats > 2 ? (at + 1) % (beats - 1) : -1;
    bars = [{ ev: bar(mid(at, [n(h), r(h), r(h), n(h)])), right: true, why: "" }, { ev: bar(mid(at, straddle)), right: false, why }];
    bars.push(other >= 0 ? { ev: bar(mid(other, straddle)), right: false, why } : { ev: bar(mid(at, [n(h), r(h), n(h)])), right: false, why: "Add up the beats in this bar: it does not match the time signature, so a rest is missing." });
    prompt = `All three bars are in ${ts}. In each bar, a silence starts halfway through one beat and ends halfway through the next. Which bar writes the rests correctly?`;
  }
  // Every bar is checked against the bar rules: the answer must be the only bar that differs from the rest.
  const right = bars.filter((b) => b.right);
  if (right.length !== 1) return null;
  if (mode === "half") {
    // the bar that breaks the rule must break it, and the other two must follow it
    if (!restish(right[0]!.ev) || bars.filter((b) => !b.right).some((b) => !clean(b.ev))) return null;
  } else {
    if (!clean(right[0]!.ev)) return null;
    for (const b of bars.filter((x) => !x.right)) if (clean(b.ev) || !(restish(b.ev) || issues(b.ev).includes("bar-underfull"))) return null;
  }
  const keys = new Set(bars.map((b) => JSON.stringify(b.ev)));
  if (keys.size !== 3) return null;
  const order = c.rng.shuffle(bars);
  const measures: Measure[] = order.map((b, i) => ({ events: b.ev, ...(i === order.length - 1 ? { barline: "final" as const } : {}) }));
  const answerIdx = order.findIndex((b) => b.right);
  return {
    prompt,
    music: rhythmLine(measures),
    answer: { kind: "choice", options: order.map((_, i) => ({ id: String(i + 1), label: `Bar ${i + 1}` })), correctOptionIds: [String(answerIdx + 1)], diagnoses: Object.fromEntries(order.map((b, i) => [String(i + 1), b.right ? null : diag(category, b.why)]).filter(([, v]) => v)) },
    hints: [`${ts} has ${music.describeMetre(music.metreStructure(ts))} in each bar.`],
  };
};

/**
 * t.g2.rest-fix: rewrite a bar whose rest breaks a rule. Two kinds, told apart by the prompt: a rest that runs on from part of one
 * beat into the next ("part of a beat"), and a two-beat rest across the middle of a four-beat bar ("half of the bar").
 */
export const restFix: Gen = (c) => {
  if (!c.scope.rests) return null;
  const pool = simpleTs(c, 2);
  if (!pool.length) return null;
  const ts = c.rng.pick(pool);
  const beats = music.metreStructure(ts).groups.length;
  const bv = beatValue(ts);
  const h = halfOf(bv);
  const two = times(bv, 2, 0)?.value;
  if (!valueOk(c, bv)) return null;
  const seed = Array.from({ length: beats }, () => beatFill(c, ts, c.rng.chance(0.35)));
  const middle = beats === 4 && valueOk(c, two) && (!valueOk(c, h) || c.rng.chance(0.5));
  if (middle) {
    const make = (mid: NotationEvent[]) => [...seed[0]!, ...mid, ...seed[3]!];
    const good = make([r(bv), r(bv)]);
    const bad = make([r(two!)]);
    if (codes(good, ts).length) return null;
    const bc = codes(bad, ts, { requireBeams: false });
    if (!bc.includes("half-bar-rest-misplaced") || bc.some((x) => x === "bar-underfull" || x === "bar-overfull")) return null;
    return {
      prompt: "Rewrite this bar so that no rest crosses the middle of the bar: a two-beat rest may only fill the first or the second half of the bar. It must sound exactly the same.",
      music: rhythmLine([{ events: bad }], { timeSignature: ts }),
      answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: good }]], acceptAnyRuleCompliant: true },
      hints: ["Beats 2 and 3 are silent. Give each of them its own rest."],
    };
  }
  if (!valueOk(c, h)) return null;
  const at = c.rng.int(0, beats - 2);
  const make = (mid: NotationEvent[]) => {
    const out: NotationEvent[] = [];
    for (let b = 0; b < beats; b++) {
      if (b === at) { out.push(...mid); b++; } else out.push(...seed[b]!);
    }
    return out;
  };
  const good = make([n(h), r(h), r(h), n(h)]);
  const bad = make([n(h), r(bv), n(h)]);
  if (codes(good, ts).length) return null;
  const bc = codes(bad, ts, { requireBeams: false });
  if (!bc.includes("rest-across-beat") || bc.some((x) => x === "bar-underfull" || x === "bar-overfull")) return null;
  return {
    prompt: "Rewrite this bar so that the rest does not run on from part of a beat into the next beat. It must sound exactly the same.",
    music: rhythmLine([{ events: bad }], { timeSignature: ts }),
    answer: { kind: "rhythm", task: "regroup", timeSignature: ts, accepted: [[{ events: good }]], acceptAnyRuleCompliant: true },
    hints: ["Each beat is counted separately: finish the rest for the first beat, then start a new rest for the next beat."],
  };
};

/** Where a staff position sits, in words (0 = bottom line; negatives below the stave, 9+ above). */
function posText(pos: number): string {
  if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? `on the ${ORD(pos / 2 + 1)} line` : `in the ${ORD((pos - 1) / 2 + 1)} space`;
  if (pos === -1) return "in the space just below the stave";
  if (pos === 9) return "in the space just above the stave";
  if (pos < 0) return pos % 2 === 0 ? `on the ${ORD(-pos / 2)} ledger line below the stave` : `in the space below the ${ORD((-pos - 1) / 2)} ledger line below the stave`;
  return pos % 2 === 0 ? `on the ${ORD((pos - 8) / 2)} ledger line above the stave` : `in the space above the ${ORD((pos - 9) / 2)} ledger line above the stave`;
}
const OVERLAP = ["A3", "B3", "C4", "D4", "E4"];

/** t.g2.clef-pair: the same pitch in the treble and the bass clef. */
export const clefPair: Gen = (c) => {
  const clefs = clefsOf(c);
  if (!clefs.includes("treble") || !clefs.includes("bass") || maxLedger(c) < 2) return null;
  const p = music.parsePitch(c.rng.pick(OVERLAP));
  const from: Clef = c.rng.pick(["treble", "bass"] as const);
  const to: Clef = from === "treble" ? "bass" : "treble";
  const fromPos = music.staffPosition(from, p);
  const toPos = music.staffPosition(to, p);
  const shown = frag(from, [{ events: [note(p)] }], `A ${from}-clef stave with one note ${geom(from, p)}.`, { showKeySignature: false });
  if (c.rng.chance(0.55)) {
    const ids = new Map<number, ReturnType<typeof diag> | null>([[toPos, null]]);
    ids.set(fromPos, diag("clef-confusion", `That is where the note sits in the ${from} clef. The ${to} clef counts from a different note, so the same pitch is written in another place.`));
    for (const d of c.rng.shuffle([-1, 1, -2, 2])) if (ids.size < 4 && !ids.has(toPos + d) && Math.abs(toPos + d) <= 12 && toPos + d >= -4) ids.set(toPos + d, diag("ledger-miscount", "That is close, but not the right line or space. Count up from the bottom line of the clef, one line or space at a time, and extend with ledger lines."));
    if (ids.size < 3) return null;
    const list = [...ids.keys()];
    return {
      prompt: `This note is shown in the ${from} clef. Where would the same pitch be written in the ${to} clef?`,
      music: shown,
      answer: { kind: "choice", options: c.rng.shuffle(list.map((k) => ({ id: String(k), label: cap(posText(k)) }))), correctOptionIds: [String(toPos)], diagnoses: Object.fromEntries([...ids].filter(([k, d]) => d && k !== toPos).map(([k, d]) => [String(k), d!])) },
      hints: [`Middle C is the first ledger line below the treble stave and the first ledger line above the bass stave. Count from there.`],
    };
  }
  const need = music.ledgerLines(to, p);
  return {
    prompt: `This note is shown in the ${from} clef. If the same pitch were written in the ${to} clef, how many ledger lines would it need?`,
    music: shown,
    answer: { kind: "choice", options: optsOf(["0", "1", "2"]), correctOptionIds: [String(need)], diagnoses: Object.fromEntries(["0", "1", "2"].filter((x) => x !== String(need)).map((x) => [x, diag("ledger-miscount", `Work out where the note sits in the ${to} clef first, then count the ledger lines it needs to reach it.`)])) },
    hints: ["Find where the same pitch sits in the other clef, then count the ledger lines from the stave to the note."],
  };
};

// ---------------------------------------------------------------------------
// Units 3-4: keys and scales
// ---------------------------------------------------------------------------

/** t.g2.scale-gap: a major or harmonic minor scale with one note missing. */
export const scaleGap: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const form = formOf(key);
  if (form === "harmonic" && !(c.scope.minorForms ?? []).includes("harmonic")) return null;
  const clef = c.rng.pick(clefsOf(c));
  for (const octave of c.rng.shuffle([2, 3, 4])) {
    const notes = deriveScale(keyText, form, "ascending", { ...key.tonic, octave });
    if (!notes.every((p) => music.ledgerLines(clef, p) <= maxLedger(c))) continue;
    const gap = c.rng.int(1, 6);
    const missing = notes[gap]!;
    const { options, diagnoses } = spelledOptions(c, missing, keyText);
    if (options.length < 3) return null;
    const dg: Diagnoses = { ...diagnoses };
    if (form === "harmonic" && gap === 6) {
      const natural = { step: missing.step, alter: missing.alter - 1 };
      if (options.some((o) => o.id === noteId(natural))) dg[noteId(natural)] = diag("wrong-minor-form", `That is the 7th note of the key signature. In the harmonic minor the 7th is raised by a semitone, so it is ${noteLabel(missing)}.`);
    }
    const name = form === "major" ? `scale of ${keyWord(keyText)}` : `${noteLabel(key.tonic)} harmonic minor scale`;
    return {
      prompt: `This is the ${name}, going up. One note is missing and is shown as a rest. Which note belongs in the gap?`,
      music: frag(clef, [{ events: notes.map((p, i) => (i === gap ? r("semibreve") : note(p))) }], `A ${clef}-clef stave with eight semibreves going up a scale of ${keyText}${form === "harmonic" ? " (harmonic minor)" : ""}, with one note replaced by a rest. The other notes are ${notes.filter((_, i) => i !== gap).map(nameOf).join(", ")}.`, { showKeySignature: false }),
      answer: { kind: "choice", options, correctOptionIds: [noteId(missing)], diagnoses: dg },
      hints: [form === "major" ? "Major scale pattern: tone, tone, semitone, tone, tone, tone, semitone." : "Harmonic minor: the notes of the key signature, with the 7th raised by a semitone.", "A scale uses each letter name once, in order."],
    };
  }
  return null;
};

const SIGN_ORDER = { sharps: ["F#", "C#", "G#", "D#", "A#", "E#", "B#"], flats: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"] };

/** t.g2.key-facts: sharps and flats of the Grade 2 keys, major and minor. */
export const keyFacts: Gen = (c) => {
  const all = keysIn(c);
  const keyText = c.rng.pick(all);
  const key = music.parseKey(keyText);
  const sig = music.keySignature(key);
  const cnt = sig.count;
  const sameMode = all.filter((k) => music.parseKey(k).mode === key.mode);
  const modeWord = key.mode === "major" ? "major" : "minor";
  const mode = c.rng.pick(["count", "type", "which-key", "which-notes", "last"] as const);
  const sigWord = (k: music.Key) => { const s = music.keySignature(k); return s.count === 0 ? "no sharps or flats" : `${s.count} ${s.count === 1 ? (s.type === "sharps" ? "sharp" : "flat") : s.type}`; };
  if (mode === "count") {
    const ids = [0, 1, 2, 3].map(String);
    return {
      prompt: `How many sharps or flats are in the key signature of ${keyWord(keyText)}?`,
      answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(cnt)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(cnt)).map((x) => [x, diag("wrong-count", `Count again for ${keyWord(keyText)}. Remember: A major has three sharps, B♭ major two flats, E♭ major three flats, and A minor none.`)])) },
      hints: ["Sharps are added in the order F C G D A E B; flats in the order B E A D G C F."],
    };
  }
  if (mode === "type") {
    if (cnt === 0) return null;
    const type = sig.type === "sharps" ? "sharps" : "flats";
    return {
      prompt: `Is the key signature of ${keyWord(keyText)} made of sharps or flats?`,
      answer: { kind: "choice", options: [{ id: "sharps", label: "Sharps" }, { id: "flats", label: "Flats" }], correctOptionIds: [type], diagnoses: { [type === "sharps" ? "flats" : "sharps"]: diag("mixed-sharps-flats", "A key signature uses only sharps or only flats, never both. Sharp keys go up in fifths from C (G, D, A) and flat keys go down (F, B♭, E♭).") } },
      hints: ["G, D and A major use sharps. F, B♭ and E♭ major use flats."],
    };
  }
  if (mode === "which-key") {
    if (sameMode.length < 3) return null;
    const options = c.rng.shuffle(sameMode.filter((k) => k === keyText || sigWord(music.parseKey(k)) !== sigWord(key)).slice(0, 4));
    if (!options.includes(keyText)) options.push(keyText);
    return {
      prompt: `Which ${modeWord} key has ${sigWord(key)}?`,
      answer: { kind: "choice", options: options.map((k) => ({ id: k, label: keyWord(k) })), correctOptionIds: [keyText], diagnoses: Object.fromEntries(options.filter((k) => k !== keyText).map((k) => [k, diag("wrong-count", `${keyWord(k)} has ${sigWord(music.parseKey(k))}, so it is not the one.`)])) },
      hints: ["Sharps add in the order F C G D A E B; flats in the order B E A D G C F. Work out which key owns that many."],
    };
  }
  if (mode === "which-notes") {
    if (cnt === 0) return null;
    const mine = sig.accidentals;
    const label = (xs: string[]) => (xs.length < 2 ? pretty(xs[0]!) : `${xs.slice(0, -1).map(pretty).join(", ")} and ${pretty(xs[xs.length - 1]!)}`);
    const options = new Map<string, string>([[mine.join(","), label(mine)]]);
    for (const k of all) {
      const s = music.keySignature(music.parseKey(k)).accidentals;
      if (s.length && !options.has(s.join(","))) options.set(s.join(","), label(s));
    }
    const mixed = cnt >= 2 && sig.type === "sharps" ? [mine[0]!, "Bb"] : [mine[0]!, sig.type === "sharps" ? "Bb" : "F#"];
    if (!options.has(mixed.join(","))) options.set(mixed.join(","), label(mixed));
    const list = [...options].slice(0, 4);
    if (!list.some(([id]) => id === mine.join(","))) return null;
    if (list.length < 3) return null;
    return {
      prompt: `Which sharps or flats are in the key signature of ${keyWord(keyText)}?`,
      answer: { kind: "choice", options: c.rng.shuffle(list.map(([id, l]) => ({ id, label: l }))), correctOptionIds: [mine.join(",")], diagnoses: Object.fromEntries(list.filter(([id]) => id !== mine.join(",")).map(([id]) => [id, diag(id.includes("#") && id.includes("b") ? "mixed-sharps-flats" : "wrong-order", id.includes("#") && id.includes("b") ? "A key signature uses only sharps or only flats, never both." : "Check which notes are sharpened or flattened in this key: sharps are added in the order F, C, G, D, A, E, B and flats in the order B, E, A, D, G, C, F.")])) },
      hints: ["Sharps are added in the order F C G D A E B. Flats are added in the order B E A D G C F."],
    };
  }
  if (cnt === 0) return null;
  const type = sig.type === "sharps" ? "sharps" : "flats";
  const last = sig.accidentals[sig.accidentals.length - 1]!;
  const order = SIGN_ORDER[type];
  const ids = [...new Set([last, order[cnt] ?? order[0]!, order[Math.max(0, cnt - 2)]!, order[0]!])].slice(0, 4);
  if (!ids.includes(last) || ids.length < 3) return null;
  return {
    prompt: `What is the last ${type === "sharps" ? "sharp" : "flat"} (the one added at the end) in the key signature of ${keyWord(keyText)}?`,
    answer: { kind: "choice", options: c.rng.shuffle(ids.map((id) => ({ id, label: pretty(id) }))), correctOptionIds: [last], diagnoses: Object.fromEntries(ids.filter((id) => id !== last).map((id) => [id, diag("wrong-order", `Count along the order of ${type} (${order.slice(0, 5).map(pretty).join(", ")} ...) for as many as ${keyWord(keyText)} has, and stop on the last one.`)])) },
    hints: [`${cap(type)} are added in this order: ${order.slice(0, 5).map(pretty).join(", ")} ...`],
  };
};

/** t.g2.minor-pattern: the pattern of tones and semitones in a minor scale before the 7th is raised. */
export const minorPattern: Gen = (c) => {
  const minors = keysIn(c).filter((k) => music.parseKey(k).mode === "minor");
  if (!minors.length) return null;
  const keyText = c.rng.pick(minors);
  const key = music.parseKey(keyText);
  const mode = c.rng.pick(["step", "step", "step", "pairs"] as const);
  if (mode === "pairs") {
    const right = "2-3 and 5-6";
    const wrong: Array<[string, string, string]> = [["3-4 and 7-8", "pattern-major", "Those are the places of the semitones in a major scale. In a minor scale they come earlier: between the 2nd and 3rd notes, and between the 5th and 6th."], ["1-2 and 4-5", "pattern-wrong", "The first step up from the tonic is a whole tone. Count the semitones in the minor pattern: tone, semitone, tone, tone, semitone, tone, tone."], ["2-3 and 6-7", "pattern-wrong", "The second semitone comes between the 5th and 6th notes, not the 6th and 7th."]];
    return {
      prompt: "Counting up from the tonic, between which pairs of neighbouring notes are the two semitones in the pattern of a minor scale (before the 7th is raised)?",
      answer: { kind: "choice", options: c.rng.shuffle([{ id: right, label: right.replace(/-/g, "–") }, ...wrong.map(([id]) => ({ id, label: id.replace(/-/g, "–") }))]), correctOptionIds: [right], diagnoses: Object.fromEntries(wrong.map(([id, , why]) => [id, diag("semitone-misplaced", why)])) },
      hints: ["Minor pattern: tone, semitone, tone, tone, semitone, tone, tone."],
    };
  }
  const sc = music.scale(key, "natural");
  const d = c.rng.int(1, 7);
  const a = sc[d - 1]!;
  const b = sc[d % 7]!;
  const clef = c.rng.pick(clefsOf(c));
  const oct = c.rng.pick([3, 4]);
  const p1: Pitch = { ...a, octave: oct };
  const p2: Pitch = { ...b, octave: oct + (music.stepIndex(b.step) <= music.stepIndex(a.step) ? 1 : 0) };
  if (music.ledgerLines(clef, p1) > maxLedger(c) || music.ledgerLines(clef, p2) > maxLedger(c)) return null;
  const gap = music.chromaticNumber(p2) - music.chromaticNumber(p1);
  if (gap !== 1 && gap !== 2) return null;
  const answer = gap === 1 ? "semitone" : "tone";
  return {
    prompt: `These are the ${ORD(d)} and ${ORD(d === 7 ? 8 : d + 1)} notes of ${keyWord(keyText)} (before the 7th is raised). Is the step from the first note up to the second a tone or a semitone?`,
    music: frag(clef, [{ events: [note(p1), note(p2)] }], `A ${clef}-clef stave with two notes: ${nameOf(p1)} then ${nameOf(p2)} above it.`, { showKeySignature: false }),
    answer: { kind: "choice", options: [{ id: "tone", label: "A tone" }, { id: "semitone", label: "A semitone" }], correctOptionIds: [answer], diagnoses: { [answer === "tone" ? "semitone" : "tone"]: diag("semitone-misplaced", answer === "tone" ? "There is a key between them on the piano, so this is a whole tone." : "They are neighbouring keys with nothing between, so this is a semitone.") } },
    hints: ["A semitone is from one key to the very next key; a tone has one key between.", "Minor pattern: tone, semitone, tone, tone, semitone, tone, tone."],
  };
};

/** t.g2.minor-facts: what changes in the minor and in the harmonic minor. */
export const minorFacts: Gen = (c) => {
  const minors = keysIn(c).filter((k) => music.parseKey(k).mode === "minor");
  if (!minors.length) return null;
  const keyText = c.rng.pick(minors);
  const key = music.parseKey(keyText);
  const harm = music.scale(key, "harmonic");
  const mode = c.rng.pick(["third", "raised-degree", "raised-note", "big-step"] as const);
  if (mode === "third") {
    const majorText = keyText.replace("minor", "major");
    // only major keys that Grade 2 teaches may be named (E major is Grade 3)
    if (!["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major"].includes(majorText)) return null;
    const majorThird = music.scale(music.parseKey(majorText), "major")[2]!;
    const minorThird = harm[2]!;
    const { options, diagnoses } = spelledOptions(c, minorThird, keyText);
    const opts = options.filter((o) => o.id !== noteId(majorThird));
    if (opts.length < 3) return null;
    const dg: Diagnoses = { ...diagnoses };
    delete dg[noteId(majorThird)];
    for (const o of opts) if (o.id !== noteId(minorThird) && !dg[o.id]) dg[o.id] = diag("wrong-minor-form", "The minor tonic triad has its middle note a semitone lower than in the major. Count three semitones up from the tonic to find it.");
    return {
      prompt: `The tonic triad of ${noteLabel(key.tonic)} major includes ${noteLabel(majorThird)}. Which note replaces it in the tonic triad of ${noteLabel(key.tonic)} minor?`,
      answer: { kind: "choice", options: opts, correctOptionIds: [noteId(minorThird)], diagnoses: dg },
      hints: ["The minor triad has a lower middle note: three semitones above the tonic instead of four."],
    };
  }
  if (!(c.scope.minorForms ?? []).includes("harmonic")) return null;
  if (mode === "raised-degree") {
    const ids = ["3", "5", "6", "7"];
    return {
      prompt: `In the ${noteLabel(key.tonic)} harmonic minor scale, which note of the key signature's scale is raised by a semitone?`,
      answer: { kind: "choice", options: optsOf(ids, (x) => `The ${ORD(Number(x))} note`), correctOptionIds: ["7"], diagnoses: { "6": diag("wrong-minor-form", "The 6th is raised in the melodic minor, which you meet in Grade 3. In the harmonic minor only the 7th note is raised."), "3": diag("wrong-minor-form", "The 3rd stays as it is: it is the note that makes the scale minor."), "5": diag("wrong-minor-form", "The 5th is never changed in a minor scale. Only the 7th is raised in the harmonic form.") } },
      hints: ["The harmonic minor raises the 7th note, which becomes the leading note."],
    };
  }
  if (mode === "raised-note") {
    const raised = harm[6]!;
    const natural = { step: raised.step, alter: raised.alter - 1 };
    const { options, diagnoses } = spelledOptions(c, raised, keyText);
    const dg: Diagnoses = { ...diagnoses };
    if (options.some((o) => o.id === noteId(natural))) dg[noteId(natural)] = diag("wrong-minor-form", `${noteLabel(natural)} is the 7th note of the key signature. The harmonic minor raises it by a semitone.`);
    for (const o of options) if (o.id !== noteId(raised) && !dg[o.id]) dg[o.id] = diag("letter-skipped-or-repeated", "The 7th note of the scale keeps its letter name but is raised. Which letter is the 7th note, and what does raising it do to the sign?");
    if (options.length < 3) return null;
    return {
      prompt: `In the ${noteLabel(key.tonic)} harmonic minor scale, which note is the raised 7th (the leading note)?`,
      answer: { kind: "choice", options, correctOptionIds: [noteId(raised)], diagnoses: dg },
      hints: ["Find the 7th note of the scale, then raise it by one semitone."],
    };
  }
  const ids = ["2-3", "5-6", "6-7", "7-8"];
  return {
    prompt: `In the ${noteLabel(key.tonic)} harmonic minor scale, which step is the biggest: three semitones, larger than a tone?`,
    answer: { kind: "choice", options: optsOf(ids, (x) => { const [lo, hi] = x.split("-").map(Number); return `Between the ${ORD(lo!)} and ${ORD(hi!)} notes`; }), correctOptionIds: ["6-7"], diagnoses: { "7-8": diag("semitone-misplaced", "Raising the 7th makes the step up to the tonic a semitone. The gap is below it."), "5-6": diag("semitone-misplaced", "The step from the 5th to the 6th is a semitone."), "2-3": diag("semitone-misplaced", "The step from the 2nd to the 3rd is a semitone.") } },
    hints: ["The raised 7th leaves a gap of one and a half tones just below it."],
  };
};

/** t.g2.relative-facts: relative major and minor keys. */
export const relativeFacts: Gen = (c) => {
  const keys = keysIn(c);
  const minors = keys.filter((k) => music.parseKey(k).mode === "minor");
  const majors = keys.filter((k) => music.parseKey(k).mode === "major" && minors.includes(music.formatKey(music.relativeKey(music.parseKey(k)))));
  if (!minors.length || !majors.length) return null;
  const mode = c.rng.pick(["name", "name", "degree", "pair"] as const);
  if (mode === "degree") {
    const ids = ["4", "5", "6", "7"];
    return {
      prompt: "The relative minor of a major key starts on which note of the major scale?",
      answer: { kind: "choice", options: optsOf(ids, (x) => `The ${ORD(Number(x))} note`), correctOptionIds: ["6"], diagnoses: { "5": diag("relative-confusion", "The 5th note is the dominant. The relative minor begins on the 6th note of the major scale."), "4": diag("relative-confusion", "The relative minor begins on the 6th note of the major scale."), "7": diag("relative-confusion", "The 7th note is the leading note. The relative minor begins one step lower, on the 6th.") } },
      hints: ["Count up the major scale: the relative minor starts on the 6th note."],
    };
  }
  if (mode === "pair") {
    const m = c.rng.pick(majors);
    const rel = music.formatKey(music.relativeKey(music.parseKey(m)));
    const others = minors.filter((x) => x !== rel);
    if (others.length < 2) return null;
    const picks = c.rng.shuffle(others).slice(0, 2);
    return {
      prompt: `${keyWord(m)} shares its key signature with which minor key?`,
      answer: { kind: "choice", options: c.rng.shuffle([rel, ...picks]).map((k) => ({ id: k, label: keyWord(k) })), correctOptionIds: [rel], diagnoses: Object.fromEntries(picks.map((k) => [k, diag("relative-confusion", `${keyWord(k)} has a different key signature. The relative minor starts on the 6th note of ${keyWord(m)} and uses the same sharps or flats.`)])) },
      hints: ["The relative minor starts on the 6th note of the major scale."],
    };
  }
  const fromMajor = c.rng.chance(0.5);
  const base = fromMajor ? c.rng.pick(majors) : c.rng.pick(minors);
  const rel = music.formatKey(music.relativeKey(music.parseKey(base)));
  const pool = fromMajor ? minors : majors.filter((x) => x !== base);
  const others = pool.filter((x) => x !== rel);
  if (others.length < 2) return null;
  const picks = c.rng.shuffle(others).slice(0, 2);
  return {
    prompt: `Which ${fromMajor ? "minor" : "major"} key is the relative of ${keyWord(base)}?`,
    answer: { kind: "choice", options: c.rng.shuffle([rel, ...picks]).map((k) => ({ id: k, label: keyWord(k) })), correctOptionIds: [rel], diagnoses: Object.fromEntries(picks.map((k) => [k, diag("relative-confusion", `${keyWord(k)} does not share a key signature with ${keyWord(base)}. Relative keys use the same sharps or flats.`)])) },
    hints: [fromMajor ? "The relative minor starts on the 6th note of the major scale." : "The relative major starts three semitones above the minor tonic."],
  };
};

/** t.g2.degree-note: which note is degree N of a major or harmonic minor key? */
export const degreeNote: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const form = formOf(key);
  if (form === "harmonic" && !(c.scope.minorForms ?? []).includes("harmonic")) return null;
  const sc = music.scale(key, form);
  const d = c.rng.int(2, 7); // degree 1 is the key note itself, which the prompt names
  const target = sc[d - 1]!;
  const { options, diagnoses } = spelledOptions(c, target, keyText);
  if (options.length < 3) return null;
  const dg: Diagnoses = { ...diagnoses };
  for (const dd of [d - 1, d + 1]) {
    const nb = sc[dd - 1];
    if (nb && options.some((o) => o.id === noteId(nb)) && !dg[noteId(nb)]) dg[noteId(nb)] = diag("off-by-one", `${noteLabel(nb)} is degree ${dd}. Count up from the tonic, which is degree 1.`);
  }
  if (form === "harmonic" && d === 7) {
    const natural = { step: target.step, alter: target.alter - 1 };
    if (options.some((o) => o.id === noteId(natural))) dg[noteId(natural)] = diag("name-number-mismatch", "In the harmonic minor the 7th is raised, so it is not the note in the key signature.");
  }
  return {
    prompt: `In ${keyWord(keyText)}${form === "harmonic" ? " (harmonic minor)" : ""}, which note is degree ${d} of the scale?`,
    answer: { kind: "choice", options, correctOptionIds: [noteId(target)], diagnoses: dg },
    hints: [`Degree 1 is the tonic, ${noteLabel(key.tonic)}. Count up the scale one note at a time.`],
  };
};

/** t.g2.triad-notes: the notes of a tonic triad in a Grade 2 key. */
export const triadNotes: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const sc = music.scale(key, formOf(key));
  const tri = [sc[0]!, sc[2]!, sc[4]!];
  const mode = c.rng.pick(["notes", "role", "missing"] as const);
  const quality = key.mode === "major" ? "major" : "minor";
  if (mode === "notes") {
    const label = (xs: Array<{ step: string; alter: number }>) => xs.map(noteLabel).join(" ");
    const wrong: Array<[Array<{ step: string; alter: number }>, string]> = [
      [[sc[0]!, sc[1]!, sc[2]!], "Those are the first three notes of the scale, side by side. A triad uses every other note: degrees 1, 3 and 5."],
      [[sc[0]!, sc[3]!, sc[5]!], "A triad is built from the tonic, the note two steps above it (the 3rd) and the note four steps above it (the 5th)."],
      [[sc[0]!, sc[2]!, sc[3]!], "The top note of a triad is the 5th of the scale, not the 4th."],
    ];
    const opts = [{ id: "right", label: label(tri) }, ...wrong.map((w, i) => ({ id: `w${i}`, label: label(w[0]) }))];
    return {
      prompt: `Which three notes make the tonic triad of ${keyWord(keyText)}?`,
      answer: { kind: "choice", options: c.rng.shuffle(opts), correctOptionIds: ["right"], diagnoses: Object.fromEntries(wrong.map((w, i) => [`w${i}`, diag("wrong-degree", w[1])])) },
      hints: [`The tonic triad uses degrees 1, 3 and 5 of the ${quality} scale.`],
    };
  }
  if (mode === "role") {
    const idx = c.rng.pick([1, 2]); // the root is named in the question, so only the 3rd and the 5th are asked
    const role = ["root (degree 1)", "3rd (degree 3)", "5th (degree 5)"][idx]!;
    const { options, diagnoses } = spelledOptions(c, tri[idx]!, keyText);
    const dg: Diagnoses = { ...diagnoses };
    for (const o of options) if (o.id !== noteId(tri[idx]!) && !dg[o.id]) dg[o.id] = diag("note-missing", `That note is not the ${role.split(" ")[0]} of this triad. Count up the scale from the tonic: the root is degree 1, the 3rd is degree 3 and the 5th is degree 5.`);
    return {
      prompt: `In the tonic triad of ${keyWord(keyText)}, which note is the ${role}?`,
      answer: { kind: "choice", options, correctOptionIds: [noteId(tri[idx]!)], diagnoses: dg },
      hints: ["Count up the scale: the root is degree 1, the 3rd is degree 3 and the 5th is degree 5."],
    };
  }
  const clef = c.rng.pick(clefsOf(c));
  const miss = c.rng.pick([1, 2]);
  const voicing = [3, 4, 2].map((o) => tri.map((p, i) => ({ ...p, octave: o + (i > 0 && music.stepIndex(p.step) < music.stepIndex(tri[0]!.step) ? 1 : 0) }) as Pitch)).find((v) => v.every((p) => music.ledgerLines(clef, p) <= maxLedger(c) && music.staffPosition(clef, p) >= -1 && music.staffPosition(clef, p) <= 9));
  if (!voicing) return null;
  const shown = voicing.filter((_, i) => i !== miss);
  const missingNote = voicing[miss]!;
  const { options, diagnoses } = spelledOptions(c, missingNote, keyText);
  const dg: Diagnoses = { ...diagnoses };
  for (const o of options) if (o.id !== noteId(missingNote) && !dg[o.id]) dg[o.id] = diag("note-missing", "A triad is degrees 1, 3 and 5 of the scale. Count up the scale from the root to find the missing one.");
  return {
    prompt: `Part of the tonic triad of ${keyWord(keyText)} is shown. Which note is missing from the chord?`,
    music: frag(clef, [{ events: [{ kind: "chord", notes: shown.map((p) => ({ pitch: music.formatPitch(p) })), duration: { value: "semibreve", dots: 0 } } as NotationEvent] }], `A ${clef}-clef stave with two notes sounded together: ${shown.map(nameOf).join(" and ")}.`, { showKeySignature: false }),
    answer: { kind: "choice", options, correctOptionIds: [noteId(missingNote)], diagnoses: dg },
    hints: ["The tonic triad is degrees 1, 3 and 5 of the scale."],
  };
};

/** t.g2.interval-note: which note is a given number above the tonic (by number only)? */
export const intervalNote: Gen = (c) => {
  const keyText = c.rng.pick(keysIn(c));
  const key = music.parseKey(keyText);
  const form = formOf(key);
  if (form === "harmonic" && !(c.scope.minorForms ?? []).includes("harmonic")) return null;
  const sc = music.scale(key, form);
  // The 7th of a minor key depends on the form, so a number-only question about it would be ambiguous.
  const num = c.rng.pick(key.mode === "major" ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6]);
  const target = sc[num - 1]!;
  const { options, diagnoses } = spelledOptions(c, target, keyText);
  if (options.length < 3) return null;
  const dg: Diagnoses = { ...diagnoses };
  for (const dd of [num - 1, num + 1]) {
    const nb = sc[dd - 1];
    if (nb && dd >= 1 && options.some((o) => o.id === noteId(nb)) && !dg[noteId(nb)]) dg[noteId(nb)] = diag("counted-one-end-only", `${noteLabel(nb)} is a ${ORD(dd)} above the tonic. Count the tonic itself as 1 when you count up.`);
  }
  return {
    prompt: `In ${keyWord(keyText)}, which note is a ${ORD(num)} above the tonic?`,
    answer: { kind: "choice", options, correctOptionIds: [noteId(target)], diagnoses: dg },
    hints: ["Count the tonic as 1 and go up the scale one letter at a time until you reach the number."],
  };
};

// ---------------------------------------------------------------------------
// Unit 5: terms and music in context
// ---------------------------------------------------------------------------

type TermT = (typeof music.TERMS)[number];
const G2_NEW = () => music.TERMS.filter((t) => t.firstGrade === 2);
const G2_POOL = () => music.termsUpTo(2);
const CONTEXT: Record<string, string> = {
  presto: "a race to the finish line, as quickly as the player can manage",
  largo: "a slow, broad procession, played with a wide, stately feel",
  vivace: "a lively, quick country dance",
  grazioso: "a graceful, elegant dance for a ballroom",
  maestoso: "a grand, majestic fanfare for the entrance of a king",
  sforzando: "one note with a sudden, strong accent, like a stamp of the foot",
  fortepiano: "a note that starts loud and drops to quiet at once",
  tenuto: "notes that are held for their full length",
};
/** Terms whose meanings could be confused with the target are never offered beside it. */
const FAST = new Set(["presto", "vivace", "allegro", "allegretto"]);
const SLOW = new Set(["largo", "adagio", "lento"]);
function termDistractors(c: Ctx, target: TermT): TermT[] {
  // never another word of the same speed family beside the target: "a lively, quick dance" could be vivace, presto or allegro
  const family = FAST.has(target.id) ? FAST : SLOW.has(target.id) ? SLOW : null;
  const pool = G2_POOL().filter((t) => t.meaning !== target.meaning && !target.similar?.includes(t.id) && !t.similar?.includes(target.id) && !(family && family.has(t.id)));
  const near = pool.filter((t) => t.category === target.category);
  const picks: TermT[] = [];
  for (const t of [...c.rng.shuffle(near), ...c.rng.shuffle(pool.filter((x) => !near.includes(x)))]) {
    if (picks.length === 3) break;
    if (!picks.some((p) => p.meaning === t.meaning)) picks.push(t);
  }
  return picks;
}
const PITCH_SCALE_KEYS = (c: Ctx) => keysIn(c).filter((k) => k.endsWith("major"));

/** A short authored-style melody: one note per beat, with optional split beats or a triplet. */
function buildMelody(c: Ctx, ts: string, keyText: string, clef: Clef, bars: number, opts: { triplet?: "bar1" | "bar2" | "none"; tempo?: string; dynamicOnFirst?: string; tenutoOnFirst?: boolean } = {}) {
  const key = music.parseKey(keyText);
  const s = music.metreStructure(ts);
  const beats = s.groups.length;
  const bv = beatValue(ts);
  const unit = halfOf(bv);
  const tripletBar = opts.triplet === "bar1" ? 0 : opts.triplet === "bar2" ? 1 : -1;
  if (tripletBar >= 0 && (!unit || !valueOk(c, unit) || !c.scope.tuplets?.includes("triplet"))) return null;
  // plan: per bar, per beat -> 1 note | 2 notes | 3 notes (triplet)
  const plan: number[][] = Array.from({ length: bars }, (_, b) => {
    const row: number[] = Array.from({ length: beats }, () => (c.rng.chance(0.25) && valueOk(c, halfOf(bv)) ? 2 : 1));
    if (b === tripletBar) row[c.rng.int(0, beats - 1)] = 3;
    return row;
  });
  const total = plan.flat().reduce((a, x) => a + x, 0);
  const tune = melodyIn(c, key, clef, total);
  if (!tune) return null;
  let k = 0;
  const measures: Measure[] = plan.map((row, b) => {
    const events: NotationEvent[] = [];
    row.forEach((cnt) => {
      if (cnt === 1) events.push(note(tune[k++]!, bv));
      else if (cnt === 2) { const h = halfOf(bv)!; for (let i = 0; i < 2; i++) events.push(note(tune[k++]!, h, beamFlag(h, 2, i))); }
      else events.push({ kind: "tuplet", actual: 3, normal: 2, events: [0, 1, 2].map((i) => note(tune[k++]!, unit!, beamFlag(unit!, 3, i))) } as NotationEvent);
    });
    return { events, ...(b === bars - 1 ? { barline: "final" as const } : {}) };
  });
  const first = (measures[0]!.events as Array<Record<string, unknown>>)[0]!;
  if (opts.dynamicOnFirst) first.dynamic = opts.dynamicOnFirst;
  if (opts.tenutoOnFirst) first.articulations = ["tenuto"];
  const sig = music.keySignature(key);
  const sigWord = sig.count === 0 ? "no sharps or flats" : `${sig.count} ${sig.count === 1 ? (sig.type === "sharps" ? "sharp" : "flat") : sig.type}`;
  const marks = [opts.tempo ? `The tempo mark above the first bar says “${opts.tempo}”.` : "", opts.dynamicOnFirst ? `The first note carries the dynamic mark ${opts.dynamicOnFirst}.` : "", opts.tenutoOnFirst ? "The first note has a short horizontal line above it (a tenuto mark)." : ""].filter(Boolean).join(" ");
  const f = frag(clef, measures, `A ${bars}-bar melody in the ${clef} clef, key signature of ${sigWord}, time signature ${ts}. The notes sit: ${tune.map((p) => geom(clef, p)).join("; ")}. ${marks}`.trim(), { key: keyText, timeSignature: ts, showKeySignature: true, ...(opts.tempo ? { tempoText: opts.tempo } : {}) });
  return { fragment: f, tune, plan, tripletBar, beats, bv, measures };
}

/** t.g2.term-use: meet each new term in words, as a character, or in a short melody. */
export const termUse: Gen = (c) => {
  const target = c.rng.pick(G2_NEW());
  const mode = c.rng.pick(["to-meaning", "to-term", "character", "in-tune"] as const);
  const picks = termDistractors(c, target);
  if (picks.length < 3) return null;
  const optsMeaning = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.meaning }));
  const optsTerm = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.term }));
  const diagFor = (side: "meaning" | "term") => Object.fromEntries(picks.map((p) => [p.id, diag(target.opposite?.includes(p.id) ? "opposite-meaning" : p.category === target.category ? "confused-similar-term" : "wrong-category", side === "meaning" ? `“${p.term}” is a different word: it means “${p.meaning}”.` : `That is “${p.term}”, which means “${p.meaning}”. Look for the term that matches the meaning given.`)]));
  if (mode === "to-meaning") return { prompt: `What does “${target.term}” mean?`, answer: { kind: "choice", options: optsMeaning, correctOptionIds: [target.id], diagnoses: diagFor("meaning") }, hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`] };
  if (mode === "to-term") return { prompt: `Which term or sign means “${target.meaning}”?`, answer: { kind: "choice", options: optsTerm, correctOptionIds: [target.id], diagnoses: diagFor("term") }, hints: [`It is a ${target.category.replace(/-/g, " ")} marking.`] };
  if (mode === "character") return { prompt: `A composer wants ${CONTEXT[target.id]}. Which marking fits best?`, answer: { kind: "choice", options: optsTerm, correctOptionIds: [target.id], diagnoses: diagFor("term") }, hints: [`Think about speed, loudness, character or touch: “${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`] };
  // in-tune: the mark is shown on a short melody
  const keys = PITCH_SCALE_KEYS(c);
  const tsPool = simpleTs(c).filter((t) => music.parseTimeSignature(t).bottom <= 4);
  if (!keys.length || !tsPool.length) return null;
  const isTempoLike = target.category === "tempo" || target.category === "expression";
  const clef = c.rng.pick(clefsOf(c));
  const m = buildMelody(c, c.rng.pick(tsPool), c.rng.pick(keys), clef, 2, isTempoLike ? { tempo: target.term } : target.id === "tenuto" ? { tenutoOnFirst: true } : { dynamicOnFirst: target.id === "sforzando" ? "sf" : "fp" });
  if (!m) return null;
  return {
    prompt: isTempoLike ? `This melody is marked “${target.term}”. How should the player play it?` : "What does the mark on the first note tell the player to do?",
    music: m.fragment,
    answer: { kind: "choice", options: optsMeaning, correctOptionIds: [target.id], diagnoses: diagFor("meaning") },
    hints: isTempoLike ? [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`] : ["Look at what is written on or under the first note: it is a sign for how to play it."],
  };
};

/** t.g2.melody-detail: one question about a short melody (beats, the beat note, triplet, key, interval, term). */
export const melodyDetail: Gen = (c) => {
  const keys = PITCH_SCALE_KEYS(c);
  const tsPool = simpleTs(c);
  if (!keys.length || !tsPool.length) return null;
  const ts = c.rng.pick(tsPool);
  const keyText = c.rng.pick(keys);
  const clef = c.rng.pick(clefsOf(c));
  const key = music.parseKey(keyText);
  const mode = c.rng.pick(["beats", "beat-note", "triplet", "triplet", "key", "interval", "term", "ledger"] as const);
  const { top, bottom } = music.parseTimeSignature(ts);
  const bars = 2;
  if (mode === "triplet") {
    const which = c.rng.pick(["bar1", "bar2"] as const);
    const m = buildMelody(c, ts, keyText, clef, bars, { triplet: which });
    if (!m) return null;
    const right = which === "bar1" ? "1" : "2";
    return {
      prompt: "Which bar of the melody contains a triplet?",
      music: m.fragment,
      answer: { kind: "choice", options: [{ id: "1", label: "Bar 1" }, { id: "2", label: "Bar 2" }], correctOptionIds: [right], diagnoses: { [right === "1" ? "2" : "1"]: diag("evidence-misread", "Look for the bracket marked 3 over a group of three notes joined by a beam.") } },
      hints: ["A triplet is a group of three notes with a 3 above or below."],
    };
  }
  if (mode === "term") {
    const target = c.rng.pick(G2_NEW().filter((t) => t.category === "tempo" || t.category === "expression"));
    const picks = termDistractors(c, target);
    if (picks.length < 3) return null;
    const m = buildMelody(c, ts, keyText, clef, bars, { tempo: target.term });
    if (!m) return null;
    return {
      prompt: `The melody is marked “${target.term}”. Which description of the way to play it is right?`,
      music: m.fragment,
      answer: { kind: "choice", options: c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.meaning })), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((p) => [p.id, diag("evidence-misread", `“${p.term}” means “${p.meaning}”, which is a different marking.`)])) },
      hints: [`“${target.term}” is a ${target.category.replace(/-/g, " ")} marking.`],
    };
  }
  const m = buildMelody(c, ts, keyText, clef, bars, {});
  if (!m) return null;
  if (mode === "beats") {
    const ids = ["2", "3", "4"];
    return { prompt: "How many beats are there in each bar of this melody?", music: m.fragment, answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(top)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(top)).map((x) => [x, diag("evidence-misread", "The top number of the time signature says how many beats are in a bar.")])) }, hints: ["Read the time signature."] };
  }
  if (mode === "beat-note") {
    const unit = BEAT_NAME[bottom]!;
    const ids = ["minim", "crotchet", "quaver"];
    return { prompt: "Which note is worth one beat in this melody's time signature?", music: m.fragment, answer: { kind: "choice", options: optsOf(ids, (x) => withA(x)), correctOptionIds: [unit], diagnoses: Object.fromEntries(ids.filter((x) => x !== unit).map((x) => [x, diag("evidence-misread", "The bottom number of the time signature names the beat: 2 = minim, 4 = crotchet, 8 = quaver.")])) }, hints: ["Read the bottom number of the time signature."] };
  }
  if (mode === "key") {
    if (keys.length < 3) return null;
    const options = c.rng.shuffle([keyText, ...c.rng.shuffle(keys.filter((k) => k !== keyText)).slice(0, 3)]);
    return { prompt: "The melody is in a major key. Which key is it?", music: m.fragment, answer: { kind: "choice", options: options.map((k) => ({ id: k, label: keyWord(k) })), correctOptionIds: [keyText], diagnoses: Object.fromEntries(options.filter((k) => k !== keyText).map((k) => [k, diag("evidence-misread", `${keyWord(k)} has ${music.keySignature(music.parseKey(k)).count} ${music.keySignature(music.parseKey(k)).type}, which does not match the key signature on the stave.`)])) }, hints: ["Count the sharps or flats in the key signature."] };
  }
  if (mode === "ledger") {
    const need = Math.max(...m.tune.map((p) => music.ledgerLines(clef, p)));
    const ids = ["0", "1", "2"];
    return { prompt: "What is the largest number of ledger lines used by any note in this melody?", music: m.fragment, answer: { kind: "choice", options: optsOf(ids), correctOptionIds: [String(need)], diagnoses: Object.fromEntries(ids.filter((x) => x !== String(need)).map((x) => [x, diag("evidence-misread", "Look above and below the stave for notes that sit on short extra lines and count the most lines any one note needs.")])) }, hints: ["Check the highest and the lowest note."] };
  }
  // interval from the nearest tonic below (or at) the first note... keep simple: the interval above the tonic of the marked note
  const candidates = m.tune.map((p, k) => ({ p, k })).filter(({ p, k }) => k >= 1 && (music.diatonicNumber(p) - music.diatonicNumber({ ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) }) + 1) >= 2 && (music.diatonicNumber(p) - music.diatonicNumber({ ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) }) + 1) <= 7);
  if (!candidates.length) return null;
  const { p: x, k: idx } = c.rng.pick(candidates);
  const tonicBelow: Pitch = { ...key.tonic, octave: x.octave - (music.stepIndex(x.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
  const number = music.diatonicNumber(x) - music.diatonicNumber(tonicBelow) + 1;
  if (number < 2 || number > 7) return null;
  const labelled = m.fragment.measures.map((ms) => ({ ...ms, events: (ms.events ?? []).map((e) => e) }));
  let count = 0;
  const walk = (evs: NotationEvent[]) => evs.forEach((e) => { if (e.kind === "tuplet") walk(e.events as NotationEvent[]); else if (e.kind === "note") { if (count === idx) (e as { label?: string }).label = "x"; count++; } });
  labelled.forEach((ms) => walk(ms.events as NotationEvent[]));
  return {
    prompt: `The melody is in ${keyWord(keyText)}. What is the interval, by number, from the tonic up to the note marked x? (Use the nearest tonic below the note.)`,
    music: { ...m.fragment, measures: labelled },
    answer: { kind: "choice", options: [2, 3, 4, 5, 6, 7].map((v) => ({ id: String(v), label: ORD(v) })), correctOptionIds: [String(number)], diagnoses: Object.fromEntries([number - 1, number + 1].filter((v) => v >= 2 && v <= 7).map((v) => [String(v), diag("evidence-misread", "Count the tonic itself as 1 when you count up to the note.")])) },
    hints: ["Find the tonic of the key, then count up to the marked note, counting the tonic as 1."],
  };
};

export const GRADE2_GENERATORS: Record<string, Gen> = {
  "t.g2.beat-facts": beatFacts,
  "t.g2.time-sig-read": timeSigRead,
  "t.g2.ledger-place": ledgerPlace,
  "t.g2.bar-judge": barJudge,
  "t.g2.triplet-facts": tripletFacts,
  "t.g2.triplet-read": tripletRead,
  "t.g2.triplet-mixed": tripletMixed,
  "t.g2.triplet-fill": tripletFill,
  "t.g2.rest-judge": restJudge,
  "t.g2.rest-fix": restFix,
  "t.g2.clef-pair": clefPair,
  "t.g2.scale-gap": scaleGap,
  "t.g2.key-facts": keyFacts,
  "t.g2.minor-pattern": minorPattern,
  "t.g2.minor-facts": minorFacts,
  "t.g2.relative-facts": relativeFacts,
  "t.g2.degree-note": degreeNote,
  "t.g2.triad-notes": triadNotes,
  "t.g2.interval-note": intervalNote,
  "t.g2.term-use": termUse,
  "t.g2.melody-detail": melodyDetail,
};
