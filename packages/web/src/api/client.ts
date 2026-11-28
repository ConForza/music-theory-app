import type { CourseView, LearnerLesson, ProgressService, RunState, CompletionSummary, PracticeService, Engagement, ReviewService, NodeRunService, PrepService, RevisionService, ExamSummary, PlacementSummary, TopicPracticeService, TopicPracticeSummary } from "@mtp/api";
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
  /** Extra time (percent) added to a timed mock examination: 0, 25, 50 or 100. An accommodation, never part of a score. */
  examExtraTime: number;
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
  /** When this sign-in ends, from the server. For a guest, `guestAccessEndsInDays` is the whole days left (their only way back to their progress). */
  session?: { expiresAt: string | null; guestAccessEndsInDays: number | null; guestWarningDays: number };
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
/** Brief 05: a server-built practice, review, challenge or assessment run. */
export type NodeSession = ReturnType<NodeRunService["view"]>;
export type NodeResult = ReturnType<NodeRunService["complete"]> & { rewards?: LessonRewards };
export type AssessmentResults = ReturnType<NodeRunService["results"]>;
export type ReviewSessionItem = ReviewSession["items"][number];
/** Brief 10: placement, practice examinations and revision. */
export type PrepOverview = ReturnType<PrepService["overview"]>;
export type PrepAttempt = ReturnType<PrepService["view"]>;
export type PrepResult = ReturnType<PrepService["result"]>;
export type PrepHistory = ReturnType<PrepService["history"]>;
export type PrepReadiness = ReturnType<PrepService["readinessFor"]>;
export type PrepProgress = ReturnType<PrepService["progressFor"]>;
export type PrepResults = { results: PrepHistory; grades: Array<{ grade: number; readiness: PrepReadiness; progress: PrepProgress }> };
export type { ExamSummary, PlacementSummary };
export type PrepAnswer = ({ recorded: true; replayed: boolean; attemptNumber: number; itemsPlanned: number } & Partial<AttemptResult>) | (AttemptResult & { recorded: true });
export type RevisionOverview = ReturnType<RevisionService["overview"]>;
export type RevisionExplore = ReturnType<RevisionService["explore"]>;
export type RevisionStart = ReturnType<RevisionService["start"]>;
export type RevisionSession = ReturnType<RevisionService["view"]>;
export type RevisionSummary = ReturnType<RevisionService["complete"]>;
export type RevisionInsight = RevisionOverview["weak"][number];
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
/** A lesson as opened, with how the learner reached it (guided, or explored ahead of the path, with foundation lessons to suggest). */
export type OpenedLesson = ReturnType<ProgressService["lessonFor"]>;
export type LessonAccess = OpenedLesson["access"];
/** Flexible learning: targeted topic practice. */
export type TopicOverview = ReturnType<TopicPracticeService["overview"]>;
export type TopicSession = ReturnType<TopicPracticeService["view"]>;
export type TopicStartResult = ReturnType<TopicPracticeService["start"]>;
export type TopicScopeKind = "grade" | "area" | "unit" | "topic";
export type TopicSummary = TopicPracticeSummary & { alreadyComplete: boolean };
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
  /** If the private-preview gate blocks this request, the action to show as pending when the tester comes back (`?pending=`). */
  previewReturn?: SignOutIntent;
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
    return await send<T>(method, path, body, ctl.signal, () => timedOut, opts.previewReturn);
  } finally {
    clearTimeout(timer);
    for (const sig of signals) sig.removeEventListener("abort", onAbort);
  }
}

async function send<T>(method: string, path: string, body: unknown, signal: AbortSignal, timedOut: () => boolean, previewReturn?: string): Promise<T> {
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
    if (res.status === 401 && code === "preview_required") toPreviewSignIn(previewReturn);
    throw new ApiFailure(res.status, code ?? "error", message ?? "Something went wrong. Please try again.", rest);
  }
  return data as T;
}

