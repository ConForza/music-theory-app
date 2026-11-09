/**
 * Music Theory Path — curriculum content schema (v1).
 *
 * Every content file under /content is validated against these schemas. The schema is the
 * contract consumed by later briefs (app shell, exercise engine, progression).
 *
 * Design rules:
 *  - Stable, human-readable IDs. IDs are never reused; retire an entity with `deprecated` instead.
 *  - Reference provenance (book sections, syllabus items) is kept in dedicated fields and is never
 *    user-visible lesson content.
 *  - Engagement (XP) and mastery evidence are separate concepts throughout.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const ID_PATTERNS = {
  outcome: /^abrsm2020\.g[1-5]\.\d{2}$/,
  bookSection: /^fs\.g[1-5]\.s\d{2}$/,
  concept: /^c\.[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/,
  unit: /^G[1-5]-U\d$/,
  node: /^G[1-5](-U\d-(L\d{2}|P\d|R\d|C|E\d)|-A)$/,
  family: /^fam\.[a-z0-9]+(-[a-z0-9]+)*$/,
  template: /^t\.g[1-5]\.[a-z0-9]+(-[a-z0-9]+)*$/,
  assessment: /^a\.g[1-5](-u\d)?$/,
  grader: /^g\.[a-z0-9]+(-[a-z0-9]+)*$/,
  ruleset: /^rules\.[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/,
  lessonContent: /^lc\.G[1-5]-U\d-L\d{2}$/,
  item: /^i\.[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/,
} as const;

const id = (kind: keyof typeof ID_PATTERNS) =>
  z.string().regex(ID_PATTERNS[kind], { message: `Invalid ${kind} id` });

export const OutcomeId = id("outcome");
export const BookSectionId = id("bookSection");
export const ConceptId = id("concept");
export const UnitId = id("unit");
export const NodeId = id("node");
export const FamilyId = id("family");
export const TemplateId = id("template");
export const AssessmentId = id("assessment");
export const GraderId = id("grader");
export const RulesetId = id("ruleset");

export const Grade = z.number().int().min(1).max(5);
const NonEmpty = z.string().trim().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected YYYY-MM-DD" });
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);

// ---------------------------------------------------------------------------
// Musical value vocabularies (shared by scope tables, templates and notation)
// ---------------------------------------------------------------------------

export const KeyName = z
  .string()
  .regex(/^[A-G](#|b)? (major|minor)$/, { message: 'Key must look like "F# major" or "Bb minor"' });
export const PitchName = z
  .string()
  .regex(/^[A-G](bb|b|#|x)?-?\d$/, { message: 'Pitch must look like "C4", "F#5", "Bb3", "Fx4"' });
export const TimeSignatureName = z.string().regex(/^\d{1,2}\/\d{1,2}$/);
export const ClefName = z.enum(["treble", "bass", "alto", "tenor"]);
export const NoteValueName = z.enum([
  "breve",
  "semibreve",
  "minim",
  "crotchet",
  "quaver",
  "semiquaver",
  "demisemiquaver",
]);
export const MinorFormName = z.enum(["harmonic", "melodic"]);
export const TupletName = z.enum(["triplet", "duplet", "irregular"]);
export const RomanName = z.enum(["I", "ii", "IV", "V"]);
export const InversionName = z.enum(["a", "b", "c"]);
export const CadenceName = z.enum(["perfect", "plagal", "imperfect"]);
export const InstrumentKeyName = z.enum(["Bb", "A", "F"]);
export const OrnamentName = z.enum([
  "trill",
  "turn",
  "upper-mordent",
  "lower-mordent",
  "acciaccatura",
  "appoggiatura",
]);
export const IntervalQualityMode = z.enum(["number-only", "number-and-quality"]);
export const IntervalLowerNote = z.enum(["tonic", "any-diatonic", "any"]);
export const DegreeNaming = z.enum(["number", "technical"]);

/** A set of musical parameters. Used both for per-grade scope and for template constraints. */
export const MusicScope = z
  .object({
    keys: z.array(KeyName).optional(),
    minorForms: z.array(MinorFormName).optional(),
    timeSignatures: z.array(TimeSignatureName).optional(),
    noteValues: z.array(NoteValueName).optional(),
    maxDots: z.number().int().min(0).max(2).optional(),
    tuplets: z.array(TupletName).optional(),
    clefs: z.array(ClefName).optional(),
    maxLedgerLines: z.number().int().min(0).max(6).optional(),
    intervalQuality: IntervalQualityMode.optional(),
    intervalLowerNote: IntervalLowerNote.optional(),
    compoundIntervals: z.boolean().optional(),
    chromaticIntervals: z.boolean().optional(),
    chordDegrees: z.array(RomanName).optional(),
    inversions: z.array(InversionName).optional(),
    cadenceTypes: z.array(CadenceName).optional(),
    cadenceKeys: z.array(KeyName).optional(),
    instrumentTranspositions: z.array(InstrumentKeyName).optional(),
    octaveTranspositionClefs: z.array(ClefName).optional(),
    ornaments: z.array(OrnamentName).optional(),
    degreeNaming: DegreeNaming.optional(),
    doubleAccidentals: z.boolean().optional(),
  })
  .strict();
