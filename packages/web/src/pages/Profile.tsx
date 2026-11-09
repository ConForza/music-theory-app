import { Link } from "react-router";
import { Icon } from "../components/Icon";
import { useApp, useCourseData } from "../state/app";
import { RegisterForm } from "./AccountForm";

export function Profile() {
  const { me, signOut, refreshProgress } = useApp();
  const data = useCourseData();
  const { user, profile } = me!;
  const world = data.status === "ready" ? data.course.worlds[profile.selectedGrade - 1] : undefined;
  const t = data.status === "ready" ? data.progress.totals : undefined;
  return (
    <div className="page" data-grade={profile.selectedGrade}>
      <header className="profile-head">
        <span className="avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <h1>{user.displayName}</h1>
          <p className="muted">{user.isGuest ? "Guest profile" : user.email}</p>
        </div>
      </header>

      {user.isGuest && (
        <section className="card callout" aria-labelledby="save-h">
          <h2 id="save-h"><Icon name="info" size={22} /> Keep your progress safe</h2>
          <p>You're using a guest profile, which lives in this browser. Create an account and everything you've done so far comes with you, on any device.</p>
          <RegisterForm submitLabel="Create my account" onDone={refreshProgress} />
        </section>
      )}

      <section className="card" aria-labelledby="learning-h">
        <h2 id="learning-h">Your learning</h2>
        <dl className="stats">
          <div><dt>Current grade</dt><dd>{world ? `Grade ${world.grade}: ${world.learnerTitle}` : `Grade ${profile.selectedGrade}`}</dd></div>
          <div><dt>Lessons completed</dt><dd>{t?.lessonsCompleted ?? "–"}</dd></div>
          <div><dt>Questions answered</dt><dd>{t?.questionsAnswered ?? "–"}</dd></div>
          <div><dt>Right first time</dt><dd>{t?.firstTryCorrect ?? "–"}</dd></div>
        </dl>
        <div className="row">
          <Link className="btn btn-ghost" to="/grades">Change grade</Link>
          <Link className="btn btn-ghost" to="/progress">See progress</Link>
        </div>
      </section>

      <section className="card" aria-labelledby="privacy-h">
        <h2 id="privacy-h">Your data</h2>
        <p>We keep only a nickname, your sign-in details and your lesson answers. There are no public profiles, leaderboards or adverts, and you can download or delete everything in Settings.</p>
      </section>

      <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
