# Installable app and persistent sign-in (PWA brief)

What this adds: Music Theory Path can be added to an iPhone or iPad Home Screen (and installed on Android and desktop browsers) and opens
full screen with its own icon; learners sign in once and stay signed in; the private preview no longer uses an HTTP Basic prompt. It is
still an online app: no lessons, answers or progress work offline.

## 1. Session expiry and renewal policy (learners)

| | Before | Now |
|---|---|---|
| Registered learner | Fixed 60 days from sign-in, then signed out even if used every day | **60 days from last use**, renewed at most once a day while the learner uses the app, **never beyond 365 days after the sign-in that created the session** |
| Guest | Fixed 60 days, never renewed | **Unchanged** (fixed 60 days, never renewed; the existing 14-day warning still applies) |
| Guest registers (upgrade) | Same session kept | Guest session **replaced** by a new registered session (fresh 60 days, renewable) |
| Sign-in | New session, previous one on that device deleted | Unchanged |
| Sign-out / delete account | Session row deleted, cookie cleared | Unchanged |

* **Why renew.** A Duolingo-style learner who practises every week should never meet a sign-in screen because a fixed term ran out. With
  renewal, an active learner is asked for their password at most once a year (one tap with Apple Passwords AutoFill); someone who stops for
  more than 60 days signs in again.
* **Bounds.** No token is ever valid indefinitely: 60 days idle, 365 days absolute. Both are server-side values (`expires_at`, `created_at`
  in `sessions`); the cookie's `Max-Age` is re-sent on renewal so the browser keeps it as long as the server does, but the server's row is
  what counts. Renewal reuses the same token (only its expiry moves), so parallel requests cannot race each other.
* **Guests not changed.** Guest expiry and retention are owner decisions (docs/PRIVACY_PLAN.md); this PR does not touch them. Retention's
  "no usable session" rule is unaffected.
* Code: `packages/api/src/auth.ts` (`resolveSession`, `SESSION_DAYS`, `SESSION_MAX_DAYS`, `rotateSession`), `app.ts` dispatcher.
  No migration was needed: the existing `created_at` and `expires_at` columns carry the policy. Existing sessions start renewing on their
  next use, so **existing learners are not signed out by this change**.

## 2. Security decisions

