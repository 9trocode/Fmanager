/* Cairn service worker — minimal, installability-only.
 *
 * This is a self-hosted finance app: balances, FX, transactions,
 * and advisor responses are live state that gets stale fast. We
 * deliberately do NOT cache fetch responses — every request hits
 * the network. The SW exists for two reasons:
 *
 *   1. PWA installability. Browsers require a registered SW with
 *      a fetch handler before they offer "Install" on desktop or
 *      "Add to Home Screen" on mobile. A passthrough fetch
 *      handler satisfies that without changing any behaviour.
 *
 *   2. Future offline shell. The skeleton is in place if we ever
 *      want to cache the app shell or queue mutations offline.
 *      Today: do nothing aggressive that could surface stale data.
 *
 * Bump CACHE_VERSION to force every client to drop any future
 * cache when the SW activates.
 */

const CACHE_VERSION = "cairn-v1";

self.addEventListener("install", () => {
  // Skip waiting so a deploy's new SW takes control on next reload
  // instead of after every tab is closed.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Sweep any older cache versions left over from previous
      // service-worker iterations. No-op on first install.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name)),
      );
      // Take control of already-open clients so the user doesn't
      // have to reload after the very first install.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Passthrough — required for installability, but every request
  // still goes straight to the network. No caching of API data.
  event.respondWith(fetch(event.request));
});
