import { describe, expect, it } from "vitest";
import { computeNodeStates } from "../src/path-state.ts";
import { Client, LESSON, correctResponse, deployNewContent, playThrough, register, setup, sharedCourse } from "./helpers.ts";
import { gradeResponse } from "../src/grade.ts";

const course = sharedCourse();
const L = (c: ReturnType<ReturnType<typeof setup>["client"]>) => ({
  start: () => c.post(`/api/lessons/${LESSON}/start`),
  attempt: (itemId: string, response: unknown, attemptId: string = crypto.randomUUID()) => c.post(`/api/lessons/${LESSON}/attempts`, { attemptId, itemId, response }),
  complete: () => c.post(`/api/lessons/${LESSON}/complete`),
});

describe("curriculum integration", () => {
  it("serves the whole path from the curriculum, with no answers", async () => {
    const c = setup().client();
    const r = await c.get("/api/course");
    expect(r.body.worlds).toHaveLength(5);
    expect(r.body.worlds.map((w: { units: unknown[] }) => w.units.length)).toEqual([7, 5, 5, 5, 5]);
    const total = r.body.worlds.reduce((n: number, w: { nodes: unknown[] }) => n + w.nodes.length, 0);
    expect(total).toBe(course.nodes.length);
    expect(JSON.stringify(r.body)).not.toMatch(/bookSection|abrsm2020|provenance/);
    const types = new Set(r.body.worlds.flatMap((w: { nodes: Array<{ type: string }> }) => w.nodes.map((n) => n.type)));
    expect(types).toEqual(new Set(["lesson", "practice", "review", "unit_challenge", "grade_assessment", "enrichment"]));
  });

  it("never leaks answers to the client", async () => {
    const c = setup().client();
    await register(c);
    const r = await c.get(`/api/lessons/${LESSON}`);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/"accepted"|correctOptionIds|"feedback"|"hints"|"answer"/);
    expect(r.body.items.length).toBe(6);
    expect(r.body.items.map((i: { input: { kind: string } }) => i.input.kind)).toEqual(["pitch-letter", "pitch-letter", "pitch-letter", "pitch-letter", "staff-position", "staff-position"]);
  });

  it("marks only lessons with playable content as playable", () => {
    const playable = course.view.worlds.flatMap((w) => w.nodes).filter((n) => n.playable).map((n) => n.id);
    expect(playable.sort()).toEqual(["G1-U3-L03", "G5-U4-L06"].sort().filter((id) => course.isPlayable(id)));
    expect(playable).toContain("G1-U3-L03");
  });
});

