/**
 * The Brief 04 facade. It wires XP, daily activity, mastery evidence, review and achievements into the existing lesson
 * flow without owning any of the Brief 02 rules: `computeNodeStates` still decides unlocking, `ProgressService` still
 * decides completion, and nothing here is ever an input to either.
 */
import type { ExerciseItem, ProgressionPolicy } from "@mtp/curriculum";
import { AchievementService } from "./achievements.ts";
import { ActivityService } from "./activity.ts";
import type { Clock } from "./clock.ts";
import type { Course } from "./course.ts";
import type { Db } from "./db.ts";
import { REVEAL_AFTER_WRONG } from "./grade.ts";
import { explainMastery, isDue, rulesFrom, type ConceptMastery, type EvidenceSource } from "./mastery.ts";
import { MasteryService, learnerTime, type LearnerTime } from "./mastery-service.ts";
import { ReviewService } from "./review.ts";
import { XpService } from "./xp.ts";

export interface LessonAttemptFacts {
  userId: string;
  nodeId: string;
  item: ExerciseItem;
  attemptId: string;
  /** Attempts this learner has already made at this exact item, across every run. */
  priorAttempts: number;
  hints: number;
  correct: boolean;
  category: string | null;
  contentVersion: number;
}

export class Engagement {
  readonly mastery: MasteryService;
  readonly xp: XpService;
  readonly activity: ActivityService;
  readonly achievements: AchievementService;
  readonly review: ReviewService;
  private nextNode: (userId: string) => string | null = () => null;
  private categories = new Map<string, { label: string; tip: string }>();

  constructor(
    private db: Db,
    private course: Course,
    readonly clock: Clock,
    readonly policy: ProgressionPolicy,
  ) {
    this.mastery = new MasteryService(db, course, clock, rulesFrom(policy));
    this.xp = new XpService(db, policy);
    this.activity = new ActivityService(db);
    this.achievements = new AchievementService(db, course);
    this.review = new ReviewService(db, course, clock, this.mastery, this.xp, this.activity, this.achievements, policy.review.session ?? { maxConcepts: 4, itemsPerConcept: 2 });
    for (const f of course.ix.families.values()) for (const m of f.mistakeCategories) if (!this.categories.has(m.id)) this.categories.set(m.id, { label: m.description, tip: m.feedback });
  }

  /** Where "next lesson" comes from (progress service), so the dashboard can recommend it without a circular dependency. */
  attach(nextNode: (userId: string) => string | null) {
    this.nextNode = nextNode;
  }

  defaultGoal(): number {
    return this.policy.daily?.defaultSessions ?? 1;
  }
  goalOf(userId: string): number {
    const r = this.db.prepare("SELECT daily_goal FROM profiles WHERE user_id = ?").get(userId) as { daily_goal: number } | undefined;
    return r?.daily_goal ?? this.defaultGoal();
  }
  time(userId: string): LearnerTime {
    return learnerTime(this.db, this.clock, userId);
  }

  // ---- evidence from lessons ---------------------------------------------------------------------------------------

  /** How a lesson attempt is classified. The server owns every input: the authored evidence level, its own hint log and attempt counts. */
  classify(f: LessonAttemptFacts): EvidenceSource {
    if (f.item.evidence !== "independent") return f.hints > 0 ? "hinted-step" : "guided-step";
    if (f.hints > 0) return "hinted-step";
    if (f.priorAttempts >= REVEAL_AFTER_WRONG) return "retry-after-reveal";
    if (f.priorAttempts > 0) return "not-first-attempt";
    return "independent-step";
  }

  /** Record a lesson attempt as (non-)evidence for the concepts its template is bound to at this node. Call inside the attempt's transaction. */
  recordLessonAttempt(f: LessonAttemptFacts) {
    const node = this.course.ix.nodeById.get(f.nodeId);
    const conceptIds = [...new Set((node?.exercises ?? []).filter((b) => b.templateId === f.item.templateId).flatMap((b) => b.conceptIds))];
    if (!conceptIds.length) return;
    this.mastery.record(f.userId, {
      id: `lesson:${f.attemptId}`,
      conceptIds,
      source: this.classify(f),
      correct: f.correct,
      itemId: f.item.id,
      templateId: f.item.templateId,
      templateVersion: f.item.templateVersion,
      nodeId: f.nodeId,
      mistakeCategory: f.category,
      contentVersion: f.contentVersion,
    });
  }

