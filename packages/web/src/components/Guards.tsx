import { Navigate, Outlet, useLocation } from "react-router";
import { useApp } from "../state/app";
import { ErrorState, Loading } from "./Shell";

/** Signed-in learners only. A guest counts as signed in. */
export function RequireAuth() {
  const { me, meError, reloadAll } = useApp();
  const loc = useLocation();
  if (me === undefined) return <Loading label="Opening your lessons…" />;
  if (meError) return <ErrorState error={meError} onRetry={reloadAll} title="We couldn't reach Music Theory Path" />;
  if (!me) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  if (!me.profile.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Pages for people who are not signed in yet. */
export function PublicOnly() {
  const { me } = useApp();
  const loc = useLocation();
  if (me === undefined) return <Loading />;
  // Onboarding can finish somewhere other than the path: "find my level" goes to the placement check. Only that one address is honoured.
  const next = (loc.state as { next?: string } | null)?.next === "/placement" ? "/placement" : "/learn";
  if (me?.profile.onboarded) return <Navigate to={next} replace />;
  return <Outlet />;
}