describe("unlocking and prerequisites", () => {
  it("opens G1-U3-L03 in preview mode but keeps unwritten nodes as coming soon", async () => {
    const c = setup().client();
    await register(c);
    const p = (await c.get("/api/progress")).body;
    expect(p.nodes["G1-U3-L03"].state).toBe("available");
    expect(p.nodes["G1-U1-L01"].state).toBe("coming_soon");
    expect(p.grades[0].nextNodeId).toBe("G1-U3-L03");
  });

  it("locks a playable lesson until its written prerequisites are complete (strict policy)", async () => {
    const { client } = setup({ waive: false });
    const c = client();
    await register(c);
    const p = (await c.get("/api/progress")).body;
    expect(p.nodes["G1-U3-L03"].state).toBe("locked");
    expect(p.nodes["G1-U3-L03"].lockedBy).toEqual(["G1-U3-L02"]);
    const r = await c.post(`/api/lessons/${LESSON}/start`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("locked");
  });

  it("does not waive a playable prerequisite, so completion order is enforced", () => {
    const rows = [] as never[];
    const fake = { ...course, isPlayable: (id: string) => id === "G1-U3-L02" || id === "G1-U3-L03" } as typeof course;
    const states = computeNodeStates(fake, rows, { waiveUnwrittenPrerequisites: true });
    expect(states.get("G1-U3-L02")!.state).toBe("available");
    expect(states.get("G1-U3-L03")!.state).toBe("locked");
    const done = computeNodeStates(fake, [{ node_id: "G1-U3-L02", run: 1, run_open: 0, phase: "intro", content_version: 1, completed_at: "x", completed_content_version: 1 }], { waiveUnwrittenPrerequisites: true });
    expect(done.get("G1-U3-L03")!.state).toBe("available");
  });

  it("rejects unknown, planned and invalid nodes", async () => {
    const c = setup().client();
    await register(c);
    expect((await c.get("/api/lessons/NOPE")).status).toBe(404);
    const planned = await c.get("/api/lessons/G1-U1-L01");
    expect(planned.status).toBe(409);
    expect(planned.body.error.code).toBe("coming_soon");
    expect((await c.post("/api/lessons/G1-U1-L01/start")).status).toBe(409);
  });

  it("unlocks nothing through attempts alone: only the server-verified completion counts", async () => {
    const c = setup().client();
    await register(c);
    const l = L(c);
    await l.start();
    const early = await l.complete();
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("incomplete");
    expect((await c.get("/api/progress")).body.nodes[LESSON].state).toBe("in_progress");
  });
});

describe("attempts and completion", () => {
  it("grades on the server and gives authored, specific feedback", async () => {
    const c = setup().client();
    await register(c);
    const l = L(c);
    await l.start();
    const wrong = await l.attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "D" });
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.category).toBe("counted-from-top");
    expect(wrong.body.message).toMatch(/counted from the bottom/i);
    const right = await l.attempt("i.g1-u3-l03.guided-1", correctResponse(course, LESSON, "i.g1-u3-l03.guided-1"));
    expect(right.body).toMatchObject({ correct: true, attemptNumber: 2 });
    const staff = await l.attempt("i.g1-u3-l03.independent-3", { kind: "staff-position", pitch: "A4" });
    expect(staff.body.correct).toBe(false);
    expect(staff.body.category).toBe("line-space-swap");
    const octave = await l.attempt("i.g1-u3-l03.independent-3", { kind: "staff-position", pitch: "F4" });
    expect(octave.body.category).toBe("wrong-octave");
  });

  it("is idempotent: retrying the same attempt id records nothing new", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const l = L(c);
    await l.start();
    const id = crypto.randomUUID();
    const body = correctResponse(course, LESSON, "i.g1-u3-l03.guided-1");
    const a = await l.attempt("i.g1-u3-l03.guided-1", body, id);
    const b = await l.attempt("i.g1-u3-l03.guided-1", body, id);
    expect(a.body.replayed).toBe(false);
    expect(b.body).toMatchObject({ correct: true, replayed: true, attemptNumber: 1 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n).toBe(1);
    const reuse = await l.attempt("i.g1-u3-l03.guided-2", body, id);
    expect(reuse.status).toBe(409);
  });

  it("rejects answers of the wrong shape or for unknown questions", async () => {
    const c = setup().client();
    await register(c);
    const l = L(c);
    await l.start();
    expect((await l.attempt("i.g1-u3-l03.guided-1", { kind: "staff-position", pitch: "F5" })).status).toBe(400);
    expect((await l.attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "H" })).status).toBe(400);
    expect((await l.attempt("nope", { kind: "pitch-letter", letter: "A" })).status).toBe(404);
    expect((await c.post(`/api/lessons/${LESSON}/attempts`, { itemId: "x" })).status).toBe(400);
  });

  it("requires a started lesson before attempting", async () => {
    const c = setup().client();
    await register(c);
    const r = await L(c).attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "G" });
    expect(r.status).toBe(409);
  });

  it("records hints on the server and keeps independent items hint-free", async () => {
    const c = setup().client();
    await register(c);
    const l = L(c);
    await l.start();
    const h = await c.post(`/api/lessons/${LESSON}/hint`, { itemId: "i.g1-u3-l03.guided-1", level: 1 });
    expect(h.body.hint).toMatch(/curl/);
    expect((await c.post(`/api/lessons/${LESSON}/hint`, { itemId: "i.g1-u3-l03.independent-1", level: 1 })).status).toBe(409);
    await l.attempt("i.g1-u3-l03.guided-1", correctResponse(course, LESSON, "i.g1-u3-l03.guided-1"));
    const run = (await c.post(`/api/lessons/${LESSON}/start`)).body;
    expect(run.items["i.g1-u3-l03.guided-1"]).toMatchObject({ correct: true, firstTry: false, hintsUsed: 1 });
  });

  it("completes a lesson once every question is answered, and unlocks the next", async () => {
    const c = setup({ waive: false }).client();
    await register(c);
    const done = await playThrough(c, course, LESSON).catch((e) => e);
    // With the strict policy G1-U3-L03 is locked behind unwritten lessons: nothing can be completed.
    expect(String(done)).toMatch(/locked|Finish/);

    const p = setup().client();
    await register(p);
    const r = await playThrough(p, course);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ questions: 6, firstTryCorrect: 6, hintsUsed: 0, alreadyComplete: false });
    const progress = (await p.get("/api/progress")).body;
    expect(progress.nodes[LESSON]).toMatchObject({ state: "completed", reviewAvailable: false });
    expect(progress.totals.lessonsCompleted).toBe(1);
    expect(progress.grades[0].completedNodes).toBe(1);
    const again = await p.post(`/api/lessons/${LESSON}/complete`);
    expect(again.body.alreadyComplete).toBe(true);
    expect(again.body.completedAt).toBe(r.body.completedAt);
  });
});

