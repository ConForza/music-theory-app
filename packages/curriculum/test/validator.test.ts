import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCurriculum, type Curriculum } from "../src/load.ts";
import { validateCurriculum } from "../src/validate.ts";

let base: Curriculum;
/** An empty directory, so mutation tests do not re-scan the repository for prohibited files. */
const cleanRoot = mkdtempSync(join(tmpdir(), "mtp-clean-"));

beforeAll(() => {
  const { curriculum, issues } = loadCurriculum();
  if (!curriculum) throw new Error(`Content failed to load: ${JSON.stringify(issues.slice(0, 5))}`);
  base = curriculum;
});

function mutate(fn: (c: Curriculum) => void): string[] {
  const c = structuredClone(base);
  fn(c);
  return validateCurriculum(c, { repoRoot: cleanRoot }).errors.map((e) => e.code);
}

const world = (c: Curriculum, g: number) => c.worlds.find((w) => w.grade === g)!;
const node = (c: Curriculum, id: string) => c.worlds.flatMap((w) => w.nodes).find((n) => n.id === id)!;
const concept = (c: Curriculum, id: string) => c.concepts.flatMap((f) => f.concepts).find((x) => x.id === id)!;
const template = (c: Curriculum, id: string) => c.templates.flatMap((f) => f.templates).find((t) => t.id === id)!;
const assessment = (c: Curriculum, id: string) => c.assessments.flatMap((f) => f.assessments).find((a) => a.id === id)!;
const lesson = (c: Curriculum, id: string) => c.lessons.find((l) => l.content.lessonId === id)!.content;

describe("baseline", () => {
  it("the committed curriculum has no validation errors", () => {
    expect(mutate(() => {})).toEqual([]);
  });
});

describe("coverage rules", () => {
  it("fails when an official outcome has no lesson", () => {
    const codes = mutate((c) => {
      for (const n of c.worlds.flatMap((w) => w.nodes)) n.outcomeIds = n.outcomeIds.filter((o) => o !== "abrsm2020.g3.05");
    });
    expect(codes).toContain("OUTCOME_NO_LESSON");
  });

  it("fails when an outcome is never reviewed", () => {
    const codes = mutate((c) => {
      for (const n of c.worlds.flatMap((w) => w.nodes)) {
        if (n.type === "review") n.reviewOutcomeIds = n.reviewOutcomeIds.filter((o) => o !== "abrsm2020.g4.12");
      }
    });
    expect(codes).toContain("OUTCOME_NO_REVIEW");
  });

  it("fails when an outcome has no practice exercise", () => {
    const codes = mutate((c) => {
      for (const t of c.templates.flatMap((f) => f.templates)) t.outcomeIds = t.outcomeIds.filter((o) => o !== "abrsm2020.g2.04");
      for (const t of c.templates.flatMap((f) => f.templates)) if (t.outcomeIds.length === 0) t.outcomeIds = ["abrsm2020.g2.03"];
    });
    expect(codes).toContain("OUTCOME_NO_PRACTICE");
  });

  it("fails when the grade assessment does not sample an outcome of its grade", () => {
    const codes = mutate((c) => {
      const a = assessment(c, "a.g5");
      a.sections = a.sections.filter((s) => !s.outcomeIds.includes("abrsm2020.g5.06"));
    });
    expect(codes).toContain("GRADE_ASSESSMENT_INCOMPLETE");
    expect(codes).toContain("OUTCOME_NO_GRADE_ASSESSMENT");
  });

  it("fails when a unit challenge omits an outcome taught in the unit", () => {
    const codes = mutate((c) => {
      const a = assessment(c, "a.g1-u5");
      a.sections = a.sections.slice(1);
    });
    expect(codes).toContain("UNIT_CHALLENGE_INCOMPLETE");
  });
});

