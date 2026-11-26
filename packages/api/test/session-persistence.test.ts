/** PWA brief: persistent learner sign-in. Bounded renewal for registered learners, guests unchanged, rotation on upgrade, revocation. */
import { describe, expect, it } from "vitest";
import { COOKIE, SESSION_DAYS, SESSION_MAX_DAYS, commitRenewal, createSession, createUser, resolveSession, sha256 } from "../src/auth.ts";
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

/** Use a session at a given moment, as the dispatcher does for a successful request: look it up, then commit the renewal. */
const use = (db: ReturnType<typeof openDb>, token: string, at: Date) => {
  const s = resolveSession(db, token, at);
  if (s) commitRenewal(db, s, at);
  return s;
};

describe("registered learner sessions renew while used (bounded)", () => {
  it("the cookie is set once, to the session's absolute limit (365 days); the server enforces the 60-day idle window", async () => {
    const { client, db } = setup();
    const c = client();
    const r = await register(c);
    const set = r.headers.getSetCookie()[0]!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(Number(/Max-Age=(\d+)/.exec(set)![1])).toBe(SESSION_MAX_DAYS * 86400);
    const token = c.cookie.split("=")[1]!;
    expect(Math.abs(expiryOf(db, token) - (Date.now() + SESSION_DAYS * DAY))).toBeLessThan(60_000);
  });

  it("a successful request a day or more after the last renewal moves the server's end to 60 days from now, sending no cookie", async () => {
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
    expect(r.headers.getSetCookie()).toHaveLength(0); // nothing for a lost or failed response to drop
  });

  it("review P2: a FAILED request never renews; the browser's cookie and the server stay consistent", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    age(db, token, 59.75); // six hours left
    const before = expiryOf(db, token);
    const bad = await c.call("PATCH", "/api/me/profile", { selectedGrade: 99 });
    expect(bad.status).toBe(400);
    expect(bad.headers.getSetCookie()).toHaveLength(0);
    expect(expiryOf(db, token)).toBe(before);
    const ok = await c.get("/api/me");
    expect(ok.status).toBe(200);
    expect(expiryOf(db, token)).toBeGreaterThan(before + 50 * DAY);
  });

  it("renews at most once a day: a fresh session is not written to", async () => {
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
    const created = Date.now();
    const { token } = createSession(db, u.id, new Date(created));
    // Used every day for a year and a bit.
    let last: ReturnType<typeof resolveSession>;
    for (let d = 1; d <= SESSION_MAX_DAYS + 5; d++) last = use(db, token, new Date(created + d * DAY));
    expect(last).toBeUndefined();
    const cap = created + SESSION_MAX_DAYS * DAY;
    expect(Math.abs(expiryOf(db, token) - cap)).toBeLessThan(5_000);
    expect(resolveSession(db, token, new Date(cap - DAY))?.user.id).toBe(u.id);
    expect(resolveSession(db, token, new Date(cap + 1000))).toBeUndefined();
  });

  it("an unused session still ends 60 days after its last renewal", () => {
    const db = openDb(":memory:");
    const u = createUser(db, { displayName: "ada", email: "a@example.com", passwordHash: "x" });
    const t0 = Date.now();
    const { token } = createSession(db, u.id, new Date(t0));
    expect(use(db, token, new Date(t0 + 30 * DAY))?.renewTo).toBeDefined(); // renewed to t0+90
    expect(resolveSession(db, token, new Date(t0 + 30 * DAY + SESSION_DAYS * DAY + 1000))).toBeUndefined();
  });

  it("re-review: a session from before this change (60-day cookie) is honoured to its original end, never renewed, and no response sets a cookie", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    age(db, token, 59.75); // six hours left, as in the review
    db.prepare("UPDATE sessions SET cookie_expires_at = NULL WHERE token_hash = ?").run(sha256(token)); // as migration 012 leaves old rows
    const before = expiryOf(db, token);
    for (let i = 0; i < 2; i++) {
      const r = await c.get("/api/me"); // a lost reply and its retry alike
      expect(r.status).toBe(200);
      expect(r.headers.getSetCookie()).toHaveLength(0);
    }
    expect(expiryOf(db, token)).toBe(before); // still ends with its browser cookie
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 1000).toISOString(), sha256(token));
    expect((await c.get("/api/me")).status).toBe(401);
    // The next sign-in moves the learner to the renewable policy.
    const li = await c.post("/api/auth/login", { email: "ada@example.com", password: "correct horse" });
    expect(Number(/Max-Age=(\d+)/.exec(li.headers.getSetCookie()[0]!)![1])).toBe(SESSION_MAX_DAYS * 86400);
  });

  it("re-review: a slow request cannot revive a token that expired while it ran", () => {
    const db = openDb(":memory:");
    const u = createUser(db, { displayName: "ada", email: "a@example.com", passwordHash: "x" });
    const t0 = Date.now();
    const { token } = createSession(db, u.id, new Date(t0));
    const end = expiryOf(db, token);
    const seen = resolveSession(db, token, new Date(end - 1000)); // valid one second before its end, renewal due
    expect(seen?.renewTo).toBeDefined();
    expect(resolveSession(db, token, new Date(end + 1000))).toBeUndefined(); // expired meanwhile
    expect(commitRenewal(db, seen!, new Date(end + 1000))).toBe(false); // the late commit changes nothing
    expect(resolveSession(db, token, new Date(end + 2000))).toBeUndefined();
  });

  it("re-review: two overlapping requests renew once, not twice", () => {
    const db = openDb(":memory:");
    const u = createUser(db, { displayName: "ada", email: "a@example.com", passwordHash: "x" });
    const t0 = Date.now();
    const { token } = createSession(db, u.id, new Date(t0));
    const a = resolveSession(db, token, new Date(t0 + 10 * DAY))!;
    const b = resolveSession(db, token, new Date(t0 + 10 * DAY + 500))!;
    expect(commitRenewal(db, a, new Date(t0 + 10 * DAY))).toBe(true);
    expect(commitRenewal(db, b, new Date(t0 + 10 * DAY + 500))).toBe(false);
    expect(expiryOf(db, token)).toBe(new Date(a.renewTo!).getTime());
  });

  it("re-review: sign-out on a request whose session was due for renewal leaves nothing to renew", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const token = c.cookie.split("=")[1]!;
    age(db, token, 10);
    await c.post("/api/auth/logout");
    expect(db.prepare("SELECT 1 FROM sessions WHERE token_hash = ?").get(sha256(token))).toBeUndefined();
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

  it("sign-out on a request whose session was due for renewal clears the cookie and sends nothing else", async () => {
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

describe("review P1: a guest registration that races a sign-out or sign-in", () => {
  /** Start a registration whose body arrives only when `release()` is called: the request is in flight while other things happen. */
  function pausedRegistration(app: ReturnType<typeof setup>["app"], cookie: string, name: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const body = new ReadableStream<Uint8Array>({
      async start(ctl) {
        await gate;
        ctl.enqueue(new TextEncoder().encode(JSON.stringify({ email: `${name}@example.com`, password: "correct horse", displayName: name })));
        ctl.close();
      },
    });
    const done = app.fetch(new Request("http://test.local/api/auth/register", { method: "POST", headers: { "content-type": "application/json", cookie }, body, duplex: "half" } as RequestInit));
    return { release, done };
  }

  it("signing out while the registration is in flight wins: the registration is refused and issues no session", async () => {
    const { app, client, db } = setup();
    const c = client();
    const g = await c.post("/api/auth/guest");
    const guestCookie = c.cookie;
    const reg = pausedRegistration(app, guestCookie, "late");
    await new Promise((r) => setTimeout(r, 10));
    expect((await c.post("/api/auth/logout")).status).toBe(200);
    reg.release();
    const res = await reg.done;
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("session_ended");
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(g.body.user.id) as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT is_guest, email FROM users WHERE id = ?").get(g.body.user.id) as { is_guest: number; email: string | null })).toEqual({ is_guest: 1, email: null });
  });

  it("an overlapping sign-in on the same device wins: the late registration cannot replace its session", async () => {
    const { app, client } = setup();
    const other = client();
    await register(other, "bob");
    const c = client();
    await c.post("/api/auth/guest");
    const reg = pausedRegistration(app, c.cookie, "late");
    await new Promise((r) => setTimeout(r, 10));
    await c.post("/api/auth/login", { email: "bob@example.com", password: "correct horse" }); // ends the guest token, signs in bob
    reg.release();
    const res = await reg.done;
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((await c.get("/api/me")).body.user.email).toBe("bob@example.com");
  });

  it("the form's recovery sign-in (onlyIfSignedOut) never replaces a different learner who is signed in", async () => {
    const { client } = setup();
    const ada = client();
    await register(ada, "ada");
    await ada.post("/api/auth/logout");
    const c = client();
    await register(c, "bob"); // bob is signed in on this device
    const r = await c.post("/api/auth/login", { email: "ada@example.com", password: "correct horse", onlyIfSignedOut: true });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("signed_in");
    expect((await c.get("/api/me")).body.user.email).toBe("bob@example.com");
    // Already this account: answered with it, no new session. Signed out: a normal sign-in.
    const same = await c.post("/api/auth/login", { email: "bob@example.com", password: "correct horse", onlyIfSignedOut: true });
    expect(same.status).toBe(200);
    expect(same.headers.getSetCookie()).toHaveLength(0);
    const fresh = client();
    expect((await fresh.post("/api/auth/login", { email: "ada@example.com", password: "correct horse", onlyIfSignedOut: true })).body.user.email).toBe("ada@example.com");
  });
});