describe("resume and interruption", () => {
  it("resumes at the first unanswered question with the saved phase", async () => {
    const { client } = setup();
    const a = client();
    await register(a);
    await a.post(`/api/lessons/${LESSON}/start`);
    await a.call("PUT", `/api/lessons/${LESSON}/phase`, { phase: "questions" });
    const ids = course.lesson(LESSON)!.items.map((i) => i.id);
    for (const id of ids.slice(0, 2)) await L(a).attempt(id, correctResponse(course, LESSON, id));
    // another device
    const b = client();
    await b.post("/api/auth/login", { email: "ada@example.com", password: "correct horse battery" });
    const run = (await b.post(`/api/lessons/${LESSON}/start`)).body;
    expect(run.phase).toBe("questions");
    expect(ids.filter((id) => run.items[id]?.correct)).toEqual(ids.slice(0, 2));
    expect((await b.get("/api/progress")).body.nodes[LESSON].state).toBe("in_progress");
  });

  it("rejects invalid phases", async () => {
    const c = setup().client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    expect((await c.call("PUT", `/api/lessons/${LESSON}/phase`, { phase: "finished" })).status).toBe(400);
  });

  it("starts a clean run when the lesson content changed mid-lesson, keeping history", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    await L(c).attempt("i.g1-u3-l03.guided-1", correctResponse(course, LESSON, "i.g1-u3-l03.guided-1"));
    db.prepare("UPDATE lesson_progress SET content_version = 0").run(); // simulate: learner started on an older version
    const run = (await c.post(`/api/lessons/${LESSON}/start`)).body;
    expect(run).toMatchObject({ run: 2, phase: "intro", contentVersion: course.lesson(LESSON)!.contentVersion });
    expect(Object.keys(run.items)).toHaveLength(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n).toBe(1);
  });

  it("keeps a completed lesson complete on replay, and offers review when content moved on", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    await playThrough(c, course);
    const replay = (await c.post(`/api/lessons/${LESSON}/start`)).body;
    expect(replay.run).toBe(2);
    let n = (await c.get("/api/progress")).body.nodes[LESSON];
    expect(n).toMatchObject({ state: "completed", replayOpen: true });
    db.prepare("UPDATE lesson_progress SET completed_content_version = 0").run();
    n = (await c.get("/api/progress")).body.nodes[LESSON];
    expect(n).toMatchObject({ state: "completed", reviewAvailable: true });
    // replaying and finishing refreshes the completed version
    for (const it of course.lesson(LESSON)!.items) await L(c).attempt(it.id, correctResponse(course, LESSON, it.id));
    await L(c).complete();
    n = (await c.get("/api/progress")).body.nodes[LESSON];
    expect(n).toMatchObject({ state: "completed", reviewAvailable: false, replayOpen: false });
  });
});