export type MusicScope = z.infer<typeof MusicScope>;

export const GradeScope = z
  .object({
    grade: Grade,
    /** Items newly introduced at this grade (cumulative scope = union with earlier grades). */
    adds: MusicScope,
    /** Scalar limits apply at this grade and above unless raised by a later grade. */
    notes: z.array(NonEmpty).default([]),
    outcomeRefs: z.array(OutcomeId).min(1),
  })
  .strict();
export type GradeScope = z.infer<typeof GradeScope>;

export const GradeScopeFile = z
  .object({ schemaVersion: z.literal(1), grades: z.array(GradeScope).length(5) })
  .strict();

// ---------------------------------------------------------------------------
// Release and authorities
// ---------------------------------------------------------------------------

export const ReviewState = z.enum(["pending", "in_review", "changes_requested", "approved"]);

export const CurriculumRelease = z
  .object({
    schemaVersion: z.literal(1),
    id: z.literal("mtp-curriculum"),
    version: SemVer,
    status: z.enum(["draft", "teacher_review", "approved", "superseded"]),
    createdAt: IsoDate,
    publishedAt: IsoDate.nullable(),
    scope: z.object({ grades: z.array(Grade).length(5) }).strict(),
    syllabus: z
      .object({
        authorityId: z.literal("abrsm2020"),
        publisher: NonEmpty,
        title: NonEmpty,
        documentDate: z.string().regex(/^\d{4}-\d{2}$/),
        url: z.string().url(),
        retrievedAt: IsoDate,
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        newerRevisionCheck: z
          .object({
            checkedAt: IsoDate,
            result: z.enum(["none_found", "newer_found", "inconclusive"]),
            method: NonEmpty,
            notes: NonEmpty,
          })
          .strict(),
      })
      .strict(),
    sourceBook: z
      .object({
        id: z.literal("first-steps"),
        title: NonEmpty,
        author: NonEmpty,
        publisher: NonEmpty,
        firstPublished: z.number().int(),
        isbn: NonEmpty,
        usage: z.literal("authoring-reference-only"),
        sectionCount: z.literal(75),
      })
      .strict(),
    teacherReview: z
      .object({
        status: ReviewState,
        reviewer: z.string().nullable(),
        signedOffAt: IsoDate.nullable(),
        notes: NonEmpty,
      })
      .strict(),
    changelog: z.array(z.object({ version: SemVer, date: IsoDate, summary: NonEmpty }).strict()).min(1),
  })
  .strict();
export type CurriculumRelease = z.infer<typeof CurriculumRelease>;

export const Domain = z.enum([
  "rhythm",
  "metre",
  "pitch",
  "clefs",
  "accidentals",
  "scales",
  "keys",
  "intervals",
  "chords",
  "cadences",
  "transposition",
  "terms",
  "ornaments",
  "instruments",
  "voices",
  "context",
]);
export type Domain = z.infer<typeof Domain>;

export const SyllabusOutcome = z
  .object({
    id: OutcomeId,
    grade: Grade,
    /** Numbered item in the official outline that this atomic outcome is decomposed from. */
    syllabusItem: z.number().int().min(1).max(5),
    domain: Domain,
    /** Concise original paraphrase. The official document remains the authority. */
    statement: NonEmpty,
    scopeNotes: z.array(NonEmpty).default([]),
    evidenceStatus: z.enum(["stated_in_official_outline", "implied_by_official_outline"]),
    /** Atomic decomposition of a syllabus item is the author's interpretation until reviewed. */
    decomposition: z.literal("author-interpretation"),
    teacherReview: ReviewState,
    /** Applies cumulatively to every later grade (the outline says "as in preceding grades"). */
    cumulative: z.literal(true),
  })
  .strict();
export type SyllabusOutcome = z.infer<typeof SyllabusOutcome>;

