import { Link } from "react-router";
import type { Me } from "../api/client";
import { Icon } from "./Icon";

/** "on 3 March" in the learner's own locale; empty if the date is missing or unreadable. */
export function friendlyEndDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/** Whole days of guest access left, or null when the learner is not a guest or the server did not say. */
export function guestDaysLeft(me: Me | null | undefined): number | null {
  if (!me?.user.isGuest) return null;
  return me.session?.guestAccessEndsInDays ?? null;
}

/**
 * Shown on the main pages to a GUEST whose access on this device is about to end. A guest's progress can only be reached from this
 * browser while they stay signed in; registering is their choice, so the wording offers it and never demands it.
 */
export function GuestExpiryNotice({ me }: { me: Me | null | undefined }) {
  const days = guestDaysLeft(me);
  if (days === null || days > (me?.session?.guestWarningDays ?? 14)) return null;
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const date = friendlyEndDate(me?.session?.expiresAt);
  return (
    <aside className="card callout guest-notice" role="status" aria-label="Guest access ending soon">
      <p>
        <Icon name="info" size={20} /> <strong>Your guest access on this device ends {when}{date && days > 1 ? ` (${date})` : ""}.</strong> After that you won't be able to get back to the progress you've made as a guest. If you'd like to keep it, create a free account: everything you've done comes with you.
      </p>
      <p><Link className="btn btn-primary" to="/profile">Keep my progress</Link></p>
    </aside>
  );
}
