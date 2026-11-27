/**
 * Rhythms in words, for prompts and screen-reader descriptions: "four quavers, a crotchet and four quavers", not "a quaver, then a quaver,
 * then a quaver, then a quaver, then a crotchet, …".
 *
 * Consecutive events are merged only when nothing musical tells them apart: the same kind (note or rest), value and dots, and the same
 * beaming (an unbeamed note never merges with a beamed one, and a beamed group is one unit). A tie is never merged away: tied notes are
 * named one by one ("a crotchet tied to a quaver"). Tuplets keep their name and contents ("a triplet of three quavers"). Pitch is not
 * described here: these helpers are for rhythm, where every note is drawn on one line.
 */

/** The structural part of a notation or rhythm-response event that the words depend on. */
export interface WordEvent {
  kind: string;
  duration?: { value: string; dots?: number };
  beam?: string;
  tieToNext?: boolean;
  wholeBar?: boolean;
  actual?: number;
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
export const tupletName = (actual: number): string => TUPLET_NAMES[actual] ?? `group of ${actual}`;

type Unit =
  | { type: "single"; ev: WordEvent }
  | { type: "beam"; members: WordEvent[] }
  | { type: "tie"; members: WordEvent[] }
  | { type: "tuplet"; ev: WordEvent };

const plainKey = (e: WordEvent) => `${e.kind}|${e.duration?.value}|${e.duration?.dots ?? 0}|${e.wholeBar ? "bar" : ""}|${e.tieToNext ? "tie" : ""}`;
const unitKey = (u: Unit): string | null =>
  u.type === "single" ? `s:${plainKey(u.ev)}` : u.type === "beam" ? `b:${u.members.map(plainKey).join(",")}` : u.type === "tuplet" ? `t:${u.ev.actual}:${(u.ev.events ?? []).map(plainKey).join(",")}` : null;

/** One plain note or rest, `n` times: "a dotted minim", "two quaver rests", "a whole-bar rest". */
function plainWords(e: WordEvent, n: number): string {
  if (e.kind === "rest" && e.wholeBar) return n === 1 ? "a whole-bar rest" : `${countWord(n)} whole-bar rests`;
  if (!e.duration) return n === 1 ? `a ${e.kind}` : `${countWord(n)} ${e.kind}s`;
  const w = durationInWords(e.duration.value, e.duration.dots ?? 0, { rest: e.kind === "rest", plural: n > 1 });
  const tie = e.tieToNext ? " tied to the next note" : "";
  return `${n === 1 ? article(w) : countWord(n)} ${w}${tie}`;
}

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
    } else if (e.tieToNext && e.kind !== "rest" && i + 1 < events.length && events[i + 1]!.kind !== "tuplet") {
      const members = [e];
      while (members[members.length - 1]!.tieToNext && i + 1 < events.length && events[i + 1]!.kind !== "tuplet") members.push(events[++i]!);
      out.push({ type: "tie", members });
    } else out.push({ type: "single", ev: e });
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

function unitWords(u: Unit, n: number): string {
  if (u.type === "single") return plainWords(u.ev, n);
  if (u.type === "tie") return u.members.map((m) => plainWords({ ...m, tieToNext: false }, 1)).join(" tied to ");
  if (u.type === "beam") {
    const r = runs(u.members);
    const uniform = r.length === 1 && !r[0]!.e.tieToNext && r[0]!.e.kind === "note" && r[0]!.e.duration;
    if (uniform) {
      const value = durationInWords(r[0]!.e.duration!.value, r[0]!.e.duration!.dots ?? 0, { plural: true });
      if (n === 1) return `${countWord(r[0]!.n)} ${value} beamed together`;
      return r[0]!.n === 2 ? `${countWord(n)} pairs of beamed ${value}` : `${countWord(n)} groups of ${countWord(r[0]!.n)} beamed ${value}`;
    }
    const inner = listInWords(r.map((x) => plainWords(x.e, x.n)));
    return n === 1 ? `a beamed group (${inner})` : `${countWord(n)} beamed groups, each (${inner})`;
  }
  const name = tupletName(u.ev.actual ?? 3);
  const inner = u.ev.events ?? [];
  const r = runs(inner);
  const uniform = r.length === 1 && r[0]!.e.kind === "note" && !r[0]!.e.tieToNext && r[0]!.e.duration;
  const contents = uniform ? `of ${countWord(r[0]!.n)} ${durationInWords(r[0]!.e.duration!.value, r[0]!.e.duration!.dots ?? 0, { plural: r[0]!.n > 1 })}` : `(${listInWords(r.map((x) => plainWords(x.e, x.n)))})`;
  return n === 1 ? `${withArticle(name)} ${contents}` : `${countWord(n)} ${name}s${uniform ? ` ${contents} each` : `, each ${contents}`}`;
}

/**
 * A run of events in words: "four quavers, a crotchet and four quavers". With `beams`, notes joined by a beam are named as one group
 * ("four quavers beamed together", "a beamed group (a dotted quaver, a semiquaver and a quaver)") so a listener hears the grouping as a
 * sighted reader sees it; without, beams are ignored. Two parts read "A followed by B".
 */
export function rhythmInWords(events: WordEvent[], opts: { beams?: boolean } = {}): string {
  const units = unitsOf(events, opts.beams ?? false);
  const parts: string[] = [];
  for (let i = 0; i < units.length; ) {
    const key = unitKey(units[i]!);
    let n = 1;
    while (key !== null && i + n < units.length && unitKey(units[i + n]!) === key) n++;
    parts.push(unitWords(units[i]!, n));
    i += n;
  }
  return listInWords(parts, true);
}

/** Several bars: "Bar 1: four quavers beamed together followed by a minim. Bar 2: empty." */
export const barsInWords = (bars: WordEvent[][], opts: { beams?: boolean } = {}): string =>
  bars.map((b, i) => `Bar ${i + 1}: ${b.length ? rhythmInWords(b, opts) : "empty"}.`).join(" ");
