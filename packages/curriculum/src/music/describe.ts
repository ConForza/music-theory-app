/**
 * Rhythms in words, for prompts and screen-reader descriptions: "four quavers, a crotchet and four quavers", not "a quaver, then a quaver,
 * then a quaver, then a quaver, then a crotchet, …".
 *
 * Consecutive events are merged only when nothing musical tells them apart: the same kind (note or rest), value and dots, and the same
 * beaming (an unbeamed note never merges with a beamed one, and a beamed group is one unit). A tie is never merged away: tied notes are
 * named one by one ("a crotchet tied to a quaver"). Tuplets keep their name and contents ("a triplet of three quavers"). Pitch is not
 * described here: these helpers are for rhythm, where every note is drawn on one line.
 */

/**
 * The structural part of a notation or rhythm-response event that the words depend on. RHYTHM ONLY: pitch, accidentals and articulations are
 * not read, so two notes that differ only in those are described (and merged) as the same. Use it for rhythm lines and rhythm answers, never
 * for pitched music.
 */
export interface WordEvent {
  kind: string;
  duration?: { value: string; dots?: number };
  beam?: string;
  tieToNext?: boolean;
  wholeBar?: boolean;
  /** Tuplets: how many notes are written, and in the time of how many. */
  actual?: number;
  normal?: number;
  events?: WordEvent[];
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "four"; numbers above twelve stay as figures. */
export const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
/** "a" or "an" before a word as it is spoken: an octave, an 8th, an 11th, an upper mordent, but a unison. */
export const article = (word: string): string => (/^(8|11|18|[aeio]|u(?!ni|se|su))/i.test(word.trim()) ? "an" : "a");
export const withArticle = (word: string): string => `${article(word)} ${word}`;
/** "A, B and C"; two items read "A followed by B" when `ordered`, so a sequence in time is never mistaken for one thing. */
export const listInWords = (parts: string[], ordered = false): string =>
  parts.length <= 1 ? (parts[0] ?? "") : parts.length === 2 && ordered ? `${parts[0]} followed by ${parts[1]}` : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
/** Capital first letter, for a description that starts a sentence. */
export const sentenceStart = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** "dotted crotchet", "double-dotted minim rest"; plural adds the s to the note value ("quaver rests"). */
export function durationInWords(value: string, dots = 0, opts: { rest?: boolean; plural?: boolean } = {}): string {
  const dot = dots >= 2 ? "double-dotted " : dots === 1 ? "dotted " : "";
  const s = opts.plural ? "s" : "";
  return opts.rest ? `${dot}${value} rest${s}` : `${dot}${value}${s}`;
}

const TUPLET_NAMES: Record<number, string> = { 2: "duplet", 3: "triplet", 5: "quintuplet", 6: "sextuplet", 7: "septuplet", 9: "nonuplet" };
/** The usual ratio for each named tuplet (a duplet takes the time of three, a triplet of two, …). */
const TUPLET_NORMAL: Record<number, number> = { 2: 3, 3: 2, 5: 4, 6: 4, 7: 4, 9: 8 };
/** The tuplet's name when it has the usual ratio ("triplet"), else null: a group with any other ratio is described by its ratio. */
export function tupletName(actual: number, normal?: number): string | null {
  const named = TUPLET_NAMES[actual];
  return named && (normal === undefined || TUPLET_NORMAL[actual] === normal) ? named : null;
}

type Unit =
  | { type: "single"; ev: WordEvent }
  | { type: "beam"; members: WordEvent[] }
  | { type: "tie"; members: WordEvent[] }
  | { type: "tuplet"; ev: WordEvent };

const plainKey = (e: WordEvent) => `${e.kind}|${e.duration?.value}|${e.duration?.dots ?? 0}|${e.wholeBar ? "bar" : ""}|${e.tieToNext ? "tie" : ""}`;
const unitKey = (u: Unit): string =>
  u.type === "single"
    ? `s:${plainKey(u.ev)}`
    : u.type === "beam"
      ? `b:${u.members.map(plainKey).join(",")}`
      : u.type === "tuplet"
        ? `t:${u.ev.actual}:${u.ev.normal ?? ""}:${(u.ev.events ?? []).map((e) => `${plainKey(e)}/${e.beam ?? ""}`).join(",")}`
        : `c:${u.members.map(plainKey).join(",")}`;
const lastOf = (u: Unit): WordEvent => (u.type === "single" || u.type === "tuplet" ? u.ev : u.members[u.members.length - 1]!);
/** The unit's last note is tied on into the next unit (a tie across a beam group or tuplet boundary). */
const tiesOut = (u: Unit) => u.type !== "tuplet" && lastOf(u).kind !== "rest" && Boolean(lastOf(u).tieToNext);

/** One plain note or rest, `n` times: "a dotted minim", "two quaver rests", "a whole-bar rest". */
function plainWords(e: WordEvent, n: number): string {
  if (e.kind === "rest" && e.wholeBar) return n === 1 ? "a whole-bar rest" : `${countWord(n)} whole-bar rests`;
  if (!e.duration) return n === 1 ? `a ${e.kind}` : `${countWord(n)} ${e.kind}s`;
  const w = durationInWords(e.duration.value, e.duration.dots ?? 0, { rest: e.kind === "rest", plural: n > 1 });
  const tie = e.tieToNext ? " tied to the next note" : "";
  return `${n === 1 ? article(w) : countWord(n)} ${w}${tie}`;
}
const inBeam = (e: WordEvent | undefined) => e?.beam === "begin" || e?.beam === "continue" || e?.beam === "end";

/**
 * Beam groups and tuplets are units first; a tie chain only joins notes outside them. A tie that crosses into or out of a group is kept as a
 * link between units (see rhythmInWords), so neither the beam nor the tie is lost (first review of PR #30: a crotchet tied to the first of two
 * beamed quavers read exactly like the same notes without the beam).
 */
function unitsOf(events: WordEvent[], beams: boolean): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.kind === "tuplet") {
      out.push({ type: "tuplet", ev: e });
    } else if (beams && e.beam === "begin") {
      const members = [e];
      while (i + 1 < events.length && (events[i + 1]!.beam === "continue" || events[i + 1]!.beam === "end")) {
        members.push(events[++i]!);
        if (members[members.length - 1]!.beam === "end") break;
      }
      out.push(members.length > 1 ? { type: "beam", members } : { type: "single", ev: e });
    } else {
      const free = (x: WordEvent | undefined) => x !== undefined && x.kind !== "tuplet" && !(beams && inBeam(x));
      const members = [e];
      while (members[members.length - 1]!.tieToNext && members[members.length - 1]!.kind !== "rest" && free(events[i + 1])) members.push(events[++i]!);
      out.push(members.length > 1 ? { type: "tie", members } : { type: "single", ev: e });
    }
  }
  return out;
}

