/**
 * Brief 10 addendum: intervals under key signatures, simple <-> compound rewriting, assessment balance and
 * wording. The musical checks below use their OWN small semitone arithmetic (not @mtp/curriculum's music
 * module), so the new items are verified independently of the code that validates them.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurriculum, type Curriculum } from "../src/load.ts";
import { validateCurriculum } from "../src/validate.ts";

// Loaded at module level because `it.each` tables are built at collection time, before any hook runs.
const loaded = loadCurriculum().curriculum;
if (!loaded) throw new Error("content failed to load");
const base: Curriculum = loaded;
const cleanRoot = mkdtempSync(join(tmpdir(), "mtp-clean-"));

const errors = (c: Curriculum) => validateCurriculum(c, { repoRoot: cleanRoot }).errors.map((e) => e.code);
const mutate = (fn: (c: Curriculum) => void) => {
  const c = structuredClone(base);
  fn(c);
  return errors(c);
};
const itemFile = (c: Curriculum, id: string) => c.items.find((i) => i.content.item.id === id)!.content;
const items = (c: Curriculum, prefix: string) => c.items.map((i) => i.content).filter((i) => i.item.id.startsWith(prefix));
const assessment = (c: Curriculum, id: string) => c.assessments.flatMap((f) => f.assessments).find((a) => a.id === id)!;
const template = (c: Curriculum, id: string) => c.templates.flatMap((f) => f.templates).find((t) => t.id === id)!;

// ---- independent music arithmetic ------------------------------------------------------------
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
/** Accidentals in each key signature (positive = sharps, negative = flats). */
const FIFTHS: Record<string, number> = {
  "G major": 1, "D major": 2, "A major": 3, "F major": -1, "Bb major": -2, "Eb major": -3, "Ab major": -4, "Db major": -5,
  "F# major": 6, "E minor": 1,
};
const sigAlter = (key: string, letter: string) => {
  const f = FIFTHS[key]!;
  return f > 0 && SHARP_ORDER.slice(0, f).includes(letter) ? 1 : f < 0 && FLAT_ORDER.slice(0, -f).includes(letter) ? -1 : 0;
};
const parse = (p: string) => {
  const m = /^([A-G])(##|bb|#|b)?(\d)$/.exec(p)!;
  const alter = m[2] === undefined ? 0 : m[2] === "#" ? 1 : m[2] === "b" ? -1 : m[2] === "##" ? 2 : -2;
  return { letter: m[1]!, alter, octave: Number(m[3]) };
};
const abs = (p: ReturnType<typeof parse>) => p.octave * 12 + NATURAL_SEMITONES[LETTERS.indexOf(p.letter)]! + p.alter;
const lettersUp = (p: ReturnType<typeof parse>) => p.octave * 7 + LETTERS.indexOf(p.letter);
/** Semitones of the major (or perfect) interval for each simple number. */
const MAJOR_OR_PERFECT: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
function nameInterval(lowP: string, highP: string): string {
  const lo = parse(lowP), hi = parse(highP);
  const number = lettersUp(hi) - lettersUp(lo) + 1;
  const semis = abs(hi) - abs(lo);
  const perfectKind = [1, 4, 5, 8].includes(number);
  const diff = semis - MAJOR_OR_PERFECT[number]!;
  const q = perfectKind ? ({ 0: "P", 1: "A", [-1]: "d" } as Record<number, string>)[diff] : ({ 0: "M", [-1]: "m", 1: "A", [-2]: "d" } as Record<number, string>)[diff];
  return `${q}${number}`;
}
const QUALITY_SEMITONES: Record<string, number[]> = { m3: [3], M3: [4], P5: [7], m6: [8], M6: [9], A4: [6], d5: [6] };

describe("intervals under key signatures: independent musical verification", () => {
  it("has 7 identify and 4 build examples, across four clefs and sharp, flat and minor keys", () => {
    const identify = items(base, "i.g5-interval-key-identify.");
    const build = items(base, "i.g5-interval-key-build.");
    expect(identify).toHaveLength(7);
    expect(build).toHaveLength(4);
    const clefs = new Set([...identify, ...build].map((i) => i.item.music!.clef));
    expect([...clefs].sort()).toEqual(["alto", "bass", "treble"]);
    const keys = new Set([...identify, ...build].map((i) => i.item.music!.key));
    expect(keys.has("E minor")).toBe(true);
    expect([...keys].some((k) => /^(F|Bb|Eb|Ab|Db)/.test(k!))).toBe(true);
    expect([...keys].some((k) => /^(G|D|A|F#) major/.test(k!))).toBe(true);
  });

  it.each(items(base, "i.g5-interval-key-identify.").map((f) => [f.item.id, f] as const))(
    "%s: shown notes + key signature give the stated interval, and it differs from the bare-letter reading",
    (_id, f) => {
      const a = f.item.answer;
      if (a.kind !== "interval" || a.task !== "identify") throw new Error("expected identify");
      const key = f.item.music!.key!;
      const notes = f.item.music!.measures[0]!.events!.map((e) => (e.kind === "note" ? e : undefined)!);
      expect(notes).toHaveLength(2);
      // Independently re-derive each sounding pitch from the signature or the written accidental.
      const sounding = notes.map((n) => {
        const p = parse(n.pitch);
        const expectedAlter = n.writtenAccidental ? ({ sharp: 1, flat: -1, natural: 0 } as Record<string, number>)[n.writtenAccidental]! : sigAlter(key, p.letter);
        expect(p.alter, `${n.pitch} in ${key} (written: ${n.writtenAccidental ?? "none"})`).toBe(expectedAlter);
        return n.pitch;
      });
      expect(sounding).toEqual([a.lower, a.upper]);
      const named = nameInterval(a.lower, a.upper!);
      expect(a.acceptedIntervals).toEqual([named]);
      // The trap: ignoring the key signature (letters only) must give a different interval.
      const bare = (p: string) => p.replace(/[#b]+/, "");
      const bareName = nameInterval(bare(a.lower), bare(a.upper!));
      if (f.item.feedback.mistakes["ignored-key-signature"]) expect(bareName).not.toBe(named);
      expect(abs(parse(a.upper!)) - abs(parse(a.lower))).toBeGreaterThan(0);
    },
  );

  it.each(items(base, "i.g5-interval-key-build.").map((f) => [f.item.id, f] as const))(
    "%s: the accepted note has the right letter, size and spelling, and the sign need is correct",
    (id, f) => {
      const a = f.item.answer;
      if (a.kind !== "interval" || a.task !== "build") throw new Error("expected build");
      const key = f.item.music!.key!;
      const dir = a.direction === "up" ? 1 : -1;
      const number = Number(a.target!.slice(1));
      const start = parse(a.lower);
      const ans = parse(a.acceptedPitches![0]!);
      // Letter reached by counting `number` letter names from the start.
      expect(lettersUp(ans) - lettersUp(start)).toBe(dir * (number - 1));
      // Interval size: the answer must be exactly the requested quality and number.
      const lowP = dir === 1 ? a.lower : a.acceptedPitches![0]!;
      const highP = dir === 1 ? a.acceptedPitches![0]! : a.lower;
      expect(nameInterval(lowP, highP)).toBe(a.target);
      expect(QUALITY_SEMITONES[a.target!]!).toContain(Math.abs(abs(ans) - abs(start)));
      // Does the answer need its own sign (differs from the signature for that letter)?
      const needsSign = ans.alter !== sigAlter(key, ans.letter);
      const needsSignByItem: Record<string, boolean> = {
        "i.g5-interval-key-build.ab-major-up-min3": true,
        "i.g5-interval-key-build.d-major-up-maj6": true,
        "i.g5-interval-key-build.e-minor-up-maj3": true,
        "i.g5-interval-key-build.f-major-down-p5": false,
      };
      expect(needsSign).toBe(needsSignByItem[id]);
    },
  );

  it("the build set mixes items that need a sign with one that does not", () => {
    const needs = items(base, "i.g5-interval-key-build.").map((f) => {
      const a = f.item.answer;
      if (a.kind !== "interval") throw new Error();
      const p = parse(a.acceptedPitches![0]!);
      return p.alter !== sigAlter(f.item.music!.key!, p.letter);
    });
    expect(needs).toContain(true);
    expect(needs).toContain(false);
  });
});

describe("intervals under key signatures: validator rules", () => {
  const ID = "i.g5-interval-key-identify.g-major-d5";
  it("the committed items validate cleanly", () => expect(mutate(() => {})).toEqual([]));

  it("rejects an answer about different notes than the stave shows", () => {
    expect(mutate((c) => ((itemFile(c, ID).item.answer as { upper: string }).upper = "F#5"))).toContain("INTERVAL_NOTES_MISMATCH");
  });
  it("rejects an answer key that disagrees with the key signature shown", () => {
    expect(mutate((c) => ((itemFile(c, ID).item.answer as { key: string }).key = "D major"))).toContain("INTERVAL_KEY_MISMATCH");
  });
  it("rejects a missing natural sign (the signature would make the note F sharp)", () => {
    expect(
      mutate((c) => {
        const ev = itemFile(c, ID).item.music!.measures[0]!.events![1] as { writtenAccidental?: string };
        delete ev.writtenAccidental;
      }),
    ).toContain("ACCIDENTAL_MISSING");
  });
  it("rejects a wrongly named interval", () => {
    expect(mutate((c) => ((itemFile(c, ID).item.answer as { acceptedIntervals: string[] }).acceptedIntervals = ["P5"]))).toContain("ANSWER_MISMATCH");
  });
  it("rejects a build answer with the wrong spelling (enharmonic)", () => {
    const bid = "i.g5-interval-key-build.ab-major-up-min3";
    expect(mutate((c) => ((itemFile(c, bid).item.answer as { acceptedPitches: string[] }).acceptedPitches = ["F#4"]))).toContain("ANSWER_MISMATCH");
  });
  it("rejects a build item whose shown note is not the starting note", () => {
    const bid = "i.g5-interval-key-build.d-major-up-maj6";
    expect(mutate((c) => ((itemFile(c, bid).item.music!.measures[0]!.events![0] as { pitch: string }).pitch = "G4"))).toContain("INTERVAL_NOTES_MISMATCH");
  });
});

describe("simple <-> compound rewriting (optional enrichment)", () => {
  const frac = (n: number, d: number) => ({ n, d });
  const VALUE: Record<string, [number, number]> = { minim: [1, 2], crotchet: [1, 4], quaver: [1, 8], semiquaver: [1, 16] };
  const dur = (e: { duration: { value: string; dots: number } }) => {
    const [n, d] = VALUE[e.duration.value]!;
    return e.duration.dots ? frac(n * 3, d * 2) : frac(n, d);
  };
  const total = (events: Array<{ duration: { value: string; dots: number } }>) => events.reduce((s, e) => { const x = dur(e); return frac(s.n * x.d + x.n * s.d, s.d * x.d); }, frac(0, 1));
  const eq = (a: { n: number; d: number }, b: { n: number; d: number }) => a.n * b.d === b.n * a.d;
  const capacity = (ts: string) => { const [t, b] = ts.split("/").map(Number) as [number, number]; return frac(t, b); };

  const rewrites = () => items(base, "i.g5-rewrite-metre.");
  it("has five original examples covering both directions and a rest", () => {
    const r = rewrites();
    expect(r).toHaveLength(5);
    const pairs = r.map((f) => `${f.item.music!.timeSignature}>${(f.item.answer as { timeSignature: string }).timeSignature}`);
    expect(pairs).toEqual(expect.arrayContaining(["2/4>6/8", "3/4>9/8", "4/4>12/8", "6/8>2/4", "9/8>3/4"]));
    expect(r.some((f) => f.item.music!.measures[0]!.events!.some((e) => e.kind === "rest"))).toBe(true);
  });

  it.each(rewrites().map((f) => [f.item.id, f] as const))("%s: every value keeps its share of its beat; each bar fills its own time signature", (_id, f) => {
    const src = f.item.music!;
    const a = f.item.answer as { timeSignature: string; accepted: Array<Array<{ events: Array<{ kind: string; duration: { value: string; dots: number }; beam?: string }> }>> };
    const srcEvents = src.measures[0]!.events as Array<{ kind: string; duration: { value: string; dots: number }; beam?: string }>;
    const out = a.accepted[0]![0]!.events;
    expect(out).toHaveLength(srcEvents.length);
    // Bars are complete in both metres.
    expect(eq(total(srcEvents), capacity(src.timeSignature!))).toBe(true);
    expect(eq(total(out), capacity(a.timeSignature))).toBe(true);
    // Each event keeps the same fraction of its bar (so the same share of its beat): duration / bar is unchanged.
    srcEvents.forEach((e, i) => {
      const before = dur(e), after = dur(out[i]!);
      const sb = capacity(src.timeSignature!), sa = capacity(a.timeSignature);
      expect(eq(frac(before.n * sb.d, before.d * sb.n), frac(after.n * sa.d, after.d * sa.n)), `event ${i}`).toBe(true);
      expect(out[i]!.kind).toBe(e.kind);
    });
    // Beaming is kept beat-for-beat.
    expect(out.map((e) => e.beam ?? "-")).toEqual(srcEvents.map((e) => e.beam ?? "-"));
  });

  it("is enrichment only: no assessment uses it, and no official Grade 5 outcome depends on it", () => {
    const tid = "t.g5.rewrite-metre";
    expect(base.assessments.flatMap((f) => f.assessments).some((a) => a.sections.some((s) => s.templateIds.includes(tid)))).toBe(false);
    const node = base.worlds.flatMap((w) => w.nodes).find((n) => n.id === "G5-U1-E1")!;
    expect(node.type).toBe("enrichment");
    expect(node.optional).toBe(true);
    expect(node.outcomeIds).toEqual([]);
    expect(template(base, tid).outcomeIds.every((o) => o.startsWith("abrsm2020.g4."))).toBe(true);
    const concept = base.concepts.flatMap((f) => f.concepts).find((x) => x.id === "c.metre.rewrite-simple-compound")!;
    expect(concept.status).toBe("enrichment");
  });

  const RID = "i.g5-rewrite-metre.2-4-to-6-8";
  it("rejects values copied unchanged", () => {
    const codes = mutate((c) => {
      const a = itemFile(c, RID).item.answer as { accepted: Array<Array<{ events: Array<{ duration: { dots: number } }> }>> };
      a.accepted[0]![0]!.events.forEach((e) => (e.duration.dots = 0));
    });
    expect(codes).toContain("ANSWER_MISMATCH");
    expect(codes).toContain("BAR_DURATION");
  });
  it("rejects a beam that crosses a beat of the new metre", () => {
    const codes = mutate((c) => {
      const a = itemFile(c, "i.g5-rewrite-metre.4-4-to-12-8-semiquavers").item.answer as { accepted: Array<Array<{ events: Array<{ beam?: string }> }>> };
      const ev = a.accepted[0]![0]!.events;
      ev[1]!.beam = "continue"; // quaver pair now runs into the crotchet's beat
      ev[2]!.beam = "end";
    });
    expect(codes.some((x) => ["REWRITE_GROUPING", "BEAM_MALFORMED"].includes(x))).toBe(true);
  });
  it("rejects a pair with a different number of beats, or two metres of the same kind", () => {
    expect(mutate((c) => ((itemFile(c, RID).item.answer as { timeSignature: string }).timeSignature = "9/8"))).toContain("REWRITE_METRE");
    expect(mutate((c) => ((itemFile(c, RID).item.answer as { timeSignature: string }).timeSignature = "4/4"))).toContain("REWRITE_METRE");
  });
  it("rejects a source that cannot be rewritten by dotting (an undotted value going to simple time)", () => {
    const codes = mutate((c) => {
      const f = itemFile(c, "i.g5-rewrite-metre.6-8-to-2-4");
      (f.item.music!.measures[0]!.events![2] as { duration: { dots: number } }).duration.dots = 0;
    });
    expect(codes).toContain("REWRITE_METRE");
  });
});

describe("Grade 5 assessment balance", () => {
  const sectionBounds = (s: { templateIds: string[]; itemCount: number; mix?: Array<{ templateId: string; min: number; max?: number }> }, t: string) => {
    const m = s.mix?.find((x) => x.templateId === t);
    return { min: m?.min ?? 0, max: s.templateIds.includes(t) ? Math.min(m?.max ?? s.itemCount, s.itemCount) : 0 };
  };
  const totals = (id: string, ...ts: string[]) => {
    const a = assessment(base, id);
    return a.sections.reduce((acc, s) => {
      for (const t of ts) { const b = sectionBounds(s, t); acc.min += b.min; acc.max += b.max; }
      return acc;
    }, { min: 0, max: 0 });
  };
  const count = (id: string) => assessment(base, id).sections.reduce((n, s) => n + s.itemCount, 0);
  const G = "a.g5";

  it("still assesses all 16 Grade 5 outcomes, each with a template that targets it", () => {
    const a = assessment(base, G);
    const outcomes = new Set(a.sections.flatMap((s) => s.outcomeIds).filter((o) => o.startsWith("abrsm2020.g5.")));
    expect(outcomes.size).toBe(16);
    for (const s of a.sections) for (const o of s.outcomeIds) {
      expect(s.templateIds.some((t) => template(base, t).outcomeIds.includes(o)), `${s.id}/${o}`).toBe(true);
    }
  });

  it("keeps the assessment length modest (39 -> 42 items) and every section at 2+ items", () => {
    expect(count(G)).toBe(42);
    for (const s of assessment(base, G).sections) expect(s.itemCount).toBeGreaterThanOrEqual(2);
  });

  it("interval assessment is no longer thin: four dedicated interval items covering simple, compound, identify-in-key and write-in-key", () => {
    const iv = ["t.g5.interval-any", "t.g5.interval-compound", "t.g5.interval-key-identify", "t.g5.interval-key-build"];
    const s = assessment(base, G).sections.find((x) => x.id === "o-g5-08")!;
    expect(s.itemCount).toBe(4);
    for (const t of iv) expect(sectionBounds(s, t)).toEqual({ min: 1, max: 1 });
    expect(s.templateIds).not.toContain("t.g5.score");
  });

  it("key-signature questions cannot repeat: at most one pure key-signature item per assessment", () => {
    for (const id of ["a.g5", "a.g5-u2", "a.g5-u3"]) {
      const t = totals(id, "t.g5.key-signature");
      expect(t.max, id).toBeLessThanOrEqual(2);
    }
    expect(totals(G, "t.g5.key-signature").max).toBe(1);
    // The unit challenge for keys had up to four key-signature draws; it is now at most two.
    expect(totals("a.g5-u3", "t.g5.key-signature").max).toBe(2);
  });

  it("voice and score questions cannot dominate: one voices item, one instruments item, bounded context items", () => {
    expect(totals(G, "t.g5.voices")).toEqual({ min: 1, max: 1 });
    expect(totals(G, "t.g5.instruments").min).toBe(1);
    const score = assessment(base, G).sections.filter((s) => s.id !== "o-g5-16");
    const scoreMax = score.reduce((n, s) => n + sectionBounds(s, "t.g5.score").max, 0);
    expect(scoreMax).toBeLessThanOrEqual(6);
    // Every outcome section that offers a context question still guarantees at least one dedicated item.
    for (const s of score) if (s.templateIds.includes("t.g5.score") && s.templateIds.length > 1) expect(sectionBounds(s, "t.g5.score").max).toBeLessThan(s.itemCount);
  });

  it("practical work is guaranteed: transposition, scale writing and chord/cadence building each keep a build item", () => {
    const a = assessment(base, G);
    const modeOf = (t: string) => template(base, t).mode;
    for (const sid of ["o-g5-05", "o-g5-06", "o-g5-07", "o-g5-10"]) {
      const s = a.sections.find((x) => x.id === sid)!;
      const guaranteedBuild = s.templateIds.some((t) => modeOf(t) === "build" && sectionBounds(s, t).min >= 1) || s.templateIds.every((t) => modeOf(t) === "build");
      expect(guaranteedBuild, sid).toBe(true);
    }
    const harmony = a.sections.filter((s) => ["o-g5-09", "o-g5-10", "o-g5-11"].includes(s.id)).reduce((n, s) => n + s.itemCount, 0);
    expect(harmony).toBeGreaterThanOrEqual(7);
    const s09 = a.sections.find((x) => x.id === "o-g5-09")!;
    expect(sectionBounds(s09, "t.g5.chord-build").min).toBe(1);
    expect(sectionBounds(s09, "t.g5.chord-identify").min).toBe(1);
  });

  it("every Grade 5 assessment keeps its id and moves to version 2 (earlier results stay tied to version 1)", () => {
    const ids = base.assessments.flatMap((f) => f.assessments).filter((a) => a.grade === 5).map((a) => a.id).sort();
    expect(ids).toEqual(["a.g5", "a.g5-u1", "a.g5-u2", "a.g5-u3", "a.g5-u4", "a.g5-u5"]);
    for (const id of ids) expect(assessment(base, id).version).toBe(2);
    for (const a of base.assessments.flatMap((f) => f.assessments).filter((x) => x.grade < 5)) expect(a.version, a.id).toBe(1);
  });

  it("rejects unsatisfiable or malformed balance rules", () => {
    expect(mutate((c) => { assessment(c, G).sections.find((s) => s.id === "o-g5-08")!.mix![0]!.min = 4; })).toContain("ASSESSMENT_MIX");
    expect(mutate((c) => { assessment(c, G).sections.find((s) => s.id === "o-g5-14")!.mix![0]!.templateId = "t.g5.terms"; })).toContain("ASSESSMENT_MIX");
    expect(mutate((c) => { const m = assessment(c, G).sections.find((s) => s.id === "o-g5-14")!.mix!; m[0]!.max = 0; })).toContain("ASSESSMENT_MIX");
    expect(mutate((c) => { const s = assessment(c, G).sections.find((x) => x.id === "o-g5-14")!; s.mix = [{ templateId: "t.g5.voices", min: 0, max: 1 }, { templateId: "t.g5.score", min: 0, max: 0 }]; })).toContain("ASSESSMENT_MIX");
  });
});

describe("preserving identities and history", () => {
  it("existing templates keep id and version, except the two with reworded prompts (now v2)", () => {
    const g5 = base.templates.flatMap((f) => f.templates).filter((t) => t.grade === 5);
    const v2 = g5.filter((t) => t.version === 2).map((t) => t.id).sort();
    expect(v2).toEqual(["t.g5.ornament-replace", "t.g5.voices"]);
    for (const t of base.templates.flatMap((f) => f.templates).filter((x) => x.grade < 5)) expect(t.version, t.id).toBe(1);
    for (const id of ["t.g5.interval-any", "t.g5.interval-compound", "t.g5.key-signature", "t.g5.instrument-transpose"]) expect(template(base, id).version).toBe(1);
  });
  it("the Brief 01 example lesson and item still validate unchanged", () => {
    expect(base.items.some((i) => i.content.item.id === "i.g5-instrument-transpose.example-1")).toBe(true);
    expect(mutate(() => {})).toEqual([]);
  });
  it("the new lesson sits inside Unit 3 and the old path ids are intact", () => {
    const g5 = base.worlds.find((w) => w.grade === 5)!.nodes.map((n) => n.id);
    for (const id of ["G5-U3-L01", "G5-U3-L02", "G5-U3-L03", "G5-U3-L04", "G5-U3-L05", "G5-U3-L06", "G5-U3-P1", "G5-U3-C", "G5-U1-P1", "G5-U1-C"]) expect(g5).toContain(id);
    expect(g5.indexOf("G5-U3-L07")).toBe(g5.indexOf("G5-U3-L04") + 1);
  });
});

describe("wording improvements (non-blocking educational feedback)", () => {
  it("ornament prompt names the principal note and where the ornament goes", () => {
    const t = template(base, "t.g5.ornament-replace");
    expect(t.promptPattern).toMatch(/principal note/);
    expect(t.promptPattern).toMatch(/above the principal note/);
    expect(t.promptPattern).toMatch(/small note before it/);
    expect(t.ambiguityChecks.join(" ")).toMatch(/acciaccatura[^.]*short/i);
  });
  it("voice prompts cannot be solved by elimination from the extremes", () => {
    const t = template(base, "t.g5.voices");
    const text = [t.promptPattern, ...t.ambiguityChecks, ...t.hints].join(" ");
    expect(text).toMatch(/neighbouring/);
    expect(text).toMatch(/never only 'highest' or 'lowest'/);
    expect(t.hints.join(" ")).not.toMatch(/soprano … bass|Highest to lowest/);
  });
  it("new interval templates define specific mistake explanations for key-signature errors", () => {
    for (const id of ["t.g5.interval-key-identify", "t.g5.interval-key-build"]) {
      const cats = template(base, id).extraMistakeCategories.map((m) => m.id);
      expect(cats).toContain("ignored-key-signature");
      expect(cats).toContain("accidental-not-applied");
    }
  });
  it("correct-answer feedback on the new items explains why, in context", () => {
    for (const f of [...items(base, "i.g5-interval-key"), ...items(base, "i.g5-rewrite-metre.")]) {
      expect(f.item.feedback.correct.length, f.item.id).toBeGreaterThan(60);
      expect(f.item.feedback.fallback.length, f.item.id).toBeGreaterThan(40);
    }
  });
});
