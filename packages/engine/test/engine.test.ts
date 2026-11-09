import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { buildIndex, loadCurriculum, ExerciseItem, type ExerciseItem as Item } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import {
  canonicalResponse,
  EngineError,
  generateItem,
  generatorTemplateIds,
  gradeItem,
  GRADERS,
  inputFor,
  parseGeneratedItemId,
  solutionFor,
  wrongResponse,
  type LearnerResponse,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const fixtures: Item[] = JSON.parse(readFileSync(join(here, "../../curriculum/test/fixtures/family-items.json"), "utf8")).map((x: unknown) => ExerciseItem.parse(x));
const lessonItems = curriculum!.lessons.flatMap((l) => [...l.content.guided, ...l.content.independent]);
const standalone = curriculum!.items.map((i) => i.content.item);
const showcase = (curriculum as unknown as { showcase?: Array<{ content: { items: Item[] } }> }).showcase?.flatMap((s) => s.content.items) ?? [];
const authored = [...fixtures, ...lessonItems, ...standalone, ...showcase];
const LEAKY_KEYS = ["accepted", "correctOptionIds", "acceptedIntervals", "acceptedChords", "acceptedPitches", "acceptedVoicings", "acceptedTypes"];

describe("grader registry", () => {
  it("implements every grader in engine.json and every family's grader", () => {
    for (const g of curriculum!.engine.graders) expect(GRADERS[g.id], g.id).toBeDefined();
    for (const f of curriculum!.families.families) expect(GRADERS[f.graderId], f.id).toBeDefined();
    expect(Object.keys(GRADERS).sort()).toEqual(curriculum!.engine.graders.map((g) => g.id).sort());
  });
  it("registers all 22 families", () => expect(curriculum!.families.families).toHaveLength(22));
});

describe("authored items: correct answers pass, wrong answers fail, inputs never leak answers", () => {
  for (const item of authored) {
    it(item.id, () => {
      const input = inputFor(ix, item);
      const json = JSON.stringify(input);
      for (const k of LEAKY_KEYS) expect(json.includes(`"${k}"`), `${k} in input`).toBe(false);
      const good = gradeItem(ix, item, canonicalResponse(ix, item));
      expect(good.correct, JSON.stringify(good)).toBe(true);
      expect(good.message).toBe(item.feedback.correct);
      const bad = wrongResponse(ix, item);
      if (bad) {
        const res = gradeItem(ix, item, bad);
        expect(res.correct).toBe(false);
        expect(res.message.length).toBeGreaterThan(0);
      }
      expect(solutionFor(ix, item).length).toBeGreaterThan(5);
    });
  }
});

describe("covers every family with a real item (fixtures, lessons, standalone or showcase)", () => {
  it("has an item for each of the 22 families", () => {
    const fams = new Set(authored.map((i) => ix.templates.get(i.templateId)!.familyId));
    for (const f of curriculum!.families.families) expect(fams.has(f.id), f.id).toBe(true);
  });
});

describe("generation", () => {
  const ids = generatorTemplateIds(ix);
  it("has a generator for every family", () => {
    const fams = new Set(ids.map((id) => ix.templates.get(id)!.familyId));
    for (const f of curriculum!.families.families) expect(fams.has(f.id), f.id).toBe(true);
  });
  for (const id of ids) {
    it(`${id}: deterministic, valid and solvable for many seeds`, () => {
      const prompts = new Set<string>();
      for (let seed = 0; seed < 25; seed++) {
        const a = generateItem(ix, id, seed * 7919 + 13);
        const b = generateItem(ix, id, seed * 7919 + 13);
        expect(b).toEqual(a);
        expect(parseGeneratedItemId(a.item.id)).toEqual({ templateId: id, version: a.item.templateVersion, seed: seed * 7919 + 13 });
        expect(ExerciseItem.safeParse(a.item).success).toBe(true);
        expect(gradeItem(ix, a.item, canonicalResponse(ix, a.item)).correct).toBe(true);
        expect(a.meta.review.humanReviewed).toBe(false);
        prompts.add(JSON.stringify([a.item.prompt, a.item.music, a.item.answer]));
      }
      expect(prompts.size, "variety across seeds").toBeGreaterThan(1);
    });
  }
  it("rejects stale template versions and bad seeds", () => {
    expect(() => generateItem(ix, "t.g1.note-read", 1, { version: 99 })).toThrow(EngineError);
    expect(() => generateItem(ix, "t.g1.note-read", -1)).toThrow(EngineError);
  });
});

// ---------------------------------------------------------------------------
// Golden grading cases
// ---------------------------------------------------------------------------

const item = (templateId: string, answer: unknown, extra: Record<string, unknown> = {}): Item =>
  ExerciseItem.parse({ id: "i.test.case", templateId, templateVersion: 1, seed: null, evidence: "independent", prompt: "Test.", answer, hints: [], feedback: { correct: "Yes.", mistakes: {}, fallback: "No." }, ...extra });
const grade = (it: Item, r: LearnerResponse) => gradeItem(ix, it, r);
const stave = (clef: string, events: unknown[], extra: Record<string, unknown> = {}) => ({ clef, measures: [{ events }], textAlternative: "x", ...extra });
const sb = (pitch: string, extra: Record<string, unknown> = {}) => ({ kind: "note", pitch, duration: { value: "semibreve" }, ...extra });
const q = (value: string, extra: Record<string, unknown> = {}) => ({ kind: "note", duration: { value, dots: 0 }, ...extra });

describe("golden grading: pitch and spelling", () => {
  it("reads the note from the printed stave, not from a stored answer", () => {
    const it_ = item("t.g1.note-read", { kind: "pitch", accepted: ["G4"], octaveSensitive: false, spellingSensitive: true }, { music: stave("treble", [sb("G4")]) as never });
    expect(grade(it_, { kind: "pitch", pitch: "G" }).correct).toBe(true);
    expect(grade(it_, { kind: "pitch", pitch: "G5" }).correct).toBe(true); // octave-insensitive
    const bass = grade(it_, { kind: "pitch", pitch: "B" });
    expect(bass.correct).toBe(false);
    expect(bass.category).toBe("clef-confusion"); // G4's position (2nd line) is B in the bass clef
  });
  it("middle C in each clef", () => {
    for (const clef of ["treble", "bass", "alto", "tenor"]) {
      const it_ = item("t.g5.four-clef-read", { kind: "pitch", accepted: ["C4"], octaveSensitive: true, spellingSensitive: true }, { music: stave(clef, [sb("C4")]) as never });
      expect(grade(it_, { kind: "pitch", pitch: "C4" }).correct, clef).toBe(true);
      expect(grade(it_, { kind: "pitch", pitch: "C5" }).correct, clef).toBe(false);
    }
  });
  it("distinguishes equivalent pitches from equivalent written notes", () => {
    const spelt = item("t.g4.enharmonic", { kind: "pitch", reference: "F#4", relation: "different-spelling", accepted: ["Gb4", "Ex4"], octaveSensitive: false, spellingSensitive: true });
    expect(grade(spelt, { kind: "pitch", pitch: "Gb" }).correct).toBe(true);
    expect(grade(spelt, { kind: "pitch", pitch: "Ex" }).correct).toBe(true);
    expect(grade(spelt, { kind: "pitch", pitch: "F#" }).category).toBe("same-spelling-given");
    expect(grade(spelt, { kind: "pitch", pitch: "G" }).category).toBe("not-same-pitch");
  });
  it("keyboard: a key stands for all its spellings unless spelling is assessed", () => {
    const sound = item("t.g1.keyboard", { kind: "pitch", reference: "F#4", relation: "same-sound", accepted: ["F#4", "Gb4"], octaveSensitive: false, spellingSensitive: false });
    expect(grade(sound, { kind: "keyboard", key: 54 }).correct).toBe(true); // F#4 = 4*12+6
    expect(grade(sound, { kind: "keyboard", key: 66 }).correct).toBe(true); // any octave
    expect(grade(sound, { kind: "keyboard", key: 55 }).category).toBe("black-key-neighbour");
    expect(() => grade(sound, { kind: "keyboard", key: 54, spelling: "G4" })).toThrow(EngineError);
  });
  it("accidental state: persists in the bar, stops at the bar-line, diagnoses the rule broken", () => {
    const music = { clef: "treble", timeSignature: "2/4", measures: [{ events: [{ kind: "note", pitch: "F#4", writtenAccidental: "sharp", duration: { value: "crotchet" } }, { kind: "note", pitch: "F#4", duration: { value: "crotchet" } }] }, { events: [{ kind: "note", pitch: "F4", duration: { value: "crotchet" }, label: "*" }, { kind: "note", pitch: "G4", duration: { value: "crotchet" } }] }], textAlternative: "x" };
    const it_ = item("t.g1.accidental-state", { kind: "pitch", accepted: ["F4"], octaveSensitive: false, spellingSensitive: true }, { music: music as never });
    expect(grade(it_, { kind: "pitch", pitch: "F" }).correct).toBe(true);
    expect(grade(it_, { kind: "pitch", pitch: "F#" }).category).toBe("accidental-carried-over-barline");
  });
  it("staff placement accepts every valid octave and diagnoses counting from the top", () => {
    const it_ = item("t.g1.note-write", { kind: "staff-position", clef: "treble", target: { step: "G", alter: 0, position: "any", maxLedgerLines: 0 }, accepted: ["G4"], octaveSensitive: true });
    expect(grade(it_, { kind: "staff-position", pitch: "G4" }).correct).toBe(true);
    expect(grade(it_, { kind: "staff-position", pitch: "G5" }).correct).toBe(true); // the space just above the stave needs no ledger line
    expect(grade(it_, { kind: "staff-position", pitch: "D5" }).category).toBe("counted-from-top"); // 2nd line from the top
    expect(grade(it_, { kind: "staff-position", pitch: "G#4" }).category).toBe("accidental-missing");
  });
});

describe("golden grading: intervals, chords and cadences", () => {
  it("identifies by spelling: C–F♯ is an augmented 4th, C–G♭ a diminished 5th", () => {
    const aug = item("t.g5.interval-any", { kind: "interval", task: "identify", lower: "C4", upper: "F#4", acceptedIntervals: ["A4"] });
    expect(grade(aug, { kind: "interval-name", number: 4, quality: "A" }).correct).toBe(true);
    const bad = grade(aug, { kind: "interval-name", number: 5, quality: "d" });
    expect(bad.correct).toBe(false);
    expect(bad.category).toBe("enharmonic-spelling");
  });
  it("accepts both compound naming styles", () => {
    const it_ = item("t.g5.interval-compound", { kind: "interval", task: "identify", lower: "C4", upper: "E5", acceptedIntervals: ["M10", "cM3"] });
    expect(grade(it_, { kind: "interval-name", number: 10, quality: "M" }).correct).toBe(true);
    expect(grade(it_, { kind: "interval-name", number: 3, quality: "M", compound: true }).correct).toBe(true);
    expect(grade(it_, { kind: "interval-name", number: 3, quality: "M" }).category).toBe("compound-arithmetic");
  });
  it("building an interval rejects the enharmonic spelling", () => {
    const it_ = item("t.g5.interval-any", { kind: "interval", task: "build", lower: "Ab4", target: "A6", direction: "up", acceptedPitches: ["F#5"] });
    expect(grade(it_, { kind: "staff-position", pitch: "F#5" }).correct).toBe(true);
    expect(grade(it_, { kind: "staff-position", pitch: "Gb5" }).category).toBe("enharmonic-spelling");
  });
  it("chord identification from any voicing; inversion from the bass", () => {
    const it_ = item("t.g5.chord-identify", { kind: "chord", task: "identify", key: "D major", pitches: ["F#3", "A3", "D4", "F#4"], acceptedChords: [{ roman: "I", inversion: "b" }] });
    expect(grade(it_, { kind: "chord-name", roman: "I", inversion: "b" }).correct).toBe(true);
    expect(grade(it_, { kind: "chord-name", roman: "I", inversion: "a" }).category).toBe("inversion-misread");
  });
  it("chord building accepts any voicing with the right notes and bass, and spots an unraised leading note", () => {
    const it_ = item("t.g5.chord-build", { kind: "chord", task: "build", key: "C major", target: { roman: "ii", inversion: "c" }, acceptedVoicings: [["A3", "D4", "F4"]] });
    expect(grade(it_, { kind: "chord-notes", pitches: ["A2", "F3", "D4", "A4"] }).correct).toBe(true);
    expect(grade(it_, { kind: "chord-notes", pitches: ["D3", "F3", "A3"] }).category).toBe("inversion-misread");
    const minor = item("t.g5.chord-build", { kind: "chord", task: "build", key: "A minor", target: { roman: "V", inversion: "a" }, acceptedVoicings: [["E3", "G#3", "B3"]] });
    expect(grade(minor, { kind: "chord-notes", pitches: ["E3", "G3", "B3"] }).category).toBe("leading-note-not-raised");
  });
  it("cadences: every valid chord choice is accepted", () => {
    const music = { clef: "treble", key: "C major", measures: [{ events: [{ kind: "note", pitch: "D5", duration: { value: "minim" }, label: "A" }, { kind: "note", pitch: "C5", duration: { value: "minim" }, label: "B" }] }], textAlternative: "x" };
    const it_ = item("t.g5.cadence-chords", { kind: "chord-progression", key: "C major", points: [{ label: "A", melodyPitches: ["D5"], accepted: ["V"] }, { label: "B", melodyPitches: ["C5"], accepted: ["I"] }], cadences: [{ labels: ["A", "B"], acceptedTypes: ["perfect"] }] }, { music: music as never });
    expect(grade(it_, { kind: "progression", chords: { A: "V", B: "I" } }).correct).toBe(true);
    expect(grade(it_, { kind: "progression", chords: { A: "IV", B: "I" } }).category).toBe("chord-lacks-melody-note");
    expect(grade(it_, { kind: "progression", chords: { A: "ii", B: "IV" } }).category).toBe("non-cadential-pair");
    expect(grade(it_, { kind: "progression", chords: { A: "ii", B: "I" } }).category).toBe("non-cadential-pair");
  });
});

describe("golden grading: scales, transposition and chromatic", () => {
  const melodic = item("t.g3.scale-build-minor", { kind: "pitch-sequence", clef: "treble", key: "D minor", accepted: [["D4", "E4", "F4", "G4", "A4", "B4", "C#5", "D5", "C5", "Bb4", "A4", "G4", "F4", "E4", "D4"]], derivation: { rule: "scale", key: "D minor", form: "melodic", direction: "ascending-descending", start: "D4" } });
  it("melodic minor up and down", () => {
    expect(grade(melodic, { kind: "pitch-sequence", pitches: "D4 E4 F4 G4 A4 B4 C#5 D5 C5 Bb4 A4 G4 F4 E4 D4".split(" ") }).correct).toBe(true);
    expect(grade(melodic, { kind: "pitch-sequence", pitches: "D4 E4 F4 G4 A4 B4 C#5 D5 C#5 B4 A4 G4 F4 E4 D4".split(" ") }).category).toBe("melodic-descent-not-restored");
    expect(grade(melodic, { kind: "pitch-sequence", pitches: "D4 E4 F4 G4 A4 Bb4 C#5 D5 C#5 Bb4 A4 G4 F4 E4 D4".split(" ") }).category).toBe("wrong-minor-form");
  });
  it("rejects an enharmonically equal but misspelt scale", () => {
    const it_ = item("t.g2.scale-build-major", { kind: "pitch-sequence", clef: "treble", key: "F major", accepted: [["F4", "G4", "A4", "Bb4", "C5", "D5", "E5", "F5"]], derivation: { rule: "scale", key: "F major", form: "major", direction: "ascending", start: "F4" } });
    const r = grade(it_, { kind: "pitch-sequence", pitches: ["F4", "G4", "A4", "A#4", "C5", "D5", "E5", "F5"] });
    expect(r.correct).toBe(false);
    expect(r.category).toBe("letter-skipped-or-repeated");
    expect(r.marks?.find((m) => m.index === 3)?.ok).toBe(false);
  });
  it("chromatic: any rule-compliant spelling", () => {
    const it_ = item("t.g4.chromatic-scale", { kind: "pitch-sequence", clef: "treble", accepted: [["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4", "C5"]], derivation: { rule: "chromatic", start: "C4", direction: "ascending" } });
    expect(grade(it_, { kind: "pitch-sequence", pitches: "C4 Db4 D4 Eb4 E4 F4 Gb4 G4 Ab4 A4 Bb4 B4 C5".split(" ") }).correct).toBe(true);
    expect(grade(it_, { kind: "pitch-sequence", pitches: "C4 C#4 D4 D#4 E4 E#4 F#4 G4 G#4 A4 A#4 B4 C5".split(" ") }).correct).toBe(true);
    expect(grade(it_, { kind: "pitch-sequence", pitches: "C4 C#4 Cx4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5".split(" ") }).category).toBe("letter-used-three-times");
  });
  it("instrument transposition: notes and key signature", () => {
    const music = { clef: "treble", key: "C major", measures: [{ events: ["C4", "E4", "F4", "G4"].map((p) => ({ kind: "note", pitch: p, duration: { value: "crotchet" } })) }], textAlternative: "x" };
    const it_ = item("t.g5.instrument-transpose", { kind: "pitch-sequence", clef: "treble", key: "D major", accepted: [["D4", "F#4", "G4", "A4"]], derivation: { rule: "transpose", interval: "M2", direction: "up", sourceKey: "C major" } }, { music: music as never });
    expect(grade(it_, { kind: "pitch-sequence", pitches: ["D4", "F#4", "G4", "A4"], key: "D major" }).correct).toBe(true);
    expect(grade(it_, { kind: "pitch-sequence", pitches: ["D4", "F#4", "G4", "A4"] }).category).toBe("key-signature-missing");
    expect(grade(it_, { kind: "pitch-sequence", pitches: ["D4", "Gb4", "G4", "A4"], key: "D major" }).category).toBe("enharmonic-respelling");
    expect(grade(it_, { kind: "pitch-sequence", pitches: ["Bb3", "D4", "Eb4", "F4"], key: "Bb major" }).category).toBe("wrong-direction");
  });
});

describe("golden grading: rhythm", () => {
  it("bar completion accepts every convention-compliant answer", () => {
    const it_ = item("t.g1.bar-complete", { kind: "rhythm", task: "complete-bar", timeSignature: "3/4", given: [{ kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } }], accepted: [[{ events: [{ kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "B4", duration: { value: "minim", dots: 0 } }] }]], acceptAnyRuleCompliant: true });
    const ok = (events: unknown[]) => grade(it_, { kind: "rhythm", measures: [{ events: events as never }] });
    expect(ok([q("crotchet"), q("minim")]).correct).toBe(true);
    expect(ok([q("crotchet"), q("crotchet"), q("crotchet")]).correct).toBe(true);
    expect(ok([q("crotchet"), q("quaver", { beam: "begin" }), q("quaver", { beam: "end" }), { kind: "rest", duration: { value: "crotchet", dots: 0 } }]).correct).toBe(true);
    expect(ok([q("crotchet"), q("minim"), q("crotchet")]).category).toBe("bar-overfull");
    expect(ok([q("crotchet"), q("crotchet")]).category).toBe("bar-underfull");
    expect(ok([q("crotchet"), { kind: "rest", duration: { value: "minim", dots: 0 } }]).category).toBe("rest-grouping");
    expect(ok([q("minim"), q("crotchet")]).correct).toBe(false); // must keep the given crotchet first
  });
  it("irregular grouping: 3+2 and 2+3 both accepted in 5/8", () => {
    const beamed = (sizes: number[]) => sizes.flatMap((s) => Array.from({ length: s }, (_, i) => q("quaver", { beam: i === 0 ? "begin" : i === s - 1 ? "end" : "continue" })));
    const music = { presentation: "rhythm-line", clef: "treble", timeSignature: "5/8", measures: [{ events: Array.from({ length: 5 }, () => ({ kind: "note", pitch: "B4", duration: { value: "quaver" } })) }], textAlternative: "x" };
    const it_ = item("t.g5.irregular-grouping", { kind: "rhythm", task: "regroup", timeSignature: "5/8", accepted: [[{ events: beamed([3, 2]).map((e) => ({ ...e, pitch: "B4" })) as never }]], acceptAnyRuleCompliant: true }, { music: music as never });
    expect(grade(it_, { kind: "rhythm", measures: [{ events: beamed([3, 2]) as never }] }).correct).toBe(true);
    expect(grade(it_, { kind: "rhythm", measures: [{ events: beamed([2, 3]) as never }] }).correct).toBe(true);
    expect(grade(it_, { kind: "rhythm", measures: [{ events: beamed([4, 1]) as never }] }).correct).toBe(false);
    expect(grade(it_, { kind: "rhythm", measures: [{ events: [q("crotchet"), ...beamed([3])] as never }] }).correct).toBe(false); // sounds different
  });
  it("bar-lines and the final double bar-line", () => {
    const m = (vals: string[], extra = {}) => ({ events: vals.map((v) => ({ kind: "note", pitch: "B4", duration: { value: v, dots: 0 } })), ...extra });
    const it_ = item("t.g1.barlines", { kind: "rhythm", task: "place-barlines", timeSignature: "2/4", accepted: [[m(["crotchet", "crotchet"]), m(["minim"], { barline: "final" })]], acceptAnyRuleCompliant: false });
    expect(grade(it_, { kind: "barlines", after: [2], final: true }).correct).toBe(true);
    expect(grade(it_, { kind: "barlines", after: [2], final: false }).category).toBe("missing-final-double-barline");
    expect(grade(it_, { kind: "barlines", after: [1], final: true }).category).toBe("bar-underfull");
  });
  it("time signatures: simple/compound confusion", () => {
    const music = { presentation: "rhythm-line", clef: "treble", measures: [{ events: [0, 1].flatMap(() => [0, 1, 2].map((i) => ({ kind: "note", pitch: "B4", duration: { value: "quaver" }, beam: i === 0 ? "begin" : i === 2 ? "end" : "continue" }))) }], textAlternative: "x" };
    const it_ = item("t.g3.time-signature", { kind: "time-signature", accepted: ["6/8"] }, { music: music as never });
    expect(grade(it_, { kind: "time-signature", top: 6, bottom: 8 }).correct).toBe(true);
    expect(grade(it_, { kind: "time-signature", top: 3, bottom: 4 }).category).toBe("simple-compound-confusion");
  });
});

