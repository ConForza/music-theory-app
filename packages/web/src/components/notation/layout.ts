/**
 * Notation layout: NotationFragment / NotationScore → positioned primitives, in staff spaces.
 *
 * Pure and deterministic. It only DRAWS music: which accidentals to print, beaming and stave positions come
 * from the shared music rules, but nothing here decides whether an answer is right (grading is server-side).
 *
 * Coordinates: x grows right; y grows down; the bottom stave line is y = 0 and the top line y = −4. A staff
 * position p (0 = bottom line, 1 = first space, …) sits at y = −p/2.
 */
import * as music from "@mtp/curriculum/music";
import type { Measure, NotationEvent, NotationFragment, NotationScore } from "@mtp/curriculum";
import { ARTIC_GLYPH, BEAMS, CLEF_GLYPH, ENGRAVING, FLAGS, G, ORNAMENT_GLYPH, restGlyph, SIGN_GLYPH, WIDTH } from "./glyphs";

type Inner = Exclude<NotationEvent, { kind: "tuplet" }>;
type Clef = music.Clef;

export interface Glyph {
  x: number;
  y: number;
  ch: string;
  size?: number;
  cls?: string;
}
export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  cls?: string;
}
export interface Path {
  d: string;
  cls?: string;
  fill?: boolean;
  w?: number;
}
export interface Text {
  x: number;
  y: number;
  text: string;
  cls?: string;
  anchor?: "start" | "middle" | "end";
}

export interface LaidEvent {
  /** "bar.voice.index" (index in the voice's flattened events). */
  id: string;
  bar: number;
  voice: number;
  index: number;
  /** Index among all pitched noteheads of the stave in reading order (for per-note marks). */
  noteIndex: number[];
  /** Label that never names the pitch (clef position and printed signs), for reading assessments. */
  positionLabel: string;
  /** Part of a tuplet group (a triplet): its bracket number is only a music-font glyph, so the note's accessible name says so. */
  inTuplet: boolean;
  /** A printed label such as "x" that marks this note in a question. */
  mark: string;
  x: number;
  width: number;
  pitches: string[];
  rest: boolean;
  label: string;
  glyphs: Glyph[];
  lines: Line[];
  paths: Path[];
  texts: Text[];
}

export interface StaveLayout {
  width: number;
  top: number;
  bottom: number;
  lines: number[];
  fixed: { glyphs: Glyph[]; lines: Line[]; paths: Path[]; texts: Text[] };
  events: LaidEvent[];
  /** Positions of the left edge of each bar's content (for overlays such as bar-line pickers). */
  barX: number[];
}

const y = (pos: number) => -pos / 2;
const ORDW = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
/** "3rd line", "space below the stave", "2nd ledger line above the stave" — never a note name. */
export function positionWords(pos: number): string {
  if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? `${ORDW[pos / 2]} line` : `${ORDW[(pos - 1) / 2]} space`;
  if (pos < 0) return pos % 2 === 0 ? `${ORDW[-pos / 2 - 1]} ledger line below the stave` : pos === -1 ? "space just below the stave" : `space below the ${ORDW[(-pos - 1) / 2 - 1]} ledger line`;
  return pos % 2 === 0 ? `${ORDW[(pos - 8) / 2 - 1]} ledger line above the stave` : pos === 9 ? "space just above the stave" : `space above the ${ORDW[(pos - 9) / 2 - 1]} ledger line`;
}
const VALUE_NAME = (e: Inner) => `${e.duration.dots === 2 ? "double-dotted " : e.duration.dots === 1 ? "dotted " : ""}${e.duration.value}`;
const pretty = (p: string) => p.replace("#", "♯").replace(/b(?=-?\d)/, "♭").replace("x", "𝄪").replace("bb", "𝄫");

export function voicesOf(m: Measure): NotationEvent[][] {
  return m.events ? [m.events] : (m.voices ?? []).map((v) => v.events);
}

/** Exact onset of every inner event of a voice, in semibreves (whole-bar rests last one bar). */
function timeline(events: NotationEvent[], bar?: music.Fraction) {
  return music.flatten(events as unknown as music.REvent[], bar).map((t) => ({ e: t.e as unknown as Inner, onset: t.onset, dur: t.dur, tuplet: t.tuplet }));
}

