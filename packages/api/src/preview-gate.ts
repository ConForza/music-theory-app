/**
 * Private-preview access gate (issue #24; sign-in form added by the PWA brief). Runs before every route, API and web app alike, so an
 * uninvited visitor reads nothing.
 *
 * Who is invited: `MTP_PREVIEW_ACCESS` (a Railway variable) holds `name:sha256hex(password)` entries, one per adult/internal tester,
 * comma-separated. The passwords are random 24-byte values made by `scripts/preview-invite.ts`; only hashes are ever stored.
 *
 * How a tester gets through. Issue #24 used HTTP Basic authentication. A Home Screen web app on iPhone has its own cookie and credential
 * store, re-prompts for Basic credentials on launch (or cannot show the prompt at all), and the browser fetches the web app manifest and
 * icons WITHOUT credentials, so installation metadata was refused. The gate therefore now:
 *
 *  1. shows its own small sign-in page (`/preview/signin`) where the tester enters the same name and password they were sent. A correct
 *     entry creates a PREVIEW SESSION: a random 256-bit token in an HttpOnly, SameSite=Lax (Secure over HTTPS) cookie `mtp_preview`, stored
 *     only as a SHA-256 hash in `preview_sessions`. It is separate from learner sign-in (`mtp_session`): it identifies no learner and opens no
 *     account; the learner still signs in, or continues as a guest, inside the app.
 *  2. still accepts an `Authorization: Basic` header from the same credentials (scripts, `curl -u`, browsers that cached it), but never
 *     sends a `WWW-Authenticate` challenge, so no browser dialog appears.
 *
 * Revocation: a preview session is valid only while the exact entry it was issued under is still in MTP_PREVIEW_ACCESS. Removing a tester
 * (or replacing their password) and redeploying ends every session issued to them; stale rows are deleted at start-up.
 *
 * Lifetime: a preview session ends PREVIEW_SESSION_DAYS after it was last used (renewed at most daily) and never later than
 * PREVIEW_MAX_DAYS after the sign-in, so a tester enters the preview password about once per device (and once in an installed app).
 *
 * Open without a preview session, and nothing else: read-only `GET /api/health` (Railway's healthcheck), the sign-in page and its
 * stylesheet, and the installation metadata listed in PUBLIC_INSTALL_PATHS (manifest and icons; GET/HEAD, exact paths only). None of them
 * contains course material, account data or an entry point to guest, registration or sign-in routes.
 *
 * Fail closed: `MTP_PREVIEW_GATE=1` with no valid entries lets nobody through except to those open resources.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { RateLimiter } from "./auth.ts";
import type { Db } from "./db.ts";
import { tx } from "./db.ts";
import { ApiError } from "./errors.ts";
import { clientKey } from "./net.ts";

export const PREVIEW_COOKIE = "mtp_preview";
export const PREVIEW_SESSION_DAYS = 60;
export const PREVIEW_MAX_DAYS = 180;
const DAY_MS = 86400_000;
export const SIGNIN_PATH = "/preview/signin";
export const SIGNOUT_PATH = "/preview/signout";
const STYLE_PATH = "/preview/style.css";
export const STATUS_PATH = "/preview/session";

/** Installation metadata a browser fetches without cookies (the manifest request omits credentials) or before the tester signs in. */
export const PUBLIC_INSTALL_PATHS: ReadonlySet<string> = new Set([
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
]);

/** What the gate needs to know about a request. Header names are lower case. */
export interface GateRequest {
  method: string;
  url: URL;
  header: (name: string) => string | undefined;
  remoteAddress?: string;
  /** The request body as text; only read for the gate's own sign-in form. */
  body: () => Promise<string>;
}
/**
 * `pass`: let the request through. `afterSuccess`, when given, renews the preview session; the server calls it only if the response it
 * finally sends is successful (status below 400), so a rejected or failed request never extends a session.
 */
export type GateDecision = { pass: true; cookies: string[]; afterSuccess?: () => void } | { pass: false; response: Response };

export type Audience = "testers" | "students";

export interface PreviewGate {
  /** Number of testers currently allowed. */
  testers: number;
  audience: Audience;
  check(req: GateRequest): Promise<GateDecision>;
}

