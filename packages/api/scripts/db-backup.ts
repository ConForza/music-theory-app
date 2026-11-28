/**
 * SQLite-consistent backup, verify and restore (issue #24). `VACUUM INTO` writes a transactionally consistent snapshot of a live WAL database
 * (no half-written pages, includes committed WAL content) without stopping the service, so it is safe while learners write.
 *
 *   backup  <db> <dest>   snapshot to a new file (refuses to overwrite), then verifies it
 *   verify  <file>        integrity_check, foreign_key_check, all migrations known, row counts
 *   restore <backup> <db> --service-stopped   verify the backup, move the old db aside, copy in, remove stale -wal/-shm, verify
 *
 * Restore must only run with the service STOPPED: it would otherwise create a second writer on the same database.
 */
import { backupDb, restoreDb, verifyDb, type Verification } from "../src/db-snapshot.ts";

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
      const v = restoreDb(a, b);
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