function slotWidth(e: Inner, dur: music.Fraction, accidentals: number): number {
  const d = (dur.n / dur.d) * 4;
  const base = 1.9 + 1.5 * Math.sqrt(Math.max(d, 0.25));
  const dots = (e.duration.dots ?? 0) * 0.6;
  return base + dots + accidentals * 1.2;
}

export type Slots = Array<Array<{ key: string; onset: music.Fraction; width: number }>>;

/** Horizontal slots per bar: one per distinct onset across all voices (and staves, when merged). */
export function collectSlots(f: NotationFragment): Slots {
  const bar = f.timeSignature ? music.barCapacity(music.parseTimeSignature(f.timeSignature)) : undefined;
  const signs = safeSigns(f);
  return f.measures.map((m, bi) => {
    const slots = new Map<string, { key: string; onset: music.Fraction; width: number }>();
    voicesOf(m).forEach((events, vi) => {
      timeline(events, bar).forEach((t, ei) => {
        const key = `${t.onset.n}/${t.onset.d}`;
        const notes = t.e.kind === "chord" ? t.e.notes.length : 1;
        const acc = Array.from({ length: notes }, (_, ni) => signs.get(`${bi}.${vi}.${ei}.${ni}`)).filter(Boolean).length;
        const w = slotWidth(t.e, t.dur, Math.min(acc, 2)) + (t.e.kind !== "rest" && t.e.grace ? 1.8 : 0);
        const cur = slots.get(key);
        if (!cur || cur.width < w) slots.set(key, { key, onset: t.onset, width: w });
      });
    });
    return [...slots.values()].sort((a, b) => music.compare(a.onset, b.onset));
  });
}

export function mergeSlots(all: Slots[]): Slots {
  const bars = Math.max(...all.map((s) => s.length));
  return Array.from({ length: bars }, (_, bi) => {
    const map = new Map<string, { key: string; onset: music.Fraction; width: number }>();
    for (const s of all) for (const x of s[bi] ?? []) if (!map.has(x.key) || map.get(x.key)!.width < x.width) map.set(x.key, { ...x });
    return [...map.values()].sort((a, b) => music.compare(a.onset, b.onset));
  });
}

function safeSigns(f: NotationFragment): Map<string, music.Sign | null> {
  if ((f.presentation ?? "stave") !== "stave") return new Map();
  try {
    return music.printedAccidentals(f as unknown as music.AFragment);
  } catch {
    return new Map();
  }
}

export function prefixWidth(f: NotationFragment): number {
  if ((f.presentation ?? "stave") === "rhythm-line") return 1 + (f.timeSignature ? WIDTH.timeSig + 1 : 0) + 2;
  const sig = f.key && f.showKeySignature !== false ? Math.abs(music.keyFifths(music.parseKey(f.key))) : 0;
  return 0.8 + WIDTH.clef + 0.8 + sig * 1.05 + (sig ? 0.6 : 0) + (f.timeSignature ? WIDTH.timeSig + 0.9 : 0) + 0.6;
}

export interface LayoutOptions {
  slots?: Slots;
  prefix?: number;
  /** Width of the bars when there are none (empty stave for editors). */
  minWidth?: number;
}

