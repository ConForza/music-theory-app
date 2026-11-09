import {
  buildIndex,
  loadCurriculum,
  music,
  type CurriculumIndex,
  type ExerciseItem,
  type LessonContent,
  type NodeType,
  type NotationFragment,
  type OrderedNode,
} from "@mtp/curriculum";

/** How the learner answers an item. Never contains the answer. */
export type ItemInput =
  | { kind: "choice"; options: Array<{ id: string; label: string }> }
  | { kind: "pitch-letter" }
  | { kind: "staff-position"; clef: "treble" | "bass"; maxLedgerLines: number };

export interface LearnerItem {
  id: string;
  section: "guided" | "independent";
  evidence: "learning" | "independent";
  prompt: string;
  music?: NotationFragment;
  input: ItemInput;
  hintCount: number;
}

export interface LearnerLesson {
  nodeId: string;
  contentVersion: number;
  objective: LessonContent["objective"];
  explanation: LessonContent["explanation"];
  demonstration: Pick<LessonContent["demonstration"], "widget" | "music" | "steps" | "textAlternative">;
  items: LearnerItem[];
  recap: string[];
}

export interface CourseNode {
  id: string;
  type: NodeType;
  unitId: string | null;
  title: string;
  objective: string;
  optional: boolean;
  estimatedMinutes: number;
  contentVersion: number;
  /** True when a lesson with learner-playable content exists for this node. */
  playable: boolean;
  /** Practice-only wording must accompany assessments (OPEN_QUESTIONS Q11). */
  practiceOnly: boolean;
}

export interface CourseView {
  release: { id: string; version: string; status: string };
  worlds: Array<{
    grade: number;
    title: string;
    learnerTitle: string;
    summary: string;
    units: Array<{ id: string; sequence: number; learnerTitle: string; summary: string; nodeIds: string[] }>;
    nodes: CourseNode[];
  }>;
}

export interface Course {
  ix: CurriculumIndex;
  version: string;
  view: CourseView;
  /** Ordered nodes (global path order). */
  nodes: OrderedNode[];
  isPlayable(nodeId: string): boolean;
  lesson(nodeId: string): LearnerLesson | undefined;
  /** Raw authored items for a playable node (server-side grading only). */
  authoredItems(nodeId: string): ExerciseItem[];
}

/** Which authored items the Brief 02 lesson player can present and grade. The full engine is Brief 03. */
export function inputFor(item: ExerciseItem): ItemInput | undefined {
  const a = item.answer;
  if (a.kind === "choice") return { kind: "choice", options: a.options };
  if (a.kind === "pitch") {
    const letterOnly = !a.octaveSensitive && a.relation === "same" && a.accepted.every((p) => music.parsePitch(p).alter === 0);
    return letterOnly ? { kind: "pitch-letter" } : undefined;
  }
  if (a.kind === "staff-position" && (a.clef === "treble" || a.clef === "bass") && a.octaveSensitive) {
    return { kind: "staff-position", clef: a.clef, maxLedgerLines: a.target.maxLedgerLines };
  }
  return undefined;
}

export function loadCourse(root?: string): Course {
  const { curriculum, issues } = loadCurriculum(root);
  const errors = issues.filter((i) => i.severity === "error");
  if (!curriculum || errors.length) {
    throw new Error(`Curriculum failed to load:\n${errors.map((e) => `  ${e.where}: ${e.message}`).join("\n")}`);
  }
  const ix = buildIndex(curriculum);
  const lessonByNode = new Map<string, LessonContent>();
  for (const n of ix.nodes) {
    if (!n.contentRef || n.contentStatus === "planned") continue;
    const file = curriculum.lessons.find((l) => l.file === n.contentRef);
    if (file && (n.type === "lesson" || n.type === "enrichment")) lessonByNode.set(n.id, file.content);
  }

  const learnerLessons = new Map<string, LearnerLesson>();
  const authored = new Map<string, ExerciseItem[]>();
  for (const [nodeId, l] of lessonByNode) {
    const items: LearnerItem[] = [];
    const raw: ExerciseItem[] = [];
    for (const [section, list] of [["guided", l.guided], ["independent", l.independent]] as const) {
      for (const it of list) {
        const input = inputFor(it);
        if (!input) continue;
        raw.push(it);
        items.push({
          id: it.id,
          section,
          evidence: it.evidence,
          prompt: it.prompt,
          ...(it.music ? { music: it.music } : {}),
          input,
          hintCount: it.hints.length,
        });
      }
    }
    if (items.length === 0) continue; // nothing the player can run: stays "coming soon"
    authored.set(nodeId, raw);
    learnerLessons.set(nodeId, {
      nodeId,
      contentVersion: l.contentVersion,
      objective: l.objective,
      explanation: l.explanation,
      demonstration: {
        widget: l.demonstration.widget,
        music: l.demonstration.music,
        steps: l.demonstration.steps,
        textAlternative: l.demonstration.textAlternative,
      },
      items,
      recap: l.recap,
    });
  }

  const view: CourseView = {
    release: { id: curriculum.release.id, version: curriculum.release.version, status: curriculum.release.status },
    worlds: [...curriculum.worlds]
      .sort((a, b) => a.grade - b.grade)
      .map((w) => ({
        grade: w.grade,
        title: w.title,
        learnerTitle: w.learnerTitle,
        summary: w.summary,
        units: w.units
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((u) => ({
            id: u.id,
            sequence: u.sequence,
            learnerTitle: u.learnerTitle,
            summary: u.summary,
            nodeIds: ix.nodes.filter((n) => n.unitId === u.id).map((n) => n.id),
          })),
        nodes: ix.nodes
          .filter((n) => n.grade === w.grade)
          .map((n) => ({
            id: n.id,
            type: n.type,
            unitId: n.unitId,
            title: n.title,
            objective: n.objective,
            optional: n.optional,
            estimatedMinutes: n.estimatedMinutes,
            contentVersion: n.contentVersion,
            playable: learnerLessons.has(n.id),
            practiceOnly: n.type === "grade_assessment" || n.type === "unit_challenge",
          })),
      })),
  };

  return {
    ix,
    version: curriculum.release.version,
    view,
    nodes: ix.nodes,
    isPlayable: (id) => learnerLessons.has(id),
    lesson: (id) => learnerLessons.get(id),
    authoredItems: (id) => authored.get(id) ?? [],
  };
}
