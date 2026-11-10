import { Link } from "react-router";
import type { AchievementEntry, ConceptCard, EngagementSnapshot, LessonRewards } from "../api/client";
import { STATE_LABEL, friendlyDate, plural } from "../lib/progression";
import { Icon } from "./Icon";

/** Progress to the next XP milestone. The text says what it is; the bar is decoration for those who can see it. */
export function MilestoneBar({ total, milestone }: { total: number; milestone: EngagementSnapshot["xp"]["milestone"] }) {
  const span = milestone.next === null ? 1 : milestone.next - milestone.previous;
  const done = milestone.next === null ? 1 : total - milestone.previous;
  return (
    <div className="milestone">
      <div className="progress" role="progressbar" aria-label="XP towards your next milestone" aria-valuemin={0} aria-valuemax={span} aria-valuenow={done} aria-valuetext={milestone.next === null ? "Every milestone reached" : `${total} of ${milestone.next} XP`}>
        <span style={{ width: `${milestone.percent}%` }} />
      </div>
      <p className="muted small">{milestone.next === null ? "Every XP milestone reached. Thank you for practising!" : `${milestone.toNext} XP to your next milestone (${milestone.next}).`}</p>
    </div>
  );
}

export function GoalRing({ done, target }: { done: number; target: number }) {
  const pct = Math.min(1, done / Math.max(1, target));
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className="goal-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--good)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 20 20)" />
      {pct >= 1 && <path d="m13 20.500 4.500 4.500L27 15" fill="none" stroke="var(--good)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** The small, calm strip at the top of the path: XP, optional daily goal and streak. No numbers beyond these. */
export function StatusStrip({ e }: { e: EngagementSnapshot }) {
  return (
    <section className="status-strip" aria-label="Your rewards">
      <Link to="/progress" className="chip chip-xp">
        <Icon name="bolt" size={20} />
        <span><strong>{e.xp.total}</strong> XP<span className="visually-hidden">. See your progress</span></span>
      </Link>
      {e.goal.enabled && (
        <Link to="/settings" className={`chip chip-goal${e.goal.met ? " is-met" : ""}`}>
          <GoalRing done={e.goal.doneToday} target={e.goal.target} />
          <span>
            <strong>{e.goal.met ? "Goal reached" : "Daily goal"}</strong>
            <small>{e.goal.doneToday} of {plural(e.goal.target, "session")} today</small>
          </span>
        </Link>
      )}
      {e.streak && e.streak.current > 0 && (
        <span className="chip chip-streak">
          <Icon name="flame" size={20} />
          <span><strong>{e.streak.current}</strong> {e.streak.current === 1 ? "day" : "days"}</span>
        </span>
      )}
    </section>
  );
}

/** A friendly return message after a break. Never guilt. */
export function WelcomeBack({ e }: { e: EngagementSnapshot }) {
  if (!e.streak || e.streak.status !== "returning") return null;
  return (
    <p className="welcome-back" role="note">
      <Icon name="sparkle" size={20} /> <span>{e.streak.message}</span>
    </p>
  );
}

export function ReviewNudge({ e }: { e: EngagementSnapshot }) {
  const inProgress = e.review.openSessionId !== null;
  if (e.review.dueCount === 0 && !inProgress) return null;
  return (
    <section className="review-nudge" aria-labelledby="nudge-h">
      <Icon name="repeat" size={28} />
      <div>
        <h2 id="nudge-h" className="h3">{inProgress ? "A review is in progress" : `${plural(e.review.dueCount, "topic")} ready to review`}</h2>
        <p className="muted">{inProgress ? "Pick up where you left off. Your answers so far are saved." : "A few quick questions keep what you've learned fresh."}</p>
      </div>
      <Link className="btn btn-primary" to="/review">Review</Link>
    </section>
  );
}

export function Badge({ a }: { a: Pick<AchievementEntry, "title" | "description" | "earned" | "available" | "have" | "need" | "grade"> }) {
  return (
    <li className={`badge-card${a.earned ? " is-earned" : ""}`} data-grade={a.grade}>
      <span className="badge-medal" aria-hidden="true"><Icon name={a.earned ? "medal" : "lock"} size={26} /></span>
      <div>
        <h3 className="h4">{a.title}</h3>
        {a.description && <p className="muted small">{a.description}</p>}
        <p className="small badge-status">
          {a.earned ? "Earned" : a.available ? `Not yet earned${a.need > 1 ? ` · ${a.have} of ${a.need}` : ""}` : "Not available yet: its lessons are still being written"}
        </p>
      </div>
    </li>
  );
}

export function RecentBadges({ e }: { e: EngagementSnapshot }) {
  if (e.achievements.recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-badges-h" className="card">
      <h2 id="recent-badges-h" className="h3">Recent badges</h2>
      <ul className="plain badge-list">{e.achievements.recent.map((a) => <Badge key={a.id} a={a} />)}</ul>
      <Link to="/progress#badges">All badges</Link>
    </section>
  );
}

export function StatePill({ state }: { state: ConceptCard["state"] }) {
  return <span className={`pill state-${state}`}>{STATE_LABEL[state]}</span>;
}

/** One concept: where it stands and, on request, exactly why (the evidence rule in plain words). */
export function ConceptRow({ c, today }: { c: ConceptCard; today: string }) {
  return (
    <li className="concept-row">
      <div className="concept-head">
        <strong>{c.title}</strong>
        <StatePill state={c.state} />
      </div>
      <p className="muted small">
        {c.independentCorrect === 0 ? "No first-try answers yet" : `${plural(c.independentCorrect, "first-try answer")}`}
        {c.nextDueDate && ` · ${c.due ? (c.reviewable ? "review ready" : "review waits for its lesson") : `next review ${friendlyDate(c.nextDueDate, today)}`}`}
        {c.limited && " · more questions coming"}
        {c.state === "practising" && (c.highestState === "mastered" || c.highestState === "proficient") && ` · was ${c.highestState} before a slip`}
      </p>
      <details>
        <summary>Why is it {STATE_LABEL[c.state].toLowerCase()}?</summary>
        <p>{c.headline}</p>
        {c.met.length > 0 && <ul className="checklist">{c.met.map((m) => <li key={m}><Icon name="check" size={18} strokeWidth={3} /><span>{m}</span></li>)}</ul>}
        {c.missing.length > 0 && (
          <>
            <p className="small"><strong>Still needed:</strong></p>
            <ul>{c.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        )}
        {c.mistakes.length > 0 && (
          <>
            <p className="small"><strong>Slips to watch:</strong></p>
            <ul>{c.mistakes.map((m) => <li key={m.id}>{m.label} <span className="muted">{m.tip}</span></li>)}</ul>
          </>
        )}
        <p className="muted small">Practice-lab questions help you learn but don't count here, because they allow hints.</p>
      </details>
    </li>
  );
}

export function XpAward({ awarded, reason }: { awarded: number; reason: string }) {
  return (
    <div className="reward-xp" role="status">
      <span className={`xp-pop${awarded === 0 ? " is-none" : ""}`}><Icon name="bolt" size={26} /><span>{awarded > 0 ? `+${awarded} XP` : "No new XP right now"}</span></span>
      <p>{reason}</p>
    </div>
  );
}

export function GoalLine({ goal }: { goal: EngagementSnapshot["goal"] }) {
  if (!goal.enabled) return null;
  return <p className="goal-line"><GoalRing done={goal.doneToday} target={goal.target} /> <span>{goal.met ? "Daily goal reached." : `${goal.doneToday} of ${plural(goal.target, "session")} today.`}</span></p>;
}

export function NewBadges({ badges }: { badges: Array<{ id: string; title: string; description: string }> }) {
  if (badges.length === 0) return null;
  return (
    <ul className="plain badge-list" aria-label="New badges">
      {badges.map((a) => <Badge key={a.id} a={{ ...a, earned: true, available: true, have: 1, need: 1, grade: Number(a.id.slice(1, 2)) || 1 }} />)}
    </ul>
  );
}

/** What finishing a lesson earned: XP and why, the milestone, the daily goal, new badges and the concepts it counts towards. */
export function RewardPanel({ rewards }: { rewards: LessonRewards }) {
  return (
    <section className="reward" aria-labelledby="reward-h">
      <h2 id="reward-h" className="h3">What you earned</h2>
      {rewards.xp && <XpAward awarded={rewards.xp.awarded} reason={rewards.xp.reason} />}
      <MilestoneBar total={rewards.total} milestone={rewards.milestone} />
      <GoalLine goal={rewards.goal} />
      <NewBadges badges={rewards.newAchievements} />
      {rewards.concepts.length > 0 && (
        <details className="evidence">
          <summary>What this counts towards</summary>
          <p className="muted small">XP rewards effort. Understanding is tracked separately, from your first-try answers without hints.</p>
          <ul className="plain">{rewards.concepts.map((c) => <ConceptRow key={c.conceptId} c={c} today={rewards.today} />)}</ul>
        </details>
      )}
    </section>
  );
}
