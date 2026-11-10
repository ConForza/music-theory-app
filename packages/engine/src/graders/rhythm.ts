/** g.duration-equivalence, g.rhythm-bar, g.grouping-check, g.barlines, g.tuplet, g.time-signature */
import { music, type Measure, type MusicScope, type NotationEvent } from "@mtp/curriculum";
import { EngineError, type ItemContext } from "../context.ts";
import type { SimpleResponse } from "../responses.ts";
import { right, wrong, type AnswerOf, type Grader, type Verdict } from "./types.ts";

const { frac, add, equals, compare, mul, formatFraction, totalLength, checkBarAnyPattern, barCapacity, parseTimeSignature, classifyTimeSignature } = music;
type REvent = music.REvent;
type RInner = music.RInner;

/** Learner rhythm events → rule events (unpitched). */
function fromResponse(r: SimpleResponse): REvent[][] {
  if (r.kind !== "rhythm") throw new EngineError("response_mismatch", "Expected a rhythm");
  return r.measures.map((m) => m.events as unknown as REvent[]);
}
/** Authored notation → rule events. */
export function fromMeasures(ms: Measure[]): REvent[][] {
  return ms.map((m) => (m.events ?? m.voices?.[0]?.events ?? []) as unknown as REvent[]);
}

/** Shape used to compare rhythms: kinds, values, dots, ties, tuplets (never beams or pitch). */
const shapeKey = (events: REvent[]): string =>
  JSON.stringify(
    events.map((e) =>
      e.kind === "tuplet"
        ? { t: [e.actual, e.normal], e: e.events.map((x) => [x.kind === "rest" ? "r" : "n", x.duration.value, x.duration.dots ?? 0, Boolean(x.kind !== "rest" && x.tieToNext)]) }
        : [e.kind === "rest" ? "r" : "n", e.duration.value, e.duration.dots ?? 0, Boolean(e.kind !== "rest" && e.tieToNext), Boolean(e.kind === "rest" && e.wholeBar)],
    ),
  );

/** What is heard: note attacks (tied notes merged) and silences (adjacent rests merged), with exact lengths. */
export function soundingProfile(events: REvent[], bar?: music.Fraction): string[] {
  const tl = music.flatten(events, bar);
  const out: Array<{ kind: "n" | "r"; onset: music.Fraction; len: music.Fraction }> = [];
  let tieOpen = false;
  for (const t of tl) {
    const kind = t.e.kind === "rest" ? "r" : "n";
    const last = out[out.length - 1];
    if (last && ((kind === "n" && tieOpen) || (kind === "r" && last.kind === "r"))) last.len = add(last.len, t.dur);
    else out.push({ kind, onset: t.onset, len: t.dur });
    tieOpen = kind === "n" && Boolean(t.e.tieToNext);
  }
  return out.map((x) => `${x.kind}@${formatFraction(x.onset)}+${formatFraction(x.len)}`);
}

/** Values, dots, ties, rests and tuplets the learner may use at this point of the course. */
function scopeProblem(bars: REvent[][], sc: MusicScope): string | null {
  for (const bar of bars) {
    for (const e of bar) {
      if (e.kind === "tuplet") {
        const kind = e.actual === 3 && e.normal === 2 ? "triplet" : e.actual === 2 && e.normal === 3 ? "duplet" : "irregular";
        if (!(sc.tuplets ?? []).includes(kind)) return `A ${kind} is not part of this question.`;
      }
      for (const x of e.kind === "tuplet" ? e.events : [e as RInner]) {
        if (sc.noteValues?.length && !sc.noteValues.includes(x.duration.value)) return `${cap(x.duration.value)}s are not used in this question.`;
        if ((x.duration.dots ?? 0) > (sc.maxDots ?? 0)) return (sc.maxDots ?? 0) === 0 ? "Dotted notes are not used in this question." : "Double dots are not used in this question.";
        if (x.kind !== "rest" && x.tieToNext && sc.ties === false) return "Ties are not used in this question.";
      }
    }
  }
  return null;
}
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const BAR_CATEGORY: Partial<Record<music.RhythmIssueCode, string>> = {
  "bar-overfull": "bar-overfull",
  "bar-underfull": "bar-underfull",
  "note-across-middle": "grouping-obscures-beat",
  "note-hides-compound-beat": "grouping-obscures-beat",
  "beam-across-middle": "grouping-obscures-beat",
  "beam-hides-compound-beat": "grouping-obscures-beat",
  "beam-crosses-beat": "grouping-obscures-beat",
  "unnecessary-tie": "unnecessary-tie",
  "tie-instead-of-dot": "unnecessary-tie",
  "rest-across-beat": "rest-grouping",
  "half-bar-rest-misplaced": "rest-grouping",
  "rests-not-combined": "rest-grouping",
};
const GROUPING_CATEGORY: Partial<Record<music.RhythmIssueCode, string>> = {
  "beam-across-middle": "beam-across-middle",
  "beam-hides-compound-beat": "compound-beat-hidden",
  "note-hides-compound-beat": "compound-beat-hidden",
  "note-across-middle": "beam-across-middle",
  "rest-across-beat": "rest-across-beat",
  "half-bar-rest-misplaced": "half-bar-rest-misplaced",
  "rests-not-combined": "rest-across-beat",
  "tie-instead-of-dot": "tie-instead-of-dot",
  "unnecessary-tie": "tie-instead-of-dot",
};

