#!/usr/bin/env node
/**
 * Manual Railway deployment (run by .github/workflows/deploy-railway.yml; see docs/development/RAILWAY.md).
 *
 * Deploys the CURRENT TIP of `main` to the existing Railway service through Railway's GraphQL API, then proves it:
 *   preflight  -> branch, configuration, commit is main's tip, CI jobs and steps green for this exact SHA, token scope and domain bound to
 *                 this service, Railway idle, live code and database baseline understood (refuse rollback/divergence, fail closed on
 *                 uncertainty), backup rule
 *   deploy     -> serviceInstanceDeployV2(commitSha) once (never retried), capture the deployment ID
 *   verify     -> that deployment reaches SUCCESS, carries the requested commit, is the ONLY active and the latest deployment (before and
 *                 after) while /api/health and the smoke tests pass on the domain that belongs to this service
 *
 * It never runs migrations (the app does that at start-up), never touches the database, never cancels or rolls back anything,
 * and never prints credentials. Smoke tests are unauthenticated GETs: no accounts, no writes.
 *
 * Every failure is classified (see OUTCOMES) so the summary never claims more than is known: in particular, once the deploy request has
 * been sent, anything short of a Railway-confirmed result is reported as UNKNOWN, never as "nothing was deployed".
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

/**
 * The CI jobs (and the steps inside them that do the real work) that must have succeeded for the exact commit. Names come from
 * .github/workflows/ci.yml (a test keeps the two in step); renaming a job or step there means updating this list in the same PR.
 * The informational "Release gate" step is deliberately not listed.
 */
export const REQUIRED_CI = {
  curriculum: [
    "Typecheck, lint, validate curriculum, check generated docs, run tests, build",
    "Practice-examination coverage audit (every outcome in every paper, variation, placement probes)",
  ],
  "browser / foundation": ["Browser journeys (foundation)"],
  "browser / early": ["Browser journeys (early)"],
  "browser / advanced": ["Browser journeys (advanced)"],
  "browser / grade5": ["Browser journeys (grade5)"],
  "browser / prep": ["Browser journeys (prep)"],
  browser: ["Require all browser shards to pass"],
};

/** Deployment states in which Railway is finished with a deployment. Anything else (incl. REMOVING, unknown, missing) blocks a new one. */
const SETTLED = new Set(["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"]);
/** For OUR deployment: states that mean Railway itself reports it did not succeed. Other non-SUCCESS states are "still going". */
const FAILURE = new Set(["FAILED", "CRASHED", "REMOVED", "REMOVING", "SKIPPED", "SLEEPING"]);
const FULL_SHA = /^[0-9a-f]{40}$/;
const short = (sha) => String(sha).slice(0, 7);

/**
 * What the run can truthfully say about the deployment:
 *   verified | not-attempted | rejected | unknown | railway-failed | verification-failed
 */
export class DeployError extends Error {
  constructor(message, phase = "deploy", kind = undefined) {
    super(message);
    this.phase = phase;
    this.kind = kind;
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
  };
  if (missing.length) {
    throw new DeployError(`Missing configuration: ${missing.join(", ")}. Add the secret/variable in GitHub (Settings → Environments → production); see "One-time setup" in docs/development/RAILWAY.md.`, "configuration");
  }
  if (!FULL_SHA.test(cfg.sha)) throw new DeployError(`GITHUB_SHA is not a full commit SHA: "${cfg.sha}".`, "configuration");
  if (![BACKUP_CONFIRMED, BACKUP_NOT_CONFIRMED].includes(cfg.backup)) throw new DeployError(`Unknown database_backup choice "${cfg.backup}".`, "configuration");
  let url;
  try {
    url = new URL(cfg.publicUrl);
  } catch {
    throw new DeployError("RAILWAY_PUBLIC_URL is not a valid URL (expected https://your-app.up.railway.app).", "configuration");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new DeployError("RAILWAY_PUBLIC_URL must be an https:// address without credentials.", "configuration");
  cfg.baseUrl = url.origin;
  cfg.host = url.host.toLowerCase();
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
      if (!body || body.data === undefined || body.data === null) throw new RailwayApiError("Railway API returned an unreadable response.", "http");
      return body.data;
    } catch (e) {
      last = e instanceof RailwayApiError ? e : new RailwayApiError(`Could not reach the Railway API (${e?.message ?? e}).`, "network");
      if (last.kind === "auth" || last.kind === "graphql" || i === attempts) throw last;
      await ctx.sleep(1000 * i);
    }
  }
  throw last;
}

