// Mocked tests for scripts/railway-deploy.mjs: no network, no Railway, no real git. Run with `npm run test:deploy`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REQUIRED_CI, main, renderSummary, runDeploy } from "./railway-deploy.mjs";

const SHA = "a".repeat(40);
const OLD = "b".repeat(40);
const OTHER = "c".repeat(40);
const TOKEN = "rw-secret-token-1234567890";
const GH_TOKEN = "ghs_secretgithubtoken987654";
const HOST = "mtp.example.up.railway.app";
const BASE = `https://${HOST}`;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const rec = (id, status, createdAt, commit) => ({ id, status, createdAt, meta: commit === undefined ? {} : { commitHash: commit } });
const OLD_DEP = () => rec("dep-old", "SUCCESS", "2026-11-01T00:00:00Z", OLD);

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

const okRun = (over = {}) => ({ id: 1000, run_number: 50, run_attempt: 1, head_sha: SHA, status: "completed", conclusion: "success", created_at: "2026-11-27T10:00:00Z", html_url: "https://github.com/run/1000", ...over });
/** Every required job and step, successful, as GitHub reports them (plus the informational release gate, which is ignored). */
const okJobs = (attempt = 1) =>
  Object.entries(REQUIRED_CI).map(([name, steps]) => ({
    name,
    run_attempt: attempt,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-11-27T10:30:00Z",
    steps: [...steps.map((s) => ({ name: s, status: "completed", conclusion: "success" })), { name: "Release gate (informational — expected to fail until teacher sign-off)", status: "completed", conclusion: "failure" }],
  }));
const withJob = (jobs, name, patch) => jobs.map((j) => (j.name === name ? { ...j, ...patch } : j));