describe("data isolation between students", () => {
  it("never shows or alters another student's progress", async () => {
    const { client, db } = setup();
    const ada = client();
    const bob = client();
    await register(ada, "ada");
    await register(bob, "bob");
    await playThrough(ada, course);
    const bobProgress = (await bob.get("/api/progress")).body;
    expect(bobProgress.nodes[LESSON].state).toBe("available");
    expect(bobProgress.totals.lessonsCompleted).toBe(0);
    // Bob cannot complete or answer using Ada's data
    await bob.post(`/api/lessons/${LESSON}/start`);
    expect((await bob.post(`/api/lessons/${LESSON}/complete`)).status).toBe(409);
    // reusing one of Ada's attempt ids neither reveals nor alters her record
    const adaAttempt = db.prepare("SELECT id FROM attempts WHERE user_id = (SELECT id FROM users WHERE email='ada@example.com') LIMIT 1").get() as { id: string };
    const reuse = await bob.post(`/api/lessons/${LESSON}/attempts`, { attemptId: adaAttempt.id, itemId: "i.g1-u3-l03.guided-1", response: { kind: "pitch-letter", letter: "A" } });
    expect(reuse.status).toBe(200);
    expect(reuse.body.replayed).toBe(false);
    expect((await ada.get("/api/progress")).body.nodes[LESSON].state).toBe("completed");
    expect((await bob.get("/api/progress")).body.nodes[LESSON].state).toBe("in_progress");
    const exp = (await bob.get("/api/me/export")).body;
    expect(JSON.stringify(exp)).not.toContain("ada@example.com");
  });
});

describe("content changes and completion (review R2)", () => {
  it("refuses to complete an open run begun on an older lesson version, without upgrading anything", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    await c.post(`/api/lessons/${LESSON}/start`);
    for (const it of course.lesson(LESSON)!.items) await L(c).attempt(it.id, correctResponse(course, LESSON, it.id));
    // deployment happens while the learner's completion is still pending
    const next = new Client(deployNewContent(db));
    next.cookie = c.cookie;
    const r = await next.post(`/api/lessons/${LESSON}/complete`); // note: no start first
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("stale_lesson");
    const row = db.prepare("SELECT run_open, completed_at, completed_content_version, completed_curriculum_version FROM lesson_progress").get() as Record<string, unknown>;
    expect(row).toMatchObject({ run_open: 1, completed_at: null, completed_content_version: null, completed_curriculum_version: null });
    // attempts are still there; starting again begins a clean run of the new version
    const run = (await next.post(`/api/lessons/${LESSON}/start`)).body;
    expect(run).toMatchObject({ run: 2, contentVersion: course.lesson(LESSON)!.contentVersion + 1 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n).toBe(6);
  });

  it("keeps an earned completion, flagged for review, and stamps the run's own curriculum version", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    await playThrough(c, course);
    const before = db.prepare("SELECT completed_content_version, completed_curriculum_version FROM lesson_progress").get() as Record<string, unknown>;
    const next = new Client(deployNewContent(db));
    next.cookie = c.cookie;
    const p = (await next.get("/api/progress")).body.nodes[LESSON];
    expect(p).toMatchObject({ state: "completed", reviewAvailable: true });
    expect(db.prepare("SELECT completed_content_version, completed_curriculum_version FROM lesson_progress").get()).toEqual(before);
    // an unchanged run resumed across a release bump keeps the version it started under
    const { client: c2, db: db2 } = setup();
    const d = c2();
    await register(d, "bea");
    await d.post(`/api/lessons/${LESSON}/start`);
    for (const it of course.lesson(LESSON)!.items) await L(d).attempt(it.id, correctResponse(course, LESSON, it.id));
    const bumped = new Client(createReleaseBump(db2));
    bumped.cookie = d.cookie;
    expect((await bumped.post(`/api/lessons/${LESSON}/complete`)).status).toBe(200);
    expect((db2.prepare("SELECT completed_curriculum_version AS v FROM lesson_progress").get() as { v: string }).v).toBe(course.version);
  });
});