export const SyllabusFile = z
  .object({ schemaVersion: z.literal(1), authorityId: z.literal("abrsm2020"), outcomes: z.array(SyllabusOutcome) })
  .strict();

export const BookClassification = z.enum([
  "core_this_grade",
  "core_other_grade",
  "supporting",
  "no_current_match",
]);
export type BookClassification = z.infer<typeof BookClassification>;

export const SourceBookSection = z
  .object({
    id: BookSectionId,
    grade: Grade,
    section: z.number().int().min(1).max(19),
    /** The book's section heading, recorded as a citation pointer only. */
    heading: NonEmpty,
    printedPage: z.number().int().min(1),
    /** Index into the user-supplied scan (two printed pages per scan page). Authoring aid only. */
    scanPage: z.number().int().min(1),
    classification: BookClassification,
    /** Grade at which the app teaches the core of this section. */
    taughtAtGrade: Grade,
    unitIds: z.array(UnitId).min(1),
    conceptIds: z.array(ConceptId).min(1),
    outcomeIds: z.array(OutcomeId),
    /** Parts of a section that are treated differently from the section as a whole. */
    parts: z
      .array(
        z
          .object({
            topic: NonEmpty,
            classification: BookClassification,
            taughtAtGrade: Grade.nullable(),
            conceptIds: z.array(ConceptId),
            note: NonEmpty,
          })
          .strict(),
      )
      .default([]),
    reconciliation: NonEmpty,
    citation: z.literal("pointer-only"),
  })
  .strict();
export type SourceBookSection = z.infer<typeof SourceBookSection>;

export const SourceBookFile = z
  .object({ schemaVersion: z.literal(1), bookId: z.literal("first-steps"), sections: z.array(SourceBookSection) })
  .strict();

// ---------------------------------------------------------------------------
// Engine registries (contracts implemented by Brief 03)
// ---------------------------------------------------------------------------

export const AnswerKind = z.enum([
  "choice",
  "multi-choice",
  "pitch",
  "pitch-sequence",
  "staff-position",
  "rhythm",
  "time-signature",
  "key-signature",
  "interval",
  "chord",
  "chord-progression",
  "ornament-sign",
  "composite",
]);
export type AnswerKind = z.infer<typeof AnswerKind>;

export const Ruleset = z
  .object({ id: RulesetId, title: NonEmpty, description: NonEmpty, referenceImplementation: z.string().nullable() })
  .strict();

export const Grader = z
  .object({
    id: GraderId,
    title: NonEmpty,
    answerKind: AnswerKind,
    deterministic: z.literal(true),
    supportsMultipleValidAnswers: z.boolean(),
    rulesetIds: z.array(RulesetId).min(1),
    description: NonEmpty,
  })
  .strict();

export const EngineFile = z
  .object({
    schemaVersion: z.literal(1),
    rulesets: z.array(Ruleset).min(1),
    graders: z.array(Grader).min(1),
  })
  .strict();

export const Interaction = z.enum([
  "choice",
  "staff-read",
  "staff-write",
  "keyboard",
  "staff-and-keyboard",
  "rhythm-builder",
  "rhythm-grouping",
  "barline-placer",
  "scale-builder",
  "key-signature-builder",
  "interval-explorer",
  "chord-builder",
  "cadence-chooser",
  "transposition-editor",
  "score-annotation",
]);

export const MistakeCategory = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    description: NonEmpty,
    /** Learner-facing explanation shown when this mistake is detected. Original wording. */
    feedback: NonEmpty,
  })
  .strict();

export const ExerciseFamily = z
  .object({
    id: FamilyId,
    title: NonEmpty,
    interaction: Interaction,
    graderId: GraderId,
    answerKind: AnswerKind,
    mistakeCategories: z.array(MistakeCategory).min(1),
    correctFeedback: NonEmpty,
    fallbackFeedback: NonEmpty,
    accessibility: z
      .object({
        keyboardOperable: z.literal(true),
        screenReaderEquivalent: NonEmpty,
        withoutSound: NonEmpty,
        withoutColour: NonEmpty,
      })
      .strict(),
  })
  .strict();
export type ExerciseFamily = z.infer<typeof ExerciseFamily>;

export const FamiliesFile = z.object({ schemaVersion: z.literal(1), families: z.array(ExerciseFamily) }).strict();

export const QaStatus = z.enum(["draft", "self-checked", "teacher-reviewed", "approved"]);

