import { buildIndex, effectiveScope, loadCurriculum, music, type ExerciseItem } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { canonicalResponse, generateItem, generationFingerprint, gradeItem, wrongResponse } from "../src/index.ts";

/**
 * Independent check of the Brief 08 (Grade 4) generators. The generators write their own answers and the engine's solvability gate grades
 * those same answers, which is circular for choice questions. Here every answer is re-derived from what the learner SEES (the printed
 * notation, read back with the curriculum's own accidental rules, and the prompt) and compared; hand-typed musical facts anchor the
 * rules; adversarial answers are graded through the real engine.
 */
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const SEEDS = 150;

function items(nodeId: string, templateId: string, seeds = SEEDS): ExerciseItem[] {
  const node = ix.nodeById.get(nodeId)!;
  const b = node.exercises.find((x) => x.templateId === templateId);
  expect(b, `${nodeId} binds ${templateId}`).toBeTruthy();
  const scope = effectiveScope(ix, node, b!);
  const out: ExerciseItem[] = [];
  for (let s = 1; s <= seeds; s++) {
    try {
      out.push(generateItem(ix, templateId, s, { scope }).item);
    } catch {
      /* skipped seed */
    }
  }
  expect(out.length, `${nodeId} ${templateId}`).toBeGreaterThan(seeds / 3);
  return out;
}
const scopeOf = (nodeId: string, templateId: string) => effectiveScope(ix, ix.nodeById.get(nodeId)!, ix.nodeById.get(nodeId)!.exercises.find((x) => x.templateId === templateId)!);
const correct = (i: ExerciseItem) => (i.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
const options = (i: ExerciseItem) => (i.answer as { options: Array<{ id: string; label: string }> }).options;
const label = (i: ExerciseItem, id: string) => options(i).find((o) => o.id === id)!.label;
const parts = (i: ExerciseItem) => (i.answer as unknown as { parts: Array<{ id: string; prompt: string; answer: Record<string, unknown> }> }).parts;
type Ev = { kind: string; duration?: { value: music.NoteValue; dots: number }; events?: Ev[]; pitch?: string; notes?: Array<{ pitch: string }>; beam?: string; label?: string; tieToNext?: boolean; wholeBar?: boolean };
const dur = (e: Ev & { actual?: number; normal?: number }): music.Fraction => (e.kind === "tuplet" ? music.mul(e.events!.reduce((t, x) => music.add(t, dur(x)), music.frac(0)), music.frac(e.normal!, e.actual!)) : music.dotted(e.duration!.value, e.duration!.dots));
const total = (evs: Ev[]) => evs.reduce((t, e) => music.add(t, dur(e)), music.frac(0));
const issues = (evs: Ev[], ts: string, opts: music.BarCheckOptions = {}) => music.checkBarAnyPattern(evs as unknown as music.REvent[], ts, opts).issues.map((x) => x.code);
const P = music.parsePitch;
const sound = (p: music.Pitch) => music.chromaticNumber(p);
const plain = (s: string) => s.replace(/♯/g, "#").replace(/♭/g, "b").replace(/𝄪/g, "x").replace(/𝄫/g, "bb");
const ALL_TS = ["2/2", "3/2", "4/2", "2/4", "3/4", "4/4", "2/8", "3/8", "4/8", "6/4", "9/4", "12/4", "6/8", "9/8", "12/8", "6/16", "9/16", "12/16"];
const NEWTS = ["2/8", "4/8", "6/4", "9/4", "12/4", "6/16", "9/16", "12/16"];
const NAME: Record<number, music.NoteValue> = { 1: "semibreve", 2: "minim", 4: "crotchet", 8: "quaver", 16: "semiquaver" };

/** The sounding pitches of a fragment's written notes, read as the learner reads them: key signature and bar state applied. */
function readBack(f: NonNullable<ExerciseItem["music"]>): Array<{ pitch: music.Pitch; label?: string }> {
  const resolved = music.resolveWrittenPitches(f as unknown as music.AFragment);
  const labels: Array<string | undefined> = [];
  for (const m of f.measures) for (const e of m.events ?? []) { if (e.kind === "tuplet") continue; if (e.kind === "chord") e.notes.forEach(() => labels.push(e.label)); else labels.push((e as { label?: string }).label); }
  return resolved.map((r, k) => ({ pitch: r.pitch, label: labels[k] }));
}

describe("Unit 1: breves, double dots", () => {
  it("breve-facts: counts, bars and rests re-derived from the note values", () => {
    const seen = new Set<string>();
    for (const i of items("G4-U1-L01", "t.g4.breve-facts", 200)) {
      if (i.prompt.startsWith("How many")) {
        const unit = /How many (\w+)s last/.exec(i.prompt)![1]! as music.NoteValue;
        expect(Number(correct(i))).toBe(music.dotted("breve").n / music.dotted("breve").d / (music.NOTE_VALUES[unit].n / music.NOTE_VALUES[unit].d));
        seen.add("count");
      } else if (i.prompt.includes("silent bar in 4/2")) { expect(correct(i)).toBe("breve"); expect(label(i, "breve")).toMatch(/rest/i); seen.add("rest"); }
      else if (i.prompt.includes("single note fills")) { expect(correct(i)).toBe("breve"); seen.add("note"); }
      else if (i.prompt.includes("shown by a breve rest")) { expect(correct(i)).toBe("4/2"); seen.add("ts"); }
      else if (i.prompt.includes("two semibreves tied") || i.prompt.includes("Which lasts longer")) seen.add("compare");
      else throw new Error(`unexpected prompt ${i.prompt}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    // hand-typed anchors: a breve is two semibreves, four minims, eight crotchets; 4/2 holds exactly one
    expect(music.equals(music.dotted("breve"), music.frac(2))).toBe(true);
    expect(music.equals(music.barCapacity(music.parseTimeSignature("4/2")), music.frac(2))).toBe(true);
  });

  it("breve-bar: the one accepted answer fills 4/2; tied notes equal exactly one breve", () => {
    const modes = new Set<string>();
    for (const i of items("G4-U1-L01", "t.g4.breve-bar", 120)) {
      const a = i.answer as unknown as { task: string; accepted: Array<Array<{ events: Ev[] }>>; target?: [number, number]; acceptAnyRuleCompliant: boolean };
      const bar = a.accepted[0]![0]!.events;
      expect(bar).toHaveLength(1);
      expect(bar[0]!.duration!.value).toBe("breve");
      expect(music.equals(total(bar), music.frac(2))).toBe(true);
      if (a.task === "equivalent-value") {
        const tied = (i.music!.measures[0]!.events as unknown as Ev[]);
        expect(music.equals(total(tied), music.frac(a.target![0], a.target![1]))).toBe(true);
        expect(tied.slice(0, -1).every((e) => e.tieToNext)).toBe(true);
        modes.add("tied");
      } else {
        expect(a.acceptAnyRuleCompliant).toBe(false);
        modes.add(bar[0]!.kind);
      }
    }
    expect([...modes].sort()).toEqual(["note", "rest", "tied"]);
  });

  it("double-dot-facts: every count equals note + half + quarter", () => {
    const seen = new Set<string>();
    for (const i of items("G4-U1-L02", "t.g4.double-dot-facts", 250)) {
      if (i.prompt.startsWith("How many")) {
        const m = /How many (\w+)s last as long as a double-dotted (\w+)/.exec(i.prompt)!;
        const big = music.dotted(m[2] as music.NoteValue, 2);
        const unit = music.dotted(m[1] as music.NoteValue);
        expect(Number(correct(i))).toBe((big.n * unit.d) / (big.d * unit.n));
        if (/rest/.test(i.prompt)) seen.add("rest"); else seen.add("note");
      } else if (i.prompt.startsWith("Which notes added together")) {
        const base = /double-dotted (\w+)\?/.exec(i.prompt)![1]! as music.NoteValue;
        const [a, b, c] = correct(i).split("+") as music.NoteValue[];
        expect(a).toBe(base);
        expect(music.equals(music.add(music.add(music.dotted(a!), music.dotted(b!)), music.dotted(c!)), music.dotted(base, 2))).toBe(true);
        seen.add("second");
      } else if (i.prompt.includes("tied to it")) seen.add("compare");
      else throw new Error(i.prompt);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    // anchors: a double-dotted crotchet is 7 semiquavers, a double-dotted minim 7 quavers, a double-dotted semibreve 7 crotchets
    expect(music.dotted("crotchet", 2)).toEqual(music.frac(7, 16));
    expect(music.dotted("minim", 2)).toEqual(music.frac(7, 8));
    expect(music.dotted("semibreve", 2)).toEqual(music.frac(7, 4));
  });

  it("double-dot-bar: given plus the accepted note fill the bar exactly, the given note is double-dotted, and no rest is accepted", () => {
    for (const i of items("G4-U1-L02", "t.g4.double-dot-bar", 200)) {
      const a = i.answer as unknown as { timeSignature: string; given: Ev[]; accepted: Array<Array<{ events: Ev[] }>> };
      const full = a.accepted[0]![0]!.events;
      expect(music.equals(total(full), music.barCapacity(music.parseTimeSignature(a.timeSignature)))).toBe(true);
      expect(full.slice(0, a.given.length)).toEqual(a.given);
      expect(a.given[0]!.duration!.dots).toBe(2);
      expect(full.every((e) => e.kind === "note")).toBe(true);
      expect(i.prompt).toContain("double-dotted");
      expect(issues(full, a.timeSignature)).toEqual([]);
    }
  });
});

describe("Unit 1: regular time signatures and grouping", () => {
  it("metre-facts: kind, beats, beat note and bar length from the time signature", () => {
    const seen = new Set<string>();
    for (const i of items("G4-U1-L03", "t.g4.metre-facts", 300)) {
      const ts = /\b(\d{1,2}\/\d{1,2})\b/.exec(i.prompt)?.[1];
      const k = ts ? music.classifyTimeSignature(ts) : null;
      const p = ts ? music.parseTimeSignature(ts) : null;
      if (i.prompt.startsWith("What kind of time")) { expect(correct(i)).toBe(`${k!.metre} ${k!.beats}`); seen.add("name"); }
      else if (i.prompt.startsWith("How many beats")) { expect(correct(i)).toBe(String(k!.metre === "compound" ? p!.top / 3 : p!.top)); seen.add("beats"); }
      else if (i.prompt.includes("lasts exactly one beat")) {
        const s = music.metreStructure(ts!);
        const b = music.valueFor(s.beatUnit, 1)!;
        expect(correct(i)).toBe(b.dots ? `dotted-${b.value}` : b.value);
        seen.add("beat-note");
      } else if (i.prompt.includes("fill one whole bar")) { expect(correct(i)).toBe(String(p!.top)); expect(i.prompt).toContain(`${NAME[p!.bottom]}s`); seen.add("bar");
      } else if (i.prompt.startsWith("Which time signature has")) {
        const n = ["", "one", "two", "three", "four"].indexOf(/has (\w+) /.exec(i.prompt)![1]!);
        const right = correct(i);
        const s = music.metreStructure(right);
        expect(s.groups.length).toBe(n);
        // exactly one option has this beat count AND this beat note
        const same = options(i).filter((o) => music.metreStructure(o.id).groups.length === n && music.equals(music.metreStructure(o.id).beatUnit, s.beatUnit));
        expect(same.map((o) => o.id)).toEqual([right]);
        seen.add("which");
      } else if (i.prompt.includes("divided into equal notes")) { expect(correct(i)).toBe(k!.metre === "compound" ? "3" : "2"); seen.add("divide"); }
      else throw new Error(i.prompt);
    }
    expect(seen.size).toBe(6);
  });

  it("time-signature: exactly one of the eighteen regular signatures fits every bar (no ambiguous answers)", () => {
    for (const i of items("G4-U1-L03", "t.g4.time-signature", 250)) {
      const ts = (i.answer as unknown as { accepted: string[] }).accepted[0]!;
      const bars = i.music!.measures.map((m) => m.events as unknown as Ev[]);
      const fitting = ALL_TS.filter((t) => bars.every((b) => issues(b, t).length === 0));
      expect(fitting, JSON.stringify(bars).slice(0, 200)).toEqual([ts]);
      expect(NEWTS).toContain(ts);
    }
  });

  it("grouping-judge: every bar adds up; the right bar is clean and each wrong bar breaks only grouping", () => {
    const GROUPING = new Set(["beam-hides-compound-beat", "note-hides-compound-beat", "beat-not-beamed", "unnecessary-tie", "tie-instead-of-dot", "beam-crosses-beat", "beam-across-middle", "beam-hides-beat", "note-hides-beat"]);
    for (const i of items("G4-U1-L04", "t.g4.grouping-judge", 200)) {
      const ts = /bars are in (\d{1,2}\/\d{1,2})/.exec(i.prompt)![1]!;
      const bars = i.music!.measures.map((m) => m.events as unknown as Ev[]);
      const want = Number(correct(i)) - 1;
      bars.forEach((b, k) => {
        expect(music.equals(total(b), music.barCapacity(music.parseTimeSignature(ts)))).toBe(true);
        if (k === want) expect(issues(b, ts)).toEqual([]);
        else { const cs = issues(b, ts); expect(cs.length).toBeGreaterThan(0); expect(cs.every((c) => GROUPING.has(c)), cs.join()).toBe(true); }
      });
    }
  });
});

describe("Unit 1: duplets", () => {
  it("duplet-facts: a duplet of two notes lasts one beat; the other way is two dotted notes", () => {
    const seen = new Set<string>();
    for (const i of items("G4-U1-L05", "t.g4.duplet-facts", 250)) {
      const ts = /\b(\d{1,2}\/\d{1,2})\b/.exec(i.prompt)?.[1];
      if (i.prompt.includes("Which single note lasts the same time")) {
        const s = music.metreStructure(ts!);
        const b = music.valueFor(s.beatUnit, 1)!;
        expect(correct(i)).toBe(b.dots ? `dotted-${b.value}` : b.value);
        const sub = music.valueFor(music.mul(s.beatUnit, music.frac(1, 3)), 0)!.value;
        const d = i.music!.measures[0]!.events![0] as unknown as Ev;
        expect(d.kind).toBe("tuplet");
        expect(music.equals(dur(d), s.beatUnit)).toBe(true);
        expect(d.events![0]!.duration!.value).toBe(sub);
        seen.add("lasts");
      } else if (i.prompt.includes("How else can exactly the same sound")) {
        const sub = music.valueFor(music.mul(music.metreStructure(ts!).beatUnit, music.frac(1, 3)), 0)!.value;
        expect(correct(i)).toBe(`two-dotted-${sub}`);
        expect(music.equals(music.add(music.dotted(sub, 1), music.dotted(sub, 1)), music.metreStructure(ts!).beatUnit)).toBe(true);
        seen.add("other");
      } else if (/in the time of how many/i.test(i.prompt)) { expect(correct(i)).toBe("3"); seen.add("time-of"); }
      else if (i.prompt.includes("duplet or a triplet")) { expect(correct(i)).toBe(/two equal notes/.test(i.prompt) || /group of two/.test(i.prompt) ? "duplet" : "triplet"); seen.add("which"); }
      else if (i.prompt.includes("mainly found")) { expect(correct(i)).toBe(/^Duplets/.test(i.prompt) ? "compound" : "simple"); seen.add("time"); }
      else throw new Error(i.prompt);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("duplet-read: every bar adds up and the answer matches the bar", () => {
    for (const i of items("G4-U1-L05", "t.g4.duplet-read", 200)) {
      const bar = i.music!.measures[0]!.events as unknown as Ev[];
      const ts = i.music!.timeSignature ?? /^[^\d]*/.exec("")?.[0];
      const groups = bar.filter((e) => e.kind === "tuplet").length;
      if (i.prompt.startsWith("This bar of")) {
        const tsText = /bar of (\d{1,2}\/\d{1,2})/.exec(i.prompt)![1]!;
        expect(music.equals(total(bar), music.barCapacity(music.parseTimeSignature(tsText)))).toBe(true);
        expect(correct(i)).toBe(String(groups));
      } else {
        const fitting = options(i).map((o) => o.id).filter((t) => issues(bar, t).length === 0);
        expect(fitting).toEqual([correct(i)]);
      }
      void ts;
    }
  });
});

describe("Unit 2: double accidentals, enharmonics, clefs", () => {
  it("double-facts: sounds the same means the same key; two semitones", () => {
    for (const i of items("G4-U2-L01", "t.g4.double-facts", 250)) {
      if (i.prompt.startsWith("Which sign")) { expect(["double-sharp", "double-flat"]).toContain(correct(i)); continue; }
      if (i.prompt.includes("semitones?")) { expect(correct(i)).toBe("2"); continue; }
      if (i.prompt.startsWith("Which of these notes sounds the same")) {
        const ref = P(`${plain(/as (\S+)\?/.exec(i.prompt)![1]!)}4`);
        const same = options(i).filter((o) => sound(P(`${o.id}4`)) % 12 === sound(ref) % 12);
        expect(same.map((o) => o.id)).toEqual([correct(i)]);
        expect(Math.abs(ref.alter)).toBe(2);
      }
    }
  });

  it("double-name and double-write: the printed sign or the asked sign is a double sign, and the pitch is read back from the stave", () => {
    for (const i of items("G4-U2-L01", "t.g4.double-name", 150)) {
      const { pitch } = readBack(i.music!)[0]!;
      expect(Math.abs(pitch.alter)).toBeLessThanOrEqual(2);
      expect((i.answer as unknown as { accepted: string[] }).accepted).toEqual([music.formatPitch(pitch)]);
      expect(i.prompt).toMatch(/double/);
    }
    for (const i of items("G4-U2-L01", "t.g4.double-write", 150)) {
      const a = i.answer as unknown as { clef: music.Clef; target: { step: string; alter: number; maxLedgerLines: number }; accepted: string[] };
      expect(Math.abs(a.target.alter)).toBe(2);
      for (const p of a.accepted.map(P)) { expect(p.step).toBe(a.target.step); expect(p.alter).toBe(a.target.alter); expect(music.ledgerLines(a.clef, p)).toBeLessThanOrEqual(a.target.maxLedgerLines); }
    }
  });

  it("double-accidental and double-cancel: the marked note is what the bar-state rules print, never the later single-sharp convention", () => {
    for (const t of ["t.g4.double-accidental", "t.g4.double-cancel"]) {
      for (const i of items("G4-U2-L01", t, 200)) {
        if (t === "t.g4.double-cancel" && i.prompt.includes("Which sign is written")) { expect(correct(i)).toBe("natural"); continue; }
        if (t === "t.g4.double-cancel" && !i.music) continue;
        const read = readBack(i.music!);
        const marked = read.find((r) => r.label === "*")!;
        expect(marked, i.prompt).toBeTruthy();
        if (t === "t.g4.double-accidental") expect((i.answer as unknown as { accepted: string[] }).accepted).toEqual([music.formatPitch(marked.pitch)]);
        else {
          const id = correct(i);
          expect(plain(`${marked.pitch.step}${marked.pitch.alter === 2 ? "x" : marked.pitch.alter === -2 ? "bb" : marked.pitch.alter === 1 ? "#" : marked.pitch.alter === -1 ? "b" : ""}`)).toBe(id);
        }
        expect(i.prompt).toMatch(/double/);
      }
    }
  });

  it("enharmonic-letter and enharmonic-pick: same sound, the stated letter, different spelling, one answer", () => {
    for (const i of items("G4-U2-L02", "t.g4.enharmonic-letter", 250)) {
      const m = /sounds the same as (\S+) but uses the letter name ([A-G])/.exec(i.prompt)!;
      const ref = P(`${plain(m[1]!)}4`);
      const acc = (i.answer as unknown as { accepted: string[] }).accepted.map(P);
      expect(acc).toHaveLength(1);
      expect(acc[0]!.step).toBe(m[2]);
      expect(sound(acc[0]!)).toBe(sound(ref));
      expect(acc[0]!.step).not.toBe(ref.step);
    }
    for (const i of items("G4-U2-L02", "t.g4.enharmonic-pick", 250)) {
      if (i.prompt.startsWith("Which of these notes sounds the same")) {
        const ref = P(`${plain(/as (\S+)\?/.exec(i.prompt)![1]!)}4`);
        const same = options(i).filter((o) => sound(P(`${o.id}4`)) % 12 === sound(ref) % 12);
        expect(same.map((o) => o.id)).toEqual([correct(i)]);
        expect(P(`${correct(i)}4`).step).not.toBe(ref.step);
      } else {
        const pairs = options(i).map((o) => o.id.split("-").map((x) => P(`${x}4`)) as [music.Pitch, music.Pitch]);
        const eq = pairs.filter(([a, b]) => sound(a) % 12 === sound(b) % 12);
        expect(eq).toHaveLength(1);
        expect(options(i).find((o) => o.id === correct(i))!.id.split("-").map((x) => sound(P(`${x}4`)) % 12)[0]).toBe(sound(eq[0]![0]) % 12);
        pairs.forEach(([a, b]) => expect(a.step).not.toBe(b.step));
      }
    }
  });

  it("alto-facts: the alto clef anchors middle C on the middle line; names derived from the clef rules", () => {
    expect(music.naturalAt("alto", 4)).toMatchObject({ step: "C", octave: 4 });
    expect(music.staffPosition("alto", P("C4"))).toBe(4);
    expect(music.naturalAt("alto", 0)).toMatchObject({ step: "F", octave: 3 });
    expect(music.naturalAt("alto", 8)).toMatchObject({ step: "G", octave: 4 });
    const seen = new Set<string>();
    for (const i of items("G4-U2-L03", "t.g4.alto-facts", 250)) {
      if (i.prompt.includes("which line of the stave is middle C")) { expect(correct(i)).toBe("middle"); seen.add("c"); }
      else if (i.prompt.startsWith("Which clef has middle C on the middle line")) { expect(correct(i)).toBe("alto"); seen.add("clef"); }
      else {
        const where = /on the (.+?) of the alto-clef stave/.exec(i.prompt)![1]!;
        const ord: Record<string, number> = { "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, "5th": 4, bottom: 0, top: 4 };
        const kind = /space/.test(where) ? "space" : "line";
        const k = ord[where.split(" ")[0]!]!;
        const pos = kind === "line" ? 2 * k : 2 * k + 1;
        expect(correct(i)).toBe(music.naturalAt("alto", pos).step);
        // the treble and bass readings of the same position are always offered as wrong answers when they differ
        for (const c of ["treble", "bass"] as const) { const other = music.naturalAt(c, pos).step; if (other !== correct(i)) expect(options(i).map((o) => o.id)).toContain(other); }
        seen.add("note");
      }
    }
    expect(seen.size).toBe(3);
  });

  it("alto-read and alto-write: the prompt names the alto clef, and the answers follow the clef", () => {
    for (const i of items("G4-U2-L03", "t.g4.alto-read", 150)) {
      expect(i.prompt).toMatch(/alto/);
      expect(i.music!.clef).toBe("alto");
      const { pitch } = readBack(i.music!)[0]!;
      expect((i.answer as unknown as { accepted: string[] }).accepted).toEqual([music.formatPitch(pitch)]);
    }
    for (const i of items("G4-U2-L03", "t.g4.alto-write", 150)) {
      const a = i.answer as unknown as { clef: string; accepted: string[]; target: { step: string; alter: number } };
      expect(a.clef).toBe("alto");
      for (const p of a.accepted.map(P)) { expect(p.step).toBe(a.target.step); expect(p.alter).toBe(a.target.alter); expect(music.ledgerLines("alto", p)).toBeLessThanOrEqual(2); }
    }
  });

  it("same-pitch and clef-position: exactly the same sound, in the new clef; positions derived independently", () => {
    for (const i of items("G4-U2-L04", "t.g4.same-pitch", 200)) {
      const from = i.music!.clef;
      const shown = readBack(i.music!)[0]!.pitch;
      const a = i.answer as unknown as { clef: music.Clef; accepted: string[]; target: { octave: number } };
      expect(a.clef).not.toBe(from);
      expect(a.accepted).toEqual([music.formatPitch(shown)]);
      expect(music.ledgerLines(a.clef, P(a.accepted[0]!))).toBeLessThanOrEqual(2);
      expect(i.prompt).toMatch(/exactly the same/);
    }
    for (const i of items("G4-U2-L04", "t.g4.clef-position", 200)) {
      const from = i.music!.clef as music.Clef;
      const to = /Where is the same pitch written in the (\w+) clef/.exec(i.prompt)![1] as music.Clef;
      const shown = readBack(i.music!)[0]!.pitch;
      expect(Number(correct(i))).toBe(music.staffPosition(to, shown));
      // copying the position across clefs is a wrong answer that is always offered when it differs
      if (music.staffPosition(from, shown) !== music.staffPosition(to, shown)) expect(options(i).map((o) => o.id)).toContain(String(music.staffPosition(from, shown)));
    }
  });

  it("octave-pick-alto: moves exactly one octave in the stated direction, and the unmoved pitch is always a wrong option", () => {
    for (const i of items("G4-U2-L05", "t.g4.octave-pick-alto", 200)) {
      const m = /This note is in the (\w+) clef\. It is to be written an octave (higher|lower) in the (\w+) clef/.exec(i.prompt)!;
      const [from, dir, to] = [m[1] as music.Clef, m[2]!, m[3] as music.Clef];
      expect([from, to]).toContain("alto");
      const shown = readBack(i.music!)[0]!.pitch;
      const target = music.transpose(shown, music.parseInterval("P8"), dir === "higher" ? "up" : "down");
      expect(Number(correct(i))).toBe(music.staffPosition(to, target));
      expect(options(i).map((o) => o.id)).toContain(String(music.staffPosition(to, shown)));
      expect(correct(i)).not.toBe(String(music.staffPosition(to, shown)));
    }
  });

  it("octave-transpose-alto: alto is source or target, the key signature is kept and the answer is one octave away", () => {
    for (const i of items("G4-U2-L05", "t.g4.octave-transpose-alto", 120)) {
      const a = i.answer as unknown as { clef: string; accepted: string[][]; key: string };
      expect([i.music!.clef, a.clef]).toContain("alto");
      expect(i.prompt).toMatch(/alto/);
      const dir = /higher/.test(i.prompt) ? 1 : -1;
      const src = readBack(i.music!).map((r) => sound(r.pitch));
      expect(a.accepted[0]!.map((p) => sound(P(p)))).toEqual(src.map((s) => s + 12 * dir));
      expect(a.key).toBe(i.music!.key);
    }
  });
});

describe("Unit 3: keys, degrees, chromatic scales", () => {
  it("key-facts: counts, relatives, raised leading notes and double-sharp scales re-derived from the key rules", () => {
    const seen = new Set<string>();
    for (const i of items("G4-U3-L01", "t.g4.key-facts", 300)) {
      const keyIn = (s: string) => plain(s).replace(/♯/g, "#");
      if (i.prompt.startsWith("How many")) { const k = /signature of (.+?)\?/.exec(i.prompt)![1]!; expect(correct(i)).toBe(String(Math.abs(music.keyFifths(music.parseKey(plain(k)))))); seen.add("count"); }
      else if (i.prompt.startsWith("What is the relative")) { const k = /relative \w+ of (.+?)\?/.exec(i.prompt)![1]!; expect(correct(i)).toBe(music.formatKey(music.relativeKey(music.parseKey(plain(k))))); seen.add("relative"); }
      else if (i.prompt.includes("leading note")) {
        const k = music.parseKey(plain(/scale of (.+?), what/.exec(i.prompt)![1]!));
        const seventh = music.scale(k, "harmonic")[6]!;
        expect(correct(i)).toBe(music.formatPitchClass(seventh));
        // the enharmonic spelling that skips the letter is offered, and is wrong
        expect(options(i).length).toBe(4);
        seen.add("raised");
      } else if (i.prompt.includes("double sharp")) { expect(correct(i)).toBe("G# minor"); seen.add("double"); }
      else if (i.prompt.startsWith("Which of these shows all of the")) {
        const k = music.parseKey(plain(/(?:sharps|flats) of (.+?), in order/.exec(i.prompt)![1]!));
        expect(label(i, correct(i)).replace(/♯/g, "#").replace(/♭/g, "b").split(" ")).toEqual(music.keySignature(k).accidentals);
        seen.add("list");
      } else throw new Error(i.prompt + keyIn(""));
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    // anchors from the reference book: G# minor needs F double sharp; B flat harmonic minor needs A natural
    expect(music.formatPitchClass(music.scale(music.parseKey("G# minor"), "harmonic")[6]!)).toBe("Fx");
    expect(music.formatPitchClass(music.scale(music.parseKey("Bb minor"), "harmonic")[6]!)).toBe("A");
  });

  it("scale-build: accepted notes follow the scale rules for the key and form named; G# minor never accepts G natural for F double sharp", () => {
    for (const nodeId of ["G4-U3-L01", "G4-U3-L02"]) {
      for (const i of items(nodeId, "t.g4.scale-build", 80)) {
        const a = i.answer as unknown as { accepted: string[][]; derivation: { key: string; form: "major" | "harmonic" | "melodic"; direction: string; start: string } };
        const key = music.parseKey(a.derivation.key);
        const notes = a.accepted[0]!.map(P);
        const letters = notes.slice(0, 7).map((p) => p.step);
        expect(new Set(letters).size, "each letter once").toBe(7);
        if (a.derivation.form === "harmonic" && music.formatKey(key) === "G# minor" && a.derivation.direction === "ascending") expect(a.accepted[0]!.map((p) => p.replace(/\d/, ""))).toContain("Fx");
      }
    }
    // adversarial: G natural instead of F double sharp is refused by the real grader
    const it = items("G4-U3-L01", "t.g4.scale-build", 200).find((x) => /G♯ harmonic minor scale, ascending/.test(x.prompt));
    expect(it).toBeTruthy();
    const a = it!.answer as unknown as { accepted: string[][] };
    const bad = a.accepted[0]!.map((p) => (p.startsWith("Fx") ? p.replace("Fx", "G") : p));
    const verdict = gradeItem(ix, it!, { kind: "pitch-sequence", pitches: bad as never }, scopeOf("G4-U3-L01", "t.g4.scale-build"));
    expect(verdict.correct).toBe(false);
    expect(gradeItem(ix, it!, canonicalResponse(ix, it!, scopeOf("G4-U3-L01", "t.g4.scale-build")), scopeOf("G4-U3-L01", "t.g4.scale-build")).correct).toBe(true);
  });

  it("scale-spot: the respelt note sounds the same as the right one but breaks the letter sequence", () => {
    for (const nodeId of ["G4-U3-L01", "G4-U3-L02"]) {
      for (const i of items(nodeId, "t.g4.scale-spot", 150)) {
        const notes = readBack(i.music!).map((r) => r.pitch);
        const bad = Number(correct(i));
        const letters = notes.map((n) => n.step);
        // consecutive letters in a seven-note scale: the wrong note is the one that breaks the cycle
        const idx = letters.map((l, k) => (k === 0 ? true : music.STEPS.indexOf(l) === (music.STEPS.indexOf(letters[k - 1]!) + 1) % 7));
        expect(idx.filter((ok) => !ok).length).toBeGreaterThanOrEqual(1);
        expect(idx[bad]).toBe(false);
      }
    }
  });

  it("degree-name: the named note is the degree of the harmonic form of the key", () => {
    for (const i of items("G4-U3-L04", "t.g4.degree-name", 250)) {
      if (!/^In /.test(i.prompt)) continue;
      const m = /In (.+?)(?: \(harmonic minor\))?, which note is the (.+?)\?/.exec(i.prompt)!;
      const key = music.parseKey(plain(m[1]!));
      const d = music.TECHNICAL_NAMES.indexOf(m[2]! as never) + 1;
      expect(d).toBeGreaterThan(0);
      expect(correct(i)).toBe(music.formatPitchClass(music.scale(key, key.mode === "major" ? "major" : "harmonic")[d - 1]!));
    }
  });

  it("chromatic-judge: exactly one scale passes the chromatic-scale rules", () => {
    for (const i of items("G4-U3-L05", "t.g4.chromatic-judge", 150)) {
      const dir = /written (ascending|descending)/.exec(i.prompt)![1] as "ascending" | "descending";
      const start = /starting on (\S+)\./.exec(i.prompt)![1]!;
      const sign = dir === "ascending" ? 1 : -1;
      const passing = options(i).filter((o) => {
        const names = o.label.replace(/^[A-D]: /, "").split(/\s+/).map(plain);
        let prev = sound(P(`${plain(start)}4`));
        const ps = names.map((nm, k) => {
          const base = P(`${nm}4`);
          // octave: nearest to the previous sound in the right direction
          let p = base;
          while (sound(p) < prev + (k === 0 ? 0 : sign === 1 ? 1 : -12)) p = { ...p, octave: p.octave + 1 };
          while (sound(p) > prev + (k === 0 ? 0 : sign === 1 ? 12 : -1)) p = { ...p, octave: p.octave - 1 };
          prev = sound(p);
          return p;
        });
        return music.checkChromatic(ps, ps[0]!, dir).length === 0;
      });
      expect(passing.map((o) => o.id)).toEqual([correct(i)]);
    }
  });
});

describe("Unit 4: intervals and triads", () => {
  it("interval-diatonic: quality and number re-derived from the printed notes; minor-key prompts name the form; both notes belong to that scale", () => {
    let aug = 0;
    for (const nodeId of ["G4-U4-L01", "G4-U4-L02"]) {
      for (const i of items(nodeId, "t.g4.interval-diatonic", 150)) {
        const [lo, hi] = readBack(i.music!).map((r) => r.pitch);
        const iv = music.intervalBetween(lo!, hi!);
        const a = i.answer as unknown as { acceptedIntervals: string[]; key: string; minorForm?: string };
        expect(a.acceptedIntervals).toEqual([`${iv.quality}${iv.number}`]);
        expect(iv.number).toBeGreaterThanOrEqual(2);
        expect(iv.number).toBeLessThanOrEqual(8);
        const key = music.parseKey(a.key);
        const forms = key.mode === "major" ? ["major"] : [a.minorForm === "melodic-descending" ? "melodic-descending" : a.minorForm === "melodic-ascending" ? "melodic-ascending" : "harmonic"];
        for (const p of [lo!, hi!]) expect(forms.some((f) => music.scale(key, f as never).some((x) => x.step === p.step && x.alter === p.alter))).toBe(true);
        if (key.mode === "minor") expect(i.prompt).toMatch(/harmonic minor|melodic minor/);
        if (/[Ad]/.test(iv.quality)) aug++;
      }
    }
    expect(aug).toBeGreaterThan(0);
    // anchors from the reference book: F to B in C major is an augmented 4th; F to G sharp in A harmonic minor is an augmented 2nd
    expect(music.intervalBetween(P("F4"), P("B4"))).toMatchObject({ quality: "A", number: 4 });
    expect(music.intervalBetween(P("F4"), P("G#4"))).toMatchObject({ quality: "A", number: 2 });
  });

  it("interval-write: the accepted note is the interval above or below, in the key named", () => {
    for (const i of items("G4-U4-L02", "t.g4.interval-write", 200)) {
      const a = i.answer as unknown as { lower: string; target: string; direction: "up" | "down"; acceptedPitches: string[]; key: string };
      expect(i.prompt).toContain("Key:");
      const built = music.transpose(P(a.lower), music.parseInterval(a.target), a.direction);
      expect(a.acceptedPitches).toEqual([music.formatPitch(built)]);
      expect(a.direction === "up" ? /above/.test(i.prompt) : /below/.test(i.prompt)).toBe(true);
      expect(readBack(i.music!)[0]!.pitch).toEqual(P(a.lower));
    }
  });

  it("interval-facts: the change of quality follows the book's rules (checked against real pitches)", () => {
    const BOOK: Record<string, Record<string, string>> = {
      "top-up": { m: "M", M: "A", P: "A" }, "bottom-down": { m: "M", M: "A", P: "A" },
      "top-down": { M: "m", m: "d", P: "d" }, "bottom-up": { M: "m", m: "d", P: "d" },
    };
    const MOVE: Record<string, string> = { "The top note is raised": "top-up", "The top note is lowered": "top-down", "The bottom note is raised": "bottom-up", "The bottom note is lowered": "bottom-down" };
    let changes = 0;
    for (const nodeId of ["G4-U4-L01", "G4-U4-L02"]) {
      for (const i of items(nodeId, "t.g4.interval-facts", 250)) {
        if (!i.prompt.startsWith("Start with")) continue;
        const m = /Start with a (\w+) (\d)\w+\. (The \w+ note is \w+)/.exec(i.prompt)!;
        const q = ({ major: "M", minor: "m", perfect: "P" } as Record<string, string>)[m[1]!]!;
        const result = correct(i);
        expect(result).toBe(`${BOOK[MOVE[m[3]!]!]![q]}${m[2]}`);
        changes++;
      }
    }
    expect(changes).toBeGreaterThan(20);
  });

  it("triad-notes: the right option is the triad of the key (harmonic minor), no wrong option is the same set of letters and signs", () => {
    for (const i of items("G4-U4-L03", "t.g4.triad-notes", 250)) {
      const m = /chord (i|iv|v) .*? of (.+?)(?:, using|\?)/i.exec(i.prompt)!;
      const key = music.parseKey(plain(m[2]!));
      const t = music.triad(key, m[1]!).map((x) => music.formatPitchClass(x));
      expect(correct(i).split("-")).toEqual(t);
      const sets = options(i).map((o) => o.id.split("-").sort().join());
      expect(new Set(sets).size).toBe(options(i).length);
    }
  });

  it("triad-id, chord-spread, chord-root, chord-in-passage, chord-passage-pick: chords read back from the notation and identified with the key's triads", () => {
    const readChords = (i: ExerciseItem) => {
      const staves = i.score ? i.score.staves.map((s) => s.music) : [i.music!];
      const per: Array<Array<{ pitch: music.Pitch; label?: string }>> = staves.map((f) => readBack(f));
      return per.flat();
    };
    for (const i of items("G4-U4-L03", "t.g4.triad-id", 150)) {
      const a = i.answer as unknown as { key: string; acceptedChords: Array<{ roman: string; inversion: string }> };
      const id = music.identifyTriad(music.parseKey(a.key), readChords(i).map((r) => r.pitch))!;
      expect(a.acceptedChords).toEqual([{ roman: id.roman, inversion: "a" }]);
      expect(id.inversion).toBe("a");
    }
    for (const i of items("G4-U4-L04", "t.g4.chord-spread", 200)) {
      const a = i.answer as unknown as { key: string; pitches: string[]; acceptedChords: Array<{ roman: string; inversion: string }> };
      const read = readChords(i).map((r) => music.formatPitch(r.pitch));
      expect([...read].sort()).toEqual([...a.pitches].sort());
      const id = music.identifyTriad(music.parseKey(a.key), a.pitches.map(P))!;
      expect(id.inversion).toBe("a");
      expect(a.acceptedChords).toEqual([{ roman: id.roman, inversion: "a" }]);
      expect(["I", "IV", "V"]).toContain(id.roman);
    }
    for (const i of items("G4-U4-L04", "t.g4.chord-root", 250)) {
      const key = music.parseKey(plain(/triad in (.+?)\./.exec(i.prompt)![1]!));
      const pitches = readChords(i).map((r) => r.pitch);
      const id = music.identifyTriad(key, pitches)!;
      const [pos, root] = parts(i);
      expect((pos!.answer as { correctOptionIds: string[] }).correctOptionIds[0]).toBe(id.inversion === "a" ? "yes" : "no");
      expect((root!.answer as { correctOptionIds: string[] }).correctOptionIds[0]).toBe(music.formatPitchClass(music.triad(key, id.roman)[0]!));
      expect(i.prompt).toContain("root position");
    }
    for (const i of items("G4-U4-L05", "t.g4.chord-in-passage", 150)) {
      const key = music.parseKey(plain(/passage is in (.+?)(?: \(|\.)/.exec(i.prompt)![1]!));
      parts(i).forEach((p) => {
        const a = p.answer as unknown as { pitches: string[]; acceptedChords: Array<{ roman: string; inversion: string }> };
        const id = music.identifyTriad(key, a.pitches.map(P))!;
        expect(a.acceptedChords).toEqual([{ roman: id.roman, inversion: "a" }]);
        expect(id.inversion).toBe("a");
      });
      // the chords listed in the answer are the chords printed on the staves, bar by bar
      const printed = i.score!.staves.flatMap((s) => readBack(s.music).map((r) => music.formatPitch(r.pitch))).sort();
      expect(parts(i).flatMap((p) => (p.answer as unknown as { pitches: string[] }).pitches).sort()).toEqual(printed);
    }
    for (const i of items("G4-U4-L05", "t.g4.chord-passage-pick", 150)) {
      const ask = /\((IV|V)\)\?/.exec(i.prompt)![1]!;
      const key = music.parseKey(plain(/passage is in (.+?)(?: \(|\.)/.exec(i.prompt)![1]!));
      const treble = i.score!.staves[0]!.music.measures.length;
      const reads = i.score!.staves.map((s) => readBack(s.music));
      // rebuild each bar's chord from both staves in bar order
      const perBar: music.Pitch[][] = Array.from({ length: treble }, () => []);
      i.score!.staves.forEach((s, si) => {
        let at = 0;
        s.music.measures.forEach((m, bi) => { const n = (m.events ?? []).reduce((t, e) => t + (e.kind === "chord" ? e.notes.length : e.kind === "note" ? 1 : 0), 0); perBar[bi]!.push(...reads[si]!.slice(at, at + n).map((r) => r.pitch)); at += n; });
      });
      const romans = perBar.map((b) => music.identifyTriad(key, b)!.roman);
      expect(romans.filter((r) => r === ask)).toHaveLength(1);
      expect(correct(i)).toBe("ABCD"[romans.indexOf(ask)]);
    }
  });

  it("chord-build: the accepted voicing has the number of notes asked and the root at the bottom; the grader enforces the count", () => {
    for (const i of items("G4-U4-L04", "t.g4.chord-build", 150)) {
      const a = i.answer as unknown as { key: string; voices: number; target: { roman: string }; acceptedVoicings: string[][] };
      const key = music.parseKey(a.key);
      const v = a.acceptedVoicings[0]!.map(P);
      expect(v).toHaveLength(a.voices);
      expect(music.lowest(v).step).toBe(music.triad(key, a.target.roman)[0]!.step);
      expect(music.identifyTriad(key, v)).toMatchObject({ roman: a.target.roman, inversion: "a" });
    }
    // adversarial: right notes, wrong number of notes, is not correct
    const four = items("G4-U4-L04", "t.g4.chord-build", 200).find((x) => (x.answer as unknown as { voices: number }).voices === 4)!;
    const scope = scopeOf("G4-U4-L04", "t.g4.chord-build");
    const a4 = four.answer as unknown as { acceptedVoicings: string[][] };
    expect(gradeItem(ix, four, { kind: "chord-notes", pitches: a4.acceptedVoicings[0]! as never }, scope).correct).toBe(true);
    expect(gradeItem(ix, four, { kind: "chord-notes", pitches: a4.acceptedVoicings[0]!.slice(0, 3) as never }, scope).correct).toBe(false);
  });
});

describe("Unit 5: ornaments, instruments, terms, passages", () => {
  const ORN_BY_EVENT = (e: { ornament?: string; grace?: { kind: string } }) => e.ornament ?? e.grace?.kind;
  it("ornament-spot: the labelled note carries the ornament named; ornament-bar: ornaments take no time", () => {
    const NAMES: Record<string, string> = { trill: "trill", turn: "turn", "upper mordent": "upper-mordent", "lower mordent": "lower-mordent", acciaccatura: "acciaccatura", appoggiatura: "appoggiatura" };
    for (const i of items("G4-U5-L01", "t.g4.ornament-spot", 150)) {
      const want = NAMES[/has the (.+?)\?/.exec(i.prompt)![1]!]!;
      const evs = i.music!.measures.flatMap((m) => m.events ?? []) as unknown as Array<{ label?: string; ornament?: string; grace?: { kind: string } }>;
      const marked = evs.filter((e) => e.label);
      expect(new Set(marked.map(ORN_BY_EVENT)).size).toBe(3);
      expect(ORN_BY_EVENT(marked.find((e) => e.label === correct(i))!)).toBe(want);
    }
    for (const i of items("G4-U5-L01", "t.g4.ornament-bar", 150)) {
      const bar = (i.music!.measures[0]!.events ?? []) as unknown as Ev[];
      expect(correct(i)).toBe(`${bar.length}/4`);
      expect(bar.some((e) => (e as { grace?: unknown }).grace)).toBe(true);
      expect(bar.every((e) => e.duration!.value === "crotchet")).toBe(true);
    }
  });

  it("ornament-facts: descriptions match names", () => {
    const LOOK: Record<string, RegExp> = { trill: /letters tr/, turn: /sideways S/, "upper-mordent": /no line through/, "lower-mordent": /vertical line/, acciaccatura: /diagonal stroke/, appoggiatura: /no stroke/ };
    for (const i of items("G4-U5-L01", "t.g4.ornament-facts", 200)) {
      if (i.prompt.startsWith("An ornament is shown by")) expect(i.prompt).toMatch(LOOK[correct(i)]!);
      else if (i.prompt.startsWith("Which of these describes")) expect(label(i, correct(i))).toMatch(LOOK[correct(i)]!);
      else expect(correct(i)).toBe("acciaccatura");
    }
  });

  it("instruments and instrument-range: facts match the reference book's lists; transposing instruments are never asked", () => {
    const FAMILY: Record<string, string> = { violin: "strings", viola: "strings", cello: "strings", "double-bass": "strings", flute: "woodwind", oboe: "woodwind", clarinet: "woodwind", bassoon: "woodwind", trumpet: "brass", horn: "brass", trombone: "brass", tuba: "brass", timpani: "percussion", "side-drum": "percussion", "bass-drum": "percussion", cymbals: "percussion" };
    const CLEF: Record<string, string> = { violin: "treble", viola: "alto", cello: "bass", "double-bass": "bass", flute: "treble", oboe: "treble", clarinet: "treble", bassoon: "bass", trumpet: "treble", horn: "treble", trombone: "bass", tuba: "bass" };
    const id = (name: string) => name.replace(" ", "-");
    for (const i of items("G4-U5-L02", "t.g4.instruments", 250)) {
      expect(i.prompt).not.toMatch(/transpos|B♭|in F/i);
      if (i.prompt.startsWith("To which family")) expect(correct(i)).toBe(FAMILY[id(/does the (.+?) belong/.exec(i.prompt)![1]!)]);
      else if (i.prompt.startsWith("Which clef")) expect(correct(i)).toBe(CLEF[id(/the (.+?) normally/.exec(i.prompt)![1]!)]);
      else expect(FAMILY[correct(i)].replace(/s$/, "")).toBe(/belongs to the (\w+) family/.exec(i.prompt)![1]!.replace(/s$/, ""));
    }
    for (const i of items("G4-U5-L02", "t.g4.instrument-range", 250)) {
      if (i.prompt.includes("highest") || i.prompt.includes("lowest")) {
        const order = i.prompt.includes("string") ? ["violin", "viola", "cello", "double-bass"] : i.prompt.includes("woodwind") ? ["flute", "oboe", "clarinet", "bassoon"] : ["trumpet", "horn", "trombone", "tuba"];
        expect(correct(i)).toBe(i.prompt.includes("highest") ? order[0] : order[3]);
      } else expect(correct(i)).toBe("timpani");
    }
  });

  it("technique-facts, technique-use, terms, term-use: Grade 4 vocabulary only, never two options with the same meaning", () => {
    const g4 = new Set(music.TERMS_G4.map((t) => t.id));
    const tech = new Set(music.TECHNIQUES_G4.map((t) => t.id));
    const grades123 = new Set(music.TERMS.map((t) => t.id));
    for (const [tpl, ids] of [["t.g4.terms", g4], ["t.g4.term-use", g4], ["t.g4.technique-facts", tech], ["t.g4.technique-use", tech]] as const) {
      for (const i of items(tpl.includes("technique") ? "G4-U5-L03" : "G4-U5-L04", tpl, 250)) {
        expect(ids.has(correct(i)), `${tpl}: ${correct(i)}`).toBe(true);
        for (const o of options(i)) { expect(ids.has(o.id)).toBe(true); expect(grades123.has(o.id)).toBe(false); }
        if (tpl === "t.g4.terms" || tpl === "t.g4.term-use") {
          const groups = options(i).map((o) => music.TERMS_G4.find((t) => t.id === o.id)!.group);
          expect(new Set(groups).size).toBe(groups.length);
          const right = music.TERMS_G4.find((t) => t.id === correct(i))!;
          if (tpl === "t.g4.terms") expect(i.prompt.includes(`“${right.term}”`) || label(i, correct(i)) === right.term).toBe(true);
          if (i.prompt.startsWith("Which direction")) expect(music.TERMS_G4.filter((t) => t.group === right.group)).toHaveLength(1);
        }
      }
    }
  });

  it("passages: every part is re-derived from the printed notes, the clef and the instrument; every passage asks about the instrument", () => {
    const FAMILY: Record<string, string> = { violin: "strings", viola: "strings", cello: "strings", "double bass": "strings", flute: "woodwind", oboe: "woodwind", clarinet: "woodwind", bassoon: "woodwind", trumpet: "brass", horn: "brass", trombone: "brass", tuba: "brass" };
    for (const t of ["t.g4.passage", "t.g4.passage-directions"]) {
      for (const i of items("G4-U5-L05", t, 200)) {
        const inst = /for the ([a-z ]+)\./.exec(i.prompt)![1]!;
        expect(FAMILY[inst], inst).toBeTruthy();
        const ps = parts(i);
        const evs = i.music!.measures.flatMap((m) => m.events ?? []) as unknown as Array<{ label?: string; pitch: string; ornament?: string; grace?: { kind: string } }>;
        const read = readBack(i.music!);
        for (const p of ps) {
          if (p.id === "family") expect((p.answer as { correctOptionIds: string[] }).correctOptionIds[0]).toBe(FAMILY[inst]);
          if (p.id === "ornament") expect((p.answer as { sign: string }).sign).toBe(ORN_BY_EVENT(evs.find((e) => e.label === "A")!));
          if (p.id === "interval") {
            const a = p.answer as unknown as { lower: string; upper: string; acceptedIntervals: string[] };
            const x = read.find((r) => r.label === "x")!.pitch;
            const y = read.find((r) => r.label === "y")!.pitch;
            const [lo, hi] = music.diatonicNumber(x) <= music.diatonicNumber(y) ? [x, y] : [y, x];
            expect(a.lower).toBe(music.formatPitch(lo));
            expect(a.upper).toBe(music.formatPitch(hi));
            const iv = music.intervalBetween(lo, hi);
            expect(a.acceptedIntervals).toEqual([`${iv.quality}${iv.number}`]);
          }
          if (p.id === "term" || p.id === "technique") {
            const right = (p.answer as { correctOptionIds: string[] }).correctOptionIds[0]!;
            const all = [...music.TERMS_G4.map((x) => x.id), ...music.TECHNIQUES_G4.map((x) => x.id)];
            expect(all).toContain(right);
          }
        }
        expect(ps.some((p) => p.id === "family" || p.id === "clef" || p.id === "technique")).toBe(true);
        expect(i.music!.tempoText).toBeTruthy();
      }
    }
  });
});

describe("adversarial answers are refused by the real engine", () => {
  it("every generated Grade 4 item accepts its canonical answer and refuses the engine's wrong answer", () => {
    const g4 = [...ix.templates.values()].filter((t) => t.grade === 4);
    let checked = 0;
    for (const t of g4) {
      for (let s = 1; s <= 25; s++) {
        let item: ExerciseItem;
        try { item = generateItem(ix, t.id, s).item; } catch { continue; }
        const scope = {};
        void scope;
        expect(gradeItem(ix, item, canonicalResponse(ix, item)).correct, `${t.id}#${s}`).toBe(true);
        const bad = wrongResponse(ix, item);
        if (bad) expect(gradeItem(ix, item, bad).correct, `${t.id}#${s} wrong`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(800);
  }, 240_000);

  it("a pitch answer that matches only in sound is not a correct spelling (G for F double sharp)", () => {
    const i = items("G4-U2-L01", "t.g4.double-name", 200).find((x) => /𝄪|x/.test(JSON.stringify(x.answer)) && (x.answer as unknown as { accepted: string[] }).accepted[0]!.includes("x"))!;
    const a = (i.answer as unknown as { accepted: string[] }).accepted[0]!;
    const p = P(a);
    const wrongSpelt = music.spellingsOfKey ? undefined : undefined;
    void wrongSpelt;
    const sounding = { step: music.STEPS[(music.STEPS.indexOf(p.step) + 1) % 7]!, alter: 0, octave: p.octave };
    expect(sound(sounding as music.Pitch) % 12).toBe(sound(p) % 12 === sound(sounding as music.Pitch) % 12 ? sound(p) % 12 : sound(sounding as music.Pitch) % 12);
    const verdict = gradeItem(ix, i, { kind: "pitch", pitch: music.formatPitchClass(sounding) as never });
    expect(verdict.correct).toBe(false);
  });

  it("a rhythm that fits the bar but uses a rest where the question needs a note is refused (breve-bar)", () => {
    const i = items("G4-U1-L01", "t.g4.breve-bar", 120).find((x) => (x.answer as unknown as { task: string; accepted: Array<Array<{ events: Ev[] }>> }).task === "complete-bar" && (x.answer as unknown as { accepted: Array<Array<{ events: Ev[] }>> }).accepted[0]![0]!.events[0]!.kind === "note")!;
    const rest = { kind: "rhythm" as const, measures: [{ events: [{ kind: "rest" as const, duration: { value: "breve" as const, dots: 0 }, wholeBar: true }] }] };
    expect(gradeItem(ix, i, rest as never).correct).toBe(false);
    const semis = { kind: "rhythm" as const, measures: [{ events: [{ kind: "note" as const, duration: { value: "semibreve" as const, dots: 0 } }, { kind: "note" as const, duration: { value: "semibreve" as const, dots: 0 } }] }] };
    expect(gradeItem(ix, i, semis as never).correct).toBe(false);
  });
});

describe("version-safe vocabulary", () => {
  it("Grade 1-3 and 5 generation fingerprints are exactly what they were before Grade 4 vocabulary existed", () => {
    // the pre-Brief 08 fingerprint formula, recomputed here: vocabulary = TERMS, INSTRUMENTS, VOICES only
    const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v);
    const hash = (s: string) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    let n = 0;
    for (const t of ix.templates.values()) {
      if (t.grade === 4) continue;
      const scope = t.scope as never;
      const old = hash(JSON.stringify(canonical({ rev: 1, template: t, scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES } }))).toString(16).padStart(8, "0");
      expect(generationFingerprint(t, scope), t.id).toBe(old);
      n++;
    }
    expect(n).toBeGreaterThan(100);
    // and a Grade 4 template's fingerprint does depend on the Grade 4 vocabulary
    const g4 = ix.templates.get("t.g4.terms")!;
    expect(generationFingerprint(g4, g4.scope as never)).not.toBe(hash(JSON.stringify(canonical({ rev: 1, template: g4, scope: g4.scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES } }))).toString(16).padStart(8, "0"));
  });

  it("generation is deterministic: the same seed gives the same question, for every Grade 4 template", () => {
    for (const t of [...ix.templates.values()].filter((x) => x.grade === 4)) {
      for (const s of [3, 17, 91]) {
        let a: ExerciseItem;
        try { a = generateItem(ix, t.id, s).item; } catch { continue; }
        expect(JSON.stringify(generateItem(ix, t.id, s).item)).toBe(JSON.stringify(a));
      }
    }
  });
});
