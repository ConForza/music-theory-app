// Mocked tests for scripts/railway-deploy.mjs: no network, no Railway, no real git. Run with `npm run test:deploy`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { main, renderSummary, runDeploy } from "./railway-deploy.mjs";

const SHA = "a".repeat(40);
const OLD = "b".repeat(40);
const TOKEN = "rw-secret-token-1234567890";
const GH_TOKEN = "ghs_secretgithubtoken987654";
const BASE = "https://mtp.example.up.railway.app";
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const ENV = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: "ConForza/music-theory-app",
  GITHUB_RUN_ID: "42",
  GITHUB_TOKEN: GH_TOKEN,
  RAILWAY_PROJECT_TOKEN: TOKEN,
  RAILWAY_PROJECT_ID: "proj-1",
  RAILWAY_SERVICE_ID: "svc-1",
  RAILWAY_ENVIRONMENT_ID: "env-1",
  RAILWAY_PUBLIC_URL: BASE,
  DATABASE_BACKUP: "not-confirmed",
};

/** A pretend GitHub + Railway + live site. `over` customises one scenario; `calls` records every request. */
function world(over = {}, envOver = {}) {
  const w = {
    t: 0,
    calls: [],
    logs: [],
    summary: "",
    ci: [{ head_sha: SHA, status: "completed", conclusion: "success", created_at: "2026-11-27T10:00:00Z", html_url: "https://github.com/run/1" }],
    existing: [{ id: "dep-old", status: "SUCCESS", createdAt: "2026-11-01T00:00:00Z", meta: { commitHash: OLD } }],
    progress: ["INITIALIZING", "BUILDING", "DEPLOYING", "SUCCESS"],
    builtCommit: SHA,
    extra: [], // other deployments present from the start
    late: [], // deployments by someone else that appear while ours is running
    mutation: null,
    queryFail: null,
    health: () => json({ ok: true, curriculumVersion: "1.2.3" }),
    site: {},
    notOnMain: false,
    baselineMissing: false,
    migrationFiles: "",
    created: false,
    pollIndex: 0,
    ...over,
  };
  const newDep = () => ({ id: "dep-new", createdAt: "2026-11-27T11:00:00Z", status: w.progress[Math.min(w.pollIndex, w.progress.length - 1)], meta: w.builtCommit === null ? {} : { commitHash: w.builtCommit } });
  const siteDefaults = {
    "/": () => new Response(null, { status: 303, headers: { location: "/preview/signin?next=%2F" } }),
    "/api/health": () => w.health(),
    "/api/me": () => json({ error: { code: "preview_required" } }, 401),
    "/api/course": () => json({ error: { code: "preview_required" } }, 401),
    "/manifest.webmanifest": () => json({ name: "Music Theory Path", icons: [{ src: "/icons/icon-192.png" }, { src: "/apple-touch-icon.png" }] }),
    "/icons/icon-192.png": () => new Response("x", { status: 200, headers: { "content-type": "image/png" } }),
    "/apple-touch-icon.png": () => new Response("x", { status: 200, headers: { "content-type": "image/png" } }),
  };
  const ctx = {
    env: { ...ENV, ...envOver },
    githubApi: "https://api.github.com",
    railwayApi: "https://backboard.railway.com/graphql/v2",
    pollMs: 10_000,
    deployTimeoutMs: 20 * 60_000,
    healthTimeoutMs: 5 * 60_000,
    requestTimeoutMs: 1000,
    now: () => w.t,
    sleep: async (ms) => {
      w.t += ms;
    },
    log: (l) => w.logs.push(l),
    writeSummary: (md) => (w.summary += md),
    git: (args) => {
      w.calls.push(`git ${args[0]}`);
      if (args[0] === "merge-base") {
        if (w.notOnMain) throw new Error("not ancestor");
        return "";
      }
      if (args[0] === "log") return "Add interval lesson";
      if (args[0] === "cat-file") {
        if (w.baselineMissing) throw new Error("missing");
        return "";
      }
      if (args[0] === "diff") return w.migrationFiles;
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
    fetch: async (url, init = {}) => {
      const u = new URL(String(url));
      if (u.host === "api.github.com") {
        w.calls.push(`GET github ${u.pathname}`);
        assert.equal(init.headers.authorization, `Bearer ${GH_TOKEN}`);
        return json({ workflow_runs: w.ci });
      }
      if (u.host === "backboard.railway.com") {
        assert.equal(init.headers["Project-Access-Token"], TOKEN, "Railway project token header");
        assert.equal(init.headers.authorization, undefined);
        const { query, variables } = JSON.parse(init.body);
        const op = query.includes("serviceInstanceDeployV2") ? "deploy" : query.includes("projectToken") ? "token" : query.includes("query Deployments(") ? "list" : "get";
        w.calls.push(`railway ${op}`);
        if (w.queryFail?.(op)) return w.queryFail(op);
        if (op === "token") return json({ data: { projectToken: { projectId: "proj-1", environmentId: "env-1" } } });
        if (op === "deploy") {
          if (w.mutation) return w.mutation(variables);
          assert.equal(variables.commitSha, SHA);
          assert.equal(variables.serviceId, "svc-1");
          assert.equal(variables.environmentId, "env-1");
          w.created = true;
          return json({ data: { serviceInstanceDeployV2: "dep-new" } });
        }
        if (op === "list") return json({ data: { deployments: { edges: [...w.existing, ...(w.created ? [newDep()] : []), ...w.extra, ...(w.created && w.pollIndex >= 2 ? w.late : [])].map((node) => ({ node })) } } });
        const d = newDep();
        w.pollIndex++;
        return json({ data: { deployment: d } });
      }
      assert.equal(u.origin, BASE, "only the configured site is contacted");
      assert.equal((init.method ?? "GET"), "GET", "smoke tests never POST");
      w.calls.push(`GET site ${u.pathname}`);
      const handler = { ...siteDefaults, ...w.site }[u.pathname];
      return handler ? handler() : new Response("nope", { status: 404 });
    },
  };
  return { w, ctx };
}

const run = async (over, envOver) => {
  const { w, ctx } = world(over, envOver);
  const r = await runDeploy(ctx);
  return { w, r };
};
const deployRequests = (w) => w.calls.filter((c) => c === "railway deploy").length;

test("successful deployment: pinned commit, ID captured, verified, summary written", async () => {
  const { w, r } = await run();
  assert.equal(r.outcome, "succeeded", r.error);
  assert.equal(r.deploymentId, "dep-new");
  assert.equal(deployRequests(w), 1);
  assert.match(r.health, /Healthy/);
  assert.match(r.smoke, /Passed/);
  const md = renderSummary(r, r.cfg);
  for (const text of ["✅ Deployed", "`aaaaaaa`", "Add interval lesson", "CI:", "Database backup:", "`dep-new`", "Health check:", "Duration:", `${BASE}/`, "railway.com/project/proj-1/service/svc-1"]) assert.ok(md.includes(text), `summary mentions ${text}`);
  assert.ok(w.calls.every((c) => !c.startsWith("POST site")), "no POSTs to the site");
});

test("wrong branch is refused before any network call", async () => {
  const { w, r } = await run({}, { GITHUB_REF: "refs/heads/feature/x" });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "branch");
  assert.match(r.error, /only from main/);
  assert.deepEqual(w.calls, []);
});