async function github(ctx, cfg, path, what) {
  let res;
  try {
    res = await ctx.fetch(`${ctx.githubApi}${path}`, {
      headers: { authorization: `Bearer ${cfg.githubToken}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      signal: timeoutSignal(ctx),
    });
  } catch (e) {
    throw new DeployError(`Could not reach the GitHub API (${what}): ${e?.message ?? e}.`, "ci");
  }
  if (!res.ok) throw new DeployError(`GitHub API returned HTTP ${res.status} (${what}). The workflow needs "actions: read" and "contents: read" permission.`, "ci");
  return res.json();
}

// ---------------------------------------------------------------------------------------------------------------- git

/** true / false when both commits are known; null when either is not in this clone's history (so nothing can be concluded). */
function isAncestor(ctx, ancestor, descendant) {
  if (ancestor === descendant) return true;
  try {
    ctx.git(["cat-file", "-e", `${ancestor}^{commit}`]);
    ctx.git(["cat-file", "-e", `${descendant}^{commit}`]);
  } catch {
    return null;
  }
  try {
    ctx.git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (e) {
    return e?.status === 1 ? false : null;
  }
}

// ---------------------------------------------------------------------------------------------------------------- CI gate

const asTime = (s) => {
  const t = Date.parse(s ?? "");
  return Number.isFinite(t) ? t : 0;
};

/**
 * The commit must have a finished, green `CI` push run on main, AND the individual jobs and steps that matter must have actually
 * succeeded (not been skipped by an accidental CI edit). Jobs are read across all attempts and the newest attempt of each job wins,
 * so a partial re-run (which keeps earlier successful jobs) is judged on what is effectively the latest result of every job.
 */
export async function verifyCi(ctx, cfg) {
  const data = await github(ctx, cfg, `/repos/${cfg.repo}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=${cfg.sha}&event=push&branch=main&per_page=30`, "CI runs");
  const runs = (data.workflow_runs ?? []).filter((r) => String(r.head_sha).toLowerCase() === cfg.sha);
  if (!runs.length) throw new DeployError(`No CI run found for commit ${short(cfg.sha)} on main. Wait for CI to start on the merge, then run this workflow again.`, "ci");
  // A re-run keeps the run id and bumps run_attempt; a separate run gets a higher run_number. The newest run is the one that counts.
  const run = [...runs].sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0) || asTime(b.created_at) - asTime(a.created_at))[0];
  if (run.status !== "completed") throw new DeployError(`CI for ${short(cfg.sha)} is still ${run.status} (${run.html_url}). Wait for it to finish, then run this workflow again.`, "ci");
  if (run.conclusion !== "success") throw new DeployError(`CI for ${short(cfg.sha)} ${run.conclusion} (${run.html_url}). Only commits with a fully green CI run can be deployed.`, "ci");

  const jobsData = await github(ctx, cfg, `/repos/${cfg.repo}/actions/runs/${run.id}/jobs?filter=all&per_page=100`, "CI jobs");
  const jobs = jobsData.jobs ?? [];
  if ((jobsData.total_count ?? jobs.length) > jobs.length) throw new DeployError(`CI run ${run.html_url} has more jobs than could be read; refusing to guess.`, "ci");
  const effective = new Map();
  for (const j of jobs) {
    const cur = effective.get(j.name);
    if (!cur || (j.run_attempt ?? 1) > (cur.run_attempt ?? 1) || ((j.run_attempt ?? 1) === (cur.run_attempt ?? 1) && asTime(j.completed_at) > asTime(cur.completed_at))) effective.set(j.name, j);
  }
  const problems = [];
  for (const [name, steps] of Object.entries(REQUIRED_CI)) {
    const j = effective.get(name);
    if (!j) {
      problems.push(`job "${name}" did not run`);
      continue;
    }
    if (j.status !== "completed" || j.conclusion !== "success") {
      problems.push(`job "${name}" is ${j.conclusion ?? j.status}`);
      continue;
    }
    for (const step of steps) {
      const s = (j.steps ?? []).find((x) => x.name === step);
      if (!s || s.conclusion !== "success") problems.push(`step "${step}" in "${name}" ${s ? `is ${s.conclusion ?? s.status}` : "did not run"}`);
    }
  }
  if (problems.length) throw new DeployError(`CI for ${short(cfg.sha)} is green overall but required work did not succeed: ${problems.join("; ")} (${run.html_url}).`, "ci");
  return { url: run.html_url };
}

/** The dispatched commit must still be main's tip, read immediately before the deploy request: a queued or re-run dispatch must not replace newer code. */
async function assertMainTip(ctx, cfg) {
  const ref = await github(ctx, cfg, `/repos/${cfg.repo}/git/ref/heads/main`, "main's current tip");
  const tip = String(ref?.object?.sha ?? "").toLowerCase();
  if (!FULL_SHA.test(tip)) throw new DeployError("Could not read the current tip of main from GitHub.", "stale");
  if (tip !== cfg.sha) {
    throw new DeployError(`main has moved on to ${short(tip)}; this run was started for ${short(cfg.sha)}. Refusing to deploy an older commit over newer code. Run the workflow again: it deploys the current tip of main.`, "stale");
  }
}

// ---------------------------------------------------------------------------------------------------------------- Railway state

const STATE_QUERY = `query State($serviceId: String!, $environmentId: String!, $input: DeploymentListInput!) {
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    domains { serviceDomains { domain } customDomains { domain } }
    latestDeployment { id status createdAt meta }
    activeDeployments { id status createdAt meta }
  }
  deployments(first: 50, input: $input) { edges { node { id status createdAt meta } } }
}`;
const DEPLOYMENT_QUERY = `query Deployment($id: String!) { deployment(id: $id) { id status createdAt meta } }`;
const DEPLOY_MUTATION = `mutation Deploy($serviceId: String!, $environmentId: String!, $commitSha: String) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
}`;
const TOKEN_QUERY = `query { projectToken { projectId environmentId } }`;

/** A deployment record is usable only if it is complete. A missing or malformed field is an error, never "assume the best". */
function readRecord(node, where) {
  const createdAt = Date.parse(node?.createdAt ?? "");
  if (!node || typeof node.id !== "string" || !node.id || typeof node.status !== "string" || !node.status || !Number.isFinite(createdAt)) {
    throw new DeployError(`Railway returned an incomplete deployment record (${where}); refusing to guess the service's state.`, "railway-state");
  }
  const raw = String(node.meta?.commitHash ?? "").toLowerCase();
  return { id: node.id, status: node.status, createdAt, commit: FULL_SHA.test(raw) ? raw : "", rawCommit: raw };
}

/** One query for everything that must agree: domains, latest, active, and the 50 newest deployments. */
async function readState(ctx, cfg) {
  const data = await railway(ctx, cfg, STATE_QUERY, { serviceId: cfg.serviceId, environmentId: cfg.environmentId, input: { projectId: cfg.projectId, environmentId: cfg.environmentId, serviceId: cfg.serviceId } });
  const si = data?.serviceInstance;
  if (!si || typeof si !== "object") throw new DeployError("Railway returned no service instance for the configured service and environment.", "railway-state");
  if (!Array.isArray(data?.deployments?.edges) || !Array.isArray(si.activeDeployments) || !si.domains || typeof si.domains !== "object") {
    throw new DeployError("Railway's response is missing the deployment list, the active deployments or the domains; refusing to guess the service's state.", "railway-state");
  }
  const list = data.deployments.edges.map((e) => readRecord(e?.node, "deployment list")).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
  const active = [...new Map(si.activeDeployments.map((n) => readRecord(n, "active deployments")).map((d) => [d.id, d])).values()];
  const latest = si.latestDeployment ? readRecord(si.latestDeployment, "latest deployment") : null;
  if (latest && !list.some((d) => d.id === latest.id)) {
    throw new DeployError(`Railway's deployment list does not include its latest deployment (${latest.id}); the list cannot be trusted to show every busy deployment.`, "railway-state");
  }
  const domains = new Set([...(si.domains.serviceDomains ?? []), ...(si.domains.customDomains ?? [])].map((d) => String(d?.domain ?? "").toLowerCase()).filter(Boolean));
  return { list, active, latest, domains };
}

/** The project token must positively be scoped to the configured project and environment. */
async function checkToken(ctx, cfg) {
  let data;
  try {
    data = await railway(ctx, cfg, TOKEN_QUERY, {});
  } catch (e) {
    throw new DeployError(e.kind === "auth" ? e.message : `Could not verify the Railway token's project and environment scope: ${e.message}`, "credentials");
  }
  const t = data?.projectToken;
  if (!t || typeof t.projectId !== "string" || typeof t.environmentId !== "string") {
    throw new DeployError("Railway did not report the token's project and environment, so its scope cannot be verified. Use a project token for the production environment.", "credentials");
  }
  if (t.projectId !== cfg.projectId || t.environmentId !== cfg.environmentId) {
    throw new DeployError("RAILWAY_PROJECT_TOKEN belongs to a different project or environment than RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID. Create the token for the production environment of this project.", "credentials");
  }
}

function assertDomainBelongs(state, cfg) {
  if (!state.domains.has(cfg.host)) {
    throw new DeployError(`${cfg.host} is not a domain of this Railway service (it has: ${[...state.domains].join(", ") || "none"}). RAILWAY_PUBLIC_URL must be this service's own Railway or custom domain, or the health and smoke checks would prove nothing.`, "configuration");
  }
}

/** Railway must be finished with everything: any unsettled, unknown or removing deployment blocks a new request. Nothing is cancelled. */
function assertIdle(state) {
  const busy = state.list.find((d) => !SETTLED.has(d.status)) ?? (state.latest && !SETTLED.has(state.latest.status) ? state.latest : null);
  if (busy) {
    throw new DeployError(`Railway has a deployment that is not settled (${busy.id}, ${busy.status}). It was NOT cancelled. Wait for it to finish or stop it in the dashboard, then run this workflow again.`, "in-flight");
  }
}

/** Who is live, and which newer attempts might have started the app (and so migrated the database) without becoming active. */
function assessBaseline(state) {
  const reasons = [];
  let active = null;
  if (state.active.length === 0) {
    reasons.push(state.list.length ? "Railway reports no active deployment (the service may be stopped, or its newest deployment failed)" : "Railway has no deployment for this service yet");
  } else if (state.active.length > 1) {
    reasons.push(`Railway reports ${state.active.length} active deployments (${state.active.map((d) => d.id).join(", ")})`);
  } else if (!state.active[0].commit) {
    reasons.push(`the active deployment (${state.active[0].id}) has no valid commit recorded`);
  } else {
    active = state.active[0];
  }
  const activeIds = new Set(state.active.map((d) => d.id));
  const floor = state.active.length ? Math.min(...state.active.map((d) => d.createdAt)) : -Infinity;
  const attempts = state.list.filter((d) => !activeIds.has(d.id) && d.status !== "SKIPPED" && d.createdAt >= floor);
  if (state.active.length && attempts.length) {
    reasons.push(`${attempts.length} newer deployment attempt(s) (${attempts.slice(0, 3).map((d) => `${d.id} ${d.status}`).join(", ")}) may have started the app and applied migrations without becoming active`);
  }
  return { active, attempts, reasons };
}

/**
 * Refuses rollbacks and divergent histories outright (a backup checkbox never grants permission to downgrade code), and requires a
 * confirmed backup whenever the database's schema state is uncertain or the release changes migrations.
 */
export function decideBackup(ctx, cfg, assessment) {
  const reasons = [...assessment.reasons];
  const { active, attempts } = assessment;
  const checkLineage = (commit, label) => {
    const rel = isAncestor(ctx, commit, cfg.sha);
    if (rel === false) {
      throw new DeployError(`${label} ${short(commit)} is not an ancestor of ${short(cfg.sha)}: this would be a rollback or a divergent history, and the database may already be ahead of the code. This workflow only moves forward. To go back, follow "Rollback and recovery" in docs/development/RAILWAY.md.`, "baseline");
    }
    return rel;
  };
  let migrations = null;
  if (active) {
    const rel = checkLineage(active.commit, "The live commit");
    if (rel === null) reasons.push(`the live commit ${short(active.commit)} is not in this repository's history`);
    else if (active.commit === cfg.sha) migrations = [];
    else {
      try {
        migrations = ctx.git(["diff", "--name-only", active.commit, cfg.sha, "--", MIGRATIONS_PATH]).split("\n").filter(Boolean);
      } catch {
        reasons.push("the migration changes could not be computed");
      }
    }
  }
  for (const a of attempts) {
    if (!a.commit) reasons.push(`attempt ${a.id} has no valid commit recorded`);
    else if (a.commit !== cfg.sha && checkLineage(a.commit, `Deployment attempt ${a.id} at`) === null) reasons.push(`attempt ${a.id} (${short(a.commit)}) is not in this repository's history`);
  }
  if (migrations && migrations.length) reasons.push(`this release changes migrations (${migrations.join(", ")})`);
  const migrationText = migrations === null ? "could not be determined" : migrations.length ? `${migrations.length} migration file(s) changed` : "no migration changes";
  const base = { migrations: migrationText, live: active ? short(active.commit) : "unknown" };
  if (cfg.backup === BACKUP_CONFIRMED) return { ...base, status: "Owner confirmed a verified backup exists (not checked by this workflow)" };
  if (!reasons.length) return { ...base, status: "Not confirmed. No migration changes, and the live release and database state are clear" };
  throw new DeployError(`A verified backup is required before this deployment: ${reasons.join("; ")}. Take and verify a backup (docs/development/RAILWAY.md → Backups), then run the workflow again with "Database backup" set to "${BACKUP_CONFIRMED}".`, "backup");
}

// ---------------------------------------------------------------------------------------------------------------- monitor + verify

async function monitor(ctx, cfg, id, started) {
  const deadline = started + ctx.deployTimeoutMs;
  let lastStatus = "";
  for (;;) {
    const d = readRecord((await railway(ctx, cfg, DEPLOYMENT_QUERY, { id }))?.deployment, `deployment ${id}`);
    if (d.id !== id) throw new DeployError(`Railway answered for deployment ${d.id} when asked for ${id}.`, "deploy");
    if (d.status !== lastStatus) {
      ctx.log(`Deployment ${id}: ${d.status}`);
      lastStatus = d.status;
    }
    if (d.rawCommit && d.rawCommit !== cfg.sha) {
      throw new DeployError(`Railway built commit ${short(d.rawCommit)} but ${short(cfg.sha)} was requested. Not treating this as a successful deployment.`, "commit", "verification-failed");
    }
    if (d.status === "SUCCESS") {
      if (!d.commit) throw new DeployError("Railway reports the deployment as successful but not which commit it built, so it cannot be matched to the requested commit.", "commit", "verification-failed");
      return d;
    }
    if (FAILURE.has(d.status)) throw new DeployError(`Railway reports the deployment as ${d.status}.`, "deploy", "railway-failed");
    if (ctx.now() >= deadline) {
      throw new DeployError(`Timed out after ${Math.round(ctx.deployTimeoutMs / 60_000)} minutes with the deployment still ${d.status}. It has NOT been cancelled and may still finish; check the Railway dashboard before running this workflow again.`, "timeout", "unknown");
    }
    await ctx.sleep(ctx.pollMs);
  }
}

/**
 * Our deployment must be THE live one: the only active deployment, the latest, with the requested commit, no other deployment created at
 * the same moment or later (ties count as competing), and the configured domain must belong to this service.
 */
async function assertActive(ctx, cfg, id) {
  const state = await readState(ctx, cfg);
  assertDomainBelongs(state, cfg);
  const ours = state.list.find((d) => d.id === id);
  if (!ours) throw new DeployError(`Deployment ${id} is missing from Railway's deployment list.`, "deploy", "verification-failed");
  const competing = state.list.find((d) => d.id !== id && d.createdAt >= ours.createdAt);
  if (competing) throw new DeployError(`Another deployment (${competing.id}, ${competing.status}) was created at or after ${id}. Someone else deployed during this run; check the Railway dashboard.`, "deploy", "verification-failed");
  const others = state.active.filter((d) => d.id !== id);
  const mine = state.active.find((d) => d.id === id);
  if (!mine || others.length) {
    throw new DeployError(`Railway's active deployments are ${state.active.map((d) => d.id).join(", ") || "none"}, not exactly ${id}. The new release is not confirmed as the live one.`, "deploy", "verification-failed");
  }
  if (state.latest?.id !== id) throw new DeployError(`Railway's latest deployment is ${state.latest?.id ?? "none"}, not ${id}.`, "deploy", "verification-failed");
  if (mine.status !== "SUCCESS" || mine.commit !== cfg.sha) {
    throw new DeployError(`Deployment ${id} is not an active SUCCESS of ${short(cfg.sha)} (status ${mine.status}, commit ${mine.commit ? short(mine.commit) : "unknown"}).`, "deploy", "verification-failed");
  }
}

// ---------------------------------------------------------------------------------------------------------------- health + smoke

/** Uncached, same-origin GET (a changing query string plus no-cache headers, so no edge or browser cache can answer for the new release). */
async function get(ctx, cfg, path, init = {}) {
  const url = new URL(path, cfg.baseUrl);
  url.searchParams.set("_deploycheck", String(ctx.now()));
  return ctx.fetch(url, { redirect: "manual", signal: timeoutSignal(ctx), ...init, headers: { "cache-control": "no-cache", pragma: "no-cache", ...(init.headers ?? {}) } });
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
    if (ctx.now() >= deadline) throw new DeployError(`/api/health did not become healthy within ${Math.round(ctx.healthTimeoutMs / 60_000)} minutes (last: ${last}). The review-pool warm-up normally takes about a minute; check the Railway deploy logs.`, "health", "verification-failed");
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
  // Student release (MTP_AUDIENCE=students): the gate says so on its open status endpoint. Then children may be signing in, so the
  // privacy notice must be the approved one (never the draft) and the sign-in page must be the class-code form.
  let students = false;
  await check("Student release: approved privacy notice and class-code sign-in", async () => {
    const res = await get(ctx, cfg, "/preview/session");
    const body = await res.json().catch(() => null);
    students = body?.audience === "students";
    if (!students) return;
    const notice = await get(ctx, cfg, "/privacy");
    const html = await notice.text();
    if (notice.status !== 200) return `the privacy notice returned HTTP ${notice.status}`;
    if (html.includes("Draft.") || !/Approved on [^<]*Notice revision [0-9a-f]{8}/.test(html)) return "the privacy notice is not an approved revision (it shows Draft)";
    const signIn = await get(ctx, cfg, "/preview/signin");
    if (signIn.status !== 200 || !(await signIn.text()).includes("Class code")) return `the sign-in page is not the class-code form (HTTP ${signIn.status})`;
  });
  if (problems.length) throw new DeployError(`Smoke tests failed: ${problems.join(" | ")}`, "smoke", "verification-failed");
  return `Passed: HTTPS, preview gate active, learner API rejected, manifest and icons available${students ? ", student release with an approved privacy notice and class-code sign-in" : ""}`;
}

// ---------------------------------------------------------------------------------------------------------------- summary

const mdCode = (s) => "`" + String(s).replace(/`/g, "'") + "`";

/** What each outcome means for the owner. The wording never claims more than the run actually knows. */
const OUTCOMES = {
  verified: { head: "✅ Deployed and verified" },
  "not-attempted": {
    head: "❌ Not deployed",
    deploy: "Not requested. Nothing was deployed.",
    next: ["Nothing changed on Railway. Fix the cause above and run the workflow again."],
  },
  rejected: {
    head: "❌ Railway rejected the request",
    deploy: "Rejected by Railway. Nothing should have been started.",
    next: ["Open the Railway dashboard (link above) and confirm no new deployment appeared before running again."],
  },
  unknown: {
    head: "⚠️ Outcome unknown",
    deploy: "Unknown. Railway may have started, or may still be running, a deployment.",
    next: ["Open the Railway dashboard (link above) and reconcile what is deploying before doing anything else.", "Do **not** run this workflow again until that is settled. It will refuse while a deployment is unsettled, and repeating an ambiguous request could start a second one.", "Nothing was cancelled, rolled back or restored by this workflow."],
  },
  "railway-failed": {
    head: "❌ Railway deployment failed",
    deploy: null,
    next: ["Open the Railway deployment logs (link above) and read the first error.", "The live app is probably still the previous version, or restarting. Nothing was rolled back and no database snapshot was restored automatically.", "To go back to the previous code, follow **Rollback and recovery** in `docs/development/RAILWAY.md`. Rolling back code does not restore learner data."],
  },
  "verification-failed": {
    head: "❌ Deployed, but not verified",
    deploy: "Railway started a deployment, but it could not be confirmed as the healthy live release.",
    next: ["Treat the live app as **unverified**: it may be running the new version in a bad state, or the old one. Open the Railway dashboard and logs (links above).", "Nothing was rolled back and no database snapshot was restored automatically.", "Fix forward, or roll back code following **Rollback and recovery** in `docs/development/RAILWAY.md`. Rolling back code does not restore learner data."],
  },
};

export function renderSummary(r, cfg) {
  const kind = OUTCOMES[r.kind] ? r.kind : "unknown";
  const info = OUTCOMES[kind];
  const head = r.outcome === "interrupted" ? `⚠️ Interrupted — ${info.head.replace(/^\S+\s/, "")}` : info.head;
  const sha = r.sha ? mdCode(short(r.sha)) : "(unknown)";
  const secs = Math.max(0, Math.round((r.durationMs ?? 0) / 1000));
  const deployResult = kind === "verified" ? r.deployResult : kind === "railway-failed" ? `❌ ${r.error ?? "Railway reports failure"}` : info.deploy;
  const lines = [
    `## ${head}`,
    "",
    `**Commit:** ${sha} ${r.commitMessage ? `— ${String(r.commitMessage).replace(/[<>]/g, "")}` : ""}`.trim(),
    "",
    `- **CI:** ${r.ci}`,
    `- **Live before:** ${r.live ?? "not checked"}`,
    `- **Database backup:** ${r.backup}`,
    `- **Migrations:** ${r.migrations}`,
    `- **Railway deployment:** ${r.deploymentId ? mdCode(r.deploymentId) : r.kind === "unknown" ? "unknown (request may have been sent)" : "not started"}`,
    `- **Deployment result:** ${deployResult}`,
    `- **Health check:** ${r.health}`,
    `- **Smoke tests:** ${r.smoke}`,
    `- **Duration:** ${Math.floor(secs / 60)}m ${secs % 60}s`,
  ];
  if (cfg?.baseUrl) lines.push("", `🔗 [Open the live app](${cfg.baseUrl}/)`);
  if (cfg?.dashboardUrl) lines.push(`🚂 [Railway dashboard (deployments and logs)](${cfg.dashboardUrl})`);
  if (cfg?.runUrl) lines.push(`📋 [This workflow run](${cfg.runUrl})`);
  if (kind !== "verified") {
    lines.push("", "### What happened", r.error ?? "The workflow was stopped.", "", "### Next steps", ...info.next.map((n, i) => `${i + 1}. ${n}`));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------- orchestration

/** Stages, in order: preflight -> sending (request about to be / just sent) -> monitoring (ID known) -> deployed (SUCCESS seen) -> verified. */
function classify(r, e) {
  if (e instanceof DeployError && e.kind) return e.kind;
  if (r.stage === "preflight") return "not-attempted";
  if (r.stage === "sending") return e instanceof RailwayApiError && (e.kind === "graphql" || e.kind === "auth") ? "rejected" : "unknown";
  if (r.stage === "monitoring") return "unknown";
  return "verification-failed";
}

export async function runDeploy(ctx, report = {}) {
  const started = ctx.now();
  const r = Object.assign(report, { stage: "preflight", outcome: "failed", kind: "not-attempted", ci: "not checked", backup: "not checked", migrations: "not checked", deployResult: "not started", health: "not checked", smoke: "not checked" });
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
    if (isAncestor(ctx, cfg.sha, "origin/main") !== true) throw new DeployError(`Commit ${short(cfg.sha)} is not part of main's history.`, "branch");
    const ci = await verifyCi(ctx, cfg);
    r.ci = `✅ Passed for this exact commit, every required job and step ([CI run](${ci.url}))`;
    await checkToken(ctx, cfg);
    const state = await readState(ctx, cfg);
    assertDomainBelongs(state, cfg);
    assertIdle(state);
    const backup = decideBackup(ctx, cfg, assessBaseline(state));
    r.backup = backup.status;
    r.migrations = backup.migrations;
    r.live = backup.live;
    ctx.log(`CI passed. Live: ${backup.live}. Backup: ${backup.status}. Migrations: ${backup.migrations}.`);

    // Last look before the request: the commit must still be main's tip, and Railway must not have changed under us.
    await assertMainTip(ctx, cfg);
    const again = await readState(ctx, cfg);
    assertIdle(again);
    const ids = (s) => s.active.map((d) => d.id).sort().join(",");
    if (again.latest?.id !== state.latest?.id || ids(again) !== ids(state)) {
      throw new DeployError("Railway's deployments changed while this run was checking. Nothing was deployed; run the workflow again.", "in-flight");
    }
    ctx.log("::endgroup::");

    ctx.log("Requesting deployment…");
    r.stage = "sending"; // from here on, anything short of a Railway-confirmed result is UNKNOWN, never "nothing happened"
    let id;
    try {
      id = (await railway(ctx, cfg, DEPLOY_MUTATION, { serviceId: cfg.serviceId, environmentId: cfg.environmentId, commitSha: cfg.sha }, { retry: false }))?.serviceInstanceDeployV2;
    } catch (e) {
      e.message = `${e.message} The request is not retried automatically.`;
      throw e;
    }
    if (!id || typeof id !== "string") throw new DeployError("Railway accepted the request but returned no deployment ID.", "railway", "unknown");
    r.deploymentId = id;
    r.stage = "monitoring";
    r.deployResult = "In progress";
    ctx.log(`Railway deployment ID: ${id}`);

    const deployed = await monitor(ctx, cfg, id, started);
    r.stage = "deployed";
    r.deployResult = `✅ SUCCESS, built commit ${short(deployed.commit)}`;
    await assertActive(ctx, cfg, id);
    r.health = await waitForHealth(ctx, cfg);
    r.smoke = await smokeTests(ctx, cfg);
    await assertActive(ctx, cfg, id);
    r.stage = "verified";
    r.kind = "verified";
    r.outcome = "succeeded";
  } catch (e) {
    r.error = e instanceof DeployError || e instanceof RailwayApiError ? e.message : `Unexpected error: ${e?.message ?? e}`;
    r.phase = e?.phase ?? e?.kind ?? "unknown";
    r.kind = classify(r, e);
    if (r.phase === "health") r.health = `❌ ${r.error}`;
    if (r.phase === "smoke") r.smoke = `❌ ${r.error}`;
    if (r.phase === "ci") r.ci = `❌ ${r.error}`;
    if (r.phase === "backup") r.backup = "❌ Refused (see below)";
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
      // Cancelled mid-run: before the request nothing was deployed; from the moment the request is being sent, nobody knows.
      const sent = report.stage && report.stage !== "preflight";
      Object.assign(report, { outcome: "interrupted", kind: sent ? "unknown" : "not-attempted", error: `The workflow received ${sig} (cancelled or timed out)${sent ? ", after the deploy request was sent. Railway keeps going on its own" : ", before any deployment was requested"}.` });
      report.ci ??= "not checked";
      report.backup ??= "not checked";
      report.migrations ??= "not checked";
      report.health ??= "not checked";
      report.smoke ??= "not checked";
      finish(report);
      process.exit(sig === "SIGINT" ? 130 : 143);
    });
  }
  const r = await runDeploy(ctx, report);
  finish(r);
  if (r.outcome === "succeeded") {
    ctx.log("Deployment verified: Railway reports the requested commit as the only active, latest deployment, and the live site is healthy.");
    return 0;
  }
  ctx.log(`::error title=Deployment ${r.kind} (${r.phase})::${redact(r.error)}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
