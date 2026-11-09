import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiFailure } from "../api/client";
import { useApp } from "../state/app";

/** Signs out for real: stays signed in, with a visible error and retry, if the server could not be reached. */
export function SignOutButton() {
  const { signOut } = useApp();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      nav("/welcome", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiFailure && e.isNetwork
          ? "You're offline, so we couldn't sign you out. You are still signed in on this device."
          : "We couldn't sign you out. You are still signed in on this device.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="signout">
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-quiet" onClick={() => void go()} disabled={busy}>
        {error ? "Try signing out again" : "Sign out"}
      </button>
    </div>
  );
}
