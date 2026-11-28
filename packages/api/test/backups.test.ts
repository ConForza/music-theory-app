/** Automatic backups (student release): pre-migration snapshot before the database is opened, daily snapshots, rotation, settings. */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { backupBeforeMigrations, backupSettingsFromEnv, dailyBackupIfDue, listSnapshots, takeSnapshot } from "../src/backups.ts";
import { openDb, pendingMigrations } from "../src/db.ts";
import { verifyDb } from "../src/db-snapshot.ts";

const root = mkdtempSync(join(tmpdir(), "mtp-backups-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
  const d = join(root, `case-${++n}`);
  mkdirSync(d);
  return { db: join(d, "mtp.sqlite"), backups: join(d, "backups") };
};
const addUser = (path: string, id: string) => {
  const db = openDb(path);
  db.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES (?, 'n', 'x', 'x')").run(id);
  db.close();
};

describe("backup settings", () => {
  it("are off unless MTP_BACKUP_DIR is set, default to keeping 14, and reject malformed values", () => {
    expect(backupSettingsFromEnv({})).toBeNull();
    expect(backupSettingsFromEnv({ MTP_BACKUP_DIR: "/data/backups/" })).toEqual({ dir: "/data/backups", keep: 14 });
    expect(backupSettingsFromEnv({ MTP_BACKUP_DIR: "/data/backups", MTP_BACKUP_KEEP: "30" })).toEqual({ dir: "/data/backups", keep: 30 });
    expect(() => backupSettingsFromEnv({ MTP_BACKUP_DIR: "backups" })).toThrow(/absolute/);
    for (const bad of ["0", "-1", "two", "1.5", "1000"]) expect(() => backupSettingsFromEnv({ MTP_BACKUP_DIR: "/b", MTP_BACKUP_KEEP: bad })).toThrow(/MTP_BACKUP_KEEP/);
  });
});

describe("pre-migration backup", () => {
  it("does nothing for a new database, an up-to-date database, or when backups are off", () => {
    const p = fresh();
    expect(pendingMigrations(p.db)).toEqual([]);
    expect(backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toBeNull();
    openDb(p.db).close();
    expect(backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toBeNull();
    expect(backupBeforeMigrations(p.db, null)).toBeNull();
    expect(listSnapshots(p.backups, "premigration")).toEqual([]);
  });

  it("snapshots a database that has pending migrations, before they run, and the snapshot holds the pre-migration data", () => {
    const p = fresh();
    addUser(p.db, "u1");
    // Pretend the newest migration has not been applied yet (as when new code starts on an older database).
    const raw = new DatabaseSync(p.db);
    const last = (raw.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: string }).version;
    raw.prepare("DELETE FROM schema_migrations WHERE version = ?").run(last);
    raw.close();
    expect(pendingMigrations(p.db)).toEqual([last]);

    const line = backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 }, new Date("2026-12-01T10:00:00Z"));
    expect(line).toContain(last);
    const files = listSnapshots(p.backups, "premigration");
    expect(files).toEqual(["mtp-premigration-20261201T100000Z.sqlite"]);
    const v = verifyDb(join(p.backups, files[0]!));
    expect(v).toMatchObject({ ok: true, users: 1 });
    // The read-only check changed nothing: the migration is still pending until the app opens the database.
    expect(pendingMigrations(p.db)).toEqual([last]);
  });

  it("throws, and leaves no file behind, when the snapshot cannot be made", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const raw = new DatabaseSync(p.db);
    raw.exec("DELETE FROM schema_migrations");
    raw.close();
    // The backup directory is a file, so nothing can be written there.
    writeFileSync(p.backups, "not a directory");
    expect(() => backupBeforeMigrations(p.db, { dir: p.backups, keep: 3 })).toThrow();
  });
});

describe("daily backups and rotation", () => {
  it("takes one when none exists or the newest is 23 hours old, never twice a day, and keeps only the newest `keep`", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 2 };
    const day = (d: number, h = 3) => new Date(Date.UTC(2026, 11, d, h));
    expect(dailyBackupIfDue(p.db, s, day(1))).toMatch(/Daily backup .* verified \(1 users\)/);
    expect(dailyBackupIfDue(p.db, s, day(1, 20))).toBeNull(); // 17 h later: not due
    expect(dailyBackupIfDue(p.db, s, day(2, 2))).toMatch(/Daily backup/); // 23 h later: due
    expect(dailyBackupIfDue(p.db, s, day(3, 2))).toMatch(/Removed 1 older/);
    expect(listSnapshots(p.backups, "daily")).toEqual(["mtp-daily-20261202T020000Z.sqlite", "mtp-daily-20261203T020000Z.sqlite"]);
  });

  it("rotates each kind separately and never touches other files", () => {
    const p = fresh();
    addUser(p.db, "u1");
    mkdirSync(p.backups);
    writeFileSync(join(p.backups, "mtp-20261101-manual.sqlite"), "a manual backup from the Console");
    const s = { dir: p.backups, keep: 1 };
    takeSnapshot(p.db, s, "premigration", new Date("2026-12-01T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", new Date("2026-12-01T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", new Date("2026-12-02T00:00:00Z"));
    expect(readdirSync(p.backups).sort()).toEqual(["mtp-20261101-manual.sqlite", "mtp-daily-20261202T000000Z.sqlite", "mtp-premigration-20261201T000000Z.sqlite"]);
  });

  it("deletes snapshots older than `keep` days (bounding how long deleted data survives), but never the newest of a kind", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 3 };
    takeSnapshot(p.db, s, "premigration", new Date("2026-11-01T00:00:00Z"));
    takeSnapshot(p.db, s, "premigration", new Date("2026-11-20T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", new Date("2026-11-27T00:00:00Z"));
    takeSnapshot(p.db, s, "daily", new Date("2026-11-30T00:00:00Z"));
    // On 1 December: the 1 Nov pre-migration copy and the 27 Nov daily copy are over 3 days old; 20 Nov is the newest of its kind.
    const line = dailyBackupIfDue(p.db, s, new Date("2026-12-01T01:00:00Z"));
    expect(line).toMatch(/Removed 2 backup\(s\) older than 3 days/);
    expect(listSnapshots(p.backups, "premigration")).toEqual(["mtp-premigration-20261120T000000Z.sqlite"]);
    // 30 Nov is kept, and a new daily copy was due (25 hours since the last).
    expect(listSnapshots(p.backups, "daily")).toEqual(["mtp-daily-20261130T000000Z.sqlite", "mtp-daily-20261201T010000Z.sqlite"]);
  });

  it("never overwrites a snapshot taken in the same second", () => {
    const p = fresh();
    addUser(p.db, "u1");
    const s = { dir: p.backups, keep: 5 };
    const at = new Date("2026-12-01T00:00:00Z");
    takeSnapshot(p.db, s, "daily", at);
    takeSnapshot(p.db, s, "daily", at);
    expect(listSnapshots(p.backups, "daily")).toHaveLength(2);
  });
});