* **Learner credentials**: unchanged mechanism. 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` with
  `MTP_SECURE_COOKIES=1`); only its SHA-256 is stored; expiry and revocation are server-side. Passwords: scrypt (unchanged).
* **Session fixation**: sign-in already issued a new token and deleted the old one. Now registering a guest also rotates the session (a
  change of privilege). If the reply to that registration is lost, the old guest cookie no longer works; the form notices there is no
  session and signs in with the details just typed (it never swaps a guest session that still works). Covered by
  `followup.test.tsx` and `session-persistence.test.ts`.
* **Nothing secret in client storage.** No password, token or credential is written to `localStorage`, `sessionStorage`, IndexedDB or any
  cache (asserted in unit and browser tests). `localStorage` still holds only theme, motion and an "install hint dismissed" date.
* **Password storage is the platform's job**: the forms are built so Apple Passwords and other managers can save and fill them (below);
  the app stores nothing itself.
* **Malformed cookies**: a cookie value that is not valid URL encoding used to raise a 500; it is now treated as no session (401).
* **Account switching**: unchanged client safeguards (identity epochs cancel the previous learner's requests); server tests confirm that
  after sign-out and a different sign-in, nothing of the first learner is returned.
* **Foreground re-check**: when the app returns to the foreground (or the connection returns) it quietly asks `/api/me`. A 401 shows the
  learner as signed out; a network failure changes nothing, so being offline never signs anyone out.

## 3. Private-preview gate (replaces the Basic prompt)

**Finding.** The HTTP Basic gate (issue #24) breaks the installed app: an iOS Home Screen web app has its own credential and cookie store
and cached Basic credentials do not survive the app being closed, so testers are asked again on launch (developers also report iOS
versions that show no prompt at all in standalone mode, leaving a 401 page); and browsers fetch the web app manifest *without
credentials* (the Manifest spec's default), so a gate in front of every path refuses the installation metadata.

**Replacement** (`packages/api/src/preview-gate.ts`, migration `012_preview_sessions.sql`):

* Unauthorised page requests are redirected to `/preview/signin`, a small server-rendered form (no script; works under the CSP). Testers
  enter **the same tester name and password** they were already given (`MTP_PREVIEW_ACCESS` is unchanged, so existing invitations keep
  working).
* A correct entry creates a **preview session**: random 256-bit token, cookie `mtp_preview` (`HttpOnly`, `SameSite=Lax`, `Secure` with
  `MTP_SECURE_COOKIES=1`), stored only as a SHA-256 hash. 60 days from last use, renewed at most daily, never beyond 180 days. So a tester
  enters the preview password roughly once per device, plus once inside the installed app.
* **Separate from learner sign-in**: the preview session identifies no learner and opens no account; learner sign-out keeps it; a
  learner cookie alone does not pass the gate. Tested.
* **Revocation**: each preview session records a fingerprint of the exact `MTP_PREVIEW_ACCESS` entry it was issued under. Removing a
  tester's entry, or replacing their password, and redeploying invalidates every session issued to them, and start-up deletes those rows.
* **Open without a preview session** (exact paths, GET/HEAD only): `GET /api/health` (Railway healthcheck, unchanged), the sign-in page and
  its stylesheet, and installation metadata: `/manifest.webmanifest`, `/favicon.svg`, `/apple-touch-icon.png`, `/icons/icon-192.png`,
  `/icons/icon-512.png`, `/icons/maskable-192.png`, `/icons/maskable-512.png`. They contain no course material, no account data and no
  route to guest, registration or sign-in. Traversal attempts through these paths are tested.
* API requests without preview access get `401 {"error":{"code":"preview_required"}}`; the web app then goes to the preview sign-in page
  and returns to where the tester was.
* Sign-in form: same-origin check (`Origin` must be the site or `MTP_ALLOWED_ORIGINS`), form-encoded only, 4 KB limit, rate limited
  (20 attempts per tester name and 100 per client address per 15 minutes, per process), constant-time comparison, `Cache-Control: no-store`.
  The return address is restricted to same-site paths (no open redirect).
* `Authorization: Basic` with the same credentials is still accepted (for `curl -u` smoke tests), but no `WWW-Authenticate` challenge
  is ever sent, so browsers never show a dialog.
* `POST /preview/signout` ends the device's preview session (not linked in the app UI; for shared devices or testing).
* Unchanged: `MTP_PREVIEW_GATE=1` is still required on Railway, fail-closed with no valid entries, rate limiting and origin checks on the
  API, security headers on every response, `X-Robots-Tag: noindex`.

**New Railway configuration: none.** No new variables; `MTP_PREVIEW_ACCESS`, `MTP_PREVIEW_GATE`, `MTP_SECURE_COOKIES` and
`MTP_ALLOWED_ORIGINS` keep their meaning. Migration 012 is additive (one new table) and runs automatically on start. Take the usual
app-level backup before deploying (RAILWAY.md). Rolling back to code before this PR is safe for data (the extra table is ignored), but
testers would see the Basic prompt again.

## 4. Safari and the installed app: what transfers

* An app added to the iPhone/iPad Home Screen has **its own storage and cookie jar**, separate from Safari's. Cookies set in Safari are not
  available inside the installed app (long-standing WebKit behaviour, e.g. WebKit bug 181849; Apple documents no supported way to carry
  them over). We do not promise transfer.
* So after installing, a tester signs in **once to the preview** and **once to their learner account** inside the app. After that, both
  sessions persist across closing the app, force-quitting, restarting the phone and server redeploys (cookies are persistent, server-set
  and first-party; WebKit's 7-day limit on script-written storage does not apply to them, and Home Screen apps are exempt from it anyway).
* **Guests cannot be carried into the installed app**: a guest has no password, so there is no way to sign in to the same guest account
  inside the app. The install guidance says this and suggests creating a free account first (progress is kept on upgrade), then signing in
  once in the app.
* On Android and desktop Chromium, the installed app normally shares the browser's cookies, so no extra sign-in is usually needed there.

## 5. Install metadata, icon, service worker

* `packages/web/public/manifest.webmanifest`: id `/`, name "Music Theory Path", short name "Theory Path", `start_url` and `scope` `/`,
  `display: standalone`, theme/background `#f4f6fb` (the app's light background), 192/512 `any` icons, 192/512 `maskable` icons, and the
  180×180 Apple touch icon. `index.html` adds the manifest link, Apple touch icon, `apple-mobile-web-app-title` "Theory Path",
  `apple-mobile-web-app-capable`, `mobile-web-app-capable` and status-bar style `default` (dark text on light, light on dark; a translucent
  bar would put white text over the light theme).
