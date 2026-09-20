/* lamplight service worker — offline cache for everything the app is made of.
   Bump VERSION with every release: a new version installs in the background, and the app
   shows an "update ready" toast; reloading switches over to the new cache. */
const VERSION = "2026.09.20-23";
const CACHE = "lamplight-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./explain.js",
  "./morph.js",
  "./translate.js",
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
/* bundled reading fonts (FONTS in app.js): the app fetches a family only when it is chosen, so
   they are cached the same tolerant way — a missing file must not block install either */
const FONTS = [
  "./fonts/opendyslexic-latin-400-normal.woff2",
  "./fonts/opendyslexic-latin-700-normal.woff2",
  "./fonts/opendyslexic-latin-400-italic.woff2",
  "./fonts/opendyslexic-latin-700-italic.woff2",
  "./fonts/lexend-latin-wght-normal.woff2",
  "./fonts/andika-latin-400-normal.woff2",
  "./fonts/andika-latin-700-normal.woff2",
  "./fonts/andika-latin-400-italic.woff2",
  "./fonts/literata-latin-wght-normal.woff2",
  "./fonts/literata-latin-wght-italic.woff2",
  "./fonts/source-serif-4-latin-wght-normal.woff2",
  "./fonts/source-serif-4-latin-wght-italic.woff2",
  "./fonts/lora-latin-wght-normal.woff2",
  "./fonts/lora-latin-wght-italic.woff2",
  "./fonts/merriweather-latin-wght-normal.woff2",
  "./fonts/merriweather-latin-wght-italic.woff2",
  "./fonts/eb-garamond-latin-wght-normal.woff2",
  "./fonts/eb-garamond-latin-wght-italic.woff2",
  "./fonts/crimson-pro-latin-wght-normal.woff2",
  "./fonts/crimson-pro-latin-wght-italic.woff2",
  "./fonts/libre-baskerville-latin-400-normal.woff2",
  "./fonts/libre-baskerville-latin-700-normal.woff2",
  "./fonts/libre-baskerville-latin-400-italic.woff2",
  "./fonts/bitter-latin-wght-normal.woff2",
  "./fonts/inter-latin-wght-normal.woff2",
  "./fonts/ibm-plex-sans-latin-wght-normal.woff2",
  "./fonts/ibm-plex-sans-latin-wght-italic.woff2",
  "./fonts/nunito-latin-wght-normal.woff2",
  "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-700-normal.woff2"
];

/* fetched past the HTTP cache, so a release never installs files a CDN or the browser still
   held from the previous one */
const fresh = (u) => new Request(u, { cache: "reload" });
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map(fresh)).then(() => Promise.all(DICTS.concat(FONTS).map((d) => c.add(fresh(d)).catch(() => null))))
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
  /* only our own files: the online dictionary and the AI API go straight to the network */
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage =
    e.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html");

  /* Everything, the page included, is served from this version's cache so the shell and
     its scripts always match. A new release installs in the background and the app offers
     a reload (see the message handler above); only then does the new cache take over. */
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);       /* this version's cache only, never a newer one still waiting */
      const hit = await c.match(e.request, { ignoreSearch: true });
      /* the cached shell was stored under "./"; hand it back under the URL that was asked for
         (./?shared=1, ./?action=continue) so nothing downstream sees the wrong address */
      const asPage = (r) => new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
      if (hit) return isPage ? asPage(hit) : hit;
      try {
        const res = await fetch(e.request);
        if (res.ok && res.type === "basic") c.put(e.request, res.clone()).catch(() => null);
        return res;
      } catch (err) {
        if (isPage) {
          const page = await c.match("./index.html");
          if (page) return asPage(page);
        }
        throw err;
      }
    })()
  );
});
