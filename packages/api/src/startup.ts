/**
 * Bringing the server up and taking it down (final release hardening).
 *
 * Order matters and is tested:
 *   1. the review question pools are sampled (PR #20: never inside a learner's request). If that throws, start-up FAILS: the process must
 *      not listen with pools half filled, because the first learners would then pay for the rest inside their requests;
 *   2. housekeeping runs once (expired sessions; guest retention only as configured, see retention.ts);
 *   3. only then does the server listen. An open port therefore means "ready": a health check against GET /api/health needs no other signal.
 *
 * On SIGTERM or SIGINT the server stops accepting connections, lets requests in flight finish (bounded by `shutdownGraceMs`), closes the
 * database and exits 0. Every answer is committed in its own transaction, so a request cut off at the limit loses nothing already stored.
 */
import type { Server } from "node:http";
import type { App } from "./app.ts";
import { describeRetention, runRetention, type RetentionPolicy, type RetentionReport } from "./retention.ts";
import { createHttpServer, type HttpOptions } from "./server.ts";

export interface StartOptions {
  app: App;
  staticDir?: string;
  port: number;
  http?: HttpOptions;
  /** Sample the review pools before listening (production: always). False only for local development (MTP_WARM_POOLS=0). */
  warmPools: boolean;
  retention: RetentionPolicy;
  /** How often housekeeping repeats while the server runs. 0 disables the timer (tests). Default: daily. */
  retentionEveryMs?: number;
  shutdownGraceMs?: number;
  log?: (line: string) => void;
}

export interface Running {
  server: Server;
  port: number;
  warm: { candidates: number; seconds: number } | null;
  retention: RetentionReport;
  /** Stop accepting connections, wait for requests in flight (up to the grace period), then close the database. */
  stop: () => Promise<void>;
}

export async function startServer(o: StartOptions): Promise<Running> {
  const log = o.log ?? ((l: string) => console.log(l));
  let warm: Running["warm"] = null;
  if (o.warmPools) {
    const t0 = Date.now();
    let candidates: number;
    try {
      candidates = o.app.engagement.review.warmPools();
    } catch (e) {
      throw new Error(`Start-up failed while sampling the review question pools; the server did not start listening. ${(e as Error).message}`, { cause: e });
    }
    if (candidates === 0) throw new Error("Start-up failed: no review question pool could be sampled (is the curriculum content present?). The server did not start listening.");
    warm = { candidates, seconds: (Date.now() - t0) / 1000 };
    log(`Review pools ready: ${candidates} candidates in ${warm.seconds.toFixed(1)} s`);
  } else {
    log("Review pools NOT warmed (MTP_WARM_POOLS=0): they will be sampled inside learners' requests. Do not use this setting in production.");
  }

  const retention = runRetention(o.app.db, o.retention);
  log(describeRetention(retention));

  const server = createHttpServer(o.app, o.staticDir, o.http ?? {});
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as { port: number }).port;

  const every = o.retentionEveryMs ?? 24 * 60 * 60_000;
  const timer = every > 0 ? setInterval(() => {
    try {
      log(describeRetention(runRetention(o.app.db, o.retention)));
    } catch (e) {
      console.error("Retention run failed", e);
    }
  }, every) : null;
  timer?.unref();

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= new Promise<void>((resolve) => {
      if (timer) clearInterval(timer);
      const done = () => {
        try {
          o.app.db.close();
        } catch {
          /* already closed */
        }
        resolve();
      };
      const force = setTimeout(() => {
        server.closeAllConnections();
        done();
      }, o.shutdownGraceMs ?? 10_000);
      force.unref();
      server.close(() => {
        clearTimeout(force);
        done();
      });
      // Idle keep-alive connections would otherwise hold the server open until they time out.
      server.closeIdleConnections();
    }));
  return { server, port, warm, retention, stop };
}
