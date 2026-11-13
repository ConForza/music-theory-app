/**
 * Screen-reader descriptions for Grade 4 staves, derived from the notation itself (never from the pitches a generator meant to draw):
 * a sign is mentioned only when the fragment really prints it, a key signature is counted from the key, and ornaments and small notes
 * are described by their look, not their name (the name is often the answer). Used for every Grade 4 stave a generator builds.
 */
import { music, type NotationEvent, type NotationFragment, type NotationScore } from "@mtp/curriculum";
import { posText } from "./grade2.ts";

type Clef = music.Clef;
export const ORN_LOOK: Record<string, string> = {
  trill: "the letters tr above it",
  turn: "a sideways S-shaped curl above it",
  "upper-mordent": "a short zig-zag above it with no line through it",
  "lower-mordent": "a short zig-zag above it with a short vertical line through it",
  acciaccatura: "a small note before it with a diagonal stroke through its stem and flag",
  appoggiatura: "a small note before it with no stroke through its stem",
};
const signWord = (s: string) => s.replace("-", " ");

function noteWords(clef: Clef, e: Extract<NotationEvent, { kind: "note" }>): string {
  const pos = posText(music.staffPosition(clef, music.parsePitch(e.pitch)));
  const extras = [
    e.writtenAccidental ? `a ${signWord(e.writtenAccidental)} sign in front` : "",
    e.ornament ? ORN_LOOK[e.ornament]! : "",
    e.grace ? ORN_LOOK[e.grace.kind]! : "",
    e.tieToNext ? "tied to the next note" : "",
  ].filter(Boolean);
  return `${e.label ? `a note marked ${e.label}` : "a note"} ${pos}${extras.length ? `, with ${extras.join(" and ")}` : ""}`;
}

export function eventWords(clef: Clef, e: NotationEvent): string {
  if (e.kind === "note") return noteWords(clef, e);
  if (e.kind === "rest") return `a ${e.duration.value} rest`;
  if (e.kind === "chord")
    return `${e.label ? `a chord marked ${e.label}` : "a chord"} of ${e.notes.length} notes: ${e.notes.map((n) => `${posText(music.staffPosition(clef, music.parsePitch(n.pitch)))}${n.writtenAccidental ? ` with a ${signWord(n.writtenAccidental)} sign` : ""}`).join("; ")}`;
  return `a group of ${e.events.length}`;
}

export function keySignatureText(key: string): string {
  const sig = music.keySignature(music.parseKey(key));
  return sig.count ? `key signature of ${sig.count} ${sig.count === 1 ? sig.type.slice(0, -1) : sig.type}` : "no sharps or flats in the key signature";
}

/** A full description of one stave. `lead` names the stave ("An alto-clef melody"); the rest is read off the fragment. */
export function describeStave(f: NotationFragment, lead?: string): string {
  const clef = f.clef as Clef;
  const bars = f.measures.map((m, i) => `${f.measures.length > 1 ? `Bar ${i + 1}: ` : ""}${(m.events ?? m.voices?.[0]?.events ?? []).map((e) => eventWords(clef, e)).join("; ")}.`);
  const head = `${lead ?? `${/^[aeiou]/.test(clef) ? "An" : "A"} ${clef}-clef stave`}${f.showKeySignature && f.key ? `, ${keySignatureText(f.key)}` : ""}${f.timeSignature ? `, ${f.timeSignature}` : ""}${f.tempoText ? `, marked ${f.tempoText}` : ""}.`;
  return `${head} ${bars.join(" ")}`;
}

export function describeScore(s: NotationScore, lead: string): NotationScore {
  const staves = s.staves.map((st) => ({ ...st, music: { ...st.music, textAlternative: describeStave(st.music, `${st.label} stave`) } }));
  return { ...s, staves, textAlternative: `${lead} ${staves.map((x) => x.music.textAlternative).join(" ")}` };
}