  // ---- rewards for completing a path node ---------------------------------------------------------------------------

  /** Award XP, record the session and check badges for a node the server just completed. Call inside the completion's transaction. */
  onNodeComplete(userId: string, nodeId: string, run: number, contentVersion: number) {
    const lt = this.time(userId);
    const key = `node:${nodeId}:run${run}`;
    const node = this.course.ix.nodeById.get(nodeId)!;
    this.xp.award(userId, { sourceKey: key, kind: "node_complete", nodeId, nodeType: node.type, contentVersion, curriculumVersion: this.course.version }, lt);
    this.activity.record(userId, { sourceKey: key, kind: "node_complete", nodeId }, lt);
    this.achievements.evaluate(userId, this.mastery.all(userId, lt.date), key, lt.iso);
  }

  /** What completing (or having completed) a node earned. Read-only, so a retried completion repeats the same reply. */
  rewardsFor(userId: string, nodeId: string, run: number) {
    const lt = this.time(userId);
    const key = `node:${nodeId}:run${run}`;
    const xp = this.xp.find(userId, key);
    const total = this.xp.total(userId);
    const status = this.activity.status(userId, lt, this.goalOf(userId));
    const node = this.course.ix.nodeById.get(nodeId);
    const mastery = this.mastery.all(userId, lt.date);
    const touched = [...new Set((node?.exercises ?? []).flatMap((b) => b.conceptIds))];
    return {
      xp: xp ? { awarded: xp.awarded, capped: xp.capped, reason: xp.reason } : null,
      total,
      milestone: this.xp.milestone(total),
      goal: status.goal,
      streak: status.streak,
      newAchievements: this.achievements.awardedFor(userId, key).map((a) => ({ id: a.id, title: a.title, description: a.description })),
      concepts: touched.map((id) => this.conceptCard(id, mastery.get(id) ?? null, lt.date, this.completed(userId))),
    };
  }

  private completed(userId: string): Set<string> {
    return new Set((this.db.prepare("SELECT node_id FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL").all(userId) as Array<{ node_id: string }>).map((r) => r.node_id));
  }

  // ---- read models ----------------------------------------------------------------------------------------------------

