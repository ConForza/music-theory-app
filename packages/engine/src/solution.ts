/**
 * The correct answer in words, derived with the same rules the graders use. The server reveals it only after
 * repeated wrong attempts (a teaching step), never in the question payload.
 */
import { allowedForms, deriveScale, music, type CurriculumIndex, type ExerciseItem, type MusicScope, type SimpleAnswerSpec } from "@mtp/curriculum";
import { itemContext, type ItemContext } from "./context.ts";
import { chordPitches, melodyPitches, shownNote } from "./derive.ts";
import { signaturePitches } from "./graders/theory.ts";
import { staffTargets } from "./graders/pitch.ts";

const SIGN: Record<string, string> = { bb: "𝄫", b: "♭", x: "𝄪" };
/** ASCII note names to printed signs: C#, Bb, Dbb (double flat) and Fx (double sharp); words are left alone. */
const pretty = (s: string) => s.replace(/#/g, "♯").replace(/\b([A-G])(bb|b|x)(?=-?\d|$|[ ,.)])/g, (_m, l: string, g: string) => `${l}${SIGN[g]}`);
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
const P = music.parsePitch;
const list = (ps: music.Pitch[]) => pretty(ps.map(music.formatPitch).join(", "));

function describe(c: ItemContext, a: SimpleAnswerSpec): string {
  switch (a.kind) {
    case "choice":
      return `The answer is “${a.options.find((o) => o.id === a.correctOptionIds[0])?.label}”.`;
    case "multi-choice":
      return `The answers are ${a.options.filter((o) => a.correctOptionIds.includes(o.id)).map((o) => `“${o.label}”`).join(" and ")}.`;
    case "pitch": {
      const ref = shownNote(c.item) ?? (a.reference ? P(a.reference) : P(a.accepted[0]!));
      if (a.relation === "same") return `The note is ${pretty(a.octaveSensitive ? music.formatPitch(ref) : music.formatPitchClass(ref))}.`;
      return `${pretty(a.accepted.join(" or "))} ${a.accepted.length > 1 ? "are" : "is"} ${a.relation === "same-sound" ? "the same sound" : "the same sound spelt differently"}.`;
    }
    case "staff-position": {
      const t = staffTargets(a, c.scope.maxLedgerLines ?? a.target.maxLedgerLines);
      return `${pretty(music.formatPitchClass(a.target))} can go at ${t.map((p) => pretty(music.formatPitch(p))).join(" or ")}.`;
    }
    case "pitch-sequence": {
      const d = a.derivation;
      if (d.rule === "scale") return `The scale is ${list(deriveScale(d.key, d.form, d.direction, P(d.start)))}.`;
      if (d.rule === "chromatic") return `One correct answer is ${list(music.chromaticFrom(P(d.start), d.direction))} (other spellings are fine if each letter is used once or twice).`;
      const iv = music.parseInterval(d.interval);
      const notes = c.item.music ? melodyPitches(c.item.music).map((p) => music.transpose(p, iv, d.direction)) : [];
      return `Transposed: ${list(notes)}${a.key ? `, in ${pretty(a.key)}` : ""}.`;
    }
    case "rhythm":
      if (a.task === "place-barlines") {
        const evs = a.accepted[0]!.flatMap((m) => m.events ?? []);
        return `Bar-lines go after notes ${(music.barlinePositions(evs as never, a.timeSignature!) ?? []).filter((x) => x < evs.length).join(", ")}.`;
      }
      return a.acceptAnyRuleCompliant ? "Any answer that fills the bar exactly and keeps every beat clear is correct; the example shown is one of them." : "Compare your answer with the example.";
    case "time-signature":
      return `The time signature is ${a.accepted[0]}.`;
    case "key-signature":
      return a.task === "name-key" ? `This is the key signature of ${pretty(a.accepted.join(" or "))}.` : `${pretty(a.accepted[0]!)} has ${pretty(signaturePitches(music.parseKey(a.accepted[0]!), a.clef).join(" ").replace(/\d/g, "")) || "no sharps or flats"}.`;
    case "interval": {
      if (a.task === "identify") return `The interval is ${article(music.describeInterval(music.intervalBetween(P(a.lower), P(a.upper!))))} ${music.describeInterval(music.intervalBetween(P(a.lower), P(a.upper!)))}.`;
      const code = a.target!;
      if (/^\d+$/.test(code) && a.key) {
        const key = music.parseKey(a.key);
        const forms = allowedForms(key, c.scope, a.minorForm);
        return `A ${music.ordinal(Number(code))} ${a.direction === "down" ? "below" : "above"} ${pretty(a.lower)} in ${pretty(a.key)} is ${pretty(a.acceptedPitches!.join(" or "))}${forms.length > 1 ? " (depending on the form of the minor scale)" : ""}.`;
      }
      return `The note is ${pretty(a.acceptedPitches!.join(" or "))}.`;
    }
    case "chord": {
      if (a.task === "identify") {
        const id = music.identifyTriad(music.parseKey(a.key), chordPitches(c.item, a.pitches));
        return id ? `It is chord ${id.roman}${id.inversion}.` : "";
      }
      const t = music.triad(music.parseKey(a.key), a.target!.roman);
      return `Chord ${a.target!.roman}${a.target!.inversion} uses ${pretty(t.map(music.formatPitchClass).join(", "))}, with ${pretty(music.formatPitchClass(music.bassOf(music.parseKey(a.key), a.target!.roman, a.target!.inversion)))} as the lowest note.`;
    }
    case "ornament-sign":
      return `It is ${article(music.ORNAMENT_INFO[a.accepted[0]!].name)} ${music.ORNAMENT_INFO[a.accepted[0]!].name}.`;
    case "chord-progression":
      return `One correct answer: ${a.points.map((p) => `${p.label} ${p.accepted[0]}`).join(", ")}${a.points.some((p) => p.accepted.length > 1) ? " (other chords that contain the melody notes and form the cadence are also right)" : ""}.`;
  }
}

export function solutionFor(ix: CurriculumIndex, item: ExerciseItem, scope?: MusicScope): string {
  const c = itemContext(ix, item, scope);
  if (item.answer.kind === "composite") return item.answer.parts.map((p, i) => `${i + 1}. ${describe(c, p.answer)}`).join(" ");
  return describe(c, item.answer);
}
