/**
 * SQLite-consistent backup, verify and restore (issue #24; staged restore for the student release). See src/db-snapshot.ts.
 *
 *   backup  <db> <dest>   snapshot to a private temporary file, verify, then publish as <dest> (never overwrites)
 *   verify  <file>        integrity_check, foreign_key_check, migrations known and in order, expected tables and columns, row counts
 *   restore <backup> <db> --service-stopped
 *                         verify the backup; stage a copy next to <db>; end every sign-in session in it and erase again every account in
 *                         the erasure log; verify; then swap it in (the old database and its WAL are kept as <db>.before-restore-<time>)
 *
 * The erasure log is MTP_ERASURE_LOG, or `erasures.log` next to <db> if it exists. Restore must only run with the service STOPPED: it
 * would otherwise create a second writer on the same database. After a restore every learner signs in again, and any password reset made
 * since the backup must be made again.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { backupDb, restoreDb, verifyDb, type Verification } from "../src/db-snapshot.ts";
import { createErasureLog } from "../src/erasures.ts";

export { backupDb, restoreDb, verifyDb, type Verification };

function main(argv: string[]): number {
  const [cmd, a, b, flag] = argv;
  const show = (v: Verification) => console.log(v.ok ? `OK: ${v.migrations} migrations, ${v.users} users, integrity ok` : `FAILED: ${v.problems.join("; ")}`);
  try {
    if (cmd === "backup" && a && b) {
      const v = backupDb(a, b);
      show(v);
      return v.ok ? 0 : 1;
    }
    if (cmd === "verify" && a) {
      const v = verifyDb(a);
      show(v);
      return v.ok ? 0 : 1;
    }
    if (cmd === "restore" && a && b) {
      if (flag !== "--service-stopped") throw new Error("restore needs --service-stopped: confirm the service is stopped (two writers corrupt writes).");
      const logFile = process.env.MTP_ERASURE_LOG || join(dirname(b), "erasures.log");
      const log = existsSync(logFile) ? createErasureLog(logFile) : null;
      let erased = 0;
      const v = restoreDb(a, b, { reconcile: (db) => void (erased = log ? log.apply(db) : 0) });
      console.log(`Every sign-in session in the restored copy was ended.${log ? ` ${erased} account(s) deleted after the backup were erased again (${logFile}).` : " No erasure log found."}`);
      show(v);
      return v.ok ? 0 : 1;
    }
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  console.error("Usage: db-backup.ts backup <db> <dest> | verify <file> | restore <backup> <db> --service-stopped");
  return 2;
}

if (process.argv[1]?.endsWith("db-backup.ts")) process.exit(main(process.argv.slice(2)));