describe("source-book rules", () => {
  it("fails when a core book section is unmapped", () => {
    const codes = mutate((c) => {
      const s = c.book.sections.find((x) => x.id === "fs.g4.s12")!;
      s.outcomeIds = [];
    });
    expect(codes).toContain("BOOK_CORE_UNMAPPED");
  });

  it("fails when a section is missing or misnumbered", () => {
    expect(mutate((c) => c.book.sections.splice(30, 1))).toContain("BOOK_SECTION_COUNT");
  });

  it("fails when a deferred (core-at-another-grade) section is taught at its own grade", () => {
    const codes = mutate((c) => {
      c.book.sections.find((x) => x.id === "fs.g2.s11")!.taughtAtGrade = 2;
    });
    expect(codes).toContain("BOOK_CLASSIFICATION");
  });

  it("fails when printed pages go backwards", () => {
    const codes = mutate((c) => {
      c.book.sections.find((x) => x.id === "fs.g3.s04")!.printedPage = 50;
    });
    expect(codes).toContain("BOOK_PAGE_ORDER");
  });
});

describe("prerequisite and path rules", () => {
  it("fails when a lesson relies on a prerequisite taught later", () => {
    const codes = mutate((c) => {
      concept(c, "c.rhythm.values-short").prerequisiteIds.push("c.metre.bars");
    });
    expect(codes).toContain("UNTAUGHT_PREREQUISITE");
  });

  it("fails on prerequisite cycles", () => {
    const codes = mutate((c) => {
      concept(c, "c.rhythm.beat").prerequisiteIds.push("c.rhythm.dots");
    });
    expect(codes).toContain("PREREQUISITE_CYCLE");
  });

  it("fails when a concept depends on a later-grade concept", () => {
    const codes = mutate((c) => {
      concept(c, "c.scales.minor-harmonic").prerequisiteIds.push("c.scales.minor-melodic");
    });
    expect(codes).toContain("PREREQUISITE_FROM_LATER_GRADE");
  });

  it("fails when a required node depends on optional enrichment", () => {
    const codes = mutate((c) => {
      node(c, "G2-U4-L04").unlockAfter = ["G2-U4-E1"];
    });
    expect(codes).toContain("REQUIRED_DEPENDS_ON_OPTIONAL");
  });

  it("fails when a review node revisits an outcome that has not been taught yet", () => {
    const codes = mutate((c) => {
      node(c, "G1-U2-R1").reviewOutcomeIds.push("abrsm2020.g1.16");
    });
    expect(codes).toContain("REVIEW_UNTAUGHT");
  });

  it("fails on forward unlock dependencies", () => {
    const codes = mutate((c) => {
      node(c, "G1-U1-L02").unlockAfter = ["G1-U1-L05"];
    });
    expect(codes).toContain("UNLOCK_ORDER");
  });

  it("fails when a lesson has no practice", () => {
    const codes = mutate((c) => {
      node(c, "G3-U3-L01").exercises = [];
    });
    expect(codes).toContain("LESSON_WITHOUT_PRACTICE");
  });
});

describe("ID rules", () => {
  it("fails on duplicate IDs across entity types", () => {
    const codes = mutate((c) => {
      const w = world(c, 1);
      w.nodes.splice(1, 0, { ...w.nodes[0]! });
    });
    expect(codes).toContain("DUPLICATE_ID");
  });

  it("fails when an ID's grade prefix disagrees with its grade", () => {
    const codes = mutate((c) => {
      template(c, "t.g2.triplet").grade = 3;
    });
    expect(codes).toContain("ID_GRADE_MISMATCH");
  });
});

