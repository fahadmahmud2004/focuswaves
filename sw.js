// Offline support for the app shell. Network first, so every deploy shows up immediately.
// Quran audio streams from its CDN and is never cached.
const CACHE = "focuswaves-v6";
const FILES = ["/", "/index.html", "/style.css", "/app.js", "/i18n.js", "/sounds.js", "/quran.js", "/scene.js",
  "/audio.js", "/nature-worklet.js", "/manifest.webmanifest", "/brand/logo.png", "/brand/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
