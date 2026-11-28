/**
 * Erasure log (student release). When a learner deletes their account, the deletion must survive a restore: a backup taken before the
 * deletion still holds the learner. So each deletion is first appended to a small log kept OUTSIDE the database file, holding only a
 * hash of the account's random id and the time (no name, email or learning data). The log is applied:
 *
 *  - at every start-up, before the server listens (so a database restored by any route, the `db:backup restore` command or a provider
 *    volume restore, never serves an erased learner), and
 *  - by `db:backup restore`, to the staged copy before it is put in place.
 *
 * Entries are kept for MTP_ERASURE_LOG_DAYS (default 400): set it at least as long as the oldest backup you could restore, including any
 * provider backups. Guests deleted by the retention policy are not logged: after a restore they still meet the policy and are deleted again
 * by the next retention run.
 *
 * On by default whenever automatic backups are on (MTP_BACKUP_DIR); the file is MTP_ERASURE_LOG, or `erasures.log` next to the database.
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export const DEFAULT_ERASURE_LOG_DAYS = 400;
const hashId = (id: string) => createHash("sha256").update(`mtp-erasure-v1:${id}`).digest("hex");

export interface ErasureLog {
  file: string;
  keepDays: number;
  /** Append (durably) before the account is deleted. Throws if the log cannot be written, so nothing is deleted unlogged. */
  record(userId: string, at?: Date): void;
  /** Delete every logged account still present in `db` (with all its records, by cascade). Returns how many. */
  apply(db: DatabaseSync): number;
  /** Drop entries older than `keepDays`. Returns how many were dropped. */
  prune(now?: Date): number;
}

export function erasureLogFromEnv(env: Record<string, string | undefined>, dbPath: string, backupsOn: boolean): ErasureLog | null {
  const raw = env.MTP_ERASURE_LOG_DAYS?.trim();
  if (raw && !/^[1-9]\d{0,4}$/.test(raw)) throw new Error(`MTP_ERASURE_LOG_DAYS must be a whole number of days, 1 or more (got "${raw}").`);
  const file = env.MTP_ERASURE_LOG?.trim() || (backupsOn ? join(dirname(dbPath), "erasures.log") : "");
  if (!file) return null;
  if (!file.startsWith("/")) throw new Error(`MTP_ERASURE_LOG must be an absolute path (got "${file}").`);
  return createErasureLog(file, raw ? Number(raw) : DEFAULT_ERASURE_LOG_DAYS);
}

export function createErasureLog(file: string, keepDays = DEFAULT_ERASURE_LOG_DAYS): ErasureLog {
  const read = (): Array<{ at: string; hash: string }> => {
    if (!existsSync(file)) return [];
    const out: Array<{ at: string; hash: string }> = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\t([0-9a-f]{64})$/.exec(line);
      if (m) out.push({ at: m[1]!, hash: m[2]! });
    }
    return out;
  };
  return {
    file,
    keepDays,
    record(userId, at = new Date()) {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${at.toISOString()}\t${hashId(userId)}\n`);
      const fd = openSync(file, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    },
    apply(db) {
      const wanted = new Set(read().map((e) => e.hash));
      if (wanted.size === 0) return 0;
      const ids = (db.prepare("SELECT id FROM users").all() as Array<{ id: string }>).map((r) => r.id).filter((id) => wanted.has(hashId(id)));
      const del = db.prepare("DELETE FROM users WHERE id = ?");
      for (const id of ids) del.run(id);
      return ids.length;
    },
    prune(now = new Date()) {
      const all = read();
      const cutoff = now.getTime() - keepDays * 86400_000;
      const keep = all.filter((e) => new Date(e.at).getTime() >= cutoff);
      if (keep.length === all.length) return 0;
      const tmp = `${file}.tmp-${process.pid}`;
      writeFileSync(tmp, keep.map((e) => `${e.at}\t${e.hash}\n`).join(""));
      renameSync(tmp, file);
      return all.length - keep.length;
    },
  };
}
