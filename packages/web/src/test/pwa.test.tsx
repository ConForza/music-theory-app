/** PWA brief: no misleading screens when offline, sign-in restored on launch, password-manager forms, install guidance, manifest and icons. */
import "@testing-library/jest-dom/vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Me } from "../api/client";
import { InstallGuide, InstallHint } from "../components/InstallApp";
import { captureInstallPrompt, installMode, isStandalone, resetInstallStateForTests } from "../lib/install";
import { syncThemeColor } from "../state/app";
import { renderApp, startApi } from "./harness";

const PUBLIC = resolve(process.cwd(), "public");
const realMatchMedia = window.matchMedia;
const ua = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");

function setDisplayMode(standalone: boolean) {
  window.matchMedia = ((q: string) => ({ matches: standalone && /display-mode: standalone/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

beforeEach(() => {
  localStorage.clear();
  resetInstallStateForTests();
  setDisplayMode(false);
  setUserAgent(DESKTOP);
});
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
  if (ua) Object.defineProperty(window.navigator, "userAgent", ua);
});

const me = (isGuest = false): Me =>
  ({
    user: { id: "u", email: isGuest ? null : "a@example.com", displayName: "Ada", isGuest },
    profile: { experience: "new", selectedGrade: 1, onboarded: true, settings: { theme: "system", motion: "system", sound: true, examExtraTime: 0 }, timezone: "UTC", dailyGoal: 1 },
  }) as Me;

describe("launching the app", () => {
  it("a signed-in learner goes straight to their path, with no welcome screen on the way", async () => {
    startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true, experience: "new", selectedGrade: 1 });
    renderApp("/");
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });

  it("offline at launch: says so with a retry, never shows the welcome or onboarding as if signed out, and creates nothing", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    const cookie = s.cookie();
    s.setOffline(true);
    const before = s.calls.length;
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByText(/Your progress and sign-in are safe/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
    expect(s.calls.slice(before).filter((c) => c.startsWith("POST"))).toEqual([]);
    // Back online: Try again takes them to their path with the same sign-in.
    s.setOffline(false);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument(), { timeout: 10000 });
    expect(s.cookie()).toBe(cookie);
  });

  it("the server being unreachable is not called 'offline', and sign-in/onboarding pages wait for it too", async () => {
    const s = startApi();
    s.failNext(/GET \/api\/me/, 1, 502);
    renderApp("/onboarding");
    expect(await screen.findByRole("heading", { name: "We couldn't reach Music Theory Path" })).toBeInTheDocument();
    expect(screen.getByText(/may be restarting/)).toBeInTheDocument();
  });

  it("coming back online retries by itself", async () => {
    const s = startApi();
    s.setOffline(true);
    renderApp("/welcome");
    expect(await screen.findByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    s.setOffline(false);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(await screen.findByRole("link", { name: "Get started" })).toBeInTheDocument();
  });

  it("returning to the app re-checks the sign-in: an ended session shows as signed out, being offline does not", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    // Offline while backgrounded: nothing changes.
    s.setOffline(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    // The session was revoked elsewhere (e.g. signed out on another device's copy of this cookie): the app notices.
    s.setOffline(false);
    s.db.exec("DELETE FROM sessions");
    act(() => void window.dispatchEvent(new Event("online")));
    expect(await screen.findByRole("link", { name: "I already have an account" })).toBeInTheDocument();
  });
});

describe("password managers (Apple Passwords and others)", () => {
  it("sign-in marks the email as the username and the password as the current one, with stable names", async () => {
    startApi();
    renderApp("/signin");
    const email = await screen.findByLabelText("Email");
    const pw = screen.getByLabelText("Password");
    expect(email.closest("form")).toHaveAttribute("name", "signin");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("name", "email");
    expect(email).toHaveAttribute("id", "signin-email");
    expect(email).toHaveAttribute("autocapitalize", "none");
    expect(pw).toHaveAttribute("autocomplete", "current-password");
    expect(pw).toHaveAttribute("name", "password");
    expect(pw).toHaveAttribute("type", "password");
  });

  it("registration asks for a new password within the server's rules, so Safari can suggest a strong one", async () => {
    startApi();
    renderApp("/onboarding");
    fireEvent.click(await screen.findByRole("button", { name: /New to music theory/ }));
    const pw = await screen.findByLabelText(/^Password/);
    expect(pw).toHaveAttribute("autocomplete", "new-password");
    expect(pw.getAttribute("passwordrules")).toBe("minlength: 8; maxlength: 128;");
    expect(pw).toHaveAttribute("maxlength", "128");
    const email = screen.getByLabelText(/^Email/);
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^Nickname/)).toHaveAttribute("autocomplete", "nickname");
  });

  it("no password or session token is ever written to browser storage", async () => {
    startApi();
    renderApp("/signin");
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "x@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain("hunter2");
    expect(dump).not.toContain("mtp_session");
  });
});

