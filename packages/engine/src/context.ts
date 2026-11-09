import { intersectScope, type CurriculumIndex, type ExerciseFamily, type ExerciseItem, type ExerciseTemplate, type MusicScope } from "@mtp/curriculum";

/** Everything a grader or input builder may know about an item. The scope is what the learner has been taught. */
export interface ItemContext {
  item: ExerciseItem;
  template: ExerciseTemplate;
  family: ExerciseFamily;
  scope: MusicScope;
}

export class EngineError extends Error {
  constructor(
    public code: "unknown_template" | "unknown_family" | "response_mismatch" | "malformed_response" | "item_inconsistent" | "unsupported",
    message: string,
  ) {
    super(message);
  }
}

/** The scope an item is graded within: the template's scope inside its grade, narrowed further by a lesson binding when given. */
export function templateScope(ix: CurriculumIndex, template: ExerciseTemplate): MusicScope {
  return intersectScope(ix.cumulativeScope.get(template.grade) ?? {}, template.scope);
}

export function itemContext(ix: CurriculumIndex, item: ExerciseItem, scope?: MusicScope): ItemContext {
  const template = ix.templates.get(item.templateId);
  if (!template) throw new EngineError("unknown_template", `Unknown template ${item.templateId}`);
  const family = ix.families.get(template.familyId);
  if (!family) throw new EngineError("unknown_family", `Unknown family ${template.familyId}`);
  return { item, template, family, scope: scope ?? templateScope(ix, template) };
}