describe("safety and determinism", () => {
  const sample = fixtures[0]!;
  it("rejects malformed and mismatched answers with EngineError, never a crash", () => {
    const bads: unknown[] = [null, 42, "x", {}, { kind: "nope" }, { kind: "pitch", pitch: "H9" }, { kind: "pitch-sequence", pitches: Array(40).fill("C4") }, { kind: "choice", optionId: "zzz" }, { kind: "rhythm", measures: [] }];
    for (const b of bads) expect(() => gradeItem(ix, sample, b), JSON.stringify(b)).toThrow(EngineError);
  });
  it("arbitrary well-formed responses to every authored item either grade or throw EngineError, deterministically", () => {
    const arb = fc.oneof(
      fc.record({ kind: fc.constant("pitch"), pitch: fc.constantFrom("C", "F#", "Bb4", "Gx3", "Ebb5", "A") }),
      fc.record({ kind: fc.constant("staff-position"), pitch: fc.constantFrom("C4", "F#5", "Bb2", "G3") }),
      fc.record({ kind: fc.constant("pitch-sequence"), pitches: fc.array(fc.constantFrom("C4", "D4", "E4", "F#4", "Bb4"), { minLength: 1, maxLength: 16 }) }),
      fc.record({ kind: fc.constant("interval-name"), number: fc.integer({ min: 1, max: 15 }), quality: fc.constantFrom("m", "M", "P", "A", "d") }),
      fc.record({ kind: fc.constant("chord-name"), roman: fc.constantFrom("I", "ii", "IV", "V"), inversion: fc.constantFrom("a", "b", "c") }),
      fc.record({ kind: fc.constant("time-signature"), top: fc.integer({ min: 2, max: 12 }), bottom: fc.constantFrom(2, 4, 8) }),
      fc.record({ kind: fc.constant("rhythm"), measures: fc.array(fc.record({ events: fc.array(fc.record({ kind: fc.constantFrom("note", "rest"), duration: fc.record({ value: fc.constantFrom("minim", "crotchet", "quaver"), dots: fc.constantFrom(0, 1) }) }), { minLength: 1, maxLength: 6 }) }), { minLength: 1, maxLength: 2 }) }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...authored), arb, (it_, r) => {
        const run = () => {
          try {
            return JSON.stringify(gradeItem(ix, it_, r));
          } catch (e) {
            if (!(e instanceof EngineError)) throw e;
            return `E:${e.code}`;
          }
        };
        return run() === run();
      }),
      { numRuns: 400 },
    );
  });
});
