/**
 * Rhythms in words (music/describe.ts): consecutive identical elements are consolidated into natural musical language, and nothing that tells
 * two events apart musically (note or rest, value, dots, tie, beam, tuplet) is ever merged away.
 */
import { describe, expect, it } from "vitest";
import { music } from "../src/index.ts";

type E = music.WordEvent;
const n = (value: string, extra: Partial<E> & { dots?: number } = {}): E => ({ kind: "note", ...extra, duration: { value, dots: extra.dots ?? 0 } });
const r = (value: string, extra: Partial<E> & { dots?: number } = {}): E => ({ kind: "rest", ...extra, duration: { value, dots: extra.dots ?? 0 } });
const beamed = (...evs: E[]): E[] => evs.map((e, i) => ({ ...e, beam: i === 0 ? "begin" : i === evs.length - 1 ? "end" : "continue" }));
const triplet = (...evs: E[]): E => ({ kind: "tuplet", actual: 3, events: evs });
const words = (evs: E[], beams = false) => music.rhythmInWords(evs, { beams });

describe("consolidating repeated elements", () => {
  it("reads the brief's examples naturally", () => {
    expect(words([n("quaver"), n("quaver"), n("quaver"), n("quaver")])).toBe("four quavers");
    expect(words([n("crotchet"), n("crotchet"), n("minim")])).toBe("two crotchets followed by a minim");
    expect(words([r("quaver"), r("quaver")])).toBe("two quaver rests");
    expect(words([n("crotchet"), n("quaver"), n("quaver"), n("quaver"), n("quaver"), n("crotchet")])).toBe("a crotchet, four quavers and a crotchet");
  });

  it("reads the start of the bar in the reported 7/4 question as three groups, not nine notes", () => {
    const bar = [...beamed(n("quaver"), n("quaver"), n("quaver"), n("quaver")), n("crotchet"), ...beamed(n("quaver"), n("quaver"), n("quaver"), n("quaver"))];
    expect(words(bar)).toBe("four quavers, a crotchet and four quavers");
    expect(words(bar, true)).toBe("four quavers beamed together, a crotchet and four quavers beamed together");
  });

  it("uses the singular for one and the plural for more, with number words up to twelve", () => {
    expect(words([n("minim")])).toBe("a minim");
    expect(words([r("crotchet")])).toBe("a crotchet rest");
    expect(words(Array.from({ length: 12 }, () => n("semiquaver")))).toBe("twelve semiquavers");
    expect(words(Array.from({ length: 16 }, () => n("demisemiquaver")))).toBe("16 demisemiquavers");
    expect(words([])).toBe("");
  });
});