/** A pretend GitHub + Railway + live site. `over` customises one scenario; `calls` records every request. */
function world(over = {}, envOver = {}) {
  const w = {
    t: 0,
    calls: [],
    logs: [],
    summary: "",
    runs: [okRun()],
    jobs: okJobs(),
    tip: SHA,
    existing: [OLD_DEP()],
    activeOverride: null, // before our deployment exists
    latestOverride: undefined,
    activeAfter: null, // once our deployment exists
    latestAfter: undefined,
    domains: [HOST],
    stateOverride: null,
    progress: ["INITIALIZING", "BUILDING", "DEPLOYING", "SUCCESS"],
    builtCommit: SHA,
    extra: [],
    late: [],
    mutation: null,
    fail: null, // (op) => Response | null
    health: () => json({ ok: true, curriculumVersion: "1.2.3" }),
    site: {},
    migrationFiles: "",
    known: [SHA, OLD, OTHER],
    isAncestor: (a, b) => a === b || b === "origin/main" || (a === OLD && b === SHA),
    created: false,
    pollIndex: 0,
    siteRequests: [],
    ...over,
  };
  const newDep = () => rec("dep-new", w.progress[Math.min(w.pollIndex, w.progress.length - 1)], "2026-11-27T11:00:00Z", w.builtCommit === null ? undefined : w.builtCommit);
  const nodes = () => [...w.existing, ...(w.created ? [newDep()] : []), ...w.extra, ...(w.created && w.pollIndex >= 2 ? w.late : [])];
  const state = () => {
    const newest = [...w.existing].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
    const done = w.created && newDep().status === "SUCCESS";
    const active = w.created ? (w.activeAfter ? w.activeAfter() : done ? [newDep()] : w.existing.filter((d) => d.id === "dep-old")) : w.activeOverride ? w.activeOverride() : w.existing.filter((d) => d.id === "dep-old");
    return {
      serviceInstance: {
        domains: { serviceDomains: w.domains.map((domain) => ({ domain })), customDomains: [] },
        latestDeployment: w.created ? (w.latestAfter !== undefined ? w.latestAfter : newDep()) : w.latestOverride !== undefined ? w.latestOverride : newest,
        activeDeployments: active,
      },
      deployments: { edges: nodes().map((node) => ({ node })) },
    };
  };
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
      switch (args[0]) {
        case "log":
          return "Add interval lesson";
        case "cat-file": {
          const c = args[2].replace("^{commit}", "");
          if (c !== "origin/main" && !w.known.includes(c)) throw new Error("unknown commit");
          return "";
        }
        case "merge-base": {
          if (w.isAncestor(args[2], args[3])) return "";
          throw Object.assign(new Error("not an ancestor"), { status: 1 });
        }
        case "diff":
          return w.migrationFiles;
        default:
          throw new Error(`unexpected git ${args.join(" ")}`);
      }
    },
    fetch: async (url, init = {}) => {
      const u = new URL(String(url));
      if (u.host === "api.github.com") {
        assert.equal(init.headers.authorization, `Bearer ${GH_TOKEN}`);
        if (u.pathname.endsWith("/actions/workflows/ci.yml/runs")) {
          w.calls.push("github runs");
          return json({ workflow_runs: w.runs });
        }
        if (/\/actions\/runs\/\d+\/jobs$/.test(u.pathname)) {
          w.calls.push("github jobs");
          assert.equal(u.searchParams.get("filter"), "all");
          return json({ total_count: w.jobs.length, jobs: w.jobs });
        }
        if (u.pathname.endsWith("/git/ref/heads/main")) {
          w.calls.push("github tip");
          return json({ object: { sha: w.tip } });
        }
        throw new Error(`unexpected GitHub request ${u.pathname}`);
      }
      if (u.host === "backboard.railway.com") {
        assert.equal(init.headers["Project-Access-Token"], TOKEN, "Railway project token header");
        assert.equal(init.headers.authorization, undefined);
        const { query, variables } = JSON.parse(init.body);
        const op = query.includes("serviceInstanceDeployV2") ? "deploy" : query.includes("projectToken") ? "token" : query.includes("query State") ? "state" : "get";
        w.calls.push(`railway ${op}`);
        const failure = w.fail?.(op);
        if (failure) return failure;
        if (op === "token") return json({ data: { projectToken: { projectId: "proj-1", environmentId: "env-1" } } });
        if (op === "deploy") {
          if (w.mutation) return w.mutation(variables);
          assert.equal(variables.commitSha, SHA);
          assert.equal(variables.serviceId, "svc-1");
          assert.equal(variables.environmentId, "env-1");
          w.created = true;
          return json({ data: { serviceInstanceDeployV2: "dep-new" } });
        }
        if (op === "state") return json({ data: w.stateOverride ? w.stateOverride(state()) : state() });
        const d = newDep();
        w.pollIndex++;
        return json({ data: { deployment: d } });
      }
      assert.equal(u.origin, BASE, "only the configured site is contacted");
      assert.equal(init.method ?? "GET", "GET", "smoke tests never POST");
      assert.equal(init.headers["cache-control"], "no-cache", "probes are uncached");
      assert.ok(u.searchParams.has("_deploycheck"), "probes carry a cache-busting parameter");
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

// ------------------------------------------------------------------------------------------------------------------ success

test("successful deployment: pinned commit, ID captured, verified, summary written", async () => {
  const { w, r } = await run();
  assert.equal(r.outcome, "succeeded", r.error);
  assert.equal(r.kind, "verified");
  assert.equal(r.deploymentId, "dep-new");
  assert.equal(deployRequests(w), 1);
  assert.ok(w.calls.lastIndexOf("github tip") < w.calls.indexOf("railway deploy"), "main's tip is read before the request");
  assert.match(r.health, /Healthy/);
  assert.match(r.smoke, /Passed/);
  const md = renderSummary(r, r.cfg);
  for (const text of ["✅ Deployed and verified", "`aaaaaaa`", "Add interval lesson", "CI:", "Live before:", "Database backup:", "`dep-new`", "Health check:", "Duration:", `${BASE}/`, "railway.com/project/proj-1/service/svc-1"]) assert.ok(md.includes(text), `summary mentions ${text}`);
});

// ------------------------------------------------------------------------------------------------------------------ branch, stale dispatch

test("wrong branch is refused before any network call", async () => {
  const { w, r } = await run({}, { GITHUB_REF: "refs/heads/feature/x" });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "branch");
  assert.equal(r.kind, "not-attempted");
  assert.deepEqual(w.calls, []);
});

