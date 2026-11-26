import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiFailure, previewStatus } from "../api/client";
import { useApp } from "../state/app";

/**
 * Signs out for real: stays signed in, with a visible error and retry, if the server could not be reached.
 *
 * Private preview (review of the PWA PR): if the preview gate blocks the request, the learner is NOT signed out. The app goes to the
 * preview sign-in page and comes back here with `?pending=signout`, where the unfinished sign-out is shown again. With `offerLeavePreview`,
 * a tester on a shared device can also end the device's preview access in the same step.
 */
export function SignOutButton({ offerLeavePreview = false }: { offerLeavePreview?: boolean }) {
  const { signOut } = useApp();
  const nav = useNavigate();
  const { search } = useLocation();
  const pending = new URLSearchParams(search).get("pending") === "signout";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!offerLeavePreview) return;
    let live = true;
    void previewStatus().then((s) => live && setPreview(s.preview && s.signedIn));
    return () => {
      live = false;
    };
  }, [offerLeavePreview]);

  async function go(leavePreview: boolean) {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      if (leavePreview) {
        // The gate ends this device's preview session and shows its sign-in page. The form lives outside React: signing out may already
        // be taking this page away.
        const form = Object.assign(document.createElement("form"), { method: "post", action: "/preview/signout" });
        form.hidden = true;
        document.body.appendChild(form);
        form.submit();
        return;
      }
      nav("/welcome", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiFailure && e.code === "preview_required"
          ? "This device's preview access has ended, so you are still signed in. Sign in to the preview again, then finish signing out."
          : e instanceof ApiFailure && e.isNetwork
            ? "You're offline, so we couldn't sign you out. You are still signed in on this device."
            : "We couldn't sign you out. You are still signed in on this device.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="signout">
      {pending && !error && (
        <p className="callout card" role="alert">
          <strong>You haven't been signed out yet.</strong> Your preview access was renewed; tap below to finish signing out.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className={pending ? "btn btn-primary" : "btn btn-quiet"} onClick={() => void go(false)} disabled={busy}>
        {pending ? "Finish signing out" : error ? "Try signing out again" : "Sign out"}
      </button>
      {preview && (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => void go(true)} disabled={busy}>
            Sign out and leave the preview on this device
          </button>
          <p className="muted small">Use this on a shared device: the next person will need their own tester name and password.</p>
        </>
      )}
    </div>
  );
}