/** Runs of identical members, each as words without beams ("two quavers", "a semiquaver"). */
const runs = (events: WordEvent[]): Array<{ e: WordEvent; n: number }> => {
  const out: Array<{ e: WordEvent; n: number }> = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && plainKey(last.e) === plainKey(e) && !e.tieToNext) last.n++;
    else out.push({ e, n: 1 });
  }
  return out;
};
const uniformNotes = (r: Array<{ e: WordEvent; n: number }>) => r.length === 1 && r[0]!.e.kind === "note" && !r[0]!.e.tieToNext && Boolean(r[0]!.e.duration);
const valuesOf = (r: { e: WordEvent; n: number }) => durationInWords(r.e.duration!.value, r.e.duration!.dots ?? 0, { plural: r.n > 1 });

/**
 * A unit in words, `n` times. `as`: "whole" names it on its own; "target" names it as the end of a tie from the unit before ("the first of two
 * beamed quavers"). The tie out of a unit's last note is described by the caller, so it is left out here.
 */
function unitWords(u: Unit, n: number, as: "whole" | "target" = "whole", beams = false): string {
  const own = (m: WordEvent, k: number, list: WordEvent[]) => (k === list.length - 1 ? { ...m, tieToNext: false } : m);
  if (u.type === "single") return plainWords({ ...u.ev, tieToNext: false }, n);
  if (u.type === "tie") return u.members.map((m) => plainWords({ ...m, tieToNext: false }, 1)).join(" tied to ");
  if (u.type === "beam") {
    const r = runs(u.members.map(own));
    if (uniformNotes(r)) {
      const value = valuesOf(r[0]!);
      if (as === "target") return `the first of ${countWord(r[0]!.n)} beamed ${value}`;
      if (n === 1) return `${countWord(r[0]!.n)} ${value} beamed together`;
      return r[0]!.n === 2 ? `${countWord(n)} pairs of beamed ${value}` : `${countWord(n)} groups of ${countWord(r[0]!.n)} beamed ${value}`;
    }
    const inner = listInWords(r.map((x) => plainWords(x.e, x.n)));
    if (as === "target") return `the first note of a beamed group (${inner})`;
    return n === 1 ? `a beamed group (${inner})` : `${countWord(n)} beamed groups, each (${inner})`;
  }
  const inner = u.ev.events ?? [];
  const r = runs(inner);
  // Beams inside a tuplet are read too when beams are (second review of PR #30): a triplet of three beamed quavers is not three separate ones.
  const beamedInner = beams && inner.some((e) => inBeam(e));
  const allOneBeam = beamedInner && inner.length > 1 && inner[0]!.beam === "begin" && inner[inner.length - 1]!.beam === "end" && inner.slice(1, -1).every((e) => e.beam === "continue");
  const uniform = uniformNotes(r) && (!beamedInner || allOneBeam);
  const name = tupletName(u.ev.actual ?? 3, u.ev.normal);
  const listed = beamedInner && !allOneBeam ? `(${rhythmInWords(inner, { beams: true })})` : `(${listInWords(r.map((x) => plainWords(x.e, x.n)))})`;
  const valuesOfTuplet = (x: { e: WordEvent; n: number }) => `${allOneBeam ? "beamed " : ""}${valuesOf(x)}`;
  let one: string;
  let many: string;
  if (name) {
    // "a triplet of three quavers", "two triplets of three quavers each"
    const contents = uniform ? `of ${countWord(r[0]!.n)} ${valuesOfTuplet(r[0]!)}` : listed;
    one = `${withArticle(name)} ${contents}`;
    many = `${countWord(n)} ${name}s${uniform ? ` ${contents} each` : `, each ${contents}`}`;
  } else {
    // any other ratio says it: "four quavers in the time of three", "two groups of four quavers in the time of three"
    const time = u.ev.normal === undefined ? "" : ` in the time of ${countWord(u.ev.normal)}`;
    one = uniform ? `${countWord(r[0]!.n)} ${valuesOfTuplet(r[0]!)}${time}` : `a group${time} ${listed}`;
    many = uniform ? `${countWord(n)} groups of ${countWord(r[0]!.n)} ${valuesOfTuplet(r[0]!)}${time}` : `${countWord(n)} groups${time}, each ${listed}`;
  }
  if (as === "target") return `the first note of ${one}`;
  return n === 1 ? one : many;
}

