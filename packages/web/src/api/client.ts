import type { CourseView, LearnerLesson, ProgressService, RunState, CompletionSummary } from "@mtp/api";

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
}
export interface Me {
  user: User;
  profile: Profile;
}
export interface AttemptResult {
  correct: boolean;
  category: string | null;
  message: string;
  attemptNumber: number;
  replayed: boolean;
}
export type AnswerResponse =
  | { kind: "choice"; optionId: string }
  | { kind: "pitch-letter"; letter: string }
  | { kind: "staff-position"; pitch: string };

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
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, "network", "You appear to be offline. Check your connection and try again.");
  }
  const text = await res.text();
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

/** POSTs that are safe to repeat (attempt ids make them idempotent) are retried on network failure. */
async function retrying<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiFailure) || !e.isNetwork || i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  guest: () => request<Me>("POST", "/api/auth/guest", {}),
  register: (b: { email: string; password: string; displayName: string }) => request<Me>("POST", "/api/auth/register", b),
  login: (b: { email: string; password: string }) => request<Me>("POST", "/api/auth/login", b),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  patchProfile: (b: Partial<Omit<Profile, "settings">> & { displayName?: string; settings?: Partial<Settings> }) =>
    request<Me>("PATCH", "/api/me/profile", b),
  exportData: () => request<unknown>("GET", "/api/me/export"),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/api/me"),
  course: () => request<CourseView>("GET", "/api/course"),
  progress: () => request<Overview>("GET", "/api/progress"),
  lesson: (id: string) => request<LearnerLesson>("GET", `/api/lessons/${encodeURIComponent(id)}`),
  start: (id: string) => retrying(() => request<RunState>("POST", `/api/lessons/${encodeURIComponent(id)}/start`, {})),
  setPhase: (id: string, phase: string) => request<unknown>("PUT", `/api/lessons/${encodeURIComponent(id)}/phase`, { phase }),
  hint: (id: string, itemId: string, level: number) =>
    request<{ hint: string; level: number }>("POST", `/api/lessons/${encodeURIComponent(id)}/hint`, { itemId, level }),
  attempt: (id: string, attemptId: string, itemId: string, response: AnswerResponse) =>
    retrying(() => request<AttemptResult>("POST", `/api/lessons/${encodeURIComponent(id)}/attempts`, { attemptId, itemId, response })),
  complete: (id: string) =>
    retrying(() => request<CompletionSummary & { alreadyComplete: boolean }>("POST", `/api/lessons/${encodeURIComponent(id)}/complete`, {})),
};
