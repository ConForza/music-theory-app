/**
 * Brief 03 music-rule tests. Golden cases come from hand-written reference tables (test/golden), never from
 * the functions under test; property tests check invariants over many generated inputs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as m from "../src/music/index.ts";

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "golden/music-golden.json"), "utf8"));
const P = m.parsePitch;
const fmtPcs = (pcs: m.PitchClass[]) => pcs.map(m.formatPitchClass);
const n = (value: m.NoteValue, extra: Partial<m.RInner> = {}): m.RInner => ({ kind: "note", pitch: "C5", duration: { value, dots: 0 }, ...extra });
const r = (value: m.NoteValue, extra: Partial<m.RInner> = {}): m.RInner => ({ kind: "rest", duration: { value, dots: 0 }, ...extra });
const d = (value: m.NoteValue, dots = 1, extra: Partial<m.RInner> = {}): m.RInner => ({ kind: "note", pitch: "C5", duration: { value, dots }, ...extra });
const beam = (...events: m.RInner[]): m.RInner[] =>
  events.map((e, i) => ({ ...e, beam: i === 0 ? "begin" : i === events.length - 1 ? "end" : "continue" }));
const codes = (events: m.REvent[], ts: string, opts?: m.BarCheckOptions) => m.checkBarAnyPattern(events, ts, opts).issues.map((i) => i.code);

describe("golden: pitch, clefs and ledger lines", () => {
  for (const c of golden.clefPositions) {
    it(`${c.pitch} in the ${c.clef} clef is position ${c.position} with ${c.ledgerLines} ledger line(s)`, () => {
      expect(m.staffPosition(c.clef, P(c.pitch))).toBe(c.position);
      expect(m.ledgerLines(c.clef, P(c.pitch))).toBe(c.ledgerLines);
      expect(m.formatPitch(m.naturalAt(c.clef, c.position))).toBe(c.pitch.replace(/[#b]+/, ""));
    });
  }
  for (const e of golden.enharmonics) {
    it(`${e.a} vs ${e.b}: same sound ${e.sameSound}, same spelling ${e.sameSpelling}`, () => {
      expect(m.enharmonic(P(e.a), P(e.b))).toBe(e.sameSound);
      expect(m.samePitch(P(e.a), P(e.b))).toBe(e.sameSpelling);
    });
  }
});

describe("golden: keys and scales", () => {
  for (const k of golden.keySignatures) {
    it(`${k.key}: ${k.accidentals.join(" ") || "no sharps or flats"}`, () => {
      expect(m.keySignature(m.parseKey(k.key)).accidentals).toEqual(k.accidentals);
    });
  }
  for (const [maj, min] of golden.relativeKeys) {
    it(`${maj} ↔ ${min}`, () => {
      expect(m.formatKey(m.relativeKey(m.parseKey(maj)))).toBe(min);
      expect(m.formatKey(m.relativeKey(m.parseKey(min)))).toBe(maj);
    });
  }
  for (const s of golden.scales) {
    it(`${s.key} ${s.form}`, () => expect(fmtPcs(m.scale(m.parseKey(s.key), s.form))).toEqual(s.notes));
  }
  it("degrees and technical names", () => {
    expect(m.degreeOf(m.parseKey("A minor"), m.parsePitchClass("G#"))).toBe(7);
    expect(m.degreeOf(m.parseKey("A minor"), m.parsePitchClass("G"))).toBeNull(); // harmonic only
    expect(m.degreeOf(m.parseKey("A minor"), m.parsePitchClass("G"), ["melodic-descending"])).toBe(7);
    expect(m.degreeOf(m.parseKey("Eb major"), m.parsePitchClass("Bb"))).toBe(5);
    expect(m.TECHNICAL_NAMES[m.degreeOf(m.parseKey("F major"), m.parsePitchClass("Bb"))! - 1]).toBe("subdominant");
  });
});

describe("golden: intervals and transposition", () => {
  for (const c of golden.intervals) {
    it(`${c.lower}–${c.upper} = ${c.name}`, () => {
      const iv = m.intervalBetween(P(c.lower), P(c.upper));
      expect(`${iv.quality}${iv.number}`).toBe(c.name);
      // Order-insensitive.
      const back = m.intervalBetween(P(c.upper), P(c.lower));
      expect(`${back.quality}${back.number}`).toBe(c.name);
      // Building the interval from the lower note recovers the exact written upper note.
      expect(m.formatPitch(m.transpose(P(c.lower), m.parseInterval(c.name), "up"))).toBe(c.upper);
    });
  }
  for (const t of golden.transpositions) {
    it(`${t.from} ${t.direction} a ${t.interval} = ${t.to}`, () => expect(m.formatPitch(m.transpose(P(t.from), m.parseInterval(t.interval), t.direction))).toBe(t.to));
  }
  for (const t of golden.instruments) {
    it(`instrument in ${t.instrument}: written ${t.written} sounds ${t.concert}`, () => {
      expect(m.formatPitch(m.writtenToConcert(P(t.written), t.instrument))).toBe(t.concert);
      expect(m.formatPitch(m.concertToWritten(P(t.concert), t.instrument))).toBe(t.written);
    });
  }
  for (const t of golden.instrumentKeys) {
    it(`instrument in ${t.instrument}: concert ${t.concert} is written in ${t.written}`, () => {
      expect(m.formatKey(m.writtenKeyFor(m.parseKey(t.concert), t.instrument))).toBe(t.written);
      expect(m.formatKey(m.concertKeyFor(m.parseKey(t.written), t.instrument))).toBe(t.concert);
    });
  }
});

describe("golden: chords and cadences", () => {
  for (const t of golden.triads) {
    it(`${t.key} ${t.roman} = ${t.notes.join(" ")}`, () => expect(fmtPcs(m.triad(m.parseKey(t.key), t.roman))).toEqual(t.notes));
  }
  for (const c of golden.chordIdentification) {
    it(`${c.pitches.join(" ")} in ${c.key} is ${c.roman}${c.inversion}`, () => {
      expect(m.identifyTriad(m.parseKey(c.key), c.pitches.map(P))).toEqual({ roman: c.roman, inversion: c.inversion });
    });
  }
  for (const c of golden.cadences) {
    it(`${c.first}–${c.second}: ${c.type ?? "not a cadence"}`, () => expect(m.classifyCadence(c.first, c.second)).toBe(c.type));
  }
  it("a chord with a wrong note or a missing note is not identified", () => {
    const C = m.parseKey("C major");
    expect(m.identifyTriad(C, ["C4", "E4", "G#4"].map(P))).toBeNull();
    expect(m.identifyTriad(C, ["C4", "E4", "C5"].map(P))).toBeNull();
    // A minor V must use the raised leading note.
    expect(m.identifyTriad(m.parseKey("A minor"), ["E3", "G3", "B3"].map(P))).toBeNull();
  });
  it("finds chords that contain a melody note", () => {
    expect(m.chordsContaining(m.parseKey("C major"), [m.parsePitchClass("G")], ["I", "ii", "IV", "V"])).toEqual(["I", "V"]);
    expect(m.chordsContaining(m.parseKey("C major"), [m.parsePitchClass("D")], ["I", "ii", "IV", "V"])).toEqual(["ii", "V"]);
  });
});

describe("golden: durations, tuplets and metres", () => {
  for (const x of golden.durations) {
    it(`${x.dots ? "dotted ".repeat(x.dots) : ""}${x.value} = ${x.fraction.join("/")}`, () => {
      expect(m.equals(m.dotted(x.value, x.dots), m.frac(x.fraction[0], x.fraction[1]))).toBe(true);
    });
  }
  for (const t of golden.tuplets) {
    it(t.note, () => {
      expect(m.equals(m.tupletMember(t.value, t.actual, t.normal), m.frac(t.memberFraction[0], t.memberFraction[1]))).toBe(true);
      const group: m.RTuplet = { kind: "tuplet", actual: t.actual, normal: t.normal, events: Array.from({ length: t.actual }, () => n(t.value)) };
      expect(m.equals(m.eventLength(group), m.frac(t.groupFraction[0], t.groupFraction[1]))).toBe(true);
    });
  }
  for (const x of golden.metres) {
    it(`${x.ts} is ${x.metre} ${x.beats}`, () => expect(m.classifyTimeSignature(x.ts)).toEqual({ metre: x.metre, beats: x.beats }));
  }
  it("describes beats in words", () => {
    expect(m.describeMetre(m.metreStructure("3/4"))).toBe("three crotchet beats");
    expect(m.describeMetre(m.metreStructure("6/8"))).toBe("two dotted-crotchet beats");
    expect(m.metreStructures("7/8").map(m.describeMetre)).toContain("seven quavers grouped 2+2+3");
  });
});

describe("rhythm: bar totals and grouping", () => {
  it("accepts correct bars in simple time", () => {
    expect(codes([n("crotchet"), n("crotchet"), n("minim")], "4/4")).toEqual([]);
    expect(codes([d("minim"), n("crotchet")], "4/4")).toEqual([]);
    expect(codes([d("crotchet"), n("quaver"), n("minim")], "4/4")).toEqual([]); // dotted crotchet on the beat
    expect(codes([n("semibreve")], "4/4")).toEqual([]);
  });
  it("reports overfull and underfull bars", () => {
    expect(codes([n("minim"), n("minim")], "3/4")).toContain("bar-overfull");
    expect(codes([n("minim")], "3/4")).toContain("bar-underfull");
  });
  it("accepts both beamings of quavers in 2/4, and rejects a beam across the middle of 4/4", () => {
    const q = () => n("quaver");
    expect(codes([...beam(q(), q()), ...beam(q(), q())], "2/4")).toEqual([]);
    expect(codes(beam(q(), q(), q(), q()), "2/4")).toEqual([]);
    expect(codes([...beam(q(), q(), q(), q()), ...beam(q(), q(), q(), q())], "4/4")).toEqual([]);
    expect(codes([n("crotchet"), ...beam(q(), q(), q(), q()), n("crotchet")], "4/4")).toContain("beam-across-middle");
  });
  it("requires beaming within a beat for grouping tasks only", () => {
    const flags = [n("quaver"), n("quaver"), n("crotchet"), n("minim")];
    expect(codes(flags, "4/4")).toContain("beat-not-beamed");
    expect(codes(flags, "4/4", { requireBeams: false })).toEqual([]);
  });
  it("groups compound time in dotted beats", () => {
    const q = () => n("quaver");
    expect(codes([...beam(q(), q(), q()), ...beam(q(), q(), q())], "6/8")).toEqual([]);
    expect(codes([n("crotchet"), ...beam(q(), q()), ...beam(q(), q())], "6/8")).toContain("beam-hides-compound-beat");
    expect(codes([n("minim"), n("quaver"), n("quaver")], "6/8", { requireBeams: false })).toContain("note-hides-compound-beat");
    expect(codes([d("crotchet"), d("crotchet")], "6/8")).toEqual([]);
  });
  it("accepts both forms of a silent dotted-crotchet beat", () => {
    expect(codes([r("crotchet", {}), r("quaver"), d("crotchet")], "6/8")).toEqual([]);
    expect(codes([{ ...r("crotchet"), duration: { value: "crotchet", dots: 1 } }, d("crotchet")], "6/8")).toEqual([]);
    expect(codes([r("quaver"), r("quaver"), r("quaver"), d("crotchet")], "6/8")).toContain("rests-not-combined");
  });
  it("applies rest conventions in simple time", () => {
    expect(codes([r("minim"), n("minim")], "4/4")).toEqual([]);
    expect(codes([n("minim"), r("minim")], "4/4")).toEqual([]);
    expect(codes([n("crotchet"), r("minim"), n("crotchet")], "4/4")).toContain("half-bar-rest-misplaced");
    expect(codes([r("minim"), n("crotchet")], "3/4")).toContain("rest-across-beat");
    expect(codes([{ kind: "rest", duration: { value: "semibreve" }, wholeBar: true }], "3/4")).toEqual([]);
  });
  it("finds ties that could be written as one value", () => {
    expect(codes([n("crotchet", { tieToNext: true }), n("crotchet"), n("minim")], "4/4")).toContain("unnecessary-tie");
    expect(codes([n("minim", { tieToNext: true }), n("crotchet"), n("crotchet")], "4/4")).toContain("tie-instead-of-dot");
    // Needed to show the middle of the bar: not reported.
    expect(codes([n("crotchet"), n("crotchet", { tieToNext: true }), n("crotchet"), n("crotchet")], "4/4")).toEqual([]);
  });
  it("accepts an irregular bar under any standard sub-grouping (5/8 and 7/8 alternatives)", () => {
    const q = () => n("quaver");
    expect(codes([...beam(q(), q(), q()), ...beam(q(), q())], "5/8")).toEqual([]);
    expect(codes([...beam(q(), q()), ...beam(q(), q(), q())], "5/8")).toEqual([]);
    expect(codes([...beam(q(), q()), ...beam(q(), q()), ...beam(q(), q(), q())], "7/8")).toEqual([]);
    expect(codes([...beam(q(), q(), q()), ...beam(q(), q()), ...beam(q(), q())], "7/8")).toEqual([]);
    expect(codes([...beam(q(), q(), q(), q()), q()], "5/8")).not.toEqual([]);
  });
  it("checks tuplets", () => {
    const trip: m.RTuplet = { kind: "tuplet", actual: 3, normal: 2, events: beam(n("quaver"), n("quaver"), n("quaver")) };
    expect(codes([trip, n("crotchet")], "2/4")).toEqual([]);
    const bad: m.RTuplet = { kind: "tuplet", actual: 3, normal: 2, events: beam(n("quaver"), n("semiquaver"), n("quaver")) };
    expect(codes([bad, n("crotchet")], "2/4")).toContain("tuplet-total-wrong");
    const duplet: m.RTuplet = { kind: "tuplet", actual: 2, normal: 3, events: beam(n("quaver"), n("quaver")) };
    expect(codes([duplet, d("crotchet")], "6/8")).toEqual([]);
  });
  it("places bar-lines from cumulative durations", () => {
    const seq = [n("crotchet"), n("crotchet"), n("minim"), d("crotchet"), n("quaver")];
    expect(m.barlinePositions(seq, "2/4")).toEqual([2, 3, 5]);
    expect(m.barlinePositions([n("crotchet"), n("minim"), n("crotchet")], "2/4")).toBeNull();
  });
});

describe("accidental state", () => {
  const frag = (key: string | undefined, bars: Array<Array<[string, m.Sign?, boolean?]>>): m.AFragment => ({
    key,
    measures: bars.map((b) => ({ events: b.map(([pitch, sign, tie]) => ({ kind: "note", pitch, duration: { value: "crotchet" }, ...(sign ? { writtenAccidental: sign } : {}), ...(tie ? { tieToNext: true } : {}) })) })),
  });
  const read = (f: m.AFragment, rule?: m.ResolutionRule) => m.resolveWrittenPitches(f, rule).map((x) => m.formatPitch(x.pitch));

  it("an accidental lasts for the rest of the bar on its own line or space only", () => {
    const f = frag(undefined, [[["F4", "sharp"], ["F4"], ["F5"], ["F4", "natural"]], [["F4"]]]);
    expect(read(f)).toEqual(["F#4", "F#4", "F5", "F4", "F4"]);
    expect(read(f, "any-octave")).toEqual(["F#4", "F#4", "F#5", "F4", "F4"]);
    expect(read(f, "carry-over-barline")[4]).toBe("F4"); // cancelled by the natural before the bar-line
  });
  it("applies the key signature in every octave and is cancelled by a natural", () => {
    const f = frag("G major", [[["F4"], ["F5"], ["F4", "natural"], ["F4"]], [["F4"]]]);
    expect(read(f)).toEqual(["F#4", "F#5", "F4", "F4", "F#4"]);
    expect(read(f, "ignore-key-signature")).toEqual(["F4", "F5", "F4", "F4", "F4"]);
  });
  it("a tie carries the pitch over the bar-line without establishing the accidental", () => {
    const f = frag(undefined, [[["C4"], ["C4"], ["C4"], ["G4", "sharp", true]], [["G4"], ["G4"], ["C4"], ["C4"]]]);
    expect(read(f)).toEqual(["C4", "C4", "C4", "G#4", "G#4", "G4", "C4", "C4"]);
    expect(read(f, "ignore-ties")[4]).toBe("G4");
  });
  it("prints exactly the accidentals needed", () => {
    const f: m.AFragment = { key: "F major", measures: [{ events: ["B4", "B4", "Bn4", "B4", "B5"].map((p) => ({ kind: "note", pitch: p === "Bn4" ? "B4" : p === "B4" ? "Bb4" : "Bb5", duration: { value: "crotchet" } })) }] };
    const signs = [...m.printedAccidentals(f).values()];
    expect(signs).toEqual([null, null, "natural", "flat", null]);
  });
  it("double accidentals", () => {
    const f = frag(undefined, [[["F4", "double-sharp"], ["F4"], ["F4", "sharp"], ["B4", "double-flat"]]]);
    expect(read(f)).toEqual(["Fx4", "Fx4", "F#4", "Bbb4"]);
  });
});

describe("chromatic scales and ornaments", () => {
  it("accepts any spelling that uses each letter once or twice", () => {
    expect(m.checkChromatic(m.chromaticFrom(P("C4"), "ascending"), P("C4"), "ascending")).toEqual([]);
    expect(m.checkChromatic(m.chromaticFrom(P("D4"), "descending"), P("D4"), "descending")).toEqual([]);
    const mixed = "C4 Db4 D4 Eb4 E4 F4 F#4 G4 Ab4 A4 Bb4 B4 C5".split(" ").map(P);
    expect(m.checkChromatic(mixed, P("C4"), "ascending")).toEqual([]);
  });
  it("rejects a letter used three times or missing, and non-semitone steps", () => {
    const three = "C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5".split(" ").map(P);
    expect(m.checkChromatic(three, P("C4"), "ascending")).toEqual([]);
    const bad = "C4 C#4 Cx4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5".split(" ").map(P);
    const c = m.checkChromatic(bad, P("C4"), "ascending").map((x) => x.code);
    expect(c).toContain("letter-used-three-times");
    expect(c).toContain("double-accidental");
    const missing = "C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 Cb5 C5".split(" ").map(P);
    expect(m.checkChromatic(missing, P("C4"), "ascending").map((x) => x.code)).toEqual(expect.arrayContaining(["letter-missing", "letter-used-three-times"]));
    const gap = "C4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5".split(" ").map(P);
    expect(m.checkChromatic(gap, P("C4"), "ascending").map((x) => x.code)).toContain("not-a-semitone");
  });
  for (const o of golden.ornaments) {
    it(`${o.figure.join(" ")} around ${o.main} is ${o.shape}`, () => expect(m.classifyOrnamentFigure(P(o.main), o.figure.map(P))).toBe(o.shape));
  }
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const arbPitch = fc.record({ step: fc.constantFrom(...m.STEPS), alter: fc.integer({ min: -1, max: 1 }), octave: fc.integer({ min: 2, max: 5 }) });
const arbSimpleInterval = fc.constantFrom("m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7", "P8", "M9", "m10", "P12").map(m.parseInterval);

describe("properties", () => {
  it("transposing up then down by any interval returns the exact written pitch", () => {
    fc.assert(fc.property(arbPitch, arbSimpleInterval, (p, iv) => m.samePitch(m.transpose(m.transpose(p, iv, "up"), iv, "down"), p)));
  });
  it("the interval between a note and its transposition is the interval used", () => {
    fc.assert(
      fc.property(arbPitch, arbSimpleInterval, (p, iv) => {
        const got = m.intervalBetween(p, m.transpose(p, iv, "up"));
        return got.number === iv.number && got.quality === iv.quality;
      }),
    );
  });
  it("an interval and its inversion add up to 9 (numbers) and 12 semitones", () => {
    fc.assert(
      fc.property(arbPitch, fc.constantFrom("m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7").map(m.parseInterval), (p, iv) => {
        const up = m.transpose(p, iv, "up");
        const inv = m.intervalBetween(up, { ...p, octave: p.octave + 1 });
        return iv.number + inv.number === 9 && m.chromaticNumber({ ...p, octave: p.octave + 1 }) - m.chromaticNumber(p) === 12;
      }),
    );
  });
  it("every major and minor scale uses each letter once and the right tone/semitone pattern", () => {
    for (const key of m.allKeys()) {
      const forms: m.ScaleForm[] = key.mode === "major" ? ["major"] : ["harmonic", "melodic-ascending"];
      for (const f of forms) {
        const pcs = m.scale(key, f);
        expect(new Set(pcs.slice(0, 7).map((x) => x.step)).size).toBe(7);
        let oct = 4;
        const ps = pcs.map((pc, i) => {
          if (i > 0 && m.stepIndex(pc.step) < m.stepIndex(pcs[i - 1]!.step)) oct++;
          return { ...pc, octave: oct };
        });
        const steps = ps.slice(1).map((x, i) => m.chromaticNumber(x) - m.chromaticNumber(ps[i]!));
        const want = f === "major" ? [2, 2, 1, 2, 2, 2, 1] : f === "harmonic" ? [2, 1, 2, 2, 1, 3, 1] : [2, 1, 2, 2, 2, 2, 1];
        expect(steps, `${m.formatKey(key)} ${f}`).toEqual(want);
      }
    }
  });
  it("the key signature always matches the scale's accidentals and relative keys share it", () => {
    for (const key of m.allKeys()) {
      const sig = m.keySignature(key).accidentals.sort();
      const natural = m.scale(key, key.mode === "major" ? "major" : "melodic-descending").slice(0, 7).filter((p) => p.alter !== 0).map(m.formatPitchClass).sort();
      expect(natural).toEqual(sig);
      expect(m.keyFifths(m.relativeKey(key))).toBe(m.keyFifths(key));
    }
  });
  const values: m.NoteValue[] = ["minim", "crotchet", "quaver", "semiquaver"];
  it("auto-beamed random bars never break the grouping rules for beams", () => {
    fc.assert(
      fc.property(fc.constantFrom("2/4", "3/4", "4/4", "6/8", "9/8", "12/8", "3/8", "2/2"), fc.array(fc.constantFrom(...values), { minLength: 1, maxLength: 16 }), (ts, picks) => {
        const s = m.metreStructure(ts);
        // Fill the bar greedily with the picked values that still fit.
        const events: m.RInner[] = [];
        let left = s.capacity;
        for (const v of [...picks, ...Array(32).fill("semiquaver")] as m.NoteValue[]) {
          const dur = m.dotted(v, 0);
          if (m.compare(dur, left) <= 0) {
            events.push(n(v));
            left = m.sub(left, dur);
          }
          if (m.isZero(left)) break;
        }
        const issues = m.checkBar(m.autoBeam(events, s), s).map((i) => i.code);
        return !issues.some((c) => c.startsWith("beam") || c === "beat-not-beamed" || c.startsWith("bar-"));
      }),
    );
  });
  it("the sum of the bars between bar-lines always equals the bar capacity", () => {
    fc.assert(
      fc.property(fc.constantFrom("2/4", "3/4", "4/4", "3/8", "6/8"), fc.array(fc.constantFrom(...values), { minLength: 1, maxLength: 20 }), (ts, picks) => {
        const events = picks.map((v) => n(v));
        const pos = m.barlinePositions(events, ts);
        if (!pos) return true;
        const cap = m.barCapacity(m.parseTimeSignature(ts));
        return m.splitAt(events, pos).every((bar) => m.equals(m.totalLength(bar), cap));
      }),
    );
  });
  it("resolving printed accidentals reproduces the pitches whose signs were printed by rule", () => {
    fc.assert(
      fc.property(fc.constantFrom("C major", "G major", "F major", "D major", "Bb major", "A minor"), fc.array(arbPitch, { minLength: 1, maxLength: 8 }), (key, ps) => {
        const notes = ps.map((p) => ({ kind: "note", pitch: m.formatPitch(p), duration: { value: "crotchet" } }));
        const f: m.AFragment = { key, measures: [{ events: notes }] };
        const signs = [...m.printedAccidentals(f).values()];
        const written: m.AFragment = { key, measures: [{ events: notes.map((x, i) => ({ ...x, ...(signs[i] ? { writtenAccidental: signs[i]! } : {}) })) }] };
        return m.resolveWrittenPitches(written).every((x, i) => m.samePitch(x.pitch, ps[i]!));
      }),
    );
  });
});