function createReleaseBump(db: ReturnType<typeof setup>["db"]) {
  return deployNewContentReleaseOnly(db);
}
import { createApp } from "../src/app.ts";
function deployNewContentReleaseOnly(db: ReturnType<typeof setup>["db"]) {
  return createApp({ db, course: { ...course, version: "9.9.9" }, waiveUnwrittenPrerequisites: true });
}

describe("attempt ids are immutable commands (review R3)", () => {
  it("replays an identical retry, but refuses the same id for a different answer", async () => {
    const { client, db } = setup();
    const c = client();
    await register(c);
    const l = L(c);
    await l.start();
    const id = crypto.randomUUID();
    const first = await l.attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "G" }, id);
    expect(first.body.correct).toBe(true);
    // the response was lost; the learner changed their mind and the UI (wrongly) reused the id
    const changed = await l.attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "A" }, id);
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("attempt_conflict");
    expect((await l.attempt("i.g1-u3-l03.guided-1", { kind: "pitch-letter", letter: "G" }, id)).body).toMatchObject({ correct: true, replayed: true });
    expect((db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n).toBe(1);
  });

  it("refuses an id from an earlier run", async () => {
    const { client } = setup();
    const c = client();
    await register(c);
    const id = crypto.randomUUID();
    await playThrough(c, course);
    // replay the lesson (run 2) and reuse a run-1 id
    const first = (await c.get("/api/me/export")).body.attempts[0] as { id: string };
    await c.post(`/api/lessons/${LESSON}/start`);
    const r = await L(c).attempt("i.g1-u3-l03.guided-1", correctResponse(course, LESSON, "i.g1-u3-l03.guided-1"), first.id);
    expect(r.status).toBe(409);
    void id;
  });
});

describe("feedback only states what the submitted note proves (review R6)", () => {
  const item = (id: string) => course.authoredItems(LESSON).find((i) => i.id === id)!;
  const pitches = ["E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"]; // every selectable position
  const bottom = (p: string) => pitches.indexOf(p); // 0 = bottom line
  const onLine = (p: string) => bottom(p) % 2 === 0;

  it.each([
    ["i.g1-u3-l03.independent-3", "F5"],
    ["i.g1-u3-l03.independent-4", "G4"],
  ])("%s: every wrong position gets a message its category justifies", (id, right) => {
    for (const p of pitches) {
      const r = gradeResponse(course.ix, item(id), { kind: "staff-position", pitch: p }, course.scopeFor(LESSON, item(id)));
      expect(r.correct, p).toBe(p === right);
      if (r.correct) continue;
      if (r.category === "line-space-swap") expect(onLine(p), `${p} is on a line`).toBe(false);
      if (r.category === "wrong-octave") expect(p[0], p).toBe(right[0]);
      if (r.category === "counted-from-top") expect(bottom(p), p).toBe(8 - bottom(right));
      // a specific note or position is never named for a note that was not submitted
      if (r.category === "line-space-swap") expect(r.message).not.toMatch(/bottom space|That F is/);
    }
  });

  it("does not tell a learner who placed C5 that their note is an F in the bottom space", () => {
    const r = gradeResponse(course.ix, item("i.g1-u3-l03.independent-3"), { kind: "staff-position", pitch: "C5" }, course.scopeFor(LESSON, item("i.g1-u3-l03.independent-3")));
    expect(r.correct).toBe(false);
    expect(r.message).not.toMatch(/bottom space/);
    expect(r.message).toMatch(/space/);
  });
});
