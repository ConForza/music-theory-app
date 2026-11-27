#!/usr/bin/env node
/**
 * Manual Railway deployment (run by .github/workflows/deploy-railway.yml; see docs/development/RAILWAY.md).
 *
 * Deploys ONE exact commit of `main` to the existing Railway service through Railway's GraphQL API, then proves it:
 *   preflight  -> branch, configuration, commit on main, CI green for this exact SHA, backup rule, no deployment already in flight
 *   deploy     -> serviceInstanceDeployV2(commitSha) once (never retried), capture the deployment ID
 *   verify     -> that deployment reaches SUCCESS, carries the requested commit, is still the newest; /api/health, then smoke tests
 *
 * It never runs migrations (the app does that at start-up), never touches the database, never cancels or rolls back anything,
 * and never prints credentials. Nothing here creates accounts or writes learner data: smoke tests are unauthenticated GETs.
 *
 * Dependency-free on purpose (Node >= 22: global fetch). All I/O goes through the `ctx` object so tests can mock it.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";
export const CI_WORKFLOW_FILE = "ci.yml";
export const MIGRATIONS_PATH = "packages/api/migrations";
export const BACKUP_CONFIRMED = "confirmed-verified";
export const BACKUP_NOT_CONFIRMED = "not-confirmed";

/** Railway deployment statuses. Unlisted values are treated as "still going" and bounded by the timeout (fail closed). */
const IN_FLIGHT = new Set(["INITIALIZING", "QUEUED", "WAITING", "BUILDING", "DEPLOYING", "NEEDS_APPROVAL"]);
const FAILURE = new Set(["FAILED", "CRASHED", "REMOVED", "REMOVING", "SKIPPED", "SLEEPING"]);

export class DeployError extends Error {
  constructor(message, phase = "deploy") {
    super(message);
    this.phase = phase;
  }
}

class RailwayApiError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // "auth" | "http" | "graphql" | "network"
  }
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
const gitReal = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Everything with side effects, replaceable in tests. */
export function realContext(env = process.env) {
  return {
    env,
    fetch: globalThis.fetch,
    git: gitReal,
    sleep: sleepReal,
    now: () => Date.now(),
    log: (line) => console.log(line),
    writeSummary: (md) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, md + "\n"),
    githubApi: "https://api.github.com",
    railwayApi: RAILWAY_GRAPHQL,
    pollMs: 10_000,
    deployTimeoutMs: 25 * 60_000,
    healthTimeoutMs: 6 * 60_000,
    requestTimeoutMs: 20_000,
  };
}

// ---------------------------------------------------------------------------------------------------------------- configuration

export function readConfig(env) {
  if (env.GITHUB_REF !== "refs/heads/main") {
    throw new DeployError(`Refusing to deploy "${env.GITHUB_REF || "(no ref)"}". Production deploys run only from main: choose "main" in the Branch picker when you press Run workflow.`, "branch");
  }
  const missing = [];
  const need = (key) => {
    const v = (env[key] ?? "").trim();
    if (!v) missing.push(key);
    return v;
  };
  const cfg = {
    token: need("RAILWAY_PROJECT_TOKEN"),
    projectId: need("RAILWAY_PROJECT_ID"),
    serviceId: need("RAILWAY_SERVICE_ID"),
    environmentId: need("RAILWAY_ENVIRONMENT_ID"),
    publicUrl: need("RAILWAY_PUBLIC_URL"),
    repo: need("GITHUB_REPOSITORY"),
    sha: need("GITHUB_SHA").toLowerCase(),
    githubToken: need("GITHUB_TOKEN"),
    backup: (env.DATABASE_BACKUP || BACKUP_NOT_CONFIRMED).trim(),
    runUrl: env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : "",
    serverUrl: env.GITHUB_SERVER_URL || "https://github.com",
  };
  if (missing.length) {
    throw new DeployError(`Missing configuration: ${missing.join(", ")}. Add the secret/variable in GitHub (Settings → Environments → production); see "One-time setup" in docs/development/RAILWAY.md.`, "configuration");
  }
  if (!/^[0-9a-f]{40}$/.test(cfg.sha)) throw new DeployError(`GITHUB_SHA is not a full commit SHA: "${cfg.sha}".`, "configuration");
  if (![BACKUP_CONFIRMED, BACKUP_NOT_CONFIRMED].includes(cfg.backup)) throw new DeployError(`Unknown database_backup choice "${cfg.backup}".`, "configuration");
  let url;
  try {
    url = new URL(cfg.publicUrl);
  } catch {
    throw new DeployError("RAILWAY_PUBLIC_URL is not a valid URL (expected https://your-app.up.railway.app).", "configuration");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new DeployError("RAILWAY_PUBLIC_URL must be an https:// address without credentials.", "configuration");
  cfg.baseUrl = url.origin;
  cfg.dashboardUrl = `https://railway.com/project/${encodeURIComponent(cfg.projectId)}/service/${encodeURIComponent(cfg.serviceId)}?environmentId=${encodeURIComponent(cfg.environmentId)}`;
  return cfg;
}

// ---------------------------------------------------------------------------------------------------------------- HTTP helpers

function timeoutSignal(ctx) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ctx.requestTimeoutMs) : undefined;
}

