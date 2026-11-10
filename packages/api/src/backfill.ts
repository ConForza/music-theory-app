import type { Clock } from "./clock.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { recordExposure } from "./mastery-service.ts";
import type { PracticeService } from "./practice.ts";

export const PRACTICE_EXPOSURE_BACKFILL = "practice-exposure-from-brief-03-history";

/**
 * Practice answered or hinted before exposure tracking existed (Brief 03 databases, and any database upgraded before this ran)
 * left attempts and hints but no exposure identities, so a question already met with support could earn fresh credit in review.
 * Resolve each historical practice item to its question identity and record the exposure, then restore the exclusion on any
 * evidence row that is still "fresh" although the learner had met the question strictly earlier.
 *
 * Application-level (SQL cannot regenerate a question), run once per database (marker in `data_backfills`), idempotent, and
 * conservative: items whose generator has since changed cannot be resolved and are skipped (reported in the marker's detail);
 * existing legitimate credit (independent answer first, practice later) is never touched.
 */
export function backfillPracticeExposure(db: Db, practice: PracticeService, clock: Clock): { ran: boolean; resolved: number; skipped: number } {
  if (db.prepare("SELECT 1 FROM data_backfills WHERE name = ?").get(PRACTICE_EXPOSURE_BACKFILL)) return { ran: false, resolved: 0, skipped: 0 };
  let resolved = 0;
  let skipped = 0;
  tx(db, () => {
    const sources: Array<["practice-attempt" | "practice-hint", string]> = [
      ["practice-attempt", "SELECT user_id, item_id, MIN(created_at) AS at FROM practice_attempts GROUP BY user_id, item_id"],
      ["practice-hint", "SELECT user_id, item_id, MIN(created_at) AS at FROM practice_hint_uses GROUP BY user_id, item_id"],
    ];
    const keys = new Map<string, string | null>(); // item id -> identity (resolved once per item)
    for (const [source, sql] of sources) {
      for (const r of db.prepare(sql).all() as Array<{ user_id: string; item_id: string; at: string }>) {
        if (!keys.has(r.item_id)) keys.set(r.item_id, practice.questionKeyOf(r.item_id));
        const key = keys.get(r.item_id);
        if (!key) {
          skipped++;
          continue;
        }
        recordExposure(db, r.user_id, key, source, r.at);
        resolved++;
      }
    }
    db.exec(`UPDATE mastery_evidence SET fresh = 0
             WHERE fresh = 1 AND EXISTS (SELECT 1 FROM question_exposure x WHERE x.user_id = mastery_evidence.user_id AND x.question_key = mastery_evidence.question_key AND x.occurred_at < mastery_evidence.occurred_at)`);
    db.prepare("INSERT INTO data_backfills (name, applied_at, detail) VALUES (?,?,?)").run(PRACTICE_EXPOSURE_BACKFILL, clock.now().toISOString(), JSON.stringify({ resolved, skipped }));
  });
  return { ran: true, resolved, skipped };
}
