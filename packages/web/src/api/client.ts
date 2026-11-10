import type { CourseView, LearnerLesson, ProgressService, RunState, CompletionSummary, PracticeService, Engagement, ReviewService } from "@mtp/api";
import type { LearnerResponse } from "@mtp/engine";

export type { CourseView, LearnerLesson, RunState, CompletionSummary };
export type Overview = ReturnType<ProgressService["overview"]>;
export type NodeProgress = Overview["nodes"][string];
export type CourseNode = CourseView["worlds"][number]["nodes"][number];
export type World = CourseView["worlds"][number];
export type LearnerItem = LearnerLesson["items"][number];

export interface Settings {
  theme: "system" | "light" | "dark";
  motion: "system" | "reduce" | "full";
  sound: boolean;
}
export interface User {
  id: string;
  email: string | null;
  displayName: string;
  isGuest: boolean;
}
export interface Profile {
  experience: "new" | "some" | null;
  selectedGrade: number;
  onboarded: boolean;
  settings: Settings;
  /** IANA timezone: where a "day" starts and ends for goals, streaks and review dates. */
  timezone: string;
  /** Meaningful sessions a day; 0 means the goal (and streak display) is off. */
  dailyGoal: number;
}
export interface Me {
  user: User;
  profile: Profile;
}
export interface AttemptResult {
  correct: boolean;
  category: string | null;
  /** Authored feedback for the diagnosed mistake (or the general message). */
  message: string;
  /** Why this particular answer is wrong, from the music rules (never gives the answer away). */
  reason?: string | null;
  /** Per-note marks for sequences and progressions. */
  marks?: Array<{ index: number; ok: boolean }>;
  /** Per-part results for multi-part questions. */
  parts?: Array<{ id: string; correct: boolean; reason: string | null }>;
  /** The worked answer, revealed by the server after repeated wrong attempts. */
  solution?: string;
  attemptNumber: number;
  replayed: boolean;
}
/** Every answer shape the engine accepts (see @mtp/engine responses). Never carries correctness. */
export type AnswerResponse = LearnerResponse;
export type EngagementSnapshot = ReturnType<Engagement["snapshot"]>;
export type ReviewOverview = ReturnType<Engagement["reviewOverview"]>;
export type ConceptCard = ReviewOverview["groups"]["ready"][number];
export type ConceptDetail = NonNullable<ReturnType<Engagement["conceptDetail"]>>;
export type LessonRewards = NonNullable<CompletionSummary["rewards"]>;
export type ReviewStart = ReturnType<ReviewService["start"]>;
export type ReviewSession = ReturnType<ReviewService["view"]>;
export type ReviewSessionItem = ReviewSession["items"][number];
export type ReviewAttemptResult = AttemptResult & { kind: "review" | "remedial"; counted: boolean; remedialItemId: string | null; nextDueDate: string | null };
export type ReviewSummary = ReturnType<ReviewService["complete"]>;
export interface AchievementEntry {
  id: string;
  grade: number;
  title: string;
  description: string;
  earned: boolean;
  earnedAt: string | null;
  have: number;
  need: number;
  available: boolean;
}
export type PracticeCatalogue = ReturnType<PracticeService["catalogue"]>;
export type PracticeSet = ReturnType<PracticeService["set"]>;
export type GeneratedItem = ReturnType<PracticeService["generate"]>;

/** An error the UI can show: HTTP failures carry the server's code, network failures have status 0. */
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
  /** The request was cancelled on purpose; its outcome should be ignored, not shown. */
  get isAborted() {
    return this.code === "aborted";
  }
}

/**
 * The signed-in learner a request belongs to. Every account-bound call captures the current scope when it starts; when
 * the learner changes the scope ends, which cancels what is in flight and stops any retry from being sent. An operation
 * begun for one learner can therefore never be dispatched, or retried, under the next learner's session cookie.
 */
export interface IdentityScope {
  readonly ctl: AbortController;
}
let scope: IdentityScope = { ctl: new AbortController() };
/** The app calls this whenever the signed-in learner changes (including to signed out). */
export function endIdentityScope() {
  scope.ctl.abort();
  scope = { ctl: new AbortController() };
}
const cancelled = () => new ApiFailure(0, "aborted", "That request was cancelled.");

export interface RequestOptions {
  /** The learner this request is for. Omit for sign-in/out and other calls that create or end an identity. */
  scope?: IdentityScope;
  /** Cancels the request; the caller then ignores the outcome. */
  signal?: AbortSignal;
  /** Give up after this long (default 20s) so a stalled connection becomes an error the learner can retry. */
  timeoutMs?: number;
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  if (opts.scope?.ctl.signal.aborted) throw cancelled(); // checked before every dispatch
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, opts.timeoutMs ?? 20_000);
  const onAbort = () => ctl.abort();
  const signals = [opts.signal, opts.scope?.ctl.signal].filter((x): x is AbortSignal => !!x);
  for (const sig of signals) {
    if (sig.aborted) ctl.abort();
    else sig.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await send<T>(method, path, body, ctl.signal, () => timedOut);
  } finally {
    clearTimeout(timer);
    for (const sig of signals) sig.removeEventListener("abort", onAbort);
  }
}

