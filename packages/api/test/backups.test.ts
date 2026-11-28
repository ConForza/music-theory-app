/**
 * Automatic backups (student release): verified snapshots published atomically, pre-migration snapshot before the database is opened,
 * daily snapshots, strict expiry, start-up readiness, schema-aware verification and staged restore with reconciliation.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { assertWritable, backupBeforeMigrations, backupSettingsFromEnv, dailyBackupIfDue, listSnapshots, pruneExpired, restoreAtStartup, takeSnapshot } from "../src/backups.ts";
import { openDb, pendingMigrations } from "../src/db.ts";
import { TEMP_PREFIX, backupDb, restoreDb, verifyDb } from "../src/db-snapshot.ts";
import { createErasureLog } from "../src/erasures.ts";

const root = mkdtempSync(join(tmpdir(), "mtp-backups-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
  const d = join(root, `case-${++n}`);
  mkdirSync(d);
  return { dir: d, db: join(d, "mtp.sqlite"), backups: join(d, "backups") };
};
const addUser = (path: string, id: string) => {
  const db = openDb(path);
  db.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES (?, 'n', 'x', 'x')").run(id);
  db.close();
};
const userIds = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (db.prepare("SELECT id FROM users ORDER BY id").all() as Array<{ id: string }>).map((r) => r.id);
  } finally {
    db.close();
  }
};
const at = (iso: string) => new Date(iso);
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("backup settings", () => {
  it("are off unless MTP_BACKUP_DIR is set, default to 14 days, and reject malformed values", () => {
    expect(backupSettingsFromEnv({})).toBeNull();
    expect(backupSettingsFromEnv({ MTP_BACKUP_DIR: "/data/backups/" })).toEqual({ dir: "/data/backups", keep: 14 });
    expect(backupSettingsFromEnv({ MTP_BACKUP_DIR: "/data/backups", MTP_BACKUP_KEEP: "30" })).toEqual({ dir: "/data/backups", keep: 30 });
    expect(() => backupSettingsFromEnv({ MTP_BACKUP_DIR: "backups" })).toThrow(/absolute/);
    for (const bad of ["0", "-1", "two", "1.5", "1000"]) expect(() => backupSettingsFromEnv({ MTP_BACKUP_DIR: "/b", MTP_BACKUP_KEEP: bad })).toThrow(/MTP_BACKUP_KEEP/);
  });
});

describe("publishing a snapshot", () => {
  it("never leaves a file under a backup's name when the snapshot does not verify, and keeps the earlier verified copy", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 1 };
    const good = takeSnapshot(p.db, s, "daily", at("2026-12-01T00:00:00Z"));
    // A source that is not a usable database: VACUUM INTO fails or the copy fails verification.
    const broken = join(p.dir, "broken.sqlite");
    writeFileSync(broken, "not a database");
    expect(() => takeSnapshot(broken, s, "daily", at("2026-12-02T00:00:00Z"))).toThrow(/Automatic daily backup/);
    expect(listSnapshots(p.backups, "daily")).toEqual([good.file.split("/").pop()]);
    expect(readdirSync(p.backups).filter((f) => f.startsWith(TEMP_PREFIX))).toEqual([]);
  });

  it("ignores a partial file left by an interrupted run: it is not a backup, it is cleared, and a replacement is still taken", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 3 };
    takeSnapshot(p.db, s, "daily", at("2026-12-01T00:00:00Z"));
    // Simulate a run killed mid-write: only a private temporary file exists, never a published name.
    writeFileSync(join(p.backups, `${TEMP_PREFIX}mtp-daily-20261202T000000000Z.sqlite-123-abc`), "half a database");
    expect(listSnapshots(p.backups, "daily")).toHaveLength(1);
    expect(dailyBackupIfDue(p.db, s, at("2026-12-02T01:00:00Z"))).toMatch(/Daily backup .* verified/);
    expect(listSnapshots(p.backups, "daily")).toHaveLength(2);
    expect(readdirSync(p.backups).filter((f) => f.startsWith(TEMP_PREFIX))).toEqual([]);
  });

  it("refuses to overwrite, and names taken in the same instant stay unique and in time order", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 10 };
    const t = at("2026-12-01T00:00:00Z");
    const names = [0, 1, 2].map(() => takeSnapshot(p.db, s, "daily", t).file.split("/").pop()!);
    expect(new Set(names).size).toBe(3);
    expect([...names].sort()).toEqual(names);
    expect(listSnapshots(p.backups, "daily")).toEqual(names);
    expect(() => backupDb(p.db, join(p.backups, names[0]!))).toThrow(/refusing to overwrite/);
  });
});

describe("pre-migration backup and start-up readiness", () => {
  it("does nothing for a new or up-to-date database, or when backups are off", () => {
    const p = fresh();
    expect(pendingMigrations(p.db)).toEqual([]);
    expect(backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toBeNull();
    openDb(p.db).close();
    expect(backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toBeNull();
    expect(backupBeforeMigrations(p.db, null)).toBeNull();
    expect(listSnapshots(p.backups, "premigration")).toEqual([]);
  });

  it("snapshots a database with pending migrations before they run, holding the pre-migration data", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const raw = new DatabaseSync(p.db);
    const last = (raw.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: string }).version;
    raw.prepare("DELETE FROM schema_migrations WHERE version = ?").run(last);
    raw.close();
    expect(pendingMigrations(p.db)).toEqual([last]);
    const line = backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 }, at("2026-12-01T10:00:00Z"));
    expect(line).toContain(last);
    expect(listSnapshots(p.backups, "premigration")).toEqual(["mtp-premigration-20261201T100000000Z.sqlite"]);
    expect(pendingMigrations(p.db)).toEqual([last]); // the check itself changed nothing
  });

  it.skipIf(asRoot)("refuses (so the app does not start) when the backup directory is not writable, even with nothing to migrate", () => {
    const p = fresh();
    openDb(p.db).close();
    mkdirSync(p.backups);
    chmodSync(p.backups, 0o500);
    try {
      expect(() => backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toThrow(/not writable/);
      expect(() => assertWritable(p.backups)).toThrow(/not writable/);
    } finally {
      chmodSync(p.backups, 0o700);
    }
  });

  it("refuses when the backup path is a file", () => {
    const p = fresh();
    openDb(p.db).close();
    writeFileSync(p.backups, "not a directory");
    expect(() => backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toThrow(/not writable/);
  });
});

describe("daily backups and strict retention", () => {
  it("takes one when none exists or the newest is 23 hours old, never twice a day, and keeps at most `keep` per kind", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 2 };
    const day = (d: number, h = 3) => new Date(Date.UTC(2026, 11, d, h));
    expect(dailyBackupIfDue(p.db, s, day(1))).toMatch(/Daily backup .* verified \(1 users\)/);
    expect(dailyBackupIfDue(p.db, s, day(1, 20))).toBeNull();
    expect(dailyBackupIfDue(p.db, s, day(2, 2))).toMatch(/Daily backup/);
    dailyBackupIfDue(p.db, s, day(3, 2));
    expect(listSnapshots(p.backups, "daily")).toEqual(["mtp-daily-20261202T020000000Z.sqlite", "mtp-daily-20261203T020000000Z.sqlite"]);
  });

  it("deletes EVERY snapshot older than `keep` days, the newest pre-migration copy included, and never touches other files", () => {
    const p = fresh();
    addUser(p.db, "u1");
    mkdirSync(p.backups);
    writeFileSync(join(p.backups, "mtp-20261101-manual.sqlite"), "a manual backup from the Console");
    const s = { dir: p.backups, keep: 3 };
    takeSnapshot(p.db, s, "premigration", at("2026-11-20T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", at("2026-11-27T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", at("2026-11-30T00:00:00Z"));
    expect(pruneExpired(s, at("2026-12-01T01:00:00Z"))).toEqual(["mtp-premigration-20261120T000000000Z.sqlite", "mtp-daily-20261127T000000000Z.sqlite"]);
    expect(readdirSync(p.backups).sort()).toEqual(["mtp-20261101-manual.sqlite", "mtp-daily-20261130T000000000Z.sqlite"]);
  });

  it("still applies retention when the due snapshot fails, then reports the failure", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 1 };
    takeSnapshot(p.db, s, "daily", at("2026-11-01T00:00:00Z"));
    const broken = join(p.dir, "broken.sqlite");
    writeFileSync(broken, "not a database");
    expect(() => dailyBackupIfDue(broken, s, at("2026-12-01T00:00:00Z"))).toThrow(/Automatic daily backup/);
    expect(listSnapshots(p.backups, "daily")).toEqual([]);
  });
});

describe("verification checks the schema the code expects", () => {
  it("rejects a database missing a table or column its migrations create, or recording a migration this code does not know", () => {
    const p = fresh();
    addUser(p.db, "u1");
    expect(verifyDb(p.db).ok).toBe(true);
    const noSessions = join(p.dir, "no-sessions.sqlite");
    backupDb(p.db, noSessions);
    const a = new DatabaseSync(noSessions);
    a.exec("DROP TABLE sessions");
    a.close();
    expect(verifyDb(noSessions)).toMatchObject({ ok: false });
    expect(verifyDb(noSessions).problems.join()).toMatch(/missing table sessions/);

    const future = join(p.dir, "future.sqlite");
    backupDb(p.db, future);
    const b = new DatabaseSync(future);
    b.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES ('999_from_the_future.sql', 'x')").run();
    b.close();
    expect(verifyDb(future).problems.join()).toMatch(/does not know: 999_from_the_future.sql/);
  });

  it("accepts an older database that is simply behind (the app migrates it forward)", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const raw = new DatabaseSync(p.db);
    const last = (raw.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: string }).version;
    raw.prepare("DELETE FROM schema_migrations WHERE version = ?").run(last);
    raw.close();
    expect(verifyDb(p.db).ok).toBe(true);
  });
});

describe("restore is staged and reconciles what happened since the backup", () => {
  it("re-erases accounts deleted after the backup and ends every session, leaving the live file untouched until the swap", () => {
    const p = fresh();
    addUser(p.db, "amy");
    addUser(p.db, "ben");
    const db = openDb(p.db);
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, cookie_expires_at) VALUES ('t1', 'amy', 'x', '2999-01-01', '2999-01-01')").run();
    db.close();
    const snap = join(p.dir, "snap.sqlite");
    expect(backupDb(p.db, snap).ok).toBe(true);

    // After the backup, Amy deletes her account (logged first), as the app does.
    const log = createErasureLog(join(p.dir, "erasures.log"));
    log.record("amy");
    const live = openDb(p.db);
    live.prepare("DELETE FROM users WHERE id = 'amy'").run();
    live.close();

    const v = restoreDb(snap, p.db, { reconcile: (d) => void log.apply(d) });
    expect(v.ok).toBe(true);
    expect(userIds(p.db)).toEqual(["ben"]);
    const r = new DatabaseSync(p.db, { readOnly: true });
    expect((r.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c).toBe(0);
    r.close();
    expect(readdirSync(p.dir).some((f) => f.startsWith("mtp.sqlite.before-restore-"))).toBe(true);
  });

  it("changes nothing when the backup is bad or the staged copy cannot be made", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const bad = join(p.dir, "bad.sqlite");
    writeFileSync(bad, "not a database");
    expect(() => restoreDb(bad, p.db)).toThrow(/failed verification/);
    expect(userIds(p.db)).toEqual(["u1"]);
    const snap = join(p.dir, "snap.sqlite");
    backupDb(p.db, snap);
    expect(() => restoreDb(snap, p.db, { reconcile: () => { throw new Error("disk full"); } })).toThrow(/disk full/);
    expect(existsSync(p.db)).toBe(true);
    expect(verifyDb(p.db).ok).toBe(true);
    expect(readdirSync(p.dir).filter((f) => f.startsWith(TEMP_PREFIX) || f.includes("before-restore"))).toEqual([]);
  });
});

describe("erasure log", () => {
  it("stores only hashes, re-erases logged accounts, and drops entries older than its retention", () => {
    const p = fresh();
    addUser(p.db, "amy");
    addUser(p.db, "ben");
    const log = createErasureLog(join(p.dir, "erasures.log"), 30);
    log.record("amy", at("2026-11-01T00:00:00Z"));
    log.record("zed", at("2026-12-01T00:00:00Z"));
    const text = readFileSync(join(p.dir, "erasures.log"), "utf8");
    expect(text).not.toContain("amy");
    const db = openDb(p.db);
    expect(log.apply(db)).toBe(1);
    db.close();
    expect(userIds(p.db)).toEqual(["ben"]);
    expect(log.prune(at("2026-12-05T00:00:00Z"))).toBe(1); // amy's entry is 34 days old
  });
});

describe("one-shot restore at start-up (MTP_RESTORE_FROM)", () => {
  it("restores before the database is opened, keeps the replaced database as a retained snapshot, reconciles, and never repeats", () => {
    const p = fresh();
    addUser(p.db, "amy");
    addUser(p.db, "ben");
    const s = { dir: p.backups, keep: 14 };
    const snap = takeSnapshot(p.db, s, "daily", at("2026-11-20T00:00:00Z")).file.split("/").pop()!;
    // After the backup: Amy deletes her account (logged), Cal joins and has a session.
    const log = createErasureLog(join(p.dir, "erasures.log"));
    log.record("amy");
    const live = openDb(p.db);
    live.prepare("DELETE FROM users WHERE id = 'amy'").run();
    live.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES ('cal', 'n', 'x', 'x')").run();
    live.close();

    expect(restoreAtStartup(p.db, s, undefined, log)).toBeNull();
    const line = restoreAtStartup(p.db, s, snap, log, at("2026-11-28T00:00:00Z"));
    expect(line).toMatch(/RESTORED .*1 account\(s\) deleted after the backup erased again/);
    expect(userIds(p.db)).toEqual(["ben"]); // Amy stays erased; Cal (after the backup) is in the prerestore snapshot
    const pre = listSnapshots(p.backups, "prerestore");
    expect(pre).toHaveLength(1);
    expect(userIds(join(p.backups, pre[0]!))).toEqual(["ben", "cal"]);
    expect(readdirSync(p.dir).some((f) => f.includes("before-restore"))).toBe(false); // nothing kept outside retention

    // Left set after a restart: nothing happens again.
    const db = openDb(p.db);
    db.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES ('dee', 'n', 'x', 'x')").run();
    db.close();
    expect(restoreAtStartup(p.db, s, snap, log)).toMatch(/already restored/);
    expect(userIds(p.db)).toEqual(["ben", "dee"]);
    // The prerestore copy follows the normal retention.
    expect(pruneExpired(s, at("2026-12-31T00:00:00Z"))).toContain(pre[0]);
  });

  it("refuses without backups, a name that is a path, or a missing file, leaving the database as it was", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 14 };
    expect(() => restoreAtStartup(p.db, null, "x.sqlite", null)).toThrow(/needs automatic backups/);
    expect(() => restoreAtStartup(p.db, s, "../mtp.sqlite", null)).toThrow(/file name of a backup/);
    expect(() => restoreAtStartup(p.db, s, "missing.sqlite", null)).toThrow(/does not exist/);
    expect(userIds(p.db)).toEqual(["u1"]);
  });
});
