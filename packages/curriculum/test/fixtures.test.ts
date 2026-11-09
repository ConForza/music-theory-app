import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurriculum } from "../src/load.ts";
import { buildIndex } from "../src/model.ts";
import { AnswerSpec, ExerciseItem } from "../src/schema.ts";
import { verifyStandaloneItem } from "../src/verify-music.ts";

const ix = buildIndex(loadCurriculum().curriculum!);
const raw = JSON.parse(readFileSync(join(__dirname, "fixtures/family-items.json"), "utf8")) as unknown[];
const fixtures = raw.map((r) => ExerciseItem.parse(r));
const byId = (id: string) => structuredClone(fixtures.find((f) => f.id === `i.fixture.${id}`)!);
const codes = (item: ExerciseItem) => verifyStandaloneItem(ix, item, item.id).filter((i) => i.severity === "error").map((i) => i.code);

describe("one representative item per registered exercise family", () => {
  it("every family has a fixture whose answer kind matches the family contract", () => {
    for (const fam of ix.families.values()) {
      const match = fixtures.filter((f) => ix.templates.get(f.templateId)?.familyId === fam.id && (f.answer.kind === fam.answerKind || fam.answerKind === "choice"));
      expect(match.length, `no fixture for ${fam.id} (${fam.answerKind})`).toBeGreaterThan(0);
    }
  });

  it.each(fixtures.map((f) => [f.id, f] as const))("%s parses and verifies with no errors", (_id, item) => {
    expect(codes(item)).toEqual([]);
  });

  it("a plain scale answer needs no transposition derivation", () => {
    const parsed = AnswerSpec.safeParse({
      kind: "pitch-sequence",
      clef: "treble",
      key: "C major",
      accepted: [["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]],
      derivation: { rule: "scale", key: "C major", form: "major", direction: "ascending", start: "C4" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("derived answers catch wrong content in every answer kind", () => {
  it("scale: a wrongly spelt note, or a melodic descent that keeps the raised 7th", () => {
    const a = byId("scale-melodic");
    if (a.answer.kind !== "pitch-sequence") throw new Error();
    a.answer.accepted[0]![9] = "B4";
    expect(codes(a)).toContain("ANSWER_MISMATCH");
    const b = byId("scale-harmonic-desc");
    if (b.answer.kind !== "pitch-sequence") throw new Error();
    b.answer.accepted[0]![1] = "G5";
    expect(codes(b)).toContain("ANSWER_MISMATCH");
  });

  it("scale: melodic minor is out of scope for Grade 2 templates", () => {
    const a = byId("scale-melodic");
    a.templateId = "t.g2.scale-build-minor";
    if (a.answer.kind !== "pitch-sequence") throw new Error();
    expect(codes(a)).toContain("ANSWER_SCOPE");
  });

  it("chromatic: a letter used three times", () => {
    const a = byId("chromatic");
    if (a.answer.kind !== "pitch-sequence") throw new Error();
    a.answer.accepted[1] = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4", "C5"].map((p, i) => (i === 2 ? "Cx4" : p));
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("interval: compound arithmetic error and wrong built spelling", () => {
    const a = byId("interval-compound");
    if (a.answer.kind !== "interval") throw new Error();
    a.answer.acceptedIntervals = ["M10", "M11"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
    const b = byId("interval-build");
    if (b.answer.kind !== "interval") throw new Error();
    b.answer.acceptedPitches = ["Gb5"];
    expect(codes(b)).toContain("ANSWER_MISMATCH");
  });

  it("interval: Grade 1 intervals must be above the tonic", () => {
    const a = byId("interval-number");
    if (a.answer.kind !== "interval") throw new Error();
    a.answer.lower = "A4";
    a.answer.upper = "E5";
    expect(codes(a)).toContain("ANSWER_SCOPE");
  });

  it("chord: wrong inversion, and a voicing with the wrong bass", () => {
    const a = byId("chord-identify");
    if (a.answer.kind !== "chord") throw new Error();
    a.answer.acceptedChords = [{ roman: "I", inversion: "a" }];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
    const b = byId("chord-build");
    if (b.answer.kind !== "chord") throw new Error();
    b.answer.acceptedVoicings!.push(["D3", "F3", "A3"]);
    expect(codes(b)).toContain("ANSWER_MISMATCH");
  });

  it("chord: inversions are out of scope before Grade 5", () => {
    const a = byId("chord-identify");
    a.templateId = "t.g4.primary-triad";
    expect(codes(a)).toContain("ANSWER_SCOPE");
  });

  it("ornament: a lower mordent figure labelled as upper", () => {
    const a = byId("ornament-replace");
    if (a.answer.kind !== "ornament-sign") throw new Error();
    a.answer.writtenOut = ["D5", "C5", "D5"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("key signature: accepted keys that do not share a signature", () => {
    const a = byId("key-signature-name");
    if (a.answer.kind !== "key-signature") throw new Error();
    a.answer.accepted = ["F major", "C major"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("time signature: an accepted signature the bars do not fit", () => {
    const a = byId("time-signature");
    if (a.answer.kind !== "time-signature") throw new Error();
    a.answer.accepted = ["4/4"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("rhythm: a reference answer that over-fills the bar", () => {
    const a = byId("bar-builder");
    if (a.answer.kind !== "rhythm") throw new Error();
    a.answer.accepted[1]![0]!.events!.push({ kind: "note", pitch: "B4", duration: { value: "crotchet", dots: 0 } });
    expect(codes(a)).toContain("BAR_DURATION");
  });

  it("staff position: every valid position must be accepted", () => {
    const a = byId("note-write");
    if (a.answer.kind !== "staff-position") throw new Error();
    a.answer.accepted = ["C3"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("enharmonic: an accepted note that sounds different", () => {
    const a = byId("enharmonic");
    if (a.answer.kind !== "pitch") throw new Error();
    a.answer.accepted.push("C#4");
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });

  it("composite: a wrong sub-answer is reported against that part", () => {
    const a = byId("score");
    if (a.answer.kind !== "composite") throw new Error();
    const part = a.answer.parts[1]!.answer;
    if (part.kind !== "chord") throw new Error();
    part.acceptedChords = [{ roman: "IV", inversion: "a" }];
    const issues = verifyStandaloneItem(ix, a, a.id).filter((i) => i.severity === "error");
    expect(issues.some((i) => i.code === "ANSWER_MISMATCH" && i.where.endsWith("#second-chord"))).toBe(true);
  });

  it("cadence: a missing valid alternative", () => {
    const a = byId("cadence");
    if (a.answer.kind !== "chord-progression") throw new Error();
    a.answer.points[0]!.accepted = ["IV", "ii"];
    expect(codes(a)).toContain("ANSWER_MISMATCH");
  });
});
