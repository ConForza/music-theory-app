/** Railway private preview (issue #24): access gate in front of every route, storage guard, SQLite-consistent backup/restore. */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { railwayProblem } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createPreviewGate, newInvite } from "../src/preview-gate.ts";
import { createHttpServer } from "../src/server.ts";
import { backupDb, restoreDb, verifyDb } from "../scripts/db-backup.ts";
import { sharedCourse } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-railway-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const basic = (n: string, p: string) => "Basic " + Buffer.from(`${n}:${p}`).toString("base64");

async function withServer<T>(access: string | undefined, fn: (get: (path: string, init?: RequestInit) => Promise<Response>) => Promise<T>) {
  const staticDir = join(dir, "web-missing");

  const server = createHttpServer(createApp({ db: openDb(":memory:"), course: sharedCourse() }), staticDir, { gate: createPreviewGate(access), https: true });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await fn((p, init) => fetch(base + p, init));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

describe("preview access gate", () => {
  const alice = newInvite("alice");
  const bob = newInvite("bob");
  const access = `${alice.entry},${bob.entry}`;

  it("denies uninvited visitors on the web app and every API route, including guest creation and registration", async () => {
    await withServer(access, async (get) => {
      for (const [m, p] of [["GET", "/"], ["GET", "/assets/x.js"], ["GET", "/robots.txt"], ["GET", "/api/me"], ["GET", "/api/review"], ["POST", "/api/auth/guest"], ["POST", "/api/auth/register"], ["POST", "/api/auth/login"], ["POST", "/api/health"]] as const) {
        const r = await get(p, { method: m, headers: m === "POST" ? { "content-type": "application/json" } : {}, body: m === "POST" ? "{}" : undefined });
        expect(r.status, `${m} ${p}`).toBe(401);
        expect(r.headers.get("www-authenticate")).toMatch(/^Basic realm=/);
        expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
        expect(r.headers.get("x-robots-tag")).toBe("noindex");
      }
    });
  });

  it("allows only read-only /api/health without credentials", async () => {
    await withServer(access, async (get) => {
      const r = await get("/api/health");
      expect(r.status).toBe(200);
      expect((await get("/api/health", { method: "HEAD" })).status).toBe(401);
      expect((await get("/api/health/../me")).status).toBe(401);
      expect((await get("/api/healthz")).status).toBe(401);
    });
  });

  it("an invited tester gets through, wrong or malformed credentials do not, and a removed tester is refused", async () => {
    await withServer(access, async (get) => {
      expect((await get("/api/auth/guest", { method: "POST", headers: { authorization: basic("alice", alice.password), "content-type": "application/json" }, body: "{}" })).status).toBe(200);
      for (const auth of [basic("alice", bob.password), basic("alice", "x"), basic("mallory", alice.password), basic("alice", ""), "Basic !!", "Bearer abc", basic("alice", alice.entry.split(":")[1]!)]) {
        expect((await get("/api/me", { headers: { authorization: auth } })).status, auth).toBe(401);
      }
    });
    await withServer(bob.entry, async (get) => {
      expect((await get("/api/me", { headers: { authorization: basic("alice", alice.password) } })).status).toBe(401);
      expect((await get("/api/auth/guest", { method: "POST", headers: { authorization: basic("bob", bob.password), "content-type": "application/json" }, body: "{}" })).status).toBe(200);
    });
  });

  it("fails closed: no valid entries means nobody gets in (except health); spoofed forwarding headers change nothing", async () => {
    await withServer("garbage,alice:short", async (get) => {
      expect(createPreviewGate("garbage,alice:short").testers).toBe(0);
      expect((await get("/", { headers: { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https", host: "healthcheck.railway.app" } })).status).toBe(401);
      expect((await get("/api/health")).status).toBe(200);
    });
  });
});

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
