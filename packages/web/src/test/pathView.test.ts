import { describe, expect, it } from "vitest";
import type { CourseNode, NodeProgress } from "../api/client";
import { describeNode, lockReason } from "../lib/pathView";

const node = (type: CourseNode["type"], playable = true): CourseNode => ({
  id: "X", type, unitId: "U", title: "T", objective: "O", optional: false, estimatedMinutes: 5, contentVersion: 1, playable, practiceOnly: false,
});
const p = (state: NodeProgress["state"], extra: Partial<NodeProgress> = {}): NodeProgress => ({ state, lockedBy: [], completedAt: null, reviewAvailable: false, replayOpen: false, ...extra });

describe("describeNode", () => {
  it.each([
    ["available", "available", "Start", true],
    ["in_progress", "in_progress", "Continue", true],
    ["completed", "completed", "Practise again", true],
    ["locked", "locked", null, false],
    ["coming_soon", "coming_soon", null, false],
  ] as const)("%s", (state, status, action, openable) => {
    const v = describeNode(node("lesson", state !== "coming_soon"), p(state));
    expect(v).toMatchObject({ status, action, openable });
  });

  it("flags a completed lesson with newer content as review available", () => {
    expect(describeNode(node("lesson"), p("completed", { reviewAvailable: true }))).toMatchObject({ status: "review_available", action: "Review", openable: true });
  });

  it("gives each node type its own shape and label", () => {
    const shapes = (["lesson", "practice", "review", "unit_challenge", "grade_assessment", "enrichment"] as const).map((t) => describeNode(node(t), p("available")).shape);
    expect(shapes).toEqual(["lesson", "practice", "review", "unit_checkpoint", "grade_assessment", "enrichment"]);
    expect(describeNode(node("unit_challenge"), p("locked")).kindLabel).toBe("Unit checkpoint");
    expect(describeNode(node("grade_assessment"), p("locked")).kindLabel).toBe("Grade assessment");
  });

  it("never lets an unwritten node open, whatever the server says", () => {
    expect(describeNode(node("lesson", false), p("available")).openable).toBe(false);
  });

  it("explains locks in plain words", () => {
    const t = (id: string) => ({ A: "Notes", B: "Rests" })[id] ?? id;
    expect(lockReason(p("locked", { lockedBy: ["A"] }), t)).toBe("Finish “Notes” first.");
    expect(lockReason(p("locked", { lockedBy: ["A", "B"] }), t)).toBe("Finish “Notes” and “Rests” first.");
    expect(lockReason(undefined, t)).toBe("Finish the earlier lessons first.");
  });
});
