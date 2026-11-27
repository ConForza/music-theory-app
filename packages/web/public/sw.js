/*
 * Music Theory Path service worker. Deliberately minimal (PWA brief, "Offline behaviour and updates"):
 *
 *  - It never caches the app, the API, sign-in responses or anything about a learner. Every request goes to the network exactly as if
 *    there were no service worker, so a deployment can never leave an old front end talking to a new server, and revoking preview access
 *    takes effect at once.
 *  - Its only job: when a PAGE cannot be loaded because the device is offline (or the server cannot be reached at all), show a small,
 *    generic "you're offline" page instead of the browser's error screen. That page contains no course material and no personal data.
 *
 * Bump VERSION when offline.html or offline.css change; old caches are deleted on activation.
 */
const PREFIX = "mtp-offline-";
const VERSION = `${PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL, "/offline.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(OFFLINE_ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only this worker's own older caches; anything else on the origin is left alone.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    // Network only; the cached page is used solely when the network itself fails (a server answer, even an error, is shown as is).
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname === "/offline.css") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.css").then((r) => r || Response.error())));
  }
  // Everything else: not intercepted at all.
});