export const ExerciseTemplate = z
  .object({
    id: TemplateId,
    version: z.number().int().min(1),
    familyId: FamilyId,
    grade: Grade,
    mode: z.enum(["identify", "build", "correct", "compare", "listen-identify", "apply-in-context"]),
    outcomeIds: z.array(OutcomeId).min(1),
    conceptIds: z.array(ConceptId).min(1),
    /** Original prompt pattern; {placeholders} are filled by the generator. */
    promptPattern: NonEmpty,
    /** Musical constraints. Must lie within the cumulative scope of `grade`. */
    scope: MusicScope,
    acceptance: z
      .object({
        spellingSensitive: z.boolean(),
        octaveSensitive: z.boolean(),
        enharmonicPolicy: z.enum(["reject", "accept", "not-applicable"]),
        multipleValidAnswers: z.boolean(),
        alternativesNote: NonEmpty,
      })
      .strict(),
    /** Generator must reject an item if any of these checks fail. */
    ambiguityChecks: z.array(NonEmpty).min(1),
    hints: z.array(NonEmpty).min(1),
    extraMistakeCategories: z.array(MistakeCategory).default([]),
    difficulty: z.number().int().min(1).max(5),
    qa: z
      .object({
        status: QaStatus,
        reviewRequirements: z.array(NonEmpty).min(1),
        reviewedBy: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type ExerciseTemplate = z.infer<typeof ExerciseTemplate>;

export const TemplatesFile = z
  .object({ schemaVersion: z.literal(1), grade: Grade, templates: z.array(ExerciseTemplate) })
  .strict();

// ---------------------------------------------------------------------------
// Concepts and the learning path
// ---------------------------------------------------------------------------

export const Concept = z
  .object({
    id: ConceptId,
    grade: Grade,
    domain: Domain,
    title: NonEmpty,
    summary: NonEmpty,
    prerequisiteIds: z.array(ConceptId),
    rulesetIds: z.array(RulesetId).min(1),
    /** core = needed for an official outcome; supporting = useful context; enrichment = optional extra. */
    status: z.enum(["core", "supporting", "enrichment"]),
    outcomeIds: z.array(OutcomeId),
  })
  .strict();
export type Concept = z.infer<typeof Concept>;

export const ConceptsFile = z.object({ schemaVersion: z.literal(1), grade: Grade, concepts: z.array(Concept) }).strict();

export const Unit = z
  .object({
    id: UnitId,
    grade: Grade,
    sequence: z.number().int().min(1),
    title: NonEmpty,
    learnerTitle: NonEmpty,
    summary: NonEmpty,
    bookSectionIds: z.array(BookSectionId),
    refinements: z.array(NonEmpty).default([]),
  })
  .strict();
export type Unit = z.infer<typeof Unit>;

export const NodeType = z.enum(["lesson", "practice", "review", "unit_challenge", "grade_assessment", "enrichment"]);
export type NodeType = z.infer<typeof NodeType>;

export const PathNode = z
  .object({
    id: NodeId,
    type: NodeType,
    unitId: UnitId.nullable(),
    title: NonEmpty,
    /** Lessons: one clear learning objective. Other nodes: purpose. */
    objective: NonEmpty,
    conceptIds: z.array(ConceptId).default([]),
    outcomeIds: z.array(OutcomeId).default([]),
    /** Practice/review nodes: outcomes being revisited (must already have been taught). */
    reviewOutcomeIds: z.array(OutcomeId).default([]),
    exerciseTemplateIds: z.array(TemplateId).default([]),
    assessmentId: AssessmentId.optional(),
    /** Nodes that must be completed first. Omitted = the previous node in the grade. */
    unlockAfter: z.array(NodeId).optional(),
    optional: z.boolean().default(false),
    estimatedMinutes: z.number().int().min(1).max(30),
    contentVersion: z.number().int().min(1),
    contentStatus: z.enum(["planned", "example", "draft", "approved"]),
    /** Relative path (from /content) to a LessonContent file, when one exists. */
    contentRef: z.string().optional(),
    /** Book sections whose subject this node draws on (author/teacher metadata only). */
    bookSectionIds: z.array(BookSectionId).default([]),
  })
  .strict();
export type PathNode = z.infer<typeof PathNode>;

export const GradeWorld = z
  .object({
    schemaVersion: z.literal(1),
    grade: Grade,
    title: NonEmpty,
    learnerTitle: NonEmpty,
    summary: NonEmpty,
    units: z.array(Unit).min(1),
    nodes: z.array(PathNode).min(1),
  })
  .strict();
export type GradeWorld = z.infer<typeof GradeWorld>;

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export const AssessmentTemplate = z
  .object({
    id: AssessmentId,
    kind: z.enum(["unit_challenge", "grade_assessment"]),
    grade: Grade,
    unitId: UnitId.nullable(),
    version: z.number().int().min(1),
    title: NonEmpty,
    hintsAllowed: z.literal(false),
    evidence: z.literal("independent"),
    sections: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
            title: NonEmpty,
            outcomeIds: z.array(OutcomeId).min(1),
            templateIds: z.array(TemplateId).min(1),
            itemCount: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1),
    /** Seeded, balanced sampling makes repeat attempts reproducible and comparable. */
    sampling: z.literal("seeded-balanced"),
    disclaimer: z.literal("practice-only-not-an-official-abrsm-assessment"),
  })
  .strict();
export type AssessmentTemplate = z.infer<typeof AssessmentTemplate>;

export const AssessmentsFile = z
  .object({ schemaVersion: z.literal(1), grade: Grade, assessments: z.array(AssessmentTemplate) })
  .strict();

// ---------------------------------------------------------------------------
// Progression policy (configuration consumed by Brief 04; values are provisional)
// ---------------------------------------------------------------------------

export const MasteryState = z.enum(["new", "learning", "practising", "proficient", "mastered", "review_due"]);

export const ProgressionPolicy = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal("provisional"),
    xp: z
      .object({
        perNodeType: z.record(NodeType, z.number().int().min(0)),
        firstCompletionOnly: z.boolean(),
        dailyCapPerNode: z.number().int().min(0),
        note: NonEmpty,
      })
      .strict(),
    mastery: z
      .object({
        states: z.array(MasteryState).length(6),
        evidenceCounts: z.array(z.enum(["independent-step", "practice-item", "review-item", "assessment-item"])),
        evidenceExcluded: z.array(z.enum(["hinted-step", "guided-step", "worked-example", "retry-after-reveal"])),
        thresholds: z
          .object({
            proficient: z
              .object({ minIndependentCorrect: z.number().int(), minDistinctTemplates: z.number().int() })
              .strict(),
            mastered: z
              .object({
                minIndependentCorrect: z.number().int(),
                minDistinctTemplates: z.number().int(),
                minDaysSinceFirstEvidence: z.number().int(),
                requiresDelayedReview: z.boolean(),
              })
              .strict(),
          })
          .strict(),
        note: NonEmpty,
      })
      .strict(),
    review: z
      .object({
        intervalsDays: z.array(z.number().int().min(1)).min(3),
        lapseResetsTo: z.number().int().min(0),
        note: NonEmpty,
      })
      .strict(),
    unlocking: z
      .object({
        lesson: NonEmpty,
        unit: NonEmpty,
        grade: NonEmpty,
        gradeCompletion: NonEmpty,
      })
      .strict(),
    readiness: z.object({ passThresholdPercent: z.number().int(), note: NonEmpty }).strict(),
  })
  .strict();
export type ProgressionPolicy = z.infer<typeof ProgressionPolicy>;

// ---------------------------------------------------------------------------
// Lesson content and exercise items
// ---------------------------------------------------------------------------

export const Duration = z
  .object({ value: NoteValueName, dots: z.number().int().min(0).max(2).default(0) })
  .strict();

export const NotationEvent = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("note"),
      pitch: PitchName,
      duration: Duration,
      /** Accidental printed before this note (otherwise derived from key signature/bar state). */
      writtenAccidental: z.enum(["sharp", "flat", "natural", "double-sharp", "double-flat"]).optional(),
      tieToNext: z.boolean().optional(),
      label: z.string().max(3).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("rest"), duration: Duration }).strict(),
]);

