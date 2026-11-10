import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem } from "../src/index.ts";

/**
 * The generators write their own answers, and the engine's solvability gate grades those same answers, which is circular for
 * choice questions. This file re-derives each new Grade 1 answer from what is SHOWN (the printed notation and the prompt) with the
 * curriculum rule functions, then compares. It also holds hand-typed cases.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 150;

function items(nodeId: string, templateId: string): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId)!;
  const scope = effectiveScope(ix, node, b);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    try {
      out.push(generateItem(ix, templateId, s, { scope }).item);
    } catch {
      /* skipped seed */
    }
  }
  expect(out.length).toBeGreaterThan(SEEDS / 2);
  return out;
}
const correct = (i: ExerciseItem) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
const events = (i: ExerciseItem) => i.music!.measures.flatMap((m) => m.events ?? []);
const beats = (e: { kind: string; duration?: { value: music.NoteValue; dots: number } }) => {
  const f = music.dotted(e.duration!.value, e.duration!.dots);
  return (f.n * 4) / f.d;
};

describe("note-total and note-equivalent: derived from the printed durations", () => {
  it("note-total equals the sum of the printed values in crotchet beats", () => {
    for (const i of items("G1-U1-L06", "t.g1.note-total")) {
      const sum = events(i).reduce((t, e) => t + beats(e as never), 0);
      expect(Number(correct(i)) / 2).toBe(sum);
    }
  });
  it("note-equivalent names the single note with the printed total length", () => {
    for (const i of items("G1-U1-L02", "t.g1.note-equivalent")) {
      const total = events(i).reduce((t, e) => music.add(t, music.dotted((e as never as { duration: { value: music.NoteValue; dots: number } }).duration.value, (e as never as { duration: { dots: number } }).duration.dots)), music.frac(0));
      const v = music.valueFor(total, 1)!;
      expect(correct(i)).toBe(`${v.dots ? "dotted-" : ""}${v.value}`);
    }
  });
  it("hand-typed: a dotted minim is 3 beats and a semiquaver rest is a quarter beat", () => {
    expect(beats({ kind: "note", duration: { value: "minim", dots: 1 } })).toBe(3);
    expect(beats({ kind: "rest", duration: { value: "semiquaver", dots: 0 } })).toBe(0.25);
  });
});

describe("beam-choice: derived from the printed beams and flags", () => {
  it("counts beamed notes, their value and their length from the notation", () => {
    for (const i of items("G1-U1-L03", "t.g1.beam-choice")) {
      const evs = events(i) as Array<{ duration: { value: music.NoteValue; dots: number }; beam?: string }>;
      const beamed = evs.filter((e) => e.beam);
      if (i.prompt.startsWith("How many notes")) expect(Number(correct(i))).toBe(beamed.length);
      else if (i.prompt.includes("What value is each")) expect(correct(i)).toBe(beamed[0]!.duration.value);
      else if (i.prompt.startsWith("How many crotchet beats")) expect(Number(correct(i)) / 2).toBe(beamed.reduce((t, e) => t + beats(e as never), 0));
      else expect(correct(i)).toBe(evs[0]!.duration.value);
    }
  });
});

describe("bar-judge: the right bar is the one the rule checker accepts", () => {
  it("exactly one bar passes the check named in the prompt, and the others each fail it", () => {
    for (const nodeId of ["G1-U2-L04", "G1-U2-L06", "G1-U2-L05"]) {
      for (const i of items(nodeId, "t.g1.bar-judge")) {
        const ts = /(\d\/4)/.exec(i.prompt)![1]!;
        const bars = i.music!.measures.map((m) => (m.events ?? []) as never[]);
        const issues = bars.map((b) => music.checkBarAnyPattern(b as never, ts).issues.map((x) => x.code));
        const total = (c: string[]) => c.includes("bar-overfull") || c.includes("bar-underfull");
        const right = Number(correct(i)) - 1;
        if (i.prompt.startsWith("Each bar")) {
          expect(issues.map((c) => !total(c))).toEqual(bars.map((_, k) => k === right));
        } else {
          expect(issues[right]).toEqual([]);
          issues.forEach((c, k) => k !== right && expect(c.length).toBeGreaterThan(0));
          issues.forEach((c) => expect(total(c)).toBe(false));
        }
      }
    }
  });
});

