import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { App } from "./app.ts";
import { GATE_REALM, type PreviewGate } from "./preview-gate.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const body = method === "GET" || method === "HEAD" || chunks.length === 0 ? undefined : Buffer.concat(chunks);
  return new Request(new URL(req.url ?? "/", origin), { method, headers, body });
}

export interface HttpOptions {
  /** The deployment is served over HTTPS (MTP_SECURE_COOKIES=1). Then the public scheme is https and Strict-Transport-Security is sent. */
  https?: boolean;
  /** Reverse proxies we operate in front of this process (MTP_TRUST_PROXY_HOPS). Only then is `x-forwarded-proto` read at all. */
  trustedProxyHops?: number;
  /** "app" (default): this process sets the security headers on every response. "proxy": a reverse proxy is configured to set them, so the app sends none. */
  securityHeaders?: "app" | "proxy";
  /** Private preview (issue #24): when given, every request except read-only /api/health needs an invited tester's credentials. */
  gate?: PreviewGate;
}

/**
 * The scheme the learner's browser used. `x-forwarded-proto` is client-controlled unless a proxy we operate sets it, so it is never read
 * unless proxies are declared; a deployment declared HTTPS is https whatever a request claims.
 */
export function publicScheme(header: string | string[] | undefined, opts: HttpOptions): "http" | "https" {
  if (opts.https) return "https";
  if ((opts.trustedProxyHops ?? 0) > 0) {
    // Each proxy appends; the last entry is the one written by the proxy nearest to us.
    const last = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).at(-1);
    if (last === "https") return "https";
  }
  return "http";
}

/** SHA-256 hashes of the inline scripts in the built index.html, so the policy allows exactly those and no other inline script. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) out.push(`'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`);
  return out;
}

/**
 * The security headers for every response (API and web app). The app loads only its own scripts, styles, fonts and data: no third party,
 * no inline script except the theme snippet in index.html (allowed by hash), no eval, and it may not be framed.
 * Audio is synthesised with WebAudio (no media files); notation is inline SVG drawn with the bundled Bravura font.
 */
export function securityHeaders(opts: HttpOptions, scriptHashes: string[] = []): Record<string, string> {
  if (opts.securityHeaders === "proxy") return {};
  const csp = [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.length ? " " + scriptHashes.join(" ") : ""}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    // Only when the deployment is declared HTTPS: sent over plain http it would be ignored, and a mistaken value is hard to undo.
    ...(opts.https ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

/** Serve the API and, when `staticDir` is given, the built web app with SPA fallback. */
export function createHttpServer(app: App, staticDir?: string, opts: HttpOptions = {}): Server {
  let hashes: string[] = [];
  try {
    if (staticDir && existsSync(join(staticDir, "index.html"))) hashes = inlineScriptHashes(readFileSync(join(staticDir, "index.html"), "utf8"));
  } catch {
    hashes = [];
  }
  const secure = securityHeaders(opts, hashes);
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "localhost";
      const proto = publicScheme(req.headers["x-forwarded-proto"], opts);
      const url = new URL(req.url ?? "/", `${proto}://${host}`);
      let response: Response;
      if (opts.gate && !opts.gate.allows(req.method ?? "GET", url.pathname, req.headers.authorization)) {
        res.writeHead(401, { ...secure, "www-authenticate": GATE_REALM, "cache-control": "no-store", "x-robots-tag": "noindex", "content-type": "text/plain; charset=utf-8" });
        res.end("Private preview: invited testers only.");
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        response = await app.fetch(await toRequest(req, `${proto}://${host}`), { remoteAddress: req.socket.remoteAddress });
      } else if (staticDir) {
        response = serveStatic(staticDir, url.pathname);
      } else {
        response = new Response("Not found", { status: 404 });
      }
      const out: Record<string, string | string[]> = { ...secure, ...(opts.gate ? { "x-robots-tag": "noindex" } : {}) };
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") out[k] = v;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) out["set-cookie"] = cookies;
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { ...secure, "content-type": "text/plain" });
      res.end("Internal error");
    }
  });
}

function serveStatic(root: string, pathname: string): Response {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
  // Only real asset types are 404 when missing; any other path (e.g. /practice/s.scales) is an app route.
  const isAsset = extname(file) in TYPES;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (isAsset) return new Response("Not found", { status: 404 });
    file = join(root, "index.html"); // SPA fallback
    if (!existsSync(file)) return new Response("Web app not built. Run `npm run build -w @mtp/web`.", { status: 503 });
  }
  const immutable = file.includes(`${join(root, "assets")}`);
  return new Response(readFileSync(file), {
    headers: {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}
