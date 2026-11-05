/*
 * kinetigor-game — service worker (offline support)
 * Cache-first for same-origin GET assets; everything else passes through.
 * The game makes no network requests of its own — this exists only so the
 * installed app keeps working with the network disabled after first load.
 */
var CACHE = "princetown-v2";
var ASSETS = [
  "./",
  "./index.html",
  "./verify.html",
  "./style.css",
  "./ui.js",
  "./fixtures.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./hero.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/moorpost-kernel.js",
  "./core/trust.js",
  "./core/kernel.js",
  "./core/validator.js",
  "./core/challenges.js",
  "./core/game.js"
];
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
