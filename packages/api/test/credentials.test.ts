/**
 * Review of the student release: a sign-in racing a password change cannot issue a session, a learner can change a temporary password,
 * deletions are logged before they happen, and the export includes every table holding the learner's rows.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { hashPassword, setPassword } from "../src/auth.ts";
import { openDb, tx } from "../src/db.ts";
import { createErasureLog } from "../src/erasures.ts";
import { Client, email, register, sharedCourse } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-cred-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const sessionsOf = (db: ReturnType<typeof openDb>, id: string) => (db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?").get(id) as { c: number }).c;

describe("a sign-in that races a password change", () => {
  it("issues no session when the password changed while the old one was being checked", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course: sharedCourse() });
    const ada = new Client(app);
    const reg = await register(ada, "ada", "old-password-1");
    const id = reg.body.user.id as string;
    const before = sessionsOf(db, id);

    const next = await hashPassword("new-password-1");
    const attacker = new Client(app);
    const pending = attacker.post("/api/auth/login", { email: email("ada"), password: "old-password-1" });
    // Let the request read the account and start the slow password check, then reset the password (as the teacher's command does).
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    tx(db, () => setPassword(db, id, next));
    const res = await pending;
    expect(res.status).toBe(401);
    expect(attacker.cookie).toBe("");
    expect(sessionsOf(db, id)).toBe(0);
    expect(before).toBe(1);
  });
});

describe("change password", () => {
  it("needs the current password, ends the account's other sessions, and keeps this device signed in", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course: sharedCourse() });
    const phone = new Client(app);
    const reg = await register(phone, "bea", "temporary-pass-1");
    const laptop = new Client(app);
    expect((await laptop.post("/api/auth/login", { email: email("bea"), password: "temporary-pass-1" })).status).toBe(200);
    const id = reg.body.user.id as string;
    expect(sessionsOf(db, id)).toBe(2);

    expect((await phone.post("/api/me/password", { currentPassword: "wrong-one", newPassword: "my-own-pass-1" })).status).toBe(401);
    expect((await phone.post("/api/me/password", { currentPassword: "temporary-pass-1", newPassword: "short" })).status).toBe(400);
    expect((await phone.post("/api/me/password", { currentPassword: "temporary-pass-1", newPassword: "my-own-pass-1" })).status).toBe(200);
    expect(sessionsOf(db, id)).toBe(1);
    expect((await phone.get("/api/me")).status).toBe(200);
    expect((await laptop.get("/api/me")).status).toBe(401);
    expect((await new Client(app).post("/api/auth/login", { email: email("bea"), password: "temporary-pass-1" })).status).toBe(401);
    expect((await new Client(app).post("/api/auth/login", { email: email("bea"), password: "my-own-pass-1" })).status).toBe(200);
  });

  it("is refused for a guest", async () => {
    const app = createApp({ db: openDb(":memory:"), course: sharedCourse() });
    const g = new Client(app);
    await g.post("/api/auth/guest");
    expect((await g.post("/api/me/password", { currentPassword: "x", newPassword: "whatever-123" })).status).toBe(400);
  });
});

describe("account deletion and the erasure log", () => {
  it("logs the deletion durably before deleting, and deletes nothing if the log cannot be written", async () => {
    const db = openDb(":memory:");
    const okLog = createErasureLog(join(dir, "ok", "erasures.log"));
    const app = createApp({ db, course: sharedCourse(), erasures: okLog });
    const c = new Client(app);
    const id = (await register(c, "cal")).body.user.id as string;
    expect((await c.call("DELETE", "/api/me", { userId: id })).status).toBe(200);
    expect(db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)).toBeUndefined();
    // The log holds the account: a restored copy containing it would be erased again.
    const restored = openDb(":memory:");
    restored.prepare("INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES (?, 'cal', 'x', 'x')").run(id);
    expect(okLog.apply(restored)).toBe(1);

    const blocked = join(dir, "blocked");
    writeFileSync(blocked, "a file where the log's directory should be");
    const db2 = openDb(":memory:");
    const app2 = createApp({ db: db2, course: sharedCourse(), erasures: createErasureLog(join(blocked, "erasures.log")) });
    const d = new Client(app2);
    const id2 = (await register(d, "dee")).body.user.id as string;
    expect((await d.call("DELETE", "/api/me", { userId: id2 })).status).toBe(500);
    expect(db2.prepare("SELECT 1 FROM users WHERE id = ?").get(id2)).toBeTruthy();
  });
});

describe("export", () => {
  it("includes every table that holds the learner's rows (lesson and practice hints too)", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, course: sharedCourse() });
    const c = new Client(app);
    const id = (await register(c, "eve")).body.user.id as string;
    db.prepare("INSERT INTO hint_uses (user_id, node_id, run, item_id, level, created_at) VALUES (?, 'n', 1, 'i', 1, 'x')").run(id);
    db.prepare("INSERT INTO practice_hint_uses (user_id, item_id, level, created_at) VALUES (?, 'i', 1, 'x')").run(id);
    const ex = (await c.get("/api/me/export")).body;
    expect(ex.hintUses).toHaveLength(1);
    expect(ex.practiceHintUses).toHaveLength(1);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
    const withUser = tables.filter((t) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).some((col) => col.name === "user_id"));
    // Sign-in sessions are credentials, not learning records; the profile is exported as one object; every other table as a list.
    expect(ex.profile).toBeTruthy();
    expect(Object.values(ex).filter(Array.isArray).length).toBe(withUser.filter((t) => t !== "sessions" && t !== "profiles").length);
  });
});
