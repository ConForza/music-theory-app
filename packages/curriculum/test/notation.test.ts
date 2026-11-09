import { describe, expect, it } from "vitest";
import { loadCurriculum } from "../src/load.ts";
import { buildIndex } from "../src/model.ts";
import { NotationFragment, NotationScore } from "../src/schema.ts";
import { checkFragment, checkScore, type Report } from "../src/verify-music.ts";

const ix = buildIndex(loadCurriculum().curriculum!);
const G5 = ix.cumulativeScope.get(5)!;
const G1 = ix.cumulativeScope.get(1)!;

type Ev = Record<string, unknown>;
const n = (pitch: string, value = "crotchet", extra: Ev = {}) => ({ kind: "note", pitch, duration: { value, dots: (extra.dots as number) ?? 0 }, ...extra, dots: undefined });
const clean = (e: Ev) => JSON.parse(JSON.stringify(e)) as Ev;
const note = (pitch: string, value = "crotchet", extra: Ev = {}) => clean(n(pitch, value, extra));
const rest = (value = "crotchet", extra: Ev = {}) => ({ kind: "rest", duration: { value, dots: 0 }, ...extra });
const frag = (measures: unknown[], extra: Ev = {}) =>
  NotationFragment.parse({ clef: "treble", textAlternative: "test", measures: measures.map((m) => (Array.isArray(m) ? { events: m } : m)), ...extra });

function run(music: NotationFragment, scope = G5) {
  const out: Array<{ code: string; severity?: string }> = [];
  const report: Report = (code, _w, _m, severity = "error") => out.push({ code, severity });
  checkFragment(music, scope, "test", report);
  return out.filter((x) => x.severity !== "warning").map((x) => x.code);
}

