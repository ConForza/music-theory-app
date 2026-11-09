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
