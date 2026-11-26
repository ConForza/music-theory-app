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

export function createSession(db: Db, userId: string): { token: string; maxAgeSeconds: number } {
  const token = randomBytes(32).toString("base64url");
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)").run(
    sha256(token),
    userId,
    created.toISOString(),
    expires.toISOString(),
  );
  return { token, maxAgeSeconds: SESSION_DAYS * 86400 };
}

export function userForToken(db: Db, token: string | undefined): User | undefined {
  return resolveSession(db, token)?.user;
}

/**
 * Session lifetime policy (PWA brief, "persistent learner authentication"):
 *
 *  - Every sign-in starts a session that ends SESSION_DAYS (60) after it was last renewed: an idle window, not a fixed term.
 *  - A REGISTERED learner's session is renewed while it is used: at most once a day, a request moves the end to SESSION_DAYS from now.
 *    It is never renewed past SESSION_MAX_DAYS (365) after the sign-in that created it; after that the learner signs in once more
 *    (password manager AutoFill makes that one tap). So a session is never valid indefinitely, and an unused one still ends after 60 days.
 *  - A GUEST's session is never renewed: guests keep the fixed 60 days they have always had (retention is an owner decision; the app
 *    already warns guests before it ends). Registering turns that guest into a registered learner with a new session.
 *  - Expiry is always the server's stored value; revocation (sign-out, account deletion) deletes the row, so the cookie stops working at once.
 */
export const SESSION_MAX_DAYS = 365;
/** A session is renewed at most this often, so an active learner costs one extra write a day, not one per request. */
export const SESSION_RENEW_EVERY_MS = 86400_000;
const DAY_MS = 86400_000;

export interface ResolvedSession {
  user: User;
  expiresAt: string;
  /** Set when this request renewed the session: send the cookie again with this Max-Age so the browser keeps it as long as the server. */
  renewedMaxAgeSeconds?: number;
}

/** Find the learner behind a session token, renewing a registered learner's session as described above. */
export function resolveSession(db: Db, token: string | undefined, at: Date = new Date()): ResolvedSession | undefined {
  if (!token) return undefined;
  const hash = sha256(token);
  const r = db
    .prepare("SELECT u.*, s.created_at AS s_created, s.expires_at AS s_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .get(hash, at.toISOString()) as (UserRow & { s_created: string; s_expires: string }) | undefined;
  if (!r) return undefined;
  const user = toUser(r);
  if (user.isGuest) return { user, expiresAt: r.s_expires };
  const nowMs = at.getTime();
  const current = new Date(r.s_expires).getTime();
  const cap = new Date(r.s_created).getTime() + SESSION_MAX_DAYS * DAY_MS;
  const next = Math.min(nowMs + SESSION_DAYS * DAY_MS, cap);
  // Renew only when the last renewal is at least a day old and the new end is actually later.
  if (next - current < SESSION_RENEW_EVERY_MS) return { user, expiresAt: r.s_expires };
  const expiresAt = new Date(next).toISOString();
  db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ? AND expires_at < ?").run(expiresAt, hash, expiresAt);
  return { user, expiresAt, renewedMaxAgeSeconds: Math.floor((next - nowMs) / 1000) };
}

/** Swap the caller's session for a fresh one for the same learner (a change of privilege, e.g. guest to registered): the old token stops working. */
export function rotateSession(db: Db, oldToken: string | undefined, userId: string): { token: string; maxAgeSeconds: number } {
  return tx(db, () => {
    const s = createSession(db, userId);
    destroySession(db, oldToken);
    return s;
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