describe("exercise and grade-scope rules", () => {
  it("fails when an exercise template has no registered grader", () => {
    const codes = mutate((c) => {
      c.engine.graders = c.engine.graders.filter((g) => g.id !== "g.interval");
    });
    expect(codes).toContain("TEMPLATE_WITHOUT_GRADING");
  });

  it("fails when a Grade 2 template uses a Grade 4 key", () => {
    const codes = mutate((c) => {
      template(c, "t.g2.scale-build-major").scope.keys!.push("B major");
    });
    expect(codes).toContain("SCOPE_EXCEEDS_GRADE");
  });

  it("fails when a Grade 2 template requires melodic minor", () => {
    const codes = mutate((c) => {
      template(c, "t.g2.scale-build-minor").scope.minorForms = ["harmonic", "melodic"];
    });
    expect(codes).toContain("SCOPE_EXCEEDS_GRADE");
  });

  it("fails when Grade 3 interval templates allow non-tonic lower notes", () => {
    const codes = mutate((c) => {
      template(c, "t.g3.interval-quality").scope.intervalLowerNote = "any-diatonic";
    });
    expect(codes).toContain("SCOPE_EXCEEDS_GRADE");
  });

  it("fails when cadence work uses keys beyond C, G, D and F major", () => {
    const codes = mutate((c) => {
      template(c, "t.g5.cadence-chords").scope.cadenceKeys!.push("A major");
    });
    expect(codes).toContain("SCOPE_EXCEEDS_GRADE");
  });

  it("fails when the grade scope table drifts from the official key boundaries", () => {
    expect(mutate((c) => c.scope.grades[2]!.adds.keys!.pop())).toContain("SCOPE_KEYS_MISMATCH");
    expect(mutate((c) => c.scope.grades[1]!.adds.minorForms!.push("melodic"))).toContain("SCOPE_MINOR_FORM");
  });

  it("fails when a lesson uses a template from a later grade", () => {
    const codes = mutate((c) => {
      node(c, "G2-U5-L01").exercises.push({ templateId: "t.g3.interval-quality", conceptIds: ["c.intervals.quality-perfect"], scope: {} });
    });
    expect(codes).toContain("TEMPLATE_BEYOND_GRADE");
  });
});

describe("assessment rules", () => {
  it("fails when a grade assessment includes mandatory knowledge beyond the grade", () => {
    const codes = mutate((c) => {
      const a = assessment(c, "a.g3");
      a.sections.push({ id: "smuggled", title: "x", outcomeIds: ["abrsm2020.g4.13"], templateIds: ["t.g4.interval-diatonic"], itemCount: 1 });
    });
    expect(codes).toContain("ASSESSMENT_BEYOND_GRADE");
  });

  it("fails when a unit challenge tests an outcome before it is taught", () => {
    const codes = mutate((c) => {
      const a = assessment(c, "a.g1-u1");
      a.sections.push({ id: "early", title: "x", outcomeIds: ["abrsm2020.g1.13"], templateIds: ["t.g1.key-signature"], itemCount: 1 });
    });
    expect(codes).toContain("CHALLENGE_UNTAUGHT");
  });
});