export interface GateOptions {
  db: Db;
  /** Mark the preview cookie Secure (the deployment is HTTPS: MTP_SECURE_COOKIES=1). */
  secureCookies?: boolean;
  /** Origins allowed to post the sign-in form besides the request's own (MTP_ALLOWED_ORIGINS). */
  allowedOrigins?: string[];
  trustedProxyHops?: number;
  /**
   * Who signs in (MTP_AUDIENCE). "testers" (default): the adult preview, tester name and password. "students": the student release, where
   * a learner types only the CLASS CODE their teacher gave them (see newClassCode); wording is written for children and parents. The
   * mechanism is the same in both: the same entries, sessions, revocation and rate limits; a tester's password still works as a code.
   */
  audience?: Audience;
  /** For tests. */
  now?: () => Date;
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

/**
 * Class codes are typed by children, often on a phone: 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown in
 * groups of four (`K7QM-3PXA-R9TD-H2WN`), 80 random bits. Case, spaces and hyphens are ignored when typed.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function normaliseClassCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, "");
}

/** A fresh class (or family) code: the code to hand to students once, and the entry to add to MTP_PREVIEW_ACCESS. */
export function newClassCode(name: string): { name: string; code: string; entry: string } {
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(name)) throw new Error("Class name: letters, digits, '.', '_' or '-', up to 32 characters.");
  // Rejection sampling keeps every character equally likely (31 symbols; 16 characters is just over 79 bits).
  let raw = "";
  while (raw.length < 16) for (const b of randomBytes(32)) if (b < 248 && raw.length < 16) raw += CODE_ALPHABET[b % 31];
  const code = raw.match(/.{4}/g)!.join("-");
  return { name, code, entry: `${name}:${hashPassword(normaliseClassCode(code))}` };
}

export function parseAccess(value: string | undefined): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const raw of (value ?? "").split(",")) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]{0,31}):([0-9a-f]{64})\s*$/.exec(raw);
    if (m) out.set(m[1]!, Buffer.from(m[2]!, "hex"));
  }
  return out;
}

/** Ties a session to one exact entry: a removed or re-issued tester no longer matches. */
const fingerprint = (name: string, hash: Buffer) => sha256hex(`mtp-preview-v1:${name}:${hash.toString("hex")}`);