/** One GraphQL call. Retries transient failures of QUERIES only; a mutation is never retried (it could create a second deployment). */
async function railway(ctx, cfg, query, variables, { retry = true } = {}) {
  const attempts = retry ? 3 : 1;
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await ctx.fetch(ctx.railwayApi, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "Project-Access-Token": cfg.token },
        body: JSON.stringify({ query, variables }),
        signal: timeoutSignal(ctx),
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      const gqlMessage = body?.errors?.map((e) => e.message).join("; ");
      if (res.status === 401 || res.status === 403 || /not authori[sz]ed|unauthenticated|invalid.*token/i.test(gqlMessage ?? "")) {
        throw new RailwayApiError(`Railway rejected the project token (${res.status}${gqlMessage ? `: ${gqlMessage}` : ""}). Check RAILWAY_PROJECT_TOKEN: it must be a project token for the production environment and must not have been revoked.`, "auth");
      }
      if (!res.ok) throw new RailwayApiError(`Railway API returned HTTP ${res.status}.`, "http");
      if (gqlMessage) throw new RailwayApiError(`Railway API error: ${gqlMessage}`, "graphql");
      if (!body || body.data === undefined) throw new RailwayApiError("Railway API returned an unreadable response.", "http");
      return body.data;
    } catch (e) {
      last = e instanceof RailwayApiError ? e : new RailwayApiError(`Could not reach the Railway API (${e?.message ?? e}).`, "network");
      if (last.kind === "auth" || last.kind === "graphql" || i === attempts) throw last;
      await ctx.sleep(1000 * i);
    }
  }
  throw last;
}

