/**
 * Final public-release hardening (audit issue #19, P2-3, P2-4, P2-6): guest creation limits and client-address trust, guest conversion,
 * session expiry information, session and guest housekeeping with its safeguards, security headers on real HTTP responses, start-up and
 * shutdown, and export / deletion of everything a learner has (including the Brief 10 tables).
 */
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp, type App } from "../src/app.ts";
import { SESSION_DAYS } from "../src/auth.ts";
import { openDb } from "../src/db.ts";
import { GUEST_DELETION_APPROVAL, MAX_GUEST_DELETIONS_PER_RUN, describeRetention, retentionPolicyFromEnv, runRetention } from "../src/retention.ts";
import { createHttpServer, inlineScriptHashes, publicScheme, securityHeaders } from "../src/server.ts";
import { startServer } from "../src/startup.ts";
import { Client, playLesson, realCourse, sharedCourse } from "./helpers.ts";
import { answerAll, boot, learner } from "./prep-helpers.ts";

const H = { "content-type": "application/json" };
/** Call the app as a given TCP peer, as the HTTP server does (the address is never taken from a header unless proxies are declared). */
const guestFrom = (app: App, remoteAddress: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request("http://test.local/api/auth/guest", { method: "POST", headers: { ...H, ...headers }, body: "{}" }), { remoteAddress });
const userTables = (db: ReturnType<typeof openDb>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name).filter((n) => (db.prepare(`PRAGMA table_info(${n})`).all() as Array<{ name: string }>).some((c) => c.name === "user_id"));
const rowsOf = (db: ReturnType<typeof openDb>, userId: string) => Object.fromEntries(userTables(db).map((t) => [t, (db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(userId) as { c: number }).c]).filter(([, c]) => (c as number) > 0));
const age = (db: ReturnType<typeof openDb>, userId: string, days: number, now = new Date()) => {
  const then = new Date(now.getTime() - days * 86400_000).toISOString();
  db.prepare("UPDATE users SET last_seen_at = ?, created_at = ? WHERE id = ?").run(then, then, userId);
};
const expireSessions = (db: ReturnType<typeof openDb>, userId: string, daysAgo = 1) => db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(new Date(Date.now() - daysAgo * 86400_000).toISOString(), userId);

describe("guest account creation is limited per client address", () => {
  const mk = (extra: Partial<Parameters<typeof createApp>[0]> = {}) => createApp({ db: openDb(":memory:"), course: sharedCourse(), guestCreationsPer15Min: 5, ...extra });

  it("creates guests up to the limit, then answers 429 with the usual error shape, and other addresses are unaffected", async () => {
    const app = mk();
    for (let i = 0; i < 5; i++) expect((await guestFrom(app, "203.0.113.7")).status).toBe(200);
    const blocked = await guestFrom(app, "203.0.113.7");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: "rate_limited", message: expect.stringMatching(/wait/i) } });
    expect(blocked.headers.getSetCookie()).toEqual([]);
    expect((await guestFrom(app, "203.0.113.8")).status).toBe(200);
    expect((app.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c).toBe(6);
  });

  it("the default allows a class or household behind one address (60), and stops an automated loop", async () => {
    const app = createApp({ db: openDb(":memory:"), course: sharedCourse() });
    const codes: number[] = [];
    for (let i = 0; i < 300; i++) codes.push((await guestFrom(app, "198.51.100.4")).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(60);
    expect(codes.filter((c) => c === 429)).toHaveLength(240);
  });

  it("a spoofed X-Forwarded-For cannot dodge the limit when no proxy is trusted", async () => {
    const app = mk();
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await guestFrom(app, "203.0.113.9", { "x-forwarded-for": `10.0.0.${i}` })).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
  });

  it("behind one trusted proxy the real client is the entry the proxy appended; anything the client prepended is ignored", async () => {
    const app = mk({ trustedProxyHops: 1 });
    const codes: number[] = [];
    // The proxy (peer 10.1.1.1) appends the true client 203.0.113.50; the client varies a forged first entry on every request.
    for (let i = 0; i < 7; i++) codes.push((await guestFrom(app, "10.1.1.1", { "x-forwarded-for": `1.2.3.${i}, 203.0.113.50` })).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
    // A different real client behind the same proxy has its own allowance.
    expect((await guestFrom(app, "10.1.1.1", { "x-forwarded-for": "203.0.113.51" })).status).toBe(200);
  });

  it("a caller who already has a guest session gets it back: nothing is created and nothing is counted", async () => {
    const app = mk({ guestCreationsPer15Min: 1 });
    const c = new Client(app);
    const first = await c.post("/api/auth/guest");
    for (let i = 0; i < 5; i++) {
      const again = await c.post("/api/auth/guest");
      expect(again.status).toBe(200);
      expect(again.body.user.id).toBe(first.body.user.id);
    }
    expect((app.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c).toBe(1);
  });
});