test("a commit that is not part of main's history is refused", async () => {
  const { w, r } = await run({ isAncestor: (a, b) => !(a === SHA && b === "origin/main") && (a === b || a === OLD) });
  assert.equal(r.phase, "branch");
  assert.equal(deployRequests(w), 0);
});

test("a stale dispatch is refused: main has moved on since the run was queued", async () => {
  const { w, r } = await run({ tip: OTHER });
  assert.equal(r.phase, "stale");
  assert.match(r.error, /moved on to ccccccc/);
  assert.equal(r.kind, "not-attempted");
  assert.equal(deployRequests(w), 0);
});

test("a queued or re-run SHA older than what is live is refused as a rollback, even with a confirmed backup", async () => {
  // Live is a newer main commit that the target does not contain: the target is an ancestor of live, not the other way round.
  const live = rec("dep-live", "SUCCESS", "2026-11-20T00:00:00Z", OTHER);
  for (const backup of ["not-confirmed", "confirmed-verified"]) {
    const { w, r } = await run({ existing: [live], activeOverride: () => [live], isAncestor: (a, b) => (a === OTHER && b === SHA ? false : a === b || b === "origin/main" || (a === SHA && b === OTHER)) }, { DATABASE_BACKUP: backup });
    assert.equal(r.phase, "baseline", backup);
    assert.match(r.error, /rollback or a divergent history/);
    assert.equal(deployRequests(w), 0);
  }
});

// ------------------------------------------------------------------------------------------------------------------ CI

for (const [name, runs, expected] of [
  ["missing", [], /No CI run found/],
  ["pending", [okRun({ status: "in_progress", conclusion: null })], /still in_progress/],
  ["queued", [okRun({ status: "queued", conclusion: null })], /still queued/],
  ["failed", [okRun({ conclusion: "failure" })], /failure/],
  ["cancelled", [okRun({ conclusion: "cancelled" })], /cancelled/],
  ["for a different commit", [okRun({ head_sha: OLD })], /No CI run found/],
  ["a newer failed run after an older success", [okRun(), okRun({ id: 1001, run_number: 51, conclusion: "failure", created_at: "2026-11-27T09:00:00Z" })], /failure/],
  ["a newer pending duplicate run", [okRun(), okRun({ id: 1001, run_number: 51, status: "in_progress", conclusion: null })], /still in_progress/],
]) {
  test(`CI ${name} blocks deployment`, async () => {
    const { w, r } = await run({ runs });
    assert.equal(r.outcome, "failed");
    assert.equal(r.phase, "ci");
    assert.match(r.error, expected);
    assert.equal(deployRequests(w), 0);
  });
}

test("CI is judged on the required jobs and steps, not on the aggregate result", async () => {
  const cases = {
    "a skipped shard": withJob(okJobs(), "browser / advanced", { conclusion: "skipped" }),
    "a missing shard": okJobs().filter((j) => j.name !== "browser / prep"),
    "the aggregate job missing": okJobs().filter((j) => j.name !== "browser"),
    "a skipped test step": withJob(okJobs(), "browser / early", { steps: [{ name: "Browser journeys (early)", status: "completed", conclusion: "skipped" }] }),
    "a missing audit step": withJob(okJobs(), "curriculum", { steps: [{ name: "Typecheck, lint, validate curriculum, check generated docs, run tests, build", status: "completed", conclusion: "success" }] }),
  };
  for (const [name, jobs] of Object.entries(cases)) {
    const { w, r } = await run({ jobs });
    assert.equal(r.phase, "ci", name);
    assert.match(r.error, /required work did not succeed/, name);
    assert.equal(deployRequests(w), 0, name);
  }
});

