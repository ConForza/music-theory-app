import { useRef, useState, type FormEvent } from "react";
import { ApiFailure, authExclusive, rawAuth, type Me } from "../api/client";
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
  const { setMe, me } = useApp();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const inFlight = useRef(false);
  const doubt = useRef<SessionAtDoubt | null>(null);
  const startedAsGuest = useRef(false);

  /** After a reply we could not read: is the learner now signed in to the account we just asked for? */
  async function sessionAfterDoubt(): Promise<Me | null> {
    try {
      const m = await rawAuth.me();
      doubt.current = m.user.isGuest ? "guest" : "unknown";
      return !m.user.isGuest && m.user.email === email.trim().toLowerCase() ? m : null;
    } catch (e) {
      doubt.current = e instanceof ApiFailure && e.status === 401 ? "none" : "unknown";
      return null;
    }
  }

  /**
   * The registration and, if its reply is lost, the check and recovery sign-in that follow, all inside ONE exclusive section (see
   * authExclusive): no sign-out or other sign-in on this browser, in this tab or another, can run between the check and the recovery, or
   * have its cookie overwritten by a slower reply from here.
   */
  function createAccount(): Promise<Me> {
    return authExclusive(createAccountExclusive);
  }

  async function createAccountExclusive(): Promise<Me> {
    try {
      return await rawAuth.register({ displayName, email, password });
    } catch (err) {
      if (isUncertain(err)) {
        const found = await sessionAfterDoubt();
        if (found) return found;
        // Upgrading a guest replaces the guest's session (the server rotates it on the change of privilege). If that reply was lost the
        // guest cookie no longer works, so finding NO session now means the upgrade went through: sign in with the details just typed.
        // A guest whose session still works ("guest") is never swapped, and a failed sign-in falls through to the honest message.
        if (startedAsGuest.current && doubt.current === "none") {
          try {
            // Conditional on the server: refused if a different learner signed in on this device after the check above.
            return await rawAuth.login({ email, password, onlyIfSignedOut: true });
          } catch {
            /* not confirmed: say so below */
          }
        }
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
            return await rawAuth.login({ email, password, onlyIfSignedOut: true });
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
    if (!created && doubt.current === null) startedAsGuest.current = me?.user.isGuest === true;
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
    // Password managers: the email is the account's username and the password is a new one, so Safari offers a strong generated password
    // (within the server's rules, `passwordrules`) and Apple Passwords saves both for the next sign-in.
    <form className="form" id="register-form" name="register" method="post" action="/register" onSubmit={submit} noValidate>
      <label>
        Nickname
        <input id="register-nickname" name="nickname" value={displayName} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={30} required readOnly={created} aria-describedby="nick-help" />
        <small id="nick-help">Only you see this. Please don't use your full name.</small>
      </label>
      <label>
        Email
        <input id="register-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required readOnly={created} />
        <small>Used only to sign you in. We never show it to anyone.</small>
      </label>
      <label>
        Password
        <input id="register-password" name="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" passwordrules="minlength: 8; maxlength: 128;" minLength={8} maxLength={128} required readOnly={created} aria-describedby="pw-help" />
        <small id="pw-help">At least 8 characters. Your phone or browser can suggest a strong one and remember it for you.</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-large" disabled={busy}>{busy ? "Saving…" : created ? "Try again" : submitLabel}</button>
    </form>
  );
}
