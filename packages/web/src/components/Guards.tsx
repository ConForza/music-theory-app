import { Navigate, Outlet, useLocation } from "react-router";
import { useApp } from "../state/app";
import { ConnectionProblem, Loading } from "./Shell";

/** Signed-in learners only. A guest counts as signed in. */
export function RequireAuth() {
  const { me, meError, reloadAll } = useApp();
  const loc = useLocation();
  if (me === undefined) return <Loading label="Opening your lessons…" />;
  if (meError) return <ConnectionProblem error={meError} onRetry={reloadAll} />;
  if (!me) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  if (!me.profile.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Pages for people who are not signed in yet. */
export function PublicOnly() {
  const { me, meError, reloadAll } = useApp();
  const loc = useLocation();
  if (me === undefined) return <Loading />;
  // We could not ask the server who is signed in: don't offer sign-in or a fresh start to someone who may already be signed in.
  if (meError) return <ConnectionProblem error={meError} onRetry={reloadAll} />;
  // Onboarding can finish somewhere other than the path: "find my level" goes to the placement check. Only that one address is honoured.
  const next = (loc.state as { next?: string } | null)?.next === "/placement" ? "/placement" : "/learn";
  if (me?.profile.onboarded) return <Navigate to={next} replace />;
  return <Outlet />;
}
