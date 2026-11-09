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
  if (!token) return undefined;
  const r = db
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .get(sha256(token), now()) as UserRow | undefined;
  return r ? toUser(r) : undefined;
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
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private max = 10,
    private windowMs = 15 * 60_000,
    private maxKeys = 10_000,
  ) {}
  check(key: string, at = Date.now()) {
    if (this.hits.size >= this.maxKeys) {
      // Bound memory: drop expired windows first, then, if live keys alone fill the map, the oldest ones (Map keeps
      // insertion order). Evicting a live key forgets its count, which only matters to an attacker already holding
      // `maxKeys` distinct keys; unbounded growth would hand the same attacker a memory-exhaustion attack instead.
      for (const [k, v] of this.hits) if (v.reset <= at) this.hits.delete(k);
      for (const k of this.hits.keys()) {
        if (this.hits.size < this.maxKeys) break;
        this.hits.delete(k);
      }
    }
    const h = this.hits.get(key);
    if (!h || h.reset <= at) {
      this.hits.set(key, { count: 1, reset: at + this.windowMs });
      return;
    }
    if (++h.count > this.max) {
      throw new ApiError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");
    }
  }
}