async function github(ctx, cfg, path) {
  let res;
  try {
    res = await ctx.fetch(`${ctx.githubApi}${path}`, {
      headers: { authorization: `Bearer ${cfg.githubToken}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      signal: timeoutSignal(ctx),
    });
  } catch (e) {
    throw new DeployError(`Could not reach the GitHub API to verify CI (${e?.message ?? e}).`, "ci");
  }
  if (!res.ok) throw new DeployError(`GitHub API returned HTTP ${res.status} while verifying CI. The workflow needs "actions: read" permission.`, "ci");
  return res.json();
}

const asDate = (s) => {
  const t = Date.parse(s ?? "");
  return Number.isFinite(t) ? t : 0;
};
const commitOf = (d) => String(d?.meta?.commitHash ?? "").toLowerCase();

// ---------------------------------------------------------------------------------------------------------------- preflight

/** The commit must be on main and CI (the "CI" workflow, push event on main) must have finished green for exactly this SHA. */
export async function verifyCi(ctx, cfg) {
  const data = await github(ctx, cfg, `/repos/${cfg.repo}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=${cfg.sha}&event=push&branch=main&per_page=30`);
  const runs = (data.workflow_runs ?? []).filter((r) => String(r.head_sha).toLowerCase() === cfg.sha);
  if (!runs.length) {
    throw new DeployError(`No CI run found for commit ${cfg.sha.slice(0, 7)} on main. Wait for CI to start on the merge, then run this workflow again.`, "ci");
  }
  const latest = runs.sort((a, b) => asDate(b.created_at) - asDate(a.created_at))[0];
  if (latest.status !== "completed") {
    throw new DeployError(`CI for ${cfg.sha.slice(0, 7)} is still ${latest.status} (${latest.html_url}). Wait for it to finish, then run this workflow again.`, "ci");
  }
  if (latest.conclusion !== "success") {
    throw new DeployError(`CI for ${cfg.sha.slice(0, 7)} ${latest.conclusion} (${latest.html_url}). Only commits with a fully green CI run can be deployed.`, "ci");
  }
  return { url: latest.html_url };
}

/** Decide whether the backup rule allows this deployment. `baseline` is the commit currently live, or "" when unknown. */
export function decideBackup(ctx, cfg, baseline) {
  let migrations; // string[] | null (unknown)
  if (!baseline) migrations = null;
  else if (baseline === cfg.sha) migrations = [];
  else {
    try {
      ctx.git(["cat-file", "-e", `${baseline}^{commit}`]);
      migrations = ctx.git(["diff", "--name-only", baseline, cfg.sha, "--", MIGRATIONS_PATH]).split("\n").filter(Boolean);
    } catch {
      migrations = null;
    }
  }
  const migrationText = migrations === null ? "could not be determined" : migrations.length ? `${migrations.length} migration file(s) changed` : "no migration changes";
  if (cfg.backup === BACKUP_CONFIRMED) {
    return { status: "Owner confirmed a verified backup exists (not checked by this workflow)", migrations: migrationText };
  }
  if (migrations && migrations.length === 0) {
    return { status: "Not confirmed. No database migrations in this release", migrations: migrationText };
  }
  const why = migrations === null ? "This workflow cannot tell whether the release contains database migrations (the live commit is unknown or not in the repository history)" : `This release changes database migrations (${migrations.join(", ")})`;
  throw new DeployError(`${why}, and no verified backup was confirmed. Take and verify a backup (docs/development/RAILWAY.md → Backups), then run the workflow again with "Database backup" set to "${BACKUP_CONFIRMED}".`, "backup");
}

const DEPLOYMENTS_QUERY = `query Deployments($input: DeploymentListInput!) {
  deployments(first: 20, input: $input) { edges { node { id status createdAt meta } } }
}`;
const DEPLOYMENT_QUERY = `query Deployment($id: String!) { deployment(id: $id) { id status createdAt meta } }`;
const DEPLOY_MUTATION = `mutation Deploy($serviceId: String!, $environmentId: String!, $commitSha: String) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
}`;
const TOKEN_QUERY = `query { projectToken { projectId environmentId } }`;

async function listDeployments(ctx, cfg) {
  const data = await railway(ctx, cfg, DEPLOYMENTS_QUERY, { input: { projectId: cfg.projectId, environmentId: cfg.environmentId, serviceId: cfg.serviceId } });
  const nodes = (data?.deployments?.edges ?? []).map((e) => e.node).filter(Boolean);
  return nodes.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
}

/** The token must belong to the configured project and environment (a project token is scoped to exactly one environment). */
async function checkToken(ctx, cfg) {
  let data;
  try {
    data = await railway(ctx, cfg, TOKEN_QUERY, {});
  } catch (e) {
    if (e.kind === "auth") throw new DeployError(e.message, "credentials");
    ctx.log(`Note: could not read the token's scope (${e.message}). The deployment queries below will still fail if the token is wrong.`);
    return;
  }
  const t = data?.projectToken;
  if (t && (t.projectId !== cfg.projectId || t.environmentId !== cfg.environmentId)) {
    throw new DeployError("RAILWAY_PROJECT_TOKEN belongs to a different project or environment than RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID. Create the token for the production environment of this project.", "credentials");
  }
}

// ---------------------------------------------------------------------------------------------------------------- deploy + monitor

async function monitor(ctx, cfg, id, started) {
  const deadline = started + ctx.deployTimeoutMs;
  let lastStatus = "";
  for (;;) {
    const d = (await railway(ctx, cfg, DEPLOYMENT_QUERY, { id }))?.deployment;
    if (!d) throw new DeployError(`Railway has no deployment ${id}.`, "deploy");
    if (d.status !== lastStatus) {
      ctx.log(`Deployment ${id}: ${d.status}`);
      lastStatus = d.status;
    }
    const commit = commitOf(d);
    if (commit && commit !== cfg.sha) {
      throw new DeployError(`Railway built commit ${commit.slice(0, 7)} but ${cfg.sha.slice(0, 7)} was requested. Not treating this as a successful deployment.`, "commit");
    }
    if (d.status === "SUCCESS") {
      if (!commit) throw new DeployError("Railway reports the deployment as successful but not which commit it built, so it cannot be matched to the requested commit.", "commit");
      return d;
    }
    if (FAILURE.has(d.status)) throw new DeployError(`Railway reports the deployment as ${d.status}.`, "deploy");
    if (ctx.now() >= deadline) {
      throw new DeployError(`Timed out after ${Math.round(ctx.deployTimeoutMs / 60_000)} minutes with the deployment still ${d.status}. It has NOT been cancelled; check the Railway dashboard before running this workflow again.`, "timeout");
    }
    await ctx.sleep(ctx.pollMs);
  }
}

/** The new deployment must still be the newest one: otherwise a later deployment (not ours) is what is live. */
async function assertStillLatest(ctx, cfg, id) {
  const list = await listDeployments(ctx, cfg);
  const ours = list.find((d) => d.id === id);
  if (!ours) throw new DeployError(`Deployment ${id} is missing from Railway's deployment list.`, "deploy");
  const newer = list.find((d) => d.id !== id && asDate(d.createdAt) > asDate(ours.createdAt));
  if (newer) throw new DeployError(`A newer deployment (${newer.id}, ${newer.status}) appeared after ${id}. Someone else deployed during this run; check the Railway dashboard.`, "deploy");
  if (ours.status !== "SUCCESS" || commitOf(ours) !== cfg.sha) throw new DeployError(`Deployment ${id} is no longer a successful deployment of ${cfg.sha.slice(0, 7)} (status ${ours.status}).`, "deploy");
}

// ---------------------------------------------------------------------------------------------------------------- health + smoke

async function get(ctx, cfg, path, init = {}) {
  return ctx.fetch(new URL(path, cfg.baseUrl), { redirect: "manual", signal: timeoutSignal(ctx), ...init });
}

export async function waitForHealth(ctx, cfg) {
  const deadline = ctx.now() + ctx.healthTimeoutMs;
  let streak = 0;
  let last;
  for (;;) {
    try {
      const res = await get(ctx, cfg, "/api/health");
      const body = res.status === 200 ? await res.json().catch(() => null) : null;
      if (res.status === 200 && body?.ok === true) {
        if (++streak >= 2) return `Healthy (HTTP 200, curriculum ${body.curriculumVersion ?? "?"})`;
        last = "healthy once, confirming";
      } else {
        streak = 0;
        last = `HTTP ${res.status}`;
      }
    } catch (e) {
      streak = 0;
      last = `no response (${e?.message ?? e})`;
    }
    if (ctx.now() >= deadline) throw new DeployError(`/api/health did not become healthy within ${Math.round(ctx.healthTimeoutMs / 60_000)} minutes (last: ${last}). The review-pool warm-up normally takes under two minutes; check the Railway deploy logs.`, "health");
    await ctx.sleep(Math.min(ctx.pollMs, 5000));
  }
}

/** Unauthenticated, read-only checks. No accounts are created and no learner data is touched (no POSTs at all). */
export async function smokeTests(ctx, cfg) {
  const problems = [];
  const check = async (name, fn) => {
    try {
      const err = await fn();
      if (err) problems.push(`${name}: ${err}`);
    } catch (e) {
      problems.push(`${name}: ${e?.message ?? e}`);
    }
  };
  await check("Private-preview gate on the web app", async () => {
    const res = await get(ctx, cfg, "/");
    const where = res.headers.get("location") ?? "";
    if (res.status < 300 || res.status > 399 || !where.startsWith("/preview/signin")) return `expected a redirect to /preview/signin, got HTTP ${res.status}${where ? ` → ${where}` : ""}`;
  });
  for (const path of ["/api/me", "/api/course"]) {
    await check(`Learner API ${path} rejected`, async () => {
      const res = await get(ctx, cfg, path);
      const body = await res.json().catch(() => null);
      if (res.status !== 401 || body?.error?.code !== "preview_required") return `expected 401 preview_required, got HTTP ${res.status}`;
    });
  }
  await check("PWA manifest and icons", async () => {
    const res = await get(ctx, cfg, "/manifest.webmanifest");
    if (res.status !== 200) return `manifest returned HTTP ${res.status}`;
    const manifest = await res.json().catch(() => null);
    if (!manifest?.name || !Array.isArray(manifest.icons) || !manifest.icons.length) return "manifest has no name or icons";
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, cfg.baseUrl);
      if (url.origin !== cfg.baseUrl) return `icon ${icon.src} is not on this site`;
      const r = await get(ctx, cfg, url.pathname);
      if (r.status !== 200 || !(r.headers.get("content-type") ?? "").startsWith("image/")) return `icon ${icon.src} returned HTTP ${r.status}`;
    }
  });
  if (problems.length) throw new DeployError(`Smoke tests failed: ${problems.join(" | ")}`, "smoke");
  return "Passed: HTTPS, preview gate active, learner API rejected, manifest and icons available";
}