describe("a guest who registers keeps the same account and all progress", () => {
  it("lesson progress, attempts, XP and the session survive the upgrade; the limiter does not stand in the way", async () => {
    const app = createApp({ db: openDb(":memory:"), course: realCourse(), guestCreationsPer15Min: 1, waiveUnwrittenPrerequisites: true });
    const c = new Client(app);
    const g = await c.post("/api/auth/guest");
    const done = await playLesson(c, realCourse(), "G1-U1-L01");
    expect(done.status).toBe(200);
    const before = rowsOf(app.db, g.body.user.id);
    expect(before.lesson_progress).toBeGreaterThan(0);
    expect(before.attempts).toBeGreaterThan(0);
    const reg = await c.post("/api/auth/register", { email: "keeper@example.com", password: "correct horse battery", displayName: "Keeper" });
    expect(reg.status).toBe(200);
    expect(reg.body.user).toMatchObject({ id: g.body.user.id, isGuest: false, email: "keeper@example.com" });
    expect(reg.body.session.guestAccessEndsInDays).toBeNull();
    expect(rowsOf(app.db, g.body.user.id)).toEqual(before);
    expect((await c.get("/api/progress")).body.nodes["G1-U1-L01"].state).toBe("completed");
    // The registered learner can come back on another device.
    const other = new Client(app);
    expect((await other.post("/api/auth/login", { email: "keeper@example.com", password: "correct horse battery" })).status).toBe(200);
    expect((await other.get("/api/progress")).body.nodes["G1-U1-L01"].state).toBe("completed");
  });
});

