/**
 * Optional sound. A small WebAudio synth with voice management: every note has a scheduled stop, at most
 * MAX_VOICES sound at once (the oldest is released first), and `stopAll` silences everything (called when a
 * question changes, the page is hidden, or a new phrase starts) so no note can stick.
 *
 * Pitch comes from the same spelt pitch the notation shows: semitones above C0 from letter + accidental +
 * octave (C♯4 and D♭4 sound the same, as they should). Transposing parts pass their sounding offset.
 */
import { frequency, parsePitch, semitones } from "./music";

let ctx: AudioContext | undefined;
let enabled = true;
const MAX_VOICES = 12;
interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
  end: number;
}
let voices: Voice[] = [];
let timers: number[] = [];

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
  if (!on) stopAll();
};
export const soundEnabled = () => enabled;

function context(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function release(v: Voice, at: number) {
  try {
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setTargetAtTime(0.0001, at, 0.03);
    for (const o of v.oscs) o.stop(at + 0.2);
  } catch {
    /* already stopped */
  }
}

/** Play by semitones above C0 (sounding pitch). */
export function playSemitones(semis: number, seconds = 0.9, at = 0, velocity = 1): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  try {
    const f = 440 * 2 ** ((semis - 57) / 12);
    const t0 = c.currentTime + at;
    voices = voices.filter((v) => v.end > c.currentTime);
    while (voices.length >= MAX_VOICES) release(voices.shift()!, t0);
    const gain = c.createGain();
    const peak = 0.28 * velocity;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(peak * 0.55, t0 + 0.25);
    gain.gain.setTargetAtTime(0.0001, t0 + Math.max(0.1, seconds - 0.05), 0.08);
    gain.connect(c.destination);
    const oscs: OscillatorNode[] = [];
    for (const [mult, vol, type] of [[1, 1, "triangle"], [2, 0.18, "sine"], [3, 0.06, "sine"]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.value = vol;
      o.connect(g).connect(gain);
      o.start(t0);
      o.stop(t0 + seconds + 0.5);
      oscs.push(o);
    }
    voices.push({ gain, oscs, end: t0 + seconds + 0.5 });
  } catch {
    /* audio is an enhancement only */
  }
}

/** Play a written pitch such as "F#4" (optionally transposed by sounding semitones). */
export function playPitch(pitch: string, seconds = 0.9, at = 0, transpose = 0): void {
  try {
    playSemitones(semitones(parsePitch(pitch)) + transpose, seconds, at);
  } catch {
    /* ignore unparsable */
  }
}

export function playChord(pitches: string[], seconds = 1.2, at = 0): void {
  pitches.forEach((p) => playPitch(p, seconds, at));
}

/** A melody with equal note lengths (scales, intervals). */
export function playSequence(pitches: string[], gap = 0.55): void {
  stopAll();
  pitches.forEach((p, i) => playPitch(p, Math.min(0.8, gap * 1.4), i * gap));
}

/**
 * Play timed events (from notation): `onStep` is told which event sounds, so the notation can highlight it.
 * Returns a cancel function.
 */
export function playTimed(events: Array<{ at: number; dur: number; semis: number[]; id: string }>, onStep?: (id: string | null) => void): () => void {
  stopAll();
  for (const e of events) for (const s of e.semis) playSemitones(s, Math.max(0.15, e.dur * 0.95), e.at, 0.9);
  if (onStep && typeof window !== "undefined") {
    for (const e of events) timers.push(window.setTimeout(() => onStep(e.id), e.at * 1000));
    const end = Math.max(0, ...events.map((e) => e.at + e.dur));
    timers.push(window.setTimeout(() => onStep(null), end * 1000 + 100));
  }
  return stopAll;
}

export function stopAll(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  const c = ctx;
  if (!c) return;
  for (const v of voices) release(v, c.currentTime);
  voices = [];
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => document.hidden && stopAll());
}

export function cue(kind: "correct" | "wrong" | "done"): void {
  const seq = kind === "correct" ? ["E5", "A5"] : kind === "done" ? ["C5", "E5", "G5", "C6"] : ["E4"];
  seq.forEach((p, i) => playPitch(p, kind === "wrong" ? 0.35 : 0.5, i * 0.12));
}

export { frequency };
