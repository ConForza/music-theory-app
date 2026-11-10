import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useApp } from "../state/app";
import { ApiFailure } from "../api/client";
import { Icon, Logo, type IconName } from "./Icon";

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: "/learn", label: "Learn", icon: "path" },
  { to: "/practice", label: "Practice", icon: "sparkle" },
  { to: "/progress", label: "Progress", icon: "chart" },
  { to: "/profile", label: "Profile", icon: "user" },
  { to: "/settings", label: "Settings", icon: "gear" },
];

/** Main app frame: side rail on large screens, bottom tabs on phones. The lesson player lives outside it. */
export function Shell() {
  const { refreshProgress } = useApp();
  const { pathname } = useLocation();
  // Progress changes inside the lesson player, so re-read it whenever a main page is shown.
  useEffect(() => {
    void refreshProgress();
  }, [pathname, refreshProgress]);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="tabs" aria-label="Main">
        <NavLink to="/learn" className="tabs-brand" aria-label="Music Theory Path home">
          <Logo size={36} />
          <span>Music Theory Path</span>
        </NavLink>
        <ul>
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} className={({ isActive }) => (isActive ? "tab is-active" : "tab")}>
                <Icon name={t.icon} size={26} />
                <span>{t.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "We couldn't load that" }: { error: ApiFailure | Error; onRetry?: () => void; title?: string }) {
  return (
    <div className="state state-error" role="alert">
      <Icon name="warn" size={36} />
      <h2>{title}</h2>
      <p>{error.message}</p>
      <div className="row">
        {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>}
        <Link className="btn btn-quiet" to="/learn">Back to the path</Link>
      </div>
    </div>
  );
}

export function NotFoundView({ what = "page" }: { what?: string }) {
  return (
    <div className="state" role="alert">
      <Icon name="info" size={36} />
      <h1>We can't find that {what}</h1>
      <p>The link may be old or mistyped. Your progress is safe.</p>
      <Link className="btn btn-primary" to="/learn">Go to my learning path</Link>
    </div>
  );
}