test("a commit that is not on main is refused", async () => {
  const { w, r } = await run({ notOnMain: true });
  assert.equal(r.phase, "branch");
  assert.equal(deployRequests(w), 0);
});

for (const [name, runs, expected] of [
  ["missing", [], /No CI run found/],
  ["pending", [{ head_sha: SHA, status: "in_progress", conclusion: null, created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /still in_progress/],
  ["queued", [{ head_sha: SHA, status: "queued", conclusion: null, created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /still queued/],
  ["failed", [{ head_sha: SHA, status: "completed", conclusion: "failure", created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /failure/],
  ["cancelled", [{ head_sha: SHA, status: "completed", conclusion: "cancelled", created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /cancelled/],
  ["a run for a different commit", [{ head_sha: OLD, status: "completed", conclusion: "success", created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /No CI run found/],
  ["a newer failed re-run after an older success", [{ head_sha: SHA, status: "completed", conclusion: "success", created_at: "2026-11-27T09:00:00Z", html_url: "u" }, { head_sha: SHA, status: "completed", conclusion: "failure", created_at: "2026-11-27T10:00:00Z", html_url: "u" }], /failure/],
]) {
  test(`CI ${name} blocks deployment`, async () => {
    const { w, r } = await run({ ci: runs });
    assert.equal(r.outcome, "failed");
    assert.equal(r.phase, "ci");
    assert.match(r.error, expected);
    assert.equal(deployRequests(w), 0);
  });
}

test("missing credentials fail with the names (never values) and no network", async () => {
  const { w, r } = await run({}, { RAILWAY_PROJECT_TOKEN: "", RAILWAY_SERVICE_ID: " " });
  assert.equal(r.phase, "configuration");
  assert.match(r.error, /RAILWAY_PROJECT_TOKEN, RAILWAY_SERVICE_ID/);
  assert.deepEqual(w.calls, []);
});

test("an http public URL is refused", async () => {
  const { r } = await run({}, { RAILWAY_PUBLIC_URL: "http://mtp.example.com" });
  assert.equal(r.phase, "configuration");
  assert.match(r.error, /https/);
});

test("backup: release with migrations needs a confirmed backup", async () => {
  const blocked = await run({ migrationFiles: "packages/api/migrations/013_x.sql" });
  assert.equal(blocked.r.phase, "backup");
  assert.match(blocked.r.error, /013_x\.sql/);
  assert.equal(deployRequests(blocked.w), 0);

  const allowed = await run({ migrationFiles: "packages/api/migrations/013_x.sql" }, { DATABASE_BACKUP: "confirmed-verified" });
  assert.equal(allowed.r.outcome, "succeeded", allowed.r.error);
  assert.match(allowed.r.backup, /Owner confirmed/);
  assert.match(allowed.r.migrations, /1 migration file/);
});

test("backup: unknown live commit fails closed unless confirmed", async () => {
  const noBaseline = await run({ existing: [] });
  assert.equal(noBaseline.r.phase, "backup");
  const notInHistory = await run({ baselineMissing: true });
  assert.equal(notInHistory.r.phase, "backup");
  assert.equal(deployRequests(notInHistory.w), 0);
  const ok = await run({ baselineMissing: true }, { DATABASE_BACKUP: "confirmed-verified" });
  assert.equal(ok.r.outcome, "succeeded", ok.r.error);
});

test("backup: no migrations may deploy without confirmation, and says so", async () => {
  const { r } = await run();
  assert.equal(r.outcome, "succeeded", r.error);
  assert.match(r.backup, /Not confirmed.*No database migrations/);
});

test("Railway rejecting the token stops before deploying", async () => {
  const { w, r } = await run({ queryFail: () => json({ errors: [{ message: "Not Authorized" }] }, 200) });
  assert.equal(r.phase, "credentials");
  assert.match(r.error, /rejected the project token/);
  assert.equal(deployRequests(w), 0);
});

test("a token for another project/environment is refused", async () => {
  const { r } = await run({}, { RAILWAY_ENVIRONMENT_ID: "env-OTHER" });
  assert.equal(r.phase, "credentials");
});

test("Railway API error on the deploy request is reported and NOT retried", async () => {
  const { w, r } = await run({ mutation: () => json({ errors: [{ message: "Commit not found" }] }) });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "railway");
  assert.match(r.error, /Commit not found/);
  assert.match(r.error, /not retried/);
  assert.equal(deployRequests(w), 1);
});

test("network failure on the deploy request is not retried", async () => {
  const { w, r } = await run({
    mutation: () => {
      throw new Error("socket hang up");
    },
  });
  assert.equal(r.phase, "railway");
  assert.equal(deployRequests(w), 1);
});

test("transient errors on read-only queries are retried", async () => {
  let failures = 2;
  const { r } = await run({ queryFail: (op) => (op === "list" && failures-- > 0 ? new Response("bad gateway", { status: 502 }) : null) });
  assert.equal(r.outcome, "succeeded", r.error);
});

test("a failed Railway deployment fails the workflow", async () => {
  for (const status of ["FAILED", "CRASHED", "REMOVED"]) {
    const { r } = await run({ progress: ["BUILDING", status] });
    assert.equal(r.outcome, "failed");
    assert.equal(r.phase, "deploy");
    assert.match(r.error, new RegExp(status));
    assert.equal(r.deploymentId, "dep-new");
    assert.match(renderSummary(r, r.cfg), /Rolling back code does not restore learner data|Rollback/);
  }
});

test("a deployment stuck in progress times out, bounded, and is not cancelled", async () => {
  const { w, r } = await run({ progress: ["BUILDING"] });
  assert.equal(r.phase, "timeout");
  assert.match(r.error, /NOT been cancelled/);
  assert.ok(w.t <= 25 * 60_000);
});

test("health that never recovers times out and fails the run", async () => {
  const { w, r } = await run({ health: () => new Response("starting", { status: 503 }) });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "health");
  assert.match(r.error, /did not become healthy/);
  assert.ok(w.t < 60 * 60_000);
});

test("health that comes up during warm-up passes", async () => {
  let n = 0;
  const { r } = await run({ health: () => (n++ < 6 ? new Response("starting", { status: 503 }) : json({ ok: true, curriculumVersion: "1" })) });
  assert.equal(r.outcome, "succeeded", r.error);
});

test("a deployment of the wrong commit is never a success", async () => {
  const wrong = await run({ builtCommit: OLD });
  assert.equal(wrong.r.outcome, "failed");
  assert.equal(wrong.r.phase, "commit");
  assert.match(wrong.r.error, /bbbbbbb.*aaaaaaa/);
  const unknown = await run({ builtCommit: null });
  assert.equal(unknown.r.phase, "commit");
});

test("duplicate request: a deployment already in flight blocks a new one", async () => {
  for (const status of ["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING", "NEEDS_APPROVAL"]) {
    const { w, r } = await run({ existing: [{ id: "dep-busy", status, createdAt: "2026-11-27T09:00:00Z", meta: { commitHash: OLD } }, { id: "dep-old", status: "SUCCESS", createdAt: "2026-11-01T00:00:00Z", meta: { commitHash: OLD } }] });
    assert.equal(r.phase, "in-flight", status);
    assert.match(r.error, /dep-busy/);
    assert.equal(deployRequests(w), 0);
  }
});

test("a newer deployment started by someone else during the run fails it", async () => {
  const { r } = await run({ late: [{ id: "dep-other", status: "BUILDING", createdAt: "2026-11-27T12:00:00Z", meta: { commitHash: OLD } }] });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "deploy");
  assert.match(r.error, /dep-other/);
});

test("smoke tests: gate off, open learner API or missing manifest fail the run, with no POSTs", async () => {
  const cases = {
    "gate off": { "/": () => new Response("<html>app</html>", { status: 200 }) },
    "learner API open": { "/api/me": () => json({ user: {} }, 200) },
    "plain 401 without preview_required": { "/api/course": () => json({ error: { code: "unauthenticated" } }, 401) },
    "manifest missing": { "/manifest.webmanifest": () => new Response("no", { status: 404 }) },
    "icon missing": { "/icons/icon-192.png": () => new Response("no", { status: 404 }) },
  };
  for (const [name, site] of Object.entries(cases)) {
    const { w, r } = await run({ site });
    assert.equal(r.phase, "smoke", name);
    assert.equal(r.outcome, "failed", name);
    assert.ok(w.calls.every((c) => !c.startsWith("POST")));
  }
});

test("main() never prints credentials, writes one summary, and exits non-zero on failure", async () => {
  const { w, ctx } = world({
    mutation: () => {
      throw new Error(`connect failed using ${TOKEN} and ${GH_TOKEN}`);
    },
  });
  const printed = [];
  const origLog = console.log;
  console.log = (l) => printed.push(String(l));
  let code;
  try {
    code = await main({ ...ctx, log: (l) => printed.push(String(l)) });
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 1);
  const everything = printed.join("\n") + w.summary;
  assert.ok(!everything.includes(TOKEN), "Railway token never appears");
  assert.ok(!everything.includes(GH_TOKEN), "GitHub token never appears");
  assert.ok(w.summary.startsWith("## ❌ Deployment failed"));
  assert.equal(w.summary.match(/^## /gm).length, 1, "one summary");
  assert.match(w.summary, /\*\*\*/, "redaction marker present");
});

test("main() exits zero only on a fully verified deployment", async () => {
  const { w, ctx } = world();
  assert.equal(await main(ctx), 0);
  assert.ok(w.summary.startsWith("## ✅ Deployed"));
});

test("an interrupted summary says Railway was not cancelled", () => {
  const md = renderSummary({ outcome: "interrupted", sha: SHA, deploymentId: "dep-new", ci: "ok", backup: "ok", migrations: "none", deployResult: "Unknown", health: "x", smoke: "x", durationMs: 5000, error: "stopped" }, null);
  assert.match(md, /Interrupted/);
  assert.match(md, /not told to cancel/);
});

test("the workflow is manual-only, serialised, main-only and keeps secrets out of PRs", () => {
  const yml = readFileSync(new URL("../.github/workflows/deploy-railway.yml", import.meta.url), "utf8");
  assert.match(yml, /^name: Deploy to Railway$/m);
  assert.match(yml, /^on:\n {2}workflow_dispatch:/m);
  assert.ok(!/pull_request|push:|schedule:|workflow_run|repository_dispatch/.test(yml), "no other triggers");
  assert.match(yml, /group: railway-production-deploy\n\s+cancel-in-progress: false/);
  assert.match(yml, /environment: production/);
  assert.match(yml, /runs-on: ubuntu-latest/);
  assert.match(yml, /refs\/heads\/main/);
  assert.match(yml, /^permissions: \{\}$/m);
  assert.ok(!/^env:/m.test(yml), "no workflow-level env (secrets only on the deploy step)");
  assert.ok(!/\$\{\{\s*inputs\./.test(yml.replace(/DATABASE_BACKUP: \$\{\{ inputs\.database_backup \}\}/, "")), "inputs only reach the script through an env var");
  assert.equal((yml.match(/secrets\./g) ?? []).length, 1, "exactly one secret is referenced");
});