  conceptCard(conceptId: string, m: ConceptMastery | null, today: string, completed: Set<string>) {
    const concept = this.course.ix.concepts.get(conceptId);
    const ex = explainMastery(m, this.mastery.rules);
    const top = Object.entries(m?.mistakes ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return {
      conceptId,
      title: concept?.title ?? conceptId,
      summary: concept?.summary ?? "",
      grade: concept?.grade ?? 0,
      state: m?.state ?? ("new" as const),
      highestState: m?.highestState ?? ("new" as const),
      independentCorrect: m?.independentCorrect ?? 0,
      distinctTemplates: m?.distinctTemplates ?? 0,
      spanDays: m?.spanDays ?? 0,
      delayedReviews: m?.delayedReviews ?? 0,
      lapses: m?.lapses ?? 0,
      nextDueDate: m?.nextDueDate ?? null,
      due: m ? isDue(m, today) : false,
      reviewable: this.review.candidates(conceptId, completed).length > 0,
      headline: ex.headline,
      met: ex.met,
      missing: ex.missing,
      mistakes: top.map(([id, count]) => ({ id, count, label: this.categories.get(id)?.label ?? id, tip: this.categories.get(id)?.tip ?? "" })),
    };
  }

  /** Dashboard summary: XP, daily goal and streak, what is due, recent badges. */
  snapshot(userId: string) {
    const lt = this.time(userId);
    const total = this.xp.total(userId);
    const status = this.activity.status(userId, lt, this.goalOf(userId));
    const { ready, unavailable } = this.review.due(userId, lt);
    const all = this.mastery.all(userId, lt.date);
    const upcoming = [...all.values()].filter((m) => m.nextDueDate && m.nextDueDate > lt.date).map((m) => m.nextDueDate!).sort();
    const earned = this.achievements.list(userId, all).filter((a) => a.earned).sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""));
    return {
      xp: { total, milestone: this.xp.milestone(total), recent: this.xp.recent(userId, 5) },
      goal: status.goal,
      streak: status.streak,
      today: lt.date,
      timezone: lt.tz,
      review: { dueCount: ready.length, waiting: unavailable.length, nextDueDate: upcoming[0] ?? null },
      achievements: { earnedCount: earned.length, total: this.achievements.defs.length, recent: earned.slice(0, 3) },
    };
  }

  /** The Review hub: concepts grouped by where they are, weaker areas, upcoming reviews, history and the next step. */
  reviewOverview(userId: string) {
    const lt = this.time(userId);
    const completed = this.completed(userId);
    const all = this.mastery.all(userId, lt.date);
    const cards = [...all.values()].map((m) => this.conceptCard(m.conceptId, m, lt.date, completed));
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
    // "Ready" means due AND reviewable now. A due concept whose lesson is not completed (or has no question type yet) waits quietly.
    const ready = cards.filter((c) => c.due && c.reviewable).sort(byTitle);
    const notDue = cards.filter((c) => !(c.due && c.reviewable));
    const weak = cards
      .filter((c) => c.mistakes.length > 0 && (c.lapses > 0 || (all.get(c.conceptId)?.recent.slice(-5).filter((x) => !x).length ?? 0) >= 2))
      .sort((a, b) => b.lapses - a.lapses || b.mistakes.reduce((n, x) => n + x.count, 0) - a.mistakes.reduce((n, x) => n + x.count, 0))
      .slice(0, 5);
    const reviewable = ready.length;
    const next = this.nextNode(userId);
    const open = this.db.prepare("SELECT id FROM review_sessions WHERE user_id = ? AND status = 'open' AND local_date = ?").get(userId, lt.date) as { id: string } | undefined;
    const recommendation =
      reviewable > 0
        ? { kind: "review" as const, nodeId: null, text: reviewable === 1 ? "1 topic is ready for a quick review." : `${reviewable} topics are ready for a quick review.` }
        : next
          ? { kind: "lesson" as const, nodeId: next, text: "Nothing to review right now. Continue your learning path." }
          : { kind: "practice" as const, nodeId: null, text: "Nothing to review right now. Try the practice lab for extra questions." };
    return {
      today: lt.date,
      timezone: lt.tz,
      rules: { proficient: this.mastery.rules.proficient, mastered: this.mastery.rules.mastered, intervalsDays: this.mastery.rules.intervalsDays, rulesVersion: this.mastery.rules.rulesVersion },
      openSessionId: open?.id ?? null,
      dueCount: reviewable,
      waiting: cards.filter((c) => c.due && !c.reviewable).length,
      groups: {
        ready,
        learning: notDue.filter((c) => c.state === "learning" || c.state === "practising").sort(byTitle),
        approaching: notDue.filter((c) => c.state === "proficient").sort(byTitle),
        mastered: notDue.filter((c) => c.state === "mastered").sort(byTitle),
      },
      weak,
      upcoming: notDue
        .filter((c) => c.nextDueDate && !c.due)
        .sort((a, b) => a.nextDueDate!.localeCompare(b.nextDueDate!))
        .slice(0, 5)
        .map((c) => ({ conceptId: c.conceptId, title: c.title, dueDate: c.nextDueDate })),
      history: this.review.history(userId),
      recommendation,
    };
  }

  conceptDetail(userId: string, conceptId: string) {
    if (!this.course.ix.concepts.has(conceptId)) return null;
    const lt = this.time(userId);
    const completed = this.completed(userId);
    return { ...this.conceptCard(conceptId, this.mastery.get(userId, conceptId, lt.date), lt.date, completed), trail: this.mastery.trail(userId, conceptId) };
  }
}