test("CI: the informational release gate failing does not block", async () => {
  const { r } = await run();
  assert.equal(r.outcome, "succeeded", r.error);
});

test("CI: a re-run keeps its run id and raises run_attempt; the newest attempt of each job counts", async () => {
  // Attempt 1 failed one shard; attempt 2 re-ran only that shard and passed, the others carry forward from attempt 1.
  const carried = withJob(okJobs(1), "browser / grade5", { conclusion: "failure" });
  const ok = await run({ runs: [okRun({ run_attempt: 2 })], jobs: [...carried, ...okJobs(2).filter((j) => j.name === "browser / grade5" || j.name === "browser")] });
  assert.equal(ok.r.outcome, "succeeded", ok.r.error);
  // Attempt 1 all green, attempt 2 re-ran one shard and it failed: the run-level result may lag, the job result must win.
  const bad = await run({ runs: [okRun({ run_attempt: 2 })], jobs: [...okJobs(1), ...withJob(okJobs(2), "browser / early", { conclusion: "failure" }).filter((j) => j.name === "browser / early")] });
  assert.equal(bad.r.phase, "ci");
  assert.match(bad.r.error, /browser \/ early/);
  assert.equal(deployRequests(bad.w), 0);
});

test("the required CI jobs and steps match .github/workflows/ci.yml", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  for (const [job, steps] of Object.entries(REQUIRED_CI)) {
    if (job.startsWith("browser /")) assert.ok(ci.includes("name: browser / ${{ matrix.shard }}") && ci.includes(`${job.split("/ ")[1]}`), job);
    else assert.match(ci, new RegExp(`^  ${job}:$`, "m"), job);
    for (const step of steps) assert.ok(ci.includes(step.replace(/\((foundation|early|advanced|grade5|prep)\)/, "(${{ matrix.shard }})")), `step ${step}`);
  }
  assert.ok(!Object.values(REQUIRED_CI).flat().some((s) => /Release gate/.test(s)), "informational gate is not required");
});

// ------------------------------------------------------------------------------------------------------------------ credentials and scope

test("missing credentials fail with the names (never values) and no network", async () => {
  const { w, r } = await run({}, { RAILWAY_PROJECT_TOKEN: "", RAILWAY_SERVICE_ID: " " });
  assert.equal(r.phase, "configuration");
  assert.match(r.error, /RAILWAY_PROJECT_TOKEN, RAILWAY_SERVICE_ID/);
  assert.deepEqual(w.calls, []);
});

test("an http public URL is refused", async () => {
  const { r } = await run({}, { RAILWAY_PUBLIC_URL: "http://mtp.example.com" });
  assert.equal(r.phase, "configuration");
});

test("Railway rejecting the token stops before deploying", async () => {
  const { w, r } = await run({ fail: (op) => (op === "token" ? json({ errors: [{ message: "Not Authorized" }] }) : null) });
  assert.equal(r.phase, "credentials");
  assert.match(r.error, /rejected the project token/);
  assert.equal(deployRequests(w), 0);
});

test("token scope must be positively verified: null, missing IDs, GraphQL errors and mismatches all refuse before the request", async () => {
  const cases = {
    "null scope": (op) => (op === "token" ? json({ data: { projectToken: null } }) : null),
    "missing environment": (op) => (op === "token" ? json({ data: { projectToken: { projectId: "proj-1" } } }) : null),
    "graphql error": (op) => (op === "token" ? json({ errors: [{ message: "Cannot query field projectToken" }] }) : null),
    "server error": (op) => (op === "token" ? new Response("boom", { status: 500 }) : null),
    "other environment": (op) => (op === "token" ? json({ data: { projectToken: { projectId: "proj-1", environmentId: "env-OTHER" } } }) : null),
  };
  for (const [name, fail] of Object.entries(cases)) {
    const { w, r } = await run({ fail });
    assert.equal(r.phase, "credentials", name);
    assert.equal(r.kind, "not-attempted", name);
    assert.equal(deployRequests(w), 0, name);
  }
});

