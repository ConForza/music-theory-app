import { useState } from "react";
import { Link } from "react-router";
import type { Me } from "../api/client";
import { dismissInstallHint, installHintDismissed, promptInstall, useInstallMode, type InstallMode } from "../lib/install";
import { Icon, Logo } from "./Icon";

/** Guest progress lives in this browser's sign-in only: an installed app starts with its own, empty sign-in. */
function GuestNote({ me }: { me: Me | null | undefined }) {
  if (!me?.user.isGuest) return null;
  return (
    <p className="install-guest">
      <strong>You're learning as a guest.</strong> The app on your Home Screen keeps its own sign-in, so it can't see guest progress from
      this browser. <Link to="/profile">Create a free account</Link> first, then sign in once in the app and everything comes with you.
    </p>
  );
}

function IosSteps() {
  return (
    <ol className="install-steps">
      <li>In Safari, tap the <strong>Share</strong> button <ShareGlyph /> (on newer iPhones it may be inside the <strong>•••</strong> menu).</li>
      <li>Choose <strong>Add to Home Screen</strong>. You may need to scroll down or tap <strong>View More</strong>.</li>
      <li>Tap <strong>Add</strong>, then open <strong>Theory Path</strong> from your Home Screen.</li>
      <li>Sign in once inside the app. Passwords can fill in your details, and you'll stay signed in after that.</li>
    </ol>
  );
}

function ShareGlyph() {
  return (
    <svg className="share-glyph" width="18" height="18" viewBox="0 0 24 24" aria-label="(a square with an arrow pointing up)" role="img">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A small, dismissible suggestion on the Learn page. Shown only where installing is possible (iPhone/iPad, or a browser offering its
 * install prompt), never in the installed app, and never again once dismissed on this device. It is a suggestion: the course works
 * the same in the browser.
 */
export function InstallHint({ me }: { me: Me | null | undefined }) {
  const mode = useInstallMode();
  const [hidden, setHidden] = useState(installHintDismissed);
  const [open, setOpen] = useState(false);
  if (hidden || (mode !== "ios" && mode !== "prompt")) return null;
  const dismiss = () => {
    dismissInstallHint();
    setHidden(true);
  };
  return (
    <aside className="card install-hint" aria-labelledby="install-hint-h">
      <div className="install-hint-row">
        <Logo size={44} />
        <div>
          <h2 id="install-hint-h" className="h3">Put Music Theory Path on your {mode === "ios" ? "Home Screen" : "device"}</h2>
          <p className="muted small">Open it like an app, full screen, and pick up where you left off.</p>
        </div>
      </div>
      {open && mode === "ios" && <IosSteps />}
      {open && <GuestNote me={me} />}
      <div className="row">
        {mode === "prompt" ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => { setOpen(true); void promptInstall().then((ok) => ok && dismiss()); }}>Install the app</button>
        ) : (
          !open && <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(true)}>Show me how</button>
        )}
        <button type="button" className="btn btn-quiet btn-small" onClick={dismiss}>{open ? "Done" : "Not now"}</button>
      </div>
      {!open && <p className="muted small install-later">You can find this again in Settings.</p>}
    </aside>
  );
}

/** The full explanation, always available in Settings. */
export function InstallGuide({ me }: { me: Me | null | undefined }) {
  const mode: InstallMode = useInstallMode();
  return (
    <section className="card install-guide" aria-labelledby="install-h">
      <h2 id="install-h">Install the app</h2>
      {mode === "installed" ? (
        <p><Icon name="check" size={18} /> You're using the installed app. You'll stay signed in between visits; sign out below if you share this device.</p>
      ) : (
        <>
          <p className="muted small">Add Music Theory Path to your Home Screen or desktop to open it like an app. Lessons still need an internet connection.</p>
          {mode === "ios" && <IosSteps />}
          {mode === "prompt" && (
            <p><button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>Install the app</button></p>
          )}
          {mode === "manual" && (
            <ul className="install-steps">
              <li><strong>Android (Chrome):</strong> open the browser menu <strong>⋮</strong> and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
              <li><strong>Computer (Chrome or Edge):</strong> use the install icon in the address bar, or the menu's <strong>Install Music Theory Path</strong>.</li>
              <li><strong>Mac (Safari):</strong> choose <strong>File › Add to Dock</strong>.</li>
              <li><strong>iPhone or iPad:</strong> open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
            </ul>
          )}
          <p className="muted small">The installed app keeps its own sign-in, separate from this browser, so you'll sign in once more inside it.</p>
          <GuestNote me={me} />
        </>
      )}
    </section>
  );
}
