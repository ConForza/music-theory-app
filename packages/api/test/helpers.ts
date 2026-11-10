import { createApp, type App } from "../src/app.ts";
import { loadCourse, type Course } from "../src/course.ts";
import { openDb } from "../src/db.ts";

let course: Course | undefined;
export const sharedCourse = () => (course ??= loadCourse());

export const LESSON = "G1-U3-L03";

/** An in-process client with its own cookie jar. */
export class Client {
  cookie = "";
  constructor(public app: App) {}
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.fetch(
      new Request(`http://test.local${path}`, {
        method,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      this.cookie = pair!.endsWith("=") ? "" : pair!;
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
}

export function setup(opts: { waive?: boolean } = {}) {
  const db = openDb(":memory:");
  const app = createApp({ db, course: sharedCourse(), waiveUnwrittenPrerequisites: opts.waive ?? true });
  return { db, app, client: () => new Client(app) };
}

/** Simulate a content deployment: the same database served by a course whose lesson (and release) have moved on. */
export function deployNewContent(db: ReturnType<typeof openDb>, nodeId = LESSON) {
  const base = sharedCourse();
  const next: Course = {
    ...base,
    version: "9.9.9",
    nodes: base.nodes.map((n) => (n.id === nodeId ? { ...n, contentVersion: n.contentVersion + 1 } : n)),
    lesson: (id) => {
      const l = base.lesson(id);
      return l && id === nodeId ? { ...l, contentVersion: l.contentVersion + 1 } : l;
    },
  };
  return createApp({ db, course: next, waiveUnwrittenPrerequisites: true });
}

export const email = (n: string) => `${n}@example.com`;
export async function register(c: Client, name = "ada", password = "correct horse battery") {
  return c.post("/api/auth/register", { email: email(name), password, displayName: name });
}

/** Correct response for an item of the sample lesson, derived from the authored content (test-side only). */
export function correctResponse(course: Course, nodeId: string, itemId: string) {
  const item = course.authoredItems(nodeId).find((i) => i.id === itemId)!;
  const a = item.answer;
  if (a.kind === "pitch") return { kind: "pitch-letter", letter: a.accepted[0]!.charAt(0) };
  if (a.kind === "staff-position") return { kind: "staff-position", pitch: a.accepted[0]! };
  if (a.kind === "choice") return { kind: "choice", optionId: a.correctOptionIds[0]! };
  throw new Error("unsupported");
}

export async function playThrough(c: Client, course: Course, nodeId = LESSON) {
  await c.post(`/api/lessons/${nodeId}/start`);
  const lesson = course.lesson(nodeId)!;
  for (const it of lesson.items) {
    const r = await c.post(`/api/lessons/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.id, response: correctResponse(course, nodeId, it.id) });
    if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  }
  return c.post(`/api/lessons/${nodeId}/complete`);
}

// ---- Brief 04 helpers ---------------------------------------------------------------------------------------------
import { ManualClock } from "../src/clock.ts";
import { canonicalResponse, generateItem, wrongResponse } from "@mtp/engine";
import { effectiveScope } from "@mtp/curriculum";

/** A server with a controllable clock. Time starts at a fixed midday UTC so "today" is unambiguous. */
export function setupClock(start = "2026-03-02T12:00:00Z", opts: { waive?: boolean } = {}) {
  const clock = new ManualClock(new Date(start));
  const db = openDb(":memory:");
  const app = createApp({ db, course: sharedCourse(), waiveUnwrittenPrerequisites: opts.waive ?? true, clock });
  return { db, app, clock, client: () => new Client(app) };
}

/** Items of the open review session as stored (concept, node, template, seed), for tests to derive answers from. */
export function sessionItems(db: ReturnType<typeof openDb>, sessionId: string) {
  const row = db.prepare("SELECT items FROM review_sessions WHERE id = ?").get(sessionId) as { items: string };
  return JSON.parse(row.items) as Array<{ itemId: string; kind: "review" | "remedial"; conceptId: string; nodeId: string; templateId: string; templateVersion: number; seed: number; fingerprint: string }>;
}
function regenerate(si: { nodeId: string; templateId: string; seed: number }) {
  const course = sharedCourse();
  const node = course.ix.nodeById.get(si.nodeId)!;
  const binding = node.exercises.find((b) => b.templateId === si.templateId)!;
  const scope = effectiveScope(course.ix, node, binding);
  const { item } = generateItem(course.ix, si.templateId, si.seed, { scope, evidence: "independent" });
  return { course, item, scope };
}
export const rightAnswer = (si: Parameters<typeof regenerate>[0]) => {
  const { course, item, scope } = regenerate(si);
  return canonicalResponse(course.ix, item, scope);
};
export const wrongAnswer = (si: Parameters<typeof regenerate>[0]) => {
  const { course, item, scope } = regenerate(si);
  const w = wrongResponse(course.ix, item, scope);
  if (!w) throw new Error("no wrong response available");
  return w;
};

/** Answer every question of a review session, first time, right or wrong per `plan(item)`. Returns the attempt results. */
export async function answerSession(c: Client, db: ReturnType<typeof openDb>, sessionId: string, plan: (si: ReturnType<typeof sessionItems>[number], i: number) => "right" | "wrong" = () => "right") {
  const results: Array<{ si: ReturnType<typeof sessionItems>[number]; body: Record<string, unknown>; status: number }> = [];
  let i = 0;
  // Remedial questions are appended while answering, so keep reading the stored list until every item has an attempt.
  for (;;) {
    const answered = new Set(results.map((r) => r.si.itemId));
    const next = sessionItems(db, sessionId).find((s) => !answered.has(s.itemId));
    if (!next) break;
    const mode = next.kind === "remedial" ? "right" : plan(next, i++);
    const response = mode === "right" ? rightAnswer(next) : wrongAnswer(next);
    const r = await c.post(`/api/review/sessions/${sessionId}/attempts`, { attemptId: crypto.randomUUID(), itemId: next.itemId, response });
    results.push({ si: next, body: r.body, status: r.status });
  }
  return results;
}

/** Complete the sample lesson at the current clock time and return the completion reply. */
export const finishLesson = async (c: Client, course = sharedCourse(), nodeId = LESSON) => (await playThrough(c, course, nodeId)).body;

/** The engine's canonical answer for an authored lesson item (test-side only). */
export const canonicalFor = (course: Course, nodeId: string, itemId: string) => {
  const item = course.authoredItems(nodeId).find((i) => i.id === itemId)!;
  return canonicalResponse(course.ix, item, course.scopeFor(nodeId, item));
};
export const wrongFor = (course: Course, nodeId: string, itemId: string) => {
  const item = course.authoredItems(nodeId).find((i) => i.id === itemId)!;
  return wrongResponse(course.ix, item, course.scopeFor(nodeId, item))!;
};
export const attemptLesson = (c: Client, nodeId: string, itemId: string, response: unknown, attemptId: string = crypto.randomUUID()) => c.post(`/api/lessons/${nodeId}/attempts`, { attemptId, itemId, response });
/** Start and answer every question of any playable node correctly, then complete it. */
export async function playNode(c: Client, course: Course, nodeId: string, opts: { complete?: boolean } = {}) {
  await c.post(`/api/lessons/${nodeId}/start`);
  for (const it of course.lesson(nodeId)!.items) await attemptLesson(c, nodeId, it.id, canonicalFor(course, nodeId, it.id));
  return opts.complete === false ? undefined : c.post(`/api/lessons/${nodeId}/complete`);
}
