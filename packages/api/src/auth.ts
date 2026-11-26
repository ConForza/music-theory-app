import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_DAYS = 60;
export const COOKIE = "mtp_session";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString();

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 32, SCRYPT);
  const want = Buffer.from(keyHex, "hex");
  return key.length === want.length && timingSafeEqual(key, want);
}

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  isGuest: boolean;
}

interface UserRow {
  id: string;
  email: string | null;
  display_name: string;
  is_guest: number;
}
const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, displayName: r.display_name, isGuest: r.is_guest === 1 });

export function createUser(db: Db, opts: { displayName: string; email?: string; passwordHash?: string }): User {
  const id = randomUUID();
  const t = now();
  tx(db, () => {
    db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_guest, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?)").run(
      id,
      opts.email ?? null,
      opts.passwordHash ?? null,
      opts.displayName,
      opts.email ? 0 : 1,
      t,
      t,
    );
    db.prepare("INSERT INTO profiles (user_id, settings, updated_at) VALUES (?, '{}', ?)").run(id, t);
  });
  return { id, email: opts.email ?? null, displayName: opts.displayName, isGuest: !opts.email };
}

/** Turn a guest into a durable account in place: all of its progress stays attached. */
export function upgradeGuest(db: Db, userId: string, opts: { displayName: string; email: string; passwordHash: string }): User {
  const res = db
    .prepare("UPDATE users SET email = ?, password_hash = ?, display_name = ?, is_guest = 0 WHERE id = ? AND is_guest = 1")
    .run(opts.email, opts.passwordHash, opts.displayName, userId);
  if (res.changes !== 1) throw new ApiError(409, "not_guest", "This account is already registered.");
  return { id: userId, email: opts.email, displayName: opts.displayName, isGuest: false };
}

export function findByEmail(db: Db, email: string): (User & { passwordHash: string | null }) | undefined {
  const r = db.prepare("SELECT *, password_hash AS ph FROM users WHERE email = ?").get(email) as (UserRow & { ph: string | null }) | undefined;
  return r ? { ...toUser(r), passwordHash: r.ph } : undefined;
}

/**
 * Session lifetime policy (PWA brief, "persistent learner authentication"):
 *
 *  - Every sign-in starts a session that ends SESSION_DAYS (60) after it was last renewed: an idle window, not a fixed term.
 *  - A REGISTERED learner's session is renewed while it is used: at most once a day, a successful request moves the end to SESSION_DAYS
 *    from now. It is never renewed past SESSION_MAX_DAYS (365) after the sign-in that created it; after that the learner signs in once more
 *    (password manager AutoFill makes that one tap). So a session is never valid indefinitely, and an unused one still ends after 60 days.
 *  - A GUEST's session is never renewed: guests keep the fixed 60 days they have always had (retention is an owner decision; the app
 *    already warns guests before it ends). Registering turns that guest into a registered learner with a new session.
 *  - Expiry is always the server's stored value; revocation (sign-out, account deletion) deletes the row, so the cookie stops working at once.
 *
 * The COOKIE's lifetime is fixed when the session is created: the absolute limit (365 days for a registered learner, the fixed 60 days for
 * a guest). Renewal changes only the server's row and never needs to reach the browser, so a failed, lost or late response cannot leave the
 * browser with a shorter cookie than the server's session, and a late response can never overwrite a cookie set by a newer sign-in or
 * sign-out. A cookie that outlives its session is useless: the server rejects the token.
 *
 * Sessions created before this policy carry a cookie that ends 60 days after sign-in (`cookie_expires_at` is NULL). Their cookie is upgraded
 * to the absolute limit when they are renewed, on a successful response only; if that response is lost, the next daily renewal sends it again.
 */
export const SESSION_MAX_DAYS = 365;
/** A session is renewed at most this often, so an active learner costs one extra write a day, not one per request. */
export const SESSION_RENEW_EVERY_MS = 86400_000;
const DAY_MS = 86400_000;

/** Start a session for a learner. Returns the token and the cookie's Max-Age (the session's absolute limit). */
export function createSession(db: Db, userId: string, at: Date = new Date()): { token: string; maxAgeSeconds: number } {
  const guest = (db.prepare("SELECT is_guest FROM users WHERE id = ?").get(userId) as { is_guest: number } | undefined)?.is_guest === 1;
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(at.getTime() + SESSION_DAYS * DAY_MS);
  const cookieDays = guest ? SESSION_DAYS : SESSION_MAX_DAYS;
  const cookieUntil = new Date(at.getTime() + cookieDays * DAY_MS);
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, cookie_expires_at) VALUES (?,?,?,?,?)").run(
    sha256(token),
    userId,
    at.toISOString(),
    expires.toISOString(),
    cookieUntil.toISOString(),
  );
  return { token, maxAgeSeconds: cookieDays * 86400 };
}

export function userForToken(db: Db, token: string | undefined): User | undefined {
  return resolveSession(db, token)?.user;
}

export interface ResolvedSession {
  user: User;
  token: string;
  expiresAt: string;
  /** Set when this session is due for renewal. Nothing is written until `commitRenewal`, after the request has succeeded. */
  renewTo?: string;
  /** The session was created before cookies carried the absolute limit: a renewal also re-sends its cookie. */
  legacyCookie: boolean;
  /** When the session's absolute limit is reached (registered learners). */
  capAt: string;
}

