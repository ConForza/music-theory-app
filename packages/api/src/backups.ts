/**
 * Automatic database snapshots (student release). The app takes them itself:
 *
 *  - PRE-MIGRATION: at start-up, BEFORE the database is opened, if the new code would apply any migration, a snapshot is taken and
 *    verified. If that fails the process refuses to start (it never migrates learner data without a verified copy to go back to).
 *  - READINESS: at start-up the backup directory must be writable, and a daily snapshot is taken if one is due, BEFORE the server
 *    listens. If either fails the process refuses to start, so a deployment with backups configured never serves without working backups.
 *  - DAILY: while running, an hourly check takes a snapshot when the newest daily one is at least 23 hours old. A failure is logged as an
 *    error every hour until a snapshot succeeds.
 *
 * Every snapshot is published only once it is on disk and verified (db-snapshot.ts), so an interrupted backup never leaves a file under
 * a backup's name, and expiry runs only after that. Names carry the time to the millisecond and are unique, so they sort by time.
 *
 * RETENTION is strict: every snapshot older than `keep` days (MTP_BACKUP_KEEP, default 14) is deleted at the next hourly check, whatever
 * its kind. That is what bounds how long a deleted account survives in a backup, as the privacy notice states. (If daily backups keep
 * failing for `keep` days, the copies age out: the hourly error lines are the alarm.) Each kind also keeps at most `keep` files.
 *
 * All of this runs synchronously in the one app process (VACUUM INTO blocks the event loop briefly), so snapshots and expiry never
 * interleave. Off by default: set MTP_BACKUP_DIR (on Railway `/data/backups`). Snapshots on the same volume protect against mistakes, NOT
 * against losing the volume: see docs/release/STUDENT_RELEASE.md for the independent copy.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import { pendingMigrations } from "./db.ts";
import { backupDb, removeStaleTemporaries, restoreDb } from "./db-snapshot.ts";
import type { ErasureLog } from "./erasures.ts";

export type SnapshotKind = "premigration" | "daily" | "prerestore";
const KINDS: SnapshotKind[] = ["premigration", "daily", "prerestore"];

export interface BackupSettings {
  dir: string;
  keep: number;
}

export const DEFAULT_BACKUP_KEEP = 14;

/** Settings from the environment, or null when automatic backups are off. Throws on a malformed value (start-up should fail loudly). */
export function backupSettingsFromEnv(env: Record<string, string | undefined>): BackupSettings | null {
  const dir = env.MTP_BACKUP_DIR?.trim();
  if (!dir) return null;
  if (!dir.startsWith("/")) throw new Error(`MTP_BACKUP_DIR must be an absolute path (got "${dir}").`);
  const raw = env.MTP_BACKUP_KEEP?.trim();
  if (raw && !/^[1-9]\d{0,2}$/.test(raw)) throw new Error(`MTP_BACKUP_KEEP must be a whole number from 1 to 999 (got "${raw}").`);
  return { dir: dir.replace(/\/+$/, ""), keep: raw ? Number(raw) : DEFAULT_BACKUP_KEEP };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:.]/g, ""); // 20261128T101500123Z
const pattern = (kind: SnapshotKind) => new RegExp(`^mtp-${kind}-(\\d{8}T\\d{9}Z)\\.sqlite$`);

/** This kind's snapshot files, oldest first (the names sort by time). */
export function listSnapshots(dir: string, kind: SnapshotKind): string[] {
  if (!existsSync(dir)) return [];
  const re = pattern(kind);
  return readdirSync(dir).filter((f) => re.test(f)).sort();
}

function timeOf(file: string, kind: SnapshotKind): Date | null {
  const m = pattern(kind).exec(file);
  if (!m) return null;
  const s = m[1]!;
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(15, 18)}Z`);
}

/** Proves the directory exists and accepts a durable write. Throws with the reason otherwise. */
export function assertWritable(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.mtp-partial-probe-${process.pid}`);
    const fd = openSync(probe, "w");
    try {
      writeSync(fd, "ok");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
      rmSync(probe, { force: true });
    }
  } catch (e) {
    throw new Error(`The backup directory ${dir} is not writable: ${(e as Error).message}`, { cause: e });
  }
}

export interface SnapshotResult {
  file: string;
  users: number;
  migrations: number;
  removed: string[];
}

/** Take and publish one verified snapshot, then trim this kind to `keep` files. Throws, leaving every earlier snapshot, on failure. */
export function takeSnapshot(dbPath: string, s: BackupSettings, kind: SnapshotKind, now = new Date()): SnapshotResult {
  mkdirSync(s.dir, { recursive: true });
  removeStaleTemporaries(s.dir);
  let at = now.getTime();
  while (existsSync(join(s.dir, `mtp-${kind}-${stamp(new Date(at))}.sqlite`))) at++;
  const file = join(s.dir, `mtp-${kind}-${stamp(new Date(at))}.sqlite`);
  let v;
  try {
    v = backupDb(dbPath, file);
  } catch (e) {
    throw new Error(`Automatic ${kind} backup failed: ${(e as Error).message}`, { cause: e });
  }
  if (!v.ok) throw new Error(`Automatic ${kind} backup did not verify and was not kept: ${v.problems.join("; ")}`);
  const all = listSnapshots(s.dir, kind);
  const removed = all.slice(0, Math.max(0, all.length - s.keep));
  for (const f of removed) rmSync(join(s.dir, f), { force: true });
  return { file, users: v.users, migrations: v.migrations, removed };
}