function describeTotal(total: music.Fraction, cap_: music.Fraction, ts: string): string {
  const diff = music.sub(cap_, total);
  const v = music.valueFor(diff.n < 0 ? music.sub(total, cap_) : diff, 2);
  const amount = v ? `a ${v.dots ? "dotted " : ""}${v.value}` : `${formatFraction(diff.n < 0 ? music.sub(total, cap_) : diff)} of a semibreve`;
  return compare(total, cap_) > 0 ? `This bar is ${amount} too long for ${ts}.` : `This bar needs ${amount} more to fill ${ts}.`;
}

function judgeBars(c: ItemContext, bars: REvent[][], ts: string, map: Partial<Record<music.RhythmIssueCode, string>>, requireBeams: boolean): Verdict | null {
  const cap_ = barCapacity(parseTimeSignature(ts));
  for (const [i, bar] of bars.entries()) {
    const { issues, structure } = checkBarAnyPattern(bar, ts, { requireBeams });
    if (!issues.length) continue;
    const first = issues[0]!;
    const where = bars.length > 1 ? `Bar ${i + 1}: ` : "";
    if (first.code === "bar-overfull" || first.code === "bar-underfull") return wrong(map[first.code] ?? null, where + describeTotal(totalLength(bar, cap_), cap_, ts));
    const category = map[first.code] ?? (first.code === "beat-not-beamed" && structure.metre !== "simple" ? "compound-beat-hidden" : null);
    return wrong(category, `${where}${first.message} (${ts} has ${music.describeMetre(structure)}.)`);
  }
  void c;
  return null;
}

const matchesReference = (bars: REvent[][], accepted: Measure[][]) => accepted.some((ref) => fromMeasures(ref).length === bars.length && fromMeasures(ref).every((m, i) => shapeKey(m) === shapeKey(bars[i]!)));

