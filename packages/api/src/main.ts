import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { testClockEnabled } from "./config.ts";
import { loadCourse } from "./course.ts";
import { openDb } from "./db.ts";
import { createHttpServer } from "./server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dbPath = resolve(process.env.MTP_DB ?? resolve(here, "../data/mtp.sqlite"));
mkdirSync(dirname(dbPath), { recursive: true });
const staticDir = process.env.MTP_STATIC_DIR ?? resolve(here, "../../web/dist");

const app = createApp({
  db: openDb(dbPath),
  // Browser suites for earlier briefs pin the content of their era (MTP_CONTENT_ROOT); production always serves the shipped content.
  course: loadCourse(process.env.NODE_ENV !== "production" ? process.env.MTP_CONTENT_ROOT || undefined : undefined),
  secureCookies: process.env.MTP_SECURE_COOKIES === "1",
  waiveUnwrittenPrerequisites: process.env.MTP_WAIVE_UNWRITTEN !== "0",
  trustedProxyHops: Number(process.env.MTP_TRUST_PROXY_HOPS ?? 0) || 0,
  // Browser journeys only: needs explicit MTP_TEST_CLOCK=1 and NODE_ENV=test.
  testClock: testClockEnabled(process.env),
  allowedOrigins: (process.env.MTP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
});
createHttpServer(app, staticDir).listen(port, () => console.log(`Music Theory Path listening on http://localhost:${port} (db: ${dbPath})`));
