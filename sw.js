/* lamplight service worker — offline cache for everything the app is made of.
   Bump VERSION with every release: a new version installs in the background, and the app
   shows an "update ready" toast; reloading switches over to the new cache. */
const VERSION = "2026.10.02-42";
const CACHE = "lamplight-" + VERSION;
/* the natural voices' runtime (vendor/kokoro/: kokoro-js and the 21.6 MB ONNX runtime both models run on;
   vendor/piper/: the Piper runtime and the phonemizer), kept apart from this version's cache so that it outlives a
   release as the models do: without it, a model on the device cannot run offline after an update. The files keep
   their names, so this number goes up whenever one of them changes, or the old copy would be served for ever —
   or the changed file gets a new name (RENAMED below), so the other 24 MB are not downloaded again */
const RUNTIME = "natural-runtime-1";
const RUNTIME_PATH = /\/vendor\/(kokoro|piper)\//;
/* caches that outlive a release: shared files on their way in, the natural voices — Best (the Kokoro model
   and its voice files, kept there by kokoro-js, ≈ 105 MB) and Fast (the Piper models and their configs, kept there by
   workers/piper-worker.js: English 78 MB, and Dutch 77 MB once a Dutch book asked for it), and the runtime they run on
   (RUNTIME above) — and the Dutch ↔ English pack (the
   Bergamot runtime and its two models, kept there by workers/mt-worker.js, 49 MB): downloads that must not go with
   every update — and the dictionary card's example sentences (tatoeba-examples, a few KB a word, kept by app.js) */
const KEEP = ["lamplight-share", "transformers-cache", "kokoro-voices", "piper-voices", "bergamot-models", "tatoeba-examples", RUNTIME];
/* runtime files a release renamed [old, new]: a reader who has the old one in RUNTIME gets the new one while this
   version installs (so the voices on the device keep working offline after the update), and the old one goes once this
   version is active. vendor/piper/phonemizer.js became phonemizer-en-nl.js when it learnt Dutch */
const RENAMED = [["./vendor/piper/phonemizer.js", "./vendor/piper/phonemizer-en-nl.js"]];
/* the pack's files (vendor/bergamot/*, models/bergamot/*) go straight to the network: the worker keeps them in
   "bergamot-models" itself, so they are neither precached nor copied into this version's cache */
const PACK = /\/(vendor|models)\/bergamot\//;
/* cross-origin isolation for the pages this worker serves: GitHub Pages cannot send these headers, and
   without them WebAssembly threads (SharedArrayBuffer) are off, so the natural voices run single-threaded.
   "credentialless" keeps cross-origin fetches (the online dictionary, ElevenLabs, huggingface.co) working;
   a remote <img> in a saved page is fetched without cookies. One switch, should it ever break something. */
const COI = true;
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./i18n.js",
  "./app.js",
  "./explain.js",
  "./morph.js",
  "./translate.js",
  "./audiobook.js",
  "./bgfetch.js",
  "./sounds.js",
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
  "./workers/mt-worker.js",
  /* the natural voices' workers (small; their runtime is in RUNTIME), so a model on the device works offline */
  "./workers/piper-worker.js",
  "./workers/kokoro-worker.js",
  "./fonts/AtkinsonHyperlegible-Regular.woff2",
  "./fonts/AtkinsonHyperlegible-Bold.woff2",
  "./fonts/AtkinsonHyperlegible-Italic.woff2",
  "./fonts/AtkinsonHyperlegible-BoldItalic.woff2",
  /* the interface's title face ('LL Title' in app.css): every panel heading, the wordmark and the hero use it */
  "./fonts/literata-latin-wght-normal.woff2",
  "./fonts/literata-latin-wght-italic.woff2"
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

/* a response with the cross-origin isolation headers (COI above). They go on every same-origin response, not
   only the page: a cross-origin-isolated page may only start a module worker (workers/kokoro-worker.js,
   workers/piper-worker.js) and its nested pthread workers (vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs) when
   those scripts carry COEP too */
