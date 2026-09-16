/* lamplight service worker v2 — offline cache, but always grab a fresh index.html when online */
const CACHE = "lamplight-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/jszip.min.js",
  "./fonts/AtkinsonHyperlegible-Regular.woff2",
  "./fonts/AtkinsonHyperlegible-Bold.woff2",
  "./fonts/AtkinsonHyperlegible-Italic.woff2",
  "./fonts/AtkinsonHyperlegible-BoldItalic.woff2"
];
/* dictionary chunks: cached one by one so a single failure can't block install */
const DICTS = [1,2,3,4,5,6].map((i) => "./dict" + i + ".json");

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS).then(() => Promise.all(DICTS.map((d) => c.add(d).catch(() => null))))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isPage =
    e.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html");

  if (isPage) {
    // Network first: pick up updates automatically, fall back to cache offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(e.request, { ignoreSearch: true })
            .then((hit) => hit || caches.match("./index.html"))
        )
    );
  } else {
    // Cache first for icons/manifest
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  }
});
