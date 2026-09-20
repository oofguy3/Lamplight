/* Lamplight — Translate: the tapped word, a selected sentence or the whole document, into a
   language the reader chooses. Three engines, in order of preference: the browser's built-in
   on-device translator (Chrome / Edge, private and free, works offline once its language pack
   is downloaded), the reader's own Anthropic key, and MyMemory (a free web service) for words
   and sentences only. Everything translated is cached on the device, so a translated book
   reopens translated, offline.

   Loaded on demand by app.js (see LIBS there), which owns the settings group, the menu entry
   and the card; this file talks to the reader through window.__ll and fills the card's
   .tr-slot elements. Whole-document translations are shown under each block in a shadow root,
   so #doc's own text nodes are untouched and every character offset (positions, highlights,
   search, read aloud) keeps working. */
(function(){
  "use strict";
  var L = window.__ll || {};
  var $ = function(s){ return document.querySelector(s); };
  var Store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(_){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(_){} },
    remove: function(k){ try { localStorage.removeItem(k); } catch(_){} }
  };
  var KEY_TO = "ll_tr_to", KEY_FROM = "ll_tr_from", KEY_ON = "ll_tr_on", KEY_API = "ll_apikey";
  var AI_MODEL = "claude-sonnet-5";
  var RTL = { ar: 1, he: 1, fa: 1, ur: 1 };
  var MM_CODES = { zh: "zh-CN", "zh-Hant": "zh-TW" };   /* MyMemory's names for the two Chinese scripts */
  var SENTENCE_CAP = 2000;                                 /* cached word / sentence records kept */
  var PRIVACY = "The built-in translator runs on your device. Your Anthropic key sends text to api.anthropic.com; MyMemory is a free web service that receives the words or sentence you translate.";

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function norm(s){ return String(s || "").replace(/\s+/g, " ").trim(); }
  function toast(msg){ if (L.Marks && L.Marks.toast) L.Marks.toast(msg); }
  function online(){ return navigator.onLine !== false; }
  /* Library.tx hands back the request itself when a get() found nothing */
  function unwrap(r){ return (r && typeof r === "object" && typeof IDBRequest !== "undefined" && r instanceof IDBRequest) ? null : (r || null); }

  /* ---------- languages: the table lives in the settings select that app.js built ---------- */
  function to(){ return Store.get(KEY_TO) || "es"; }
  function fromPref(){ return Store.get(KEY_FROM) || "auto"; }
  function nameOf(code){
    var o = document.querySelector('#trLang option[value="' + String(code).replace(/"/g, "") + '"]');
    return o ? o.textContent.split(" · ")[0] : String(code);
  }
  function base(code){ return String(code || "").split("-")[0].toLowerCase(); }
  /* en-US and en are the same language; the two Chinese scripts are not */
  function same(a, b){ return base(a) === base(b) && !(base(a) === "zh" && a !== b); }
  function dirOf(code){ return RTL[base(code)] ? "rtl" : "ltr"; }

  /* ---------- source language: the setting, or the built-in detector on a sample ---------- */
  var detected = {};
  function detect(sample){
    sample = String(sample || "").slice(0, 2000);
    if (!sample.trim()) return Promise.resolve("en");
    if (detected[sample] !== undefined) return Promise.resolve(detected[sample]);
    if (!(window.LanguageDetector && typeof window.LanguageDetector.create === "function")) return Promise.resolve("en");
    return Promise.resolve().then(function(){ return window.LanguageDetector.create(); }).then(function(d){
      return Promise.resolve(d.detect(sample)).then(function(list){ try { if (d.destroy) d.destroy(); } catch(_){} return list; });
    }).then(function(list){
      var best = list && list[0];
      var ok = best && best.detectedLanguage && best.detectedLanguage !== "und" && (best.confidence === undefined || best.confidence >= 0.4);
      detected[sample] = ok ? best.detectedLanguage : "en";
      return detected[sample];
    }).catch(function(){ return "en"; });
  }
  function docSample(){
    var d = $("#doc");
    return (L.state && L.state.mode === "doc" && d) ? d.textContent.slice(0, 2000) : "";
  }
  /* a word or sentence from the open document is in the document's language */
  function resolveFrom(text){
    var f = fromPref();
    if (f !== "auto") return Promise.resolve(f);
    return detect(docSample() || text);
  }

  /* ---------- engine 1: the browser's built-in translator ---------- */
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

  /* ---------- engine 2: the reader's Anthropic key (same request shape as Explain with AI) ---------- */
  var Claude = (function(){
    var BATCH = 2500;
    function ok(){ return !!Store.get(KEY_API) && online(); }
    function available(){ return Promise.resolve(ok() ? "ready" : "no"); }
    /* the reply must be a JSON array of the same length; code fences and chatter around it are tolerated */
    function parse(txt, n){
      var s = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      var a = s.indexOf("["), b = s.lastIndexOf("]");
      if (a < 0 || b < a) return null;
      var arr;
      try { arr = JSON.parse(s.slice(a, b + 1)); } catch(_){ return null; }
      if (!Array.isArray(arr) || arr.length !== n || !arr.every(function(x){ return typeof x === "string"; })) return null;
      return arr;
    }
    function ask(batch, src, t){
      var chars = batch.reduce(function(n, s){ return n + s.length; }, 0);
      var prompt = "Translate each string in this JSON array from " + nameOf(src) + " into " + nameOf(t) +
        ". Reply with a JSON array of the same length, same order, translations only, no commentary.\n\n" + JSON.stringify(batch);
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Store.get(KEY_API) || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: Math.min(4000, Math.max(300, Math.round(chars * 2 / 3))),
          messages: [{ role: "user", content: prompt }]
        })
      })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function(res){
        if (!res.ok){ var e = new Error((res.j && res.j.error && res.j.error.message) || "the request failed"); e.status = res.status; throw e; }
        var txt = (res.j.content || []).map(function(c){ return c.text || ""; }).join("");
        return parse(txt, batch.length);
      });
    }
    function translate(items, src, t, hooks){
      /* batches of about 2500 characters, two in flight */
      var batches = [], cur = [], idx = [], size = 0;
      items.forEach(function(s, i){
        if (cur.length && size + s.length > BATCH){ batches.push({ items: cur, idx: idx }); cur = []; idx = []; size = 0; }
        cur.push(s); idx.push(i); size += s.length;
      });
      if (cur.length) batches.push({ items: cur, idx: idx });
      return new Promise(function(resolve, reject){
        var b = 0, active = 0, dead = false;
        function next(){
          if (dead) return;
          if (!hooks.live() || b >= batches.length){ if (!active) resolve(); return; }
          var bt = batches[b++]; active++;
          ask(bt.items, src, t).then(function(out){ return out || ask(bt.items, src, t); })   /* one retry on a bad reply */
            .then(function(out){
              bt.idx.forEach(function(i, k){ hooks.onItem(i, out ? out[k] : null); });     /* a batch in flight at a cancel still lands */
            }, function(err){
              /* no connection, a bad key or a quota: stop here rather than fail every batch in turn */
              if (!err || !err.status || err.status === 401 || err.status === 403 || err.status === 429 || err.status >= 500){ dead = true; reject(err || new Error("no connection")); return; }
              bt.idx.forEach(function(i){ hooks.onItem(i, null); });
            })
            .then(function(){ active--; next(); });
        }
        if (!batches.length){ resolve(); return; }
        for (var n = 0; n < 2 && n < batches.length; n++) next();
      });
    }
    return { id: "claude", ok: ok, available: available, translate: translate };
  })();

  /* ---------- engine 3: MyMemory, for words and sentences ---------- */
  var MyMemory = (function(){
    var MAX = 480;
    function ok(){ return online(); }
    function available(){ return Promise.resolve(ok() ? "ready" : "no"); }
    function code(c){ return MM_CODES[c] || c; }
    function one(text, src, t){
      var u = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + encodeURIComponent(code(src) + "|" + code(t));
      return fetch(u).then(function(r){ if (!r.ok) throw new Error("MyMemory replied " + r.status); return r.json(); }).then(function(j){
        if (!j || String(j.responseStatus) !== "200" || !j.responseData || typeof j.responseData.translatedText !== "string") throw new Error((j && j.responseDetails) || "no translation");
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

  var ENGINES = { builtin: Builtin, claude: Claude, mymemory: MyMemory };
  var LABEL = { builtin: "on-device", claude: "by Claude", mymemory: "by MyMemory (free web service)" };
  /* which engine handles a job: built-in (ready, or after its download) → key → MyMemory for short texts */
  function pick(kind, src, t){
    return Builtin.available(src, t).then(function(a){
      if (a !== "no") return { engine: Builtin, status: a };
      if (Claude.ok()) return { engine: Claude, status: "ready" };
      if (kind === "short" && MyMemory.ok()) return { engine: MyMemory, status: "ready" };
      return null;
    });
  }
  function noEngineNote(){
    return online() ? "Nothing here can translate this — use Chrome or Edge for the built-in translator, or add an Anthropic API key in the settings."
                    : "Offline — only cached translations are available.";
  }

  /* ---------- the status line for the settings hint ---------- */
  function describe(){
    var t = to(), name = nameOf(t);
    return resolveFrom("").then(function(src){
      return Builtin.available(same(src, t) ? (t === "en" ? "es" : "en") : src, t);
    }).then(function(a){
      if (a === "ready") return name + " · built-in translator ready";
      if (a === "download" && online()) return name + " · built-in translator needs a download (about 30 MB) — the first translation starts it";
      if (Claude.ok()) return name + " · using your Anthropic key";
      if (online()) return name + " · words and sentences via MyMemory; add an Anthropic API key or use Chrome / Edge for whole documents";
      return name + " · offline — only cached translations";
    });
  }
  function refreshHint(){
    var h = $("#trHint");
    if (!h) return Promise.resolve();
    return describe().then(function(s){
      h.textContent = "";
      var b = document.createElement("span"); b.className = "tr-status"; b.textContent = s;
      h.appendChild(b); h.appendChild(document.createTextNode(" " + PRIVACY));
    }).catch(function(){});
  }
  function openSettings(){
    var sheet = $("#sheet"), gear = $("#gear");
    if (sheet && !sheet.classList.contains("open") && gear) gear.click();
    refreshHint();
    setTimeout(function(){
      var g = $("#trGroup"), s = $("#trLang");
      if (g){ try { g.scrollIntoView({ block: "center" }); } catch(_){ g.scrollIntoView(); } }
      if (s) s.focus({ preventScroll: true });
    }, 80);
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

  /* ---------- word and sentence: fill a .tr-slot in the card ---------- */
  var memo = {}, slotGen = 0;
  function copy(text){
    var done = function(){ toast("Copied"); }, fail = function(){ toast("Couldn’t copy"); };
    if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done, fail); return; }
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy"); ta.remove();
      if (ok) done(); else fail();
    } catch(_){ fail(); }
  }
  /* opts: span {start, end} adds a Highlight button; auto translates without a press whatever
     the engine (the pill's Translate is a press already); close() shuts the card after Highlight */
  function slot(text, el, opts){
    opts = opts || {};
    text = norm(text);
    if (!text || !el) return;
    var t = to(), name = nameOf(t), gen = ++slotGen;
    el.dataset.gen = gen;
    var src = null, picked = null;
    function live(){ return el.isConnected && el.dataset.gen === String(gen); }
    function button(label){
      el.innerHTML = '<div class="acts"><button type="button" class="act tr-go">' + esc(label) + '</button></div>';
      el.querySelector(".tr-go").addEventListener("click", run);
    }
    function render(out, engineId){
      el.innerHTML = '<div class="sec">In ' + esc(name) + '</div>' +
        '<div class="tr-out" lang="' + esc(t) + '" dir="' + dirOf(t) + '"></div>' +
        '<div class="tr-eng">Translated ' + esc(LABEL[engineId] || engineId) + '</div>' +
        '<div class="acts"><button type="button" class="act tr-copy">Copy</button>' +
        (opts.span ? '<button type="button" class="act tr-hl">Highlight</button>' : '') + '</div>';
      el.querySelector(".tr-out").textContent = out;
      el.querySelector(".tr-copy").addEventListener("click", function(){ copy(out); });
      var hl = el.querySelector(".tr-hl");
      if (hl) hl.addEventListener("click", function(){
        var m = L.Marks && L.Marks.addHighlight ? L.Marks.addHighlight(opts.span.start, opts.span.end) : null;
        if (opts.close) opts.close();
        if (m) toast("Highlighted");
      });
    }
    function run(){
      if (!src) return;
      var key = src + "|" + t + "|" + text, result = null;
      el.innerHTML = '<div class="note tr-wait">Translating…</div>';
      (picked ? Promise.resolve(picked) : pick("short", src, t)).then(function(p){
        if (!live()) return;
        if (!p){ el.innerHTML = '<div class="note">' + esc(noEngineNote()) + '</div>'; return; }
        var hooks = {
          live: live,
          onDownload: function(f){ var w = el.querySelector(".tr-wait"); if (w) w.textContent = "Downloading the " + name + " translator… " + Math.round(f * 100) + " %"; },
          onItem: function(k, out){ result = out; }
        };
        return p.engine.translate([text], src, t, hooks).then(function(){
          if (!live()) return;
          if (typeof result !== "string") throw new Error("no translation");
          memo[key] = { text: result, engine: p.engine.id };
          Cache.putSentence({ key: "s|" + key, text: result, engine: p.engine.id });
          render(result, p.engine.id);
        });
      }).catch(function(err){
        if (!live()) return;
        picked = null;
        var gesture = err && err.name === "NotAllowedError";
        el.innerHTML = '<div class="note">' + (gesture ? "The translator download needs a press." : "Couldn’t translate (" + esc((err && err.message) || "no connection") + ").") + '</div>';
        var b = document.createElement("div"); b.className = "acts";
        b.innerHTML = '<button type="button" class="act tr-go">' + (gesture ? "Download the " + esc(name) + " translator" : "Try again") + '</button>';
        b.querySelector(".tr-go").addEventListener("click", run);
        el.appendChild(b);
      });
    }
    button("Translate to " + name);
    resolveFrom(text).then(function(s){
      if (!live()) return;
      src = s;
      if (same(src, t)){ el.innerHTML = '<div class="note">This is already in ' + esc(name) + ' — choose another language under Translation in the settings.</div>'; return; }
      var key = src + "|" + t + "|" + text;
      if (memo[key]){ render(memo[key].text, memo[key].engine); return; }
      return Cache.get("s|" + key).then(function(rec){
        if (!live()) return;
        if (rec && typeof rec.text === "string"){ memo[key] = { text: rec.text, engine: rec.engine }; render(rec.text, rec.engine); return; }
        return pick("short", src, t).then(function(p){
          if (!live()) return;
          picked = p;
          if (!p){ el.innerHTML = '<div class="note">' + esc(noEngineNote()) + '</div>'; return; }
          if (p.status === "download") button("Translate to " + name + " (downloads the translator)");
          /* the on-device translator is private and free: no press needed once it is ready */
          if (opts.auto || (p.engine === Builtin && p.status === "ready")) run();
        });
      });
    }).catch(function(err){ if (live()) el.innerHTML = '<div class="note">Couldn’t translate (' + esc((err && err.message) || "no connection") + ').</div>'; });
  }

  /* ---------- the whole document ---------- */
  var SEL = "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt, figcaption, div.plain";
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
  /* the block being read first, then onward, then what came before */
  function order(blocks, idx){
    var top = null;
    try { top = L.Library && L.Library.topCharOffset ? L.Library.topCharOffset() : null; } catch(_){ top = null; }
    if (top === null || top === undefined) return idx.slice();
    var k = 0;
    while (k < idx.length && offsetOf(blocks[idx[k]]) < top) k++;
    var start = Math.max(0, k - 1);
    return idx.slice(start).concat(idx.slice(0, start).reverse());
  }

  /* the translation under a block: a host element whose content lives in a shadow root — readable
     and selectable, but not part of #doc's text nodes */
  var HOST_CSS =
    ":host{display:block; margin:-0.6em 0 1em; padding:.35em 0 .1em .75em; border-left:2px solid var(--accent); color:var(--muted);" +
    " font-style:italic; font-size:.95em; line-height:1.55; white-space:normal; -webkit-hyphens:manual; hyphens:manual; text-align:start;}" +
    ":host([dir=rtl]){padding:.35em .75em .1em 0; border-left:0; border-right:2px solid var(--accent);}" +
    ":host(.txt){margin:.15em 0 0;}" +
    ":host(.li){margin:-0.1em 0 .45em;}" +
    ":host(.h){font-style:normal; font-weight:700; line-height:1.3; margin:-0.35em 0 .9em;}" +
    ":host(.h1){font-size:1.4em;} :host(.h2){font-size:1.2em;} :host(.h3){font-size:1.06em;}" +
    ":host(.miss){font-style:normal; font-size:.72em; letter-spacing:.06em; text-transform:uppercase; border-left-style:dotted; border-right-style:dotted; padding-top:.15em;}" +
    ".t{overflow-wrap:break-word;}";
  var sheet = null;
  function styleRoot(root){
    if (sheet === null){ try { sheet = new CSSStyleSheet(); sheet.replaceSync(HOST_CSS); } catch(_){ sheet = false; } }
    if (sheet && "adoptedStyleSheets" in root){ try { root.adoptedStyleSheets = [sheet]; return; } catch(_){} }
    var st = document.createElement("style"); st.textContent = HOST_CSS; root.appendChild(st);
  }
  function insertHost(b, el){
    if (!b.plain){ b.el.parentNode.insertBefore(el, b.el.nextSibling); return; }
    /* a plain-text file is one text node: it is split after the newline that ends the paragraph
       so the host can sit between paragraphs — the concatenated text, and with it every
       character offset, is exactly what it was */
    var w = document.createTreeWalker(b.el, NodeFilter.SHOW_TEXT), n, sum = 0, at = b.at;
    while ((n = w.nextNode())){
      var len = n.length;
      if (at <= sum + len){
        var k = at - sum, top = n;
        while (top.parentNode && top.parentNode !== b.el) top = top.parentNode;   /* inside a highlight: go after it */
        if (top !== n){ b.el.insertBefore(el, top.nextSibling); return; }
        if (k <= 0){ b.el.insertBefore(el, n); return; }
        if (k >= len){ b.el.insertBefore(el, n.nextSibling); return; }
        b.el.insertBefore(el, n.splitText(k));
        return;
      }
      sum += len;
    }
    b.el.appendChild(el);
  }
  function host(b, text, lang, miss){
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
      insertHost(b, el);
      b.host = el; page.hosts.push(el);
    }
    el.classList.toggle("miss", !!miss);
    el.setAttribute("lang", miss ? "en" : lang);
    el.setAttribute("dir", miss ? "ltr" : dirOf(lang));
    el.shadowRoot.querySelector(".t").textContent = miss ? "couldn’t translate" : text;
    return el;
  }

  var page = { on: false, running: false, gen: 0, key: null, docKey: null, pair: null, blocks: null, hosts: [], missing: [],
               done: 0, total: 0, engine: null, record: null, download: null };
  function docId(){
    var id = L.Library && L.Library.currentId ? L.Library.currentId() : null;
    return id || ("t-" + (($("#fname") || {}).textContent || "") + "-" + (L.Anchor ? L.Anchor.textLength() : 0));
  }
  function isOn(){ return !!page.on && !!L.state && L.state.mode === "doc"; }
  function isPartial(){ return isOn() && !page.running && page.missing.length > 0; }

  /* ---- the status pill ---- */
  var statusEl = null;
  function status(){
    if (!statusEl){
      statusEl = document.createElement("div");
      statusEl.id = "trStatus"; statusEl.setAttribute("role", "status"); statusEl.setAttribute("aria-live", "polite");
      statusEl.innerHTML = '<span class="tr-msg"></span><button type="button" class="tr-x">Cancel</button>';
      statusEl.querySelector(".tr-x").addEventListener("click", cancel);
      document.body.appendChild(statusEl);
    }
    var msg = (page.download !== null && page.download !== undefined)
      ? "Downloading the " + nameOf(to()) + " translator… " + Math.round(page.download * 100) + " %"
      : "Translating… " + page.done + " of " + page.total;
    statusEl.querySelector(".tr-msg").textContent = msg;
    statusEl.classList.add("on");
  }
  function hideStatus(){ if (statusEl) statusEl.classList.remove("on"); }

  /* ---- layout and saving, a moment after blocks arrive ---- */
  var layoutTimer = null, saveTimer = null;
  function relayout(){
    if (L.Anchor) L.Anchor.invalidate();
    /* Pages flow lays the columns out again on a resize; Scroll flow just grows */
    if (L.state && L.state.mode === "doc" && L.state.flow === "pages"){ try { window.dispatchEvent(new Event("resize")); } catch(_){} }
  }
  function relayoutSoon(){ clearTimeout(layoutTimer); layoutTimer = setTimeout(relayout, 250); }
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
    var missing = [];
    page.blocks.forEach(function(b, i){
      var x = page.record.blocks[String(i)];
      if (typeof x === "string"){ host(b, x, t); page.done++; } else missing.push(i);
    });
    page.missing = missing;
    relayout();
  }
  function begin(id, pair, t){
    page.blocks = collect();
    if (!page.blocks.length) return false;
    page.pair = pair; page.docKey = id; page.key = id + "|" + pair;
    page.on = true; page.running = false; page.missing = []; page.done = 0; page.total = page.blocks.length; page.engine = null; page.download = null;
    return true;
  }
  function startPage(){
    var gen = ++page.gen, t = to();
    return resolveFrom(docSample()).then(function(src){
      if (gen !== page.gen) return;
      if (same(src, t)){ toast("This document is already in " + nameOf(t) + "."); return; }
      var pair = src + "|" + t;
      if (!begin(docId(), pair, t)){ toast("Nothing to translate here."); return; }
      return Cache.get(page.key).then(function(rec){
        if (gen !== page.gen) return;
        applyRecord(rec, t);
        setOn(page.docKey, pair);
        if (!page.missing.length){ toast("Translated into " + nameOf(t) + " — from the cache"); return; }
        return translateMissing();
      });
    });
  }
  function translateMissing(){
    var gen = page.gen, t = to(), src = page.pair.split("|")[0];
    var idx = order(page.blocks, page.missing);
    if (!idx.length) return Promise.resolve();
    return pick("page", src, t).then(function(p){
      if (gen !== page.gen) return;
      if (!p){
        if (page.done) toast(online() ? "No translator for the rest — see Translation in the settings" : "Offline — showing the cached translation");
        else { showOriginal(); openSettings(); }
        return;
      }
      page.running = true; page.engine = p.engine.id; page.download = p.status === "download" ? 0 : null;
      status();
      if (!page.done) toast("Translating into " + nameOf(t) + "…");
      var items = idx.map(function(i){ return page.blocks[i].text; });
      var hooks = {
        live: function(){ return gen === page.gen && page.running; },
        onDownload: function(f){ if (gen === page.gen && page.running){ page.download = f; status(); } },
        onItem: function(k, text){
          if (gen !== page.gen) return;                    /* what arrives after a cancel is still kept */
          var i = idx[k];
          page.download = null;
          if (typeof text === "string"){
            host(page.blocks[i], text, t);
            page.record.blocks[String(i)] = text;
            page.done++;
            page.missing = page.missing.filter(function(x){ return x !== i; });
          } else host(page.blocks[i], "", t, true);
          if (page.running) status();
          relayoutSoon(); saveSoon();
        }
      };
      return p.engine.translate(items, src, t, hooks).then(function(){ finish(gen, null); }, function(err){ finish(gen, err); });
    });
  }
  function finish(gen, err){
    if (gen !== page.gen) return;
    var cancelled = !page.running;
    page.running = false; page.download = null;
    hideStatus(); save();
    var name = nameOf(to());
    if (err){
      console.warn("translate: paused", err);
      toast(!online() || !err.status ? "Translation paused — no connection" : "Translation paused — " + err.message);
    } else if (cancelled) toast("Translation stopped — what arrived stays");
    else if (page.missing.length) toast("Translated into " + name + " · " + page.missing.length + (page.missing.length === 1 ? " block" : " blocks") + " couldn’t be translated");
    else toast("Translated into " + name);
  }
  function cancel(){ if (page.running){ page.running = false; hideStatus(); } }
  function removeHosts(){
    var parents = [];
    page.hosts.forEach(function(h){
      var p = h.parentNode; if (!p) return;
      p.removeChild(h);
      if (p.classList && p.classList.contains("plain") && parents.indexOf(p) < 0) parents.push(p);
    });
    parents.forEach(function(p){ p.normalize(); });
    page.hosts = [];
    if (L.Anchor) L.Anchor.invalidate();
  }
  function showOriginal(){
    page.gen++; page.running = false; page.download = null;
    hideStatus(); save();
    removeHosts();
    if (page.docKey) setOn(page.docKey, null);
    page.on = false; page.blocks = null; page.missing = []; page.record = null; page.key = null;
    relayout();
  }
  function togglePage(){
    if (!L.state || L.state.mode !== "doc"){
      if (L.state && L.state.mode === "pdf") toast("Translate works on text documents; PDFs are not translated yet.");
      return Promise.resolve();
    }
    if (page.on){
      if (page.running || !page.missing.length){ showOriginal(); return Promise.resolve(); }
      return translateMissing();                                             /* "Translate the rest" */
    }
    return startPage();
  }

  /* ---- a document left translated comes back translated, from the cache, offline too ---- */
  var watchTimer = null;
  function restore(id, pair){
    var t = pair.split("|")[1];
    if (t !== to()) return;                     /* the reader chose another language since */
    var gen = ++page.gen;
    if (!begin(id, pair, t)) return;
    Cache.get(page.key).then(function(rec){
      if (gen !== page.gen) return;
      if (!rec || !rec.blocks){ page.on = false; setOn(id, null); return; }
      var top = null;
      try { top = L.Library.topCharOffset(); } catch(_){}
      applyRecord(rec, t);
      /* the translations above the reading spot pushed it down: put it back */
      if (typeof top === "number" && L.revealOffset && !(L.state.flow === "pages")) L.revealOffset(top);
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
    page.gen++; page.running = false; page.download = null;
    hideStatus();
    removeHosts();
    page.on = false; page.blocks = null; page.missing = []; page.record = null; page.key = null; page.docKey = null;
    Builtin.destroyAll(); detected = {};
    watchOpen();
  }
  function onSettings(){
    refreshHint();
    if (isOn()){ showOriginal(); startPage(); }       /* translated already: into the new language, cache first */
  }

  document.addEventListener("ll:fileopened", docChanged);
  window.addEventListener("online", function(){ if ($("#trHint .tr-status")) refreshHint(); });
  window.addEventListener("offline", function(){ if ($("#trHint .tr-status")) refreshHint(); });
  /* going home hides the document: stop any work in flight, keep what arrived */
  var view = $("#docView");
  if (view && window.MutationObserver) new MutationObserver(function(){
    if (view.style.display === "none" && (page.running || page.on)){ page.gen++; page.running = false; page.download = null; hideStatus(); save(); }
  }).observe(view, { attributes: true, attributeFilter: ["style"] });
  watchOpen();

  window.llTranslate = {
    slot: slot, togglePage: togglePage, showOriginal: showOriginal, cancel: cancel, isOn: isOn, isPartial: isPartial,
    describe: describe, refreshHint: refreshHint, onSettings: onSettings, docChanged: docChanged, openSettings: openSettings,
    collect: collect, pick: pick, detect: detect, nameOf: nameOf, engines: ENGINES, cache: Cache,
    status: function(){ return { on: page.on, running: page.running, done: page.done, total: page.total, missing: page.missing.slice(), engine: page.engine, pair: page.pair, key: page.key, download: page.download }; }
  };
})();