/** Lay out one stave. */
export function layoutFragment(f: NotationFragment, opts: LayoutOptions = {}): StaveLayout {
  const presentation = f.presentation ?? "stave";
  const rhythm = presentation === "rhythm-line";
  const clef = f.clef as Clef;
  const signs = safeSigns(f);
  const fixed: StaveLayout["fixed"] = { glyphs: [], lines: [], paths: [], texts: [] };
  const events: LaidEvent[] = [];
  const posOf = (p: string) => (rhythm ? 4 : music.staffPosition(clef, music.parsePitch(p)));
  let top = -4;
  let bottom = 0;
  const reach = (yy: number) => {
    top = Math.min(top, yy);
    bottom = Math.max(bottom, yy);
  };

  // Prefix: clef, key signature, time signature.
  let x = 0.8;
  if (rhythm) {
    fixed.glyphs.push({ x, y: y(4), ch: G.percussionClef, cls: "n-glyph" });
    x += 2;
  } else {
    const cg = CLEF_GLYPH[clef];
    fixed.glyphs.push({ x, y: y(cg.pos), ch: cg.ch, cls: "n-glyph" });
    reach(y(cg.pos) - (clef === "treble" ? 4.4 : 2.1));
    reach(y(cg.pos) + (clef === "treble" ? 2.7 : 2.6));
    x += WIDTH.clef + 0.8;
    if (f.key && f.showKeySignature !== false) {
      for (const p of music.signaturePitches(music.parseKey(f.key), clef)) {
        const pp = music.parsePitch(p);
        const g = SIGN_GLYPH[pp.alter > 0 ? "sharp" : "flat"];
        fixed.glyphs.push({ x, y: y(music.staffPosition(clef, pp)), ch: g.ch, cls: "n-glyph" });
        x += 1.05;
      }
      if (music.keyFifths(music.parseKey(f.key)) !== 0) x += 0.6;
    }
  }
  if (f.timeSignature) {
    const [t, b] = f.timeSignature.split("/");
    const digits = (s: string, pos: number) => {
      const w = s.length * 1.8;
      [...s].forEach((d, i) => fixed.glyphs.push({ x: x + i * 1.8 + (WIDTH.timeSig - w) / 2, y: y(pos), ch: G.timeSigDigit(Number(d)), cls: "n-glyph" }));
    };
    digits(t!, 6);
    digits(b!, 2);
    x += WIDTH.timeSig + 0.9;
  }
  x = Math.max(x + 0.6, opts.prefix ?? 0);

  const slots = opts.slots ?? collectSlots(f);
  const barCap = f.timeSignature ? music.barCapacity(music.parseTimeSignature(f.timeSignature)) : undefined;
  const barX: number[] = [];
  let noteCounter = 0;
  // Pending ties and slurs (by voice) that close on a later event.
  const tieFrom = new Map<number, Array<{ x: number; pos: number; up: boolean; pitch: string }>>();
  const slurFrom = new Map<number, { x: number; pos: number; up: boolean }>();

  f.measures.forEach((m, bi) => {
    barX.push(x);
    const barSlots = slots[bi] ?? [];
    const slotX = new Map<string, number>();
    let sx = x;
    for (const s of barSlots) {
      slotX.set(s.key, sx);
      sx += s.width;
    }
    const barEnd = Math.max(sx, x + (opts.minWidth ?? 0)) + 0.4;
    const voices = voicesOf(m);
    const multi = voices.length > 1;

    voices.forEach((evs, vi) => {
      const tl = timeline(evs, barCap);
      // Beam groups (in flattened order) decide shared stem direction.
      const groups: number[][] = [];
      let open: number[] | null = null;
      tl.forEach((t, i) => {
        if (t.e.beam === "begin") open = [i];
        else if (open && (t.e.beam === "continue" || t.e.beam === "end")) {
          open.push(i);
          if (t.e.beam === "end") {
            groups.push(open);
            open = null;
          }
        }
      });
      const groupOf = new Map<number, number[]>();
      groups.forEach((g) => g.forEach((i) => groupOf.set(i, g)));
      const positions = (t: (typeof tl)[number]) => (t.e.kind === "note" ? [posOf(t.e.pitch)] : t.e.kind === "chord" ? t.e.notes.map((n) => posOf(n.pitch)) : []);
      const stemUpFor = (idx: number[]) => {
        if (multi) return vi % 2 === 0;
        if (rhythm) return true;
        const ps = idx.flatMap((i) => positions(tl[i]!));
        if (!ps.length) return true;
        const far = Math.max(...ps.map((p) => Math.abs(p - 4)));
        const hi = ps.find((p) => Math.abs(p - 4) === far)!;
        return hi < 4;
      };
      const laid: Array<{ ev: LaidEvent; up: boolean; stemX: number; tipY: number; headY: [number, number]; beams: number; t: (typeof tl)[number] }> = [];

      tl.forEach((t, ei) => {
        const key = `${t.onset.n}/${t.onset.d}`;
        const nx = (slotX.get(key) ?? x) + 1.2 + (t.e.kind !== "rest" && t.e.grace ? 1.8 : 0);
        const ev: LaidEvent = { id: `${bi}.${vi}.${ei}`, bar: bi, voice: vi, index: ei, noteIndex: [], positionLabel: "", inTuplet: t.tuplet !== undefined, mark: (t.e as { label?: string }).label || "", x: nx, width: 1.3, pitches: [], rest: t.e.kind === "rest", label: "", glyphs: [], lines: [], paths: [], texts: [] };
        const e = t.e;
        if (e.kind === "rest") {
          const whole = e.wholeBar || (barCap && music.equals(t.dur, barCap) && voices.length === 1 && tl.length === 1);
          const rg = restGlyph(whole && e.duration.value !== "breve" ? "semibreve" : e.duration.value);
          const restPos = multi ? rg.pos + (vi % 2 === 0 ? 2 : -2) : rhythm ? (e.duration.value === "semibreve" ? 6 : 4) : rg.pos;
          const rx = whole ? (x + barEnd) / 2 - 0.6 : nx;
          ev.x = rx;
          ev.glyphs.push({ x: rx, y: y(restPos), ch: rg.ch, cls: "n-glyph" });
          for (let d = 0; d < (e.duration.dots ?? 0); d++) ev.glyphs.push({ x: rx + 1.5 + d * 0.5, y: y(5), ch: G.dot, cls: "n-glyph" });
          ev.label = `${whole ? "whole-bar" : VALUE_NAME(e)} rest`;
          ev.positionLabel = ev.label;
          if (e.articulations?.includes("fermata")) ev.glyphs.push({ x: rx - 0.6, y: y(Math.max(10, restPos + 4)), ch: G.fermataAbove, cls: "n-glyph" });
          if (e.label) ev.texts.push({ x: rx + 0.5, y: y(11) , text: e.label, cls: "n-label", anchor: "middle" });
          reach(y(restPos) - 1.6);
          reach(y(restPos) + 1.6);
          events.push(ev);
          laid.push({ ev, up: true, stemX: rx, tipY: 0, headY: [0, 0], beams: 0, t });
          return;
        }
        const notes = e.kind === "note" ? [{ pitch: e.pitch, writtenAccidental: e.writtenAccidental }] : e.notes;
        const ps = notes.map((n) => posOf(n.pitch));
        const g = groupOf.get(ei);
        const up = stemUpFor(g ?? [ei]);
        const value = e.duration.value;
        const head = value === "breve" ? G.noteheadDoubleWhole : value === "semibreve" ? G.noteheadWhole : value === "minim" ? G.noteheadHalf : G.noteheadBlack;
        const hw = value === "breve" ? WIDTH.noteheadDoubleWhole : value === "semibreve" ? WIDTH.noteheadWhole : WIDTH.noteheadBlack;
        ev.width = hw;
        // Noteheads (seconds in a chord go to the other side of the stem).
        const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
        const shifted = new Set<number>();
        for (let k = 1; k < order.length; k++) if (order[k]!.p - order[k - 1]!.p === 1 && !shifted.has(order[k - 1]!.i)) shifted.add(up ? order[k]!.i : order[k - 1]!.i);
        let accCol = 0;
        notes.forEach((n, ni) => {
          const p = ps[ni]!;
          const hx = nx + (shifted.has(ni) ? (up ? hw - 0.06 : -(hw - 0.06)) : 0);
          ev.glyphs.push({ x: hx, y: y(p), ch: head, cls: "n-head" });
          ev.pitches.push(n.pitch);
          ev.noteIndex.push(noteCounter++);
          // Ledger lines.
          for (let l = -2; l >= p; l -= 2) ev.lines.push({ x1: hx - ENGRAVING.legerExtension, x2: hx + hw + ENGRAVING.legerExtension, y1: y(l), y2: y(l), w: 0.16, cls: "n-line" });
          for (let l = 10; l <= p; l += 2) ev.lines.push({ x1: hx - ENGRAVING.legerExtension, x2: hx + hw + ENGRAVING.legerExtension, y1: y(l), y2: y(l), w: 0.16, cls: "n-line" });
          if (!rhythm) {
            reach(y(p) - 0.6);
            reach(y(p) + 0.6);
          }
          // Accidental.
          const sign = signs.get(`${bi}.${vi}.${ei}.${ni}`);
          if (sign) {
            const sg = SIGN_GLYPH[sign];
            ev.glyphs.push({ x: nx - 0.3 - sg.w - accCol * 1.1, y: y(p), ch: sg.ch, cls: "n-glyph" });
            if (notes.length > 1) accCol = (accCol + 1) % 2;
          }
          // Dots.
          const dotPos = p % 2 === 0 ? p + 1 : p;
          for (let d = 0; d < (e.duration.dots ?? 0); d++) ev.glyphs.push({ x: nx + hw + 0.35 + d * 0.5 + (shifted.size && up ? hw : 0), y: y(dotPos), ch: G.dot, cls: "n-glyph" });
        });
        const hi = Math.max(...ps);
        const lo = Math.min(...ps);
        // Stems (not for semibreves/breves).
        const hasStem = value !== "semibreve" && value !== "breve";
        const stemX = up ? nx + hw - ENGRAVING.stemThickness / 2 : nx + ENGRAVING.stemThickness / 2;
        const baseY = up ? y(lo) - 0.168 : y(hi) + 0.168;
        let tipY = up ? y(hi) - 3.5 : y(lo) + 3.5;
        if (up && tipY > y(4)) tipY = Math.min(tipY, y(4)); // reach the middle line
        if (!up && tipY < y(4)) tipY = Math.max(tipY, y(4));
        if (rhythm) tipY = y(4) - 3.5;
        const beams = BEAMS[value] ?? 0;
        if (hasStem) laid.push({ ev, up, stemX, tipY, headY: [baseY, baseY], beams, t });
        else laid.push({ ev, up, stemX, tipY: baseY, headY: [baseY, baseY], beams: 0, t });
        if (hasStem && !g) {
          ev.lines.push({ x1: stemX, x2: stemX, y1: baseY, y2: tipY, w: ENGRAVING.stemThickness, cls: "n-stem" });
          const flag = FLAGS[value];
          if (flag) ev.glyphs.push({ x: stemX - ENGRAVING.stemThickness / 2, y: tipY, ch: up ? flag[0] : flag[1], cls: "n-glyph" });
          reach(tipY);
        }
        // Articulations (note side opposite the stem) and fermata above the stave.
        const artUp = !up;
        (e.articulations ?? []).forEach((a, k) => {
          if (a === "fermata") {
            ev.glyphs.push({ x: nx - 0.6, y: Math.min(y(10), y(hi + 4)), ch: G.fermataAbove, cls: "n-glyph" });
            reach(Math.min(y(10), y(hi + 4)) - 1.4);
            return;
          }
          const ch = ARTIC_GLYPH[a];
          if (!ch) return;
          const ay = artUp ? y(hi + 2 + k) : y(lo - 2 - k) + 0.4;
          ev.glyphs.push({ x: nx + hw / 2 - 0.5, y: ay, ch, cls: "n-glyph" });
          reach(ay - 1);
          reach(ay + 1);
        });
        if (e.ornament && ORNAMENT_GLYPH[e.ornament]) {
          const oy = Math.min(y(10), y(hi + (up ? 9 : 3)));
          ev.glyphs.push({ x: nx + hw / 2 - 1.1, y: oy, ch: ORNAMENT_GLYPH[e.ornament]!, cls: "n-glyph" });
          reach(oy - 1.8);
        }
        if (e.grace) {
          const gp = posOf(e.grace.pitches[0]!);
          ev.glyphs.push({ x: nx - 2.2, y: y(gp), ch: e.grace.kind === "acciaccatura" ? G.acciaccatura : G.appoggiatura, size: 4, cls: "n-glyph n-grace" });
          reach(y(gp) - 2.2);
        }
        if (e.dynamic) {
          const dy = y(Math.min(-3, lo - 3));
          let dx = nx - 0.4;
          for (const ch of e.dynamic) {
            const gl = G.dynamic[ch];
            if (gl) {
              ev.glyphs.push({ x: dx, y: dy, ch: gl, cls: "n-glyph" });
              dx += 1.2;
            }
          }
          reach(dy + 1);
        }
        if (e.label) {
          const ly = Math.min(y(12), (up ? tipY : y(hi)) - 1.4);
          ev.texts.push({ x: nx + hw / 2, y: ly, text: e.label, cls: "n-label", anchor: "middle" });
          reach(ly - 1.4);
        }
        // Ties: close any tie from the previous event of this voice.
        const pending = tieFrom.get(vi);
        if (pending) {
          for (const pt of pending) {
            const tx2 = nx - 0.15;
            const ty = y(pt.pos) + (pt.up ? 0.7 : -0.7);
            const mid = (pt.x + tx2) / 2;
            const lift = pt.up ? 0.9 : -0.9;
            ev.paths.push({ d: `M${pt.x},${ty} Q${mid},${ty + lift} ${tx2},${ty}`, cls: "n-tie", w: 0.18 });
          }
          tieFrom.delete(vi);
        }
        if (e.tieToNext) tieFrom.set(vi, ps.map((p, i) => ({ x: nx + hw + 0.15, pos: p, up, pitch: notes[i]!.pitch })));
        // Slurs.
        if (e.slur === "start") slurFrom.set(vi, { x: nx + hw / 2, pos: up ? lo : hi, up });
        if (e.slur === "stop") {
          const s = slurFrom.get(vi);
          if (s) {
            const below = s.up;
            const sy = y(below ? Math.min(s.pos, lo) : Math.max(s.pos, hi)) + (below ? 1.2 : -1.2);
            const ey = y(below ? lo : hi) + (below ? 1.2 : -1.2);
            const cy = (below ? Math.max(sy, ey) + 1.6 : Math.min(sy, ey) - 1.6);
            ev.paths.push({ d: `M${s.x},${sy} C${s.x + 1.5},${cy} ${nx + hw / 2 - 1.5},${cy} ${nx + hw / 2},${ey}`, cls: "n-tie", w: 0.18 });
            reach(cy - 0.5);
            reach(cy + 0.5);
            slurFrom.delete(vi);
          }
        }
        const names = notes.map((n) => (rhythm ? "" : pretty(n.pitch)));
        ev.label = rhythm ? VALUE_NAME(e) : `${VALUE_NAME(e)} ${names.join(" ")}${e.tieToNext ? ", tied" : ""}`;
        ev.positionLabel = rhythm
          ? VALUE_NAME(e)
          : `${VALUE_NAME(e)} on the ${notes.map((n, ni) => { const sign = signs.get(`${bi}.${vi}.${ei}.${ni}`); return `${positionWords(ps[ni]!)}${sign ? ` with a ${sign.replace("-", " ")} sign` : ""}`; }).join(" and ")}${e.tieToNext ? ", tied" : ""}`;
        events.push(ev);
      });

      // Beams.
      for (const g of groups) {
        const members = g.map((i) => laid.find((l) => l.ev.index === i && l.ev.voice === vi && l.ev.bar === bi)!).filter((l) => l && !l.ev.rest);
        if (members.length < 2) {
          for (const l of members) {
            l.ev.lines.push({ x1: l.stemX, x2: l.stemX, y1: l.headY[0], y2: l.tipY, w: ENGRAVING.stemThickness, cls: "n-stem" });
            const flag = FLAGS[l.t.e.duration.value];
            if (flag) l.ev.glyphs.push({ x: l.stemX, y: l.tipY, ch: l.up ? flag[0] : flag[1], cls: "n-glyph" });
          }
          continue;
        }
        const up = members[0]!.up;
        const first = members[0]!;
        const last = members[members.length - 1]!;
        const slope = Math.max(-0.25, Math.min(0.25, (last.tipY - first.tipY) / Math.max(1, last.stemX - first.stemX)));
        const maxBeams = Math.max(...members.map((m2) => m2.beams));
        const at = (xx: number) => first.tipY + slope * (xx - first.stemX);
        // Shift the beam so every stem keeps a minimum length.
        let shift = 0;
        for (const mm of members) {
          const minLen = 2.5 + (maxBeams - 1) * 0.75;
          const len = up ? mm.headY[0] - (at(mm.stemX) + shift) : at(mm.stemX) + shift - mm.headY[0];
          if (len < minLen) shift += up ? -(minLen - len) : minLen - len;
        }
        const by = (xx: number) => at(xx) + shift;
        for (const mm of members) {
          mm.ev.lines.push({ x1: mm.stemX, x2: mm.stemX, y1: mm.headY[0], y2: by(mm.stemX), w: ENGRAVING.stemThickness, cls: "n-stem" });
          reach(by(mm.stemX));
        }
        const thick = ENGRAVING.beamThickness;
        const beamPath = (x1: number, x2: number, level: number) => {
          const off = level * (thick + ENGRAVING.beamSpacing) * (up ? 1 : -1);
          const y1 = by(x1) + off;
          const y2 = by(x2) + off;
          const dir = up ? 1 : -1;
          return `M${x1},${y1} L${x2},${y2} L${x2},${y2 + dir * thick} L${x1},${y1 + dir * thick} Z`;
        };
        const owner = first.ev;
        owner.paths.push({ d: beamPath(first.stemX - 0.06, last.stemX + 0.06, 0), fill: true, cls: "n-beam" });
        for (let level = 1; level < maxBeams; level++) {
          let k = 0;
          while (k < members.length) {
            if (members[k]!.beams <= level) {
              k++;
              continue;
            }
            let j = k;
            while (j + 1 < members.length && members[j + 1]!.beams > level) j++;
            if (j > k) owner.paths.push({ d: beamPath(members[k]!.stemX - 0.06, members[j]!.stemX + 0.06, level), fill: true, cls: "n-beam" });
            else {
              const toLeft = k === members.length - 1 || (k > 0 && (members[k - 1]!.t.dur.n / members[k - 1]!.t.dur.d) > (members[k]!.t.dur.n / members[k]!.t.dur.d));
              const sx2 = members[k]!.stemX;
              owner.paths.push({ d: toLeft ? beamPath(sx2 - 1.1, sx2 + 0.06, level) : beamPath(sx2 - 0.06, sx2 + 1.1, level), fill: true, cls: "n-beam" });
            }
            k = j + 1;
          }
        }
      }

      // Tuplet numbers (and brackets when the group is not one beam).
      const tupletIdx = new Map<number, number[]>();
      tl.forEach((t, i) => t.tuplet !== undefined && tupletIdx.set(t.tuplet, [...(tupletIdx.get(t.tuplet) ?? []), i]));
      for (const [top, idx] of tupletIdx) {
        const ev0 = evs[top];
        if (!ev0 || ev0.kind !== "tuplet") continue;
        const members = idx.map((i) => laid.find((l) => l.ev.index === i && l.ev.voice === vi && l.ev.bar === bi)!).filter(Boolean);
        if (!members.length) continue;
        const up = members.find((m2) => !m2.ev.rest)?.up ?? true;
        const x1 = members[0]!.ev.x;
        const x2 = members[members.length - 1]!.ev.x + members[members.length - 1]!.ev.width;
        const edge = up ? Math.min(...members.map((m2) => (m2.ev.rest ? y(8) : m2.tipY)), y(9)) - 1.2 : Math.max(...members.map((m2) => (m2.ev.rest ? y(0) : m2.tipY)), y(-1)) + 1.6;
        const digits = String(ev0.actual);
        const cx = (x1 + x2) / 2;
        const owner = members[0]!.ev;
        [...digits].forEach((d, k) => owner.glyphs.push({ x: cx - (digits.length * 1.2) / 2 + k * 1.2, y: edge + 0.6, ch: G.tupletDigit(Number(d)), size: 3.2, cls: "n-glyph" }));
        const allBeamed = members.every((m2) => groupOf.has(m2.ev.index)) && new Set(members.map((m2) => groupOf.get(m2.ev.index))).size === 1;
        if (!allBeamed) {
          const by = edge - 0.2;
          const h = up ? 0.6 : -0.6;
          owner.paths.push({ d: `M${x1},${by + h} L${x1},${by} L${cx - 1},${by} M${cx + 1},${by} L${x2},${by} L${x2},${by + h}`, cls: "n-bracket", w: 0.16 });
        }
        reach(edge - 1.4);
        reach(edge + 0.6);
      }
    });

    // Bar-line.
    x = barEnd;
    const bl = m.barline ?? (bi === f.measures.length - 1 && f.measures.length > 1 ? "final" : "single");
    const y1 = rhythm ? y(6) : y(8);
    const y2 = rhythm ? y(2) : y(0);
    if (bl === "final" || bl === "repeat-end") {
      if (bl === "repeat-end") {
        fixed.paths.push({ d: `M${x - 0.9},${y(5)} m-0.25,0 a0.25,0.25 0 1,0 0.5,0 a0.25,0.25 0 1,0 -0.5,0 M${x - 0.9},${y(3)} m-0.25,0 a0.25,0.25 0 1,0 0.5,0 a0.25,0.25 0 1,0 -0.5,0`, fill: true, cls: "n-beam" });
      }
      fixed.lines.push({ x1: x - 0.6, x2: x - 0.6, y1, y2, w: ENGRAVING.thinBarline, cls: "n-line" });
      fixed.lines.push({ x1: x, x2: x, y1, y2, w: ENGRAVING.thickBarline, cls: "n-line" });
      x += 0.4;
    } else if (bl === "double") {
      fixed.lines.push({ x1: x - 0.5, x2: x - 0.5, y1, y2, w: ENGRAVING.thinBarline, cls: "n-line" });
      fixed.lines.push({ x1: x, x2: x, y1, y2, w: ENGRAVING.thinBarline, cls: "n-line" });
    } else if (bl === "repeat-start") {
      fixed.lines.push({ x1: x, x2: x, y1, y2, w: ENGRAVING.thickBarline, cls: "n-line" });
      fixed.lines.push({ x1: x + 0.6, x2: x + 0.6, y1, y2, w: ENGRAVING.thinBarline, cls: "n-line" });
    } else if (f.measures.length > 1 || bi < f.measures.length - 1) {
      fixed.lines.push({ x1: x, x2: x, y1, y2, w: ENGRAVING.thinBarline, cls: "n-line" });
    }
    x += 1.2;
  });

  // A tempo word (e.g. "Andante") is printed above the first bar, where a real score puts it.
  if (f.tempoText && !rhythm) {
    fixed.texts.push({ x: barX[0] ?? x, y: -7.2, text: f.tempoText, cls: "n-tempo", anchor: "start" });
    top = Math.min(top, -8.6);
  }
  const width = x + 0.4;
  const lines = rhythm ? [4] : [0, 2, 4, 6, 8];
  if (rhythm) {
    top = Math.min(top, -6.5);
    bottom = Math.max(bottom, 1.5);
  }
  return { width, top: top - 0.8, bottom: bottom + 0.8, lines, fixed, events, barX };
}

