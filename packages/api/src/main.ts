import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { testClockEnabled } from "./config.ts";
import { loadCourse } from "./course.ts";
import { openDb } from "./db.ts";
import { retentionPolicyFromEnv } from "./retention.ts";
import { startServer } from "./startup.ts";

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
  // Optional override of the per-address guest-creation limit (default 60 per 15 minutes); a positive whole number only.
  ...(/^[1-9]\d{0,5}$/.test(process.env.MTP_GUEST_CREATIONS_PER_15_MIN ?? "") ? { guestCreationsPer15Min: Number(process.env.MTP_GUEST_CREATIONS_PER_15_MIN) } : {}),
});
const secure = process.env.MTP_SECURE_COOKIES === "1";
startServer({
  app,
  staticDir,
  port,
  http: { https: secure, trustedProxyHops: Number(process.env.MTP_TRUST_PROXY_HOPS ?? 0) || 0, securityHeaders: process.env.MTP_SECURITY_HEADERS === "proxy" ? "proxy" : "app" },
  // Set MTP_WARM_POOLS=0 only for local development: the pools are then sampled inside learners' requests (a 15-25 s stall each restart).
  warmPools: process.env.MTP_WARM_POOLS !== "0",
  retention: retentionPolicyFromEnv(),
}).then(
  (running) => {
    console.log(`Music Theory Path listening on http://localhost:${running.port} (db: ${dbPath})`);
    let exiting = false;
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        if (exiting) return;
        exiting = true;
        console.log(`${signal} received: finishing requests in flight, then stopping.`);
        void running.stop().then(() => process.exit(0));
      });
    }
  },
  (e: unknown) => {
    // A failed start must be visible to the process supervisor: say why and exit non-zero without ever opening the port.
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
