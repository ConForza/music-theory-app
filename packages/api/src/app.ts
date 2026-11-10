import { z } from "zod";
import * as auth from "./auth.ts";
import { COOKIE, RateLimiter } from "./auth.ts";
import { clientKey } from "./net.ts";
import type { Course } from "./course.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { PHASES, ProgressService } from "./progress.ts";
import { PracticeService } from "./practice.ts";
import { Engagement } from "./engagement.ts";
import { ManualClock, isValidTimezone, systemClock, type Clock } from "./clock.ts";
import { LearnerResponse } from "@mtp/engine";

export const Settings = z
  .object({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    motion: z.enum(["system", "reduce", "full"]).default("system"),
    sound: z.boolean().default(true),
  })
  .strict();
export type Settings = z.infer<typeof Settings>;

export interface AppOptions {
  db: Db;
  course: Course;
  /** Mark cookies Secure (set when served over HTTPS). */
  secureCookies?: boolean;
  /** Preview policy, see path-state.ts. Defaults to true while most lessons are unwritten. */
  waiveUnwrittenPrerequisites?: boolean;
  /** Origins allowed for state-changing requests besides the request's own host. */
  allowedOrigins?: string[];
  /**
   * How many reverse proxies we run in front of this process (0 = none, the default). Only then is `x-forwarded-for`
   * read, and only the entry that many hops from the right. See docs/development/DEPLOYMENT.md.
   */
  trustedProxyHops?: number;
  /** The server's clock (tests and browser journeys inject one). Never taken from a request. */
  clock?: Clock;
  /** Expose POST /api/test/clock so browser journeys can move time forward. For tests only; never enable in production. */
  testClock?: boolean;
}

/** What the HTTP server knows about the connection; never taken from request headers. */
export interface Connection {
  remoteAddress?: string;
}

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(8, "Use at least 8 characters.").max(128);
const DisplayName = z.string().trim().min(1, "Choose a nickname.").max(30);
const Uuid = z.string().uuid();
const ProfilePatch = z
  .object({
    experience: z.enum(["new", "some"]).optional(),
    selectedGrade: z.number().int().min(1).max(5).optional(),
    onboarded: z.boolean().optional(),
    displayName: DisplayName.optional(),
    settings: Settings.partial().optional(),
    /** IANA timezone; the day boundaries for goals, streaks and review dates. */
    timezone: z.string().min(1).max(64).refine(isValidTimezone, "Unknown timezone.").optional(),
    /** Sessions per day; 0 turns the daily goal (and the streak display) off. */
    dailyGoal: z.number().int().min(0).max(5).optional(),
  })
  .strict();
const AttemptBody = z
  .object({
    attemptId: Uuid,
    itemId: z.string().min(1).max(100),
    /** Every learner answer shape the engine accepts (bounded and spelling-aware); never a correctness claim. */
    response: LearnerResponse,
  })
  .strict();

