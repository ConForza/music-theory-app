/**
 * SQLite-consistent snapshot, verification and restore, shared by the `db:backup` command and the automatic backups (backups.ts).
 *
 * - backup: `VACUUM INTO` a PRIVATE temporary file next to the destination (a transactionally consistent snapshot of a live WAL database,
 *   safe while learners write), flush it to disk, verify it, and only then publish it under its final name with a hard link, which is
 *   atomic and never overwrites. An interrupted backup therefore never leaves a file under a backup's name.
 * - verify: integrity, foreign keys, every recorded migration known to this code, and the tables and columns those migrations create.
 * - restore: stage a copy next to the target, verify it, then swap it in (the old database and its WAL are kept aside), and reconcile
 *   what happened since the backup was taken: every sign-in session is ended (the backup may hold sessions revoked since) and erased
 *   accounts are erased again (erasures.ts). Must only run with the service STOPPED: it would otherwise create a second writer.
 */
import { closeSync, copyFileSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS_DIR, migrationFiles } from "./db.ts";

export interface Verification {
  ok: boolean;
  problems: string[];
  migrations: number;
  users: number;
}

/** Temporary files this module owns: never matched by a backup name, and removed by `removeStaleTemporaries`. */
export const TEMP_PREFIX = ".mtp-partial-";
const tempNextTo = (file: string) => join(dirname(file), `${TEMP_PREFIX}${basename(file)}-${process.pid}-${randomBytes(6).toString("hex")}`);

/** Remove this module's leftover temporary files in a directory (from an interrupted backup or restore). Returns how many. */
export function removeStaleTemporaries(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (f.startsWith(TEMP_PREFIX)) {
      rmSync(join(dir, f), { force: true });
      n++;
    }
  }
  return n;
}

function flush(file: string) {
  const fd = openSync(file, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Tables and their columns as created by exactly these migrations, built in memory. Cached per migration set. */
const schemaCache = new Map<string, Map<string, Set<string>>>();
function schemaOf(db: DatabaseSync): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>) {
    out.set(name, new Set((db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all() as Array<{ name: string }>).map((c) => c.name)));
  }
  return out;
}
function expectedSchema(applied: string[]): Map<string, Set<string>> {
  const key = applied.join(",");
  const hit = schemaCache.get(key);
  if (hit) return hit;
  const mem = new DatabaseSync(":memory:");
  try {
    mem.exec("PRAGMA foreign_keys = ON;");
    mem.exec("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const f of applied) mem.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    const s = schemaOf(mem);
    schemaCache.set(key, s);
    return s;
  } finally {
    mem.close();
  }
}

export function verifyDb(file: string): Verification {
  const problems: string[] = [];
  if (!existsSync(file)) return { ok: false, problems: [`${file} does not exist`], migrations: 0, users: 0 };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const integrity = (db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>).map((r) => r.integrity_check);
    if (integrity.join() !== "ok") problems.push(`integrity_check: ${integrity.slice(0, 3).join("; ")}`);
    const fk = db.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) problems.push(`foreign_key_check: ${fk.length} violation(s)`);
    const applied = (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: string }>).map((r) => r.version);
    if (applied.length === 0) problems.push("no migrations recorded");
    const known = migrationFiles(MIGRATIONS_DIR);
    const unknown = applied.filter((v) => !known.includes(v));
    if (unknown.length) problems.push(`migrations this code does not know: ${unknown.join(", ")}`);
    const gap = known.slice(0, applied.length).filter((v, i) => applied[i] !== v);
    if (!unknown.length && gap.length) problems.push(`migrations applied out of order or with gaps: expected ${known.slice(0, applied.length).join(", ")}`);
    if (!unknown.length) {
      const actual = schemaOf(db);
      for (const [table, cols] of expectedSchema(applied)) {
        const got = actual.get(table);
        if (!got) problems.push(`missing table ${table}`);
        else for (const c of cols) if (!got.has(c)) problems.push(`missing column ${table}.${c}`);
      }
    }
    const users = have(db, "users") ? (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c : 0;
    return { ok: problems.length === 0, problems, migrations: applied.length, users };
  } catch (e) {
    return { ok: false, problems: [...problems, (e as Error).message], migrations: 0, users: 0 };
  } finally {
    db?.close();
  }
}
const have = (db: DatabaseSync, table: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

/** Snapshot `src` to `dest`, publishing `dest` only once the snapshot is on disk and verified. Never overwrites. */
export function backupDb(src: string, dest: string): Verification {
  if (existsSync(dest)) throw new Error(`${dest} already exists; refusing to overwrite a backup.`);
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = tempNextTo(dest);
  try {
    const db = new DatabaseSync(src, { readOnly: true });
    try {
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }
    flush(tmp);
    const v = verifyDb(tmp);
    if (!v.ok) return v;
    linkSync(tmp, dest); // atomic, and fails rather than replacing an existing file
    return v;
  } finally {
    rmSync(tmp, { force: true });
  }
}

export interface RestoreOptions {
  /** Called on the restored database before it is put in place, e.g. to re-apply erasures made after the backup. */
  reconcile?: (db: DatabaseSync) => void;
  now?: Date;
  /** Keep the replaced database as <target>.before-restore-<time> (default). False when the caller already holds a verified copy of it. */
  keepAside?: boolean;
}

/**
 * Replace `target` with a verified copy of `backup`. Nothing at `target` changes until the copy is staged, reconciled and verified; the
 * previous database (with its -wal/-shm) is moved to `<target>.before-restore-<time>`.
 */
export function restoreDb(backup: string, target: string, o: RestoreOptions = {}): Verification {
  const v = verifyDb(backup);
  if (!v.ok) throw new Error(`Backup failed verification, nothing changed: ${v.problems.join("; ")}`);
  mkdirSync(dirname(target), { recursive: true });
  const staged = tempNextTo(target);
  try {
    copyFileSync(backup, staged);
    const db = new DatabaseSync(staged);
    try {
      db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;");
      // Sessions in the backup may have been revoked since (sign-out, password reset, deletion): end them all. Everyone signs in again.
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec("DELETE FROM sessions");
        if (have(db, "preview_sessions")) db.exec("DELETE FROM preview_sessions");
        o.reconcile?.(db);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } finally {
      db.close();
    }
    flush(staged);
    const sv = verifyDb(staged);
    if (!sv.ok) throw new Error(`The staged copy failed verification, nothing changed: ${sv.problems.join("; ")}`);
    const aside = `${target}.before-restore-${(o.now ?? new Date()).toISOString().replace(/[:.]/g, "-")}`;
    if (existsSync(target) && o.keepAside !== false) {
      renameSync(target, aside);
      for (const ext of ["-wal", "-shm"]) if (existsSync(`${target}${ext}`)) renameSync(`${target}${ext}`, `${aside}${ext}`);
    } else {
      for (const ext of ["-wal", "-shm"]) rmSync(`${target}${ext}`, { force: true });
    }
    renameSync(staged, target);
    return verifyDb(target);
  } finally {
    rmSync(staged, { force: true });
  }
}