test("a public URL that is not this service's domain is refused", async () => {
  const { w, r } = await run({ domains: ["something-else.up.railway.app"] });
  assert.equal(r.phase, "configuration");
  assert.match(r.error, /not a domain of this Railway service/);
  assert.equal(deployRequests(w), 0);
});

// ------------------------------------------------------------------------------------------------------------------ backup and baseline

test("backup: release with migrations needs a confirmed backup", async () => {
  const blocked = await run({ migrationFiles: "packages/api/migrations/013_x.sql" });
  assert.equal(blocked.r.phase, "backup");
  assert.match(blocked.r.error, /013_x\.sql/);
  assert.equal(deployRequests(blocked.w), 0);
  const allowed = await run({ migrationFiles: "packages/api/migrations/013_x.sql" }, { DATABASE_BACKUP: "confirmed-verified" });
  assert.equal(allowed.r.outcome, "succeeded", allowed.r.error);
  assert.match(allowed.r.backup, /Owner confirmed/);
});

test("backup: no migrations and a clear baseline may deploy without confirmation, and says so", async () => {
  const { r } = await run();
  assert.equal(r.outcome, "succeeded", r.error);
  assert.match(r.backup, /Not confirmed/);
  assert.match(r.migrations, /no migration changes/);
});

test("backup: an unknown or ambiguous baseline fails closed unless confirmed", async () => {
  const cases = {
    "no deployments yet": { existing: [], latestOverride: null, activeOverride: () => [] },
    "no active deployment": { activeOverride: () => [] },
    "two active deployments": { activeOverride: () => [OLD_DEP(), rec("dep-old2", "SUCCESS", "2026-11-02T00:00:00Z", OTHER)] },
    "live commit not in repository history": { known: [SHA] },
    "active record with no commit": { existing: [rec("dep-old", "SUCCESS", "2026-11-01T00:00:00Z", undefined)], activeOverride: () => [rec("dep-old", "SUCCESS", "2026-11-01T00:00:00Z", undefined)] },
  };
  for (const [name, over] of Object.entries(cases)) {
    const blocked = await run(over);
    assert.equal(blocked.r.phase, "backup", name);
    assert.equal(deployRequests(blocked.w), 0, name);
    const ok = await run(over, { DATABASE_BACKUP: "confirmed-verified" });
    assert.equal(ok.r.outcome, "succeeded", `${name}: ${ok.r.error}`);
  }
});

test("backup: a newer failed attempt may have migrated the database, so an older active SUCCESS is not trusted", async () => {
  for (const status of ["FAILED", "CRASHED", "REMOVED"]) {
    const failed = rec("dep-failed", status, "2026-11-10T00:00:00Z", OTHER);
    const over = { existing: [OLD_DEP(), failed], latestOverride: failed, isAncestor: (a, b) => a === b || b === "origin/main" || ((a === OLD || a === OTHER) && b === SHA) };
    const blocked = await run(over);
    assert.equal(blocked.r.phase, "backup", status);
    assert.match(blocked.r.error, /newer deployment attempt/);
    assert.equal(deployRequests(blocked.w), 0);
    const ok = await run(over, { DATABASE_BACKUP: "confirmed-verified" });
    assert.equal(ok.r.outcome, "succeeded", `${status}: ${ok.r.error}`);
  }
  // A skipped deployment never started the app.
  const skipped = rec("dep-skipped", "SKIPPED", "2026-11-10T00:00:00Z", OTHER);
  assert.equal((await run({ existing: [OLD_DEP(), skipped], latestOverride: skipped, isAncestor: (a, b) => a === b || b === "origin/main" || ((a === OLD || a === OTHER) && b === SHA) })).r.outcome, "succeeded");
});