describe("musical verification of authored content", () => {
  it("detects a missing valid alternative at a cadence point", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G5-U4-L06").independent[0]!;
      if (item.answer.kind !== "chord-progression") throw new Error("fixture changed");
      item.answer.points[0]!.accepted = ["ii"]; // IV is also valid
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("detects an invalid chord that lacks the melody note", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G5-U4-L06").independent[1]!;
      if (item.answer.kind !== "chord-progression") throw new Error("fixture changed");
      item.answer.points[0]!.accepted = ["IV", "V"];
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("detects a misnamed cadence", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G5-U4-L06").independent[1]!;
      if (item.answer.kind !== "chord-progression") throw new Error("fixture changed");
      item.answer.cadences[0]!.acceptedTypes = ["perfect"];
    });
    expect(codes).toContain("CADENCE_TYPE_MISMATCH");
  });

  it("rejects an enharmonically respelt transposition answer", () => {
    const codes = mutate((c) => {
      const item = c.items[0]!.content.item;
      if (item.answer.kind !== "pitch-sequence") throw new Error("fixture changed");
      item.answer.accepted[0]![3] = "Db5";
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("rejects a transposition into the wrong key", () => {
    const codes = mutate((c) => {
      const item = c.items[0]!.content.item;
      if (item.answer.kind !== "pitch-sequence") throw new Error("fixture changed");
      item.answer.key = "A major";
    });
    expect(codes).toContain("TRANSPOSE_KEY");
  });

  it("detects a note that needs a written accidental", () => {
    const codes = mutate((c) => {
      const ev = c.items[0]!.content.item.music!.measures[0]!.events![3]!;
      if (ev.kind === "note") delete ev.writtenAccidental;
    });
    expect(codes).toContain("ACCIDENTAL_MISSING");
  });

  it("detects a bar that does not add up", () => {
    const codes = mutate((c) => {
      const ev = lesson(c, "G5-U4-L06").independent[0]!.music!.measures[1]!.events![1]!;
      if (ev.kind === "note") ev.duration = { value: "crotchet", dots: 0 };
    });
    expect(codes).toContain("BAR_DURATION");
  });

  it("detects a read-the-note answer that does not match the note shown", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").independent[0]!;
      if (item.answer.kind !== "pitch") throw new Error("fixture changed");
      item.answer.accepted = ["C5"];
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("detects Grade 1 content beyond the one-ledger-line limit", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").independent[0]!;
      const ev = item.music!.measures[0]!.events![0]!;
      if (ev.kind === "note") ev.pitch = "A3";
      if (item.answer.kind === "pitch") item.answer.accepted = ["A3"];
    });
    expect(codes).toContain("FRAGMENT_SCOPE");
  });

  it("requires feedback categories that exist for the exercise family", () => {
    const codes = mutate((c) => {
      lesson(c, "G1-U3-L03").independent[0]!.feedback.mistakes["made-up-category"] = "x";
    });
    expect(codes).toContain("FEEDBACK_UNKNOWN_CATEGORY");
  });

  it("requires guided steps to be recorded as learning, not mastery evidence", () => {
    const codes = mutate((c) => {
      lesson(c, "G1-U3-L03").guided[0]!.evidence = "independent";
    });
    expect(codes).toContain("ITEM_EVIDENCE");
  });
});

describe("provenance and release claims", () => {
  it("blocks learner-facing references to the source book", () => {
    const codes = mutate((c) => {
      lesson(c, "G1-U3-L03").recap.push("As explained in First Steps in Music Theory, …");
    });
    expect(codes).toContain("LEARNER_TEXT_PROVENANCE");
  });

  it("blocks committing PDF reference material", () => {
    const dir = mkdtempSync(join(tmpdir(), "mtp-pdf-"));
    writeFileSync(join(dir, "scan.pdf"), "%PDF-1.3");
    const codes = validateCurriculum(structuredClone(base), { repoRoot: dir }).errors.map((e) => e.code);
    expect(codes).toContain("PROHIBITED_FILE");
  });

  it("refuses an approved release without teacher sign-off", () => {
    const codes = mutate((c) => {
      c.release.status = "approved";
    });
    expect(codes).toContain("COVERAGE_CLAIM_WITHOUT_REVIEW");
  });

  it("the release gate currently fails, because nothing has been teacher-reviewed", () => {
    const codes = validateCurriculum(structuredClone(base), { release: true, repoRoot: cleanRoot }).errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["RELEASE_TEACHER_REVIEW", "RELEASE_OUTCOMES_UNREVIEWED", "RELEASE_TEMPLATES_UNREVIEWED"]));
  });
});