/**
 * Call BEFORE opening the database. Checks the directory is writable, then snapshots if a migration is pending. Returns a log line, or
 * null when there was nothing to snapshot. Throws when backups cannot work: the caller must not go on to migrate or serve.
 */
export function backupBeforeMigrations(dbPath: string, s: BackupSettings | null, now = new Date()): string | null {
  if (!s) return null;
  assertWritable(s.dir);
  const pending = pendingMigrations(dbPath);
  if (pending.length === 0) return null;
  const r = takeSnapshot(dbPath, s, "premigration", now);
  return `Pre-migration backup ${r.file} verified (${r.users} users, ${r.migrations} migrations) before applying ${pending.join(", ")}.`;
}

/** Delete every snapshot older than `keep` days. Returns the files removed. */
export function pruneExpired(s: BackupSettings, now = new Date()): string[] {
  const removed: string[] = [];
  for (const kind of KINDS) {
    for (const f of listSnapshots(s.dir, kind)) {
      const at = timeOf(f, kind);
      if (at && now.getTime() - at.getTime() > s.keep * 86400_000) {
        rmSync(join(s.dir, f), { force: true });
        removed.push(f);
      }
    }
  }
  return removed;
}

/**
 * The hourly check (and the start-up readiness check): takes a daily snapshot if the newest is missing or at least 23 hours old, then
 * deletes expired snapshots. Returns a log line, or null when nothing happened. Throws if a due snapshot fails (expiry still runs).
 */
export function dailyBackupIfDue(dbPath: string, s: BackupSettings, now = new Date()): string | null {
  const newest = listSnapshots(s.dir, "daily").at(-1);
  const at = newest ? timeOf(newest, "daily") : null;
  let taken: SnapshotResult | null = null;
  let failure: unknown = null;
  if (!at || now.getTime() - at.getTime() >= 23 * 3600_000) {
    try {
      taken = takeSnapshot(dbPath, s, "daily", now);
    } catch (e) {
      failure = e;
    }
  }
  // Retention is a promise to learners, so it runs even when the snapshot failed.
  const expired = pruneExpired(s, now);
  if (failure) throw failure;
  const note = expired.length ? ` Removed ${expired.length} backup(s) older than ${s.keep} days.` : "";
  if (!taken) return note ? note.trim() : null;
  return `Daily backup ${taken.file} verified (${taken.users} users).${taken.removed.length ? ` Removed ${taken.removed.length} older daily backup(s).` : ""}${note}`;
}

/**
 * One-shot restore at start-up (MTP_RESTORE_FROM=<file name in the backup directory>). On Railway the Console only works while the app is
 * running and writing, so this is the supported way to restore: set the variable and redeploy. BEFORE the database is opened (so no
 * other writer exists), the current database is snapshotted ("prerestore", kept under the normal retention), the backup is restored with
 * every session ended and logged erasures re-applied, and a marker records it. With the marker present the same backup is never restored
 * again, so leaving the variable set after a restart is harmless (it is logged as a reminder to remove it). Throws on any failure, leaving
 * the current database in place.
 */
export function restoreAtStartup(dbPath: string, s: BackupSettings | null, fileName: string | undefined, erasures: ErasureLog | null, now = new Date()): string | null {
  const name = fileName?.trim();
  if (!name) return null;
  if (!s) throw new Error("MTP_RESTORE_FROM needs automatic backups (MTP_BACKUP_DIR): it restores a file from that directory.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.sqlite$/.test(name)) throw new Error(`MTP_RESTORE_FROM must be the file name of a backup in ${s.dir} (got "${name}").`);
  const source = join(s.dir, name);
  if (!existsSync(source)) throw new Error(`MTP_RESTORE_FROM: ${source} does not exist.`);
  const marker = join(s.dir, `restored-${name}.done`);
  if (existsSync(marker)) return `MTP_RESTORE_FROM=${name} was already restored (${marker}); nothing restored this time. Remove the variable.`;
  const safety = existsSync(dbPath) ? takeSnapshot(dbPath, s, "prerestore", now).file : null;
  let erased = 0;
  const v = restoreDb(source, dbPath, { now, keepAside: false, reconcile: (db) => void (erased = erasures ? erasures.apply(db) : 0) });
  if (!v.ok) throw new Error(`The restored database failed verification: ${v.problems.join("; ")}`);
  const fd = openSync(marker, "w");
  try {
    writeSync(fd, `${now.toISOString()} restored ${name}${safety ? `; the database before it is ${safety}` : ""}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return `RESTORED ${name} (${v.users} users)${safety ? `; the database as it was is saved as ${safety}` : ""}. Every sign-in session ended; ${erased} account(s) deleted after the backup erased again. Remove MTP_RESTORE_FROM now.`;
}
