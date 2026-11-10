/**
 * Answers derived from the notation and task parameters with the music rules. Graders use these rather
 * than trusting a stored answer wherever the answer can be computed.
 */
import { music, pitchedEvents, type ExerciseItem, type NotationFragment } from "@mtp/curriculum";
import { EngineError } from "./context.ts";

const { parsePitch, resolveWrittenPitches } = music;
type Pitch = music.Pitch;

/** Every notehead of a fragment with its sounding pitch computed from the printed signs. */
export function readFragment(f: NotationFragment): Array<{ ref: music.NoteRef; pitch: Pitch; label?: string; isChord: boolean }> {
  const labels = new Map<string, { label?: string; isChord: boolean }>();
  f.measures.forEach((m, bar) => {
    const voices = m.events ? [m.events] : (m.voices ?? []).map((v) => v.events);
    voices.forEach((events, voice) => {
      let idx = 0;
      for (const e of events) {
        const inner = e.kind === "tuplet" ? e.events : [e];
        for (const x of inner) {
          if (x.kind === "note") labels.set(`${bar}.${voice}.${idx}.0`, { label: x.label, isChord: false });
          if (x.kind === "chord") x.notes.forEach((_, ni) => labels.set(`${bar}.${voice}.${idx}.${ni}`, { label: x.label, isChord: true }));
          idx++;
        }
      }
    });
  });
  return resolveWrittenPitches(f as unknown as music.AFragment).map((r) => ({ ...r, ...(labels.get(music.refKey(r.ref)) ?? { isChord: false }) }));
}

/** The note a reading task is about: the single labelled note, else the only note shown. */
export function shownNote(item: ExerciseItem): Pitch | undefined {
  if (!item.music) return undefined;
  const notes = readFragment(item.music).filter((n) => !n.isChord);
  const labelled = notes.filter((n) => n.label);
  const pick = labelled.length === 1 ? labelled[0] : notes.length === 1 ? notes[0] : undefined;
  return pick?.pitch;
}

/** Pitches of the chord a chord task is about: listed in the answer, else the single chord in the music. */
export function chordPitches(item: ExerciseItem, listed?: string[]): Pitch[] {
  if (listed?.length) return listed.map(parsePitch);
  if (!item.music) throw new EngineError("item_inconsistent", "Chord item has no chord");
  const chords = readFragment(item.music).filter((n) => n.isChord);
  if (!chords.length) throw new EngineError("item_inconsistent", "Chord item has no chord");
  const first = chords[0]!.ref;
  return chords.filter((c) => c.ref.bar === first.bar && c.ref.voice === first.voice && c.ref.event === first.event).map((c) => c.pitch);
}

/** Sounding pitches of every note in the source melody (for transposition). */
export function melodyPitches(f: NotationFragment): Pitch[] {
  return readFragment(f).map((n) => n.pitch);
}

export { pitchedEvents };
