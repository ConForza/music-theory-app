import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiFailure } from "../api/client";
import { Icon } from "../components/Icon";
import { ErrorState, Loading } from "../components/Shell";
import { useApp } from "../state/app";
import { GradeCards } from "./GradeCards";
import { RegisterForm } from "./AccountForm";

type Step = "experience" | "grade" | "account";
type Experience = "new" | "some";

/** Welcome → how much theory do you know → (grade) → save your progress. Three short steps, always one tap forward. */
export function Onboarding() {
  const { me, course, updateProfile, setMe, reloadAll } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("experience");
  const [experience, setExperience] = useState<Experience | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (course.status === "loading") return <Loading />;
  if (course.status === "error") return <ErrorState error={course.error} onRetry={reloadAll} />;

  async function finish(exp: Experience, g: number) {
    await updateProfile({ experience: exp, selectedGrade: g, onboarded: true });
    nav("/learn", { replace: true });
  }

  async function chooseGrade(g: number) {
    setGrade(g);
    if (me) {
      setBusy(true);
      try {
        await finish(experience ?? "some", g);
      } catch (e) {
        setError(e instanceof ApiFailure ? e.message : "Couldn't save that. Please try again.");
        setBusy(false);
      }
    } else setStep("account");
  }

  async function asGuest() {
    setBusy(true);
    setError(null);
    try {
      setMe(await api.guest());
      await finish(experience!, grade!);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't start. Please try again.");
      setBusy(false);
    }
  }

  const stepNo = step === "experience" ? 1 : step === "grade" ? 2 : experience === "new" ? 2 : 3;
  const stepTotal = experience === "new" ? 2 : 3;

  return (
    <main className="onboarding" id="main" tabIndex={-1}>
      <header className="onboarding-head">
        {step !== "experience" ? (
          <button className="icon-btn" aria-label="Back" onClick={() => setStep(step === "account" && experience === "some" ? "grade" : "experience")}>
            <Icon name="back" />
          </button>
        ) : (
          <Link className="icon-btn" aria-label="Back to welcome" to="/welcome"><Icon name="back" /></Link>
        )}
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={stepTotal} aria-valuenow={stepNo} aria-label={`Step ${stepNo} of ${stepTotal}`}>
          <span style={{ width: `${(stepNo / stepTotal) * 100}%` }} />
        </div>
      </header>

      {step === "experience" && (
        <section aria-labelledby="q1">
          <h1 id="q1">How much music theory do you know?</h1>
          <div className="choice-cards">
            <button className="choice-card" onClick={() => { setExperience("new"); setGrade(1); if (me) void finish("new", 1); else setStep("account"); }}>
              <strong>New to music theory</strong>
              <span>Start at Grade 1 and learn the musical alphabet before the tricky parts.</span>
            </button>
            <button className="choice-card" onClick={() => { setExperience("some"); setStep("grade"); }}>
              <strong>I already know some theory</strong>
              <span>Choose the grade that suits you. You can change it any time.</span>
            </button>
          </div>
          <p className="fine-print">The five grades are learning milestones, not official certificates.</p>
        </section>
      )}

      {step === "grade" && (
        <section aria-labelledby="q2">
          <h1 id="q2">Where would you like to begin?</h1>
          <p className="lede-small">Each grade is its own world. Grade 1 is the gentle start; later grades build on it. A placement check is planned for a later release.</p>
          <GradeCards course={course.data} selected={grade} onPick={chooseGrade} />
          {error && <p className="form-error" role="alert">{error}</p>}
          {busy && <Loading label="Saving…" />}
        </section>
      )}

      {step === "account" && (
        <section aria-labelledby="q3">
          <h1 id="q3">Save your progress</h1>
          <p className="lede-small">Create a free account so your lessons are kept safe and follow you from phone to tablet to laptop.</p>
          <RegisterForm onDone={() => finish(experience!, grade!)} />
          <div className="or"><span>or</span></div>
          <button className="btn btn-quiet btn-large" onClick={asGuest} disabled={busy}>Try it as a guest</button>
          <p className="fine-print">Guest progress stays with this browser. You can turn it into an account from your profile at any time and keep everything you've done. <Link to="/signin">Sign in instead</Link></p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}
    </main>
  );
}