describe("review regressions (R3–R7)", () => {
  it("R3: a lesson binding narrows a reusable template to what has been taught", () => {
    const b = node(base, "G1-U1-L01").exercises.find((e) => e.templateId === "t.g1.note-value")!;
    expect(b.scope.noteValues).toEqual(["semibreve", "minim", "crotchet"]);
    expect(b.conceptIds).toEqual(["c.rhythm.values-long"]);
    const codes = mutate((c) => {
      node(c, "G1-U1-L01").exercises[0]!.scope.noteValues!.push("quaver");
    });
    expect(codes).toContain("BINDING_SCOPE_UNTAUGHT");
  });

  it("R3: a binding may not claim a concept that is not yet taught", () => {
    const codes = mutate((c) => {
      node(c, "G1-U1-L01").exercises[0]!.conceptIds.push("c.rhythm.rests");
    });
    expect(codes).toContain("TEMPLATE_CONCEPT_UNTAUGHT");
  });

  it("R3: a bass-clef item in the treble-clef lesson is rejected (bass clef is taught later)", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").guided[0]!;
      item.music = { ...item.music!, clef: "bass", measures: [{ events: [{ kind: "note", pitch: "B2", duration: { value: "semibreve", dots: 0 } }] }] };
      if (item.answer.kind === "pitch") item.answer.accepted = ["B2"];
    });
    expect(codes).toContain("FRAGMENT_SCOPE");
  });

  it("R3: a written F double sharp in Grade 1 is rejected", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").guided[0]!;
      item.music = { ...item.music!, measures: [{ events: [{ kind: "note", pitch: "Fx4", writtenAccidental: "double-sharp", duration: { value: "semibreve", dots: 0 } }] }] };
      if (item.answer.kind === "pitch") item.answer.accepted = ["Fx4"];
    });
    expect(codes).toContain("FRAGMENT_SCOPE");
  });

  it("R4: an extra wrong accepted alternative is rejected (note reading)", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").guided[0]!;
      if (item.answer.kind === "pitch") item.answer.accepted.push("C4");
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("R4: an extra wrong accepted sequence is rejected (transposition)", () => {
    const codes = mutate((c) => {
      const item = c.items[0]!.content.item;
      if (item.answer.kind === "pitch-sequence") item.answer.accepted.push(["C4"]);
    });
    expect(codes).toContain("ANSWER_MISMATCH");
  });

  it("R4: a genuinely equivalent alternative is still allowed", () => {
    const codes = mutate((c) => {
      const item = lesson(c, "G1-U3-L03").guided[0]!;
      if (item.answer.kind === "pitch") item.answer.accepted.push("G5"); // octave-insensitive letter reading
    });
    expect(codes).toEqual([]);
  });

  it("R4: a staff-position answer must list every valid position and nothing else", () => {
    expect(
      mutate((c) => {
        const item = lesson(c, "G1-U3-L03").independent[2]!;
        if (item.answer.kind === "staff-position") item.answer.accepted.push("F4"); // F4 is a space note
      }),
    ).toContain("ANSWER_MISMATCH");
  });

  it("R6: lesson content and path node versions must agree", () => {
    const codes = mutate((c) => {
      lesson(c, "G1-U3-L03").contentVersion += 1;
    });
    expect(codes).toContain("LESSON_VERSION_MISMATCH");
  });

  it("R7: Windows-style content paths are normalised", async () => {
    const { toPosixPath } = await import("../src/load.ts");
    expect(toPosixPath("lessons\\G1-U3-L03.json")).toBe("lessons/G1-U3-L03.json");
    const codes = mutate((c) => {
      c.lessons.find((l) => l.content.lessonId === "G1-U3-L03")!.file = "lessons\\G1-U3-L03.json";
      node(c, "G1-U3-L03").contentRef = "lessons\\G1-U3-L03.json";
    });
    expect(codes).toEqual([]);
  });

  it("R7: generated-doc checks ignore CRLF line endings", async () => {
    const { renderDocs, checkDocs } = await import("../src/docs.ts");
    const { mkdirSync, copyFileSync } = await import("node:fs");
    const { REPO_ROOT } = await import("../src/load.ts");
    const dir = mkdtempSync(join(tmpdir(), "mtp-crlf-"));
    mkdirSync(join(dir, "docs/curriculum"), { recursive: true });
    copyFileSync(join(REPO_ROOT, "docs/curriculum/SYLLABUS_GAPS.md"), join(dir, "docs/curriculum/SYLLABUS_GAPS.md"));
    for (const [rel, text] of renderDocs(base, dir)) writeFileSync(join(dir, rel), text.replace(/\n/g, "\r\n"));
    expect(checkDocs(base, dir)).toEqual([]);
  });
});