export interface ScoreLayout {
  width: number;
  staves: Array<{ id: string; label: string; offset: number; layout: StaveLayout }>;
  height: number;
}

/** Several staves sharing horizontal spacing, bar by bar, so simultaneous notes line up. */
export function layoutScore(score: NotationScore): ScoreLayout {
  const slots = mergeSlots(score.staves.map((s) => collectSlots(s.music)));
  const prefix = Math.max(...score.staves.map((s) => prefixWidth(s.music)));
  let offset = 0;
  const staves = score.staves.map((s) => {
    const layout = layoutFragment(s.music, { slots, prefix: prefix + 3.5 });
    const top = offset - layout.top;
    offset = top + layout.bottom + 1.5;
    return { id: s.id, label: s.label, offset: top, layout };
  });
  return { width: Math.max(...staves.map((s) => s.layout.width)), staves, height: offset };
}

/** Exact sounding timeline (seconds) for playback, from the same events that are drawn. */
export function playbackEvents(f: NotationFragment, bpm = 84, transposeSemitones = 0): Array<{ at: number; dur: number; pitches: string[]; semis: number[]; id: string }> {
  const out: Array<{ at: number; dur: number; pitches: string[]; semis: number[]; id: string }> = [];
  const bar = f.timeSignature ? music.barCapacity(music.parseTimeSignature(f.timeSignature)) : undefined;
  const beat = f.timeSignature ? music.metreStructure(f.timeSignature).beatUnit : music.frac(1, 4);
  const secondsPer = (fr: music.Fraction) => (fr.n / fr.d) / (beat.n / beat.d) * (60 / bpm);
  let barStart = 0;
  // A tie carries per voice across bar-lines: the continuation extends the earlier sound, with no new attack.
  const tieCarry = new Map<number, number>();
  f.measures.forEach((m, bi) => {
    let longest = 0;
    voicesOf(m).forEach((evs, vi) => {
      const tl = timeline(evs, bar);
      tl.forEach((t, ei) => {
        const end = secondsPer(music.add(t.onset, t.dur));
        longest = Math.max(longest, end);
        if (t.e.kind === "rest") {
          tieCarry.delete(vi);
          return;
        }
        const ps = t.e.kind === "note" ? [t.e.pitch] : t.e.notes.map((n) => n.pitch);
        const carried = tieCarry.get(vi);
        if (carried !== undefined && out[carried]) {
          out[carried]!.dur += secondsPer(t.dur);
          if (t.e.tieToNext) tieCarry.set(vi, carried);
          else tieCarry.delete(vi);
          return;
        }
        out.push({ at: barStart + secondsPer(t.onset), dur: secondsPer(t.dur), pitches: ps, semis: ps.map((p) => music.chromaticNumber(music.parsePitch(p)) + transposeSemitones + 12 * (f.octaveShift ?? 0)), id: `${bi}.${vi}.${ei}` });
        if (t.e.tieToNext) tieCarry.set(vi, out.length - 1);
        else tieCarry.delete(vi);
      });
    });
    barStart += bar ? secondsPer(bar) : longest;
  });
  return out.sort((a, b) => a.at - b.at);
}