test("a failed attempt on a divergent branch is refused even with a confirmed backup", async () => {
  const failed = rec("dep-failed", "FAILED", "2026-11-10T00:00:00Z", OTHER);
  const { w, r } = await run({ existing: [OLD_DEP(), failed], latestOverride: failed, isAncestor: (a, b) => a === b || b === "origin/main" || (a === OLD && b === SHA) }, { DATABASE_BACKUP: "confirmed-verified" });
  assert.equal(r.phase, "baseline");
  assert.match(r.error, /Deployment attempt dep-failed/);
  assert.equal(deployRequests(w), 0);
});

// ------------------------------------------------------------------------------------------------------------------ Railway state

test("an unsettled deployment blocks a new one (nothing is cancelled)", async () => {
  for (const status of ["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING", "NEEDS_APPROVAL", "REMOVING", "SLEEPING", "SOMETHING_NEW"]) {
    const busy = rec("dep-busy", status, "2026-11-27T09:00:00Z", OLD);
    const { w, r } = await run({ existing: [OLD_DEP(), busy], latestOverride: busy });
    assert.equal(r.phase, "in-flight", status);
    assert.match(r.error, /dep-busy/);
    assert.equal(deployRequests(w), 0, status);
    // Not the latest deployment, only somewhere in the list: it must still block (the list is not trusted to be ordered usefully).
    const older = rec("dep-buried", status, "2026-10-01T00:00:00Z", OLD);
    const buried = await run({ existing: [OLD_DEP(), older] });
    assert.equal(buried.r.phase, "in-flight", `${status} (buried)`);
    assert.equal(deployRequests(buried.w), 0, `${status} (buried)`);
  }
});

test("incomplete or inconsistent Railway state refuses before the request", async () => {
  const cases = {
    "missing status": { existing: [OLD_DEP(), { id: "dep-x", createdAt: "2026-11-02T00:00:00Z", meta: { commitHash: OLD } }] },
    "missing timestamp": { existing: [OLD_DEP(), { id: "dep-x", status: "SUCCESS", meta: { commitHash: OLD } }] },
    "no deployment list": { stateOverride: (s) => ({ ...s, deployments: null }) },
    "no service instance": { stateOverride: (s) => ({ ...s, serviceInstance: null }) },
    "no active list": { stateOverride: (s) => ({ ...s, serviceInstance: { ...s.serviceInstance, activeDeployments: null } }) },
    "latest not in the list": { latestOverride: rec("dep-ghost", "SUCCESS", "2026-11-26T00:00:00Z", OLD) },
  };
  for (const [name, over] of Object.entries(cases)) {
    const { w, r } = await run(over);
    assert.equal(r.outcome, "failed", name);
    assert.equal(r.phase, "railway-state", name);
    assert.equal(r.kind, "not-attempted", name);
    assert.equal(deployRequests(w), 0, name);
  }
});

test("Railway changing between the pre-flight read and the request is refused", async () => {
  let reads = 0;
  const { w, r } = await run({ stateOverride: (s) => (++reads === 2 ? { ...s, serviceInstance: { ...s.serviceInstance, latestDeployment: rec("dep-sneaky", "SUCCESS", "2026-11-27T10:59:00Z", OLD) }, deployments: { edges: [...s.deployments.edges, { node: rec("dep-sneaky", "SUCCESS", "2026-11-27T10:59:00Z", OLD) }] } } : s) });
  assert.equal(r.phase, "in-flight");
  assert.match(r.error, /changed while this run was checking/);
  assert.equal(deployRequests(w), 0);
});

test("transient errors on read-only queries are retried", async () => {
  let failures = 2;
  const { r } = await run({ fail: (op) => (op === "state" && failures-- > 0 ? new Response("bad gateway", { status: 502 }) : null) });
  assert.equal(r.outcome, "succeeded", r.error);
});

