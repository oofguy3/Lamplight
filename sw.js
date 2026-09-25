/* lamplight service worker — offline cache for everything the app is made of.
   Bump VERSION with every release: a new version installs in the background, and the app
   shows an "update ready" toast; reloading switches over to the new cache. */
const VERSION = "2026.09.25-27";
const CACHE = "lamplight-" + VERSION;
/* caches that outlive a release: shared files on their way in, and the natural voices (the Kokoro model
   and its voice files, kept there by kokoro-js): a 95 MB download that must not go with every update */
const KEEP = ["lamplight-share", "transformers-cache", "kokoro-voices"];
/* cross-origin isolation for the pages this worker serves: GitHub Pages cannot send these headers, and
   without them WebAssembly threads (SharedArrayBuffer) are off, so the natural voices run single-threaded.
   "credentialless" keeps cross-origin fetches (the online dictionary, ElevenLabs, huggingface.co) working;
   a remote <img> in a saved page is fetched without cookies. One switch, should it ever break something. */
const COI = true;
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./explain.js",
  "./morph.js",
  "./translate.js",
  "./audiobook.js",
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !KEEP.includes(k)).map((k) => caches.delete(k))))
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
  /* only our own files: the online dictionary, MyMemory, api.elevenlabs.io and huggingface.co (the natural voices'
     model, which kokoro-js caches itself) go straight to the network */
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
         (./?shared=1, ./?action=continue) so nothing downstream sees the wrong address — and, for
         a page, with the cross-origin isolation headers (COI above) */
      const pageHeaders = (h) => {
        const out = new Headers(h);
        if (COI) { out.set("Cross-Origin-Opener-Policy", "same-origin"); out.set("Cross-Origin-Embedder-Policy", "credentialless"); }
        return out;
      };
      /* the headers go on every same-origin response, not only the page: a cross-origin-isolated page may
         only start a module worker (workers/kokoro-worker.js) and its nested pthread workers
         (vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs) when those scripts carry COEP too */
      const asPage = (r) => new Response(r.body, { status: r.status, statusText: r.statusText, headers: pageHeaders(r.headers) });
      if (hit) return asPage(hit);
      try {
        const res = await fetch(e.request);
        /* same-origin files that are not precached (vendor/kokoro/*.mjs and *.wasm, the worker) land here on first use */
        if (res.ok && res.type === "basic") c.put(e.request, res.clone()).catch(() => null);
        /* a redirect (…/Lamplight → …/Lamplight/) must reach the browser as one, so it is passed on untouched */
        return res.redirected ? res : asPage(res);
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
