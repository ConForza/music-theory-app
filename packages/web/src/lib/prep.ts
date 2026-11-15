import type { PrepReadiness } from "../api/client";

export const LEVEL_WORDS: Record<string, string> = { mastered: "Right both times", developing: "Developing", needs_review: "Needs review", not_assessed: "Not yet assessed" };
export const MODE_WORDS: Record<"practice" | "mock" | "placement", string> = { practice: "Practice mode", mock: "Mock examination", placement: "Placement check" };
export const READINESS_WORDS: Record<PrepReadiness["label"], string> = { on_track: "Consistently secure", developing: "Developing", needs_review: "Needs review", not_enough_evidence: "Not enough evidence yet" };

/** "54 min", "1 h 5 min": a duration for people, rounded up to the minute. */
export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
/** "12:05": a running clock. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(r).padStart(2, "0")}`;
}
/** Spoken form for assistive technology: "12 minutes 5 seconds". */
export function spokenTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m >= 1 ? `${m} ${m === 1 ? "minute" : "minutes"}${s % 60 ? ` ${s % 60} seconds` : ""}` : `${s} seconds`;
}
export const levelClass = (l: string) => `level-${l.replace("_", "-")}`;