const pageHeaders = (h) => {
  const out = new Headers(h);
  if (COI) { out.set("Cross-Origin-Opener-Policy", "same-origin"); out.set("Cross-Origin-Embedder-Policy", "credentialless"); }
  return out;
};
const asPage = (r) => new Response(r.body, { status: r.status, statusText: r.statusText, headers: pageHeaders(r.headers) });

/* fetched past the HTTP cache, so a release never installs files a CDN or the browser still
   held from the previous one */
const fresh = (u) => new Request(u, { cache: "reload" });
/* the dictionary (22 MB) and the fonts hardly ever change, and every release would download them again: the copy an
   earlier release keeps is checked with the server instead (If-None-Match / If-Modified-Since, past the HTTP cache as
   above), and kept when the answer is 304; any other answer is stored as it comes, and without an earlier copy (or a
   validator on it) the file is fetched as before */
async function keepOrFetch(c, u) {
  try {
    let old = null;
    for (const k of await caches.keys()) {
      if (!k.startsWith("lamplight-") || k === CACHE || k === "lamplight-share") continue;
      old = await (await caches.open(k)).match(u);
      if (old) break;
    }
    const tag = old && old.headers.get("ETag"), when = old && old.headers.get("Last-Modified");
    if (tag || when) {
      const res = await fetch(u, { cache: "no-store", headers: tag ? { "If-None-Match": tag } : { "If-Modified-Since": when } });
      if (res.status === 304) return c.put(u, old);
      if (res.ok) return c.put(u, res);
    }
  } catch (err) { /* asked for fresh below */ }
  return c.add(fresh(u));
}
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map(fresh)).then(() => Promise.all(DICTS.concat(FONTS).map((d) => keepOrFetch(c, d).catch(() => null))))
    ).then(() => renamedIn().catch(() => null))
  );
});
async function renamedIn() {
  if (!(await caches.has(RUNTIME))) return;
  const rt = await caches.open(RUNTIME);
  for (const [was, now] of RENAMED) {
    if (!(await rt.match(was, { ignoreSearch: true })) || (await rt.match(now, { ignoreSearch: true }))) continue;
    const res = await fetch(now, { cache: "no-cache" });
    if (res.ok) await rt.put(now, res);
  }
}
async function renamedOut() {
  if (!(await caches.has(RUNTIME))) return;
  const rt = await caches.open(RUNTIME);
  for (const [was] of RENAMED) await rt.delete(was, { ignoreSearch: true });
}

/* the app asks the waiting worker to take over once the reader is ready to reload */
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "GET_VERSION" && e.source) e.source.postMessage({ type: "VERSION", version: VERSION });
});

/* releases before RUNTIME existed kept the natural voices' runtime in their own versioned cache: it moves over
   before that cache goes, so a reader who has the voices does not lose them offline (nor download the runtime
   again). Only for "natural-runtime-1", whose files are the ones those releases kept; a new RUNTIME drops this */
async function keepRuntime(old) {
  if (RUNTIME !== "natural-runtime-1") return;
  const rt = await caches.open(RUNTIME);
  for (const k of old) {
    if (!k.startsWith("lamplight-")) continue;
    const c = await caches.open(k);
    for (const req of await c.keys()) {
      if (!RUNTIME_PATH.test(new URL(req.url).pathname) || (await rt.match(req))) continue;
      const r = await c.match(req);
      if (r) await rt.put(req, r);
    }
  }
}
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const old = keys.filter((k) => k !== CACHE && !KEEP.includes(k));
        await keepRuntime(old).catch(() => null);
        await Promise.all(old.map((k) => caches.delete(k)));
        await renamedOut().catch(() => null);
      })
      .then(() => self.clients.claim())
  );
});

/* Background Fetch (bgfetch.js): the natural voices and the Dutch ↔ English pack, downloaded by the browser itself so
   that closing Lamplight does not stop them. Each file goes into the cache, and under the key, its loader looks up:
   the request's own URL — Piper's model and config in "piper-voices" (workers/piper-worker.js), Kokoro's voice files in
   "kokoro-voices" (kokoro-js) and its model, config and tokenizer in "transformers-cache" (transformers.js), the
   runtime from vendor/kokoro/ and vendor/piper/ in RUNTIME, the pack in "bergamot-models" (workers/mt-worker.js) */
