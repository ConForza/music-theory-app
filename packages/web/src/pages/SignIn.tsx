import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiFailure } from "../api/client";
import { Logo } from "../components/Icon";
import { useApp } from "../state/app";

export function SignIn() {
  const { setMe } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api.login({ email, password }));
      nav("/learn", { replace: true });
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="onboarding" id="main" tabIndex={-1}>
      <div className="auth-head"><Logo size={56} /><h1>Welcome back</h1></div>
      {/* Password managers (Apple Passwords, browser and third-party managers): a real form with stable names and ids, the email marked as
          the account's username, and current-password, so saved details are offered with AutoFill (and the device's Face ID or Touch ID).
          method="post": if the form were ever submitted natively, the password must never end up in the address. */}
      <form className="form" id="signin-form" name="signin" method="post" action="/signin" onSubmit={submit} noValidate>
        <label>Email<input id="signin-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
        <label>Password<input id="signin-password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-large" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="fine-print">New here? <Link to="/onboarding">Get started</Link></p>
    </main>
  );
}
