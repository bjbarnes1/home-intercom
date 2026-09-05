/* home-intercom service worker.
 *
 * MVP responsibilities:
 *   - installable PWA shell (offline-friendly load of the app chrome)
 *   - receive web-push wake notifications (Phase 4) and focus the app
 *
 * We intentionally do NOT cache API responses or LiveKit traffic.
 */

const SHELL_CACHE = "intercom-shell-v1";
const SHELL_ASSETS = ["/", "/controller", "/endpoint", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept API or websocket traffic — always go to network.
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match("/"))),
  );
});

// Web-push wake (Phase 4): show a notification and focus the endpoint.
self.addEventListener("push", (event) => {
  let data = { title: "Intercom", body: "Incoming" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      tag: "intercom-wake",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/endpoint");
    }),
  );
});