/** A same-site path to return to after signing in; anything else (another site, the gate's own pages, the API) becomes "/". */
export function safeNext(v: string | null | undefined): string {
  if (!v || v.length > 512 || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  // No control characters or backslashes (browsers treat "\\" like "/", which could turn a path into another host).
  for (const ch of v) if (ch === "\\" || ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f) return "/";
  if (v.startsWith("/preview/") || v.startsWith("/api/")) return "/";
  return v;
}

function cookieHeader(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** An asset request (script, style, image, font...) as opposed to a page: refused with 401 instead of being sent to the sign-in page. */
const looksLikeAsset = (pathname: string) => /\.(js|css|svg|json|png|ico|webmanifest|woff2|map|txt|html)$/i.test(pathname);

export function createPreviewGate(access: string | undefined, opts: GateOptions): PreviewGate {
  const testers = parseAccess(access);
  const { db } = opts;
  const audience: Audience = opts.audience ?? "testers";
  const students = audience === "students";
  const now = opts.now ?? (() => new Date());
  const current = new Map([...testers].map(([name, hash]) => [name, fingerprint(name, hash)]));

  // Start-up: forget sessions of testers who were removed or re-issued, and expired ones. Revocation therefore also deletes the rows.
  tx(db, () => {
    const rows = db.prepare("SELECT token_hash, tester, access_fingerprint, expires_at FROM preview_sessions").all() as Array<{ token_hash: string; tester: string; access_fingerprint: string; expires_at: string }>;
    const del = db.prepare("DELETE FROM preview_sessions WHERE token_hash = ?");
    const at = now().toISOString();
    for (const r of rows) if (current.get(r.tester) !== r.access_fingerprint || r.expires_at <= at) del.run(r.token_hash);
  });

  const ipLimiter = new RateLimiter(100);
  const nameLimiter = new RateLimiter(20);

  const cookie = (token: string, maxAge: number) =>
    `${PREVIEW_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${opts.secureCookies ? "; Secure" : ""}`;
  const clear = () => `${PREVIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${opts.secureCookies ? "; Secure" : ""}`;

  /**
   * Constant-time check of a name and password against the invitations; an unknown name still costs the hashes. The secret matches as
   * typed (tester passwords are case-sensitive) or in class-code form (case, spaces and hyphens ignored).
   */
  function matches(want: Buffer, exact: Buffer, code: Buffer): boolean {
    return timingSafeEqual(exact, want) || timingSafeEqual(code, want);
  }
  const digests = (password: string) => [Buffer.from(sha256hex(password), "hex"), Buffer.from(sha256hex(normaliseClassCode(password)), "hex")] as const;
  function verify(name: string, password: string): boolean {
    const want = testers.get(name);
    const [exact, code] = digests(password);
    return want !== undefined && matches(want, exact, code);
  }
  /** Students mode: the code alone. Every entry is compared (no early exit), and the entry it belongs to is returned. */
  function entryForCode(password: string): string | undefined {
    const [exact, code] = digests(password);
    let found: string | undefined;
    for (const [name, want] of testers) if (matches(want, exact, code) && found === undefined) found = name;
    return found;
  }

  function basicOk(authorization: string | undefined): boolean {
    const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(authorization ?? "");
    if (!m) return false;
    const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 1) return false;
    return verify(decoded.slice(0, i), decoded.slice(i + 1));
  }

  /**
   * Whether a cookie token is a valid preview session (read only), and how to renew it. The cookie itself already lasts to the session's
   * absolute limit (set once at sign-in), so renewal never has to reach the browser. The renewal is applied only after a successful
   * response (see GateDecision), conditional on the row as it is then: still live, and its end at least a day older than the new one.
   */
  function session(token: string | undefined): { renew: () => void } | undefined {
    if (!token || token.length > 200) return undefined;
    const hash = sha256hex(token);
    const at = now();
    const r = db.prepare("SELECT tester, access_fingerprint, created_at, expires_at FROM preview_sessions WHERE token_hash = ? AND expires_at > ?").get(hash, at.toISOString()) as
      | { tester: string; access_fingerprint: string; created_at: string; expires_at: string }
      | undefined;
    if (!r) return undefined;
    // The row was found by the token's hash; this only asks whether its invitation is still the current one (not a secret comparison).
    if (current.get(r.tester) !== r.access_fingerprint) return undefined;
    const cap = new Date(r.created_at).getTime() + PREVIEW_MAX_DAYS * DAY_MS;
    return {
      renew: () => {
        const t = now();
        const next = Math.min(t.getTime() + PREVIEW_SESSION_DAYS * DAY_MS, cap);
        db.prepare("UPDATE preview_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ? AND expires_at <= ?").run(
          new Date(next).toISOString(),
          hash,
          t.toISOString(),
          new Date(next - DAY_MS).toISOString(),
        );
      },
    };
  }

  function issue(name: string, oldToken: string | undefined): string {
    const token = randomBytes(32).toString("base64url");
    const at = now();
    tx(db, () => {
      if (oldToken) db.prepare("DELETE FROM preview_sessions WHERE token_hash = ?").run(sha256hex(oldToken));
      db.prepare("INSERT INTO preview_sessions (token_hash, tester, access_fingerprint, created_at, expires_at) VALUES (?,?,?,?,?)").run(
        sha256hex(token),
        name,
        current.get(name)!,
        at.toISOString(),
        new Date(at.getTime() + PREVIEW_SESSION_DAYS * DAY_MS).toISOString(),
      );
    });
    // The cookie lasts to the absolute limit; the server's 60-day idle window decides whether it still works.
    return cookie(token, PREVIEW_MAX_DAYS * 86400);
  }

  const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  const redirect = (to: string, cookies: string[] = []) => {
    const h = new Headers({ ...noStore, location: to });
    for (const c of cookies) h.append("set-cookie", c);
    return new Response(null, { status: 303, headers: h });
  };
  const page = (status: number, next: string, error?: string) =>
    new Response(signInPage(next, audience, error), { status, headers: { ...noStore, "content-type": "text/html; charset=utf-8" } });

  const sameOrigin = (req: GateRequest) => {
    const origin = req.header("origin");
    if (origin === undefined) return true;
    return origin === req.url.origin || (opts.allowedOrigins ?? []).includes(origin);
  };

  async function signIn(req: GateRequest, token: string | undefined): Promise<Response> {
    if (!sameOrigin(req)) return new Response("Cross-site requests are not allowed.", { status: 403, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } });
    if (!(req.header("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return new Response("Send the sign-in form.", { status: 415, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } });
    const text = await req.body();
    if (text.length > 4096) return new Response("Request too large.", { status: 413, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } });
    const form = new URLSearchParams(text);
    const name = (form.get("username") ?? "").trim().slice(0, 64);
    const password = (form.get("password") ?? "").slice(0, 256);
    const next = safeNext(form.get("next"));
    // Students type only a code; a name, when sent (scripts, the testers' form), is still checked against its own entry.
    const codeOnly = students && !name;
    try {
      ipLimiter.check(`pv-ip:${clientKey(new Headers({ "x-forwarded-for": req.header("x-forwarded-for") ?? "" }), req.remoteAddress, opts.trustedProxyHops ?? 0)}`);
      if (!codeOnly) nameLimiter.check(`pv-name:${name.toLowerCase()}`);
    } catch (e) {
      if (e instanceof ApiError) return page(429, next, "Too many attempts. Please wait a few minutes and try again.");
      throw e;
    }
    if (codeOnly) {
      const entry = password ? entryForCode(password) : undefined;
      if (!entry) return page(401, next, "That class code didn't work. Check the code your teacher gave you and try again.");
      return redirect(next, [issue(entry, token)]);
    }
    if (!name || !password || !verify(name, password)) {
      return page(401, next, students ? "That class code didn't work. Check the code your teacher gave you and try again." : "That tester name and password don't match an invitation. Check the message you were sent and try again.");
    }
    return redirect(next, [issue(name, token)]);
  }

  return {
    testers: testers.size,
    audience,
    async check(req) {
      const { method, url } = req;
      const path = url.pathname;
      if (path === "/api/health" && method === "GET") return { pass: true, cookies: [] };
      if (path === STYLE_PATH && (method === "GET" || method === "HEAD")) {
        return { pass: false, response: new Response(STYLE, { status: 200, headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" } }) };
      }
      const token = cookieHeader(req.header("cookie"), PREVIEW_COOKIE);
      const live = session(token);
      const viaSession = live !== undefined;
      const authed = viaSession || basicOk(req.header("authorization"));

      if (path === SIGNIN_PATH) {
        if (method === "POST") return { pass: false, response: await signIn(req, token) };
        if (method !== "GET" && method !== "HEAD") return { pass: false, response: new Response("Method not allowed.", { status: 405, headers: noStore }) };
        const next = safeNext(url.searchParams.get("next"));
        return { pass: false, response: authed ? redirect(next) : page(200, next) };
      }
      if (path === SIGNOUT_PATH) {
        if (method !== "POST") return { pass: false, response: new Response("Method not allowed.", { status: 405, headers: noStore }) };
        if (!sameOrigin(req)) return { pass: false, response: new Response("Cross-site requests are not allowed.", { status: 403, headers: noStore }) };
        if (token) db.prepare("DELETE FROM preview_sessions WHERE token_hash = ?").run(sha256hex(token));
        return { pass: false, response: redirect(SIGNIN_PATH, [clear()]) };
      }
      if (PUBLIC_INSTALL_PATHS.has(path) && (method === "GET" || method === "HEAD")) return { pass: true, cookies: [] };
      if (path === STATUS_PATH && method === "GET") {
        // Lets the app offer "leave the private preview" only where there is one. Says nothing about who the tester is.
        return { pass: false, response: new Response(JSON.stringify({ preview: true, signedIn: authed, viaSession, audience }), { status: authed ? 200 : 401, headers: { ...noStore, "content-type": "application/json; charset=utf-8" } }) };
      }
      if (authed) return { pass: true, cookies: [], ...(live ? { afterSuccess: live.renew } : {}) };

      if (path.startsWith("/api/")) {
        const message = students ? "This app needs its class code on this device." : "This private preview needs its tester sign-in on this device.";
        const body = JSON.stringify({ error: { code: "preview_required", message, signIn: SIGNIN_PATH } });
        return { pass: false, response: new Response(body, { status: 401, headers: { ...noStore, "content-type": "application/json; charset=utf-8" } }) };
      }
      if ((method === "GET" || method === "HEAD") && !looksLikeAsset(path)) {
        return { pass: false, response: redirect(`${SIGNIN_PATH}?next=${encodeURIComponent(safeNext(path + url.search))}`) };
      }
      return { pass: false, response: new Response(students ? "Students with a class code only." : "Private preview: invited testers only.", { status: 401, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } }) };
    },
  };
}

/** The app's mark, drawn inline so the sign-in page needs no protected asset. */
const LOGO = `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0b7f74"/><g stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"><path d="M10 22h44M10 31h44M10 40h44"/></g><ellipse cx="25" cy="40" rx="8" ry="6" transform="rotate(-20 25 40)" fill="#fff"/><path d="M32 38V15c8 1 14 5 14 12" stroke="#ffd166" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;

function signInPage(next: string, audience: Audience, error?: string): string {
  const students = audience === "students";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4f6fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#11121b" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Theory Path">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>${students ? "Sign in" : "Private preview"} · Music Theory Path</title>
<link rel="stylesheet" href="${STYLE_PATH}">
</head>
<body>
<main>
<div class="head">${LOGO}<h1>Music Theory Path</h1><p class="tag">${students ? "For students with a class code" : "Private preview for invited testers"}</p></div>
<form method="post" action="${SIGNIN_PATH}" name="preview-signin">
<input type="hidden" name="next" value="${esc(next)}">
${
  students
    ? `<label for="preview-password">Class code</label>
<input id="preview-password" name="password" type="text" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" required maxlength="64" placeholder="ABCD-EFGH-JKMN-PQRS">`
    : `<label for="preview-username">Tester name</label>
<input id="preview-username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required maxlength="32">
<label for="preview-password">Preview password</label>
<input id="preview-password" name="password" type="password" autocomplete="current-password" required maxlength="256">`
}
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
<button type="submit">${students ? "Start learning" : "Open the preview"}</button>
</form>
${
  students
    ? `<p class="note">Your teacher gave you a class code. You'll normally need it only once on each device. Next you'll make your own account, so your progress is saved.</p>
<p class="note"><a href="/privacy">Privacy notice for students and parents</a> · Not affiliated with or endorsed by ABRSM.</p>`
    : `<p class="note">Use the tester name and password from your invitation. You'll normally need them only once on each device. If you add the app to your Home Screen it may open already signed in, or ask for them once more. Your learner account (or guest progress) is separate: you'll sign in to it on the next screen.</p>
<p class="note">Draft content for adult testers only. Not affiliated with or endorsed by ABRSM.</p>`
}
</main>
</body>
</html>`;
}

const STYLE = `:root{--bg:#f4f6fb;--surface:#fff;--ink:#1c1d2b;--muted:#5b5e76;--line:#d9dbe7;--brand:#0b7f74;--brand-strong:#086058;--on-brand:#fff;--bad:#b3261e;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#11121b;--surface:#1c1e2b;--ink:#eef0fa;--muted:#a9adc6;--line:#2b2e45;--brand:#3fd6c6;--brand-strong:#7ae8dc;--on-brand:#06231f;--bad:#ffb4ab}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:1.0625rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:26rem;margin:0 auto;padding:max(2rem,env(safe-area-inset-top)) max(1.25rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1.25rem,env(safe-area-inset-left))}
.head{text-align:center;margin-bottom:1.5rem}.head svg{display:block;margin:0 auto .75rem}h1{font-size:1.6rem;margin:0}.tag{color:var(--muted);margin:.25rem 0 0}
form{display:grid;gap:.4rem;background:var(--surface);border:2px solid var(--line);border-radius:20px;padding:1.25rem}
label{font-weight:700;margin-top:.4rem}
input{font:inherit;font-size:1rem;min-height:48px;padding:.6rem .8rem;border-radius:12px;border:2px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
input:focus-visible,button:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
button{font:inherit;font-weight:800;min-height:52px;margin-top:.8rem;border:0;border-radius:16px;background:var(--brand);color:var(--on-brand);box-shadow:0 5px 0 var(--brand-strong);cursor:pointer;touch-action:manipulation}
.error{color:var(--bad);font-weight:700;margin:.4rem 0 0}a{color:var(--brand)}.note{color:var(--muted);font-size:.9rem;margin:1rem 0 0}`;
