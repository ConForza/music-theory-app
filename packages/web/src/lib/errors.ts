import { ApiFailure } from "../api/client";

/** True when we cannot tell whether the server acted on the request (no reply, or a server fault after it may have). */
export function isUncertain(e: unknown): boolean {
  return e instanceof ApiFailure && !e.isAborted && (e.status === 0 || e.status >= 500);
}

/** A message for a failed save that says what was NOT saved, and what to do next. */
export function saveFailure(e: unknown, what: string): string {
  if (e instanceof ApiFailure) {
    if (e.status === 0) return `${e.message} ${capital(what)} wasn't saved.`;
    if (e.status >= 500) return `Something went wrong on our side, so ${what} wasn't saved. Please try again.`;
    if (e.status === 401) return `You've been signed out, so ${what} wasn't saved. Please sign in again.`;
    return e.message;
  }
  return `Something went wrong, so ${what} wasn't saved. Please try again.`;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
