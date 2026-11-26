/** PWA brief: persistent learner sign-in. Bounded renewal for registered learners, guests unchanged, rotation on upgrade, revocation. */
import { describe, expect, it } from "vitest";
import { COOKIE, SESSION_DAYS, SESSION_MAX_DAYS, createSession, createUser, resolveSession, sha256 } from "../src/auth.ts";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, setup, sharedCourse } from "./helpers.ts";

const DAY = 86400_000;
const register = (c: ReturnType<ReturnType<typeof setup>["client"]>, name = "ada") =>
  c.post("/api/auth/register", { email: `${name}@example.com`, password: "correct horse", displayName: name });
const expiryOf = (db: ReturnType<typeof openDb>, token: string) =>
  new Date((db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as { expires_at: string }).expires_at).getTime();
/** Move a session's dates into the past, as if it had been created `days` ago and never renewed. */
function age(db: ReturnType<typeof openDb>, token: string, days: number) {
  const created = Date.now() - days * DAY;
  db.prepare("UPDATE sessions SET created_at = ?, expires_at = ? WHERE token_hash = ?").run(new Date(created).toISOString(), new Date(created + SESSION_DAYS * DAY).toISOString(), sha256(token));
}

describe("registered learner sessions renew while used (bounded)", () => {
  it("a request more than a day after the last renewal moves the end to 60 days from now and re-sends the cookie", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    age(db, token, 10);
    const before = expiryOf(db, token);
    const r = await c.get("/api/me");
    expect(r.status).toBe(200);
    const after = expiryOf(db, token);
    expect(after - before).toBeGreaterThan(9 * DAY);
    expect(Math.abs(after - (Date.now() + SESSION_DAYS * DAY))).toBeLessThan(60_000);
    const set = r.headers.getSetCookie();
    expect(set).toHaveLength(1);
    expect(set[0]).toContain(`${COOKIE}=${token};`); // same token, new lifetime: no race between parallel requests
    expect(set[0]).toMatch(/HttpOnly/);
    expect(set[0]).toMatch(/SameSite=Lax/);
    expect(Number(/Max-Age=(\d+)/.exec(set[0]!)![1])).toBeGreaterThan((SESSION_DAYS - 1) * 86400);
    expect(new Date(r.body.session.expiresAt).getTime()).toBe(after);
  });

  it("renews at most once a day: a fresh session is not written to or re-sent", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    const before = expiryOf(db, token);
    const r = await c.get("/api/me");
    expect(r.headers.getSetCookie()).toHaveLength(0);
    expect(expiryOf(db, token)).toBe(before);
  });

  it("never renews past 365 days after the sign-in; then the learner signs in again", () => {
    const db = openDb(":memory:");
    const u = createUser(db, { displayName: "ada", email: "a@example.com", passwordHash: "x" });
    const { token } = createSession(db, u.id);
    const created = Date.now();
    // Used every day for a year and a bit.
    let last: ReturnType<typeof resolveSession>;
    for (let d = 1; d <= SESSION_MAX_DAYS + 5; d++) last = resolveSession(db, token, new Date(created + d * DAY));
    expect(last).toBeUndefined();
    const cap = created + SESSION_MAX_DAYS * DAY;
    expect(Math.abs(expiryOf(db, token) - cap)).toBeLessThan(5_000);
    expect(resolveSession(db, token, new Date(cap - DAY))?.user.id).toBe(u.id);
    expect(resolveSession(db, token, new Date(cap + 1000))).toBeUndefined();
  });

  it("an unused session still ends 60 days after its last renewal", () => {
    const db = openDb(":memory:");
    const u = createUser(db, { displayName: "ada", email: "a@example.com", passwordHash: "x" });
    const { token } = createSession(db, u.id);
    const t0 = Date.now();
    expect(resolveSession(db, token, new Date(t0 + 30 * DAY))?.renewedMaxAgeSeconds).toBeGreaterThan(0); // renewed to t0+90
    expect(resolveSession(db, token, new Date(t0 + 30 * DAY + SESSION_DAYS * DAY + 1000))).toBeUndefined();
  });
});

