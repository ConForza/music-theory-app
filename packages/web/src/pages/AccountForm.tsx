import { useState, type FormEvent } from "react";
import { api, ApiFailure } from "../api/client";
import { useApp } from "../state/app";

/** Create an account. A guest is upgraded in place by the server, so progress is kept. */
export function RegisterForm({ onDone, submitLabel = "Create account" }: { onDone: () => void | Promise<void>; submitLabel?: string }) {
  const { setMe } = useApp();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api.register({ displayName, email, password }));
      await onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <label>
        Nickname
        <input value={displayName} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={30} required aria-describedby="nick-help" />
        <small id="nick-help">Only you see this. Please don't use your full name.</small>
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        <small>Used only to sign you in. We never show it to anyone.</small>
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required aria-describedby="pw-help" />
        <small id="pw-help">At least 8 characters.</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-large" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}
