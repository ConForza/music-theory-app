/**
 * What a learner submits. Every shape is validated (bounded sizes, spelt pitches, known enums) before it can
 * reach a grader, so malformed or impossible answers are rejected safely. Responses never carry correctness,
 * completion or scores: the server decides those.
 */
import { z } from "zod";

/** Spelt pitch with octave, e.g. "F#4", "Bb3", "Cx5", "Ebb4". */
export const PitchText = z.string().regex(/^[A-G](bb|b|#|x)?-?\d$/, "Expected a spelt pitch such as F#4");
/** Spelt pitch with optional octave (for octave-insensitive reading tasks), e.g. "F#" or "F#4". */
export const PitchOrClassText = z.string().regex(/^[A-G](bb|b|#|x)?(-?\d)?$/, "Expected a note name such as F# or F#4");
const NoteValue = z.enum(["breve", "semibreve", "minim", "crotchet", "quaver", "semiquaver", "demisemiquaver"]);
const Duration = z.object({ value: NoteValue, dots: z.number().int().min(0).max(2).default(0) }).strict();
const Beam = z.enum(["begin", "continue", "end"]);

const RhythmInner = z
  .object({
    kind: z.enum(["note", "rest"]),
    duration: Duration,
    tieToNext: z.boolean().optional(),
    beam: Beam.optional(),
    wholeBar: z.boolean().optional(),
  })
  .strict();
const RhythmTuplet = z
  .object({ kind: z.literal("tuplet"), actual: z.number().int().min(2).max(9), normal: z.number().int().min(1).max(8), events: z.array(RhythmInner).min(2).max(9) })
  .strict();
export const RhythmEvent = z.discriminatedUnion("kind", [RhythmInner.extend({ kind: z.literal("note") }), RhythmInner.extend({ kind: z.literal("rest") }), RhythmTuplet]);
export type RhythmEventResponse = z.infer<typeof RhythmEvent>;

const Id = z.string().min(1).max(100);
const Roman = z.enum(["I", "ii", "iii", "IV", "V", "vi", "vii"]);
const Quality = z.enum(["dd", "d", "m", "M", "P", "A", "AA"]);
const KeyText = z.string().regex(/^[A-G](#|b)? (major|minor)$/);
const Ornament = z.enum(["trill", "turn", "upper-mordent", "lower-mordent", "acciaccatura", "appoggiatura"]);

const simple = [
  z.object({ kind: z.literal("choice"), optionId: Id }).strict(),
  z.object({ kind: z.literal("multi-choice"), optionIds: z.array(Id).min(1).max(12) }).strict(),
  /** Letter name only (Grade 1 note reading). Kept from Brief 02 so stored attempts stay valid. */
  z.object({ kind: z.literal("pitch-letter"), letter: z.enum(["A", "B", "C", "D", "E", "F", "G"]) }).strict(),
  /** A spelt note name, with octave when the task is octave-sensitive. */
  z.object({ kind: z.literal("pitch"), pitch: PitchOrClassText }).strict(),
  /** A note placed on the stave: written position (letter + octave) and the accidental chosen. */
  z.object({ kind: z.literal("staff-position"), pitch: PitchText }).strict(),
  /** A piano key (semitones above C0) and, when spelling matters, the chosen spelling. */
  z.object({ kind: z.literal("keyboard"), key: z.number().int().min(0).max(120), spelling: PitchText.optional() }).strict(),
  z.object({ kind: z.literal("pitch-sequence"), pitches: z.array(PitchText).min(1).max(32), key: KeyText.optional() }).strict(),
  z.object({ kind: z.literal("rhythm"), measures: z.array(z.object({ events: z.array(RhythmEvent).min(1).max(48) }).strict()).min(1).max(8) }).strict(),
  /** Bar-lines: positions (number of events before each bar-line) and whether a final double bar-line was drawn. */
  z.object({ kind: z.literal("barlines"), after: z.array(z.number().int().min(1).max(200)).max(32), final: z.boolean().default(false) }).strict(),
  z.object({ kind: z.literal("time-signature"), top: z.number().int().min(1).max(16), bottom: z.number().int().refine((n) => [1, 2, 4, 8, 16, 32].includes(n), "Lower figure must be 1, 2, 4, 8, 16 or 32") }).strict(),
  z.object({ kind: z.literal("key-name"), key: KeyText }).strict(),
  z.object({ kind: z.literal("key-signature"), accidentals: z.array(z.object({ pitch: PitchText }).strict()).max(7) }).strict(),
  /** Interval name. `compound: true` with number 3 means "compound 3rd" (= a 10th). Quality omitted for number-only tasks. */
  z.object({ kind: z.literal("interval-name"), number: z.number().int().min(1).max(22), quality: Quality.optional(), compound: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("chord-name"), roman: Roman, inversion: z.enum(["a", "b", "c"]) }).strict(),
  z.object({ kind: z.literal("chord-notes"), pitches: z.array(PitchText).min(1).max(8) }).strict(),
  z.object({ kind: z.literal("ornament"), sign: Ornament }).strict(),
  z.object({ kind: z.literal("progression"), chords: z.record(z.string().regex(/^[A-Z]$/), Roman) }).strict(),
] as const;

export const SimpleResponse = z.discriminatedUnion("kind", simple);
export type SimpleResponse = z.infer<typeof SimpleResponse>;

export const LearnerResponse = z.discriminatedUnion("kind", [
  ...simple,
  z.object({ kind: z.literal("composite"), parts: z.record(z.string().regex(/^[a-z0-9-]+$/), SimpleResponse) }).strict(),
]);
export type LearnerResponse = z.infer<typeof LearnerResponse>;
export type ResponseKind = LearnerResponse["kind"];