describe("guests keep their fixed 60 days", () => {
  it("a guest session is never renewed", async () => {
    const { client, db } = setup();
    const c = client();
    await c.post("/api/auth/guest");
    const token = c.cookie.split("=")[1]!;
    age(db, token, 20);
    const before = expiryOf(db, token);
    const r = await c.get("/api/me");
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie()).toHaveLength(0);
    expect(expiryOf(db, token)).toBe(before);
    expect([SESSION_DAYS - 21, SESSION_DAYS - 20]).toContain(r.body.session.guestAccessEndsInDays);
  });
});

describe("session fixation, sign-out and account switching", () => {
  it("registering a guest replaces the guest session: the old token stops working, progress stays", async () => {
    const { client } = setup();
    const c = client();
    const g = await c.post("/api/auth/guest");
    await c.post("/api/lessons/G1-U3-L03/start");
    const guestCookie = c.cookie;
    const up = await register(c, "grace");
    expect(up.status).toBe(200);
    expect(c.cookie).not.toBe(guestCookie);
    expect(up.body.user).toMatchObject({ id: g.body.user.id, isGuest: false });
    expect(Math.abs(new Date(up.body.session.expiresAt).getTime() - (Date.now() + SESSION_DAYS * DAY))).toBeLessThan(60_000);
    const old = client();
    old.cookie = guestCookie;
    expect((await old.get("/api/me")).status).toBe(401);
    expect((await c.get("/api/progress")).body.nodes["G1-U3-L03"].state).toBe("in_progress");
    // A retry from the lost-reply path (old cookie, same details) is told to sign in, and signing in reaches the same learner.
    expect((await register(old, "grace")).body.error.code).toBe("email_taken");
    const li = await old.post("/api/auth/login", { email: "grace@example.com", password: "correct horse" });
    expect(li.body.user.id).toBe(g.body.user.id);
  });

  it("sign-in issues a new token and ends the previous one; sign-out revokes it server-side", async () => {
    const { client } = setup();
    const a = client();
    await register(a, "ada");
    const first = a.cookie;
    await a.post("/api/auth/login", { email: "ada@example.com", password: "correct horse" });
    expect(a.cookie).not.toBe(first);
    const stale = client();
    stale.cookie = first;
    expect((await stale.get("/api/me")).status).toBe(401);
    const live = a.cookie;
    const out = await a.post("/api/auth/logout");
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
    const replay = client();
    replay.cookie = live;
    expect((await replay.get("/api/me")).status).toBe(401);
  });

  it("sign-out wins over a renewal on the same request (the cookie is cleared, not re-sent)", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    age(db, c.cookie.split("=")[1]!, 10);
    const out = await c.post("/api/auth/logout");
    const set = out.headers.getSetCookie();
    expect(set).toHaveLength(1);
    expect(set[0]).toMatch(/Max-Age=0/);
  });

  it("switching accounts on one device never shows the previous learner", async () => {
    const { client } = setup();
    const c = client();
    await register(c, "ada");
    await c.post("/api/lessons/G1-U3-L03/start");
    await c.post("/api/auth/logout");
    await register(c, "bob");
    const me = await c.get("/api/me");
    expect(me.body.user.email).toBe("bob@example.com");
    expect((await c.get("/api/progress")).body.nodes["G1-U3-L03"].state).not.toBe("in_progress");
  });

  it("an invalid or expired cookie is simply signed out (401), never an error or someone else's account", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 1000).toISOString(), sha256(token));
    expect((await c.get("/api/me")).status).toBe(401);
    for (const bad of ["x", "", "%", token.slice(1)]) {
      const o = client();
      o.cookie = `${COOKIE}=${bad}`;
      expect((await o.get("/api/me")).status, bad).toBe(401);
    }
  });

  it("a session survives a redeploy: a new process on the same database still knows it", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mtp-sess-")), "db.sqlite");
    const first = setupOn(file);
    const c = first.client();
    await register(c);
    first.db.close();
    const second = setupOn(file);
    const again = second.client();
    again.cookie = c.cookie;
    expect((await again.get("/api/me")).body.user.email).toBe("ada@example.com");
    second.db.close();
  });
});

function setupOn(file: string) {
  const db = openDb(file);
  const app = createApp({ db, course: sharedCourse() });
  return { db, client: () => new Client(app) };
}