* **Icon**: original artwork (`packages/web/icon-src/icon.svg`): the existing Music Theory Path mark (teal field, stave lines, white note
  head, golden stem and flag) redrawn full-bleed with the art inside the maskable safe zone. Opaque PNGs for Apple and maskable
  (iOS fills transparency with black), rounded transparent PNGs for `any`. Regenerate with `node packages/web/icon-src/render.mjs` (uses the
  Playwright Chromium already in devDependencies; no image library added).
* **Theme colour** follows the app's own theme: choosing Dark in Settings also darkens the status bar, even if the device is in light mode.
* **Service worker** (`public/sw.js`, production builds only): caches exactly two files, `offline.html` and `offline.css`. It handles only
  page navigations, network first, and shows the offline page only when the network request itself fails (offline, or the server cannot be
  reached during a restart). It never caches the app, the API, sign-in or preview responses, or anything about a learner, and never
  answers non-navigation requests (except the offline stylesheet), so a deployment can never leave an old front end talking to a new
  server, and revoking preview access takes effect immediately. `sw.js`, `index.html` and the manifest are served `no-cache`; hashed assets
  stay immutable as before.
* Inside the running app, failures are shown as "You're offline" / "We couldn't reach Music Theory Path" with **Try again**, never as the
  welcome or sign-in screens, and never by creating a new guest. Coming back online retries automatically.

## 6. iPhone standalone layout

Already present and kept: `viewport-fit=cover`, safe-area padding at the top of pages and player, under the bottom tabs, action bars and
sheets; inputs at 17 px (no zoom on focus); 44 px+ touch targets. Added: left/right safe-area insets for landscape on notched phones, the
page colour behind overscroll and the status bar, `touch-action: manipulation` on controls (no double-tap zoom), no sideways page scroll
in standalone mode. Navigation is all in-app links, so nothing opens a Safari window. Learn, Practice, Review and Progress tabs, Explore
lessons and Practise a topic are unchanged.

## 7. Password managers

* Sign-in (`/signin`): a real `<form name="signin">`, email `name="email" id="signin-email" type="email" autocomplete="username"`
  (with `autocapitalize="none"`), password `name="password" autocomplete="current-password"`.
* Registration (onboarding and guest Profile): email `autocomplete="username"`, password `autocomplete="new-password"` with
  `passwordrules="minlength: 8; maxlength: 128;"` (the server's own rule), so Safari can suggest a strong password and Apple Passwords saves
  the pair.
* Preview sign-in: tester name `autocomplete="username"`, password `current-password`, so testers can save it too.
* Face ID / Touch ID is the operating system's protection of saved passwords during AutoFill; the app does not implement biometrics.
  Password AutoFill is **not** a passkey. Passkeys remain a possible later enhancement.

## 8. Installation guidance

* A small card on the Learn page, shown only after the learner's first finished lesson, only where installing is possible (iPhone/iPad,
  or a browser offering its install prompt), never inside the installed app. "Not now" hides it for good on that device.
* iPhone/iPad: step-by-step Share > Add to Home Screen. Android/desktop Chromium: an **Install the app** button that opens the browser's
  own dialog.