export const NotationFragment = z
  .object({
    clef: ClefName,
    key: KeyName.optional(),
    showKeySignature: z.boolean().default(true),
    timeSignature: TimeSignatureName.optional(),
    tempoText: z.string().optional(),
    measures: z.array(z.object({ events: z.array(NotationEvent).min(1) }).strict()).min(1),
    /** Text description for screen readers and no-graphics mode. */
    textAlternative: NonEmpty,
  })
  .strict();
export type NotationFragment = z.infer<typeof NotationFragment>;

export const AnswerSpec = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("choice"),
      options: z.array(z.object({ id: NonEmpty, label: NonEmpty }).strict()).min(2),
      correctOptionIds: z.array(NonEmpty).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("staff-position"),
      clef: ClefName,
      /** Accepted written pitches. With octaveSensitive=false, any octave of the spelling is accepted. */
      accepted: z.array(PitchName).min(1),
      octaveSensitive: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pitch"),
      accepted: z.array(PitchName).min(1),
      octaveSensitive: z.boolean(),
      spellingSensitive: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pitch-sequence"),
      clef: ClefName,
      key: KeyName,
      accepted: z.array(z.array(PitchName).min(1)).min(1),
      derivation: z
        .object({
          rule: z.literal("transpose"),
          interval: z.string().regex(/^(d|m|M|P|A)\d{1,2}$/),
          direction: z.enum(["up", "down"]),
          sourceKey: KeyName,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("chord-progression"),
      key: KeyName,
      points: z
        .array(
          z
            .object({
              label: z.string().regex(/^[A-Z]$/),
              melodyPitches: z.array(PitchName).min(1),
              accepted: z.array(RomanName).min(1),
            })
            .strict(),
        )
        .min(1),
      /** Pairs of labels that form cadences, with the cadence type(s) that a correct answer produces. */
      cadences: z
        .array(
          z
            .object({ labels: z.tuple([z.string(), z.string()]), acceptedTypes: z.array(CadenceName).min(1) })
            .strict(),
        )
        .default([]),
    })
    .strict(),
]);
export type AnswerSpec = z.infer<typeof AnswerSpec>;

