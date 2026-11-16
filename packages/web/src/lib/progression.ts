import type { ConceptCard } from "../api/client";

export type MasteryState = ConceptCard["state"];

/** Learner-facing words for mastery states. Engagement words (XP, streak) are never used for these. */
export const STATE_LABEL: Record<MasteryState, string> = {
  new: "Not started",
  learning: "Learning",
  practising: "Practising",
  proficient: "Proficient",
  mastered: "Mastered",
  review_due: "Review due",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
};

/** "today", "tomorrow", "in 5 days" or "12 Mar", from two learner-local calendar dates (never from 24-hour maths). */
export function friendlyDate(date: string | null, today: string): string {
  if (!date) return "not scheduled";
  const n = dayNumber(date) - dayNumber(today);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 7) return `in ${n} days`;
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