let leavingForPreviewSignIn = false;
/**
 * The private-preview gate no longer recognises this device (its preview session expired, or the tester's invitation was withdrawn).
 * That is not a learner sign-in problem, so go to the gate's own sign-in page, coming back here afterwards. Only once per page.
 */
function toPreviewSignIn(pending?: string) {
  if (leavingForPreviewSignIn || typeof window === "undefined") return;
  leavingForPreviewSignIn = true;
  const params = new URLSearchParams(window.location.search);
  if (pending) params.set("pending", pending);
  const query = params.toString();
  const here = window.location.pathname + (query ? `?${query}` : "");
  window.location.assign(`/preview/signin?next=${encodeURIComponent(here)}`);
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

/** Whether a sign-out also leaves the private preview, and so what is still pending if the preview gate blocks it. */
export type SignOutIntent = "signout" | "leave-preview";

let authChain: Promise<unknown> = Promise.resolve();
/**
 * Run one change of "who is signed in on this browser" at a time: sign-in, registration (with its lost-reply recovery), guest creation,
 * sign-out and account deletion. Each of these sets or clears the session cookie, and the browser keeps whichever cookie ARRIVES last, so
 * two in flight at once could let a slower, older one undo a newer explicit sign-out or sign-in (review of the PWA PR). Holding the section
 * until the response, and with it the cookie, has been received means each change starts from the cookie the previous one left. Across tabs
 * this uses the Web Locks API (one lock per origin); without it, changes are queued within the tab. Every request has a timeout, so a
 * stalled one releases the section. Not re-entrant: inside `fn`, use `rawAuth`, never the locked `api` calls.
 */
export function authExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<T>) => Promise<T> } }).locks : undefined;
  if (locks?.request) return locks.request("mtp-auth", fn);
  const run = authChain.then(fn, fn);
  authChain = run.catch(() => undefined);
  return run;
}

/** The identity-changing requests themselves, unlocked: only for use inside `authExclusive`. */
export const rawAuth = {
  me: (signal?: AbortSignal) => request<Me>("GET", "/api/me", undefined, { signal }),
  guest: () => request<Me>("POST", "/api/auth/guest", {}),
  register: (b: { email: string; password: string; displayName: string }) => request<Me>("POST", "/api/auth/register", b),
  login: (b: { email: string; password: string; onlyIfSignedOut?: boolean }) => request<Me>("POST", "/api/auth/login", b),
  logout: (intent: SignOutIntent = "signout") => request<{ ok: true }>("POST", "/api/auth/logout", {}, { previewReturn: intent }),
  // `userId`: the learner the confirmation was shown for. The server deletes nobody if the session now belongs to someone else.
  deleteAccount: (userId: string) => request<{ ok: true }>("DELETE", "/api/me", { userId }, { scope }),
};