describe("accidental-count: re-read from the PRINTED signs by the bar-state reader", () => {
  it("counts the notes that sound as the named pitch class", () => {
    for (const i of items("G1-U4-L04", "t.g1.accidental-count")) {
      const m = /sound as ([A-G])([♯♭])/.exec(i.prompt)!;
      const alter = m[2] === "♯" ? 1 : -1;
      const barNo = /in bar (\d)/.exec(i.prompt) ? Number(/in bar (\d)/.exec(i.prompt)![1]) - 1 : 0;
      const resolved = music.resolveWrittenPitches(i.music as never);
      // the reader returns refs with .bar; only notes of the asked bar count
      const n = resolved.filter((r) => r.ref.bar === barNo && r.pitch.step === m[1] && r.pitch.alter === alter).length;
      expect(Number(correct(i))).toBe(n);
    }
  });
  it("hand-typed: F sharp then F then G in one bar of C major, the second F is still sharp", () => {
    const f = { clef: "treble", showKeySignature: false, timeSignature: "4/4", textAlternative: "x", measures: [{ events: [
      { kind: "note", pitch: "F#4", duration: { value: "crotchet", dots: 0 }, writtenAccidental: "sharp" },
      { kind: "note", pitch: "G4", duration: { value: "crotchet", dots: 0 } },
      { kind: "note", pitch: "F#4", duration: { value: "crotchet", dots: 0 } },
      { kind: "note", pitch: "A4", duration: { value: "crotchet", dots: 0 } },
    ] }] };
    const r = music.resolveWrittenPitches(f as never).map((x) => `${x.pitch.step}${x.pitch.alter}`);
    expect(r).toEqual(["F1", "G0", "F1", "A0"]);
  });
});

describe("scale-gap, degree-note, key-facts, triad-notes, interval-note: derived from the scale rules", () => {
  it("scale-gap: the answer is the scale note that the printed notes leave out", () => {
    for (const i of items("G1-U5-L04", "t.g1.scale-gap")) {
      const key = /scale of ([A-G]) major/.exec(i.prompt)![1]! + " major";
      const full = music.scale(music.parseKey(key), "major");
      const shown = events(i).filter((e) => e.kind === "note").map((e) => music.parsePitch((e as { pitch: string }).pitch));
      const missing = full.filter((pc) => !shown.some((p) => p.step === pc.step && p.alter === pc.alter)).slice(0, 1)[0]!;
      const notes = events(i);
      const gapIndex = notes.findIndex((e) => e.kind === "rest");
      expect(gapIndex).toBeGreaterThan(0);
      expect(correct(i)).toBe(`${full[gapIndex]!.step}${full[gapIndex]!.alter === 1 ? "#" : full[gapIndex]!.alter === -1 ? "b" : ""}`);
      expect(missing.step).toBe(full[gapIndex]!.step);
    }
  });
  it("degree-note and interval-note: count up the scale of the named key", () => {
    for (const i of items("G1-U5-L07", "t.g1.degree-note")) {
      const m = /In ([A-G]) major, which note is degree (\d)/.exec(i.prompt)!;
      const pc = music.scale(music.parseKey(`${m[1]} major`), "major")[Number(m[2]) - 1]!;
      expect(correct(i)).toBe(`${pc.step}${pc.alter === 1 ? "#" : pc.alter === -1 ? "b" : ""}`);
    }
    for (const i of items("G1-U6-L03", "t.g1.interval-note")) {
      const m = /In ([A-G]) major, which note is a (\d)(?:st|nd|rd|th) above/.exec(i.prompt)!;
      const pc = music.scale(music.parseKey(`${m[1]} major`), "major")[Number(m[2]) - 1]!;
      expect(correct(i)).toBe(`${pc.step}${pc.alter === 1 ? "#" : pc.alter === -1 ? "b" : ""}`);
    }
  });
  it("key-facts: sharps and flats come from the key signature rule", () => {
    for (const i of items("G1-U5-L05", "t.g1.key-facts")) {
      const k = /([A-G]) major/.exec(i.prompt)?.[1];
      if (!k) continue;
      const sig = music.keySignature(music.parseKey(`${k} major`));
      if (i.prompt.startsWith("How many")) expect(Number(correct(i))).toBe(sig.count);
      else if (i.prompt.startsWith("Is the key signature")) expect(correct(i)).toBe(sig.type);
      else if (i.prompt.startsWith("Which of these")) expect(correct(i)).toBe(sig.accidentals.join(","));
    }
  });
  it("triad-notes: degrees 1, 3 and 5", () => {
    for (const i of items("G1-U6-L01", "t.g1.triad-notes")) {
      const k = /([A-G]) major/.exec(i.prompt)![1]!;
      const sc = music.scale(music.parseKey(`${k} major`), "major");
      const name = (pc: { step: string; alter: number }) => `${pc.step}${pc.alter === 1 ? "♯" : pc.alter === -1 ? "♭" : ""}`;
      const opt = (id: string) => (i.answer as { options: Array<{ id: string; label: string }> }).options.find((o) => o.id === id)!.label;
      if (i.prompt.startsWith("Which three notes")) expect(opt(correct(i))).toBe([sc[0]!, sc[2]!, sc[4]!].map(name).join(" "));
      else if (i.prompt.includes("root")) expect(opt(correct(i))).toBe(name(sc[0]!));
      else if (i.prompt.includes("3rd")) expect(opt(correct(i))).toBe(name(sc[2]!));
      else if (i.prompt.includes("5th")) expect(opt(correct(i))).toBe(name(sc[4]!));
    }
  });
});

