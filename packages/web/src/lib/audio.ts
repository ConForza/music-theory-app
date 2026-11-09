import { frequency, parsePitch } from "./music";

let ctx: AudioContext | undefined;
let enabled = true;

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};

function context(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A soft, short piano-ish tone. Must be called from a user gesture (iOS). Silent when sound is off or unsupported. */
export function playPitch(pitch: string, seconds = 0.9, at = 0): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  try {
    const f = frequency(parsePitch(pitch));
    const t0 = c.currentTime + at;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    gain.connect(c.destination);
    for (const [mult, vol] of [[1, 1], [2, 0.25]] as const) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.value = vol;
      o.connect(g).connect(gain);
      o.start(t0);
      o.stop(t0 + seconds + 0.05);
    }
  } catch {
    /* audio is an enhancement only */
  }
}

export function playSequence(pitches: string[], gap = 0.55): void {
  pitches.forEach((p, i) => playPitch(p, 0.8, i * gap));
}

export function cue(kind: "correct" | "wrong" | "done"): void {
  const seq = kind === "correct" ? ["E5", "A5"] : kind === "done" ? ["C5", "E5", "G5", "C6"] : ["E4"];
  seq.forEach((p, i) => playPitch(p, kind === "wrong" ? 0.35 : 0.5, i * 0.12));
}
