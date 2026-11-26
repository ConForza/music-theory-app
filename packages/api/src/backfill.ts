import type { Clock } from "./clock.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { recordExposure } from "./mastery-service.ts";
import type { PracticeService } from "./practice.ts";
import type { Course } from "./course.ts";
import { visibleKey } from "./question-key.ts";

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

export const VISIBLE_IDENTITY_BACKFILL = "visible-identity-for-help-records";

/**
 * Review of PR #26 (P1). Help recorded before migration 011 has only the historical `question_key`, which for older templates keeps the
 * option order and a sampled worked solution, so the same question with its options reordered was not recognised as already seen with help.
 * Fill `visible_key` where the question can still be reproduced exactly:
 *   - practice-lab exposures (the item id regenerates the question; fixed demonstration items are looked up);
 *   - supported lesson evidence (`guided-step`, `hinted-step`, `retry-after-reveal`, `remedial-step` on authored lesson items).
 * Generated questions recorded elsewhere before this change (unit practice hints, practice-exam feedback, review remediation) keep matching by
 * their exact identity, as before; they cannot be regenerated without the run's scope, and are listed in the marker's detail.
 * Then, as the earlier backfill did, restore the exclusion on any evidence row still "fresh" although the learner had met the question with help
 * strictly earlier under its visible identity. Run once per database, idempotent, never touches legitimate credit.
 */
export function backfillVisibleIdentity(db: Db, course: Course, practice: PracticeService, clock: Clock): { ran: boolean; exposures: number; evidence: number; skipped: number } {
  if (db.prepare("SELECT 1 FROM data_backfills WHERE name = ?").get(VISIBLE_IDENTITY_BACKFILL)) return { ran: false, exposures: 0, evidence: 0, skipped: 0 };
  let exposures = 0;
  let evidence = 0;
  let skipped = 0;
  tx(db, () => {
    const byKey = new Map<string, string | null>(); // practice item id -> visible identity
    const visibleOfPractice = (itemId: string) => {
      if (!byKey.has(itemId)) {
        try {
          byKey.set(itemId, visibleKey(practice.resolve(itemId).item));
        } catch {
          byKey.set(itemId, null);
        }
      }
      return byKey.get(itemId)!;
    };
    const setExposure = db.prepare("UPDATE question_exposure SET visible_key = ? WHERE user_id = ? AND question_key = ? AND visible_key IS NULL");
    for (const sql of ["SELECT DISTINCT user_id, item_id FROM practice_attempts", "SELECT DISTINCT user_id, item_id FROM practice_hint_uses"]) {
      for (const r of db.prepare(sql).all() as Array<{ user_id: string; item_id: string }>) {
        const v = visibleOfPractice(r.item_id);
        const k = practice.questionKeyOf(r.item_id);
        if (!v || !k) {
          skipped++;
          continue;
        }
        exposures += Number(setExposure.run(v, r.user_id, k).changes);
      }
    }
    const setEvidence = db.prepare("UPDATE mastery_evidence SET visible_key = ? WHERE user_id = ? AND id = ? AND visible_key IS NULL");
    const rows = db.prepare("SELECT user_id, id, node_id, item_id FROM mastery_evidence WHERE visible_key IS NULL AND source IN ('guided-step','hinted-step','retry-after-reveal','remedial-step')").all() as Array<{ user_id: string; id: string; node_id: string | null; item_id: string }>;
    for (const r of rows) {
      const item = r.node_id ? course.authoredItems(r.node_id).find((i) => i.id === r.item_id) : undefined;
      if (!item) {
        skipped++;
        continue;
      }
      evidence += Number(setEvidence.run(visibleKey(item), r.user_id, r.id).changes);
    }
    db.exec(`UPDATE mastery_evidence SET fresh = 0
             WHERE fresh = 1 AND visible_key IS NOT NULL AND EXISTS (
               SELECT 1 FROM question_exposure x WHERE x.user_id = mastery_evidence.user_id AND x.visible_key = mastery_evidence.visible_key AND x.occurred_at < mastery_evidence.occurred_at)`);
    db.prepare("INSERT INTO data_backfills (name, applied_at, detail) VALUES (?,?,?)").run(VISIBLE_IDENTITY_BACKFILL, clock.now().toISOString(), JSON.stringify({ exposures, evidence, skipped }));
  });
  return { ran: true, exposures, evidence, skipped };
}