export const gradeRhythm: Grader<AnswerOf<"rhythm">> = (c, a, r) => {
  const bars = fromResponse(r);
  const scopeIssue = a.task === "regroup" ? null : scopeProblem(bars, c.scope);
  if (scopeIssue) return wrong(null, scopeIssue);
  const ts = a.timeSignature ?? c.item.music?.timeSignature;
  // Structure before totals: a tie must lead to a note, and the answer must have the shape the task asks for.
  if (music.danglingTies(bars).length) return wrong(a.task === "complete-bar" ? "unnecessary-tie" : null, "A tie must join a note to the next note of the same pitch; this tie leads nowhere.");

  if (a.task === "equivalent-value") {
    const target = frac(a.target![0], a.target![1]);
    const single = a.accepted.every((m) => fromMeasures(m).length === 1 && fromMeasures(m)[0]!.length === 1 && fromMeasures(m)[0]![0]!.kind !== "tuplet");
    const events = bars.flat();
    if (single && (events.length !== 1 || events[0]!.kind === "tuplet")) return wrong(null, "The question asks for a single note (or rest): write one value, not several.");
    const total = bars.reduce((s, b) => add(s, totalLength(b)), frac(0));
    const refUsesNotes = a.accepted.some((m) => fromMeasures(m).flat().some((e) => e.kind !== "rest"));
    const usesRests = bars.flat().some((e) => e.kind === "rest");
    if (equals(total, target) && !(refUsesNotes && usesRests)) return right();
    if (refUsesNotes && usesRests) return wrong("note-rest-confusion", "The question asks for notes, but your answer uses a rest.");
    if (equals(total, mul(target, frac(2))) || equals(total, mul(target, frac(1, 2)))) return wrong("halved-or-doubled", `Your answer lasts ${compare(total, target) > 0 ? "twice" : "half"} as long as it should.`);
    const undotted = bars.flat().reduce((s, e) => add(s, e.kind === "tuplet" ? music.eventLength(e) : music.dotted(e.duration.value, 0)), frac(0));
    if (bars.flat().some((e) => e.kind !== "tuplet" && (e.duration.dots ?? 0) > 0) && !equals(undotted, total)) return wrong("dot-misread", "Check what the dot adds: half the value of the note it follows.");
    if (c.item.music?.measures.some((m) => (m.events ?? []).some((e) => e.kind === "tuplet"))) return wrong("tuplet-ignored", "Remember the group is played in the time of fewer notes.");
    if (bars.flat().some((e) => e.kind !== "rest" && e.kind !== "tuplet" && e.tieToNext)) return wrong("tie-dot-confusion", "A tie adds the whole of the second note; a dot adds half of the first.");
    return wrong(null, `Your answer lasts ${formatFraction(total)} of a semibreve; it should last ${formatFraction(target)}.`);
  }
  if (!ts) throw new EngineError("item_inconsistent", "Rhythm task needs a time signature");
  const wantBars = a.task === "regroup" && c.item.music ? c.item.music.measures.length : a.accepted[0]!.length;
  if (bars.length !== wantBars) return wrong(null, `Write exactly ${wantBars} bar${wantBars === 1 ? "" : "s"}.`);

  if (a.task === "complete-bar") {
    const given = (a.given ?? []) as unknown as REvent[];
    if (bars.length !== 1 || shapeKey(bars[0]!.slice(0, given.length)) !== shapeKey(given)) return wrong(null, "Keep the notes that were given at the start of the bar, then add to them.");
    const v = judgeBars(c, bars, ts, BAR_CATEGORY, false);
    if (v) return v;
    if (!a.acceptAnyRuleCompliant && !matchesReference(bars, a.accepted)) return wrong(null, "That bar adds up, but this question wants one of the patterns it describes.");
    return right();
  }

  if (a.task === "regroup") {
    const shown = c.item.music ? fromMeasures(c.item.music.measures) : fromMeasures(a.accepted[0]!);
    const cap_ = barCapacity(parseTimeSignature(ts));
    if (bars.length !== shown.length) return wrong(null, `Rewrite all ${shown.length} bar(s).`);
    for (const [i, bar] of bars.entries()) {
      if (soundingProfile(bar, cap_).join() !== soundingProfile(shown[i]!, cap_).join()) {
        return wrong(null, `${bars.length > 1 ? `Bar ${i + 1}: ` : ""}the rhythm must sound exactly the same as before; only the way it is written should change.`);
      }
    }
    const v = judgeBars(c, bars, ts, GROUPING_CATEGORY, true);
    if (v) return v;
    if (!a.acceptAnyRuleCompliant && !matchesReference(bars, a.accepted)) return wrong(null, "That grouping is not one of the forms this question accepts.");
    return right();
  }

  if (a.task === "add-tuplet") {
    const hasTuplet = bars.some((b) => b.some((e) => e.kind === "tuplet"));
    if (!hasTuplet) return wrong("tuplet-number-wrong", "Use a tuplet group (for example a triplet) in your answer.");
    const { metre } = classifyTimeSignature(ts);
    for (const b of bars) {
      for (const e of b) {
        if (e.kind !== "tuplet") continue;
        const triplet = e.actual === 3 && e.normal === 2;
        const duplet = e.actual === 2 && e.normal === 3;
        if ((metre === "simple" && duplet) || (metre === "compound" && triplet)) {
          return wrong("tuplet-number-wrong", metre === "simple" ? "In simple time a beat divides into two, so a group of three needs a triplet sign." : "In compound time a beat divides into three, so a group of two needs a duplet sign.");
        }
        const s = music.metreStructure(ts);
        const ratio = music.mul(music.eventLength(e), frac(s.beatUnit.d, s.beatUnit.n));
        if (!(ratio.d === 1 || (ratio.n === 1 && ratio.d === 2))) return wrong("written-value-wrong", "The tuplet group should last exactly one beat (or a whole number of beats).");
      }
    }
    const v = judgeBars(c, bars, ts, { ...BAR_CATEGORY, "tuplet-total-wrong": "tuplet-total-wrong", "bar-overfull": "tuplet-total-wrong", "bar-underfull": "tuplet-total-wrong" }, false);
    if (v) return v;
    if (!a.acceptAnyRuleCompliant && !matchesReference(bars, a.accepted)) return wrong(null, "That bar is correct music, but this question wants the pattern it describes.");
    return right();
  }

  throw new EngineError("response_mismatch", "Use the bar-line tool for this question");
};

