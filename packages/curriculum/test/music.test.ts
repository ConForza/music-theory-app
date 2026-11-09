import { describe, expect, it } from "vitest";
import {
  bassOf,
  classifyCadence,
  classifyTimeSignature,
  describeInterval,
  dotted,
  equals,
  formatKey,
  formatPitch,
  formatPitchClass,
  frac,
  intervalBetween,
  keySignature,
  keysUpTo,
  ledgerLines,
  naturalAt,
  parseInterval,
  parseKey,
  parsePitch,
  relativeKey,
  scale,
  staffPosition,
  transpose,
  triad,
  tupletMember,
} from "../src/music/index.ts";

const spell = (key: string, form: Parameters<typeof scale>[1]) =>
  scale(parseKey(key), form).map(formatPitchClass).join(" ");

describe("key signatures (golden)", () => {
  const cases: Array<[string, string]> = [
    ["C major", ""],
    ["G major", "F#"],
    ["D major", "F# C#"],
    ["A major", "F# C# G#"],
    ["E major", "F# C# G# D#"],
    ["B major", "F# C# G# D# A#"],
    ["F# major", "F# C# G# D# A# E#"],
    ["F major", "Bb"],
    ["Bb major", "Bb Eb"],
    ["Eb major", "Bb Eb Ab"],
    ["Ab major", "Bb Eb Ab Db"],
    ["Db major", "Bb Eb Ab Db Gb"],
    ["Gb major", "Bb Eb Ab Db Gb Cb"],
    ["A minor", ""],
    ["E minor", "F#"],
    ["D minor", "Bb"],
    ["B minor", "F# C#"],
    ["F# minor", "F# C# G#"],
    ["C# minor", "F# C# G# D#"],
    ["G# minor", "F# C# G# D# A#"],
    ["D# minor", "F# C# G# D# A# E#"],
    ["G minor", "Bb Eb"],
    ["C minor", "Bb Eb Ab"],
    ["F minor", "Bb Eb Ab Db"],
    ["Bb minor", "Bb Eb Ab Db Gb"],
    ["Eb minor", "Bb Eb Ab Db Gb Cb"],
  ];
  it.each(cases)("%s → %s", (key, expected) => {
    expect(keySignature(parseKey(key)).accidentals.join(" ")).toBe(expected);
  });

  it("relative keys share signatures", () => {
    expect(formatKey(relativeKey(parseKey("Eb major")))).toBe("C minor");
    expect(formatKey(relativeKey(parseKey("C# minor")))).toBe("E major");
    expect(formatKey(relativeKey(parseKey("F# major")))).toBe("D# minor");
    expect(formatKey(relativeKey(parseKey("Bb minor")))).toBe("Db major");
  });

  it("there are exactly 2 + 4n keys with at most n accidentals (n ≤ 6)", () => {
    for (let n = 0; n <= 6; n++) expect(keysUpTo(n)).toHaveLength(2 + 4 * n);
  });
});

describe("scales keep letter-name spelling", () => {
  it("major scales", () => {
    expect(spell("F major", "major")).toBe("F G A Bb C D E F");
    expect(spell("F# major", "major")).toBe("F# G# A# B C# D# E# F#");
    expect(spell("Gb major", "major")).toBe("Gb Ab Bb Cb Db Eb F Gb");
  });
  it("harmonic minor raises the 7th, using a double sharp where the spelling needs it", () => {
    expect(spell("A minor", "harmonic")).toBe("A B C D E F G# A");
    expect(spell("G# minor", "harmonic")).toBe("G# A# B C# D# E Fx G#");
    expect(spell("D# minor", "harmonic")).toBe("D# E# F# G# A# B Cx D#");
    expect(spell("Bb minor", "harmonic")).toBe("Bb C Db Eb F Gb A Bb");
  });
  it("melodic minor differs ascending and descending", () => {
    expect(spell("D minor", "melodic-ascending")).toBe("D E F G A B C# D");
    expect(spell("D minor", "melodic-descending")).toBe("D C Bb A G F E D");
    expect(spell("Eb minor", "melodic-ascending")).toBe("Eb F Gb Ab Bb C D Eb");
  });
});

