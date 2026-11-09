import { Link } from "react-router";
import { Logo } from "../components/Icon";
import { useApp } from "../state/app";

export function Welcome() {
  const { me } = useApp();
  return (
    <main className="welcome" id="main" tabIndex={-1}>
      <div className="welcome-hero">
        <Logo size={72} />
        <h1>Learn music theory, one short lesson at a time.</h1>
        <p className="lede">Five grades take you from your very first notes to Grade 5. Try things on a stave and a keyboard, get helpful feedback straight away, and pick up exactly where you stopped.</p>
        <div className="welcome-actions">
          {me ? (
            <Link className="btn btn-primary btn-large" to="/learn">Continue learning</Link>
          ) : (
            <>
              <Link className="btn btn-primary btn-large" to="/onboarding">Get started</Link>
              <Link className="btn btn-quiet btn-large" to="/signin">I already have an account</Link>
            </>
          )}
        </div>
      </div>
      <ul className="welcome-points">
        <li><strong>Short and friendly</strong><span>Lessons take about five minutes. No lives, no pressure.</span></li>
        <li><strong>See it and hear it</strong><span>Notation and a playable keyboard, with sound whenever you want it.</span></li>
        <li><strong>Learn at your level</strong><span>Brand new? Begin at Grade 1. Know some theory? Pick your grade.</span></li>
      </ul>
      <p className="fine-print">The five grades are learning milestones, not official certificates. Music Theory Path is independent and is not affiliated with or endorsed by ABRSM.</p>
    </main>
  );
}
