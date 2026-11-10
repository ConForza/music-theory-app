/**
 * Time for progression. Everything learner-facing about "a day" is a calendar date in the learner's timezone
 * (`YYYY-MM-DD`), and all day arithmetic is done on those dates, never by adding 24-hour blocks, so a 23- or 25-hour
 * daylight-saving day is still one day. The server's clock is the only clock: a client can never claim a time.
 */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

/** A clock tests and the browser journeys can move forward; it never goes back. */
export class ManualClock implements Clock {
  constructor(private t: Date = new Date()) {}
  now() {
    return new Date(this.t);
  }
  set(d: Date | string) {
    this.t = new Date(d);
  }
  advanceMs(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
  advanceDays(days: number) {
    this.advanceMs(days * 86_400_000);
  }
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The learner-local calendar date of an instant, e.g. "2026-03-29". */
export function localDate(at: Date, tz: string): string {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
/** Whole calendar days from a to b (b - a). */
export const daysBetween = (a: string, b: string): number => dayNumber(b) - dayNumber(a);
export function addDays(date: string, n: number): string {
  return new Date((dayNumber(date) + n) * 86_400_000).toISOString().slice(0, 10);
}
