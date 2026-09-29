/* Lamplight — Translate: the tapped word, a selected sentence or the whole book, into the reader's language.
   Three engines, in order of preference: the Dutch ↔ English pack (Firefox Translations / Bergamot in
   workers/mt-worker.js: downloaded once from this site, then on the device and offline — for Dutch and English
   it is preferred over everything else), the browser's built-in on-device translator (Chrome / Edge, where it
   exists), and MyMemory (a free web service) for words and sentences only. Everything translated is cached on
   the device, so a translated book reopens translated, offline.

   Into what: the reader's own language (the device's, navigator.language) for a book in another language; a
   book already in that language gets no translation line when a word is tapped, and Translate book turns a
   Dutch book into English and an English book into Dutch. A language chosen under Translation in the settings
   goes first.

   Loaded on demand by app.js (see LIBS there), which owns the settings group, the menu entries and the card;
   this file talks to the reader through window.__ll and fills the card's .tr-slot. Whole-book translations are
   shown under each block in a shadow root, so #doc's own text nodes are untouched and every character offset
   (positions, highlights, search, read aloud) keeps working. "Translation only" hides each translated block's
   original without taking it out of the text (it keeps its place and its offsets, and takes no room); the
   translation stands in, and a tap or a hold on it shows the original again. */
(function(){
  "use strict";
  /* the interface's language (i18n.js): the English here is the key; without LL_I18N it stays English */
  var I18N = (typeof window !== "undefined" && window.LL_I18N) || null;
  function _t(s, v){ return I18N ? I18N.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, function(m, k){ return k in v ? v[k] : m; }) : s); }
  function _tn(n, one, other, v){ var o = { n: n }; for (var k in v || {}) o[k] = v[k]; return _t(Number(n) === 1 ? one : other, o); }
  function uiLang(){ return I18N ? I18N.lang() : "en"; }
  var L = window.__ll || {};
  var $ = function(s){ return document.querySelector(s); };
  var Store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(_){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(_){} },
    remove: function(k){ try { localStorage.removeItem(k); } catch(_){} }
  };
  /* ll_tr_to: "auto" or a chosen language; ll_tr_view: "only" | "both"; ll_mt_offer: the card offered the pack once */
  var KEY_TO = "ll_tr_to", KEY_FROM = "ll_tr_from", KEY_ON = "ll_tr_on", KEY_VIEW = "ll_tr_view", KEY_OFFER = "ll_mt_offer";
  var RTL = { ar: 1, he: 1, fa: 1, ur: 1 };
  var MM_CODES = { zh: "zh-CN", "zh-Hant": "zh-TW" };   /* MyMemory's names for the two Chinese scripts */
  var SENTENCE_CAP = 2000;                                 /* cached word / sentence records kept */
  var PRIVACY = "The Dutch ↔ English pack and the built-in translator run on your device and send nothing anywhere; the pack is downloaded once from this site. " +
                "MyMemory, a free web service, receives the word or sentence you tap when neither of them can translate it.";   /* shown through _t */

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function norm(s){ return String(s || "").replace(/\s+/g, " ").trim(); }
  function toast(msg){ if (L.Marks && L.Marks.toast) L.Marks.toast(msg); }
  /* for screen readers only, and only now and then (a download starting, a quarter of a book done): the lines that
     change all the time (the pill, the pack's row, the card's offer) are not live regions */
  var liveEl = null;
  function say(msg){
    if (!liveEl){
      liveEl = document.createElement("div");
      liveEl.className = "ll-sr"; liveEl.id = "trLive"; liveEl.setAttribute("aria-live", "polite");
      document.body.appendChild(liveEl);
    }
    liveEl.textContent = msg;
  }
  function online(){ return navigator.onLine !== false; }
  function noop(){}
  /* Library.tx hands back the request itself when a get() found nothing */
  function unwrap(r){ return (r && typeof r === "object" && typeof IDBRequest !== "undefined" && r instanceof IDBRequest) ? null : (r || null); }

  /* ---------- languages: the table lives in the settings select that app.js built ---------- */
  /* the select's names are in the interface's language already (app.js names them through Intl.DisplayNames in Dutch) */
  function nameOf(code){
    var o = document.querySelector('#trLang option[value="' + String(code).replace(/"/g, "") + '"]');
    if (o) return o.textContent.split(" · ")[0];
    if (uiLang() === "nl" && typeof Intl !== "undefined" && Intl.DisplayNames){
      try {
        var n = new Intl.DisplayNames([I18N.locale()], { type: "language" }).of(code === "zh" ? "zh-Hans" : String(code));
        if (n && n !== code) return n.charAt(0).toUpperCase() + n.slice(1);
      } catch(_){}
    }
    return String(code);
  }
  function base(code){ return String(code || "").split("-")[0].toLowerCase(); }
  /* en-US and en are the same language; the two Chinese scripts are not */
  function same(a, b){ return base(a) === base(b) && !(base(a) === "zh" && a !== b); }
  function dirOf(code){ return RTL[base(code)] ? "rtl" : "ltr"; }
  function known(code){
    var sel = $("#trLang");
    return !sel || !!sel.querySelector('option[value="' + String(code).replace(/"/g, "") + '"]');
  }
  /* the reader's language: the device's, when the table has it; else English */
  function readerLang(){
    var nav = String((navigator.languages && navigator.languages[0]) || navigator.language || "en"), b = base(nav);
    if (b === "zh") return /hant|tw|hk|mo/i.test(nav) ? "zh-Hant" : "zh";
    if (b === "nb" || b === "nn") b = "no";
    return known(b) ? b : "en";
  }
  /* a language chosen in the settings (null: automatic) */
  function picked(){
    var v = Store.get(KEY_TO);
    return v && v !== "auto" && known(v) ? v : null;
  }
  /* what a tapped word or a selected sentence is translated into; null: nothing (the text is in the reader's language) */
  function targetFor(src){
    var p = picked(), me = readerLang();
    if (p && !same(src, p)) return p;
    if (!same(src, me)) return me;
    return null;
  }
  /* what Translate book translates into: as above, and a book in the reader's own language into the other
     side of Dutch ↔ English */
  function bookTarget(src){
    return targetFor(src) || (base(src) === "en" ? "nl" : "en");
  }
  function fromPref(){ return Store.get(KEY_FROM) || "auto"; }

  /* ---------- source language: the setting, or a detector on a sample of the book ---------- */
  /* the commonest little words of a few languages: enough to tell a book's language where the browser has no
     detector of its own (Chrome on Android, mostly) */
  var STOP = {
    en: "the and of to in that is was he it for with as his on be at by had not but her she you they this which from have were been",
    nl: "de het een en van ik te dat die in is niet zijn op aan met voor er maar om hij zij ze was als bij ook naar dan wat nog haar hem wel geen zich",
    de: "der die und das ist nicht ein eine zu den mit sich auf für von dem des im auch es war sie er ich nicht wie",
    fr: "le la les et des un une est que qui dans pas pour sur au ne se il elle je vous ce du avec",
    es: "el la los las y que en un una es por con no se lo para del al su como más pero",
    it: "il la le e di che un una non per con del della sono è si gli ma come anche",
    pt: "o a os as e que em um uma não para com do da se é por mais como mas ao",
    sv: "och att det som en är på för med av till den har inte jag var om",
    da: "og at det som en er på for med af til den har ikke jeg var om",
    pl: "i w nie na z się że do to jest jak ale po co tak"
  };
  var STOPSET = {};
  Object.keys(STOP).forEach(function(l){ var s = {}; STOP[l].split(" ").forEach(function(w){ s[w] = 1; }); STOPSET[l] = s; });
  function guess(sample){
    var words = String(sample || "").toLowerCase().match(/[a-zà-öø-ÿąćęłńśźż]+/g) || [];
    if (words.length < 8) return null;
    var score = {};
    words.forEach(function(w){ for (var l in STOPSET) if (STOPSET[l][w]) score[l] = (score[l] || 0) + 1; });
    var ranked = Object.keys(score).sort(function(a, b){ return score[b] - score[a]; });
    var a = score[ranked[0]] || 0, b = score[ranked[1]] || 0;
    return a >= 4 && a >= b * 1.3 ? ranked[0] : null;
  }
  var detected = {};
  function detect(sample){
    sample = String(sample || "").slice(0, 2400);
    if (!sample.trim()) return Promise.resolve("en");
    if (detected[sample] !== undefined) return Promise.resolve(detected[sample]);
    var g = guess(sample);
    if (!(window.LanguageDetector && typeof window.LanguageDetector.create === "function")){ detected[sample] = g || "en"; return Promise.resolve(detected[sample]); }
    return Promise.resolve().then(function(){ return window.LanguageDetector.create(); }).then(function(d){
      return Promise.resolve(d.detect(sample)).then(function(list){ try { if (d.destroy) d.destroy(); } catch(_){} return list; });
    }).then(function(list){
      var best = list && list[0];
      var ok = best && best.detectedLanguage && best.detectedLanguage !== "und" && (best.confidence === undefined || best.confidence >= 0.4);
      detected[sample] = ok ? best.detectedLanguage : (g || "en");
      return detected[sample];
    }).catch(function(){ return g || "en"; });
  }
  /* a sample from inside the book, not its start: a Project Gutenberg book in Dutch opens with an English licence */
  var sampled = { key: null, text: "" };
  function docSample(){
    var d = $("#doc");
    if (!(L.state && L.state.mode === "doc" && d)) return "";
    var key = docId();
    if (sampled.key === key && sampled.text) return sampled.text;
    var s = d.textContent, n = s.length, out = s;
    if (n > 4000) out = [0.2, 0.45, 0.7].map(function(f){ var a = Math.floor(n * f); return s.slice(a, a + 800); }).join(" ");
    sampled = { key: key, text: out };
    return out;
  }
  /* a word or sentence from the open document is in the document's language */
  function resolveFrom(text){
    var f = fromPref();
    if (f !== "auto") return Promise.resolve(f);
    return detect(docSample() || text);
  }

  /* ---------- engine 1: the Dutch ↔ English pack (workers/mt-worker.js) ----------
     One worker, one direction at a time; one paragraph per message, a tapped word or sentence ahead of the
     book's paragraphs. The worker holds about half a gigabyte once it has translated anything, so it is ended
     after half a minute idle, at once when the page is hidden with nothing to do (a phone kills the background
     tab that holds the most memory first), and when the other direction is wanted. Starting it again takes
     about a second. */
  var Pack = (function(){
    var CACHE = "bergamot-models", IDLE_MS = 30000, MB = 50;
    var FILES = ["vendor/bergamot/bergamot-translator-worker.js", "vendor/bergamot/bergamot-translator-worker.wasm",
                 "models/bergamot/vocab.nlen.spm.gz", "models/bergamot/nlen/model.nlen.intgemm.alphas.bin.gz",
                 "models/bergamot/ennl/model.ennl.intgemm.alphas.bin.gz"];
    var SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
    var st = { have: null, dl: null, err: "", broken: "" };
    var w = null, wPair = "", jobs = [], cur = null, seq = 0, idle = null, dl = null, listeners = [], simd = null;
    function supported(){
      if (simd === null){
        try { simd = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array(SIMD)); } catch(_){ simd = false; }
      }
      return !!(simd && typeof Worker === "function" && typeof DecompressionStream === "function" && window.caches && window.caches.open);
    }
    function pairOf(src, t){
      var a = base(src), b = base(t);
      return a === "nl" && b === "en" ? "nlen" : a === "en" && b === "nl" ? "ennl" : "";
    }
    function covers(src, t){ return !!pairOf(src, t); }
    function abs(f){ return new URL(f, document.baseURI).href; }
    /* on this device: all five files in the pack's cache */
    function check(){
      if (!(window.caches && caches.has)) return Promise.resolve(false);
      return caches.has(CACHE).then(function(yes){
        if (!yes) return false;
        return caches.open(CACHE).then(function(c){
          return Promise.all(FILES.map(function(f){ return c.match(abs(f)); }));
        }).then(function(list){ return list.every(Boolean); });
      }).then(function(h){ st.have = h; return h; }, function(){ return false; });
    }
    function available(src, t){
      if (!covers(src, t) || !supported() || st.broken) return Promise.resolve("no");
      return check().then(function(h){ return h ? "ready" : "no"; });
    }
    function notify(){ listeners.forEach(function(fn){ try { fn(st); } catch(_){} }); }
    function on(fn){ listeners.push(fn); }
    function spawn(){
      w = new Worker("./workers/mt-worker.js", { type: "module" });
      w.onmessage = onMsg;
      w.onerror = function(e){
        if (e && e.preventDefault) e.preventDefault();
        fail(_t("couldn’t start ({error})", { error: (e && e.message) || _t("worker error") }));
      };
    }
    function end(){
      clearTimeout(idle);
      if (w){ try { w.terminate(); } catch(_){} }
      w = null; wPair = "";
    }
    function sleepSoon(){
      clearTimeout(idle);
      idle = setTimeout(function(){ if (!cur && !jobs.length && !dl) end(); }, document.visibilityState === "hidden" ? 0 : IDLE_MS);
    }
    /* the reader switched away: nothing waits (a book's run rests while the page is hidden), so the memory goes now;
       a paragraph still under way ends it when it is done (sleepSoon above) */
    document.addEventListener("visibilitychange", function(){
      if (document.visibilityState === "hidden" && w && !cur && !jobs.length && !dl) end();
    });
    function fatalErr(msg){ var e = new Error(msg); e.fatal = true; return e; }
    /* the worker's own reasons (workers/mt-worker.js, in English) in the interface's language */
    function workerMsg(msg){
      var m;
      if (!msg) return msg;
      if ((m = /^couldn’t download (.+) \((\d+)\)$/.exec(msg))) return _t("couldn’t download {file} ({status})", { file: m[1], status: m[2] });
      if ((m = /^the download of (.+) was cut short$/.exec(msg))) return _t("the download of {file} was cut short", { file: m[1] });
      return _t(msg);
    }
    /* the pack cannot run here: everything waiting goes back to the caller, which moves on to the next engine */
    function fail(msg){
      st.broken = msg || _t("couldn’t run");
      var all = (cur ? [cur] : []).concat(jobs);
      cur = null; jobs = [];
      end();
      all.forEach(function(j){ j.reject(fatalErr(st.broken)); });
      if (dl){ var d = dl; dl = null; st.dl = null; d.reject(fatalErr(st.broken)); }
      notify();
    }
    function pump(){
      clearTimeout(idle);
      if (cur) return;
      if (!jobs.length){ sleepSoon(); return; }
      var k = 0;
      for (var i = 1; i < jobs.length; i++) if (jobs[i].prio < jobs[k].prio) k = i;
      var next = jobs.splice(k, 1)[0];
      /* one direction per worker: the other one's half a gigabyte goes with it */
      if (w && wPair && wPair !== next.pair && !dl) end();
      if (!w){ try { spawn(); } catch(err){ jobs.unshift(next); fail(_t("couldn’t start")); return; } }
      cur = next; wPair = next.pair;
      w.postMessage({ type: "translate", id: cur.id, pair: cur.pair, text: cur.text });
    }
    function onMsg(e){
      var m = e.data || {};
      if (m.type === "progress"){
        if (dl){ st.dl = m.total ? Math.max(0, Math.min(1, m.loaded / m.total)) : 0; notify(); }
        return;
      }
      if (m.type === "downloaded" || (m.type === "error" && m.op === "download")){
        var d = dl; dl = null; st.dl = null;
        if (m.type === "downloaded"){ st.have = true; st.err = ""; notify(); if (d) d.resolve(true); }
        else { st.err = workerMsg(m.message) || _t("the download failed"); notify(); if (d) d.reject(new Error(st.err)); }
        pump();
        return;
      }
      if (!cur || m.id !== cur.id) return;
      var j = cur; cur = null;
      if (m.type === "result"){ j.resolve(typeof m.text === "string" ? m.text : ""); pump(); return; }
      if (m.type === "error"){
        if (m.fatal){ jobs.unshift(j); fail(workerMsg(m.message)); return; }
        if (/one direction/.test(m.message || "")){ jobs.unshift(j); end(); pump(); return; }
        j.reject(new Error(m.message || _t("no translation"))); pump();
      }
    }
    function request(pair, text, prio){
      if (st.broken) return Promise.reject(fatalErr(st.broken));
      return new Promise(function(resolve, reject){
        jobs.push({ id: ++seq, pair: pair, text: text, prio: prio, resolve: resolve, reject: reject });
        pump();
      });
    }
    /* the engines' shape: items one by one, hooks.onItem(k, text | null); a fatal error rejects the whole run */
    function translate(items, src, t, hooks){
      var pair = pairOf(src, t), prio = hooks.prio === undefined ? 1 : hooks.prio, i = 0;
      return (function next(){
        if (i >= items.length || !hooks.live()) return Promise.resolve();
        var k = i++;
        return request(pair, items[k], prio).then(function(out){ hooks.onItem(k, out); }, function(err){
          if (err && err.fatal) throw err;
          hooks.onItem(k, null);
        }).then(next);
      })();
    }
    function download(){
      if (dl) return dl.promise;
      if (!supported()) return Promise.reject(new Error(_t("this browser can’t run the pack")));
      var d = {};
      d.promise = new Promise(function(resolve, reject){ d.resolve = resolve; d.reject = reject; });
      dl = d; st.dl = 0; st.err = ""; st.broken = "";
      notify();
      clearTimeout(idle);
      try {
        if (!w) spawn();
        w.postMessage({ type: "download" });
      } catch(err){ dl = null; st.dl = null; st.err = _t("couldn’t start"); notify(); return Promise.reject(err); }
      return d.promise;
    }
    function remove(){
      if (dl){ var d = dl; dl = null; d.reject(new Error("removed")); }
      var all = (cur ? [cur] : []).concat(jobs);
      cur = null; jobs = [];
      end();
      all.forEach(function(j){ j.reject(fatalErr(_t("the pack was removed"))); });
      st.have = false; st.dl = null; st.err = ""; st.broken = "";
      return (window.caches ? caches.delete(CACHE).catch(noop) : Promise.resolve()).then(function(){ st.have = false; notify(); });
    }
    function info(){ return { worker: !!w, pair: wPair, queued: jobs.length, busy: !!cur, have: st.have, dl: st.dl, err: st.err, broken: st.broken, supported: supported() }; }
    return { id: "pack", cache: CACHE, mb: MB, files: FILES, state: st, supported: supported, covers: covers, pairOf: pairOf, check: check,
             available: available, translate: translate, download: download, remove: remove, on: on, stop: end, info: info,
             idle: function(ms){ IDLE_MS = ms; } };
  })();

  /* ---------- engine 2: the browser's built-in translator ---------- */
  var Builtin = (function(){
    var pool = {};   /* "src|to" → Promise<translator>, kept for the session */
    function ok(){ return !!(window.Translator && typeof window.Translator.availability === "function" && typeof window.Translator.create === "function"); }
    /* an availability check that never answers (a browser with the API but no model) counts as "no" */
    function available(src, t){
      if (!ok()) return Promise.resolve("no");
      var asked = Promise.resolve().then(function(){ return window.Translator.availability({ sourceLanguage: src, targetLanguage: t }); });
      var late = new Promise(function(resolve){ setTimeout(function(){ resolve("unavailable"); }, 4000); });
      return Promise.race([asked, late])
        .then(function(a){ return a === "available" ? "ready" : (a === "downloadable" || a === "downloading") ? "download" : "no"; }, function(){ return "no"; });
    }
    /* create() must come from a user gesture the first time a language pack is downloaded */
    function get(src, t, onDownload){
      var k = src + "|" + t;
      if (pool[k]) return pool[k];
      var opts = { sourceLanguage: src, targetLanguage: t };
      opts.monitor = function(m){
        m.addEventListener("downloadprogress", function(e){
          var f = e.total ? e.loaded / e.total : e.loaded;
          if (onDownload) onDownload(Math.max(0, Math.min(1, +f || 0)));
        });
      };
      pool[k] = Promise.resolve().then(function(){ return window.Translator.create(opts); }).catch(function(err){ delete pool[k]; throw err; });
      return pool[k];
    }
    /* the API takes one string at a time: up to four in flight */
    function translate(items, src, t, hooks){
      return get(src, t, hooks.onDownload).then(function(tr){
        return new Promise(function(resolve){
          var i = 0, active = 0;
          function next(){
            if (!hooks.live()){ if (!active) resolve(); return; }
            if (i >= items.length){ if (!active) resolve(); return; }
            var k = i++; active++;
            Promise.resolve().then(function(){ return tr.translate(items[k]); })
              .then(function(out){ hooks.onItem(k, typeof out === "string" ? out : null); }, function(){ hooks.onItem(k, null); })
              .then(function(){ active--; next(); });
          }
          if (!items.length){ resolve(); return; }
          for (var n = 0; n < 4 && n < items.length; n++) next();
        });
      });
    }
    function destroyAll(){
      Object.keys(pool).forEach(function(k){ pool[k].then(function(tr){ try { if (tr.destroy) tr.destroy(); } catch(_){} }).catch(function(){}); });
      pool = {};
    }
    return { id: "builtin", ok: ok, available: available, translate: translate, destroyAll: destroyAll };
  })();

  /* ---------- engine 3: MyMemory, for words and sentences ---------- */
  var MyMemory = (function(){
    var MAX = 480;
    function ok(){ return online(); }
    function available(){ return Promise.resolve(ok() ? "ready" : "no"); }
    function code(c){ return MM_CODES[c] || c; }
    function one(text, src, t){
      var u = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + encodeURIComponent(code(src) + "|" + code(t));
      return fetch(u).then(function(r){ if (!r.ok) throw new Error(_t("MyMemory replied {status}", { status: r.status })); return r.json(); }).then(function(j){
        if (!j || String(j.responseStatus) !== "200" || !j.responseData || typeof j.responseData.translatedText !== "string") throw new Error((j && j.responseDetails) || _t("no translation"));
        return j.responseData.translatedText;
      });
    }
    /* the service takes 480 characters at a time: a long sentence goes in pieces, split after punctuation */
    function pieces(text){
      if (text.length <= MAX) return [text];
      var out = [], rest = text;
      while (rest.length > MAX){
        var cut = Math.max(rest.lastIndexOf(". ", MAX), rest.lastIndexOf(", ", MAX), rest.lastIndexOf("; ", MAX));
        if (cut < MAX / 3) cut = rest.lastIndexOf(" ", MAX);
        if (cut < 1) cut = MAX;
        out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
      }
      if (rest) out.push(rest);
      return out;
    }
    function translate(items, src, t, hooks){
      var i = 0;
      return (function next(){
        if (i >= items.length || !hooks.live()) return Promise.resolve();
        var k = i++;
        return pieces(items[k]).reduce(function(p, part){
          return p.then(function(acc){ return one(part, src, t).then(function(x){ return acc.concat([x]); }); });
        }, Promise.resolve([]))
          .then(function(outs){ hooks.onItem(k, outs.join(" ")); }, function(err){ if (!online()) throw err; hooks.onItem(k, null); })
          .then(next);
      })();
    }
    return { id: "mymemory", ok: ok, available: available, translate: translate };
  })();

  var ENGINES = { pack: Pack, builtin: Builtin, mymemory: MyMemory };
  var LABEL = { pack: "on this device (Dutch ↔ English pack)", builtin: "on-device", mymemory: "by MyMemory (free web service)" };
  /* the line under a translation: the language and the engine, as one sentence */
  function engineLine(lang, engineId){
    if (engineId === "pack") return _t("{lang} · translated on this device (Dutch ↔ English pack)", { lang: lang });
    if (engineId === "builtin") return _t("{lang} · translated on-device", { lang: lang });
    if (engineId === "mymemory") return _t("{lang} · translated by MyMemory (free web service)", { lang: lang });
    return _t("{lang} · translated {how}", { lang: lang, how: LABEL[engineId] || engineId });
  }
  /* which engine handles a job: the pack for Dutch ↔ English once it is here, then the built-in translator (for a
     book also after its download, which the menu press allows), then MyMemory for words and sentences */
  function pick(kind, src, t){
    return Pack.available(src, t).then(function(a){
      if (a === "ready") return { engine: Pack, status: "ready" };
      return Builtin.available(src, t).then(function(b){
        if (b === "ready") return { engine: Builtin, status: "ready" };
        if (kind === "short") return MyMemory.ok() ? { engine: MyMemory, status: "ready" } : null;
        if (b === "download") return { engine: Builtin, status: "download" };
        return null;
      });
    });
  }
  function packOffered(src, t){ return Pack.covers(src, t) && Pack.supported() && !Pack.state.broken; }
  function noEngineNote(src, t){
    if (packOffered(src, t)) return online() ? _t("Couldn’t reach a translator — download Dutch ↔ English under Translation in the settings to translate on this device.")
                                             : _t("Offline — download Dutch ↔ English under Translation in the settings to translate without a connection.");
    return online() ? _t("Nothing here can translate this — use Chrome or Edge for the built-in translator.")
                    : _t("Offline — only cached translations are available.");
  }

  /* ---------- the settings: the status line, the pack's row, the two views ---------- */
  function describe(){
    return resolveFrom("").then(function(src){
      var open = !!docSample();
      var t = open ? bookTarget(src) : (picked() || readerLang());
      var s = open ? src : (same(t, "en") ? "nl" : "en");
      var name = nameOf(t);
      return Promise.all([Pack.available(s, t), Builtin.available(s, t)]).then(function(r){
        var v = { lang: name };
        if (r[0] === "ready") return _t("{lang} · Dutch ↔ English pack ready — instant and offline", v);
        if (r[1] === "ready") return _t("{lang} · built-in translator ready", v);
        if (packOffered(s, t)) return online() ? _t("{lang} · words and sentences via MyMemory; download Dutch ↔ English below for whole books, offline", v)
                                               : _t("{lang} · offline — only cached translations; download Dutch ↔ English below once you are online", v);
        if (r[1] === "download" && online()) return _t("{lang} · built-in translator needs a download (about 30 MB) — Translate book starts it; words meanwhile via MyMemory", v);
        if (online()) return _t("{lang} · words and sentences via MyMemory; use Chrome / Edge for whole documents", v);
        return _t("{lang} · offline — only cached translations", v);
      });
    });
  }
  function refreshHint(){
    syncPack(); syncView();
    var h = $("#trHint");
    if (!h) return Promise.resolve();
    return describe().then(function(s){
      h.textContent = "";
      var b = document.createElement("span"); b.className = "tr-status"; b.textContent = s;
      h.appendChild(b); h.appendChild(document.createTextNode(" " + _t(PRIVACY)));
    }).catch(function(){});
  }
  /* focus: "pack" lands on the pack's download button (Translate book on Dutch or English with nothing to do it) */
  function openSettings(focus){
    var sheet = $("#sheet"), P = window.llPop;
    if (sheet && !sheet.classList.contains("open") && P && P.sheet) P.sheet(true);
    refreshHint();
    setTimeout(function(){
      var g = $("#trGroup"), s = $("#trLang"), d = $("#mtDl");
      if (g){ try { g.scrollIntoView({ block: "center" }); } catch(_){ g.scrollIntoView(); } }
      if (focus === "pack" && d && !d.hidden) d.focus({ preventScroll: true });
      else if (s) s.focus({ preventScroll: true });
    }, 80);
  }
  function mb(n){ return _t("{n} MB", { n: I18N ? I18N.num(Math.round(n)) : Math.round(n) }); }
  /* the pack's row under Translation (#mtState, #mtDl, #mtRm, #mtProgress, made by app.js) */
  function syncPack(){
    var st = $("#mtState"), dl = $("#mtDl"), rm = $("#mtRm"), pr = $("#mtProgress");
    if (!st) return;
    function show(text, canDl, canRm, pct){
      if (st.textContent !== text) st.textContent = text;
      if (dl) dl.hidden = !canDl;
      if (rm) rm.hidden = !canRm;
      if (pr){ pr.hidden = pct < 0; if (pct >= 0) pr.value = pct; }
    }
    var s = Pack.state;
    if (!Pack.supported()){ show(_t("Dutch ↔ English: this browser can’t run the pack (it needs WebAssembly SIMD — Chrome, Edge, Firefox or Safari 16.4 and newer)"), false, false, -1); return; }
    /* #mtState is a live region: its words change when the state does (downloading, then ready); how far the
       download has come is the bar's (#mtProgress), not a new line to read out at every percent */
    if (s.dl !== null){ show(_t("Downloading Dutch ↔ English (≈ {mb} MB)…", { mb: Pack.mb }), false, false, Math.round(s.dl * 100)); return; }
    Pack.check().then(function(have){
      if (Pack.state.dl !== null) return;
      if (have && Pack.state.broken) show(_t("Dutch ↔ English: on this device, but it couldn’t run here ({error}) — the other translators stand in", { error: Pack.state.broken }), false, true, -1);
      else if (have) show(_t("Dutch ↔ English · ready, works offline · {size} on this device", { size: mb(Pack.mb) }), false, true, -1);
      else if (Pack.state.err) show(_t("Dutch ↔ English: the download stopped ({error}) — try again", { error: Pack.state.err }), true, false, -1);
      else show(online() ? _t("Dutch ↔ English: not on this device yet") : _t("Dutch ↔ English: not on this device yet — needs a connection once"), true, false, -1);
    });
  }
  var wantBook = null;          /* Translate book waits for the pack: the document it was asked for */
  function getPack(){
    return Pack.download().then(function(){
      toast(_t("Dutch ↔ English is on this device — translations are instant, and work offline"));
      refreshHint();
      if (wantBook && wantBook === docId() && L.state && L.state.mode === "doc" && !page.on){ wantBook = null; startPage(); }
    }, function(err){
      if (!(err && /removed/.test(err.message || ""))) toast(_t("Dutch ↔ English didn’t download — {error}", { error: (err && err.message) || _t("no connection") }));
      refreshHint();
    });
  }
  function removePack(){
    wantBook = null;
    return Pack.remove().then(function(){ toast(_t("Dutch ↔ English removed from this device")); refreshHint(); });
  }
  Pack.on(function(){ syncPack(); syncOffers(); });

  /* the two views of a translated book: "only" (the translation in place of the original) or "both" */
  function view(){ return Store.get(KEY_VIEW) === "both" ? "both" : "only"; }
  function syncView(){
    var v = view();
    Array.prototype.forEach.call(document.querySelectorAll("#trViewChips .chip"), function(c){
      var on = c.dataset.trview === v; c.classList.toggle("on", on); c.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  function setView(v){
    if (v !== "only" && v !== "both") return;
    Store.set(KEY_VIEW, v);
    syncView();
    applyView();
  }

  /* ---------- the cache: IndexedDB store "translations" (see Library.db in app.js) ---------- */
  var Cache = (function(){
    function tx(mode, fn){ return L.Library && L.Library.tx ? L.Library.tx("translations", mode, fn) : Promise.reject(new Error("no store")); }
    function get(key){ return tx("readonly", function(st){ return st.get(key); }).then(unwrap, function(){ return null; }); }
    function put(rec){ rec.updated = Date.now(); return tx("readwrite", function(st){ st.put(rec); }).catch(function(){}); }
    var writes = 0;
    function putSentence(rec){ return put(rec).then(function(){ if (++writes % 25 === 1) prune(); }); }
    /* word and sentence records are capped; the oldest go first */
    function prune(){
      var range = IDBKeyRange.bound("s|", "s|￿");
      return tx("readonly", function(st){ return st.count(range); }).then(function(n){
        if (!(n > SENTENCE_CAP)) return;
        var drop = n - SENTENCE_CAP + 200, rows = [];
        return tx("readonly", function(st){
          var req = st.openCursor(range);
          req.onsuccess = function(){ var c = req.result; if (c){ rows.push({ key: c.key, updated: c.value.updated || 0 }); c.continue(); } };
        }).then(function(){
          rows.sort(function(a, b){ return a.updated - b.updated; });
          var keys = rows.slice(0, drop).map(function(r){ return r.key; });
          return tx("readwrite", function(st){ keys.forEach(function(k){ st.delete(k); }); });
        });
      }).catch(function(){});
    }
    return { get: get, put: put, putSentence: putSentence, prune: prune };
  })();
  /* documents left translated: { docId: "from|to" } — app.js reads this to fetch the script early */
  function onMap(){ try { var m = JSON.parse(Store.get(KEY_ON) || "{}"); return m && typeof m === "object" ? m : {}; } catch(_){ return {}; } }
  function setOn(id, pair){
    var m = onMap();
    if (pair) m[id] = pair; else delete m[id];
    if (Object.keys(m).length) Store.set(KEY_ON, JSON.stringify(m)); else Store.remove(KEY_ON);
  }

  /* ---------- word and sentence: the card's translation line ----------
     el is the card's .tr-slot; opts.box the line around it (hidden when there is nothing to translate into);
     opts.onResult(text) is called when a translation is shown. It translates by itself, at once: a quiet
     "translating…" meanwhile, and the dictionary beside it is never held up. */
  var memo = {}, slotGen = 0;
  function slot(text, el, opts){
    opts = opts || {};
    text = norm(text);
    if (!text || !el) return;
    var box = opts.box || el, gen = ++slotGen;
    el.dataset.gen = gen;
    function live(){ return el.isConnected && el.dataset.gen === String(gen); }
    function hide(){ box.hidden = true; el.innerHTML = ""; }
    function note(msg){ box.hidden = false; el.innerHTML = '<div class="note">' + esc(msg) + '</div>'; }
    function render(out, engineId, t){
      box.hidden = false;
      el.innerHTML = '<div class="tr-out" lang="' + esc(t) + '" dir="' + dirOf(t) + '"></div>' +
        '<div class="tr-eng">' + esc(engineLine(nameOf(t), engineId)) + '</div>';
      el.querySelector(".tr-out").textContent = out;
      if (opts.onResult) opts.onResult(out);
    }
    function run(src, t, key, tries){
      return pick("short", src, t).then(function(p){
        if (!live()) return;
        if (!p){ note(noEngineNote(src, t)); return; }
        var result = null;
        var hooks = { live: live, prio: 0, onItem: function(k, out){ result = out; } };
        return p.engine.translate([text], src, t, hooks).then(function(){
          if (!live()) return;
          if (typeof result !== "string" || !result.trim()) throw new Error(_t("no translation"));
          memo[key] = { text: result, engine: p.engine.id };
          Cache.putSentence({ key: "s|" + key, text: result, engine: p.engine.id });
          render(result, p.engine.id, t);
        });
      }).catch(function(err){
        if (!live()) return;
        /* the pack could not run here: the next engine, once */
        if (err && err.fatal && !tries) return run(src, t, key, 1);
        el.innerHTML = '<div class="note">' + esc(_t("Couldn’t translate ({error}).", { error: (err && err.message) || _t("no connection") })) + '</div>';
        var b = document.createElement("div"); b.className = "acts";
        b.innerHTML = '<button type="button" class="act tr-go">' + esc(_t("Try again")) + '</button>';
        b.querySelector(".tr-go").addEventListener("click", function(){ el.innerHTML = '<div class="tr-wait">' + esc(_t("translating…")) + '</div>'; run(src, t, key, 0).then(function(){ offer(src, t); }); });
        el.appendChild(b);
      });
    }
    function offer(src, t){ if (live()) offerPack(el, src, t); }
    box.hidden = true;
    resolveFrom(text).then(function(src){
      if (!live()) return;
      var t = targetFor(src);
      if (!t){ hide(); return; }
      var key = src + "|" + t + "|" + text;
      if (memo[key]){ render(memo[key].text, memo[key].engine, t); offer(src, t); return; }
      box.hidden = false;
      el.innerHTML = '<div class="tr-wait">' + esc(_t("translating…")) + '</div>';
      return Cache.get("s|" + key).then(function(rec){
        if (!live()) return;
        if (rec && typeof rec.text === "string"){ memo[key] = { text: rec.text, engine: rec.engine }; render(rec.text, rec.engine, t); offer(src, t); return; }
        return run(src, t, key, 0).then(function(){ offer(src, t); });
      });
    }).catch(function(err){ if (live()) note(_t("Couldn’t translate ({error}).", { error: (err && err.message) || _t("no connection") })); });
  }
  /* the pack is offered in the card once, the first time Dutch or English is translated without it */
  function offerPack(el, src, t){
    if (!packOffered(src, t) || Pack.state.dl !== null || Store.get(KEY_OFFER) || el.querySelector(".tr-offer")) return;
    Pack.check().then(function(have){
      if (have || !el.isConnected || Store.get(KEY_OFFER) || el.querySelector(".tr-offer")) return;
      Store.set(KEY_OFFER, "1");
      var o = document.createElement("div");
      o.className = "tr-offer"; o.setAttribute("role", "group"); o.setAttribute("aria-label", _t("Dutch ↔ English pack"));
      o.innerHTML = '<div class="note tr-offer-msg">' + esc(_t("Download Dutch ↔ English for instant offline translation (≈ {mb} MB, once).", { mb: Pack.mb })) + '</div>' +
        '<div class="acts"><button type="button" class="act go" data-mt="get">' + esc(_t("Download")) + '</button><button type="button" class="act" data-mt="later">' + esc(_t("Not now")) + '</button></div>';
      o.addEventListener("click", function(e){
        var b = e.target.closest && e.target.closest("button[data-mt]");
        if (!b) return;
        if (b.dataset.mt === "later"){ o.remove(); return; }
        getPack();
        syncOffers();
      });
      el.appendChild(o);
    });
  }
  /* the card's translation line is a live region: the offer's words change with the state, and how far the download
     has come is shown by a bar, which is not read out at every percent */
  function syncOffers(){
    Array.prototype.forEach.call(document.querySelectorAll("#dictCard .tr-offer"), function(o){
      var msg = o.querySelector(".tr-offer-msg"), acts = o.querySelector(".acts"), bar = o.querySelector("progress"), s = Pack.state, text = null;
      if (s.dl !== null){
        text = _t("Downloading Dutch ↔ English…");
        if (!bar){
          bar = document.createElement("progress"); bar.max = 100; bar.setAttribute("aria-label", _t("Downloading Dutch ↔ English"));
          msg.parentNode.insertBefore(bar, msg.nextSibling);
        }
        bar.value = Math.round(s.dl * 100);
        if (acts) acts.hidden = true;
      } else {
        if (bar) bar.parentNode.removeChild(bar);
        if (s.have){ text = _t("Dutch ↔ English is ready — instant, and offline."); if (acts) acts.hidden = true; }
        else if (s.err){ text = _t("The download stopped ({error}).", { error: s.err }); if (acts) acts.hidden = false; }
      }
      if (text !== null && msg.textContent !== text) msg.textContent = text;
    });
  }

  /* ---------- the whole book ---------- */
  var SEL = "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt, figcaption, div.plain";
  var HIDEABLE = /^(P|H[1-6]|LI|BLOCKQUOTE|DD|DT|FIGCAPTION|DIV)$/;   /* a table cell keeps its original beside the translation */
  var SEP = /\r?\n[ \t\r]*\n/g;
  var LETTER;
  try { LETTER = new RegExp("\\p{L}", "gu"); } catch(_){ LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g; }
  function letters(s){ var m = s.match(LETTER); return m ? m.length : 0; }
  function firstText(el){ return document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); }
  /* the blocks in reading order: the innermost p / heading / li / …; a plain-text file is one
     div whose paragraphs (blank-line separated) count as blocks. A block's index in this list is
     its key in the cache. */
  function collect(){
    var doc = $("#doc"), out = [];
    if (!doc) return out;
    var els = Array.prototype.slice.call(doc.querySelectorAll(SEL)).filter(function(b){ return !b.querySelector(SEL); });
    els.forEach(function(el){
      var first = firstText(el);
      if (!first) return;
      if (el.classList.contains("plain")){
        var raw = el.textContent, pos = 0, segs = [], m;
        SEP.lastIndex = 0;
        while ((m = SEP.exec(raw))){ segs.push([pos, m.index, m.index + m[0].indexOf("\n") + 1]); pos = m.index + m[0].length; }
        segs.push([pos, raw.length, raw.length]);
        segs.forEach(function(sg){
          var text = norm(raw.slice(sg[0], sg[1]));
          if (letters(text) < 2) return;
          out.push({ el: el, text: text, tag: "P", plain: true, at: sg[2], first: first, rel: sg[0] });
        });
      } else {
        var text = norm(el.textContent);
        if (letters(text) < 2) return;
        out.push({ el: el, text: text, tag: el.tagName, plain: false, first: first, rel: 0 });
      }
    });
    return out;
  }
  function offsetOf(b){
    if (b.off === undefined){ var o = L.Anchor ? L.Anchor.offsetOf(b.first, 0) : null; b.off = o === null ? 0 : o + b.rel; }
    return b.off;
  }
  function spanOf(b){ return b.plain ? b.at - b.rel : b.el.textContent.length; }
  /* many paragraphs of a plain-text file about to get their translations (a book reopened translated): its div is
     cut first, in one pass, where each translation goes (and, in "Translation only", where each original starts),
     rather than cutting the book's one big text node again for each (every cut copies what is left of it). Only
     where something is put in at once, in the same task: text nodes left side by side would be merged back by the
     next normalize() (a highlight redrawn, a tapped word let go), which on a whole book takes minutes. */
  function presplit(blocks, only){
    var divs = [], cuts = [];
    blocks.forEach(function(b){
      if (!b.plain) return;
      var i = divs.indexOf(b.el);
      if (i < 0){ i = divs.length; divs.push(b.el); cuts.push([]); }
      cuts[i].push(b.at);
      if (only) cuts[i].push(b.rel);
    });
    divs.forEach(function(div, i){
      var cs = cuts[i].sort(function(a, b){ return a - b; }), list = [], w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT), n, sum = 0, ci = 0;
      while ((n = w.nextNode())) list.push(n);
      list.forEach(function(node){
        var s = sum, len = node.length, inner = [];
        sum += len;
        while (ci < cs.length && cs[ci] <= s) ci++;
        for (var j = ci; j < cs.length && cs[j] < s + len; j++) if (!inner.length || inner[inner.length - 1] !== cs[j] - s) inner.push(cs[j] - s);
        if (!inner.length) return;
        var data = node.data, frag = document.createDocumentFragment(), pos = inner[0];
        inner.concat([len]).slice(1).forEach(function(k){ if (k > pos){ frag.appendChild(document.createTextNode(data.slice(pos, k))); pos = k; } });
        node.data = data.slice(0, inner[0]);
        node.parentNode.insertBefore(frag, node.nextSibling);
      });
    });
  }
  function topOffset(){
    try { var t = L.Library && L.Library.topCharOffset ? L.Library.topCharOffset() : null; return typeof t === "number" ? t : null; } catch(_){ return null; }
  }

  /* the translation under a block: a host element whose content lives in a shadow root — readable
     and selectable, but not part of #doc's text nodes. In "Translation only" (.only) it reads as the text itself. */
  var HOST_CSS =
    ":host{display:block; margin:-0.6em 0 1em; padding:.35em 0 .1em .75em; border-left:2px solid var(--accent); color:var(--muted);" +
    " font-style:italic; font-size:.95em; line-height:1.55; white-space:normal; -webkit-hyphens:manual; hyphens:manual; text-align:start;}" +
    ":host([dir=rtl]){padding:.35em .75em .1em 0; border-left:0; border-right:2px solid var(--accent);}" +
    ":host(.txt){margin:.15em 0 0;}" +
    ":host(.li){margin:-0.1em 0 .45em;}" +
    ":host(.only){margin:0 0 var(--pgap, 1em); padding:0; border:0; color:inherit; font-style:normal; font-size:1em; line-height:inherit;}" +
    ":host(.only.txt){margin:0;}" +
    ":host(.h){font-style:normal; font-weight:700; line-height:1.3; margin:-0.35em 0 .9em;}" +
    ":host(.only.h){margin:1.4em 0 .55em;}" +
    ":host(.h1){font-size:1.4em;} :host(.h2){font-size:1.2em;} :host(.h3){font-size:1.06em;}" +
    ":host(.miss){font-style:normal; font-size:.72em; letter-spacing:.06em; text-transform:uppercase; border-left-style:dotted; border-right-style:dotted; padding-top:.15em;}" +
    ".t{overflow-wrap:break-word;}";
  var sheet = null;
  function styleRoot(root){
    if (sheet === null){ try { sheet = new CSSStyleSheet(); sheet.replaceSync(HOST_CSS); } catch(_){ sheet = false; } }
    if (sheet && "adoptedStyleSheets" in root){ try { root.adoptedStyleSheets = [sheet]; return; } catch(_){} }
    var st = document.createElement("style"); st.textContent = HOST_CSS; root.appendChild(st);
  }
  /* a place among a plain-text div's text nodes: { div, node, sum } — a text node and the offset it starts at. Many
     blocks handled in reading order (a book reopened translated, a change of view) each start where the last one
     left off, not at the top: a whole book in one div is thousands of nodes. Splitting a node or wrapping it in a
     span leaves it where it starts, so a cursor stays good while the text itself is untouched. */
  function walkFrom(div, cur, pos){
    var w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    if (cur && cur.div === div && cur.node && cur.sum <= pos && div.contains(cur.node)){ w.currentNode = cur.node; return { w: w, n: cur.node, sum: cur.sum }; }
    return { w: w, n: w.nextNode(), sum: 0 };
  }
  function keep(cur, div, node, sum){ if (cur){ cur.div = div; cur.node = node; cur.sum = sum; } }
  function insertHost(b, el, cur){
    if (!b.plain){ b.el.parentNode.insertBefore(el, b.el.nextSibling); return; }
    /* a plain-text file is one text node: it is split after the newline that ends the paragraph
       so the host can sit between paragraphs — the concatenated text, and with it every
       character offset, is exactly what it was */
    var at = b.at, p = walkFrom(b.el, cur, at), w = p.w, n = p.n, sum = p.sum;
    while (n){
      var len = n.length;
      if (at <= sum + len){
        var k = at - sum, top = n;
        keep(cur, b.el, n, sum);
        while (top.parentNode && top.parentNode !== b.el) top = top.parentNode;   /* inside a highlight: go after it */
        if (top !== n){ b.el.insertBefore(el, top.nextSibling); return; }
        if (k <= 0){ b.el.insertBefore(el, n); return; }
        if (k >= len){ b.el.insertBefore(el, n.nextSibling); return; }
        b.el.insertBefore(el, n.splitText(k));
        return;
      }
      sum += len;
      n = w.nextNode();
    }
    b.el.appendChild(el);
  }
  /* cur: a cursor (see walkFrom) when blocks come in reading order, many at once */
  function host(b, text, lang, miss, cur){
    var el = b.host;
    if (!el || !el.isConnected){
      el = document.createElement("div");
      el.className = "ll-tr";
      var root = el.attachShadow({ mode: "open" });
      styleRoot(root);
      var body = document.createElement("div"); body.className = "t"; root.appendChild(body);
      var tag = String(b.tag).toLowerCase();
      if (b.plain) el.classList.add("txt");      /* not "plain": that would make it a block of its own */
      if (tag === "li") el.classList.add("li");
      if (/^h[1-6]$/.test(tag)){ el.classList.add("h"); el.classList.add(tag); }
      /* where its original starts and how long it is: app.js reads the reading position off a translation
         standing in for its original (Library.topCharOffset) */
      el.setAttribute("data-ll-off", String(offsetOf(b)));
      el.setAttribute("data-ll-len", String(spanOf(b)));
      el._llBlock = b;
      var c0 = cur ? { div: cur.div, node: cur.node, sum: cur.sum } : null;
      insertHost(b, el, c0);
      b.host = el; page.hosts.push(el);
    }
    b.ok = !miss;
    el.classList.toggle("miss", !!miss);
    el.setAttribute("lang", miss ? uiLang() : lang);            /* the "couldn’t translate" mark is in the interface's language */
    el.setAttribute("dir", miss ? "ltr" : dirOf(lang));
    el.shadowRoot.querySelector(".t").textContent = miss ? _t("couldn’t translate") : text;
    shown(b, cur);
    if (cur && c0 && c0.node && !b.hidden) keep(cur, c0.div, c0.node, c0.sum);
    return el;
  }

  /* ---- "Translation only": a translated block's original is kept where it is but hidden (.ll-trsrc in app.css:
     no room, not painted, still laid out, so every offset still has a place on the page); a plain-text
     paragraph's text nodes are wrapped in spans for it — the text itself is not touched ---- */
  function hideable(b){ return b.plain || HIDEABLE.test(b.tag); }
  function hideSrc(b, cur){
    if (b.hidden || !hideable(b)) return;
    b.hidden = true;
    if (!b.plain){ b.el.classList.add("ll-trsrc"); return; }
    var p = walkFrom(b.el, cur, b.rel), w = p.w, n = p.n, sum = p.sum, list = [], spans = [];
    while (n && sum < b.at){ list.push([n, sum]); sum += n.length; n = w.nextNode(); }
    list.forEach(function(x){
      var node = x[0], s = x[1], e = s + node.length;
      if (e <= b.rel || s >= b.at) return;
      keep(cur, b.el, x[0], s);
      var a = Math.max(b.rel, s) - s, z = Math.min(b.at, e) - s;
      if (z <= a) return;
      if (a > 0) node = node.splitText(a);
      if (z - a < node.length) node.splitText(z - a);
      var sp = document.createElement("span");
      sp.className = "ll-trsrc";
      node.parentNode.insertBefore(sp, node); sp.appendChild(node);
      spans.push(sp);
    });
    b.spans = spans;
  }
  /* true when a plain-text paragraph was unwrapped: its div's text nodes are merged again by the caller, once */
  function showSrc(b){
    if (!b.hidden) return false;
    b.hidden = false; b.peek = false;
    if (!b.plain){ b.el.classList.remove("ll-trsrc"); b.el.classList.remove("ll-trpeek"); return false; }
    (b.spans || []).forEach(function(sp){
      var p = sp.parentNode; if (!p) return;
      while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
      p.removeChild(sp);
    });
    b.spans = null;
    return true;
  }
  /* adjacent text nodes made one again, in one pass: normalize() copies the growing text at every merge, which
     for a whole book in one plain-text div takes minutes */
  function mergeIn(el){
    var k = el.firstChild;
    while (k){
      if (k.nodeType === 3){
        var run = [k], n = k.nextSibling;
        while (n && n.nodeType === 3){ run.push(n); n = n.nextSibling; }
        if (run.length > 1){
          k.data = run.map(function(x){ return x.data; }).join("");
          for (var i = 1; i < run.length; i++) el.removeChild(run[i]);
        } else if (!k.length) el.removeChild(k);
        k = n;
      } else {
        if (k.nodeType === 1 && !(k.classList && k.classList.contains("ll-tr"))) mergeIn(k);
        k = k.nextSibling;
      }
    }
  }
  function mergeText(list){
    var seen = [];
    list.forEach(function(el){ if (el && seen.indexOf(el) < 0){ seen.push(el); mergeIn(el); } });
  }
  /* a block as the view wants it */
  function shown(b, cur){
    var only = page.on && view() === "only" && b.ok && b.host && b.host.isConnected, merged = false;
    if (only) hideSrc(b, cur); else merged = showSrc(b);
    if (b.host) b.host.classList.toggle("only", !!(only && b.hidden));
    return merged;
  }
  function applyView(){
    if (!page.blocks || !page.on) return;
    var top = L.state && L.state.flow !== "pages" ? topOffset() : null;
    var plain = [], cur = {};
    page.blocks.forEach(function(b){ if (b.host && shown(b, cur)) plain.push(b.el); });
    mergeText(plain);
    relayout();
    if (typeof top === "number" && L.revealOffset) L.revealOffset(top);
  }
  /* a tap or a hold on a translation standing in for its original shows the original above it (and hides it again) */
  function peek(h){
    var b = h && h._llBlock;
    if (!b || !b.hidden) return;
    b.peek = !b.peek;
    if (b.plain) (b.spans || []).forEach(function(sp){ sp.classList.toggle("ll-trpeek", b.peek); });
    else b.el.classList.toggle("ll-trpeek", b.peek);
    relayoutSoon();
  }
  function dictMode(){ return Store.get("ll_dictmode") || "tap"; }
  function onlyHost(e){ var t = e.target; return t && t.closest ? t.closest("#doc .ll-tr.only") : null; }
  function middle(x){
    if (!document.body.classList.contains("paged")) return true;
    var v = $("#docView"); if (!v) return true;
    var r = v.getBoundingClientRect(), f = (x - r.left) / r.width;
    return f >= 0.35 && f <= 0.65;
  }
  var heldAt = 0, holdTimer = null, holdX = 0, holdY = 0;
  document.addEventListener("click", function(e){
    /* the click a hold leaves behind lands on the original it just showed: not a tap on a word */
    if (Date.now() - heldAt < 800 && e.target && e.target.closest && e.target.closest("#doc")){ heldAt = 0; e.stopPropagation(); e.preventDefault(); return; }
    var h = onlyHost(e);
    if (!h) return;
    if (dictMode() !== "tap" || !middle(e.clientX)) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    e.stopPropagation();
    peek(h);
  }, true);
  document.addEventListener("touchstart", function(e){
    clearTimeout(holdTimer);
    var h = onlyHost(e);
    if (!h || dictMode() === "off" || e.touches.length > 1) return;
    holdX = e.touches[0].clientX; holdY = e.touches[0].clientY;
    holdTimer = setTimeout(function(){ heldAt = Date.now(); if (navigator.vibrate) navigator.vibrate(12); peek(h); }, 480);
  }, { passive: true });
  document.addEventListener("touchmove", function(e){
    if (e.touches.length && (Math.abs(e.touches[0].clientX - holdX) > 12 || Math.abs(e.touches[0].clientY - holdY) > 12)) clearTimeout(holdTimer);
  }, { passive: true });
  document.addEventListener("touchend", function(){ clearTimeout(holdTimer); }, { passive: true });
  document.addEventListener("contextmenu", function(e){
    var h = onlyHost(e);
    if (!h || dictMode() === "off") return;
    if (Date.now() - heldAt < 800){ e.preventDefault(); return; }
    e.preventDefault();
    peek(h);
  });

  var page = { on: false, running: false, gen: 0, key: null, docKey: null, pair: null, blocks: null, hosts: [], missing: [],
               done: 0, total: 0, engine: null, record: null, download: null, job: null, held: false, failed: {},
               rate: null, leftChars: 0, cur: 0, curAt: 0, etaMin: null, etaAt: 0, said: null };
  function docId(){
    var id = L.Library && L.Library.currentId ? L.Library.currentId() : null;
    return id || ("t-" + (($("#fname") || {}).textContent || "") + "-" + (L.Anchor ? L.Anchor.textLength() : 0));
  }
  function isOn(){ return !!page.on && !!L.state && L.state.mode === "doc"; }
  function isPartial(){ return isOn() && !page.running && page.missing.length > 0; }

  /* ---- the status pill: how far, and how long is left ---- */
  var statusEl = null;
  /* the minutes left, worked out again after every paragraph, swing back and forth by one: the number shown only goes
     down, and up again only after half a minute */
  function eta(){
    var r = page.rate;
    if (!r || r.ms < 2500 || r.chars < 300 || !page.leftChars) return "";
    var min = Math.round(page.leftChars / (r.chars / r.ms) / 60000), now = Date.now();
    if (page.etaMin === null || min < page.etaMin || now - page.etaAt > 30000){ page.etaMin = min; page.etaAt = now; }
    min = page.etaMin;
    if (min < 1) return _t("less than a minute left");
    if (min < 90) return _t("about {n} min left", { n: min });
    var h = Math.floor(min / 60), m = Math.round((min - h * 60) / 5) * 5;
    return m ? _t("about {h} h {m} min left", { h: h, m: m }) : _t("about {h} h left", { h: h });
  }
  /* not a live region: its text changes with every paragraph. The start, a pause and the end are toasts (which are
     read out), and a screen reader hears each quarter of the book as it is done (say) */
  function status(){
    if (!statusEl){
      statusEl = document.createElement("div");
      statusEl.id = "trStatus"; statusEl.setAttribute("role", "group"); statusEl.setAttribute("aria-label", _t("Translation"));
      statusEl.innerHTML = '<span class="tr-msg"></span><button type="button" class="tr-x">' + esc(_t("Pause")) + '</button>';
      statusEl.querySelector(".tr-x").addEventListener("click", cancel);
      document.body.appendChild(statusEl);
    }
    var msg;
    if (page.download !== null && page.download !== undefined) msg = _t("Downloading the {lang} translator… {pct} %", { lang: nameOf(page.pair.split("|")[1]), pct: Math.round(page.download * 100) });
    else {
      var left = eta(), pct = page.total ? Math.floor(page.done / page.total * 100) : 0, q = Math.floor(pct / 25);
      msg = left ? _t("Translating… {pct} % · {left}", { pct: pct, left: left }) : _t("Translating… {pct} %", { pct: pct });
      if (page.said === null || page.said === undefined) page.said = q;
      else if (q > page.said && q < 4){ page.said = q; say(_t("Translation {pct} % done", { pct: q * 25 })); }
    }
    var m = statusEl.querySelector(".tr-msg");
    if (m.textContent !== msg) m.textContent = msg;
    statusEl.title = _t("{done} of {total} paragraphs translated", { done: page.done, total: page.total });
    statusEl.classList.add("on");
  }
  function hideStatus(){ if (statusEl) statusEl.classList.remove("on"); }

  /* ---- layout and saving, a moment after blocks arrive ---- */
  var layoutTimer = null, saveTimer = null;
  function relayout(){
    if (L.Anchor) L.Anchor.invalidate();
    /* Pages flow lays the columns out again (app.js, landing on the same text); Scroll flow just grows. Not through
       a made-up resize: the other resize handlers (the selection's pill, the bars) have nothing to do then */
    if (L.state && L.state.mode === "doc" && L.state.flow === "pages"){
      if (typeof L.relayoutPages === "function"){ try { L.relayoutPages(); } catch(_){} }
      else { try { window.dispatchEvent(new Event("resize")); } catch(_){} }
    }
  }
  function relayoutSoon(){ clearTimeout(layoutTimer); layoutTimer = setTimeout(relayout, 250); }

  /* ---- what the engine sends back goes onto the page a few paragraphs at a time ----
     Putting a translation in costs a layout of what follows it: in Pages flow of the rest of the book (its columns
     are laid out again), and in a plain-text file of the rest of its one big text node, in either flow — a tenth of
     a second or more each on a long book, several times that on a phone. So arrivals wait and go in together, in one
     pass with one layout (the plain-text cuts made at once by presplit, as for a book reopened translated): soon when
     one is on the screen (the paragraph being read and the next few) or nothing is shown yet, else about nine
     times the last pass's cost after it, so that this work takes a tenth of the main thread at most (a few tenths of
     a second apart for an HTML book on a computer, up to eight seconds for a long plain-text book in Pages flow on
     a phone). What arrived is in the saved record at once; only its place on the page waits. */
  var arrived = [], flushTimer = null, flushDue = 0, flushAt = 0, flushCost = 0, flushSeq = 0;
  function onScreen(i){ var c = page.cur || 0; return i >= c && i <= c + 4; }
  function schedule(ms){
    var due = Date.now() + ms;
    if (flushTimer && flushDue <= due) return;
    clearTimeout(flushTimer); flushDue = due; flushTimer = setTimeout(flush, ms);
  }
  function arrive(i, text, lang){
    arrived.push({ i: i, text: text, lang: lang, gen: page.gen });
    var soon = !page.hosts.length || arrived.some(function(a){ return onScreen(a.i); });
    /* on the screen: at once, unless the last pass is not long over (what arrives meanwhile goes in with it) */
    schedule(Math.max(soon ? 120 : 250, flushAt + (soon ? flushCost * 2 : Math.min(8000, Math.max(400, flushCost * 9))) - Date.now()));
  }
  function dropArrived(){ arrived = []; clearTimeout(flushTimer); flushTimer = null; flushCost = 0; flushAt = 0; flushSeq++; }
  function flush(){
    clearTimeout(flushTimer); flushTimer = null;
    var list = arrived; arrived = [];
    if (!page.on || !page.blocks) return;
    var by = {};
    list.forEach(function(a){ if (a.gen === page.gen && page.blocks[a.i]) by[a.i] = a; });   /* the last word on a block wins */
    list = Object.keys(by).map(function(k){ return by[k]; }).sort(function(a, b){ return a.i - b.i; });
    if (!list.length) return;
    var t0 = Date.now(), fresh = list.filter(function(a){ var b = page.blocks[a.i]; return !(b.host && b.host.isConnected); });
    function blockOf(a){ return page.blocks[a.i]; }
    presplit(fresh.filter(function(a){ return a.text !== null; }).map(blockOf), view() === "only");
    presplit(fresh.filter(function(a){ return a.text === null; }).map(blockOf), false);
    var cur = {};
    list.forEach(function(a){ host(page.blocks[a.i], a.text || "", a.lang, a.text === null, cur); });
    relayout();
    var seq = ++flushSeq;
    flushAt = Date.now(); flushCost = Math.max(flushCost, flushAt - t0);      /* until the frame has said */
    /* the frame that follows counts too: the layout, and in Pages flow the paint properties of every column, which
       cost more than the pass itself */
    if (window.requestAnimationFrame) requestAnimationFrame(function(){
      setTimeout(function(){ if (seq === flushSeq) flushCost = Date.now() - t0; }, 0);
    });
  }
  function save(){
    clearTimeout(saveTimer); saveTimer = null;
    if (!page.record || !page.key) return Promise.resolve();
    page.record.key = page.key; page.record.engine = page.engine || page.record.engine || ""; page.record.n = page.total;
    return Cache.put(page.record);
  }
  function saveSoon(){ if (!saveTimer) saveTimer = setTimeout(save, 1500); }

  /* what the cache holds goes in at once; the rest is listed for the engines */
  function applyRecord(rec, t){
    page.record = rec && rec.blocks ? rec : { key: page.key, blocks: {}, engine: "", n: page.total };
    var missing = [], left = 0, cur = {};
    presplit(page.blocks.filter(function(b, i){ return typeof page.record.blocks[String(i)] === "string" && !b.host; }), view() === "only");
    page.blocks.forEach(function(b, i){
      var x = page.record.blocks[String(i)];
      if (typeof x === "string"){ host(b, x, t, false, cur); page.done++; } else { missing.push(i); left += b.text.length; }
    });
    page.missing = missing; page.leftChars = left;
    relayout();
  }
  function begin(id, pair){
    page.blocks = collect();
    if (!page.blocks.length) return false;
    page.blocks.forEach(offsetOf);                  /* one pass over the text nodes, while nothing has moved */
    page.pair = pair; page.docKey = id; page.key = id + "|" + pair;
    page.on = true; page.running = false; page.held = false; page.missing = []; page.done = 0; page.total = page.blocks.length;
    page.engine = null; page.download = null; page.failed = {}; page.rate = null; page.leftChars = 0; page.curAt = 0;
    return true;
  }
  function startPage(){
    var gen = ++page.gen;
    return resolveFrom(docSample()).then(function(src){
      if (gen !== page.gen) return;
      var t = bookTarget(src);
      if (same(src, t)){ toast(_t("This document is already in {lang}.", { lang: nameOf(t) })); return; }
      var pair = src + "|" + t;
      if (!begin(docId(), pair)){ toast(_t("Nothing to translate here.")); return; }
      return Cache.get(page.key).then(function(rec){
        if (gen !== page.gen) return;
        applyRecord(rec, t);
        setOn(page.docKey, pair);
        if (!page.missing.length){ toast(_t("Translated into {lang} — from the cache", { lang: nameOf(t) })); return; }
        return translateMissing(false);
      });
    });
  }
  /* the block at the top of the screen (by its start offset) */
  function readingBlock(){
    var top = topOffset(), bl = page.blocks;
    if (top === null || !bl || !bl.length) return page.cur || 0;
    var lo = 0, hi = bl.length - 1;
    while (lo < hi){ var mid = (lo + hi + 1) >> 1; if (offsetOf(bl[mid]) <= top) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /* what to translate next: from the paragraph being read onward, then back from it — looked at again every few
     seconds, so a jump to another chapter is followed */
  function nextBatch(n){
    var now = Date.now();
    if (!page.curAt || now - page.curAt > 2500){ page.cur = readingBlock(); page.curAt = now; }
    var miss = page.missing, out = [], lo = 0, hi = miss.length, j;
    while (lo < hi){ var mid = (lo + hi) >> 1; if (miss[mid] < page.cur) lo = mid + 1; else hi = mid; }
    for (j = lo; j < miss.length && out.length < n; j++) if (!page.failed[miss[j]]) out.push(miss[j]);
    for (j = lo - 1; j >= 0 && out.length < n; j--) if (!page.failed[miss[j]]) out.push(miss[j]);
    return out;
  }
  /* auto: carrying on by itself (the book reopened mid-way): only with an engine that needs no download */
  function translateMissing(auto){
    var gen = page.gen, parts = page.pair.split("|"), src = parts[0], t = parts[1];
    if (!page.missing.length) return Promise.resolve();
    return pick("page", src, t).then(function(p){
      if (gen !== page.gen) return;
      if (!p || (auto && p.status !== "ready")){
        if (auto) return;
        if (page.done) toast(online() ? _t("No translator for the rest — see Translation in the settings") : _t("Offline — showing the cached translation"));
        else {
          showOriginal();
          if (packOffered(src, t)){ wantBook = docId(); toast(_t("Download Dutch ↔ English to translate this book on this device")); openSettings("pack"); }
          else openSettings();
        }
        return;
      }
      page.running = true; page.held = false; page.failed = {}; page.engine = p.engine.id; page.download = p.status === "download" ? 0 : null;
      page.rate = { chars: 0, ms: 0 }; page.curAt = 0; page.etaMin = null; page.etaAt = 0; page.said = null;
      page.record.job = "on"; saveSoon();
      status();
      if (!page.done) toast(_t("Translating into {lang}…", { lang: nameOf(t) }));
      return new Promise(function(resolve){
        page.job = { gen: gen, engine: p.engine, src: src, t: t, busy: false, resolve: resolve };
        step(page.job);
      });
    });
  }
  function step(job){
    job = job || page.job;
    if (!job || page.job !== job || job.busy) return;
    if (job.gen !== page.gen || !page.running){ finish(job, null); return; }
    /* the page is hidden: the work waits for it to come back (see visibilitychange below) */
    if (document.visibilityState === "hidden"){ page.held = true; save(); return; }
    page.held = false;
    var idx = nextBatch(job.engine === Pack ? 1 : 8);
    if (!idx.length){ finish(job, null); return; }
    var items = idx.map(function(i){ return page.blocks[i].text; });
    var chars = items.reduce(function(a, s){ return a + s.length; }, 0), t0 = Date.now(), gen = job.gen;
    var hooks = {
      prio: 1,
      live: function(){ return gen === page.gen && page.running; },
      onDownload: function(f){ if (gen === page.gen && page.running){ page.download = f; status(); } },
      onItem: function(k, text){
        if (gen !== page.gen) return;                    /* what arrives after a pause is still kept */
        var i = idx[k], b = page.blocks[i];
        page.download = null;
        if (typeof text === "string" && text.trim()){
          page.record.blocks[String(i)] = text;
          arrive(i, text, job.t);
          page.done++;
          page.leftChars = Math.max(0, page.leftChars - b.text.length);
          page.missing = page.missing.filter(function(x){ return x !== i; });
        } else { arrive(i, null, job.t); page.failed[i] = true; }
        if (page.running) status();
        saveSoon();
      }
    };
    job.busy = true;
    job.engine.translate(items, job.src, job.t, hooks).then(function(){
      job.busy = false;
      var ms = Date.now() - t0;
      if (page.rate && ms < 60000){ page.rate.ms += ms; page.rate.chars += chars; }   /* a batch that sat out a sleep says nothing about speed */
      step(job);
    }, function(err){ job.busy = false; finish(job, err || new Error(_t("stopped"))); });
  }
  function finish(job, err){
    if (page.job !== job) return;
    page.job = null;
    if (job.gen !== page.gen){ job.resolve(); return; }
    var cancelled = !page.running;
    flush();                                            /* what arrived goes onto the page now */
    page.running = false; page.held = false; page.download = null;
    if (page.record) page.record.job = page.missing.length ? "paused" : "done";
    hideStatus(); save();
    var name = nameOf(job.t);
    if (err){
      console.warn("translate: paused", err);
      toast(err.fatal ? _t("Translation paused — the Dutch ↔ English pack couldn’t run here ({error})", { error: err.message })
                      : !online() ? _t("Translation paused — no connection")
                      : err.message ? _t("Translation paused — {error}", { error: err.message }) : _t("Translation paused — something went wrong"));
    } else if (cancelled) toast(_t("Translation paused — what arrived stays; Translate the rest carries on"));
    else if (page.missing.length) toast(_tn(page.missing.length, "Translated into {lang} · 1 block couldn’t be translated", "Translated into {lang} · {n} blocks couldn’t be translated", { lang: name }));
    else toast(_t("Translated into {lang}", { lang: name }));
    job.resolve();
  }
  function cancel(){ if (page.running){ page.running = false; hideStatus(); if (page.job && !page.job.busy) step(page.job); } }
  function removeHosts(){
    dropArrived();
    var parents = [];
    (page.blocks || []).forEach(function(b){ if (showSrc(b) && parents.indexOf(b.el) < 0) parents.push(b.el); });
    page.hosts.forEach(function(h){
      var p = h.parentNode; if (!p) return;
      p.removeChild(h);
      if (p.classList && p.classList.contains("plain") && parents.indexOf(p) < 0) parents.push(p);
    });
    mergeText(parents);
    page.hosts = [];
    if (L.Anchor) L.Anchor.invalidate();
  }
  function showOriginal(){
    var top = L.state && L.state.flow !== "pages" && page.on && view() === "only" ? topOffset() : null;
    page.gen++; page.running = false; page.download = null; page.held = false;
    hideStatus(); save();
    removeHosts();
    if (page.docKey) setOn(page.docKey, null);
    page.on = false; page.blocks = null; page.missing = []; page.record = null; page.key = null;
    relayout();
    if (typeof top === "number" && L.revealOffset) L.revealOffset(top);
  }
  function togglePage(){
    if (!L.state || L.state.mode !== "doc"){
      if (L.state && L.state.mode === "pdf") toast(_t("Translate works on text documents; PDFs are not translated yet."));
      return Promise.resolve();
    }
    if (page.on){
      if (page.running || !page.missing.length){ showOriginal(); return Promise.resolve(); }
      return translateMissing(false);                                        /* "Translate the rest" */
    }
    return startPage();
  }

  /* ---- a document left translated comes back translated, from the cache, offline too; a translation that was
     still under way when the book was closed carries on ---- */
  var watchTimer = null;
  function restore(id, pair){
    var parts = pair.split("|"), t = parts[1];
    if (t !== bookTarget(parts[0])) return;           /* the reader chose another language since */
    var gen = ++page.gen;
    if (!begin(id, pair)) return;
    Cache.get(page.key).then(function(rec){
      if (gen !== page.gen) return;
      if (!rec || !rec.blocks){ page.on = false; setOn(id, null); return; }
      var top = topOffset();
      applyRecord(rec, t);
      /* the translations above the reading spot pushed it down: put it back */
      if (typeof top === "number" && L.revealOffset && !(L.state.flow === "pages")) L.revealOffset(top);
      if (rec.job === "on" && page.missing.length) translateMissing(true);
    });
  }
  /* the document is in when the library says so (it restores the reading position then); until
     that moment #doc may still hold the previous document */
  function docIn(){
    try { var dbg = L.Library._debug(); if (dbg && dbg.ready && !dbg.ready.doc) return false; } catch(_){}
    var d = $("#doc");
    return !!(L.state && L.state.mode === "doc" && d && d.textContent.length);
  }
  function watchOpen(){
    clearTimeout(watchTimer);
    if (!Object.keys(onMap()).length) return;
    var gen = page.gen, tries = 0;
    function poll(){
      if (gen !== page.gen) return;
      var id = L.Library && L.Library.currentId ? L.Library.currentId() : null;
      if (id && docIn()){
        var pair = onMap()[id];
        if (pair && !page.on) restore(id, pair);
        return;
      }
      if (L.state && L.state.mode === "pdf") return;
      if (++tries < 480) watchTimer = setTimeout(poll, 250);     /* a big EPUB can take a while to open */
    }
    /* never at once: ll:fileopened is dispatched just before the library forgets the previous document */
    watchTimer = setTimeout(poll, 50);
  }
  function docChanged(){
    save();
    page.gen++; page.running = false; page.download = null; page.held = false;
    hideStatus();
    removeHosts();
    page.on = false; page.blocks = null; page.missing = []; page.record = null; page.key = null; page.docKey = null;
    Builtin.destroyAll(); detected = {}; sampled = { key: null, text: "" }; wantBook = null;
    watchOpen();
  }
  function onSettings(){
    refreshHint();
    if (!isOn()) return;
    /* translated already: into the new language, cache first */
    resolveFrom(docSample()).then(function(src){
      if (isOn() && src + "|" + bookTarget(src) !== page.pair){ showOriginal(); startPage(); }
    });
  }

  document.addEventListener("ll:fileopened", docChanged);
  window.addEventListener("online", function(){ if ($("#trHint .tr-status")) refreshHint(); });
  window.addEventListener("offline", function(){ if ($("#trHint .tr-status")) refreshHint(); });
  /* the work rests while the page is hidden and carries on when it is back */
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && page.held && page.running && page.job){ page.curAt = 0; step(page.job); }
  });
  /* going home hides the document: stop any work in flight, keep what arrived (a translation under way carries on
     when the book is opened again) */
  var docView = $("#docView");
  if (docView && window.MutationObserver) new MutationObserver(function(){
    if (docView.style.display === "none" && (page.running || page.on)){ page.gen++; page.running = false; page.download = null; page.held = false; hideStatus(); save(); }
  }).observe(docView, { attributes: true, attributeFilter: ["style"] });
  watchOpen();

  window.llTranslate = {
    slot: slot, togglePage: togglePage, showOriginal: showOriginal, cancel: cancel, isOn: isOn, isPartial: isPartial,
    describe: describe, refreshHint: refreshHint, onSettings: onSettings, docChanged: docChanged, openSettings: openSettings,
    collect: collect, pick: pick, detect: detect, guess: guess, nameOf: nameOf, engines: ENGINES, cache: Cache,
    readerLang: readerLang, targetFor: targetFor, bookTarget: bookTarget, view: view, setView: setView,
    pack: { download: getPack, remove: removePack, state: function(){ return Pack.info(); }, check: Pack.check, supported: Pack.supported,
            covers: Pack.covers, stop: Pack.stop, idle: Pack.idle, sync: syncPack },
    status: function(){ return { on: page.on, running: page.running, done: page.done, total: page.total, missing: page.missing.slice(), engine: page.engine,
      pair: page.pair, key: page.key, download: page.download, view: view(), held: page.held, eta: eta(),
      rate: page.rate ? { chars: page.rate.chars, ms: page.rate.ms } : null, hidden: page.blocks ? page.blocks.filter(function(b){ return b.hidden; }).length : 0 }; }
  };
})();