describe("intervals", () => {
  const cases: Array<[string, string, string]> = [
    ["C4", "E4", "major 3rd"],
    ["C4", "Eb4", "minor 3rd"],
    ["C4", "F#4", "augmented 4th"],
    ["C#4", "G4", "diminished 5th"],
    ["E4", "C5", "minor 6th"],
    ["Ab4", "F#5", "augmented 6th"],
    ["C#4", "Ab4", "diminished 6th"],
    ["C4", "C#4", "augmented 1st"],
    ["C4", "C5", "perfect octave"],
    ["C4", "G5", "perfect 12th"],
    ["D4", "F5", "minor 10th"],
    ["F4", "B4", "augmented 4th"],
    ["F4", "G#4", "augmented 2nd"],
  ];
  it.each(cases)("%s–%s is a %s", (a, b, expected) => {
    expect(describeInterval(intervalBetween(parsePitch(a), parsePitch(b)))).toBe(expected);
  });

  it("interval naming is order-insensitive", () => {
    expect(intervalBetween(parsePitch("G5"), parsePitch("C4"))).toEqual(parseInterval("P12"));
  });

  it("transposition preserves spelling rather than semitone count", () => {
    expect(formatPitch(transpose(parsePitch("G#4"), parseInterval("m3"), "up"))).toBe("B4");
    expect(formatPitch(transpose(parsePitch("D4"), parseInterval("m3"), "up"))).toBe("F4");
    expect(formatPitch(transpose(parsePitch("B4"), parseInterval("M2"), "up"))).toBe("C#5");
    expect(formatPitch(transpose(parsePitch("Bb4"), parseInterval("M2"), "up"))).toBe("C5");
    expect(formatPitch(transpose(parsePitch("C5"), parseInterval("P5"), "down"))).toBe("F4");
    expect(formatPitch(transpose(parsePitch("E5"), parseInterval("m3"), "down"))).toBe("C#5");
  });

  it("rejects impossible quality/number pairs", () => {
    expect(() => parseInterval("P3")).toThrow();
    expect(() => parseInterval("M5")).toThrow();
  });
});

describe("chords and cadences", () => {
  it("minor-key chords use the harmonic minor", () => {
    expect(triad(parseKey("C minor"), "V").map(formatPitchClass)).toEqual(["G", "B", "D"]);
    expect(triad(parseKey("C minor"), "ii").map(formatPitchClass)).toEqual(["D", "F", "Ab"]);
    expect(triad(parseKey("G# minor"), "V").map(formatPitchClass)).toEqual(["D#", "Fx", "A#"]);
  });
  it("inversion is defined by the bass note", () => {
    expect(formatPitchClass(bassOf(parseKey("D major"), "IV", "b"))).toBe("B");
    expect(formatPitchClass(bassOf(parseKey("F major"), "I", "c"))).toBe("C");
  });
  it("classifies cadences", () => {
    expect(classifyCadence("V", "I")).toBe("perfect");
    expect(classifyCadence("IV", "I")).toBe("plagal");
    expect(classifyCadence("ii", "V")).toBe("imperfect");
    expect(classifyCadence("I", "V")).toBe("imperfect");
    expect(classifyCadence("V", "IV")).toBeNull();
    expect(classifyCadence("ii", "I")).toBeNull();
  });
});

describe("clefs", () => {
  it("middle C sits on one ledger line below treble / above bass, middle line alto, 4th line tenor", () => {
    const c4 = parsePitch("C4");
    expect(staffPosition("treble", c4)).toBe(-2);
    expect(staffPosition("bass", c4)).toBe(10);
    expect(staffPosition("alto", c4)).toBe(4);
    expect(staffPosition("tenor", c4)).toBe(6);
    expect(ledgerLines("treble", c4)).toBe(1);
    expect(ledgerLines("bass", c4)).toBe(1);
    expect(ledgerLines("alto", c4)).toBe(0);
  });
  it("treble lines are E G B D F; bass lines are G B D F A", () => {
    expect([0, 2, 4, 6, 8].map((p) => formatPitch(naturalAt("treble", p)))).toEqual(["E4", "G4", "B4", "D5", "F5"]);
    expect([0, 2, 4, 6, 8].map((p) => formatPitch(naturalAt("bass", p)))).toEqual(["G2", "B2", "D3", "F3", "A3"]);
  });
  it("counts two ledger lines for A3 in treble and E4 in bass", () => {
    expect(ledgerLines("treble", parsePitch("A3"))).toBe(2);
    expect(ledgerLines("bass", parsePitch("E4"))).toBe(2);
    expect(ledgerLines("treble", parsePitch("B3"))).toBe(1);
  });
});

describe("durations", () => {
  it("dots add half the previous addition", () => {
    expect(equals(dotted("minim", 1), frac(3, 4))).toBe(true);
    expect(equals(dotted("crotchet", 2), frac(7, 16))).toBe(true);
  });
  it("tuplets", () => {
    expect(equals(tupletMember("quaver", 3, 2), frac(1, 12))).toBe(true);
    expect(equals(tupletMember("quaver", 2, 3), frac(3, 16))).toBe(true);
  });
  it("classifies metres", () => {
    expect(classifyTimeSignature("6/8")).toEqual({ metre: "compound", beats: "duple" });
    expect(classifyTimeSignature("3/2")).toEqual({ metre: "simple", beats: "triple" });
    expect(classifyTimeSignature("7/8")).toEqual({ metre: "irregular", beats: "septuple" });
  });
});

describe("interval edge cases (Copilot follow-up)", () => {
  it("names a chromatic unison the same in either note order", () => {
    expect(describeInterval(intervalBetween(parsePitch("C#4"), parsePitch("C4")))).toBe("augmented 1st");
    expect(describeInterval(intervalBetween(parsePitch("C4"), parsePitch("Cb4")))).toBe("augmented 1st");
    expect(intervalBetween(parsePitch("C4"), parsePitch("C#4"))).toEqual(intervalBetween(parsePitch("C#4"), parsePitch("C4")));
  });
  it("rejects interval number 0", () => {
    for (const code of ["M0", "m0", "A0", "P0", "d0"]) expect(() => parseInterval(code)).toThrow();
  });
});