// ------------------------------------------------------------------------------------------------------------------ the request and what is known afterwards

test("Railway rejecting the deploy request: reported as rejected, not retried", async () => {
  const { w, r } = await run({ mutation: () => json({ errors: [{ message: "Commit not found" }] }) });
  assert.equal(r.kind, "rejected");
  assert.equal(r.phase, "graphql");
  assert.match(r.error, /Commit not found/);
  assert.match(r.error, /not retried/);
  assert.equal(deployRequests(w), 1);
});

test("an ambiguous request failure is UNKNOWN, never 'nothing was deployed'", async () => {
  const cases = {
    "socket failure after sending": () => {
      throw new Error("socket hang up");
    },
    "server error": () => new Response("bad gateway", { status: 502 }),
    "accepted but no ID": () => json({ data: { serviceInstanceDeployV2: null } }),
  };
  for (const [name, mutation] of Object.entries(cases)) {
    const { w, r } = await run({ mutation });
    assert.equal(r.kind, "unknown", name);
    assert.equal(deployRequests(w), 1, `${name}: never retried`);
    const md = renderSummary(r, r.cfg);
    assert.match(md, /Outcome unknown/, name);
    assert.ok(!/Nothing was deployed/.test(md), `${name}: summary must not claim nothing was deployed`);
    assert.match(md, /Do \*\*not\*\* run this workflow again/);
  }
});

test("a poll failure after an ID is known stays UNKNOWN and keeps the ID", async () => {
  const { r } = await run({ fail: (op) => (op === "get" ? new Response("down", { status: 503 }) : null) });
  assert.equal(r.kind, "unknown");
  assert.equal(r.deploymentId, "dep-new");
  const md = renderSummary(r, r.cfg);
  assert.match(md, /`dep-new`/);
  assert.ok(!/Nothing was deployed/.test(md));
});

test("a Railway-confirmed failed deployment fails the workflow", async () => {
  for (const status of ["FAILED", "CRASHED", "REMOVED"]) {
    const { r } = await run({ progress: ["BUILDING", status] });
    assert.equal(r.outcome, "failed");
    assert.equal(r.kind, "railway-failed");
    assert.match(r.error, new RegExp(status));
    assert.equal(r.deploymentId, "dep-new");
    assert.match(renderSummary(r, r.cfg), /Rolling back code does not restore learner data/);
  }
});

test("a deployment stuck in progress times out, bounded, is UNKNOWN and is not cancelled", async () => {
  const { w, r } = await run({ progress: ["BUILDING"] });
  assert.equal(r.phase, "timeout");
  assert.equal(r.kind, "unknown");
  assert.match(r.error, /NOT been cancelled/);
  assert.ok(w.t <= 25 * 60_000);
});

test("a deployment of the wrong commit is never a success", async () => {
  const wrong = await run({ builtCommit: OLD });
  assert.equal(wrong.r.outcome, "failed");
  assert.equal(wrong.r.phase, "commit");
  assert.equal(wrong.r.kind, "verification-failed");
  assert.match(wrong.r.error, /bbbbbbb.*aaaaaaa/);
  assert.equal((await run({ builtCommit: null })).r.phase, "commit");
  assert.equal((await run({ builtCommit: "abc123" })).r.phase, "commit", "a short or invalid commit hash cannot be matched");
});

// ------------------------------------------------------------------------------------------------------------------ the live release

test("the new deployment must be THE active and latest one", async () => {
  const cases = {
    "an older deployment still active": { activeAfter: () => [OLD_DEP()] },
    "old and new both active": { activeAfter: () => [OLD_DEP(), rec("dep-new", "SUCCESS", "2026-11-27T11:00:00Z", SHA)] },
    "another deployment is the latest": { latestAfter: rec("dep-x", "SUCCESS", "2026-11-27T11:00:00Z", SHA) },
  };
  for (const [name, over] of Object.entries(cases)) {
    const { r } = await run(over);
    assert.equal(r.outcome, "failed", name);
    assert.equal(r.kind, "verification-failed", name);
    assert.match(r.error, /active deployments|latest deployment/, name);
  }
});

