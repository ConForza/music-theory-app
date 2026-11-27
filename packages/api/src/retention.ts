/**
 * Housekeeping for sessions and guest accounts (final release hardening, audit #19 P2-3).
 *
 * Two different things, deliberately kept apart:
 *
 *  1. EXPIRED SESSIONS are always safe to remove: an expired session can no longer sign anyone in, and removing it deletes no learner data.
 *     This runs at start-up and once a day.
 *
 *  2. INACTIVE GUEST ACCOUNTS hold a learner's progress. Deleting them is a RETENTION POLICY, which the owner has not decided. Nothing here
 *     chooses a period: with no configuration the guest step does nothing at all; with a period but without the explicit approval value it
 *     only COUNTS what would be deleted (dry run). See docs/PRIVACY_PLAN.md, "Owner decisions required".
 *
 * Logs and results contain counts and the settings used, never user ids, names or email addresses.
 */
import type { Db } from "./db.ts";
import { tx } from "./db.ts";

/** The exact value `MTP_GUEST_RETENTION_APPROVED` must have before any guest account is deleted. Anything else (including "true" or "1") is a dry run. */
export const GUEST_DELETION_APPROVAL = "owner-approved";
/** No single run deletes more guest accounts than this, so a wrong setting cannot empty the table in one pass. */
export const MAX_GUEST_DELETIONS_PER_RUN = 500;

export interface RetentionPolicy {
  /** Days since a guest was last seen before the account is eligible. null: no period chosen, the guest step is skipped entirely. */
  guestInactiveDays: number | null;
  /** True only when the owner's approval value is set: eligible guests are deleted. False: they are only counted. */
  deleteGuests: boolean;
  /** Set when the configuration was unusable; the guest step is then skipped and this says why. */
  problem?: string;
}

/** Read the policy from the environment. Never invents a period and never enables deletion by default. */
export function retentionPolicyFromEnv(env: Record<string, string | undefined> = process.env): RetentionPolicy {
  const raw = env.MTP_GUEST_RETENTION_DAYS;
  const approved = env.MTP_GUEST_RETENTION_APPROVED === GUEST_DELETION_APPROVAL;
  if (raw === undefined || raw === "") {
    return { guestInactiveDays: null, deleteGuests: false, ...(approved ? { problem: "MTP_GUEST_RETENTION_APPROVED is set but no MTP_GUEST_RETENTION_DAYS was chosen; nothing will be deleted." } : {}) };
  }
  if (!/^\d{1,5}$/.test(raw) || Number(raw) < 1) return { guestInactiveDays: null, deleteGuests: false, problem: "MTP_GUEST_RETENTION_DAYS must be a whole number of days, 1 or more; nothing will be deleted." };
  return { guestInactiveDays: Number(raw), deleteGuests: approved };
}

export interface RetentionReport {
  at: string;
  /** Sessions past their expiry when the run started. */
  expiredSessionsFound: number;
  /** How many of them were removed (0 in a dry run). */
  expiredSessionsRemoved: number;
  /** Expired private-preview sessions removed (they can never be used again and hold no learner data). */
  expiredPreviewSessionsRemoved: number;
  guests: {
    /** "off": no period configured. "dry-run": counted only. "delete": eligible accounts were deleted. */
    mode: "off" | "dry-run" | "delete";
    inactiveDays: number | null;
    /** Guest accounts with no usable sign-in that have been inactive for the whole period. */
    eligible: number;
    deleted: number;
    /** Eligible accounts left for a later run because of MAX_GUEST_DELETIONS_PER_RUN. */
    deferred: number;
  };
  problem?: string;
}

/**
 * An account is eligible ONLY if every one of these holds (the SQL repeats them all, so no caller can loosen one by accident):
 *  - it is a guest (`is_guest = 1`), with no email and no password: a registered learner can never match;
 *  - it has no session that could still sign it in (an unexpired session means the learner can still come back);
 *  - it was last seen before the cutoff, and was created before the cutoff.
 */
const ELIGIBLE = `FROM users u
  WHERE u.is_guest = 1 AND u.email IS NULL AND u.password_hash IS NULL
    AND u.last_seen_at < ? AND u.created_at < ?
    AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?)`;

export function runRetention(db: Db, policy: RetentionPolicy, opts: { now?: Date; dryRun?: boolean } = {}): RetentionReport {
  const now = opts.now ?? new Date();
  const iso = now.toISOString();
  const dryRun = opts.dryRun ?? false;
  const expired = (db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE expires_at <= ?").get(iso) as { c: number }).c;
  if (!dryRun && expired > 0) db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(iso);
  const previewRemoved = dryRun ? 0 : Number(db.prepare("DELETE FROM preview_sessions WHERE expires_at <= ?").run(iso).changes);

  const report: RetentionReport = { at: iso, expiredSessionsFound: expired, expiredSessionsRemoved: dryRun ? 0 : expired, expiredPreviewSessionsRemoved: previewRemoved, guests: { mode: "off", inactiveDays: policy.guestInactiveDays, eligible: 0, deleted: 0, deferred: 0 }, ...(policy.problem ? { problem: policy.problem } : {}) };
  const days = policy.guestInactiveDays;
  if (days === null || !Number.isInteger(days) || days < 1) return report;

  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString();
  const eligible = (db.prepare(`SELECT COUNT(*) AS c ${ELIGIBLE}`).get(cutoff, cutoff, iso) as { c: number }).c;
  report.guests.eligible = eligible;
  const willDelete = policy.deleteGuests && !dryRun;
  report.guests.mode = willDelete ? "delete" : "dry-run";
  if (!willDelete || eligible === 0) return report;

  // One transaction; the same conditions are applied again inside the DELETE. Linked learning records go with the account through the
  // ON DELETE CASCADE foreign keys every learner table declares (foreign keys are switched on in openDb).
  const deleted = tx(db, () => {
    const res = db.prepare(`DELETE FROM users WHERE id IN (SELECT u.id ${ELIGIBLE} ORDER BY u.last_seen_at LIMIT ?)`).run(cutoff, cutoff, iso, MAX_GUEST_DELETIONS_PER_RUN);
    return Number(res.changes);
  });
  report.guests.deleted = deleted;
  report.guests.deferred = Math.max(0, eligible - deleted);
  return report;
}

/** One line for the server log: settings and counts only. */
export function describeRetention(r: RetentionReport): string {
  const g = r.guests;
  const guest =
    g.mode === "off"
      ? "guest accounts: no retention period configured, none examined"
      : g.mode === "dry-run"
        ? `guest accounts: DRY RUN, ${g.eligible} inactive for ${g.inactiveDays} days would be deleted (none were)`
        : `guest accounts: ${g.deleted} inactive for ${g.inactiveDays} days deleted${g.deferred ? `, ${g.deferred} left for the next run` : ""}`;
  return `Retention: ${r.expiredSessionsRemoved} of ${r.expiredSessionsFound} expired sessions removed${r.expiredPreviewSessionsRemoved ? `, ${r.expiredPreviewSessionsRemoved} expired preview sessions removed` : ""}; ${guest}${r.problem ? `; WARNING: ${r.problem}` : ""}`;
}