/**
 * A run of events in words: "four quavers, a crotchet and four quavers". With `beams`, notes joined by a beam are named as one group
 * ("four quavers beamed together", "a beamed group (a dotted quaver, a semiquaver and a quaver)") so a listener hears the grouping as a
 * sighted reader sees it; without, beams are ignored. Two parts read "A followed by B".
 */
export function rhythmInWords(events: WordEvent[], opts: { beams?: boolean; tieOverBarline?: boolean } = {}): string {
  const beams = opts.beams ?? false;
  const units = unitsOf(events, beams);
  const parts: string[] = [];
  for (let i = 0; i < units.length; ) {
    const u = units[i]!;
    if (tiesOut(u)) {
      // a tie across a group boundary links this unit to the next one: "a crotchet tied into the first of two beamed quavers",
      // "two quavers beamed together, the last tied to a crotchet"
      let text = unitWords(u, 1, "whole", beams);
      let k = i;
      while (tiesOut(units[k]!) && k + 1 < units.length) {
        const next = units[k + 1]!;
        const join = next.type === "single" || next.type === "tie" ? "tied to" : "tied into";
        text += units[k]!.type === "beam" ? `, the last ${join} ${unitWords(next, 1, "target", beams)}` : ` ${join} ${unitWords(next, 1, "target", beams)}`;
        k++;
      }
      // the last note still ties on: to a note not written yet, or over the bar-line into the next bar (second review of PR #30)
      if (tiesOut(units[k]!) && k + 1 >= units.length) {
        const end = opts.tieOverBarline ? "over the bar-line" : "to the next note";
        text += units[k]!.type === "beam" ? `, the last tied ${end}` : ` tied ${end}`;
      }
      parts.push(text);
      i = k + 1;
      continue;
    }
    const key = unitKey(u);
    let n = 1;
    while (i + n < units.length && unitKey(units[i + n]!) === key && !tiesOut(units[i + n]!)) n++;
    parts.push(unitWords(u, n, "whole", beams));
    i += n;
  }
  return listInWords(parts, true);
}

/** Several bars: "Bar 1: four quavers beamed together followed by a minim. Bar 2: empty." */
export const barsInWords = (bars: WordEvent[][], opts: { beams?: boolean } = {}): string =>
  bars.map((b, i) => `Bar ${i + 1}: ${b.length ? rhythmInWords(b, { ...opts, tieOverBarline: (bars[i + 1]?.length ?? 0) > 0 }) : "empty"}.`).join(" ");
