/** Railway private preview (issue #24): storage guard, SQLite-consistent backup/restore. The access gate: preview-signin.test.ts. */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { railwayProblem } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { backupDb, restoreDb, verifyDb } from "../scripts/db-backup.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-railway-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
// The preview access gate itself is covered in preview-signin.test.ts.

describe("Railway storage guard", () => {
  const ok = { RAILWAY_ENVIRONMENT_ID: "e", RAILWAY_VOLUME_MOUNT_PATH: "/data", MTP_DB: "/data/mtp.sqlite", MTP_PREVIEW_GATE: "1" };
  it("passes off Railway and on a correctly configured Railway service", () => {
    expect(railwayProblem({})).toBeNull();
    expect(railwayProblem(ok)).toBeNull();
  });
  it("refuses to start on Railway without a volume, an explicit database on it, or the gate", () => {
    expect(railwayProblem({ ...ok, RAILWAY_VOLUME_MOUNT_PATH: undefined })).toMatch(/volume/i);
    expect(railwayProblem({ ...ok, MTP_DB: undefined })).toMatch(/MTP_DB/);
    expect(railwayProblem({ ...ok, MTP_DB: "/app/packages/api/data/mtp.sqlite" })).toMatch(/outside the volume/);
    expect(railwayProblem({ ...ok, MTP_DB: "/database.sqlite" })).toMatch(/outside the volume/);
    expect(railwayProblem({ ...ok, MTP_PREVIEW_GATE: undefined })).toMatch(/MTP_PREVIEW_GATE/);
  });
});

describe("SQLite-consistent backup and restore", () => {
  it("snapshots a live WAL database with uncheckpointed writes, verifies it, and restores it over a changed database", () => {
    const live = join(dir, "live.sqlite");
    const db = openDb(live);
    db.exec("PRAGMA wal_autocheckpoint = 0");
    db.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES ('u1', 'n', 'x', 'x')").run();
    expect(existsSync(`${live}-wal`)).toBe(true); // the write is in the WAL, not yet in the main file
    const snap = join(dir, "snap.sqlite");
    const v = backupDb(live, snap);
    expect(v).toMatchObject({ ok: true, users: 1 });
    expect(() => backupDb(live, snap)).toThrow(/refusing to overwrite/);

    db.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES ('u2', 'n', 'x', 'x')").run();
    db.close();
    const restored = restoreDb(snap, live);
    expect(restored).toMatchObject({ ok: true, users: 1 });
    expect(existsSync(`${live}-wal`)).toBe(false);
  });

  it("refuses to restore a corrupt backup and leaves the live database untouched", () => {
    const bad = join(dir, "bad.sqlite");
    writeFileSync(bad, "not a database");
    const live = join(dir, "keep.sqlite");
    openDb(live).close();
    expect(verifyDb(bad).ok).toBe(false);
    expect(() => restoreDb(bad, live)).toThrow(/failed verification/);
    expect(verifyDb(live).ok).toBe(true);
  });
});
