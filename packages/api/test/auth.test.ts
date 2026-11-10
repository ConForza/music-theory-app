import { describe, expect, it } from "vitest";
import { Client, email, register, setup } from "./helpers.ts";

describe("accounts and sessions", () => {
  it("registers, keeps the session, and returns the profile", async () => {
    const c = setup().client();
    const r = await register(c);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ displayName: "ada", isGuest: false, email: email("ada") });
    expect(r.body.user.passwordHash).toBeUndefined();
    const me = await c.get("/api/me");
    expect(me.body.profile).toMatchObject({ selectedGrade: 1, onboarded: false });
  });

  it("sets an HttpOnly, SameSite cookie and never stores the raw token or password", async () => {
    const { db, app } = setup();
    const res = await app.fetch(
      new Request("http://t/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@example.com", password: "supersecret1", displayName: "A" }) }),
    );
    const cookie = res.headers.getSetCookie()[0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = cookie.split(";")[0]!.split("=")[1]!;
    const stored = JSON.stringify(db.prepare("SELECT * FROM sessions").all()) + JSON.stringify(db.prepare("SELECT password_hash FROM users").all());
    expect(stored).not.toContain(token);
    expect(stored).not.toContain("supersecret1");
    expect(stored).toContain("scrypt$");
  });

  it("rejects bad input with readable errors", async () => {
    const c = setup().client();
    expect((await c.post("/api/auth/register", { email: "nope", password: "longenough1", displayName: "x" })).status).toBe(400);
    const short = await c.post("/api/auth/register", { email: "a@example.com", password: "short", displayName: "x" });
    expect(short.status).toBe(400);
    expect(short.body.error.message).toMatch(/8 characters/);
  });

  it("rejects duplicate emails and wrong passwords with the same message for unknown accounts", async () => {
    const { client } = setup();
    const a = client();
    await register(a);
    expect((await register(client())).status).toBe(409);
    const b = client();
    const wrong = await b.post("/api/auth/login", { email: email("ada"), password: "wrong password" });
    const unknown = await b.post("/api/auth/login", { email: "ghost@example.com", password: "wrong password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("signs in again on a new device and signs out", async () => {
    const { client } = setup();
    await register(client());
    const d = client();
    expect((await d.post("/api/auth/login", { email: email("ada"), password: "correct horse battery" })).status).toBe(200);
    expect((await d.get("/api/me")).status).toBe(200);
    await d.post("/api/auth/logout");
    expect((await d.get("/api/me")).status).toBe(401);
  });

  it("rate-limits repeated failed sign-ins", async () => {
    const c = setup().client();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.post("/api/auth/login", { email: "x@example.com", password: "nope nope" })).status;
    expect(last).toBe(429);
  });

  it("requires authentication for learner data", async () => {
    const c = setup().client();
    for (const p of ["/api/me", "/api/progress", "/api/lessons/G1-U3-L03"]) expect((await c.get(p)).status, p).toBe(401);
  });

  it("refuses cross-site state changes and non-JSON bodies", async () => {
    const { app } = setup();
    const cross = await app.fetch(new Request("http://t/api/auth/guest", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }));
    expect(cross.status).toBe(403);
    const form = await app.fetch(new Request("http://t/api/auth/guest", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }));
    expect(form.status).toBe(415);
  });

  it("upgrades a guest in place and keeps its progress", async () => {
    const { client } = setup();
    const c = client();
    const g = await c.post("/api/auth/guest");
    expect(g.body.user.isGuest).toBe(true);
    const id = g.body.user.id;
    await c.post("/api/lessons/G1-U3-L03/start");
    const up = await register(c, "grace");
    expect(up.body.user).toMatchObject({ id, isGuest: false });
    const run = await c.post("/api/lessons/G1-U3-L03/start");
    expect(run.body.run).toBe(1);
    expect((await c.get("/api/progress")).body.nodes["G1-U3-L03"].state).toBe("in_progress");
  });

  it("exports and deletes all of a learner's data", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    await c.post("/api/lessons/G1-U3-L03/start");
    const exp = await c.get("/api/me/export");
    expect(exp.body.lessonProgress).toHaveLength(1);
    expect((await c.call("DELETE", "/api/me")).status).toBe(200);
    expect((await c.get("/api/me")).status).toBe(401);
    for (const t of ["users", "sessions", "profiles", "lesson_progress", "attempts", "hint_uses"]) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, t).toBe(0);
    }
  });

  it("stores profile and settings, validating values", async () => {
    const c = setup().client();
    await register(c);
    const r = await c.call("PATCH", "/api/me/profile", { experience: "some", selectedGrade: 3, onboarded: true, settings: { theme: "dark", sound: false } });
    expect(r.body.profile).toMatchObject({ experience: "some", selectedGrade: 3, onboarded: true, settings: { theme: "dark", sound: false, motion: "system" } });
    expect((await c.call("PATCH", "/api/me/profile", { selectedGrade: 6 })).status).toBe(400);
    expect((await c.call("PATCH", "/api/me/profile", { settings: { theme: "neon" } })).status).toBe(400);
    expect((await c.call("PATCH", "/api/me/profile", { isAdmin: true })).status).toBe(400);
  });
});

describe("migrations", () => {
  it("are applied once and tracked", async () => {
    const { openDb, migrate } = await import("../src/db.ts");
    const db = openDb(":memory:");
    expect(migrate(db)).toEqual([]);
    expect((db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((r) => r.version)).toEqual(["001_init.sql", "002_practice.sql", "003_progression.sql", "004_question_exposure.sql"]);
  });
});

void Client;