describe("the server says when a guest's access ends", () => {
  const { db, app } = boot();
  it("a new guest has the full session length; the figure comes from the stored expiry, and a registered learner gets no guest countdown", async () => {
    const c = new Client(app);
    const g = await c.post("/api/auth/guest");
    // Whole days left: 59 once a millisecond has passed since the session was made, 60 if the reply was computed in the same millisecond.
    expect([SESSION_DAYS - 1, SESSION_DAYS]).toContain(g.body.session.guestAccessEndsInDays);
    expect(new Date(g.body.session.expiresAt).getTime()).toBeGreaterThan(Date.now() + (SESSION_DAYS - 1) * 86400_000);
    expect(g.body.session.guestWarningDays).toBe(14);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(new Date(Date.now() + 3.5 * 86400_000).toISOString(), g.body.user.id);
    expect((await c.get("/api/me")).body.session.guestAccessEndsInDays).toBe(3);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(new Date(Date.now() + 3600_000).toISOString(), g.body.user.id);
    expect((await c.get("/api/me")).body.session.guestAccessEndsInDays).toBe(0);
  });
  it("once the session has expired the guest is signed out (401), and their data is still there until a retention policy says otherwise", async () => {
    const c = new Client(app);
    const g = await c.post("/api/auth/guest");
    expireSessions(db, g.body.user.id);
    expect((await c.get("/api/me")).status).toBe(401);
    expect((db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ?").get(g.body.user.id) as { c: number }).c).toBe(1);
  });
});

describe("housekeeping: expired sessions and guest retention", () => {
  it("reads the policy from the environment without ever inventing a period or enabling deletion", () => {
    expect(retentionPolicyFromEnv({})).toEqual({ guestInactiveDays: null, deleteGuests: false });
    expect(retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: "180" })).toEqual({ guestInactiveDays: 180, deleteGuests: false });
    expect(retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: "180", MTP_GUEST_RETENTION_APPROVED: GUEST_DELETION_APPROVAL })).toEqual({ guestInactiveDays: 180, deleteGuests: true });
    for (const v of ["true", "1", "yes", "OWNER-APPROVED", "owner-approved "]) expect(retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: "180", MTP_GUEST_RETENTION_APPROVED: v }).deleteGuests).toBe(false);
    for (const v of ["0", "-5", "abc", "1.5", "30 days"]) expect(retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: v, MTP_GUEST_RETENTION_APPROVED: GUEST_DELETION_APPROVAL })).toMatchObject({ guestInactiveDays: null, deleteGuests: false, problem: expect.any(String) });
    expect(retentionPolicyFromEnv({ MTP_GUEST_RETENTION_APPROVED: GUEST_DELETION_APPROVAL })).toMatchObject({ guestInactiveDays: null, deleteGuests: false, problem: expect.any(String) });
  });

  async function world() {
    const { db, app } = boot();
    const mkGuest = async () => (await learner(app, "g")).userId;
    const staleGuest = await mkGuest(); // inactive 400 days, session expired
    const staleGuestLive = await mkGuest(); // inactive 400 days by last_seen, but still holds a valid session
    const recentGuest = await mkGuest(); // seen 10 days ago, session expired
    const reg = await learner(app, "r");
    await reg.c.post("/api/auth/register", { email: "old@example.com", password: "correct horse battery", displayName: "Old" });
    for (const id of [staleGuest, staleGuestLive, reg.userId]) age(db, id, 400);
    age(db, recentGuest, 10);
    for (const id of [staleGuest, recentGuest, reg.userId]) expireSessions(db, id);
    // Give the stale guest real linked records in several tables, including Brief 10's.
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(new Date(Date.now() + 86400_000).toISOString(), staleGuest);
    const c = new Client(app);
    c.cookie = "";
    return { db, app, staleGuest, staleGuestLive, recentGuest, registered: reg.userId };
  }

  it("with no policy: expired sessions go, no guest is examined or deleted", async () => {
    const w = await world();
    expireSessions(w.db, w.staleGuest);
    const users = (w.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
    const r = runRetention(w.db, retentionPolicyFromEnv({}));
    expect(r.expiredSessionsRemoved).toBe(3);
    expect(r.guests).toEqual({ mode: "off", inactiveDays: null, eligible: 0, deleted: 0, deferred: 0 });
    expect((w.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c).toBe(users);
    expect((w.db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c).toBe(1); // the one still valid
    expect(runRetention(w.db, retentionPolicyFromEnv({})).expiredSessionsRemoved).toBe(0);
  });

  it("a period without the owner's approval is a dry run: it counts and deletes nothing; an explicit dry run changes nothing at all", async () => {
    const w = await world();
    expireSessions(w.db, w.staleGuest);
    const sessions = (w.db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c;
    const dry = runRetention(w.db, { guestInactiveDays: 365, deleteGuests: true }, { dryRun: true });
    expect(dry).toMatchObject({ expiredSessionsFound: 3, expiredSessionsRemoved: 0, guests: { mode: "dry-run", eligible: 1, deleted: 0 } });
    expect((w.db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c).toBe(sessions);
    const counted = runRetention(w.db, retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: "365" }));
    expect(counted.guests).toEqual({ mode: "dry-run", inactiveDays: 365, eligible: 1, deleted: 0, deferred: 0 });
    for (const id of [w.staleGuest, w.staleGuestLive, w.recentGuest, w.registered]) expect((w.db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ?").get(id) as { c: number }).c).toBe(1);
  });

  it("with period and approval: only the inactive guest with no usable sign-in is deleted, with every linked record; nobody else is touched", async () => {
    const { db, app } = boot();
    // A guest with real learning records, including a practice examination (Brief 10 tables).
    const G = await learner(app, "leaver");
    const v = await G.c.post("/api/exams/1/start", { mode: "practice" });
    await answerAll(app, G.c, G.userId, v.body.id, () => false, (i) => i < 4);
    await G.c.post(`/api/prep/attempts/${v.body.id}/complete`, { allowUnanswered: true });
    expect(Object.keys(rowsOf(db, G.userId))).toEqual(expect.arrayContaining(["prep_attempts", "prep_responses", "profiles", "sessions"]));
    const live = await learner(app, "live"); // equally old, but can still sign in
    const recent = await learner(app, "recent");
    const R = await learner(app, "reg");
    await R.c.post("/api/auth/register", { email: "stay@example.com", password: "correct horse battery", displayName: "Stay" });
    const Rrows = rowsOf(db, R.userId);
    for (const id of [G.userId, live.userId, R.userId]) age(db, id, 400);
    age(db, recent.userId, 10);
    for (const id of [G.userId, recent.userId, R.userId]) expireSessions(db, id);

    const r = runRetention(db, retentionPolicyFromEnv({ MTP_GUEST_RETENTION_DAYS: "365", MTP_GUEST_RETENTION_APPROVED: GUEST_DELETION_APPROVAL }));
    expect(r.guests).toEqual({ mode: "delete", inactiveDays: 365, eligible: 1, deleted: 1, deferred: 0 });
    expect(rowsOf(db, G.userId)).toEqual({});
    expect((db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ?").get(G.userId) as { c: number }).c).toBe(0);
    for (const id of [live.userId, recent.userId, R.userId]) expect((db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ?").get(id) as { c: number }).c).toBe(1);
    // The registered learner lost only the expired session row; every learning record is intact, however long they have been away.
    expect(rowsOf(db, R.userId)).toEqual(Object.fromEntries(Object.entries(Rrows).filter(([t]) => t !== "sessions")));
    expect((await live.c.get("/api/me")).status).toBe(200);
    // The log line and the report carry counts and settings only.
    const text = describeRetention(r) + JSON.stringify(r);
    for (const id of [G.userId, live.userId, R.userId]) expect(text).not.toContain(id);
    expect(text).not.toMatch(/example\.com|leaver|Stay/);
  });

  it("a registered learner is never eligible, even if the guest flag were wrong: email or password alone protects the row", () => {
    const db = openDb(":memory:");
    const old = new Date(Date.now() - 900 * 86400_000).toISOString();
    const ins = db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_guest, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?)");
    ins.run("u-reg", "a@example.com", "scrypt$x$y", "A", 0, old, old);
    ins.run("u-flag-wrong-email", "b@example.com", null, "B", 1, old, old);
    ins.run("u-flag-wrong-password", null, "scrypt$x$y", "C", 1, old, old);
    ins.run("u-guest", null, null, "Guest", 1, old, old);
    for (const id of ["u-reg", "u-flag-wrong-email", "u-flag-wrong-password", "u-guest"]) db.prepare("INSERT INTO profiles (user_id, settings, updated_at) VALUES (?, '{}', ?)").run(id, old);
    const r = runRetention(db, { guestInactiveDays: 1, deleteGuests: true });
    expect(r.guests).toMatchObject({ eligible: 1, deleted: 1 });
    expect((db.prepare("SELECT id FROM users ORDER BY id").all() as Array<{ id: string }>).map((x) => x.id)).toEqual(["u-flag-wrong-email", "u-flag-wrong-password", "u-reg"]);
  });

  it("one run never deletes more than the cap, and a nonsensical period deletes nothing", () => {
    const db = openDb(":memory:");
    const old = new Date(Date.now() - 900 * 86400_000).toISOString();
    const ins = db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_guest, created_at, last_seen_at) VALUES (?,NULL,NULL,'Guest',1,?,?)");
    for (let i = 0; i < MAX_GUEST_DELETIONS_PER_RUN + 25; i++) ins.run(`g-${i}`, old, old);
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(runRetention(db, { guestInactiveDays: bad, deleteGuests: true }).guests).toMatchObject({ mode: "off", deleted: 0 });
    const r = runRetention(db, { guestInactiveDays: 365, deleteGuests: true });
    expect(r.guests).toMatchObject({ eligible: MAX_GUEST_DELETIONS_PER_RUN + 25, deleted: MAX_GUEST_DELETIONS_PER_RUN, deferred: 25 });
    expect(runRetention(db, { guestInactiveDays: 365, deleteGuests: true }).guests).toMatchObject({ eligible: 25, deleted: 25, deferred: 0 });
  });
});

describe("export and deletion still cover everything, including Brief 10 data", () => {
  it("the export holds the learner's practice-exam, placement and revision records and nobody else's; deleting the account leaves no row", async () => {
    const { db, app } = boot();
    const L = await learner(app, "mine");
    const other = await learner(app, "other");
    const v = await L.c.post("/api/exams/1/start", { mode: "mock" });
    await answerAll(app, L.c, L.userId, v.body.id, () => false, (i) => i < 6);
    await L.c.post(`/api/prep/attempts/${v.body.id}/complete`, { allowUnanswered: true });
    await L.c.post("/api/placement/start", {});
    await other.c.post("/api/exams/1/start", { mode: "mock" });
    const ex = await L.c.get("/api/me/export");
    expect(ex.status).toBe(200);
    expect(ex.body.prepAttempts).toHaveLength(2);
    expect(ex.body.prepResponses).toHaveLength(6);
    for (const k of ["prepHintUses", "placementStarts", "revisionSessions", "revisionAttempts", "questionExposure"]) expect(Array.isArray(ex.body[k]), k).toBe(true);
    const text = JSON.stringify(ex.body);
    expect(text).not.toContain(other.userId);
    expect(text).not.toMatch(/password_hash|token_hash|scrypt\$/);
    // Every table that holds this learner's rows appears in the export.
    const exported = new Set(Object.values(ex.body).filter(Array.isArray).flat().length ? Object.keys(ex.body) : []);
    expect(exported.size).toBeGreaterThan(15);
    const otherRows = rowsOf(db, other.userId);
    expect((await L.c.call("DELETE", "/api/me", { userId: (await L.c.get("/api/me")).body.user.id })).status).toBe(200);
    expect(rowsOf(db, L.userId)).toEqual({});
    expect((db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ?").get(L.userId) as { c: number }).c).toBe(0);
    expect(rowsOf(db, other.userId)).toEqual(otherRows);
    expect((await L.c.get("/api/me")).status).toBe(401);
  });
});

describe("security headers on real HTTP responses", () => {
  const INDEX = `<!doctype html><html><head><script>try{var t=1}catch(e){}</script><script type="module" src="/assets/x.js"></script></head><body><div id="root"></div></body></html>`;
  async function serve(opts: Parameters<typeof createHttpServer>[2] = {}, appOpts: Partial<Parameters<typeof createApp>[0]> = {}) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "mtp-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), INDEX);
    writeFileSync(join(dir, "assets", "x.js"), "console.log(1)");
    const app = createApp({ db: openDb(":memory:"), course: sharedCourse(), ...appOpts });
    const server = createHttpServer(app, dir, opts);
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, close: () => new Promise((r) => server.close(r)) };
  }
  const expectBaseline = (h: Headers) => {
    const csp = h.get("content-security-policy")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("x-frame-options")).toBe("DENY");
  };

  it("every kind of response carries them: API success, API error, the web app, an asset, a missing asset, and a rejected oversized body", async () => {
    const s = await serve();
    try {
      const responses = await Promise.all([
        fetch(`${s.base}/api/health`),
        fetch(`${s.base}/api/me`),
        fetch(`${s.base}/api/nope`),
        fetch(`${s.base}/`),
        fetch(`${s.base}/learn`),
        fetch(`${s.base}/assets/x.js`),
        fetch(`${s.base}/assets/missing.js`),
        fetch(`${s.base}/api/auth/guest`, { method: "POST", headers: H, body: "{}" }),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 401, 404, 200, 200, 200, 404, 200]);
      for (const r of responses) expectBaseline(r.headers);
      expect(responses[0]!.headers.get("strict-transport-security")).toBeNull();
      const big = await fetch(`${s.base}/api/auth/login`, { method: "POST", headers: H, body: "x".repeat(1_200_000) }).catch(() => null);
      if (big) expectBaseline(big.headers);
    } finally {
      await s.close();
    }
  });

  it("the policy allows exactly the inline script that index.html contains, by hash, and no other inline script", async () => {
    const [hash] = inlineScriptHashes(INDEX);
    expect(inlineScriptHashes(INDEX)).toHaveLength(1); // the module script has a src and needs no hash
    const s = await serve();
    try {
      const csp = (await fetch(`${s.base}/`)).headers.get("content-security-policy")!;
      expect(csp).toContain(`script-src 'self' ${hash}`);
      expect(csp).toContain("style-src 'self'");
    } finally {
      await s.close();
    }
  });

  it("Strict-Transport-Security is sent only when the deployment is declared HTTPS, never because a request claims it", async () => {
    const plain = await serve();
    const https = await serve({ https: true });
    try {
      expect((await fetch(`${plain.base}/api/health`, { headers: { "x-forwarded-proto": "https" } })).headers.get("strict-transport-security")).toBeNull();
      expect((await fetch(`${https.base}/api/health`)).headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    } finally {
      await plain.close();
      await https.close();
    }
  });

  it("x-forwarded-proto is ignored unless proxies are declared, so a client cannot choose the scheme the origin check uses", async () => {
    expect(publicScheme("https", {})).toBe("http");
    expect(publicScheme("https", { trustedProxyHops: 1 })).toBe("https");
    expect(publicScheme("https, http", { trustedProxyHops: 1 })).toBe("http"); // the nearest proxy's entry wins over what a client sent first
    expect(publicScheme(undefined, { https: true })).toBe("https");
    expect(publicScheme("http", { https: true })).toBe("https");
    const s = await serve();
    try {
      const host = s.base.replace("http://", "");
      // A cross-scheme "origin" that only matches if the forged header were believed must still be refused.
      const forged = await fetch(`${s.base}/api/auth/guest`, { method: "POST", headers: { ...H, origin: `https://${host}`, "x-forwarded-proto": "https" }, body: "{}" });
      expect(forged.status).toBe(403);
      const honest = await fetch(`${s.base}/api/auth/guest`, { method: "POST", headers: { ...H, origin: `http://${host}` }, body: "{}" });
      expect(honest.status).toBe(200);
    } finally {
      await s.close();
    }
  });

  it("when a reverse proxy is declared responsible, the app sends none (so the two layers never disagree)", async () => {
    expect(securityHeaders({ securityHeaders: "proxy" })).toEqual({});
    const s = await serve({ securityHeaders: "proxy" });
    try {
      const h = (await fetch(`${s.base}/api/health`)).headers;
      expect(h.get("content-security-policy")).toBeNull();
      expect(h.get("x-frame-options")).toBeNull();
    } finally {
      await s.close();
    }
  });

  it("the guest limit over real HTTP keys on the TCP peer, whatever X-Forwarded-For says", async () => {
    const s = await serve({}, { guestCreationsPer15Min: 3 });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await fetch(`${s.base}/api/auth/guest`, { method: "POST", headers: { ...H, "x-forwarded-for": `9.9.9.${i}` }, body: "{}" })).status);
      expect(codes).toEqual([200, 200, 200, 429, 429]);
    } finally {
      await s.close();
    }
  });
});

describe("start-up, readiness and shutdown", () => {
  const quiet = () => undefined;
  const mkApp = (course = sharedCourse()) => createApp({ db: openDb(":memory:"), course });

  it("warms the pools, runs housekeeping, and only then listens; health answers; stop closes cleanly", async () => {
    const lines: string[] = [];
    const app = mkApp();
    const run = await startServer({ app, port: 0, warmPools: true, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: (l) => lines.push(l) });
    expect(run.warm!.candidates).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^Review pools ready: \d+ candidates in/);
    expect(lines[1]).toMatch(/^Retention: 0 of 0 expired sessions removed; guest accounts: no retention period configured/);
    expect(app.engagement.review.warmPools(), "nothing is left to sample after start-up").toBe(0);
    const res = await fetch(`http://127.0.0.1:${run.port}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await run.stop();
    await expect(fetch(`http://127.0.0.1:${run.port}/api/health`)).rejects.toThrow();
    await run.stop(); // idempotent
  });

  it("a failing warm-up fails start-up visibly and the port is never opened", async () => {
    const app = mkApp();
    let listened = false;
    app.engagement.review.warmPools = () => {
      throw new Error("generator exploded");
    };
    const net = await import("node:net");
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, r));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((r) => probe.close(r));
    await expect(startServer({ app, port, warmPools: true, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet }).then((r) => { listened = true; return r.stop(); })).rejects.toThrow(/Start-up failed while sampling the review question pools.*did not start listening.*generator exploded/);
    expect(listened).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  it("content with nothing to sample is a failed start, not a silent one", async () => {
    const app = mkApp();
    app.engagement.review.warmPools = () => 0;
    await expect(startServer({ app, port: 0, warmPools: true, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet })).rejects.toThrow(/no review question pool could be sampled/);
  });

  it("a port that is already taken rejects instead of hanging", async () => {
    const first = await startServer({ app: mkApp(), port: 0, warmPools: false, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet });
    await expect(startServer({ app: mkApp(), port: first.port, warmPools: false, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet })).rejects.toThrow(/EADDRINUSE/);
    await first.stop();
  });

  it("shutdown lets a request in flight finish before the database closes", async () => {
    const app = mkApp();
    const run = await startServer({ app, port: 0, warmPools: false, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet });
    // A request whose body is still arriving when shutdown begins: headers sent and the connection open, the body finished afterwards.
    const http = await import("node:http");
    const req = http.request({ host: "127.0.0.1", port: run.port, path: "/api/auth/guest", method: "POST", headers: { ...H, "content-length": "2" } });
    const response = new Promise<{ status: number; body: string }>((resolve, reject) => {
      req.on("error", reject);
      req.on("response", (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
    });
    req.flushHeaders();
    await new Promise<void>((r) => (req.socket?.connecting === false ? r() : req.once("socket", (sock) => (sock.connecting ? sock.once("connect", () => r()) : r()))));
    await new Promise((r) => setTimeout(r, 50));
    const stopped = run.stop();
    await new Promise((r) => setTimeout(r, 50));
    req.end("{}");
    const res = await response;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).user.isGuest).toBe(true);
    // New connections are refused while it drains.
    await stopped;
  });

  it("with the full Grades 1-5 curriculum: start-up completes, and the first review overview of an advanced learner is fast", async () => {
    const { completeGrades } = await import("./prep-helpers.ts");
    const { ensureDone } = await import("./helpers.ts");
    const db = openDb(":memory:");
    const app = createApp({ db, course: realCourse(), waiveUnwrittenPrerequisites: false, testClock: true, prepStartsPer10Min: 1000 });
    const t0 = performance.now();
    const run = await startServer({ app, port: 0, warmPools: true, retention: retentionPolicyFromEnv({}), retentionEveryMs: 0, log: quiet });
    const startSeconds = (performance.now() - t0) / 1000;
    try {
      expect(run.warm!.candidates).toBeGreaterThan(300);
      const L = await learner(app, "advanced");
      completeGrades(app, db, L.userId, 4);
      await ensureDone(L.c, app, L.userId, "G5-U1-P1");
      const cookie = L.c.cookie;
      const t1 = performance.now();
      const res = await fetch(`http://127.0.0.1:${run.port}/api/review`, { headers: { cookie } });
      const firstReviewMs = performance.now() - t1;
      expect(res.status).toBe(200);
      console.log(`[benchmark] full-curriculum start-up ${startSeconds.toFixed(1)} s (${run.warm!.candidates} candidates); first GET /api/review for a Grade 5 learner ${firstReviewMs.toFixed(0)} ms`);
      expect(firstReviewMs).toBeLessThan(3000);
    } finally {
      await run.stop();
    }
  }, 600_000);
});
