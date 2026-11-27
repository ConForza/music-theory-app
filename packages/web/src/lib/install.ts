/**
 * Installing Music Theory Path as an app (PWA brief, "Installation guidance").
 *
 *  - iPhone/iPad: there is no install API; the learner uses Share > Add to Home Screen, so we can only explain the steps.
 *  - Android and desktop Chromium: the browser fires `beforeinstallprompt`; we keep it and offer an Install button that shows the
 *    browser's own dialog. The event can fire before React mounts, so it is captured from main.tsx.
 *  - Already installed (standalone display mode): nothing is shown.
 *
 * Only a "dismissed" timestamp is remembered, in localStorage (a per-device display preference, never anything about the account).
 */
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at start-up. */
export function captureInstallPrompt(win: Window = window) {
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we offer it ourselves, quietly, instead of the browser's mini-infobar
    deferred = e as InstallPromptEvent;
    notify();
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Running as an installed app (Home Screen / app window), not in a browser tab. */
export function isStandalone(win: Window = window): boolean {
  try {
    if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return ["standalone", "fullscreen", "minimal-ui"].some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches);
  } catch {
    return false;
  }
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(nav: Navigator = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export type InstallMode = "installed" | "ios" | "prompt" | "manual";

export function installMode(win: Window = window): InstallMode {
  if (installed || isStandalone(win)) return "installed";
  if (isIos(win.navigator)) return "ios";
  if (deferred) return "prompt";
  return "manual";
}

/** Show the browser's install dialog (Android/desktop). Resolves true if the learner accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

/** The current install mode, kept up to date as the browser's prompt becomes available or the app is installed. */
export function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(() => installMode());
  useEffect(() => {
    const update = () => setMode(installMode());
    listeners.add(update);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", update);
    update();
    return () => {
      listeners.delete(update);
      mq?.removeEventListener?.("change", update);
    };
  }, []);
  return mode;
}

const DISMISS_KEY = "mtp.installHintDismissed";
export function installHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return true; // no storage: never risk showing the hint on every visit
  }
}
export function dismissInstallHint() {
  try {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  } catch {
    /* private mode: the hint simply goes for this visit */
  }
}

/** For tests only. */
export function resetInstallStateForTests() {
  deferred = null;
  installed = false;
  notify();
}

/**
 * Register the offline-page service worker (see public/sw.js: it caches nothing but that page). Production builds only, so local
 * development and tests are never served by a worker.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}