describe("installation guidance", () => {
  const show = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

  it("is hidden inside the installed app", () => {
    setUserAgent(IPHONE);
    setDisplayMode(true);
    expect(isStandalone()).toBe(true);
    expect(installMode()).toBe("installed");
    show(<InstallHint me={me()} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    cleanup();
    show(<InstallGuide me={me()} />);
    expect(screen.getByText(/You're using the installed app/)).toBeInTheDocument();
  });

  it("on iPhone explains Add to Home Screen, warns guests their progress stays in the browser, and once dismissed stays away", () => {
    setUserAgent(IPHONE);
    const { unmount } = show(<InstallHint me={me(true)} />);
    expect(screen.getByRole("heading", { name: /Home Screen/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.getByText(/You're learning as a guest/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/profile");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("heading", { name: /Home Screen/ })).toBeNull();
    unmount();
    show(<InstallHint me={me(true)} />);
    expect(screen.queryByRole("heading", { name: /Home Screen/ })).toBeNull(); // not again on this device
    cleanup();
    show(<InstallGuide me={me(true)} />); // ...but always in Settings
    expect(screen.getByRole("heading", { name: "Install the app" })).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("on Android/desktop uses the browser's own install prompt when it offers one, and shows nothing unprompted otherwise", async () => {
    show(<InstallHint me={me()} />);
    expect(screen.queryByRole("heading")).toBeNull(); // no prompt available: no unprompted hint
    cleanup();
    captureInstallPrompt(window);
    const prompt = vi.fn(async () => undefined);
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    act(() => void window.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    show(<InstallHint me={me()} />);
    fireEvent.click(screen.getByRole("button", { name: "Install the app" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install the app" })).toBeNull());
  });

  it("the Learn page never shows the hint before the first finished lesson", async () => {
    setUserAgent(IPHONE);
    startApi();
    await api.register({ email: "new@example.com", password: "correct horse", displayName: "N" });
    await api.patchProfile({ onboarded: true });
    renderApp("/learn");
    await screen.findByRole("navigation", { name: "Other ways to learn" }, { timeout: 10000 });
    expect(screen.queryByRole("heading", { name: /Home Screen/ })).toBeNull();
  });
});

describe("theme colour follows the app's theme", () => {
  it("an explicit theme sets the status bar colour for both device modes; 'match my device' restores them", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#f4f6fb" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#11121b" media="(prefers-color-scheme: dark)">';
    const colours = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));
    syncThemeColor("dark");
    expect(colours()).toEqual(["#11121b", "#11121b"]);
    syncThemeColor("light");
    expect(colours()).toEqual(["#f4f6fb", "#f4f6fb"]);
    syncThemeColor("system");
    expect(colours()).toEqual(["#f4f6fb", "#11121b"]);
  });
});

describe("web app manifest and icons", () => {
  const manifest = JSON.parse(readFileSync(resolve(PUBLIC, "manifest.webmanifest"), "utf8"));
  const pngSize = (file: string) => {
    const b = readFileSync(file);
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colourType: b[25] };
  };

  it("has the required installation fields", () => {
    expect(manifest).toMatchObject({ id: "/", name: "Music Theory Path", short_name: "Theory Path", start_url: "/", scope: "/", display: "standalone" });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("every icon exists at its declared size; there are 192 and 512 icons, maskable ones, and an opaque 180 Apple touch icon", () => {
    for (const icon of manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>) {
      const file = resolve(PUBLIC, icon.src.slice(1));
      expect(existsSync(file), icon.src).toBe(true);
      const { w, h } = pngSize(file);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
    const sizes = (purpose: string) => manifest.icons.filter((i: { purpose?: string }) => (i.purpose ?? "any") === purpose).map((i: { sizes: string }) => i.sizes);
    expect(sizes("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(sizes("maskable")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    const apple = pngSize(resolve(PUBLIC, "apple-touch-icon.png"));
    expect([apple.w, apple.h]).toEqual([180, 180]);
    expect(apple.colourType).toBe(2); // RGB with no alpha: iOS would fill transparency with black
  });

  it("index.html links the manifest and Apple metadata", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    for (const s of ['rel="manifest" href="/manifest.webmanifest"', 'rel="apple-touch-icon" href="/apple-touch-icon.png"', 'name="apple-mobile-web-app-title" content="Theory Path"', 'name="apple-mobile-web-app-capable" content="yes"', "viewport-fit=cover"]) expect(html).toContain(s);
  });

  it("the public install paths the preview gate opens are exactly the manifest's icons, the manifest and the favicon", async () => {
    const { PUBLIC_INSTALL_PATHS } = await import("../../../api/src/preview-gate.ts");
    const expected = new Set(["/manifest.webmanifest", "/favicon.svg", ...manifest.icons.map((i: { src: string }) => i.src)]);
    expect(new Set(PUBLIC_INSTALL_PATHS)).toEqual(expected);
  });

  it("the service worker caches only the offline page and never intercepts the API", () => {
    const sw = readFileSync(resolve(PUBLIC, "sw.js"), "utf8");
    expect(sw).toMatch(/OFFLINE_ASSETS = \[OFFLINE_URL, "\/offline.css"\]/);
    expect(sw).not.toMatch(/cache\.put|\/api\//);
    const offline = readFileSync(resolve(PUBLIC, "offline.html"), "utf8");
    expect(offline).not.toMatch(/<script/i);
    expect(offline).toContain('href=""'); // "Try again" reloads the page that failed
  });
});

describe("review of the PWA PR: session reads and sign-out", () => {
  it("P2: an older foreground check answering late cannot bring back a learner a newer check found signed out", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    // Check A: the server answers "Ada" but the reply is held in transit.
    const held = s.hold(/GET \/api\/me/);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(held.seen()).toBe(1));
    // The session ends (signed out elsewhere); check B answers 401 first.
    s.db.exec("DELETE FROM sessions");
    act(() => void window.dispatchEvent(new Event("online")));
    expect(await screen.findByRole("link", { name: "I already have an account" })).toBeInTheDocument();
    // A's stale "Ada" finally arrives: it must not restore her.
    held.release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("link", { name: "I already have an account" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("P2: a sign-out blocked by the preview gate is not a sign-out; the learner stays signed in and returns with it pending", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/logout")) return new Response(JSON.stringify({ error: { code: "preview_required", message: "preview" } }), { status: 401 });
      return inner(input, init);
    }) as typeof fetch;
    const realLocation = window.location;
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { pathname: "/settings", search: "", assign } });
    const { resetPreviewRedirectForTests } = await import("../api/client");
    resetPreviewRedirectForTests();
    try {
      renderApp("/settings");
      fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(await screen.findByText(/preview access has ended, so you are still signed in/)).toBeInTheDocument();
      expect(assign).toHaveBeenCalledWith("/preview/signin?next=%2Fsettings%3Fpending%3Dsignout");
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
      expect(s.cookie()).toMatch(/^mtp_session=/); // the learner session was never ended
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
      globalThis.fetch = inner;
      resetPreviewRedirectForTests();
    }
  });

  it("coming back from the preview sign-in with the sign-out pending says so and offers to finish it", async () => {
    startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings?pending=signout");
    expect(await screen.findByText(/You haven't been signed out yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish signing out" }));
    expect(await screen.findByRole("link", { name: "I already have an account" })).toBeInTheDocument();
  });

  it("'leave the preview' is offered only where there is a preview gate", async () => {
    startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /leave the preview/ })).toBeNull();
  });
});

describe("re-review of the PWA PR: one sign-in change at a time, startup, combined sign-out", () => {
  it("P1: a guest conversion whose reply is still in flight cannot undo a sign-out made meanwhile: the sign-out waits, then wins", async () => {
    const s = startApi();
    await api.guest();
    const held = s.hold(/POST \/api\/auth\/register/);
    const converting = api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await waitFor(() => expect(held.seen()).toBe(1)); // the server has converted the guest; its reply (and cookie) is in transit
    const signingOut = api.logout();
    await new Promise((r) => setTimeout(r, 30));
    expect(s.calls).not.toContain("POST /api/auth/logout"); // not sent while the conversion's cookie is still on its way
    held.release();
    await converting;
    await signingOut;
    expect(s.cookie()).toBe("");
    await expect(api.me()).rejects.toMatchObject({ status: 401 }); // signed out, not revived as the converted learner
  });

  it("P1: an automatic recovery sign-in still in flight cannot overwrite an explicit sign-in as someone else", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.logout();
    await api.register({ email: "bob@example.com", password: "correct horse", displayName: "Bob" });
    await api.logout();
    const { authExclusive, rawAuth } = await import("../api/client");
    const held = s.hold(/POST \/api\/auth\/login/);
    const recovering = authExclusive(() => rawAuth.login({ email: "ada@example.com", password: "correct horse", onlyIfSignedOut: true }));
    await waitFor(() => expect(held.seen()).toBe(1));
    const bob = api.login({ email: "bob@example.com", password: "correct horse" });
    await new Promise((r) => setTimeout(r, 30));
    expect(s.calls.filter((c) => c === "POST /api/auth/login")).toHaveLength(1); // Bob's sign-in waits for the recovery to land
    held.release();
    await recovering;
    await bob;
    expect((await api.me()).user.email).toBe("bob@example.com"); // the explicit, later sign-in is the one that holds
  });

  it("every sign-in change still completes on its own: guest, register, sign-in, sign-out and account deletion each resolve (no self-deadlock)", async () => {
    const s = startApi();
    const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out: the exclusive section never released")), 3000))]);
    await within(api.guest());
    await within(api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" }));
    await within(api.logout());
    await within(api.login({ email: "ada@example.com", password: "correct horse" }));
    await within(api.deleteAccount((await api.me()).user.id));
    expect(s.cookie()).toBe("");
    await expect(api.login({ email: "ada@example.com", password: "correct horse" })).rejects.toMatchObject({ status: 401 });
  });

  it("P2: a reconnect while the first load is still in flight does not leave the app stuck on 'Opening'", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    const held = s.hold(/GET \/api\/me/);
    renderApp("/");
    await waitFor(() => expect(held.seen()).toBe(1));
    s.setOffline(true);
    act(() => void window.dispatchEvent(new Event("online"))); // a re-check that would fail
    await new Promise((r) => setTimeout(r, 30));
    s.setOffline(false);
    held.release();
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument(), { timeout: 10000 });
  });

  it("P2: an interrupted 'sign out and leave the preview' comes back as that same combined action", async () => {
    startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings?pending=leave-preview");
    expect(await screen.findByText(/finish signing out and leaving the preview on this device/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish signing out and leave the preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish signing out" })).toBeNull();
  });
});

describe("re-review 3 (P1): a queued account deletion can only delete the learner it was confirmed for", () => {
  it("Ada confirms deletion while Bob signs in in another tab: nothing is deleted, the app says why and shows who is signed in", async () => {
    const s = startApi();
    await api.register({ email: "bob@example.com", password: "correct horse", displayName: "Bob" });
    await api.logout();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Delete my data…" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Delete your account and all progress/);
    // Another tab of the same browser signs Bob in: the shared cookie is now Bob's, this tab still shows Ada.
    const { rawAuth } = await import("../api/client");
    await rawAuth.login({ email: "bob@example.com", password: "correct horse" });
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete everything" }));
    expect(await screen.findByText(/A different account is now signed in on this device, so nothing was deleted/)).toBeInTheDocument();
    const users = (s.db.prepare("SELECT email FROM users ORDER BY email").all() as Array<{ email: string }>).map((u) => u.email);
    expect(users).toEqual(["ada@example.com", "bob@example.com"]); // nobody deleted
    expect((await api.me()).user.email).toBe("bob@example.com"); // Bob still signed in
    // The explanation stays until the learner asks to see who is signed in now.
    fireEvent.click(screen.getByRole("button", { name: "Show who is signed in" }));
    await waitFor(() => expect(screen.queryByText(/so nothing was deleted/)).toBeNull());
  });

  it("the normal case still deletes the signed-in learner", async () => {
    const s = startApi();
    await api.register({ email: "ada@example.com", password: "correct horse", displayName: "Ada" });
    await api.patchProfile({ onboarded: true });
    renderApp("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Delete my data…" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete everything" }));
    expect(await screen.findByRole("link", { name: "Get started" })).toBeInTheDocument();
    expect((s.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(0);
  });
});