interface Ctx {
  req: Request;
  url: URL;
  params: string[];
  user?: auth.User;
  token?: string;
  body: () => Promise<unknown>;
  cookies: string[];
  /** Rate-limiting identity of the caller, derived from the connection (see net.ts). */
  client: string;
}
type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Route {
  method: string;
  pattern: RegExp;
  needsAuth: boolean;
  handler: Handler;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createApp(opts: AppOptions) {
  const { db, course } = opts;
  const clock: Clock = opts.testClock ? (opts.clock ?? new ManualClock()) : (opts.clock ?? systemClock);
  const engagement = new Engagement(db, course, clock, course.ix.c.policy);
  const progress = new ProgressService(db, course, { waiveUnwrittenPrerequisites: opts.waiveUnwrittenPrerequisites ?? true }, engagement, clock);
  const practice = new PracticeService(db, course, clock);
  // Sign-in is limited per account (so one account cannot be guessed at) and, more loosely, per address. Registration is
  // limited per address with headroom for a classroom or household sharing one; the caps are per process.
  const loginLimiter = new RateLimiter(10);
  const loginIpLimiter = new RateLimiter(60);
  const registerLimiter = new RateLimiter(20);
  const routes: Route[] = [];
  const route = (method: string, path: string, needsAuth: boolean, handler: Handler) =>
    routes.push({ method, pattern: new RegExp(`^${path.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`), needsAuth, handler });

  const sessionCookie = (token: string, maxAge: number) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${opts.secureCookies ? "; Secure" : ""}`;
  const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${opts.secureCookies ? "; Secure" : ""}`;
  const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
    const r = schema.safeParse(data);
    if (!r.success) throw new ApiError(400, "bad_request", r.error.issues[0]?.message ?? "Invalid request.", { issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return r.data;
  };
  const profileOf = (userId: string) => {
    const p = db.prepare("SELECT experience, selected_grade, onboarded, settings, timezone, daily_goal FROM profiles WHERE user_id = ?").get(userId) as {
      experience: string | null; selected_grade: number; onboarded: number; settings: string; timezone: string; daily_goal: number;
    };
    return { experience: p.experience, selectedGrade: p.selected_grade, onboarded: p.onboarded === 1, settings: Settings.parse(JSON.parse(p.settings)), timezone: p.timezone, dailyGoal: p.daily_goal };
  };
  const me = (user: auth.User) => ({ user, profile: profileOf(user.id) });
  const startSession = (ctx: Ctx, userId: string) => {
    const s = auth.createSession(db, userId);
    ctx.cookies.push(sessionCookie(s.token, s.maxAgeSeconds));
  };
  const nodeParam = (id: string) => {
    if (!course.ix.nodeById.has(id)) throw new ApiError(404, "not_found", "That lesson does not exist.");
    return id;
  };

  route("GET", "/api/health", false, () => ({ ok: true, curriculumVersion: course.version }));
  route("GET", "/api/course", false, () => course.view);

  // ---- accounts -----------------------------------------------------------
  route("POST", "/api/auth/guest", false, async (ctx) => {
    if (ctx.user) return me(ctx.user);
    const user = auth.createUser(db, { displayName: "Guest" });
    startSession(ctx, user.id);
    return me(user);
  });

  route("POST", "/api/auth/register", false, async (ctx) => {
    const body = parse(z.object({ email: Email, password: Password, displayName: DisplayName }).strict(), await ctx.body());
    registerLimiter.check(`reg:${ctx.client}`);
    const existing = auth.findByEmail(db, body.email);
    if (existing) {
      // A retry of a registration whose response was lost: the caller's own session already belongs to this account (a
      // guest upgraded in place), and the same password proves it is the same request. Answer as the first call did,
      // creating nothing. A caller with no session, or another account's, still gets email_taken and must sign in.
      if (ctx.user?.id === existing.id) {
        loginLimiter.check(`login:${body.email}`);
        if (existing.passwordHash && (await auth.verifyPassword(body.password, existing.passwordHash))) return me(ctx.user);
      }
      throw new ApiError(409, "email_taken", "That email is already registered. Try signing in.");
    }
    const passwordHash = await auth.hashPassword(body.password);
    if (ctx.user?.isGuest) {
      // Upgrade in place: the guest's progress stays attached to the same learner.
      const user = auth.upgradeGuest(db, ctx.user.id, { displayName: body.displayName, email: body.email, passwordHash });
      return me(user);
    }
    const user = auth.createUser(db, { displayName: body.displayName, email: body.email, passwordHash });
    startSession(ctx, user.id);
    return me(user);
  });

  route("POST", "/api/auth/login", false, async (ctx) => {
    const body = parse(z.object({ email: Email, password: z.string().min(1).max(128) }).strict(), await ctx.body());
    loginIpLimiter.check(`loginip:${ctx.client}`);
    loginLimiter.check(`login:${body.email}`);
    const found = auth.findByEmail(db, body.email);
    // Same error and similar work whether or not the account exists.
    const ok = found?.passwordHash ? await auth.verifyPassword(body.password, found.passwordHash) : (await auth.hashPassword(body.password), false);
    if (!found || !ok) throw new ApiError(401, "bad_credentials", "That email and password don't match.");
    if (ctx.token) auth.destroySession(db, ctx.token);
    startSession(ctx, found.id);
    const { passwordHash: _omit, ...user } = found;
    return me(user);
  });

  route("POST", "/api/auth/logout", false, (ctx) => {
    auth.destroySession(db, ctx.token);
    ctx.cookies.push(clearCookie());
    return { ok: true };
  });

  route("GET", "/api/me", true, (ctx) => me(ctx.user!));

  route("PATCH", "/api/me/profile", true, async (ctx) => {
    const patch = parse(ProfilePatch, await ctx.body());
    const cur = profileOf(ctx.user!.id);
    const settings = Settings.parse({ ...cur.settings, ...(patch.settings ?? {}) });
    const maxGoal = course.ix.c.policy.daily?.maxSessions ?? 5;
    if ((patch.dailyGoal ?? 0) > maxGoal) throw new ApiError(400, "bad_request", `Choose a goal of ${maxGoal} sessions a day or fewer.`);
    db.prepare("UPDATE profiles SET experience = ?, selected_grade = ?, onboarded = ?, settings = ?, timezone = ?, daily_goal = ?, updated_at = ? WHERE user_id = ?").run(
      patch.experience ?? cur.experience,
      patch.selectedGrade ?? cur.selectedGrade,
      (patch.onboarded ?? cur.onboarded) ? 1 : 0,
      JSON.stringify(settings),
      patch.timezone ?? cur.timezone,
      patch.dailyGoal ?? cur.dailyGoal,
      new Date().toISOString(),
      ctx.user!.id,
    );
    if (patch.displayName) db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(patch.displayName, ctx.user!.id);
    return me({ ...ctx.user!, displayName: patch.displayName ?? ctx.user!.displayName });
  });

  route("GET", "/api/me/export", true, (ctx) => {
    const id = ctx.user!.id;
    const all = (sql: string) => db.prepare(sql).all(id);
    return {
      exportedAt: new Date().toISOString(),
      user: ctx.user,
      profile: profileOf(id),
      lessonProgress: all("SELECT * FROM lesson_progress WHERE user_id = ?"),
      attempts: all("SELECT * FROM attempts WHERE user_id = ? ORDER BY created_at"),
      practiceAttempts: all("SELECT * FROM practice_attempts WHERE user_id = ? ORDER BY created_at"),
      // Brief 04. Engagement and understanding are exported separately, as they are stored.
      xpLedger: all("SELECT * FROM xp_ledger WHERE user_id = ? ORDER BY rowid"),
      dailyActivity: all("SELECT * FROM daily_activity WHERE user_id = ? ORDER BY occurred_at"),
      achievements: all("SELECT * FROM achievements_awarded WHERE user_id = ? ORDER BY awarded_at"),
      masteryEvidence: all("SELECT * FROM mastery_evidence WHERE user_id = ? ORDER BY occurred_at, rowid"),
      conceptMastery: all("SELECT * FROM concept_mastery WHERE user_id = ? ORDER BY concept_id"),
      reviewSessions: all("SELECT * FROM review_sessions WHERE user_id = ? ORDER BY started_at"),
      reviewAttempts: all("SELECT * FROM review_attempts WHERE user_id = ? ORDER BY created_at"),
      questionExposure: all("SELECT * FROM question_exposure WHERE user_id = ? ORDER BY occurred_at"),
    };
  });

  route("DELETE", "/api/me", true, (ctx) => {
    auth.deleteUser(db, ctx.user!.id);
    ctx.cookies.push(clearCookie());
    return { ok: true };
  });

  // ---- progress & lessons -------------------------------------------------
  route("GET", "/api/progress", true, (ctx) => progress.overview(ctx.user!.id));

  route("GET", "/api/lessons/:nodeId", true, (ctx) => progress.openableLesson(ctx.user!.id, nodeParam(ctx.params[0]!)));

  route("POST", "/api/lessons/:nodeId/start", true, (ctx) => progress.start(ctx.user!.id, nodeParam(ctx.params[0]!)));

  route("PUT", "/api/lessons/:nodeId/phase", true, async (ctx) => {
    const { phase } = parse(z.object({ phase: z.enum(PHASES) }).strict(), await ctx.body());
    return progress.setPhase(ctx.user!.id, nodeParam(ctx.params[0]!), phase);
  });

  route("POST", "/api/lessons/:nodeId/hint", true, async (ctx) => {
    const b = parse(z.object({ itemId: z.string().min(1).max(100), level: z.number().int().min(1).max(10) }).strict(), await ctx.body());
    return progress.hint(ctx.user!.id, nodeParam(ctx.params[0]!), b.itemId, b.level);
  });

  route("POST", "/api/lessons/:nodeId/attempts", true, async (ctx) => {
    const b = parse(AttemptBody, await ctx.body());
    return progress.attempt(ctx.user!.id, nodeParam(ctx.params[0]!), b.attemptId, b.itemId, b.response);
  });

  route("POST", "/api/lessons/:nodeId/complete", true, (ctx) => progress.complete(ctx.user!.id, nodeParam(ctx.params[0]!)));

  // ---- practice lab (Brief 03) -------------------------------------------
  route("GET", "/api/practice", true, () => practice.catalogue());
  route("GET", "/api/practice/sets/:setId", true, (ctx) => practice.set(ctx.params[0]!));
  route("POST", "/api/practice/generate", true, async (ctx) => {
    const b = parse(z.object({ templateId: z.string().regex(/^t\.g[1-5]\.[a-z0-9-]+$/), seed: z.number().int().min(0).max(2 ** 31 - 1).optional() }).strict(), await ctx.body());
    return practice.generate(b.templateId, b.seed);
  });
  route("POST", "/api/practice/hint", true, async (ctx) => {
    const b = parse(z.object({ itemId: z.string().min(1).max(100), level: z.number().int().min(1).max(10) }).strict(), await ctx.body());
    return practice.hint(ctx.user!.id, b.itemId, b.level);
  });
  route("POST", "/api/practice/attempts", true, async (ctx) => {
    const b = parse(AttemptBody, await ctx.body());
    return practice.attempt(ctx.user!.id, b.attemptId, b.itemId, b.response);
  });

  // ---- engagement, mastery and review (Brief 04) --------------------------------------------------------------------
  route("GET", "/api/engagement", true, (ctx) => engagement.snapshot(ctx.user!.id));
  route("GET", "/api/xp", true, (ctx) => ({ total: engagement.xp.total(ctx.user!.id), recent: engagement.xp.recent(ctx.user!.id, 20) }));
  route("GET", "/api/achievements", true, (ctx) => {
    const t = engagement.time(ctx.user!.id);
    return { disclaimer: engagement.achievements.disclaimer, achievements: engagement.achievements.list(ctx.user!.id, engagement.mastery.all(ctx.user!.id, t.date)) };
  });
  route("GET", "/api/review", true, (ctx) => engagement.reviewOverview(ctx.user!.id));
  route("GET", "/api/mastery/:conceptId", true, (ctx) => {
    const d = engagement.conceptDetail(ctx.user!.id, ctx.params[0]!);
    if (!d) throw new ApiError(404, "not_found", "Unknown topic.");
    return d;
  });
  route("POST", "/api/review/sessions", true, (ctx) => engagement.review.start(ctx.user!.id));
  route("GET", "/api/review/sessions/:id", true, (ctx) => engagement.review.view(ctx.user!.id, ctx.params[0]!));
  route("POST", "/api/review/sessions/:id/attempts", true, async (ctx) => {
    const b = parse(AttemptBody, await ctx.body());
    return engagement.review.attempt(ctx.user!.id, ctx.params[0]!, b.attemptId, b.itemId, b.response);
  });
  route("POST", "/api/review/sessions/:id/complete", true, (ctx) => engagement.review.complete(ctx.user!.id, ctx.params[0]!));

  if (opts.testClock) {
    route("POST", "/api/test/clock", false, async (ctx) => {
      const b = parse(z.object({ set: z.string().datetime().optional(), advanceDays: z.number().min(0).max(400).optional(), advanceMinutes: z.number().min(0).max(100000).optional() }).strict(), await ctx.body());
      const mc = clock as ManualClock;
      if (b.set) mc.set(b.set);
      if (b.advanceDays) mc.advanceDays(b.advanceDays);
      if (b.advanceMinutes) mc.advanceMs(b.advanceMinutes * 60_000);
      return { now: clock.now().toISOString() };
    });
  }

  // ---- dispatcher ---------------------------------------------------------
  const sameOrigin = (req: Request, url: URL) => {
    const origin = req.headers.get("origin");
    if (!origin) return true;
    return origin === url.origin || (opts.allowedOrigins ?? []).includes(origin);
  };

  async function fetch(req: Request, conn: Connection = {}): Promise<Response> {
    const url = new URL(req.url);
    const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    const cookies: string[] = [];
    try {
      const match = routes.map((r) => ({ r, m: r.pattern.exec(url.pathname) })).find((x) => x.m);
      if (!match || !url.pathname.startsWith("/api/")) throw new ApiError(404, "not_found", "Not found.");
      const allowed = routes.filter((r) => r.pattern.test(url.pathname)).some((r) => r.method === req.method);
      const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
      if (!route || !allowed) throw new ApiError(405, "method_not_allowed", "Method not allowed.");
      const unsafe = req.method !== "GET" && req.method !== "HEAD";
      if (unsafe) {
        if (!sameOrigin(req, url)) throw new ApiError(403, "bad_origin", "Cross-site requests are not allowed.");
        const ct = req.headers.get("content-type") ?? "";
        if (req.headers.get("content-length") !== "0" && req.body && !ct.includes("application/json")) {
          throw new ApiError(415, "unsupported_media_type", "Send JSON.");
        }
      }
      const token = parseCookies(req.headers.get("cookie"))[COOKIE];
      const user = auth.userForToken(db, token);
      if (route.needsAuth && !user) throw new ApiError(401, "unauthenticated", "Please sign in to continue.");
      if (user) db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
      const ctx: Ctx = {
        req,
        url,
        params: route.pattern.exec(url.pathname)!.slice(1).map(decodeURIComponent),
        user,
        token,
        cookies,
        client: clientKey(req.headers, conn.remoteAddress, opts.trustedProxyHops ?? 0),
        body: async () => {
          const text = await req.text();
          if (text.length > 65536) throw new ApiError(413, "too_large", "Request too large.");
          if (!text) return {};
          try {
            return JSON.parse(text);
          } catch {
            throw new ApiError(400, "bad_json", "Invalid JSON.");
          }
        },
      };
      const data = await route.handler(ctx);
      for (const c of cookies) headers.append("set-cookie", c);
      return new Response(JSON.stringify(data), { status: 200, headers });
    } catch (e) {
      if (e instanceof ApiError) {
        return new Response(JSON.stringify({ error: { code: e.code, message: e.message, ...e.extra } }), { status: e.status, headers });
      }
      console.error(e);
      return new Response(JSON.stringify({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } }), { status: 500, headers });
    }
  }

  return { fetch, progress, practice, engagement, clock };
}
export type App = ReturnType<typeof createApp>;