export const ExerciseItem = z
  .object({
    id: z.string().regex(ID_PATTERNS.item),
    templateId: TemplateId,
    templateVersion: z.number().int().min(1),
    /** Fixed authored item (null) or reproducible generator seed. */
    seed: z.number().int().nullable(),
    evidence: z.enum(["learning", "independent"]),
    prompt: NonEmpty,
    music: NotationFragment.optional(),
    answer: AnswerSpec,
    hints: z.array(NonEmpty).default([]),
    feedback: z
      .object({
        correct: NonEmpty,
        /** Keyed by mistake-category id from the template's family (or template extras). */
        mistakes: z.record(z.string(), NonEmpty),
        fallback: NonEmpty,
      })
      .strict(),
  })
  .strict();
export type ExerciseItem = z.infer<typeof ExerciseItem>;

export const ExplanationBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: NonEmpty }).strict(),
  z.object({ kind: z.literal("tip"), text: NonEmpty }).strict(),
  z.object({ kind: z.literal("notation"), music: NotationFragment, caption: NonEmpty }).strict(),
]);

export const LessonContent = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(ID_PATTERNS.lessonContent),
    lessonId: NodeId,
    contentVersion: z.number().int().min(1),
    locale: z.literal("en-GB"),
    objective: z.object({ statement: NonEmpty, successCriteria: z.array(NonEmpty).min(1) }).strict(),
    explanation: z.array(ExplanationBlock).min(1).max(6),
    demonstration: z
      .object({
        widget: z.enum(["staff", "keyboard", "staff-and-keyboard", "rhythm", "score"]),
        music: NotationFragment,
        steps: z.array(NonEmpty).min(1),
        audio: z.object({ playback: z.enum(["synth-generated", "none"]), optional: z.literal(true) }).strict(),
        textAlternative: NonEmpty,
      })
      .strict(),
    guided: z.array(ExerciseItem).min(1),
    independent: z.array(ExerciseItem).min(2),
    recap: z.array(NonEmpty).min(1).max(5),
    spacedReview: z
      .array(z.object({ templateId: TemplateId, afterDays: z.number().int().min(1) }).strict())
      .min(1),
    mastery: z
      .object({
        conceptIds: z.array(ConceptId).min(1),
        countsAsEvidence: z.literal("independent-steps-only"),
        completion: NonEmpty,
      })
      .strict(),
    provenance: z
      .object({
        authoredBy: NonEmpty,
        originality: z.literal("original"),
        bookSectionIds: z.array(BookSectionId),
        outcomeIds: z.array(OutcomeId).min(1),
        notes: NonEmpty,
      })
      .strict(),
  })
  .strict();
export type LessonContent = z.infer<typeof LessonContent>;

export const StandaloneItemFile = z
  .object({
    schemaVersion: z.literal(1),
    description: NonEmpty,
    outcomeIds: z.array(OutcomeId).min(1),
    provenance: z
      .object({ authoredBy: NonEmpty, originality: z.literal("original"), bookSectionIds: z.array(BookSectionId) })
      .strict(),
    item: ExerciseItem,
  })
  .strict();
export type StandaloneItemFile = z.infer<typeof StandaloneItemFile>;