test("a competing deployment created at the same moment, or later, fails the run (timestamp ties count)", async () => {
  for (const createdAt of ["2026-11-27T11:00:00Z", "2026-11-27T12:00:00Z"]) {
    const { r } = await run({ late: [rec("dep-other", "BUILDING", createdAt, OLD)] });
    assert.equal(r.outcome, "failed", createdAt);
    assert.equal(r.kind, "verification-failed", createdAt);
    assert.match(r.error, /dep-other/);
  }
});

test("health and smoke tests are only trusted on a domain that belongs to the service (checked again afterwards)", async () => {
  let reads = 0;
  const { r } = await run({ stateOverride: (s) => (++reads >= 4 ? { ...s, serviceInstance: { ...s.serviceInstance, domains: { serviceDomains: [{ domain: "elsewhere.up.railway.app" }], customDomains: [] } } } : s) });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "configuration");
  assert.equal(r.kind, "verification-failed");
});

test("health that never recovers times out and the deployment is reported as unverified", async () => {
  const { w, r } = await run({ health: () => new Response("starting", { status: 503 }) });
  assert.equal(r.outcome, "failed");
  assert.equal(r.phase, "health");
  assert.equal(r.kind, "verification-failed");
  assert.match(renderSummary(r, r.cfg), /Deployed, but not verified/);
  assert.ok(w.t < 60 * 60_000);
});

test("health that comes up during warm-up passes", async () => {
  let n = 0;
  const { r } = await run({ health: () => (n++ < 6 ? new Response("starting", { status: 503 }) : json({ ok: true, curriculumVersion: "1" })) });
  assert.equal(r.outcome, "succeeded", r.error);
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
    const { r } = await run({ site });
    assert.equal(r.phase, "smoke", name);
    assert.equal(r.kind, "verification-failed", name);
  }
});

// ------------------------------------------------------------------------------------------------------------------ output

test("main() never prints credentials, writes one summary, and exits non-zero on failure", async () => {
  const { w, ctx } = world({
    mutation: () => {
      throw new Error(`connect failed using ${TOKEN} and ${GH_TOKEN}`);
    },
  });
  const printed = [];
  const code = await main({ ...ctx, log: (l) => printed.push(String(l)) });
  assert.equal(code, 1);
  const everything = printed.join("\n") + w.summary;
  assert.ok(!everything.includes(TOKEN), "Railway token never appears");
  assert.ok(!everything.includes(GH_TOKEN), "GitHub token never appears");
  assert.match(w.summary, /^## ⚠️ Outcome unknown/);
  assert.equal(w.summary.match(/^## /gm).length, 1, "one summary");
  assert.match(w.summary, /\*\*\*/, "redaction marker present");
});

test("main() exits zero only on a fully verified deployment", async () => {
  const { w, ctx } = world();
  assert.equal(await main(ctx), 0);
  assert.ok(w.summary.startsWith("## ✅ Deployed and verified"));
});

test("an interrupted run before the request says nothing was deployed; after it, says unknown", () => {
  const base = { outcome: "interrupted", sha: SHA, ci: "ok", backup: "ok", migrations: "none", health: "x", smoke: "x", durationMs: 5000, error: "stopped" };
  const before = renderSummary({ ...base, kind: "not-attempted" }, null);
  assert.match(before, /Interrupted/);
  assert.match(before, /Nothing was deployed/);
  const after = renderSummary({ ...base, kind: "unknown", deploymentId: "dep-new" }, null);
  assert.match(after, /Interrupted/);
  assert.match(after, /Outcome unknown/);
  assert.ok(!/Nothing was deployed\./.test(after));
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