* Settings > **Install the app** always explains how (and says when you're already in the installed app), including the separate sign-in
  and the guest caveat.

## 9. Tests

Automated (run in this PR):

* API: `test/session-persistence.test.ts` (renewal, daily throttle, 365-day cap, idle expiry, guests not renewed, rotation on upgrade and
  lost-reply recovery, sign-in/out revocation, renewal never overriding sign-out, account switching, malformed and expired cookies,
  survival across a new process on the same database), `test/preview-signin.test.ts` (uninvited access to pages, assets and every API
  route; open resources; traversal through install paths; form sign-in, cookie flags, hashing; wrong credentials; cross-site and non-form
  posts; rate limit; return-address safety; fixation; sign-out; Basic header; redeploy survival; revocation and password re-issue;
  renewal, idle and absolute expiry; fail-closed; separation from learner sessions).
* Web: `src/test/pwa.test.tsx` (straight to the path when signed in; offline and server-unreachable launch screens with no POSTs; retry and
  automatic retry; foreground re-check; form attributes; no secrets in storage; install hint/guide behaviour incl. standalone, iOS, guest
  note, dismissal, `beforeinstallprompt`; theme colour; manifest fields; icon files and dimensions; Apple icon opaque; the gate's open
  paths match the manifest exactly; service worker caches only the offline page).
* Browser: `packages/web/e2e/pwa.mjs` (`npm run e2e:pwa -w @mtp/web`) runs the production entry point with the gate on, in a phone-sized
  Chromium: installability (Chromium's own check), preview form sign-in once, learner registration, relaunch straight to the path,
  redeploy, offline and server-outage pages with Try again, mid-use outage, revocation, preview session ending mid-use, sign-out and
  sign-in again; no CSP violation or auth dialog.

Browser emulation cannot show Safari's Add to Home Screen, iOS standalone launch, Apple Passwords or Face ID: those need a real device.

## 10. Real-device acceptance checklist (owner, physical iPhone)

Before: deploy to Railway with the domain set, and have a tester invitation (name and password). Record iOS version and results.

1. **Safari, first visit**: open the address. Expect the "Private preview" sign-in page (no grey system login dialog). Enter tester name and
   password; Safari offers to save the password: accept. Expect the app's welcome page.
2. **Account**: Get started > create an account. Safari suggests a strong password in the password field: accept it; it is saved to
   Passwords. Finish onboarding; complete one lesson.
3. **Install hint**: back on Learn, a "Put Music Theory Path on your Home Screen" card appears; Show me how lists the steps.
4. **Install**: Share > Add to Home Screen. Check the name reads "Theory Path" and the icon is the teal note icon (not a screenshot). Add.
5. **Launch**: open from the Home Screen. Expect full screen with no Safari address bar or toolbar; the status bar is readable.
6. **One-time sign-ins inside the app**: the preview sign-in page appears once: AutoFill offers the saved tester details (Face ID if
   enabled): sign in. Then "I already have an account": AutoFill offers your email and password: sign in. Expect the Learn page; the
   install card does not appear.
7. **Close and reopen** (swipe away): opens straight to Learn, no sign-in, no welcome flash.
8. **Force-quit and relaunch**, then **restart the iPhone** and relaunch: straight to Learn each time.
9. **Redeploy** the server on Railway; relaunch: straight to Learn; progress, XP, streak and badges intact.
10. **Offline**: Airplane Mode on, relaunch: "You're offline" page with Try again (not a blank screen, not a sign-in page). Airplane
    Mode off, Try again: Learn, still signed in.
11. **Layout**: rotate to landscape and back (content clear of the notch/Dynamic Island and Home indicator); type in a text answer
    (keyboard does not hide the answer or zoom the page); play notation audio; switch Settings > Appearance to Dark and back (status bar
    follows); Learn, Practice, Review, Progress tabs, Explore lessons and Practise a topic all work.
12. **Background**: leave the app for an hour, return: same screen, still signed in.
13. **Sign out** (Settings): welcome page. Reopen: welcome page. Sign in again with AutoFill: Learn.
14. **Revocation** (optional): remove your tester entry from `MTP_PREVIEW_ACCESS`, redeploy, relaunch: preview sign-in page; your old
    password is refused. Restore the entry and redeploy.
15. **Long inactivity** (cannot be rushed on a device; covered by automated tests): after 60+ days unused, the app asks for sign-in again.

## 11. Known limitations

* An existing Safari session (preview or learner) does not carry into the installed iOS app: one extra sign-in of each after installing.
* Guest progress cannot follow a guest into the installed app; they need to register first (the guidance says so).
* Revoking a tester takes effect on the next deploy (as before: Railway variables need a redeploy).
* No splash images (`apple-touch-startup-image`): iOS shows a plain screen for a moment at launch.
* Rate limiters are per process and, until `MTP_TRUST_PROXY_HOPS` is verified, all clients share the edge proxy's address (as before).
* Expired preview-session rows are deleted at start-up (each deploy), not by the daily housekeeping; they are tiny and never usable.
* Older iOS versions (before 16.4) and in-app browsers may not offer Add to Home Screen from browsers other than Safari.
