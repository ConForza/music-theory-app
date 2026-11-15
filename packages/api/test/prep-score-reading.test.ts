/**
 * Grade 2 and 3 score reading (PR #18 release blockers): the practice paper's score-reading questions are labelled with what they REALLY ask, and
 * this test ties the label to the generators, so broadening them without updating the label (or the label without the generators) fails here.
 */
import { generateItem } from "@mtp/engine";
import { music } from "@mtp/curriculum";
import { describe, expect, it } from "vitest";
import { SCORE_READING_SKILLS } from "../src/prep-config.ts";
import { SCORE_READING_TEMPLATE } from "../src/prep-blueprint.ts";
import { answerAll, boot, learner } from "./prep-helpers.ts";
import { realCourse } from "./helpers.ts";

const course = realCourse();

describe("what Grade 2 and 3 score-reading questions actually ask", () => {
  for (const g of [2, 3]) {
    it(`Grade ${g}: only the three skills named in the label, in 2/4, 3/4 or 4/4 and major keys`, () => {
      const own = [...course.ix.templates.values()].filter((t) => t.grade === g && SCORE_READING_TEMPLATE.test(t.id));
      expect(own.map((t) => t.id)).toEqual([`t.g${g}.melody`]);
      const prompts = new Set<string>();
      const sigs = new Set<string>();
      const modes = new Set<string>();
      for (let s = 1; s <= 150; s++) {
        const i = generateItem(course.ix, own[0]!.id, s, {}).item;
        sigs.add(i.music!.timeSignature!);
        modes.add(music.parseKey(i.music!.key!).mode);
        if (i.answer.kind === "composite") for (const p of i.answer.parts) prompts.add(p.prompt);
      }
      expect([...prompts].sort()).toEqual(["How many crotchet beats are in each bar?", "Name the note marked x.", "The melody is in a major key. Which one?"]);
      expect([...sigs].sort()).toEqual(["2/4", "3/4", "4/4"]);
      expect([...modes]).toEqual(["major"]);
      // the label says exactly that, and says what is not covered
      const label = SCORE_READING_SKILLS[g]!;
      expect(label).toMatch(/crotchet beats in 2\/4, 3\/4 or 4\/4/);
      expect(label).toMatch(/naming a note/);
      expect(label).toMatch(/major key/);
      expect(label).toMatch(/do not yet ask about/);
    });
  }
  it("Grades 1, 4 and 5 carry no such label", () => {
    expect(Object.keys(SCORE_READING_SKILLS)).toEqual(["2", "3"]);
  });

  it("a finished Grade 3 paper reports the label with the score-reading result, and the paper itself is unchanged", async () => {
    const { app } = boot();
    const { c, userId } = await learner(app);
    const v = await c.post("/api/exams/3/start", { mode: "mock", seed: 5 });
    await answerAll(app, c, userId, v.body.id);
    const done = await c.post(`/api/prep/attempts/${v.body.id}/complete`, {});
    expect(done.body.scoreReading.questions).toBe(app.prep.cfg.exam.scoreReadingItems);
    expect(done.body.scoreReading.skills).toBe(SCORE_READING_SKILLS[3]);
    expect(done.body.questions).toBe(app.prep.blueprint(3).totalItems);
    const g1 = await c.post("/api/exams/1/start", { mode: "mock", seed: 5 });
    await answerAll(app, c, userId, g1.body.id);
    expect((await c.post(`/api/prep/attempts/${g1.body.id}/complete`, {})).body.scoreReading.skills).toBeNull();
  }, 120_000);
});