describe("notation contract: parsing and exact bar durations, Grades 1–5", () => {
  it("G1: beamed quavers in 2/4", () => {
    expect(run(frag([[note("C5", "quaver", { beam: "begin" }), note("D5", "quaver", { beam: "end" }), note("E5")]], { timeSignature: "2/4" }))).toEqual([]);
  });

  it("G1: a tonic triad is one simultaneous chord event, counted once", () => {
    const chord = { kind: "chord", notes: [{ pitch: "C4" }, { pitch: "E4" }, { pitch: "G4" }], duration: { value: "semibreve", dots: 0 } };
    expect(run(frag([[chord]], { timeSignature: "4/4" }))).toEqual([]);
  });

  it("G1: a whole-bar semibreve rest fills a bar of 3/4 (and a plain semibreve rest does not)", () => {
    expect(run(frag([[rest("semibreve", { wholeBar: true })]], { timeSignature: "3/4" }), G1)).toEqual([]);
    expect(run(frag([[rest("semibreve")]], { timeSignature: "3/4" }), G1)).toContain("BAR_DURATION");
    expect(run(frag([[rest("semibreve", { wholeBar: true }), note("C5")]], { timeSignature: "3/4" }), G1)).toContain("WHOLE_BAR_REST");
  });

  it("G1: an accidental carries through a tie over the bar-line, but not to a later reattack", () => {
    const tied = (later: Ev) =>
      frag([[note("F#4", "minim", { writtenAccidental: "sharp", tieToNext: true })], [note("F#4"), later]], { timeSignature: "2/4" });
    expect(run(tied(note("F4")), G1)).toEqual([]); // F natural after the tie: correct
    expect(run(tied(note("F#4")), G1)).toContain("ACCIDENTAL_MISSING"); // must be written again
    expect(run(tied(note("F#4", "crotchet", { writtenAccidental: "sharp" })), G1)).toEqual([]);
  });

  it("ties must join the same pitch", () => {
    expect(run(frag([[note("E4", "minim", { tieToNext: true })], [note("F4", "minim")]], { timeSignature: "2/4" }))).toContain("TIE_PITCH_MISMATCH");
  });

  it("G2: a triplet group fills one crotchet beat; a wrong group does not", () => {
    const triplet = (count: number) => ({ kind: "tuplet", actual: 3, normal: 2, events: Array.from({ length: count }, () => note("A4", "quaver")) });
    expect(run(frag([[triplet(3), note("A4")]], { timeSignature: "2/4" }))).toEqual([]);
    expect(run(frag([[triplet(4), note("A4")]], { timeSignature: "2/4" }))).toContain("BAR_DURATION");
  });

  it("G3: compound time with a dotted-crotchet rest and a beamed group", () => {
    const m = [rest("crotchet"), rest("quaver"), note("C5", "quaver", { beam: "begin" }), note("D5", "quaver", { beam: "continue" }), note("E5", "quaver", { beam: "end" })];
    expect(run(frag([m], { timeSignature: "6/8" }))).toEqual([]);
  });

  it("G4: duplet in 6/8, breve and breve whole-bar rest in 4/2, double dots", () => {
    const duplet = { kind: "tuplet", actual: 2, normal: 3, events: [note("G4", "quaver"), note("G4", "quaver")] };
    expect(run(frag([[duplet, note("G4", "crotchet", { dots: 1 })]], { timeSignature: "6/8" }))).toEqual([]);
    expect(run(frag([[note("G4", "breve")], [rest("breve", { wholeBar: true })]], { timeSignature: "4/2" }))).toEqual([]);
    expect(run(frag([[note("G4", "crotchet", { dots: 2 }), note("G4", "semiquaver")]], { timeSignature: "2/4" }))).toEqual([]);
  });

  it("G4 limits: a double-dotted note is out of scope in Grade 1", () => {
    expect(run(frag([[note("G4", "crotchet", { dots: 2 }), note("G4", "semiquaver")]], { timeSignature: "2/4" }), G1)).toContain("FRAGMENT_SCOPE");
  });

  it("G5: quintuplet semiquavers and 7/8 grouped 2+2+3", () => {
    const quint = { kind: "tuplet", actual: 5, normal: 4, events: Array.from({ length: 5 }, (_, i) => note("E5", "semiquaver", { beam: i === 0 ? "begin" : i === 4 ? "end" : "continue" })) };
    expect(run(frag([[quint, note("E5")]], { timeSignature: "2/4" }))).toEqual([]);
    const q = (b: string) => note("D5", "quaver", { beam: b });
    expect(run(frag([[q("begin"), q("end"), q("begin"), q("end"), q("begin"), q("continue"), q("end")]], { timeSignature: "7/8" }))).toEqual([]);
  });

  it("voices must each fill the bar", () => {
    const good = { voices: [{ id: "s", events: [note("E5", "minim"), note("D5", "minim")] }, { id: "a", events: [note("C5"), note("C5"), note("B4", "minim")] }] };
    const bad = { voices: [{ id: "s", events: [note("E5", "minim"), note("D5", "minim")] }, { id: "a", events: [note("C5"), note("B4", "minim")] }] };
    expect(run(frag([good], { timeSignature: "4/4" }))).toEqual([]);
    expect(run(frag([bad], { timeSignature: "4/4" }))).toContain("BAR_DURATION");
  });

  it("beams must be well formed and only join beamable values", () => {
    expect(run(frag([[note("C5", "quaver", { beam: "begin" }), note("D5", "quaver"), note("E5")]], { timeSignature: "2/4" }))).toContain("BEAM_MALFORMED");
    expect(run(frag([[note("C5", "crotchet", { beam: "begin" }), note("D5", "crotchet", { beam: "end" })]], { timeSignature: "2/4" }))).toContain("BEAM_MALFORMED");
  });

  it("annotations (ornament sign, grace note, articulation, slur, dynamic) parse and are scope-checked", () => {
    const m = [note("C5", "minim", { ornament: "trill", slur: "start", dynamic: "mf" }), note("D5", "minim", { grace: { kind: "acciaccatura", pitches: ["E5"] }, articulations: ["accent"], slur: "stop" })];
    expect(run(frag([m], { timeSignature: "4/4" }))).toEqual([]);
    expect(run(frag([m], { timeSignature: "4/4" }), G1)).toContain("FRAGMENT_SCOPE");
  });

  it("schema rejects a measure with both events and voices, and unknown event fields", () => {
    expect(NotationFragment.safeParse({ clef: "treble", textAlternative: "x", measures: [{ events: [note("C5")], voices: [] }] }).success).toBe(false);
    expect(NotationFragment.safeParse({ clef: "treble", textAlternative: "x", measures: [{ events: [{ ...note("C5"), colour: "red" }] }] }).success).toBe(false);
  });

  it("scores align staves", () => {
    const stave = (clef: string, ts: string, bars: number) => ({ clef, timeSignature: ts, textAlternative: "x", measures: Array.from({ length: bars }, () => ({ events: [note(clef === "bass" ? "C3" : "C5", "semibreve")] })) });
    const ok = NotationScore.parse({ staves: [{ id: "u", label: "Upper", music: stave("treble", "4/4", 2) }, { id: "l", label: "Lower", music: stave("bass", "4/4", 2) }], textAlternative: "x" });
    const out: string[] = [];
    checkScore(ok, G5, "s", (code) => out.push(code));
    expect(out).toEqual([]);
    const bad = NotationScore.parse({ staves: [{ id: "u", label: "Upper", music: stave("treble", "4/4", 2) }, { id: "l", label: "Lower", music: stave("bass", "4/4", 1) }], textAlternative: "x" });
    const out2: string[] = [];
    checkScore(bad, G5, "s", (code) => out2.push(code));
    expect(out2).toContain("SCORE_ALIGNMENT");
  });
});
