import { useRef, useState, type FormEvent } from "react";
import { api, ApiFailure, type Me } from "../api/client";
import { isUncertain, saveFailure } from "../lib/errors";
import { useApp } from "../state/app";

type SessionAtDoubt = "none" | "guest" | "unknown";

/**
 * Create an account. A guest is upgraded in place by the server, so progress is kept.
 *
 * Creating the account and finishing setup (`onDone`) are separate steps with separate outcomes. Once the account exists
 * the form never registers again: a failed setup is retried on its own. If the reply to the registration is lost, the
 * form asks the server who is signed in before saying anything, and a repeat is safe because the server answers a retry
 * from the same session with the same account.
 */
export function RegisterForm({ onDone, submitLabel = "Create account" }: { onDone: () => void | Promise<void>; submitLabel?: string }) {
  const { setMe } = useApp();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const inFlight = useRef(false);
  const doubt = useRef<SessionAtDoubt | null>(null);

  /** After a reply we could not read: is the learner now signed in to the account we just asked for? */
  async function sessionAfterDoubt(): Promise<Me | null> {
    try {
      const m = await api.me();
      doubt.current = m.user.isGuest ? "guest" : "unknown";
      return !m.user.isGuest && m.user.email === email.trim().toLowerCase() ? m : null;
    } catch (e) {
      doubt.current = e instanceof ApiFailure && e.status === 401 ? "none" : "unknown";
      return null;
    }
  }

  async function createAccount(): Promise<Me> {
    try {
      return await api.register({ displayName, email, password });
    } catch (err) {
      if (isUncertain(err)) {
        const found = await sessionAfterDoubt();
        if (found) return found;
        throw new ApiFailure(0, "uncertain", "We couldn't confirm whether your account was created. It's safe to try again: we check first and never create a duplicate.");
      }
      // The earlier reply was lost with no session to show for it, so the account may already be this person's.
      // Signing in with the very same details settles it; a guest's session is never swapped this way.
      if (err instanceof ApiFailure && err.code === "email_taken" && doubt.current !== null) {
        // An earlier reply was lost. If the session check that followed also failed, ask again now that we can reach
        // the server, so a transient failure there cannot strand the learner. Only a confirmed no-session state may
        // sign in with the typed details; a guest's session is never swapped.
        const found = await sessionAfterDoubt();
        if (found) return found;
        if (doubt.current === "none") {
          try {
            return await api.login({ email, password });
          } catch {
            /* not theirs: fall through to the plain "already registered" message */
          }
        }
      }
      throw err;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!created) {
        try {
          setMe(await createAccount());
          setCreated(true);
        } catch (err) {
          setError(err instanceof ApiFailure ? err.message : "Something went wrong. Please try again.");
          return;
        }
      }
      try {
        await onDone();
      } catch (err) {
        setError(`Your account is created and you're signed in. ${saveFailure(err, "your setup")}`);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <label>
        Nickname
        <input value={displayName} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={30} required readOnly={created} aria-describedby="nick-help" />
        <small id="nick-help">Only you see this. Please don't use your full name.</small>
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required readOnly={created} />
        <small>Used only to sign you in. We never show it to anyone.</small>
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required readOnly={created} aria-describedby="pw-help" />
        <small id="pw-help">At least 8 characters.</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-large" disabled={busy}>{busy ? "Saving…" : created ? "Try again" : submitLabel}</button>
    </form>
  );
}