describe("musically significant distinctions are kept", () => {
  it("never merges a note with a rest of the same value", () => {
    expect(words([n("quaver"), r("quaver"), n("quaver")])).toBe("a quaver, a quaver rest and a quaver");
    expect(words([n("crotchet"), n("crotchet"), r("crotchet"), r("crotchet")])).toBe("two crotchets followed by two crotchet rests");
  });

  it("keeps dotted, double-dotted and plain values apart", () => {
    expect(words([n("crotchet", { dots: 1 }), n("crotchet", { dots: 1 }), n("crotchet")])).toBe("two dotted crotchets followed by a crotchet");
    expect(words([n("minim", { dots: 2 }), n("quaver")])).toBe("a double-dotted minim followed by a quaver");
    expect(words([r("crotchet", { dots: 1 })])).toBe("a dotted crotchet rest");
  });

  it("names tied notes one by one", () => {
    expect(words([n("crotchet", { tieToNext: true }), n("quaver"), n("quaver")])).toBe("a crotchet tied to a quaver followed by a quaver");
    expect(words([n("minim", { tieToNext: true }), n("minim", { tieToNext: true }), n("minim")])).toBe("a minim tied to a minim tied to a minim");
  });

  it("keeps a beamed group distinct from the same notes with flags, so a grouping change is heard", () => {
    const flags = words([n("quaver"), n("quaver"), n("quaver"), n("quaver")], true);
    const pairs = words(beamed(n("quaver"), n("quaver")).concat(beamed(n("quaver"), n("quaver"))), true);
    const four = words(beamed(n("quaver"), n("quaver"), n("quaver"), n("quaver")), true);
    expect(new Set([flags, pairs, four]).size).toBe(3);
    expect(pairs).toBe("two pairs of beamed quavers");
    expect(four).toBe("four quavers beamed together");
    expect(words(beamed(n("quaver", { dots: 1 }), n("semiquaver")), true)).toBe("a beamed group (a dotted quaver and a semiquaver)");
    // without `beams` the same notes read by value only
    expect(words(beamed(n("quaver"), n("quaver")).concat(beamed(n("quaver"), n("quaver"))))).toBe("four quavers");
  });

  it("keeps tuplets whole and says what is inside them", () => {
    expect(words([triplet(n("quaver"), n("quaver"), n("quaver")), n("crotchet")])).toBe("a triplet of three quavers followed by a crotchet");
    expect(words([triplet(n("quaver"), n("quaver"), n("quaver")), triplet(n("quaver"), n("quaver"), n("quaver"))])).toBe("two triplets of three quavers each");
    expect(words([triplet(n("quaver"), n("quaver"), r("quaver"))])).toBe("a triplet (two quavers and a quaver rest)");
    expect(words([{ kind: "tuplet", actual: 5, events: Array.from({ length: 5 }, () => n("semiquaver")) }])).toBe("a quintuplet of five semiquavers");
  });

  it("keeps a tie and a beam when the tie crosses into or out of a beamed group (first review of PR #30, P1)", () => {
    const beamedAfterTie = [n("crotchet", { tieToNext: true }), ...beamed(n("quaver"), n("quaver"))];
    const flagsAfterTie = [n("crotchet", { tieToNext: true }), n("quaver"), n("quaver")];
    expect(words(beamedAfterTie, true)).toBe("a crotchet tied into the first of two beamed quavers");
    expect(words(flagsAfterTie, true)).toBe("a crotchet tied to a quaver followed by a quaver");
    expect(words(beamedAfterTie, true)).not.toBe(words(flagsAfterTie, true));
    expect(words([...beamed(n("quaver"), n("quaver", { tieToNext: true })), n("crotchet")], true)).toBe("two quavers beamed together, the last tied to a crotchet");
    expect(words([...beamed(n("quaver"), n("quaver", { tieToNext: true })), ...beamed(n("quaver"), n("quaver"))], true)).toBe("two quavers beamed together, the last tied into the first of two beamed quavers");
    expect(words(beamed(n("quaver", { tieToNext: true }), n("quaver")), true)).toBe("a beamed group (a quaver tied to the next note and a quaver)");
    expect(words([n("minim", { tieToNext: true }), n("crotchet", { tieToNext: true }), ...beamed(n("quaver"), n("quaver"))], true)).toBe("a minim tied to a crotchet tied into the first of two beamed quavers");
    expect(words([n("crotchet", { tieToNext: true }), triplet(n("quaver"), n("quaver"), n("quaver"))])).toBe("a crotchet tied into the first note of a triplet of three quavers");
    // units joined by a tie are never counted together with their neighbours
    expect(words([n("crotchet"), n("crotchet"), n("crotchet", { tieToNext: true }), ...beamed(n("quaver"), n("quaver"))], true)).toBe("two crotchets followed by a crotchet tied into the first of two beamed quavers");
  });

  it("merges tuplets only when their ratio and inner beaming match, and says an unusual ratio in full (first review of PR #30, P3)", () => {
    const t = (normal: number, ...evs: E[]): E => ({ kind: "tuplet", actual: evs.length, normal, events: evs });
    expect(words([t(2, n("quaver"), n("quaver"), n("quaver")), t(4, n("quaver"), n("quaver"), n("quaver"))])).toBe("a triplet of three quavers followed by three quavers in the time of four");
    expect(words([t(3, n("quaver"), n("quaver"), n("quaver"), n("quaver")), t(3, n("quaver"), n("quaver"), n("quaver"), n("quaver"))])).toBe("two groups of four quavers in the time of three");
    expect(words([t(2, ...beamed(n("quaver"), n("quaver"), n("quaver"))), t(2, n("quaver"), n("quaver"), n("quaver"))])).toBe("a triplet of three quavers followed by a triplet of three quavers");
    expect(words([t(3, n("quaver"), n("quaver"))])).toBe("a duplet of two quavers");
  });

  it("reads a tie that has not reached its next note yet, and a tie over the bar-line (second review of PR #30, P2)", () => {
    expect(words([n("crotchet", { tieToNext: true })], true)).toBe("a crotchet tied to the next note");
    expect(words([n("minim"), n("crotchet", { tieToNext: true })], true)).toBe("a minim followed by a crotchet tied to the next note");
    expect(words(beamed(n("quaver"), n("quaver", { tieToNext: true })), true)).toBe("two quavers beamed together, the last tied to the next note");
    expect(music.barsInWords([[n("minim"), n("crotchet", { tieToNext: true })], [n("crotchet"), n("minim")]], { beams: true })).toBe(
      "Bar 1: a minim followed by a crotchet tied over the bar-line. Bar 2: a crotchet followed by a minim.",
    );
    // the tie is never silently dropped, so starting one always changes the words
    expect(words([n("crotchet", { tieToNext: true })], true)).not.toBe(words([n("crotchet")], true));
  });

  it("describes the beam inside a tuplet when beams are read (second review of PR #30, P3)", () => {
    const tb: E = { kind: "tuplet", actual: 3, normal: 2, events: beamed(n("quaver"), n("quaver"), n("quaver")) };
    const tf: E = { kind: "tuplet", actual: 3, normal: 2, events: [n("quaver"), n("quaver"), n("quaver")] };
    expect(words([tb], true)).toBe("a triplet of three beamed quavers");
    expect(words([tf], true)).toBe("a triplet of three quavers");
    expect(words([tb, tf], true)).toBe("a triplet of three beamed quavers followed by a triplet of three quavers");
    // a mixed-value group under one beam says so too (third review of PR #30)
    const mixed = [n("quaver"), n("semiquaver"), n("quaver", { dots: 1 })];
    const mixedBeamed: E = { kind: "tuplet", actual: 3, normal: 2, events: beamed(...mixed) };
    const mixedFlags: E = { kind: "tuplet", actual: 3, normal: 2, events: mixed };
    expect(words([mixedBeamed], true)).toBe("a triplet beamed together (a quaver, a semiquaver and a dotted quaver)");
    expect(words([mixedFlags], true)).toBe("a triplet (a quaver, a semiquaver and a dotted quaver)");
    expect(words([mixedBeamed, mixedBeamed], true)).toBe("two triplets, each beamed together (a quaver, a semiquaver and a dotted quaver)");
    expect(words([mixedBeamed], false)).toBe("a triplet (a quaver, a semiquaver and a dotted quaver)");
    const partly: E = { kind: "tuplet", actual: 3, normal: 2, events: [...beamed(n("quaver"), n("quaver")), n("quaver")] };
    expect(words([partly], true)).toBe("a triplet (two quavers beamed together followed by a quaver)");
  });

  it("names a whole-bar rest as such", () => {
    expect(words([r("semibreve", { wholeBar: true })])).toBe("a whole-bar rest");
  });
});

describe("bars and articles", () => {
  it("labels bars and says when one is empty", () => {
    expect(music.barsInWords([[n("crotchet"), n("crotchet")], []])).toBe("Bar 1: two crotchets. Bar 2: empty.");
  });

  it("chooses a or an by sound", () => {
    expect(["octave", "8th", "11th", "augmented 4th", "upper mordent", "unison", "major 3rd", "minim"].map(music.withArticle)).toEqual(["an octave", "an 8th", "an 11th", "an augmented 4th", "an upper mordent", "a unison", "a major 3rd", "a minim"]);
  });

  it("joins lists the British way, and two events in time as 'followed by'", () => {
    expect(music.listInWords(["a", "b", "c"])).toBe("a, b and c");
    expect(music.listInWords(["a", "b"])).toBe("a and b");
    expect(music.listInWords(["a", "b"], true)).toBe("a followed by b");
  });
});
