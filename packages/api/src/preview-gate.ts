/**
 * Private-preview access gate (issue #24). Runs before every route, API and web app alike, so an uninvited visitor reads nothing.
 *
 * Method: HTTP Basic authentication, one entry per adult/internal tester, separate from learner accounts (which stay untouched behind it).
 * The browser prompts once and then sends the header on every same-origin request, so the React app needs no change. Credentials are never
 * in the repository: `MTP_PREVIEW_ACCESS` (a Railway variable) holds only `name:sha256hex(password)` entries, one per tester, separated by
 * commas, and the passwords are random 24-byte values made by `scripts/preview-invite.ts`. Revoking a tester removes the entry and redeploys.
 *
 * Fail closed: `MTP_PREVIEW_GATE=1` with no valid entries denies everyone. The only unauthenticated route is read-only `GET /api/health`
 * (the platform's readiness probe); it opens no login, guest, registration or student route.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface PreviewGate {
  /** Number of testers currently allowed. */
  testers: number;
  /** True when this request may proceed. */
  allows(method: string, pathname: string, authorization: string | undefined): boolean;
}

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function hashPassword(password: string): string {
  return sha256hex(password);
}

/** A fresh tester credential: a name, a random password to hand over once, and the entry to add to MTP_PREVIEW_ACCESS. */
export function newInvite(name: string): { name: string; password: string; entry: string } {
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(name)) throw new Error("Tester name: letters, digits, '.', '_' or '-', up to 32 characters.");
  const password = randomBytes(24).toString("base64url");
  return { name, password, entry: `${name}:${hashPassword(password)}` };
}

export function parseAccess(value: string | undefined): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const raw of (value ?? "").split(",")) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]{0,31}):([0-9a-f]{64})\s*$/.exec(raw);
    if (m) out.set(m[1]!, Buffer.from(m[2]!, "hex"));
  }
  return out;
}

export function createPreviewGate(access: string | undefined): PreviewGate {
  const testers = parseAccess(access);
  return {
    testers: testers.size,
    allows(method, pathname, authorization) {
      if (pathname === "/api/health" && method === "GET") return true;
      const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(authorization ?? "");
      if (!m) return false;
      const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
      const i = decoded.indexOf(":");
      if (i < 1) return false;
      const want = testers.get(decoded.slice(0, i));
      // Hash first so the comparison is fixed-length and constant-time; an unknown name still costs one hash.
      const got = Buffer.from(sha256hex(decoded.slice(i + 1)), "hex");
      return want !== undefined && timingSafeEqual(got, want);
    },
  };
}

export const GATE_REALM = 'Basic realm="Music Theory Path private preview (invited adult testers only; draft content)", charset="UTF-8"';