describe("re-review regressions (C1, C2)", () => {
  const crotchet = { kind: "note" as const, pitch: "B4", duration: { value: "crotchet" as const, dots: 0 } };
  const minim = { kind: "note" as const, pitch: "B4", duration: { value: "minim" as const, dots: 0 } };
  const rhythmLine = (events: unknown[]) => ({ presentation: "rhythm-line", clef: "treble", showKeySignature: false, measures: [{ events }], textAlternative: "A rhythm shown on a single line." });

  /** A complete, schema-valid lesson for the very first node, before any clef has been taught. */
  function firstLesson() {
    const item = (id: string, evidence: "learning" | "independent", answer: unknown, music?: unknown) => ({
      id: `i.g1-u1-l01.${id}`,
      templateId: "t.g1.note-value",
      templateVersion: 1,
      seed: null,
      evidence,
      prompt: "Original prompt.",
      ...(music ? { music } : {}),
      answer,
      hints: [],
      feedback: { correct: "Yes.", mistakes: { "halved-or-doubled": "Count it in crotchet beats." }, fallback: "Not quite." },
    });
    return {
      schemaVersion: 1,
      id: "lc.G1-U1-L01",
      lessonId: "G1-U1-L01",
      contentVersion: 1,
      locale: "en-GB",
      objective: { statement: "Compare crotchets, minims and semibreves by how many beats they last.", successCriteria: ["I can say how many beats each note lasts."] },
      explanation: [{ kind: "text", text: "A crotchet lasts one beat; a minim lasts two." }],
      demonstration: {
        widget: "rhythm",
        music: rhythmLine([crotchet, crotchet, minim]),
        steps: ["Tap along: one, one, two-beat note."],
        audio: { playback: "synth-generated", optional: true },
        textAlternative: "Two crotchets then a minim, shown as a rhythm without a stave.",
      },
      guided: [item("guided-1", "learning", { kind: "choice", options: [{ id: "1", label: "1 beat" }, { id: "2", label: "2 beats" }], correctOptionIds: ["2"] })],
      independent: [
        item("independent-1", "independent", { kind: "rhythm", task: "equivalent-value", target: [1, 2], accepted: [[{ events: [minim] }]], acceptAnyRuleCompliant: true }, rhythmLine([crotchet, crotchet])),
        item("independent-2", "independent", { kind: "choice", options: [{ id: "c", label: "Crotchet" }, { id: "s", label: "Semibreve" }], correctOptionIds: ["s"] }),
      ],
      recap: ["Crotchet 1 beat, minim 2, semibreve 4."],
      spacedReview: [{ templateId: "t.g1.note-value", afterDays: 1 }],
      mastery: { conceptIds: ["c.rhythm.values-long"], countsAsEvidence: "independent-steps-only", completion: "All steps attempted." },
      provenance: { authoredBy: "test", originality: "original", bookSectionIds: ["fs.g1.s01"], outcomeIds: ["abrsm2020.g1.01"], notes: "Regression fixture." },
    };
  }

  async function withFirstLesson(edit: (l: ReturnType<typeof firstLesson>) => void = () => {}) {
    const { LessonContent } = await import("../src/schema.ts");
    return mutate((c) => {
      const raw = firstLesson();
      edit(raw);
      c.lessons.push({ file: "lessons/G1-U1-L01.json", content: LessonContent.parse(raw) });
      const n = node(c, "G1-U1-L01");
      n.contentRef = "lessons/G1-U1-L01.json";
      n.contentStatus = "example";
    });
  }

  it("C1: a complete first-lesson rhythm demonstration validates before any clef is taught", async () => {
    expect(await withFirstLesson()).toEqual([]);
  });

  it("C1: the same demonstration presented as stave notation still requires a taught clef", async () => {
    expect(await withFirstLesson((l) => (l.demonstration.music.presentation = "stave"))).toContain("FRAGMENT_SCOPE");
  });

  it("C1: rhythm-line content is still limited to the rhythm taught so far", async () => {
    const quaver = { kind: "note", pitch: "B4", duration: { value: "quaver", dots: 0 } };
    expect(await withFirstLesson((l) => (l.demonstration.music = rhythmLine([quaver, quaver, minim]) as never))).toContain("FRAGMENT_SCOPE");
  });

  it("C1: a rhythm line must use a single display pitch", async () => {
    expect(await withFirstLesson((l) => (l.demonstration.music = rhythmLine([crotchet, { ...crotchet, pitch: "D5" }, minim]) as never))).toContain("RHYTHM_LINE_PITCHED");
  });

  it("C1: keyboard presentations need no clef, but black keys wait until they are taught", async () => {
    const { checkFragment } = await import("../src/verify-music.ts");
    const { buildIndex, taughtScope } = await import("../src/model.ts");
    const ix = buildIndex(base);
    const scope = taughtScope(ix, ix.nodeById.get("G1-U3-L01")!); // keyboard lesson, before clefs and accidentals
    const kb = (pitch: string) => ({ presentation: "keyboard" as const, clef: "treble" as const, showKeySignature: false, measures: [{ events: [{ kind: "note" as const, pitch, duration: { value: "crotchet" as const, dots: 0 } }] }], textAlternative: "x" });
    const run = (p: string) => {
      const out: string[] = [];
      checkFragment(kb(p), scope, "kb", (code) => out.push(code));
      return out;
    };
    expect(run("C4")).toEqual([]);
    expect(run("C#4")).toContain("FRAGMENT_SCOPE");
  });
});
