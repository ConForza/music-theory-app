/**
 * Automatic database snapshots (student release). Until now every backup was a manual Console step; for a release that real students
 * rely on, the app takes them itself:
 *
 *  - PRE-MIGRATION: at start-up, BEFORE the database is opened, if the new code would apply any migration, a snapshot is taken and
 *    verified. If that fails the process refuses to start (it never migrates learner data without a verified copy to go back to).
 *  - DAILY: while running, an hourly check takes a snapshot when the newest daily one is older than 23 hours (so restarts never skip
 *    a day, and never take more than one a day).
 *
 * Each kind keeps at most its newest `keep` files (MTP_BACKUP_KEEP, default 14), and any snapshot older than `keep` days is deleted at the
 * next hourly check, except the newest of each kind (so a run of failed daily backups can never age every copy away). This bounds how long
 * a deleted account survives in a backup, which the privacy notice states. Snapshots use the same `VACUUM INTO`
 * routine as `npm run db:backup` and are verified (integrity, foreign keys, migrations); a snapshot that fails verification is deleted
 * and reported, never counted as a backup.
 *
 * Off by default: set MTP_BACKUP_DIR (on Railway `/data/backups`). Snapshots on the same volume protect against mistakes (a bad
 * migration, a bad release), NOT against losing the volume: see docs/release/STUDENT_RELEASE.md for the off-site copy.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pendingMigrations } from "./db.ts";
import { backupDb } from "./db-snapshot.ts";

export type SnapshotKind = "premigration" | "daily";

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

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); // 20261128T101500Z
const pattern = (kind: SnapshotKind) => new RegExp(`^mtp-${kind}-(\\d{8}T\\d{6}Z)(?:-\\d+)?\\.sqlite$`);

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
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);
}

export interface SnapshotResult {
  file: string;
  users: number;
  migrations: number;
  removed: string[];
}

/** Take, verify and rotate one snapshot. Throws (after deleting the bad file) if the snapshot does not verify. */
export function takeSnapshot(dbPath: string, s: BackupSettings, kind: SnapshotKind, now = new Date()): SnapshotResult {
  mkdirSync(s.dir, { recursive: true });
  let name = `mtp-${kind}-${stamp(now)}.sqlite`;
  for (let i = 2; existsSync(join(s.dir, name)); i++) name = `mtp-${kind}-${stamp(now)}-${i}.sqlite`;
  const file = join(s.dir, name);
  let v;
  try {
    v = backupDb(dbPath, file);
  } catch (e) {
    rmSync(file, { force: true });
    throw new Error(`Automatic ${kind} backup failed: ${(e as Error).message}`, { cause: e });
  }
  if (!v.ok) {
    rmSync(file, { force: true });
    throw new Error(`Automatic ${kind} backup did not verify and was deleted: ${v.problems.join("; ")}`);
  }
  const all = listSnapshots(s.dir, kind);
  const removed = all.slice(0, Math.max(0, all.length - s.keep));
  for (const f of removed) rmSync(join(s.dir, f), { force: true });
  return { file, users: v.users, migrations: v.migrations, removed };
}

/**
 * Call BEFORE opening the database. Returns a log line, or null when there is nothing to do (backups off, a new database, or no pending
 * migration). Throws when a snapshot was needed and could not be made: the caller must not go on to migrate.
 */
export function backupBeforeMigrations(dbPath: string, s: BackupSettings | null, now = new Date()): string | null {
  if (!s) return null;
  const pending = pendingMigrations(dbPath);
  if (pending.length === 0) return null;
  const r = takeSnapshot(dbPath, s, "premigration", now);
  return `Pre-migration backup ${r.file} verified (${r.users} users, ${r.migrations} migrations) before applying ${pending.join(", ")}.`;
}

/** Delete snapshots older than `keep` days, keeping the newest of each kind whatever its age. Returns the files removed. */
export function pruneExpired(s: BackupSettings, now = new Date()): string[] {
  const removed: string[] = [];
  for (const kind of ["premigration", "daily"] as const) {
    const files = listSnapshots(s.dir, kind);
    for (const f of files.slice(0, -1)) {
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
 * The hourly check: deletes expired snapshots, then takes a daily snapshot if the newest daily one is missing or at least 23 hours old.
 * Returns a log line, or null when nothing happened.
 */
export function dailyBackupIfDue(dbPath: string, s: BackupSettings, now = new Date()): string | null {
  const expired = pruneExpired(s, now);
  const note = expired.length ? ` Removed ${expired.length} backup(s) older than ${s.keep} days.` : "";
  const newest = listSnapshots(s.dir, "daily").at(-1);
  const at = newest ? timeOf(newest, "daily") : null;
  if (at && now.getTime() - at.getTime() < 23 * 3600_000) return note ? note.trim() : null;
  const r = takeSnapshot(dbPath, s, "daily", now);
  return `Daily backup ${r.file} verified (${r.users} users).${r.removed.length ? ` Removed ${r.removed.length} older daily backup(s).` : ""}${note}`;
}
