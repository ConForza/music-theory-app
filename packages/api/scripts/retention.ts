// Report (and, only with the owner's approval value, apply) session and guest-account housekeeping against a database.
//   npm run retention -w @mtp/api                 dry run: counts only, changes nothing
//   npm run retention -w @mtp/api -- --apply      removes expired sessions; deletes guests only if the policy and approval are both set
// Reads MTP_DB, MTP_GUEST_RETENTION_DAYS and MTP_GUEST_RETENTION_APPROVED. Prints counts and settings, never learner identities.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "../src/db.ts";
import { describeRetention, retentionPolicyFromEnv, runRetention } from "../src/retention.ts";

const apply = process.argv.includes("--apply");
const dbPath = resolve(process.env.MTP_DB ?? resolve(import.meta.dirname, "../data/mtp.sqlite"));
// Never create a database as a side effect of asking about one.
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}. Set MTP_DB to the database file to examine.`);
  process.exit(1);
}
const report = runRetention(openDb(dbPath), retentionPolicyFromEnv(), { dryRun: !apply });
console.log(apply ? describeRetention(report) : `DRY RUN (nothing changed). ${describeRetention(report)}`);
console.log(JSON.stringify(report, null, 2));
