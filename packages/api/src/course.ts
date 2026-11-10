import {
  buildIndex,
  effectiveScope,
  loadCurriculum,
  type CurriculumIndex,
  type ExerciseItem,
  type LessonContent,
  type MusicScope,
  type NodeType,
  type NotationFragment,
  type NotationScore,
  type OrderedNode,
  type ShowcaseFile,
} from "@mtp/curriculum";
import { inputFor, templateScope, type ItemInput } from "@mtp/engine";

/** How the learner answers an item (engine input descriptor). Never contains the answer. */
export type { ItemInput };

export interface LearnerItem {
  id: string;
  section: "guided" | "independent" | "practice";
  evidence: "learning" | "independent";
  prompt: string;
  music?: NotationFragment;
  score?: NotationScore;
  input: ItemInput;
  hintCount: number;
  /** Exercise family (for presentation: icons, instructions). */
  familyId: string;
  grade: number;
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
  /** True when learner-playable content exists for this node (a lesson, or a server-built practice/review/challenge/assessment). */
  playable: boolean;
  /** How the node is played: a fixed authored lesson, or a server-built session of generated questions. */
  playKind: "lesson" | "session" | null;
  /** Server-built session behaviour (null for lessons). */
  sessionKind: SessionKind | null;
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

export type SessionKind = "practice" | "review" | "challenge" | "assessment";
const SESSION_OF: Partial<Record<NodeType, SessionKind>> = { practice: "practice", review: "review", unit_challenge: "challenge", grade_assessment: "assessment" };

export interface Course {
  ix: CurriculumIndex;
  version: string;
  view: CourseView;
  /** Ordered nodes (global path order). */
  nodes: OrderedNode[];
  isPlayable(nodeId: string): boolean;
  /** The kind of server-built session a node runs, if it is one and is playable. */
  sessionKind(nodeId: string): SessionKind | null;
  lesson(nodeId: string): LearnerLesson | undefined;
  /** Raw authored items for a playable node (server-side grading only). */
  authoredItems(nodeId: string): ExerciseItem[];
  /** The scope a lesson item is graded in: the node binding's effective scope (what has been taught). */
  scopeFor(nodeId: string, item: ExerciseItem): MusicScope;
  /** Practice-lab demonstration sets (content/exercises/showcase). */
  showcase: ShowcaseFile[];
  /** Turn any item into what the learner sees (no answers). */
  learnerItem(item: ExerciseItem, section: LearnerItem["section"], scope?: MusicScope): LearnerItem;
}

export function loadCourse(root?: string): Course {
  const { curriculum, issues } = loadCurriculum(root);
  const errors = issues.filter((i) => i.severity === "error");
  if (!curriculum || errors.length) {
    throw new Error(`Curriculum failed to load:\n${errors.map((e) => `  ${e.where}: ${e.message}`).join("\n")}`);
  }
  const ix = buildIndex(curriculum);
  const scopeFor = (nodeId: string, item: ExerciseItem): MusicScope => {
    const node = ix.nodeById.get(nodeId);
    const tpl = ix.templates.get(item.templateId);
    const binding = node?.exercises.find((b) => b.templateId === item.templateId);
    if (node && binding) return effectiveScope(ix, node, binding);
    return tpl ? templateScope(ix, tpl) : {};
  };
  /** In a question the learner gets the description written for questions (it never gives the answer away). */
  const forLearner = (m: NonNullable<ExerciseItem["music"]>) => {
    if (!m.questionAlternative) return m;
    const { questionAlternative, ...rest } = m;
    return { ...rest, textAlternative: questionAlternative };
  };
  const toLearner = (it: ExerciseItem, section: LearnerItem["section"], scope?: MusicScope): LearnerItem => {
    const tpl = ix.templates.get(it.templateId)!;
    return {
      id: it.id,
      section,
      evidence: it.evidence,
      prompt: it.prompt,
      ...(it.music ? { music: forLearner(it.music) } : {}),
      ...(it.score ? { score: it.score } : {}),
      input: inputFor(ix, it, scope),
      hintCount: it.hints.length,
      familyId: tpl.familyId,
      grade: tpl.grade,
    };
  };
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
        let learner: LearnerItem;
        try {
          learner = toLearner(it, section, scopeFor(nodeId, it));
        } catch (e) {
          // An item the engine cannot present is left out rather than shown half-working.
          console.warn(`Skipping ${it.id}: ${(e as Error).message}`);
          continue;
        }
        raw.push(it);
        items.push(learner);
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

  // A practice, review, challenge or assessment node is playable once it is authored (not "planned") and has something to draw
  // questions from: exercise bindings, or an assessment blueprint. Its questions are generated and graded on the server.
  const sessionNodes = new Map<string, SessionKind>();
  for (const n of ix.nodes) {
    const kind = SESSION_OF[n.type];
    if (!kind || n.contentStatus === "planned") continue;
    const ok = kind === "challenge" || kind === "assessment" ? Boolean(n.assessmentId && ix.assessments.get(n.assessmentId)) : n.exercises.length > 0;
    if (ok) sessionNodes.set(n.id, kind);
  }
  const playableNode = (id: string) => learnerLessons.has(id) || sessionNodes.has(id);

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
            playable: playableNode(n.id),
            playKind: learnerLessons.has(n.id) ? "lesson" : sessionNodes.has(n.id) ? "session" : null,
            sessionKind: sessionNodes.get(n.id) ?? null,
            practiceOnly: n.type === "grade_assessment" || n.type === "unit_challenge",
          })),
      })),
  };

  return {
    ix,
    version: curriculum.release.version,
    view,
    nodes: ix.nodes,
    isPlayable: playableNode,
    sessionKind: (id) => sessionNodes.get(id) ?? null,
    lesson: (id) => learnerLessons.get(id),
    authoredItems: (id) => authored.get(id) ?? [],
    scopeFor,
    showcase: curriculum.showcase.map((x) => x.content),
    learnerItem: toLearner,
  };
}
