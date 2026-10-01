/* lamplight — downloads that carry on after Lamplight is closed (Background Fetch).
   The natural voices (audiobook.js) and the Dutch ↔ English pack (translate.js) hand their files to the browser with
   registration.backgroundFetch.fetch: Chrome (Android and desktop) shows its own download notification with progress
   and keeps going when the page is closed; sw.js stores every file under the cache and key its loader looks up
   (backgroundfetchsuccess) and keeps nothing of a download that stopped. Loaded on demand by those two files
   (window.llBgFetchNeed below), precached by sw.js.
   window.llBgFetch:
     ok()                                   Background Fetch can be used here (and a service worker controls the page)
     start(key, files, name, cb)            files: [{ url, cache? (Cache Storage name; any cache when left out), bytes }];
                                            only the files not on the device yet are fetched. Resolves "done" (nothing was
                                            missing) or "started"; rejects when the browser refused (the caller downloads in
                                            the page instead). cb({ state: "progress", loaded, total, pct } | { state: "done" }
                                            | { state: "stopped", reason })
     resume(key, files, cb)                 the app was opened again: "running" (cb hears from it from now on), "stopped"
                                            (it ended without finishing: tap to resume), "done" or "none"
     cancel(key)                            stops a running download and forgets it
   The registration's id is key|title when finished|title when stopped: the service worker shows those titles in the
   interface's language without knowing it itself. */