/** g.barlines: bar-lines fall where the running total reaches a full bar. */
export const gradeBarlines: Grader<AnswerOf<"rhythm">> = (_c, a, r) => {
  if (r.kind !== "barlines") throw new EngineError("response_mismatch", "Expected bar-line positions");
  const ts = a.timeSignature!;
  const events = fromMeasures(a.accepted[0]!).flat();
  const correct = music.barlinePositions(events, ts);
  if (!correct) throw new EngineError("item_inconsistent", "The music cannot be barred");
  const inner = correct.filter((p) => p !== events.length);
  const got = [...new Set(r.after.filter((p) => p !== events.length))].sort((x, y) => x - y);
  const last = a.accepted[0]![a.accepted[0]!.length - 1];
  const needFinal = last?.barline === "final" || last?.barline === "double";
  if (JSON.stringify(got) === JSON.stringify(inner) && (!needFinal || r.final)) return right();
  if (JSON.stringify(got) === JSON.stringify(inner)) return wrong("missing-final-double-barline", "All the bar-lines are right; finish the piece with a double bar-line.");
  const cap_ = barCapacity(parseTimeSignature(ts));
  const bars = music.splitAt(events, got);
  for (const [i, b] of bars.entries()) {
    const c = compare(totalLength(b), cap_);
    if (c > 0) return wrong("bar-overfull", `Bar ${i + 1} holds more than ${ts} allows.`);
    if (c < 0 && i < bars.length - 1) return wrong("bar-underfull", `Bar ${i + 1} is not full yet.`);
    if (c < 0) return wrong("bar-underfull", `The last bar is not full: a bar-line is missing earlier.`);
  }
  return wrong(null, "Count the beats in each bar again.");
};

/** g.time-signature */
export const gradeTimeSignature: Grader<AnswerOf<"time-signature">> = (c, a, r) => {
  if (r.kind !== "time-signature") throw new EngineError("response_mismatch", "Expected a time signature");
  const text = `${r.top}/${r.bottom}`;
  if (a.accepted.includes(text)) return right();
  const want = parseTimeSignature(a.accepted[0]!);
  let fits = true;
  try {
    const cap_ = barCapacity({ top: r.top, bottom: r.bottom });
    if (c.item.music) fits = c.item.music.measures.every((m) => equals(music.totalLength((m.events ?? m.voices?.[0]?.events ?? []) as unknown as REvent[], cap_), cap_));
    if (equals(cap_, barCapacity(want))) return wrong("simple-compound-confusion", `${text} holds the same amount per bar, but look at how the notes are grouped into beats.`);
  } catch {
    fits = false;
  }
  if (r.bottom === want.bottom) return wrong("beat-count-wrong", `${fits ? "" : `The bars do not add up to ${text}. `}Count the beats in one bar again.`);
  return wrong("beat-unit-wrong", `${fits ? "" : `The bars do not add up to ${text}. `}Check which note value is one beat: that sets the lower figure.`);
};

export type { NotationEvent };
