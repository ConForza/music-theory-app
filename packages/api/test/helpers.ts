import { createApp, type App } from "../src/app.ts";
import { loadCourse, type Course } from "../src/course.ts";
import { openDb } from "../src/db.ts";
import type { ExerciseItem } from "@mtp/curriculum";
import { inputFor } from "@mtp/engine";

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
    const parsed = (text ? JSON.parse(text) : undefined) as any;
    if (res.status === 200 && path.startsWith("/api/auth/") && parsed?.user?.id) seedEarlierLessons(this.app.db, parsed.user.id);
    return { status: res.status, body: parsed, headers: res.headers };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
}

/**
 * The legacy suites exercise G1-U3-L03 directly. Grade 1 is now strict (its earlier lessons are real), so each test learner
 * starts as someone who already finished L03's prerequisite lessons "before the ledger existed": completed rows, no XP, no evidence.
 */
const seeded = new WeakMap<object, Set<string>>();
export function seedEarlierLessons(db: ReturnType<typeof openDb>, userId: string, nodeId = LESSON) {
  const done = seeded.get(db) ?? new Set<string>();
  seeded.set(db, done);
  if (done.has(userId)) return;
  done.add(userId);
  const course = sharedCourse();
  const node = course.ix.nodeById.get(nodeId)!;
  const prereqs = [...(course.ix.ancestors.get(node.id) ?? [])].filter((p) => course.lesson(p));
  for (const p of prereqs) {
    const pn = course.ix.nodeById.get(p)!;
    db.prepare("INSERT OR IGNORE INTO lesson_progress (user_id,node_id,run,run_open,phase,content_version,curriculum_version,started_at,updated_at,completed_at,completed_content_version,completed_curriculum_version,last_stats) VALUES (?,?,1,0,'questions',?,?,?,?,?,?,?,?)").run(userId, p, pn.contentVersion, course.version, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", pn.contentVersion, course.version, JSON.stringify({ questions: 0, firstTryCorrect: 0, hintsUsed: 0, completedAt: "2026-01-01T00:00:00.000Z" }));
  }
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

/** Correct response for an item, derived from the engine's own solver (test-side only). */
export function correctResponse(course: Course, nodeId: string, itemId: string) {
  const item = course.authoredItems(nodeId).find((i) => i.id === itemId)!;
  return responseFor(course, nodeId, item);
}
export function responseFor(course: Course, nodeId: string, item: ExerciseItem, scope = course.scopeFor(nodeId, item)) {
  const a = item.answer;
  const input = inputFor(course.ix, item, scope);
  if (a.kind === "pitch" && input.kind === "pitch-letter") return { kind: "pitch-letter", letter: a.accepted[0]!.charAt(0) };
  return canonicalResponse(course.ix, item, scope);
}
/** A response the engine grades as wrong, when one exists. */
export function wrongItemResponse(course: Course, item: ExerciseItem, scope: import("@mtp/curriculum").MusicScope) {
  return wrongResponse(course.ix, item, scope);
}

export async function playLesson(c: Client, course: Course, nodeId: string) {
  await c.post(`/api/lessons/${nodeId}/start`);
  const lesson = course.lesson(nodeId)!;
  for (const it of lesson.items) {
    const r = await c.post(`/api/lessons/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.id, response: correctResponse(course, nodeId, it.id) });
    if (r.status !== 200) throw new Error(`${nodeId} ${it.id}: ${JSON.stringify(r.body)}`);
  }
  return c.post(`/api/lessons/${nodeId}/complete`);
}

/** Play a practice/review/challenge/assessment run, answering every question correctly (or with the first N wrong). */
export async function playSession(c: Client, app: App, userId: string, nodeId: string, opts: { wrong?: number } = {}) {
  const started = await c.post(`/api/nodes/${nodeId}/start`);
  if (started.status !== 200) throw new Error(`${nodeId} start: ${JSON.stringify(started.body)}`);
  const items = app.nodes.internalItems(userId, nodeId);
  let wrong = opts.wrong ?? 0;
  for (const it of items) {
    const strict = started.body.kind === "challenge" || started.body.kind === "assessment";
    const bad = wrong > 0 ? wrongItemResponse(sharedCourse(), it.item, it.scope) : null;
    if (bad) {
      wrong--;
      await c.post(`/api/nodes/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: bad });
      if (strict) continue;
    }
    const r = await c.post(`/api/nodes/${nodeId}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.itemId, response: responseFor(sharedCourse(), nodeId, it.item, it.scope) });
    if (r.status !== 200) throw new Error(`${nodeId} ${it.itemId}: ${JSON.stringify(r.body)}`);
  }
  return c.post(`/api/nodes/${nodeId}/complete`);
}

/** Finish a node and every playable prerequisite before it (the path is strict for Grade 1). */
export async function ensureDone(c: Client, app: App, userId: string, nodeId: string, seen = new Set<string>()): Promise<void> {
  if (seen.has(nodeId)) return;
  seen.add(nodeId);
  const course = sharedCourse();
  const node = course.ix.nodeById.get(nodeId)!;
  for (const p of node.resolvedUnlockAfter) if (course.isPlayable(p)) await ensureDone(c, app, userId, p, seen);
  const prog = await c.get("/api/progress");
  if (prog.body.nodes[nodeId]?.state === "completed") return;
  const res = course.lesson(nodeId) ? await playLesson(c, course, nodeId) : await playSession(c, app, userId, nodeId);
  if (res.status !== 200) throw new Error(`${nodeId}: ${JSON.stringify(res.body)}`);
}

/** Play a lesson through (finishing the earlier lessons first). */
export async function playThrough(c: Client, course: Course, nodeId = LESSON, app?: App, userId?: string) {
  if (app && userId) {
    const node = course.ix.nodeById.get(nodeId)!;
    const seen = new Set<string>([nodeId]);
    for (const p of node.resolvedUnlockAfter) if (course.isPlayable(p)) await ensureDone(c, app, userId, p, seen);
  } else {
    // Without an app handle, only lessons can be finished; their prerequisites are lessons in this unit.
    const node = course.ix.nodeById.get(nodeId)!;
    for (const p of [...(course.ix.ancestors.get(node.id) ?? [])].sort((x, y) => course.ix.nodeById.get(x)!.order - course.ix.nodeById.get(y)!.order)) {
      if (!course.lesson(p)) continue;
      const prog = await c.get("/api/progress");
      if (prog.body.nodes[p]?.state !== "completed") await playLesson(c, course, p);
    }
  }
  return playLesson(c, course, nodeId);
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
