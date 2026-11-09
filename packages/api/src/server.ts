import { createServer, type IncomingMessage, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { App } from "./app.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
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

/** Serve the API and, when `staticDir` is given, the built web app with SPA fallback. */
export function createHttpServer(app: App, staticDir?: string): Server {
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "localhost";
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
      const url = new URL(req.url ?? "/", `${proto}://${host}`);
      let response: Response;
      if (url.pathname.startsWith("/api/")) {
        response = await app.fetch(await toRequest(req, `${proto}://${host}`));
      } else if (staticDir) {
        response = serveStatic(staticDir, url.pathname);
      } else {
        response = new Response("Not found", { status: 404 });
      }
      const out: Record<string, string | string[]> = {};
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") out[k] = v;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) out["set-cookie"] = cookies;
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal error");
    }
  });
}

function serveStatic(root: string, pathname: string): Response {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
  const isAsset = extname(file) !== "";
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
