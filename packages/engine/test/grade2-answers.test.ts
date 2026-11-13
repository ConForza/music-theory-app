import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { generateItem } from "../src/index.ts";

/**
 * Independent check of the Brief 06 (Grade 2) generators. The generators write their own answers and the engine's solvability gate
 * grades those same answers, which is circular for choice questions. Here every answer is re-derived from what the learner SEES
 * (the printed notation and the prompt) with the curriculum rule functions, and compared. Hand-typed musical facts anchor the rules.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 120;

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
  expect(out.length, `${nodeId} ${templateId}`).toBeGreaterThan(SEEDS / 3);
  return out;
}
const correct = (i: ExerciseItem) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
const options = (i: ExerciseItem) => (i.answer as { options: Array<{ id: string; label: string }> }).options;
const label = (i: ExerciseItem, id: string) => options(i).find((o) => o.id === id)!.label;
type Ev = { kind: string; duration?: { value: music.NoteValue; dots: number }; events?: Ev[]; actual?: number; normal?: number; label?: string; pitch?: string; beam?: string };
const measuresOf = (i: ExerciseItem) => i.music!.measures.map((m) => (m.events ?? []) as unknown as Ev[]);
const frac = (e: Ev): music.Fraction => {
  if (e.kind === "tuplet") return e.events!.reduce((t, x) => music.add(t, frac(x)), music.frac(0)) as music.Fraction && music.mul(e.events!.reduce((t, x) => music.add(t, frac(x)), music.frac(0)), music.frac(e.normal!, e.actual!));
  return music.dotted(e.duration!.value, e.duration!.dots);
};
const total = (evs: Ev[]) => evs.reduce((t, e) => music.add(t, frac(e)), music.frac(0));
const same = (a: music.Fraction, b: music.Fraction) => music.equals(a, b);
const tsIn = (s: string) => /\b(\d{1,2})\/(\d{1,2})\b/.exec(s)!.slice(1, 3).map(Number) as [number, number];
const UNIT: Record<number, string> = { 2: "minim", 4: "crotchet", 8: "quaver" };
const noteName = (p: { step: string; alter: number }) => `${p.step}${p.alter === 1 ? "#" : p.alter === -1 ? "b" : ""}`;
const plainKey = (s: string) => s.replace(/♯/g, "#").replace(/♭/g, "b");

describe("beat-facts: derived from the time signature in the prompt", () => {
  it("beats, beat note, duple/triple/quadruple, the note that fills a bar, and the signature with N beats", () => {
    let seen = 0;
    for (const i of items("G2-U1-L03", "t.g2.beat-facts")) {
      seen++;
      if (i.prompt.startsWith("How many beats")) { const [t] = tsIn(i.prompt); expect(correct(i)).toBe(String(t)); }
      else if (i.prompt.includes("worth one beat")) { const [, b] = tsIn(i.prompt); expect(correct(i)).toBe(UNIT[b]); }
      else if (i.prompt.includes("duple, triple or quadruple")) { const [t] = tsIn(i.prompt); expect(correct(i)).toBe(({ 2: "duple", 3: "triple", 4: "quadruple" } as Record<number, string>)[t]); }
      else if (i.prompt.startsWith("Which single note")) {
        const [t, b] = tsIn(i.prompt);
        const id = correct(i);
        const v = id.replace(".", "") as music.NoteValue;
        expect(same(music.dotted(v, id.endsWith(".") ? 1 : 0), music.frac(t, b))).toBe(true);
        for (const o of options(i)) if (o.id !== id) expect(same(music.dotted(o.id.replace(".", "") as music.NoteValue, o.id.endsWith(".") ? 1 : 0), music.frac(t, b)), o.id).toBe(false);
      } else {
        const m = /has (\d) (\w+) beats/.exec(i.prompt)!;
        const bottom = Number(Object.entries(UNIT).find(([, n]) => n === m[2])![0]);
        expect(correct(i)).toBe(`${m[1]}/${bottom}`);
        expect(options(i).filter((o) => o.id === `${m[1]}/${bottom}`)).toHaveLength(1);
      }
    }
    expect(seen).toBeGreaterThan(40);
  });
});

describe("triplets: derived from the printed notes and their durations", () => {
  it("triplet-facts: values, counts and the number of notes in a bar", () => {
    for (const i of items("G2-U1-L04", "t.g2.triplet-facts")) {
      if (i.prompt.includes("are played as a triplet")) {
        const u = /Three (\w+)s/.exec(i.prompt)![1] as music.NoteValue;
        const want = music.mul(music.dotted(u, 0), music.frac(2));
        const id = correct(i);
        expect(same(music.dotted(id.replace(".", "") as music.NoteValue, id.endsWith(".") ? 1 : 0), want), i.prompt).toBe(true);
      } else if (i.prompt.includes("How many notes are in")) expect(correct(i)).toBe("3");
      else if (i.prompt.includes("Which number")) expect(correct(i)).toBe("3");
      else if (i.prompt.includes("Which lasts longer")) expect(correct(i)).toBe("ordinary");
      else {
        const [t, b] = tsIn(i.prompt);
        void b;
        expect(Number(correct(i))).toBe(t * 3);
      }
    }
  });
  it("triplet-read: single note value, notes played, and the beat the triplet starts on", () => {
    for (const i of items("G2-U1-L04", "t.g2.triplet-read")) {
      const bar = measuresOf(i)[0]!;
      const [top, bottom] = [i.music!.timeSignature!.split("/").map(Number)[0]!, i.music!.timeSignature!.split("/").map(Number)[1]!];
      expect(same(total(bar), music.frac(top, bottom))).toBe(true);
      const tuplet = bar.find((e) => e.kind === "tuplet")!;
      const idx = bar.indexOf(tuplet);
      if (i.prompt.includes("Which single note")) {
        const v = music.valueFor(frac(tuplet), 0)!;
        expect(correct(i)).toBe(v.value);
      } else if (i.prompt.includes("How many notes are played")) {
        expect(Number(correct(i))).toBe(bar.length - 1 + tuplet.events!.length);
      } else {
        const before = total(bar.slice(0, idx));
        const beat = music.metreStructure(i.music!.timeSignature!).beatUnit;
        expect(Number(correct(i))).toBe(Math.round((before.n / before.d) / (beat.n / beat.d)) + 1);
      }
    }
  });
  it("triplet-mixed and triplet-fill: units add up to three, rests are not counted as notes, and the group fills one beat", () => {
    for (const i of items("G2-U1-L05", "t.g2.triplet-mixed")) {
      const bar = measuresOf(i)[0]!;
      const t = bar.find((e) => e.kind === "tuplet")!;
      const beat = music.metreStructure(i.music!.timeSignature!).beatUnit;
      expect(same(frac(t), beat), "a group fills exactly one beat").toBe(true);
      if (i.prompt.includes("actually played")) expect(Number(correct(i))).toBe(t.events!.filter((e) => e.kind === "note").length);
      else if (i.prompt.includes("Which part")) { const k = t.events!.findIndex((e) => e.kind === "rest"); expect(t.events!.every((e) => frac(e).n === frac(t.events![0]!).n && frac(e).d === frac(t.events![0]!).d)).toBe(true); expect(Number(correct(i))).toBe(k); }
      else expect(correct(i)).toBe("one");
    }
    for (const i of items("G2-U1-L05", "t.g2.triplet-fill")) {
      const unit = /three (\w+)s of written/.exec(i.prompt)![1] as music.NoteValue;
      const groups = measuresOf(i).map((m) => m[0]!);
      const units = groups.map((g) => g.events!.reduce((t, e) => t + (frac(e).n / frac(e).d) / (music.dotted(unit, 0).n / music.dotted(unit, 0).d), 0));
      const right = units.map((u, k) => (Math.abs(u - 3) < 1e-9 ? k + 1 : 0)).filter(Boolean);
      expect(right).toEqual([Number(correct(i))]);
    }
  });
});

describe("rests and beaming: every option is judged with the bar rules, from the printed bars", () => {
  const check = (nodeId: string) => {
    for (const i of items(nodeId, "t.g2.rest-judge")) {
      const ts = tsIn(i.prompt).join("/");
      const bars = measuresOf(i);
      const issues = bars.map((b) => music.checkBarAnyPattern(b as never, ts).issues.map((x) => x.code));
      const clean = issues.map((x, k) => (x.length === 0 ? k + 1 : 0)).filter(Boolean);
      const rest = issues.map((x, k) => (x.some((c) => c === "rest-across-beat" || c === "half-bar-rest-misplaced") ? k + 1 : 0)).filter(Boolean);
      const beat = music.metreStructure(ts).beatUnit;
      if (i.prompt.includes("breaks that rule")) {
        // the answer is the only bar whose two-beat rest does not fill a half of the bar; the other two are correct
        expect(rest, i.prompt).toEqual([Number(correct(i))]);
        expect(clean).toHaveLength(2);
        for (const b of bars) expect(b.filter((e) => e.kind === "rest").every((e) => same(frac(e), music.mul(beat, music.frac(2)))), "all bars use a two-beat rest").toBe(true);
      } else {
        expect(clean, i.prompt).toEqual([Number(correct(i))]);
        // wrong bars differ by a rest rule (or are a beat short), not by the sound being a different length from the others in a "which breaks" way
        for (const k of [1, 2, 3]) if (k !== Number(correct(i))) expect(issues[k - 1]!.length, `bar ${k}`).toBeGreaterThan(0);
        const good = bars[Number(correct(i)) - 1]!;
        for (const r of good.filter((e) => e.kind === "rest")) expect(frac(r).n / frac(r).d <= beat.n / beat.d + 1e-9, "no rest longer than a beat in the right bar").toBe(true);
      }
      for (const b of bars) expect(b.every((e) => e.kind !== "rest" || (e.duration!.dots ?? 0) === 0), "no dotted rests").toBe(true);
    }
  };
  it("beats, half of the bar and halfway through one beat", () => {
    check("G2-U2-L02");
    check("G2-U2-L03");
    check("G2-U2-L04");
  });
  it("rest-fix: the shown bar breaks a rest rule, the model answer does not, and both sound the same", () => {
    for (const nodeId of ["G2-U2-L03", "G2-U2-L04"]) for (const i of items(nodeId, "t.g2.rest-fix")) {
      const a = i.answer as unknown as { timeSignature: string; accepted: Array<Array<{ events: Ev[] }>> };
      const shown = measuresOf(i)[0]!;
      const fixed = a.accepted[0]![0]!.events;
      expect(music.checkBarAnyPattern(fixed as never, a.timeSignature).issues).toEqual([]);
      const bad = music.checkBarAnyPattern(shown as never, a.timeSignature, { requireBeams: false }).issues.map((x) => x.code);
      expect(bad.some((c) => c === "rest-across-beat" || c === "half-bar-rest-misplaced"), bad.join()).toBe(true);
      expect(same(total(shown), total(fixed))).toBe(true);
      expect(shown.filter((e) => e.kind === "note").length).toBe(fixed.filter((e) => e.kind === "note").length);
    }
  });
});

describe("Brief 06 review fixes", () => {
  it("time-sig-read: every time signature that fits the notes is accepted, so 4/4 and 2/2 are never marked apart", () => {
    let both = 0;
    for (const nodeId of ["G2-U1-L01", "G2-U1-L03"]) for (const i of items(nodeId, "t.g2.time-sig-read")) {
      const accepted = (i.answer as { accepted: string[] }).accepted;
      const bars = measuresOf(i);
      for (const t of ["2/2", "3/2", "4/2", "3/8", "2/4", "3/4", "4/4"]) {
        const fits = bars.every((b) => music.checkBarAnyPattern(b as never, t, { requireBeams: false }).issues.length === 0);
        expect(accepted.includes(t), `${i.prompt} ${t}`).toBe(fits);
      }
      if (accepted.length > 1) both++;
      expect(JSON.stringify(i.hints)).not.toMatch(/compound/i);
    }
    expect(both).toBeGreaterThan(0);
  });
  it("ledger-place: the position is named, one pitch is right, and it needs a ledger line", () => {
    for (const i of items("G2-U2-L05", "t.g2.ledger-place")) {
      const a = i.answer as { clef: music.Clef; accepted: string[] };
      expect(a.accepted).toHaveLength(1);
      expect(music.ledgerLines(a.clef, music.parsePitch(a.accepted[0]!))).toBeGreaterThanOrEqual(1);
      expect(i.prompt).toMatch(/ledger line|space/);
    }
  });
  it("bar-judge: in the beat-count questions the three bars are beamed alike, so the beams cannot give the answer", () => {
    for (const i of items("G2-U1-L01", "t.g2.bar-judge")) {
      if (!i.prompt.includes("exactly the right number of beats")) continue;
      const beamed = measuresOf(i).map((b) => b.some((e) => e.beam));
      expect(new Set(beamed).size).toBe(1);
    }
  });
  it("triplet descriptions close the group, so a screen-reader user can tell where it ends", () => {
    for (const i of items("G2-U1-L05", "t.g2.triplet-mixed")) {
      expect(i.music!.textAlternative).toMatch(/a triplet \(.+\)/);
      expect(i.music!.questionAlternative).toMatch(/a triplet \(.+\)/);
    }
  });
  it("melody interval questions never mark the tonic, and offer 2nd to 7th", () => {
    for (const i of items("G2-U5-L04", "t.g2.melody-detail")) if (i.prompt.includes("interval, by number")) {
      expect(options(i).map((o) => o.id)).toEqual(["2", "3", "4", "5", "6", "7"]);
      expect(Number(correct(i))).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("melody questions are answerable without seeing the page", () => {
  it("the description gives the bars, every note's length and exact position, the triplet group and the marked note", () => {
    let triplets = 0;
    let marked = 0;
    for (const i of items("G2-U5-L04", "t.g2.melody-detail")) {
      const text = i.music!.textAlternative;
      const bars = measuresOf(i);
      bars.forEach((_, k) => expect(text, `bar ${k + 1}`).toContain(`Bar ${k + 1}:`));
      const hasTriplet = bars.some((b) => b.some((e) => e.kind === "tuplet"));
      if (hasTriplet) { expect(text).toMatch(/triplet group of three notes sharing one beat \(/); triplets++; }
      const notes = bars.flat().flatMap((e) => (e.kind === "tuplet" ? e.events! : [e])).filter((e) => e.kind === "note");
      expect((text.match(/\b(crotchet|minim|quaver|semibreve|semiquaver)\b/g) ?? []).length, text).toBeGreaterThanOrEqual(notes.length);
      expect((text.match(/\b(line|space)\b/g) ?? []).length, text).toBeGreaterThanOrEqual(notes.length);
      if (i.prompt.includes("interval, by number")) { expect(text).toContain("(the note marked x)"); marked++; }
    }
    expect(triplets).toBeGreaterThan(0);
    expect(marked).toBeGreaterThan(0);
  });
  it("interval questions only mark a note above the tonic, and the nearest tonic below it is strictly lower", () => {
    for (const i of items("G2-U5-L04", "t.g2.melody-detail")) if (i.prompt.includes("interval, by number")) {
      const key = music.parseKey(i.music!.key!);
      const x = measuresOf(i).flat().flatMap((e) => (e.kind === "tuplet" ? e.events! : [e])).find((e) => e.label === "x")!;
      const p = music.parsePitch(x.pitch!);
      expect(p.step === key.tonic.step && p.alter === key.tonic.alter, "the marked note is not the tonic").toBe(false);
      const below = { ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
      expect(music.diatonicNumber(below)).toBeLessThan(music.diatonicNumber(p));
      expect(Number(correct(i))).toBe(music.diatonicNumber(p) - music.diatonicNumber(below) + 1);
    }
  });
});

describe("clef-pair: the same pitch in the other clef", () => {
  it("positions and ledger lines agree with the clef tables", () => {
    for (const i of items("G2-U2-L06", "t.g2.clef-pair")) {
      const from = i.music!.clef as music.Clef;
      const to = /in the (treble|bass) clef\?|in the (treble|bass) clef,/.exec(i.prompt.replace("Where would the same pitch be written in the", "in the"))!;
      const toClef = (to[1] ?? to[2]) as music.Clef;
      expect(toClef).not.toBe(from);
      const p = music.parsePitch((measuresOf(i)[0]![0] as Ev).pitch!);
      if (i.prompt.includes("how many ledger lines")) expect(correct(i)).toBe(String(music.ledgerLines(toClef, p)));
      else expect(correct(i)).toBe(String(music.staffPosition(toClef, p)));
      expect(music.ledgerLines(from, p)).toBeLessThanOrEqual(2);
      expect(music.ledgerLines(toClef, p)).toBeLessThanOrEqual(2);
    }
  });
});

describe("scales, keys, degrees and triads: derived with the key rules", () => {
  it("scale-gap: the missing note is the scale note at the position of the rest (major and harmonic minor)", () => {
    for (const nodeId of ["G2-U3-L02", "G2-U4-L04", "G2-U4-L03"]) for (const i of items(nodeId, "t.g2.scale-gap")) {
      const text = plainKey(i.prompt);
      const m = /scale of ([A-G][b#]?) major/.exec(text);
      const h = /([A-G][b#]?) harmonic minor scale/.exec(text);
      const key = music.parseKey(m ? `${m[1]} major` : `${h![1]} minor`);
      const sc = music.scale(key, m ? "major" : "harmonic");
      const evs = measuresOf(i)[0]!;
      const gap = evs.findIndex((e) => e.kind === "rest");
      expect(evs.length).toBe(8);
      expect(correct(i)).toBe(noteName(sc[gap % 7]!));
      // the other printed notes are exactly the scale
      evs.forEach((e, k) => { if (k !== gap) expect(noteName(music.parsePitch(e.pitch!)), `${i.prompt} note ${k + 1}`).toBe(noteName(sc[k % 7]!)); });
    }
  });
  it("key-facts: counts, types, keys and the order of the signs", () => {
    for (const i of items("G2-U4-L05", "t.g2.key-facts")) {
      const text = plainKey(i.prompt);
      const k = /([A-G][b#]?) (major|minor)/.exec(text);
      if (i.prompt.startsWith("How many")) { const key = music.parseKey(`${k![1]} ${k![2]}`); expect(correct(i)).toBe(String(music.keySignature(key).count)); }
      else if (i.prompt.startsWith("Is the key signature")) { const key = music.parseKey(`${k![1]} ${k![2]}`); expect(correct(i)).toBe(music.keySignature(key).type); }
      else if (i.prompt.startsWith("Which major key") || i.prompt.startsWith("Which minor key")) {
        const key = music.parseKey(correct(i));
        const sig = music.keySignature(key);
        const n = /has (no sharps or flats|\d+ \w+)/.exec(i.prompt)![1]!;
        const word = sig.count === 0 ? "no sharps or flats" : `${sig.count} ${sig.count === 1 ? (sig.type === "sharps" ? "sharp" : "flat") : sig.type}`;
        expect(n).toBe(word);
        expect(options(i).filter((o) => { const s2 = music.keySignature(music.parseKey(o.id)); return s2.count === sig.count && s2.type === sig.type; })).toHaveLength(1);
      } else if (i.prompt.startsWith("Which sharps or flats")) { const key = music.parseKey(`${k![1]} ${k![2]}`); expect(correct(i)).toBe(music.keySignature(key).accidentals.join(",")); }
      else { const key = music.parseKey(`${k![1]} ${k![2]}`); expect(correct(i)).toBe(music.keySignature(key).accidentals.at(-1)); }
    }
  });
  it("minor-pattern and minor-facts: steps, raised notes and the lowered third", () => {
    for (const i of items("G2-U4-L01", "t.g2.minor-pattern")) {
      if (i.prompt.startsWith("Counting up")) { expect(correct(i)).toBe("2-3 and 5-6"); continue; }
      const evs = measuresOf(i)[0]! as Ev[];
      const [a, b] = evs.map((e) => music.parsePitch(e.pitch!));
      expect(correct(i)).toBe(music.chromaticNumber(b!) - music.chromaticNumber(a!) === 1 ? "semitone" : "tone");
      const key = music.parseKey(/([A-G][b#]?) minor/.exec(plainKey(i.prompt))![0]);
      const nat = music.scale(key, "natural");
      const d = Number(/These are the (\d)/.exec(i.prompt)![1]);
      expect(noteName(a!)).toBe(noteName(nat[d - 1]!));
    }
    for (const i of items("G2-U4-L04", "t.g2.minor-facts")) {
      const text = plainKey(i.prompt);
      const t = /([A-G][b#]?) harmonic minor/.exec(text) ?? /minor of ([A-G][b#]?)/.exec(text) ?? /([A-G][b#]?) minor\?/.exec(text);
      const key = music.parseKey(`${t![1]} minor`);
      const harm = music.scale(key, "harmonic");
      if (i.prompt.includes("which note of the key signature")) expect(correct(i)).toBe("7");
      else if (i.prompt.includes("raised 7th")) expect(correct(i)).toBe(noteName(harm[6]!));
      else if (i.prompt.includes("biggest")) {
        const gaps = harm.map((p, k) => music.chromaticNumber({ ...harm[(k + 1) % 7]!, octave: 4 + (k === 6 ? 1 : 0) }) - music.chromaticNumber({ ...p, octave: 4 }));
        void gaps;
        const semis = [1, 2, 3, 4, 5, 6].map((k) => { const lo = music.pitchFromNumbers(0, 0); void lo; return k; });
        void semis;
        expect(correct(i)).toBe("6-7");
        const six = harm[5]!, sev = harm[6]!;
        const up = (music.chromaticNumber({ ...sev, octave: 4 }) - music.chromaticNumber({ ...six, octave: 4 }) + 12) % 12;
        expect(up).toBe(3);
      } else expect(correct(i)).toBe(noteName(harm[2]!));
    }
    for (const i of items("G2-U4-L01", "t.g2.minor-facts")) {
      const m = /tonic triad of ([A-G][b#]?) major includes/.exec(plainKey(i.prompt))!;
      const minor = music.scale(music.parseKey(`${m[1]} minor`), "harmonic")[2]!;
      expect(correct(i)).toBe(noteName(minor));
      const major = music.scale(music.parseKey(`${m[1]} major`), "major")[2]!;
      expect(options(i).some((o) => o.id === noteName(major)), "the major third is not offered").toBe(false);
    }
  });
  it("relative-facts and relative-key use the same key signature", () => {
    for (const i of items("G2-U4-L02", "t.g2.relative-facts")) {
      if (i.prompt.includes("starts on which note")) { expect(correct(i)).toBe("6"); continue; }
      const m = /of ([A-G][b#]?) (major|minor)\?/.exec(plainKey(i.prompt)) ?? /^([A-G][b#]?) (major) shares/.exec(plainKey(i.prompt))!;
      const rel = music.formatKey(music.relativeKey(music.parseKey(`${m[1]} ${m[2]}`)));
      expect(correct(i)).toBe(rel);
      expect(music.keySignature(music.parseKey(rel))).toEqual(music.keySignature(music.parseKey(`${m[1]} ${m[2]}`)));
    }
  });
  it("degree-note, triad-notes and interval-note: counted up the scale from the tonic", () => {
    for (const i of items("G2-U4-L05", "t.g2.degree-note")) {
      const m = /In ([A-G][b#]?) (major|minor)/.exec(plainKey(i.prompt))!;
      const key = music.parseKey(`${m[1]} ${m[2]}`);
      const d = Number(/degree (\d)/.exec(i.prompt)![1]);
      expect(correct(i)).toBe(noteName(music.scale(key, m[2] === "major" ? "major" : "harmonic")[d - 1]!));
    }
    for (const i of items("G2-U4-L05", "t.g2.triad-notes")) {
      const m = /tonic triad of ([A-G][b#]?) (major|minor)/.exec(plainKey(i.prompt))!;
      const key = music.parseKey(`${m[1]} ${m[2]}`);
      const sc = music.scale(key, m[2] === "major" ? "major" : "harmonic");
      const tri = [sc[0]!, sc[2]!, sc[4]!];
      if (i.prompt.startsWith("Which three notes")) expect(label(i, correct(i)).split(" ").map(plainKey)).toEqual(tri.map(noteName));
      else if (i.prompt.includes("is missing")) {
        const shown = (measuresOf(i)[0]![0] as unknown as { notes: Array<{ pitch: string }> }).notes.map((n) => noteName(music.parsePitch(n.pitch)));
        const missing = tri.map(noteName).filter((n) => !shown.includes(n));
        expect(missing).toEqual([correct(i)]);
      } else { const idx = ["root", "3rd", "5th"].findIndex((r) => i.prompt.includes(`the ${r} (`)); expect(correct(i)).toBe(noteName(tri[idx]!)); }
    }
    for (const i of items("G2-U5-L01", "t.g2.interval-note")) {
      const m = /In ([A-G][b#]?) (major|minor), which note is a (\d)/.exec(plainKey(i.prompt))!;
      const key = music.parseKey(`${m[1]} ${m[2]}`);
      const n = Number(m[3]);
      expect(m[2] === "minor" && n === 7, "the 7th of a minor key is never asked").toBe(false);
      expect(correct(i)).toBe(noteName(music.scale(key, m[2] === "major" ? "major" : "harmonic")[n - 1]!));
    }
  });
  it("key-signature: the keys bound to lessons all have a sign to write, so a written signature is never empty", () => {
    for (const nodeId of ["G2-U3-L03", "G2-U4-L05"]) for (const i of items(nodeId, "t.g2.key-signature")) {
      const a = i.answer as { task?: string; accepted?: string[] };
      if (a.task === "write-signature") expect(music.keySignature(music.parseKey(a.accepted![0]!)).count, i.prompt).toBeGreaterThan(0);
    }
  });
  it("hand-typed: the Grade 2 scales, signatures and tonic triads", () => {
    const names = (k: string, f: "major" | "harmonic") => music.scale(music.parseKey(k), f).map(noteName).join(" ");
    expect(names("A major", "major")).toBe("A B C# D E F# G# A");
    expect(names("Bb major", "major")).toBe("Bb C D Eb F G A Bb");
    expect(names("Eb major", "major")).toBe("Eb F G Ab Bb C D Eb");
    expect(names("A minor", "harmonic")).toBe("A B C D E F G# A");
    expect(names("E minor", "harmonic")).toBe("E F# G A B C D# E");
    expect(names("D minor", "harmonic")).toBe("D E F G A Bb C# D");
    expect(music.keySignature(music.parseKey("A major")).accidentals).toEqual(["F#", "C#", "G#"]);
    expect(music.keySignature(music.parseKey("Bb major")).accidentals).toEqual(["Bb", "Eb"]);
    expect(music.keySignature(music.parseKey("Eb major")).accidentals).toEqual(["Bb", "Eb", "Ab"]);
    expect(music.keySignature(music.parseKey("E minor")).accidentals).toEqual(["F#"]);
    expect(music.keySignature(music.parseKey("D minor")).accidentals).toEqual(["Bb"]);
    expect(music.formatKey(music.relativeKey(music.parseKey("D minor")))).toBe("F major");
    const tri = (k: string, f: "major" | "harmonic") => [0, 2, 4].map((d) => noteName(music.scale(music.parseKey(k), f)[d]!)).join(" ");
    expect(tri("Eb major", "major")).toBe("Eb G Bb");
    expect(tri("D minor", "harmonic")).toBe("D F A");
    expect(tri("E minor", "harmonic")).toBe("E G B");
  });
});

describe("terms and melodies: derived from the vocabulary and the printed tune", () => {
  it("term-use: the right option is the term asked about, and no near-synonym stands beside it", () => {
    for (const nodeId of ["G2-U5-L02", "G2-U5-L03"]) for (const i of items(nodeId, "t.g2.term-use")) {
      const t = music.TERMS.find((x) => x.id === correct(i))!;
      expect(t.firstGrade).toBe(2);
      const q = /“(.+)”/.exec(i.prompt);
      if (i.prompt.startsWith("What does") && q) { expect(q[1]).toBe(t.term); expect(label(i, t.id)).toBe(t.meaning); }
      if (i.prompt.includes("the mark on the first note")) {
        const first = measuresOf(i)[0]![0] as unknown as { dynamic?: string; articulations?: string[] };
        const shown = first.dynamic ?? (first.articulations ?? []).join();
        expect(shown).toBe(({ sforzando: "sf", fortepiano: "fp", tenuto: "tenuto" } as Record<string, string>)[t.id]);
        expect(label(i, t.id)).toBe(t.meaning);
      }
      if (i.prompt.startsWith("Which term or sign means")) { expect(q![1]).toBe(t.meaning); expect(label(i, t.id)).toBe(t.term); }
      for (const o of options(i)) {
        if (o.id === t.id) continue;
        const other = music.TERMS.find((x) => x.id === o.id)!;
        expect(other.meaning).not.toBe(t.meaning);
        expect(t.similar?.includes(other.id) || other.similar?.includes(t.id), `${t.id} vs ${other.id}`).toBeFalsy();
        expect(other.firstGrade).toBeLessThanOrEqual(2);
      }
      if (i.prompt.includes("This melody is marked")) expect(i.music!.tempoText).toBe(t.term);
    }
  });
  it("melody-detail: beats, the beat note, the triplet bar, the key, the interval and the ledger lines come from the printed music", () => {
    for (const i of items("G2-U5-L04", "t.g2.melody-detail")) {
      const ts = i.music!.timeSignature!;
      const [top, bottom] = ts.split("/").map(Number) as [number, number];
      const bars = measuresOf(i);
      for (const b of bars) expect(same(total(b), music.frac(top, bottom)), `${ts} bar total`).toBe(true);
      if (i.prompt.includes("How many beats")) expect(correct(i)).toBe(String(top));
      else if (i.prompt.includes("worth one beat")) expect(correct(i)).toBe(UNIT[bottom]);
      else if (i.prompt.includes("contains a triplet")) expect(correct(i)).toBe(String(bars.findIndex((b) => b.some((e) => e.kind === "tuplet")) + 1));
      else if (i.prompt.includes("Which key") || i.prompt.includes("Which major key") || i.prompt.includes("Which key is it")) expect(correct(i)).toBe(i.music!.key);
      else if (i.prompt.includes("ledger lines")) {
        const ps = bars.flat().flatMap((e) => (e.kind === "tuplet" ? e.events! : [e])).filter((e) => e.kind === "note").map((e) => music.parsePitch(e.pitch!));
        expect(correct(i)).toBe(String(Math.max(...ps.map((p) => music.ledgerLines(i.music!.clef as music.Clef, p)))));
      } else if (i.prompt.includes("interval, by number")) {
        const key = music.parseKey(i.music!.key!);
        const x = bars.flat().flatMap((e) => (e.kind === "tuplet" ? e.events! : [e])).find((e) => e.label === "x")!;
        const p = music.parsePitch(x.pitch!);
        const below = { ...key.tonic, octave: p.octave - (music.stepIndex(p.step) < music.stepIndex(key.tonic.step) ? 1 : 0) };
        expect(Number(correct(i))).toBe(music.diatonicNumber(p) - music.diatonicNumber(below) + 1);
      } else if (i.prompt.includes("is marked")) {
        const t = music.TERMS.find((x) => x.id === correct(i))!;
        expect(i.music!.tempoText).toBe(t.term);
        expect(label(i, t.id)).toBe(t.meaning);
      } else throw new Error(`unrecognised melody-detail prompt: ${i.prompt}`);
    }
  });
});