async function send<T>(method: string, path: string, body: unknown, signal: AbortSignal, timedOut: () => boolean): Promise<T> {
  const fail = () =>
    timedOut()
      ? new ApiFailure(0, "timeout", "The server took too long to respond. Check your connection and try again.")
      : signal.aborted
        ? new ApiFailure(0, "aborted", "That request was cancelled.")
        : new ApiFailure(0, "network", "You appear to be offline. Check your connection and try again.");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      signal,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw fail();
  }
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw fail();
  }
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiFailure(res.status, "bad_response", "The server sent something unexpected. Please try again.");
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    const { code, message, ...rest } = e ?? {};
    throw new ApiFailure(res.status, code ?? "error", message ?? "Something went wrong. Please try again.", rest);
  }
  return data as T;
}

/**
 * POSTs that are safe to repeat (attempt ids make them idempotent) are retried on network failure, but only for the
 * learner who started them: the scope is checked before every dispatch and wakes the backoff the moment it ends.
 */
async function retrying<T>(sc: IdentityScope, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    if (sc.ctl.signal.aborted) throw cancelled();
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiFailure) || !e.isNetwork || e.isAborted || i >= tries) throw e;
      await new Promise<void>((resolve) => {
        const t = setTimeout(done, 400 * i);
        function done() {
          clearTimeout(t);
          sc.ctl.signal.removeEventListener("abort", done);
          resolve();
        }
        sc.ctl.signal.addEventListener("abort", done, { once: true });
      });
    }
  }
}

const L = (id: string) => `/api/lessons/${encodeURIComponent(id)}`;

export const api = {
  // Identity calls: they start or end a scope, so they are not bound to one.
  me: (signal?: AbortSignal) => request<Me>("GET", "/api/me", undefined, { signal }),
  guest: () => request<Me>("POST", "/api/auth/guest", {}),
  // Not auto-retried: the form decides, after checking who is signed in (see AccountForm). A retry from the same
  // session is still safe, because the server answers it with the same account instead of creating another.
  register: (b: { email: string; password: string; displayName: string }) => request<Me>("POST", "/api/auth/register", b),
  login: (b: { email: string; password: string }) => request<Me>("POST", "/api/auth/login", b),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  course: () => request<CourseView>("GET", "/api/course"),
  // Everything below acts on the current learner's data and is bound to the learner who started it.
  patchProfile: (b: Partial<Omit<Profile, "settings">> & { displayName?: string; settings?: Partial<Settings> }) =>
    request<Me>("PATCH", "/api/me/profile", b, { scope }),
  exportData: () => request<unknown>("GET", "/api/me/export", undefined, { scope }),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/api/me", undefined, { scope }),
  progress: (signal?: AbortSignal) => request<Overview>("GET", "/api/progress", undefined, { signal, scope }),
  lesson: (id: string) => request<LearnerLesson>("GET", L(id), undefined, { scope }),
  start: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<RunState>("POST", `${L(id)}/start`, {}, { scope: sc }));
  },
  setPhase: (id: string, phase: string) => request<unknown>("PUT", `${L(id)}/phase`, { phase }, { scope }),
  hint: (id: string, itemId: string, level: number) => request<{ hint: string; level: number }>("POST", `${L(id)}/hint`, { itemId, level }, { scope }),
  attempt: (id: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<AttemptResult>("POST", `${L(id)}/attempts`, { attemptId, itemId, response }, { scope: sc }));
  },
  // Practice lab (Brief 03): same account binding as lessons, so a delayed practice request or retry from one learner
  // can never be dispatched under the next learner's session.
  practice: () => request<PracticeCatalogue>("GET", "/api/practice", undefined, { scope }),
  practiceSet: (id: string) => request<PracticeSet>("GET", `/api/practice/sets/${encodeURIComponent(id)}`, undefined, { scope }),
  generate: (templateId: string, seed?: number) =>
    request<GeneratedItem>("POST", "/api/practice/generate", { templateId, ...(seed !== undefined ? { seed } : {}) }, { scope }),
  practiceAttempt: (attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<AttemptResult>("POST", "/api/practice/attempts", { attemptId, itemId, response }, { scope: sc }));
  },
  practiceHint: (itemId: string, level: number) =>
    request<{ hint: string; level: number }>("POST", "/api/practice/hint", { itemId, level }, { scope }),
  // Brief 04: engagement, mastery and review. All account-bound; the answer commands are idempotent and retried like lesson attempts.
  engagement: (signal?: AbortSignal) => request<EngagementSnapshot>("GET", "/api/engagement", undefined, { signal, scope }),
  reviewOverview: () => request<ReviewOverview>("GET", "/api/review", undefined, { scope }),
  achievements: () => request<{ disclaimer: string; achievements: AchievementEntry[] }>("GET", "/api/achievements", undefined, { scope }),
  concept: (id: string) => request<ConceptDetail>("GET", `/api/mastery/${encodeURIComponent(id)}`, undefined, { scope }),
  startReview: () => request<ReviewStart>("POST", "/api/review/sessions", {}, { scope }),
  reviewSession: (id: string) => request<ReviewSession>("GET", `/api/review/sessions/${encodeURIComponent(id)}`, undefined, { scope }),
  reviewAttempt: (sessionId: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<ReviewAttemptResult>("POST", `/api/review/sessions/${encodeURIComponent(sessionId)}/attempts`, { attemptId, itemId, response }, { scope: sc }));
  },
  completeReview: (sessionId: string) => {
    const sc = scope;
    return retrying(sc, () => request<ReviewSummary>("POST", `/api/review/sessions/${encodeURIComponent(sessionId)}/complete`, {}, { scope: sc }));
  },
  complete: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<CompletionSummary & { alreadyComplete: boolean }>("POST", `${L(id)}/complete`, {}, { scope: sc }));
  },
};