/** Find the learner behind a session token. Read only: see `commitRenewal`. */
export function resolveSession(db: Db, token: string | undefined, at: Date = new Date()): ResolvedSession | undefined {
  if (!token) return undefined;
  const r = db
    .prepare("SELECT u.*, s.created_at AS s_created, s.expires_at AS s_expires, s.cookie_expires_at AS s_cookie FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .get(sha256(token), at.toISOString()) as (UserRow & { s_created: string; s_expires: string; s_cookie: string | null }) | undefined;
  if (!r) return undefined;
  const user = toUser(r);
  const cap = new Date(r.s_created).getTime() + SESSION_MAX_DAYS * DAY_MS;
  const base = { user, token, expiresAt: r.s_expires, legacyCookie: r.s_cookie === null, capAt: new Date(cap).toISOString() };
  if (user.isGuest) return base;
  const next = Math.min(at.getTime() + SESSION_DAYS * DAY_MS, cap);
  // Due only when the last renewal is at least a day old and the new end is actually later.
  if (next - new Date(r.s_expires).getTime() < SESSION_RENEW_EVERY_MS) return base;
  return { ...base, renewTo: new Date(next).toISOString() };
}

/**
 * Apply a renewal found by `resolveSession`, once the request has succeeded. Returns the Max-Age to re-send for a session whose cookie
 * predates the absolute-limit policy, or null when the browser's cookie needs nothing (the usual case).
 */
export function commitRenewal(db: Db, s: ResolvedSession, at: Date = new Date()): number | null {
  if (!s.renewTo) return null;
  const res = db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ? AND expires_at < ?").run(s.renewTo, sha256(s.token), s.renewTo);
  if (res.changes !== 1 || !s.legacyCookie) return null; // ended meanwhile (signed out), or a modern cookie that already lasts long enough
  return Math.max(0, Math.floor((new Date(s.capAt).getTime() - at.getTime()) / 1000));
}

/**
 * Turn a guest into a registered learner, atomically with the session it is asked from (a change of privilege, so the session is
 * replaced). Inside ONE transaction, after the slow password hash: the presented guest token must still be a live session of that same
 * guest; it is consumed, the account is upgraded in place (progress stays attached), and a new session is created. A registration that
 * raced a sign-out, a sign-in or the session's expiry is refused with `session_ended` and changes nothing.
 */
export function upgradeGuestWithSession(
  db: Db,
  token: string | undefined,
  userId: string,
  opts: { displayName: string; email: string; passwordHash: string },
): { user: User; session: { token: string; maxAgeSeconds: number } } {
  const ended = () => new ApiError(401, "session_ended", "Your guest session ended before your account could be created. Please try again.");
  if (!token) throw ended();
  return tx(db, () => {
    const at = new Date();
    const live = db
      .prepare("SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ? AND u.is_guest = 1")
      .get(sha256(token), userId, at.toISOString());
    if (!live) throw ended();
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(opts.email)) throw new ApiError(409, "email_taken", "That email is already registered. Try signing in.");
    if (db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token)).changes !== 1) throw ended();
    const user = upgradeGuest(db, userId, opts);
    return { user, session: createSession(db, userId, at) };
  });
}

/** How many days before a guest's sign-in ends the app starts warning them (a display setting, not a retention policy). */
export const GUEST_WARNING_DAYS = 14;

/** When the session behind this token ends (ISO), or null if there is none. */
export function sessionExpiry(db: Db, token: string | undefined): string | null {
  if (!token) return null;
  const r = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as { expires_at: string } | undefined;
  return r?.expires_at ?? null;
}

export function destroySession(db: Db, token: string | undefined) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function deleteUser(db: Db, userId: string) {
  // ON DELETE CASCADE removes sessions, profile, progress, attempts and hint records.
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

/** Tiny fixed-window limiter for credential endpoints (per process; put a shared store behind it when scaled out). */
export class RateLimiter {
  /**
   * Bound memory for a new key: drop expired windows first, then, if live keys alone fill the map, the oldest ones (Map
   * keeps insertion order). Evicting a live key forgets its count, which only matters to an attacker already holding
   * `maxKeys` distinct keys; unbounded growth would hand the same attacker a memory-exhaustion attack instead.
   */
  private makeRoom(at: number) {
    for (const [k, v] of this.hits) if (v.reset <= at) this.hits.delete(k);
    for (const k of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(k);
    }
  }
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private max = 10,
    private windowMs = 15 * 60_000,
    private maxKeys = 10_000,
  ) {}
  check(key: string, at = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.reset <= at) {
      // Only a key we have never seen can grow the map, so only then make room; a live key's window is never touched.
      if (!h && this.hits.size >= this.maxKeys) this.makeRoom(at);
      this.hits.delete(key); // re-insert at the end so "oldest" means least recently started
      this.hits.set(key, { count: 1, reset: at + this.windowMs });
      return;
    }
    if (++h.count > this.max) {
      throw new ApiError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");
    }
  }
}