// ---------------------------------------------------------------------------------------------------------------- summary

const mdCode = (s) => "`" + String(s).replace(/`/g, "'") + "`";

export function renderSummary(r, cfg) {
  const ok = r.outcome === "succeeded";
  const head = ok ? "✅ Deployed" : r.outcome === "interrupted" ? "⚠️ Interrupted" : "❌ Deployment failed";
  const sha = r.sha ? mdCode(r.sha.slice(0, 7)) : "(unknown)";
  const mins = Math.max(0, Math.round((r.durationMs ?? 0) / 1000));
  const lines = [
    `## ${head}`,
    "",
    `**Commit:** ${sha} ${r.commitMessage ? `— ${String(r.commitMessage).replace(/[<>]/g, "")}` : ""}`.trim(),
    "",
    `- **CI:** ${r.ci}`,
    `- **Database backup:** ${r.backup}`,
    `- **Migrations:** ${r.migrations}`,
    `- **Railway deployment:** ${r.deploymentId ? mdCode(r.deploymentId) : "not started"}`,
    `- **Deployment result:** ${r.deployResult}`,
    `- **Health check:** ${r.health}`,
    `- **Smoke tests:** ${r.smoke}`,
    `- **Duration:** ${Math.floor(mins / 60)}m ${mins % 60}s`,
  ];
  if (cfg?.baseUrl) lines.push("", `🔗 [Open the live app](${cfg.baseUrl}/)`);
  if (cfg?.dashboardUrl) lines.push(`🚂 [Railway dashboard (deployments and logs)](${cfg.dashboardUrl})`);
  if (cfg?.runUrl) lines.push(`📋 [This workflow run](${cfg.runUrl})`);
  if (!ok) {
    lines.push("", "### What happened", r.error ?? "The workflow was stopped.");
    if (r.outcome === "interrupted") {
      lines.push("", "The workflow stopped but **Railway was not told to cancel**. Check the dashboard: a deployment may still be running. This workflow refuses to start another while one is in flight.");
    } else if (r.deploymentId) {
      lines.push("", "### Next steps", "1. Open the Railway deployment logs (link above) and read the first error.", "2. The live app may still be running the previous version. Nothing was rolled back and no database snapshot was restored automatically.", "3. To go back to the previous code, follow **Rollback** in `docs/development/RAILWAY.md`. Rolling back code does not restore learner data.");
    } else {
      lines.push("", "Nothing was deployed.");
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------- orchestration

export async function runDeploy(ctx, report = {}) {
  const started = ctx.now();
  const r = Object.assign(report, { outcome: "failed", ci: "not checked", backup: "not checked", migrations: "not checked", deployResult: "not started", health: "not checked", smoke: "not checked" });
  r.startedAt = started;
  let cfg;
  try {
    cfg = readConfig(ctx.env);
    r.cfg = cfg;
    r.sha = cfg.sha;
    r.commitMessage = (() => {
      try {
        return ctx.git(["log", "-1", "--format=%s", cfg.sha]);
      } catch {
        return "";
      }
    })();
    ctx.log(`Deploying ${cfg.sha} from main`);

    ctx.log("::group::Pre-flight checks");
    try {
      ctx.git(["merge-base", "--is-ancestor", cfg.sha, "origin/main"]);
    } catch {
      throw new DeployError(`Commit ${cfg.sha.slice(0, 7)} is not part of main's history.`, "branch");
    }
    const ci = await verifyCi(ctx, cfg);
    r.ci = `✅ Passed for this exact commit ([CI run](${ci.url}))`;
    await checkToken(ctx, cfg);
    const existing = await listDeployments(ctx, cfg);
    const busy = existing.find((d) => IN_FLIGHT.has(d.status));
    if (busy) {
      throw new DeployError(`Railway already has a deployment in progress (${busy.id}, ${busy.status}). It was NOT cancelled. Wait for it to finish (or stop it in the dashboard if you are sure it is stuck), then run this workflow again.`, "in-flight");
    }
    const baseline = commitOf(existing.find((d) => d.status === "SUCCESS"));
    const backup = decideBackup(ctx, cfg, baseline);
    r.backup = backup.status;
    r.migrations = backup.migrations;
    ctx.log(`CI passed. Backup: ${backup.status}. Migrations: ${backup.migrations}.`);
    ctx.log("::endgroup::");

    ctx.log("Requesting deployment…");
    let id;
    try {
      id = (await railway(ctx, cfg, DEPLOY_MUTATION, { serviceId: cfg.serviceId, environmentId: cfg.environmentId, commitSha: cfg.sha }, { retry: false }))?.serviceInstanceDeployV2;
    } catch (e) {
      throw new DeployError(`${e.message} The request is not retried automatically; check the Railway dashboard before running this workflow again.`, "railway");
    }
    if (!id || typeof id !== "string") throw new DeployError("Railway accepted the request but returned no deployment ID. Check the dashboard before running this workflow again.", "railway");
    r.deploymentId = id;
    r.deployResult = "In progress";
    ctx.log(`Railway deployment ID: ${id}`);

    const deployed = await monitor(ctx, cfg, id, started);
    r.deployResult = `✅ SUCCESS, built commit ${commitOf(deployed).slice(0, 7)}`;
    await assertStillLatest(ctx, cfg, id);
    r.health = await waitForHealth(ctx, cfg);
    r.smoke = await smokeTests(ctx, cfg);
    await assertStillLatest(ctx, cfg, id);
    r.outcome = "succeeded";
  } catch (e) {
    r.error = e instanceof DeployError || e instanceof RailwayApiError ? e.message : `Unexpected error: ${e?.message ?? e}`;
    r.phase = e?.phase ?? "unknown";
    if (r.deploymentId && r.deployResult === "In progress") r.deployResult = "❌ Did not complete";
    if (r.phase === "health" || r.phase === "smoke") r.deployResult = `${r.deployResult}; verification failed afterwards`;
    if (r.phase === "health") r.health = `❌ ${r.error}`;
    if (r.phase === "smoke") r.smoke = `❌ ${r.error}`;
    if (r.phase === "ci") r.ci = `❌ ${r.error}`;
    if (r.phase === "backup") r.backup = "❌ Refused (see below)";
    if (r.phase === "commit") r.deployResult = `❌ ${r.error}`;
  } finally {
    r.durationMs = ctx.now() - started;
  }
  return r;
}

/** Entry point. Writes the job summary exactly once, redacts credentials from every line, exits non-zero unless fully verified. */
export async function main(ctx = realContext()) {
  const secrets = ["RAILWAY_PROJECT_TOKEN", "GITHUB_TOKEN"].map((k) => ctx.env[k]).filter((v) => v && v.length > 3);
  const redact = (s) => secrets.reduce((acc, v) => acc.split(v).join("***"), String(s));
  const baseLog = ctx.log;
  ctx = { ...ctx, log: (line) => baseLog(redact(line)) };
  // (Actions already masks secrets.* and github.token in the log; `redact` is a second layer for anything echoed in error text.)

  const report = {};
  let written = false;
  const finish = (r) => {
    if (written) return;
    written = true;
    r.durationMs ??= ctx.now() - (r.startedAt ?? ctx.now());
    ctx.writeSummary(redact(renderSummary(r, r.cfg)));
  };
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      Object.assign(report, { outcome: "interrupted", error: `The workflow received ${sig} (cancelled or timed out).` });
      report.ci ??= "not checked";
      report.backup ??= "not checked";
      report.migrations ??= "not checked";
      report.deployResult = report.deploymentId ? "Unknown: Railway may still be deploying it" : "not started";
      report.health ??= "not checked";
      report.smoke ??= "not checked";
      finish(report);
      process.exit(sig === "SIGINT" ? 130 : 143);
    });
  }
  const r = await runDeploy(ctx, report);
  finish(r);
  if (r.outcome === "succeeded") {
    ctx.log("Deployment verified: Railway deployment succeeded for the requested commit and the live site is healthy.");
    return 0;
  }
  ctx.log(`::error title=Deployment failed (${r.phase})::${redact(r.error)}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
