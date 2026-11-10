/**
 * SMuFL code points (Bravura, SIL Open Font License 1.1) and the few engraving metrics the layout needs,
 * in staff spaces, from the font's metadata.json. The font is drawn as SVG text: 1 em = 4 staff spaces.
 */
import type { music } from "@mtp/curriculum";

export const G = {
  gClef: "",
  cClef: "",
  fClef: "",
  percussionClef: "",
  noteheadDoubleWhole: "",
  noteheadWhole: "",
  noteheadHalf: "",
  noteheadBlack: "",
  flat: "",
  natural: "",
  sharp: "",
  doubleSharp: "",
  doubleFlat: "",
  restDoubleWhole: "",
  restWhole: "",
  restHalf: "",
  restQuarter: "",
  rest8th: "",
  rest16th: "",
  rest32nd: "",
  flag8thUp: "",
  flag8thDown: "",
  flag16thUp: "",
  flag16thDown: "",
  flag32ndUp: "",
  flag32ndDown: "",
  dot: "",
  timeSigDigit: (d: number) => String.fromCodePoint(0xe080 + d),
  tupletDigit: (d: number) => String.fromCodePoint(0xe880 + d),
  trill: "",
  turn: "",
  upperMordent: "",
  lowerMordent: "",
  fermataAbove: "",
  accentAbove: "",
  staccatoAbove: "",
  tenutoAbove: "",
  staccatissimoAbove: "",
  marcatoAbove: "",
  acciaccatura: "",
  appoggiatura: "",
  brace: "",
  dynamic: { p: "", m: "", f: "", r: "", s: "", z: "", n: "" } as Record<string, string>,
};

export const WIDTH = {
  noteheadBlack: 1.18,
  noteheadWhole: 1.688,
  noteheadDoubleWhole: 2.396,
  sharp: 0.996,
  flat: 0.904,
  natural: 0.672,
  doubleSharp: 0.988,
  doubleFlat: 1.644,
  clef: 2.8,
  timeSig: 1.9,
};

export const ENGRAVING = { stemThickness: 0.12, beamThickness: 0.5, beamSpacing: 0.25, legerExtension: 0.4, staffLineThickness: 0.13, thinBarline: 0.16, thickBarline: 0.5 };

export type Sign = music.Sign;
export const SIGN_GLYPH: Record<Sign, { ch: string; w: number }> = {
  sharp: { ch: G.sharp, w: WIDTH.sharp },
  flat: { ch: G.flat, w: WIDTH.flat },
  natural: { ch: G.natural, w: WIDTH.natural },
  "double-sharp": { ch: G.doubleSharp, w: WIDTH.doubleSharp },
  "double-flat": { ch: G.doubleFlat, w: WIDTH.doubleFlat },
};

export const ORNAMENT_GLYPH: Record<string, string> = { trill: G.trill, turn: G.turn, "upper-mordent": G.upperMordent, "lower-mordent": G.lowerMordent };
export const ARTIC_GLYPH: Record<string, string> = {
  staccato: G.staccatoAbove,
  staccatissimo: G.staccatissimoAbove,
  accent: G.accentAbove,
  "strong-accent": G.marcatoAbove,
  tenuto: G.tenutoAbove,
  "semi-staccato": G.tenutoAbove,
};

/** Clef glyph and the staff position its origin sits on (0 = bottom line). */
export const CLEF_GLYPH: Record<music.Clef, { ch: string; pos: number }> = {
  treble: { ch: G.gClef, pos: 2 },
  bass: { ch: G.fClef, pos: 6 },
  alto: { ch: G.cClef, pos: 4 },
  tenor: { ch: G.cClef, pos: 6 },
};

export function restGlyph(value: music.NoteValue): { ch: string; pos: number } {
  switch (value) {
    case "breve":
      return { ch: G.restDoubleWhole, pos: 4 };
    case "semibreve":
      return { ch: G.restWhole, pos: 6 };
    case "minim":
      return { ch: G.restHalf, pos: 4 };
    case "crotchet":
      return { ch: G.restQuarter, pos: 4 };
    case "quaver":
      return { ch: G.rest8th, pos: 4 };
    case "semiquaver":
      return { ch: G.rest16th, pos: 4 };
    default:
      return { ch: G.rest32nd, pos: 4 };
  }
}

export const BEAMS: Partial<Record<music.NoteValue, number>> = { quaver: 1, semiquaver: 2, demisemiquaver: 3 };
export const FLAGS: Partial<Record<music.NoteValue, [string, string]>> = {
  quaver: [G.flag8thUp, G.flag8thDown],
  semiquaver: [G.flag16thUp, G.flag16thDown],
  demisemiquaver: [G.flag32ndUp, G.flag32ndDown],
};
