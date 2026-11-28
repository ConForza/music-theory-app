/**
 * SQLite-consistent snapshot, verification and restore, shared by the `db:backup` command and the automatic backups (backups.ts).
 * `VACUUM INTO` writes a transactionally consistent snapshot of a live WAL database (no half-written pages, includes committed WAL content)
 * without stopping the service, so it is safe while learners write. Restore must only run with the service STOPPED.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface Verification {
  ok: boolean;
  problems: string[];
  migrations: number;
  users: number;
}

export function verifyDb(file: string): Verification {
  const problems: string[] = [];
  if (!existsSync(file)) return { ok: false, problems: [`${file} does not exist`], migrations: 0, users: 0 };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = (db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>).map((r) => r.integrity_check);
    if (integrity.join() !== "ok") problems.push(`integrity_check: ${integrity.slice(0, 3).join("; ")}`);
    const fk = db.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) problems.push(`foreign_key_check: ${fk.length} violation(s)`);
    const migrations = (db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }).c;
    const users = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
    if (migrations === 0) problems.push("no migrations recorded");
    return { ok: problems.length === 0, problems, migrations, users };
  } catch (e) {
    return { ok: false, problems: [(e as Error).message], migrations: 0, users: 0 };
  } finally {
    db.close();
  }
}

export function backupDb(src: string, dest: string): Verification {
  if (existsSync(dest)) throw new Error(`${dest} already exists; refusing to overwrite a backup.`);
  mkdirSync(dirname(dest), { recursive: true });
  const db = new DatabaseSync(src, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  return verifyDb(dest);
}

export function restoreDb(backup: string, target: string): Verification {
  const v = verifyDb(backup);
  if (!v.ok) throw new Error(`Backup failed verification, nothing changed: ${v.problems.join("; ")}`);
  if (existsSync(target)) renameSync(target, `${target}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  for (const ext of ["-wal", "-shm"]) rmSync(`${target}${ext}`, { force: true });
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(backup, target);
  return verifyDb(target);
}