describe("stave-facts, middle-c-find, letter-names, step-size: derived from the printed position", () => {
  it("stave-facts: counts the line or space of the printed note from the bottom", () => {
    for (const i of items("G1-U3-L05", "t.g1.stave-facts")) {
      if (!i.prompt.startsWith("Counting from the bottom")) continue;
      const e = events(i).find((x) => x.kind === "note") as { pitch: string };
      const pos = music.staffPosition(i.music!.clef, music.parsePitch(e.pitch));
      const label = pos % 2 === 0 ? `${music.ordinal(pos / 2 + 1)}-line` : `${music.ordinal((pos - 1) / 2 + 1)}-space`;
      expect(correct(i)).toBe(label);
    }
  });
  it("middle-c-find: the printed note on the ledger line is the answer", () => {
    for (const i of items("G1-U3-L06", "t.g1.middle-c-find")) {
      if (i.music?.presentation === "keyboard") {
        const ps = events(i).map((e) => (e as { pitch: string }).pitch);
        expect(correct(i)).toBe(["lowest", "middle", "highest"][ps.indexOf("C4")]);
      } else {
        const ps = events(i).map((e) => (e as { pitch: string }).pitch);
        expect(Number(correct(i))).toBe(ps.indexOf("C4") + 1);
      }
    }
  });
  it("letter-names and step-size: from the keyboard picture and the written pitches", () => {
    for (const i of items("G1-U3-L01", "t.g1.letter-names")) {
      if (i.prompt.startsWith("Which letter name belongs")) expect(correct(i)).toBe((events(i)[0] as { pitch: string }).pitch.charAt(0));
    }
    for (const i of items("G1-U5-L01", "t.g1.step-size")) {
      const p = events(i).map((e) => music.parsePitch((e as { pitch: string }).pitch));
      expect(correct(i)).toBe(music.chromaticNumber(p[1]!) - music.chromaticNumber(p[0]!) === 1 ? "semitone" : "tone");
    }
  });
  it("hand-typed: E to F is a semitone; middle C is on the first ledger line below the treble stave", () => {
    expect(music.chromaticNumber(music.parsePitch("F4")) - music.chromaticNumber(music.parsePitch("E4"))).toBe(1);
    expect(music.ledgerLines("treble", music.parsePitch("C4"))).toBe(1);
    expect(music.staffPosition("treble", music.parsePitch("G4"))).toBe(2);
  });
});