export const api = {
  // Identity calls: they start or end a scope, so they are not bound to one.
  me: (signal?: AbortSignal) => request<Me>("GET", "/api/me", undefined, { signal }),
  // Everything that changes who is signed in runs one at a time (see authExclusive).
  guest: (): Promise<Me> => authExclusive(() => rawAuth.guest()),
  // Not auto-retried: the form decides, after checking who is signed in (see AccountForm). A retry from the same
  // session is still safe, because the server answers it with the same account instead of creating another.
  register: (b: { email: string; password: string; displayName: string }): Promise<Me> => authExclusive(() => rawAuth.register(b)),
  // `onlyIfSignedOut`: the registration form's recovery after a lost reply; the server refuses it (409 signed_in) if a different learner
  // is signed in on this device by then, so it can never replace them.
  login: (b: { email: string; password: string; onlyIfSignedOut?: boolean }): Promise<Me> => authExclusive(() => rawAuth.login(b)),
  // If the private-preview gate blocks it, the learner is NOT signed out: the preview sign-in page brings them back with the action
  // (`intent`) still pending.
  logout: (intent: SignOutIntent = "signout"): Promise<{ ok: true }> => authExclusive(() => rawAuth.logout(intent)),
  course: () => request<CourseView>("GET", "/api/course"),
  // Everything below acts on the current learner's data and is bound to the learner who started it.
  patchProfile: (b: Partial<Omit<Profile, "settings">> & { displayName?: string; settings?: Partial<Settings> }) =>
    request<Me>("PATCH", "/api/me/profile", b, { scope }),
  exportData: () => request<unknown>("GET", "/api/me/export", undefined, { scope }),
  // Replace the password (e.g. a temporary one from the teacher). The server ends the account's other sessions; this device stays signed in.
  changePassword: (b: { currentPassword: string; newPassword: string }) => request<{ ok: true }>("POST", "/api/me/password", b, { scope }),
  // Bound to the learner whose confirmation was shown: queued behind a sign-in in another tab, it must not delete that newer learner.
  deleteAccount: (userId: string): Promise<{ ok: true }> => authExclusive(() => rawAuth.deleteAccount(userId)),
  progress: (signal?: AbortSignal) => request<Overview>("GET", "/api/progress", undefined, { signal, scope }),
  // `explore`: open a written lesson ahead of the guided path (flexible learning). The server decides what that means for unlocking.
  lesson: (id: string, explore = false) => request<OpenedLesson>("GET", `${L(id)}${explore ? "?explore=1" : ""}`, undefined, { scope }),
  start: (id: string, explore = false) => {
    const sc = scope;
    return retrying(sc, () => request<RunState>("POST", `${L(id)}/start`, explore ? { explore: true } : {}, { scope: sc }));
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
  // Brief 05: practice, review, unit challenges and the Grade assessment. Same account binding and idempotent retries as lessons.
  nodeStart: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<NodeSession>("POST", `/api/nodes/${encodeURIComponent(id)}/start`, {}, { scope: sc }));
  },
  nodeHint: (id: string, itemId: string, level: number) => request<{ hint: string; level: number }>("POST", `/api/nodes/${encodeURIComponent(id)}/hint`, { itemId, level }, { scope }),
  nodeAttempt: (id: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<AttemptResult>("POST", `/api/nodes/${encodeURIComponent(id)}/attempts`, { attemptId, itemId, response }, { scope: sc }));
  },
  nodeComplete: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<NodeResult>("POST", `/api/nodes/${encodeURIComponent(id)}/complete`, {}, { scope: sc }));
  },
  results: () => request<{ results: AssessmentResults }>("GET", "/api/results", undefined, { scope }),
  // Brief 10: placement and practice examinations. Same account binding and idempotent retries as every other attempt.
  prep: () => request<PrepOverview>("GET", "/api/prep", undefined, { scope }),
  prepResults: () => request<PrepResults>("GET", "/api/prep/results", undefined, { scope }),
  startExam: (grade: number, b: { mode: "practice" | "mock"; timed?: boolean; extraTimePercent?: number }) => {
    const sc = scope;
    return retrying(sc, () => request<PrepAttempt>("POST", `/api/exams/${grade}/start`, b, { scope: sc }));
  },
  startPlacement: () => {
    const sc = scope;
    return retrying(sc, () => request<PrepAttempt>("POST", "/api/placement/start", {}, { scope: sc }));
  },
  prepAttempt: (id: string) => request<PrepAttempt>("GET", `/api/prep/attempts/${encodeURIComponent(id)}`, undefined, { scope }),
  prepResult: (id: string) => request<PrepResult>("GET", `/api/prep/attempts/${encodeURIComponent(id)}/result`, undefined, { scope }),
  prepHint: (id: string, itemId: string, level: number) => request<{ hint: string; level: number }>("POST", `/api/prep/attempts/${encodeURIComponent(id)}/hint`, { itemId, level }, { scope }),
  prepAnswer: (id: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<PrepAnswer>("POST", `/api/prep/attempts/${encodeURIComponent(id)}/answers`, { attemptId, itemId, response }, { scope: sc }));
  },
  prepComplete: (id: string, allowUnanswered = false) => {
    const sc = scope;
    return retrying(sc, () => request<(ExamSummary | PlacementSummary) & { alreadyComplete: boolean }>("POST", `/api/prep/attempts/${encodeURIComponent(id)}/complete`, allowUnanswered ? { allowUnanswered: true } : {}, { scope: sc }));
  },
  prepAbandon: (id: string) => request<{ ok: true }>("POST", `/api/prep/attempts/${encodeURIComponent(id)}/abandon`, {}, { scope }),
  prepAccept: (id: string, startGrade: number) => request<{ startGrade: number; recommendedGrade: number }>("POST", `/api/prep/attempts/${encodeURIComponent(id)}/accept`, { startGrade }, { scope }),
  // Brief 10: personalised revision.
  revision: () => request<RevisionOverview>("GET", "/api/revision", undefined, { scope }),
  revisionExplore: () => request<RevisionExplore>("GET", "/api/revision/explore", undefined, { scope }),
  startRevision: (b: { mode: "quick" | "weak" | "explore" | "mixed"; minutes?: number; conceptId?: string; grade?: number; unitId?: string; familyId?: string }) => {
    const sc = scope;
    return retrying(sc, () => request<RevisionStart>("POST", "/api/revision/sessions", b, { scope: sc }));
  },
  revisionSession: (id: string) => request<RevisionSession>("GET", `/api/revision/sessions/${encodeURIComponent(id)}`, undefined, { scope }),
  revisionAttempt: (sessionId: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<AttemptResult>("POST", `/api/revision/sessions/${encodeURIComponent(sessionId)}/attempts`, { attemptId, itemId, response }, { scope: sc }));
  },
  completeRevision: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<RevisionSummary>("POST", `/api/revision/sessions/${encodeURIComponent(id)}/complete`, {}, { scope: sc }));
  },
  // Flexible learning: practise any topic. Starting is NOT retried automatically (each start plans a new session); answers are idempotent.
  topicPractice: () => request<TopicOverview>("GET", "/api/topic-practice", undefined, { scope }),
  startTopicPractice: (b: { grade: number; kind: TopicScopeKind; id: string; count: number }) => request<TopicStartResult>("POST", "/api/topic-practice/sessions", b, { scope }),
  topicSession: (id: string) => request<TopicSession>("GET", `/api/topic-practice/sessions/${encodeURIComponent(id)}`, undefined, { scope }),
  topicHint: (sessionId: string, itemId: string, level: number) => request<{ hint: string; level: number }>("POST", `/api/topic-practice/sessions/${encodeURIComponent(sessionId)}/hint`, { itemId, level }, { scope }),
  topicAttempt: (sessionId: string, attemptId: string, itemId: string, response: AnswerResponse) => {
    const sc = scope;
    return retrying(sc, () => request<AttemptResult>("POST", `/api/topic-practice/sessions/${encodeURIComponent(sessionId)}/attempts`, { attemptId, itemId, response }, { scope: sc }));
  },
  completeTopicPractice: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<TopicSummary>("POST", `/api/topic-practice/sessions/${encodeURIComponent(id)}/complete`, {}, { scope: sc }));
  },
  abandonRevision: (id: string) => request<{ ok: true }>("POST", `/api/revision/sessions/${encodeURIComponent(id)}/abandon`, {}, { scope }),
  complete: (id: string) => {
    const sc = scope;
    return retrying(sc, () => request<CompletionSummary & { alreadyComplete: boolean }>("POST", `${L(id)}/complete`, {}, { scope: sc }));
  },
};

/** The private preview this device is signed in to, if the deployment has one (the gate answers; elsewhere this is the app's HTML). */
export async function previewStatus(): Promise<{ preview: boolean; signedIn: boolean; students: boolean }> {
  try {
    const res = await fetch("/preview/session", { credentials: "same-origin" });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return { preview: false, signedIn: false, students: false };
    const b = (await res.json()) as { preview?: boolean; signedIn?: boolean; audience?: string };
    return { preview: b.preview === true, signedIn: b.signedIn === true, students: b.audience === "students" };
  } catch {
    return { preview: false, signedIn: false, students: false };
  }
}

/** For tests only. */
export function resetPreviewRedirectForTests() {
  leavingForPreviewSignIn = false;
}