(function(){
  "use strict";
  if (typeof window === "undefined" || window.llBgFetch) return;
  var I18N = window.LL_I18N || null;
  function _t(s, v){ return I18N ? I18N.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, function(m, k){ return k in v ? v[k] : m; }) : s); }
  /* the Dutch of every line of the background downloads (audiobook.js and translate.js use these too) */
  if (I18N && I18N.add) I18N.add({
    "Lamplight: {name}": "Lamplight: {name}",
    "Lamplight: {name} ready": "Lamplight: {name} klaar",
    "Lamplight: download stopped": "Lamplight: download gestopt",
    "Best natural voices": "Beste natuurlijke stemmen",
    "Fast natural voices": "Snelle natuurlijke stemmen",
    "Dutch voices": "Nederlandse stemmen",
    "Dutch ↔ English": "Nederlands ↔ Engels",
    "Keep Lamplight open until it finishes": "Houd Lamplight open tot het klaar is",
    "Downloading — this carries on if you close Lamplight": "Downloaden — dit gaat door als je Lamplight sluit",
    "Downloading… {pct}% · carries on if you close Lamplight": "Downloaden… {pct}% · gaat door als je Lamplight sluit",
    "Download stopped — tap Download to resume": "Download gestopt — tik op Downloaden om verder te gaan",
    "Dutch ↔ English: download stopped — tap Download to resume": "Nederlands ↔ Engels: download gestopt — tik op Downloaden om verder te gaan",
    "The natural voices are still downloading — the device voice reads until then": "De natuurlijke stemmen worden nog gedownload — tot dan leest de stem van je apparaat voor"
  });

  var FLAG = "ll_bg_";            /* localStorage: a download was started for this key and has not been seen to finish */
  var watchers = {};              /* key → cb of the page that is waiting on it */
  function store(k, v){ try { if (v === null) localStorage.removeItem(FLAG + k); else localStorage.setItem(FLAG + k, v); } catch(_){} }
  function flagged(k){ try { return !!localStorage.getItem(FLAG + k); } catch(_){ return false; } }
  function sw(){ return navigator.serviceWorker; }
  function ok(){ return !!(typeof BackgroundFetchManager !== "undefined" && sw() && sw().controller && window.caches); }
  function abs(u){ return new URL(u, document.baseURI).href; }
  function keyOf(id){ return String(id || "").split("|")[0]; }

  /* the files not on the device yet; asking does not make an empty cache (caches.match with cacheName) */
  function missing(files){
    return Promise.all(files.map(function(f){
      return caches.match(abs(f.url), f.cache ? { cacheName: f.cache } : undefined).then(function(r){ return r ? null : f; }, function(){ return f; });
    })).then(function(a){ return a.filter(Boolean); });
  }
  function find(key){
    if (!ok()) return Promise.resolve(null);
    return sw().ready.then(function(reg){
      if (!reg.backgroundFetch) return null;
      return reg.backgroundFetch.getIds().then(function(ids){
        var id = null;
        ids.forEach(function(i){ if (keyOf(i) === key) id = i; });
        return id ? reg.backgroundFetch.get(id) : null;
      });
    }).catch(function(){ return null; });
  }
  /* after the browser finished, sw.js stores the files: the page hears it from sw.js (message below), or sees the
     files arrive (a page that missed the message) */
  function settle(key, files, cb, tries){
    missing(files).then(function(left){
      if (watchers[key] !== cb) return;
      if (!left.length){ delete watchers[key]; store(key, null); cb({ state: "done" }); return; }
      if (tries > 0) setTimeout(function(){ settle(key, files, cb, tries - 1); }, 2000);
      else { delete watchers[key]; cb({ state: "stopped", reason: "store" }); }
    });
  }
  function attach(key, r, files, total, cb){
    watchers[key] = cb;
    var shown = false;
    function look(){
      if (watchers[key] !== cb) return;
      if (r.result === "success"){ if (!shown){ shown = true; settle(key, files, cb, 30); } return; }
      if (r.result === "failure"){ delete watchers[key]; cb({ state: "stopped", reason: r.failureReason || "" }); return; }
      var loaded = r.downloaded || 0;
      cb({ state: "progress", loaded: loaded, total: total, pct: total ? Math.min(99, Math.floor(loaded * 100 / total)) : -1 });
    }
    r.addEventListener("progress", look);
    look();
  }
  if (sw()) sw().addEventListener("message", function(e){
    var d = e.data || {};
    if (d.type !== "BGFETCH" || !watchers[d.key]) return;
    var cb = watchers[d.key];
    if (d.state === "done"){ delete watchers[d.key]; store(d.key, null); cb({ state: "done" }); }
    else { delete watchers[d.key]; cb({ state: "stopped", reason: d.state }); }
  });
  function sum(files){ var n = 0; files.forEach(function(f){ n += f.bytes || 1048576; }); return n; }

  function start(key, files, name, cb){
    if (!ok()) return Promise.reject(new Error("no background fetch"));
    return find(key).then(function(r){
      if (r && r.result === ""){ attach(key, r, files, sum(files), cb); return "started"; }
      return missing(files).then(function(left){
        if (!left.length){ store(key, null); return "done"; }
        var total = sum(left);
        /* the space is asked to stay (a phone short of room would otherwise clear a 100 MB pack first) */
        var persist = navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(function(){ return false; }) : Promise.resolve(false);
        return persist.then(function(){ return sw().ready; }).then(function(reg){
          var id = key + "|" + _t("Lamplight: {name} ready", { name: name }).replace(/\|/g, "/") + "|" + _t("Lamplight: download stopped").replace(/\|/g, "/");
          /* cross-origin files (huggingface.co, which redirects to its CDN) as CORS requests, so the service worker can
             read and store them; downloadTotal has room to spare, since going past it would stop the download */
          var reqs = left.map(function(f){ return new Request(abs(f.url), { mode: "cors", credentials: "omit" }); });
          return reg.backgroundFetch.fetch(id, reqs, {
            title: _t("Lamplight: {name}", { name: name }),
            icons: [{ src: abs("icon-192.png"), sizes: "192x192", type: "image/png" }],
            downloadTotal: Math.ceil(total * 1.05) + 4194304
          });
        }).then(function(r){
          store(key, "1");
          attach(key, r, left, total, cb);
          return "started";
        });
      });
    });
  }
  function resume(key, files, cb){
    if (!ok()) return Promise.resolve("none");
    return find(key).then(function(r){
      if (r && r.result === ""){ attach(key, r, files, sum(files), cb); return "running"; }
      if (r && r.result === "success"){ watchers[key] = cb; settle(key, files, cb, 30); return "running"; }
      if (!flagged(key)) return "none";
      return missing(files).then(function(left){
        if (!left.length){ store(key, null); return "done"; }
        return "stopped";
      });
    });
  }
  function cancel(key){
    delete watchers[key];
    store(key, null);
    return find(key).then(function(r){ return r && r.result === "" ? r.abort() : false; }).catch(function(){ return false; });
  }
  window.llBgFetch = { ok: ok, start: start, resume: resume, cancel: cancel, missing: missing };
})();