function bgCache(u) {
  const url = new URL(u);
  if (url.origin === "https://huggingface.co") {
    if (url.pathname.startsWith("/rhasspy/piper-voices/")) return "piper-voices";
    if (url.pathname.startsWith("/onnx-community/Kokoro-82M-v1.0-ONNX/")) return /\/resolve\/[^/]+\/voices\//.test(url.pathname) ? "kokoro-voices" : "transformers-cache";
    return null;
  }
  if (url.origin !== self.location.origin) return null;
  if (PACK.test(url.pathname)) return "bergamot-models";
  if (RUNTIME_PATH.test(url.pathname)) return RUNTIME;
  return null;
}
/* the id is key|title when finished|title when stopped, in the interface's language (bgfetch.js) */
const bgTitles = (id) => {
  const p = String(id).split("|");
  return { key: p[0], done: p[1] || "Lamplight: download complete", stopped: p[2] || "Lamplight: download stopped" };
};
async function bgTell(id, state) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) c.postMessage({ type: "BGFETCH", key: bgTitles(id).key, state });
}
/* all or nothing: every file is read and checked (a status of 200, and no shorter than its Content-Length) before any
   is stored, so a pack is never left half on the device */
self.addEventListener("backgroundfetchsuccess", (e) => {
  const reg = e.registration, t = bgTitles(reg.id);
  e.waitUntil((async () => {
    let ok = true;
    try {
      const got = [];
      for (const rec of await reg.matchAll()) {
        const name = bgCache(rec.request.url), res = await rec.responseReady;
        if (!name || !res || !res.ok) throw new Error("not stored: " + rec.request.url);
        const blob = await res.blob(), want = +res.headers.get("content-length") || 0;
        if (!blob.size || (want && blob.size < want)) throw new Error("cut short: " + rec.request.url);
        got.push({ name, url: rec.request.url, blob, type: res.headers.get("content-type") || "application/octet-stream" });
      }
      for (const g of got) {
        const c = await caches.open(g.name);
        await c.put(g.url, new Response(g.blob, { headers: { "Content-Type": g.type, "Content-Length": String(g.blob.size) } }));
      }
    } catch (err) {
      ok = false;
    }
    await e.updateUI({ title: ok ? t.done : t.stopped }).catch(() => null);
    await bgTell(reg.id, ok ? "done" : "failed");
  })());
});
/* stopped (no connection, no room, a file refused): nothing of it is kept; the app says "tap to resume" */
self.addEventListener("backgroundfetchfail", (e) => {
  e.waitUntil((async () => {
    await e.updateUI({ title: bgTitles(e.registration.id).stopped }).catch(() => null);
    await bgTell(e.registration.id, "failed");
  })());
});
self.addEventListener("backgroundfetchabort", (e) => { e.waitUntil(bgTell(e.registration.id, "aborted")); });
/* the notification tapped: Lamplight, open or opened */
self.addEventListener("backgroundfetchclick", (e) => {
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
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
     models, which kokoro-js and the Piper worker cache themselves) go straight to the network, and so do the
     Dutch ↔ English pack's files (PACK above) */
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PACK.test(url.pathname)) return;
  /* the natural voices' runtime: from RUNTIME, else from the network into RUNTIME (never into this version's cache) */
  if (RUNTIME_PATH.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const c = await caches.open(RUNTIME);
        const hit = await c.match(e.request, { ignoreSearch: true });
        if (hit) return asPage(hit);
        const res = await fetch(e.request);
        if (res.ok && res.type === "basic") c.put(e.request, res.clone()).catch(() => null);
        return res.redirected ? res : asPage(res);
      })()
    );
    return;
  }
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
      /* the cached shell was stored under "./"; it is handed back under the URL that was asked for
         (./?shared=1, ./?action=continue) so nothing downstream sees the wrong address (asPage below) */
      if (hit) return asPage(hit);
      try {
        const res = await fetch(e.request);
        /* same-origin files that are not precached land here on first use */
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
