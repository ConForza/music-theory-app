import { canonicalResponse, generateItem, parseGeneratedItemId, wrongResponse } from "@mtp/engine";
import { describe, expect, it } from "vitest";
import { register, setup, sharedCourse } from "./helpers.ts";

const course = sharedCourse();
const LEAKS = /"(accepted|correctOptionIds|acceptedIntervals|acceptedChords|acceptedPitches|acceptedVoicings|acceptedTypes|answer|feedback)"/;

describe("lesson player on the Brief 03 engine", () => {
  it("the Grade 5 cadence lesson is now playable end to end with server grading", async () => {
    const node = "G5-U4-L06";
    expect(course.isPlayable(node)).toBe(true);
    const c = setup().client();
    await register(c);
    const lesson = await c.get(`/api/lessons/${node}`);
    expect(lesson.status).toBe(200);
    expect(JSON.stringify(lesson.body)).not.toMatch(LEAKS);
    await c.post(`/api/lessons/${node}/start`);
    for (const it of course.authoredItems(node)) {
      const bad = wrongResponse(course.ix, it, course.scopeFor(node, it));
      if (bad) {
        const w = await c.post(`/api/lessons/${node}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.id, response: bad });
        expect(w.status).toBe(200);
        expect(w.body.correct).toBe(false);
        expect(typeof w.body.message).toBe("string");
      }
      const r = await c.post(`/api/lessons/${node}/attempts`, { attemptId: crypto.randomUUID(), itemId: it.id, response: canonicalResponse(course.ix, it, course.scopeFor(node, it)) });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.correct).toBe(true);
    }
    const done = await c.post(`/api/lessons/${node}/complete`);
    expect(done.status).toBe(200);
    expect((await c.get("/api/progress")).body.nodes[node].state).toBe("completed");
  });

  it("refuses a response that claims its own correctness", async () => {
    const c = setup().client();
    await register(c);
    await c.post("/api/lessons/G1-U3-L03/start");
    const r = await c.post("/api/lessons/G1-U3-L03/attempts", { attemptId: crypto.randomUUID(), itemId: "i.g1-u3-l03.guided-1", response: { kind: "pitch-letter", letter: "G", correct: true } });
    expect(r.status).toBe(400);
    const extra = await c.post("/api/lessons/G1-U3-L03/attempts", { attemptId: crypto.randomUUID(), itemId: "i.g1-u3-l03.guided-1", response: { kind: "pitch-letter", letter: "G" }, correct: true });
    expect(extra.status).toBe(400);
    expect((await c.get("/api/me/export")).body.attempts).toHaveLength(0);
  });
});

describe("practice lab", () => {
  it("lists every demonstration set and serves items without answers", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    const cat = await c.get("/api/practice");
    expect(cat.status).toBe(200);
    expect(cat.body.sets.length).toBe(course.showcase.length);
    const families = new Set<string>();
    for (const s of cat.body.sets) {
      const set = await c.get(`/api/practice/sets/${s.id}`);
      expect(set.status).toBe(200);
      expect(JSON.stringify(set.body)).not.toMatch(LEAKS);
      for (const it of set.body.items) families.add(it.familyId);
    }
    expect(families.size).toBe(22);
  });

  it("grades every demonstration item: right answers pass, wrong answers explain themselves", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    for (const s of course.showcase) {
      for (const it of s.items) {
        const bad = wrongResponse(course.ix, it);
        if (bad) {
          const w = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: bad });
          expect(w.status, it.id).toBe(200);
          expect(w.body.correct, it.id).toBe(false);
          expect(w.body.message.length).toBeGreaterThan(0);
        }
        const r = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: canonicalResponse(course.ix, it) });
        expect(r.status, it.id).toBe(200);
        expect(r.body.correct, `${it.id} ${JSON.stringify(r.body)}`).toBe(true);
      }
    }
  });

  it("is idempotent per attempt id, refuses id reuse for a different answer, and isolates accounts", async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    await register(a, "ann");
    await register(b, "bob");
    const it = course.showcase[0]!.items[0]!;
    const id = crypto.randomUUID();
    const body = { attemptId: id, itemId: it.id, response: wrongResponse(course.ix, it) };
    const first = await a.post("/api/practice/attempts", body);
    const again = await a.post("/api/practice/attempts", body);
    expect(again.body).toEqual({ ...first.body, replayed: true });
    expect((await a.post("/api/practice/attempts", { ...body, response: canonicalResponse(course.ix, it) })).status).toBe(409);
    // The same id from another learner is a different command.
    const other = await b.post("/api/practice/attempts", { ...body, response: canonicalResponse(course.ix, it) });
    expect(other.status).toBe(200);
    expect(other.body).toMatchObject({ correct: true, attemptNumber: 1, replayed: false });
    expect((await a.get("/api/me/export")).body.practiceAttempts).toHaveLength(1);
    expect((await b.get("/api/me/export")).body.practiceAttempts).toHaveLength(1);
  });

  it("explains, then reveals the worked answer after repeated mistakes", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    const it = course.showcase.find((s) => s.id === "s.intervals")!.items[0]!;
    const bad = wrongResponse(course.ix, it)!;
    const r1 = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: bad });
    expect(r1.body.solution).toBeUndefined();
    expect(r1.body.reason).toBeTruthy();
    await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: bad });
    const r3 = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: bad });
    expect(r3.body.attemptNumber).toBe(3);
    expect(r3.body.solution).toMatch(/interval/);
  });

  it("generates seeded variations and grades them by regenerating on the server", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    const g = await c.post("/api/practice/generate", { templateId: "t.g2.scale-build-minor", seed: 12345 });
    expect(g.status).toBe(200);
    expect(JSON.stringify(g.body)).not.toMatch(LEAKS);
    expect(parseGeneratedItemId(g.body.id)).toMatchObject({ templateId: "t.g2.scale-build-minor", version: 1, seed: 12345 });
    const again = await c.post("/api/practice/generate", { templateId: "t.g2.scale-build-minor", seed: 12345 });
    expect(again.body).toEqual(g.body); // same seed, same question
    const { item } = generateItem(course.ix, "t.g2.scale-build-minor", 12345, { evidence: "learning" });
    const ok = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: g.body.id, response: canonicalResponse(course.ix, item) });
    expect(ok.body.correct).toBe(true);
    // A server-chosen seed works too.
    const fresh = await c.post("/api/practice/generate", { templateId: "t.g1.note-read" });
    expect(fresh.status).toBe(200);
    expect(Number.isInteger(fresh.body.seed)).toBe(true);
  });

  it("refuses unknown, stale or tampered items and malformed answers without recording anything", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    const send = (itemId: string, response: unknown) => c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId, response });
    expect((await send("i.gen.g1-note-read.v99.s5.f00000000", { kind: "pitch", pitch: "C" })).status).toBe(409);
    // Same template, version and seed, but generated from different inputs: refused as stale, never regraded.
    const real = (await c.post("/api/practice/generate", { templateId: "t.g1.note-read", seed: 5 })).body.id as string;
    expect((await send(real.replace(/\.f[0-9a-f]{8}$/, ".fdeadbeef"), { kind: "pitch", pitch: "C" })).status).toBe(409);
    expect((await send("i.gen.g1-note-read.v1.s5", { kind: "pitch", pitch: "C" })).status).toBe(404);
    expect((await send("i.gen.g9-nope.v1.s5", { kind: "pitch", pitch: "C" })).status).toBe(404);
    expect((await send("i.nope", { kind: "pitch", pitch: "C" })).status).toBe(404);
    const it = course.showcase[0]!.items[0]!;
    expect((await send(it.id, { kind: "pitch", pitch: "H#" })).status).toBe(400);
    expect((await send(it.id, { kind: "chord-name", roman: "V", inversion: "a" })).status).toBe(400);
    expect((await send(it.id, { kind: "pitch-sequence", pitches: Array(50).fill("C4") })).status).toBe(400);
    expect((await c.post("/api/practice/generate", { templateId: "t.g1.note-read", seed: -4 })).status).toBe(400);
    expect((await c.get("/api/me/export")).body.practiceAttempts).toHaveLength(0);
  });

  it("only accepts the answer shape the question offers (review R1)", async () => {
    const c = setup().client();
    await c.post("/api/auth/guest");
    const id = "i.showcase.accidentals-and-keys.6"; // "a note that sounds the same as E but has a different letter name"
    const letter = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: id, response: { kind: "pitch-letter", letter: "E" } });
    expect(letter.status).toBe(400);
    const same = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: id, response: { kind: "pitch", pitch: "E" } });
    expect(same.body.correct).toBe(false);
    const ok = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: id, response: { kind: "pitch", pitch: "Fb" } });
    expect(ok.body.correct).toBe(true);
    // Octave not assessed: no octave, the shown octave, or another octave are all accepted (review R12).
    for (const pitch of ["D", "D5", "D4"]) {
      const r = await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: "i.showcase.notes-on-the-stave.1", response: { kind: "pitch", pitch } });
      expect(r.status, pitch).toBe(200);
      expect(r.body.correct, pitch).toBe(true);
    }
    // Stored Brief 02 letter answers on the Grade 1 lesson remain valid.
    await register(c, "zed");
    await c.post("/api/lessons/G1-U3-L03/start");
    const legacy = await c.post("/api/lessons/G1-U3-L03/attempts", { attemptId: crypto.randomUUID(), itemId: "i.g1-u3-l03.guided-1", response: { kind: "pitch-letter", letter: "G" } });
    expect(legacy.status).toBe(200);
    expect(legacy.body.correct).toBe(true);
  });

  it("serves graduated hints and requires a session", async () => {
    const { client } = setup();
    const anon = client();
    expect((await anon.get("/api/practice")).status).toBe(401);
    const c = client();
    await c.post("/api/auth/guest");
    const it = course.showcase.flatMap((s) => s.items).find((x) => x.hints.length >= 2)!;
    const h1 = await c.post("/api/practice/hint", { itemId: it.id, level: 1 });
    const h2 = await c.post("/api/practice/hint", { itemId: it.id, level: 2 });
    expect(h1.body.hint).toBe(it.hints[0]);
    expect(h2.body.hint).toBe(it.hints[1]);
    expect((await c.post("/api/practice/hint", { itemId: it.id, level: 9 })).status).toBe(400);
  });

  it("practice never changes lesson progress", async () => {
    const c = setup().client();
    await register(c);
    const before = (await c.get("/api/progress")).body;
    const it = course.showcase[0]!.items[0]!;
    await c.post("/api/practice/attempts", { attemptId: crypto.randomUUID(), itemId: it.id, response: canonicalResponse(course.ix, it) });
    const after = (await c.get("/api/progress")).body;
    expect(after.nodes).toEqual(before.nodes);
    expect(after.totals).toEqual(before.totals);
  });
});
