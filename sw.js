/* lamplight service worker — offline cache for everything, fresh index.html when online.
   Bump VERSION with every release: a new version installs in the background, and the app
   shows an "update ready" toast; reloading switches over to the new cache. */
const VERSION = "2026.09.16-15";
const CACHE = "lamplight-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./explain.js",
  "./manifest.webmanifest",
  "./dict-index.json",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
  "./vendor/mammoth.min.js",
  "./vendor/marked.min.js",
  "./vendor/purify.min.js",
  "./vendor/jszip.min.js",
  "./workers/docx-worker.js",
  "./fonts/AtkinsonHyperlegible-Regular.woff2",
  "./fonts/AtkinsonHyperlegible-Bold.woff2",
  "./fonts/AtkinsonHyperlegible-Italic.woff2",
  "./fonts/AtkinsonHyperlegible-BoldItalic.woff2"
];
/* dictionary chunks: cached one by one so a single failure can't block install */
const DICTS = [1,2,3,4,5,6].map((i) => "./dict" + i + ".json");

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS).then(() => Promise.all(DICTS.map((d) => c.add(d).catch(() => null))))
    )
  );
});

/* the app asks the waiting worker to take over once the reader is ready to reload */
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "GET_VERSION" && e.source) e.source.postMessage({ type: "VERSION", version: VERSION });
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "lamplight-share").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  /* Web Share Target: files shared to Lamplight arrive here as a POST; stash them in a
     cache and send the app to ./?shared=N, where it picks them up */
  if (e.request.method === "POST" && url.pathname.endsWith("/share")) {
    e.respondWith(
      (async () => {
        let n = 0;
        try {
          const fd = await e.request.formData();
          const files = fd.getAll("file").filter((f) => f && typeof f.arrayBuffer === "function");
          const c = await caches.open("lamplight-share");
          await Promise.all(files.map((f, i) =>
            c.put("./share-file-" + i, new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-Name": encodeURIComponent(f.name || "shared") } }))
          ));
          n = files.length;
          const q = new URLSearchParams({ shared: String(n) });
          for (const k of ["title", "text", "url"]) { const v = fd.get(k); if (v && typeof v === "string") q.set(k, v); }
          return Response.redirect("./?" + q.toString(), 303);
        } catch (err) {
          return Response.redirect("./?shared=0", 303);
        }
      })()
    );
    return;
  }
  if (e.request.method !== "GET") return;
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
